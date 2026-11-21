/**
 * Whiteboard scene model shared by the host and the panel.
 *
 * A board artifact stores a native Excalidraw scene (the .excalidraw JSON
 * shape) so the editor keeps every property it knows about. This module is
 * engine-neutral on purpose: it does not import @excalidraw, which touches
 * window at module load. It validates the scene, creates the small element set
 * the agent tool can author, and applies those operations.
 */

/** The scene wrapper Excalidraw writes to a .excalidraw file. */
export const BOARD_SCENE_TYPE = 'excalidraw';
export const BOARD_SCENE_VERSION = 2;
/** The source string stored on content this plugin owns. */
const BOARD_SOURCE = 'dsh-artifact-studio';
/** Where the host serves the editor's fonts and worker files. */
export const BOARD_ASSET_PATH = '/artifacts-whiteboard/';

export const BOARD_LIMITS = {
  maxElements: 3000,
  maxFiles: 20,
  maxOperations: 100,
  maxAdditions: 80,
  maxText: 4000,
  maxId: 80,
} as const;

export type BoardJson = null | boolean | number | string | BoardJson[] | { [key: string]: BoardJson };

/** One Excalidraw element. The fields this module writes are validated; other keys are preserved. */
export interface BoardElement {
  [key: string]: BoardJson;
}

export interface BoardAppState {
  viewBackgroundColor: string;
  gridSize: number | null;
}

export interface BoardFile {
  id: string;
  mimeType: string;
  dataURL: string;
  created: number;
  lastRetrieved?: number;
}

export interface BoardScene {
  type: 'excalidraw';
  version: 2;
  source: string;
  elements: BoardElement[];
  appState: BoardAppState;
  files: Record<string, BoardFile>;
}

/** A summary for tool results and gallery covers. */
export interface BoardSummary {
  elements: number;
  types: Record<string, number>;
  files: number;
  bounds: { x: number; y: number; width: number; height: number } | null;
}

/** A failure with a stable code the host can wrap. */
export class BoardError extends Error {
  readonly code: 'board/invalid' | 'board/operation';

  constructor(message: string, code: 'board/invalid' | 'board/operation' = 'board/invalid') {
    super(message);
    this.name = 'BoardError';
    this.code = code;
  }
}

const ELEMENT_TYPES = new Set([
  'rectangle', 'diamond', 'ellipse', 'text', 'line', 'arrow', 'freedraw', 'image', 'frame', 'magicframe',
]);
const BLOCKED_TYPES = new Set(['embeddable', 'iframe', 'selection']);
const FILL_STYLES = new Set(['hachure', 'cross-hatch', 'solid', 'zigzag']);
const STROKE_STYLES = new Set(['solid', 'dashed', 'dotted']);
const TEXT_ALIGNS = new Set(['left', 'center', 'right']);
const VERTICAL_ALIGNS = new Set(['top', 'middle', 'bottom']);
const COLOR = /^(?:#[0-9a-f]{3,8}|(?:rgb|hsl)a?\([0-9.,%\s/-]+\)|transparent)$/i;
const FONT_FAMILIES: Readonly<Record<string, number>> = {
  virgil: 1,
  helvetica: 2,
  cascadia: 3,
  excalifont: 5,
  nunito: 6,
  'comic shanns': 7,
  'comic-shanns': 7,
  'liberation sans': 8,
  'liberation-sans': 8,
  'lilita one': 9,
  'lilita-one': 9,
  xiaolai: 10,
};
const FONT_VALUES = new Set(Object.values(FONT_FAMILIES));

function isFields(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function fail(message: string, code: 'board/invalid' | 'board/operation' = 'board/invalid'): never {
  throw new BoardError(message, code);
}

function finiteNumber(value: unknown, at: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) fail(at + ' must be a finite number.');
  return value;
}

function isColor(value: unknown): value is string {
  if (typeof value !== 'string' || !COLOR.test(value.trim())) return false;
  const text = value.trim();
  if (/^(?:rgb|hsl)a?\(/i.test(text)) {
    const numbers = text.slice(text.indexOf('(') + 1, -1).split(/[,%\s/]+/).filter((part) => part !== '');
    return numbers.length >= 3 && numbers.length <= 4 && numbers.every((part) => Number.isFinite(Number(part)));
  }
  return true;
}

function checkColor(value: unknown, at: string): string {
  if (!isColor(value)) fail(at + ' must be a CSS color such as #1e1e1e or transparent.');
  return String(value).trim();
}

function checkId(value: unknown, at: string): string {
  if (typeof value !== 'string' || value === '' || value.length > BOARD_LIMITS.maxId) {
    fail(at + ' must be a non-empty string of at most ' + String(BOARD_LIMITS.maxId) + ' characters.');
  }
  return value;
}

function checkString(value: unknown, at: string, max: number): string {
  if (typeof value !== 'string' || value.length > max) fail(at + ' must be a string of at most ' + String(max) + ' characters.');
  return value;
}

function optionalBoolean(value: unknown, at: string): boolean | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'boolean') fail(at + ' must be true or false.');
  return value;
}

function optionalNumber(value: unknown, at: string): number | undefined {
  if (value === undefined) return undefined;
  return finiteNumber(value, at);
}

