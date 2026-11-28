/** Optional real-browser check for the SVG HTML page. Uses an existing Playwright install; installs nothing. */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { DesignRenderer } from '../dist/host/lib/design-render.js';
import { buildSvgViewerHtml } from '../dist/host/lib/svg-viewer.js';

const [modulePath, executablePath] = process.argv.slice(2);
assert.ok(modulePath && executablePath, 'Pass an installed playwright/index.mjs and a Chrome executable path.');
const { chromium } = await import(pathToFileURL(path.resolve(modulePath)).href);

/**
 * A design that exercises wrapping, centered text, and a rotated label.
 */
const SOURCE =
  '<Frame name="Card" w={360} p={24} bg="#ffffff" flex="col" gap={10}>' +
  '<Text size={20} weight={700} color="#111111">Tolerance check</Text>' +
  '<Text size={13} color="#444444">A paragraph long enough to wrap into several lines inside this card so the browser and the engine have to break it the same way.</Text>' +
  '<Frame w={200} h={30} bg="#eef2ff" flex="row" items="center" justify="center"><Text size={12} weight={600} color="#223344" textAlign="center" w={200}>Centered badge</Text></Frame>' +
  '<Text size={14} color="#222222" rotation={30}>Rotated label</Text>' +
  '</Frame>';

const renderer = new DesignRenderer();
const model = await renderer.pageModel(SOURCE);
const raster = await renderer.exportContent(SOURCE, 'png');
const html = await buildSvgViewerHtml({ title: 'SVG viewer check', model });
const out = new URL('../.scratch/svg-viewer-browser/', import.meta.url);
await fs.mkdir(out, { recursive: true });
const file = new URL('page.html', out);
await fs.writeFile(file, html);

/**
 * Compare two PNG buffers pixel by pixel inside a browser canvas.
 * @param browser the browser.
 * @param left the first image, base64.
 * @param right the second image, base64.
 * @returns the difference statistics.
 */
async function compare(browser, left, right) {
  const page = await browser.newPage();
  try {
    await page.setContent('<!doctype html><canvas id="c"></canvas>');
    return await page.evaluate(async ({ first, second }) => {
      const load = (base64) =>
        new Promise((resolve, reject) => {
          const image = new Image();
          image.onload = () => resolve(image);
          image.onerror = () => reject(new Error('image failed'));
          image.src = 'data:image/png;base64,' + base64;
        });
      const canvas = document.getElementById('c');
      const before = await load(first);
      const after = await load(second);
      const width = Math.min(before.width, after.width);
      const height = Math.min(before.height, after.height);
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d');
      context.drawImage(before, 0, 0);
      const one = context.getImageData(0, 0, width, height).data;
      context.clearRect(0, 0, width, height);
      context.drawImage(after, 0, 0);
      const two = context.getImageData(0, 0, width, height).data;
      // Luminance, as an image diff tool measures it, so antialiasing noise stays small.
      const luma = (data, index) => 0.299 * data[index] + 0.587 * data[index + 1] + 0.114 * data[index + 2];
      let sum = 0;
      let over32 = 0;
      let over96 = 0;
      for (let index = 0; index < one.length; index += 4) {
        const diff = Math.abs(luma(one, index) - luma(two, index));
        sum += diff;
        if (diff > 32) over32 += 1;
        if (diff > 96) over96 += 1;
      }
      const pixels = one.length / 4;
      return { mean: sum / pixels, over32: (over32 / pixels) * 100, over96: (over96 / pixels) * 100, width, height };
    }, { first: left, second: right });
  } finally {
    await page.close();
  }
}

