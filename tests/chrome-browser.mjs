/** Optional chrome regression check against the running Harness theme. Installs nothing. */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { build } from 'esbuild';
import { openDshSession } from '../scripts/dsh-web-check.mjs';

const compiled = await build({ stdin: { contents: "import {installStyles} from './src/client/styles.ts'; installStyles();", resolveDir: process.cwd() }, bundle: true, write: false, format: 'iife', platform: 'browser' });
const { base, browser, context } = await openDshSession();
const checks = [];
try {
  const page = await context.newPage();
  const errors = [];
  await page.emulateMedia({ reducedMotion: 'reduce' });
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(base.href);
  await page.getByText('Artifacts', { exact: true }).first().click();
  await page.locator('.art-gallery').waitFor();
  await page.evaluate(() => document.querySelector('style[data-plugin-css="dsh-artifact-studio/styles"]')?.remove());
  await page.addScriptTag({ content: compiled.outputFiles[0].text });
  await page.evaluate(() => {
    const fixture = document.createElement('section');
    fixture.id = 'chrome-check';
    fixture.style.cssText = 'position:fixed;inset:0;z-index:9999;background:var(--dsw-alias-bg-base)';
    fixture.innerHTML = '<section class="art-root"><header class="art-header art-editor-header"><div class="art-heading"><div class="art-title">Long artifact title that must yield to the actions</div></div><div class="art-actions art-editor-actions"><button style="width:200px;height:36px">View / Edit / Code</button><button style="width:160px;height:28px">Edit with agent</button><button style="width:28px;height:28px">Save</button></div></header><div class="art-gallery"><div class="art-toolbar"><span class="art-search"><input placeholder="Search artifacts"></span><div class="art-segment" style="width:500px;min-width:0;flex:none"><button style="width:500px">Filters</button></div></div></div><button class="art-sheet-tool" aria-pressed="true">Bold</button><button class="art-sheet-tool" aria-pressed="false">Italic</button><button class="art-version">Version</button><div class="art-sheet-active" style="width:80px;height:28px"></div><div class="art-selection-bar">Selection</div><div class="art-design-preview" style="flex:none;height:100px"><div style="flex:none;height:500px">Tall mockup</div></div><div class="art-token-preview">Token sample</div></section>';
    document.body.appendChild(fixture);
  });
  for (const width of [380, 700, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    for (const dark of [false, true]) {
      await page.evaluate(value => document.body.toggleAttribute('data-ds-dark-theme', value), dark);
      await page.mouse.move(0, 0);
      const rest = await page.locator('#chrome-check .art-version').evaluate(el => getComputedStyle(el).backgroundColor);
      await page.locator('#chrome-check .art-version').hover();
      const hover = await page.locator('#chrome-check .art-version').evaluate(el => getComputedStyle(el).backgroundColor);
      assert.notEqual(hover, rest, 'history hover must remain visible in both themes');
      const metrics = await page.locator('#chrome-check').evaluate(fixture => {
        const root = fixture.querySelector('.art-root');
        const pressed = root.querySelector('[aria-pressed="true"]');
        const idle = root.querySelector('[aria-pressed="false"]');
        const preview = root.querySelector('.art-design-preview');
        const panel = root.querySelector('.art-selection-bar');
        const active = root.querySelector('.art-sheet-active');
        const actions = root.querySelector('.art-editor-actions');
        const reference = document.createElement('span');
        reference.style.cssText = 'color:var(--dsw-alias-state-business-primary);box-shadow:var(--dsw-elevation-panel)';
        root.appendChild(reference);
        const blue = getComputedStyle(reference).color;
        const expectedShadow = getComputedStyle(reference).boxShadow;
        reference.remove();
        return { width: root.clientWidth, scroll: root.scrollWidth, gallery: root.querySelector('.art-gallery').scrollWidth,
          actions: actions.getBoundingClientRect().right, right: root.getBoundingClientRect().right,
          pressed: getComputedStyle(pressed).backgroundColor, idle: getComputedStyle(idle).backgroundColor,
          selection: getComputedStyle(active).boxShadow, blue,
          previewOverflow: getComputedStyle(preview).overflowY, canScroll: preview.scrollHeight > preview.clientHeight,
          tokenOverflow: getComputedStyle(root.querySelector('.art-token-preview')).overflow,
          shadow: getComputedStyle(panel).boxShadow, expectedShadow,
          radius: getComputedStyle(panel).borderRadius };
      });
      assert.ok(metrics.scroll <= metrics.width + 1, JSON.stringify(metrics));
      assert.ok(metrics.gallery <= metrics.width + 1, JSON.stringify(metrics));
      assert.ok(metrics.actions <= metrics.right + 1, JSON.stringify(metrics));
      assert.notEqual(metrics.pressed, metrics.idle);
      assert.ok(metrics.selection.includes(metrics.blue), JSON.stringify(metrics));
      assert.equal(metrics.previewOverflow, 'auto');
      assert.equal(metrics.canScroll, true);
      assert.equal(metrics.tokenOverflow, 'hidden');
      assert.equal(metrics.shadow, metrics.expectedShadow);
      assert.equal(metrics.radius, '12px');
      checks.push({ width, dark, overflow: false, pressed: true, blueSelection: true, previewScroll: true });
    }
  }
  assert.deepEqual(errors, []);
  await fs.mkdir('.scratch/web-check', { recursive: true });
  await page.screenshot({ path: '.scratch/web-check/chrome-regression.png' });
  console.log(JSON.stringify({ checks, pageErrors: errors }, null, 2));
} finally { await browser.close(); }
