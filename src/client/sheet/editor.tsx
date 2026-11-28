import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, ClipboardEvent, KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from 'react';
import { Button, IconChevronDownOutlineRegular, IconCloseOutlineRegular, IconEllipsisOutlineRegular, IconPlusOutlineRegular, IconSearchOutlineRegular, Menu, Modal, Tooltip } from '@deepseek-ai/dsh-client-ui-primitives';
import type { MenuEntry } from '@deepseek-ai/dsh-client-ui-primitives';
import { SHEET_LIMITS, columnName, contrastRatio, effectiveTextColor, formatCellRef, formatRangeRef, mergeStyle, parseRangeRef, parseCellRef, parseSheetWorkbook, rangeSize, rangesOverlap, readableTextColor, serializeSheetWorkbook } from '../../sheet/model.js';
import { applySheetOperations } from '../../sheet/operations.js';
import type { CellRange, NumberFormat, SheetCell, SheetData, SheetStyle, SheetStylePatch, SheetWorkbook } from '../../sheet/model.js';
import { evaluateWorkbook, formatScalar } from '../../sheet/formula.js';
import { SHEET_TEXT_METRICS, sheetRowHeights } from '../../sheet/output.js';
import type { EvaluatedWorkbook } from '../../sheet/formula.js';
import { selectionQuote } from '../../sheet/output.js';
import { clampZoom, wheelZoom } from '../canvas/zoom.js';
import { IconRedo, IconUndo } from '../icons.jsx';
import { tokenVariables } from '../../contract.js';
import type { SheetEditorHandle, SheetEditorOptions } from './entry.js';

const HEADER_HEIGHT = 28;
const ROW_HEADER_WIDTH = 48;
const DEFAULT_COLUMN_WIDTH = SHEET_LIMITS.defaultColumnWidth;

/** One step of the zoom buttons and the zoom keys. */
const ZOOM_STEP = 1.25;
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

/** One cell whose text contains the find query. */
interface SheetMatch {
  ref: string;
  row: number;
  column: number;
}

/**
 * Every cell whose stored text contains the query, top-left to bottom-right.
 * A cell covered by a merge is skipped because the grid does not show it.
 */
function findSheetMatches(sheet: SheetData | undefined, query: string, merges: CellRange[]): SheetMatch[] {
  if (sheet === undefined || query === '') return [];
  const needle = query.toLowerCase();
  const matches: SheetMatch[] = [];
  for (const ref of Object.keys(sheet.cells)) {
    const index = parseCellRef(ref);
    if (index === undefined) continue;
    const merge = merges.find((range) => index.row >= range.row1 && index.row <= range.row2 && index.column >= range.column1 && index.column <= range.column2);
    if (merge !== undefined && (merge.row1 !== index.row || merge.column1 !== index.column)) continue;
    if (!rawCellText(sheet.cells[ref]).toLowerCase().includes(needle)) continue;
    matches.push({ ref, row: index.row, column: index.column });
  }
  return matches.sort((left, right) => left.row - right.row || left.column - right.column);
}

/** Replace every occurrence of the query, ignoring case. */
function replaceSheetText(text: string, query: string, replacement: string): string {
  const pattern = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
  return text.replace(pattern, () => replacement);
}

/** The first match at or after a position, wrapping to the top. */
function matchFrom(matches: SheetMatch[], position: CellPosition): SheetMatch | undefined {
  return matches.find((match) => match.row > position.row || (match.row === position.row && match.column >= position.column)) ?? matches[0];
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

function widthList(sheet: SheetData | undefined, scale: number): Widths {
  const widths: number[] = [];
  const starts: number[] = [];
  let total = 0;
  for (let column = 0; column < SHEET_LIMITS.maxColumns; column += 1) {
    const name = columnName(column);
    starts.push(total);
    const width = (sheet?.columnWidths?.[name] ?? DEFAULT_COLUMN_WIDTH) * scale;
    widths.push(width);
    total += width;
  }
  starts.push(total);
  return { widths, starts, total };
}

/** The stored width of one column in pixels, before any zoom. */
function storedWidth(sheet: SheetData | undefined, column: number): number {
  return sheet?.columnWidths?.[columnName(column)] ?? DEFAULT_COLUMN_WIDTH;
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

/** A selection total, rounded to at most two decimals. */
function formatNumberText(value: number): string {
  return formatScalar(Math.round(value * 100) / 100, undefined);
}

/** The wrap-text glyph: a line turning back under itself. */
function WrapGlyph() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2 4.5h12" />
      <path d="M2 8h8.5a2 2 0 0 1 0 4H4" />
      <path d="M5.5 10 3.5 12l2 2" />
    </svg>
  );
}

