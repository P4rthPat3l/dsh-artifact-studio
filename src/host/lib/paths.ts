import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { ID_PATTERN, scopeOfId } from '../../contract.js';
import type { Scope } from '../../contract.js';
import { ArtifactError, errnoCode } from './errors.js';
import { assertWithin } from './fsutil.js';
import type { WorkspaceRecord, WorkspaceRegistry } from './types.js';

/** Root locations: the per-workspace store parent and the library, both under the Harness home. */
export interface RootConfig {
  readonly workspaceBase: string;
  readonly libraryDir: string;
  readonly home: string;
}

/** One workspace id is one directory name: no separators, no traversal, no hidden name. */
const WORKSPACE_KEY = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

/** A scope root that exists on disk, canonicalised. */
export interface ScopeRoot {
  readonly scope: Scope;
  readonly root: string;
  readonly workspaceId?: string;
}

/**
 * The Harness home: an explicit value, then `$DSH_HOME`, then `~/.dsh`.
 * @param explicit a configured home, if any.
 * @returns the absolute home path.
 */
export function resolveHome(explicit?: string): string {
  if (explicit !== undefined && explicit !== '') return path.resolve(explicit);
  const fromEnv = process.env.DSH_HOME;
  if (fromEnv !== undefined && fromEnv !== '') return path.resolve(fromEnv);
  return path.join(os.homedir(), '.dsh');
}

/**
 * Create a root directory if needed and return its canonical path.
 *
 * A root is only accepted when `realpath` returns the path it was asked for. A
 * link anywhere in the chain changes the canonical path and is refused, so no
 * scope can be redirected to another directory. The existing part of the chain
 * is checked before the recursive create, so a link is refused before anything
 * is written through it.
 * @param root the configured root.
 * @param mode the directory mode for a new root.
 * @returns the canonical root.
 */
async function ensureRoot(root: string, mode?: number): Promise<string> {
  const wanted = path.resolve(root);
  await assertWithin(wanted, wanted);
  await assertNoLinkChain(wanted);
  await fs.mkdir(wanted, { recursive: true, ...(mode === undefined ? {} : { mode }) });
  const canonical = await fs.realpath(wanted);
  if (canonical !== wanted) {
    throw new ArtifactError('artifact/forbidden-path', 'The artifact root resolves through a link.', {
      root: wanted,
      canonical,
    });
  }
  const stat = await fs.lstat(canonical);
  if (!stat.isDirectory()) {
    throw new ArtifactError('artifact/forbidden-path', 'The artifact root is not a directory.', { root: canonical });
  }
  return canonical;
}

/**
 * The library root under the Harness home, created with owner-only access.
 * @param config the root config.
 * @returns the library scope root.
 */
export async function libraryRoot(config: RootConfig): Promise<ScopeRoot> {
  try {
    return { scope: 'library', root: await ensureRoot(path.join(config.home, config.libraryDir), 0o700) };
  } catch (error) {
    if (error instanceof ArtifactError) throw error;
    throw new ArtifactError('artifact/library-unavailable', 'The artifact library cannot be created.', {
      errno: errnoCode(error),
    });
  }
}

/**
 * Refuse a link in the part of a root's chain that already exists, before the
 * recursive create can write through it.
 * @param target the configured root.
 */