function optionalString(value: unknown, at: string, max: number): string | undefined {
  if (value === undefined) return undefined;
  return checkString(value, at, max);
}

function arrayOfStrings(value: unknown, at: string): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || !value.every((item) => typeof item === 'string')) fail(at + ' must be a list of strings.');
  return value as string[];
}

function validateElement(raw: unknown, at: string, files: Record<string, BoardFile>): BoardElement {
  if (!isFields(raw)) fail(at + ' must be an object.');
  const type = raw.type;
  if (typeof type !== 'string') fail(at + '.type must be a string.');
  if (BLOCKED_TYPES.has(type)) fail(at + ' has the unsupported element type "' + type + '".');
  if (!ELEMENT_TYPES.has(type)) fail(at + ' has an unknown element type "' + type + '".');
  const element: BoardElement = {};
  for (const [key, value] of Object.entries(raw)) element[key] = value as BoardJson;
  element.id = checkId(raw.id, at + '.id');
  element.type = type;
  element.x = finiteNumber(raw.x, at + '.x');
  element.y = finiteNumber(raw.y, at + '.y');
  element.width = finiteNumber(raw.width, at + '.width');
  element.height = finiteNumber(raw.height, at + '.height');
  if (element.width < 0 || element.height < 0) fail(at + '.width and .height cannot be negative.');
  if (raw.strokeColor !== undefined) element.strokeColor = checkColor(raw.strokeColor, at + '.strokeColor');
  if (raw.backgroundColor !== undefined) element.backgroundColor = checkColor(raw.backgroundColor, at + '.backgroundColor');
  if (raw.fillStyle !== undefined) {
    if (typeof raw.fillStyle !== 'string' || !FILL_STYLES.has(raw.fillStyle)) fail(at + '.fillStyle must be ' + [...FILL_STYLES].join(', ') + '.');
    element.fillStyle = raw.fillStyle;
  }
  if (raw.strokeStyle !== undefined) {
    if (typeof raw.strokeStyle !== 'string' || !STROKE_STYLES.has(raw.strokeStyle)) fail(at + '.strokeStyle must be ' + [...STROKE_STYLES].join(', ') + '.');
    element.strokeStyle = raw.strokeStyle;
  }
  if (raw.strokeWidth !== undefined) element.strokeWidth = finiteNumber(raw.strokeWidth, at + '.strokeWidth');
  if (raw.roughness !== undefined) element.roughness = finiteNumber(raw.roughness, at + '.roughness');
  if (raw.opacity !== undefined) element.opacity = finiteNumber(raw.opacity, at + '.opacity');
  if (raw.angle !== undefined) element.angle = finiteNumber(raw.angle, at + '.angle');
  if (raw.seed !== undefined) element.seed = finiteNumber(raw.seed, at + '.seed');
  if (raw.version !== undefined) element.version = finiteNumber(raw.version, at + '.version');
  if (raw.versionNonce !== undefined) element.versionNonce = finiteNumber(raw.versionNonce, at + '.versionNonce');
  if (raw.updated !== undefined) element.updated = finiteNumber(raw.updated, at + '.updated');
  if (raw.isDeleted !== undefined) element.isDeleted = optionalBoolean(raw.isDeleted, at + '.isDeleted') === true;
  if (raw.groupIds !== undefined) element.groupIds = arrayOfStrings(raw.groupIds, at + '.groupIds');
  if (raw.frameId !== undefined) {
    if (raw.frameId !== null) checkString(raw.frameId, at + '.frameId', BOARD_LIMITS.maxId);
    element.frameId = raw.frameId as BoardJson;
  }
  if (raw.link !== undefined) {
    if (raw.link !== null) checkString(raw.link, at + '.link', 2000);
    element.link = raw.link as BoardJson;
  }
  if (raw.locked !== undefined) element.locked = optionalBoolean(raw.locked, at + '.locked') === true;
  if (raw.boundElements !== undefined && raw.boundElements !== null) {
    if (!Array.isArray(raw.boundElements)) fail(at + '.boundElements must be a list or null.');
  }
  if (type === 'text') {
    element.text = checkString(raw.text, at + '.text', BOARD_LIMITS.maxText);
    element.fontSize = finiteNumber(raw.fontSize, at + '.fontSize');
    if (element.fontSize <= 0) fail(at + '.fontSize must be positive.');
    element.fontFamily = finiteNumber(raw.fontFamily, at + '.fontFamily');
    if (!FONT_VALUES.has(element.fontFamily)) fail(at + '.fontFamily must be an Excalidraw font family number.');
    if (raw.originalText !== undefined) element.originalText = checkString(raw.originalText, at + '.originalText', BOARD_LIMITS.maxText);
    if (raw.textAlign !== undefined) {
      if (typeof raw.textAlign !== 'string' || !TEXT_ALIGNS.has(raw.textAlign)) fail(at + '.textAlign must be left, center, or right.');
      element.textAlign = raw.textAlign;
    }
    if (raw.verticalAlign !== undefined) {
      if (typeof raw.verticalAlign !== 'string' || !VERTICAL_ALIGNS.has(raw.verticalAlign)) fail(at + '.verticalAlign must be top, middle, or bottom.');
      element.verticalAlign = raw.verticalAlign;
    }
  }
  if (type === 'line' || type === 'arrow') {
    const points = raw.points;
    if (!Array.isArray(points) || points.length < 2) fail(at + '.points must contain at least two points.');
    const checked: number[][] = points.map((point, index) => {
      if (!Array.isArray(point) || point.length !== 2) fail(at + '.points[' + String(index) + '] must be [x, y].');
      return [finiteNumber(point[0], at + '.points[' + String(index) + '][0]'), finiteNumber(point[1], at + '.points[' + String(index) + '][1]')];
    });
    element.points = checked;
    if (type === 'arrow') element.elbowed = optionalBoolean(raw.elbowed, at + '.elbowed') === true;
  }
  if (type === 'image') {
    const fileId = raw.fileId;
    if (fileId !== null && fileId !== undefined) {
      const id = checkString(fileId, at + '.fileId', BOARD_LIMITS.maxId);
      if (files[id] === undefined) fail(at + '.fileId does not name a file in files.');
      element.fileId = id;
    } else {
      element.fileId = null;
    }
    if (raw.status !== undefined && raw.status !== 'saved') fail(at + '.status must be saved.');
    element.status = 'saved';
    if (raw.scale !== undefined) {
      if (!Array.isArray(raw.scale) || raw.scale.length !== 2) fail(at + '.scale must be [x, y].');
      element.scale = [finiteNumber(raw.scale[0], at + '.scale[0]'), finiteNumber(raw.scale[1], at + '.scale[1]')];
    }
    if (raw.crop !== undefined && raw.crop !== null) element.crop = raw.crop as BoardJson;
  }
  if (type === 'frame' || type === 'magicframe') {
    if (raw.name !== undefined && raw.name !== null) element.name = checkString(raw.name, at + '.name', 200);
  }
  return element;
}

