/** The page model a design export hands the SVG viewer, and its validator. */

/** One run of text with its own style, inside a text box. */
export interface SvgTextRun {
  text: string;
  size: number;
  weight: number;
  italic: boolean;
  letterSpacing: number;
  color: string;
  alpha: number;
}

/** The box of a clipping ancestor, in canvas coordinates. */
export interface SvgClip {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** An affine transform, in the order CSS matrix() takes. */
export interface SvgMatrix {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
}

/** One text node placed on the page, in canvas coordinates. */
export interface SvgTextBox {
  /** The node's own box, before its transform. */
  width: number;
  height: number;
  /** Maps the box's local coordinates to page coordinates. */
  matrix: SvgMatrix;
  text: string;
  family: string;
  size: number;
  weight: number;
  italic: boolean;
  letterSpacing: number;
  /** The explicit line height in pixels, or null for the font's own. */
  lineHeight: number | null;
  /** Whether the engine wraps this text at its width, or draws one line that overflows. */
  wrap: boolean;
  textCase: 'ORIGINAL' | 'UPPER' | 'LOWER' | 'TITLE';
  align: 'LEFT' | 'CENTER' | 'RIGHT' | 'JUSTIFIED';
  verticalAlign: 'TOP' | 'CENTER' | 'BOTTOM';
  color: string;
  alpha: number;
  /** Style runs, when the text is not one style. */
  runs: readonly SvgTextRun[];
  /** The box of the nearest clipping ancestor, when the text can be cut. */
  clip: SvgClip | null;
}

/** Everything the viewer page needs: the shapes and the text. */
export interface SvgPageModel {
  width: number;
  height: number;
  /** The engine's SVG with every text element removed. */
  svg: string;
  texts: readonly SvgTextBox[];
  /** The families the design uses, so only those faces travel. */
  families: readonly string[];
}

const ALIGNS: ReadonlySet<string> = new Set(['LEFT', 'CENTER', 'RIGHT', 'JUSTIFIED']);
const VERTICAL_ALIGNS: ReadonlySet<string> = new Set(['TOP', 'CENTER', 'BOTTOM']);
const TEXT_CASES: ReadonlySet<string> = new Set(['ORIGINAL', 'UPPER', 'LOWER', 'TITLE']);

/**
 * Tell a field map from an unknown value.
 * @param value the value.
 * @returns its fields, or null.
 */
function fieldsOf(value: unknown): Record<string, unknown> | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  return { ...value };
}

/**
 * Tell one run from an unknown value.
 * @param value the value.
 * @returns whether it is a run.
 */
function isRun(value: unknown): boolean {
  const run = fieldsOf(value);
  return (
    run !== null &&
    typeof run['text'] === 'string' &&
    typeof run['size'] === 'number' &&
    typeof run['weight'] === 'number' &&
    typeof run['italic'] === 'boolean' &&
    typeof run['letterSpacing'] === 'number' &&
    typeof run['color'] === 'string' &&
    typeof run['alpha'] === 'number'
  );
}

/**
 * Tell one text box from an unknown value.
 * @param value the value.
 * @returns whether it is a text box.
 */
function isTextBox(value: unknown): boolean {
  const box = fieldsOf(value);
  if (box === null) return false;
  const numbers = ['width', 'height', 'size', 'weight', 'letterSpacing', 'alpha'];
  if (!numbers.every((key) => typeof box[key] === 'number')) return false;
  const matrix = fieldsOf(box['matrix']);
  if (matrix === null) return false;
  if (!['a', 'b', 'c', 'd', 'e', 'f'].every((key) => typeof matrix[key] === 'number')) return false;
  const strings = ['text', 'family', 'color'];
  if (!strings.every((key) => typeof box[key] === 'string')) return false;
  if (typeof box['italic'] !== 'boolean') return false;
  if (box['lineHeight'] !== null && typeof box['lineHeight'] !== 'number') return false;
  if (typeof box['wrap'] !== 'boolean') return false;
  if (typeof box['textCase'] !== 'string' || !TEXT_CASES.has(box['textCase'])) return false;
  if (typeof box['align'] !== 'string' || !ALIGNS.has(box['align'])) return false;
  if (typeof box['verticalAlign'] !== 'string' || !VERTICAL_ALIGNS.has(box['verticalAlign'])) return false;
  if (!Array.isArray(box['runs']) || !box['runs'].every(isRun)) return false;
  return box['clip'] === null || fieldsOf(box['clip']) !== null;
}

/**
 * Tell a page model from an unknown value read from the worker.
 * @param value the parsed response.
 * @returns whether it is a page model.
 */
export function isSvgPageModel(value: unknown): value is SvgPageModel {
  const fields = fieldsOf(value);
  if (fields === null) return false;
  if (typeof fields['width'] !== 'number' || typeof fields['height'] !== 'number') return false;
  if (typeof fields['svg'] !== 'string') return false;
  const texts = fields['texts'];
  const families = fields['families'];
  if (!Array.isArray(texts) || !texts.every(isTextBox)) return false;
  return Array.isArray(families) && families.every((family: unknown) => typeof family === 'string');
}
