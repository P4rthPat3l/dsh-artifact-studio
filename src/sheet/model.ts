/**
 * The sheet artifact model: a small, engine-neutral workbook JSON that both
 * the host and the panel parse, validate, and render. It has no dependency on
 * a spreadsheet library, so the stored content stays readable by the agent and
 * survives a future editor swap.
 *
 * Shape:
 *   {
 *     "schemaVersion": 1,
 *     "sheets": [
 *       {
 *         "name": "Budget",
 *         "cells": {
 *           "A1": "Item",
 *           "B2": 1200,
 *           "C2": "=B2*1.2",
 *           "A1:H1": { "style": { "bold": true } }
 *         },
 *         "columnWidths": { "A": 160 }
 *       }
 *     ]
 *   }
 *
 * A cell value is written as a plain JSON scalar for readability. A leading
 * "=" in a string means a formula; use { "value": "=literal" } for text that
 * starts with "=". A styled or formula cell uses the object form.
 */

/** The one supported schema version. */
export const SHEET_SCHEMA_VERSION = 1;

/** Bounds that keep one sheet artifact fast enough for the panel and the host. */
export const SHEET_LIMITS = {
  maxSheets: 20,
  maxRows: 5000,
  maxColumns: 100,
  maxCells: 20000,
  maxFormulaCells: 5000,
  maxCellText: 10000,
  maxFormula: 2000,
  maxName: 31,
  minColumnWidth: 24,
  maxColumnWidth: 800,
  defaultColumnWidth: 96,
  defaultRowHeight: 28,
  maxRowHeight: 400,
  maxOperations: 200,
  maxOperationCells: 4000,
  maxEvaluationCells: 200000,
  maxSelectionQuote: 1500,
  maxReadCells: 500,
  maxMerges: 200,
} as const;

/** A scalar a cell can hold. */
export type SheetScalar = string | number | boolean | null;

/** How a number is shown in the panel, a print copy, or CSV. */
export type NumberFormat = 'general' | 'number' | 'integer' | 'currency' | 'percent' | 'date';

/** Horizontal alignment of a cell. */
export type HorizontalAlign = 'left' | 'center' | 'right';

/** Presentation of one cell. It never changes the stored value. */
export interface SheetStyle {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  align?: HorizontalAlign;
  /** A hex text color such as "#1f2933". */
  color?: string;
  /** A hex fill color such as "#f3f4f6". */
  background?: string;
  numberFormat?: NumberFormat;
  /** Wrap the text to the cell width, which grows its row. */
  wrap?: boolean;
}

/** A style update. A null value removes one property. */
export type SheetStylePatch = {
  [K in keyof SheetStyle]?: SheetStyle[K] | null;
};

/** One stored cell. A formula cell has no stored value; it is computed on read. */
export interface SheetCell {
  value?: Exclude<SheetScalar, null>;
  formula?: string;
  style?: SheetStyle;
}

/** One sheet in a workbook. Cell keys are canonical A1 references. */
export interface SheetData {
  name: string;
  cells: Record<string, SheetCell>;
  /** Column letter to pixel width. Omitted widths use the default. */
  columnWidths?: Record<string, number>;
  /**
   * Merged ranges such as "A1:C1". Only the top-left cell of a range holds a
   * shown value; the rest stay stored but covered.
   */
  merges?: string[];
}

/** The complete stored workbook. */
export interface SheetWorkbook {
  schemaVersion: 1;
  sheets: SheetData[];
}

/** A failure the caller can show or wrap: invalid JSON, an invalid cell, a bad operation. */
export class SheetError extends Error {
  readonly code: 'sheet/invalid' | 'sheet/operation';

  constructor(message: string, code: 'sheet/invalid' | 'sheet/operation' = 'sheet/invalid') {
    super(message);
    this.name = 'SheetError';
    this.code = code;
  }
}

/** A zero-based cell position. */
export interface CellIndex {
  row: number;
  column: number;
}

