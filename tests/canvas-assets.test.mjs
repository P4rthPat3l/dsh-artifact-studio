import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { ASSET_FILES, ASSET_PREFIX, createCanvasAssetHandler, registerCanvasAssetsRoute } from '../dist/host/lib/assets.js';

let root;

before(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'dsh-canvas-assets-'));
  await fs.mkdir(path.join(root, 'fonts'), { recursive: true });
  await fs.writeFile(path.join(root, 'canvaskit.wasm'), Buffer.from([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]));
  await fs.writeFile(path.join(root, 'canvas.engine.js'), 'export const mountDesignCanvas = () => undefined;\n');
  await fs.writeFile(path.join(root, 'fonts', 'Inter-Regular.ttf'), Buffer.from('font-bytes'));
  await fs.writeFile(path.join(root, 'secret.txt'), 'secret');
});

after(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

/** A request the handler reads. */
function request(method, url) {
  return { method, url };
}

/** A response that records what the handler wrote. */
function response() {
  const record = { status: 0, headers: {}, body: null };
  return {
    record,
    res: {
      writeHead(status, headers = {}) {
        record.status = status;
        record.headers = headers;
      },
      end(body) {
        record.body = body ?? null;
      },
    },
  };
}

/**
 * Run one request through the handler.
 * @param {string} method the HTTP method.
 * @param {string} url the request URL.
 * @returns {Promise<{ status: number, headers: Record<string, string>, body: Buffer | null }>} the response.
 */
async function call(method, url) {
  const { record, res } = response();
  await createCanvasAssetHandler(root)(request(method, url), res);
  return record;
}

test('FEAT-007 AC-025: the asset route registers a prefix route and a disposer', () => {
  const routes = [];
  const dispose = () => undefined;
  const webServer = { register: (route) => { routes.push(route); return dispose; } };
  const result = registerCanvasAssetsRoute({ webServer });
  assert.equal(result, dispose);
  assert.equal(routes.length, 1);
  assert.equal(routes[0].kind, 'prefix');
  assert.equal(routes[0].path, ASSET_PREFIX);
  assert.equal(typeof routes[0].handler, 'function');
});

test('FEAT-007 AC-025: the route serves the fixed engine files with their types', async () => {
  const wasm = await call('GET', ASSET_PREFIX + '/canvaskit.wasm?v=0.5.0');
  assert.equal(wasm.status, 200);
  assert.equal(wasm.headers['content-type'], 'application/wasm');
  assert.equal(wasm.headers['content-length'], 8);
  assert.equal(wasm.headers['cache-control'], 'public, max-age=31536000, immutable');
  assert.deepEqual([...wasm.body], [0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]);

  const engine = await call('GET', ASSET_PREFIX + '/canvas.engine.js');
  assert.equal(engine.status, 200);
  assert.equal(engine.headers['content-type'], 'text/javascript');

  const font = await call('GET', ASSET_PREFIX + '/fonts/Inter-Regular.ttf');
  assert.equal(font.status, 200);
  assert.equal(font.headers['content-type'], 'font/ttf');
});

test('FEAT-007 AC-025: HEAD answers without a body and the query is ignored', async () => {
  const head = await call('HEAD', ASSET_PREFIX + '/canvaskit.wasm');
  assert.equal(head.status, 200);
  assert.equal(head.body, null);
});

test('FEAT-007 AC-025: an unlisted name, a traversal, and a foreign path are refused', async () => {
  for (const url of [
    ASSET_PREFIX + '/secret.txt',
    ASSET_PREFIX + '/missing.wasm',
    ASSET_PREFIX + '/../secret.txt',
    ASSET_PREFIX + '/%2e%2e%2fsecret.txt',
    '/elsewhere/canvaskit.wasm',
  ]) {
    const answer = await call('GET', url);
    assert.equal(answer.status, 404, url);
  }
  const traversal = await call('GET', ASSET_PREFIX + '/fonts/../secret.txt');
  assert.equal(traversal.status, 404);
});

test('FEAT-007 AC-025: a method other than GET or HEAD is refused', async () => {
  const post = await call('POST', ASSET_PREFIX + '/canvaskit.wasm');
  assert.equal(post.status, 405);
  assert.equal(post.headers.allow, 'GET, HEAD');
});

test('FEAT-007 AC-025: a declared file that is missing on disk is a 404', async () => {
  await fs.rm(path.join(root, 'fonts', 'Inter-Regular.ttf'));
  const answer = await call('GET', ASSET_PREFIX + '/fonts/Inter-Regular.ttf');
  assert.equal(answer.status, 404);
  assert.ok(ASSET_FILES.has('fonts/Inter-Regular.ttf'));
});


test('FEAT-007 AC-040: the route serves the icon set and the Roboto files', async () => {
  await fs.writeFile(path.join(root, 'icons.json'), '{"prefix":"mdi","icons":{}}');
  await fs.writeFile(path.join(root, 'fonts', 'Roboto-Regular.woff2'), 'font-bytes');
  const icons = await call('GET', ASSET_PREFIX + '/icons.json');
  assert.equal(icons.status, 200);
  assert.equal(icons.headers['content-type'], 'application/json');
  const roboto = await call('GET', ASSET_PREFIX + '/fonts/Roboto-Regular.woff2');
  assert.equal(roboto.status, 200);
  assert.equal(roboto.headers['content-type'], 'font/woff2');
});
