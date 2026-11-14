/** Page document composition shared by the host exporter and the browser renderer. */

import { THEME_ATTRIBUTE } from './contract.js';
import type { PageTheme } from './contract.js';

/**
 * Whether a page opted in to dark colors with a color-scheme meta that names
 * dark. Pages that did not opt in keep the light set, because they may paint
 * literal light backgrounds.
 * @param content the page HTML.
 * @returns whether the page supports a dark theme.
 */
export function supportsDark(content: string): boolean {
  return /<meta\b[^>]*name\s*=\s*["']?color-scheme["']?[^>]*content\s*=\s*["'][^"']*\bdark\b/i.test(content)
    || /<meta\b[^>]*content\s*=\s*["'][^"']*\bdark\b[^"']*["'][^>]*name\s*=\s*["']?color-scheme/i.test(content);
}

/**
 * The policy injected into every rendered page. It blocks every network
 * request, so a page artifact cannot load remote code or send data out.
 */
export const PAGE_CSP =
  "default-src 'none'; img-src data: blob:; media-src data: blob:; style-src 'unsafe-inline'; " +
  "script-src 'unsafe-inline' 'unsafe-eval'; font-src data:; connect-src 'none'; frame-src 'none'; " +
  "object-src 'none'; base-uri 'none'; form-action 'none'";

/**
 * Document typography from the design tokens. Selectors are bare element
 * names, so the export uses them on the page and the editor scopes them under
 * its own surface class.
 */
export const DOC_STYLE = [
  'body, .art-docpage { color: var(--artifact-color-text); font-family: var(--artifact-font-family); font-size: 16px; line-height: 1.65; }',
  'h1, h2, h3, h4 { font-family: var(--artifact-font-display); font-weight: 600; line-height: 1.2; letter-spacing: -0.01em; margin: 1.8em 0 0.5em; color: var(--artifact-color-text); text-wrap: balance; }',
  'h1 { font-size: 2.1em; margin-top: 0; }',
  'h2 { font-size: 1.45em; }',
  'h3 { font-size: 1.15em; }',
  'p, ul, ol, blockquote, table, pre { margin: 0 0 1em; }',
  'a { color: var(--artifact-color-primary); text-underline-offset: 2px; }',
  'strong { font-weight: 650; }',
  'code { font-family: var(--artifact-font-mono); font-size: 0.88em; padding: 0.1em 0.35em; border-radius: var(--artifact-radius-sm); background: color-mix(in srgb, var(--artifact-color-text) 7%, transparent); }',
  'pre { font-family: var(--artifact-font-mono); font-size: 0.86em; line-height: 1.55; padding: 14px 16px; border-radius: var(--artifact-radius-md); background: color-mix(in srgb, var(--artifact-color-text) 6%, transparent); overflow: auto; }',
  'pre code { padding: 0; background: none; font-size: 1em; }',
  'blockquote { padding: 0 0 0 16px; border-left: 3px solid var(--artifact-color-accent); color: var(--artifact-color-muted); }',
  'ul, ol { padding-left: 1.4em; }',
  'li + li { margin-top: 0.25em; }',
  'table { border-collapse: collapse; width: 100%; font-size: 0.94em; font-variant-numeric: tabular-nums; }',
  'th, td { padding: 8px 10px; border-bottom: 1px solid color-mix(in srgb, var(--artifact-color-text) 14%, transparent); text-align: left; vertical-align: top; }',
  'th { font-weight: 600; color: var(--artifact-color-muted); border-bottom-color: color-mix(in srgb, var(--artifact-color-text) 28%, transparent); }',
  'hr { border: none; border-top: 1px solid color-mix(in srgb, var(--artifact-color-text) 14%, transparent); margin: 2em 0; }',
].join('\n');

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
 * @param theme the theme a dark-capable page uses; omitted, it follows the viewer's system setting.
 * @returns a full HTML document.
 */
export function composePage(
  content: string,
  designCss: string,
  csp: string | null,
  title: string,
  extraHead = '',
  theme: PageTheme = 'auto',
): string {
  const head =
    '<meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">' +
    (csp === null ? '' : `<meta http-equiv="Content-Security-Policy" content="${escapeHtml(csp)}">`) +
    `<title>${escapeHtml(title)}</title>` +
    `<style data-artifact-tokens>${designCss}</style>` +
    extraHead;
  const root = supportsDark(content) ? ` ${THEME_ATTRIBUTE}="${theme}"` : '';
  return `<!doctype html><html${root}><head>${head}</head><body>${stripNavigation(content)}</body></html>`;
}
