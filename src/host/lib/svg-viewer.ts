import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { escapeHtml } from '../../render.js';
import { BUNDLED_FACES } from './assets.js';
import type { SvgPageModel, SvgTextBox, SvgTextRun } from './svg-model.js';

/** Where the build writes the bundled faces. */
const ASSET_ROOT = fileURLToPath(new URL('../../../assets/', import.meta.url));
/**
 * What the page may do: lay itself out with inline styles, load the faces it carries, and
 * run its own fit and pan script. Nothing is fetched, and nothing may be framed.
 */
const CSP =
  "default-src 'none'; style-src 'unsafe-inline'; font-src data:; img-src data:; script-src 'unsafe-inline'";

/** The weight each bundled style name stands for. */
const WEIGHTS: Readonly<Record<string, number>> = {
  Regular: 400,
  Medium: 500,
  SemiBold: 600,
  Bold: 700,
  ExtraBold: 800,
};

/** One face, read and encoded once for every export. */
interface PackedFace {
  family: string;
  weight: number;
  format: string;
  mime: string;
  data: string;
}

let faces: Promise<ReadonlyArray<PackedFace>> | undefined;

/**
 * Read every bundled face the page could need. Each file is read once per process.
 * @returns the packed faces.
 */
function packedFaces(): Promise<ReadonlyArray<PackedFace>> {
  faces ??= Promise.all(
    BUNDLED_FACES.map(async (face): Promise<PackedFace> => {
      const bytes = await fs.readFile(path.join(ASSET_ROOT, face.file));
      const woff2 = face.file.endsWith('.woff2');
      return {
        family: face.family,
        weight: WEIGHTS[face.style] ?? 400,
        format: woff2 ? 'woff2' : 'truetype',
        mime: woff2 ? 'font/woff2' : 'font/ttf',
        data: bytes.toString('base64'),
      };
    }),
  );
  return faces;
}

/**
 * The face rules for the families a design uses.
 * @param packed the packed faces.
 * @param families the families the design uses.
 * @returns the CSS.
 */
function faceCss(packed: ReadonlyArray<PackedFace>, families: readonly string[]): string {
  return packed
    .filter((face) => families.includes(face.family))
    .map(
      (face) =>
        '@font-face{font-family:' + quote(face.family) + ';font-style:normal;font-weight:' + face.weight +
        ";src:url(data:" + face.mime + ';base64,' + face.data + ") format('" + face.format + "')}",
    )
    .join('');
}

/**
 * A CSS string literal that cannot end the attribute it sits in.
 * @param value the text.
 * @returns the quoted value, with single quotes removed.
 */
