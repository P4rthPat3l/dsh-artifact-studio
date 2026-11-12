import { useEffect, useRef, useState } from 'react';
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
  t?: Translator;
}

/**
 * A Markdown document in a rich-text editor. A new `revision` replaces the
 * editor content; typing never does.
 * @param props the content and callbacks.
 * @returns the editor.
 */
export function DocView({ markdown, revision, editable, label, loadingLabel, failedLabel, onChange, onSave, t }: DocViewProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const handleRef = useRef<DocEditorHandle | null>(null);
  const changeRef = useRef(onChange);
  changeRef.current = onChange;
  const latest = useRef({ markdown, editable, label });
  latest.current = { markdown, editable, label };
  const [active, setActive] = useState<readonly DocFormat[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading');

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

  return (
    <div
      className="art-doc"
      data-doc-revision={revision}
      onKeyDown={(event) => {
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
          event.preventDefault();
          onSave();
        }
      }}
    >
      {!editable || t === undefined ? null : <div className="art-doc-toolbar" role="toolbar" aria-label={t('format.toolbar')}>
        {(['heading', 'bold', 'italic', 'bulletList', 'orderedList', 'codeBlock'] satisfies DocFormat[]).map(command => (
          <button key={command} type="button" className="art-button" aria-pressed={active.includes(command)} disabled={state !== 'ready'} onMouseDown={event => event.preventDefault()} onClick={() => handleRef.current?.format(command)}>{t(`format.${command}`)}</button>
        ))}
      </div>}
      {state === 'loading' ? <p className="art-note">{loadingLabel}</p> : null}
      {state === 'failed' ? <p className="art-note">{failedLabel}</p> : null}
      <div className="art-doc-mount" ref={mountRef} />
    </div>
  );
}
