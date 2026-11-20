import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildViewerHtml } from '../dist/host/lib/viewer.js';

/**
 * The builder keeps the compressed viewer, CanvasKit, and fonts for the whole
 * process, so this file stays in its own process and measures the cold and warm
 * export of the same scene.
 */
test('AC-VIEW-007: the viewer payload is compressed once per process', async () => {
  const fig = new Uint8Array(2048);
  const coldStart = performance.now();
  const cold = await buildViewerHtml({ title: 'First', fig });
  const coldMs = performance.now() - coldStart;
  const warmStart = performance.now();
  const warm = await buildViewerHtml({ title: 'Second', fig });
  const warmMs = performance.now() - warmStart;
  assert.ok(cold.byteLength > 0 && warm.byteLength > 0);
  assert.ok(warmMs < 500, `a warm export took ${Math.round(warmMs)} ms`);
  assert.ok(warmMs < coldMs, `warm ${Math.round(warmMs)} ms is not faster than cold ${Math.round(coldMs)} ms`);
  assert.match(cold.toString('utf8'), /"title":"First"/);
  assert.match(warm.toString('utf8'), /"title":"Second"/);
});

test('AC-VIEW-002: the page carries CanvasKit, the viewer, and the faces', async () => {
  const html = (await buildViewerHtml({ title: 'Dashboard', fig: new Uint8Array(1024) })).toString('utf8');
  assert.ok(html.length > 4_000_000, `the page is ${html.length} characters`);
  assert.match(html, /"viewer":"/);
  assert.match(html, /"canvaskit":"/);
  assert.match(html, /"fonts":\[/);
  assert.match(html, /"scene":"/);
});
