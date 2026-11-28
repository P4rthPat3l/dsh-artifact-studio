import { Buffer } from 'node:buffer';
import fs from 'node:fs/promises';
import { SceneGraph } from '@open-pencil/scene-graph';
import type { SceneNode } from '@open-pencil/scene-graph';
import { designJSXRenderer } from '@open-pencil/core/design-jsx';
import { fontManager } from '@open-pencil/core/text';
import { createLinter } from '@open-pencil/core/lint';
import { computeContentBounds, headlessRenderNodes } from '@open-pencil/core/io/formats/raster';
import { renderNodesToSVG } from '@open-pencil/core/io/formats/svg';
import { exportFigFile, parseFigFile } from '@open-pencil/core/io/formats/fig';
import { selectionToJSX } from '@open-pencil/design-jsx';
import { layoutAuthoredNodes } from '@open-pencil/core/layout';
import type { DesignInfo, DesignOutlineRow } from '../../contract.js';
import { BUNDLED_FAMILIES, aliasUnbundledFamilies } from '../../fonts.js';
import { bundledIconProvider } from '../../icon-set.js';
import { buildPageModel } from './page-model.js';
import type { WorkerRequest, WorkerResponse } from './protocol.js';

/** The Roboto faces the package ships, by style. */
const EXTRA_FONTS: ReadonlyArray<readonly [string, string]> = [
  ['Regular', 'Roboto-Regular.woff2'],
  ['Medium', 'Roboto-Medium.woff2'],
  ['Bold', 'Roboto-Bold.woff2'],
];

/**
 * Load the extra bundled faces into the font manager before anything compiles.
 * The engine's own manifest only knows Inter and Noto, so a family is added here.
 */
async function loadExtraFonts(): Promise<void> {
  for (const [style, file] of EXTRA_FONTS) {
    const bytes = await fs.readFile(new URL('../../../assets/fonts/' + file, import.meta.url));
    const copy = new Uint8Array(bytes.byteLength);
    copy.set(bytes);
    fontManager.markLoaded('Roboto', style, copy.buffer);
  }
}

/**
 * Read one bundled Inter face, used to draw a family the package does not ship.
 * @param file the file name under assets/fonts.
 * @returns the bytes.
 */
