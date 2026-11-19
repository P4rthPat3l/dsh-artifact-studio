/**
 * Read-only views of a sheet workbook: the bounds and cells a preview or an
 * export shows, a CSV rendering, a selection quote for an agent request, and
 * the advisory formula diagnostics a write returns.
 */

import { SHEET_LIMITS, contrastRatio, formatCellRef, formatRangeRef, parseRangeRef, sheetOf, usedBounds } from './model.js';
import type { SheetCell, SheetScalar, SheetStyle, SheetWorkbook } from './model.js';
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
