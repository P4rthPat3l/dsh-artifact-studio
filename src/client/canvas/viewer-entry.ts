import { createApp, defineComponent, h, reactive } from 'vue';
import type { App } from 'vue';
import { createDefaultEditorState, createEditor } from '@open-pencil/core/editor';
import type { Editor } from '@open-pencil/core/editor';
import { getCanvasKit } from '@open-pencil/core/canvaskit';
import { fontManager } from '@open-pencil/core/text';
import { parseFigFile } from '@open-pencil/core/io/formats/fig';
import { CanvasRoot, provideEditor } from '@open-pencil/vue';
import { CanvasSurface } from './surface.js';

/** One bundled face the exported page carries. */
export interface ViewerFont {
  family: string;
  style: string;
  /** The file name the engine asks the bundled locator for. */
  file: string;
  bytes: ArrayBuffer;
}

/** What the exported page hands the viewer. */
export interface ViewerInput {
  /** The element the canvas mounts into. */
  element: HTMLElement;
  /** The saved version's scene, as a .fig file. */
  scene: ArrayBuffer;
  /** CanvasKit's WebAssembly binary. */
  canvaskit: ArrayBuffer;
  /** Every face the document may use. */
  fonts: readonly ViewerFont[];
  /** The artifact title, shown as the page title. */
  title: string;
}

/** The page and canvas rules, since the exported file has no stylesheet. */
const STYLE =
  'html,body{margin:0;height:100%;overflow:hidden;background:#ffffff}' +
  '.op-root{display:flex;width:100%;height:100%}' +
  '.op-canvas{position:relative;flex:1;min-width:0;height:100%}' +
  '.op-surface{width:100%;height:100%}';

/**
 * Mount the saved scene as a view-only canvas that fills the page. The page owns
 * decoding the payload; this runs with no network and no editor chrome.
 * @param input the element, the scene, CanvasKit, the faces, and the title.
 * @returns nothing, once the first frame is fitted.
 */
export async function mountMockupViewer(input: ViewerInput): Promise<void> {
  const style = document.createElement('style');
  style.textContent = STYLE;
  document.head.append(style);
  document.title = input.title;
  const element = input.element;
  const wasm = URL.createObjectURL(new Blob([input.canvaskit], { type: 'application/wasm' }));
  await getCanvasKit({ locateFile: () => wasm });
  const files = new Map<string, string>();
  for (const font of input.fonts) {
    fontManager.markLoaded(font.family, font.style, font.bytes);
    files.set(font.file, URL.createObjectURL(new Blob([font.bytes], { type: 'font/ttf' })));
  }
  // The canvas draws frame titles from its own bundled face, which it fetches by
  // file name. Serve that from the same bytes so the page never reaches the disk.
  const empty = URL.createObjectURL(new Blob([], { type: 'font/ttf' }));
  fontManager.setBundledFontLocator((file) => files.get(file.replace(/^\//, '')) ?? empty);
  const graph = await parseFigFile(input.scene, { populate: 'all' });
  const page = graph.getPages()[0];
  if (page === undefined) throw new Error('The saved mockup has no page.');
  const editor: Editor = createEditor({
    graph,
    state: reactive(createDefaultEditorState(page.id)),
    getViewportSize: () => ({
      width: Math.max(1, element.clientWidth),
      height: Math.max(1, element.clientHeight),
    }),
  });
  const Root = defineComponent({
    setup() {
      provideEditor(editor);
      return () =>
        h('div', { class: 'op-root' }, [
          h('div', { class: 'op-canvas' }, [
            h(CanvasRoot, null, { default: () => h(CanvasSurface, { mode: 'view' }) }),
          ]),
        ]);
    },
  });
  const app: App<Element> = createApp(Root);
  app.mount(element);
  // The first fit is only real once the renderer has measured the viewport.
  let attempts = 0;
  const fitWhenReady = (): void => {
    if (editor.renderer === null && attempts < 300) {
      attempts += 1;
      requestAnimationFrame(fitWhenReady);
      return;
    }
    editor.zoomToFit();
  };
  requestAnimationFrame(fitWhenReady);
}
