import type { LayerQuote } from './canvas/entry.js';
import type { Translator } from './harness.js';

/** The most selected text one request may carry. */
export const QUOTE_LIMIT = 2000;

/** The most Design JSX one layer quote may carry. */
export const DESIGN_QUOTE_LIMIT = 4000;

/** A normalised selection ready for a request. */
export interface Quote {
  text: string;
  truncated: boolean;
}

/** What the composer reference names. */
export interface ReferenceFields {
  title: string;
  id: string;
  version: number;
  current: number;
}

/**
 * Trim and flatten a selection so a copy of a whole section stays readable.
 * @param value the selected text.
 * @param limit the maximum characters.
 * @returns the text and whether it was cut.
 */
export function quoteText(value: string, limit = QUOTE_LIMIT): Quote {
  const collapsed = value
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  if (collapsed.length <= limit) return { text: collapsed, truncated: false };
  return { text: collapsed.slice(0, limit).trimEnd(), truncated: true };
}

/**
 * The words placed in the composer ahead of the user's own. They name the
 * artifact by id and saved version, so the agent reads the right copy. The
 * user finishes the sentence and sends it.
 * @param t the translator.
 * @param fields the artifact identity and versions.
 * @returns the reference text, ending in a space.
 */
export function buildReference(t: Translator, fields: ReferenceFields): string {
  const key = fields.version === fields.current ? 'agent.reference' : 'agent.referenceOld';
  return `${t(key, { title: fields.title, id: fields.id, version: fields.version, current: fields.current })} `;
}

/**
 * The quote for one canvas layer: its name, its path from the top-level frame,
 * and its own Design JSX. It never carries the rest of the document.
 * @param t the translator.
 * @param layer the selected layer.
 * @returns the bounded quote.
 */
export function buildDesignQuote(t: Translator, layer: LayerQuote): Quote {
  const head = t('agent.quoteDesign', { name: layer.name, path: layer.path });
  const body = head + '\n\n\x60\x60\x60jsx\n' + layer.jsx + '\n\x60\x60\x60';
  if (body.length <= DESIGN_QUOTE_LIMIT) return { text: body, truncated: false };
  const marker = '\n\n' + t('agent.quoteCut', { limit: DESIGN_QUOTE_LIMIT });
  return { text: body.slice(0, DESIGN_QUOTE_LIMIT - marker.length).trimEnd() + marker, truncated: true };
}

/**
 * The same request as plain text, for a surface without a composer.
 * @param quote the selected text.
 * @param reference the reference text.
 * @returns Markdown with the quote as a blockquote.
 */
export function plainRequest(quote: string, reference: string): string {
  if (quote === '') return reference;
  return `${quote.split('\n').map((line) => `> ${line}`).join('\n')}\n\n${reference}`;
}
