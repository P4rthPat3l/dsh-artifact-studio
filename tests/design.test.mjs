import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { ArtifactService } from '../dist/host/lib/service.js';
import { ArtifactStore } from '../dist/host/lib/store.js';
import { DesignRenderer } from '../dist/host/lib/design-render.js';
import { ArtifactError } from '../dist/host/lib/errors.js';
import { createHandler } from '../dist/host/lib/rpc.js';
import { createTools } from '../dist/host/lib/tools.js';

const WORKSPACE_BASE = 'artifacts/workspaces';
const DESIGN = '<Frame name="Card" w={320} p={24} bg="#ffffff" rounded={16} flex="col" gap={8}><Text size={24} weight={700} color="#111111">Quarterly</Text><Text size={14} color="#666666">Revenue is up.</Text></Frame>';
const ICON = '<Frame name="Icon" w={320} h={120}><Icon name="lucide:heart" size={24} /></Frame>';
const FONT = '<Frame w={320} h={120}><Text font="Roboto" size={16}>Hello</Text></Frame>';
const HOSTILE = '<Frame w={120} h={80}>{(() => { process.exit(7); return null; })()}</Frame>';
const agent = { origin: 'agent', action: 'create' };
const editor = { origin: 'agent', action: 'update' };

let base;
let registry;

before(async () => {
  base = await fs.mkdtemp(path.join(os.tmpdir(), 'dsh-design-'));
  const record = { id: 'ws-a', path: path.join(base, 'project-a'), sessionIds: ['ses-a'] };
  registry = {
    get: (id) => (id === 'ws-a' ? record : undefined),
    list: () => [record],
  };
});

after(async () => {
  await fs.rm(base, { recursive: true, force: true });
});

/** A fresh home per test, so ids and cache directories never overlap. */
async function fixture(designs = new DesignRenderer()) {
  const home = await fs.mkdtemp(path.join(base, 'home-'));
  const service = new ArtifactService(
    { workspaceBase: WORKSPACE_BASE, libraryDir: 'artifacts/v1', home },
    registry,
    new ArtifactStore(),
    () => new Date(),
    designs,
  );
  return { home, service, target: { workspaceId: 'ws-a' } };
}

/** Counts worker calls, so a cache hit can be told from a render. */
class CountingRenderer extends DesignRenderer {
  previewCalls = 0;

  inspectCalls = 0;

  async preview(source, maxSide) {
    this.previewCalls += 1;
    return super.preview(source, maxSide);
  }

  async inspect(source) {
    this.inspectCalls += 1;
    return super.inspect(source);
  }
}

/** Renders nothing, to test the read path with a broken renderer. */
class BrokenRenderer extends DesignRenderer {
  async preview() {
    throw new ArtifactError('artifact/design-render-failed', 'forced failure');
  }
}

/** The artifact directory of a workspace artifact. */
function dirOf(home, id) {
  return path.join(home, WORKSPACE_BASE, 'ws-a', id);
}

test('FEAT-007 AC-001: create stores Design JSX and returns its summary', async () => {
  const { service, target } = await fixture();
  const manifest = await service.create(target, { type: 'design', title: 'Card', content: DESIGN, source: agent });
  assert.equal(manifest.version, 1);
  assert.equal(manifest.type, 'design');
  assert.equal(manifest.contentFile, 'design.jsx');
  assert.equal(manifest.contentBytes, Buffer.byteLength(DESIGN));
  const payload = await service.read(target, manifest.id);
  assert.equal(payload.content, DESIGN);
  assert.ok(payload.designInfo !== undefined);
  assert.ok(payload.designInfo.nodes >= 3, JSON.stringify(payload.designInfo));
  assert.deepEqual(payload.designInfo.warnings, []);
});

test('FEAT-007 AC-002: invalid source writes nothing', async () => {
  const { home, service, target } = await fixture();
  await assert.rejects(
    service.create(target, { type: 'design', title: 'Bad', content: '<Frame w={10}>', source: agent }),
    (error) => error.code === 'artifact/design-invalid',
  );
  const root = path.join(home, WORKSPACE_BASE, 'ws-a');
  const names = await fs.readdir(root).catch(() => []);
  assert.deepEqual(names.filter((name) => name.startsWith('art_')), []);
});

test('FEAT-007 AC-003: read returns the source and its design info', async () => {
  const { service, target } = await fixture();
  const manifest = await service.create(target, { type: 'design', title: 'Card', content: DESIGN, source: agent });
  const payload = await service.read(target, manifest.id);
  assert.equal(payload.manifest.id, manifest.id);
  assert.equal(payload.content, DESIGN);
  assert.deepEqual(Object.keys(payload.designInfo.types).sort(), ['FRAME', 'TEXT']);
});

test('FEAT-007 AC-004: update validates and versions', async () => {
  const { service, target } = await fixture();
  const created = await service.create(target, { type: 'design', title: 'Card', content: DESIGN, source: agent });
  const next = DESIGN.replace('Quarterly', 'Annual');
  const updated = await service.update(target, created.id, { baseVersion: 1, content: next, source: editor });
  assert.equal(updated.version, 2);
  assert.equal((await service.read(target, created.id)).content, next);
  await assert.rejects(
    service.update(target, created.id, { baseVersion: 1, content: DESIGN, source: editor }),
    (error) => error.code === 'artifact/stale-version',
  );
});

