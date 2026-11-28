/**
 * Structural edits to a sheet workbook: the operations behind
 * artifact_sheet_update and the panel's own mutations. Every operation is
 * validated before it touches the model, and the result is re-validated as a
 * whole, so a bad path cannot leave a half-valid workbook in memory.
 */

import {
  SHEET_LIMITS,
  SheetError,
  checkSheetName,
  cloneCell,
  cloneWorkbook,
  columnIndex,
  columnName,
  formatCellRef,
  formatRangeRef,
  mergeStyle,
  normalizeSheetWorkbook,
  parseCellRef,
  parseRangeRef,
  parseSheetWorkbook,
  rangeCells,
  rangeSize,
  rangesOverlap,
  sheetOf,
  usedBounds,
} from './model.js';
import type { HorizontalAlign, NumberFormat, SheetCell, SheetData, SheetScalar, SheetWorkbook } from './model.js';

/** A validated cell style update. */
interface StylePatch {
  bold?: boolean | null;
  italic?: boolean | null;
  underline?: boolean | null;
  strike?: boolean | null;
  align?: HorizontalAlign | null;
  color?: string | null;
  background?: string | null;
  numberFormat?: NumberFormat | null;
  wrap?: boolean | null;
}

/** One validated edit. */
export type SheetOperation =
  | { op: 'set'; sheet?: string; ref: string; value?: SheetScalar; formula?: string; style?: StylePatch }
  | { op: 'write'; sheet?: string; ref: string; values: (string | number | boolean | null)[][] }
  | { op: 'clear'; sheet?: string; range: string }
  | { op: 'format'; sheet?: string; range: string; style: StylePatch }
  | { op: 'add-sheet'; name: string }
  | { op: 'rename-sheet'; from: string; to: string }
  | { op: 'delete-sheet'; name: string }
  | { op: 'set-column-width'; sheet?: string; column: string; width: number }
  | { op: 'insert-rows'; sheet?: string; at: number; count: number }
  | { op: 'delete-rows'; sheet?: string; at: number; count: number }
  | { op: 'insert-columns'; sheet?: string; at: string; count: number }
  | { op: 'delete-columns'; sheet?: string; at: string; count: number }
  | { op: 'move-rows'; sheet?: string; at: number; count: number; to: number }
  | { op: 'move-columns'; sheet?: string; at: string; count: number; to: string }
  | { op: 'merge'; sheet?: string; range: string }
  | { op: 'unmerge'; sheet?: string; range: string };

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;
const NUMBER_FORMATS: readonly NumberFormat[] = ['general', 'number', 'integer', 'currency', 'percent', 'date'];
const ALIGNS: readonly HorizontalAlign[] = ['left', 'center', 'right'];

function isFields(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function fail(message: string): never {
  throw new SheetError(message, 'sheet/operation');
}

function onlyKeys(value: Record<string, unknown>, allowed: readonly string[], at: string): void {
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) fail(at + ' has an unknown field "' + key + '". Use ' + allowed.join(', ') + '.');
  }
}

function colorOf(raw: unknown, at: string): string {
  if (typeof raw !== 'string' || !HEX.test(raw.trim())) fail(at + ' must be a hex color such as #1f2933.');
  const color = raw.trim().toLowerCase();
  if (color.length === 4) return '#' + color[1] + color[1] + color[2] + color[2] + color[3] + color[3];
  return color;
}

function stylePatch(raw: unknown, at: string): StylePatch {
  if (!isFields(raw)) fail(at + ' must be an object of style fields.');
  const allowed = ['bold', 'italic', 'underline', 'strike', 'align', 'color', 'background', 'numberFormat', 'wrap'];
  onlyKeys(raw, allowed, at);
  const patch: StylePatch = {};
  for (const key of ['bold', 'italic', 'underline', 'strike', 'wrap'] as const) {
    if (raw[key] === undefined) continue;
    if (raw[key] !== null && typeof raw[key] !== 'boolean') fail(at + '.' + key + ' must be true, false, or null.');
    patch[key] = raw[key] === null ? null : raw[key] === true;
  }
  if (raw.align !== undefined) {
    if (raw.align !== null && (typeof raw.align !== 'string' || !ALIGNS.includes(raw.align as HorizontalAlign))) fail(at + '.align must be left, center, right, or null.');
    patch.align = raw.align === null ? null : raw.align as HorizontalAlign;
  }
  if (raw.numberFormat !== undefined) {
    if (raw.numberFormat !== null && (typeof raw.numberFormat !== 'string' || !NUMBER_FORMATS.includes(raw.numberFormat as NumberFormat))) fail(at + '.numberFormat must be ' + NUMBER_FORMATS.join(', ') + ', or null.');
    patch.numberFormat = raw.numberFormat === null ? null : raw.numberFormat as NumberFormat;
  }
  if (raw.color !== undefined) patch.color = raw.color === null ? null : colorOf(raw.color, at + '.color');
  if (raw.background !== undefined) patch.background = raw.background === null ? null : colorOf(raw.background, at + '.background');
  if (Object.keys(patch).length === 0) fail(at + ' must set at least one style field.');
  return patch;
}

function scalarOf(raw: unknown, at: string): SheetScalar {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'string') {
    if (raw.length > SHEET_LIMITS.maxCellText) fail(at + ' is longer than ' + String(SHEET_LIMITS.maxCellText) + ' characters.');
    return raw;
  }
  if (typeof raw === 'number') {
    if (!Number.isFinite(raw)) fail(at + ' must be a finite number.');
    return raw;
  }
  if (typeof raw === 'boolean') return raw;
  return fail(at + ' must be a string, number, boolean, or null.');
}

