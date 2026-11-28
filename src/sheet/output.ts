/**
 * Read-only views of a sheet workbook: the bounds and cells a preview or an
 * export shows, a CSV rendering, a selection quote for an agent request, and
 * the advisory formula diagnostics a write returns.
 */

import { SHEET_LIMITS, SheetError, columnName, contrastRatio, formatCellRef, formatRangeRef, parseCellRef, parseRangeRef, sheetOf, usedBounds } from './model.js';
import type { CellRange, SheetCell, SheetData, SheetScalar, SheetStyle, SheetWorkbook } from './model.js';
import { evaluateWorkbook } from './formula.js';
import type { CellResult, EvaluatedWorkbook, FormulaErrorCode } from './formula.js';

/** One position in a used range. */
export interface TableCell {
  row: number;
  column: number;
  ref: string;
  display: string;
  value: SheetScalar;
  error?: FormulaErrorCode;
  style?: SheetStyle;
}

/** A rectangular view of one sheet, ready to render. */
export interface SheetTable {
  name: string;
  rows: number;
  columns: number;
  cells: TableCell[];
}

/** One sheet's size and counts, for a tool result or a card. */
export interface SheetOverview {
  name: string;
  rows: number;
  columns: number;
  cells: number;
  formulas: number;
}

/**
 * The used bounds of a sheet as one-based rows and columns.
 * @param sheet the sheet.
 * @returns the bounds.
 */
export function sheetBounds(sheet: { cells: Record<string, SheetCell> }): { rows: number; columns: number } {
  const bounds = usedBounds(sheet as Parameters<typeof usedBounds>[0]);
  return { rows: Math.max(1, bounds.rows), columns: Math.max(1, bounds.columns) };
}

/**
 * Build a rectangular table for a panel cover or an HTML export.
 * @param workbook the workbook.
 * @param evaluated the evaluated cells.
 * @param sheetName the sheet, first when omitted.
 * @param maxRows the most rows to include.
 * @param maxColumns the most columns to include.
 * @returns the table.
 */
export function sheetTable(
  workbook: SheetWorkbook,
  evaluated: EvaluatedWorkbook,
  sheetName?: string,
  maxRows = SHEET_LIMITS.maxRows,
  maxColumns = SHEET_LIMITS.maxColumns,
): SheetTable {
  const sheet = sheetOf(workbook, sheetName);
  const bounds = sheetBounds(sheet);
  const rows = Math.min(bounds.rows, maxRows);
  const columns = Math.min(bounds.columns, maxColumns);
  const results = evaluated.results[sheet.name] ?? {};
  const cells: TableCell[] = [];
  for (let row = 1; row <= rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const ref = formatCellRef(row, column);
      const cell = sheet.cells[ref];
      const result = results[ref];
      const display = result?.display ?? '';
      if (cell === undefined && display === '') continue;
      cells.push({
        row,
        column,
        ref,
        display,
        value: result?.value ?? null,
        ...(result?.error === undefined ? {} : { error: result.error }),
        ...(cell?.style === undefined ? {} : { style: cell.style }),
      });
    }
  }
  return { name: sheet.name, rows, columns, cells };
}

/** The overview rows a tool result carries; it has no cell content. */
export function sheetOverview(workbook: SheetWorkbook): SheetOverview[] {
  return workbook.sheets.map((sheet) => {
    const bounds = sheetBounds(sheet);
    let formulas = 0;
    for (const cell of Object.values(sheet.cells)) if (cell.formula !== undefined) formulas += 1;
    return { name: sheet.name, rows: bounds.rows, columns: bounds.columns, cells: Object.keys(sheet.cells).length, formulas };
  });
}

