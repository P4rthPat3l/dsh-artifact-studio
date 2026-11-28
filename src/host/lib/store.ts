import { createHash, randomBytes } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { CONTENT_FILE, ID_PATTERN, MAX_LIST_LIMIT, MAX_TITLE, isArtifactType, isManifest, isVersionSource, isGenerationSummary } from '../../contract.js';
import type { ArtifactType, ListResult, Manifest, Scope, TransferMode, VersionEntry, VersionSource } from '../../contract.js';
import { ArtifactError, errnoCode } from './errors.js';
import { assertWithin, assertPlainPath, withWriteLock, writeAtomic } from './fsutil.js';
import { generationText, generationHash, generationSummary, parseGeneration } from './generation.js';
import type { Generation } from './generation.js';
import { declaredKit, getKit } from '../../kit.js';
import { artifactDir, assertPlainFile } from './paths.js';
import type { ScopeRoot } from './paths.js';

/** Store limits; the defaults match the feature document. */
export interface StoreLimits {
  readonly maxContentBytes: number;
  readonly maxVersions: number;
  readonly maxVersionsBytes: number;
  readonly trashRetentionDays: number;
  readonly maxScan: number;
}

export const DEFAULT_LIMITS: StoreLimits = {
  maxContentBytes: 2 * 1024 * 1024,
  maxVersions: 50,
  maxVersionsBytes: 20 * 1024 * 1024,
  trashRetentionDays: 7,
  maxScan: 500,
};

const MANIFEST = 'artifact.json';
const MAX_MANIFEST_BYTES = 8 * 1024;
const TRASH = '.trash';

/** One replace-once edit. */
export interface TextEdit {
  readonly oldText: string;
  readonly newText: string;
}

/** Input for a new artifact. */
export interface CreateInput {
  readonly type: ArtifactType;
  readonly title: string;
  readonly content: string;
  readonly source: VersionSource;
  readonly recipe?: string;
  readonly generation?: Generation;
}

/** Input for an update; either `content` or `edits`, and an optional new title. */
export interface UpdateInput {
  readonly baseVersion: number;
  readonly content?: string;
  readonly edits?: readonly TextEdit[];
  readonly title?: string;
  readonly recipe?: string;
  readonly source: VersionSource;
  readonly generation?: Generation;
}

/** Filters for `list`. */
export interface ListInput {
  readonly query?: string;
  readonly type?: ArtifactType;
  readonly recipe?: string;
  readonly offset?: number;
  readonly limit?: number;
}

/** One read of an artifact. */
export interface ReadResult {
  readonly manifest: Manifest;
  readonly content: string;
  readonly version: number;
  readonly generation?: Generation;
}

/**
 * A sha256 content hash with its algorithm prefix.
 * @param text the content.
 * @returns the hash.
 */
export function hashOf(text: string): string {
  return `sha256:${createHash('sha256').update(text, 'utf8').digest('hex')}`;
}

/**
 * A new id: scope prefix plus 16 random base-36 characters.
 * @param scope the scope.
 * @returns the id.
 */
export function newId(scope: Scope): string {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = randomBytes(16);
  let suffix = '';
  for (const byte of bytes) suffix += alphabet[byte % alphabet.length];
  return `${scope === 'workspace' ? 'art_ws_' : 'art_lib_'}${suffix}`;
}

/**
 * Trim and check a title.
 * @param raw the title.
 * @returns the clean title.
 */
export function cleanTitle(raw: string): string {
  const title = raw.replace(/\s+/g, ' ').trim();
  if (title.length === 0 || title.length > MAX_TITLE) {
    throw new ArtifactError('artifact/bad-request', `The title must be 1 to ${MAX_TITLE} characters.`, {
      length: title.length,
    });
  }
  return title;
}

/**
 * Narrow version metadata read from disk.
 * @param value the parsed value.
 * @returns whether it is a version entry.
 */
function isVersionEntry(value: unknown): value is VersionEntry {
  if (value === null || typeof value !== 'object') return false;
  const record: Record<string, unknown> = { ...value };
  return (
    typeof record.version === 'number' &&
    typeof record.createdAt === 'string' &&
    typeof record.contentHash === 'string' &&
    typeof record.contentBytes === 'number' &&
    isVersionSource(record.source) &&
    (record.generation === undefined || isGenerationSummary(record.generation))
  );
}

