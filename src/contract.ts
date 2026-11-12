/** Wire shapes shared by the host route, the tools, and the browser client. */

export const ARTIFACT_TYPES = ['page', 'doc'] as const;
export type ArtifactType = (typeof ARTIFACT_TYPES)[number];

/**
 * Tell an artifact type from an unknown string without widening to string[].
 * @param value a candidate type.
 * @returns whether it is a supported type.
 */
export function isArtifactType(value: unknown): value is ArtifactType {
  return ARTIFACT_TYPES.some((type) => type === value);
}

export const SCOPES = ['workspace', 'library'] as const;
export type Scope = (typeof SCOPES)[number];

export const EXPORT_FORMATS = ['html', 'md', 'docx'] as const;
export type ExportFormat = (typeof EXPORT_FORMATS)[number];

/** Which exporters each type supports. */
export const FORMATS_BY_TYPE: Readonly<Record<ArtifactType, readonly ExportFormat[]>> = {
  page: ['html'],
  doc: ['md', 'docx', 'html'],
};

/** Content file name inside `content/`, by type. */
export const CONTENT_FILE: Readonly<Record<ArtifactType, string>> = {
  page: 'index.html',
  doc: 'document.md',
};

export const ID_PATTERN = /^art_(ws|lib)_[a-z0-9]{10,32}$/;
export const MAX_TITLE = 120;
export const MAX_LIST_LIMIT = 50;

/** Who produced a version. */
export interface VersionSource {
  origin: 'agent' | 'user';
  action: 'create' | 'update' | 'restore';
  sessionId?: string;
  restoredFrom?: number;
}

/** The authoritative metadata in `artifact.json`. */
export interface Manifest {
  schemaVersion: 1;
  id: string;
  scope: Scope;
  type: ArtifactType;
  title: string;
  createdAt: string;
  updatedAt: string;
  version: number;
  contentFile: string;
  contentBytes: number;
  contentHash: string;
  source: VersionSource;
}

/** One immutable snapshot as `history` lists it. */
export interface VersionEntry {
  version: number;
  createdAt: string;
  contentHash: string;
  contentBytes: number;
  source: VersionSource;
}

/** One gallery row. */
export interface ListResult {
  items: Manifest[];
  total: number;
  hasMore: boolean;
  truncated: boolean;
}

/** Design tokens that page and doc output inherit. */
export interface DesignTokens {
  schemaVersion: 1;
  name: string;
  colors: { primary: string; accent: string; surface: string; text: string; muted: string };
  typography: { fontFamily: string; monoFamily: string; scale: number[] };
  spacing: { unit: number; scale: number[] };
  radius: { sm: number; md: number; lg: number };
  notes: string;
}

/** Where resolved tokens came from. */
export type TokenSource = 'workspace' | 'library' | 'default';

export interface ResolvedDesignSystem {
  tokens: DesignTokens;
  source: TokenSource;
  css: string;
}

/** What `get` returns: the content plus the token CSS the renderer injects. */
export interface ArtifactPayload {
  manifest: Manifest;
  content: string;
  version: number;
  designCss: string;
}

/** What the route `export` endpoint returns; the browser turns `data` into a download. */
export interface ExportedFile {
  path: string;
  bytes: number;
  fileName: string;
  mediaType: string;
  data: string;
}

/**
 * Narrow a version source read from disk or the wire.
 * @param value the parsed value.
 * @returns whether it is a version source.
 */
export function isVersionSource(value: unknown): value is VersionSource {
  if (value === null || typeof value !== 'object') return false;
  const origin = 'origin' in value ? value.origin : undefined;
  const action = 'action' in value ? value.action : undefined;
  return (
    (origin === 'agent' || origin === 'user') &&
    (action === 'create' || action === 'update' || action === 'restore')
  );
}

/**
 * Narrow a manifest read from disk or the wire.
 * @param value the parsed value.
 * @returns whether it is a manifest.
 */