function validateAppState(raw: unknown): BoardAppState {
  if (raw === undefined) return { viewBackgroundColor: '#ffffff', gridSize: null };
  if (!isFields(raw)) fail('The scene appState must be an object.');
  const color = raw.viewBackgroundColor === undefined ? '#ffffff' : checkColor(raw.viewBackgroundColor, 'appState.viewBackgroundColor');
  let gridSize: number | null = null;
  if (raw.gridSize !== undefined && raw.gridSize !== null) gridSize = finiteNumber(raw.gridSize, 'appState.gridSize');
  return { viewBackgroundColor: color, gridSize };
}

function validateFiles(raw: unknown): Record<string, BoardFile> {
  if (raw === undefined || raw === null) return {};
  if (!isFields(raw)) fail('The scene files must be an object.');
  const entries = Object.entries(raw);
  if (entries.length > BOARD_LIMITS.maxFiles) fail('A board holds at most ' + String(BOARD_LIMITS.maxFiles) + ' image files.');
  const files: Record<string, BoardFile> = {};
  for (const [key, value] of entries) {
    if (!isFields(value)) fail('files.' + key + ' must be an object.');
    const dataURL = value.dataURL;
    if (typeof dataURL !== 'string' || !/^data:image\/(?:png|jpeg|gif|webp|svg\+xml|bmp|avif);/i.test(dataURL)) {
      fail('files.' + key + '.dataURL must be an inline image data URL.');
    }
    const mimeType = value.mimeType;
    if (typeof mimeType !== 'string' || !/^image\//.test(mimeType)) fail('files.' + key + '.mimeType must be an image type.');
    const id = value.id === undefined ? key : checkString(value.id, 'files.' + key + '.id', BOARD_LIMITS.maxId);
    files[key] = {
      id,
      mimeType,
      dataURL,
      created: value.created === undefined ? Date.now() : finiteNumber(value.created, 'files.' + key + '.created'),
      ...(value.lastRetrieved === undefined ? {} : { lastRetrieved: finiteNumber(value.lastRetrieved, 'files.' + key + '.lastRetrieved') }),
    };
  }
  return files;
}

/**
 * Parse and validate a .excalidraw scene.
 * @param text the stored JSON.
 * @returns the scene.
 */
export function parseBoardScene(text: string): BoardScene {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    fail('The board content is not valid JSON. Send one .excalidraw scene object.');
  }
  if (!isFields(raw)) fail('A board scene must be a JSON object.');
  if (raw.type !== BOARD_SCENE_TYPE) fail('A board scene must have type "excalidraw".');
  if (raw.version !== BOARD_SCENE_VERSION) fail('Unsupported board scene version ' + String(raw.version) + '; this build reads version 2.');
  if (!Array.isArray(raw.elements)) fail('A board scene needs an elements array.');
  if (raw.elements.length > BOARD_LIMITS.maxElements) fail('A board holds at most ' + String(BOARD_LIMITS.maxElements) + ' elements.');
  const files = validateFiles(raw.files);
  const ids = new Set<string>();
  const elements = raw.elements.map((item: unknown, index: number) => {
    const element = validateElement(item, 'elements[' + String(index) + ']', files);
    const id = String(element.id);
    if (ids.has(id)) fail('Two elements use the id "' + id + '".');
    ids.add(id);
    return element;
  });
  const appState = validateAppState(raw.appState);
  return {
    type: BOARD_SCENE_TYPE,
    version: BOARD_SCENE_VERSION,
    source: typeof raw.source === 'string' ? checkString(raw.source, 'source', 200) : BOARD_SOURCE,
    elements,
    appState,
    files,
  };
}

