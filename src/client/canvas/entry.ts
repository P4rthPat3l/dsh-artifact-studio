import { createApp, defineComponent, h, reactive, ref } from 'vue';
import type { App } from 'vue';
import { createDefaultEditorState, createEditor } from '@open-pencil/core/editor';
import type { Editor, Tool } from '@open-pencil/core/editor';
import { getCanvasKit } from '@open-pencil/core/canvaskit';
import { designJSXRenderer } from '@open-pencil/core/design-jsx';
import { fontManager } from '@open-pencil/core/text';
import { SceneGraph } from '@open-pencil/scene-graph';
import type { SceneNode } from '@open-pencil/scene-graph';
import { selectionToJSX } from '@open-pencil/design-jsx';
import { CanvasRoot, LayerTreeRoot, provideEditor } from '@open-pencil/vue';
import { bundledIconProvider } from '../../icon-set.js';
import { createCanvasBridge } from './bridge.js';
import type { SelectionMode } from './bridge.js';
import { CanvasSurface } from './surface.js';
import { clampZoom } from './zoom.js';

declare const __CANVAS_ASSET_VERSION__: string;

/** Where the host serves CanvasKit and the bundled fonts. */
const ASSET_BASE = '/artifacts-canvas/';

/** Tools the dock offers. */
export type CanvasTool = 'select' | 'hand' | 'frame' | 'text' | 'rectangle' | 'ellipse' | 'line' | 'pen';

/** Which editing behaviour a mount allows. */
export type CanvasMode = 'view' | 'edit';

/** The editor tool each dock tool selects. */
const TOOLS: Record<CanvasTool, Tool> = {
  select: 'SELECT',
  hand: 'HAND',
  frame: 'FRAME',
  text: 'TEXT',
  rectangle: 'RECTANGLE',
  ellipse: 'ELLIPSE',
  line: 'LINE',
  pen: 'PEN',
};

/** The dock tool for an editor tool, when the dock shows one. */
const DOCK_TOOLS: Readonly<Record<string, CanvasTool>> = {
  SELECT: 'select',
  HAND: 'hand',
  FRAME: 'frame',
  TEXT: 'text',
  RECTANGLE: 'rectangle',
  ELLIPSE: 'ellipse',
  LINE: 'line',
  PEN: 'pen',
};

/** The Roboto faces the package ships, by style. */
const EXTRA_FONTS: ReadonlyArray<readonly [string, string]> = [
  ['Regular', 'Roboto-Regular.woff2'],
  ['Medium', 'Roboto-Medium.woff2'],
  ['Bold', 'Roboto-Bold.woff2'],
];

/** One selected layer, as the layer bar and the inspector name it. */
export interface SelectedLayer {
  id: string;
  name: string;
  type: string;
  parentName: string;
}

/** One row of the inspector's layer tree. */
export interface LayerRowView {
  id: string;
  name: string;
  type: string;
  level: number;
  hasChildren: boolean;
  expanded: boolean;
  visible: boolean;
  locked: boolean;
  selected: boolean;
}

/** The numeric fields the inspector can edit. */
export type PropertyKey = 'x' | 'y' | 'width' | 'height' | 'rotation' | 'radius' | 'opacity' | 'fontSize';

/** A text layer's typography, when the selection is one text layer. */
export interface TextProperties {
  family: string;
  weight: number;
  fontSize: number;
}

/** The selection's properties. A null field means the selected layers disagree. */
export interface CanvasProperties {
  ids: string[];
  name: string | null;
  type: string | null;
  fill: string | null;
  stroke: string | null;
  x: number | null;
  y: number | null;
  width: number | null;
  height: number | null;
  rotation: number | null;
  radius: number | null;
  opacity: number | null;
  visible: boolean | null;
  text: TextProperties | null;
}

/** A plain, serializable view of the canvas for the React inspector. */
export interface CanvasSnapshot {
  selection: SelectedLayer[];
  rows: LayerRowView[];
  properties: CanvasProperties;
  isText: boolean;
  canUndo: boolean;
  canRedo: boolean;
  zoom: number;
  tool: CanvasTool;
  fit: boolean;
}

