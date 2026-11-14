import { createApp, defineComponent, h, reactive } from 'vue';
import type { App } from 'vue';
import { createDefaultEditorState, createEditor } from '@open-pencil/core/editor';
import type { Editor, Tool } from '@open-pencil/core/editor';
import type { IconData, IconProvider } from '@open-pencil/core/icons';
import { getCanvasKit } from '@open-pencil/core/canvaskit';
import { designJSXRenderer } from '@open-pencil/core/design-jsx';
import { fontManager } from '@open-pencil/core/text';
import { SceneGraph } from '@open-pencil/scene-graph';
import type { SceneNode } from '@open-pencil/scene-graph';
import { selectionToJSX } from '@open-pencil/design-jsx';
import { CanvasRoot, provideEditor } from '@open-pencil/vue';
import { CanvasSurface } from './surface.js';

declare const __CANVAS_ASSET_VERSION__: string;

/** Where the host serves CanvasKit and the bundled fonts. */
const ASSET_BASE = '/artifacts-canvas/';

/** Tools the panel toolbar offers. */
export type CanvasTool = 'select' | 'hand' | 'frame' | 'text';

/** The editor tool each panel tool selects. */
const TOOLS: Record<CanvasTool, Tool> = {
  select: 'SELECT',
  hand: 'HAND',
  frame: 'FRAME',
  text: 'TEXT',
};

/** The panel tool for an editor tool, when the toolbar shows it. */
const CANVAS_TOOLS: Partial<Record<Tool, CanvasTool>> = {
  SELECT: 'select',
  HAND: 'hand',
  FRAME: 'frame',
  TEXT: 'text',
};

/** Design JSX may not reach an icon provider; the canvas runs offline. */
const NO_ICONS: IconProvider = {
  search: async () => ({ icons: [], total: 0, collections: {} }),
  icons: async () => new Map<string, IconData>(),
  previews: async () => new Map<string, string>(),
  collections: async () => [],
  browse: async () => [],
};

/** What the tab gives the canvas. */
export interface DesignCanvasOptions {
  element: HTMLElement;
  source: string;
  onChange(source: string): void;
  onSave(): void;
  onTool?(tool: CanvasTool): void;
  onFailure?(message: string): void;
}

/** What the tab can ask the canvas to do. */
export interface DesignCanvasHandle {
  setSource(source: string): void;
  setTool(tool: CanvasTool): void;
  undo(): void;
  redo(): void;
  zoomToFit(): void;
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
 * Compile a source into a graph whose first page holds the top-level elements.
 * @param source the Design JSX source.
 * @returns the graph and page.
 */
async function compile(source: string): Promise<Compiled> {
  const graph = new SceneGraph();
  await designJSXRenderer(NO_ICONS).renderJSX(graph, source);
  const page = graph.getPages()[0];
  if (page === undefined) throw new Error('The design has no page.');
  return { graph, page };
}

/**
 * Mount an editable design canvas over the given element. The caller owns the
 * element and the save flow; the canvas reports serialized edits and never writes.
 * @param options the element, source, and callbacks.
 * @returns the handle, once CanvasKit and the source are ready.
 */
export async function mountDesignCanvas(options: DesignCanvasOptions): Promise<DesignCanvasHandle> {
  const element = options.element;
  let compiled = await compile(options.source);
  await getCanvasKit({ locateFile: (file) => assetUrl(file) });
  fontManager.setBundledFontLocator((file) => assetUrl('fonts/' + file));

  const editor: Editor = createEditor({
    graph: compiled.graph,
    state: reactive(createDefaultEditorState(compiled.page.id)),
    getViewportSize: () => ({
      width: Math.max(1, element.clientWidth),
      height: Math.max(1, element.clientHeight),
    }),
  });
  editor.zoomToFit();

  const Root = defineComponent({
    setup() {
      provideEditor(editor);
      return () => h(CanvasRoot, null, { default: () => h(CanvasSurface) });
    },
  });
  const app: App<Element> = createApp(Root);
  app.mount(element);

  let lastEmitted = options.source;
  let destroyed = false;

  // A history entry is one settled edit, so the serialization is current before
  // the tab can save. Text typing may add entries quickly; the source is small.
  const offHistory = editor.onEditorEvent('history:changed', () => {
    if (destroyed) return;
    const next = selectionToJSX(compiled.page.childIds, compiled.graph);
    if (next === lastEmitted) return;
    lastEmitted = next;
    options.onChange(next);
  });
  const offTool = editor.onEditorEvent('tool:changed', (tool) => {
    const canvasTool = CANVAS_TOOLS[tool];
    if (canvasTool !== undefined) options.onTool?.(canvasTool);
  });

  const onKeyDown = (event: KeyboardEvent): void => {
    if (editor.isInteractiveEditing()) return;
    const meta = event.ctrlKey || event.metaKey;
    const key = event.key.toLowerCase();
    if (meta && key === 's') {
      event.preventDefault();
      options.onSave();
      return;
    }
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
        } catch (error) {
          if (!destroyed) options.onFailure?.(messageOf(error));
        }
      })();
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
      editor.zoomToFit();
    },
    destroy(): void {
      if (destroyed) return;
      destroyed = true;
      element.removeEventListener('keydown', onKeyDown);
      element.removeEventListener('pointerdown', focus);
      offHistory();
      offTool();
      app.unmount();
      editor.dispose();
    },
  };
}
