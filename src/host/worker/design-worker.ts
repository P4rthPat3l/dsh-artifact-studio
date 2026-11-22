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
import type { DesignInfo } from '../../contract.js';
import { bundledIconProvider } from '../../icon-set.js';
import { buildPageModel } from './page-model.js';
import type { WorkerRequest, WorkerResponse } from './protocol.js';

/** Fonts that ship with the package; any other family is substituted. */
const BUNDLED_FONTS: ReadonlySet<string> = new Set(['Inter', 'Noto Naskh Arabic', 'Roboto']);

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

/** The bundled Material Design Icons set, read on the first icon. */
const { renderJSX } = designJSXRenderer(
  bundledIconProvider(async () => JSON.parse(await fs.readFile(new URL('../../../assets/icons.json', import.meta.url), 'utf8'))),
);

interface Compiled {
  graph: SceneGraph;
  page: SceneNode;
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
 * Compile a source into a graph whose first page holds the top-level elements.
 * @param source the Design JSX source.
 * @returns the graph and page.
 */
async function compile(source: string): Promise<Compiled> {
  const graph = new SceneGraph();
  await renderJSX(graph, source);
  const page = graph.getPages()[0];
  if (page === undefined) throw new Error('The design has no page.');
  return { graph, page };
}

/**
 * Every node below a page, depth first.
 * @param graph the graph.
 * @param page the page node.
 * @returns the nodes.
 */
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
 * A lint failure must never block saving, so any throw returns nothing.
 * @param graph the compiled graph.
 * @returns the warnings.
 */
function lintWarnings(graph: SceneGraph): string[] {
  const LIMIT = 12;
  try {
    const result = createLinter({ preset: 'recommended' }).lintGraph(graph);
    const relevant = result.messages.filter((message) => message.severity === 'error' || message.severity === 'warning');
    const lines = relevant.slice(0, LIMIT).map((message) => `Design issue, ${message.nodePath.join(' / ')}: ${message.message}`);
    const rest = relevant.length - lines.length;
    return rest > 0 ? [...lines, `And ${rest} more design issues.`] : lines;
  } catch {
    return [];
  }
}

/**
 * Count the design's nodes, record its types and fonts, and warn about
 * families the engine cannot load.
 * @param graph the graph.
 * @param page the page node.
 * @returns the summary.
 */
function summarize(graph: SceneGraph, page: SceneNode): DesignInfo {
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
    .filter((family) => !BUNDLED_FONTS.has(family))
    .map((family) => `Font "${family}" is not bundled. The preview substitutes a default face.`);
  return { pages: graph.getPages().length, nodes: nodes.length, types, fonts: sorted, warnings: [...warnings, ...lintWarnings(graph)] };
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
  const info = summarize(graph, page);
  const skipped = pages.filter((candidate) => candidate !== page && candidate.childIds.length > 0).length;
  if (skipped > 0) {
    info.warnings.push(`The file holds ${skipped} more page${skipped === 1 ? '' : 's'}; only "${page.name}" was imported.`);
  }
  return { ok: true, info, source };
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
  let compiled: Compiled;
  try {
    compiled = await compile(source);
  } catch (error) {
    const message = messageOf(error);
    const missing = /^Icon "([^"]+)" not found$/.exec(message);
    if (missing !== null) {
      return { ok: false, code: 'artifact/design-icon-not-found', message: 'The bundled mdi set has no "' + (missing[1] ?? '') + '". Use a name from the mdi set.' };
    }
    if (/^Icon set "[^"]+" is not bundled\./.test(message)) {
      return { ok: false, code: 'artifact/design-icon-not-found', message };
    }
    return { ok: false, code: 'artifact/design-invalid', message };
  }
  const info = summarize(compiled.graph, compiled.page);
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
      const svg = renderNodesToSVG(compiled.graph, compiled.page.id, compiled.page.childIds, { xmlDeclaration: true });
      if (svg === null) return { ok: false, code: 'artifact/design-render-failed', message: 'The design produced no SVG.' };
      return { ok: true, info, mediaType: 'image/svg+xml', data: Buffer.from(svg, 'utf8').toString('base64') };
    }
    if (request.format === 'html-svg') {
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
  if (fields.action !== 'inspect' && fields.action !== 'preview' && fields.action !== 'export' && fields.action !== 'import-fig') {
    throw new Error('The design request has an unknown action.');
  }
  return {
    nonce: fields.nonce,
    action: fields.action,
    source: fields.source,
    ...(typeof fields.maxSide === 'number' ? { maxSide: fields.maxSide } : {}),
    ...(fields.format === 'png' || fields.format === 'svg' || fields.format === 'fig' || fields.format === 'html-svg' ? { format: fields.format } : {}),
    ...(typeof fields.bytes === 'string' ? { bytes: fields.bytes } : {}),
  };
}

await loadExtraFonts();
const request = await readRequest();
const response = await handle(request.source, request);
process.stdout.write(request.nonce + JSON.stringify(response) + '\n', () => process.exit(0));