/**
 * Apply replace-once edits to a text.
 * @param text the current content.
 * @param edits the edits, applied in order.
 * @returns the edited content.
 */
export function applyEdits(text: string, edits: readonly TextEdit[]): string {
  let result = text;
  edits.forEach((edit, index) => {
    if (edit.oldText === '') {
      throw new ArtifactError('artifact/bad-request', `Edit ${index + 1} has an empty oldText.`);
    }
    const first = result.indexOf(edit.oldText);
    if (first < 0) {
      throw new ArtifactError('artifact/edit-not-found', `Edit ${index + 1}: oldText was not found.`, { index });
    }
    if (result.indexOf(edit.oldText, first + 1) >= 0) {
      throw new ArtifactError(
        'artifact/edit-ambiguous',
        `Edit ${index + 1}: oldText occurs more than once; include more surrounding text.`,
        { index },
      );
    }
    result = result.slice(0, first) + edit.newText + result.slice(first + edit.oldText.length);
  });
  return result;
}

/** Files-only artifact storage shared by both scopes. */
export class ArtifactStore {
  readonly limits: StoreLimits;

  private readonly now: () => Date;

  /**
   * @param limits store limits.
   * @param now the clock, replaceable in tests.
   */
  constructor(limits: Partial<StoreLimits> = {}, now: () => Date = () => new Date()) {
    this.limits = { ...DEFAULT_LIMITS, ...limits };
    this.now = now;
  }

  /**
   * Refuse content over the size cap.
   * @param content the content.
   * @returns the byte length.
   */
  private checkSize(content: string): number {
    const bytes = Buffer.byteLength(content, 'utf8');
    if (bytes > this.limits.maxContentBytes) {
      throw new ArtifactError(
        'artifact/too-large',
        `The content is ${bytes} bytes; the limit is ${this.limits.maxContentBytes}.`,
        { bytes, limit: this.limits.maxContentBytes },
      );
    }
    return bytes;
  }

  /**
   * Read and check a manifest.
   * @param dir the artifact directory.
   * @returns the manifest.
   */
  private async readManifest(dir: string): Promise<Manifest> {
    const file = path.join(dir, MANIFEST);
    if (!(await assertPlainFile(file))) {
      throw new ArtifactError('artifact/not-found', 'The artifact has no manifest.', { id: path.basename(dir) });
    }
    const text = await fs.readFile(file, 'utf8');
    if (Buffer.byteLength(text) > MAX_MANIFEST_BYTES) {
      throw new ArtifactError('artifact/corrupt', 'The artifact manifest is too large.', { id: path.basename(dir) });
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new ArtifactError('artifact/corrupt', 'The artifact manifest is not valid JSON.', { id: path.basename(dir) });
    }
    if (!isManifest(parsed) || parsed.id !== path.basename(dir)) {
      throw new ArtifactError('artifact/corrupt', 'The artifact manifest is invalid.', { id: path.basename(dir) });
    }
    if (parsed.contentFile !== CONTENT_FILE[parsed.type]) {
      throw new ArtifactError('artifact/corrupt', 'The artifact manifest names an unexpected content file.', {
        id: parsed.id,
      });
    }
    return parsed;
  }

  /**
   * Read the content of one version, or the current content.
   * @param dir the artifact directory.
   * @param manifest the manifest.
   * @param version the version, or undefined for the current content.
   * @returns the content.
   */
  private async readContent(dir: string, manifest: Manifest, version?: number): Promise<string> {
    if (version !== undefined && version !== manifest.version) {
      const file = path.join(dir, 'versions', String(version), 'content', manifest.contentFile);
      if (!(await assertPlainFile(file))) {
        throw new ArtifactError('artifact/version-not-found', `Version ${version} is not stored.`, { version });
      }
      return fs.readFile(file, 'utf8');
    }
    const file = path.join(dir, 'content', manifest.contentFile);
    if (!(await assertPlainFile(file))) {
      throw new ArtifactError('artifact/version-not-found', `Version ${manifest.version} is not stored.`, {
        version: manifest.version,
      });
    }
    const content = await fs.readFile(file, 'utf8');
    if (hashOf(content) === manifest.contentHash) return content;
    // A crash between the content rename and the manifest rename leaves new
    // content under the old hash; the immutable snapshot is the authority.
    const snapshot = path.join(dir, 'versions', String(manifest.version), 'content', manifest.contentFile);
    if ((await assertPlainFile(snapshot)) && hashOf(await fs.readFile(snapshot, 'utf8')) === manifest.contentHash) {
      return fs.readFile(snapshot, 'utf8');
    }
    throw new ArtifactError('artifact/corrupt', 'The stored content does not match its recorded hash.', { id: manifest.id });
  }