/**
 * Serialise a scene in a stable, readable form.
 * @param scene the scene.
 * @returns the stored JSON.
 */
export function serializeBoardScene(scene: BoardScene): string {
  return JSON.stringify({
    type: BOARD_SCENE_TYPE,
    version: BOARD_SCENE_VERSION,
    source: scene.source || BOARD_SOURCE,
    elements: scene.elements,
    appState: { viewBackgroundColor: scene.appState.viewBackgroundColor, gridSize: scene.appState.gridSize },
    files: scene.files,
  }, null, 2) + '\n';
}

/**
 * Parse and re-serialise a scene, refusing anything that is not a valid board.
 * @param text the stored content.
 * @returns the canonical JSON.
 */
export function normalizeBoardScene(text: string): string {
  return serializeBoardScene(parseBoardScene(text));
}

function visibleElements(scene: BoardScene): BoardElement[] {
  return scene.elements.filter((element) => element.isDeleted !== true && element.type !== 'frame' && element.type !== 'magicframe');
}

/**
 * Count elements and types, and compute the visible bounds.
 * @param scene the scene.
 * @returns the summary.
 */
export function summarizeBoard(scene: BoardScene): BoardSummary {
  const types: Record<string, number> = {};
  for (const element of visibleElements(scene)) {
    const type = String(element.type ?? 'unknown');
    types[type] = (types[type] ?? 0) + 1;
  }
  let left = Number.POSITIVE_INFINITY;
  let top = Number.POSITIVE_INFINITY;
  let right = Number.NEGATIVE_INFINITY;
  let bottom = Number.NEGATIVE_INFINITY;
  for (const element of visibleElements(scene)) {
    const x = Number(element.x ?? 0);
    const y = Number(element.y ?? 0);
    const width = Number(element.width ?? 0);
    const height = Number(element.height ?? 0);
    left = Math.min(left, x);
    top = Math.min(top, y);
    right = Math.max(right, x + width);
    bottom = Math.max(bottom, y + height);
  }
  const bounds = Number.isFinite(left) ? { x: left, y: top, width: Math.max(0, right - left), height: Math.max(0, bottom - top) } : null;
  return { elements: scene.elements.length, types, files: Object.keys(scene.files).length, bounds };
}

/* ------------------------------------------------------------------ */
/* Element creation                                                     */
/* ------------------------------------------------------------------ */

let idCounter = 0;

function randomId(): string {
  const cryptoObject = globalThis.crypto as { randomUUID?: () => string } | undefined;
  if (cryptoObject?.randomUUID !== undefined) return cryptoObject.randomUUID().replace(/-/g, '').slice(0, 20);
  idCounter += 1;
  return ('el' + Date.now().toString(36) + String(idCounter) + Math.random().toString(36).slice(2, 8)).slice(0, 20);
}

function randomInt(): number {
  return Math.floor(Math.random() * 2 ** 31);
}

function baseElement(type: string, x: number, y: number, width: number, height: number): BoardElement {
  return {
    id: randomId(),
    type,
    x,
    y,
    width,
    height,
    angle: 0,
    strokeColor: '#1e1e1e',
    backgroundColor: 'transparent',
    fillStyle: 'solid',
    strokeWidth: 2,
    strokeStyle: 'solid',
    roughness: 1,
    opacity: 100,
    roundness: null,
    seed: randomInt(),
    version: 1,
    versionNonce: randomInt(),
    index: null,
    isDeleted: false,
    groupIds: [],
    frameId: null,
    boundElements: null,
    updated: Date.now(),
    link: null,
    locked: false,
  };
}

/** What the agent may add through artifact_board_update. */
export type BoardElementInput =
  | {
    type: 'rectangle' | 'ellipse' | 'diamond';
    x: number; y: number; width: number; height: number;
    text?: string; fontSize?: number; fontFamily?: string | number;
    backgroundColor?: string; strokeColor?: string; fillStyle?: string;
    strokeWidth?: number; strokeStyle?: string; roughness?: number; opacity?: number;
  }
  | {
    type: 'text';
    x: number; y: number; text: string;
    fontSize?: number; fontFamily?: string | number; color?: string; textAlign?: string;
  }
  | {
    type: 'arrow' | 'line';
    x: number; y: number;
    points: [number, number][];
    strokeColor?: string; strokeWidth?: number; strokeStyle?: string;
    startArrowhead?: string | null; endArrowhead?: string | null;
  };

function fontFamilyOf(value: string | number | undefined): number {
  if (value === undefined) return 5;
  if (typeof value === 'number') {
    if (!FONT_VALUES.has(value)) fail('The fontFamily number is not one Excalidraw supports.');
    return value;
  }
  const found = FONT_FAMILIES[value.trim().toLowerCase()];
  if (found === undefined) fail('The fontFamily "' + value + '" is not supported. Use ' + Object.keys(FONT_FAMILIES).join(', ') + ', or its number.');
  return found;
}

function textSize(text: string, fontSize: number): { width: number; height: number } {
  const lines = text.split('\n');
  const longest = lines.reduce((length, line) => Math.max(length, line.length), 0);
  return {
    width: Math.max(fontSize, longest * fontSize * 0.62),
    height: Math.max(fontSize, lines.length * fontSize * 1.25),
  };
}