export function isManifest(value: unknown): value is Manifest {
  if (value === null || typeof value !== 'object') return false;
  const record: Record<string, unknown> = { ...value };
  return (
    record.schemaVersion === 1 &&
    typeof record.id === 'string' &&
    ID_PATTERN.test(record.id) &&
    (record.scope === 'workspace' || record.scope === 'library') &&
    typeof record.type === 'string' &&
    isArtifactType(record.type) &&
    typeof record.title === 'string' &&
    typeof record.createdAt === 'string' &&
    typeof record.updatedAt === 'string' &&
    typeof record.version === 'number' &&
    Number.isInteger(record.version) &&
    record.version >= 1 &&
    typeof record.contentFile === 'string' &&
    typeof record.contentBytes === 'number' &&
    typeof record.contentHash === 'string' &&
    isVersionSource(record.source)
  );
}

const ADDRESS_PREFIX = 'dsh-resource://artifact/';

/** One artifact address split into its parts. */
export type ArtifactAddress =
  | { scope: 'workspace'; workspaceId: string; id: string }
  | { scope: 'library'; id: string };

/**
 * Build the tab address of an artifact.
 * @param address the scope, workspace, and id.
 * @returns the `dsh-resource://artifact/...` address.
 */
export function formatArtifactAddress(address: ArtifactAddress): string {
  return address.scope === 'workspace'
    ? `${ADDRESS_PREFIX}workspace/${encodeURIComponent(address.workspaceId)}/${address.id}`
    : `${ADDRESS_PREFIX}library/${address.id}`;
}

/**
 * Read an artifact address.
 * @param value a candidate address.
 * @returns the parts, or undefined when the value is not an artifact address.
 */
export function parseArtifactAddress(value: string | null | undefined): ArtifactAddress | undefined {
  if (typeof value !== 'string' || !value.startsWith(ADDRESS_PREFIX)) return undefined;
  const parts = value.slice(ADDRESS_PREFIX.length).split('/');
  if (parts[0] === 'library' && parts.length === 2) {
    const id = parts[1] ?? '';
    return ID_PATTERN.test(id) && id.startsWith('art_lib_') ? { scope: 'library', id } : undefined;
  }
  if (parts[0] === 'workspace' && parts.length === 3) {
    const id = parts[2] ?? '';
    let workspaceId: string;
    try {
      workspaceId = decodeURIComponent(parts[1] ?? '');
    } catch {
      return undefined;
    }
    if (workspaceId === '' || !ID_PATTERN.test(id) || !id.startsWith('art_ws_')) return undefined;
    return { scope: 'workspace', workspaceId, id };
  }
  return undefined;
}

/**
 * The scope an id belongs to, read from its prefix.
 * @param id an artifact id.
 * @returns the scope, or undefined for a malformed id.
 */
export function scopeOfId(id: string): Scope | undefined {
  if (!ID_PATTERN.test(id)) return undefined;
  return id.startsWith('art_ws_') ? 'workspace' : 'library';
}

/** The default design system: neutral, readable, and offline (system font stacks only). */
export const DEFAULT_TOKENS: DesignTokens = {
  schemaVersion: 1,
  name: 'Default',
  colors: { primary: '#1a4d8f', accent: '#d97706', surface: '#f8fafc', text: '#0f172a', muted: '#64748b' },
  typography: {
    fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
    monoFamily: 'ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace',
    scale: [12, 14, 16, 20, 24, 32, 40],
  },
  spacing: { unit: 4, scale: [4, 8, 12, 16, 24, 32, 48] },
  radius: { sm: 4, md: 8, lg: 12 },
  notes: '',
};

/**
 * Turn tokens into CSS custom properties on `:root`.
 * @param tokens the design tokens.
 * @returns a CSS rule.
 */
export function tokensToCss(tokens: DesignTokens): string {
  const lines: string[] = [];
  for (const [key, value] of Object.entries(tokens.colors)) lines.push(`--artifact-color-${key}: ${value};`);
  lines.push(`--artifact-font-family: ${tokens.typography.fontFamily};`);
  lines.push(`--artifact-font-mono: ${tokens.typography.monoFamily};`);
  tokens.typography.scale.forEach((size, index) => lines.push(`--artifact-font-size-${index}: ${size}px;`));
  lines.push(`--artifact-space-unit: ${tokens.spacing.unit}px;`);
  tokens.spacing.scale.forEach((size, index) => lines.push(`--artifact-space-${index}: ${size}px;`));
  for (const [key, value] of Object.entries(tokens.radius)) lines.push(`--artifact-radius-${key}: ${value}px;`);
  return `:root {\n  ${lines.join('\n  ')}\n}`;
}
