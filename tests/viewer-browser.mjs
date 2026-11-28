/** Optional real-browser check for the exported mockup viewer. Uses an existing Playwright install; installs nothing. */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { DesignRenderer } from '../dist/host/lib/design-render.js';
import { buildViewerHtml } from '../dist/host/lib/viewer.js';

const [modulePath, executablePath] = process.argv.slice(2);
assert.ok(modulePath && executablePath, 'Pass an installed playwright/index.mjs and a Chrome executable path.');
const { chromium } = await import(pathToFileURL(path.resolve(modulePath)).href);

/** A design with a title, a body line, and a filled card to move and zoom. */
const SOURCE =
  '<Frame name="Card" w={420} h={220} p={24} bg="#ffffff" flex="col" gap={8}>' +
  '<Text size={24} weight={700} color="#111111">Quarterly</Text>' +
  '<Text size={14} color="#666666">Revenue is up.</Text>' +
  '<Frame name="Tile" w={180} h={60} bg="#2856c7" rounded={12} />' +
  '</Frame>';

const fig = await new DesignRenderer().exportContent(SOURCE, 'fig');
const html = await buildViewerHtml({ title: 'Viewer check', fig: fig.bytes });
const out = new URL('../.scratch/viewer-browser/', import.meta.url);
await fs.mkdir(out, { recursive: true });
const file = new URL('viewer.html', out);
await fs.writeFile(file, html);

const browser = await chromium.launch({ executablePath });
try {
  const page = await browser.newPage({ viewport: { width: 900, height: 600 } });
  const requests = [];
  const errors = [];
  const downloads = [];
  page.on('request', (request) => { if (/^https?:/.test(request.url())) requests.push(request.url()); });
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('download', (download) => downloads.push(download.suggestedFilename()));
  await page.goto(pathToFileURL(file.pathname).href);
  await page.locator('canvas').waitFor({ timeout: 30000 });
  await page.waitForTimeout(1500);
  assert.deepEqual(requests, [], 'the page made a network request');
  assert.deepEqual(errors, [], 'the page threw an error');

  // AC-VIEW-005: the canvas holds the mockup, not a blank surface.
  const painted = await page.screenshot();
  const corner = await page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    return canvas === null ? null : { width: canvas.width, height: canvas.height };
  });
  assert.ok(corner !== null && corner.width > 0 && corner.height > 0, 'the canvas has no size');

  // AC-VIEW-006: a drag that starts on the frame pans the view and does not select
  // it, Ctrl wheel zooms it, and Delete edits nothing. A drag back must restore the
  // first frame exactly, which a selection outline would not.
  await page.mouse.move(450, 300);
  await page.mouse.down();
  await page.mouse.move(600, 420, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(300);
  const dragged = await page.screenshot();
  assert.ok(!painted.equals(dragged), 'dragging did not move the view');
  await page.mouse.move(600, 420);
  await page.mouse.down();
  await page.mouse.move(450, 300, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(300);
  assert.ok(painted.equals(await page.screenshot()), 'a drag across the frame selected it instead of panning');
  await page.keyboard.down('Control');
  await page.mouse.wheel(0, -240);
  await page.keyboard.up('Control');
  await page.waitForTimeout(500);
  const zoomed = await page.screenshot();
  assert.ok(!dragged.equals(zoomed), 'Ctrl wheel did not zoom the view');
  await page.mouse.click(450, 300);
  await page.waitForTimeout(300);
  const selected = await page.screenshot();
  await page.keyboard.press('Delete');
  await page.keyboard.press('Control+z');
  await page.keyboard.press('Control+s');
  await page.waitForTimeout(400);
  assert.ok(selected.equals(await page.screenshot()), 'a key changed the scene in view mode');
  assert.deepEqual(downloads, [], 'the page started a download');
  console.log('viewer browser check passed:', (html.length / 1e6).toFixed(2), 'MB page,', requests.length, 'requests');
} finally {
  await browser.close();
}
