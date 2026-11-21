/**
 * The Excalidraw host component. It owns the scene bridge, the autosave
 * filter, selection quotes, and the browser-side image export. The stored
 * content remains our .excalidraw JSON; Excalidraw supplies the editor.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CaptureUpdateAction, Excalidraw, exportToBlob, exportToSvg, restore, serializeAsJSON } from '@excalidraw/excalidraw';
import type { AppState, BinaryFiles, ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types';
import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types';
import rawCss from '@excalidraw/excalidraw/index.css';
import { BOARD_ASSET_PATH, parseBoardScene } from '../../board.js';
import type { Translator } from '../harness.js';

/** Callbacks and labels the mounted editor reads at call time. */
export interface BoardLive {
  onChange(json: string): void;
  onSave(): void;
  onSelectionText(text: string): void;
  t: Translator;
}

/** What the panel gives one mounted editor. */
export interface BoardEditorOptions {
  element: HTMLElement;
  content: string;
  editable: boolean;
  label: string;
  dark: boolean;
  live: { current: BoardLive };
}

/** One exported image, before the tab names and downloads it. */
export interface BoardImage {
  blob: Blob;
  extension: 'png' | 'svg';
}

/** The handle the tab keeps while a whiteboard is mounted. */
export interface BoardEditorHandle {
  getJson(): string;
  setContent(json: string): void;
  setEditable(editable: boolean): void;
  setAppearance(dark: boolean): void;
  createImage(format: 'png' | 'svg'): Promise<BoardImage | null>;
  flush(): void;
  destroy(): void;
}

/** The scene after Excalidraw has restored it. */
interface RestoredScene {
  elements: ExcalidrawElement[];
  appState: Partial<AppState>;
  files: BinaryFiles;
  json: string;
}

declare global {
  interface Window {
    EXCALIDRAW_ASSET_PATH?: string | string[];
  }
}

if (typeof window !== 'undefined') window.EXCALIDRAW_ASSET_PATH = BOARD_ASSET_PATH;

let cssInjected = false;