async function readBundledFace(file: string): Promise<ArrayBuffer> {
  const bytes = await fs.readFile(new URL('../../../assets/fonts/' + file, import.meta.url));
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

/** The bundled Material Design Icons set, read on the first icon. */
const { renderJSX } = designJSXRenderer(
  bundledIconProvider(async () => JSON.parse(await fs.readFile(new URL('../../../assets/icons.json', import.meta.url), 'utf8'))),
);

interface Compiled {
  graph: SceneGraph;
  page: SceneNode;
  renderWarnings: string[];
}

/**
 * The message of a thrown value.
 * @param error the value.
 * @returns its message.
 */
function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Compile a source into a graph whose first page holds the top-level elements,
 * keeping the renderer's warnings about ignored props and helper options.
 * @param source the Design JSX source.
 * @returns the graph, page, and warnings.
 */
async function compile(source: string): Promise<Compiled> {
  const graph = new SceneGraph();
  const results = await renderJSX(graph, source);
  const page = graph.getPages()[0];
  if (page === undefined) throw new Error('The design has no page.');
  const renderWarnings: string[] = [];
  for (const result of results) {
    for (const warning of result.warnings ?? []) {
      if (!renderWarnings.includes(warning)) renderWarnings.push(warning);
    }
  }
  return { graph, page, renderWarnings };
}

/** The most rows an outline carries, across both levels. */
const OUTLINE_ROWS = 120;

/**
 * The layers the patch flow can target: every top-level layer and one level of
 * its children, capped, so a large design still reads cheaply. A row's path is
 * the dotted index chain from the page, which a compile of the same source
 * always reproduces.
 * @param graph the graph.
 * @param page the page node.
 * @returns the outline rows.
 */
function outlineOf(graph: SceneGraph, page: SceneNode): DesignOutlineRow[] {
  const rows: DesignOutlineRow[] = [];
  let budget = OUTLINE_ROWS;
  page.childIds.forEach((id, index) => {
    if (budget <= 0) return;
    const node = graph.getNode(id);
    if (node === undefined) return;
    budget -= 1;
    const children: DesignOutlineRow[] = [];
    node.childIds.forEach((childId, childIndex) => {
      if (budget <= 0) return;
      const child = graph.getNode(childId);
      if (child === undefined) return;
      budget -= 1;
      children.push({ path: String(index) + '.' + String(childIndex), name: child.name, type: String(child.type) });
    });
    rows.push({ path: String(index), name: node.name, type: String(node.type), ...(children.length === 0 ? {} : { children }) });
  });
  return rows;
}

/**
 * Whether the design holds component instances or sets, which the JSX writer
 * downgrades to plain frames on a save. A patch re-serializes the whole design.
 * @param graph the graph.
 * @param page the page node.
 * @returns whether an instance-like node exists.
 */
function hasInstanceLike(graph: SceneGraph, page: SceneNode): boolean {
  return descendants(graph, page).some((node) => node.type === 'INSTANCE' || node.type === 'COMPONENT_SET');
}

/**
 * The first LIMIT warnings, with one line counting the rest.
 * @param lines the warnings.
 * @param noun what the rest are, in the closing line.
 * @returns the capped warnings.
 */
function capWarnings(lines: readonly string[], noun: string): string[] {
  const LIMIT = 12;
  const kept = lines.slice(0, LIMIT);
  const rest = lines.length - kept.length;
  return rest > 0 ? [...kept, `And ${rest} more ${noun}.`] : [...kept];
}

/**
 * Every node below a page, depth first.
 * @param graph the graph.
 * @param page the page node.
 * @returns the nodes.
 */
/**
 * The failure a compile or patch render produced, with guidance where the
 * engine message names a limitation the model can act on.
 * @param error the thrown value.
 * @returns the failure response.
 */
function compileFailure(error: unknown): WorkerResponse {
  const message = messageOf(error);
  const missing = /^Icon "([^"]+)" not found$/.exec(message);
  if (missing !== null) {
    return { ok: false, code: 'artifact/design-icon-not-found', message: 'The bundled mdi set has no "' + (missing[1] ?? '') + '". Use a name from the mdi set.' };
  }
  if (/^Icon set "[^"]+" is not bundled\./.test(message)) {
    return { ok: false, code: 'artifact/design-icon-not-found', message };
  }
  if (/^Variable "[^"]+" not found$/.test(message)) {
    return {
      ok: false,
      code: 'artifact/design-variable',
      message: 'Design JSX cannot create variables; designVar() and defineVars() only reference variables the document already has, which a .fig import may carry. Use literal colors instead.',
    };
  }
  return { ok: false, code: 'artifact/design-invalid', message };
}

function descendants(graph: SceneGraph, page: SceneNode): SceneNode[] {
  const out: SceneNode[] = [];
  const visit = (id: string): void => {
    const node = graph.getNode(id);
    if (node === undefined) return;
    out.push(node);
    for (const child of node.childIds) visit(child);
  };
  for (const id of page.childIds) visit(id);
  return out;
}

/**
 * The highest design-lint severities, as the summary's warnings.
 * Info rules stay out: token adoption and structure hygiene are suggestions.
 * min-text-size stays out too: mockups legitimately carry small labels as content.
 * A lint failure must never block saving, so any throw returns nothing.
 * @param graph the compiled graph.
 * @returns the warnings.
 */
function lintWarnings(graph: SceneGraph): string[] {
  try {
    const result = createLinter({ preset: 'recommended' }).lintGraph(graph);
    const relevant = result.messages.filter((message) => (message.severity === 'error' || message.severity === 'warning') && message.ruleId !== 'min-text-size');
    return capWarnings(relevant.map((message) => `Design issue, ${message.nodePath.join(' / ')}: ${message.message}`), 'design issues');
  } catch {
    return [];
  }
}