/** An inclusive cell range. The corners are already normalised. */
export interface CellRange {
  row1: number;
  column1: number;
  row2: number;
  column2: number;
}

const REF = /^\$?([A-Za-z]{1,3})\$?([1-9][0-9]{0,6})$/;
const COLUMN = /^[A-Za-z]{1,3}$/;
const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;
const BAD_SHEET_NAME = /[\\/?*[\]:]/;
const NUMBER_FORMATS: readonly NumberFormat[] = ['general', 'number', 'integer', 'currency', 'percent', 'date'];
const ALIGNS: readonly HorizontalAlign[] = ['left', 'center', 'right'];

const STYLE_KEYS = ['bold', 'italic', 'underline', 'strike', 'align', 'color', 'background', 'numberFormat', 'wrap'] as const;
const CELL_KEYS = ['value', 'formula', 'style'] as const;
const SHEET_KEYS = ['name', 'cells', 'columnWidths', 'merges'] as const;
const WORKBOOK_KEYS = ['schemaVersion', 'sheets'] as const;

function isFields(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Refuse an unknown key so a typo cannot be silently dropped from a saved sheet.
 * @param value the object.
 * @param allowed the keys it may have.
 * @param at the field path for the message.
 */
function onlyKeys(value: Record<string, unknown>, allowed: readonly string[], at: string): void {
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) {
      throw new SheetError(at + ' has an unknown field "' + key + '". Use ' + allowed.join(', ') + '.');
    }
  }
}

/**
 * A column index as spreadsheet letters.
 * @param column the zero-based column.
 * @returns the letters.
 */
