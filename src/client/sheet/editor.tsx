import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, ClipboardEvent, KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from 'react';
import { Button, Menu, Modal, Tooltip } from '@deepseek-ai/dsh-client-ui-primitives';
import type { MenuEntry } from '@deepseek-ai/dsh-client-ui-primitives';
import { SHEET_LIMITS, columnName, formatCellRef, formatRangeRef, mergeStyle, parseCellRef, parseRangeRef, parseSheetWorkbook, rangeSize, serializeSheetWorkbook } from '../../sheet/model.js';
import type { CellRange, NumberFormat, SheetCell, SheetData, SheetStyle, SheetStylePatch, SheetWorkbook } from '../../sheet/model.js';
import { evaluateWorkbook } from '../../sheet/formula.js';
import type { EvaluatedWorkbook } from '../../sheet/formula.js';
import { selectionQuote } from '../../sheet/output.js';
import { tokenVariables } from '../../contract.js';
import type { SheetEditorHandle, SheetEditorOptions } from './entry.js';

const ROW_HEIGHT = 28;
const HEADER_HEIGHT = 28;
const ROW_HEADER_WIDTH = 48;
const DEFAULT_COLUMN_WIDTH = SHEET_LIMITS.defaultColumnWidth;
const HISTORY_LIMIT = 50;

interface CellPosition {
  row: number;
  column: number;
}

interface Selection {
  anchor: CellPosition;
  focus: CellPosition;
}

interface EditingCell {
  row: number;
  column: number;
  draft: string;
  initial: string;
}

interface Appearance {
  design: import('../../contract.js').DesignTokens | undefined;
  dark: boolean;
}

interface Widths {
  widths: number[];
  starts: number[];
  total: number;
}

type Move = 'up' | 'down' | 'left' | 'right' | 'pageup' | 'pagedown' | 'home' | 'end';

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}

function positionOf(row: number, column: number): CellPosition {
  return { row: clamp(row, 1, SHEET_LIMITS.maxRows), column: clamp(column, 0, SHEET_LIMITS.maxColumns - 1) };
}

function rangeOf(selection: Selection): CellRange {
  return {
    row1: Math.min(selection.anchor.row, selection.focus.row),
    column1: Math.min(selection.anchor.column, selection.focus.column),
    row2: Math.max(selection.anchor.row, selection.focus.row),
    column2: Math.max(selection.anchor.column, selection.focus.column),
  };
}

function rangeText(range: CellRange): string {
  return rangeSize(range) === 1
    ? formatCellRef(range.row1, range.column1)
    : formatRangeRef(range);
}

function sheetAt(workbook: SheetWorkbook, index: number): SheetData | undefined {
  return workbook.sheets[index];
}

function rawCellText(cell: SheetCell | undefined): string {
  if (cell === undefined) return '';
  if (cell.formula !== undefined) return cell.formula;
  if (cell.value === undefined) return '';
  if (typeof cell.value === 'boolean') return cell.value ? 'TRUE' : 'FALSE';
  return String(cell.value);
}

function numericText(text: string): number | null {
  const percent = /^([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?)\s*%$/.exec(text.trim());
  if (percent !== null) {
    const value = Number(percent[1]);
    return Number.isFinite(value) ? value / 100 : null;
  }
  const money = /^([+-]?)\$?\s*((?:\d{1,3}(?:,\d{3})*|\d+)(?:\.\d+)?)$/.exec(text.trim());
  if (money !== null) {
    const value = Number((money[1] ?? '') + (money[2] ?? '').replace(/,/g, ''));
    return Number.isFinite(value) ? value : null;
  }
  if (/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(text.trim())) {
    const value = Number(text.trim());
    return Number.isFinite(value) ? value : null;
  }
  return null;
}

function typedCell(text: string, style: SheetStyle | undefined): SheetCell | undefined {
  const keepStyle = style === undefined ? {} : { style: { ...style } };
  const trimmed = text.trim();
  if (trimmed === '' && !text.startsWith("'")) {
    return style === undefined ? undefined : { style: { ...style } };
  }
  if (text.startsWith("'")) return { value: text.slice(1), ...keepStyle };
  if (text.startsWith('=') && trimmed.length > 1) return { formula: text, ...keepStyle };
  const upper = trimmed.toUpperCase();
  if (upper === 'TRUE') return { value: true, ...keepStyle };
  if (upper === 'FALSE') return { value: false, ...keepStyle };
  const number = numericText(text);
  if (number !== null) return { value: number, ...keepStyle };
  return { value: text, ...keepStyle };
}

function withCell(workbook: SheetWorkbook, sheetIndex: number, row: number, column: number, cell: SheetCell | undefined): SheetWorkbook {
  const sheets = workbook.sheets.map((sheet, index) => {
    if (index !== sheetIndex) return sheet;
    const cells = { ...sheet.cells };
    const ref = formatCellRef(row, column);
    if (cell === undefined) delete cells[ref];
    else cells[ref] = cell;
    return { ...sheet, cells };
  });
  return { schemaVersion: SHEET_SCHEMA_VERSION_LOCAL, sheets };
}

const SHEET_SCHEMA_VERSION_LOCAL = 1;

function widthList(sheet: SheetData | undefined): Widths {
  const widths: number[] = [];
  const starts: number[] = [];
  let total = 0;
  for (let column = 0; column < SHEET_LIMITS.maxColumns; column += 1) {
    const name = columnName(column);
    starts.push(total);
    const width = sheet?.columnWidths?.[name] ?? DEFAULT_COLUMN_WIDTH;
    widths.push(width);
    total += width;
  }
  starts.push(total);
  return { widths, starts, total };
}

function columnAt(starts: number[], x: number): number {
  let low = 0;
  let high = SHEET_LIMITS.maxColumns - 1;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if ((starts[middle] ?? 0) <= x) low = middle;
    else high = middle - 1;
  }
  return low;
}

