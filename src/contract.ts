/** Wire shapes shared by the host route, the tools, and the browser client. */

export const ARTIFACT_TYPES = ['page', 'doc', 'design', 'sheet', 'board'] as const;
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

export const EXPORT_FORMATS = ['html', 'md', 'docx', 'png', 'svg', 'fig', 'html-svg', 'csv', 'xlsx', 'excalidraw'] as const;
export type ExportFormat = (typeof EXPORT_FORMATS)[number];

/** Which exporters each type supports. */
export const FORMATS_BY_TYPE: Readonly<Record<ArtifactType, readonly ExportFormat[]>> = {
  page: ['html'],
  doc: ['md', 'docx', 'html'],
  design: ['png', 'svg', 'fig', 'html', 'html-svg'],
  sheet: ['csv', 'xlsx'],
  board: ['excalidraw'],
};

/** Content file name inside `content/`, by type. */
export const CONTENT_FILE: Readonly<Record<ArtifactType, string>> = {
  page: 'index.html',
  doc: 'document.md',
  design: 'design.jsx',
  sheet: 'sheet.json',
  board: 'board.excalidraw',
};

export const ID_PATTERN = /^art_(ws|lib)_[a-z0-9]{10,32}$/;
/** A recipe id: lowercase words joined by hyphens. */
export const RECIPE_PATTERN = /^[a-z][a-z0-9-]{1,39}$/;
export const MAX_TITLE = 120;
export const MAX_LIST_LIMIT = 50;

/** Who produced a version. */
export interface VersionSource {
  origin: 'agent' | 'user';
  action: 'create' | 'update' | 'restore' | 'rebase';
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
  /** The recipe the artifact follows: its content structure for one intent. Absent on artifacts made before recipes. */
  recipe?: string;
  generation?: GenerationSummary;
}

/** One immutable snapshot as `history` lists it. */
export interface VersionEntry {
  version: number;
  createdAt: string;
  contentHash: string;
  contentBytes: number;
  source: VersionSource;
  generation?: GenerationSummary;
}

/** One gallery row. */
export interface ListResult {
  items: Manifest[];
  total: number;
  hasMore: boolean;
  truncated: boolean;
}

/** Design tokens that page and doc output inherit. */
/** Semantic colors shared by pages, documents, and the token editor. */
export interface TokenColors {
  primary: string;
  accent: string;
  surface: string;
  text: string;
  muted: string;
  background: string;
  raised: string;
  border: string;
  control: string;
  action: string;
  actionText: string;
  focus: string;
  success: string;
  warning: string;
  danger: string;
}

export const COLOR_ROLES = [
  'primary', 'accent', 'surface', 'text', 'muted', 'background', 'raised',
  'border', 'control', 'action', 'actionText', 'focus', 'success', 'warning', 'danger',
] as const satisfies readonly (keyof TokenColors)[];

export interface DesignTokens {
  schemaVersion: 1;
  name: string;
  colors: TokenColors;
  /** Colors for a dark theme. A page opts in with a color-scheme meta that names dark. */
  colorsDark: TokenColors;
  typography: { fontFamily: string; displayFamily: string; monoFamily: string; scale: number[] };
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
  system?: DesignSystemRef;
  catalogRevision?: number;
}

/** What a rendered design reports about its own scene graph. */
export interface DesignInfo {
  pages: number;
  nodes: number;
  types: Record<string, number>;
  fonts: string[];
  warnings: string[];
}

/** One rendered preview of a design, plus the summary that came with it. */
export interface PreviewResult {
  mediaType: string;
  data: string;
  width: number;
  height: number;
  info: DesignInfo;
}

/**
 * Narrow a design summary read from the wire or a cache file.
 * @param value the value.
 * @returns whether it is a design summary.
 */