/**
 * Count the design's nodes, record its types and fonts, and warn about
 * families the engine cannot load, ignored authoring options, lint issues, and
 * layout the engine does not lint.
 * @param graph the graph.
 * @param page the page node.
 * @param renderWarnings the renderer's own warnings about the source.
 * @returns the summary.
 */
function summarize(graph: SceneGraph, page: SceneNode, renderWarnings: readonly string[]): DesignInfo {
  const nodes = descendants(graph, page);
  const types: Record<string, number> = {};
  const fonts = new Set<string>();
  for (const node of nodes) {
    const type = String(node.type);
    types[type] = (types[type] ?? 0) + 1;
    if (typeof node.fontFamily === 'string' && node.fontFamily.trim() !== '') fonts.add(node.fontFamily.trim());
  }
  const sorted = [...fonts].sort();
  const warnings = sorted
    .filter((family) => !BUNDLED_FAMILIES.has(family))
    .map((family) => `Font "${family}" is not bundled; the mockup draws it in Inter. Use Inter, Roboto, or Noto Naskh Arabic for the face you want.`);
  return {
    pages: graph.getPages().length,
    nodes: nodes.length,
    types,
    fonts: sorted,
    outline: outlineOf(graph, page),
    warnings: [
      ...warnings,
      ...capWarnings(renderWarnings, 'render warnings'),
      ...lintWarnings(graph),
      ...capWarnings(layoutWarnings(graph, page), 'layout issues'),
    ],
  };
}

/**
 * Convert a .fig file into stored Design JSX: the first page that holds elements,
 * serialized like the panel's own save path. Non-empty pages after it are named
 * in warnings, because the stored mockup keeps one page.
 * @param bytes64 the base64 file bytes the host read.
 * @returns the response.
 */
async function handleImport(bytes64: string): Promise<WorkerResponse> {
  const bytes = Buffer.from(bytes64, 'base64');
  if (bytes.byteLength === 0) {
    return { ok: false, code: 'artifact/bad-request', message: 'The import received no .fig bytes.' };
  }
  const view = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  let graph: SceneGraph;
  try {
    graph = await parseFigFile(view, { populate: 'all' });
  } catch (error) {
    return { ok: false, code: 'artifact/bad-request', message: 'The file is not a readable .fig document: ' + messageOf(error) };
  }
  const pages = graph.getPages();
  const page = pages.find((candidate) => candidate.childIds.length > 0);
  if (page === undefined) {
    return { ok: false, code: 'artifact/bad-request', message: 'The file has no page with elements. Draw the mockup in Figma before exporting it.' };
  }
  const source = selectionToJSX(page.childIds, graph);
  if (source === null) {
    return { ok: false, code: 'artifact/design-render-failed', message: 'The design produced no source.' };
  }
  const info = summarize(graph, page, []);
  const skipped = pages.filter((candidate) => candidate !== page && candidate.childIds.length > 0).length;
  if (skipped > 0) {
    info.warnings.push(`The file holds ${skipped} more page${skipped === 1 ? '' : 's'}; only "${page.name}" was imported.`);
  }
  return { ok: true, info, source };
}

/**
 * The layer at a dotted index path from the page, or undefined when any step
 * is out of range or the path is not a chain of whole numbers.
 * @param graph the graph.
 * @param page the page node.
 * @param path the dotted path, such as "0.1".
 * @returns the node, or undefined.
 */
function nodeAtPath(graph: SceneGraph, page: SceneNode, path: string): SceneNode | undefined {
  const parts = path.split('.').map((part) => Number.parseInt(part, 10));
  if (parts.length === 0 || parts.some((part) => !Number.isInteger(part) || part < 0)) return undefined;
  let node = page;
  for (const part of parts) {
    const child = graph.getNode(node.childIds[part] ?? '');
    if (child === undefined) return undefined;
    node = child;
  }
  return node;
}

