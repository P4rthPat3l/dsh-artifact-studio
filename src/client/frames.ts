import { PAGE_CSP, PRINT_HOOK, composePage } from '../render.js';

/** The only sandbox flag a preview gets: scripts run, but in an opaque origin with no network. */
export const PREVIEW_SANDBOX = 'allow-scripts';

/** Sandbox for the transient print copy. `print()` requires the modals flag. */
export const PRINT_SANDBOX = 'allow-scripts allow-modals';

/** How long a print frame may live before it is removed regardless of events. */
const PRINT_LIFETIME_MS = 30_000;

/**
 * Build the preview document for a page artifact.
 * @param content the page HTML.
 * @param designCss the token rule.
 * @param title the artifact title.
 * @returns HTML with the network-blocking policy and the tokens ahead of the content.
 */
export function pageDocument(content: string, designCss: string, title: string): string {
  return composePage(content, designCss, PAGE_CSP, title);
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
