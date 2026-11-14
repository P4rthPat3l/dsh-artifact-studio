import fs from 'node:fs/promises';
import path from 'node:path';
import { isDesignInfo, scopeOfId } from '../../contract.js';
import { PAGE_CSP, composePage } from '../../render.js';
import type {
  ArtifactPayload,
  ArtifactType,
  DesignInfo,
  ExportFormat,
  ExportedFile,
  ListResult,
  Manifest,
  PreviewResult,
  ResolvedDesignSystem,
  Scope,
  VersionEntry,
  VersionSource,
} from '../../contract.js';
import { DesignRenderer, PREVIEW_MAX_SIDE } from './design-render.js';
import { clearWorkspaceDesignSystem, resolveDesignSystem, saveDesignSystem } from './design-system.js';
import { ArtifactError } from './errors.js';
import { docToHtml, writeExport } from './export.js';
import { assertWithin, withLock, writeAtomic } from './fsutil.js';
import { assertPlainFile, libraryRoot, requireWorkspace, workspaceRoot, workspaceRootExisting } from './paths.js';
import type { RootConfig, ScopeRoot } from './paths.js';
import { ArtifactStore, applyEdits, hashOf } from './store.js';
import type { ListInput, TextEdit } from './store.js';
import type { WorkspaceRegistry } from './types.js';

/** The caller's scope context: an optional workspace and an optional explicit scope. */
export interface Target {
  readonly workspaceId?: string;
  readonly scope?: Scope;
}

/** Where a cached preview lives, keyed by the source's content hash. */
interface PreviewPaths {
  dir: string;
  png: string;
  meta: string;
}

/**
 * One facade over the store, the scope roots, the design system, the design
 * renderer, and export. The route and the tools both call it, so both scopes
 * share every rule.
 */
export class ArtifactService {
  readonly store: ArtifactStore;

  private readonly config: RootConfig;

  private readonly registry: WorkspaceRegistry;

  private readonly now: () => Date;

  private readonly designs: DesignRenderer;

  /**
   * @param config root locations.
   * @param registry the workspace registry.
   * @param store the store.
   * @param now the clock.
   * @param designs the design renderer.
   */
  constructor(
    config: RootConfig,
    registry: WorkspaceRegistry,
    store = new ArtifactStore(),
    now = () => new Date(),
    designs = new DesignRenderer(),
  ) {
    this.config = config;
    this.registry = registry;
    this.store = store;
    this.now = now;
    this.designs = designs;
  }

  /**
   * Resolve a scope root. An id decides its own scope; a workspace scope needs a workspace id.
   * @param target the caller's context.
   * @param id an artifact id, when the call names one.
   * @returns the scope root.
   */
  async root(target: Target, id?: string): Promise<ScopeRoot> {
    const fromId = id === undefined ? undefined : scopeOfId(id);
    if (id !== undefined && fromId === undefined) {
      throw new ArtifactError('artifact/forbidden-path', 'The artifact id is malformed.', { id });
    }
    if (fromId !== undefined && target.scope !== undefined && fromId !== target.scope) {
      throw new ArtifactError('artifact/unknown-scope', `The id ${id ?? ''} belongs to the ${fromId} scope.`, {
        id,
        scope: target.scope,
      });
    }
    const scope = fromId ?? target.scope ?? 'workspace';
    if (scope === 'library') return libraryRoot(this.config);
    if (target.workspaceId === undefined) {
      throw new ArtifactError('artifact/no-workspace', 'A workspace artifact needs a workspace.');
    }
    return workspaceRoot(this.config, requireWorkspace(this.registry, target.workspaceId));
  }

  /**
   * The workspace root of a target, when it already exists. Reading tokens must not create one.
   * @param target the caller's context.
   * @returns the root, or undefined.
   */
  private async optionalWorkspaceRoot(target: Target): Promise<ScopeRoot | undefined> {
    if (target.workspaceId === undefined) return undefined;
    const workspace = this.registry.get(target.workspaceId);
    return workspace === undefined ? undefined : workspaceRootExisting(this.config, workspace);
  }

