/**
 * The handful of common spreadsheet functions the bundled parser leaves as
 * stubs or does not register. fast-formula-parser ships 343 names, but MAX,
 * MIN, MEDIAN, MATCH, SUMIFS and several others are empty placeholders in
 * 1.0.19. These implementations fill the gaps that a real sheet hits, using
 * the parser's evaluated argument shape and its FormulaError instances.
 */

import type { FormulaErrorValue } from 'fast-formula-parser';

/** The error singletons the parser already owns. */
export interface SheetFunctionErrors {
  value: FormulaErrorValue;
  na: FormulaErrorValue;
  num: FormulaErrorValue;
  div0: FormulaErrorValue;
  ref: FormulaErrorValue;
}

/** One evaluated function argument as the parser passes it. */
interface LibArg {
  value?: unknown;
  isArray?: boolean;
  isRangeRef?: boolean;
  isCellRef?: boolean;
}

function isErrorValue(value: unknown): value is FormulaErrorValue {
  if (value === null || typeof value !== 'object') return false;
  const record: Record<string, unknown> = { ...value };
  return typeof record._error === 'string';
}

function argOf(raw: unknown): LibArg {
  if (raw !== null && typeof raw === 'object') return { ...raw } as LibArg;
  return { value: raw };
}

/**
 * The scalar values of one argument. A range becomes a flat list; a cell or
 * literal stays one value.
 * @param raw the parser argument.
 * @returns the values and whether the argument was a range.
 */
function valuesOf(raw: unknown): { values: unknown[]; range: boolean } {
  const arg = argOf(raw);
  const value = arg.value;
  if (Array.isArray(value)) return { values: value.flat(Infinity) as unknown[], range: true };
  return { values: [value], range: arg.isRangeRef === true || arg.isArray === true };
}

function throwIfError(value: unknown): void {
  if (isErrorValue(value)) throw value;
}

function firstValue(raw: unknown): unknown {
  const { values } = valuesOf(raw);
  return values[0];
}

function textOf(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  if (typeof value === 'number') return String(value);
  return String(value);
}

function numberOf(raw: unknown, fallback: number | undefined): number | undefined {
  const value = firstValue(raw);
  if (value === null || value === undefined || value === '') return fallback;
  if (typeof value === 'number') return value;
  if (typeof value === 'boolean') return value ? 1 : 0;
  const number = Number(String(value).trim());
  return Number.isFinite(number) ? number : undefined;
}

/**
 * Collect numbers with Excel's range rules: booleans and text inside a range
 * are ignored, a direct boolean becomes 1 or 0, and a numeric string becomes a
 * number. An error value propagates.
 * @param raws the arguments.
 * @returns the numbers.
 */
function numbersOf(raws: readonly unknown[]): number[] {
  const numbers: number[] = [];
  for (const raw of raws) {
    const { values, range } = valuesOf(raw);
    for (const value of values) {
      throwIfError(value);
      if (typeof value === 'number') {
        if (Number.isFinite(value)) numbers.push(value);
      } else if (!range && typeof value === 'boolean') {
        numbers.push(value ? 1 : 0);
      } else if (!range && typeof value === 'string' && value.trim() !== '') {
        const number = Number(value.trim());
        if (Number.isFinite(number)) numbers.push(number);
      }
    }
  }
  return numbers;
}

function maximum(values: readonly number[]): number {
  let result = Number.NEGATIVE_INFINITY;
  for (const value of values) result = Math.max(result, value);
  return result;
}

function minimum(values: readonly number[]): number {
  let result = Number.POSITIVE_INFINITY;
  for (const value of values) result = Math.min(result, value);
  return result;
}

function wildcard(text: string, pattern: string): boolean {
  const source = '^' + pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.') + '$';
  return new RegExp(source, 'i').test(text);
}