export function isDesignInfo(value: unknown): value is DesignInfo {
  if (value === null || typeof value !== 'object') return false;
  const record: Record<string, unknown> = { ...value };
  return (
    typeof record.pages === 'number' &&
    typeof record.nodes === 'number' &&
    record.types !== null &&
    typeof record.types === 'object' &&
    Array.isArray(record.fonts) &&
    record.fonts.every((font) => typeof font === 'string') &&
    Array.isArray(record.warnings) &&
    record.warnings.every((warning) => typeof warning === 'string')
  );
}

/** What `get` returns: the content plus the token CSS the renderer injects. */
export interface ArtifactPayload {
  manifest: Manifest;
  content: string;
  version: number;
  designCss: string;
  /** The resolved tokens, so the document editor can match the export. */
  design: DesignTokens;
  generation?: GenerationSummary;
  /** The compiled summary of a design, when the read could produce one. */
  designInfo?: DesignInfo;
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
    (action === 'create' || action === 'update' || action === 'restore' || action === 'rebase')
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
    isVersionSource(record.source) &&
    (record.recipe === undefined || (typeof record.recipe === 'string' && RECIPE_PATTERN.test(record.recipe))) &&
    (record.generation === undefined || isGenerationSummary(record.generation))
  );
}

const ADDRESS_PREFIX = 'dsh-resource://artifact/';

/** The root attribute that selects the dark token colors. */
export const THEME_ATTRIBUTE = 'data-artifact-theme';

/** How a composed page picks its colors: the light set, the dark set, or the viewer's system setting. */
export type PageTheme = 'light' | 'dark' | 'auto';

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
  colors: {
    primary: '#8c3e25', accent: '#b85c3b', surface: '#fffdf8', text: '#211f1b', muted: '#6c655b',
    background: '#f3efe7', raised: '#ebe4d7', border: '#d8cfbf', control: '#8a7c68',
    action: '#8c3e25', actionText: '#fffdf8', focus: '#2f5f7a',
    success: '#2f6b4f', warning: '#855714', danger: '#923b3b',
  },
  colorsDark: {
    primary: '#f0a888', accent: '#e08a66', surface: '#201c17', text: '#f3eee5', muted: '#b9b0a2',
    background: '#171411', raised: '#29241d', border: '#3b342b', control: '#8f806c',
    action: '#e08a66', actionText: '#171411', focus: '#8fc7e0',
    success: '#8fc9a7', warning: '#e0b66f', danger: '#e59a9a',
  },
  typography: {
    fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
    displayFamily: 'ui-serif, "Iowan Old Style", Charter, Georgia, serif',
    monoFamily: 'ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace',
    scale: [12, 14, 16, 20, 24, 32, 40],
  },
  spacing: { unit: 4, scale: [4, 8, 12, 16, 24, 32, 48] },
  radius: { sm: 4, md: 8, lg: 12 },
  notes: '',
};

/** Map JSON role names to the CSS naming convention. */
function colorProperty(role: keyof TokenColors): string {
  return `--artifact-color-` + role.replace(/[A-Z]/g, (letter) => '-' + letter.toLowerCase());
}

/**
 * Turn tokens into CSS custom properties on `:root`.
 * @param tokens the design tokens.
 * @returns a CSS rule.
 */
export function tokensToCss(tokens: DesignTokens): string {
  const lines: string[] = [];
  for (const role of COLOR_ROLES) lines.push(`${colorProperty(role)}: ${tokens.colors[role]};`);
  lines.push(`--artifact-font-family: ${tokens.typography.fontFamily};`);
  lines.push(`--artifact-font-display: ${tokens.typography.displayFamily};`);
  lines.push(`--artifact-font-mono: ${tokens.typography.monoFamily};`);
  tokens.typography.scale.forEach((size, index) => lines.push(`--artifact-font-size-${index}: ${size}px;`));
  lines.push(`--artifact-space-unit: ${tokens.spacing.unit}px;`);
  tokens.spacing.scale.forEach((size, index) => lines.push(`--artifact-space-${index}: ${size}px;`));
  for (const [key, value] of Object.entries(tokens.radius)) lines.push(`--artifact-radius-${key}: ${value}px;`);
  const dark = COLOR_ROLES.map((role) => `${colorProperty(role)}: ${tokens.colorsDark[role]};`).join('\n  ');
  return [
    `:root {\n  ${lines.join('\n  ')}\n}`,
    `:root[${THEME_ATTRIBUTE}="dark"] {\n  color-scheme: dark;\n  ${dark}\n}`,
    `@media (prefers-color-scheme: dark) {\n  :root[${THEME_ATTRIBUTE}="auto"] {\n    color-scheme: dark;\n    ${dark.replace(/\n  /g, '\n    ')}\n  }\n}`,
  ].join('\n');
}