  /**
   * Resolve the design system for a target.
   * @param target the caller's context.
   * @returns tokens, source, and CSS.
   */
  async designSystem(target: Target): Promise<ResolvedDesignSystem> {
    return resolveDesignSystem(await this.optionalWorkspaceRoot(target), await libraryRoot(this.config));
  }

  /**
   * Save tokens at one scope.
   * @param target the caller's context; `scope` picks where the tokens go.
   * @param tokens partial or full tokens.
   * @returns the saved tokens and scope.
   */
  async saveDesignSystem(target: Target, tokens: unknown): Promise<ResolvedDesignSystem & { scope: Scope }> {
    const root = await this.root(target);
    const saved = await saveDesignSystem(root, await libraryRoot(this.config), tokens);
    const resolved = await this.designSystem(target);
    return { ...resolved, scope: saved.scope };
  }

  /**
   * Remove the workspace override.
   * @param target the caller's context with a workspace.
   * @returns the design system now in force.
   */
  async clearWorkspaceDesignSystem(target: Target): Promise<ResolvedDesignSystem> {
    await clearWorkspaceDesignSystem(await this.root({ ...target, scope: 'workspace' }));
    return this.designSystem(target);
  }

  /**
   * Create an artifact. A design is compiled before anything is written, so an
   * invalid source never creates a directory or a version.
   * @param target the caller's context.
   * @param input type, title, content, and source.
   * @returns the manifest.
   */
  async create(
    target: Target,
    input: { type: ArtifactType; title: string; content: string; source: VersionSource },
  ): Promise<Manifest> {
    const root = await this.root(target);
    const info = input.type === 'design' ? await this.designs.inspect(input.content) : undefined;
    const manifest = await this.store.create(root, input);
    if (info !== undefined) await this.writeInfo(root, manifest.id, input.content, info);
    return manifest;
  }

  /**
   * Read an artifact. A design carries its compiled summary when one can be
   * produced; a failure there never hides the source.
   * @param target the caller's context.
   * @param id the artifact id.
   * @param version an earlier version, when the caller named one.
   * @returns the payload.
   */
  async read(target: Target, id: string, version?: number): Promise<ArtifactPayload> {
    const root = await this.root(target, id);
    const result = await this.store.read(root, id, version);
    const design = await this.designSystem(target);
    const payload: ArtifactPayload = {
      ...result,
      designCss: design.css,
      design: design.tokens,
    };
    if (result.manifest.type === 'design') {
      const info = await this.infoFor(root, id, result.content);
      if (info !== undefined) payload.designInfo = info;
    }
    return payload;
  }

  /**
   * Save a new version. A design update resolves the final source first, so
   * edits are validated after they are applied and the committed content is
   * exactly what the renderer accepted.
   * @param target the caller's context.
   * @param id the artifact id.
   * @param input the update.
   * @returns the new manifest.
   */
  async update(
    target: Target,
    id: string,
    input: { baseVersion: number; content?: string; edits?: readonly TextEdit[]; title?: string; source: VersionSource },
  ): Promise<Manifest> {
    const root = await this.root(target, id);
    const current = await this.store.manifest(root, id);
    if (current.type !== 'design') return this.store.update(root, id, input);
    const existing = await this.store.read(root, id);
    let next = input.content;
    if (next === undefined && input.edits !== undefined) next = applyEdits(existing.content, input.edits);
    if (next === undefined) return this.store.update(root, id, input);
    const info = await this.designs.inspect(next);
    const manifest = await this.store.update(root, id, { ...input, content: next, edits: undefined });
    await this.writeInfo(root, id, next, info);
    return manifest;
  }

  /**
   * Restore an earlier version.
   * @param target the caller's context.
   * @param id the artifact id.
   * @param version the version to restore.
   * @param source who restored it.
   * @param baseVersion the version the caller saw, if it checks.
   * @returns the new manifest.
   */
  async restore(target: Target, id: string, version: number, source: VersionSource, baseVersion?: number): Promise<Manifest> {
    return this.store.restore(await this.root(target, id), id, version, source, baseVersion);
  }

  async history(target: Target, id: string): Promise<VersionEntry[]> {
    return this.store.history(await this.root(target, id), id);
  }

