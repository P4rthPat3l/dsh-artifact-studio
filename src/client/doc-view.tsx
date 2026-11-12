import { useEffect, useRef, useState } from 'react';
import type { DocChunk, DocEditorHandle } from './doc/entry.js';

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
}

/**
 * A Markdown document in a rich-text editor. A new `revision` replaces the
 * editor content; typing never does.
 * @param props the content and callbacks.
 * @returns the editor.
 */
export function DocView({ markdown, revision, editable, label, loadingLabel, failedLabel, onChange, onSave }: DocViewProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const handleRef = useRef<DocEditorHandle | null>(null);
  const changeRef = useRef(onChange);
  changeRef.current = onChange;
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading');

  useEffect(() => {
    let cancelled = false;
    loadDocChunk()
      .then((loaded) => {
        if (cancelled || mountRef.current === null) return;
        handleRef.current = loaded.mountDocEditor({
          element: mountRef.current,
          markdown,
          editable,
          label,
          onChange: (value) => changeRef.current(value),
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
    // Saving changes the revision, but the text is already what the editor
    // holds; replacing it would move the caret to the end and add an undo step.
    if (handle.getMarkdown() === markdown) return;
    handle.setMarkdown(markdown);
    // Otherwise this is a new revision from a reload or another version.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revision]);

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
      {state === 'loading' ? <p className="art-note">{loadingLabel}</p> : null}
      {state === 'failed' ? <p className="art-note">{failedLabel}</p> : null}
      <div className="art-doc-mount" ref={mountRef} />
    </div>
  );
}
