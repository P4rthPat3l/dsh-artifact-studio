import type { PageTheme } from '../contract.js';
import { PAGE_CSP, PRINT_HOOK, composePage } from '../render.js';

/** The only sandbox flag a preview gets: scripts run, but in an opaque origin with no network. */
export const PREVIEW_SANDBOX = 'allow-scripts';

/** Sandbox for the transient print copy. `print()` requires the modals flag. */
export const PRINT_SANDBOX = 'allow-scripts allow-modals';

/** How long a print frame may live before it is removed regardless of events. */
const PRINT_LIFETIME_MS = 30_000;

/**
 * Reports the text a reader selects in a preview, so it can become the quote
 * of an edit request. The frame is opaque, so it posts the text; the page can
 * only ever fill a quote the user still reviews before sending.
 */
export const SELECTION_BRIDGE =
  "<script>(function(){var t;document.addEventListener('selectionchange',function(){clearTimeout(t);" +
  "t=setTimeout(function(){var s=String(getSelection()||'');parent.postMessage({dshArtifactSelection:s.slice(0,4000)},'*')},150)})})()</script>";

/** The longest selection a frame may report; the request cap is lower still. */
const SELECTION_LIMIT = 4000;

/**
 * Build the preview document for a page artifact.
 * @param content the page HTML.
 * @param designCss the token rule.
 * @param title the artifact title.
 * @param theme the colors a dark-capable page uses.
 * @param bridge whether to report selections to the panel.
 * @returns HTML with the network-blocking policy and the tokens ahead of the content.
 */
export function pageDocument(content: string, designCss: string, title: string, theme: PageTheme = 'auto', bridge = false): string {
  return composePage(content, designCss, PAGE_CSP, title, bridge ? SELECTION_BRIDGE : '', theme);
}

/**
 * Read a selection report from a preview frame.
 * @param value the message data.
 * @returns the selected text, or undefined for any other message.
 */
export function selectionFrom(value: unknown): string | undefined {
  if (value === null || typeof value !== 'object') return undefined;
  const fields: Record<string, unknown> = { ...value };
  return typeof fields.dshArtifactSelection === 'string' ? fields.dshArtifactSelection.slice(0, SELECTION_LIMIT) : undefined;
}

/**
 * Print through the browser dialog, where the user can also save a PDF.
 *
 * The copy renders off screen in a sandboxed, opaque-origin frame. `print()`
 * needs the modals flag, so this frame is the one place that flag appears; it
 * exists only until the dialog closes and is then removed.
 * @param html a full document; the print hook is added to it.
 */
export function printDocument(html: string): void {
  const withHook = /<\/head>/i.test(html) ? html.replace(/<\/head>/i, `${PRINT_HOOK}</head>`) : `${PRINT_HOOK}${html}`;
  const url = URL.createObjectURL(new Blob([withHook], { type: 'text/html' }));
  const frame = document.createElement('iframe');
  frame.setAttribute('sandbox', PRINT_SANDBOX);
  frame.setAttribute('aria-hidden', 'true');
  frame.tabIndex = -1;
  // Chrome prints a blank page from a display:none frame, so the frame stays laid out off screen.
  frame.style.cssText = 'position:fixed;left:-10000px;top:0;width:800px;height:1000px;border:0;';
  let done = false;
  const cleanup = () => {
    if (done) return;
    done = true;
    clearTimeout(timer);
    window.removeEventListener('message', onMessage);
    frame.remove();
    URL.revokeObjectURL(url);
  };
  const onMessage = (event: MessageEvent) => {
    if (event.source === frame.contentWindow && event.data === 'dsh-artifact-printed') cleanup();
  };
  window.addEventListener('message', onMessage);
  const timer = setTimeout(cleanup, PRINT_LIFETIME_MS);
  frame.addEventListener(
    'load',
    () => {
      frame.contentWindow?.postMessage('dsh-artifact-print', '*');
    },
    { once: true },
  );
  frame.src = url;
  document.body.appendChild(frame);
}
