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
import { createPreviewTool, createTools } from '../dist/host/lib/tools.js';

const WORKSPACE_BASE = 'artifacts/workspaces';
const DESIGN = '<Frame name="Card" w={320} p={24} bg="#ffffff" rounded={16} flex="col" gap={8}><Text size={24} weight={700} color="#111111">Quarterly</Text><Text size={14} color="#666666">Revenue is up.</Text></Frame>';
const ICON = '<Frame name="Icon" w={320} h={120}><Icon name="lucide:heart" size={24} /></Frame>';
const FONT = '<Frame w={320} h={120}><Text font="Georgia" size={16}>Hello</Text></Frame>';
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

test('FEAT-007 AC-028: a low-contrast design returns lint warnings', async () => {
  const { service, target } = await fixture();
  const manifest = await service.create(target, { type: 'design', title: 'Dim', content: '<Frame name="Card" w={120} h={60} bg="#000000"><Text color="#000000" size={14}>Hidden</Text></Frame>', source: agent });
  const payload = await service.read(target, manifest.id);
  assert.ok(payload.designInfo !== undefined);
  assert.ok(payload.designInfo.warnings.some((warning) => /contrast/i.test(warning)), JSON.stringify(payload.designInfo.warnings));
});

test('FEAT-007 AC-029: a well-formed design carries no lint warnings', async () => {
  const { service, target } = await fixture();
  const manifest = await service.create(target, { type: 'design', title: 'Card', content: DESIGN, source: agent });
  const payload = await service.read(target, manifest.id);
  assert.ok(payload.designInfo !== undefined);
  assert.equal(payload.designInfo.warnings.filter((warning) => warning.startsWith('Design issue')).length, 0, JSON.stringify(payload.designInfo.warnings));
});

test('FEAT-007 AC-032: small text alone raises no lint warnings', async () => {
  const { service, target } = await fixture();
  const manifest = await service.create(target, { type: 'design', title: 'Small', content: '<Frame name="Card" w={120} h={60} bg="#ffffff"><Text color="#111111" size={10}>Tiny</Text></Frame>', source: agent });
  const payload = await service.read(target, manifest.id);
  assert.ok(payload.designInfo !== undefined);
  assert.equal(payload.designInfo.warnings.filter((warning) => warning.startsWith('Design issue')).length, 0, JSON.stringify(payload.designInfo.warnings));
});

test('FEAT-007 AC-070: an ignored authoring prop reaches the design summary as a warning', async () => {
  const { service, target } = await fixture();
  const manifest = await service.create(target, { type: 'design', title: 'Margin', content: '<Frame name="Card" w={120} h={60} margin={8} bg="#ffffff"><Text color="#111111" size={14}>Hi</Text></Frame>', source: agent });
  const payload = await service.read(target, manifest.id);
  assert.ok(payload.designInfo !== undefined);
  assert.ok(payload.designInfo.warnings.some((warning) => warning.includes('Unsupported prop "margin"')), JSON.stringify(payload.designInfo.warnings));
  const clean = await service.create(target, { type: 'design', title: 'No margin', content: DESIGN, source: agent });
  const cleanPayload = await service.read(target, clean.id);
  assert.equal(cleanPayload.designInfo.warnings.some((warning) => warning.includes('Unsupported prop')), false, JSON.stringify(cleanPayload.designInfo.warnings));
});

test('FEAT-007 AC-030: a .fig file imports as an editable design', async () => {
  const { home, service, target } = await fixture();
  const created = await service.create(target, { type: 'design', title: 'Card', content: DESIGN, source: agent });
  const fig = await service.export(target, created.id, 'fig');
  assert.equal(fig.mediaType, 'application/octet-stream');
  const figPath = path.join(home, 'card.fig');
  await fs.writeFile(figPath, Buffer.from(fig.data, 'base64'));
  const manifest = await service.importDesign(target, { path: figPath, source: agent });
  assert.equal(manifest.type, 'design');
  assert.equal(manifest.title, 'card');
  const payload = await service.read(target, manifest.id);
  assert.match(payload.content, /<Frame/);
  assert.ok((payload.designInfo?.nodes ?? 0) > 0);
});