/**
 * Apply one patch to a compiled design and return the stored source that
 * results. The patch renders beside its target with layout deferred, takes the
 * target's place in its parent's child order, and the target is deleted before
 * layout, in the same order the engine's own preview stage uses.
 * @param source the stored Design JSX source.
 * @param request the patch action and its target.
 * @returns the response.
 */
async function handlePatch(source: string, request: WorkerRequest): Promise<WorkerResponse> {
  const patch = request.patch ?? '';
  const targetPath = request.targetPath ?? '';
  if (patch.trim() === '' || targetPath === '') {
    return { ok: false, code: 'artifact/bad-request', message: 'A patch needs the patch JSX and the targetPath of the layer it replaces.' };
  }
  let compiled: Compiled;
  try {
    compiled = await compile(source);
  } catch (error) {
    return compileFailure(error);
  }
  if (hasInstanceLike(compiled.graph, compiled.page)) {
    return {
      ok: false,
      code: 'artifact/design-instances',
      message: 'This design holds component instances, and a patch save would downgrade them to plain frames. Send the complete source through artifact_update instead.',
    };
  }
  const target = nodeAtPath(compiled.graph, compiled.page, targetPath);
  if (target === undefined) {
    return { ok: false, code: 'artifact/bad-request', message: 'Patch path "' + targetPath + '" does not exist in the current design. Read it again for a fresh outline.' };
  }
  const parentId = target.parentId;
  if (parentId === null) {
    return { ok: false, code: 'artifact/bad-request', message: 'Patch path "' + targetPath + '" has no parent.' };
  }
  const parent = compiled.graph.getNode(parentId);
  if (parent === undefined) {
    return { ok: false, code: 'artifact/bad-request', message: 'Patch path "' + targetPath + '" has no parent.' };
  }
  const index = parent.childIds.indexOf(target.id);
  let results;
  try {
    results = await renderJSX(compiled.graph, patch, { parentId, deferLayout: true });
  } catch (error) {
    return compileFailure(error);
  }
  if (results.length !== 1) {
    return { ok: false, code: 'artifact/bad-request', message: 'A patch must hold exactly one top-level element; this one rendered ' + String(results.length) + '.' };
  }
  const newId = results[0]?.id;
  if (newId === undefined) {
    return { ok: false, code: 'artifact/design-render-failed', message: 'The patch produced no layer.' };
  }
  const patchWarnings: string[] = [];
  for (const result of results) {
    for (const warning of result.warnings ?? []) {
      if (!patchWarnings.includes(warning)) patchWarnings.push(warning);
    }
  }
  compiled.graph.reorderChild(newId, parentId, index);
  compiled.graph.deleteNode(target.id);
  layoutAuthoredNodes(compiled.graph, [newId]);
  const next = selectionToJSX(compiled.page.childIds, compiled.graph);
  if (next === null) {
    return { ok: false, code: 'artifact/design-render-failed', message: 'The patched design produced no source.' };
  }
  const info = summarize(compiled.graph, compiled.page, patchWarnings);
  return { ok: true, info, source: next };
}

/** A box in page coordinates. */
interface PageBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * A text layer's opening words, for a warning that has to name the layer.
 * @param node the text node.
 * @returns the label.
 */
function textLabel(node: SceneNode): string {
  const text = String(node.text ?? '').replace(/\s+/g, ' ').trim();
  if (text === '') return '(empty)';
  return text.length > 40 ? text.slice(0, 40) + '...' : text;
}

/**
 * What the layout gets wrong: a line height under the font size, text outside
 * its frame, and two texts that share an origin because their frame has no flex.
 * The engine lints contrast but not geometry, and these are the mistakes a
 * mockup shows first, so the summary names them before the render.
 * @param graph the graph.
 * @param page the page node.
 * @returns the warnings.
 */
