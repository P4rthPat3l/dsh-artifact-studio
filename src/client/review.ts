import { formatArtifactAddress } from '../contract.js';
import type { ArtifactAddress } from '../contract.js';
import type { Translator } from './harness.js';

/** The most selected text one request may carry. */
export const QUOTE_LIMIT = 2000;

/** A normalised selection ready for a request. */
export interface Quote {
  text: string;
  truncated: boolean;
}

/** Everything the request template needs. */
export interface RequestFields {
  title: string;
  address: ArtifactAddress;
  id: string;
  version: number;
  workspace: string;
  quote: string;
  prompt: string;
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
 * Build the request that the user copies into the conversation. The identity
 * block is generated so the editable field only holds the user's words.
 * @param t the translator.
 * @param fields the artifact identity, version, quote, and prompt.
 * @returns the request text.
 */
export function buildRequest(t: Translator, fields: RequestFields): string {
  const quote = fields.quote.trim();
  const selection = quote === '' ? '' : `Selected text:\n"""\n${quote}\n"""\n`;
  return t('agent.request', {
    title: fields.title,
    address: formatArtifactAddress(fields.address),
    id: fields.id,
    scope: fields.address.scope,
    workspace: fields.workspace,
    version: fields.version,
    selection,
    prompt: fields.prompt.trim(),
  });
}
