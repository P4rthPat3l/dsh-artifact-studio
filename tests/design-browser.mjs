/** Optional real-GUI check for the mockup surface: run against the live Harness with `node tests/design-browser.mjs`. Deletes the mockups it creates. */
import { openDshSession } from '../../scripts/dsh-web-check.mjs';
const { base, browser, context } = await openDshSession();
const page = await context.newPage({ viewport: { width: 1600, height: 950 } });
const errors = [];
const log = (...p) => console.log('[live]', ...p);
page.on('pageerror', (e) => errors.push(String(e).slice(0, 300)));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 200)); });
const assert = (ok, message) => { if (!ok) throw new Error('ASSERT: ' + message); };
const rows = async () => page.evaluate(() => [...document.querySelectorAll('.art-layer-row .art-layer-name')].map((r) => r.textContent));
const rectRows = () => page.locator('.art-layer-row', { hasText: /[Rr]ectangle/ });
const toEdit = () => page.locator('[id$="-edit"]').click();
const toView = () => page.locator('[id$="-view"]').click();
const toCode = () => page.locator('[id$="-source"]').click();
const save = async () => { await page.getByRole('button', { name: 'Save', exact: true }).last().click(); await page.waitForTimeout(1100); };
const saveDisabled = async () => page.evaluate(() => { const b = [...document.querySelectorAll('button')].find((x) => (x.textContent ?? '').trim() === 'Save'); if (!b) return true; return b.disabled === true || b.getAttribute('aria-disabled') === 'true'; });
const LOW = '<Frame name="Dim" w={300} h={120} p={20} bg="#000000"><Text size={20} color="#050505">Hidden text</Text></Frame>';
const deleteOpenArtifacts = async () => {
  for (;;) {
    const back = page.getByRole('button', { name: 'Back', exact: true });
    if ((await back.count()) > 0) { await back.first().click(); await page.waitForTimeout(400); }
    const galleryVisible = await page.locator('.art-gallery').isVisible().catch(() => false);
    if (!galleryVisible) await page.getByLabel('Artifacts', { exact: true }).click();
    await page.locator('.art-gallery').waitFor({ timeout: 10000 });
    await page.getByText('Mockup', { exact: true }).click();
    await page.waitForTimeout(300);
    const tile = page.locator('.art-gallery button', { hasText: /^Untitled design/ }).first();
    if ((await tile.count()) === 0) return;
    await tile.click();
    await page.waitForTimeout(1200);
    await page.getByRole('button', { name: 'Show more' }).click();
    await page.waitForTimeout(300);
    const del = page.getByRole('button', { name: 'Delete', exact: true }).last();
    if ((await del.count()) === 0) return;
    await del.click();
    await page.waitForTimeout(300);
    await page.getByRole('button', { name: 'Delete', exact: true }).last().click();
    await page.waitForTimeout(800);
    console.log('[live] deleted one Untitled design');
  }
};