function csvCell(text: string): string {
  if (/[",\r\n]/.test(text)) return '"' + text.replace(/"/g, '""') + '"';
  return text;
}

/**
 * Render one sheet as RFC 4180 CSV. Values are the displayed values, so a
 * formula exports its result and a formatted number exports its format.
 * @param workbook the workbook.
 * @param evaluated the evaluated cells.
 * @param sheetName the sheet, first when omitted.
 * @returns the CSV text.
 */
export function sheetToCsv(workbook: SheetWorkbook, evaluated: EvaluatedWorkbook, sheetName?: string): string {
  const table = sheetTable(workbook, evaluated, sheetName);
  const byPosition = new Map<string, TableCell>();
  for (const cell of table.cells) byPosition.set(String(cell.row) + ',' + String(cell.column), cell);
  const lines: string[] = [];
  for (let row = 1; row <= table.rows; row += 1) {
    const values: string[] = [];
    for (let column = 0; column < table.columns; column += 1) {
      const cell = byPosition.get(String(row) + ',' + String(column));
      values.push(csvCell(cell?.display ?? ''));
    }
    lines.push(values.join(','));
  }
  return lines.join('\r\n') + '\r\n';
}

/**
 * A quote for an agent request: the range and its displayed values as TSV.
 * It never carries the whole sheet.
 * @param workbook the workbook.
 * @param evaluated the evaluated cells.
 * @param sheetName the sheet.
 * @param rangeRef the selected range.
 * @returns the bounded quote.
 */
export function selectionQuote(workbook: SheetWorkbook, evaluated: EvaluatedWorkbook, sheetName: string, rangeRef: string): string {
  const sheet = sheetOf(workbook, sheetName);
  const range = parseRangeRef(rangeRef);
  if (range === undefined) return sheetName + '!' + rangeRef;
  const results = evaluated.results[sheet.name] ?? {};
  const lastRow = Math.min(range.row2, range.row1 + 19);
  const lastColumn = Math.min(range.column2, range.column1 + 11);
  const lines: string[] = [sheet.name + '!' + formatRangeRef(range)];
  for (let row = range.row1; row <= lastRow; row += 1) {
    const values: string[] = [];
    for (let column = range.column1; column <= lastColumn; column += 1) {
      const ref = formatCellRef(row, column);
      values.push((results[ref]?.display ?? '').replace(/\t/g, ' ').replace(/\r?\n/g, ' '));
    }
    lines.push(values.join('\t'));
  }
  let text = lines.join('\n').trimEnd();
  if (lastRow < range.row2 || lastColumn < range.column2) text += '\n...';
  if (text.length > SHEET_LIMITS.maxSelectionQuote) text = text.slice(0, SHEET_LIMITS.maxSelectionQuote - 3).trimEnd() + '...';
  return text;
}

/**
 * The text metrics the panel and the exports share for wrapped cells. The row
 * height measure and the rendered cell both read these, so a wrapped line count
 * and the painted line box agree.
 */
export const SHEET_TEXT_METRICS = {
  /** The cell font size in pixels at 100%. */
  fontSize: 12,
  /** The width one character occupies, in pixels, in the design system font. */
  characterWidth: 6.6,
  /** The line box height, in pixels. */
  lineHeight: 16,
  /** The cell padding above and below the text, in pixels. */
  padding: 10,
} as const;

/**
 * How many lines one cell needs at a given width.
 * @param text the displayed text.
 * @param width the cell width in pixels.
 * @returns the line count, at least one.
 */
export function wrappedLineCount(text: string, width: number): number {
  if (text === '') return 1;
  const usable = Math.max(SHEET_TEXT_METRICS.characterWidth, width - 12);
  const perLine = Math.max(1, Math.floor(usable / SHEET_TEXT_METRICS.characterWidth));
  let lines = 0;
  for (const paragraph of text.split('\n')) {
    lines += Math.max(1, Math.ceil(paragraph.length / perLine));
  }
  return lines;
}

/**
 * The height of every row that holds a wrapped cell, in pixels at 100%. A row
 * without wrapped text is absent and uses the default height. The panel and the
 * XLSX writer read this one measure, so a wrapped cell is the same height in both.
 * @param sheet the sheet.
 * @param evaluated the evaluated cells.
 * @returns row number to height.
 */
export function sheetRowHeights(sheet: SheetData, evaluated: EvaluatedWorkbook): Map<number, number> {
  const heights = new Map<number, number>();
  const results = evaluated.results[sheet.name] ?? {};
  for (const [ref, cell] of Object.entries(sheet.cells) as [string, SheetCell][]) {
    if (cell.style?.wrap !== true) continue;
    const index = parseCellRef(ref);
    if (index === undefined) continue;
    const merge = (sheet.merges ?? [])
      .map(parseRangeRef)
      .find((range): range is CellRange => range !== undefined && index.row >= range.row1 && index.row <= range.row2 && index.column >= range.column1 && index.column <= range.column2);
    if (merge !== undefined && (index.row !== merge.row1 || index.column !== merge.column1)) continue;
    let width = 0;
    if (merge === undefined) {
      width = sheet.columnWidths?.[columnName(index.column)] ?? SHEET_LIMITS.defaultColumnWidth;
    } else {
      for (let column = merge.column1; column <= merge.column2; column += 1) {
        width += sheet.columnWidths?.[columnName(column)] ?? SHEET_LIMITS.defaultColumnWidth;
      }
    }
    const text = results[ref]?.display ?? '';
    const lines = wrappedLineCount(text, width);
    const height = Math.min(SHEET_LIMITS.maxRowHeight, Math.max(SHEET_LIMITS.defaultRowHeight, lines * SHEET_TEXT_METRICS.lineHeight + SHEET_TEXT_METRICS.padding));
    const current = heights.get(index.row) ?? SHEET_LIMITS.defaultRowHeight;
    if (height > current) heights.set(index.row, height);
  }
  return heights;
}

/** The evaluated cells one bounded read of a sheet returns. */
interface SheetValues {
  sheet: string;
  range: string;
  cells: { ref: string; value: SheetScalar; display: string; error?: FormulaErrorCode }[];
  truncated: boolean;
}

function readRange(rangeRef: string): CellRange {
  const range = parseRangeRef(rangeRef);
  if (range !== undefined) return range;
  const single = parseCellRef(rangeRef);
  if (single !== undefined) return { row1: single.row, column1: single.column, row2: single.row, column2: single.column };
  throw new SheetError('"' + rangeRef + '" is not a valid range or cell.');
}

/**
 * Read evaluated cells from one sheet: the computed value, the display text,
 * and the error code, row-major over the requested range. The stored cells
 * travel in the workbook content; this view adds what evaluation produces.
 * @param workbook the workbook.
 * @param evaluated the evaluated cells.
 * @param sheetName the sheet, first when omitted.
 * @param rangeRef the range or single cell, the used range when omitted.
 * @returns the bounded cell list.
 */
export function sheetValues(workbook: SheetWorkbook, evaluated: EvaluatedWorkbook, sheetName?: string, rangeRef?: string): SheetValues {
  const sheet = sheetOf(workbook, sheetName);
  const bounds = sheetBounds(sheet);
  const range = rangeRef === undefined
    ? { row1: 1, column1: 0, row2: bounds.rows, column2: Math.max(0, bounds.columns - 1) }
    : readRange(rangeRef);
  const results = evaluated.results[sheet.name] ?? {};
  const cells: SheetValues['cells'] = [];
  let lastRow = range.row1;
  let lastColumn = range.column1 - 1;
  let truncated = false;
  outer: for (let row = range.row1; row <= range.row2; row += 1) {
    for (let column = range.column1; column <= range.column2; column += 1) {
      if (cells.length >= SHEET_LIMITS.maxReadCells) {
        truncated = true;
        break outer;
      }
      const ref = formatCellRef(row, column);
      const result = results[ref];
      cells.push({
        ref,
        value: result?.value ?? null,
        display: result?.display ?? '',
        ...(result?.error === undefined ? {} : { error: result.error }),
      });
      lastRow = row;
      lastColumn = column;
    }
  }
  return {
    sheet: sheet.name,
    range: formatRangeRef({ row1: range.row1, column1: range.column1, row2: lastRow, column2: lastColumn }),
    cells,
    truncated,
  };
}

/**
 * Advisory warnings for a written workbook. A malformed formula is stored so
 * the user can fix it, and the model is told what it produced.
 * @param workbook the workbook.
 * @returns one message per problem, each starting with its code.
 */
export function checkSheetWorkbook(workbook: SheetWorkbook): string[] {
  const warnings = evaluateWorkbook(workbook).warnings;
  for (const sheet of workbook.sheets) {
    for (const [ref, cell] of Object.entries(sheet.cells)) {
      const style = cell.style;
      if (style?.background === undefined || style.color === undefined) continue;
      const ratio = contrastRatio(style.color, style.background);
      if (ratio < 4.5) {
        warnings.push('low-contrast: ' + sheet.name + '!' + ref + ' text ' + style.color + ' on ' + style.background + ' has a contrast ratio of ' + ratio.toFixed(1) + ':1. Use a darker or lighter text color.');
      }
    }
  }
  return warnings;
}

/**
 * Evaluate a workbook once for an export or a print copy.
 * @param workbook the workbook.
 * @returns the evaluated cells.
 */
export function evaluateForWrite(workbook: SheetWorkbook): EvaluatedWorkbook {
  return evaluateWorkbook(workbook);
}

/**
 * The result of one cell, for a panel that keeps its own evaluated map.
 * @param evaluated the evaluated cells.
 * @param sheetName the sheet.
 * @param ref the cell.
 * @returns the result, or undefined.
 */
export function resultOf(evaluated: EvaluatedWorkbook, sheetName: string, ref: string): CellResult | undefined {
  return evaluated.results[sheetName]?.[ref];
}

/**
 * The display string a preview uses for one cell, without re-evaluating.
 * @param cell the stored cell.
 * @param result the evaluated result.
 * @returns the display text.
 */
export function displayOf(cell: SheetCell | undefined, result: CellResult | undefined): string {
  if (result !== undefined) return result.display;
  if (cell === undefined) return '';
  if (cell.formula !== undefined) return cell.formula;
  if (cell.value === undefined) return '';
  return String(cell.value);
}