export function columnName(column: number): string {
  if (!Number.isInteger(column) || column < 0) throw new SheetError('A column index must be a non-negative integer.');
  let value = column + 1;
  let name = '';
  while (value > 0) {
    const remainder = (value - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    value = Math.floor((value - 1) / 26);
  }
  return name;
}

/**
 * The zero-based column index of letters.
 * @param name the column letters.
 * @returns the index, or undefined when the name is not a column.
 */
export function columnIndex(name: string): number | undefined {
  if (!COLUMN.test(name)) return undefined;
  let value = 0;
  for (const letter of name.toUpperCase()) value = value * 26 + (letter.charCodeAt(0) - 64);
  const index = value - 1;
  return index < SHEET_LIMITS.maxColumns ? index : undefined;
}

/**
 * Read a cell reference.
 * @param ref a reference such as A1 or $B$12.
 * @returns the position, or undefined when out of bounds.
 */
export function parseCellRef(ref: string): CellIndex | undefined {
  const match = REF.exec(ref.trim());
  if (match === null) return undefined;
  const column = columnIndex(match[1] ?? '');
  const row = Number(match[2]);
  if (column === undefined || !Number.isInteger(row) || row < 1 || row > SHEET_LIMITS.maxRows) return undefined;
  return { row, column };
}

/**
 * Format a zero-based cell position as a reference.
 * @param row the one-based row.
 * @param column the zero-based column.
 * @returns the reference.
 */
export function formatCellRef(row: number, column: number): string {
  return columnName(column) + String(row);
}

/**
 * Read an inclusive range such as A1:C4.
 * @param range the range text.
 * @returns the normalised range, or undefined when malformed.
 */
export function parseRangeRef(range: string): CellRange | undefined {
  const parts = range.trim().split(':');
  if (parts.length !== 2) return undefined;
  const start = parseCellRef(parts[0] ?? '');
  const end = parseCellRef(parts[1] ?? '');
  if (start === undefined || end === undefined) return undefined;
  return {
    row1: Math.min(start.row, end.row),
    column1: Math.min(start.column, end.column),
    row2: Math.max(start.row, end.row),
    column2: Math.max(start.column, end.column),
  };
}

/**
 * Format a range.
 * @param range the range.
 * @returns the text form.
 */
export function formatRangeRef(range: CellRange): string {
  return formatCellRef(range.row1, range.column1) + ':' + formatCellRef(range.row2, range.column2);
}

/** How many cells a range covers. */
export function rangeSize(range: CellRange): number {
  return (range.row2 - range.row1 + 1) * (range.column2 - range.column1 + 1);
}

/**
 * Iterate every cell of a range, row by row.
 * @param range the range.
 * @returns the positions.
 */
export function rangeCells(range: CellRange): CellIndex[] {
  const cells: CellIndex[] = [];
  for (let row = range.row1; row <= range.row2; row += 1) {
    for (let column = range.column1; column <= range.column2; column += 1) cells.push({ row, column });
  }
  return cells;
}

export function checkSheetName(raw: unknown, at = 'The sheet name'): string {
  if (typeof raw !== 'string') throw new SheetError(at + ' must be a string.');
  const name = raw.trim();
  if (name === '' || name.length > SHEET_LIMITS.maxName) {
    throw new SheetError(at + ' must be 1 to ' + String(SHEET_LIMITS.maxName) + ' characters.');
  }
  if (BAD_SHEET_NAME.test(name)) throw new SheetError(at + ' cannot contain \\ / ? * [ ] or : characters.');
  if (name.startsWith("'") || name.endsWith("'")) throw new SheetError(at + " cannot start or end with an apostrophe.");
  return name;
}

function checkColor(raw: unknown, at: string): string {
  if (typeof raw !== 'string' || !HEX.test(raw.trim())) {
    throw new SheetError(at + ' must be a hex color such as #1f2933.');
  }
  const color = raw.trim().toLowerCase();
  if (color.length === 4) return '#' + color[1] + color[1] + color[2] + color[2] + color[3] + color[3];
  return color;
}

/**
 * Read a normalised hex color as RGB channels.
 * @param value a hex color such as #1f2933.
 * @returns the channels, or undefined for an unreadable value.
 */
function hexChannels(value: string): [number, number, number] | undefined {
  const text = value.trim().toLowerCase();
  const match = /^#?([0-9a-f]{6})$/.exec(text);
  if (match === null) return undefined;
  const hex = match[1] ?? '';
  return [Number.parseInt(hex.slice(0, 2), 16), Number.parseInt(hex.slice(2, 4), 16), Number.parseInt(hex.slice(4, 6), 16)];
}

/**
 * Relative luminance in sRGB, as used by WCAG contrast.
 * @param channels the RGB channels.
 * @returns the luminance from 0 to 1.
 */
function luminance(channels: [number, number, number]): number {
  const parts = channels.map((channel) => {
    const value = channel / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * (parts[0] ?? 0) + 0.7152 * (parts[1] ?? 0) + 0.0722 * (parts[2] ?? 0);
}

/**
 * Contrast between two colors, from 1 to 21.
 * @param foreground the text color.
 * @param background the fill color.
 * @returns the WCAG contrast ratio.
 */
export function contrastRatio(foreground: string, background: string): number {
  const front = hexChannels(foreground);
  const back = hexChannels(background);
  if (front === undefined || back === undefined) return 1;
  const bright = Math.max(luminance(front), luminance(back));
  const dark = Math.min(luminance(front), luminance(back));
  return (bright + 0.05) / (dark + 0.05);
}

/**
 * Pick a readable default text color for a cell fill. The panel and XLSX use
 * this when a style sets a background but leaves the text color implicit.
 * @param background the cell fill.
 * @returns the darker ink or white, whichever contrasts more.
 */
export function readableTextColor(background: string): '#1f2933' | '#ffffff' {
  const dark = '#1f2933';
  const light = '#ffffff';
  return contrastRatio(dark, background) >= contrastRatio(light, background) ? dark : light;
}

/**
 * The text color a renderer should use for one style. An explicit color wins
 * only when it is readable on the fill; a missing or low-contrast color falls
 * back to the automatic readable color. Stored content is never changed here.
 * @param style the cell style.
 * @returns the text color, or undefined when the theme default should apply.
 */
export function effectiveTextColor(style: SheetStyle | undefined): string | undefined {
  if (style === undefined) return undefined;
  if (style.background === undefined) return style.color;
  if (style.color !== undefined && contrastRatio(style.color, style.background) >= 4.5) return style.color;
  return readableTextColor(style.background);
}

function checkStyle(raw: unknown, at: string): SheetStyle {
  if (!isFields(raw)) throw new SheetError(at + ' must be an object.');
  onlyKeys(raw, STYLE_KEYS, at);
  const style: SheetStyle = {};
  for (const key of ['bold', 'italic', 'underline', 'strike', 'wrap'] as const) {
    const value = raw[key];
    if (value === undefined) continue;
    if (typeof value !== 'boolean') throw new SheetError(at + '.' + key + ' must be true or false.');
    style[key] = value;
  }
  if (raw.align !== undefined) {
    if (typeof raw.align !== 'string' || !ALIGNS.includes(raw.align as HorizontalAlign)) {
      throw new SheetError(at + '.align must be left, center, or right.');
    }
    style.align = raw.align as HorizontalAlign;
  }
  if (raw.numberFormat !== undefined) {
    if (typeof raw.numberFormat !== 'string' || !NUMBER_FORMATS.includes(raw.numberFormat as NumberFormat)) {
      throw new SheetError(at + '.numberFormat must be ' + NUMBER_FORMATS.join(', ') + '.');
    }
    style.numberFormat = raw.numberFormat as NumberFormat;
  }
  if (raw.color !== undefined) style.color = checkColor(raw.color, at + '.color');
  if (raw.background !== undefined) style.background = checkColor(raw.background, at + '.background');
  return style;
}

function styleIsEmpty(style: SheetStyle): boolean {
  return Object.keys(style).length === 0;
}

/**
 * Copy a style so a caller cannot mutate stored model state through it.
 * @param style the style.
 * @returns a copy.
 */
export function copyStyle(style: SheetStyle | undefined): SheetStyle | undefined {
  if (style === undefined) return undefined;
  return { ...style };
}

/**
 * Merge a partial style onto a cell style. A null value removes one property;
 * false removes a boolean style, and a null alignment or number format resets.
 * @param base the current style.
 * @param patch the keys to set, with null removing.
 * @returns the merged style, or undefined when it becomes empty.
 */
export function mergeStyle(base: SheetStyle | undefined, patch: SheetStylePatch): SheetStyle | undefined {
  const next: SheetStyle = { ...(base ?? {}) };
  const booleans = ['bold', 'italic', 'underline', 'strike', 'wrap'] as const;
  for (const key of booleans) {
    const value = patch[key];
    if (value === undefined) continue;
    if (value === null || value === false) delete next[key];
    else next[key] = true;
  }
  if (patch.align !== undefined) {
    if (patch.align === null) delete next.align;
    else next.align = patch.align;
  }
  if (patch.numberFormat !== undefined) {
    if (patch.numberFormat === null || patch.numberFormat === 'general') delete next.numberFormat;
    else next.numberFormat = patch.numberFormat;
  }
  if (patch.color !== undefined) {
    if (patch.color === null) delete next.color;
    else next.color = patch.color;
  }
  if (patch.background !== undefined) {
    if (patch.background === null) delete next.background;
    else next.background = patch.background;
  }
  return styleIsEmpty(next) ? undefined : next;
}

function checkScalar(raw: unknown, at: string): Exclude<SheetScalar, null> | undefined {
  if (raw === null || raw === undefined) return undefined;
  if (typeof raw === 'boolean') return raw;
  if (typeof raw === 'number') {
    if (!Number.isFinite(raw)) throw new SheetError(at + ' must be a finite number.');
    return raw;
  }
  if (typeof raw === 'string') {
    if (raw.length > SHEET_LIMITS.maxCellText) throw new SheetError(at + ' is longer than ' + String(SHEET_LIMITS.maxCellText) + ' characters.');
    return raw;
  }
  throw new SheetError(at + ' must be a string, number, boolean, or null.');
}

function normalizeCell(raw: unknown, at: string): SheetCell | undefined {
  if (raw === null) return undefined;
  if (typeof raw === 'string' || typeof raw === 'number' || typeof raw === 'boolean') {
    const value = checkScalar(raw, at);
    if (value === undefined) return undefined;
    if (typeof value === 'string' && value.startsWith('=')) return normalizeCell({ formula: value }, at);
    return { value };
  }
  if (!isFields(raw)) throw new SheetError(at + ' must be a JSON scalar or an object with value, formula, or style.');
  onlyKeys(raw, CELL_KEYS, at);
  const style = raw.style === undefined ? undefined : checkStyle(raw.style, at + '.style');
  const formula = raw.formula === undefined ? undefined : normalizeFormula(raw.formula, at + '.formula');
  if (formula !== undefined && raw.value !== undefined) {
    throw new SheetError(at + ' cannot have both value and formula; the value of a formula is computed.');
  }
  const value = checkScalar(raw.value, at + '.value');
  const cell: SheetCell = {};
  if (formula !== undefined) cell.formula = formula;
  if (value !== undefined) cell.value = value;
  if (style !== undefined && !styleIsEmpty(style)) cell.style = style;
  if (cell.formula === undefined && cell.value === undefined && cell.style === undefined) return undefined;
  return cell;
}

function normalizeFormula(raw: unknown, at: string): string {
  if (typeof raw !== 'string') throw new SheetError(at + ' must be a string formula.');
  let formula = raw.trim();
  if (formula === '' || formula === '=') throw new SheetError(at + ' is empty.');
  if (!formula.startsWith('=')) formula = '=' + formula;
  if (formula.length > SHEET_LIMITS.maxFormula) throw new SheetError(at + ' is longer than ' + String(SHEET_LIMITS.maxFormula) + ' characters.');
  return formula;
}

/**
 * Whether two ranges share at least one cell.
 * @param left the first range.
 * @param right the second range.
 * @returns whether they overlap.
 */
export function rangesOverlap(left: CellRange, right: CellRange): boolean {
  return left.row1 <= right.row2 && right.row1 <= left.row2 && left.column1 <= right.column2 && right.column1 <= left.column2;
}

/**
 * Validate the merged ranges of one sheet. Ranges are canonicalised, must cover
 * at least two cells, and may not overlap.
 * @param raw the stored value.
 * @param at the field path for a message.
 * @returns the canonical ranges in reading order, or undefined when empty.
 */
function normalizeMerges(raw: unknown, at: string): string[] | undefined {
  if (raw === undefined) return undefined;
  if (!Array.isArray(raw)) throw new SheetError(at + ' must be an array of ranges such as "A1:C1".');
  if (raw.length > SHEET_LIMITS.maxMerges) throw new SheetError(at + ' holds at most ' + String(SHEET_LIMITS.maxMerges) + ' merged ranges.');
  const ranges: CellRange[] = [];
  for (const entry of raw) {
    if (typeof entry !== 'string') throw new SheetError(at + ' must hold range text such as "A1:C1".');
    const range = parseRangeRef(entry);
    if (range === undefined) throw new SheetError(at + ' has an invalid range "' + entry + '".');
    if (rangeSize(range) < 2) throw new SheetError(at + ' has "' + entry + '", which covers one cell; a merge needs at least two.');
    if (range.row2 > SHEET_LIMITS.maxRows || range.column2 >= SHEET_LIMITS.maxColumns) {
      throw new SheetError(at + ' has "' + entry + '", which falls outside the sheet.');
    }
    if (ranges.some((other) => rangesOverlap(other, range))) throw new SheetError(at + ' has "' + entry + '", which overlaps another merged range.');
    ranges.push(range);
  }
  if (ranges.length === 0) return undefined;
  const sorted = [...ranges].sort((left, right) => (left.row1 - right.row1) || (left.column1 - right.column1));
  return sorted.map(formatRangeRef);
}

function normalizeWidths(raw: unknown, at: string): Record<string, number> | undefined {
  if (raw === undefined) return undefined;
  if (!isFields(raw)) throw new SheetError(at + ' must be an object of column letters to pixel widths.');
  const widths: Record<string, number> = {};
  for (const [key, value] of Object.entries(raw)) {
    const column = columnIndex(key);
    if (column === undefined) throw new SheetError(at + ' has an invalid column "' + key + '".');
    if (typeof value !== 'number' || !Number.isFinite(value) || !Number.isInteger(value)) {
      throw new SheetError(at + '.' + key + ' must be a whole number of pixels.');
    }
    if (value < SHEET_LIMITS.minColumnWidth || value > SHEET_LIMITS.maxColumnWidth) {
      throw new SheetError(at + '.' + key + ' must be between ' + String(SHEET_LIMITS.minColumnWidth) + ' and ' + String(SHEET_LIMITS.maxColumnWidth) + ' pixels.');
    }
    const name = columnName(column);
    if (widths[name] !== undefined) throw new SheetError(at + ' names column ' + name + ' twice.');
    widths[name] = value;
  }
  return Object.keys(widths).length === 0 ? undefined : widths;
}

/**
 * Validate an unknown value as a workbook and return a normalised copy.
 * @param value the parsed JSON or a constructed value.
 * @returns the workbook.
 */
export function normalizeSheetWorkbook(value: unknown): SheetWorkbook {
  if (!isFields(value)) throw new SheetError('A sheet workbook must be a JSON object.');
  onlyKeys(value, WORKBOOK_KEYS, 'The workbook');
  if (value.schemaVersion !== undefined && value.schemaVersion !== SHEET_SCHEMA_VERSION) {
    throw new SheetError('Unsupported sheet schemaVersion ' + String(value.schemaVersion) + '; this build reads version ' + String(SHEET_SCHEMA_VERSION) + '.');
  }
  const rawSheets = value.sheets;
  if (!Array.isArray(rawSheets) || rawSheets.length === 0) throw new SheetError('A sheet workbook needs a "sheets" array with at least one sheet.');
  if (rawSheets.length > SHEET_LIMITS.maxSheets) throw new SheetError('A workbook holds at most ' + String(SHEET_LIMITS.maxSheets) + ' sheets.');
  const names = new Set<string>();
  let totalCells = 0;
  let totalFormulas = 0;
  const sheets = rawSheets.map((rawSheet: unknown, sheetIndex): SheetData => {
    const at = 'sheets[' + String(sheetIndex) + ']';
    if (!isFields(rawSheet)) throw new SheetError(at + ' must be an object.');
    onlyKeys(rawSheet, SHEET_KEYS, at);
    const name = checkSheetName(rawSheet.name, at + '.name');
    if (names.has(name.toLowerCase())) throw new SheetError('Two sheets are named "' + name + '"; names must be unique.');
    names.add(name.toLowerCase());
    const rawCells = rawSheet.cells ?? {};
    if (!isFields(rawCells)) throw new SheetError(at + '.cells must be an object of cell references to values.');
    const cells: Record<string, SheetCell> = {};
    for (const [ref, rawCell] of Object.entries(rawCells)) {
      const index = parseCellRef(ref);
      if (index === undefined) throw new SheetError(at + '.cells has an invalid cell reference "' + ref + '".');
      const cell = normalizeCell(rawCell, at + '.cells.' + formatCellRef(index.row, index.column));
      if (cell === undefined) continue;
      totalCells += 1;
      if (cell.formula !== undefined) totalFormulas += 1;
      cells[formatCellRef(index.row, index.column)] = cell;
    }
    if (totalCells > SHEET_LIMITS.maxCells) throw new SheetError('A sheet artifact holds at most ' + String(SHEET_LIMITS.maxCells) + ' cells.');
    if (totalFormulas > SHEET_LIMITS.maxFormulaCells) throw new SheetError('A sheet artifact holds at most ' + String(SHEET_LIMITS.maxFormulaCells) + ' formulas.');
    const ordered: Record<string, SheetCell> = {};
    const refs = Object.keys(cells).sort((left, right) => {
      const a = parseCellRef(left);
      const b = parseCellRef(right);
      if (a === undefined || b === undefined) return left < right ? -1 : 1;
      return a.row === b.row ? a.column - b.column : a.row - b.row;
    });
    for (const ref of refs) {
      const cell = cells[ref];
      if (cell !== undefined) ordered[ref] = cell;
    }
    const columnWidths = normalizeWidths(rawSheet.columnWidths, at + '.columnWidths');
    const merges = normalizeMerges(rawSheet.merges, at + '.merges');
    return { name, cells: ordered, ...(columnWidths === undefined ? {} : { columnWidths }), ...(merges === undefined ? {} : { merges }) };
  });
  return { schemaVersion: SHEET_SCHEMA_VERSION, sheets };
}

/**
 * Parse the stored content into a workbook.
 * @param text the JSON source.
 * @returns the normalised workbook.
 */
export function parseSheetWorkbook(text: string): SheetWorkbook {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new SheetError('The sheet content is not valid JSON. Send one JSON object with schemaVersion and sheets.');
  }
  return normalizeSheetWorkbook(value);
}

function cellToJson(cell: SheetCell): unknown {
  const hasStyle = cell.style !== undefined && !styleIsEmpty(cell.style);
  if (!hasStyle) {
    if (cell.formula !== undefined) return { formula: cell.formula };
    // A literal string that starts with "=" must keep the object form, or the
    // reader would parse it back as a formula.
    if (typeof cell.value === 'string' && cell.value.startsWith('=')) return { value: cell.value };
    if (cell.value !== undefined) return cell.value;
    return null;
  }
  const out: Record<string, unknown> = {};
  if (cell.formula !== undefined) out.formula = cell.formula;
  else if (cell.value !== undefined) out.value = cell.value;
  out.style = styleToJson(cell.style);
  return out;
}

function styleToJson(style: SheetStyle | undefined): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (style === undefined) return out;
  for (const key of STYLE_KEYS) {
    const value = style[key];
    if (value !== undefined) out[key] = value;
  }
  return out;
}

/**
 * Serialise a workbook in canonical order. Stable ordering keeps a content hash
 * meaningful and makes an artifact diff easy to read.
 * @param workbook the workbook.
 * @returns the JSON text ending in a newline.
 */
export function serializeSheetWorkbook(workbook: SheetWorkbook): string {
  const sheets = workbook.sheets.map((sheet) => {
    const refs = Object.keys(sheet.cells).sort((left, right) => {
      const a = parseCellRef(left);
      const b = parseCellRef(right);
      if (a === undefined || b === undefined) return left < right ? -1 : 1;
      return a.row === b.row ? a.column - b.column : a.row - b.row;
    });
    const cells: Record<string, unknown> = {};
    for (const ref of refs) {
      const cell = sheet.cells[ref];
      if (cell === undefined) continue;
      const encoded = cellToJson(cell);
      if (encoded === null) continue;
      cells[ref] = encoded;
    }
    const data: Record<string, unknown> = { name: sheet.name, cells };
    if (sheet.columnWidths !== undefined && Object.keys(sheet.columnWidths).length > 0) {
      const widths: Record<string, number> = {};
      const names = Object.keys(sheet.columnWidths).sort((left, right) => (columnIndex(left) ?? 0) - (columnIndex(right) ?? 0));
      for (const name of names) {
        const width = sheet.columnWidths[name];
        if (width !== undefined) widths[name] = width;
      }
      data.columnWidths = widths;
    }
    if (sheet.merges !== undefined && sheet.merges.length > 0) data.merges = [...sheet.merges];
    return data;
  });
  return JSON.stringify({ schemaVersion: SHEET_SCHEMA_VERSION, sheets }, null, 2) + '\n';
}

/**
 * The sheet with a name, or the first sheet when no name is given.
 * @param workbook the workbook.
 * @param name the sheet name, when the caller names one.
 * @returns the sheet.
 */
export function sheetOf(workbook: SheetWorkbook, name?: string): SheetData {
  if (name === undefined) {
    const first = workbook.sheets[0];
    if (first === undefined) throw new SheetError('The workbook has no sheets.');
    return first;
  }
  const found = workbook.sheets.find((sheet) => sheet.name.toLowerCase() === name.trim().toLowerCase());
  if (found === undefined) throw new SheetError('No sheet is named "' + name + '".');
  return found;
}

/**
 * The greatest used row and column of one sheet, or undefined for an empty sheet.
 * @param sheet the sheet.
 * @returns the bounds, one-based row, zero-based column.
 */
export function usedBounds(sheet: SheetData): { rows: number; columns: number } {
  let rows = 0;
  let columns = 0;
  for (const ref of Object.keys(sheet.cells)) {
    const index = parseCellRef(ref);
    if (index === undefined) continue;
    if (index.row > rows) rows = index.row;
    if (index.column + 1 > columns) columns = index.column + 1;
  }
  return { rows, columns };
}

/**
 * A short, content-free summary for tool results and the panel header.
 * @param workbook the workbook.
 * @returns sheet names and counts.
 */
export function sheetSummary(workbook: SheetWorkbook): { sheets: { name: string; cells: number; formulas: number }[]; cells: number; formulas: number } {
  let cells = 0;
  let formulas = 0;
  const sheets = workbook.sheets.map((sheet) => {
    let sheetCells = 0;
    let sheetFormulas = 0;
    for (const cell of Object.values(sheet.cells)) {
      sheetCells += 1;
      if (cell.formula !== undefined) sheetFormulas += 1;
    }
    cells += sheetCells;
    formulas += sheetFormulas;
    return { name: sheet.name, cells: sheetCells, formulas: sheetFormulas };
  });
  return { sheets, cells, formulas };
}

/**
 * Resolve a cell in a sheet, when it exists.
 * @param workbook the workbook.
 * @param sheetName the sheet.
 * @param ref the cell.
 * @returns the cell, or undefined.
 */
export function cellOf(workbook: SheetWorkbook, sheetName: string, ref: string): SheetCell | undefined {
  return sheetOf(workbook, sheetName).cells[ref];
}

/**
 * A copy of the workbook safe to mutate. Sheet and cell objects are copied
 * shallowly; callers replace a cell rather than editing one in place.
 * @param workbook the workbook.
 * @returns the copy.
 */
export function cloneWorkbook(workbook: SheetWorkbook): SheetWorkbook {
  return {
    schemaVersion: SHEET_SCHEMA_VERSION,
    sheets: workbook.sheets.map((sheet) => ({
      name: sheet.name,
      cells: Object.fromEntries(Object.entries(sheet.cells).map(([ref, cell]) => [ref, cloneCell(cell)])),
      ...(sheet.columnWidths === undefined ? {} : { columnWidths: { ...sheet.columnWidths } }),
      ...(sheet.merges === undefined ? {} : { merges: [...sheet.merges] }),
    })),
  };
}

/**
 * Copy one cell.
 * @param cell the cell.
 * @returns a copy.
 */
export function cloneCell(cell: SheetCell): SheetCell {
  return {
    ...(cell.value === undefined ? {} : { value: cell.value }),
    ...(cell.formula === undefined ? {} : { formula: cell.formula }),
    ...(cell.style === undefined ? {} : { style: { ...cell.style } }),
  };
}
