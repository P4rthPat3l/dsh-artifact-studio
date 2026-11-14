import { isManifest, isVersionSource } from '../contract.js';
import type {
  ArtifactPayload,
  ArtifactType,
  DesignTokens,
  ExportFormat,
  ExportedFile,
  ListResult,
  Manifest,
  ResolvedDesignSystem,
  Scope,
  VersionEntry,
} from '../contract.js';
import type { ConnectionService } from './harness.js';

const ROUTE = '/artifacts-rpc';

/** A failed route call, carrying the host's stable code. */
export class ArtifactCallError extends Error {
  readonly code: string;

  readonly details: Record<string, unknown>;

  constructor(code: string, message: string, details: Record<string, unknown>) {
    super(message);
    this.name = 'ArtifactCallError';
    this.code = code;
    this.details = details;
  }
}

let connection: ConnectionService | null = null;

/**
 * Bind the connection used for route calls.
 * @param value the connection service.
 */
export function configureConnection(value: ConnectionService): void {
  connection = value;
}

/**
 * Call one endpoint and narrow its value.
 * @param endpoint the endpoint.
 * @param payload the request.
 * @param narrow a check on the response value.
 * @param signal cancellation.
 * @returns the value.
 */
async function call<T>(
  endpoint: string,
  payload: Record<string, unknown>,
  narrow: (value: unknown) => value is T,
  signal?: AbortSignal,
): Promise<T> {
  if (connection === null) throw new ArtifactCallError('artifact/not-ready', 'The artifact channel is not ready.', {});
  const outcome = await connection.rpc.call(ROUTE, endpoint, payload, signal);
  if (!outcome.ok) throw new ArtifactCallError(outcome.error.code, outcome.error.message, outcome.error.details);
  if (!narrow(outcome.value)) {
    throw new ArtifactCallError('artifact/bad-response', `The ${endpoint} response has an unexpected shape.`, {});
  }
  return outcome.value;
}

/**
 * Whether a value is a plain object.
 * @param value the value.
 * @returns whether it is an object.
 */
function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isList(value: unknown): value is ListResult {
  return (
    isObject(value) &&
    Array.isArray(value.items) &&
    value.items.every(isManifest) &&
    typeof value.total === 'number' &&
    typeof value.hasMore === 'boolean'
  );
}

function isPayload(value: unknown): value is ArtifactPayload {
  return (
    isObject(value) &&
    isManifest(value.manifest) &&
    typeof value.content === 'string' &&
    typeof value.version === 'number' &&
    typeof value.designCss === 'string' &&
    isTokens(value.design)
  );
}

function hasManifest(value: unknown): value is { manifest: Manifest } {
  return isObject(value) && isManifest(value.manifest);
}

function isVersionEntry(value: unknown): value is VersionEntry {
  return (
    isObject(value) &&
    typeof value.version === 'number' &&
    typeof value.createdAt === 'string' &&
    typeof value.contentHash === 'string' &&
    typeof value.contentBytes === 'number' &&
    isVersionSource(value.source)
  );
}

function isHistory(value: unknown): value is { versions: VersionEntry[] } {
  return isObject(value) && Array.isArray(value.versions) && value.versions.every(isVersionEntry);
}

function isTrashed(value: unknown): value is { trashed: true; trashPath: string } {
  return isObject(value) && value.trashed === true && typeof value.trashPath === 'string';
}

function isExported(value: unknown): value is ExportedFile {
  return (
    isObject(value) &&
    typeof value.path === 'string' &&
    typeof value.bytes === 'number' &&
    typeof value.fileName === 'string' &&
    typeof value.mediaType === 'string' &&
    typeof value.data === 'string'
  );
}

function isPrintable(value: unknown): value is { html: string } {
  return isObject(value) && typeof value.html === 'string';
}

function isTokens(value: unknown): value is DesignTokens {
  return (
    isObject(value) &&
    value.schemaVersion === 1 &&
    typeof value.name === 'string' &&
    isObject(value.colors) &&
    isObject(value.colorsDark) &&
    isObject(value.typography) &&
    isObject(value.spacing) &&
    isObject(value.radius)
  );
}

