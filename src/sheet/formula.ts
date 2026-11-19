/**
 * Formula evaluation for sheet artifacts.
 *
 * The parser is fast-formula-parser 1.0.19 (MIT). It reads cells and ranges
 * through callbacks, so the workbook model stays ours while the engine brings
 * Excel's function set. This module adds what the library leaves out:
 * circular-reference detection, a bounded evaluation budget, normalising its
 * thrown #ERROR! into Excel codes, and a per-cell display string.
 */

import FormulaParser from 'fast-formula-parser';
import type { FormulaCellRef, FormulaErrorValue, FormulaRangeRef } from 'fast-formula-parser';
import { createSheetFunctions } from './functions.js';
import { SHEET_LIMITS, formatCellRef } from './model.js';
import type { NumberFormat, SheetCell, SheetData, SheetScalar, SheetWorkbook } from './model.js';

/** The error values a cell can show. */
export type FormulaErrorCode =
  | '#VALUE!'
  | '#DIV/0!'
  | '#NAME?'
  | '#REF!'
  | '#N/A'
  | '#NUM!'
  | '#NULL!'
  | '#CYCLE!'
  | '#LIMIT!'
  | '#SYNTAX!';

/** One evaluated cell. */
export interface CellResult {
  value: SheetScalar;
  error?: FormulaErrorCode;
  message?: string;
  display: string;
}

/** Evaluated cells per sheet name and canonical reference, plus advisory warnings. */
export interface EvaluatedWorkbook {
  results: Record<string, Record<string, CellResult>>;
  warnings: string[];
}

type Outcome = { value: SheetScalar } | { error: FormulaErrorCode; message?: string };

/** State shared by one top-level formula chain. */
interface Flags {
  cycle: boolean;
  limit: boolean;
  syntax: string | undefined;
  referenceError: { error: FormulaErrorCode; message?: string } | undefined;
  unresolved: boolean;
}

function emptyFlags(): Flags {
  return { cycle: false, limit: false, syntax: undefined, referenceError: undefined, unresolved: false };
}

function isError(outcome: Outcome): outcome is { error: FormulaErrorCode; message?: string } {
  return 'error' in outcome;
}

/**
 * Read the error cell a parser returns.
 * @param value a parser result.
 * @returns the error code, or undefined for a value.
 */
function errorCodeOf(value: unknown): string | undefined {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const record: Record<string, unknown> = { ...value };
  const code = record._error ?? record.name;
  return typeof code === 'string' && code.startsWith('#') ? code : undefined;
}

/**
 * The message a parser error carries.
 * @param value the error object.
 * @returns the message, or an empty string.
 */
function errorMessageOf(value: unknown): string {
  if (value === null || typeof value !== 'object') return '';
  const record: Record<string, unknown> = { ...value };
  return typeof record.message === 'string' ? record.message : '';
}

function normaliseCode(code: string, message: string): FormulaErrorCode {
  switch (code) {
    case '#VALUE!':
    case '#DIV/0!':
    case '#NAME?':
    case '#REF!':
    case '#N/A':
    case '#NUM!':
    case '#NULL!':
      return code;
    case '#CYCLE!':
    case '#LIMIT!':
    case '#SYNTAX!':
      return code;
    case '#ERROR!':
      return /not implemented/i.test(message) ? '#NAME?' : '#SYNTAX!';
    default:
      return '#ERROR!'.startsWith(code) ? '#SYNTAX!' : '#VALUE!';
  }
}

const CATALOG = FormulaParser.FormulaError;

function libraryError(code: FormulaErrorCode): FormulaErrorValue {
  switch (code) {
    case '#DIV/0!':
      return CATALOG.DIV0;
    case '#N/A':
      return CATALOG.NA;
    case '#NAME?':
      return CATALOG.NAME;
    case '#NUM!':
      return CATALOG.NUM;
    case '#REF!':
      return CATALOG.REF;
    case '#NULL!':
      return CATALOG.NULL;
    default:
      return CATALOG.VALUE;
  }
}

/**
 * Render a number for display. Formats are deterministic and use US groups.
 * @param value the number.
 * @param format the cell number format.
 * @returns the display text.
 */