function textElement(input: { x: number; y: number; text: string; fontSize?: number; fontFamily?: string | number; color?: string; textAlign?: string }): BoardElement {
  const text = input.text.slice(0, BOARD_LIMITS.maxText);
  if (text.trim() === '') fail('A text element needs non-empty text.');
  const fontSize = input.fontSize ?? 20;
  if (!Number.isFinite(fontSize) || fontSize <= 0) fail('fontSize must be positive.');
  const size = textSize(text, fontSize);
  const align = input.textAlign ?? 'left';
  if (!TEXT_ALIGNS.has(align)) fail('textAlign must be left, center, or right.');
  const element = baseElement('text', input.x, input.y, size.width, size.height);
  element.strokeColor = input.color === undefined ? '#1e1e1e' : checkColor(input.color, 'text.color');
  element.backgroundColor = 'transparent';
  element.fillStyle = 'solid';
  element.text = text;
  element.originalText = text;
  element.fontSize = fontSize;
  element.fontFamily = fontFamilyOf(input.fontFamily);
  element.textAlign = align;
  element.verticalAlign = 'top';
  element.containerId = null;
  element.autoResize = true;
  element.lineHeight = 1.25;
  return element;
}

function shapeElements(input: Extract<BoardElementInput, { type: 'rectangle' | 'ellipse' | 'diamond' }>): BoardElement[] {
  if (!(input.width > 0) || !(input.height > 0)) fail('A shape needs a positive width and height.');
  const element = baseElement(input.type, input.x, input.y, input.width, input.height);
  if (input.type !== 'ellipse') element.roundness = { type: 3 };
  if (input.backgroundColor !== undefined) element.backgroundColor = checkColor(input.backgroundColor, 'shape.backgroundColor');
  if (input.strokeColor !== undefined) element.strokeColor = checkColor(input.strokeColor, 'shape.strokeColor');
  if (input.fillStyle !== undefined) {
    if (!FILL_STYLES.has(input.fillStyle)) fail('fillStyle must be ' + [...FILL_STYLES].join(', ') + '.');
    element.fillStyle = input.fillStyle;
  }
  if (input.strokeStyle !== undefined) {
    if (!STROKE_STYLES.has(input.strokeStyle)) fail('strokeStyle must be ' + [...STROKE_STYLES].join(', ') + '.');
    element.strokeStyle = input.strokeStyle;
  }
  if (input.strokeWidth !== undefined) element.strokeWidth = finiteNumber(input.strokeWidth, 'shape.strokeWidth');
  if (input.roughness !== undefined) element.roughness = finiteNumber(input.roughness, 'shape.roughness');
  if (input.opacity !== undefined) element.opacity = finiteNumber(input.opacity, 'shape.opacity');
  if (input.text === undefined || input.text.trim() === '') return [element];
  const fontSize = input.fontSize ?? 20;
  const label = textElement({
    x: input.x,
    y: input.y,
    text: input.text,
    ...(input.fontSize === undefined ? {} : { fontSize }),
    ...(input.fontFamily === undefined ? {} : { fontFamily: input.fontFamily }),
  });
  label.x = input.x + Math.max(0, (input.width - Number(label.width)) / 2);
  label.y = input.y + Math.max(0, (input.height - Number(label.height)) / 2);
  return [element, label];
}

function linearElement(input: Extract<BoardElementInput, { type: 'arrow' | 'line' }>): BoardElement {
  if (!Array.isArray(input.points) || input.points.length < 2) fail('A line needs at least two points.');
  if (!input.points.every((point) => Array.isArray(point) && point.length === 2 && point.every((value) => Number.isFinite(value)))) {
    fail('Each line point must be [dx, dy] with finite numbers.');
  }
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const [dx, dy] of input.points) {
    minX = Math.min(minX, dx); minY = Math.min(minY, dy);
    maxX = Math.max(maxX, dx); maxY = Math.max(maxY, dy);
  }
  const points = input.points.map(([dx, dy]) => [dx - minX, dy - minY]);
  const element = baseElement(input.type, input.x + minX, input.y + minY, maxX - minX, maxY - minY);
  element.points = points;
  element.lastCommittedPoint = null;
  element.startBinding = null;
  element.endBinding = null;
  element.startArrowhead = input.startArrowhead === undefined ? null : input.startArrowhead;
  element.endArrowhead = input.endArrowhead === undefined ? (input.type === 'arrow' ? 'arrow' : null) : input.endArrowhead;
  if (input.type === 'arrow') element.elbowed = false;
  if (input.strokeColor !== undefined) element.strokeColor = checkColor(input.strokeColor, 'line.strokeColor');
  if (input.strokeWidth !== undefined) element.strokeWidth = finiteNumber(input.strokeWidth, 'line.strokeWidth');
  if (input.strokeStyle !== undefined) {
    if (!STROKE_STYLES.has(input.strokeStyle)) fail('strokeStyle must be ' + [...STROKE_STYLES].join(', ') + '.');
    element.strokeStyle = input.strokeStyle;
  }
  return element;
}

/**
 * Turn one validated agent input into complete Excalidraw elements.
 * A shape with text produces a shape and a separate, positioned text element.
 * @param input the input.
 * @returns the elements.
 */
