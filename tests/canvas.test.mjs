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
import { createDefaultEditorState, createEditor } from '@open-pencil/core/editor';
import { initCanvasKit } from '@open-pencil/core/io/formats/raster';
import { renderLayer } from '../src/client/canvas/layer-export.ts';
import { reactive } from 'vue';

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

test('FEAT-007 AC-024: the engine registers the shape and pen tools the dock exposes', async () => {
  const first = await compile(DESIGN);
  const editor = createEditor({
    graph: first.graph,
    state: reactive(createDefaultEditorState(first.page.id)),
    getViewportSize: () => ({ width: 800, height: 600 }),
  });
  try {
    for (const tool of ['RECTANGLE', 'ELLIPSE', 'LINE', 'POLYGON', 'STAR', 'PEN', 'PENCIL']) {
      editor.setTool(tool);
      assert.equal(editor.state.activeTool, tool, tool);
    }
  } finally {
    editor.dispose();
  }
});

test('FEAT-007 AC-025: duplicate, z-order, and align mutate the compiled design', async () => {
  const source = '<Frame name="A" w={100} h={50} x={10} y={10} bg="#111111" /><Frame name="B" w={100} h={50} x={70} y={40} bg="#222222" /><Frame name="C" w={100} h={50} x={30} y={70} bg="#333333" />';
  const first = await compile(source);
  const editor = createEditor({
    graph: first.graph,
    state: reactive(createDefaultEditorState(first.page.id)),
    getViewportSize: () => ({ width: 800, height: 600 }),
  });
  try {
    const ids = [...first.page.childIds];
    editor.select([ids[0]]);
    editor.duplicateSelected();
    const afterDup = [...editor.state.selectedIds];
    assert.notEqual(afterDup[0], ids[0], 'the duplicate selected the copy');
    assert.equal(editor.graph.getNode(afterDup[0]).name, 'A');
    const two = [ids[1], ids[2]];
    editor.select(two);
    editor.alignNodes(two, 'horizontal', 'min');
    const x1 = editor.graph.getNode(two[0]).x;
    const x2 = editor.graph.getNode(two[1]).x;
    assert.equal(Math.round(x1), Math.round(x2), 'both frames moved to the shared x');
    editor.select([ids[1]]);
    const order = () => [...first.page.childIds];
    const beforeIndex = order().indexOf(ids[1]);
    editor.bringForward();
    assert.equal(order().indexOf(ids[1]), beforeIndex + 1, 'B moved one rank forward');
    editor.undo.undo();
    assert.equal(order().indexOf(ids[1]), beforeIndex, 'undo restored the previous order');
  } finally {
    editor.dispose();
  }
});
test('FEAT-007 AC-072: group and ungroup mutate the compiled design and undo reverts one step', async () => {
  const source = '<Frame name="A" w={100} h={50} x={10} y={10} bg="#111111" /><Frame name="B" w={100} h={50} x={70} y={40} bg="#222222" />';
  const first = await compile(source);
  const editor = createEditor({
    graph: first.graph,
    state: reactive(createDefaultEditorState(first.page.id)),
    getViewportSize: () => ({ width: 800, height: 600 }),
  });
  try {
    const ids = [...first.page.childIds];
    editor.select(ids);
    editor.groupSelected();
    const grouped = [...first.page.childIds];
    assert.equal(grouped.length, 1, 'grouping left more than one top-level node');
    assert.equal(editor.graph.getNode(grouped[0]).type, 'GROUP');
    assert.deepEqual([...editor.graph.getNode(grouped[0]).childIds].sort(), [...ids].sort(), 'the group does not hold both frames');
    editor.select(grouped);
    editor.ungroupSelected();
    assert.deepEqual([...first.page.childIds].sort(), [...ids].sort(), 'ungrouping did not restore the top-level frames');
    editor.undo.undo();
    assert.equal(first.page.childIds.length, 1, 'undo did not restore the group');
    assert.equal(editor.graph.getNode(first.page.childIds[0]).type, 'GROUP', 'undo did not restore a group node');
  } finally {
    editor.dispose();
  }
});

test('FEAT-007 AC-027: a color preview commits with one undo step to the original paint', async () => {
  const first = await compile('<Frame name="Card" w={120} h={80} bg="#111111" />');
  const editor = createEditor({
    graph: first.graph,
    state: reactive(createDefaultEditorState(first.page.id)),
    getViewportSize: () => ({ width: 800, height: 600 }),
  });
  try {
    const id = first.page.childIds[0];
    editor.select([id]);
    const hexOf = () => {
      const fill = editor.graph.getNode(id).fills[0];
      return '#' + [fill.color.r, fill.color.g, fill.color.b].map((channel) => Math.round(channel * 255).toString(16).padStart(2, '0')).join('');
    };
    assert.equal(hexOf(), '#111111');
    // Preview writes go through updateNode without an undo entry.
    const node = editor.graph.getNode(id);
    const originalFills = [...node.fills];
    const previewed = [...node.fills];
    previewed[0] = { ...previewed[0], color: { ...previewed[0].color, r: 0x2a / 255, g: 0x2a / 255, b: 0x2a / 255 } };
    editor.updateNode(id, { fills: previewed });
    assert.equal(hexOf(), '#2a2a2a');
    // Commit captures the pre-preview paints through commitNodeUpdate, so one undo reverts.
    editor.commitNodeUpdate(id, { fills: originalFills }, 'Change fill');
    editor.undo.undo();
    assert.equal(hexOf(), '#111111');
  } finally {
    editor.dispose();
  }
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

test('FEAT-007 AC-069: one layer renders on its own from the live graph', async () => {
  const source = '<Frame name="Wide" x={0} y={0} w={420} h={120} bg="#112233" /><Frame name="Tall" x={500} y={0} w={180} h={320} bg="#445566" /><Frame name="Empty" x={800} y={0} w={100} h={50} />';
  const first = await compile(source);
  const ck = await initCanvasKit();
  const wide = await renderLayer(ck, first.graph, first.page.id, first.page.childIds[0], 'png');
  const wideBytes = Buffer.from(wide.data);
  assert.equal(wide.mediaType, 'image/png');
  assert.deepEqual([wideBytes.readUInt32BE(16), wideBytes.readUInt32BE(20)], [420, 120]);
  const empty = await renderLayer(ck, first.graph, first.page.id, first.page.childIds[2], 'png');
  const emptyBytes = Buffer.from(empty.data);
  assert.deepEqual([emptyBytes.readUInt32BE(16), emptyBytes.readUInt32BE(20)], [100, 50], 'the file keeps the layer box');
  const tall = await renderLayer(ck, first.graph, first.page.id, first.page.childIds[1], 'svg');
  assert.equal(tall.mediaType, 'image/svg+xml');
  assert.match(new TextDecoder().decode(tall.data), /<svg[^>]*width="180"/);
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