export function formatNumber(value: number, format: NumberFormat | undefined): string {
  if (!Number.isFinite(value)) return '#NUM!';
  switch (format) {
    case 'number':
      return groupFixed(value, 2);
    case 'integer':
      return groupFixed(Math.round(value), 0);
    case 'currency': {
      const text = groupFixed(Math.abs(value), 2);
      return (value < 0 ? '-$' : '$') + text;
    }
    case 'percent':
      return groupFixed(value * 100, 2) + '%';
    case 'date':
      return formatDate(value);
    case undefined:
    case 'general':
    default:
      return generalNumber(value);
  }
}

function groupFixed(value: number, digits: number): string {
  const fixed = Math.abs(value).toFixed(digits);
  const parts = fixed.split('.');
  const whole = parts[0] ?? '0';
  const fraction = parts[1];
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const text = fraction === undefined ? grouped : grouped + '.' + fraction;
  return value < 0 && Number(fixed) !== 0 ? '-' + text : text;
}

function generalNumber(value: number): string {
  if (Number.isInteger(value)) return String(value);
  const magnitude = Math.abs(value);
  if (magnitude >= 1e15 || (magnitude > 0 && magnitude < 1e-9)) return value.toExponential(6);
  return String(Number(value.toPrecision(12)));
}

/**
 * Excel stores a date as a day count from 1899; this renders it as ISO text so
 * the panel, export, and CSV agree without a time zone.
 * @param serial the Excel serial number.
 * @returns the date, with a time when the serial has a fraction.
 */
function formatDate(serial: number): string {
  if (serial <= 0 || serial > 2958465) return generalNumber(serial);
  const whole = Math.floor(serial);
  const fraction = serial - whole;
  const epoch = whole < 60 ? Date.UTC(1899, 11, 31) + whole * 86400000 : Date.UTC(1899, 11, 30) + whole * 86400000;
  const date = new Date(epoch + Math.round(fraction * 86400000));
  const pad = (value: number): string => String(value).padStart(2, '0');
  const text = String(date.getUTCFullYear()) + '-' + pad(date.getUTCMonth() + 1) + '-' + pad(date.getUTCDate());
  if (fraction === 0) return text;
  return text + ' ' + pad(date.getUTCHours()) + ':' + pad(date.getUTCMinutes());
}

/**
 * Render one scalar for the panel, a print copy, or CSV.
 * @param value the value.
 * @param format the cell number format.
 * @returns the display text.
 */
export function formatScalar(value: SheetScalar, format: NumberFormat | undefined): string {
  if (value === null) return '';
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  if (typeof value === 'number') return formatNumber(value, format);
  return value;
}

class Evaluator {
  private readonly workbook: SheetWorkbook;

  private readonly sheets = new Map<string, SheetData>();

  private readonly memo = new Map<string, Outcome>();

  private readonly visiting = new Set<string>();

  private readonly parser: FormulaParser;

  private readonly depParser: { parse(formula: string, position: { row: number; col: number; sheet: string }): unknown[] };

  private flags: Flags = emptyFlags();

  private budget = SHEET_LIMITS.maxEvaluationCells;

  constructor(workbook: SheetWorkbook) {
    this.workbook = workbook;
    for (const sheet of workbook.sheets) this.sheets.set(sheet.name.toLowerCase(), sheet);
    this.parser = new FormulaParser({
      onCell: (ref) => this.parserCell(ref),
      onRange: (ref) => this.parserRange(ref),
      functions: createSheetFunctions({ value: CATALOG.VALUE, na: CATALOG.NA, num: CATALOG.NUM, div0: CATALOG.DIV0, ref: CATALOG.REF }),
    });
    this.depParser = new FormulaParser.DepParser({ onVariable: () => undefined });
  }