/**
 * The token variables as a style object for one theme, for surfaces the plugin
 * draws itself instead of a frame.
 * @param tokens the design tokens.
 * @param dark whether to use the dark colors.
 * @returns custom property names and values.
 */
export function tokenVariables(tokens: DesignTokens, dark: boolean): Record<string, string> {
  const colors = dark ? tokens.colorsDark : tokens.colors;
  const vars: Record<string, string> = {
    '--artifact-font-family': tokens.typography.fontFamily,
    '--artifact-font-display': tokens.typography.displayFamily,
    '--artifact-font-mono': tokens.typography.monoFamily,
  };
  for (const role of COLOR_ROLES) vars[colorProperty(role)] = colors[role];
  tokens.typography.scale.forEach((size, index) => { vars[`--artifact-font-size-${index}`] = `${size}px`; });
  tokens.spacing.scale.forEach((size, index) => { vars[`--artifact-space-${index}`] = `${size}px`; });
  for (const [key, value] of Object.entries(tokens.radius)) vars[`--artifact-radius-${key}`] = `${value}px`;
  return vars;
}

export const SYSTEM_ID_PATTERN = /^ds_[a-z0-9]{16}$/;
export const DIGEST_PATTERN = /^sha256:[a-f0-9]{64}$/;

export interface DesignSystemRef {
  id: string;
  revision: number;
  scope: Scope;
  name: string;
}
export interface DesignSelection {
  systemId?: string;
  systemScope?: Scope;
  revision?: number;
}
export interface DesignSaveOptions {
  systemId?: string;
  expectedRevision?: number;
  createNew?: boolean;
  makeDefault?: boolean;
}
export interface DesignCatalog {
  scope: Scope;
  revision: number;
  defaultId: string | null;
  systems: DesignSystemRef[];
}
export interface GenerationSummary {
  hash: string;
  bytes: number;
  system: DesignSystemRef | null;
  recipe: string | null;
  kit: string | null;
}

export function isDesignSystemRef(value: unknown): value is DesignSystemRef {
  if (value === null || typeof value !== 'object') return false;
  const row: Record<string, unknown> = { ...value };
  return typeof row.id === 'string' && SYSTEM_ID_PATTERN.test(row.id)
    && typeof row.revision === 'number' && Number.isSafeInteger(row.revision) && row.revision > 0
    && (row.scope === 'workspace' || row.scope === 'library')
    && typeof row.name === 'string' && row.name.length > 0 && row.name.length <= 80;
}

export function isGenerationSummary(value: unknown): value is GenerationSummary {
  if (value === null || typeof value !== 'object') return false;
  const row: Record<string, unknown> = { ...value };
  return typeof row.hash === 'string' && DIGEST_PATTERN.test(row.hash)
    && typeof row.bytes === 'number' && Number.isSafeInteger(row.bytes) && row.bytes > 0 && row.bytes <= 65536
    && (row.system === null || isDesignSystemRef(row.system))
    && (row.recipe === null || typeof row.recipe === 'string' && RECIPE_PATTERN.test(row.recipe))
    && (row.kit === null || typeof row.kit === 'string' && row.kit.length <= 20);
}