  async list(target: Target, input: ListInput): Promise<ListResult> {
    return this.store.list(await this.root(target), input);
  }

  async remove(target: Target, id: string): Promise<{ trashed: true; trashPath: string }> {
    return this.store.remove(await this.root(target, id), id);
  }

  /**
   * A print copy of the selected saved page or document.
   * @param target the caller's context.
   * @param id the artifact id.
   * @returns printable HTML.
   */
  async printable(target: Target, id: string, version?: number): Promise<{ html: string }> {
    const { manifest, content } = await this.store.read(await this.root(target, id), id, version);
    if (manifest.type === 'design') {
      throw new ArtifactError('artifact/unsupported-format', 'A design cannot be printed.', { type: manifest.type });
    }
    const design = await this.designSystem(target);
    return { html: manifest.type === 'page'
      ? composePage(content, design.css, PAGE_CSP, manifest.title)
      : docToHtml(manifest.title, content, design.css, true) };
  }

  /**
   * Export a saved version. A design is rendered from its source at that
   * version; the preview cache is never used as the export source.
   * @param target the caller's context.
   * @param id the artifact id.
   * @param format the format.
   * @param version the version, when the caller named one.
   * @returns the exported file.
   */
  async export(target: Target, id: string, format: ExportFormat, version?: number): Promise<ExportedFile> {
    const root = await this.root(target, id);
    const { manifest, content, version: readVersion } = await this.store.read(root, id, version);
    const design = await this.designSystem(target);
    return writeExport(root, { ...manifest, version: readVersion }, content, format, design, this.now(), this.designs);
  }

  /**
   * Render a design, or return its cached preview for the same source.
   * @param target the caller's context.
   * @param id the artifact id.
   * @param version the version, when the caller named one.
   * @returns the preview.
   */
  async preview(target: Target, id: string, version?: number): Promise<PreviewResult> {
    const root = await this.root(target, id);
    const { manifest, content } = await this.store.read(root, id, version);
    if (manifest.type !== 'design') {
      throw new ArtifactError('artifact/unsupported-type', 'Only a design has a rendered preview.', { type: manifest.type });
    }
    const cached = await this.readPreview(root, id, content);
    if (cached !== undefined) return cached;
    const rendered = await this.designs.preview(content, PREVIEW_MAX_SIDE);
    await this.writePreview(root, id, content, rendered.info, rendered.width, rendered.height, rendered.bytes);
    return {
      mediaType: 'image/png',
      data: rendered.bytes.toString('base64'),
      width: rendered.width,
      height: rendered.height,
      info: rendered.info,
    };
  }

  /**
   * The cache location of a source's preview.
   * @param root the scope root.
   * @param id the artifact id.
   * @param content the design source.
   * @returns the paths.
   */
  private previewPaths(root: ScopeRoot, id: string, content: string): PreviewPaths {
    const dir = path.join(root.root, id, 'preview');
    const key = hashOf(content).slice('sha256:'.length);
    return { dir, png: path.join(dir, `${key}.png`), meta: path.join(dir, `${key}.json`) };
  }

  /**
   * Read a cached preview, when both files are plain and agree on the size.
   * @param root the scope root.
   * @param id the artifact id.
   * @param content the design source.
   * @returns the preview, or undefined.
   */
  private async readPreview(root: ScopeRoot, id: string, content: string): Promise<PreviewResult | undefined> {
    try {
      const paths = this.previewPaths(root, id, content);
      await assertWithin(root.root, paths.dir);
      if (!(await assertPlainFile(paths.png)) || !(await assertPlainFile(paths.meta))) return undefined;
      const parsed: unknown = JSON.parse(await fs.readFile(paths.meta, 'utf8'));
      if (parsed === null || typeof parsed !== 'object') return undefined;
      const fields: Record<string, unknown> = { ...parsed };
      if (!isDesignInfo(fields.info) || typeof fields.width !== 'number' || typeof fields.height !== 'number') return undefined;
      const bytes = await fs.readFile(paths.png);
      return {
        mediaType: 'image/png',
        data: bytes.toString('base64'),
        width: fields.width,
        height: fields.height,
        info: fields.info,
      };
    } catch {
      return undefined;
    }
  }

