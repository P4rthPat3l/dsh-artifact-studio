import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { Button } from '@deepseek-ai/dsh-client-ui-primitives';
import { tokenVariables } from '../contract.js';
import type { DesignTokens } from '../contract.js';
import type { Translator } from './harness.js';
import type { DocChunk, DocEditorHandle, DocFormat } from './doc/entry.js';

let chunk: Promise<DocChunk> | null = null;

/**
 * Load the document editor chunk once. It carries Tiptap, so it stays out of
 * the main bundle until a document opens.
 * @returns the chunk.
 */
export function loadDocChunk(): Promise<DocChunk> {
  if (chunk === null) {
    const load = globalThis.__dshArtifactsRequireAsync;
    if (typeof load !== 'function') return Promise.reject(new Error('The document editor loader is unavailable.'));
    chunk = load<DocChunk>('./client.doc.js');
    chunk.catch(() => {
      chunk = null;
    });
  }
  return chunk;
}

const FORMATS = ['heading', 'bold', 'italic', 'bulletList', 'orderedList', 'codeBlock'] as const satisfies readonly DocFormat[];

/** Props for the document editor. */
export interface DocViewProps {
  markdown: string;
  revision: string;
  editable: boolean;
  label: string;
  loadingLabel: string;
  failedLabel: string;
  onChange: (markdown: string) => void;
  onSave: () => void;
  onSelectionText?: (text: string) => void;
  t?: Translator;
  /** The artifact's resolved tokens; the page surface uses them so the editor matches the export. */
  design?: DesignTokens;
  /** Whether to use the dark token colors. */
  dark?: boolean;
  /** An extra control shown in the selection toolbar, such as an edit request. */
  selectionAction?: ReactNode;
}

/** Where the selection toolbar sits inside the scrolling surface. */
interface Anchor {
  top: number;
  left: number;
}

/**
 * Place the toolbar above the current selection, inside the scroll container.
 * @param container the scrolling surface.
 * @returns the position, or a top-left fallback where layout is unavailable.
 */
function anchorFor(container: HTMLElement): Anchor {
  const selection = window.getSelection();
  const box = container.getBoundingClientRect();
  const range = selection !== null && selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
  const rect = range?.getBoundingClientRect();
  if (rect === undefined || (rect.width === 0 && rect.height === 0)) return { top: container.scrollTop + 8, left: 16 };
  const left = Math.min(Math.max(rect.left - box.left + rect.width / 2, 120), Math.max(box.width - 120, 120));
  return { top: Math.max(rect.top - box.top + container.scrollTop - 46, container.scrollTop + 4), left };
}

/**
 * A Markdown document in a rich-text editor on a page surface. A new
 * revision replaces the editor content; typing never does.
 * @param props the content and callbacks.
 * @returns the editor.
 */
export function DocView({ markdown, revision, editable, label, loadingLabel, failedLabel, onChange, onSave, onSelectionText, t, design, dark = false, selectionAction }: DocViewProps) {
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const mountRef = useRef<HTMLDivElement | null>(null);
  const handleRef = useRef<DocEditorHandle | null>(null);
  const changeRef = useRef(onChange);
  changeRef.current = onChange;
  const selectionRef = useRef(onSelectionText);
  selectionRef.current = onSelectionText;
  const latest = useRef({ markdown, editable, label });
  latest.current = { markdown, editable, label };
  const [active, setActive] = useState<readonly DocFormat[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading');
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const toolbarRef = useRef<HTMLDivElement | null>(null);

  // Keep the toolbar inside the surface: it is centred on the selection, so a
  // selection near an edge or a narrow pane would push it out of view.
  useLayoutEffect(() => {
    const toolbar = toolbarRef.current;
    const container = surfaceRef.current;
    if (toolbar === null || container === null || anchor === null) return;
    const half = toolbar.offsetWidth / 2;
    const width = container.clientWidth;
    const left = half * 2 + 16 >= width ? width / 2 : Math.min(Math.max(anchor.left, half + 8), width - half - 8);
    toolbar.style.left = left + 'px';
  });

  const style = useMemo<CSSProperties>(() => {
    if (design === undefined) return {};
    const vars: Record<string, string> = tokenVariables(design, dark);
    return { ...vars, colorScheme: dark ? 'dark' : 'light' };
  }, [design, dark]);

  const track = (text: string) => {
    selectionRef.current?.(text);
    const container = surfaceRef.current;
    setAnchor(text === '' || container === null ? null : anchorFor(container));
  };
  const trackRef = useRef(track);
  trackRef.current = track;

  useEffect(() => {
    let cancelled = false;
    loadDocChunk()
      .then((loaded) => {
        if (cancelled || mountRef.current === null) return;
        handleRef.current = loaded.mountDocEditor({
          element: mountRef.current,
          ...latest.current,
          onChange: (value) => changeRef.current(value),
          onSelectionChange: setActive,
          onSelectionText: (text) => trackRef.current(text),
        });
        setState('ready');
      })
      .catch(() => {
        if (!cancelled) setState('failed');
      });
    return () => {
      cancelled = true;
      handleRef.current?.destroy();
      handleRef.current = null;
    };
    // The editor mounts once; content and editability changes go through the handle below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const handle = handleRef.current;
    if (handle === null) return;
    // Own edits already match; another mounted view may have changed the shared draft.
    if (handle.getMarkdown() === markdown) return;
    handle.setMarkdown(markdown);
  }, [revision, markdown]);

  useEffect(() => {
    handleRef.current?.setEditable(editable);
  }, [editable]);

  useEffect(() => {
    // ProseMirror reports a selection transaction on focus; this listener also
    // covers a selection made while the editor already has focus elsewhere.
    const onSelection = () => {
      const handle = handleRef.current;
      const container = surfaceRef.current;
      const current = window.getSelection();
      if (handle === null || container === null) return;
      if (current !== null && current.anchorNode !== null && !container.contains(current.anchorNode)) return;
      trackRef.current(handle.getSelectionText());
    };
    document.addEventListener('selectionchange', onSelection);
    return () => document.removeEventListener('selectionchange', onSelection);
  }, []);

  const showToolbar = anchor !== null && t !== undefined && (editable || selectionAction != null);

  return (
    <div
      className="art-doc"
      ref={surfaceRef}
      data-doc-revision={revision}
      onKeyDown={(event) => {
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
          event.preventDefault();
          onSave();
        }
        if (event.key === 'Escape' && anchor !== null) setAnchor(null);
      }}
    >
      {!showToolbar ? null : (
        <div ref={toolbarRef} className="art-doc-toolbar" role="toolbar" aria-label={t('format.toolbar')} style={{ top: anchor.top, left: anchor.left }}>
          {!editable ? null : FORMATS.map(command => (
            <Button
              key={command}
              size="sm"
              variant="ghost"
              aria-pressed={active.includes(command)}
              disabled={state !== 'ready'}
              onMouseDown={event => event.preventDefault()}
              onClick={() => handleRef.current?.format(command)}
            >
              {t(`format.${command}`)}
            </Button>
          ))}
          {editable && selectionAction != null ? <span className="art-doc-toolbar-gap" aria-hidden="true" /> : null}
          {selectionAction}
        </div>
      )}
      {state === 'loading' ? <p className="art-note">{loadingLabel}</p> : null}
      {state === 'failed' ? <p className="art-note">{failedLabel}</p> : null}
      <div className="art-docpage" style={style}>
        <div className="art-doc-mount" ref={mountRef} />
      </div>
    </div>
  );
}