function layoutWarnings(graph: SceneGraph, page: SceneNode): string[] {
  const messages: string[] = [];
  const boxes = new Map<string, PageBox>();
  const boxOf = (node: SceneNode): PageBox => {
    const cached = boxes.get(node.id);
    if (cached !== undefined) return cached;
    let x = node.x;
    let y = node.y;
    let parentId = node.parentId;
    while (parentId !== null && parentId !== page.id) {
      const parent = graph.getNode(parentId);
      if (parent === undefined) break;
      x += parent.x;
      y += parent.y;
      parentId = parent.parentId;
    }
    const box = { x, y, w: node.width, h: node.height };
    boxes.set(node.id, box);
    return box;
  };
  const siblings = new Map<string, SceneNode[]>();
  for (const node of descendants(graph, page)) {
    if (node.type !== 'TEXT' || node.visible === false) continue;
    const lineHeight = node.lineHeight ?? 0;
    if (lineHeight > 0 && lineHeight < node.fontSize) {
      messages.push(
        `Text "${textLabel(node)}" sets lineHeight ${String(Number(lineHeight.toFixed(2)))} under its ${String(Number(node.fontSize.toFixed(2)))} px size, so its lines overlap. Set a pixel line height of at least the font size, or leave it out.`,
      );
    }
    const parent = node.parentId === null ? undefined : graph.getNode(node.parentId);
    if (parent !== undefined && parent.id !== page.id && node.layoutPositioning !== 'ABSOLUTE') {
      const inner = boxOf(node);
      const frame = boxOf(parent);
      if (inner.x + inner.w > frame.x + frame.w + 0.5 || inner.y + inner.h > frame.y + frame.h + 0.5) {
        messages.push(`Text "${textLabel(node)}" leaves its frame "${parent.name}". Give the text a width, or widen the frame.`);
      }
    }
    const key = node.parentId ?? '';
    const list = siblings.get(key);
    if (list === undefined) siblings.set(key, [node]);
    else list.push(node);
  }
  for (const [parentId, list] of siblings) {
    const parent = graph.getNode(parentId);
    if (parent === undefined || parent.id === page.id || parent.layoutMode !== 'NONE') continue;
    for (let i = 0; i < list.length; i += 1) {
      for (let j = i + 1; j < list.length; j += 1) {
        const first = list[i];
        const second = list[j];
        if (first === undefined || second === undefined) continue;
        if (first.layoutPositioning === 'ABSOLUTE' || second.layoutPositioning === 'ABSOLUTE') continue;
        const a = boxOf(first);
        const b = boxOf(second);
        const shared = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
        const height = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
        const smaller = Math.min(a.w * a.h, b.w * b.h);
        if (shared > 0 && height > 0 && smaller > 0 && (shared * height) / smaller > 0.2) {
          messages.push(
            `Text "${textLabel(first)}" overlaps "${textLabel(second)}" in "${parent.name}", because that frame has no flex. Give the frame flex with a gap, or position them on purpose.`,
          );
        }
      }
    }
  }
  return messages;
}

/**
 * Read a PNG's pixel size from its IHDR chunk.
 * @param bytes the PNG file.
 * @returns the size.
 */
function pngSize(bytes: Uint8Array): { width: number; height: number } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

/**
 * Rasterize the page, scaled down when it is wider or taller than the cap.
 * @param compiled the graph.
 * @param maxSide the longest side, or zero for the design's own size.
 * @returns the PNG bytes, or null for an empty design.
 */
async function renderPng(compiled: Compiled, maxSide: number): Promise<Uint8Array | null> {
  await aliasUnbundledFamilies(compiled.graph, compiled.page, readBundledFace);
  const bounds = computeContentBounds(compiled.graph, compiled.page.childIds);
  if (bounds === null) return null;
  const width = bounds.maxX - bounds.minX;
  const height = bounds.maxY - bounds.minY;
  const longest = Math.max(width, height);
  const scale = maxSide > 0 && longest > maxSide ? maxSide / longest : 1;
  return headlessRenderNodes(compiled.graph, compiled.page.id, compiled.page.childIds, {
    scale,
    format: 'PNG',
    trimTransparent: true,
  });
}

/**
 * Answer one request.
 * @param source the Design JSX source, or the empty string on an import.
 * @param request the request.
 * @returns the response.
 */