try {
  await page.goto(base.href, { waitUntil: 'load' });
  await page.getByText('Artifacts', { exact: true }).first().click();
  await page.locator('.art-gallery').waitFor({ timeout: 15000 });
  await page.getByText('Mockup', { exact: true }).click();
  await page.getByRole('button', { name: 'New artifact' }).click();
  await page.waitForTimeout(300);
  const menuButtons = await page.evaluate(() => [...document.querySelectorAll('button')].map((b) => (b.textContent ?? '').trim()).filter((t) => t.startsWith('New mockup')));
  console.log('[live] menu entries:', JSON.stringify(menuButtons));
  if (menuButtons.length === 0) await page.screenshot({ path: 'no-menu.png' });
  await page.locator('button', { hasText: 'New mockup' }).first().click();
  await page.waitForTimeout(2500);
  await page.locator('.art-canvas-mount[data-ready="1"]').waitFor({ timeout: 20000 });
  log('fresh mockup tab open');

  await toEdit();
  await page.waitForTimeout(900);
  const dock = await page.evaluate(() => [...document.querySelectorAll('.art-dock-button')].map((b) => b.getAttribute('aria-label')));
  for (const need of ['Select', 'Hand', 'Rectangle', 'Ellipse', 'Line', 'Pen', 'Frame', 'Text', 'Undo', 'Redo']) assert(dock.includes(need), 'dock lacks ' + need);
  log('dock buttons verified');

  const box = await page.locator('.art-canvas-mount canvas').boundingBox();
  assert(box !== null, 'canvas box missing');
  const beforeDraw = await rows();
  const spots = [[0.62, 0.2], [0.72, 0.45], [0.5, 0.68]];
  for (const [fx, fy] of spots) {
    await page.locator('[aria-label="Rectangle"]').click();
    await page.waitForTimeout(200);
    const x = box.x + box.width * fx;
    const y = box.y + box.height * fy;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + 120, y + 90, { steps: 6 });
    await page.mouse.up();
    await page.waitForTimeout(450);
  }
  const drawnRects = await rectRows().count();
  log('draws:', beforeDraw.length, 'to', (await rows()).length, 'rect rows:', drawnRects);
  assert(drawnRects === 3, 'three drags must create three rectangles, got ' + drawnRects);

  // One drawn shape is removed by dock undo and returns with redo.
  await page.locator('[aria-label="Undo"]').click();
  await page.waitForTimeout(400);
  assert((await rectRows().count()) === 2, 'undo removed the last drawing');
  await page.locator('[aria-label="Redo"]').click();
  await page.waitForTimeout(400);
  assert((await rectRows().count()) === 3, 'redo restored the drawing');

  // Align the three rectangles under the Properties tab.
  await rectRows().nth(0).click();
  await rectRows().nth(2).click({ modifiers: ['Shift'] });
  await page.getByText('Properties', { exact: true }).click();
  await page.waitForTimeout(300);
  assert((await page.locator('[aria-label="Align"]').count()) === 1, 'align toolbar missing for multi-selection');
  const alignLabels = await page.evaluate(() => [...document.querySelectorAll('[aria-label="Align"] button')].map((b) => b.getAttribute('aria-label')));
  assert(alignLabels.length === 6, 'align buttons incomplete');
  await page.locator('[aria-label="Align left"]').click();
  await page.waitForTimeout(400);

  // Color one rectangle through the typed hex field.
  await page.getByText('Layers', { exact: true }).click();
  await page.waitForTimeout(250);
  await rectRows().nth(0).click();
  await page.getByText('Properties', { exact: true }).click();
  await page.waitForTimeout(300);
  const fillCss = page.getByLabel('Fill CSS', { exact: true });
  assert((await fillCss.count()) === 1, 'Fill CSS field missing');
  await fillCss.fill('#2a2a2a');
  await fillCss.press('Enter');
  await page.waitForTimeout(500);

  // Duplicate through the selection actions; rows are visible on the Layers tab.
  await page.getByText('Layers', { exact: true }).click();
  await page.waitForTimeout(250);
  const rowsBeforeDup = (await rows()).length;
  await page.getByText('Properties', { exact: true }).click();
  await page.waitForTimeout(250);
  await page.locator('[aria-label="Duplicate"]').click();
  await page.waitForTimeout(450);
  await page.getByText('Layers', { exact: true }).click();
  await page.waitForTimeout(300);
  const rowsAfterDup = (await rows()).length;
  assert(rowsAfterDup === rowsBeforeDup + 1, 'duplicate did not add a layer: ' + rowsBeforeDup + ' -> ' + rowsAfterDup);

  // Z-order: bring the copy forward.
  await page.locator('.art-layer-row', { hasText: /[Rr]ectangle.*copy|Rectangle [0-9]+$/ }).first().click();
  await page.getByText('Properties', { exact: true }).click();
  await page.waitForTimeout(250);
  await page.locator('[aria-label="Bring forward"]').click();
  await page.waitForTimeout(400);

  await toCode();
  await page.waitForTimeout(400);
  const draft = await page.locator('textarea').inputValue();
  assert(draft.toLowerCase().includes('2a2a2a'), 'the fill color did not reach the source');
  log('fill color reached the source');
  await save();
  assert(await saveDisabled(), 'Save is still enabled after saving');
  log('saved through the header');

  // Lint warnings surface as a note bar over the live canvas view.
  await toCode();
  await page.waitForTimeout(400);
  await page.getByText('Edit code', { exact: true }).click();
  await page.waitForTimeout(500);
  await page.locator('textarea').fill(LOW);
  await save();
  for (let i = 0; i < 20 && !(await saveDisabled()); i += 1) await page.waitForTimeout(500);
  await toView();
  await page.waitForTimeout(900);
  const bar = page.locator('.art-bar[data-tone="warn"][role="note"]');
  assert((await bar.count()) === 1, 'the design warnings bar did not render in view mode');
  const barText = await bar.innerText();
  log('warnings bar:', barText.replace(/\s+/g, ' ').slice(0, 220));
  assert(barText.includes('Contrast ratio') && barText.includes('Design issue'), 'bar text: ' + barText.slice(0, 120));
  await bar.locator('button').click();
  await page.waitForTimeout(300);
  assert((await bar.count()) === 0, 'the dismissed warnings bar returned');
  await page.screenshot({ path: 'warnings-dismissed.png' });

  // Keyboard shortcut on the edit canvas.
  await toEdit();
  await page.locator('.art-canvas-mount[data-ready="1"]').waitFor({ timeout: 20000 });
  await page.locator('.art-canvas-mount').click();
  await page.keyboard.press('r');
  await page.waitForTimeout(250);
  const pressed = await page.evaluate(() => [...document.querySelectorAll('.art-dock-button')].find((b) => b.getAttribute('aria-pressed') === 'true')?.getAttribute('aria-label'));
  assert(pressed === 'Rectangle', 'keyboard r did not pick the rectangle tool, active: ' + pressed);
  for (const [label, fx, fy] of [['Ellipse', 0.42, 0.3], ['Line', 0.22, 0.62]]) {
    const toolBefore = await page.evaluate(() => [...document.querySelectorAll('.art-dock-button')].find((b) => b.getAttribute('aria-pressed') === 'true')?.getAttribute('aria-label'));
    await page.locator('[aria-label="' + label + '"]').click();
    await page.waitForTimeout(300);
    const toolAfter = await page.evaluate(() => [...document.querySelectorAll('.art-dock-button')].find((b) => b.getAttribute('aria-pressed') === 'true')?.getAttribute('aria-label'));
    log(label, 'tool before/after click:', toolBefore, toolAfter);
    const dx = box.x + box.width * fx;
    const dy = box.y + box.height * fy;
    await page.mouse.move(dx, dy);
    await page.mouse.down();
    await page.mouse.move(dx + 110, dy + 80, { steps: 6 });
    await page.mouse.up();
    await page.waitForTimeout(600);
    await page.getByText('Layers', { exact: true }).click().catch(() => undefined);
    await page.waitForTimeout(250);
    log(label, 'rows after draw:', JSON.stringify(await rows()));
  }
  const ellipseRows = await page.locator('.art-layer-row', { hasText: /[Ee]llipse/ }).count();
  const lineRows = await page.locator('.art-layer-row', { hasText: /^[^L]*\bLine \d/ }).count();
  log('ellipse rows:', ellipseRows, 'line rows:', lineRows);
  assert(ellipseRows === 1 && lineRows === 1, 'ellipse and line drags must each create one layer');
  await save();
  await page.screenshot({ path: 'final-edit.png' });

  if (errors.length > 0) throw new Error('page errors: ' + JSON.stringify(errors));
  log('LIVE PASS');
} finally {
  console.log('pageErrors:', JSON.stringify(errors));
  try { await deleteOpenArtifacts(); } catch (e) { console.log('[live] cleanup issue:', String(e).slice(0, 200)); }
  await browser.close();
}