/** The merge glyph: two cells joined by a bracket. */
function MergeGlyph({ reverse }: { reverse: boolean }) {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" aria-hidden="true">
      {reverse
        ? ['M2 3.5h12', 'M8 3.5v6', 'M5.5 12.5 8 9.5l2.5 3'].map((d, index) => <path key={index} d={d} />)
        : ['M2 3.5h12', 'M8 3.5v6', 'M5.5 9.5 8 12.5l2.5-3'].map((d, index) => <path key={index} d={d} />)}
    </svg>
  );
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
  const [gridBackground, setGridBackground] = useState<string>();
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [numberMenu, setNumberMenu] = useState(false);
  const [sheetMenu, setSheetMenu] = useState(false);
  const [renaming, setRenaming] = useState<{ index: number; text: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [columnDrag, setColumnDrag] = useState<{ column: number; width: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [findOpen, setFindOpen] = useState(false);
  const [findQuery, setFindQuery] = useState('');
  const [replaceOpen, setReplaceOpen] = useState(false);
  const [replacement, setReplacement] = useState('');
  const [currentMatch, setCurrentMatch] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);

  const workbookRef = useRef<SheetWorkbook | null>(workbook);
  const history = useRef<{ past: string[]; future: string[] }>({ past: [], future: [] });
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const editingRef = useRef<HTMLInputElement | null>(null);
  const findInputRef = useRef<HTMLInputElement | null>(null);
  const dragging = useRef(false);

  const sheet = workbook === null ? undefined : sheetAt(workbook, activeSheet);
  const evaluated = useMemo<EvaluatedWorkbook | null>(() => (workbook === null ? null : evaluateWorkbook(workbook)), [workbook]);
  const widths = useMemo(() => widthList(sheet, zoom), [sheet, zoom]);
  const rowStarts = useMemo(() => {
    const extra = sheet === undefined || evaluated === null ? new Map<number, number>() : sheetRowHeights(sheet, evaluated);
    const starts = new Array<number>(SHEET_LIMITS.maxRows + 1);
    let top = 0;
    for (let row = 1; row <= SHEET_LIMITS.maxRows; row += 1) {
      starts[row - 1] = top;
      top += (extra.get(row) ?? SHEET_LIMITS.defaultRowHeight) * zoom;
    }
    starts[SHEET_LIMITS.maxRows] = top;
    return starts;
  }, [sheet, evaluated, zoom]);
  const rowTop = (row: number): number => rowStarts[clamp(row, 1, SHEET_LIMITS.maxRows) - 1] ?? 0;
  const rowHeightAt = (row: number): number => {
    const index = clamp(row, 1, SHEET_LIMITS.maxRows) - 1;
    return (rowStarts[index + 1] ?? 0) - (rowStarts[index] ?? 0);
  };
  const rowAt = (y: number): number => {
    let low = 0;
    let high = SHEET_LIMITS.maxRows - 1;
    while (low < high) {
      const middle = Math.ceil((low + high) / 2);
      if ((rowStarts[middle] ?? 0) <= y) low = middle;
      else high = middle - 1;
    }
    return low + 1;
  };
  const range = useMemo(() => rangeOf(selection), [selection]);
  const mergedRanges = useMemo<CellRange[]>(
    () => (sheet?.merges ?? []).map(parseRangeRef).filter((item): item is CellRange => item !== undefined),
    [sheet],
  );
  const mergeCovering = useCallback((row: number, column: number): CellRange | undefined => {
    const found = mergedRanges.find((item) => row >= item.row1 && row <= item.row2 && column >= item.column1 && column <= item.column2);
    return found;
  }, [mergedRanges]);
  const activeRef = formatCellRef(selection.focus.row, selection.focus.column);
  const activeCell = sheet?.cells[activeRef];
  const activeResult = evaluated === null || sheet === undefined ? undefined : evaluated.results[sheet.name]?.[activeRef];
  const activeStyle = activeCell?.style;
  const selectedText = rangeText(range);
  const matches = useMemo(() => findSheetMatches(sheet, findQuery, mergedRanges), [sheet, findQuery, mergedRanges]);
  const matchRefs = useMemo(() => new Set(matches.map((match) => match.ref)), [matches]);
  const currentMatchIndex = currentMatch === null ? -1 : matches.findIndex((match) => match.ref === currentMatch);

  const tokenStyle = useMemo<CSSProperties>(() => {
    if (appearance.design === undefined) return {};
    return { ...tokenVariables(appearance.design, appearance.dark), colorScheme: appearance.dark ? 'dark' : 'light' };
  }, [appearance]);

  useLayoutEffect(() => {
    const element = viewportRef.current;
    if (element === null) return;
    const channels = getComputedStyle(element).backgroundColor.match(/^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/);
    if (channels !== null) setGridBackground('#' + channels.slice(1).map(channel => Number(channel).toString(16).padStart(2, '0')).join(''));
  }, [appearance.dark]);

  const panelTextColor = (style: SheetStyle | undefined): string | undefined => {
    const color = effectiveTextColor(style);
    if (style?.background !== undefined || color === undefined || gridBackground === undefined) return color;
    return contrastRatio(color, gridBackground) >= 4.5 ? color : readableTextColor(gridBackground);
  };

  const selectedDisplayStyle: CSSProperties = {
    left: widths.starts[range.column1] ?? 0,
    top: rowTop(range.row1),
    width: (widths.starts[range.column2 + 1] ?? 0) - (widths.starts[range.column1] ?? 0),
    height: rowTop(range.row2 + 1) - rowTop(range.row1),
  };
  const activeDisplayStyle: CSSProperties = {
    left: widths.starts[selection.focus.column] ?? 0,
    top: rowTop(selection.focus.row),
    width: widths.widths[selection.focus.column] ?? DEFAULT_COLUMN_WIDTH * zoom,
    height: rowHeightAt(selection.focus.row),
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

  useEffect(() => {
    if (!findOpen) return;
    findInputRef.current?.focus();
    findInputRef.current?.select();
  }, [findOpen]);

  useEffect(() => {
    if (!findOpen || findQuery === '') return;
    if (currentMatch !== null && matches.some((match) => match.ref === currentMatch)) return;
    setCurrentMatch(matches[0]?.ref ?? null);
  }, [findOpen, findQuery, matches, currentMatch]);

  const zoomAnchor = useRef<{ ratio: number; x: number; y: number; offsetX: number; offsetY: number } | null>(null);

  const applyZoom = useCallback((nextZoom: number, anchor?: { x: number; y: number }): void => {
    const element = scrollRef.current;
    if (element === null) return;
    const next = clampZoom(nextZoom);
    if (Math.abs(next - zoom) < 0.0001) return;
    zoomAnchor.current = {
      ratio: next / zoom,
      x: element.scrollLeft + (anchor?.x ?? 0),
      y: element.scrollTop + (anchor?.y ?? 0),
      offsetX: anchor?.x ?? 0,
      offsetY: anchor?.y ?? 0,
    };
    setZoom(next);
  }, [zoom]);

  useLayoutEffect(() => {
    const pending = zoomAnchor.current;
    const element = scrollRef.current;
    if (pending === null || element === null) return;
    zoomAnchor.current = null;
    element.scrollLeft = (pending.x * pending.ratio) - pending.offsetX;
    element.scrollTop = (pending.y * pending.ratio) - pending.offsetY;
  }, [zoom]);

  useEffect(() => {
    const element = viewportRef.current;
    if (element === null) return undefined;
    const onWheel = (event: WheelEvent): void => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      const scroll = scrollRef.current;
      const rect = scroll?.getBoundingClientRect();
      const offsetX = rect === undefined ? 0 : Math.max(0, event.clientX - rect.left);
      const offsetY = rect === undefined ? 0 : Math.max(0, event.clientY - rect.top);
      applyZoom(wheelZoom(zoom, event.deltaY, event.deltaMode), { x: offsetX, y: offsetY });
    };
    element.addEventListener('wheel', onWheel, { passive: false });
    return () => element.removeEventListener('wheel', onWheel);
  }, [applyZoom, zoom]);

  const ensureVisible = (target: CellPosition): void => {
    const element = scrollRef.current;
    if (element === null) return;
    const top = rowTop(target.row);
    const height = rowHeightAt(target.row);
    if (top < element.scrollTop) element.scrollTop = top;
    else if (top + height > element.scrollTop + element.clientHeight) element.scrollTop = top + height - element.clientHeight;
    const left = widths.starts[target.column] ?? 0;
    const width = widths.widths[target.column] ?? DEFAULT_COLUMN_WIDTH * zoom;
    if (left < element.scrollLeft) element.scrollLeft = left;
    else if (left + width > element.scrollLeft + element.clientWidth) element.scrollLeft = left + width - element.clientWidth;
  };

  const moveFocus = (move: Move, extend: boolean): void => {
    const focused = mergeCovering(selection.focus.row, selection.focus.column);
    const focus = focused === undefined
      ? selection.focus
      : { row: move === 'down' || move === 'pagedown' ? focused.row2 : focused.row1, column: move === 'right' ? focused.column2 : focused.column1 };
    const page = Math.max(1, Math.floor(viewport.height / rowHeightAt(focus.row)) - 1);
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
    const merge = mergeCovering(row, column);
    const target = merge === undefined ? positionOf(row, column) : positionOf(merge.row1, merge.column1);
    setSelection(extend ? { anchor: selection.anchor, focus: target } : { anchor: target, focus: target });
    ensureVisible(target);
  };

  const revealMatch = (match: SheetMatch): void => {
    setCurrentMatch(match.ref);
    selectCell(match.row, match.column, false);
  };

  const openFind = (withReplace: boolean): void => {
    setFindOpen(true);
    if (withReplace && editable) setReplaceOpen(true);
    const target = matchFrom(findSheetMatches(sheet, findQuery, mergedRanges), selection.focus);
    if (target !== undefined) revealMatch(target);
  };

  const closeFind = (): void => {
    setFindOpen(false);
    setCurrentMatch(null);
    scrollRef.current?.focus();
  };

  const changeFindQuery = (value: string): void => {
    setFindQuery(value);
    const target = matchFrom(findSheetMatches(sheet, value, mergedRanges), selection.focus);
    if (target === undefined) setCurrentMatch(null);
    else revealMatch(target);
  };

  const stepFind = (direction: 1 | -1): void => {
    if (matches.length === 0) return;
    const index = matches.findIndex((match) => match.ref === currentMatch);
    const next = index === -1
      ? matches[direction === 1 ? 0 : matches.length - 1]
      : matches[(index + direction + matches.length) % matches.length];
    if (next !== undefined) revealMatch(next);
  };

  const replaceCurrentMatch = (): void => {
    if (!editable || workbookRef.current === null || sheet === undefined) return;
    const match = matches.find((item) => item.ref === currentMatch);
    if (match === undefined) return;
    const cell = sheet.cells[match.ref];
    if (cell === undefined) return;
    const text = rawCellText(cell);
    const replaced = replaceSheetText(text, findQuery, replacement);
    if (replaced === text) return;
    const target = withCell(workbookRef.current, activeSheet, match.row, match.column, typedCell(replaced, cell.style));
    const next = matchFrom(findSheetMatches(target.sheets[activeSheet], findQuery, mergedRanges), { row: match.row, column: match.column + 1 });
    commit(() => target);
    if (next === undefined) setCurrentMatch(null);
    else revealMatch(next);
  };

  const replaceAllMatches = (): void => {
    if (!editable || workbookRef.current === null || findQuery === '' || matches.length === 0) return;
    const current = workbookRef.current;
    const sheets = current.sheets.map((item, index) => {
      if (index !== activeSheet) return item;
      const cells = { ...item.cells };
      for (const match of matches) {
        const cell = cells[match.ref];
        if (cell === undefined) continue;
        const text = rawCellText(cell);
        const replaced = replaceSheetText(text, findQuery, replacement);
        if (replaced === text) continue;
        const next = typedCell(replaced, cell.style);
        if (next === undefined) delete cells[match.ref];
        else cells[match.ref] = next;
      }
      return { ...item, cells };
    });
    commit(() => ({ schemaVersion: SHEET_SCHEMA_VERSION_LOCAL, sheets }));
    setCurrentMatch(null);
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

  const runOperations = (current: SheetWorkbook, operations: Record<string, unknown>[]): SheetWorkbook => {
    const name = current.sheets[activeSheet]?.name;
    const applied = applySheetOperations(serializeSheetWorkbook(current), operations.map((operation) => ({ sheet: name, ...operation })));
    return applied.workbook;
  };

  const mergeSelection = (): void => {
    const selectedRange = range;
    const overlapping = mergedRanges.filter((item) => rangesOverlap(item, selectedRange));
    commit(current => runOperations(current, [
      ...overlapping.map((item) => ({ op: 'unmerge', range: formatRangeRef(item) })),
      { op: 'merge', range: formatRangeRef(selectedRange) },
    ]));
  };

  const unmergeSelection = (): void => {
    const selectedRange = range;
    commit(current => runOperations(current, [{ op: 'unmerge', range: formatRangeRef(selectedRange) }]));
  };

  const canMerge = editable && rangeSize(range) > 1;
  const canUnmerge = editable && mergedRanges.some((item) => rangesOverlap(item, range));

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

  const pasteText = (text: string): void => {
    if (!editable || text === '') return;
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

  const onPaste = (event: ClipboardEvent<HTMLDivElement>): void => {
    if (!editable) return;
    event.preventDefault();
    pasteText(event.clipboardData.getData('text/plain'));
  };

  const clearSelection = (): void => {
    const targetSheet = activeSheet;
    const selectedRange = range;
    commit(current => clearRange(current, targetSheet, selectedRange));
  };

  const copyToClipboard = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(selectionTsv());
    } catch {
      live.current.notify(t('sheet.copyFailed'));
    }
  };

  const cutToClipboard = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(selectionTsv());
    } catch {
      live.current.notify(t('sheet.copyFailed'));
      return;
    }
    clearSelection();
  };

  const pasteFromClipboard = async (): Promise<void> => {
    try {
      pasteText(await navigator.clipboard.readText());
    } catch {
      live.current.notify(t('sheet.pasteFailed'));
    }
  };

  const moveSelection = (rowDelta: number, columnDelta: number): void => {
    setSelection(current => ({
      anchor: positionOf(current.anchor.row + rowDelta, current.anchor.column + columnDelta),
      focus: positionOf(current.focus.row + rowDelta, current.focus.column + columnDelta),
    }));
  };

  /**
   * Apply one structural operation. The shared applier refuses an edit that
   * would leave the sheet, and its message is shown rather than lost.
   */
  const applyStructure = (operation: Record<string, unknown>, after?: () => void): void => {
    try {
      commit(current => runOperations(current, [operation]));
      after?.();
    } catch (error) {
      live.current.notify(error instanceof Error ? error.message : String(error));
    }
  };

  const insertRows = (above: boolean, count: number): void => {
    const at = above ? range.row1 : range.row2 + 1;
    applyStructure({ op: 'insert-rows', at, count }, () => {
      if (above) moveSelection(count, 0);
    });
  };

  const insertColumns = (left: boolean, count: number): void => {
    const at = columnName(left ? range.column1 : range.column2 + 1);
    applyStructure({ op: 'insert-columns', at, count }, () => {
      if (left) moveSelection(0, count);
    });
  };

  const deleteRows = (count: number): void => {
    const at = range.row1;
    const column = range.column1;
    applyStructure({ op: 'delete-rows', at, count }, () => {
      setSelection({ anchor: { row: at, column }, focus: { row: at, column } });
    });
  };

  const deleteColumns = (count: number): void => {
    const at = columnName(range.column1);
    const row = range.row1;
    const column = range.column1;
    applyStructure({ op: 'delete-columns', at, count }, () => {
      setSelection({ anchor: { row, column }, focus: { row, column } });
    });
  };

  const moveRows = (delta: 1 | -1): void => {
    const at = range.row1;
    const to = at + delta;
    const count = selectedRowCount;
    applyStructure({ op: 'move-rows', at, count, to }, () => moveSelection(to - at, 0));
  };

  const moveColumns = (delta: 1 | -1): void => {
    const at = range.column1;
    const to = at + delta;
    const count = selectedColumnCount;
    applyStructure({ op: 'move-columns', at: columnName(at), count, to: columnName(to) }, () => moveSelection(0, to - at));
  };

  const openContextMenuAtSelection = (): void => {
    const element = scrollRef.current;
    if (element === null) return;
    const rect = element.getBoundingClientRect();
    setContextMenu({
      x: rect.left + (widths.starts[selection.focus.column] ?? 0) - element.scrollLeft + 12,
      y: rect.top + rowTop(selection.focus.row) - element.scrollTop + rowHeightAt(selection.focus.row),
    });
  };

  const onGridContextMenu = (event: ReactMouseEvent<HTMLDivElement>): void => {
    if (workbook === null) return;
    // A menu action must not race an open cell editor: its blur would commit
    // the old draft over the edit the action just made.
    if (editing !== null) commitEdit(null);
    event.preventDefault();
    const cell = cellFromPoint(event.clientX, event.clientY);
    if (cell === null) return;
    const inside = cell.row >= range.row1 && cell.row <= range.row2 && cell.column >= range.column1 && cell.column <= range.column2;
    if (!inside) selectCell(cell.row, cell.column, false);
    setContextMenu({ x: event.clientX, y: event.clientY });
  };

  const onRowHeaderContextMenu = (event: ReactMouseEvent<HTMLDivElement>, row: number): void => {
    if (workbook === null) return;
    if (editing !== null) commitEdit(null);
    event.preventDefault();
    const wholeRows = range.column1 === 0 && range.column2 === SHEET_LIMITS.maxColumns - 1;
    if (!wholeRows || row < range.row1 || row > range.row2) {
      setSelection({ anchor: { row, column: 0 }, focus: { row, column: SHEET_LIMITS.maxColumns - 1 } });
    }
    setContextMenu({ x: event.clientX, y: event.clientY });
  };

  const onColumnHeaderContextMenu = (event: ReactMouseEvent<HTMLDivElement>, column: number): void => {
    if (workbook === null) return;
    if (editing !== null) commitEdit(null);
    event.preventDefault();
    const wholeColumns = range.row1 === 1 && range.row2 === SHEET_LIMITS.maxRows;
    if (!wholeColumns || column < range.column1 || column > range.column2) {
      setSelection({ anchor: { row: 1, column }, focus: { row: SHEET_LIMITS.maxRows, column } });
    }
    setContextMenu({ x: event.clientX, y: event.clientY });
  };

  const onGridKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>): void => {
    if (editing !== null) return;
    if (findOpen && event.key === 'Escape') {
      event.preventDefault();
      closeFind();
      return;
    }
    if (workbook === null || sheet === undefined) return;
    if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) {
      event.preventDefault();
      openContextMenuAtSelection();
      return;
    }
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
    if (modifier && (event.key === '+' || event.key === '=')) {
      event.preventDefault();
      applyZoom(zoom * ZOOM_STEP);
      return;
    }
    if (modifier && (event.key === '-' || event.key === '_')) {
      event.preventDefault();
      applyZoom(zoom / ZOOM_STEP);
      return;
    }
    if (modifier && event.key === '0') {
      event.preventDefault();
      applyZoom(1);
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
    const row = clamp(rowAt(y), 1, SHEET_LIMITS.maxRows);
    const column = columnAt(widths.starts, x);
    const merge = mergeCovering(row, column);
    if (merge !== undefined) return { row: merge.row1, column: merge.column1 };
    return { row, column };
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (event.button > 0) return;
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
    if (!editable || event.button > 0) return;
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const startWidth = storedWidth(sheet, column);
    const onMove = (moveEvent: PointerEvent): void => {
      const next = clamp(startWidth + (moveEvent.clientX - startX) / zoom, SHEET_LIMITS.minColumnWidth, SHEET_LIMITS.maxColumnWidth);
      setColumnDrag({ column, width: next });
    };
    const onUp = (upEvent: PointerEvent): void => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      const next = clamp(startWidth + (upEvent.clientX - startX) / zoom, SHEET_LIMITS.minColumnWidth, SHEET_LIMITS.maxColumnWidth);
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
    widthsCopy[columnDrag.column] = columnDrag.width * zoom;
    const starts: number[] = [];
    let total = 0;
    for (const width of widthsCopy) {
      starts.push(total);
      total += width;
    }
    starts.push(total);
    return { widths: widthsCopy, starts, total };
  }, [widths, columnDrag, zoom]);

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

  const totals = useMemo(() => {
    if (sheet === undefined || evaluated === null) return { count: 0, numbers: 0, sum: 0, average: 0 };
    const results = evaluated.results[sheet.name] ?? {};
    let count = 0;
    let numbers = 0;
    let sum = 0;
    for (const ref of Object.keys(sheet.cells)) {
      const index = parseCellRef(ref);
      if (index === undefined) continue;
      if (index.row < range.row1 || index.row > range.row2) continue;
      if (index.column < range.column1 || index.column > range.column2) continue;
      const value = results[ref]?.value;
      if (value === null || value === undefined || value === '') continue;
      count += 1;
      if (typeof value === 'number' && results[ref]?.error === undefined) {
        numbers += 1;
        sum += value;
      }
    }
    return { count, numbers, sum, average: numbers === 0 ? 0 : sum / numbers };
  }, [sheet, evaluated, range, activeSheet]);

  const rowStart = Math.max(0, rowAt(scroll.top) - 2);
  const rowEnd = Math.min(SHEET_LIMITS.maxRows - 1, rowAt(scroll.top + viewport.height) + 1);
  const columnStart = Math.max(0, columnAt(displayWidths.starts, scroll.left) - 1);
  const columnEnd = Math.min(SHEET_LIMITS.maxColumns - 1, columnAt(displayWidths.starts, scroll.left + viewport.width) + 1);
  const canvasWidth = displayWidths.total;
  const canvasHeight = rowStarts[SHEET_LIMITS.maxRows] ?? 0;

  const visibleCells = [];
  for (let rowIndex = rowStart; rowIndex <= rowEnd; rowIndex += 1) {
    for (let columnIndex = columnStart; columnIndex <= columnEnd; columnIndex += 1) {
      const ref = formatCellRef(rowIndex + 1, columnIndex);
      const merge = mergeCovering(rowIndex + 1, columnIndex);
      if (merge !== undefined && (merge.row1 !== rowIndex + 1 || merge.column1 !== columnIndex)) continue;
      const cell = sheet?.cells[ref];
      const result = sheet === undefined || evaluated === null ? undefined : evaluated.results[sheet.name]?.[ref];
      const display = result?.display ?? '';
      const style = cell?.style;
      const cellStyle: CSSProperties = {
        left: displayWidths.starts[columnIndex] ?? 0,
        top: rowTop(rowIndex + 1),
        width: merge === undefined
          ? displayWidths.widths[columnIndex] ?? DEFAULT_COLUMN_WIDTH * zoom
          : (displayWidths.starts[merge.column2 + 1] ?? 0) - (displayWidths.starts[merge.column1] ?? 0),
        height: merge === undefined ? rowHeightAt(rowIndex + 1) : rowTop(merge.row2 + 1) - rowTop(merge.row1),
      };
      cellStyle.fontSize = String(SHEET_TEXT_METRICS.fontSize * zoom) + 'px';
      cellStyle.lineHeight = String(SHEET_TEXT_METRICS.lineHeight * zoom) + 'px';
      if (style?.wrap === true) {
        cellStyle.whiteSpace = 'pre-wrap';
        cellStyle.overflowWrap = 'anywhere';
      }
      // A merge taller than the viewport cannot centre its text: centred text
      // would sit hundreds of pixels below the visible top edge.
      if (merge !== undefined && merge.row2 > merge.row1) cellStyle.alignItems = 'flex-start';
      const textColor = panelTextColor(style);
      if (textColor !== undefined) cellStyle.color = textColor;
      if (style?.background !== undefined) cellStyle.background = style.background;
      if (style?.bold === true) cellStyle.fontWeight = 600;
      if (style?.italic === true) cellStyle.fontStyle = 'italic';
      if (style?.underline === true || style?.strike === true) cellStyle.textDecoration = (style.underline === true ? 'underline ' : '') + (style.strike === true ? 'line-through' : '');
      if (style?.align !== undefined) cellStyle.textAlign = style.align;
      else if (typeof result?.value === 'number') cellStyle.textAlign = 'right';
      visibleCells.push(
        <div
          className="art-sheet-cell"
          key={ref}
          style={cellStyle}
          role="gridcell"
          aria-rowindex={rowIndex + 1}
          aria-colindex={columnIndex + 1}
          data-cell={ref}
          data-match={matchRefs.has(ref) ? (ref === currentMatch ? 'current' : 'true') : undefined}
        >
          {display}
        </div>,
      );
    }
  }

  const columnHeaders = [];
  for (let columnIndex = columnStart; columnIndex <= columnEnd; columnIndex += 1) {
    const active = columnIndex >= range.column1 && columnIndex <= range.column2;
    columnHeaders.push(
      <div className="art-sheet-colhead" key={columnIndex} data-active={active ? 'true' : undefined} style={{ left: displayWidths.starts[columnIndex] ?? 0, width: displayWidths.widths[columnIndex] ?? DEFAULT_COLUMN_WIDTH * zoom }} onContextMenu={(event) => onColumnHeaderContextMenu(event, columnIndex)}>
        <button type="button" className="art-sheet-headbutton" aria-label={t('sheet.selectColumn', { name: columnName(columnIndex) })} onClick={() => setSelection({ anchor: { row: 1, column: columnIndex }, focus: { row: SHEET_LIMITS.maxRows, column: columnIndex } })}>{columnName(columnIndex)}</button>
        {editable ? <span className="art-sheet-resize" role="separator" aria-orientation="vertical" onPointerDown={(event) => beginColumnResize(event, columnIndex)} /> : null}
      </div>,
    );
  }

  const rowHeaders = [];
  for (let rowIndex = rowStart; rowIndex <= rowEnd; rowIndex += 1) {
    const active = rowIndex + 1 >= range.row1 && rowIndex + 1 <= range.row2;
    rowHeaders.push(
      <div className="art-sheet-rowhead" key={rowIndex} data-active={active ? 'true' : undefined} style={{ top: rowTop(rowIndex + 1), height: rowHeightAt(rowIndex + 1) }} onContextMenu={(event) => onRowHeaderContextMenu(event, rowIndex + 1)}>
        <button type="button" className="art-sheet-headbutton" aria-label={t('sheet.selectRow', { row: rowIndex + 1 })} onClick={() => setSelection({ anchor: { row: rowIndex + 1, column: 0 }, focus: { row: rowIndex + 1, column: SHEET_LIMITS.maxColumns - 1 } })}>{rowIndex + 1}</button>
      </div>,
    );
  }

  const selectedRowCount = range.row2 - range.row1 + 1;
  const selectedColumnCount = range.column2 - range.column1 + 1;
  const rowWord = t(selectedRowCount === 1 ? 'sheet.row' : 'sheet.rows');
  const columnWord = t(selectedColumnCount === 1 ? 'sheet.column' : 'sheet.columns');
  const contextEntries: MenuEntry[] = [];
  if (contextMenu !== null) {
    if (!editable) {
      contextEntries.push({ id: 'copy', label: t('sheet.copy') });
    } else {
      contextEntries.push(
        { id: 'cut', label: t('sheet.cut') },
        { id: 'copy', label: t('sheet.copy') },
        { id: 'paste', label: t('sheet.paste') },
        { type: 'separator', id: 'context-clipboard' },
        { id: 'insert-rows-above', label: t('sheet.insertRowsAbove', { count: selectedRowCount, rows: rowWord }) },
        { id: 'insert-rows-below', label: t('sheet.insertRowsBelow', { count: selectedRowCount, rows: rowWord }), disabled: range.row2 >= SHEET_LIMITS.maxRows },
        { id: 'insert-columns-left', label: t('sheet.insertColumnsLeft', { count: selectedColumnCount, columns: columnWord }) },
        { id: 'insert-columns-right', label: t('sheet.insertColumnsRight', { count: selectedColumnCount, columns: columnWord }), disabled: range.column2 >= SHEET_LIMITS.maxColumns - 1 },
        { type: 'separator', id: 'context-structure' },
        { id: 'delete-rows', label: t('sheet.deleteRows', { count: selectedRowCount, rows: rowWord }) },
        { id: 'delete-columns', label: t('sheet.deleteColumns', { count: selectedColumnCount, columns: columnWord }) },
        { id: 'clear-contents', label: t('sheet.clearContents') },
        { id: 'move-rows-up', label: t('sheet.moveRowsUp', { count: selectedRowCount, rows: rowWord }), disabled: range.row1 <= 1 },
        { id: 'move-rows-down', label: t('sheet.moveRowsDown', { count: selectedRowCount, rows: rowWord }), disabled: range.row2 >= SHEET_LIMITS.maxRows },
        { id: 'move-columns-left', label: t('sheet.moveColumnsLeft', { count: selectedColumnCount, columns: columnWord }), disabled: range.column1 <= 0 },
        { id: 'move-columns-right', label: t('sheet.moveColumnsRight', { count: selectedColumnCount, columns: columnWord }), disabled: range.column2 >= SHEET_LIMITS.maxColumns - 1 },
      );
      if (canMerge || canUnmerge) {
        contextEntries.push({ type: 'separator', id: 'context-merge' });
        if (canMerge) contextEntries.push({ id: 'merge', label: t('sheet.merge') });
        if (canUnmerge) contextEntries.push({ id: 'unmerge', label: t('sheet.unmerge') });
      }
    }
  }

  const runContextAction = (id: string): void => {
    setContextMenu(null);
    switch (id) {
      case 'cut': void cutToClipboard(); return;
      case 'copy': void copyToClipboard(); return;
      case 'paste': void pasteFromClipboard(); return;
      case 'insert-rows-above': insertRows(true, selectedRowCount); return;
      case 'insert-rows-below': insertRows(false, selectedRowCount); return;
      case 'insert-columns-left': insertColumns(true, selectedColumnCount); return;
      case 'insert-columns-right': insertColumns(false, selectedColumnCount); return;
      case 'delete-rows': deleteRows(selectedRowCount); return;
      case 'delete-columns': deleteColumns(selectedColumnCount); return;
      case 'clear-contents': clearSelection(); return;
      case 'move-rows-up': moveRows(-1); return;
      case 'move-rows-down': moveRows(1); return;
      case 'move-columns-left': moveColumns(-1); return;
      case 'move-columns-right': moveColumns(1); return;
      case 'merge': mergeSelection(); return;
      case 'unmerge': unmergeSelection(); return;
      default: return;
    }
  };

  const numberEntries: MenuEntry[] = NUMBER_FORMATS.map((format) => ({ id: format, label: t(FORMAT_LABELS[format]) }));
  const sheetEntries: MenuEntry[] = [
    { id: 'rename', label: t('sheet.renameSheet') },
    { id: 'delete', label: t('sheet.deleteSheet'), danger: true, disabled: workbook === null || workbook.sheets.length <= 1 },
  ];
  const editingStyle = editing === null ? undefined : sheet?.cells[formatCellRef(editing.row, editing.column)]?.style;
  const findCountText = findQuery === ''
    ? ''
    : matches.length === 0
      ? t('sheet.findNoMatch')
      : t('sheet.findMatchOf', { index: Math.max(1, currentMatchIndex + 1), count: matches.length });

  return (
    <div
      className="art-sheet-editor"
      style={tokenStyle}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && findOpen && !(event.target instanceof HTMLInputElement)) {
          event.preventDefault();
          closeFind();
          return;
        }
        if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
        const key = event.key.toLowerCase();
        if (key === 'f') {
          event.preventDefault();
          openFind(false);
        } else if (key === 'h' && editable) {
          event.preventDefault();
          openFind(true);
        }
      }}
    >
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
          <Tooltip label={t('sheet.undo')} side="bottom" portal><Button size="sm" variant="ghost" className="art-sheet-tool" aria-label={t('sheet.undo')} disabled={!editable || !canUndo} onClick={undo}><IconUndo size={16} /></Button></Tooltip>
          <Tooltip label={t('sheet.redo')} side="bottom" portal><Button size="sm" variant="ghost" className="art-sheet-tool" aria-label={t('sheet.redo')} disabled={!editable || !canRedo} onClick={redo}><IconRedo size={16} /></Button></Tooltip>
          <Tooltip label={t('sheet.findAndReplace')} side="bottom" portal><Button size="sm" variant="ghost" className="art-sheet-tool" aria-label={t('sheet.findAndReplace')} aria-expanded={findOpen} disabled={workbook === null} onClick={() => (findOpen ? closeFind() : openFind(false))}><IconSearchOutlineRegular size={16} /></Button></Tooltip>
          <span className="art-sheet-divider" aria-hidden="true" />
          <Button size="sm" variant="ghost" className="art-sheet-tool art-sheet-tool-text" aria-label={t('sheet.bold')} aria-pressed={activePressed('bold')} disabled={!editable} onClick={() => toggleFormat('bold')}><span style={{ fontWeight: 700 }}>B</span></Button>
          <Button size="sm" variant="ghost" className="art-sheet-tool art-sheet-tool-text" aria-label={t('sheet.italic')} aria-pressed={activePressed('italic')} disabled={!editable} onClick={() => toggleFormat('italic')}><span style={{ fontStyle: 'italic', fontFamily: 'serif' }}>I</span></Button>
          <Button size="sm" variant="ghost" className="art-sheet-tool art-sheet-tool-text" aria-label={t('sheet.underline')} aria-pressed={activePressed('underline')} disabled={!editable} onClick={() => toggleFormat('underline')}><span style={{ textDecoration: 'underline' }}>U</span></Button>
          <Tooltip label={t('sheet.wrap')} side="bottom" portal><Button size="sm" variant="ghost" className="art-sheet-tool" aria-label={t('sheet.wrap')} aria-pressed={activeStyle?.wrap === true} disabled={!editable} onClick={() => applyPatch({ wrap: activeStyle?.wrap === true ? null : true })}><WrapGlyph /></Button></Tooltip>
          <span className="art-sheet-divider" aria-hidden="true" />
          <Button size="sm" variant="ghost" className="art-sheet-tool" aria-label={t('sheet.alignLeft')} aria-pressed={activeStyle?.align === 'left'} disabled={!editable} onClick={() => applyPatch({ align: 'left' })}><AlignGlyph align="left" /></Button>
          <Button size="sm" variant="ghost" className="art-sheet-tool" aria-label={t('sheet.alignCenter')} aria-pressed={activeStyle?.align === 'center'} disabled={!editable} onClick={() => applyPatch({ align: 'center' })}><AlignGlyph align="center" /></Button>
          <Button size="sm" variant="ghost" className="art-sheet-tool" aria-label={t('sheet.alignRight')} aria-pressed={activeStyle?.align === 'right'} disabled={!editable} onClick={() => applyPatch({ align: 'right' })}><AlignGlyph align="right" /></Button>
          <span className="art-sheet-divider" aria-hidden="true" />
          <Tooltip label={t('sheet.merge')} side="bottom" portal><Button size="sm" variant="ghost" className="art-sheet-tool" aria-label={t('sheet.merge')} disabled={!canMerge} onClick={mergeSelection}><MergeGlyph reverse={false} /></Button></Tooltip>
          <Tooltip label={t('sheet.unmerge')} side="bottom" portal><Button size="sm" variant="ghost" className="art-sheet-tool" aria-label={t('sheet.unmerge')} disabled={!canUnmerge} onClick={unmergeSelection}><MergeGlyph reverse /></Button></Tooltip>
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
            <span className="art-sheet-color-swatch art-sheet-color-letter" style={{ color: activeStyle?.color, background: activeStyle?.color === undefined ? undefined : readableTextColor(activeStyle.color) }} aria-hidden="true">A</span>
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
          onContextMenu={onGridContextMenu}
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
                  top: rowTop(editing.row),
                  width: displayWidths.widths[editing.column] ?? DEFAULT_COLUMN_WIDTH * zoom,
                  height: rowHeightAt(editing.row),
                  fontWeight: editingStyle?.bold === true ? 600 : undefined,
                  fontStyle: editingStyle?.italic === true ? 'italic' : undefined,
                  background: editingStyle?.background,
                  color: panelTextColor(editingStyle),
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
        {findOpen ? (
          <div
            className="art-sheet-find"
            role="search"
            aria-label={t('sheet.findAndReplace')}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.preventDefault();
                closeFind();
              }
            }}
          >
            <div className="art-sheet-find-row">
              <input
                ref={findInputRef}
                className="art-sheet-find-input"
                type="text"
                aria-label={t('sheet.find')}
                placeholder={t('sheet.findPlaceholder')}
                value={findQuery}
                spellCheck={false}
                onChange={(event) => changeFindQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    stepFind(event.shiftKey ? -1 : 1);
                  }
                }}
              />
              <span className="art-sheet-find-count" role="status" aria-live="polite">{findCountText}</span>
              <Button size="sm" variant="ghost" className="art-sheet-find-tool" aria-label={t('sheet.findPrevious')} disabled={matches.length === 0} onClick={() => stepFind(-1)}><span aria-hidden="true">↑</span></Button>
              <Button size="sm" variant="ghost" className="art-sheet-find-tool" aria-label={t('sheet.findNext')} disabled={matches.length === 0} onClick={() => stepFind(1)}><span aria-hidden="true">↓</span></Button>
              {editable ? <Tooltip label={t('sheet.findAndReplace')} side="bottom" portal><Button size="sm" variant="ghost" className="art-sheet-find-tool" aria-label={t('sheet.findAndReplace')} aria-expanded={replaceOpen} onClick={() => setReplaceOpen((open) => !open)}><IconChevronDownOutlineRegular size={14} /></Button></Tooltip> : null}
              <Button size="sm" variant="ghost" className="art-sheet-find-tool" aria-label={t('sheet.closeFind')} onClick={closeFind}><IconCloseOutlineRegular size={14} /></Button>
            </div>
            {replaceOpen && editable ? (
              <div className="art-sheet-find-row">
                <input
                  className="art-sheet-find-input"
                  type="text"
                  aria-label={t('sheet.replaceWith')}
                  placeholder={t('sheet.replaceWith')}
                  value={replacement}
                  spellCheck={false}
                  onChange={(event) => setReplacement(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      replaceCurrentMatch();
                    }
                  }}
                />
                <Button size="sm" variant="ghost" className="art-sheet-find-action" disabled={currentMatchIndex === -1} onClick={replaceCurrentMatch}>{t('sheet.replaceOne')}</Button>
                <Button size="sm" variant="ghost" className="art-sheet-find-action" disabled={matches.length === 0} onClick={replaceAllMatches}>{t('sheet.replaceAll')}</Button>
              </div>
            ) : null}
          </div>
        ) : null}
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
        {editable ? <Button size="sm" variant="ghost" className="art-sheet-add" aria-label={t('sheet.addSheet')} onClick={addSheet}><IconPlusOutlineRegular size={16} /></Button> : null}
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
            anchor={<Button size="sm" variant="ghost" className="art-sheet-tab-more" aria-label={t('sheet.sheetActions')} aria-haspopup="menu" aria-expanded={sheetMenu} onClick={() => setSheetMenu((open) => !open)}><IconEllipsisOutlineRegular size={16} /></Button>}
          />
        ) : null}
      </div>
      <div className="art-sheet-status" role="status" aria-label={t('sheet.summary')}>
        <span className="art-sheet-status-ref">{selectedText}</span>
        <span className="art-sheet-status-item">{t('sheet.count')} {formatNumberText(totals.count)}</span>
        {totals.numbers === 0 ? null : (
          <>
            <span className="art-sheet-status-item">{t('sheet.sum')} {formatNumberText(totals.sum)}</span>
            <span className="art-sheet-status-item">{t('sheet.average')} {formatNumberText(totals.average)}</span>
          </>
        )}
        <span className="art-sheet-status-gap" aria-hidden="true" />
        <div className="art-sheet-zoom">
          <Button size="sm" variant="ghost" className="art-sheet-zoom-button" aria-label={t('sheet.zoomOut')} disabled={zoom <= 0.25} onClick={() => applyZoom(zoom / ZOOM_STEP)}><span aria-hidden="true">−</span></Button>
          <button type="button" className="art-sheet-zoom-value" aria-label={t('sheet.zoomReset')} title={t('sheet.zoomReset')} onClick={() => applyZoom(1)}>{String(Math.round(zoom * 100))}%</button>
          <Button size="sm" variant="ghost" className="art-sheet-zoom-button" aria-label={t('sheet.zoomIn')} disabled={zoom >= 4} onClick={() => applyZoom(zoom * ZOOM_STEP)}><span aria-hidden="true">+</span></Button>
        </div>
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
      <Menu
        key={contextMenu === null ? 'closed' : String(contextMenu.x) + ':' + String(contextMenu.y)}
        open={contextMenu !== null}
        anchor={null}
        anchorPoint={contextMenu ?? undefined}
        contextual
        portal
        autoFocus
        returnFocus={() => scrollRef.current}
        items={contextEntries}
        onSelect={runContextAction}
        onClose={() => setContextMenu(null)}
      />
    </div>
  );
}
