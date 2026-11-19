/**
 * Minimal declarations for fast-formula-parser 1.0.19, which ships JavaScript
 * without types. Only the surface the sheet evaluator calls is declared.
 */

declare module 'fast-formula-parser' {
  /** The one-based cell position a formula is evaluated at. */
  export interface FormulaPosition {
    row: number;
    col: number;
    sheet?: string;
  }

  /** A cell reference passed to the resolver. */
  export interface FormulaCellRef {
    sheet?: string;
    row: number;
    col: number;
    address?: string;
  }

  /** An inclusive range passed to the resolver. */
  export interface FormulaRangeRef {
    sheet?: string;
    from: { row: number; col: number };
    to: { row: number; col: number };
  }

  /** The callbacks a parser uses to read the sheet. */
  export interface FormulaParserOptions {
    onCell(ref: FormulaCellRef): unknown;
    onRange(ref: FormulaRangeRef): unknown[][];
    functions?: Record<string, (...args: unknown[]) => unknown>;
  }

  /** One Excel error value the library returns or throws. */
  export interface FormulaErrorValue {
    name: string;
    _error: string;
    message?: string;
  }

  /** The library's error catalog. */
  export interface FormulaErrorCatalog {
    DIV0: FormulaErrorValue;
    NA: FormulaErrorValue;
    NAME: FormulaErrorValue;
    NULL: FormulaErrorValue;
    NUM: FormulaErrorValue;
    REF: FormulaErrorValue;
    VALUE: FormulaErrorValue;
    NOT_IMPLEMENTED(message: string): FormulaErrorValue;
    TOO_MANY_ARGS(message?: string): FormulaErrorValue;
    ARG_MISSING(message?: string): FormulaErrorValue;
    ERROR(message?: string): FormulaErrorValue;
  }

  /** A dependency as the parser reports it: a cell or an inclusive range. */
  export type FormulaDependency =
    | { sheet?: string; row: number; col: number }
    | { sheet?: string; from: { row: number; col: number }; to: { row: number; col: number } };

  /** The dependency parser returns references without evaluating anything. */
  export interface DependencyParser {
    parse(formula: string, position: FormulaPosition): FormulaDependency[];
  }

  export interface DependencyParserOptions {
    onVariable?: (name: string) => unknown;
  }

  /** The parser class. */
  export default class FormulaParser {
    static readonly FormulaError: FormulaErrorCatalog;

    static readonly DepParser: new (options?: DependencyParserOptions) => DependencyParser;

    constructor(options: FormulaParserOptions);

    parse(formula: string, position: FormulaPosition, allowArray?: boolean): unknown;
  }
}