test('FEAT-007 AC-005: preview returns a PNG and caches it by content hash', async () => {
  const renderer = new CountingRenderer();
  const { home, service, target } = await fixture(renderer);
  const created = await service.create(target, { type: 'design', title: 'Card', content: DESIGN, source: agent });
  const first = await service.preview(target, created.id);
  assert.equal(first.mediaType, 'image/png');
  assert.equal(first.width, 320);
  assert.ok(first.height > 0);
  assert.equal(renderer.previewCalls, 1);
  const second = await service.preview(target, created.id);
  assert.equal(second.data, first.data);
  assert.equal(renderer.previewCalls, 1, 'the second preview rendered again');
  const key = created.contentHash.replace('sha256:', '');
  const names = await fs.readdir(path.join(dirOf(home, created.id), 'preview'));
  assert.ok(names.includes(key + '.png'), names.join(','));
  assert.ok(names.includes(key + '.json'), names.join(','));
});

test('FEAT-007 AC-005b: the route dispatches preview', async () => {
  const { service, target } = await fixture();
  const created = await service.create(target, { type: 'design', title: 'Card', content: DESIGN, source: agent });
  const handler = createHandler(service);
  const result = await handler('preview', { workspaceId: 'ws-a', id: created.id });
  assert.equal(result.ok, true);
  if (result.ok) {
    const value = result.value;
    assert.equal(value.mediaType, 'image/png');
    assert.ok(value.data.length > 0);
  }
  const page = await service.create(target, { type: 'page', title: 'Page', content: '<p>x</p>', source: agent });
  const refused = await handler('preview', { workspaceId: 'ws-a', id: page.id });
  assert.equal(refused.ok, false);
  if (!refused.ok) assert.equal(refused.error.code, 'artifact/unsupported-type');
});

test('FEAT-007 AC-006: a new version invalidates the preview', async () => {
  const renderer = new CountingRenderer();
  const { service, target } = await fixture(renderer);
  const created = await service.create(target, { type: 'design', title: 'Card', content: DESIGN, source: agent });
  await service.preview(target, created.id);
  assert.equal(renderer.previewCalls, 1);
  const next = DESIGN.replace('Quarterly', 'Annual');
  await service.update(target, created.id, { baseVersion: 1, content: next, source: editor });
  const rendered = await service.preview(target, created.id);
  assert.equal(renderer.previewCalls, 2);
  assert.equal(rendered.width, 320);
});

test('FEAT-007 AC-007: a render failure keeps the source readable', async () => {
  const { service, target } = await fixture(new BrokenRenderer());
  const created = await service.create(target, { type: 'design', title: 'Card', content: DESIGN, source: agent });
  const payload = await service.read(target, created.id);
  assert.equal(payload.content, DESIGN);
  await assert.rejects(
    service.preview(target, created.id),
    (error) => error.code === 'artifact/design-render-failed',
  );
});

test('FEAT-007 AC-008: edits are validated after they are applied', async () => {
  const { service, target } = await fixture();
  const created = await service.create(target, { type: 'design', title: 'Card', content: DESIGN, source: agent });
  await assert.rejects(
    service.update(target, created.id, { baseVersion: 1, edits: [{ oldText: 'Quarterly', newText: 'Quarterly<' }], source: editor }),
    (error) => error.code === 'artifact/design-invalid',
  );
  const payload = await service.read(target, created.id);
  assert.equal(payload.version, 1);
  assert.equal(payload.content, DESIGN);
});

test('FEAT-007 AC-009: every export format writes a real file', async () => {
  const { home, service, target } = await fixture();
  const created = await service.create(target, { type: 'design', title: 'Card', content: DESIGN, source: agent });
  const png = await service.export(target, created.id, 'png');
  const pngBytes = Buffer.from(png.data, 'base64');
  assert.equal(png.mediaType, 'image/png');
  assert.equal(pngBytes.subarray(1, 4).toString('utf8'), 'PNG');
  const svg = await service.export(target, created.id, 'svg');
  assert.equal(svg.mediaType, 'image/svg+xml');
  assert.match(Buffer.from(svg.data, 'base64').toString('utf8'), /<svg/);
  const fig = await service.export(target, created.id, 'fig');
  const figBytes = Buffer.from(fig.data, 'base64');
  assert.equal(fig.mediaType, 'application/octet-stream');
  assert.equal(figBytes[0], 0x50);
  assert.equal(figBytes[1], 0x4b);
  assert.ok(figBytes.length > 1000);
  const written = await fs.readdir(path.join(home, WORKSPACE_BASE, 'ws-a', 'exports'));
  assert.deepEqual(written.filter((name) => name.endsWith('.png')).length, 1);
  assert.deepEqual(written.filter((name) => name.endsWith('.svg')).length, 1);
  assert.deepEqual(written.filter((name) => name.endsWith('.fig')).length, 1);
  for (const file of [png, svg, fig]) assert.ok((await fs.stat(file.path)).size > 0);
});