/** What Edit with agent quotes for one selected layer. */
export interface LayerQuote {
  name: string;
  path: string;
  type: string;
  parentName: string;
  jsx: string;
}

/** What the tab gives the canvas. */
export interface DesignCanvasOptions {
  element: HTMLElement;
  source: string;
  mode: CanvasMode;
  onChange(source: string): void;
  onSave(): void;
  onFailure?(message: string): void;
  t(key: string): string;
}

/** What the tab can ask the canvas to do. */
export interface DesignCanvasHandle {
  setSource(source: string): void;
  setMode(mode: CanvasMode): void;
  setTool(tool: CanvasTool): void;
  undo(): void;
  redo(): void;
  zoomToFit(): void;
  setZoom(zoom: number): void;
  getSnapshot(): CanvasSnapshot;
  subscribe(listener: (snapshot: CanvasSnapshot) => void): () => void;
  select(id: string, mode: SelectionMode): void;
  clearSelection(): void;
  toggleExpand(id: string): void;
  toggleVisibility(id: string): void;
  toggleLock(id: string): void;
  rename(id: string, name: string): void;
  setVisible(visible: boolean): void;
  duplicateSelection(): void;
  changeOrder(change: 'forward' | 'backward'): void;
  alignSelection(axis: 'horizontal' | 'vertical', align: 'min' | 'center' | 'max'): void;
  setColor(kind: 'fill' | 'stroke', hex: string, commit: boolean): void;
  preview(prop: PropertyKey, value: number): void;
  commit(prop: PropertyKey, value: number, previous: number): void;
  setFamily(family: string): void;
  setWeight(weight: number): void;
  quoteSelection(): LayerQuote | null;
  destroy(): void;
}

/** The module the tab imports from the engine asset. */
export interface DesignCanvasModule {
  mountDesignCanvas(options: DesignCanvasOptions): Promise<DesignCanvasHandle>;
}

/** One compiled source: the graph and the page its top-level nodes sit on. */
interface Compiled {
  graph: SceneGraph;
  page: SceneNode;
}

/**
 * Resolve an engine file, versioned so a package update busts the HTTP cache.
 * @param file the engine file name.
 * @returns the URL.
 */