function formulaOf(raw: unknown, at: string): string {
  if (typeof raw !== 'string') fail(at + ' must be a formula string.');
  let formula = raw.trim();
  if (formula === '' || formula === '=') fail(at + ' is empty.');
  if (!formula.startsWith('=')) formula = '=' + formula;
  if (formula.length > SHEET_LIMITS.maxFormula) fail(at + ' is longer than ' + String(SHEET_LIMITS.maxFormula) + ' characters.');
  return formula;
}

function sheetAt(workbook: SheetWorkbook, name: string | undefined): SheetData {
  return sheetOf(workbook, name);
}

function ensureRoom(sheet: SheetData, extra: number): void {
  const cells = Object.keys(sheet.cells).length;
  if (cells + extra > SHEET_LIMITS.maxCells) fail('A sheet artifact holds at most ' + String(SHEET_LIMITS.maxCells) + ' cells.');
}

function setCell(sheet: SheetData, ref: string, cell: SheetCell | undefined): void {
  if (cell === undefined) delete sheet.cells[ref];
  else sheet.cells[ref] = cell;
}

function applySet(sheet: SheetData, op: { ref: string; value?: SheetScalar; formula?: string; style?: StylePatch }): void {
  const index = parseCellRef(op.ref);
  if (index === undefined) fail('"' + op.ref + '" is not a valid cell reference.');
  const ref = formatCellRef(index.row, index.column);
  if (op.value !== undefined && op.formula !== undefined) fail('A cell cannot set both value and formula.');
  if (op.value === undefined && op.formula === undefined && op.style === undefined) fail('A set operation needs value, formula, or style.');
  const existing = sheet.cells[ref];
  if (existing === undefined) ensureRoom(sheet, 1);
  const next: SheetCell = existing === undefined ? {} : cloneCell(existing);
  if (op.formula !== undefined) {
    next.formula = formulaOf(op.formula, 'The formula');
    delete next.value;
  } else if (op.value !== undefined) {
    if (op.value === null) delete next.value;
    else next.value = op.value;
    delete next.formula;
  }
  if (op.style !== undefined) {
    const merged = mergeStyle(next.style, op.style);
    if (merged === undefined) delete next.style;
    else next.style = merged;
  }
  const hasContent = next.formula !== undefined || next.value !== undefined || next.style !== undefined;
  setCell(sheet, ref, hasContent ? next : undefined);
}

function applyWrite(sheet: SheetData, op: { ref: string; values: (string | number | boolean | null)[][] }): void {
  const start = parseCellRef(op.ref);
  if (start === undefined) fail('"' + op.ref + '" is not a valid cell reference.');
  const blockCells = op.values.reduce((total, row) => total + row.length, 0);
  ensureRoom(sheet, blockCells);
  op.values.forEach((values, rowOffset) => {
    values.forEach((raw, columnOffset) => {
      const row = start.row + rowOffset;
      const column = start.column + columnOffset;
      if (row > SHEET_LIMITS.maxRows || column >= SHEET_LIMITS.maxColumns) fail('The written block leaves the sheet bounds.');
      const ref = formatCellRef(row, column);
      const existing = sheet.cells[ref];
      if (raw === null) {
        if (existing === undefined) return;
        const next: SheetCell = {};
        if (existing.style !== undefined) next.style = { ...existing.style };
        setCell(sheet, ref, next.style === undefined ? undefined : next);
      } else if (typeof raw === 'string' && raw.startsWith('=')) {
        setCell(sheet, ref, { formula: formulaOf(raw, 'A written cell') });
      } else {
        setCell(sheet, ref, { value: raw });
      }
    });
  });
}

function applyFormat(sheet: SheetData, op: { range: string; style: StylePatch }): void {
  const range = parseRangeRef(op.range);
  if (range === undefined) fail('"' + op.range + '" is not a valid range.');
  if (rangeSize(range) > SHEET_LIMITS.maxOperationCells) fail('A format range may cover at most ' + String(SHEET_LIMITS.maxOperationCells) + ' cells.');
  let added = 0;
  for (const cell of rangeCells(range)) {
    const ref = formatCellRef(cell.row, cell.column);
    const existing = sheet.cells[ref];
    if (existing === undefined) added += 1;
    const next: SheetCell = existing === undefined ? {} : cloneCell(existing);
    const merged = mergeStyle(next.style, op.style);
    if (merged === undefined) delete next.style;
    else next.style = merged;
    const hasContent = next.formula !== undefined || next.value !== undefined || next.style !== undefined;
    setCell(sheet, ref, hasContent ? next : undefined);
  }
  ensureRoom(sheet, added);
}

function applyClear(sheet: SheetData, range: { row1: number; column1: number; row2: number; column2: number }): void {
  for (const ref of Object.keys(sheet.cells)) {
    const index = parseCellRef(ref);
    if (index === undefined) continue;
    if (index.row >= range.row1 && index.row <= range.row2 && index.column >= range.column1 && index.column <= range.column2) delete sheet.cells[ref];
  }
}

function rowIndex(raw: unknown, at: string): number {
  if (typeof raw !== 'number' || !Number.isInteger(raw) || raw < 1 || raw > SHEET_LIMITS.maxRows) {
    fail(at + ' must be a whole row number from 1 to ' + String(SHEET_LIMITS.maxRows) + '.');
  }
  return raw;
}

function columnIndexOf(raw: unknown, at: string): number {
  const column = typeof raw === 'string' ? columnIndex(raw) : undefined;
  if (column === undefined) fail(at + ' must be one to three letters, such as A or AB.');
  return column;
}

