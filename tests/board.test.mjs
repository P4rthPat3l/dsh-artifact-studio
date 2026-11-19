import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  applyBoardOperations,
  checkBoard,
  parseBoardScene,
  serializeBoardScene,
  starterBoard,
  summarizeBoard,
} from '../dist/board.js';

test('BOARD-UNIT-001: the starter scene validates, summarises, and round-trips', () => {
  const text = starterBoard('Launch plan');
  const scene = parseBoardScene(text);
  assert.equal(text, serializeBoardScene(scene));
  assert.equal(scene.type, 'excalidraw');
  assert.equal(scene.version, 2);
  assert.equal(scene.elements.length, 7);
  assert.equal(scene.files && Object.keys(scene.files).length, 0);
  const summary = summarizeBoard(scene);
  assert.deepEqual(summary.types, { text: 4, rectangle: 1, ellipse: 1, arrow: 1 });
  assert.ok(summary.bounds && summary.bounds.width > 400 && summary.bounds.height > 150);
  assert.deepEqual(checkBoard(scene), []);
});

test('BOARD-UNIT-002: invalid scenes are refused with a readable message', () => {
  assert.throws(() => parseBoardScene('not json'), /not valid JSON/);
  assert.throws(() => parseBoardScene(JSON.stringify({ type: 'excalidraw', version: 3, elements: [] })), /version 3/);
  assert.throws(() => parseBoardScene(JSON.stringify({ type: 'excalidraw', version: 2, elements: [{ type: 'embeddable', id: 'a', x: 0, y: 0, width: 10, height: 10 }] })), /unsupported element type/);
  assert.throws(() => parseBoardScene(JSON.stringify({ type: 'excalidraw', version: 2, elements: [{ type: 'rectangle', id: 'a', x: 0, y: 0, width: 10, height: 10 }, { type: 'rectangle', id: 'a', x: 0, y: 0, width: 10, height: 10 }] })), /Two elements use the id/);
  assert.throws(() => parseBoardScene(JSON.stringify({ type: 'excalidraw', version: 2, elements: [{ type: 'image', id: 'a', x: 0, y: 0, width: 10, height: 10, fileId: 'missing' }] })), /does not name a file/);
  assert.throws(() => parseBoardScene(JSON.stringify({ type: 'excalidraw', version: 2, elements: [], files: { f: { dataURL: 'https://example.com/a.png', mimeType: 'image/png' } } })), /inline image data URL/);
  assert.throws(() => parseBoardScene(JSON.stringify({ type: 'excalidraw', version: 2, elements: [{ type: 'text', id: 'a', x: 0, y: 0, width: 10, height: 10, text: 'x', fontSize: 12, fontFamily: 99 }] })), /font family/);
});

test('BOARD-UNIT-003: element operations add, update, delete, and clear', () => {
  const starter = starterBoard('Board');
  const added = applyBoardOperations(starter, [{
    op: 'add',
    elements: [
      { type: 'rectangle', x: 40, y: 340, width: 180, height: 80, text: 'Ship', backgroundColor: '#ffec99' },
      { type: 'text', x: 260, y: 350, text: 'Review', fontSize: 22 },
      { type: 'arrow', x: 220, y: 380, points: [[0, 0], [40, 0]] },
      { type: 'line', x: 40, y: 460, points: [[0, 0], [80, 0], [80, 40]] },
    ],
  }]);
  assert.equal(added.scene.elements.length, 12);
  assert.match(added.notes[0], /added 5 element/);
  const scene = added.scene;
  const shape = scene.elements.find((element) => element.type === 'rectangle' && element.y === 340);
  assert.ok(shape);
  const first = scene.elements[0];
  assert.ok(first);
  const updated = applyBoardOperations(serializeBoardScene(scene), [
    { op: 'update', id: first.id, patch: { x: 120, text: 'Board v2' } },
    { op: 'delete', ids: [String(shape.id)] },
  ]);
  assert.equal(updated.scene.elements.length, 11);
  assert.equal(updated.scene.elements[0].x, 120);
  assert.equal(updated.scene.elements[0].text, 'Board v2');
  const cleared = applyBoardOperations(serializeBoardScene(updated.scene), [{ op: 'clear' }]);
  assert.equal(cleared.scene.elements.length, 0);
  assert.ok(checkBoard(cleared.scene).some((warning) => warning.startsWith('empty-board')));
});

test('BOARD-UNIT-004: invalid operations fail before a scene is written', () => {
  const starter = starterBoard('Board');
  assert.throws(() => applyBoardOperations(starter, [{ op: 'update', id: 'missing', patch: { x: 1 } }]), /No element has the id/);
  assert.throws(() => applyBoardOperations(starter, [{ op: 'delete', ids: ['missing'] }]), /None of the ids/);
  assert.throws(() => applyBoardOperations(starter, [{ op: 'add', elements: [{ type: 'rect', x: 0, y: 0, width: 10, height: 10 }] }]), /must be rectangle/);
  assert.throws(() => applyBoardOperations(starter, [{ op: 'add', elements: [{ type: 'rectangle', x: 0, y: 0, width: 0, height: 10 }] }]), /must be positive/);
  assert.throws(() => applyBoardOperations(starter, [{ op: 'nope' }]), /must be add, update, delete, or clear/);
});

import fs from 'node:fs/promises';
import { handleBoardAsset, registerBoardAssetsRoute } from '../dist/host/lib/board-assets.js';

function assetRequest(method, url) {
  return { method, url };
}

function assetResponse() {
  const record = { status: 0, headers: {}, body: null };
  return {
    record,
    res: {
      writeHead(status, headers = {}) { record.status = status; record.headers = headers; },
      end(body) { record.body = body ?? null; },
    },
  };
}

async function assetCall(method, url) {
  const { record, res } = assetResponse();
  await handleBoardAsset(assetRequest(method, url), res);
  return record;
}

test('BOARD-UNIT-005: the whiteboard asset route serves only manifest names', async () => {
  const routes = [];
  const dispose = () => undefined;
  const webServer = { register: (route) => { routes.push(route); return dispose; } };
  assert.equal(registerBoardAssetsRoute({ webServer }), dispose);
  assert.equal(routes[0].kind, 'prefix');
  assert.equal(routes[0].path, '/artifacts-whiteboard');

  const manifest = JSON.parse(await fs.readFile(new URL('../assets/whiteboard/manifest.json', import.meta.url), 'utf8'));
  const font = manifest.find((name) => name.endsWith('.woff2'));
  assert.ok(font, 'no font is in the whiteboard manifest');
  const served = await assetCall('GET', '/artifacts-whiteboard/' + font);
  assert.equal(served.status, 200);
  assert.equal(served.headers['content-type'], 'font/woff2');
  assert.ok(served.body.length > 0);

  const head = await assetCall('HEAD', '/artifacts-whiteboard/' + font);
  assert.equal(head.status, 200);
  assert.equal(head.body, null);

  const worker = manifest.find((name) => name.endsWith('subset-worker.chunk.js'));
  assert.ok(worker);
  const script = await assetCall('GET', '/artifacts-whiteboard/' + worker);
  assert.equal(script.status, 200);
  assert.equal(script.headers['content-type'], 'text/javascript');

  assert.equal((await assetCall('GET', '/artifacts-whiteboard/not-listed.woff2')).status, 404);
  assert.equal((await assetCall('GET', '/artifacts-whiteboard/../package.json')).status, 404);
  assert.equal((await assetCall('POST', '/artifacts-whiteboard/' + font)).status, 405);
  const outside = await assetCall('GET', '/other/' + font);
  assert.equal(outside.status, 404);
});

