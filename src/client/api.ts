import { isDesignInfo, isManifest, isVersionSource, isGenerationSummary, isDesignSystemRef } from '../contract.js';
import type {
  ArtifactPayload,
  DesignSelection,
  DesignSaveOptions,
  DesignCatalog,
  ArtifactType,
  DesignTokens,
  ExportFormat,
  ExportedFile,
  ListResult,
  Manifest,
  PreviewResult,
  ResolvedDesignSystem,
  Scope,
  VersionEntry,
} from '../contract.js';
import type { ConnectionService, Translator } from './harness.js';

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
    isTokens(value.design) &&
    (value.generation === undefined || isGenerationSummary(value.generation)) &&
    (value.designInfo === undefined || isDesignInfo(value.designInfo))
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
    isVersionSource(value.source) &&
    (value.generation === undefined || isGenerationSummary(value.generation))
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

function isPreview(value: unknown): value is PreviewResult {
  return (
    isObject(value) &&
    typeof value.mediaType === 'string' &&
    typeof value.data === 'string' &&
    typeof value.width === 'number' &&
    typeof value.height === 'number' &&
    isDesignInfo(value.info)
  );
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
    typeof value.css === 'string' &&
    (value.system === undefined || isDesignSystemRef(value.system))
  );
}

function isCatalog(value: unknown): value is DesignCatalog {
  return isObject(value) && (value.scope === 'workspace' || value.scope === 'library')
    && typeof value.revision === 'number' && Number.isSafeInteger(value.revision) && value.revision >= 0
    && (value.defaultId === null || typeof value.defaultId === 'string')
    && Array.isArray(value.systems) && value.systems.every(isDesignSystemRef);
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
  list: (where: Where, query: { query?: string; type?: ArtifactType; offset?: number; limit?: number }, signal?: AbortSignal) =>
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
  preview: (where: Where, id: string, version?: number, signal?: AbortSignal) =>
    call('preview', { ...fields(where), id, ...(version === undefined ? {} : { version }) }, isPreview, signal),
  designSystem: (workspaceId: string | null, signal?: AbortSignal) =>
    call('designSystem', workspaceId === null ? {} : { workspaceId }, isDesign, signal),
  selectedDesign: (where: Where, selection: DesignSelection = {}, signal?: AbortSignal) =>
    call('designSystem', { ...fields(where), systemId: selection.systemId, systemScope: selection.systemScope, systemRevision: selection.revision }, isDesign, signal),
  designSystems: (where: Where, signal?: AbortSignal) => call('designSystems', fields(where), isCatalog, signal),
  saveDesignSystem: (where: Where, tokens: DesignTokens, options?: DesignSaveOptions) =>
    call('saveDesignSystem', { ...fields(where), tokens, ...options }, isDesign),
  setDesignDefault: (where: Where, systemId: string | null, expectedRevision: number) =>
    call('setDesignDefault', { ...fields(where), systemId, expectedRevision }, isDesign),
  rebase: (where: Where, id: string, baseVersion: number, selection: DesignSelection = {}) =>
    call('rebase', { ...fields(where), id, baseVersion, systemId: selection.systemId, systemScope: selection.systemScope, systemRevision: selection.revision }, hasManifest),
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
    case 'artifact/stale-catalog':
      return 'error.staleCatalog';
    case 'artifact/writer-busy':
      return 'error.writerBusy';
    case 'artifact/unsupported-kit':
      return 'error.unsupportedKit';
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
    case 'artifact/design-invalid':
      return 'error.designInvalid';
    case 'artifact/design-icon-unsupported':
      return 'error.designIcon';
    case 'artifact/design-icon-not-found':
      return 'error.designIconNotFound';
    case 'artifact/design-render-failed':
      return 'error.designRender';
    case 'artifact/design-timeout':
      return 'error.designTimeout';
    case 'artifact/design-unavailable':
      return 'error.designUnavailable';
    case 'artifact/unsupported-type':
      return 'error.unsupportedType';
    case 'artifact/invalid-sheet':
      return 'error.sheetInvalid';
    default:
      return 'error.generic';
  }
}

/**
 * The message a server failure carried, when it is a design failure the user
 * can act on (a compiler message, for example).
 * @param error the thrown value.
 * @returns the message, or undefined.
 */
export function designFailureMessage(error: unknown): string | undefined {
  if (!(error instanceof ArtifactCallError) || !error.code.startsWith('artifact/design-')) return undefined;
  return error.message === '' ? undefined : error.message;
}

/**
 * A user-facing failure text: the server's message for a design failure, the
 * localized code for everything else.
 * @param t the translator.
 * @param error the thrown value.
 * @returns the text.
 */
export function describeFailure(t: Translator, error: unknown): string {
  return designFailureMessage(error) ?? t(errorKey(codeOf(error)));
}

export function download(file: Pick<ExportedFile, 'data' | 'mediaType' | 'fileName'>): void {
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
