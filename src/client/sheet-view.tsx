import { TextShimmer } from '@deepseek-ai/dsh-client-ui-primitives';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { tokenVariables } from '../contract.js';
import type { DesignTokens } from '../contract.js';
import type { Translator } from './harness.js';
import type { SheetChunk, SheetEditorHandle, SheetLive } from './sheet/entry.js';

let chunk: Promise<SheetChunk> | null = null;

/**
 * Load the sheet editor chunk once. It carries the grid and the formula
 * engine, so it stays out of the main bundle until a sheet opens.
 * @returns the chunk.
 */
function loadSheetChunk(): Promise<SheetChunk> {
  if (chunk === null) {
    const load = globalThis.__dshArtifactsRequireAsync;
    if (typeof load !== 'function') return Promise.reject(new Error('The sheet editor loader is unavailable.'));
    chunk = load<SheetChunk>('./client.sheet.js');
    chunk.catch(() => {
      chunk = null;
    });
  }
  return chunk;
}

/** Props for one sheet editor. */
export interface SheetViewProps {
  content: string;
  revision: string;
  editable: boolean;
  label: string;
  loadingLabel: string;
  failedLabel: string;
  onChange: (json: string) => void;
  onSave: () => void;
  onSelectionText?: (text: string) => void;
  onNotify?: (text: string) => void;
  t: Translator;
  design?: DesignTokens;
  dark?: boolean;
}

/**
 * A sheet in the panel. The chunk owns the editor; this wrapper loads it,
 * forwards content revisions, and keeps the callbacks current.
 * @param props the content, appearance, and callbacks.
 * @returns the editor surface.
 */
export function SheetView(props: SheetViewProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const handleRef = useRef<SheetEditorHandle | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading');
  const liveRef = useRef<SheetLive>({
    onChange: props.onChange,
    onSave: props.onSave,
    onSelectionText: props.onSelectionText ?? (() => undefined),
    notify: props.onNotify ?? (() => undefined),
    t: props.t,
  });
  liveRef.current.onChange = props.onChange;
  liveRef.current.onSave = props.onSave;
  liveRef.current.onSelectionText = props.onSelectionText ?? (() => undefined);
  liveRef.current.notify = props.onNotify ?? (() => undefined);
  liveRef.current.t = props.t;

  const style = useMemo<CSSProperties>(() => {
    if (props.design === undefined) return {};
    return { ...tokenVariables(props.design, props.dark === true), colorScheme: props.dark === true ? 'dark' : 'light' };
  }, [props.design, props.dark]);

  useEffect(() => {
    let cancelled = false;
    loadSheetChunk()
      .then((loaded) => {
        if (cancelled || mountRef.current === null) return;
        handleRef.current = loaded.mountSheetEditor({
          element: mountRef.current,
          content: props.content,
          editable: props.editable,
          label: props.label,
          ...(props.design === undefined ? {} : { design: props.design }),
          dark: props.dark === true,
          live: liveRef,
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
    // The editor mounts once; content, editability, and appearance go through the handle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (state !== 'ready') return;
    const handle = handleRef.current;
    if (handle === null) return;
    // Our own save already matches; another mounted view may have changed the shared draft.
    if (handle.getJson() === props.content) return;
    handle.setContent(props.content);
  }, [props.revision, props.content, state]);

  useEffect(() => {
    handleRef.current?.setEditable(props.editable);
  }, [props.editable]);

  useEffect(() => {
    handleRef.current?.setAppearance(props.design, props.dark === true);
  }, [props.design, props.dark]);

  return (
    <div className="art-sheet" style={style}>
      {state === 'loading' ? <div className="art-state" role="status"><TextShimmer active>{props.loadingLabel}</TextShimmer></div> : null}
      {state === 'failed' ? <div className="art-state" role="alert">{props.failedLabel}</div> : null}
      <div className="art-sheet-mount" ref={mountRef} />
    </div>
  );
}
