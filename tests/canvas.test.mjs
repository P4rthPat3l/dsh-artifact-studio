import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ArtifactService } from '../dist/host/lib/service.js';
import { ArtifactStore } from '../dist/host/lib/store.js';
import { DesignRenderer } from '../dist/host/lib/design-render.js';
import { SceneGraph } from '@open-pencil/scene-graph';
import { designJSXRenderer } from '@open-pencil/core/design-jsx';
import { selectionToJSX } from '@open-pencil/design-jsx';

const WORKSPACE_BASE = 'artifacts/workspaces';
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const DESIGN = '<Frame name="Card" w={320} p={24} bg="#ffffff" rounded={16} flex="col" gap={8}><Text size={24} weight={700} color="#111111">Quarterly</Text><Text size={14} color="#666666">Revenue is up.</Text></Frame>';
const agent = { origin: 'agent', action: 'create' };
const editor = { origin: 'agent', action: 'update' };

const NO_ICONS = {
  search: async () => ({ icons: [], total: 0, collections: {} }),
  icons: async () => new Map(),
  previews: async () => new Map(),
  collections: async () => [],
  browse: async () => [],
};
const { renderJSX } = designJSXRenderer(NO_ICONS);

let base;
let registry;

before(async () => {
  base = await fs.mkdtemp(path.join(os.tmpdir(), 'dsh-canvas-'));
  const record = { id: 'ws-a', path: path.join(base, 'project-a'), sessionIds: ['ses-a'] };
  registry = { get: (id) => (id === 'ws-a' ? record : undefined), list: () => [record] };
});

after(async () => {
  await fs.rm(base, { recursive: true, force: true });
});

/** A fresh home per test, so ids and cache directories never overlap. */
async function fixture() {
  const home = await fs.mkdtemp(path.join(base, 'home-'));
  const service = new ArtifactService({ workspaceBase: WORKSPACE_BASE, libraryDir: 'artifacts/v1', home }, registry, new ArtifactStore(), () => new Date(), new DesignRenderer());
  return { home, service, target: { workspaceId: 'ws-a' } };
}

/**
 * Compile a source and count the nodes below a page.
 * @param {string} source the Design JSX.
 * @returns {Promise<{ graph: SceneGraph, page: object, nodes: number }>} the compiled page.
 */
async function compile(source) {
  const graph = new SceneGraph();
  await renderJSX(graph, source);
  const page = graph.getPages()[0];
  assert.ok(page, 'the source compiled to no page');
  let nodes = 0;
  const visit = (id) => {
    const node = graph.getNode(id);
    if (node === undefined) return;
    nodes += 1;
    for (const child of node.childIds) visit(child);
  };
  for (const id of page.childIds) visit(id);
  return { graph, page, nodes };
}

test('FEAT-007 AC-024: the engine serializes a page to JSX that compiles to the same shape', async () => {
  const first = await compile(DESIGN);
  const serialized = selectionToJSX(first.page.childIds, first.graph);
  assert.match(serialized, /<Frame/);
  const second = await compile(serialized);
  assert.equal(second.nodes, first.nodes);
  assert.equal(second.graph.getPages().length, first.graph.getPages().length);
  assert.equal(selectionToJSX(second.page.childIds, second.graph), serialized);
});

test('FEAT-007 AC-019: a canvas save stores the serialization as a new version', async () => {
  const { service, target } = await fixture();
  const manifest = await service.create(target, { type: 'design', title: 'Card', content: DESIGN, source: agent });
  const compiled = await compile(DESIGN);
  const serialized = selectionToJSX(compiled.page.childIds, compiled.graph);
  const updated = await service.update(target, manifest.id, { baseVersion: 1, content: serialized, source: editor });
  assert.equal(updated.version, 2);
  const payload = await service.read(target, manifest.id);
  assert.equal(payload.content, serialized);
  const preview = await service.preview(target, manifest.id);
  assert.equal(preview.mediaType, 'image/png');
  assert.ok(preview.width > 0 && preview.height > 0);
});

test('FEAT-007 AC-026: the build emits a loader chunk and ships the engine assets', async () => {
  const loader = await fs.readFile(path.join(root, 'client.canvas.js'), 'utf8');
  assert.match(loader, /chunk: "client.canvas.js"/);
  assert.match(loader, /mountDesignCanvas/);
  assert.doesNotMatch(loader, /CanvasKitInit/);

  const main = await fs.readFile(path.join(root, 'client.js'), 'utf8');
  assert.doesNotMatch(main, /CanvasKitInit/);
  assert.doesNotMatch(main, /canvas\.engine\.js/);
  assert.match(main, /client\.canvas\.js/);

  const engine = await fs.readFile(path.join(root, 'assets', 'canvas.engine.js'), 'utf8');
  assert.match(engine, /mountDesignCanvas/);
  assert.ok(Buffer.byteLength(engine) < 4_200_000, 'the engine chunk is over its budget');

  const wasm = await fs.readFile(path.join(root, 'assets', 'canvaskit.wasm'));
  assert.deepEqual([...wasm.subarray(0, 4)], [0x00, 0x61, 0x73, 0x6d]);
  assert.ok(wasm.byteLength > 7_000_000, 'the wasm file is smaller than expected');

  for (const font of ['Inter-Regular.ttf', 'Inter-Medium.ttf', 'Inter-SemiBold.ttf', 'Inter-Bold.ttf', 'Inter-ExtraBold.ttf', 'NotoNaskhArabic-Regular.ttf']) {
    const file = await fs.readFile(path.join(root, 'assets', 'fonts', font));
    assert.ok(file.byteLength > 150_000, font);
  }

  const icons = JSON.parse(await fs.readFile(path.join(root, 'assets', 'icons.json'), 'utf8'));
  assert.equal(icons.prefix, 'mdi');
  assert.ok(Object.keys(icons.icons).length > 7000, 'the icon set is smaller than expected');
  for (const font of ['Roboto-Regular.woff2', 'Roboto-Medium.woff2', 'Roboto-Bold.woff2']) {
    const file = await fs.readFile(path.join(root, 'assets', 'fonts', font));
    assert.ok(file.byteLength > 10_000, font);
  }
});
