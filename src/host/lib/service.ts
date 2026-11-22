import fs from 'node:fs/promises';
import path from 'node:path';
import { isDesignInfo, scopeOfId, tokensToCss } from '../../contract.js';
import { PAGE_CSP, composePage } from '../../render.js';
import type {
  ArtifactPayload,
  DesignSelection,
  DesignSaveOptions,
  DesignCatalog,
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
import { clearWorkspaceDesignSystem, saveDesignSystem } from './design-system.js';
import { resolveSystem, saveSystem, listSystems, setSystemDefault } from './design-catalog.js';
import { generationHash, generationSummary } from './generation.js';
import type { Generation } from './generation.js';
import { declaredKit, getKit } from '../../kit.js';
import { composeBrief, composeSheetBrief } from './brief.js';
import { ArtifactError } from './errors.js';
import { docToHtml, sheetToPrintableHtml, writeExport } from './export.js';
import { findRecipe, readGuide, saveGuide } from './guide.js';
import type { Guide, GuideLayers, GuidePatch } from './guide.js';
import type { ResolvedRecipe } from './recipes.js';
import { assertWithin, withLock, writeAtomic } from './fsutil.js';
import { assertPlainFile, libraryRoot, requireWorkspace, workspaceRoot, workspaceRootExisting } from './paths.js';
import type { RootConfig, ScopeRoot } from './paths.js';
import { ArtifactStore, applyEdits, hashOf } from './store.js';
import { parseSheetWorkbook, serializeSheetWorkbook } from '../../sheet/index.js';
import type { ListInput, ReadResult, TextEdit } from './store.js';
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
 * Validate and canonicalise sheet content. A malformed workbook never reaches
 * the store, and an accepted one always has stable ordering and formatting.
 * @param content the JSON source.
 * @returns the canonical JSON.
 */
function canonicalSheet(content: string): string {
  try {
    return serializeSheetWorkbook(parseSheetWorkbook(content));
  } catch (error) {
    throw new ArtifactError('artifact/invalid-sheet', 'The sheet content is not a valid workbook.', {
      message: error instanceof Error ? error.message : String(error),
    });
  }
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
    if (target.scope === 'library' || target.workspaceId === undefined) return undefined;
    return workspaceRootExisting(this.config, requireWorkspace(this.registry, target.workspaceId));
  }

  /**
   * Resolve the design system for a target.
   * @param target the caller's context.
   * @returns tokens, source, and CSS.
   */
  async designSystem(target: Target, selection: DesignSelection = {}): Promise<ResolvedDesignSystem> {
    return resolveSystem(await this.optionalWorkspaceRoot(target), await libraryRoot(this.config), selection);
  }

  async listDesignSystems(target: Target): Promise<DesignCatalog> {
    return listSystems(await this.root(target));
  }

  async setDesignDefault(target: Target, systemId: string | null, expectedRevision: number): Promise<ResolvedDesignSystem> {
    await setSystemDefault(await this.root(target), systemId, expectedRevision);
    return this.designSystem(target);
  }

  /**
   * Save tokens at one scope.
   * @param target the caller's context; `scope` picks where the tokens go.
   * @param tokens partial or full tokens.
   * @returns the saved tokens and scope.
   */
  async saveDesignSystem(target: Target, tokens: unknown, options?: DesignSaveOptions): Promise<ResolvedDesignSystem & { scope: Scope }> {
    const root = await this.root(target);
    const base = await this.designSystem(target);
    if (options !== undefined) return { ...await saveSystem(root, base.tokens, tokens, options), scope: root.scope };
    const catalog = await listSystems(root);
    if (catalog.defaultId !== null) {
      throw new ArtifactError('artifact/stale-catalog', 'A named default is selected. Read the catalog and supply systemId and expectedRevision.');
    }
    const saved = await saveDesignSystem(root, await libraryRoot(this.config), tokens);
    return { ...await this.designSystem(target), scope: saved.scope };
  }

  /**
   * Remove the workspace override.
   * @param target the caller's context with a workspace.
   * @returns the design system now in force.
   */
  async clearWorkspaceDesignSystem(target: Target): Promise<ResolvedDesignSystem> {
    const root = await this.root({ ...target, scope: 'workspace' });
    const catalog = await listSystems(root);
    if (catalog.defaultId !== null) await setSystemDefault(root, null, catalog.revision);
    await clearWorkspaceDesignSystem(root);
    return this.designSystem(target);
  }

  /**
   * The guides in force for a target. Reading never creates a workspace store.
   * @param target the caller's context.
   * @returns the workspace and library guides.
   */
  async guides(target: Target): Promise<GuideLayers> {
    return {
      workspace: await readGuide(await this.optionalWorkspaceRoot(target)),
      library: await readGuide(await libraryRoot(this.config)),
    };
  }

  /**
   * Change one scope's guide.
   * @param target the caller's context; `scope` picks the guide.
   * @param patch the change.
   * @returns the saved guide and its scope.
   */
  async saveGuide(target: Target, patch: GuidePatch): Promise<{ scope: Scope; guide: Guide }> {
    const root = await this.root(target);
    return { scope: root.scope, guide: await saveGuide(root, patch) };
  }

  /**
   * Resolve a recipe id for an artifact type, or refuse it.
   * @param target the caller's context.
   * @param id the recipe id.
   * @param type the artifact type.
   * @returns the recipe.
   */
  async recipe(target: Target, id: string, type: ArtifactType): Promise<ResolvedRecipe> {
    const recipe = findRecipe(await this.guides(target), id);
    if (recipe === undefined) {
      throw new ArtifactError('artifact/unknown-recipe', `No recipe "${id}". Call artifact_brief without a recipe to list them.`, { recipe: id });
    }
    if (!recipe.types.includes(type)) {
      throw new ArtifactError('artifact/unknown-recipe', `The ${id} recipe is for ${recipe.types.join(', ')}, not ${type}.`, { recipe: id, type });
    }
    return recipe;
  }

  /**
   * The recipe a stored artifact follows, when it names one that still resolves.
   * @param target the caller's context.
   * @param manifest the artifact.
   * @returns the recipe, or undefined.
   */
  async recipeOf(target: Target, manifest: Manifest): Promise<ResolvedRecipe | undefined> {
    if (manifest.generation !== undefined) {
      const pinned = (await this.store.read(await this.root(target, manifest.id), manifest.id, manifest.version)).generation?.recipe;
      return pinned ? { ...pinned, source: manifest.scope } : undefined;
    }
    if (manifest.recipe === undefined) return undefined;
    const recipe = findRecipe(await this.guides({ ...target, scope: manifest.scope }), manifest.recipe);
    return recipe !== undefined && recipe.types.includes(manifest.type) ? recipe : undefined;
  }

  /**
   * Assemble the brief for a new artifact.
   * @param target the caller's context.
   * @param type the artifact type.
   * @param recipeId the recipe, when the caller chose one.
   * @returns the brief and the recipe it used.
   */
  async brief(target: Target, type: ArtifactType, recipeId?: string, selection: DesignSelection = {}): Promise<{ brief: string; recipe?: ResolvedRecipe }> {
    const layers = await this.guides(target);
    if (type === 'sheet') {
      if (recipeId !== undefined) {
        throw new ArtifactError('artifact/unknown-recipe', 'Sheets do not use recipes.', { recipe: recipeId, type });
      }
      return { brief: composeSheetBrief(layers) };
    }
    const recipe = recipeId === undefined ? undefined : findRecipe(layers, recipeId);
    if (recipeId !== undefined && (recipe === undefined || !recipe.types.includes(type))) {
      throw new ArtifactError('artifact/unknown-recipe', 'No compatible recipe for this artifact type.', { recipe: recipeId, type });
    }
    const design = await this.designSystem(target, selection);
    const root = target.scope === 'library' ? await libraryRoot(this.config) : await this.optionalWorkspaceRoot(target);
    const siblings = recipe === undefined || root === undefined
      ? []
      : (await this.store.list(root, { type, recipe: recipe.id, limit: 3 })).items;
    const brief = composeBrief({ type, recipe, layers, tokens: design.tokens, tokenSource: design.source, siblings });
    return recipe === undefined ? { brief } : { brief, recipe };
  }

  private async freeze(target: Target, type: ArtifactType, content: string, recipeId?: string, selection: DesignSelection = {}): Promise<Generation> {
    const design = await this.designSystem(target, selection);
    const recipe = recipeId === undefined ? null : await this.recipe(target, recipeId, type);
    const kit = type === 'page' ? declaredKit(content) ?? null : null;
    if (kit !== null && !getKit(kit)) throw new ArtifactError('artifact/unsupported-kit', 'The selected kit release is not installed.');
    return { schemaVersion: 1, tokens: design.tokens, system: design.system ?? null, tokenSource: design.source,
      recipe, kit, conventionsHash: generationHash(JSON.stringify(await this.guides(target))) };
  }

  private async versionDesign(target: Target, result: ReadResult): Promise<ResolvedDesignSystem> {
    const generation = result.generation;
    if (!generation) return this.designSystem({ ...target, scope: result.manifest.scope });
    if (generation.kit !== null && !getKit(generation.kit)) throw new ArtifactError('artifact/unsupported-kit', 'The saved kit release is not installed.');
    return { tokens: generation.tokens, css: tokensToCss(generation.tokens), source: generation.tokenSource,
      ...(generation.system ? { system: generation.system } : {}) };
  }

  async rebase(target: Target, id: string, input: { baseVersion: number; source: VersionSource; recipe?: string; design?: DesignSelection }): Promise<Manifest> {
    const root = await this.root(target, id);
    const current = await this.store.read(root, id);
    if (current.manifest.type === 'design') throw new ArtifactError('artifact/unsupported-type', 'Mockup source must be restyled explicitly.');
    if (current.manifest.type === 'sheet') throw new ArtifactError('artifact/unsupported-type', 'A sheet has no design or recipe to rebase.', { type: current.manifest.type });
    const recipe = input.recipe ?? current.manifest.recipe;
    const generation = input.recipe === undefined && input.design === undefined
      ? await this.freeze({ ...target, scope: root.scope }, current.manifest.type, current.content, recipe)
      :
      input.design
      ? await this.freeze({ ...target, scope: root.scope }, current.manifest.type, current.content, recipe, input.design)
      : (current.generation ?? await this.freeze({ ...target, scope: root.scope }, current.manifest.type, current.content, recipe));

    if (input.recipe !== undefined && generation.recipe?.id !== input.recipe) {
      generation.recipe = await this.recipe({ ...target, scope: root.scope }, input.recipe, current.manifest.type);
    }
    return this.store.update(root, id, { baseVersion: input.baseVersion, recipe, generation, source: { ...input.source, action: 'rebase' } });
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
    input: { type: ArtifactType; title: string; content: string; source: VersionSource; recipe?: string; design?: DesignSelection },
  ): Promise<Manifest> {
    if (input.type === 'sheet' && input.recipe !== undefined) {
      throw new ArtifactError('artifact/bad-request', 'Sheets do not use recipes.', { recipe: input.recipe, type: input.type });
    }
    if (input.recipe !== undefined) await this.recipe(target, input.recipe, input.type);
    const root = await this.root(target);
    const content = input.type === 'sheet' ? canonicalSheet(input.content) : input.content;
    const info = input.type === 'design' ? await this.designs.inspect(content) : undefined;
    const generation = input.type === 'design' || input.type === 'sheet'
      ? undefined
      : await this.freeze({ ...target, scope: root.scope }, input.type, content, input.recipe, input.design);
    const manifest = await this.store.create(root, { ...input, content, generation });
    if (info !== undefined) await this.writeInfo(root, manifest.id, content, info);
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
    const design = await this.versionDesign(target, result);
    const payload: ArtifactPayload = {
      manifest: result.manifest, content: result.content, version: result.version,
      ...(result.generation ? { generation: generationSummary(result.generation) } : {}),
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
    input: { baseVersion: number; content?: string; edits?: readonly TextEdit[]; title?: string; recipe?: string; source: VersionSource },
  ): Promise<Manifest> {
    const root = await this.root(target, id);
    const current = await this.store.manifest(root, id);
    const existing = await this.store.read(root, id);
    if (current.type === 'sheet') {
      if (input.recipe !== undefined) {
        throw new ArtifactError('artifact/bad-request', 'Sheets do not use recipes.', { type: current.type });
      }
      if (input.content !== undefined && input.edits !== undefined) {
        throw new ArtifactError('artifact/bad-request', 'Send either content or edits, not both.');
      }
      let next = input.content;
      if (next === undefined && input.edits !== undefined) next = applyEdits(existing.content, input.edits);
      if (next !== undefined) next = canonicalSheet(next);
      return this.store.update(root, id, { ...input, content: next, edits: undefined });
    }
    if (current.type !== 'design') {
      let generation = existing.generation ?? await this.freeze({ ...target, scope: root.scope }, current.type, existing.content, input.recipe ?? current.recipe);
      if (input.recipe !== undefined && input.recipe !== generation.recipe?.id) {
        generation = { ...generation, recipe: await this.recipe({ ...target, scope: root.scope }, input.recipe, current.type) };
      }
      return this.store.update(root, id, { ...input, generation });
    }
    if (input.recipe !== undefined) await this.recipe({ ...target, scope: root.scope }, input.recipe, current.type);
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
    const root = await this.root(target, id);
    const old = await this.store.read(root, id, version);
    const generation = old.manifest.type === 'design' || old.manifest.type === 'sheet' || old.generation ? undefined
      : await this.freeze({ ...target, scope: root.scope }, old.manifest.type, old.content, old.manifest.recipe);
    return this.store.restore(root, id, version, source, baseVersion, generation);
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
    const result = await this.store.read(await this.root(target, id), id, version);
    const { manifest, content } = result;
    if (manifest.type === 'design') {
      throw new ArtifactError('artifact/unsupported-format', 'A design cannot be printed.', { type: manifest.type });
    }
    const design = await this.versionDesign(target, result);
    if (manifest.type === 'sheet') {
      let workbook;
      try {
        workbook = parseSheetWorkbook(content);
      } catch {
        throw new ArtifactError('artifact/corrupt', 'The saved sheet content cannot be read.', { id: manifest.id });
      }
      return { html: sheetToPrintableHtml(workbook, design.css, manifest.title) };
    }
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
    const result = await this.store.read(root, id, version);
    const { manifest, content, version: readVersion } = result;
    const design = await this.versionDesign(target, result);
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
