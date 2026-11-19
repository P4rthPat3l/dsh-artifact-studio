/** Optional real-browser check. Uses an existing Playwright install; installs nothing. */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { composePage, PAGE_CSP } from '../dist/render.js';
import { DEFAULT_TOKENS, tokensToCss } from '../dist/contract.js';
import { checkPage } from '../dist/host/lib/checks.js';
import { BUILTIN_RECIPES } from '../dist/host/lib/recipes.js';

const [modulePath, executablePath] = process.argv.slice(2);
assert.ok(modulePath && executablePath, 'Pass an installed playwright/index.mjs and a Chrome executable path.');
const { chromium } = await import(pathToFileURL(path.resolve(modulePath)).href);
const content = await fs.readFile(new URL('./fixtures/generation.html', import.meta.url), 'utf8');
assert.deepEqual(checkPage(content, { recipe: BUILTIN_RECIPES.find(item => item.id === 'feature-spec') }), []);
const output = new URL('../.scratch/generation-browser/', import.meta.url);
await fs.mkdir(output, { recursive: true });
const browser = await chromium.launch({ executablePath });
const rows = [];
try {
  for (const width of [380, 700, 1280]) {
    for (const theme of ['light', 'dark']) {
      const page = await browser.newPage({ viewport: { width, height: 4000 } });
      const errors = [];
      const requests = [];
      page.on('pageerror', error => errors.push(error.message));
      page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
      page.on('request', request => { if (/^https?:/.test(request.url())) requests.push(request.url()); });
      const html = composePage(content, tokensToCss(DEFAULT_TOKENS), PAGE_CSP, 'Generation fixture', '', theme);
      await page.setContent('<!doctype html><html><body style="margin:0"><iframe sandbox="allow-scripts" style="border:0;width:100%;height:4000px"></iframe></body></html>');
      await page.locator('iframe').evaluate((frame, source) => { frame.srcdoc = source; }, html);
      const frame = page.frameLocator('iframe');
      const after = frame.locator('button[data-ak-option="after"]');
      await after.waitFor();
      await after.focus();
      await page.keyboard.press('Enter');
      assert.equal(await frame.locator('#before-panel').evaluate(el => el.hidden), true);
      assert.equal(await frame.locator('#after-panel').evaluate(el => el.hidden), false);
      const focus = await after.evaluate(el => ({ style: getComputedStyle(el).outlineStyle, width: getComputedStyle(el).outlineWidth }));
      assert.notEqual(focus.style, 'none');
      assert.notEqual(focus.width, '0px');
      await frame.locator('button[data-ak-option="before"]').click();
      const metrics = await frame.locator('html').evaluate(root => {
        const main = document.querySelector('main');
        const caption = document.querySelector('caption');
        const demo = document.querySelector('.ak-demo h3');
        return { scroll: root.scrollWidth, client: root.clientWidth, height: main.getBoundingClientRect().bottom,
          captionWidth: caption.getBoundingClientRect().width, captionHeight: caption.getBoundingClientRect().height,
          demoSize: getComputedStyle(demo).fontSize, theme: root.dataset.artifactTheme, mode: document.compatMode };
      });
      assert.equal(metrics.mode, 'CSS1Compat');
      assert.ok(metrics.scroll <= metrics.client + 1, JSON.stringify(metrics));
      assert.ok(metrics.captionWidth > 250 && metrics.captionHeight < 150, JSON.stringify(metrics));
      assert.equal(metrics.demoSize, '18px');
      assert.equal(metrics.theme, theme);
      const height = Math.ceil(metrics.height + 1);
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      await page.screenshot({ path: new URL(width + '-' + theme + '.png', output).pathname, clip: { x: 0, y: 0, width, height } });
      await page.emulateMedia({ media: 'print' });
      assert.equal(await frame.locator('#before-panel').isVisible(), true);
      assert.equal(await frame.locator('#after-panel').isVisible(), true);
      assert.deepEqual(errors, []);
      assert.deepEqual(requests, []);
      rows.push({ width, theme, overflow: false, keyboard: true, printPanels: true, errors: 0 });
      await page.close();
    }
  }
  console.log(JSON.stringify({ browser: await browser.version(), checks: rows }, null, 2));
} finally { await browser.close(); }
