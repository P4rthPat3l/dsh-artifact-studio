import { useEffect, useRef, useState } from 'react';
import { PREVIEW_SANDBOX, linkFrom, pageDocument, selectionFrom } from './frames.js';
import { openPageLink } from './runtime.js';

/** Props for one sandboxed page preview. */
export interface PageFrameProps {
  content: string;
  designCss: string;
  title: string;
  frameTitle: string;
  /** Whether the Harness shows its dark theme; only pages that opted in follow it. */
  dark?: boolean;
  /** Receives the text the reader selects inside the page. */
  onSelectionText?: (text: string) => void;
}

/**
 * A page artifact in an opaque-origin frame. The Blob URL is replaced, not
 * mutated, on every content change, and the old one is revoked.
 * @param props the content and labels.
 * @returns the frame.
 */
export function PageFrame({ content, designCss, title, frameTitle, dark = false, onSelectionText }: PageFrameProps) {
  const [url, setUrl] = useState<string | null>(null);
  const [navigated, setNavigated] = useState(false);
  const loads = useRef(0);
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const report = useRef(onSelectionText);
  report.current = onSelectionText;
  const bridge = onSelectionText !== undefined;

  useEffect(() => {
    loads.current = 0;
    setNavigated(false);
    const next = URL.createObjectURL(new Blob([pageDocument(content, designCss, title, dark ? 'dark' : 'light', bridge)], { type: 'text/html' }));
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [content, designCss, title, dark, bridge]);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      // After a self-navigation the frame holds a document without the injected policy, so it is no longer trusted to report.
      if (frameRef.current === null || loads.current > 1 || event.source !== frameRef.current.contentWindow) return;
      const url = linkFrom(event.data);
      if (url !== undefined) {
        openPageLink(url);
        return;
      }
      const text = selectionFrom(event.data);
      if (text !== undefined) report.current?.(text);
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  if (navigated) {
    return <div className="art-center" role="alert">{title}</div>;
  }
  if (url === null) return null;
  return (
    <iframe
      key={url}
      ref={frameRef}
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
  /** A one-line reminder of how the source saves. */
  hint?: string;
  onChange: (value: string) => void;
  onSave: () => void;
  onSelectionText?: (text: string) => void;
}

/**
 * Plain HTML source editing: a textarea that keeps Tab as indentation and
 * saves on Ctrl or Cmd+S.
 * @param props the value and callbacks.
 * @returns the editor.
 */
export function SourceEditor({ value, readOnly, label, hint, onChange, onSave, onSelectionText }: SourceEditorProps) {
  const report = (target: HTMLTextAreaElement) => {
    if (readOnly) return;
    onSelectionText?.(target.value.slice(target.selectionStart, target.selectionEnd));
  };
  return (
    <div className="art-source-wrap">
      {hint === undefined ? null : <div className="art-code-bar"><span>{hint}</span></div>}
      <textarea
        className="art-source"
        aria-label={label}
        spellCheck={false}
        readOnly={readOnly}
        value={value}
        autoFocus={!readOnly}
        onChange={(event) => {
          onChange(event.target.value);
          onSelectionText?.('');
        }}
        onSelect={(event) => report(event.currentTarget)}
        onMouseUp={(event) => report(event.currentTarget)}
        onKeyUp={(event) => report(event.currentTarget)}
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
            const next = value.slice(0, start) + '  ' + value.slice(end);
            onChange(next);
            requestAnimationFrame(() => target.setSelectionRange(start + 2, start + 2));
          }
        }}
      />
    </div>
  );
}