function assetUrl(file: string): string {
  return ASSET_BASE + file + '?v=' + __CANVAS_ASSET_VERSION__;
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
 * Load the extra bundled faces before compiling. The engine's manifest only knows
 * Inter and Noto, so a family is added by loading its file.
 * @returns nothing, once every face is registered.
 */
async function loadExtraFonts(): Promise<void> {
  for (const [style, file] of EXTRA_FONTS) {
    const response = await fetch(assetUrl('fonts/' + file));
    if (!response.ok) throw new Error('The bundled font ' + file + ' is missing.');
    fontManager.markLoaded('Roboto', style, await response.arrayBuffer());
  }
}

/**
 * Compile a source into a graph whose first page holds the top-level elements.
 * @param source the Design JSX source.
 * @returns the graph and page.
 */
async function compile(source: string): Promise<Compiled> {
  const graph = new SceneGraph();
  await designJSXRenderer(
    bundledIconProvider(async () => {
      const response = await fetch(assetUrl('icons.json'));
      if (!response.ok) throw new Error('The bundled icon set is missing.');
      return response.json();
    }),
  ).renderJSX(graph, source);
  const page = graph.getPages()[0];
  if (page === undefined) throw new Error('The design has no page.');
  return { graph, page };
}

/**
 * The path of a node from the page's top-level frame down to the node.
 * @param graph the scene graph.
 * @param id the node.
 * @param pageId the page's id.
 * @returns the names from the top-level frame down, and the parent's name.
 */
function layerPath(graph: SceneGraph, id: string, pageId: string): { names: string[]; parentName: string } {
  const names: string[] = [];
  let node = graph.getNode(id);
  let parentName = '';
  if (node === undefined) return { names, parentName };
  names.push(node.name);
  let parentId = node.parentId;
  let first = true;
  while (parentId !== null && parentId !== pageId) {
    const parent = graph.getNode(parentId);
    if (parent === undefined) break;
    if (first) parentName = parent.name;
    first = false;
    names.unshift(parent.name);
    parentId = parent.parentId;
  }
  return { names, parentName };
}

/**
 * Mount an editable design canvas over the given element. The caller owns the
 * element and the save flow; the canvas reports serialized edits and never writes.
 * @param options the element, source, mode, and callbacks.
 * @returns the handle, once CanvasKit and the source are ready.
 */
export async function mountDesignCanvas(options: DesignCanvasOptions): Promise<DesignCanvasHandle> {
  const element = options.element;
  await getCanvasKit({ locateFile: (file) => assetUrl(file) });
  fontManager.setBundledFontLocator((file) => assetUrl('fonts/' + file));
  await loadExtraFonts();
  let compiled = await compile(options.source);

  const editor: Editor = createEditor({
    graph: compiled.graph,
    state: reactive(createDefaultEditorState(compiled.page.id)),
    getViewportSize: () => ({
      width: Math.max(1, element.clientWidth),
      height: Math.max(1, element.clientHeight),
    }),
  });
  editor.zoomToFit();

  const mode = ref<CanvasMode>(options.mode);
  let lastFit = true;
  let fitting = false;
  let lastEmitted = options.source;
  let destroyed = false;

  const bridge = createCanvasBridge(editor, (tool) => DOCK_TOOLS[tool] ?? 'select', () => lastFit);

  const Root = defineComponent({
    setup() {
      provideEditor(editor);
      return () =>
        h('div', { class: 'op-root' }, [
          h('div', { class: 'op-canvas' }, [h(CanvasRoot, null, { default: () => h(CanvasSurface, { mode: mode.value }) })]),
          h(LayerTreeRoot, { class: 'op-bridge', indentPerLevel: 14 }, { default: () => h(bridge.component) }),
        ]);
    },
  });
  const app: App<Element> = createApp(Root);
  app.mount(element);

  // Fit once the canvas has a renderer and a size. Fitting before the first
  // frame leaves the zoom at 1 because the viewport is not measured yet.
  let fitAttempts = 0;
  const fitWhenReady = (): void => {
    if (destroyed) return;
    if (editor.renderer === null && fitAttempts < 300) {
      fitAttempts += 1;
      requestAnimationFrame(fitWhenReady);
      return;
    }
    editor.zoomToFit();
    lastFit = true;
    bridge.notify();
  };
  requestAnimationFrame(fitWhenReady);

  // A history entry is one settled edit, so the serialization is current before
  // the tab can save. Text typing may add entries quickly; the source is small.
  const offHistory = editor.onEditorEvent('history:changed', () => {
    if (destroyed) return;
    const next = selectionToJSX(compiled.page.childIds, compiled.graph);
    if (next === lastEmitted) return;
    lastEmitted = next;
    options.onChange(next);
  });
  const offViewport = editor.onEditorEvent('viewport:changed', () => {
    if (fitting) {
      fitting = false;
      lastFit = true;
    } else {
      lastFit = false;
    }
    bridge.notify();
  });
  const offGraph = editor.onEditorEvent('graph:replaced', () => bridge.notify());

  const applyMode = (next: CanvasMode): void => {
    if (mode.value === next) return;
    mode.value = next;
    editor.setTool(TOOLS.select);
    bridge.notify();
  };

  const onKeyDown = (event: KeyboardEvent): void => {
    if (editor.isInteractiveEditing()) return;
    const editing = mode.value === 'edit';
    const meta = event.ctrlKey || event.metaKey;
    const key = event.key.toLowerCase();
    if (meta && key === 's') {
      event.preventDefault();
      options.onSave();
      return;
    }
    if (!editing) return;
    if (meta && key === 'z') {
      event.preventDefault();
      if (event.shiftKey) editor.undo.redo();
      else editor.undo.undo();
      return;
    }
    if (meta && key === 'y') {
      event.preventDefault();
      editor.undo.redo();
      return;
    }
    if (meta || event.altKey) return;
    if (key === 'delete' || key === 'backspace') {
      event.preventDefault();
      editor.deleteSelected();
      return;
    }
    if (key === 'v') editor.setTool(TOOLS.select);
    else if (key === 'h') editor.setTool(TOOLS.hand);
    else if (key === 'f') editor.setTool(TOOLS.frame);
    else if (key === 't') editor.setTool(TOOLS.text);
    else if (key === 'r') editor.setTool(TOOLS.rectangle);
    else if (key === 'e') editor.setTool(TOOLS.ellipse);
    else if (key === 'l') editor.setTool(TOOLS.line);
    else if (key === 'p') editor.setTool(TOOLS.pen);
  };
  const focus = (): void => {
    element.focus({ preventScroll: true });
  };
  element.addEventListener('keydown', onKeyDown);
  element.addEventListener('pointerdown', focus);

  return {
    setSource(source: string): void {
      void (async () => {
        try {
          const next = await compile(source);
          if (destroyed) return;
          compiled = next;
          lastEmitted = source;
          editor.replaceGraph(next.graph);
          editor.zoomToFit();
          lastFit = true;
          bridge.notify();
        } catch (error) {
          if (!destroyed) options.onFailure?.(messageOf(error));
        }
      })();
    },
    setMode(next: CanvasMode): void {
      applyMode(next);
    },
    setTool(tool: CanvasTool): void {
      editor.setTool(TOOLS[tool]);
    },
    undo(): void {
      editor.undo.undo();
    },
    redo(): void {
      editor.undo.redo();
    },
    zoomToFit(): void {
      lastFit = true;
      editor.zoomToFit();
      bridge.notify();
    },
    setZoom(zoom: number): void {
      lastFit = false;
      editor.zoomToLevel(clampZoom(zoom));
      bridge.notify();
    },
    getSnapshot(): CanvasSnapshot {
      return bridge.snapshot();
    },
    subscribe(listener: (snapshot: CanvasSnapshot) => void): () => void {
      return bridge.subscribe(listener);
    },
    select(id: string, selectionMode: SelectionMode): void {
      bridge.select(id, selectionMode);
    },
    clearSelection(): void {
      bridge.clearSelection();
    },
    toggleExpand(id: string): void {
      bridge.toggleExpand(id);
    },
    toggleVisibility(id: string): void {
      bridge.toggleVisibility(id);
    },
    toggleLock(id: string): void {
      bridge.toggleLock(id);
    },
    rename(id: string, name: string): void {
      bridge.rename(id, name);
    },
    setVisible(visible: boolean): void {
      bridge.setVisible(visible);
    },
    duplicateSelection(): void {
      bridge.duplicateSelection();
    },
    changeOrder(change): void {
      bridge.changeOrder(change);
    },
    alignSelection(axis, align): void {
      bridge.alignSelection(axis, align);
    },
    setColor(kind, hex, commit): void {
      bridge.setColor(kind, hex, commit);
    },
    preview(prop: PropertyKey, value: number): void {
      bridge.preview(prop, value);
    },
    commit(prop: PropertyKey, value: number, previous: number): void {
      bridge.commit(prop, value, previous);
    },
    setFamily(family: string): void {
      bridge.setFamily(family);
    },
    setWeight(weight: number): void {
      bridge.setWeight(weight);
    },
    quoteSelection(): LayerQuote | null {
      const nodes = editor.getSelectedNodes();
      const node = nodes[0];
      if (node === undefined) return null;
      const { names, parentName } = layerPath(editor.graph, node.id, editor.state.currentPageId);
      return {
        name: node.name,
        path: names.join(' / '),
        type: node.type,
        parentName,
        jsx: selectionToJSX([node.id], editor.graph) ?? '',
      };
    },
    destroy(): void {
      if (destroyed) return;
      destroyed = true;
      element.removeEventListener('keydown', onKeyDown);
      element.removeEventListener('pointerdown', focus);
      offHistory();
      offViewport();
      offGraph();
      bridge.dispose();
      app.unmount();
      editor.dispose();
    },
  };
}
