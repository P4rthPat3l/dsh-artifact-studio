import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import { DEFAULT_TOKENS, DIGEST_PATTERN, SYSTEM_ID_PATTERN, isDesignSystemRef, tokensToCss } from '../../contract.js';
import type { DesignCatalog, DesignSaveOptions, DesignSelection, DesignSystemRef, DesignTokens, ResolvedDesignSystem } from '../../contract.js';
import { mergeTokens, readScopeTokens } from './design-system.js';
import { ArtifactError } from './errors.js';
import { assertPlainPath, withWriteLock, writeAtomic } from './fsutil.js';
import { assertPlainFile } from './paths.js';
import type { ScopeRoot } from './paths.js';

interface Entry extends DesignSystemRef { hash: string }
interface Index { schemaVersion: 1; revision: number; defaultId: string | null; systems: Entry[] }
const empty = (): Index => ({ schemaVersion: 1, revision: 0, defaultId: null, systems: [] });
const hash = (text: string) => 'sha256:' + createHash('sha256').update(text).digest('hex');
const invalid = () => new ArtifactError('artifact/corrupt', 'The design-system catalog is invalid. Repair it before saving.');
const indexPath = (root: ScopeRoot) => path.join(root.root, 'design-systems', 'index.json');

async function json(root: ScopeRoot, file: string): Promise<unknown | undefined> {
  await assertPlainPath(root.root, file);
  if (!(await assertPlainFile(file))) return undefined;
  if ((await fs.stat(file)).size > 128 * 1024) throw invalid();
  try { return JSON.parse(await fs.readFile(file, 'utf8')); }
  catch (error) { if (error instanceof SyntaxError) throw invalid(); throw error; }
}
async function index(root: ScopeRoot | undefined): Promise<Index> {
  if (!root) return empty();
  const value = await json(root, indexPath(root));
  if (value === undefined) return empty();
  if (value === null || typeof value !== 'object') throw invalid();
  const row: Record<string, unknown> = { ...value };
  if (row.schemaVersion !== 1 || typeof row.revision !== 'number' || !Number.isSafeInteger(row.revision) || row.revision < 0
    || (row.defaultId !== null && typeof row.defaultId !== 'string') || !Array.isArray(row.systems) || row.systems.length > 50) throw invalid();
  const systems = row.systems.map((item: unknown): Entry => {
    if (!isDesignSystemRef(item) || item.scope !== root.scope || !('hash' in item) || typeof item.hash !== 'string' || !DIGEST_PATTERN.test(item.hash)) throw invalid();
    return { id: item.id, revision: item.revision, name: item.name, scope: item.scope, hash: item.hash };
  });
  if (new Set(systems.map(s => s.id)).size !== systems.length || row.defaultId !== null && !systems.some(s => s.id === row.defaultId)) throw invalid();
  return { schemaVersion: 1, revision: row.revision, defaultId: row.defaultId, systems };
}
export async function listSystems(root: ScopeRoot): Promise<DesignCatalog> {
  const data = await index(root);
  return { scope: root.scope, revision: data.revision, defaultId: data.defaultId,
    systems: data.systems.map(({ hash: _hash, ...ref }) => ref) };
}
async function revision(root: ScopeRoot, entry: Entry, requested = entry.revision): Promise<ResolvedDesignSystem> {
  if (!Number.isSafeInteger(requested) || requested < 1 || requested > entry.revision) throw new ArtifactError('artifact/not-found', 'That design revision does not exist.');
  const file = path.join(root.root, 'design-systems', entry.id, String(requested) + '.json');
  const value = await json(root, file);
  if (value === null || typeof value !== 'object') throw invalid();
  const row: Record<string, unknown> = { ...value };
  if (row.schemaVersion !== 1 || !isDesignSystemRef(row.system) || row.system.id !== entry.id || row.system.revision !== requested || row.system.scope !== root.scope
    || typeof row.hash !== 'string' || !DIGEST_PATTERN.test(row.hash)) throw invalid();
  const text = JSON.stringify(row.tokens);
  if (text === undefined || hash(text) !== row.hash || requested === entry.revision && row.hash !== entry.hash) throw invalid();
  const tokens = mergeTokens(DEFAULT_TOKENS, row.tokens);
  if (JSON.stringify(tokens) !== text) throw invalid();
  return { tokens, source: root.scope, css: tokensToCss(tokens), system: row.system };
}
export async function resolveSystem(workspace: ScopeRoot | undefined, library: ScopeRoot, selection: DesignSelection = {}): Promise<ResolvedDesignSystem> {
  if (selection.systemId !== undefined) {
    if (!SYSTEM_ID_PATTERN.test(selection.systemId)) throw new ArtifactError('artifact/bad-request', 'Invalid design system id.');
    const roots = selection.systemScope === 'library' ? [library] : selection.systemScope === 'workspace' ? [workspace] : [workspace, library];
    for (const root of roots) {
      if (!root) continue;
      const catalog = await index(root);
      const found = catalog.systems.find(s => s.id === selection.systemId);
      if (found) return { ...await revision(root, found, selection.revision), catalogRevision: catalog.revision };
    }
    throw new ArtifactError('artifact/not-found', 'The selected design system is not available in this scope.');
  }
  if (selection.revision !== undefined || selection.systemScope !== undefined) throw new ArtifactError('artifact/bad-request', 'A design revision or scope requires systemId.');
  for (const root of [workspace, library]) {
    if (!root) continue;
    const catalog = await index(root);
    const found = catalog.systems.find(s => s.id === catalog.defaultId);
    if (found) return { ...await revision(root, found), catalogRevision: catalog.revision };
    const legacy = await readScopeTokens(root);
    if (legacy) return { tokens: legacy, source: root.scope, css: tokensToCss(legacy), catalogRevision: catalog.revision };
  }
  return { tokens: DEFAULT_TOKENS, source: 'default', css: tokensToCss(DEFAULT_TOKENS) };
}
export async function saveSystem(root: ScopeRoot, base: DesignTokens, patch: unknown, options: DesignSaveOptions): Promise<ResolvedDesignSystem> {
  const directory = path.join(root.root, 'design-systems');
  await assertPlainPath(root.root, directory);
  await fs.mkdir(directory, { recursive: true });
  return withWriteLock(root.root, indexPath(root), async () => {
    const catalog = await index(root);
    if (options.expectedRevision !== catalog.revision) throw new ArtifactError('artifact/stale-catalog', 'The design catalog changed. Reload it and reapply your edits.', { current: catalog.revision });
    if (options.createNew && options.systemId !== undefined) throw new ArtifactError('artifact/bad-request', 'Choose createNew or systemId, not both.');
    const existing = options.systemId === undefined ? undefined : catalog.systems.find(s => s.id === options.systemId);
    if (options.systemId !== undefined && !existing) throw new ArtifactError('artifact/not-found', 'The design system is not in this catalog.');
    if (!options.createNew && !existing) throw new ArtifactError('artifact/bad-request', 'Choose a systemId or createNew.');
    if (options.createNew && catalog.systems.length >= 50) throw new ArtifactError('artifact/too-large', 'This scope already contains 50 named systems.');
    const tokens = mergeTokens(existing ? (await revision(root, existing)).tokens : base, patch);
    const system: DesignSystemRef = { id: existing?.id ?? 'ds_' + randomBytes(8).toString('hex'), revision: (existing?.revision ?? 0) + 1, name: tokens.name, scope: root.scope };
    const digest = hash(JSON.stringify(tokens));
    const file = path.join(directory, system.id, String(system.revision) + '.json');
    await assertPlainPath(root.root, file);
    await fs.mkdir(path.dirname(file), { recursive: true });
    // A failed index commit may leave an orphan revision; never overwrite it.
    if (await assertPlainFile(file)) throw new ArtifactError('artifact/corrupt', 'An uncommitted system revision exists. Recover it before saving.', { file });
    await writeAtomic(file, JSON.stringify({ schemaVersion: 1, system, tokens, hash: digest }) + '\n');
    const next: Index = { schemaVersion: 1, revision: catalog.revision + 1, defaultId: options.makeDefault ? system.id : catalog.defaultId,
      systems: [...catalog.systems.filter(s => s.id !== system.id), { ...system, hash: digest }] };
    await assertPlainPath(root.root, indexPath(root));
    await writeAtomic(indexPath(root), JSON.stringify(next) + '\n');
    return { tokens, source: root.scope, css: tokensToCss(tokens), system, catalogRevision: next.revision };
  });
}
export async function setSystemDefault(root: ScopeRoot, id: string | null, expectedRevision: number): Promise<void> {
  const directory = path.join(root.root, 'design-systems');
  await assertPlainPath(root.root, directory);
  await fs.mkdir(directory, { recursive: true });
  await withWriteLock(root.root, indexPath(root), async () => {
    const catalog = await index(root);
    if (catalog.revision !== expectedRevision) throw new ArtifactError('artifact/stale-catalog', 'The design catalog changed. Reload it before selecting a default.');
    if (id !== null && !catalog.systems.some(s => s.id === id)) throw new ArtifactError('artifact/not-found', 'No such system in this scope.');
    await writeAtomic(indexPath(root), JSON.stringify({ ...catalog, defaultId: id, revision: catalog.revision + 1 }) + '\n');
  });
}