function existingRefsInRange(sheet: SheetData, range: CellRange): string[] {
  const refs: string[] = [];
  for (const ref of Object.keys(sheet.cells)) {
    const index = parseCellRef(ref);
    if (index === undefined) continue;
    if (index.row >= range.row1 && index.row <= range.row2 && index.column >= range.column1 && index.column <= range.column2) refs.push(ref);
  }
  return refs;
}

function applyStyleToRange(workbook: SheetWorkbook, sheetIndex: number, range: CellRange, patch: SheetStylePatch, fallback: string): SheetWorkbook {
  const sheet = sheetAt(workbook, sheetIndex);
  if (sheet === undefined) return workbook;
  const refs = existingRefsInRange(sheet, range);
  const targets = refs.length === 0 ? [fallback] : refs;
  const sheets = workbook.sheets.map((item, index) => {
    if (index !== sheetIndex) return item;
    const cells = { ...item.cells };
    for (const ref of targets) {
      const existing = cells[ref] ?? {};
      const merged = mergeStyle(existing.style, patch);
      const next: SheetCell = { ...existing };
      if (merged === undefined) delete next.style;
      else next.style = merged;
      if (next.formula === undefined && next.value === undefined && next.style === undefined) delete cells[ref];
      else cells[ref] = next;
    }
    return { ...item, cells };
  });
  return { schemaVersion: SHEET_SCHEMA_VERSION_LOCAL, sheets };
}

function clearRange(workbook: SheetWorkbook, sheetIndex: number, range: CellRange): SheetWorkbook {
  const sheets = workbook.sheets.map((sheet, index) => {
    if (index !== sheetIndex) return sheet;
    const cells = { ...sheet.cells };
    for (const ref of existingRefsInRange(sheet, range)) delete cells[ref];
    return { ...sheet, cells };
  });
  return { schemaVersion: SHEET_SCHEMA_VERSION_LOCAL, sheets };
}

function pasteGrid(workbook: SheetWorkbook, sheetIndex: number, row: number, column: number, rows: string[][]): SheetWorkbook {
  const sheet = sheetAt(workbook, sheetIndex);
  if (sheet === undefined) return workbook;
  const cells = { ...sheet.cells };
  rows.forEach((values, rowOffset) => {
    values.forEach((text, columnOffset) => {
      const ref = formatCellRef(row + rowOffset, column + columnOffset);
      const existing = cells[ref];
      const next = typedCell(text, existing?.style);
      if (next === undefined) delete cells[ref];
      else cells[ref] = next;
    });
  });
  const sheets = workbook.sheets.map((item, index) => (index === sheetIndex ? { ...item, cells } : item));
  return { schemaVersion: SHEET_SCHEMA_VERSION_LOCAL, sheets };
}

function addSheetToWorkbook(workbook: SheetWorkbook, name: string): SheetWorkbook {
  return { schemaVersion: SHEET_SCHEMA_VERSION_LOCAL, sheets: [...workbook.sheets, { name, cells: {} }] };
}

function nextSheetName(workbook: SheetWorkbook): string {
  for (let index = 1; index <= SHEET_LIMITS.maxSheets + 1; index += 1) {
    const name = 'Sheet' + String(index);
    if (!workbook.sheets.some((sheet) => sheet.name.toLowerCase() === name.toLowerCase())) return name;
  }
  return 'Sheet' + String(workbook.sheets.length + 1);
}

function renameSheetInWorkbook(workbook: SheetWorkbook, index: number, name: string): SheetWorkbook {
  return { schemaVersion: SHEET_SCHEMA_VERSION_LOCAL, sheets: workbook.sheets.map((sheet, item) => (item === index ? { ...sheet, name } : sheet)) };
}

function deleteSheetFromWorkbook(workbook: SheetWorkbook, index: number): SheetWorkbook {
  return { schemaVersion: SHEET_SCHEMA_VERSION_LOCAL, sheets: workbook.sheets.filter((_sheet, item) => item !== index) };
}

function setColumnWidthInWorkbook(workbook: SheetWorkbook, sheetIndex: number, column: number, width: number): SheetWorkbook {
  const sheets = workbook.sheets.map((sheet, index) => {
    if (index !== sheetIndex) return sheet;
    const columnWidths = { ...(sheet.columnWidths ?? {}) };
    columnWidths[columnName(column)] = Math.round(width);
    return { ...sheet, columnWidths };
  });
  return { schemaVersion: SHEET_SCHEMA_VERSION_LOCAL, sheets };
}

function parseInitial(content: string): { workbook: SheetWorkbook | null; error: string | null } {
  try {
    return { workbook: parseSheetWorkbook(content), error: null };
  } catch (error) {
    return { workbook: null, error: error instanceof Error ? error.message : 'The sheet content is invalid.' };
  }
}

/** One SVG glyph for align buttons. */
function AlignGlyph({ align }: { align: 'left' | 'center' | 'right' }) {
  const lines = align === 'left'
    ? ['M3 4.5h10', 'M3 8h7', 'M3 11.5h10']
    : align === 'right'
      ? ['M3 4.5h10', 'M6 8h7', 'M3 11.5h10']
      : ['M3 4.5h10', 'M4.5 8h7', 'M3 11.5h10'];
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" aria-hidden="true">
      {lines.map((line, index) => <path key={index} d={line} />)}
    </svg>
  );
}

/** One SVG glyph for undo and redo. */
function HistoryGlyph({ direction }: { direction: 'undo' | 'redo' }) {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {direction === 'undo'
        ? <path d="M4 6.5h5.5a3 3 0 0 1 0 6H7M4 6.5l2.5-2.5M4 6.5L6.5 9" />
        : <path d="M12 6.5H6.5a3 3 0 0 0 0 6H9M12 6.5L9.5 4M12 6.5L9.5 9" />}
    </svg>
  );
}

const NUMBER_FORMATS = ['general', 'number', 'integer', 'currency', 'percent', 'date'] as const;

