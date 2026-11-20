import { getWorldMatrix } from '@open-pencil/scene-graph';
import { SceneGraph } from '@open-pencil/scene-graph';
import type { SceneNode } from '@open-pencil/scene-graph';
import { headlessRenderNodes } from '@open-pencil/core/io/formats/raster';
import { renderNodesToSVG } from '@open-pencil/core/io/formats/svg';
import type { SvgClip, SvgMatrix, SvgPageModel, SvgTextBox, SvgTextRun } from '../lib/svg-model.js';

/** The default family a text node takes when the design names none. */
const DEFAULT_FAMILY = 'Inter';
/** How small the layout raster is; it exists only to fix text heights. */
const LAYOUT_SCALE = 0.05;

/** A colour as hex and alpha, from the first visible solid fill. */
interface Paint {
  color: string;
  alpha: number;
}

/**
 * Read the first visible solid fill of a node or a run style.
 * @param fills the fills.
 * @returns the colour and its alpha.
 */
function paintOf(fills: readonly { visible?: boolean; type: string; color: { r: number; g: number; b: number; a?: number }; opacity?: number }[] | undefined): Paint {
  const fill = fills?.find((entry) => entry.visible !== false && entry.type === 'SOLID');
  if (fill === undefined) return { color: '#000000', alpha: 1 };
  const channel = (value: number): string => Math.round(Math.max(0, Math.min(1, value)) * 255).toString(16).padStart(2, '0');
  const alpha = (fill.opacity ?? 1) * (fill.color.a ?? 1);
  return { color: '#' + channel(fill.color.r) + channel(fill.color.g) + channel(fill.color.b), alpha };
}

/**
 * The box of the nearest ancestor that clips its content.
 * @param graph the scene graph.
 * @param node the text node.
 * @param pageId the page the text sits on.
 * @returns the clip box, or null.
 */
function clipOf(graph: SceneGraph, node: SceneNode, pageId: string): SvgClip | null {
  let parentId = node.parentId;
  let guard = 0;
  while (parentId !== null && parentId !== pageId && guard < 200) {
    guard += 1;
    const parent = graph.getNode(parentId);
    if (parent === undefined) return null;
    if (parent.clipsContent) {
      const bounds = graph.getAbsoluteBounds(parent.id);
      return { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height };
    }
    parentId = parent.parentId;
  }
  return null;
}

/**
 * The text split into styled runs. A run that leaves a field out keeps the node's value.
 * @param node the text node.
 * @param base the node's own style.
 * @returns the runs, or an empty list when the text is one style.
 */
function runsOf(node: SceneNode, base: SvgTextRun): SvgTextRun[] {
  if (node.styleRuns.length === 0) return [];
  const text = node.text;
  const runs: SvgTextRun[] = [];
  let cursor = 0;
  const ordered = [...node.styleRuns].sort((left, right) => left.start - right.start);
  for (const run of ordered) {
    if (run.start > cursor) runs.push({ ...base, text: text.slice(cursor, run.start) });
    const style = run.style;
    const paint = paintOf(style.fills);
    runs.push({
      text: text.slice(run.start, run.start + run.length),
      size: style.fontSize ?? base.size,
      weight: style.fontWeight ?? base.weight,
      italic: style.italic ?? base.italic,
      letterSpacing: style.letterSpacing ?? base.letterSpacing,
      color: style.fills === undefined ? base.color : paint.color,
      alpha: style.fills === undefined ? base.alpha : paint.alpha,
    });
    cursor = run.start + run.length;
  }
  if (cursor < text.length) runs.push({ ...base, text: text.slice(cursor) });
  return runs.filter((run) => run.text !== '');
}

/**
 * Every node below the page, depth first.
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
 * The page size from the SVG root the engine wrote.
 * @param svg the shapes SVG.
 * @returns the width and height.
 */
function sizeOfSvg(svg: string): { width: number; height: number } {
  const match = /<svg[^>]*\swidth="([0-9.]+)"[^>]*\sheight="([0-9.]+)"/.exec(svg);
  if (match === null) throw new Error('The rendered SVG has no size.');
  return { width: Number(match[1]), height: Number(match[2]) };
}

/**
 * Build the page model: the engine's shapes plus one record per text node, after
 * the layout the panel shows. The raster pass exists only to fix text heights with
 * the engine's own measurer; its pixels are unused.
 * @param graph the compiled scene graph.
 * @param page the page node.
 * @returns the model.
 */
export async function buildPageModel(graph: SceneGraph, page: SceneNode): Promise<SvgPageModel> {
  await headlessRenderNodes(graph, page.id, page.childIds, { scale: LAYOUT_SCALE, format: 'PNG', trimTransparent: true });
  const svg = renderNodesToSVG(graph, page.id, page.childIds, { xmlDeclaration: false });
  if (svg === null) throw new Error('The design produced no SVG.');
  const shapes = svg.replace(/<text[^>]*>[\s\S]*?<\/text>/g, '');
  const size = sizeOfSvg(svg);
  const families = new Set<string>();
  const texts: SvgTextBox[] = [];
  for (const node of descendants(graph, page)) {
    if (node.type !== 'TEXT') continue;
    const text = node.text;
    if (text.trim() === '') continue;
    const world = getWorldMatrix(node, graph);
    const at = (index: number): number => world[index] ?? 0;
    const matrix: SvgMatrix = { a: at(0), b: at(3), c: at(1), d: at(4), e: at(2), f: at(5) };
    const family = (node.fontFamily || DEFAULT_FAMILY).trim();
    const paint = paintOf(node.fills);
    const base: SvgTextRun = {
      text,
      size: node.fontSize || 14,
      weight: node.fontWeight || 400,
      italic: node.italic,
      letterSpacing: node.letterSpacing || 0,
      color: paint.color,
      alpha: paint.alpha,
    };
    families.add(family);
    texts.push({
      width: node.width,
      height: node.height,
      matrix,
      text,
      family,
      size: base.size,
      weight: base.weight,
      italic: base.italic,
      letterSpacing: base.letterSpacing,
      lineHeight: (node.lineHeight ?? 0) > 0 ? node.lineHeight : null,
      wrap: node.textAutoResize !== 'WIDTH_AND_HEIGHT',
      textCase: node.textCase,
      align: node.textAlignHorizontal,
      verticalAlign: node.textAlignVertical,
      color: base.color,
      alpha: base.alpha,
      runs: runsOf(node, base),
      clip: clipOf(graph, node, page.id),
    });
  }
  return { width: size.width, height: size.height, svg: shapes, texts, families: [...families] };
}