function quote(value: string): string {
  return "'" + value.replace(/'/g, '') + "'";
}

/**
 * A colour as CSS, with a separate alpha.
 * @param color the hex colour.
 * @param alpha the alpha, 0 to 1.
 * @returns the CSS colour.
 */
function paint(color: string, alpha: number): string {
  if (alpha >= 0.999) return color;
  const value = Number.parseInt(color.slice(1), 16);
  const red = (value >> 16) & 0xff;
  const green = (value >> 8) & 0xff;
  const blue = value & 0xff;
  return 'rgba(' + red + ',' + green + ',' + blue + ',' + alpha.toFixed(3) + ')';
}

/**
 * The CSS transform for a text case.
 * @param textCase the node's case.
 * @returns the CSS value, or undefined when the text keeps its case.
 */
function textTransform(textCase: SvgTextBox['textCase']): string | undefined {
  if (textCase === 'UPPER') return 'uppercase';
  if (textCase === 'LOWER') return 'lowercase';
  if (textCase === 'TITLE') return 'capitalize';
  return undefined;
}

/**
 * The CSS text alignment for a node's alignment.
 * @param align the alignment.
 * @returns the CSS value.
 */
function textAlign(align: SvgTextBox['align']): string {
  if (align === 'CENTER') return 'center';
  if (align === 'RIGHT') return 'right';
  if (align === 'JUSTIFIED') return 'justify';
  return 'left';
}

/**
 * The inline style of one text box.
 * @param box the box.
 * @param offsetX the clipping wrapper's left edge, subtracted from the transform.
 * @param offsetY the clipping wrapper's top edge, subtracted from the transform.
 * @returns the style text.
 */
function boxStyle(box: SvgTextBox, offsetX: number, offsetY: number): string {
  const matrix = box.matrix;
  const transform = [matrix.a, matrix.b, matrix.c, matrix.d, matrix.e - offsetX, matrix.f - offsetY].join(',');
  const parts = [
    'position:absolute',
    'left:0',
    'top:0',
    'width:' + box.width + 'px',
    'height:' + box.height + 'px',
    'transform-origin:0 0',
    'transform:matrix(' + transform + ')',
    'font-family:' + quote(box.family) + ',Inter,sans-serif',
    'font-size:' + box.size + 'px',
    'font-weight:' + box.weight,
    'font-style:' + (box.italic ? 'italic' : 'normal'),
    'line-height:' + (box.lineHeight === null ? 'normal' : box.lineHeight + 'px'),
    'letter-spacing:' + box.letterSpacing + 'px',
    'color:' + paint(box.color, box.alpha),
    'text-align:' + textAlign(box.align),
    'white-space:' + (box.wrap ? 'pre-wrap' : 'pre'),
    'overflow:visible',
  ];
  const textCaseCss = textTransform(box.textCase);
  if (textCaseCss !== undefined) parts.push('text-transform:' + textCaseCss);
  if (box.verticalAlign === 'CENTER') parts.push('display:flex', 'align-items:center');
  else if (box.verticalAlign === 'BOTTOM') parts.push('display:flex', 'align-items:flex-end');
  return parts.join(';');
}

/**
 * One style run as a span.
 * @param run the run.
 * @returns the markup.
 */
function runHtml(run: SvgTextRun): string {
  const style = [
    'font-size:' + run.size + 'px',
    'font-weight:' + run.weight,
    'font-style:' + (run.italic ? 'italic' : 'normal'),
    'letter-spacing:' + run.letterSpacing + 'px',
    'color:' + paint(run.color, run.alpha),
  ].join(';');
  return '<span style="' + escapeHtml(style) + '">' + escapeHtml(run.text) + '</span>';
}

/**
 * One text box as markup, inside its clipping ancestor when it has one.
 * @param box the box.
 * @returns the markup.
 */
function boxHtml(box: SvgTextBox): string {
  const inner = box.runs.length === 0
    ? escapeHtml(box.text)
    : box.runs.map(runHtml).join('');
  const clip = box.clip;
  if (clip === null) return '<div class="t" style="' + escapeHtml(boxStyle(box, 0, 0)) + '">' + inner + '</div>';
  const wrapper = [
    'position:absolute',
    'left:' + clip.x + 'px',
    'top:' + clip.y + 'px',
    'width:' + clip.width + 'px',
    'height:' + clip.height + 'px',
    'overflow:hidden',
  ].join(';');
  return '<div style="' + escapeHtml(wrapper) + '"><div class="t" style="' + escapeHtml(boxStyle(box, clip.x, clip.y)) + '">' + inner + '</div></div>';
}

/**
 * The page script: fit the stage to the window, pan with a drag or a plain wheel, and
 * zoom about the pointer with Ctrl or Cmd wheel. A left drag that starts on a text box
 * selects text instead of panning, because the page exists to be read and copied.
 * @param width the stage width.
 * @param height the stage height.
 * @returns the script body.
 */
function pageScript(width: number, height: number): string {
  return `
const host = document.getElementById('dsh-mockup');
const pan = document.getElementById('dsh-pan');
const stage = document.getElementById('dsh-stage');
const W = ${width};
const H = ${height};
let zoom = 1, panX = 0, panY = 0, touched = false, space = false;
// The stage is fitted with CSS zoom, not a scaled transform: Chromium's drag
// selection misfires on transform-scaled text at some fit scales, and the page
// exists to be read and copied. Panning is a translate on the wrapper outside it.
const apply = () => { pan.style.transform = 'translate(' + panX + 'px,' + panY + 'px)'; stage.style.zoom = String(zoom); };
const fit = () => {
  zoom = Math.min(window.innerWidth / W, window.innerHeight / H);
  panX = (window.innerWidth - W * zoom) / 2;
  panY = (window.innerHeight - H * zoom) / 2;
  apply();
};
fit();
window.addEventListener('resize', () => { if (!touched) fit(); });
// A text box is a hit target across its whole node box, which is wider and taller
// than the painted lines. Only a press on a painted line belongs to text selection;
// a press on the empty part of the box still pans.
const onText = (event) => {
  const target = event.target;
  if (!(target instanceof Element)) return false;
  const box = target.closest('.t');
  if (box === null) return false;
  const range = document.createRange();
  range.selectNodeContents(box);
  const x = event.clientX, y = event.clientY;
  return [...range.getClientRects()].some((rect) => x >= rect.left - 1 && x <= rect.right + 1 && y >= rect.top - 1 && y <= rect.bottom + 1);
};
// The page fits scaled text, where Chromium's own drag sometimes moves a caret
// instead of extending a selection. Drive the selection from the caret position
// instead, so a drag over glyphs always selects them.
const caretAt = (x, y) => {
  if (document.caretRangeFromPoint) return document.caretRangeFromPoint(x, y);
  const position = document.caretPositionFromPoint ? document.caretPositionFromPoint(x, y) : null;
  if (position === null) return null;
  const range = document.createRange();
  range.setStart(position.offsetNode, position.offset);
  range.collapse(true);
  return range;
};
const inText = (range) => range !== null && range.startContainer.parentElement !== null && range.startContainer.parentElement.closest('.t') !== null;
let selecting = null;
const extendSelection = (event) => {
  const focus = caretAt(event.clientX, event.clientY);
  if (!inText(focus)) return;
  window.getSelection().setBaseAndExtent(selecting.node, selecting.offset, focus.startContainer, focus.startOffset);
};
const selectWord = (caret) => {
  const text = caret.startContainer.textContent === null ? '' : caret.startContainer.textContent;
  let start = caret.startOffset;
  let end = caret.startOffset;
  while (start > 0 && text[start - 1].trim() !== '') start -= 1;
  while (end < text.length && text[end].trim() !== '') end += 1;
  window.getSelection().setBaseAndExtent(caret.startContainer, start, caret.startContainer, end);
};
const selectBox = (box) => {
  const range = document.createRange();
  range.selectNodeContents(box);
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
};
// The browser's click counter is lost once a press is cancelled, so count the
// presses here: two select a word, three select the whole text box.
let lastPress = { time: 0, x: 0, y: 0, count: 0 };
const pressCount = (event) => {
  const near = Math.abs(event.clientX - lastPress.x) <= 4 && Math.abs(event.clientY - lastPress.y) <= 4;
  const quick = event.timeStamp - lastPress.time <= 400;
  lastPress = { time: event.timeStamp, x: event.clientX, y: event.clientY, count: near && quick ? lastPress.count + 1 : 1 };
  return lastPress.count;
};
let drag = null;
host.addEventListener('pointerdown', (event) => {
  if (event.button !== 0 && event.button !== 1) return;
  if (event.button === 0 && !space && onText(event)) {
    if (event.altKey) return;
    const caret = caretAt(event.clientX, event.clientY);
    if (!inText(caret)) return;
    // A Shift click extends the current selection from its fixed end.
    if (event.shiftKey) {
      const selection = window.getSelection();
      if (selection === null || selection.rangeCount === 0 || selection.anchorNode === null) return;
      event.preventDefault();
      selection.setBaseAndExtent(selection.anchorNode, selection.anchorOffset, caret.startContainer, caret.startOffset);
      return;
    }
    event.preventDefault();
    const count = pressCount(event);
    if (count >= 3) {
      const box = event.target.closest('.t');
      if (box !== null) selectBox(box);
      return;
    }
    if (count === 2) {
      selectWord(caret);
      return;
    }
    selecting = { node: caret.startContainer, offset: caret.startOffset };
    window.getSelection().setBaseAndExtent(selecting.node, selecting.offset, selecting.node, selecting.offset);
    host.setPointerCapture(event.pointerId);
    return;
  }
  event.preventDefault();
  const selection = window.getSelection();
  if (selection !== null) selection.removeAllRanges();
  touched = true;
  drag = { x: event.clientX - panX, y: event.clientY - panY };
  host.setPointerCapture(event.pointerId);
  host.style.cursor = 'grabbing';
});
host.addEventListener('pointermove', (event) => {
  if (selecting !== null) {
    extendSelection(event);
    return;
  }
  if (drag === null) return;
  panX = event.clientX - drag.x;
  panY = event.clientY - drag.y;
  apply();
});
const end = (event) => { drag = null; selecting = null; host.style.cursor = space ? 'grabbing' : 'grab'; if (host.hasPointerCapture(event.pointerId)) host.releasePointerCapture(event.pointerId); };
host.addEventListener('pointerup', end);
host.addEventListener('pointercancel', end);
window.addEventListener('keydown', (event) => {
  if (event.code !== 'Space' || space) return;
  space = true;
  host.style.cursor = 'grabbing';
});
window.addEventListener('keyup', (event) => {
  if (event.code !== 'Space') return;
  space = false;
  host.style.cursor = drag === null ? 'grab' : 'grabbing';
});
window.addEventListener('blur', () => { space = false; host.style.cursor = drag === null ? 'grab' : 'grabbing'; });
host.addEventListener('wheel', (event) => {
  event.preventDefault();
  touched = true;
  if (event.ctrlKey || event.metaKey) {
    const rect = host.getBoundingClientRect();
    const next = Math.min(8, Math.max(0.02, zoom * (event.deltaY < 0 ? 1.1 : 1 / 1.1)));
    const mx = event.clientX - rect.left;
    const my = event.clientY - rect.top;
    panX = mx - (mx - panX) * (next / zoom);
    panY = my - (my - panY) * (next / zoom);
    zoom = next;
  } else {
    panX -= event.deltaX;
    panY -= event.deltaY;
  }
  apply();
}, { passive: false });
`;
}

/**
 * Build the offline page for one saved scene: the engine's shapes, the text as real
 * HTML, and only the faces the design uses.
 * @param input the artifact title and the page model.
 * @returns the HTML file.
 */
export async function buildSvgViewerHtml(input: { title: string; model: SvgPageModel }): Promise<Buffer> {
  const model = input.model;
  const faces = faceCss(await packedFaces(), model.families);
  const base = [
    'html,body{margin:0;height:100%;overflow:hidden;background:#fff}',
    '#dsh-mockup{position:fixed;inset:0;overflow:hidden;background:#fff;cursor:grab;touch-action:none}',
    '#dsh-pan{position:absolute;left:0;top:0;transform-origin:0 0}',
    '#dsh-stage{position:absolute;left:0;top:0;transform-origin:0 0;width:' + model.width + 'px;height:' + model.height + 'px}',
    '#dsh-stage svg{display:block}',
    '.t{margin:0;cursor:text;user-select:text;-webkit-user-select:text}',
  ].join('');
  const html = [
    '<!doctype html>',
    '<html>',
    '<head>',
    '<meta charset="utf-8">',
    '<meta http-equiv="content-security-policy" content="' + CSP + '">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    '<title>' + escapeHtml(input.title) + '</title>',
    '<style>' + faces + base + '</style>',
    '</head>',
    '<body>',
    '<div id="dsh-mockup"><div id="dsh-pan"><div id="dsh-stage">' + model.svg + model.texts.map(boxHtml).join('') + '</div></div></div>',
    '<script>' + pageScript(model.width, model.height) + '</script>',
    '</body>',
    '</html>',
    '',
  ].join('\n');
  return Buffer.from(html, 'utf8');
}
