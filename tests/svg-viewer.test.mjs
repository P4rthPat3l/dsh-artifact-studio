import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { buildSvgViewerHtml } from '../dist/host/lib/svg-viewer.js';

/** The shapes the engine would hand over, without any text. */
const SHAPES = '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="900" viewBox="0 0 400 900"><rect width="400" height="900" fill="#ffffff"/></svg>';

/**
 * One text box for a synthetic model.
 * @param index the row.
 * @param overrides fields to replace.
 * @returns the box.
 */
function box(index, overrides = {}) {
  return {
    width: 300,
    height: 18,
    matrix: { a: 1, b: 0, c: 0, d: 1, e: 10, f: index * 20 },
    text: 'Row ' + index,
    family: 'Inter',
    size: 13,
    weight: 400,
    italic: false,
    letterSpacing: 0,
    lineHeight: null,
    wrap: true,
    textCase: 'ORIGINAL',
    align: 'LEFT',
    verticalAlign: 'TOP',
    color: '#111111',
    alpha: 1,
    runs: [],
    clip: null,
    ...overrides,
  };
}

/**
 * A page model around the given boxes.
 * @param texts the text boxes.
 * @param overrides fields to replace.
 * @returns the model.
 */
function model(texts, overrides = {}) {
  return { width: 400, height: 900, svg: SHAPES, texts, families: ['Inter'], ...overrides };
}

test('AC-SVG-001: the page is one self-contained document with shapes and text boxes', async () => {
  const html = (await buildSvgViewerHtml({ title: 'Card', model: model([box(0), box(1)]) })).toString('utf8');
  assert.ok(html.startsWith('<!doctype html>'));
  assert.match(html, /<svg /);
  assert.equal((html.match(/class="t"/g) ?? []).length, 2);
  assert.match(html, /default-src 'none'/);
  assert.match(html, /font-src data:/);
  assert.ok(!/<script[^>]+src=/.test(html), 'the page must not load a script');
  assert.ok(!/src="https?:/.test(html) && !/href="https?:/.test(html) && !/url\(https?:/.test(html), 'the page must not reference a network address');
  assert.ok(!html.includes('<text'), 'the shapes must carry no text elements');
});

test('AC-SVG-002: the page stays under 5 MB and embeds only the used family', async () => {
  const texts = [];
  for (let index = 0; index < 420; index += 1) {
    texts.push(box(index, { text: ('Row ' + index + ' ').padEnd(180, 'x') }));
  }
  const html = (await buildSvgViewerHtml({ title: 'Big card', model: model(texts) })).toString('utf8');
  assert.ok(html.length < 5_000_000, 'the page is ' + html.length + ' characters');
  assert.equal((html.match(/@font-face/g) ?? []).length, 5, 'only the Inter faces should travel');
  assert.ok(!html.includes('Roboto'), 'an unused family must not travel');
  assert.ok(!html.includes('Noto Naskh Arabic'), 'an unused family must not travel');
});

test('AC-SVG-005: a rotated box keeps its transform, and markup in the text is escaped', async () => {
  const radians = (30 * Math.PI) / 180;
  const rotation = { a: Math.cos(radians), b: Math.sin(radians), c: -Math.sin(radians), d: Math.cos(radians), e: 40, f: 200 };
  const html = (await buildSvgViewerHtml({
    title: 'Rotated',
    model: model([box(0, { matrix: rotation, text: '</script><script>alert(1)</script>' })]),
  })).toString('utf8');
  assert.match(html, /transform:matrix\(0\.866\d*,\s*0\.49\d*,\s*-0\.49\d*,/);
  assert.ok(html.includes(',40,200)'), 'the box must land at its transformed origin');
  assert.ok(!html.includes('<script>alert'), 'the text must not open a script element');
  assert.ok(html.includes('&lt;script&gt;'), 'the text must be escaped');
});

test('CASE-SVG-001: clipped text sits inside a wrapper at the clipping box', async () => {
  const html = (await buildSvgViewerHtml({
    title: 'Clipped',
    model: model([box(0, { matrix: { a: 1, b: 0, c: 0, d: 1, e: 30, f: 50 }, clip: { x: 20, y: 40, width: 200, height: 100 } })]),
  })).toString('utf8');
  assert.match(html, /overflow:hidden/);
  assert.match(html, /transform:matrix\(1,0,0,1,10,10\)/);
});

test('AC-SVG-009: two touch pointers pinch the page and one finger pans after it', async () => {
  const html = (await buildSvgViewerHtml({ title: 'Pinch', model: model([box(0)], { families: [] }) })).toString('utf8');
  const dom = new JSDOM(html, { pretendToBeVisual: true, runScripts: 'dangerously', url: 'http://localhost/' });
  const { window } = dom;
  const host = window.document.getElementById('dsh-mockup');
  const stage = window.document.getElementById('dsh-stage');
  const pan = window.document.getElementById('dsh-pan');
  const fitted = Number(stage.style.zoom);
  const captured = new Set();
  window.HTMLElement.prototype.setPointerCapture = (id) => captured.add(id);
  window.HTMLElement.prototype.hasPointerCapture = (id) => captured.has(id);
  window.HTMLElement.prototype.releasePointerCapture = (id) => captured.delete(id);
  const pointer = (type, id, x, y) => {
    const event = new window.MouseEvent(type, { bubbles: true, cancelable: true, button: 0, clientX: x, clientY: y });
    Object.defineProperty(event, 'pointerId', { value: id });
    Object.defineProperty(event, 'pointerType', { value: 'touch' });
    host.dispatchEvent(event);
  };
  try {
    pointer('pointerdown', 1, 400, 400);
    pointer('pointerdown', 2, 500, 400);
    pointer('pointermove', 1, 350, 400);
    pointer('pointermove', 2, 550, 400);
    const pinched = Number(stage.style.zoom);
    assert.ok(pinched > fitted * 1.5, 'two fingers did not zoom: ' + fitted + ' -> ' + pinched);
    pointer('pointerup', 2, 550, 400);
    const beforePan = pan.style.transform;
    pointer('pointermove', 1, 400, 430);
    assert.notEqual(pan.style.transform, beforePan, 'one finger did not pan after the pinch');
  } finally {
    dom.window.close();
  }
});
