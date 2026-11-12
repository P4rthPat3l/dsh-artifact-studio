import { useEffect, useRef, useState } from 'react';
import { PREVIEW_SANDBOX, pageDocument } from './frames.js';

/** Props for one sandboxed page preview. */
export interface PageFrameProps {
  content: string;
  designCss: string;
  title: string;
  frameTitle: string;
}

/**
 * A page artifact in an opaque-origin frame. The Blob URL is replaced, not
 * mutated, on every content change, and the old one is revoked.
 * @param props the content and labels.
 * @returns the frame.
 */
export function PageFrame({ content, designCss, title, frameTitle }: PageFrameProps) {
  const [url, setUrl] = useState<string | null>(null);
  const [navigated, setNavigated] = useState(false);
  const loads = useRef(0);
  useEffect(() => {
    loads.current = 0;
    setNavigated(false);
    const next = URL.createObjectURL(new Blob([pageDocument(content, designCss, title)], { type: 'text/html' }));
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [content, designCss, title]);
  if (navigated) {
    return <div className="art-center" role="alert">{title}</div>;
  }
  if (url === null) return null;
  return (
    <iframe
      key={url}
      className="art-frame"
      title={frameTitle}
      sandbox={PREVIEW_SANDBOX}
      referrerPolicy="no-referrer"
      src={url}
      onLoad={() => {
        loads.current += 1;
        // The policy blocks requests, but nothing in it can stop a page from
        // navigating itself, so a second load means the frame left the document.
        if (loads.current > 1) setNavigated(true);
      }}
    />
  );
}

/** Props for the page source editor. */
export interface SourceEditorProps {
  value: string;
  readOnly: boolean;
  label: string;
  onChange: (value: string) => void;
  onSave: () => void;
}

/**
 * Plain HTML source editing: a textarea that keeps Tab as indentation and
 * saves on Ctrl or Cmd+S.
 * @param props the value and callbacks.
 * @returns the editor.
 */
export function SourceEditor({ value, readOnly, label, onChange, onSave }: SourceEditorProps) {
  return (
    <textarea
      className="art-source"
      aria-label={label}
      spellCheck={false}
      readOnly={readOnly}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      onKeyDown={(event) => {
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
          event.preventDefault();
          onSave();
          return;
        }
        if (event.key === 'Tab' && !event.shiftKey && !readOnly) {
          event.preventDefault();
          const target = event.currentTarget;
          const start = target.selectionStart;
          const end = target.selectionEnd;
          const next = `${value.slice(0, start)}  ${value.slice(end)}`;
          onChange(next);
          requestAnimationFrame(() => target.setSelectionRange(start + 2, start + 2));
        }
      }}
    />
  );
}