const browser = await chromium.launch({ executablePath });
try {
  const page = await browser.newPage({ viewport: { width: 800, height: 600 }, deviceScaleFactor: 1 });
  const requests = [];
  page.on('request', (request) => { if (/^https?:/.test(request.url())) requests.push(request.url()); });
  await page.goto(pathToFileURL(file.pathname).href);
  await page.evaluate(() => document.fonts.ready);
  await page.setViewportSize({ width: model.width, height: model.height });
  await page.waitForTimeout(400);
  const shot = await page.screenshot({ fullPage: true });
  await fs.writeFile(new URL('shot.png', out), shot);

  // AC-SVG-004: the mockup's strings are real DOM text.
  const text = await page.evaluate(() => document.body.innerText);
  assert.ok(text.includes('Tolerance check'), 'the paragraph text is not in the DOM');
  assert.ok(text.includes('A paragraph long enough'), 'the wrapped text is not in the DOM');
  const rotated = await page.evaluate(() =>
    [...document.querySelectorAll('.t')].filter((element) => {
      const value = getComputedStyle(element).transform;
      return value !== 'none' && value.startsWith('matrix(');
    }).length,
  );
  assert.ok(rotated > 0, 'no text box carries a rotation');
  assert.deepEqual(requests, [], 'the page made a network request');

  // AC-SVG-003: the page matches the engine's own raster.
  const stats = await compare(browser, raster.bytes.toString('base64'), shot.toString('base64'));
  assert.equal(stats.width, raster.width ?? stats.width);
  assert.ok(stats.mean <= 4, 'mean difference ' + stats.mean.toFixed(2) + ' exceeds 4 of 255');
  assert.ok(stats.over96 <= 0.5, (stats.over96.toFixed(2)) + '% of pixels differ strongly');

  // AC-SVG-008: a drag that starts on text selects it and does not move the page.
  const fitted = await page.evaluate(() => document.getElementById('dsh-pan').style.transform);
  const line = await page.evaluate(() => {
    const box = [...document.querySelectorAll('.t')].find((element) => element.textContent.startsWith('A paragraph long enough'));
    if (box === undefined) return null;
    const range = document.createRange();
    range.selectNodeContents(box);
    const rect = range.getClientRects()[0];
    return rect === undefined ? null : { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
  });
  assert.ok(line !== null, 'the paragraph has no painted line');
  const textY = line.y + line.height / 2;
  await page.mouse.move(line.x + 4, textY);
  await page.mouse.down();
  await page.mouse.move(line.x + Math.min(line.width - 4, 220), textY, { steps: 8 });
  await page.mouse.up();
  const selected = await page.evaluate(() => window.getSelection().toString());
  assert.ok(selected.trim().length > 0, 'dragging across text selected nothing');
  assert.equal(await page.evaluate(() => document.getElementById('dsh-pan').style.transform), fitted, 'dragging across text moved the page');

  // Panning still works anywhere: the middle button, and Space with the left button.
  await page.mouse.move(60, 60);
  await page.mouse.down({ button: 'middle' });
  await page.mouse.move(140, 100, { steps: 5 });
  await page.mouse.up({ button: 'middle' });
  const panned = await page.evaluate(() => document.getElementById('dsh-pan').style.transform);
  assert.notEqual(panned, fitted, 'the middle button did not pan the page');
  await page.keyboard.down('Space');
  await page.mouse.move(line.x + 4, textY);
  await page.mouse.down();
  await page.mouse.move(line.x + 74, textY + 30, { steps: 5 });
  await page.mouse.up();
  await page.keyboard.up('Space');
  assert.notEqual(await page.evaluate(() => document.getElementById('dsh-pan').style.transform), panned, 'Space and a drag did not pan the page');
  console.log('svg viewer selection check passed:', JSON.stringify(selected.trim().slice(0, 40)));

  // AC-SVG-009: two fingers pinch to zoom on a touch screen, and one finger still pans.
  const phone = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  const phonePage = await phone.newPage();
  await phonePage.goto(pathToFileURL(file.pathname).href);
  await phonePage.evaluate(() => document.fonts.ready);
  const cdp = await phone.newCDPSession(phonePage);
  const touch = (type, touchPoints) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints });
  const fittedZoom = await phonePage.evaluate(() => Number(document.getElementById('dsh-stage').style.zoom));
  await touch('touchStart', [{ x: 145, y: 422, id: 1 }, { x: 245, y: 422, id: 2 }]);
  await touch('touchMove', [{ x: 95, y: 422, id: 1 }, { x: 295, y: 422, id: 2 }]);
  await touch('touchEnd', []);
  const pinchedZoom = await phonePage.evaluate(() => Number(document.getElementById('dsh-stage').style.zoom));
  assert.ok(pinchedZoom > fittedZoom * 1.5, 'two fingers did not zoom: ' + fittedZoom.toFixed(3) + ' -> ' + pinchedZoom.toFixed(3));
  const pannedOnPhone = await phonePage.evaluate(() => document.getElementById('dsh-pan').style.transform);
  await touch('touchStart', [{ x: 20, y: 700, id: 3 }]);
  await touch('touchMove', [{ x: 60, y: 730, id: 3 }]);
  await touch('touchEnd', []);
  assert.notEqual(await phonePage.evaluate(() => document.getElementById('dsh-pan').style.transform), pannedOnPhone, 'one finger did not pan after a pinch');
  await phone.close();
  console.log('svg viewer pinch check passed:', fittedZoom.toFixed(3), '->', pinchedZoom.toFixed(3));

  console.log('svg viewer browser check passed:', stats.width + 'x' + stats.height, 'mean', stats.mean.toFixed(2), 'over96', stats.over96.toFixed(2) + '%');
} finally {
  await browser.close();
}