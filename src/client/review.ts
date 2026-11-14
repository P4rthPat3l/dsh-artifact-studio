import type { Translator } from './harness.js';

/** The most selected text one request may carry. */
export const QUOTE_LIMIT = 2000;

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
 * The same request as plain text, for a surface without a composer.
 * @param quote the selected text.
 * @param reference the reference text.
 * @returns Markdown with the quote as a blockquote.
 */
export function plainRequest(quote: string, reference: string): string {
  if (quote === '') return reference;
  return `${quote.split('\n').map((line) => `> ${line}`).join('\n')}\n\n${reference}`;
}