  /**
   * Resolve every cell a formula references before the formula parser starts.
   * fast-formula-parser parses synchronously and is not reentrant, so a formula
   * cell reached through a resolver would start a nested parse. Preparing the
   * dependencies first keeps every parse call sequential.
   * @param source the stored formula.
   * @param sheetName the sheet the formula lives on.
   * @param row the one-based row.
   * @param column the zero-based column.
   */
  private prepareDependencies(source: string, sheetName: string, row: number, column: number): void {
    const body = source.startsWith('=') ? source.slice(1) : source;
    let dependencies: unknown;
    try {
      dependencies = this.depParser.parse(body, { row, col: column + 1, sheet: sheetName });
    } catch {
      return;
    }
    if (!Array.isArray(dependencies)) return;
    for (const dependency of dependencies) {
      if (dependency === null || typeof dependency !== 'object') continue;
      const record: Record<string, unknown> = { ...dependency };
      const depSheet = typeof record.sheet === 'string' ? record.sheet : sheetName;
      if (typeof record.row === 'number' && typeof record.col === 'number') {
        this.resultOf(depSheet, record.row, record.col - 1);
        continue;
      }
      const from = record.from;
      const to = record.to;
      if (from === null || typeof from !== 'object' || to === null || typeof to !== 'object') continue;
      const fromRow = (from as Record<string, unknown>).row;
      const fromCol = (from as Record<string, unknown>).col;
      const toRow = (to as Record<string, unknown>).row;
      const toCol = (to as Record<string, unknown>).col;
      if (typeof fromRow !== 'number' || typeof fromCol !== 'number' || typeof toRow !== 'number' || typeof toCol !== 'number') continue;
      const firstRow = Math.max(1, fromRow);
      const lastRow = Math.min(SHEET_LIMITS.maxRows, toRow);
      const firstColumn = Math.max(0, fromCol - 1);
      const lastColumn = Math.min(SHEET_LIMITS.maxColumns - 1, toCol - 1);
      const size = (lastRow - firstRow + 1) * (lastColumn - firstColumn + 1);
      if (!this.spend(size)) return;
      for (let depRow = firstRow; depRow <= lastRow; depRow += 1) {
        for (let depColumn = firstColumn; depColumn <= lastColumn; depColumn += 1) this.resultOf(depSheet, depRow, depColumn);
      }
    }
  }

  private spend(cells = 1): boolean {
    this.budget -= cells;
    if (this.budget >= 0) return true;
    this.flags.limit = true;
    return false;
  }

  private parserCell(ref: FormulaCellRef): unknown {
    const sheetName = ref.sheet ?? this.workbook.sheets[0]?.name ?? '';
    const column = Math.max(0, ref.col - 1);
    if (this.unevaluatedFormula(sheetName, ref.row, column)) {
      this.flags.unresolved = true;
      return libraryError('#REF!');
    }
    // The parser uses one-based columns; the workbook model uses zero-based ones.
    return this.toParserValue(this.resultOf(sheetName, ref.row, column), ref.sheet !== undefined);
  }

  /**
   * Whether a reference names a formula cell that has not been prepared yet.
   * That can only happen through a function the dependency parser cannot see,
   * such as INDIRECT.
   * @param sheetName the sheet.
   * @param row the one-based row.
   * @param column the zero-based column.
   * @returns whether starting that formula now would nest a parse.
   */
  private unevaluatedFormula(sheetName: string, row: number, column: number): boolean {
    const sheet = this.sheets.get(sheetName.toLowerCase());
    if (sheet === undefined) return false;
    const cell = sheet.cells[formatCellRef(row, column)];
    if (cell === undefined || cell.formula === undefined) return false;
    return !this.memo.has(sheet.name.toLowerCase() + '!' + formatCellRef(row, column));
  }

  private parserRange(ref: FormulaRangeRef): unknown[][] {
    const sheet = ref.sheet ?? this.workbook.sheets[0]?.name ?? '';
    const firstRow = Math.max(1, ref.from.row);
    const lastRow = Math.min(SHEET_LIMITS.maxRows, ref.to.row);
    const firstColumn = Math.max(0, ref.from.col - 1);
    const lastColumn = Math.min(SHEET_LIMITS.maxColumns - 1, ref.to.col - 1);
    if (lastRow < firstRow || lastColumn < firstColumn) return [];
    if (!this.spend((lastRow - firstRow + 1) * (lastColumn - firstColumn + 1))) return [[libraryError('#REF!')]];
    const rows: unknown[][] = [];
    for (let row = firstRow; row <= lastRow; row += 1) {
      const cells: unknown[] = [];
      for (let column = firstColumn; column <= lastColumn; column += 1) cells.push(this.toParserValue(this.resultOf(sheet, row, column), false));
      rows.push(cells);
    }
    return rows;
  }