async function assertNoLinkChain(target: string): Promise<void> {
  let current = path.resolve(target);
  const chain: string[] = [];
  for (;;) {
    chain.unshift(current);
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  for (const dir of chain) {
    let stat;
    try {
      stat = await fs.lstat(dir);
    } catch (error) {
      if (errnoCode(error) === 'ENOENT') return;
      throw error;
    }
    if (stat.isSymbolicLink()) {
      throw new ArtifactError('artifact/forbidden-path', 'The artifact root resolves through a link.', {
        root: path.resolve(target),
        link: dir,
      });
    }
  }
}

/**
 * Turn a workspace id into its store directory name. The id is the key, so it
 * must survive a project rename and cannot name a path.
 * @param workspaceId the registered workspace id.
 * @returns the directory name.
 */
function workspaceKey(workspaceId: string): string {
  if (!WORKSPACE_KEY.test(workspaceId)) {
    throw new ArtifactError('artifact/forbidden-path', 'The workspace id cannot name an artifact directory.', {
      workspaceId,
    });
  }
  return workspaceId;
}

/**
 * The store for one registered workspace, under the Harness home. The
 * directory is keyed by the workspace id, not by its path, so a moved project
 * keeps its artifacts and two workspaces never share a store.
 * @param config the root config.
 * @param workspace the workspace record.
 * @returns the workspace scope root.
 */
export async function workspaceRoot(config: RootConfig, workspace: WorkspaceRecord): Promise<ScopeRoot> {
  return {
    scope: 'workspace',
    workspaceId: workspace.id,
    root: await ensureRoot(path.join(config.home, config.workspaceBase, workspaceKey(workspace.id)), 0o700),
  };
}

/**
 * The workspace root only when it already exists, without creating anything.
 * Reading the design system must not leave an empty store behind.
 * @param config the root config.
 * @param workspace the workspace record.
 * @returns the root, or undefined when the workspace has no store yet.
 */
export async function workspaceRootExisting(
  config: RootConfig,
  workspace: WorkspaceRecord,
): Promise<ScopeRoot | undefined> {
  const wanted = path.resolve(path.join(config.home, config.workspaceBase, workspaceKey(workspace.id)));
  try {
    const canonical = await fs.realpath(wanted);
    if (canonical !== wanted) return undefined;
    return { scope: 'workspace', workspaceId: workspace.id, root: canonical };
  } catch (error) {
    if (errnoCode(error) === 'ENOENT') return undefined;
    throw error;
  }
}

/**
 * Find a registered workspace by id.
 * @param registry the workspace registry.
 * @param workspaceId the id.
 * @returns the record.
 */
export function requireWorkspace(registry: WorkspaceRegistry, workspaceId: string): WorkspaceRecord {
  const workspace = registry.get(workspaceId);
  if (workspace === undefined) {
    throw new ArtifactError('artifact/no-workspace', 'That workspace is not registered.', { workspaceId });
  }
  return workspace;
}

/**
 * Find the workspace a session belongs to: the one listing the session, else
 * the deepest workspace that contains its working directory.
 * @param registry the workspace registry.
 * @param sessionId the session id, when known.
 * @param cwd the session working directory.
 * @returns the workspace record.
 */
export function workspaceForSession(
  registry: WorkspaceRegistry,
  sessionId: string | undefined,
  cwd: string,
): WorkspaceRecord {
  const all = registry.list();
  const listed = sessionId === undefined ? undefined : all.find((item) => item.sessionIds?.includes(sessionId));
  if (listed !== undefined) return listed;
  const candidates = all
    .filter((item) => cwd === item.path || cwd.startsWith(item.path.endsWith(path.sep) ? item.path : item.path + path.sep))
    .sort((a, b) => b.path.length - a.path.length);
  const found = candidates[0];
  if (found === undefined) {
    throw new ArtifactError('artifact/no-workspace', 'This session has no registered workspace.', { cwd });
  }
  return found;
}

/**
 * Validate an id against a scope root and return its directory. The id pattern
 * already excludes separators and dots; the lstat check refuses a planted link.
 * @param scope the scope root.
 * @param id the artifact id.
 * @returns the artifact directory.
 */
export async function artifactDir(scope: ScopeRoot, id: string): Promise<string> {
  if (!ID_PATTERN.test(id)) {
    throw new ArtifactError('artifact/forbidden-path', 'The artifact id is malformed.', { id });
  }
  if (scopeOfId(id) !== scope.scope) {
    throw new ArtifactError('artifact/unknown-scope', `The id ${id} does not belong to the ${scope.scope} scope.`, {
      id,
      scope: scope.scope,
    });
  }
  const dir = path.join(scope.root, id);
  let stat;
  try {
    stat = await fs.lstat(dir);
  } catch (error) {
    if (errnoCode(error) === 'ENOENT') throw new ArtifactError('artifact/not-found', `No artifact ${id}.`, { id });
    throw error;
  }
  if (stat.isSymbolicLink() || !stat.isDirectory()) {
    throw new ArtifactError('artifact/forbidden-path', 'The artifact directory is not a plain directory.', { id });
  }
  return dir;
}

/**
 * Refuse a file inside an artifact that is a symlink, so reads and writes never
 * follow a link out of a directory.
 * @param file the file path.
 * @returns whether the file exists.
 */
export async function assertPlainFile(file: string): Promise<boolean> {
  let stat;
  try {
    stat = await fs.lstat(file);
  } catch (error) {
    if (errnoCode(error) === 'ENOENT') return false;
    throw error;
  }
  if (stat.isSymbolicLink() || !stat.isFile()) {
    throw new ArtifactError('artifact/forbidden-path', 'An artifact file is not a plain file.', {
      file: path.basename(file),
    });
  }
  return true;
}
