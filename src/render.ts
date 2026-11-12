/** Page document composition shared by the host exporter and the browser renderer. */

/**
 * The policy injected into every rendered page. It blocks every network
 * request, so a page artifact cannot load remote code or send data out.
 */
export const PAGE_CSP =
  "default-src 'none'; img-src data: blob:; media-src data: blob:; style-src 'unsafe-inline'; " +
  "script-src 'unsafe-inline' 'unsafe-eval'; font-src data:; connect-src 'none'; frame-src 'none'; " +
  "object-src 'none'; base-uri 'none'; form-action 'none'";

/** Script-free policy for exported document HTML. */
export const DOC_CSP =
  "default-src 'none'; img-src data:; style-src 'unsafe-inline'; font-src data:; script-src 'none'; base-uri 'none'; form-action 'none'";

/**
 * Policy for the transient print copy of a document: inline styles plus the one
 * print hook the panel injects.
 */
export const PRINT_CSP =
  "default-src 'none'; img-src data:; style-src 'unsafe-inline'; font-src data:; script-src 'unsafe-inline'; base-uri 'none'; form-action 'none'";

/**
 * The listener that prints a sandboxed copy: the panel cannot reach into an
 * opaque-origin frame, so it posts a message and the frame prints itself. The
 * frame reports back so the panel removes it as soon as the dialog closes.
 */
export const PRINT_HOOK =
  "<script>addEventListener('message',function(e){if(e.source!==parent||e.data!=='dsh-artifact-print')return;" +
  "addEventListener('afterprint',function(){parent.postMessage('dsh-artifact-printed','*')},{once:true});print()})</script>";

/**
 * Escape text for an HTML attribute or text node.
 * @param value the raw text.
 * @returns escaped text.
 */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Drop markup that would navigate a frame: a refresh meta is not covered by any
 * CSP directive, so the document must not carry one.
 * @param content the page HTML.
 * @returns the page HTML without refresh directives.
 */
export function stripNavigation(content: string): string {
  return content
    .replace(/<meta\b[^>]*http-equiv\s*=\s*["']?refresh["']?[^>]*>/gi, '')
    .replace(/<meta\b[^>]*content\s*=\s*["'][^"']*url\s*=[^>]*>/gi, '');
}

/**
 * Compose a page document with the policy and the token style ahead of every
 * other byte of markup.
 *
 * The prologue is emitted first and the artifact follows as body content, so the
 * policy is parsed before any page element, comment, or script. Searching for a
 * `<head>` in the artifact instead would let `<!-- <head> -->`, or a script that
 * precedes `<head>`, run before the policy was installed. Head-only elements
 * such as `<style>`, `<title>`, and `<meta>` are still honoured after the body
 * starts, because the HTML parser processes them with the head rules.
 * @param content the page HTML or a fragment.
 * @param designCss the `:root` token rule.
 * @param csp the policy to inject, or null for none.
 * @param title the document title.
 * @param extraHead markup added to the prologue head.
 * @returns a full HTML document.
 */
export function composePage(
  content: string,
  designCss: string,
  csp: string | null,
  title: string,
  extraHead = '',
): string {
  const head =
    '<meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">' +
    (csp === null ? '' : `<meta http-equiv="Content-Security-Policy" content="${escapeHtml(csp)}">`) +
    `<title>${escapeHtml(title)}</title>` +
    `<style data-artifact-tokens>${designCss}</style>` +
    extraHead;
  return `<!doctype html><html><head>${head}</head><body>${stripNavigation(content)}</body></html>`;
}