test('FEAT-007 AC-031: a missing .fig path is refused', async () => {
  const { service, target } = await fixture();
  await assert.rejects(
    service.importDesign(target, { path: path.join(base, 'absent.fig'), source: agent }),
    (error) => error.code === 'artifact/bad-request',
  );
});

test('FEAT-007 AC-030b: the import tool turns a .fig path into an artifact', async () => {
  const { home, service, target } = await fixture();
  const created = await service.create(target, { type: 'design', title: 'Card', content: DESIGN, source: agent });
  const fig = await service.export(target, created.id, 'fig');
  const figPath = path.join(home, 'card.fig');
  await fs.writeFile(figPath, Buffer.from(fig.data, 'base64'));
  const tools = createTools({ service, registry, workingDirectory: { ensure: async () => path.join(base, 'project-a') } });
  const byName = Object.fromEntries(tools.map((tool) => [tool.name, tool]));
  const exec = { agent: { id: 'ses-a' }, signal: new AbortController().signal };
  const value = await byName.artifact_import.execute({ path: figPath }, exec);
  assert.equal(value.type, 'design');
  assert.equal(value.title, 'card');
  assert.equal(value.scope, 'workspace');
  assert.ok(Array.isArray(value.warnings), 'the import tool returns its warnings array');
  const payload = await service.read(target, String(value.id));
  assert.match(payload.content, /<Frame/);
});

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

test('FEAT-007 AC-011: an icon set outside the bundle is refused with guidance', async () => {
  const { service, target } = await fixture();
  await assert.rejects(
    service.create(target, { type: 'design', title: 'Icon', content: ICON, source: agent }),
    (error) => error.code === 'artifact/design-icon-not-found' && /lucide/.test(error.message),
  );
});

test('FEAT-007 AC-012: unbundled fonts warn', async () => {
  const { service, target } = await fixture();
  const manifest = await service.create(target, { type: 'design', title: 'Font', content: FONT, source: agent });
  const payload = await service.read(target, manifest.id);
  assert.ok(payload.designInfo.warnings.some((warning) => warning.includes('Georgia')), JSON.stringify(payload.designInfo));
});