function looseEqual(left: unknown, right: unknown): boolean {
  throwIfError(left);
  throwIfError(right);
  if (typeof left === 'number' && typeof right === 'number') return left === right;
  const leftNumber = typeof left === 'number' ? left : Number(String(left ?? '').trim());
  const rightNumber = typeof right === 'number' ? right : Number(String(right ?? '').trim());
  const leftNumeric = typeof left === 'number' || (typeof left === 'string' && left.trim() !== '' && /^[+\-]?\d/.test(left.trim()));
  const rightNumeric = typeof right === 'number' || (typeof right === 'string' && right.trim() !== '' && /^[+\-]?\d/.test(right.trim()));
  if (leftNumeric && rightNumeric && Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) return leftNumber === rightNumber;
  const pattern = textOf(right);
  if (/[*?]/.test(pattern)) return wildcard(textOf(left), pattern);
  return textOf(left).toLowerCase() === pattern.toLowerCase();
}

function criteriaMatches(value: unknown, criteria: unknown): boolean {
  throwIfError(value);
  throwIfError(criteria);
  let operation = '=';
  let target: unknown = criteria;
  if (typeof criteria === 'string') {
    const match = /^(<=|>=|<>|<|>|=)([\s\S]*)$/.exec(criteria);
    if (match !== null) {
      operation = match[1] ?? '=';
      target = (match[2] ?? '').trim();
    }
  }
  if (operation === '=' || operation === '<>') {
    const equal = looseEqual(value, target);
    return operation === '=' ? equal : !equal;
  }
  const leftText = typeof value === 'number' ? value : Number(textOf(value));
  const rightText = typeof target === 'number' ? target : Number(textOf(target));
  if (!Number.isFinite(leftText) || !Number.isFinite(rightText)) {
    const a = textOf(value).toLowerCase();
    const b = textOf(target).toLowerCase();
    switch (operation) {
      case '<': return a < b;
      case '>': return a > b;
      case '<=': return a <= b;
      case '>=': return a >= b;
      default: return false;
    }
  }
  switch (operation) {
    case '<': return leftText < rightText;
    case '>': return leftText > rightText;
    case '<=': return leftText <= rightText;
    case '>=': return leftText >= rightText;
    default: return false;
  }
}

/**
 * Walk criteria range and criteria value pairs, keeping the positions where
 * every pair matches.
 * @param raws the raw arguments starting at the first criteria range.
 * @param valueCount how many positions the target range has.
 * @returns matching zero-based positions, or undefined when the ranges differ.
 */
function matchingIndices(raws: readonly unknown[], valueCount: number): number[] | undefined {
  if (raws.length === 0 || raws.length % 2 !== 0) return undefined;
  const indices: number[] = [];
  for (let index = 0; index < valueCount; index += 1) indices.push(index);
  for (let pair = 0; pair < raws.length; pair += 2) {
    const values = valuesOf(raws[pair]).values;
    const criteria = firstValue(raws[pair + 1]);
    if (values.length !== valueCount) return undefined;
    for (let index = indices.length - 1; index >= 0; index -= 1) {
      const position = indices[index];
      if (position === undefined) continue;
      if (!criteriaMatches(values[position], criteria)) indices.splice(index, 1);
    }
  }
  return indices;
}

function sampleVariance(raws: readonly unknown[], sample: boolean, errors: SheetFunctionErrors): number {
  const values = numbersOf(raws);
  if (values.length === 0 || (sample && values.length < 2)) throw errors.div0;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const squares = values.reduce((sum, value) => sum + (value - mean) ** 2, 0);
  return squares / (sample ? values.length - 1 : values.length);
}

function sampleDeviation(raws: readonly unknown[], sample: boolean, errors: SheetFunctionErrors): number {
  return Math.sqrt(sampleVariance(raws, sample, errors));
}

/** The parser context that context functions receive as their first argument. */
interface ParserContext {
  utils: { extractRefValue(arg: unknown): { val: unknown } };
}

/**
 * Read an argument that the parser passed as a raw reference for a context
 * function. Literals and already-extracted values pass through.
 * @param raw the raw argument.
 * @param context the parser context, when present.
 * @returns the value.
 */
function extractArgument(raw: unknown, context: ParserContext | undefined): unknown {
  if (context !== undefined) {
    try {
      return context.utils.extractRefValue(raw).val;
    } catch {
      return raw;
    }
  }
  return argOf(raw).value;
}

/**
 * Build the custom functions for one parser.
 * @param errors the parser's error singletons.
 * @returns the function map.
 */