  private toParserValue(outcome: Outcome, fromReference: boolean): unknown {
    void fromReference;
    if (!isError(outcome)) return outcome.value;
    if (this.flags.referenceError === undefined) this.flags.referenceError = outcome;
    if (outcome.error === '#CYCLE!') {
      this.flags.cycle = true;
      return libraryError('#REF!');
    }
    if (outcome.error === '#LIMIT!') {
      this.flags.limit = true;
      return libraryError('#REF!');
    }
    if (outcome.error === '#SYNTAX!') {
      if (this.flags.syntax === undefined) this.flags.syntax = outcome.message ?? 'A referenced formula has invalid syntax.';
      return libraryError('#REF!');
    }
    return libraryError(outcome.error);
  }

  private evaluateFormula(source: string, sheet: string, row: number, column: number): Outcome {
    const body = source.startsWith('=') ? source.slice(1) : source;
    try {
      const raw = this.parser.parse(body, { row, col: column + 1, sheet });
      return this.outcomeOf(raw);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'The formula could not be parsed.';
      const code = errorCodeOf(error);
      if (code !== undefined) return { error: normaliseCode(code, message), message: message.split('\n')[0] ?? message };
      if (/not implemented/i.test(message)) return { error: '#NAME?', message };
      return { error: '#SYNTAX!', message: message.split('\n')[0] ?? message };
    }
  }

  private outcomeOf(raw: unknown): Outcome {
    if (raw === null || raw === undefined) return { value: null };
    if (typeof raw === 'number') return Number.isFinite(raw) ? { value: raw } : { error: '#NUM!', message: 'The result is not a finite number.' };
    if (typeof raw === 'string' || typeof raw === 'boolean') return { value: raw };
    if (Array.isArray(raw)) return { error: '#VALUE!', message: 'Array formulas are not supported in a sheet artifact.' };
    const code = errorCodeOf(raw);
    if (code !== undefined) {
      const message = errorMessageOf(raw);
      return { error: normaliseCode(code, message), message: message.split('\n')[0] ?? message };
    }
    return { error: '#VALUE!', message: 'The formula returned a value this build cannot show.' };
  }

  private resultOf(sheetName: string, row: number, column: number): Outcome {
    const sheet = this.sheets.get(sheetName.toLowerCase());
    if (sheet === undefined) return { error: '#REF!', message: 'There is no sheet named "' + sheetName + '".' };
    const ref = formatCellRef(row, column);
    const key = sheet.name.toLowerCase() + '!' + ref;
    const memo = this.memo.get(key);
    if (memo !== undefined) return memo;
    if (this.visiting.has(key)) {
      this.flags.cycle = true;
      return { error: '#CYCLE!', message: 'The formula refers back to its own cell.' };
    }
    if (!this.spend()) return { error: '#LIMIT!', message: 'The formula calculation is too large.' };
    const cell = sheet.cells[ref];
    if (cell === undefined || cell.formula === undefined) {
      const literal: Outcome = { value: cell === undefined ? null : cell.value ?? null };
      this.memo.set(key, literal);
      return literal;
    }
    // Each cell evaluates with its own flags. A sibling cell inside a range
    // must not inherit this cell's cycle or limit state.
    const parentFlags = this.flags;
    this.flags = emptyFlags();
    this.visiting.add(key);
    let outcome: Outcome;
    try {
      this.prepareDependencies(cell.formula, sheet.name, row, column);
      outcome = this.evaluateFormula(cell.formula, sheet.name, row, column);
      if (this.flags.cycle) outcome = { error: '#CYCLE!', message: 'The formula refers back to its own cell.' };
      else if (this.flags.limit) outcome = { error: '#LIMIT!', message: 'The formula calculation is too large.' };
      else if (this.flags.unresolved) outcome = { error: '#REF!', message: 'A dynamic reference points at a formula this build could not resolve first.' };
      else if (isError(outcome) && this.flags.syntax !== undefined) outcome = { error: '#SYNTAX!', message: this.flags.syntax };
      else if (!isError(outcome) && this.flags.referenceError !== undefined && isTopLevelAggregate(cell.formula)) outcome = this.flags.referenceError;
    } finally {
      this.visiting.delete(key);
      this.flags = parentFlags;
    }
    this.memo.set(key, outcome);
    return outcome;
  }