/** Literal locale keys keep the coverage check able to find every visible string. */
const FORMAT_LABELS: Record<NumberFormat, string> = {
  general: 'sheet.format.general',
  number: 'sheet.format.number',
  integer: 'sheet.format.integer',
  currency: 'sheet.format.currency',
  percent: 'sheet.format.percent',
  date: 'sheet.format.date',
};

/**
 * The sheet editor: a virtualized grid, a formula bar, formatting, sheet tabs,
 * undo and redo, and clipboard edits. It owns the workbook and reports every
 * change as JSON through the live callbacks.
 * @param props the mount options and the handle registrar.
 * @returns the editor.
 */
export function SheetEditor({ options, register }: { options: SheetEditorOptions; register: (handle: SheetEditorHandle) => void }) {
  const live = options.live;
  const t = live.current.t;
  const initialContent = useRef(options.content);
  const initial = useRef(parseInitial(options.content));
  const [workbook, setWorkbook] = useState<SheetWorkbook | null>(initial.current.workbook);
  const [error, setError] = useState<string | null>(initial.current.error);
  const [activeSheet, setActiveSheet] = useState(0);
  const [selection, setSelection] = useState<Selection>({ anchor: { row: 1, column: 0 }, focus: { row: 1, column: 0 } });
  const [editing, setEditing] = useState<EditingCell | null>(null);
  const [barDraft, setBarDraft] = useState('');
  const [scroll, setScroll] = useState({ top: 0, left: 0 });
  const [viewport, setViewport] = useState({ width: 640, height: 420 });
  const [editable, setEditable] = useState(options.editable);
  const [appearance, setAppearance] = useState<Appearance>({ design: options.design, dark: options.dark });
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [numberMenu, setNumberMenu] = useState(false);
  const [sheetMenu, setSheetMenu] = useState(false);
  const [renaming, setRenaming] = useState<{ index: number; text: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [columnDrag, setColumnDrag] = useState<{ column: number; width: number } | null>(null);

  const workbookRef = useRef<SheetWorkbook | null>(workbook);
  const history = useRef<{ past: string[]; future: string[] }>({ past: [], future: [] });
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const editingRef = useRef<HTMLInputElement | null>(null);
  const dragging = useRef(false);

  const sheet = workbook === null ? undefined : sheetAt(workbook, activeSheet);
  const evaluated = useMemo<EvaluatedWorkbook | null>(() => (workbook === null ? null : evaluateWorkbook(workbook)), [workbook]);
  const widths = useMemo(() => widthList(sheet), [sheet]);
  const range = useMemo(() => rangeOf(selection), [selection]);
  const activeRef = formatCellRef(selection.focus.row, selection.focus.column);
  const activeCell = sheet?.cells[activeRef];
  const activeResult = evaluated === null || sheet === undefined ? undefined : evaluated.results[sheet.name]?.[activeRef];
  const activeStyle = activeCell?.style;
  const selectedText = rangeText(range);

  const tokenStyle = useMemo<CSSProperties>(() => {
    if (appearance.design === undefined) return {};
    return { ...tokenVariables(appearance.design, appearance.dark), colorScheme: appearance.dark ? 'dark' : 'light' };
  }, [appearance]);

  const selectedDisplayStyle: CSSProperties = {
    left: widths.starts[range.column1] ?? 0,
    top: (range.row1 - 1) * ROW_HEIGHT,
    width: (widths.starts[range.column2 + 1] ?? 0) - (widths.starts[range.column1] ?? 0),
    height: (range.row2 - range.row1 + 1) * ROW_HEIGHT,
  };
  const activeDisplayStyle: CSSProperties = {
    left: widths.starts[selection.focus.column] ?? 0,
    top: (selection.focus.row - 1) * ROW_HEIGHT,
    width: widths.widths[selection.focus.column] ?? DEFAULT_COLUMN_WIDTH,
    height: ROW_HEIGHT,
  };

  const pushHistory = (before: string): void => {
    const past = history.current.past;
    past.push(before);
    if (past.length > HISTORY_LIMIT) past.shift();
    history.current.future.length = 0;
    setCanUndo(past.length > 0);
    setCanRedo(false);
  };

  const commit = useCallback((mutate: (current: SheetWorkbook) => SheetWorkbook): void => {
    const current = workbookRef.current;
    if (current === null || !editable) return;
    const before = serializeSheetWorkbook(current);
    const next = mutate(current);
    if (serializeSheetWorkbook(next) === before) return;
    pushHistory(before);
    workbookRef.current = next;
    setWorkbook(next);
    live.current.onChange(serializeSheetWorkbook(next));
  }, [editable, live]);

  const loadContent = useCallback((json: string): void => {
    const parsed = parseInitial(json);
    initialContent.current = json;
    workbookRef.current = parsed.workbook;
    setWorkbook(parsed.workbook);
    setError(parsed.error);
    setEditing(null);
    setActiveSheet(0);
    setSelection({ anchor: { row: 1, column: 0 }, focus: { row: 1, column: 0 } });
    history.current = { past: [], future: [] };
    setCanUndo(false);
    setCanRedo(false);
  }, []);

  useEffect(() => {
    register({
      getJson: () => (workbookRef.current === null ? initialContent.current : serializeSheetWorkbook(workbookRef.current)),
      setContent: (json) => loadContent(json),
      setEditable: (value) => setEditable(value),
      setAppearance: (design, dark) => setAppearance({ design, dark }),
      destroy: () => undefined,
    });
  }, [loadContent, register]);

  useEffect(() => {
    const element = viewportRef.current;
    if (element === null) return undefined;
    const measure = (): void => {
      setViewport({
        width: Math.max(120, element.clientWidth - ROW_HEADER_WIDTH),
        height: Math.max(120, element.clientHeight - HEADER_HEIGHT),
      });
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (editing !== null) return;
    setBarDraft(rawCellText(activeCell));
  }, [activeSheet, activeCell, editing, selection.focus.row, selection.focus.column]);

  useEffect(() => {
    if (editing === null) return;
    const input = editingRef.current;
    if (input === null) return;
    input.focus();
    input.setSelectionRange(editing.draft.length, editing.draft.length);
  }, [editing?.row, editing?.column]);

  useEffect(() => {
    if (workbook === null || evaluated === null || sheet === undefined) return;
    const empty = activeCell === undefined && activeResult === undefined;
    live.current.onSelectionText(rangeSize(range) === 1 && empty ? '' : selectionQuote(workbook, evaluated, sheet.name, formatRangeRef(range)));
  }, [workbook, evaluated, sheet, range, activeCell, activeResult, live]);

  useEffect(() => {
    setSelection({ anchor: { row: 1, column: 0 }, focus: { row: 1, column: 0 } });
    setEditing(null);
  }, [activeSheet]);

  const ensureVisible = (target: CellPosition): void => {
    const element = scrollRef.current;
    if (element === null) return;
    const top = (target.row - 1) * ROW_HEIGHT;
    if (top < element.scrollTop) element.scrollTop = top;
    else if (top + ROW_HEIGHT > element.scrollTop + element.clientHeight) element.scrollTop = top + ROW_HEIGHT - element.clientHeight;
    const left = widths.starts[target.column] ?? 0;
    const width = widths.widths[target.column] ?? DEFAULT_COLUMN_WIDTH;
    if (left < element.scrollLeft) element.scrollLeft = left;
    else if (left + width > element.scrollLeft + element.clientWidth) element.scrollLeft = left + width - element.clientWidth;
  };

  const moveFocus = (move: Move, extend: boolean): void => {
    const focus = selection.focus;
    const page = Math.max(1, Math.floor(viewport.height / ROW_HEIGHT) - 1);
    let row = focus.row;
    let column = focus.column;
    switch (move) {
      case 'up': row -= 1; break;
      case 'down': row += 1; break;
      case 'left': column -= 1; break;
      case 'right': column += 1; break;
      case 'pageup': row -= page; break;
      case 'pagedown': row += page; break;
      case 'home': column = 0; break;
      case 'end': column = SHEET_LIMITS.maxColumns - 1; break;
      default: break;
    }
    const target = positionOf(row, column);
    setSelection(extend ? { anchor: selection.anchor, focus: target } : { anchor: target, focus: target });
    ensureVisible(target);
  };

  const selectCell = (row: number, column: number, extend: boolean): void => {
    const target = positionOf(row, column);
    setSelection(extend ? { anchor: selection.anchor, focus: target } : { anchor: target, focus: target });
    ensureVisible(target);
  };

  const beginEdit = (row: number, column: number, replacement?: string): void => {
    if (!editable || workbook === null) return;
    const cell = sheet?.cells[formatCellRef(row, column)];
    const current = rawCellText(cell);
    setSelection({ anchor: { row, column }, focus: { row, column } });
    setEditing({ row, column, draft: replacement === undefined ? current : replacement, initial: current });
  };

  const cancelEdit = (): void => {
    setEditing(null);
    setBarDraft(rawCellText(activeCell));
  };

  const commitEdit = (move: Move | null): void => {
    if (editing === null) return;
    const { row, column, draft, initial } = editing;
    setEditing(null);
    if (draft !== initial) {
      const style = sheet?.cells[formatCellRef(row, column)]?.style;
      const next = typedCell(draft, style);
      commit(current => withCell(current, activeSheet, row, column, next));
    }
    if (move !== null) moveFocus(move, false);
  };

  const applyPatch = (patch: SheetStylePatch): void => {
    const fallback = formatCellRef(selection.focus.row, selection.focus.column);
    const targetSheet = activeSheet;
    const selectedRange = range;
    commit(current => applyStyleToRange(current, targetSheet, selectedRange, patch, fallback));
  };

  const activePressed = (key: 'bold' | 'italic' | 'underline' | 'strike'): boolean => activeStyle?.[key] === true;

  const toggleFormat = (key: 'bold' | 'italic' | 'underline' | 'strike'): void => {
    applyPatch({ [key]: activePressed(key) ? null : true });
  };

  const undo = (): void => {
    const past = history.current.past;
    const json = past.pop();
    if (json === undefined || workbookRef.current === null) return;
    history.current.future.push(serializeSheetWorkbook(workbookRef.current));
    const parsed = parseInitial(json);
    workbookRef.current = parsed.workbook;
    setWorkbook(parsed.workbook);
    setCanUndo(past.length > 0);
    setCanRedo(true);
    live.current.onChange(json);
  };

  const redo = (): void => {
    const future = history.current.future;
    const json = future.pop();
    if (json === undefined || workbookRef.current === null) return;
    history.current.past.push(serializeSheetWorkbook(workbookRef.current));
    const parsed = parseInitial(json);
    workbookRef.current = parsed.workbook;
    setWorkbook(parsed.workbook);
    setCanUndo(true);
    setCanRedo(future.length > 0);
    live.current.onChange(json);
  };

  const selectionTsv = (): string => {
    if (workbook === null || sheet === undefined) return '';
    const rows: string[] = [];
    const lastRow = Math.min(range.row2, range.row1 + 1999);
    for (let row = range.row1; row <= lastRow; row += 1) {
      const values: string[] = [];
      for (let column = range.column1; column <= range.column2; column += 1) values.push(rawCellText(sheet.cells[formatCellRef(row, column)]));
      rows.push(values.join('\t'));
    }
    return rows.join('\n');
  };

  const onCopy = (event: ClipboardEvent<HTMLDivElement>): void => {
    event.preventDefault();
    event.clipboardData.setData('text/plain', selectionTsv());
  };

  const onCut = (event: ClipboardEvent<HTMLDivElement>): void => {
    event.preventDefault();
    event.clipboardData.setData('text/plain', selectionTsv());
    const targetSheet = activeSheet;
    const selectedRange = range;
    commit(current => clearRange(current, targetSheet, selectedRange));
  };

  const onPaste = (event: ClipboardEvent<HTMLDivElement>): void => {
    if (!editable) return;
    event.preventDefault();
    const text = event.clipboardData.getData('text/plain');
    if (text === '') return;
    const rows = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
    if (rows.length > 0 && rows[rows.length - 1] === '') rows.pop();
    const grid = rows.map((line) => line.split('\t'));
    const targetSheet = activeSheet;
    const start = selection.focus;
    commit(current => pasteGrid(current, targetSheet, start.row, start.column, grid));
    const lastRow = Math.min(SHEET_LIMITS.maxRows, start.row + Math.max(0, grid.length - 1));
    const lastColumn = Math.min(SHEET_LIMITS.maxColumns - 1, start.column + Math.max(0, (grid[0]?.length ?? 1) - 1));
    setSelection({ anchor: start, focus: { row: lastRow, column: lastColumn } });
  };

  const clearSelection = (): void => {
    const targetSheet = activeSheet;
    const selectedRange = range;
    commit(current => clearRange(current, targetSheet, selectedRange));
  };

  const onGridKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>): void => {
    if (editing !== null) return;
    if (workbook === null || sheet === undefined) return;
    const modifier = event.ctrlKey || event.metaKey;
    if (modifier && event.key.toLowerCase() === 's') {
      event.preventDefault();
      live.current.onSave();
      return;
    }
    if (modifier && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      if (event.shiftKey) redo();
      else undo();
      return;
    }
    if (modifier && event.key.toLowerCase() === 'y') {
      event.preventDefault();
      redo();
      return;
    }
    if (modifier && event.key.toLowerCase() === 'a') {
      event.preventDefault();
      setSelection({ anchor: { row: 1, column: 0 }, focus: { row: SHEET_LIMITS.maxRows, column: SHEET_LIMITS.maxColumns - 1 } });
      return;
    }
    if (modifier && (event.key.toLowerCase() === 'b' || event.key.toLowerCase() === 'i' || event.key.toLowerCase() === 'u')) {
      event.preventDefault();
      const key = event.key.toLowerCase() === 'b' ? 'bold' : event.key.toLowerCase() === 'i' ? 'italic' : 'underline';
      toggleFormat(key);
      return;
    }
    const extend = event.shiftKey;
    switch (event.key) {
      case 'ArrowUp': event.preventDefault(); moveFocus('up', extend); return;
      case 'ArrowDown': event.preventDefault(); moveFocus('down', extend); return;
      case 'ArrowLeft': event.preventDefault(); moveFocus('left', extend); return;
      case 'ArrowRight': event.preventDefault(); moveFocus('right', extend); return;
      case 'PageUp': event.preventDefault(); moveFocus('pageup', extend); return;
      case 'PageDown': event.preventDefault(); moveFocus('pagedown', extend); return;
      case 'Home':
        event.preventDefault();
        if (event.ctrlKey || event.metaKey) {
          const corner = { row: 1, column: 0 };
          setSelection(extend ? { anchor: selection.anchor, focus: corner } : { anchor: corner, focus: corner });
          ensureVisible(corner);
        } else {
          moveFocus('home', extend);
        }
        return;
      case 'End': event.preventDefault(); moveFocus('end', extend); return;
      case 'Enter': {
        event.preventDefault();
        if (editable) beginEdit(selection.focus.row, selection.focus.column);
        return;
      }
      case 'Tab': {
        event.preventDefault();
        moveFocus(event.shiftKey ? 'left' : 'right', false);
        return;
      }
      case 'F2': {
        event.preventDefault();
        if (editable) beginEdit(selection.focus.row, selection.focus.column);
        return;
      }
      case 'Delete':
      case 'Backspace':
        event.preventDefault();
        if (editable) clearSelection();
        return;
      case 'Escape':
        event.preventDefault();
        setSelection({ anchor: selection.focus, focus: selection.focus });
        return;
      default:
        break;
    }
    if (editable && event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault();
      beginEdit(selection.focus.row, selection.focus.column, event.key);
    }
  };

  const cellFromPoint = (clientX: number, clientY: number): { row: number; column: number } | null => {
    const element = scrollRef.current;
    if (element === null) return null;
    const rect = element.getBoundingClientRect();
    const x = clientX - rect.left + element.scrollLeft;
    const y = clientY - rect.top + element.scrollTop;
    if (x < 0 || y < 0) return null;
    const row = clamp(Math.floor(y / ROW_HEIGHT) + 1, 1, SHEET_LIMITS.maxRows);
    const column = columnAt(widths.starts, x);
    return { row, column };
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>): void => {
    const target = event.target;
    if (target instanceof HTMLElement && (target.closest('input') !== null || target.closest('.art-sheet-resize') !== null)) return;
    const cell = cellFromPoint(event.clientX, event.clientY);
    if (cell === null) return;
    event.currentTarget.focus();
    setEditing(null);
    selectCell(cell.row, cell.column, event.shiftKey);
    dragging.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (!dragging.current) return;
    const cell = cellFromPoint(event.clientX, event.clientY);
    if (cell === null) return;
    setSelection({ anchor: selection.anchor, focus: { row: cell.row, column: cell.column } });
  };

  const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>): void => {
    dragging.current = false;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };

  const beginColumnResize = (event: ReactPointerEvent<HTMLSpanElement>, column: number): void => {
    if (!editable) return;
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const startWidth = widths.widths[column] ?? DEFAULT_COLUMN_WIDTH;
    const onMove = (moveEvent: PointerEvent): void => {
      const next = clamp(startWidth + (moveEvent.clientX - startX), SHEET_LIMITS.minColumnWidth, SHEET_LIMITS.maxColumnWidth);
      setColumnDrag({ column, width: next });
    };
    const onUp = (upEvent: PointerEvent): void => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      const next = clamp(startWidth + (upEvent.clientX - startX), SHEET_LIMITS.minColumnWidth, SHEET_LIMITS.maxColumnWidth);
      setColumnDrag(null);
      const targetSheet = activeSheet;
      commit(current => setColumnWidthInWorkbook(current, targetSheet, column, next));
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const displayedWidths = useMemo<Widths>(() => {
    if (columnDrag === null) return widths;
    const widthsCopy = widths.widths.slice();
    widthsCopy[columnDrag.column] = columnDrag.width;
    const starts: number[] = [];
    let total = 0;
    for (const width of widthsCopy) {
      starts.push(total);
      total += width;
    }
    starts.push(total);
    return { widths: widthsCopy, starts, total };
  }, [widths, columnDrag]);

  const displayWidths = displayedWidths;

  const addSheet = (): void => {
    if (workbook === null || !editable) return;
    const name = nextSheetName(workbook);
    commit(current => addSheetToWorkbook(current, name));
    setActiveSheet(workbook.sheets.length);
  };

  const startRename = (index: number): void => {
    if (workbook === null || !editable) return;
    const target = workbook.sheets[index];
    if (target === undefined) return;
    setRenaming({ index, text: target.name });
  };

  const commitRename = (): void => {
    if (renaming === null || workbook === null) return;
    const name = renaming.text.trim();
    const index = renaming.index;
    setRenaming(null);
    if (name === '' || name === workbook.sheets[index]?.name) return;
    commit(current => renameSheetInWorkbook(current, index, name));
  };

  const deleteSheet = (): void => {
    if (workbook === null || workbook.sheets.length <= 1) return;
    const index = activeSheet;
    setConfirmDelete(false);
    commit(current => deleteSheetFromWorkbook(current, index));
    setActiveSheet(Math.max(0, index - 1));
  };

  const onScroll = (): void => {
    const element = scrollRef.current;
    if (element === null) return;
    setScroll({ top: element.scrollTop, left: element.scrollLeft });
  };

  const rowStart = Math.max(0, Math.floor(scroll.top / ROW_HEIGHT) - 1);
  const rowEnd = Math.min(SHEET_LIMITS.maxRows - 1, Math.ceil((scroll.top + viewport.height) / ROW_HEIGHT) + 1);
  const columnStart = Math.max(0, columnAt(displayWidths.starts, scroll.left) - 1);
  const columnEnd = Math.min(SHEET_LIMITS.maxColumns - 1, columnAt(displayWidths.starts, scroll.left + viewport.width) + 1);
  const canvasWidth = displayWidths.total;
  const canvasHeight = SHEET_LIMITS.maxRows * ROW_HEIGHT;

  const visibleCells = [];
  for (let rowIndex = rowStart; rowIndex <= rowEnd; rowIndex += 1) {
    for (let columnIndex = columnStart; columnIndex <= columnEnd; columnIndex += 1) {
      const ref = formatCellRef(rowIndex + 1, columnIndex);
      const cell = sheet?.cells[ref];
      const result = sheet === undefined || evaluated === null ? undefined : evaluated.results[sheet.name]?.[ref];
      const display = result?.display ?? '';
      const style = cell?.style;
      const cellStyle: CSSProperties = {
        left: displayWidths.starts[columnIndex] ?? 0,
        top: rowIndex * ROW_HEIGHT,
        width: displayWidths.widths[columnIndex] ?? DEFAULT_COLUMN_WIDTH,
        height: ROW_HEIGHT,
      };
      if (style?.color !== undefined) cellStyle.color = style.color;
      if (style?.background !== undefined) cellStyle.background = style.background;
      if (style?.bold === true) cellStyle.fontWeight = 600;
      if (style?.italic === true) cellStyle.fontStyle = 'italic';
      if (style?.underline === true || style?.strike === true) cellStyle.textDecoration = (style.underline === true ? 'underline ' : '') + (style.strike === true ? 'line-through' : '');
      if (style?.align !== undefined) cellStyle.textAlign = style.align;
      else if (typeof result?.value === 'number') cellStyle.textAlign = 'right';
      visibleCells.push(
        <div className="art-sheet-cell" key={ref} style={cellStyle} role="gridcell" aria-rowindex={rowIndex + 1} aria-colindex={columnIndex + 1} data-cell={ref}>
          {display}
        </div>,
      );
    }
  }

  const columnHeaders = [];
  for (let columnIndex = columnStart; columnIndex <= columnEnd; columnIndex += 1) {
    const active = columnIndex >= range.column1 && columnIndex <= range.column2;
    columnHeaders.push(
      <div className="art-sheet-colhead" key={columnIndex} data-active={active ? 'true' : undefined} style={{ left: displayWidths.starts[columnIndex] ?? 0, width: displayWidths.widths[columnIndex] ?? DEFAULT_COLUMN_WIDTH }}>
        <button type="button" className="art-sheet-headbutton" aria-label={t('sheet.selectColumn', { name: columnName(columnIndex) })} onClick={() => setSelection({ anchor: { row: 1, column: columnIndex }, focus: { row: SHEET_LIMITS.maxRows, column: columnIndex } })}>{columnName(columnIndex)}</button>
        {editable ? <span className="art-sheet-resize" role="separator" aria-orientation="vertical" onPointerDown={(event) => beginColumnResize(event, columnIndex)} /> : null}
      </div>,
    );
  }

  const rowHeaders = [];
  for (let rowIndex = rowStart; rowIndex <= rowEnd; rowIndex += 1) {
    const active = rowIndex + 1 >= range.row1 && rowIndex + 1 <= range.row2;
    rowHeaders.push(
      <div className="art-sheet-rowhead" key={rowIndex} data-active={active ? 'true' : undefined} style={{ top: rowIndex * ROW_HEIGHT, height: ROW_HEIGHT }}>
        <button type="button" className="art-sheet-headbutton" aria-label={t('sheet.selectRow', { row: rowIndex + 1 })} onClick={() => setSelection({ anchor: { row: rowIndex + 1, column: 0 }, focus: { row: rowIndex + 1, column: SHEET_LIMITS.maxColumns - 1 } })}>{rowIndex + 1}</button>
      </div>,
    );
  }

  const numberEntries: MenuEntry[] = NUMBER_FORMATS.map((format) => ({ id: format, label: t(FORMAT_LABELS[format]) }));
  const sheetEntries: MenuEntry[] = [
    { id: 'rename', label: t('sheet.renameSheet') },
    { id: 'delete', label: t('sheet.deleteSheet'), danger: true, disabled: workbook === null || workbook.sheets.length <= 1 },
  ];
  const editingStyle = editing === null ? undefined : sheet?.cells[formatCellRef(editing.row, editing.column)]?.style;

  return (
    <div className="art-sheet-editor" style={tokenStyle}>
      <div className="art-sheet-toolbar" role="toolbar" aria-label={t('sheet.toolbar')}>
        <div className="art-sheet-formula">
          <span className="art-sheet-ref" title={t('sheet.selection')}>{selectedText}</span>
          <input
            className="art-sheet-formula-input"
            aria-label={t('sheet.formulaBar')}
            value={editing === null ? barDraft : editing.draft}
            readOnly={!editable}
            spellCheck={false}
            onChange={(event) => {
              if (!editable) return;
              if (editing === null) {
                setEditing({ row: selection.focus.row, column: selection.focus.column, draft: event.target.value, initial: barDraft });
              } else {
                setEditing({ ...editing, draft: event.target.value });
              }
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                commitEdit('down');
              } else if (event.key === 'Escape') {
                event.preventDefault();
                cancelEdit();
              } else if (event.key === 'Tab') {
                event.preventDefault();
                commitEdit('right');
              }
            }}
            onBlur={() => {
              if (editing !== null) commitEdit(null);
            }}
          />
        </div>
        <div className="art-sheet-formatbar">
          <Tooltip label={t('sheet.undo')} side="bottom" portal><Button size="sm" variant="ghost" className="art-sheet-tool" aria-label={t('sheet.undo')} disabled={!editable || !canUndo} onClick={undo}><HistoryGlyph direction="undo" /></Button></Tooltip>
          <Tooltip label={t('sheet.redo')} side="bottom" portal><Button size="sm" variant="ghost" className="art-sheet-tool" aria-label={t('sheet.redo')} disabled={!editable || !canRedo} onClick={redo}><HistoryGlyph direction="redo" /></Button></Tooltip>
          <span className="art-sheet-divider" aria-hidden="true" />
          <Button size="sm" variant="ghost" className="art-sheet-tool art-sheet-tool-text" aria-label={t('sheet.bold')} aria-pressed={activePressed('bold')} disabled={!editable} onClick={() => toggleFormat('bold')}><span style={{ fontWeight: 700 }}>B</span></Button>
          <Button size="sm" variant="ghost" className="art-sheet-tool art-sheet-tool-text" aria-label={t('sheet.italic')} aria-pressed={activePressed('italic')} disabled={!editable} onClick={() => toggleFormat('italic')}><span style={{ fontStyle: 'italic', fontFamily: 'serif' }}>I</span></Button>
          <Button size="sm" variant="ghost" className="art-sheet-tool art-sheet-tool-text" aria-label={t('sheet.underline')} aria-pressed={activePressed('underline')} disabled={!editable} onClick={() => toggleFormat('underline')}><span style={{ textDecoration: 'underline' }}>U</span></Button>
          <span className="art-sheet-divider" aria-hidden="true" />
          <Button size="sm" variant="ghost" className="art-sheet-tool" aria-label={t('sheet.alignLeft')} aria-pressed={activeStyle?.align === 'left'} disabled={!editable} onClick={() => applyPatch({ align: 'left' })}><AlignGlyph align="left" /></Button>
          <Button size="sm" variant="ghost" className="art-sheet-tool" aria-label={t('sheet.alignCenter')} aria-pressed={activeStyle?.align === 'center'} disabled={!editable} onClick={() => applyPatch({ align: 'center' })}><AlignGlyph align="center" /></Button>
          <Button size="sm" variant="ghost" className="art-sheet-tool" aria-label={t('sheet.alignRight')} aria-pressed={activeStyle?.align === 'right'} disabled={!editable} onClick={() => applyPatch({ align: 'right' })}><AlignGlyph align="right" /></Button>
          <span className="art-sheet-divider" aria-hidden="true" />
          <Menu
            open={numberMenu}
            onClose={() => setNumberMenu(false)}
            items={numberEntries}
            onSelect={(entry) => {
              setNumberMenu(false);
              applyPatch({ numberFormat: entry === 'general' ? null : entry as NumberFormat });
            }}
            align="start"
            portal
            autoFocus
            anchor={<Button size="sm" variant="ghost" className="art-sheet-tool art-sheet-format-label" aria-label={t('sheet.numberFormat')} aria-haspopup="menu" aria-expanded={numberMenu} disabled={!editable} onClick={() => setNumberMenu((open) => !open)}>{t(FORMAT_LABELS[activeStyle?.numberFormat ?? 'general'])}</Button>}
          />
          <label className="art-sheet-color" title={t('sheet.fillColor')}>
            <input type="color" aria-label={t('sheet.fillColor')} value={activeStyle?.background ?? '#ffffff'} disabled={!editable} onChange={(event) => applyPatch({ background: event.target.value })} />
            <span className="art-sheet-color-swatch" style={{ background: activeStyle?.background ?? 'transparent' }} aria-hidden="true" />
          </label>
          <label className="art-sheet-color" title={t('sheet.textColor')}>
            <input type="color" aria-label={t('sheet.textColor')} value={activeStyle?.color ?? '#1f2933'} disabled={!editable} onChange={(event) => applyPatch({ color: event.target.value })} />
            <span className="art-sheet-color-swatch art-sheet-color-letter" style={{ color: activeStyle?.color ?? 'currentColor' }} aria-hidden="true">A</span>
          </label>
        </div>
      </div>
      {error !== null ? (
        <div className="art-sheet-error" role="alert">
          <p>{t('sheet.invalid')}</p>
          <p className="art-sheet-error-detail">{error}</p>
        </div>
      ) : null}
      <div className="art-sheet-gridwrap" ref={viewportRef}>
        <div className="art-sheet-corner" aria-hidden="true" />
        <div className="art-sheet-colheads" aria-hidden="true">
          <div className="art-sheet-colheads-inner" style={{ width: canvasWidth, transform: 'translateX(' + String(-scroll.left) + 'px)' }}>
            {columnHeaders}
          </div>
        </div>
        <div className="art-sheet-rowheads" aria-hidden="true">
          <div className="art-sheet-rowheads-inner" style={{ height: canvasHeight, transform: 'translateY(' + String(-scroll.top) + 'px)' }}>
            {rowHeaders}
          </div>
        </div>
        <div
          className="art-sheet-scroll"
          ref={scrollRef}
          role="grid"
          tabIndex={0}
          aria-label={options.label}
          aria-rowcount={SHEET_LIMITS.maxRows}
          aria-colcount={SHEET_LIMITS.maxColumns}
          onScroll={onScroll}
          onKeyDown={onGridKeyDown}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onDoubleClick={(event) => {
            const cell = cellFromPoint(event.clientX, event.clientY);
            if (cell !== null && editable) beginEdit(cell.row, cell.column);
          }}
          onCopy={onCopy}
          onCut={onCut}
          onPaste={onPaste}
        >
          <div className="art-sheet-canvas" style={{ width: canvasWidth, height: canvasHeight }}>
            {visibleCells}
            <div className="art-sheet-selected" style={selectedDisplayStyle} aria-hidden="true" />
            <div className="art-sheet-active" style={activeDisplayStyle} aria-hidden="true" />
            {editing === null ? null : (
              <input
                ref={editingRef}
                className="art-sheet-cell-input"
                aria-label={t('sheet.editCell', { ref: formatCellRef(editing.row, editing.column) })}
                style={{
                  left: displayWidths.starts[editing.column] ?? 0,
                  top: (editing.row - 1) * ROW_HEIGHT,
                  width: displayWidths.widths[editing.column] ?? DEFAULT_COLUMN_WIDTH,
                  height: ROW_HEIGHT,
                  fontWeight: editingStyle?.bold === true ? 600 : undefined,
                  fontStyle: editingStyle?.italic === true ? 'italic' : undefined,
                }}
                value={editing.draft}
                spellCheck={false}
                onChange={(event) => setEditing({ ...editing, draft: event.target.value })}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    commitEdit(event.shiftKey ? 'up' : 'down');
                  } else if (event.key === 'Tab') {
                    event.preventDefault();
                    commitEdit(event.shiftKey ? 'left' : 'right');
                  } else if (event.key === 'Escape') {
                    event.preventDefault();
                    cancelEdit();
                  }
                }}
                onBlur={() => {
                  if (editing !== null) commitEdit(null);
                }}
              />
            )}
          </div>
        </div>
      </div>
      <div className="art-sheet-tabs">
        <div className="art-sheet-tablist" role="tablist" aria-label={t('sheet.sheets')}>
          {(workbook?.sheets ?? []).map((item, index) => (
            <div className="art-sheet-tab" key={item.name + ':' + String(index)}>
              {renaming !== null && renaming.index === index ? (
                <input
                  className="art-sheet-tab-input"
                  aria-label={t('sheet.sheetName')}
                  value={renaming.text}
                  autoFocus
                  onChange={(event) => setRenaming({ index, text: event.target.value })}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      commitRename();
                    } else if (event.key === 'Escape') {
                      event.preventDefault();
                      setRenaming(null);
                    }
                  }}
                  onBlur={commitRename}
                />
              ) : (
                <button
                  type="button"
                  role="tab"
                  className="art-sheet-tab-button"
                  aria-selected={index === activeSheet}
                  onClick={() => setActiveSheet(index)}
                  onDoubleClick={() => startRename(index)}
                >
                  {item.name}
                </button>
              )}
            </div>
          ))}
        </div>
        {editable ? <Button size="sm" variant="ghost" className="art-sheet-add" aria-label={t('sheet.addSheet')} onClick={addSheet}>+</Button> : null}
        {editable ? (
          <Menu
            open={sheetMenu}
            onClose={() => setSheetMenu(false)}
            items={sheetEntries}
            onSelect={(entry) => {
              setSheetMenu(false);
              if (entry === 'rename') startRename(activeSheet);
              else if (entry === 'delete') setConfirmDelete(true);
            }}
            side="top"
            align="end"
            portal
            autoFocus
            anchor={<Button size="sm" variant="ghost" className="art-sheet-tab-more" aria-label={t('sheet.sheetActions')} aria-haspopup="menu" aria-expanded={sheetMenu} onClick={() => setSheetMenu((open) => !open)}><svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor" aria-hidden="true"><circle cx="3.5" cy="8" r="1.2" /><circle cx="8" cy="8" r="1.2" /><circle cx="12.5" cy="8" r="1.2" /></svg></Button>}
          />
        ) : null}
      </div>
      <Modal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title={t('sheet.deleteSheet')}
        closeLabel={t('sheet.cancel')}
        description={t('sheet.deleteConfirm', { name: workbook?.sheets[activeSheet]?.name ?? '' })}
        footer={<>
          <Button variant="outline" onClick={() => setConfirmDelete(false)}>{t('sheet.cancel')}</Button>
          <Button variant="primary" onClick={deleteSheet}>{t('sheet.delete')}</Button>
        </>}
      />
    </div>
  );
}