test('FEAT-007 AC-012b: the starter and mockup brief teach flex layout, not dir', async () => {
  const { starterContent } = await import('../src/client/templates.ts');
  const { service, target } = await fixture();
  const { brief } = await service.brief(target, 'design', 'general');
  const starter = starterContent('design', 'Untitled design');
  assert.match(starter, /flex="col"/);
  assert.doesNotMatch(starter, /dir="/);
  assert.match(brief, /`flex` turns on auto layout/);
  assert.match(brief, /`lineHeight` is a line height in pixels/);
  assert.match(brief, /wraps only when it has a numeric/);
  const example = brief.split('- Example: `')[1].split('`')[0];
  assert.ok((await new DesignRenderer().inspect(example)).nodes >= 3, 'brief example compiles');
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
  assert.ok(value.warnings.some((warning) => warning.includes('Georgia')));
  const read = await byName.artifact_read.execute({ id: value.id }, exec);
  assert.equal(read.content, FONT);
  assert.ok(read.designInfo.nodes >= 1);
  const exported = await byName.artifact_export.execute({ id: value.id, format: 'png' }, exec);
  assert.ok(exported.bytes > 0);
  const listed = await byName.artifact_list.execute({ type: 'design' }, exec);
  assert.equal(listed.total, 1);
  assert.equal(target.workspaceId, 'ws-a');
});


test('FEAT-007 AC-073: a patch replaces one layer without resending the source', async () => {
  const { service, target } = await fixture();
  const tools = createTools({ service, registry, workingDirectory: { ensure: async () => path.join(base, 'project-a') } });
  const byName = Object.fromEntries(tools.map((tool) => [tool.name, tool]));
  const exec = { agent: { id: 'ses-a' }, signal: new AbortController().signal };
  const created = await byName.artifact_create.execute({ type: 'design', title: 'Card', content: DESIGN }, exec);
  const read = await byName.artifact_read.execute({ id: created.id, outline: true }, exec);
  const outline = read.designInfo.outline;
  assert.ok(Array.isArray(outline) && outline.length === 1, JSON.stringify(outline));
  assert.equal(outline[0].type, 'FRAME');
  assert.equal(outline[0].path, '0');
  const title = outline[0].children[0];
  const patched = await byName.artifact_patch.execute({
    id: created.id,
    baseVersion: 1,
    targetPath: title.path,
    patch: '<Text name="Title" size={40} color="#ff0000">Annual</Text>',
  }, exec);
  assert.equal(patched.version, 2);
  assert.ok(Array.isArray(patched.outline), 'the patch returns a fresh outline');
  const payload = await service.read(target, created.id);
  assert.match(payload.content, /Annual/);
  assert.match(payload.content, /Revenue is up\./, 'the sibling layer stays');
  const frameRow = patched.outline.find((row) => row.name === 'Card');
  const second = await byName.artifact_patch.execute({
    id: created.id,
    baseVersion: 2,
    targetPath: frameRow.path,
    patch: '<Frame name="Card" w={480} p={24} bg="#00ff00" flex="col" gap={8}><Text name="Title" size={40} color="#ff0000">Annual</Text><Text name="Body" size={14} color="#666666">Revenue is up.</Text></Frame>',
  }, exec);
  assert.equal(second.version, 3);
  const after = await service.read(target, created.id);
  assert.match(after.content, /00ff00/i);
});

test('FEAT-007 AC-074: a patch refuses a design that holds component instances', async () => {
  const { service, target } = await fixture();
  const source = '<Component name="Badge" w={60} h={24} bg="#22C55E" rounded={12}><Text size={10} color="#ffffff">New</Text></Component><Instance of="Badge" x={80} />';
  const created = await service.create(target, { type: 'design', title: 'Badged', content: source, source: agent });
  const payload = await service.read(target, created.id, 1);
  const outline = payload.designInfo.outline;
  assert.ok(Array.isArray(outline) && outline.length > 0, JSON.stringify(payload.designInfo));
  await assert.rejects(
    service.patchDesign(target, created.id, { baseVersion: 1, patch: '<Frame name="Badge" w={60} h={24} />', targetPath: outline[0].path, source: editor }),
    (error) => error.code === 'artifact/design-instances' && /artifact_update/.test(error.message),
  );
});

test('FEAT-007 AC-075: a patch refuses a missing target and a stale base version', async () => {
  const { service, target } = await fixture();
  const created = await service.create(target, { type: 'design', title: 'Card', content: DESIGN, source: agent });
  await assert.rejects(
    service.patchDesign(target, created.id, { baseVersion: 1, patch: '<Frame name="X" w={10} h={10} />', targetPath: 'gone', source: editor }),
    (error) => error.code === 'artifact/bad-request' && /does not exist/.test(error.message),
  );
  const outline = (await service.read(target, created.id)).designInfo.outline;
  await assert.rejects(
    service.patchDesign(target, created.id, { baseVersion: 99, patch: '<Frame name="Card" w={320} />', targetPath: outline[0].path, source: editor }),
    (error) => error.code === 'artifact/stale-version',
  );
});

test('FEAT-007 AC-076: a variable reference without a stored variable is refused with guidance', async () => {
  const { service, target } = await fixture();
  await assert.rejects(
    service.create(target, { type: 'design', title: 'Var', content: '<Frame w={100} h={50} bg={designVar("primary")} />', source: agent }),
    (error) => error.code === 'artifact/design-variable' && /cannot create variables/.test(error.message),
  );
});

test('FEAT-007 AC-077: the preview tool returns the render beside the result and refuses routes without image input', async () => {
  const { service, target } = await fixture();
  const created = await service.create(target, { type: 'design', title: 'Card', content: DESIGN, source: agent });
  const host = { service, registry, workingDirectory: { ensure: async () => path.join(base, 'project-a') } };
  const saved = [];
  const imageLlm = { resolveModelInfo: async () => ({ inputModalities: ['image'] }) };
  const attachments = {
    saveImages: async (inputs) => {
      saved.push(...inputs);
      return inputs.map(() => ({ attachmentId: 'att-1', mediaType: 'image/png', bytes: 42, width: 160, height: 90 }));
    },
  };
  const exec = { agent: { id: 'ses-a', session: { requestHeader: () => ({ config: { provider: 'p', model: 'glm' } }) } }, signal: new AbortController().signal };
  const tool = createPreviewTool(host, { attachments, llm: imageLlm });
  const value = await tool.execute({ id: created.id }, exec);
  assert.equal(value.image.attachmentId, 'att-1');
  assert.ok(value.width > 0 && value.height > 0);
  assert.equal(saved.length, 1, 'the render was stored once');
  const rendered = tool.output.render({}, value);
  assert.equal(rendered[0].type, 'text');
  assert.equal(rendered[1].type, 'image');
  assert.equal(rendered[1].attachment.mediaType, 'image/png');
  const textOnly = createPreviewTool(host, { attachments, llm: { resolveModelInfo: async () => ({ inputModalities: ['text'] }) } });
  await assert.rejects(
    textOnly.execute({ id: created.id }, exec),
    (error) => error.code === 'artifact/preview-invisible' && /cannot see a preview/.test(error.message),
  );
});

test('FEAT-007 AC-078: layout problems are warned, never refused', async () => {
  const { service, target } = await fixture();
  const card = (inner) => '<Frame name="Card" w={280} p={16} flex="col" gap={8} bg="#ffffff">' + inner + '</Frame>';
  const tight = await service.create(target, {
    type: 'design',
    title: 'Line height',
    content: card('<Text size={18} color="#111111" lineHeight={1.4}>A paragraph that wraps inside the card.</Text>'),
    source: agent,
  });
  const tightInfo = (await service.read(target, tight.id)).designInfo;
  assert.ok(tightInfo.warnings.some((warning) => /lineHeight 1\.4/.test(warning)), JSON.stringify(tightInfo.warnings));

  const stacked = await service.create(target, {
    type: 'design',
    title: 'Stacked',
    content: '<Frame name="Row" w={240} gap={8} bg="#ffffff"><Text size={16} color="#111111">Alpha</Text><Text size={16} color="#111111">Beta</Text></Frame>',
    source: agent,
  });
  const stackedInfo = (await service.read(target, stacked.id)).designInfo;
  assert.ok(stackedInfo.warnings.some((warning) => /overlaps/.test(warning)), JSON.stringify(stackedInfo.warnings));

  const narrow = await service.create(target, {
    type: 'design',
    title: 'Narrow',
    content: '<Frame name="Narrow" w={160} p={16} flex="col" bg="#ffffff"><Text size={16} color="#111111">Self-contained HTML that renders in a sandbox, exported as HTML.</Text></Frame>',
    source: agent,
  });
  const narrowInfo = (await service.read(target, narrow.id)).designInfo;
  assert.ok(narrowInfo.warnings.some((warning) => /leaves its frame/.test(warning)), JSON.stringify(narrowInfo.warnings));
});

test('FEAT-007 AC-079: a family the package does not ship draws in Inter', async () => {
  const { service, target } = await fixture();
  const card = (family) => '<Frame w={320} h={80} bg="#ffffff"><Text font="' + family + '" size={32} color="#111111">Quarterly</Text></Frame>';
  const georgia = await service.create(target, { type: 'design', title: 'Georgia', content: card('Georgia'), source: agent });
  const inter = await service.create(target, { type: 'design', title: 'Inter', content: card('Inter'), source: agent });
  const georgiaPreview = await service.preview(target, georgia.id);
  const interPreview = await service.preview(target, inter.id);
  assert.ok(
    Buffer.from(georgiaPreview.data, 'base64').equals(Buffer.from(interPreview.data, 'base64')),
    'the unbundled family did not draw in Inter',
  );
  assert.ok(
    georgiaPreview.info.warnings.some((warning) => /Georgia/.test(warning) && /Inter/.test(warning)),
    JSON.stringify(georgiaPreview.info.warnings),
  );
});

test('FEAT-007 AC-080: the preview tool renders unsaved content without writing', async () => {
  const { home, service } = await fixture();
  const saved = [];
  const attachments = {
    saveImages: async (inputs) => {
      saved.push(...inputs);
      return inputs.map(() => ({ attachmentId: 'att-draft', mediaType: 'image/png', bytes: 10, width: 120, height: 40 }));
    },
  };
  const host = { service, registry, workingDirectory: { ensure: async () => path.join(base, 'project-a') } };
  const exec = { agent: { id: 'ses-a', session: { requestHeader: () => ({ config: { provider: 'p', model: 'glm' } }) } }, signal: new AbortController().signal };
  const tool = createPreviewTool(host, { attachments, llm: { resolveModelInfo: async () => ({ inputModalities: ['image'] }) } });
  const value = await tool.execute(
    { content: '<Frame w={120} h={40} bg="#ffffff"><Text size={14} color="#111111">Draft</Text></Frame>', id: 'art_missing' },
    exec,
  );
  assert.equal(value.id, undefined, 'a draft preview names no artifact');
  assert.ok(value.width > 0);
  assert.equal(saved.length, 1, 'the draft render was stored once');
  const workspace = path.join(home, WORKSPACE_BASE, 'ws-a');
  const names = await fs.readdir(workspace).catch(() => []);
  assert.deepEqual(names.filter((name) => name.startsWith('art_')), [], 'a draft preview wrote an artifact');
  await assert.rejects(tool.execute({}, exec), (error) => error.code === 'artifact/bad-request');
});

test('FEAT-007 AC-037: bundled icons compile to vectors and render', async () => {
  const { service, target } = await fixture();
  const source = '<Frame name="Icon" w={120} h={120} bg="#ffffff"><Icon name="mdi:heart" size={48} color="#e11d48" /></Frame>';
  const manifest = await service.create(target, { type: 'design', title: 'Icon card', content: source, source: agent });
  const payload = await service.read(target, manifest.id);
  assert.ok((payload.designInfo.types.VECTOR ?? 0) >= 1, JSON.stringify(payload.designInfo.types));
  const preview = await service.preview(target, manifest.id);
  assert.equal(preview.mediaType, 'image/png');
  assert.ok(preview.data.length > 500);
});

test('FEAT-007 AC-039: an icon name outside the bundled set is refused', async () => {
  const { home, service, target } = await fixture();
  const source = '<Frame w={40} h={40}><Icon name="mdi:not-a-real-icon" size={24} /></Frame>';
  await assert.rejects(
    service.create(target, { type: 'design', title: 'Missing icon', content: source, source: agent }),
    (error) => error.code === 'artifact/design-icon-not-found' && /not-a-real-icon/.test(error.message),
  );
  const root = path.join(home, WORKSPACE_BASE, 'ws-a');
  const names = await fs.readdir(root).catch(() => []);
  assert.deepEqual(names.filter((name) => name.startsWith('art_')), []);
});

test('FEAT-007 AC-041: Roboto renders without a warning and differs from Inter', async () => {
  const { service, target } = await fixture();
  const wrap = (family) => '<Frame w={320} h={80} bg="#ffffff"><Text font="' + family + '" size={32} color="#111111">Quarterly</Text></Frame>';
  const roboto = await service.create(target, { type: 'design', title: 'Roboto', content: wrap('Roboto'), source: agent });
  const inter = await service.create(target, { type: 'design', title: 'Inter', content: wrap('Inter'), source: agent });
  const info = await service.read(target, roboto.id);
  assert.deepEqual(info.designInfo.warnings, []);
  const robotoPng = await service.preview(target, roboto.id);
  const interPng = await service.preview(target, inter.id);
  assert.ok(!Buffer.from(robotoPng.data, 'base64').equals(Buffer.from(interPng.data, 'base64')), 'Roboto and Inter rendered the same pixels');
});

test('AC-VIEW-001: a design exports as one self-contained view-only page', async () => {
  const { home, service, target } = await fixture();
  const created = await service.create(target, { type: 'design', title: 'Card', content: DESIGN, source: agent });
  const file = await service.export(target, created.id, 'html');
  assert.equal(file.mediaType, 'text/html');
  assert.match(file.fileName, /[.]html$/);
  const bytes = Buffer.from(file.data, 'base64');
  assert.equal(file.bytes, bytes.byteLength);
  const html = bytes.toString('utf8');
  assert.ok(html.startsWith('<!doctype html>'));
  assert.match(html, /<div id="dsh-mockup"><\/div>/);
  assert.match(html, /id="dsh-mockup-data"/);
  assert.match(html, /default-src 'none'/);
  assert.match(html, /connect-src blob:/);
  assert.ok(!html.includes('<script src'), 'the page must not load a script from a file');
  assert.ok(!html.includes('http://') && !html.includes('https://'), 'the page must not name a network address');
  assert.equal((await fs.stat(file.path)).size, bytes.byteLength);
  const written = await fs.readdir(path.join(home, WORKSPACE_BASE, 'ws-a', 'exports'));
  assert.equal(written.filter((name) => name.endsWith('.html')).length, 1);
});

test('AC-VIEW-003: the page shows the requested version, and a missing version fails', async () => {
  const { service, target } = await fixture();
  const created = await service.create(target, { type: 'design', title: 'Card', content: DESIGN, source: agent });
  const next = '<Frame name="Card" w={200} p={10} bg="#ffffff"><Text size={12} color="#111111">Next</Text></Frame>';
  await service.update(target, created.id, { baseVersion: 1, content: next, source: editor });
  const first = Buffer.from((await service.export(target, created.id, 'html', 1)).data, 'base64').toString('utf8');
  const second = Buffer.from((await service.export(target, created.id, 'html', 2)).data, 'base64').toString('utf8');
  assert.notEqual(first, second, 'both versions produced the same page');
  await assert.rejects(
    service.export(target, created.id, 'html', 99),
    (error) => error.code === 'artifact/version-not-found',
  );
});


test('AC-SVG-006: the SVG HTML page shows the requested version, and a missing version fails', async () => {
  const { service, target } = await fixture();
  const created = await service.create(target, { type: 'design', title: 'Card', content: DESIGN, source: agent });
  const next = '<Frame name="Card" w={200} p={10} bg="#ffffff"><Text size={12} color="#111111">Next</Text></Frame>';
  await service.update(target, created.id, { baseVersion: 1, content: next, source: editor });
  const first = await service.export(target, created.id, 'html-svg', 1);
  const second = await service.export(target, created.id, 'html-svg', 2);
  assert.equal(first.mediaType, 'text/html');
  assert.match(first.fileName, /[.]html$/);
  const one = Buffer.from(first.data, 'base64').toString('utf8');
  const two = Buffer.from(second.data, 'base64').toString('utf8');
  assert.notEqual(one, two, 'both versions produced the same page');
  assert.match(one, /class="t"/);
  assert.ok(!/<text/.test(one), 'the page must carry no SVG text');
  await assert.rejects(
    service.export(target, created.id, 'html-svg', 99),
    (error) => error.code === 'artifact/version-not-found',
  );
});