/** Inject Excalidraw's stylesheet once, with font URLs pointed at our asset route. */
function ensureStyle(): void {
  if (cssInjected || typeof document === 'undefined') return;
  cssInjected = true;
  const style = document.createElement('style');
  style.dataset.artifactBoard = '';
  style.textContent = String(rawCss).replace(/url\((['"]?)\.\/fonts\//g, (_match: string, quote: string) => 'url(' + quote + BOARD_ASSET_PATH + 'fonts/')
    + '\n.art-board-canvas .sidebar-trigger__label-element { display: none; }\n';
  document.head.appendChild(style);
}

/**
 * The editor language, read from the document first.
 * @returns an Excalidraw language code.
 */
function boardLanguage(): 'en' | 'zh-CN' {
  if (typeof document === 'undefined') return 'en';
  const lang = (document.documentElement.lang || (typeof navigator === 'undefined' ? '' : navigator.language) || 'en').toLowerCase();
  return lang.startsWith('zh') ? 'zh-CN' : 'en';
}

/**
 * Build the scene JSON the artifact stores. Viewport state and selection are
 * intentionally left out.
 * @param elements the elements.
 * @param appState the editor state.
 * @param files the image files.
 * @returns the .excalidraw JSON.
 */
function sceneJson(elements: readonly ExcalidrawElement[], appState: Partial<AppState>, files: BinaryFiles): string {
  return serializeAsJSON(
    elements,
    {
      viewBackgroundColor: appState.viewBackgroundColor ?? '#ffffff',
      gridSize: appState.gridSize ?? undefined,
    },
    files,
    'local',
  );
}

/**
 * Parse stored content and let Excalidraw repair defaults.
 * @param content the stored JSON.
 * @returns the restored scene.
 */
function restoredScene(content: string): RestoredScene {
  const scene = parseBoardScene(content);
  const data = restore(
    {
      elements: scene.elements as unknown as readonly ExcalidrawElement[],
      appState: {
        viewBackgroundColor: scene.appState.viewBackgroundColor,
        gridSize: scene.appState.gridSize ?? undefined,
      },
      files: scene.files as unknown as BinaryFiles,
    },
    null,
    null,
  );
  const elements = (data.elements ?? []) as ExcalidrawElement[];
  const appState = (data.appState ?? {}) as Partial<AppState>;
  const files = (data.files ?? {}) as BinaryFiles;
  return { elements, appState, files, json: sceneJson(elements, appState, files) };
}

/** Read the text of a text element without assuming the whole union has it. */
function elementText(element: ExcalidrawElement): string {
  if (element.type !== 'text') return '';
  const record = element as unknown as { text?: unknown };
  return typeof record.text === 'string' ? record.text : '';
}

/** One selected element as a short line for an agent quote. */
function quoteLine(element: ExcalidrawElement, elements: readonly ExcalidrawElement[]): string {
  const text = elementText(element);
  if (text !== '') return element.type + ' ' + JSON.stringify(text.slice(0, 240));
  const bound = Array.isArray(element.boundElements)
    ? element.boundElements.find((entry) => entry.type === 'text')
    : undefined;
  if (bound !== undefined) {
    const label = elements.find((item) => item.id === bound.id);
    const labelText = label === undefined ? '' : elementText(label);
    if (labelText !== '') return element.type + ' "' + labelText.slice(0, 240) + '"';
  }
  return element.type + ' at (' + String(Math.round(element.x)) + ', ' + String(Math.round(element.y)) + '), ' + String(Math.round(element.width)) + ' x ' + String(Math.round(element.height));
}

/**
 * The whiteboard editor.
 * @param props the mount options and the handle registrar.
 * @returns the editor.
 */
export function BoardEditor({ options, register }: { options: BoardEditorOptions; register: (handle: BoardEditorHandle) => void }) {
  const live = options.live;
  const t = live.current.t;
  const initialRef = useRef<RestoredScene | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [theme, setTheme] = useState<'light' | 'dark'>(options.dark ? 'dark' : 'light');
  const [editable, setEditable] = useState(options.editable);
  const apiRef = useRef<ExcalidrawImperativeAPI | null>(null);
  const lastScene = useRef('');
  const lastEmitted = useRef('');
  const latestScene = useRef('');
  const lastQuote = useRef('');
  const emitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  if (initialRef.current === null && error === null) {
    try {
      initialRef.current = restoredScene(options.content);
      lastScene.current = initialRef.current.json;
      lastEmitted.current = initialRef.current.json;
      latestScene.current = initialRef.current.json;
    } catch {
      setError('invalid');
    }
  }
  const initial = initialRef.current;

  const flush = useCallback((): void => {
    if (emitTimer.current !== null) {
      clearTimeout(emitTimer.current);
      emitTimer.current = null;
    }
    if (latestScene.current !== lastEmitted.current) {
      lastEmitted.current = latestScene.current;
      live.current.onChange(latestScene.current);
    }
  }, [live]);

  useEffect(() => {
    ensureStyle();
    return () => {
      flush();
    };
  }, [flush]);

  const updateQuote = useCallback((elements: readonly ExcalidrawElement[], appState: AppState): void => {
    const selectedIds = appState.selectedElementIds ?? {};
    const selected = elements.filter((element) => element.isDeleted !== true && selectedIds[element.id] === true);
    let quote = '';
    if (selected.length > 0) {
      const lines = selected.slice(0, 20).map((element) => '- ' + quoteLine(element, elements));
      quote = ('Whiteboard selection (' + String(selected.length) + ' element' + (selected.length === 1 ? '' : 's') + '):\n' + lines.join('\n')).slice(0, 1500);
    }
    if (quote !== lastQuote.current) {
      lastQuote.current = quote;
      live.current.onSelectionText(quote);
    }
  }, [live]);

  const onChange = useCallback((elements: readonly ExcalidrawElement[], appState: AppState, files: BinaryFiles): void => {
    updateQuote(elements, appState);
    const json = sceneJson(elements, appState, files);
    if (json === lastScene.current) return;
    lastScene.current = json;
    latestScene.current = json;
    if (json === lastEmitted.current) return;
    if (emitTimer.current === null) {
      emitTimer.current = setTimeout(() => {
        emitTimer.current = null;
        flush();
      }, 250);
    }
  }, [flush, updateQuote]);

  const handleRegister = useCallback((): void => {
    register({
      getJson: () => lastScene.current || options.content,
      setContent: (json: string) => {
        if (json === lastScene.current) return;
        let next: RestoredScene;
        try {
          next = restoredScene(json);
        } catch {
          return;
        }
        const api = apiRef.current;
        if (api !== null) {
          if (Object.keys(next.files).length > 0) api.addFiles(Object.values(next.files));
          api.updateScene({
            elements: next.elements,
            appState: {
              viewBackgroundColor: next.appState.viewBackgroundColor ?? '#ffffff',
            },
            captureUpdate: CaptureUpdateAction.NEVER,
          });
        }
        lastScene.current = next.json;
        latestScene.current = next.json;
        lastEmitted.current = next.json;
      },
      setEditable: (value: boolean) => setEditable(value),
      setAppearance: (dark: boolean) => setTheme(dark ? 'dark' : 'light'),
      flush,
      createImage: async (format: 'png' | 'svg'): Promise<BoardImage | null> => {
        const api = apiRef.current;
        const elements = api === null ? (initial?.elements ?? []) : api.getSceneElements();
        const appState = api === null ? (initial?.appState ?? {}) : api.getAppState();
        const files = api === null ? (initial?.files ?? {}) : api.getFiles();
        const exportState: Partial<AppState> = {
          ...appState,
          exportBackground: true,
          viewBackgroundColor: appState.viewBackgroundColor ?? '#ffffff',
        };
        if (format === 'svg') {
          const svg = await exportToSvg({ elements, appState: exportState, files });
          return { blob: new Blob([svg.outerHTML], { type: 'image/svg+xml' }), extension: 'svg' };
        }
        const blob = await exportToBlob({ elements, appState: exportState, files, mimeType: 'image/png' });
        return { blob, extension: 'png' };
      },
      destroy: () => undefined,
    });
  }, [flush, initial, options.content, register]);

  useEffect(() => {
    handleRegister();
  }, [handleRegister]);

  const initialData = useMemo(() => {
    if (initial === null) return null;
    return {
      elements: initial.elements,
      appState: {
        viewBackgroundColor: initial.appState.viewBackgroundColor ?? '#ffffff',
        gridSize: initial.appState.gridSize ?? undefined,
      },
      files: initial.files,
    };
  }, [initial]);

  if (error !== null || initialData === null) {
    return <div className="art-board-error">{t('board.invalid')}</div>;
  }

  const language = boardLanguage();
  return (
    <div className="art-board-canvas">
      <Excalidraw
        initialData={initialData}
        onChange={onChange}
        excalidrawAPI={(api: ExcalidrawImperativeAPI) => { apiRef.current = api; }}
        theme={theme}
        langCode={language}
        viewModeEnabled={!editable}
        name={options.label}
        aiEnabled={false}
        validateEmbeddable={false}
        UIOptions={{
          canvasActions: {
            loadScene: false,
            saveToActiveFile: false,
            export: false,
            saveAsImage: false,
            toggleTheme: false,
            clearCanvas: true,
            changeViewBackgroundColor: true,
          },
        }}
      />
    </div>
  );
}