export function createBoardElements(input: BoardElementInput): BoardElement[] {
  if (input.type === 'rectangle' || input.type === 'ellipse' || input.type === 'diamond') return shapeElements(input);
  if (input.type === 'text') return [textElement(input)];
  if (input.type === 'arrow' || input.type === 'line') return [linearElement(input)];
  fail('Unknown element type.');
}

/* ------------------------------------------------------------------ */
/* Operations                                                           */
/* ------------------------------------------------------------------ */

/** One validated operation. */
export type BoardOperation =
  | { op: 'add'; elements: BoardElementInput[] }
  | { op: 'update'; id: string; patch: Record<string, unknown> }
  | { op: 'delete'; ids: string[] }
  | { op: 'clear' };

/** The result of applying operations. */
export interface BoardOperationResult {
  scene: BoardScene;
  notes: string[];
}

function requirePositiveNumber(value: unknown, at: string): number {
  const number = finiteNumber(value, at);
  if (number <= 0) fail(at + ' must be positive.');
  return number;
}

function applyUpdate(element: BoardElement, patch: Record<string, unknown>): BoardElement {
  const next: BoardElement = { ...element };
  const numeric = ['x', 'y', 'width', 'height', 'angle', 'strokeWidth', 'roughness', 'opacity'];
  for (const key of numeric) {
    if (patch[key] === undefined) continue;
    next[key] = finiteNumber(patch[key], 'update.' + key);
  }
  if (next.width !== undefined && Number(next.width) < 0) fail('update.width cannot be negative.');
  if (next.height !== undefined && Number(next.height) < 0) fail('update.height cannot be negative.');
  for (const key of ['strokeColor', 'backgroundColor']) {
    if (patch[key] !== undefined) next[key] = checkColor(patch[key], 'update.' + key);
  }
  if (patch.fillStyle !== undefined) {
    if (typeof patch.fillStyle !== 'string' || !FILL_STYLES.has(patch.fillStyle)) fail('update.fillStyle is not a supported style.');
    next.fillStyle = patch.fillStyle;
  }
  if (patch.strokeStyle !== undefined) {
    if (typeof patch.strokeStyle !== 'string' || !STROKE_STYLES.has(patch.strokeStyle)) fail('update.strokeStyle is not a supported style.');
    next.strokeStyle = patch.strokeStyle;
  }
  if (patch.link !== undefined) {
    if (patch.link !== null) checkString(patch.link, 'update.link', 2000);
    next.link = patch.link as BoardJson;
  }
  if (next.type === 'text') {
    if (patch.text !== undefined) {
      const text = checkString(patch.text, 'update.text', BOARD_LIMITS.maxText);
      if (text.trim() === '') fail('update.text cannot be empty.');
      next.text = text;
      next.originalText = text;
      const fontSize = Number(next.fontSize ?? 20);
      const size = textSize(text, fontSize);
      next.width = size.width;
      next.height = size.height;
    }
    if (patch.fontSize !== undefined) {
      const fontSize = requirePositiveNumber(patch.fontSize, 'update.fontSize');
      next.fontSize = fontSize;
      const text = String(next.text ?? '');
      const size = textSize(text, fontSize);
      next.width = size.width;
      next.height = size.height;
    }
    if (patch.fontFamily !== undefined) next.fontFamily = fontFamilyOf(patch.fontFamily as string | number);
    if (patch.textAlign !== undefined) {
      if (typeof patch.textAlign !== 'string' || !TEXT_ALIGNS.has(patch.textAlign)) fail('update.textAlign is not supported.');
      next.textAlign = patch.textAlign;
    }
  }
  next.version = Number(next.version ?? 1) + 1;
  next.versionNonce = randomInt();
  next.updated = Date.now();
  return next;
}

function removeReferences(elements: BoardElement[], removed: ReadonlySet<string>): BoardElement[] {
  return elements.map((element) => {
    let changed = false;
    const next: BoardElement = { ...element };
    if (Array.isArray(next.boundElements)) {
      const kept = (next.boundElements as BoardJson[]).filter((entry) => {
        const item = entry as Record<string, BoardJson>;
        return typeof item.id !== 'string' || !removed.has(item.id);
      });
      if (kept.length !== (next.boundElements as BoardJson[]).length) { next.boundElements = kept; changed = true; }
    }
    for (const key of ['startBinding', 'endBinding']) {
      const binding = next[key];
      if (binding === null || typeof binding !== 'object' || Array.isArray(binding)) continue;
      if (removed.has(String((binding as Record<string, BoardJson>).elementId ?? ''))) { next[key] = null; changed = true; }
    }
    if (changed) {
      next.version = Number(next.version ?? 1) + 1;
      next.versionNonce = randomInt();
      next.updated = Date.now();
    }
    return next;
  });
}