function isDesign(value: unknown): value is ResolvedDesignSystem {
  return (
    isObject(value) &&
    isTokens(value.tokens) &&
    (value.source === 'workspace' || value.source === 'library' || value.source === 'default') &&
    typeof value.css === 'string'
  );
}

/** Where a request goes: a scope, plus the workspace for design-system resolution. */
export interface Where {
  workspaceId: string | null;
  scope: Scope;
}

/**
 * The request fields for a target.
 * @param where the target.
 * @returns request fields.
 */
function fields(where: Where): Record<string, unknown> {
  return { scope: where.scope, ...(where.workspaceId === null ? {} : { workspaceId: where.workspaceId }) };
}

export const api = {
  list: (where: Where, query: { query?: string; type?: ArtifactType; offset?: number }, signal?: AbortSignal) =>
    call('list', { ...fields(where), ...query }, isList, signal),
  get: (where: Where, id: string, version?: number, signal?: AbortSignal) =>
    call('get', { ...fields(where), id, ...(version === undefined ? {} : { version }) }, isPayload, signal),
  create: (where: Where, type: ArtifactType, title: string, content: string) =>
    call('create', { ...fields(where), type, title, content }, hasManifest),
  update: (where: Where, id: string, baseVersion: number, content: string, title?: string) =>
    call('update', { ...fields(where), id, baseVersion, content, ...(title === undefined ? {} : { title }) }, hasManifest),
  rename: (where: Where, id: string, baseVersion: number, title: string) =>
    call('update', { ...fields(where), id, baseVersion, title }, hasManifest),
  remove: (where: Where, id: string) => call('delete', { ...fields(where), id }, isTrashed),
  history: (where: Where, id: string, signal?: AbortSignal) => call('history', { ...fields(where), id }, isHistory, signal),
  restore: (where: Where, id: string, version: number, baseVersion: number) =>
    call('restore', { ...fields(where), id, version, baseVersion }, hasManifest),
  exportFile: (where: Where, id: string, format: ExportFormat, version?: number) =>
    call('export', { ...fields(where), id, format, version }, isExported),
  printable: (where: Where, id: string, version?: number) => call('printable', { ...fields(where), id, version }, isPrintable),
  designSystem: (workspaceId: string | null, signal?: AbortSignal) =>
    call('designSystem', workspaceId === null ? {} : { workspaceId }, isDesign, signal),
  saveDesignSystem: (where: Where, tokens: DesignTokens) =>
    call('saveDesignSystem', { ...fields(where), tokens }, isDesign),
  clearDesignSystem: (workspaceId: string) => call('clearDesignSystem', { workspaceId, scope: 'workspace' }, isDesign),
};

/**
 * Read the stable code from a failure.
 * @param error the thrown value.
 * @returns the code, or undefined.
 */
export function codeOf(error: unknown): string | undefined {
  return error instanceof ArtifactCallError ? error.code : undefined;
}

/**
 * The locale key for an error code.
 * @param code the code.
 * @returns the key.
 */
export function errorKey(code: string | undefined): string {
  switch (code) {
    case 'artifact/not-found':
      return 'error.notFound';
    case 'artifact/stale-version':
      return 'error.stale';
    case 'artifact/too-large':
      return 'error.tooLarge';
    case 'artifact/no-workspace':
      return 'error.noWorkspace';
    case 'artifact/forbidden-path':
      return 'error.forbidden';
    case 'artifact/corrupt':
      return 'error.corrupt';
    case 'artifact/invalid-tokens':
      return 'error.tokens';
    case 'artifact/library-unavailable':
      return 'error.library';
    default:
      return 'error.generic';
  }
}

/**
 * Save an export in the browser as a download.
 * @param file the exported file.
 */
export function download(file: ExportedFile): void {
  const binary = atob(file.data);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  const url = URL.createObjectURL(new Blob([bytes], { type: file.mediaType }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = file.fileName;
  anchor.rel = 'noopener';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
