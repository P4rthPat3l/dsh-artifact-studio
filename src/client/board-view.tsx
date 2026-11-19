import { useEffect, useRef, useState } from 'react';
import type { BoardChunk, BoardEditorHandle, BoardLive } from './board/entry.js';
import type { Translator } from './harness.js';

let chunk: Promise<BoardChunk> | null = null;

/**
 * Load the whiteboard chunk once. It carries Excalidraw, so it stays out of
 * the main bundle until a whiteboard opens.
 * @returns the chunk.
 */
export function loadBoardChunk(): Promise<BoardChunk> {
  if (chunk === null) {
    const load = globalThis.__dshArtifactsRequireAsync;
    if (typeof load !== 'function') return Promise.reject(new Error('The whiteboard loader is unavailable.'));
    chunk = load<BoardChunk>('./client.board.js');
    chunk.catch(() => {
      chunk = null;
    });
  }
  return chunk;
}

/** Props for one whiteboard. */
export interface BoardViewProps {
  content: string;
  revision: string;
  editable: boolean;
  label: string;
  loadingLabel: string;
  failedLabel: string;
  onChange: (json: string) => void;
  onSave: () => void;
  onSelectionText?: (text: string) => void;
  t: Translator;
  dark?: boolean;
  onHandle?: (handle: BoardEditorHandle | null) => void;
}

/**
 * A whiteboard in the panel. The Excalidraw chunk owns the editor; this
 * wrapper loads it, forwards content revisions, and keeps the callbacks
 * current.
 * @param props the content, appearance, and callbacks.
 * @returns the editor surface.
 */
export function BoardView(props: BoardViewProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const handleRef = useRef<BoardEditorHandle | null>(null);
  const onHandleRef = useRef(props.onHandle);
  onHandleRef.current = props.onHandle;
  const liveRef = useRef<BoardLive>({
    onChange: props.onChange,
    onSave: props.onSave,
    onSelectionText: props.onSelectionText ?? (() => undefined),
    t: props.t,
  });
  liveRef.current.onChange = props.onChange;
  liveRef.current.onSave = props.onSave;
  liveRef.current.onSelectionText = props.onSelectionText ?? (() => undefined);
  liveRef.current.t = props.t;
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading');

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        props.onSave();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [props.onSave]);

  useEffect(() => {
    let cancelled = false;
    mountRef.current?.focus();
    loadBoardChunk()
      .then((loaded) => {
        if (cancelled || mountRef.current === null) return;
        const handle = loaded.mountBoardEditor({
          element: mountRef.current,
          content: props.content,
          editable: props.editable,
          label: props.label,
          dark: props.dark === true,
          live: liveRef,
        });
        handleRef.current = handle;
        onHandleRef.current?.(handle);
        setState('ready');
      })
      .catch(() => {
        if (!cancelled) setState('failed');
      });
    return () => {
      cancelled = true;
      onHandleRef.current?.(null);
      handleRef.current?.destroy();
      handleRef.current = null;
    };
    // The editor mounts once; content, editability, and appearance go through the handle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (state !== 'ready') return;
    // The editor compares scenes itself, so an own save does not move the viewport.
    handleRef.current?.setContent(props.content);
  }, [props.revision, props.content, state]);

  useEffect(() => {
    handleRef.current?.setEditable(props.editable);
  }, [props.editable]);

  useEffect(() => {
    handleRef.current?.setAppearance(props.dark === true);
  }, [props.dark]);

  return (
    <div
      className="art-board"
      onKeyDown={(event) => {
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
          event.preventDefault();
          props.onSave();
        }
      }}
    >
      {state === 'loading' ? <p className="art-note">{props.loadingLabel}</p> : null}
      {state === 'failed' ? <p className="art-note">{props.failedLabel}</p> : null}
      <div className="art-board-mount" ref={mountRef} tabIndex={-1} />
    </div>
  );
}
