import { createHash } from 'node:crypto';
import { DEFAULT_TOKENS, DIGEST_PATTERN, isDesignSystemRef } from '../../contract.js';
import type { DesignTokens, DesignSystemRef, GenerationSummary, TokenSource } from '../../contract.js';
import { mergeTokens } from './design-system.js';
import { parseRecipe } from './recipes.js';
import type { Recipe } from './recipes.js';
import { ArtifactError } from './errors.js';

export interface Generation {
  schemaVersion: 1;
  tokens: DesignTokens;
  system: DesignSystemRef | null;
  tokenSource: TokenSource;
  recipe: Recipe | null;
  kit: string | null;
  conventionsHash: string;
}
export const generationHash = (text: string): string => 'sha256:' + createHash('sha256').update(text).digest('hex');
export function parseGeneration(value: unknown): Generation {
  if (value === null || typeof value !== 'object') throw new ArtifactError('artifact/corrupt', 'Invalid generation snapshot.');
  const row: Record<string, unknown> = { ...value };
  if (row.schemaVersion !== 1 || row.system !== null && !isDesignSystemRef(row.system)
    || !['workspace','library','default'].includes(String(row.tokenSource))
    || row.kit !== null && (typeof row.kit !== 'string' || row.kit.length > 20)
    || typeof row.conventionsHash !== 'string' || !DIGEST_PATTERN.test(row.conventionsHash)) throw new ArtifactError('artifact/corrupt', 'Unsupported or invalid generation snapshot.');
  if (row.tokenSource !== 'workspace' && row.tokenSource !== 'library' && row.tokenSource !== 'default') throw new ArtifactError('artifact/corrupt','Invalid token source.');
  if (row.system !== null && !isDesignSystemRef(row.system)) throw new ArtifactError('artifact/corrupt','Invalid system identity.');
  if (row.kit !== null && typeof row.kit !== 'string') throw new ArtifactError('artifact/corrupt','Invalid kit.');
  const tokens = mergeTokens(DEFAULT_TOKENS,row.tokens);
  if (JSON.stringify(tokens) !== JSON.stringify(row.tokens)) throw new ArtifactError('artifact/corrupt','Incomplete generation tokens.');
  return { schemaVersion: 1, tokens, system: row.system, tokenSource: row.tokenSource, recipe: row.recipe === null ? null : parseRecipe(row.recipe), kit: row.kit, conventionsHash: row.conventionsHash };
}
export function generationText(value: Generation): string {
  const text = JSON.stringify(parseGeneration(value));
  if (Buffer.byteLength(text) > 65536) throw new ArtifactError('artifact/too-large', 'Generation snapshot exceeds 64 KiB.');
  return text;
}
export function generationSummary(value: Generation): GenerationSummary {
  const text = generationText(value);
  return { hash: generationHash(text), bytes: Buffer.byteLength(text), system: value.system, recipe: value.recipe?.id ?? null, kit: value.kit };
}