function shiftCount(raw: unknown, at: string, limit: number): number {
  if (raw === undefined) return 1;
  if (typeof raw !== 'number' || !Number.isInteger(raw) || raw < 1 || raw > limit) {
    fail(at + ' must be a whole number from 1 to ' + String(limit) + '.');
  }
  return raw;
}

/**
 * Validate the operations argument.
 * @param value the raw tool value.
 * @returns the validated operations.
 */
export function parseSheetOperations(value: unknown): SheetOperation[] {
  if (!Array.isArray(value) || value.length === 0) fail('Operations must be a non-empty array.');
  if (value.length > SHEET_LIMITS.maxOperations) fail('At most ' + String(SHEET_LIMITS.maxOperations) + ' operations are allowed in one call.');
  return value.map((raw, index): SheetOperation => {
    const at = 'operations[' + String(index) + ']';
    if (!isFields(raw)) fail(at + ' must be an object.');
    const op = raw.op;
    if (typeof op !== 'string') fail(at + '.op must be one of set, write, clear, format, add-sheet, rename-sheet, delete-sheet, set-column-width, insert-rows, delete-rows, insert-columns, delete-columns, move-rows, move-columns, merge, unmerge.');
    switch (op) {
      case 'set': {
        onlyKeys(raw, ['op', 'sheet', 'ref', 'value', 'formula', 'style'], at);
        const sheet = raw.sheet === undefined ? undefined : sheetName(raw.sheet, at + '.sheet');
        if (typeof raw.ref !== 'string') fail(at + '.ref must be a cell reference.');
        const value = raw.value === undefined ? undefined : scalarOf(raw.value, at + '.value');
        const formula = raw.formula === undefined ? undefined : formulaOf(raw.formula, at + '.formula');
        const style = raw.style === undefined ? undefined : stylePatch(raw.style, at + '.style');
        return {
          op: 'set',
          ...(sheet === undefined ? {} : { sheet }),
          ref: raw.ref,
          ...(value === undefined ? {} : { value }),
          ...(formula === undefined ? {} : { formula }),
          ...(style === undefined ? {} : { style }),
        };
      }
      case 'write': {
        onlyKeys(raw, ['op', 'sheet', 'ref', 'values'], at);
        const sheet = raw.sheet === undefined ? undefined : sheetName(raw.sheet, at + '.sheet');
        if (typeof raw.ref !== 'string') fail(at + '.ref must be a cell reference.');
        if (!Array.isArray(raw.values) || raw.values.length === 0 || raw.values.length > 200) fail(at + '.values must be a non-empty array of up to 200 rows.');
        let total = 0;
        const values = raw.values.map((row: unknown, rowIndex: number): (string | number | boolean | null)[] => {
          if (!Array.isArray(row) || row.length === 0 || row.length > 100) fail(at + '.values[' + String(rowIndex) + '] must be a non-empty array of up to 100 cells.');
          total += row.length;
          if (total > SHEET_LIMITS.maxOperationCells) fail(at + ' writes at most ' + String(SHEET_LIMITS.maxOperationCells) + ' cells.');
          return row.map((cell: unknown, cellIndex: number) => scalarOf(cell, at + '.values[' + String(rowIndex) + '][' + String(cellIndex) + ']'));
        });
        return { op: 'write', ...(sheet === undefined ? {} : { sheet }), ref: raw.ref, values };
      }
      case 'clear': {
        onlyKeys(raw, ['op', 'sheet', 'range'], at);
        const sheet = raw.sheet === undefined ? undefined : sheetName(raw.sheet, at + '.sheet');
        if (typeof raw.range !== 'string' || parseRangeRef(raw.range) === undefined) fail(at + '.range must be a range such as A1:C4.');
        return { op: 'clear', ...(sheet === undefined ? {} : { sheet }), range: raw.range };
      }
      case 'format': {
        onlyKeys(raw, ['op', 'sheet', 'range', 'style'], at);
        const sheet = raw.sheet === undefined ? undefined : sheetName(raw.sheet, at + '.sheet');
        if (typeof raw.range !== 'string' || parseRangeRef(raw.range) === undefined) fail(at + '.range must be a range such as A1:C4.');
        return { op: 'format', ...(sheet === undefined ? {} : { sheet }), range: raw.range, style: stylePatch(raw.style, at + '.style') };
      }
      case 'add-sheet': {
        onlyKeys(raw, ['op', 'name'], at);
        return { op: 'add-sheet', name: checkSheetName(raw.name, at + '.name') };
      }
      case 'rename-sheet': {
        onlyKeys(raw, ['op', 'from', 'to'], at);
        return { op: 'rename-sheet', from: checkSheetName(raw.from, at + '.from'), to: checkSheetName(raw.to, at + '.to') };
      }
      case 'delete-sheet': {
        onlyKeys(raw, ['op', 'name'], at);
        return { op: 'delete-sheet', name: checkSheetName(raw.name, at + '.name') };
      }
      case 'merge': {
        onlyKeys(raw, ['op', 'sheet', 'range'], at);
        const sheet = raw.sheet === undefined ? undefined : sheetName(raw.sheet, at + '.sheet');
        if (typeof raw.range !== 'string' || parseRangeRef(raw.range) === undefined) fail(at + '.range must be a range such as A1:C1.');
        return { op: 'merge', ...(sheet === undefined ? {} : { sheet }), range: raw.range };
      }
      case 'unmerge': {
        onlyKeys(raw, ['op', 'sheet', 'range'], at);
        const sheet = raw.sheet === undefined ? undefined : sheetName(raw.sheet, at + '.sheet');
        if (typeof raw.range !== 'string' || (parseRangeRef(raw.range) === undefined && parseCellRef(raw.range) === undefined)) {
          fail(at + '.range must be a range such as A1:C1 or one cell inside a merged range.');
        }
        return { op: 'unmerge', ...(sheet === undefined ? {} : { sheet }), range: raw.range };
      }
      case 'set-column-width': {
        onlyKeys(raw, ['op', 'sheet', 'column', 'width'], at);
        const sheet = raw.sheet === undefined ? undefined : sheetName(raw.sheet, at + '.sheet');
        if (typeof raw.column !== 'string' || columnIndex(raw.column) === undefined) fail(at + '.column must be one to three letters, such as A or AB.');
        if (typeof raw.width !== 'number' || !Number.isInteger(raw.width) || raw.width < SHEET_LIMITS.minColumnWidth || raw.width > SHEET_LIMITS.maxColumnWidth) {
          fail(at + '.width must be a whole number from ' + String(SHEET_LIMITS.minColumnWidth) + ' to ' + String(SHEET_LIMITS.maxColumnWidth) + '.');
        }
        return { op: 'set-column-width', ...(sheet === undefined ? {} : { sheet }), column: raw.column, width: raw.width };
      }
      case 'insert-rows':
      case 'delete-rows': {
        onlyKeys(raw, ['op', 'sheet', 'at', 'count'], at);
        const sheet = raw.sheet === undefined ? undefined : sheetName(raw.sheet, at + '.sheet');
        const row = rowIndex(raw.at, at + '.at');
        const count = shiftCount(raw.count, at + '.count', SHEET_LIMITS.maxRows);
        if (row + count - 1 > SHEET_LIMITS.maxRows) fail(at + ' leaves the sheet; the last row is ' + String(SHEET_LIMITS.maxRows) + '.');
        return { op, ...(sheet === undefined ? {} : { sheet }), at: row, count };
      }
      case 'insert-columns':
      case 'delete-columns': {
        onlyKeys(raw, ['op', 'sheet', 'at', 'count'], at);
        const sheet = raw.sheet === undefined ? undefined : sheetName(raw.sheet, at + '.sheet');
        const column = columnIndexOf(raw.at, at + '.at');
        const count = shiftCount(raw.count, at + '.count', SHEET_LIMITS.maxColumns);
        if (column + count > SHEET_LIMITS.maxColumns) fail(at + ' leaves the sheet; the last column is ' + columnName(SHEET_LIMITS.maxColumns - 1) + '.');
        return { op, ...(sheet === undefined ? {} : { sheet }), at: columnName(column), count };
      }
      case 'move-rows': {
        onlyKeys(raw, ['op', 'sheet', 'at', 'count', 'to'], at);
        const sheet = raw.sheet === undefined ? undefined : sheetName(raw.sheet, at + '.sheet');
        const row = rowIndex(raw.at, at + '.at');
        const count = shiftCount(raw.count, at + '.count', SHEET_LIMITS.maxRows);
        const to = rowIndex(raw.to, at + '.to');
        if (row + count - 1 > SHEET_LIMITS.maxRows) fail(at + ' leaves the sheet; the last row is ' + String(SHEET_LIMITS.maxRows) + '.');
        if (to + count - 1 > SHEET_LIMITS.maxRows) fail(at + '.to leaves the sheet; the last row is ' + String(SHEET_LIMITS.maxRows) + '.');
        return { op, ...(sheet === undefined ? {} : { sheet }), at: row, count, to };
      }
      case 'move-columns': {
        onlyKeys(raw, ['op', 'sheet', 'at', 'count', 'to'], at);
        const sheet = raw.sheet === undefined ? undefined : sheetName(raw.sheet, at + '.sheet');
        const column = columnIndexOf(raw.at, at + '.at');
        const to = columnIndexOf(raw.to, at + '.to');
        const count = shiftCount(raw.count, at + '.count', SHEET_LIMITS.maxColumns);
        if (column + count > SHEET_LIMITS.maxColumns || to + count > SHEET_LIMITS.maxColumns) {
          fail(at + ' leaves the sheet; the last column is ' + columnName(SHEET_LIMITS.maxColumns - 1) + '.');
        }
        return { op, ...(sheet === undefined ? {} : { sheet }), at: columnName(column), to: columnName(to), count };
      }
      default:
        fail(at + '.op must be one of set, write, clear, format, add-sheet, rename-sheet, delete-sheet, set-column-width, insert-rows, delete-rows, insert-columns, delete-columns, move-rows, move-columns, merge, unmerge.');
    }
  });
}