function parseElementInput(raw: unknown, at: string): BoardElementInput {
  if (!isFields(raw)) fail(at + ' must be an object.', 'board/operation');
  const type = raw.type;
  if (type === 'rectangle' || type === 'ellipse' || type === 'diamond') {
    return {
      type,
      x: finiteNumber(raw.x, at + '.x'),
      y: finiteNumber(raw.y, at + '.y'),
      width: requirePositiveNumber(raw.width, at + '.width'),
      height: requirePositiveNumber(raw.height, at + '.height'),
      ...(optionalString(raw.text, at + '.text', BOARD_LIMITS.maxText) === undefined ? {} : { text: optionalString(raw.text, at + '.text', BOARD_LIMITS.maxText) as string }),
      ...(optionalNumber(raw.fontSize, at + '.fontSize') === undefined ? {} : { fontSize: optionalNumber(raw.fontSize, at + '.fontSize') as number }),
      ...(raw.fontFamily === undefined ? {} : { fontFamily: raw.fontFamily as string | number }),
      ...(optionalString(raw.backgroundColor, at + '.backgroundColor', 100) === undefined ? {} : { backgroundColor: optionalString(raw.backgroundColor, at + '.backgroundColor', 100) as string }),
      ...(optionalString(raw.strokeColor, at + '.strokeColor', 100) === undefined ? {} : { strokeColor: optionalString(raw.strokeColor, at + '.strokeColor', 100) as string }),
      ...(optionalString(raw.fillStyle, at + '.fillStyle', 30) === undefined ? {} : { fillStyle: optionalString(raw.fillStyle, at + '.fillStyle', 30) as string }),
      ...(optionalNumber(raw.strokeWidth, at + '.strokeWidth') === undefined ? {} : { strokeWidth: optionalNumber(raw.strokeWidth, at + '.strokeWidth') as number }),
      ...(optionalString(raw.strokeStyle, at + '.strokeStyle', 30) === undefined ? {} : { strokeStyle: optionalString(raw.strokeStyle, at + '.strokeStyle', 30) as string }),
      ...(optionalNumber(raw.roughness, at + '.roughness') === undefined ? {} : { roughness: optionalNumber(raw.roughness, at + '.roughness') as number }),
      ...(optionalNumber(raw.opacity, at + '.opacity') === undefined ? {} : { opacity: optionalNumber(raw.opacity, at + '.opacity') as number }),
    };
  }
  if (type === 'text') {
    return {
      type,
      x: finiteNumber(raw.x, at + '.x'),
      y: finiteNumber(raw.y, at + '.y'),
      text: checkString(raw.text, at + '.text', BOARD_LIMITS.maxText),
      ...(optionalNumber(raw.fontSize, at + '.fontSize') === undefined ? {} : { fontSize: optionalNumber(raw.fontSize, at + '.fontSize') as number }),
      ...(raw.fontFamily === undefined ? {} : { fontFamily: raw.fontFamily as string | number }),
      ...(optionalString(raw.color, at + '.color', 100) === undefined ? {} : { color: optionalString(raw.color, at + '.color', 100) as string }),
      ...(optionalString(raw.textAlign, at + '.textAlign', 20) === undefined ? {} : { textAlign: optionalString(raw.textAlign, at + '.textAlign', 20) as string }),
    };
  }
  if (type === 'arrow' || type === 'line') {
    const points = raw.points;
    if (!Array.isArray(points) || points.length < 2 || points.length > 100) fail(at + '.points must be a list of 2 to 100 [dx, dy] pairs.', 'board/operation');
    const parsedPoints: [number, number][] = points.map((point, index) => {
      if (!Array.isArray(point) || point.length !== 2) fail(at + '.points[' + String(index) + '] must be [dx, dy].', 'board/operation');
      return [finiteNumber(point[0], at + '.points[' + String(index) + '][0]'), finiteNumber(point[1], at + '.points[' + String(index) + '][1]')];
    });
    return {
      type,
      x: finiteNumber(raw.x, at + '.x'),
      y: finiteNumber(raw.y, at + '.y'),
      points: parsedPoints,
      ...(optionalString(raw.strokeColor, at + '.strokeColor', 100) === undefined ? {} : { strokeColor: optionalString(raw.strokeColor, at + '.strokeColor', 100) as string }),
      ...(optionalNumber(raw.strokeWidth, at + '.strokeWidth') === undefined ? {} : { strokeWidth: optionalNumber(raw.strokeWidth, at + '.strokeWidth') as number }),
      ...(optionalString(raw.strokeStyle, at + '.strokeStyle', 30) === undefined ? {} : { strokeStyle: optionalString(raw.strokeStyle, at + '.strokeStyle', 30) as string }),
      ...(raw.startArrowhead === undefined ? {} : { startArrowhead: raw.startArrowhead as string | null }),
      ...(raw.endArrowhead === undefined ? {} : { endArrowhead: raw.endArrowhead as string | null }),
    };
  }
  fail(at + '.type must be rectangle, ellipse, diamond, text, arrow, or line.', 'board/operation');
}

/**
 * Validate the operations argument.
 * @param value the raw operations.
 * @returns the operations.
 */
