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
  sheetOf,
} from './model.js';
import type { HorizontalAlign, NumberFormat, SheetCell, SheetData, SheetScalar, SheetStylePatch, SheetWorkbook } from './model.js';

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
  | { op: 'set-column-width'; sheet?: string; column: string; width: number };

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
  const allowed = ['bold', 'italic', 'underline', 'strike', 'align', 'color', 'background', 'numberFormat'];
  onlyKeys(raw, allowed, at);
  const patch: StylePatch = {};
  for (const key of ['bold', 'italic', 'underline', 'strike'] as const) {
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
    if (typeof op !== 'string') fail(at + '.op must be one of set, write, clear, format, add-sheet, rename-sheet, delete-sheet, set-column-width.');
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
      case 'set-column-width': {
        onlyKeys(raw, ['op', 'sheet', 'column', 'width'], at);
        const sheet = raw.sheet === undefined ? undefined : sheetName(raw.sheet, at + '.sheet');
        if (typeof raw.column !== 'string' || columnIndex(raw.column) === undefined) fail(at + '.column must be one to three letters, such as A or AB.');
        if (typeof raw.width !== 'number' || !Number.isInteger(raw.width) || raw.width < SHEET_LIMITS.minColumnWidth || raw.width > SHEET_LIMITS.maxColumnWidth) {
          fail(at + '.width must be a whole number from ' + String(SHEET_LIMITS.minColumnWidth) + ' to ' + String(SHEET_LIMITS.maxColumnWidth) + '.');
        }
        return { op: 'set-column-width', ...(sheet === undefined ? {} : { sheet }), column: raw.column, width: raw.width };
      }
      default:
        fail(at + '.op must be one of set, write, clear, format, add-sheet, rename-sheet, delete-sheet, set-column-width.');
    }
  });
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
        sheet.name = next;
        notes.push('renamed sheet ' + entry.from + ' to ' + next);
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
      default: {
        const exhaustive: never = entry;
        fail('Unknown operation ' + String(exhaustive) + '.');
      }
    }
  }
  return { workbook: normalizeSheetWorkbook(workbook), notes };
}