test('FEAT-007 AC-010: unsupported formats are refused', async () => {
  const { service, target } = await fixture();
  const created = await service.create(target, { type: 'design', title: 'Card', content: DESIGN, source: agent });
  await assert.rejects(
    service.export(target, created.id, 'docx'),
    (error) => error.code === 'artifact/unsupported-format',
  );
});

test('FEAT-007 AC-011: icons are rejected with guidance', async () => {
  const { service, target } = await fixture();
  await assert.rejects(
    service.create(target, { type: 'design', title: 'Icon', content: ICON, source: agent }),
    (error) => error.code === 'artifact/design-icon-unsupported' && /Icon/.test(error.message),
  );
});

test('FEAT-007 AC-012: unbundled fonts warn', async () => {
  const { service, target } = await fixture();
  const manifest = await service.create(target, { type: 'design', title: 'Font', content: FONT, source: agent });
  const payload = await service.read(target, manifest.id);
  assert.ok(payload.designInfo.warnings.some((warning) => warning.includes('Roboto')), JSON.stringify(payload.designInfo));
});

test('FEAT-007 AC-012b: the starter and the skill teach flex layout, not dir', async () => {
  const { starterContent } = await import('../src/client/templates.ts');
  const { ARTIFACT_DESIGN_SKILL } = await import('../dist/host/lib/skill.js');
  const starter = starterContent('design', 'Untitled design');
  assert.match(starter, /flex="col"/);
  assert.doesNotMatch(starter, /dir="/);
  assert.match(ARTIFACT_DESIGN_SKILL.content, /Use .+flex.+not .+dir/);
  const renderer = new DesignRenderer();
  const info = await renderer.inspect(starter);
  assert.ok(info.nodes >= 4);
});

test('FEAT-007 AC-013: list filters designs', async () => {
  const { service, target } = await fixture();
  await service.create(target, { type: 'page', title: 'Page', content: '<p>x</p>', source: agent });
  await service.create(target, { type: 'doc', title: 'Doc', content: '# x', source: agent });
  await service.create(target, { type: 'design', title: 'Card', content: DESIGN, source: agent });
  const page = await service.list(target, { type: 'design' });
  assert.equal(page.total, 1);
  assert.equal(page.items[0].title, 'Card');
});

test('FEAT-007 AC-016: the host survives a hostile source', async () => {
  const renderer = new DesignRenderer();
  await assert.rejects(
    renderer.inspect(HOSTILE),
    (error) => error.code === 'artifact/design-render-failed' || error.code === 'artifact/design-timeout',
  );
  const info = await renderer.inspect(DESIGN);
  assert.ok(info.nodes >= 3);
});

test('FEAT-007 CASE-001: an empty source is refused', async () => {
  const { service, target } = await fixture();
  await assert.rejects(
    service.create(target, { type: 'design', title: 'Empty', content: '', source: agent }),
    (error) => error.code === 'artifact/design-invalid',
  );
});

test('FEAT-007 CASE-003: two previews at once both succeed', async () => {
  const { service, target } = await fixture();
  const created = await service.create(target, { type: 'design', title: 'Card', content: DESIGN, source: agent });
  const [first, second] = await Promise.all([service.preview(target, created.id), service.preview(target, created.id)]);
  assert.equal(first.data, second.data);
});

test('FEAT-007 CASE-007: a library design works', async () => {
  const { service } = await fixture();
  const created = await service.create({ scope: 'library' }, { type: 'design', title: 'Lib', content: DESIGN, source: agent });
  assert.equal(created.scope, 'library');
  const payload = await service.read({ scope: 'library' }, created.id);
  assert.equal(payload.manifest.scope, 'library');
  assert.ok(payload.designInfo.nodes >= 3);
});

test('FEAT-007 AC-001b: the create tool reports design info and warnings', async () => {
  const { service, target } = await fixture();
  const tools = createTools({
    service,
    registry,
    workingDirectory: { ensure: async () => path.join(base, 'project-a') },
  });
  const byName = Object.fromEntries(tools.map((tool) => [tool.name, tool]));
  const exec = { agent: { id: 'ses-a' }, signal: new AbortController().signal };
  const value = await byName.artifact_create.execute({ type: 'design', title: 'Font', content: FONT }, exec);
  assert.equal(value.type, 'design');
  assert.ok(value.warnings.some((warning) => warning.includes('Roboto')));
  const read = await byName.artifact_read.execute({ id: value.id }, exec);
  assert.equal(read.content, FONT);
  assert.ok(read.designInfo.nodes >= 1);
  const exported = await byName.artifact_export.execute({ id: value.id, format: 'png' }, exec);
  assert.ok(exported.bytes > 0);
  const listed = await byName.artifact_list.execute({ type: 'design' }, exec);
  assert.equal(listed.total, 1);
  assert.equal(target.workspaceId, 'ws-a');
});