export function parseBoardOperations(value: unknown): BoardOperation[] {
  if (!Array.isArray(value) || value.length === 0) fail('Operations must be a non-empty array.', 'board/operation');
  if (value.length > BOARD_LIMITS.maxOperations) fail('At most ' + String(BOARD_LIMITS.maxOperations) + ' operations are allowed.', 'board/operation');
  return value.map((raw, index): BoardOperation => {
    const at = 'operations[' + String(index) + ']';
    if (!isFields(raw)) fail(at + ' must be an object.', 'board/operation');
    const op = raw.op;
    if (op === 'add') {
      if (!Array.isArray(raw.elements) || raw.elements.length === 0 || raw.elements.length > BOARD_LIMITS.maxAdditions) {
        fail(at + '.elements must list 1 to ' + String(BOARD_LIMITS.maxAdditions) + ' elements.', 'board/operation');
      }
      return { op: 'add', elements: raw.elements.map((element, elementIndex) => parseElementInput(element, at + '.elements[' + String(elementIndex) + ']')) };
    }
    if (op === 'update') {
      const id = checkString(raw.id, at + '.id', BOARD_LIMITS.maxId);
      if (!isFields(raw.patch)) fail(at + '.patch must be an object.', 'board/operation');
      return { op: 'update', id, patch: { ...raw.patch } };
    }
    if (op === 'delete') {
      if (!Array.isArray(raw.ids) || raw.ids.length === 0) fail(at + '.ids must be a non-empty list.', 'board/operation');
      return { op: 'delete', ids: raw.ids.map((id, idIndex) => checkString(id, at + '.ids[' + String(idIndex) + ']', BOARD_LIMITS.maxId)) };
    }
    if (op === 'clear') return { op: 'clear' };
    fail(at + '.op must be add, update, delete, or clear.', 'board/operation');
  });
}

/**
 * Apply operations to a stored scene.
 * @param text the current content.
 * @param operations the raw operations.
 * @returns the next scene and one note per operation.
 */
export function applyBoardOperations(text: string, operations: unknown): BoardOperationResult {
  const scene = parseBoardScene(text);
  const parsed = parseBoardOperations(operations);
  let elements = [...scene.elements];
  const notes: string[] = [];
  for (const entry of parsed) {
    if (entry.op === 'add') {
      const created = entry.elements.flatMap((input) => createBoardElements(input));
      if (elements.length + created.length > BOARD_LIMITS.maxElements) fail('A board holds at most ' + String(BOARD_LIMITS.maxElements) + ' elements.', 'board/operation');
      elements.push(...created);
      notes.push('added ' + String(created.length) + ' element(s): ' + created.map((element) => element.type + '#' + String(element.id)).join(', '));
      continue;
    }
    if (entry.op === 'update') {
      const index = elements.findIndex((element) => element.id === entry.id);
      if (index < 0) fail('No element has the id "' + entry.id + '".', 'board/operation');
      const current = elements[index];
      if (current === undefined) fail('No element has the id "' + entry.id + '".', 'board/operation');
      elements[index] = applyUpdate(current, entry.patch);
      notes.push('updated ' + String(current.type) + '#' + entry.id);
      continue;
    }
    if (entry.op === 'delete') {
      const removed = new Set(entry.ids);
      const before = elements.length;
      elements = elements.filter((element) => !removed.has(String(element.id)));
      if (elements.length === before) fail('None of the ids in the delete operation existed.', 'board/operation');
      elements = removeReferences(elements, removed);
      notes.push('deleted ' + String(before - elements.length) + ' element(s)');
      continue;
    }
    elements = [];
    notes.push('cleared the board');
  }
  const next: BoardScene = { ...scene, source: BOARD_SOURCE, elements };
  // Re-validate through the same parser so a bug cannot produce stored content
  // the read path would refuse.
  return { scene: parseBoardScene(serializeBoardScene(next)), notes };
}

/**
 * Advisory warnings for one scene.
 * @param scene the scene.
 * @returns messages, each starting with a code.
 */
export function checkBoard(scene: BoardScene): string[] {
  const warnings: string[] = [];
  const summary = summarizeBoard(scene);
  if (summary.elements > 800) warnings.push('large-board: ' + String(summary.elements) + ' elements may be slow to edit. Split the board or delete unused elements.');
  if (summary.elements === 0) warnings.push('empty-board: the scene has no visible elements. Add at least one shape or text element before saving.');
  return warnings;
}

/**
 * A starter scene with a title, a note, and two connected shapes.
 * @param title the board title, inserted as text.
 * @returns the canonical scene JSON.
 */
export function starterBoard(title: string): string {
  const elements: BoardElement[] = [];
  elements.push(textElement({ x: 80, y: 56, text: title, fontSize: 32 }));
  elements.push(textElement({ x: 80, y: 104, text: 'Sketch the idea, then edit with the agent.', fontSize: 16, color: '#5b6170' }));
  elements.push(...shapeElements({ type: 'rectangle', x: 80, y: 176, width: 240, height: 96, text: 'Start here', backgroundColor: '#a5d8ff', fillStyle: 'solid', strokeColor: '#1971c2' }));
  elements.push(...shapeElements({ type: 'ellipse', x: 400, y: 176, width: 200, height: 96, text: 'Next step', backgroundColor: '#b2f2bb', fillStyle: 'solid', strokeColor: '#2f9e44' }));
  elements.push(linearElement({ type: 'arrow', x: 320, y: 224, points: [[0, 0], [80, 0]], strokeColor: '#1e1e1e' }));
  return serializeBoardScene({ type: BOARD_SCENE_TYPE, version: BOARD_SCENE_VERSION, source: BOARD_SOURCE, elements, appState: { viewBackgroundColor: '#ffffff', gridSize: null }, files: {} });
}