/** A bare sheet name the parser reads without quotes. */
const PLAIN_SHEET_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;
const CELL_LIKE_NAME = /^[A-Za-z]{1,3}[0-9]+$/;

/**
 * Quote a sheet name for a formula when the parser needs it.
 * @param name the sheet name.
 * @returns the reference form, quoted or bare.
 */
function sheetReference(name: string): string {
  const needsQuotes = !PLAIN_SHEET_NAME.test(name) || CELL_LIKE_NAME.test(name) || name.toUpperCase() === 'TRUE' || name.toUpperCase() === 'FALSE';
  return needsQuotes ? "'" + name.replace(/'/g, "''") + "'" : name;
}

/**
 * Find the end of a double-quoted formula string literal.
 * @param formula the formula body.
 * @param start the index of the opening quote.
 * @returns the index after the closing quote, or the formula length.
 */
function endOfLiteral(formula: string, start: number): number {
  let index = start + 1;
  while (index < formula.length) {
    if (formula[index] === '"') {
      if (formula[index + 1] === '"') { index += 2; continue; }
      return index + 1;
    }
    index += 1;
  }
  return formula.length;
}

/**
 * Find the end of a quoted sheet reference such as a name with a space.
 * @param formula the formula body.
 * @param start the index of the opening apostrophe.
 * @returns the index after the closing apostrophe, or the formula length.
 */
function endOfQuotedName(formula: string, start: number): number {
  let index = start + 1;
  while (index < formula.length) {
    if (formula[index] === "'") {
      if (formula[index + 1] === "'") { index += 2; continue; }
      return index + 1;
    }
    index += 1;
  }
  return formula.length;
}

/**
 * Rewrite references to a renamed sheet. Double-quoted string literals are
 * left alone, a name inside a 3-D reference is left alone, and a quoted name
 * that does not match is copied through unchanged.
 * @param formula the stored formula.
 * @param from the old sheet name.
 * @param to the new sheet name.
 * @returns the formula with matching references rewritten.
 */
function rewriteSheetReferences(formula: string, from: string, to: string): string {
  const target = from.toLowerCase();
  const reference = sheetReference(to);
  let out = '';
  let index = 0;
  while (index < formula.length) {
    const char = formula[index];
    if (char === '"') {
      const end = endOfLiteral(formula, index);
      out += formula.slice(index, end);
      index = end;
      continue;
    }
    if (char === "'") {
      const end = endOfQuotedName(formula, index);
      const inner = formula.slice(index + 1, Math.max(index + 1, end - 1)).replace(/''/g, "'");
      if (formula[end] === '!' && inner.toLowerCase() === target) {
        out += reference + '!';
        index = end + 1;
        continue;
      }
      out += formula.slice(index, end);
      index = end;
      continue;
    }
    if (char !== undefined && /[A-Za-z_#]/.test(char)) {
      let end = index + 1;
      while (end < formula.length && /[A-Za-z0-9_#.]/.test(formula[end] ?? '')) end += 1;
      const name = formula.slice(index, end);
      if (formula[end] === '!' && name.toLowerCase() === target) {
        out += reference + '!';
        index = end + 1;
        continue;
      }
      out += name;
      index = end;
      continue;
    }
    out += char;
    index += 1;
  }
  return out;
}

/**
 * Rewrite every formula that names a sheet, across the whole workbook.
 * @param workbook the workbook being edited.
 * @param from the old sheet name.
 * @param to the new sheet name.
 */
function rewriteWorkbookReferences(workbook: SheetWorkbook, from: string, to: string): void {
  if (from.toLowerCase() === to.toLowerCase()) return;
  for (const sheet of workbook.sheets) {
    for (const [ref, cell] of Object.entries(sheet.cells)) {
      if (cell.formula === undefined) continue;
      const next = rewriteSheetReferences(cell.formula, from, to);
      if (next !== cell.formula) sheet.cells[ref] = { ...cell, formula: next };
    }
  }
}

/** A row or column span before a structural edit. */
type AxisShift =
  | { kind: 'insert'; at: number; count: number }
  | { kind: 'delete'; at: number; count: number }
  /** Move the block at `at` so its first row or column lands on `to`. */
  | { kind: 'move'; at: number; count: number; to: number };

/**
 * The coordinate that takes a value's place after a shift.
 * @returns the new coordinate, or -1 when a delete removes it.
 */
function shiftedCoordinate(shift: AxisShift, value: number): number {
  if (shift.kind === 'insert') return value >= shift.at ? value + shift.count : value;
  if (shift.kind === 'move') {
    const end = shift.at + shift.count - 1;
    if (value >= shift.at && value <= end) return shift.to + (value - shift.at);
    if (shift.to < shift.at) return value >= shift.to && value < shift.at ? value + shift.count : value;
    const targetEnd = shift.to + shift.count - 1;
    return value > end && value <= targetEnd ? value - shift.count : value;
  }
  if (value < shift.at) return value;
  if (value >= shift.at + shift.count) return value - shift.count;
  return -1;
}

/**
 * What is left of a span after a shift. An insert inside or at the edge of a
 * span grows it, the way Excel does; a delete shrinks it.
 * @returns the new endpoints, or null when every cell in the span is gone.
 */
function shiftedSpan(shift: AxisShift, start: number, end: number): [number, number] | null {
  if (shift.kind === 'insert') {
    return [start >= shift.at ? start + shift.count : start, end >= shift.at ? end + shift.count : end];
  }
  if (shift.kind === 'move') {
    // A span that covers the whole affected region keeps the same cells, just
    // in a different order, so its endpoints stay where they were.
    const affectedStart = Math.min(shift.at, shift.to);
    const affectedEnd = Math.max(shift.at + shift.count - 1, shift.to + shift.count - 1);
    if (start <= affectedStart && end >= affectedEnd) return [start, end];
    const first = shiftedCoordinate(shift, start);
    const last = shiftedCoordinate(shift, end);
    return [Math.min(first, last), Math.max(first, last)];
  }
  const last = shift.at + shift.count - 1;
  const removedUpTo = (value: number): number => Math.max(0, Math.min(last, value) - shift.at + 1);
  const nextStart = start - removedUpTo(start - 1);
  const nextEnd = end - removedUpTo(end);
  return nextEnd < nextStart ? null : [nextStart, nextEnd];
}

/** One cell reference or range found in a formula. */
interface FormulaReference {
  end: number;
  row1: number;
  column1: number;
  row2: number;
  column2: number;
  range: boolean;
  absoluteRow1: boolean;
  absoluteColumn1: boolean;
  absoluteRow2: boolean;
  absoluteColumn2: boolean;
}

/** One endpoint of a formula reference, with its absolute markers. */
interface FormulaEndpoint {
  end: number;
  row: number;
  column: number;
  absoluteRow: boolean;
  absoluteColumn: boolean;
}

const FORMULA_REF = /^(\$?)([A-Za-z]{1,3})(\$?)([1-9][0-9]{0,6})/;

/**
 * Read a cell reference at a position, refusing a name or a call that merely
 * looks like one: `LOG10(` is a function and `1e10` is a number.
 */
function endpointAt(formula: string, start: number): FormulaEndpoint | null {
  const previous = start === 0 ? '' : formula[start - 1] ?? '';
  if (/[A-Za-z0-9_.$]/.test(previous)) return null;
  const match = FORMULA_REF.exec(formula.slice(start));
  if (match === null) return null;
  const column = columnIndex(match[2] ?? '');
  const row = Number(match[4]);
  if (column === undefined || row > SHEET_LIMITS.maxRows) return null;
  const end = start + match[0].length;
  const next = formula[end];
  if (next !== undefined && /[A-Za-z0-9_(]/.test(next)) return null;
  return { end, row, column, absoluteColumn: match[1] === '$', absoluteRow: match[3] === '$' };
}

function referenceAt(formula: string, start: number): FormulaReference | null {
  const first = endpointAt(formula, start);
  if (first === null) return null;
  const second = formula[first.end] === ':' ? endpointAt(formula, first.end + 1) : null;
  const last = second ?? first;
  return {
    end: last.end,
    row1: first.row,
    column1: first.column,
    row2: last.row,
    column2: last.column,
    range: second !== null,
    absoluteRow1: first.absoluteRow,
    absoluteColumn1: first.absoluteColumn,
    absoluteRow2: last.absoluteRow,
    absoluteColumn2: last.absoluteColumn,
  };
}

function formulaRefText(row: number, column: number, absoluteRow: boolean, absoluteColumn: boolean): string {
  return (absoluteColumn ? '$' : '') + columnName(column) + (absoluteRow ? '$' : '') + String(row);
}

/** Apply one axis of a structural edit to a reference, or mark it removed. */
function shiftReference(reference: FormulaReference, shift: AxisShift, axis: 'row' | 'column'): string {
  const rows = axis === 'row' ? shiftedSpan(shift, reference.row1, reference.row2) : [reference.row1, reference.row2] as const;
  const columns = axis === 'column' ? shiftedSpan(shift, reference.column1, reference.column2) : [reference.column1, reference.column2] as const;
  if (rows === null || columns === null) return '#REF!';
  const first = formulaRefText(rows[0], columns[0], reference.absoluteRow1, reference.absoluteColumn1);
  if (!reference.range) return first;
  return first + ':' + formulaRefText(rows[1], columns[1], reference.absoluteRow2, reference.absoluteColumn2);
}

/**
 * Rewrite the references a structural edit moves. A reference without a sheet
 * name belongs to the formula's own sheet; a named one shifts only when it
 * names the edited sheet, so other sheets keep their coordinates. String
 * literals are copied through.
 */
function rewriteFormulaShift(formula: string, ownSheet: string, editedSheet: string, shift: AxisShift, axis: 'row' | 'column'): string {
  let out = '';
  let index = 0;
  let qualifier: string | null = null;
  while (index < formula.length) {
    const char = formula[index] ?? '';
    if (char === '"') {
      const end = endOfLiteral(formula, index);
      out += formula.slice(index, end);
      index = end;
      qualifier = null;
      continue;
    }
    if (char === "'") {
      const end = endOfQuotedName(formula, index);
      const name = formula.slice(index + 1, Math.max(index + 1, end - 1)).replace(/''/g, "'");
      out += formula.slice(index, end);
      index = end;
      if (formula[index] === '!') {
        qualifier = name;
        out += '!';
        index += 1;
      } else {
        qualifier = null;
      }
      continue;
    }
    const reference = char === '$' || /[A-Za-z]/.test(char) ? referenceAt(formula, index) : null;
    if (reference !== null) {
      const sheetName = qualifier ?? ownSheet;
      out += sheetName.toLowerCase() === editedSheet.toLowerCase()
        ? shiftReference(reference, shift, axis)
        : formula.slice(index, reference.end);
      index = reference.end;
      qualifier = null;
      continue;
    }
    if (/[A-Za-z_]/.test(char)) {
      let end = index + 1;
      while (end < formula.length && /[A-Za-z0-9_.]/.test(formula[end] ?? '')) end += 1;
      const name = formula.slice(index, end);
      out += name;
      index = end;
      if (formula[index] === '!') {
        qualifier = name;
        out += '!';
        index += 1;
      } else {
        qualifier = null;
      }
      continue;
    }
    out += char;
    index += 1;
    if (char !== ':') qualifier = null;
  }
  return out;
}

/** Rewrite every formula in the workbook that a structural edit moves. */
function rewriteWorkbookShift(workbook: SheetWorkbook, editedSheet: string, shift: AxisShift, axis: 'row' | 'column'): void {
  for (const sheet of workbook.sheets) {
    for (const [ref, cell] of Object.entries(sheet.cells)) {
      if (cell.formula === undefined) continue;
      const next = rewriteFormulaShift(cell.formula, sheet.name, editedSheet, shift, axis);
      if (next !== cell.formula) sheet.cells[ref] = { ...cell, formula: next };
    }
  }
}

/** Move or remove the cells, merged ranges, and widths of one axis edit. */
function applyAxisShift(sheet: SheetData, shift: AxisShift, axis: 'row' | 'column'): void {
  const cells: Record<string, SheetCell> = {};
  for (const [ref, cell] of Object.entries(sheet.cells)) {
    const index = parseCellRef(ref);
    if (index === undefined) continue;
    const row = axis === 'row' ? shiftedCoordinate(shift, index.row) : index.row;
    const column = axis === 'column' ? shiftedCoordinate(shift, index.column) : index.column;
    if (row === -1 || column === -1) continue;
    cells[formatCellRef(row, column)] = cell;
  }
  sheet.cells = cells;
  if (sheet.merges !== undefined) {
    const merges = sheet.merges.flatMap((text) => {
      const range = parseRangeRef(text);
      if (range === undefined) return [];
      const rows = axis === 'row' ? shiftedSpan(shift, range.row1, range.row2) : [range.row1, range.row2] as const;
      const columns = axis === 'column' ? shiftedSpan(shift, range.column1, range.column2) : [range.column1, range.column2] as const;
      if (rows === null || columns === null) return [];
      const next = {
        row1: rows[0],
        row2: rows[1],
        column1: columns[0],
        column2: columns[1],
      };
      if (rangeSize(next) < 2) return [];
      return [formatRangeRef(next)];
    });
    if (merges.length === 0) delete sheet.merges;
    else sheet.merges = merges;
  }
  if (axis === 'column' && sheet.columnWidths !== undefined) {
    const widths: Record<string, number> = {};
    for (const [name, width] of Object.entries(sheet.columnWidths)) {
      const column = columnIndex(name);
      if (column === undefined) continue;
      const next = shiftedCoordinate(shift, column);
      if (next !== -1) widths[columnName(next)] = width;
    }
    if (Object.keys(widths).length === 0) delete sheet.columnWidths;
    else sheet.columnWidths = widths;
  }
}

function sheetName(raw: unknown, at: string): string {
  return checkSheetName(raw, at);
}

/**
 * Apply validated operations to a workbook.
 * @param text the current stored content.
 * @param operations the raw operations argument.
 * @returns the next workbook and one note per operation.
 */
export function applySheetOperations(text: string, operations: unknown): { workbook: SheetWorkbook; notes: string[] } {
  const workbook = cloneWorkbook(parseSheetWorkbook(text));
  const parsed = parseSheetOperations(operations);
  const notes: string[] = [];
  for (const entry of parsed) {
    switch (entry.op) {
      case 'set': {
        const sheet = sheetAt(workbook, entry.sheet);
        applySet(sheet, entry);
        notes.push('set ' + sheet.name + '!' + formatCellRef(parseCellRef(entry.ref)?.row ?? 1, parseCellRef(entry.ref)?.column ?? 0));
        break;
      }
      case 'write': {
        const sheet = sheetAt(workbook, entry.sheet);
        applyWrite(sheet, entry);
        notes.push('wrote a block at ' + sheet.name + '!' + entry.ref);
        break;
      }
      case 'clear': {
        const sheet = sheetAt(workbook, entry.sheet);
        const range = parseRangeRef(entry.range);
        if (range === undefined) fail('"' + entry.range + '" is not a valid range.');
        applyClear(sheet, range);
        notes.push('cleared ' + sheet.name + '!' + formatRangeRef(range));
        break;
      }
      case 'format': {
        const sheet = sheetAt(workbook, entry.sheet);
        applyFormat(sheet, entry);
        notes.push('formatted ' + sheet.name + '!' + entry.range);
        break;
      }
      case 'add-sheet': {
        if (workbook.sheets.length >= SHEET_LIMITS.maxSheets) fail('A workbook holds at most ' + String(SHEET_LIMITS.maxSheets) + ' sheets.');
        if (workbook.sheets.some((sheet) => sheet.name.toLowerCase() === entry.name.toLowerCase())) fail('A sheet is already named "' + entry.name + '".');
        workbook.sheets.push({ name: entry.name, cells: {} });
        notes.push('added sheet ' + entry.name);
        break;
      }
      case 'rename-sheet': {
        const sheet = sheetOf(workbook, entry.from);
        const next = checkSheetName(entry.to);
        if (workbook.sheets.some((item) => item !== sheet && item.name.toLowerCase() === next.toLowerCase())) fail('A sheet is already named "' + next + '".');
        const previous = sheet.name;
        sheet.name = next;
        rewriteWorkbookReferences(workbook, previous, next);
        notes.push('renamed sheet ' + previous + ' to ' + next);
        break;
      }
      case 'delete-sheet': {
        const index = workbook.sheets.findIndex((sheet) => sheet.name.toLowerCase() === entry.name.toLowerCase());
        if (index === -1) fail('No sheet is named "' + entry.name + '".');
        if (workbook.sheets.length === 1) fail('A workbook needs at least one sheet.');
        workbook.sheets.splice(index, 1);
        notes.push('deleted sheet ' + entry.name);
        break;
      }
      case 'merge': {
        const sheet = sheetAt(workbook, entry.sheet);
        const range = parseRangeRef(entry.range);
        if (range === undefined) fail('"' + entry.range + '" is not a valid range.');
        if (rangeSize(range) < 2) fail('"' + entry.range + '" covers one cell; a merge needs at least two.');
        const merges = sheet.merges ?? [];
        if (merges.length >= SHEET_LIMITS.maxMerges) fail('A sheet holds at most ' + String(SHEET_LIMITS.maxMerges) + ' merged ranges.');
        if (merges.some((text) => {
          const other = parseRangeRef(text);
          return other !== undefined && rangesOverlap(other, range);
        })) fail('"' + entry.range + '" overlaps a merged range on ' + sheet.name + '.');
        let cleared = 0;
        for (const cell of rangeCells(range)) {
          if (cell.row === range.row1 && cell.column === range.column1) continue;
          const ref = formatCellRef(cell.row, cell.column);
          const existing = sheet.cells[ref];
          if (existing === undefined) continue;
          if (existing.value !== undefined || existing.formula !== undefined) cleared += 1;
          if (existing.style === undefined) {
            delete sheet.cells[ref];
          } else {
            sheet.cells[ref] = { style: { ...existing.style } };
          }
        }
        sheet.merges = [...merges, formatRangeRef(range)];
        notes.push('merged ' + sheet.name + '!' + formatRangeRef(range) + (cleared === 0 ? '' : ' and cleared ' + String(cleared) + ' covered ' + (cleared === 1 ? 'value' : 'values')));
        break;
      }
      case 'unmerge': {
        const sheet = sheetAt(workbook, entry.sheet);
        const single = parseCellRef(entry.range);
        const range = parseRangeRef(entry.range) ?? (single === undefined ? undefined : { row1: single.row, column1: single.column, row2: single.row, column2: single.column });
        if (range === undefined) fail('"' + entry.range + '" is not a valid range.');
        const merges = sheet.merges ?? [];
        const kept = merges.filter((text) => {
          const other = parseRangeRef(text);
          return other === undefined || !rangesOverlap(other, range);
        });
        if (kept.length === merges.length) fail('No merged range on ' + sheet.name + ' covers "' + entry.range + '".');
        if (kept.length === 0) delete sheet.merges;
        else sheet.merges = kept;
        notes.push('unmerged ' + String(merges.length - kept.length) + ' range(s) on ' + sheet.name);
        break;
      }
      case 'set-column-width': {
        const sheet = sheetAt(workbook, entry.sheet);
        const column = columnIndex(entry.column);
        if (column === undefined) fail('"' + entry.column + '" is not a column.');
        const widths = sheet.columnWidths ?? {};
        widths[columnName(column)] = entry.width;
        sheet.columnWidths = widths;
        notes.push('set column ' + columnName(column) + ' on ' + sheet.name + ' to ' + String(entry.width) + 'px');
        break;
      }
      case 'insert-rows':
      case 'delete-rows': {
        const sheet = sheetAt(workbook, entry.sheet);
        const kind = entry.op === 'insert-rows' ? 'insert' : 'delete';
        if (kind === 'insert') {
          const used = usedBounds(sheet);
          if (used.rows >= entry.at && used.rows + entry.count > SHEET_LIMITS.maxRows) {
            fail('Inserting ' + String(entry.count) + ' row(s) at row ' + String(entry.at) + ' would move cells past row ' + String(SHEET_LIMITS.maxRows) + '.');
          }
        }
        const shift: AxisShift = { kind, at: entry.at, count: entry.count };
        applyAxisShift(sheet, shift, 'row');
        rewriteWorkbookShift(workbook, sheet.name, shift, 'row');
        notes.push((kind === 'insert' ? 'inserted ' : 'deleted ') + String(entry.count) + ' row(s) at row ' + String(entry.at) + ' on ' + sheet.name);
        break;
      }
      case 'insert-columns':
      case 'delete-columns': {
        const sheet = sheetAt(workbook, entry.sheet);
        const column = columnIndex(entry.at);
        if (column === undefined) fail('"' + entry.at + '" is not a column.');
        const kind = entry.op === 'insert-columns' ? 'insert' : 'delete';
        if (kind === 'insert') {
          const used = usedBounds(sheet);
          if (used.columns > column && used.columns + entry.count > SHEET_LIMITS.maxColumns) {
            fail('Inserting ' + String(entry.count) + ' column(s) at column ' + entry.at + ' would move cells past column ' + columnName(SHEET_LIMITS.maxColumns - 1) + '.');
          }
        }
        const shift: AxisShift = { kind, at: column, count: entry.count };
        applyAxisShift(sheet, shift, 'column');
        rewriteWorkbookShift(workbook, sheet.name, shift, 'column');
        notes.push((kind === 'insert' ? 'inserted ' : 'deleted ') + String(entry.count) + ' column(s) at column ' + entry.at + ' on ' + sheet.name);
        break;
      }
      case 'move-rows': {
        const sheet = sheetAt(workbook, entry.sheet);
        const shift: AxisShift = { kind: 'move', at: entry.at, count: entry.count, to: entry.to };
        applyAxisShift(sheet, shift, 'row');
        rewriteWorkbookShift(workbook, sheet.name, shift, 'row');
        notes.push('moved ' + String(entry.count) + ' row(s) at row ' + String(entry.at) + ' to row ' + String(entry.to) + ' on ' + sheet.name);
        break;
      }
      case 'move-columns': {
        const sheet = sheetAt(workbook, entry.sheet);
        const column = columnIndex(entry.at);
        const to = columnIndex(entry.to);
        if (column === undefined || to === undefined) fail('A moved column must be one to three letters, such as A or AB.');
        const shift: AxisShift = { kind: 'move', at: column, count: entry.count, to };
        applyAxisShift(sheet, shift, 'column');
        rewriteWorkbookShift(workbook, sheet.name, shift, 'column');
        notes.push('moved ' + String(entry.count) + ' column(s) at column ' + entry.at + ' to column ' + entry.to + ' on ' + sheet.name);
        break;
      }
      default: {
        const exhaustive: never = entry;
        fail('Unknown operation ' + String(exhaustive) + '.');
      }
    }
  }
  return { workbook: normalizeSheetWorkbook(workbook), notes };
}