async function handle(source: string, request: WorkerRequest): Promise<WorkerResponse> {
  if (request.action === 'import-fig') return handleImport(request.bytes ?? '');
  if (request.action === 'patch') return handlePatch(source, request);
  let compiled: Compiled;
  try {
    compiled = await compile(source);
  } catch (error) {
    return compileFailure(error);
  }
  const info = summarize(compiled.graph, compiled.page, compiled.renderWarnings);
  if (info.nodes === 0) {
    return {
      ok: false,
      code: 'artifact/design-invalid',
      message: 'The design has no top-level elements. Wrap the layout in a <Frame>.',
    };
  }
  if (request.action === 'inspect') return { ok: true, info };
  try {
    if (request.action === 'preview') {
      const png = await renderPng(compiled, request.maxSide ?? 1600);
      if (png === null) return { ok: false, code: 'artifact/design-render-failed', message: 'The design produced no image.' };
      const size = pngSize(png);
      return { ok: true, info, mediaType: 'image/png', data: Buffer.from(png).toString('base64'), width: size.width, height: size.height };
    }
    if (request.format === 'fig') {
      const bytes = await exportFigFile(compiled.graph);
      return { ok: true, info, mediaType: 'application/octet-stream', data: Buffer.from(bytes).toString('base64') };
    }
    if (request.format === 'svg') {
      await aliasUnbundledFamilies(compiled.graph, compiled.page, readBundledFace);
      const svg = renderNodesToSVG(compiled.graph, compiled.page.id, compiled.page.childIds, { xmlDeclaration: true });
      if (svg === null) return { ok: false, code: 'artifact/design-render-failed', message: 'The design produced no SVG.' };
      return { ok: true, info, mediaType: 'image/svg+xml', data: Buffer.from(svg, 'utf8').toString('base64') };
    }
    if (request.format === 'html-svg') {
      await aliasUnbundledFamilies(compiled.graph, compiled.page, readBundledFace);
      const model = await buildPageModel(compiled.graph, compiled.page);
      return { ok: true, info, mediaType: 'application/json', data: Buffer.from(JSON.stringify(model), 'utf8').toString('base64') };
    }
    const png = await renderPng(compiled, 0);
    if (png === null) return { ok: false, code: 'artifact/design-render-failed', message: 'The design produced no image.' };
    const size = pngSize(png);
    return { ok: true, info, mediaType: 'image/png', data: Buffer.from(png).toString('base64'), width: size.width, height: size.height };
  } catch (error) {
    return { ok: false, code: 'artifact/design-render-failed', message: messageOf(error) };
  }
}

/**
 * Read the one JSON request from stdin.
 * @returns the request.
 */
async function readRequest(): Promise<WorkerRequest> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk as Buffer));
  const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  if (parsed === null || typeof parsed !== 'object') throw new Error('The design request is not an object.');
  const fields: Record<string, unknown> = { ...parsed };
  if (typeof fields.nonce !== 'string' || fields.nonce === '') throw new Error('The design request has no nonce.');
  if (typeof fields.source !== 'string') throw new Error('The design request has no source.');
  if (fields.action !== 'inspect' && fields.action !== 'preview' && fields.action !== 'export' && fields.action !== 'import-fig' && fields.action !== 'patch') {
    throw new Error('The design request has an unknown action.');
  }
  return {
    nonce: fields.nonce,
    action: fields.action,
    source: fields.source,
    ...(typeof fields.maxSide === 'number' ? { maxSide: fields.maxSide } : {}),
    ...(fields.format === 'png' || fields.format === 'svg' || fields.format === 'fig' || fields.format === 'html-svg' ? { format: fields.format } : {}),
    ...(typeof fields.bytes === 'string' ? { bytes: fields.bytes } : {}),
    ...(typeof fields.patch === 'string' ? { patch: fields.patch } : {}),
    ...(typeof fields.targetPath === 'string' ? { targetPath: fields.targetPath } : {}),
  };
}

await loadExtraFonts();
const request = await readRequest();
const response = await handle(request.source, request);
process.stdout.write(request.nonce + JSON.stringify(response) + '\n', () => process.exit(0));
