import { scopeOfId } from '../../contract.js';
import type {
  ArtifactPayload,
  ArtifactType,
  ExportFormat,
  ExportedFile,
  ListResult,
  Manifest,
  ResolvedDesignSystem,
  Scope,
  VersionEntry,
  VersionSource,
} from '../../contract.js';
import { clearWorkspaceDesignSystem, resolveDesignSystem, saveDesignSystem } from './design-system.js';
import { ArtifactError } from './errors.js';
import { docToHtml, writeExport } from './export.js';
import { libraryRoot, requireWorkspace, workspaceRoot, workspaceRootExisting } from './paths.js';
import type { RootConfig, ScopeRoot } from './paths.js';
import { ArtifactStore } from './store.js';
import type { ListInput, TextEdit } from './store.js';
import type { WorkspaceRegistry } from './types.js';

/** The caller's scope context: an optional workspace and an optional explicit scope. */
export interface Target {
  readonly workspaceId?: string;
  readonly scope?: Scope;
}

/**
 * One facade over the store, the scope roots, the design system, and export.
 * The route and the tools both call it, so both scopes share every rule.
 */
export class ArtifactService {
  readonly store: ArtifactStore;

  private readonly config: RootConfig;

  private readonly registry: WorkspaceRegistry;

  private readonly now: () => Date;

  /**
   * @param config root locations.
   * @param registry the workspace registry.
   * @param store the store.
   * @param now the clock.
   */
  constructor(config: RootConfig, registry: WorkspaceRegistry, store = new ArtifactStore(), now = () => new Date()) {
    this.config = config;
    this.registry = registry;
    this.store = store;
    this.now = now;
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

  async create(
    target: Target,
    input: { type: ArtifactType; title: string; content: string; source: VersionSource },
  ): Promise<Manifest> {
    return this.store.create(await this.root(target), input);
  }

  async read(target: Target, id: string, version?: number): Promise<ArtifactPayload> {
    const result = await this.store.read(await this.root(target, id), id, version);
    const design = await this.designSystem(target);
    return { ...result, designCss: design.css };
  }

  async update(
    target: Target,
    id: string,
    input: { baseVersion: number; content?: string; edits?: readonly TextEdit[]; title?: string; source: VersionSource },
  ): Promise<Manifest> {
    return this.store.update(await this.root(target, id), id, input);
  }

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
   * The browser print copy of a document. Pages print from their own preview.
   * @param target the caller's context.
   * @param id the artifact id.
   * @returns printable HTML.
   */
  async printable(target: Target, id: string): Promise<{ html: string }> {
    const { manifest, content } = await this.store.read(await this.root(target, id), id);
    if (manifest.type !== 'doc') {
      throw new ArtifactError('artifact/unsupported-format', 'Only documents have a print copy; print a page from its preview.');
    }
    const design = await this.designSystem(target);
    return { html: docToHtml(manifest.title, content, design.css, true) };
  }

  async export(target: Target, id: string, format: ExportFormat): Promise<ExportedFile> {
    const root = await this.root(target, id);
    const { manifest, content } = await this.store.read(root, id);
    const design = await this.designSystem(target);
    return writeExport(root, manifest, content, format, design, this.now());
  }
}