  /**
   * Evaluate every cell in the workbook.
   * @returns evaluated cells and advisory warnings.
   */
  run(): EvaluatedWorkbook {
    const results: Record<string, Record<string, CellResult>> = {};
    const warnings: string[] = [];
    for (const sheet of this.workbook.sheets) {
      const sheetResults: Record<string, CellResult> = {};
      results[sheet.name] = sheetResults;
      for (const entry of Object.entries(sheet.cells)) {
        const ref = entry[0];
        const cell = entry[1];
        const index = ref === undefined ? undefined : parseIndex(ref);
        if (index === undefined) continue;
        const outcome = this.resultOf(sheet.name, index.row, index.column);
        if (isError(outcome) && cell.formula !== undefined && warnings.length < 8) {
          const detail = outcome.message === undefined ? '' : outcome.message.replace(/\.$/, '');
          warnings.push(
            'formula-error: ' + sheet.name + '!' + ref + ' shows ' + outcome.error + ' for "' + cell.formula + '"' +
            (detail === '' ? '.' : '; ' + detail + '.'),
          );
        }
        sheetResults[ref] = {
          value: isError(outcome) ? null : outcome.value,
          ...(isError(outcome) ? { error: outcome.error } : {}),
          ...(isError(outcome) && outcome.message !== undefined ? { message: outcome.message } : {}),
          display: isError(outcome) ? outcome.error : formatScalar(outcome.value, cell.style?.numberFormat),
        };
      }
    }
    return { results, warnings };
  }
}

const AGGREGATE = /^=\s*(?:SUM|AVERAGE|MIN|MAX|PRODUCT|MEDIAN)\s*\(/i;

/**
 * Whether a formula is a plain aggregate of references. The parser skips an
 * errored cell inside a range for these functions, where Excel reports the
 * error, so the wrapper restores the Excel result. A formula that names
 * IFERROR, IF, or ISERROR is left to the parser because it handles the error
 * on purpose.
 * @param formula the stored formula.
 * @returns whether to propagate a referenced error.
 */
function isTopLevelAggregate(formula: string): boolean {
  if (!AGGREGATE.test(formula)) return false;
  return !/\b(?:IFERROR|IF|ISERROR|ISNA)\s*\(/i.test(formula);
}

function parseIndex(ref: string): { row: number; column: number } | undefined {
  const match = /^([A-Z]{1,3})([1-9][0-9]{0,6})$/.exec(ref);
  if (match === null) return undefined;
  const letters = match[1] ?? '';
  let column = 0;
  for (const letter of letters) column = column * 26 + (letter.charCodeAt(0) - 64);
  return { row: Number(match[2]), column: column - 1 };
}

/**
 * Evaluate every cell of a workbook.
 * @param workbook the workbook.
 * @returns the evaluated cells and advisory warnings.
 */
export function evaluateWorkbook(workbook: SheetWorkbook): EvaluatedWorkbook {
  return new Evaluator(workbook).run();
}

/**
 * The display text of a cell, following its stored number format.
 * @param cell the stored cell, when any.
 * @param result the evaluated result, when any.
 * @returns the text the panel and the exports show.
 */
export function displayCell(cell: SheetCell | undefined, result: CellResult | undefined): string {
  if (result === undefined) return '';
  if (result.error !== undefined) return result.error;
  return formatScalar(result.value, cell?.style?.numberFormat);
}

/**
 * Whether a library error object is one of the standard codes.
 * @param value the value.
 * @returns the code, when it is an error.
 */
export function formulaErrorOf(value: unknown): FormulaErrorCode | undefined {
  const code = errorCodeOf(value);
  return code === undefined ? undefined : normaliseCode(code, errorMessageOf(value));
}
