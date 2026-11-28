import { layoutAuthoredNodes } from '@open-pencil/core/layout';
import { fontManager } from '@open-pencil/core/text';
import type { SceneGraph, SceneNode } from '@open-pencil/scene-graph';

/**
 * The families the package ships. Any other family has no face to draw, so its
 * text would paint nothing.
 */
export const BUNDLED_FAMILIES: ReadonlySet<string> = new Set(['Inter', 'Noto Naskh Arabic', 'Roboto']);

/** The Inter faces that stand in for a family the package does not ship. */
const ALIAS_FACES: ReadonlyArray<readonly [string, string]> = [
  ['Regular', 'Inter-Regular.ttf'],
  ['Medium', 'Inter-Medium.ttf'],
  ['Bold', 'Inter-Bold.ttf'],
];

/**
 * Draw each family the package does not ship in Inter, so a mockup that names a
 * product font shows text instead of gaps. The nodes keep their family, so no
 * save rewrites the source, and the layout is measured again with the face that
 * will paint it.
 * @param graph the graph the caller is about to render.
 * @param page the page node.
 * @param readFace reads one bundled face by file name.
 * @returns the families that were drawn in Inter.
 */
export async function aliasUnbundledFamilies(
  graph: SceneGraph,
  page: SceneNode,
  readFace: (file: string) => Promise<ArrayBuffer>,
): Promise<string[]> {
  const families = new Set<string>();
  const visit = (id: string): void => {
    const node = graph.getNode(id);
    if (node === undefined) return;
    if (node.type === 'TEXT' && typeof node.fontFamily === 'string' && node.fontFamily.trim() !== '') {
      families.add(node.fontFamily.trim());
    }
    for (const child of node.childIds) visit(child);
  };
  for (const id of page.childIds) visit(id);
  const aliased = [...families].filter((family) => !BUNDLED_FAMILIES.has(family));
  if (aliased.length === 0) return [];
  const faces = await Promise.all(
    ALIAS_FACES.map(async ([style, file]) => [style, await readFace(file)] as const),
  );
  for (const family of aliased) {
    for (const [style, bytes] of faces) fontManager.markLoaded(family, style, bytes);
  }
  layoutAuthoredNodes(graph, page.childIds);
  return aliased;
}