  /**
   * The summary of a design, from the cache or a compile.
   * @param root the scope root.
   * @param id the artifact id.
   * @param content the design source.
   * @returns the summary, or undefined when the renderer is unavailable.
   */
  private async infoFor(root: ScopeRoot, id: string, content: string): Promise<DesignInfo | undefined> {
    const cached = await this.readCachedInfo(root, id, content);
    if (cached !== undefined) return cached;
    try {
      const info = await this.designs.inspect(content);
      await this.writeInfo(root, id, content, info);
      return info;
    } catch (error) {
      console.warn('[dsh-artifact-studio] design summary failed', id, error instanceof Error ? error.message : error);
      return undefined;
    }
  }

  /**
   * Read a cached summary.
   * @param root the scope root.
   * @param id the artifact id.
   * @param content the design source.
   * @returns the summary, or undefined.
   */
  private async readCachedInfo(root: ScopeRoot, id: string, content: string): Promise<DesignInfo | undefined> {
    try {
      const paths = this.previewPaths(root, id, content);
      await assertWithin(root.root, paths.dir);
      if (!(await assertPlainFile(paths.meta))) return undefined;
      const parsed: unknown = JSON.parse(await fs.readFile(paths.meta, 'utf8'));
      if (parsed === null || typeof parsed !== 'object') return undefined;
      const fields: Record<string, unknown> = { ...parsed };
      return isDesignInfo(fields.info) ? fields.info : undefined;
    } catch {
      return undefined;
    }
  }

  /**
   * Cache a summary for a source hash.
   * @param root the scope root.
   * @param id the artifact id.
   * @param content the design source.
   * @param info the summary.
   */
  private async writeInfo(root: ScopeRoot, id: string, content: string, info: DesignInfo): Promise<void> {
    try {
      const paths = this.previewPaths(root, id, content);
      await assertWithin(root.root, paths.dir);
      await withLock(paths.dir, async () => {
        await fs.mkdir(paths.dir, { recursive: true });
        await assertWithin(root.root, paths.meta);
        await writeAtomic(paths.meta, `${JSON.stringify({ info }, null, 2)}\n`);
        await this.prunePreview(paths.dir, path.basename(paths.png));
      });
    } catch (error) {
      // The artifact is saved; a cache failure only costs the next reader a compile.
      console.warn('[dsh-artifact-studio] design cache failed', id, error instanceof Error ? error.message : error);
    }
  }

  /**
   * Cache a rendered preview.
   * @param root the scope root.
   * @param id the artifact id.
   * @param content the design source.
   * @param info the summary.
   * @param width the image width.
   * @param height the image height.
   * @param bytes the PNG bytes.
   */
  private async writePreview(
    root: ScopeRoot,
    id: string,
    content: string,
    info: DesignInfo,
    width: number,
    height: number,
    bytes: Buffer,
  ): Promise<void> {
    try {
      const paths = this.previewPaths(root, id, content);
      await assertWithin(root.root, paths.dir);
      await withLock(paths.dir, async () => {
        await fs.mkdir(paths.dir, { recursive: true });
        await assertWithin(root.root, paths.png);
        await writeAtomic(paths.png, bytes);
        await assertWithin(root.root, paths.meta);
        await writeAtomic(paths.meta, `${JSON.stringify({ info, width, height }, null, 2)}\n`);
        await this.prunePreview(paths.dir, path.basename(paths.png));
      });
    } catch (error) {
      console.warn('[dsh-artifact-studio] design preview cache failed', id, error instanceof Error ? error.message : error);
    }
  }

  /**
   * Drop cache files that do not belong to the current source hash.
   * @param dir the preview directory.
   * @param keep the file name to keep.
   */
  private async prunePreview(dir: string, keep: string): Promise<void> {
    const prefix = keep.replace(/\.png$/, '');
    for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
      if (!entry.isFile() || entry.isSymbolicLink()) continue;
      if (entry.name.startsWith(prefix)) continue;
      await fs.rm(path.join(dir, entry.name), { force: true });
    }
  }
}
