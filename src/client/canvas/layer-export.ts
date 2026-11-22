import type { CanvasKit } from 'canvaskit-wasm';
import { SkiaRenderer } from '@open-pencil/core/canvas';
import { renderNodesToImage } from '@open-pencil/core/io/formats/raster';
import { renderNodesToSVG } from '@open-pencil/core/io/formats/svg';
import type { SceneGraph } from '@open-pencil/scene-graph';

/** One layer rendered on its own. */
interface RenderedLayer {
  data: Uint8Array;
  mediaType: string;
}

/**
 * Render one node of the live scene graph at its own size.
 *
 * The editor's renderer keeps per-node caches on the live canvas, so this uses
 * a renderer of its own, exactly as the host's headless export does.
 *
 * @param ck the CanvasKit instance the canvas already loaded.
 * @param graph the scene graph.
 * @param pageId the page the node sits on.
 * @param nodeId the node to render.
 * @param format the output format.
 * @returns the file bytes and media type.
 */
export async function renderLayer(
  ck: CanvasKit,
  graph: SceneGraph,
  pageId: string,
  nodeId: string,
  format: 'png' | 'svg',
): Promise<RenderedLayer> {
  if (format === 'svg') {
    const svg = renderNodesToSVG(graph, pageId, [nodeId], { xmlDeclaration: true });
    if (svg === null) throw new Error('The layer produced no SVG.');
    return { data: new TextEncoder().encode(svg), mediaType: 'image/svg+xml' };
  }
  const surface = ck.MakeSurface(1, 1);
  if (surface === null) throw new Error('The layer could not be rendered.');
  const renderer = new SkiaRenderer(ck, surface);
  renderer.viewportWidth = 1;
  renderer.viewportHeight = 1;
  renderer.dpr = 1;
  try {
    await renderer.loadFonts();
    renderer.invalidateAllPictures();
    await renderer.prepareForExport(graph, pageId, [nodeId]);
    // No trim: the file keeps the layer's own box, as the inspector reports it.
    const png = renderNodesToImage(ck, renderer, graph, pageId, [nodeId], {
      scale: 1,
      format: 'PNG',
      trimTransparent: false,
    });
    if (png === null) throw new Error('The layer produced no image.');
    return { data: png, mediaType: 'image/png' };
  } finally {
    renderer.destroy();
  }
}