  /**
   * Store one immutable snapshot of a version.
   * @param dir the artifact directory.
   * @param manifest the manifest of that version.
   * @param content its content.
   */
  private async snapshot(root: string, dir: string, manifest: Manifest, content: string, generation?: Generation): Promise<void> {
    const versionDir = path.join(dir, 'versions', String(manifest.version));
    await assertPlainPath(root, path.join(versionDir, 'content', manifest.contentFile));
    await assertPlainPath(root, path.join(versionDir, 'meta.json'));
    await assertPlainPath(root, path.join(versionDir, 'generation.json'));
    await fs.mkdir(path.join(versionDir, 'content'), { recursive: true });
    if (generation !== undefined) await writeAtomic(path.join(versionDir, 'generation.json'), generationText(generation));
    await writeAtomic(path.join(versionDir, 'content', manifest.contentFile), content);
    const entry: VersionEntry = {
      version: manifest.version,
      createdAt: manifest.updatedAt,
      contentHash: manifest.contentHash,
      contentBytes: manifest.contentBytes,
      source: manifest.source,
      ...(manifest.generation === undefined ? {} : { generation: manifest.generation }),
    };
    await writeAtomic(path.join(versionDir, 'meta.json'), `${JSON.stringify(entry, null, 2)}\n`);
  }