export function createSheetFunctions(errors: SheetFunctionErrors): Record<string, (...args: unknown[]) => unknown> {
  const aggregate = (raws: readonly unknown[], pick: (values: readonly number[]) => number): unknown => {
    const values = numbersOf(raws);
    return values.length === 0 ? 0 : pick(values);
  };
  const filteredNumbers = (raws: readonly unknown[]): number[] | undefined => {
    const target = valuesOf(raws[0]).values;
    const positions = matchingIndices(raws.slice(1), target.length);
    if (positions === undefined) return undefined;
    const result: number[] = [];
    for (const position of positions) {
      const value = target[position];
      throwIfError(value);
      if (typeof value === 'number') result.push(value);
    }
    return result;
  };
  return {
    MAX: (...raws) => aggregate(raws, maximum),
    MIN: (...raws) => aggregate(raws, minimum),
    MEDIAN: (...raws) => {
      const values = [...numbersOf(raws)].sort((left, right) => left - right);
      if (values.length === 0) throw errors.num;
      const middle = Math.floor(values.length / 2);
      if (values.length % 2 === 1) return values[middle];
      return ((values[middle - 1] ?? 0) + (values[middle] ?? 0)) / 2;
    },
    LARGE: (...raws) => {
      const values = [...numbersOf([raws[0]])].sort((left, right) => right - left);
      const rank = numberOf(raws[1], undefined);
      if (rank === undefined || !Number.isInteger(rank) || rank < 1 || rank > values.length) throw errors.num;
      return values[rank - 1];
    },
    SMALL: (...raws) => {
      const values = [...numbersOf([raws[0]])].sort((left, right) => left - right);
      const rank = numberOf(raws[1], undefined);
      if (rank === undefined || !Number.isInteger(rank) || rank < 1 || rank > values.length) throw errors.num;
      return values[rank - 1];
    },
    COUNTA: (...raws) => {
      let count = 0;
      for (const raw of raws) {
        const { values } = valuesOf(raw);
        for (const value of values) {
          if (isErrorValue(value)) {
            count += 1;
            continue;
          }
          if (value !== null && value !== undefined && value !== '') count += 1;
        }
      }
      return count;
    },
    COUNTBLANK: (...raws) => {
      let count = 0;
      for (const raw of raws) {
        const { values } = valuesOf(raw);
        for (const value of values) {
          if (value === null || value === undefined || value === '') count += 1;
        }
      }
      return count;
    },
    MATCH: (...raws) => {
      const lookup = firstValue(raws[0]);
      const values = valuesOf(raws[1]).values;
      const type = (raws[2] === undefined ? 1 : numberOf(raws[2], 1)) ?? 1;
      for (let index = 0; index < values.length; index += 1) {
        if (looseEqual(values[index], lookup)) return index + 1;
      }
      if (type === 0) throw errors.na;
      let best = -1;
      for (let index = 0; index < values.length; index += 1) {
        const value = values[index];
        throwIfError(value);
        const left = Number(textOf(value));
        const right = Number(textOf(lookup));
        if (!Number.isFinite(left) || !Number.isFinite(right)) continue;
        if (type > 0 ? left <= right : left >= right) best = index;
      }
      if (best < 0) throw errors.na;
      return best + 1;
    },
    INDEX: (...raws) => {
      // INDEX is one of the parser's context functions: it receives the parser
      // context first and raw references, not the usual { value } envelopes.
      const first = raws[0];
      const context = first !== null && typeof first === 'object' && 'utils' in first ? first as ParserContext : undefined;
      const args = context === undefined ? raws : raws.slice(1);
      const extracted = extractArgument(args[0], context);
      const rowRaw = extractArgument(args[1], context);
      const row = Number(rowRaw);
      if (!Number.isInteger(row) || row < 1) throw errors.value;
      let matrix: unknown[][];
      if (Array.isArray(extracted) && extracted.length > 0 && Array.isArray(extracted[0])) {
        matrix = extracted as unknown[][];
      } else if (Array.isArray(extracted)) {
        matrix = [extracted];
      } else {
        matrix = [[extracted]];
      }
      if (matrix.length === 1 || (matrix[0]?.length ?? 0) === 1) {
        const line = matrix.length === 1 ? matrix[0] ?? [] : matrix.map((entries) => entries[0]);
        const item = line[row - 1];
        if (item === undefined) throw errors.ref;
        throwIfError(item);
        return item;
      }
      const columnRaw = args[2] === undefined ? 1 : Number(extractArgument(args[2], context));
      if (!Number.isInteger(columnRaw) || columnRaw < 1) throw errors.value;
      const line = matrix[row - 1];
      const item = line?.[columnRaw - 1];
      if (item === undefined) throw errors.ref;
      throwIfError(item);
      return item;
    },
    LOOKUP: (...raws) => {
      const lookup = firstValue(raws[0]);
      const lookupValues = valuesOf(raws[1]).values;
      const resultValues = raws[2] === undefined ? lookupValues : valuesOf(raws[2]).values;
      let best = -1;
      for (let index = 0; index < lookupValues.length; index += 1) {
        const value = lookupValues[index];
        throwIfError(value);
        const left = Number(textOf(value));
        const right = Number(textOf(lookup));
        if (!Number.isFinite(left) || !Number.isFinite(right)) continue;
        if (left <= right) best = index;
      }
      if (best < 0 || resultValues[best] === undefined) throw errors.na;
      return resultValues[best];
    },
    RANK: (...raws) => {
      const target = numberOf(raws[0], undefined);
      if (target === undefined) throw errors.value;
      const values = numbersOf([raws[1]]);
      const ascending = numberOf(raws[2], 0) === 1;
      if (!values.includes(target)) throw errors.na;
      const better = values.filter((value) => (ascending ? value < target : value > target)).length;
      return better + 1;
    },
    STDEV: (...raws) => sampleDeviation(raws, true, errors),
    STDEVP: (...raws) => sampleDeviation(raws, false, errors),
    VAR: (...raws) => sampleVariance(raws, true, errors),
    VARP: (...raws) => sampleVariance(raws, false, errors),
    SUMIFS: (...raws) => {
      const values = filteredNumbers(raws);
      if (values === undefined) throw errors.value;
      return values.reduce((sum, value) => sum + value, 0);
    },
    COUNTIFS: (...raws) => {
      const positions = matchingIndices(raws, valuesOf(raws[0]).values.length);
      if (positions === undefined) throw errors.value;
      return positions.length;
    },
    AVERAGEIFS: (...raws) => {
      const values = filteredNumbers(raws);
      if (values === undefined) throw errors.value;
      if (values.length === 0) throw errors.div0;
      return values.reduce((sum, value) => sum + value, 0) / values.length;
    },
    MAXIFS: (...raws) => {
      const values = filteredNumbers(raws);
      if (values === undefined || values.length === 0) throw errors.value;
      return maximum(values);
    },
    MINIFS: (...raws) => {
      const values = filteredNumbers(raws);
      if (values === undefined || values.length === 0) throw errors.value;
      return minimum(values);
    },
    UPPER: (raw) => textOf(firstValue(raw)).toUpperCase(),
    VALUE: (raw) => {
      const text = textOf(firstValue(raw)).trim();
      const number = Number(text);
      if (text === '' || !Number.isFinite(number)) throw errors.value;
      return number;
    },
    TEXTJOIN: (...raws) => {
      const separator = textOf(firstValue(raws[0]));
      const ignoreEmpty = firstValue(raws[1]) === true || textOf(firstValue(raws[1])).toUpperCase() === 'TRUE';
      const parts: string[] = [];
      for (const raw of raws.slice(2)) {
        const { values } = valuesOf(raw);
        for (const value of values) {
          throwIfError(value);
          if (ignoreEmpty && (value === null || value === undefined || value === '')) continue;
          parts.push(textOf(value));
        }
      }
      return parts.join(separator);
    },
    XLOOKUP: (...raws) => {
      const lookup = firstValue(raws[0]);
      const lookupValues = valuesOf(raws[1]).values;
      const resultValues = valuesOf(raws[2]).values;
      for (let index = 0; index < lookupValues.length; index += 1) {
        if (looseEqual(lookupValues[index], lookup)) {
          const result = resultValues[index];
          throwIfError(result);
          return result;
        }
      }
      if (raws[3] !== undefined) return firstValue(raws[3]);
      throw errors.na;
    },
  };
}