  /**
   * Write the next version: snapshot, then content, then the manifest last, so
   * the manifest never names a version whose content is missing.
   * @param dir the artifact directory.
   * @param manifest the next manifest.
   * @param content the next content.
   */
  private async commit(dir: string, manifest: Manifest, content: string, root: string, generation?: Generation): Promise<void> {
    await assertWithin(root, dir);
    await assertPlainFile(path.join(dir, 'content', manifest.contentFile));
    await assertPlainFile(path.join(dir, MANIFEST));
    await this.snapshot(root, dir, manifest, content, generation);
    const contentFile = path.join(dir, 'content', manifest.contentFile);
    const manifestFile = path.join(dir, MANIFEST);
    await assertPlainPath(root, contentFile);
    await assertPlainPath(root, manifestFile);
    await writeAtomic(contentFile, content);
    await writeAtomic(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`);
    try {
      await this.prune(root, dir, manifest.version);
    } catch (error) {
      // The version is saved; a prune failure must not make the caller retry a write that succeeded.
      console.warn('[dsh-artifact-studio] prune failed', manifest.id, error instanceof Error ? error.message : error);
    }
  }

  /**
   * Drop the oldest snapshots past the count and byte caps. The current
   * version is never dropped.
   * @param dir the artifact directory.
   * @param current the current version.
   */
  private async prune(root: string, dir: string, current: number): Promise<void> {
    const entries = await this.versionEntries(root, dir);
    const newestFirst = [...entries].sort((a, b) => b.version - a.version);
    let total = 0;
    const drop: number[] = [];
    newestFirst.forEach((entry, index) => {
      total += entry.contentBytes + (entry.generation?.bytes ?? 0);
      if (entry.version === current) return;
      // A snapshot newer than the manifest is a crash leftover, not history.
      if (entry.version > current || index >= this.limits.maxVersions || total > this.limits.maxVersionsBytes) {
        drop.push(entry.version);
      }
    });
    for (const version of drop) {
      const target = path.join(dir, 'versions', String(version));
      await assertWithin(dir, target);
      await fs.rm(target, { recursive: true, force: true });
    }
  }

  /**
   * Read every snapshot's metadata.
   * @param dir the artifact directory.
   * @returns the entries, oldest first.
   */
  private async versionEntries(root: string, dir: string): Promise<VersionEntry[]> {
    let names: string[];
    try {
      names = await fs.readdir(path.join(dir, 'versions'));
    } catch (error) {
      if (errnoCode(error) === 'ENOENT') return [];
      throw error;
    }
    const entries: VersionEntry[] = [];
    for (const name of names) {
      if (!/^[1-9][0-9]*$/.test(name)) continue;
      const file = path.join(dir, 'versions', name, 'meta.json');
      await assertPlainPath(root, file);
      try {
        if (!(await assertPlainFile(file))) continue;
        const parsed: unknown = JSON.parse(await fs.readFile(file, 'utf8'));
        if (isVersionEntry(parsed) && parsed.version === Number(name)) entries.push(parsed);
      } catch (error) {
        if (error instanceof SyntaxError) continue;
        throw error;
      }
    }
    return entries.sort((a, b) => a.version - b.version);
  }

  /**
   * Create an artifact at version 1.
   * @param root the scope root.
   * @param input type, title, content, and source.
   * @returns the manifest.
   */
  async create(root: ScopeRoot, input: CreateInput): Promise<Manifest> {
    // The type arrives from the route, so it is checked at runtime, not only by its declared type.
    const declared: unknown = input.type;
    if (!isArtifactType(declared)) {
      throw new ArtifactError('artifact/bad-request', 'Unknown artifact type.', { type: String(declared) });
    }
    const type = declared;
    const title = cleanTitle(input.title);
    const bytes = this.checkSize(input.content);
    const id = newId(root.scope);
    const dir = path.join(root.root, id);
    const now = this.now().toISOString();
    const manifest: Manifest = {
      schemaVersion: 1,
      id,
      scope: root.scope,
      type,
      title,
      createdAt: now,
      updatedAt: now,
      version: 1,
      contentFile: CONTENT_FILE[type],
      contentBytes: bytes,
      contentHash: hashOf(input.content),
      source: input.source,
      ...(input.recipe === undefined ? {} : { recipe: input.recipe }),
      ...(input.generation === undefined ? {} : { generation: generationSummary(input.generation) }),
    };
    try {
      await assertWithin(root.root, dir);
      await fs.mkdir(path.join(dir, 'content'), { recursive: true });
      await this.commit(dir, manifest, input.content, root.root, input.generation);
    } catch (error) {
      await fs.rm(dir, { recursive: true, force: true });
      if (error instanceof ArtifactError) throw error;
      throw new ArtifactError('artifact/storage-failure', 'The artifact could not be written.', {
        errno: errnoCode(error),
      });
    }
    return manifest;
  }

  /**
   * Read only the manifest, without its content.
   * @param root the scope root.
   * @param id the artifact id.
   * @returns the manifest.
   */
  async manifest(root: ScopeRoot, id: string): Promise<Manifest> {
    return this.readManifest(await artifactDir(root, id));
  }

  private async versionMeta(root: ScopeRoot, dir: string, version: number): Promise<VersionEntry> {
    const file = path.join(dir, 'versions', String(version), 'meta.json');
    await assertPlainPath(root.root, file);
    if (!(await assertPlainFile(file))) throw new ArtifactError('artifact/version-not-found', 'The saved version metadata is missing.', { version });
    if ((await fs.stat(file)).size > MAX_MANIFEST_BYTES) throw new ArtifactError('artifact/corrupt', 'Version metadata exceeds its size bound.');
    const text = await fs.readFile(file, 'utf8');
    let value: unknown;
    try { value = JSON.parse(text); } catch { throw new ArtifactError('artifact/corrupt', 'Invalid version metadata JSON.'); }
    if (!isVersionEntry(value) || value.version !== version) throw new ArtifactError('artifact/corrupt', 'Invalid version metadata.');
    return value;
  }

  private async savedGeneration(root: ScopeRoot, dir: string, meta: VersionEntry | Manifest): Promise<Generation | undefined> {
    if (meta.generation === undefined) return undefined;
    const file = path.join(dir, 'versions', String(meta.version), 'generation.json');
    await assertPlainPath(root.root, file);
    if (!(await assertPlainFile(file))) throw new ArtifactError('artifact/corrupt', 'The pinned generation snapshot is missing.');
    if ((await fs.stat(file)).size !== meta.generation.bytes) throw new ArtifactError('artifact/corrupt', 'Generation snapshot size mismatch.');
    const text = await fs.readFile(file, 'utf8');
    if (generationHash(text) !== meta.generation.hash) throw new ArtifactError('artifact/corrupt', 'Generation snapshot hash mismatch.');
    try {
      const generation = parseGeneration(JSON.parse(text));
      if (JSON.stringify(generationSummary(generation)) !== JSON.stringify(meta.generation)) throw new ArtifactError('artifact/corrupt', 'Generation summary mismatch.');
      return generation;
    } catch (error) {
      if (error instanceof SyntaxError || error instanceof ArtifactError) throw new ArtifactError('artifact/corrupt', 'The pinned generation snapshot is invalid.');
      throw error;
    }
  }

  /**
   * Read the manifest and content of the current or an earlier version.
   * @param root the scope root.
   * @param id the artifact id.
   * @param version an optional earlier version.
   * @returns the manifest, content, and version read.
   */
  async read(root: ScopeRoot, id: string, version?: number): Promise<ReadResult> {
    const dir = await artifactDir(root, id);
    const manifest = await this.readManifest(dir);
    if (version !== undefined && (version < 1 || version > manifest.version)) {
      throw new ArtifactError('artifact/version-not-found', `Version ${version} does not exist.`, {
        version,
        current: manifest.version,
      });
    }
    const selected = version ?? manifest.version;
    const meta = selected === manifest.version ? manifest : await this.versionMeta(root, dir, selected);
    await assertPlainPath(root.root, path.join(dir, 'versions', String(selected), 'content', manifest.contentFile));
    await assertPlainPath(root.root, path.join(dir, 'content', manifest.contentFile));
    const content = await this.readContent(dir, manifest, version);
    if (hashOf(content) !== meta.contentHash) throw new ArtifactError('artifact/corrupt', 'The saved content does not match its hash.');
    const generation = await this.savedGeneration(root, dir, meta);
    return { manifest, content, version: selected, ...(generation === undefined ? {} : { generation }) };
  }

  /**
   * Accept a write only when it names the current version.
   * @param root the scope root.
   * @param id the artifact id.
   * @param input the update.
   * @returns the new manifest.
   */
  async update(root: ScopeRoot, id: string, input: UpdateInput): Promise<Manifest> {
    const dir = await artifactDir(root, id);
    return withWriteLock(root.root, dir, async () => {
      const current = await this.readManifest(dir);
      if (input.baseVersion !== current.version) {
        throw new ArtifactError(
          'artifact/stale-version',
          `The artifact is at version ${current.version}, not ${input.baseVersion}. Read it again and reapply the change.`,
          { current: current.version, baseVersion: input.baseVersion },
        );
      }
      const title = input.title === undefined ? current.title : cleanTitle(input.title);
      let content: string;
      if (input.content !== undefined && input.edits !== undefined) {
        throw new ArtifactError('artifact/bad-request', 'Send either content or edits, not both.');
      } else if (input.content !== undefined) {
        content = input.content;
      } else {
        const existing = await this.readContent(dir, current);
        content = input.edits === undefined ? existing : applyEdits(existing, input.edits);
      }
      const base = input.recipe === undefined ? current : { ...current, recipe: input.recipe };
      const generation = input.generation ?? await this.savedGeneration(root, dir, current);
      return this.write(root.root, dir, base, content, title, input.source, generation);
    });
  }

  /**
   * Append a version that repeats an earlier version's content.
   * @param root the scope root.
   * @param id the artifact id.
   * @param version the version to restore.
   * @param source who restored it.
   * @param baseVersion the version the caller saw, if it checks.
   * @returns the new manifest.
   */
  async restore(
    root: ScopeRoot,
    id: string,
    version: number,
    source: VersionSource,
    baseVersion?: number,
    legacyGeneration?: Generation,
  ): Promise<Manifest> {
    const dir = await artifactDir(root, id);
    return withWriteLock(root.root, dir, async () => {
      const current = await this.readManifest(dir);
      if (baseVersion !== undefined && baseVersion !== current.version) {
        throw new ArtifactError(
          'artifact/stale-version',
          `The artifact is at version ${current.version}, not ${baseVersion}.`,
          { current: current.version, baseVersion },
        );
      }
      if (version < 1 || version >= current.version) {
        throw new ArtifactError('artifact/version-not-found', `Version ${version} cannot be restored.`, { version });
      }
      const meta = await this.versionMeta(root, dir, version);
      const content = await this.readContent(dir, current, version);
      if (hashOf(content) !== meta.contentHash) throw new ArtifactError('artifact/corrupt', 'The restored content does not match its hash.');
      const generation = await this.savedGeneration(root, dir, meta) ?? legacyGeneration;
      const base = { ...current };
      if (generation) {
        if (generation.recipe) base.recipe = generation.recipe.id;
        else delete base.recipe;
      }
      return this.write(root.root, dir, base, content, current.title, { ...source, action: 'restore', restoredFrom: version }, generation);
    });
  }

  /**
   * Build and commit the next manifest.
   * @param dir the artifact directory.
   * @param current the current manifest.
   * @param content the next content.
   * @param title the next title.
   * @param source who wrote it.
   * @returns the next manifest.
   */
  private async write(
    root: string,
    dir: string,
    current: Manifest,
    content: string,
    title: string,
    source: VersionSource,
    generation?: Generation,
  ): Promise<Manifest> {
    const bytes = this.checkSize(content);
    const pinned = generation === undefined ? undefined : { ...generation, kit: current.type === 'page' ? declaredKit(content) ?? null : null };
    if (pinned !== undefined && pinned.kit !== null && getKit(pinned.kit) === undefined) {
      throw new ArtifactError('artifact/unsupported-kit', 'The page declares an installed-artifact kit release that is not available. Install it before saving.', { kit: pinned.kit });
    }
    const next: Manifest = {
      ...current,
      title,
      version: current.version + 1,
      updatedAt: this.now().toISOString(),
      contentBytes: bytes,
      contentHash: hashOf(content),
      source,
      ...(pinned === undefined ? {} : { generation: generationSummary(pinned) }),
    };
    if (!pinned) delete next.generation;
    try {
      await this.commit(dir, next, content, root, pinned);
    } catch (error) {
      if (error instanceof ArtifactError) throw error;
      throw new ArtifactError('artifact/storage-failure', 'The artifact could not be written.', {
        errno: errnoCode(error),
      });
    }
    return next;
  }

  /**
   * List the stored versions, newest first.
   * @param root the scope root.
   * @param id the artifact id.
   * @returns the versions.
   */
  async history(root: ScopeRoot, id: string): Promise<VersionEntry[]> {
    const dir = await artifactDir(root, id);
    const manifest = await this.readManifest(dir);
    return (await this.versionEntries(root.root, dir))
      .filter((entry) => entry.version <= manifest.version)
      .reverse();
  }

  /**
   * List artifacts by `updatedAt`, newest first. A corrupt manifest skips its
   * row instead of failing the list.
   * @param root the scope root.
   * @param input filters and paging.
   * @returns one page.
   */
  async list(root: ScopeRoot, input: ListInput = {}): Promise<ListResult> {
    const names = (await fs.readdir(root.root, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory() && ID_PATTERN.test(entry.name))
      .map((entry) => entry.name);
    const truncated = names.length > this.limits.maxScan;
    const manifests: Manifest[] = [];
    for (const name of names.slice(0, this.limits.maxScan)) {
      try {
        const manifest = await this.readManifest(path.join(root.root, name));
        if (manifest.scope === root.scope) manifests.push(manifest);
      } catch (error) {
        if (!(error instanceof ArtifactError)) throw error;
        console.warn('[dsh-artifact-studio] skipped artifact', name, error.code);
      }
    }
    const query = input.query?.trim().toLowerCase() ?? '';
    const filtered = manifests
      .filter((item) => input.type === undefined || item.type === input.type)
      .filter((item) => input.recipe === undefined || item.recipe === input.recipe)
      .filter((item) => query === '' || item.title.toLowerCase().includes(query))
      .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0));
    const offset = Math.max(0, Math.floor(input.offset ?? 0));
    const limit = Math.min(MAX_LIST_LIMIT, Math.max(1, Math.floor(input.limit ?? MAX_LIST_LIMIT)));
    const items = filtered.slice(offset, offset + limit);
    return { items, total: filtered.length, hasMore: offset + items.length < filtered.length, truncated };
  }

  /**
   * Copy an artifact into another scope root under a new id, and optionally
   * trash the source after the copy is complete. The id is always regenerated,
   * so a copy can never collide with the artifact it came from.
   * @param source the source scope root.
   * @param id the source artifact id.
   * @param destination the destination scope root.
   * @param mode copy, or move after the copy is complete.
   * @returns the manifest in the destination.
   */
  async transfer(source: ScopeRoot, id: string, destination: ScopeRoot, mode: TransferMode): Promise<Manifest> {
    if (source.root === destination.root) {
      throw new ArtifactError('artifact/same-workspace', 'The artifact is already in that workspace.', { workspaceId: destination.workspaceId });
    }
    const sourceDir = await artifactDir(source, id);
    return withWriteLock(source.root, sourceDir, async () => {
      const manifest = await this.readManifest(sourceDir);
      const targetId = newId(destination.scope);
      const targetDir = path.join(destination.root, targetId);
      await assertPlainPath(destination.root, targetDir);
      try {
        await fs.mkdir(targetDir);
      } catch (error) {
        throw new ArtifactError('artifact/storage-failure', 'The artifact could not be copied.', {
          errno: errnoCode(error),
        });
      }
      let next: Manifest;
      try {
        await this.copyTree(source.root, sourceDir, destination.root, targetDir);
        next = { ...manifest, id: targetId, scope: destination.scope };
        await writeAtomic(path.join(targetDir, MANIFEST), `${JSON.stringify(next, null, 2)}\n`);
      } catch (error) {
        await fs.rm(targetDir, { recursive: true, force: true });
        if (error instanceof ArtifactError) throw error;
        throw new ArtifactError('artifact/storage-failure', 'The artifact could not be copied.', {
          errno: errnoCode(error),
        });
      }
      // The copy is complete. A failed trash leaves it in place and the source
      // untouched, so a retry adds a copy rather than losing the artifact.
      if (mode === 'move') await this.trash(source, sourceDir, id);
      return next;
    });
  }

  /**
   * Copy every stored file and directory, refusing a link or a special file.
   * The destination is a new id, so nothing there is overwritten.
   * @param sourceRoot the source scope root.
   * @param from the source directory.
   * @param targetRoot the destination scope root.
   * @param to the destination directory.
   */
  private async copyTree(sourceRoot: string, from: string, targetRoot: string, to: string): Promise<void> {
    for (const entry of await fs.readdir(from, { withFileTypes: true })) {
      const sourcePath = path.join(from, entry.name);
      const targetPath = path.join(to, entry.name);
      await assertWithin(sourceRoot, sourcePath);
      await assertWithin(targetRoot, targetPath);
      if (entry.isSymbolicLink() || (!entry.isDirectory() && !entry.isFile())) {
        throw new ArtifactError('artifact/forbidden-path', 'The artifact tree holds a link or a special file.', {
          name: entry.name,
        });
      }
      if (entry.isDirectory()) {
        await fs.mkdir(targetPath);
        await this.copyTree(sourceRoot, sourcePath, targetRoot, targetPath);
      } else {
        await writeAtomic(targetPath, await fs.readFile(sourcePath));
      }
    }
  }

  /**
   * Move an artifact into the scope's trash, then sweep trash entries past retention.
   * @param root the scope root.
   * @param id the artifact id.
   * @returns the trash location.
   */
  async remove(root: ScopeRoot, id: string): Promise<{ trashed: true; trashPath: string }> {
    const dir = await artifactDir(root, id);
    return withWriteLock(root.root, dir, async () => {
      await this.readManifest(dir);
      return { trashed: true, trashPath: await this.trash(root, dir, id) };
    });
  }

  /**
   * Move one artifact directory into the scope's trash as `<id>-<epoch ms>`.
   * @param root the scope root.
   * @param dir the artifact directory.
   * @param id the artifact id.
   * @returns the trash location.
   */
  private async trash(root: ScopeRoot, dir: string, id: string): Promise<string> {
    const trashRoot = path.join(root.root, TRASH);
    await assertWithin(root.root, trashRoot);
    await fs.mkdir(trashRoot, { recursive: true });
    const target = path.join(trashRoot, `${id}-${this.now().getTime()}`);
    await assertWithin(root.root, target);
    await fs.rename(dir, target);
    await this.sweepTrash(trashRoot);
    return target;
  }

  /**
   * Remove trash entries older than the retention window.
   * @param trashRoot the trash directory.
   */
  private async sweepTrash(trashRoot: string): Promise<void> {
    const cutoff = this.now().getTime() - this.limits.trashRetentionDays * 24 * 60 * 60 * 1000;
    for (const entry of await fs.readdir(trashRoot, { withFileTypes: true })) {
      // The trash time is in the name because a rename does not reliably touch mtime.
      const match = /-(\d{13,})$/.exec(entry.name);
      if (!entry.isDirectory() || entry.isSymbolicLink() || match === null) continue;
      const target = path.join(trashRoot, entry.name);
      if (Number(match[1]) < cutoff) await fs.rm(target, { recursive: true, force: true });
    }
  }
}