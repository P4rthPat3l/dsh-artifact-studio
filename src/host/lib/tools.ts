import type { Manifest, PreviewResult, Scope } from '../../contract.js';
import type { SheetWorkbook } from '../../sheet/index.js';
import { checkPage } from './checks.js';
import { SheetError, applySheetOperations, checkSheetWorkbook, evaluateWorkbook, parseSheetWorkbook, serializeSheetWorkbook, sheetOverview, sheetValues } from '../../sheet/index.js';
import { MAX_INSTRUCTIONS } from './guide.js';
import type { GuidePatch } from './guide.js';
import type { ResolvedRecipe } from './recipes.js';
import { ArtifactError } from './errors.js';
import { requireWorkspace, workspaceForSession } from './paths.js';
import type { ArtifactService, Target } from './service.js';
import type { WorkspaceRegistry } from './types.js';
import {
  fieldsOf,
  designSelection,
  designSaveOptions,
  optionalEdits,
  optionalInteger,
  optionalScope,
  optionalString,
  optionalType,
  requiredFormat,
  requiredInteger,
  requiredString,
  requiredType,
} from './validate.js';

/** One text block as the model reads it. */
interface TextBlock {
  readonly type: 'text';
  readonly text: string;
}

/** One image block the model sees beside the text. */
interface ImageBlock {
  readonly type: 'image';
  readonly attachment: { readonly attachmentId: string; readonly mediaType: string; readonly bytes: number; readonly width: number; readonly height: number };
}

/** One model-facing block of a tool result. */
type RenderedBlock = TextBlock | ImageBlock;

/** A JSON value, as tool outputs and presentation meta must be. */
type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

/** The calling agent: its id is the session id, and its session carries the routed model. */
interface ToolAgent {
  readonly id: string;
  readonly session?: {
    readonly requestHeader?: () => { readonly config?: { readonly provider?: string; readonly model?: string } };
  };
}

/** The execution context the tool registry passes. */
interface ToolExec {
  readonly agent?: ToolAgent;
  readonly signal: AbortSignal;
}

/** The tool shape the registry accepts. */
export interface ToolDefinition {
  readonly name: string;
  readonly description: string;
  readonly parameters: Readonly<Record<string, unknown>>;
  readonly output: {
    readonly schema: Readonly<Record<string, unknown>>;
    render(args: unknown, value: JsonValue): RenderedBlock[];
    presentationMeta?(args: unknown, value: JsonValue): JsonValue;
  };
  execute(args: unknown, exec: ToolExec): Promise<JsonValue>;
}

/** The working-directory service. */
export interface WorkingDirectory {
  ensure(agent: ToolAgent, signal?: AbortSignal): Promise<string>;
}

/** What the tools need from the host. */
export interface ToolHost {
  readonly service: ArtifactService;
  readonly registry: WorkspaceRegistry;
  readonly workingDirectory: WorkingDirectory;
}

const SCOPE_PARAM = {
  type: 'string',
  enum: ['workspace', 'library'],
  description:
    'workspace (default) stores it under the Harness home for this workspace. library stores it in the user profile, shared by every project; use it only when the user asks for something reusable across projects.',
};

const WORKSPACE_PARAM = {
  type: 'string',
  description:
    "Another registered project's workspace id, from an artifact reference. Omit for this session's project.",
};

const DESIGN_SELECTION = {
  systemId: { type: 'string', description: 'Named design system ID from design_system_list. Omit for the scope default.' },
  systemScope: { type: 'string', enum: ['workspace', 'library'], description: 'Scope of the selected named system.' },
  systemRevision: { type: 'integer', minimum: 1, description: 'Exact named system revision. Omit for its latest revision.' },
};
const DESIGN_IDENTITY = {
  system: { oneOf: [{ type: 'object' }, { type: 'null' }] },
  catalogRevision: { oneOf: [{ type: 'integer' }, { type: 'null' }] },
};

const PAGE_GUIDE = [
  'Load the artifact-design skill, then call artifact_brief and follow it. Precedence: the user\'s request, then saved conventions, then the recipe, then the design system, then your own choices.',
  'A page is one self-contained HTML document in a sandbox with no network or browser storage: inline all CSS and JavaScript, draw charts with inline SVG or canvas, and use data: URIs for images. Keep the layout fluid for a 380 to 700 px panel.',
  'Pages build on the artifact kit and the injected --artifact-* variables that the brief lists.',
  'A doc is Markdown: headings, lists, task lists, tables, quotes, and fenced code.',
  'Each save is a version the user sees. Check before saving and batch fixes into one update.',
].join('\n');

const RECIPE_PARAM = {
  type: 'string',
  description: 'The recipe id from artifact_brief: the content structure for this intent, such as client-scope or feature-spec. It is stored with the artifact and drives the structure checks.',
};

/**
 * Warnings for the version an update wrote. Full content is checked directly.
 * Edits are checked against that exact saved version; the version already
 * landed, so a failed read reports that validation is incomplete.
 */
async function writtenWarnings(
  type: string,
  content: string | undefined,
  readEdited: (() => Promise<{ content: string }>) | undefined,
  recipe: ResolvedRecipe | undefined,
): Promise<string[]> {
  if (type === 'sheet') {
    const check = (text: string): string[] => {
      try {
        return checkSheetWorkbook(parseSheetWorkbook(text));
      } catch {
        return [];
      }
    };
    if (content !== undefined) return check(content);
    if (readEdited === undefined) return [];
    try {
      return check((await readEdited()).content);
    } catch (error) {
      if (error instanceof ArtifactError) return ['checks-unavailable: the version was saved, but its content could not be read for checks. Do not retry the write; read the saved version.'];
      throw error;
    }
  }
  if (type !== 'page') return [];
  const options = recipe === undefined ? {} : { recipe };
  if (content !== undefined) return checkPage(content, options);
  if (readEdited === undefined) return [];
  try {
    return checkPage((await readEdited()).content, options);
  } catch (error) {
    if (error instanceof ArtifactError) return ['checks-unavailable: the version was saved, but its content could not be read for checks. Do not retry the write; read the saved version.'];
    throw error;
  }
}

/** Static page warnings for a written version; documents have none. */
function warningsFor(type: string, content: string | undefined, recipe: ResolvedRecipe | undefined): string[] {
  if (type === 'page' && content !== undefined) return checkPage(content, recipe === undefined ? {} : { recipe });
  if (type === 'sheet' && content !== undefined) {
    try {
      return checkSheetWorkbook(parseSheetWorkbook(content));
    } catch {
      return [];
    }
  }
  return [];
}

/**
 * The scope context of a call: the session's workspace, or an explicitly named
 * registered workspace, plus an explicit scope.
 * @param host the tool host.
 * @param exec the execution.
 * @param scope an explicit scope.
 * @param workspaceId another registered workspace, when the call names one.
 * @returns the target.
 */
async function targetFor(host: ToolHost, exec: ToolExec, scope: Scope | undefined, workspaceId?: string): Promise<Target> {
  if (workspaceId !== undefined) {
    requireWorkspace(host.registry, workspaceId);
    if (scope === 'library') {
      throw new ArtifactError('artifact/bad-request', '"workspaceId" applies only to workspace artifacts.', { workspaceId });
    }
    return { workspaceId, scope: 'workspace' };
  }
  if (exec.agent === undefined) {
    if (scope === 'library') return { scope };
    throw new ArtifactError('artifact/no-workspace', 'Workspace artifacts need an agent session.');
  }
  const cwd = await host.workingDirectory.ensure(exec.agent, exec.signal);
  try {
    const workspace = workspaceForSession(host.registry, exec.agent.id, cwd);
    return { workspaceId: workspace.id, ...(scope === undefined ? {} : { scope }) };
  } catch (error) {
    // A session outside every workspace can still use the library.
    if (scope === 'library' && error instanceof ArtifactError) return { scope };
    throw error;
  }
}

/**
 * Narrow a tool value to an object for rendering.
 * @param value the value.
 * @returns the fields.
 */
function record(value: JsonValue): Record<string, JsonValue> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return {};
  return value;
}

/**
 * The card payload stored with a tool result: identity only, never content.
 * @param value the tool value.
 * @returns the presentation meta.
 */
function cardMeta(value: JsonValue): JsonValue {
  const fields = record(value);
  return {
    kind: 'artifact',
    v: 1,
    id: fields.id ?? null,
    scope: fields.scope ?? null,
    type: fields.type ?? null,
    title: fields.title ?? null,
    version: fields.version ?? null,
    workspaceId: fields.workspaceId ?? null,
  };
}

/**
 * The tool value describing one manifest.
 * @param manifest the manifest.
 * @param target the call target.
 * @returns the value.
 */
function summary(manifest: Manifest, target: Target): { [key: string]: JsonValue } {
  return {
    id: manifest.id,
    scope: manifest.scope,
    type: manifest.type,
    title: manifest.title,
    version: manifest.version,
    updatedAt: manifest.updatedAt,
    contentBytes: manifest.contentBytes,
    workspaceId: manifest.scope === 'workspace' ? (target.workspaceId ?? null) : null,
    recipe: manifest.recipe ?? null,
    generation: manifest.generation ? { ...manifest.generation, system: manifest.generation.system ? { ...manifest.generation.system } : null } : null,
  };
}

/** The text the model reads after a write, with any page warnings. */
function writeText(value: JsonValue, verb: string): string {
  const warnings = record(value).warnings;
  const list = Array.isArray(warnings) ? warnings.map(String) : [];
  const head = `${line(value, verb)} The user sees a card with an Open action.`;
  return list.length === 0 ? head : `${head}\nWarnings, fix all of them in one update:\n${list.map((item) => `- ${item}`).join('\n')}`;
}

/**
 * The outline lines the model reads: one row per layer with its id, type, and
 * name, children indented one level.
 * @param rows the outline rows.
 * @returns the text.
 */
function outlineText(rows: readonly JsonValue[]): string {
  const lines: string[] = [];
  const walk = (items: readonly JsonValue[], depth: number): void => {
    for (const item of items) {
      const row = record(item);
      const children = Array.isArray(row.children) ? row.children : [];
      lines.push(`${'  '.repeat(depth)}- ${String(row.path)} ${String(row.type)} "${String(row.name)}"${children.length === 0 ? '' : ` (${String(children.length)} children)`}`);
      if (depth < 1) walk(children, depth + 1);
    }
  };
  walk(rows, 0);
  return lines.join('\n');
}

/**
 * The bounded evaluated read of one sheet, from the values argument.
 * @param workbook the sheet workbook.
 * @param raw the values argument.
 * @returns the evaluated cells and their range.
 */
function sheetValuesOf(workbook: SheetWorkbook, raw: unknown): JsonValue {
  const fields = fieldsOf(raw);
  const sheet = typeof fields.sheet === 'string' ? fields.sheet : undefined;
  const range = typeof fields.range === 'string' ? fields.range : undefined;
  try {
    const values = sheetValues(workbook, evaluateWorkbook(workbook), sheet, range);
    return {
      sheet: values.sheet,
      range: values.range,
      truncated: values.truncated,
      cells: values.cells.map((cell) => ({ ref: cell.ref, value: cell.value, display: cell.display, error: cell.error ?? null })),
    };
  } catch (error) {
    if (error instanceof SheetError) throw new ArtifactError('artifact/invalid-sheet', error.message, { message: error.message });
    throw error;
  }
}

/**
 * The values block the model reads: one line per row, tab separated.
 * @param value the sheetValues part of the read result.
 * @returns the text, empty when the read carried no values.
 */
function valuesText(value: JsonValue | undefined): string {
  const fields = record(value ?? null);
  const cells = Array.isArray(fields.cells) ? fields.cells.map(record) : [];
  if (cells.length === 0) return '';
  const rows = new Map<string, string[]>();
  for (const cell of cells) {
    const rowKey = /[0-9]+$/.exec(String(cell.ref))?.[0] ?? '0';
    const values = rows.get(rowKey) ?? [];
    values.push(String(cell.display));
    rows.set(rowKey, values);
  }
  const head = '\n\nValues ' + String(fields.sheet) + '!' + String(fields.range) + (fields.truncated === true ? ' (truncated; narrow the range)' : '') + ':';
  return head + '\n' + [...rows.values()].map((values) => values.join('\t')).join('\n');
}

const SUMMARY_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'scope', 'type', 'title', 'version', 'updatedAt', 'contentBytes', 'workspaceId', 'recipe'],
  properties: {
    id: { type: 'string' },
    scope: { type: 'string', enum: ['workspace', 'library'] },
    type: { type: 'string', enum: ['page', 'doc', 'design', 'sheet'] },
    title: { type: 'string' },
    version: { type: 'integer' },
    updatedAt: { type: 'string' },
    contentBytes: { type: 'integer' },
    workspaceId: { oneOf: [{ type: 'string' }, { type: 'null' }] },
    recipe: { oneOf: [{ type: 'string' }, { type: 'null' }] },
    generation: { oneOf: [{ type: 'object' }, { type: 'null' }] },
  },
};

/**
 * One-line description of a stored artifact for the model.
 * @param value the summary value.
 * @param verb what happened.
 * @returns the line.
 */
function line(value: JsonValue, verb: string): string {
  const fields = record(value);
  const recipe = typeof fields.recipe === 'string' ? ` recipe=${fields.recipe}` : '';
  return `${verb} ${String(fields.type)} "${String(fields.title)}" id=${String(fields.id)} scope=${String(fields.scope)} version=${String(fields.version)}${recipe}.`;
}

const WRITE_SCHEMA = {
  ...SUMMARY_SCHEMA,
  required: [...SUMMARY_SCHEMA.required, 'warnings'],
  properties: { ...SUMMARY_SCHEMA.properties, warnings: { type: 'array', items: { type: 'string' } } },
};

/**
 * Build the artifact tools.
 * @param host the services the tools need.
 * @returns the tool definitions.
 */
export function createTools(host: ToolHost): ToolDefinition[] {
  const { service } = host;
  const create: ToolDefinition = {
    name: 'artifact_create',
    description: [
      'Create a versioned artifact the user opens, edits, and exports in a panel beside the chat. Use it for a substantial deliverable the user will look at or reuse: a dashboard, report, one-pager, landing page, interactive tool, or long document. Do not use it for short answers or for project source files.',
      'If the user asks for an artifact, an artifact page, or an artifact doc, create it here with the matching type and never write a project file instead.',
      '',
      PAGE_GUIDE,
    ].join('\n'),
    parameters: {
      type: 'object',
      additionalProperties: false,
      required: ['type', 'title', 'content'],
      properties: {
        type: { type: 'string', enum: ['page', 'doc', 'design', 'sheet'], description: 'page for HTML, doc for Markdown, design for OpenPencil Design JSX, sheet for a JSON workbook. A mockup or wireframe is always design. For a design, load the artifact-design skill first: no imports, no HTML. If a design fails for a reason other than its source, report the error; never redo it as a page.' },
        title: { type: 'string', description: 'Short title, 1 to 120 characters.' },
        content: { type: 'string', description: 'The full HTML document, Markdown text, Design JSX source, or sheet workbook JSON, up to 2 MiB.' },
        recipe: RECIPE_PARAM,
        ...DESIGN_SELECTION,
        scope: SCOPE_PARAM,
        workspaceId: WORKSPACE_PARAM,
      },
    },
    output: {
      schema: WRITE_SCHEMA,
      render: (_args, value) => [{ type: 'text', text: writeText(value, 'Created') }],
      presentationMeta: (_args, value) => cardMeta(value),
    },
    async execute(args, exec) {
      const fields = fieldsOf(args);
      const target = await targetFor(host, exec, optionalScope(fields), optionalString(fields, 'workspaceId'));
      const type = requiredType(fields);
      const content = optionalString(fields, 'content') ?? '';
      const recipeId = optionalString(fields, 'recipe');
      const recipe = recipeId === undefined ? undefined : await service.recipe(target, recipeId, type);
      const manifest = await service.create(target, {
        type,
        title: requiredString(fields, 'title'),
        content,
        ...(recipeId === undefined ? {} : { recipe: recipeId }),
        design: designSelection(fields),
        source: { origin: 'agent', action: 'create', ...(exec.agent === undefined ? {} : { sessionId: exec.agent.id }) },
      });
      const warnings = type === 'design'
        ? (await service.read(target, manifest.id)).designInfo?.warnings ?? []
        : warningsFor(type, content, recipe);
      return { ...summary(manifest, target), warnings };
    },
  };

  const read: ToolDefinition = {
    name: 'artifact_read',
    description:
      'Read an artifact\'s current content and version, or an earlier version. Read before updating an artifact the user may have edited. Pass workspaceId for an artifact in another project.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      required: ['id'],
      properties: {
        id: { type: 'string', description: 'Artifact id from artifact_create or artifact_list.' },
        version: { type: 'integer', description: 'An earlier version to read. Omit for the current one.' },
        outline: { type: 'boolean', description: 'For a design, include the layer outline with paths for artifact_patch, and for a one-layer artifact_preview or artifact_export. Defaults to false; set it when you plan to patch or inspect one layer.' },
        values: {
          type: 'object',
          additionalProperties: false,
          description: 'For a sheet, also return evaluated cells: the computed value, display text, and error code. Bounded to 500 cells; check the truncated flag.',
          properties: {
            sheet: { type: 'string', description: 'Sheet name. Defaults to the first sheet.' },
            range: { type: 'string', description: 'A1 range such as B2:F20. Defaults to the used range.' },
          },
        },
        workspaceId: WORKSPACE_PARAM,
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        required: ['artifact', 'readVersion', 'content'],
        properties: {
          artifact: SUMMARY_SCHEMA,
          readVersion: { type: 'integer' },
          content: { type: 'string' },
          designInfo: {
            type: 'object',
            description: 'The compiled summary of a design: pages, nodes, type counts, fonts, and warnings.',
          },
          sheetInfo: {
            type: 'array',
            description: 'Per-sheet size and counts for a sheet artifact.',
            items: { type: 'object' },
          },
          sheetValues: {
            type: 'object',
            description: 'Evaluated cells for the requested sheet and range, when values was sent.',
          },
        },
      },
      render: (_args, value) => {
        const fields = record(value);
        const artifact = record(fields.artifact ?? null);
        const info = record(fields.designInfo ?? null);
        const outlineRows = Array.isArray(info.outline) ? info.outline : [];
        const outlineBlock = outlineRows.length === 0 ? '' : '\n\nOutline (paths for artifact_patch, artifact_preview, and artifact_export):\n' + outlineText(outlineRows);
        const sheetRows = Array.isArray(fields.sheetInfo) ? fields.sheetInfo.map(record) : [];
        const sheetLine = sheetRows.length === 0
          ? ''
          : '\n\nSheets: ' + sheetRows.map((row) => String(row.name) + ' (' + String(row.rows) + ' x ' + String(row.columns) + ', ' + String(row.cells) + ' cells)').join('; ') + '.';
        const valuesBlock = valuesText(fields.sheetValues);
        const summaryLine = info.nodes === undefined
          ? ''
          : `\n\nDesign: ${String(info.nodes)} nodes, ${String(info.pages)} page(s), fonts ${Array.isArray(info.fonts) && info.fonts.length > 0 ? info.fonts.map(String).join(', ') : 'none'}.`
            + (Array.isArray(info.warnings) && info.warnings.length > 0 ? `\nWarnings:\n${info.warnings.map((item) => `- ${String(item)}`).join('\n')}` : '');
        return [
          {
            type: 'text',
            text: `${line(artifact, 'Artifact')} Showing version ${String(fields.readVersion)}.${summaryLine}${sheetLine}${valuesBlock}${outlineBlock}\n\n${String(fields.content)}`,
          },
        ];
      },
    },
    async execute(args, exec) {
      const fields = fieldsOf(args);
      const id = requiredString(fields, 'id');
      const target = await targetFor(host, exec, id.startsWith('art_lib_') ? 'library' : undefined, optionalString(fields, 'workspaceId'));
      const result = await service.read(target, id, optionalInteger(fields, 'version'));
      const info = result.designInfo;
      const wantOutline = fields.outline === true;
      const workbook = result.manifest.type === 'sheet' ? parseSheetWorkbook(result.content) : undefined;
      const values = workbook === undefined || fields.values === undefined ? undefined : sheetValuesOf(workbook, fields.values);
      return {
        artifact: summary(result.manifest, target),
        readVersion: result.version,
        content: result.content,
        ...(info === undefined
          ? {}
          : { designInfo: { pages: info.pages, nodes: info.nodes, types: info.types, fonts: info.fonts, warnings: info.warnings, ...(wantOutline ? { outline: info.outline ?? [] } : {}) } }),
        ...(workbook === undefined
          ? {}
          : { sheetInfo: sheetOverview(workbook).map((item) => ({ name: item.name, rows: item.rows, columns: item.columns, cells: item.cells, formulas: item.formulas })) }),
        ...(values === undefined ? {} : { sheetValues: values }),
      };
    },
  };

  const update: ToolDefinition = {
    name: 'artifact_update',
    description: [
      'Save a new version of an artifact. For a few local changes send edits; send complete content only when you rewrite most of it. Each edit oldText must occur exactly once.',
      'The update is refused when baseVersion is not the current version, for example after the user edited it; read it again and reapply your change. Never discard the user\'s edits.',
      'A layout or styling change follows the artifact-design skill and the same precedence: the user\'s request, then saved conventions, then the recipe, then the design system, then your own choices. Send recipe to set or change it.',
      'For a design, send the complete Design JSX source as content and read it first if you did not write it; edits are applied and validated too, but a design rewrite is usually smaller as one content value.',
      'For a sheet, prefer artifact_sheet_update with cell operations; send the complete workbook JSON as content only when you rewrite most of it.',
      'Each call writes a version the user sees. Put every fix for one request, including all returned warnings, into one update; never send one update per finding.',
    ].join('\n'),
    parameters: {
      type: 'object',
      additionalProperties: false,
      required: ['id', 'baseVersion'],
      properties: {
        id: { type: 'string' },
        baseVersion: { type: 'integer', description: 'The version your change is based on.' },
        content: { type: 'string', description: 'Complete replacement content. Use this or edits. For a design, send the complete Design JSX source; for a sheet, prefer artifact_sheet_update.' },
        edits: {
          type: 'array',
          description: 'Replace-once edits applied in order. Each oldText must occur exactly once.',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['oldText', 'newText'],
            properties: { oldText: { type: 'string' }, newText: { type: 'string' } },
          },
        },
        title: { type: 'string', description: 'A new title.' },
        recipe: { ...RECIPE_PARAM, description: 'Set or change the recipe, for example on an artifact made before recipes existed.' },
        workspaceId: WORKSPACE_PARAM,
      },
    },
    output: {
      schema: WRITE_SCHEMA,
      render: (_args, value) => [{ type: 'text', text: writeText(value, 'Updated') }],
      presentationMeta: (_args, value) => cardMeta(value),
    },
    async execute(args, exec) {
      const fields = fieldsOf(args);
      const id = requiredString(fields, 'id');
      const target = await targetFor(host, exec, id.startsWith('art_lib_') ? 'library' : undefined, optionalString(fields, 'workspaceId'));
      const content = optionalString(fields, 'content');
      const edits = optionalEdits(fields);
      const title = optionalString(fields, 'title');
      const recipeId = optionalString(fields, 'recipe');
      if (content === undefined && edits === undefined && title === undefined && recipeId === undefined) {
        throw new ArtifactError('artifact/bad-request', 'Send content, edits, a title, or a recipe.');
      }
      const current = await service.store.manifest(await service.root(target, id), id);
      const recipe = recipeId === undefined
        ? await service.recipeOf(target, current)
        : await service.recipe({ ...target, scope: current.scope }, recipeId, current.type);
      const manifest = await service.update(target, id, {
        baseVersion: requiredInteger(fields, 'baseVersion'),
        content,
        edits,
        title,
        ...(recipeId === undefined ? {} : { recipe: recipeId }),
        source: { origin: 'agent', action: 'update', ...(exec.agent === undefined ? {} : { sessionId: exec.agent.id }) },
      });
      const warnings = manifest.type === 'design'
        ? (await service.read(target, id, manifest.version)).designInfo?.warnings ?? []
        : await writtenWarnings(manifest.type, content, edits === undefined && recipeId === undefined ? undefined : () => service.read(target, id, manifest.version), recipe);
      return { ...summary(manifest, target), warnings };
    },
  };

  const patch: ToolDefinition = {
    name: 'artifact_patch',
    description: [
      'Apply one layer-level change to a design without resending the whole source. Read the design first (outline: true) for layer ids, then send the complete Design JSX of one element; its single root replaces the named layer in place, keeping its position among its siblings.',
      'Patch the one screen or component you are editing. Use artifact_update instead when most of the source changes, or when the design holds component instances, which a patch refuses because a patch save would downgrade them to plain frames.',
      'The whole design is re-serialized and validated before saving, and a stale baseVersion is refused like any other write. The result carries the fresh outline, so you can chain patches without re-reading.',
    ].join('\n'),
    parameters: {
      type: 'object',
      additionalProperties: false,
      required: ['id', 'baseVersion', 'targetPath', 'patch'],
      properties: {
        id: { type: 'string', description: 'Design artifact id.' },
        baseVersion: { type: 'integer', description: 'The version your change is based on; a stale value is refused.' },
        targetPath: { type: 'string', description: 'The dotted path of the layer to replace, such as "0.1", from the outline in artifact_read or a previous patch.' },
        patch: { type: 'string', description: 'The complete Design JSX of one element, including the full subtree of the target. Exactly one root element.' },
        workspaceId: WORKSPACE_PARAM,
      },
    },
    output: {
      schema: {
        ...WRITE_SCHEMA,
        properties: { ...WRITE_SCHEMA.properties, outline: { type: 'array', items: { type: 'object' } } },
        required: [...WRITE_SCHEMA.required, 'outline'],
      },
      render: (_args, value) => {
        const fields = record(value);
        const outlineRows = Array.isArray(fields.outline) ? fields.outline : [];
        const outlineBlock = outlineRows.length === 0 ? '' : '\nOutline (paths for the next patch):\n' + outlineText(outlineRows);
        return [{ type: 'text', text: writeText(value, 'Patched') + outlineBlock }];
      },
      presentationMeta: (_args, value) => cardMeta(value),
    },
    async execute(args, exec) {
      const fields = fieldsOf(args);
      const id = requiredString(fields, 'id');
      const target = await targetFor(host, exec, id.startsWith('art_lib_') ? 'library' : undefined, optionalString(fields, 'workspaceId'));
      const manifest = await service.patchDesign(target, id, {
        baseVersion: requiredInteger(fields, 'baseVersion'),
        patch: requiredString(fields, 'patch'),
        targetPath: requiredString(fields, 'targetPath'),
        source: { origin: 'agent', action: 'update', ...(exec.agent === undefined ? {} : { sessionId: exec.agent.id }) },
      });
      const info = (await service.read(target, id, manifest.version)).designInfo;
      return { ...summary(manifest, target), warnings: info?.warnings ?? [], outline: info?.outline ?? [] };
    },
  };

  const sheetUpdate: ToolDefinition = {
    name: 'artifact_sheet_update',
    description: [
      'Edit a sheet artifact\'s cells and structure without rewriting the whole workbook JSON. Read the artifact first when the user may have edited it, then send one operations array with the current baseVersion.',
      'Operations run in order: set one cell, write a block, clear a range, format a range, merge or unmerge cells, insert, delete, or move rows and columns, add, rename, or delete a sheet, or set a column width. A string that starts with "=" is a formula in a written block. The whole workbook is validated before it is saved, and formula warnings come back with the result. Inserting, deleting, or moving rows and columns moves cells, merged ranges, column widths, and formula references.',
      'Use artifact_read for the current workbook and artifact_update when you rewrite most of it, change its title, or change the sheet structure in one batch.',
    ].join('\n'),
    parameters: {
      type: 'object',
      additionalProperties: false,
      required: ['id', 'baseVersion', 'operations'],
      properties: {
        id: { type: 'string', description: 'Sheet artifact id.' },
        baseVersion: { type: 'integer', description: 'The version you read; a stale value is refused.' },
        operations: {
          type: 'array',
          description: 'Ordered edits. set {op,sheet?,ref,value?|formula?,style?}; write {op,sheet?,ref,values}; clear {op,sheet?,range}; format {op,sheet?,range,style} where style accepts bold, italic, underline, strike, wrap, align, color, background, and numberFormat; merge {op,sheet?,range}; unmerge {op,sheet?,range}; add-sheet {op,name}; rename-sheet {op,from,to}; delete-sheet {op,name}; set-column-width {op,sheet?,column,width}; insert-rows, delete-rows, and move-rows {op,sheet?,at,count?,to?}; insert-columns, delete-columns, and move-columns {op,sheet?,at,count?,to?} where at and to are column letters.',
          items: { type: 'object' },
        },
        workspaceId: WORKSPACE_PARAM,
      },
    },
    output: {
      schema: {
        ...WRITE_SCHEMA,
        properties: {
          ...WRITE_SCHEMA.properties,
          notes: { type: 'array', items: { type: 'string' } },
          sheets: { type: 'array', items: { type: 'object' } },
        },
        required: [...WRITE_SCHEMA.required, 'notes', 'sheets'],
      },
      render: (_args, value) => {
        const fields = record(value);
        const notes = Array.isArray(fields.notes) ? fields.notes.map(String) : [];
        const sheetRows = Array.isArray(fields.sheets) ? fields.sheets.map(record) : [];
        const sheetLine = sheetRows.length === 0
          ? ''
          : '\nSheets: ' + sheetRows.map((row) => String(row.name) + ' (' + String(row.cells) + ' cells)').join('; ') + '.';
        const noteLines = notes.length === 0 ? '' : '\n' + notes.map((note) => '- ' + note).join('\n');
        return [{ type: 'text', text: writeText(value, 'Updated') + sheetLine + noteLines }];
      },
      presentationMeta: (_args, value) => cardMeta(value),
    },
    async execute(args, exec) {
      const fields = fieldsOf(args);
      const id = requiredString(fields, 'id');
      const target = await targetFor(host, exec, id.startsWith('art_lib_') ? 'library' : undefined, optionalString(fields, 'workspaceId'));
      const current = await service.read(target, id);
      if (current.manifest.type !== 'sheet') {
        throw new ArtifactError('artifact/unsupported-type', 'artifact_sheet_update works only on sheet artifacts.', { type: current.manifest.type });
      }
      let applied;
      try {
        applied = applySheetOperations(current.content, fields.operations);
      } catch (error) {
        if (error instanceof SheetError) throw new ArtifactError('artifact/invalid-sheet', error.message, { message: error.message });
        throw error;
      }
      const content = serializeSheetWorkbook(applied.workbook);
      const manifest = await service.update(target, id, {
        baseVersion: requiredInteger(fields, 'baseVersion'),
        content,
        source: { origin: 'agent', action: 'update', ...(exec.agent === undefined ? {} : { sessionId: exec.agent.id }) },
      });
      return {
        ...summary(manifest, target),
        warnings: checkSheetWorkbook(applied.workbook),
        notes: applied.notes,
        sheets: sheetOverview(applied.workbook).map((item) => ({ name: item.name, rows: item.rows, columns: item.columns, cells: item.cells, formulas: item.formulas })),
      };
    },
  };

  const list: ToolDefinition = {
    name: 'artifact_list',
    description: 'List artifacts in this project or the profile library, newest first, at most 50 per call. Pass workspaceId to list another project.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        scope: { type: 'string', enum: ['workspace', 'library'], description: 'Defaults to workspace.' },
        workspaceId: WORKSPACE_PARAM,
        type: { type: 'string', enum: ['page', 'doc', 'design', 'sheet'] },
        query: { type: 'string', description: 'Title substring, case-insensitive.' },
        recipe: { type: 'string', description: 'Only artifacts that follow this recipe.' },
        offset: { type: 'integer' },
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        required: ['items', 'total', 'hasMore'],
        properties: { items: { type: 'array', items: SUMMARY_SCHEMA }, total: { type: 'integer' }, hasMore: { type: 'boolean' } },
      },
      render: (_args, value) => {
        const fields = record(value);
        const items = Array.isArray(fields.items) ? fields.items : [];
        const lines = items.map((item) => {
          const row = record(item);
          const recipe = typeof row.recipe === 'string' ? ` [${row.recipe}]` : '';
          return `- ${String(row.id)} ${String(row.type)}${recipe} v${String(row.version)} "${String(row.title)}" (updated ${String(row.updatedAt)})`;
        });
        const head = `${items.length} of ${String(fields.total)} artifacts${fields.hasMore === true ? '; more with a higher offset' : ''}.`;
        return [{ type: 'text', text: [head, ...lines].join('\n') }];
      },
    },
    async execute(args, exec) {
      const fields = fieldsOf(args);
      const target = await targetFor(host, exec, optionalScope(fields), optionalString(fields, 'workspaceId'));
      const page = await service.list(target, {
        query: optionalString(fields, 'query'),
        type: optionalType(fields),
        recipe: optionalString(fields, 'recipe'),
        offset: optionalInteger(fields, 'offset'),
      });
      return { items: page.items.map((item) => summary(item, target)), total: page.total, hasMore: page.hasMore };
    },
  };

  const remove: ToolDefinition = {
    name: 'artifact_delete',
    description: 'Move an artifact to its scope\'s trash. Delete only when the user asks.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      required: ['id'],
      properties: { id: { type: 'string' }, workspaceId: WORKSPACE_PARAM },
    },
    output: {
      schema: { type: 'object', additionalProperties: false, required: ['id', 'trashPath'], properties: { id: { type: 'string' }, trashPath: { type: 'string' } } },
      render: (_args, value) => [{ type: 'text', text: `Moved ${String(record(value).id)} to ${String(record(value).trashPath)}.` }],
    },
    async execute(args, exec) {
      const fields = fieldsOf(args);
      const id = requiredString(fields, 'id');
      const target = await targetFor(host, exec, id.startsWith('art_lib_') ? 'library' : undefined, optionalString(fields, 'workspaceId'));
      const result = await service.remove(target, id);
      return { id, trashPath: result.trashPath };
    },
  };

  const exportTool: ToolDefinition = {
    name: 'artifact_export',
    description:
      'Write an artifact to a standalone file and return its path. A page exports as html; a doc exports as md, docx, or printable html; a design exports as png, svg, .fig, a self-contained view-only html viewer, or a smaller html page with an svg scene and selectable text; a sheet exports as csv (one sheet, the first by default) or xlsx (every sheet). Pass path to export one design frame, component, or layer as png or svg at its own size.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      required: ['id', 'format'],
      properties: { id: { type: 'string' }, format: { type: 'string', enum: ['html', 'md', 'docx', 'png', 'svg', 'fig', 'html-svg', 'csv', 'xlsx'] },
        version: { type: 'integer', minimum: 1, description: 'Saved version to export. Omit for the current version.' },
        sheet: { type: 'string', description: 'Sheet name for a CSV export. Defaults to the first sheet. XLSX exports every sheet.' },
        path: { type: 'string', description: 'Dotted layer path from the artifact_read outline, to export one design frame, component, or layer on its own. Works only with png and svg; SVG text does not wrap, so use artifact_preview to judge layout.' },
        workspaceId: WORKSPACE_PARAM },
    },
    output: {
      schema: { type: 'object', additionalProperties: false, required: ['path', 'bytes'], properties: { path: { type: 'string' }, bytes: { type: 'integer' } } },
      render: (_args, value) => [{ type: 'text', text: `Exported ${String(record(value).bytes)} bytes to ${String(record(value).path)}.` }],
    },
    async execute(args, exec) {
      const fields = fieldsOf(args);
      const id = requiredString(fields, 'id');
      const target = await targetFor(host, exec, id.startsWith('art_lib_') ? 'library' : undefined, optionalString(fields, 'workspaceId'));
      const file = await service.export(target, id, requiredFormat(fields), optionalInteger(fields, 'version'), optionalString(fields, 'sheet'), optionalString(fields, 'path'));
      return { path: file.path, bytes: file.bytes };
    },
  };

  const importTool: ToolDefinition = {
    name: 'artifact_import',
    description:
      'Import a Figma .fig file as a new design the user calls a mockup. The file\'s first page with elements becomes the editable Design JSX source; later pages are skipped and named in warnings. Pass the absolute file path the user named. Use it when the user points at a .fig file instead of asking for a fresh mockup.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      required: ['path'],
      properties: {
        path: { type: 'string', description: 'Absolute path of the .fig file to read.' },
        title: { type: 'string', description: 'Short title, 1 to 120 characters. Defaults to the file name.' },
        ...DESIGN_SELECTION,
        scope: SCOPE_PARAM,
        workspaceId: WORKSPACE_PARAM,
      },
    },
    output: {
      schema: { type: 'object', additionalProperties: false, required: [...WRITE_SCHEMA.required, 'warnings'], properties: { ...WRITE_SCHEMA.properties, warnings: { type: 'array', items: { type: 'string' } } } },
      render: (_args, value) => [{ type: 'text', text: writeText(value, 'Imported') }],
      presentationMeta: (_args, value) => cardMeta(value),
    },
    async execute(args, exec) {
      const fields = fieldsOf(args);
      const target = await targetFor(host, exec, optionalScope(fields), optionalString(fields, 'workspaceId'));
      const manifest = await service.importDesign(target, {
        path: requiredString(fields, 'path'),
        title: optionalString(fields, 'title'),
        source: { origin: 'agent', action: 'create', ...(exec.agent === undefined ? {} : { sessionId: exec.agent.id }) },
      });
      const warnings = (await service.read(target, manifest.id)).designInfo?.warnings ?? [];
      return { ...summary(manifest, target), warnings };
    },
  };
  const designRead: ToolDefinition = {
    name: 'design_system_read',
    description:
      'Read the design tokens that pages and docs in this project inherit, and whether they come from the project, the profile library, or the built-in default.',
    parameters: { type: 'object', additionalProperties: false, properties: { workspaceId: WORKSPACE_PARAM, scope: SCOPE_PARAM, ...DESIGN_SELECTION } },
    output: {
      schema: { type: 'object', additionalProperties: false, required: ['source', 'tokens'], properties: { source: { type: 'string' }, tokens: { type: 'string' }, ...DESIGN_IDENTITY } },
      render: (_args, value) => [{ type: 'text', text: `Design system from ${String(record(value).source)}:\n${String(record(value).tokens)}` }],
    },
    async execute(args, exec) {
      const fields = fieldsOf(args);
      const workspaceId = optionalString(fields, 'workspaceId');
      const target = await targetFor(host, exec, optionalScope(fields), workspaceId).catch((error: unknown) => {
        // A session outside every workspace can still read the library. A named
        // workspace that does not resolve is a real failure.
        if (workspaceId === undefined && error instanceof ArtifactError && error.code === 'artifact/no-workspace') return {};
        throw error;
      });
      const resolved = await service.designSystem(target, designSelection(fields));
      return { source: resolved.source, tokens: JSON.stringify(resolved.tokens, null, 2), system: resolved.system ? { ...resolved.system } : null, catalogRevision: resolved.catalogRevision ?? null };
    },
  };

  const designUpdate: ToolDefinition = {
    name: 'design_system_update',
    description:
      'Change design tokens. Send only the fields to change; the rest keep their current values. Values must be plain CSS values such as #1a4d8f or "Inter, sans-serif". Change the design system only when the user asks for a brand or style that should apply to every artifact.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      required: ['tokens'],
      properties: {
        systemId: DESIGN_SELECTION.systemId,
        expectedRevision: { type: 'integer', minimum: 0, description: 'Catalog revision from design_system_list, required for named saves.' },
        createNew: { type: 'boolean', description: 'Save a new named system, leaving existing systems unchanged.' },
        makeDefault: { type: 'boolean', description: 'Select this system for future artifacts. Existing pinned artifacts do not change.' },
        tokens: {
          type: 'object',
          description:
            'Partial tokens: name, notes, colors and colorsDark {primary, accent, surface, text, muted, background, raised, border, control, action, actionText, focus, success, warning, danger}, typography {fontFamily, displayFamily, monoFamily, scale[]}, spacing {unit, scale[]}, radius {sm, md, lg}. Sizes are pixels.',
        },
        scope: {
          type: 'string',
          enum: ['workspace', 'library'],
          description: 'workspace (default) overrides tokens for this project only. library changes the profile default every project inherits.',
        },
        workspaceId: WORKSPACE_PARAM,
      },
    },
    output: {
      schema: { type: 'object', additionalProperties: false, required: ['scope', 'tokens'], properties: { scope: { type: 'string' }, tokens: { type: 'string' }, ...DESIGN_IDENTITY } },
      render: (_args, value) => [{ type: 'text', text: `Saved ${String(record(value).scope)} design system:\n${String(record(value).tokens)}` }],
    },
    async execute(args, exec) {
      const fields = fieldsOf(args);
      const target = await targetFor(host, exec, optionalScope(fields), optionalString(fields, 'workspaceId'));
      const saved = await service.saveDesignSystem(target, fields.tokens, designSaveOptions(fields));
      return { scope: saved.scope, tokens: JSON.stringify(saved.tokens, null, 2), system: saved.system ? { ...saved.system } : null, catalogRevision: saved.catalogRevision ?? null };
    },
  };

  const brief: ToolDefinition = {
    name: 'artifact_brief',
    description: [
      'Get the selected type\'s authoring instructions, examples, quality checks, and saved conventions before artifact_create or a layout or styling update. Applicable briefs include recipe rules, earlier artifacts, design context, and the page kit.',
      'For page, doc, and design, omit recipe to list compatible recipes, then call again with the chosen id and pass it to artifact_create. For sheet, call once without recipe; sheets do not use recipes. Current defaults do not replace an existing artifact\'s pinned settings.',
    ].join('\n'),
    parameters: {
      type: 'object',
      additionalProperties: false,
      required: ['type'],
      properties: {
        type: { type: 'string', enum: ['page', 'doc', 'design', 'sheet'] },
        recipe: { type: 'string', description: 'A recipe id for page, doc, or design. Omit to list compatible recipes. Always omit for sheet.' },
        ...DESIGN_SELECTION,
        scope: SCOPE_PARAM,
        workspaceId: WORKSPACE_PARAM,
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        required: ['brief', 'recipe'],
        properties: { brief: { type: 'string' }, recipe: { oneOf: [{ type: 'string' }, { type: 'null' }] } },
      },
      render: (_args, value) => [{ type: 'text', text: String(record(value).brief) }],
    },
    async execute(args, exec) {
      const fields = fieldsOf(args);
      const workspaceId = optionalString(fields, 'workspaceId');
      const scope = optionalScope(fields);
      const target = await targetFor(host, exec, scope, workspaceId).catch((error: unknown) => {
        // Outside every workspace the library guide and recipes still apply.
        if (workspaceId === undefined && scope !== 'workspace' && error instanceof ArtifactError && error.code === 'artifact/no-workspace') return { scope: 'library' as const };
        throw error;
      });
      const result = await service.brief(target, requiredType(fields), optionalString(fields, 'recipe'), designSelection(fields));
      return { brief: result.brief, recipe: result.recipe?.id ?? null };
    },
  };

  const guideUpdate: ToolDefinition = {
    name: 'artifact_guide_update',
    description: [
      'Save conventions the user wants every future artifact to follow, or a reusable recipe. Call it only when the user asks to remember a preference, a convention, or a structure; never for a one-off request.',
      'scope workspace (default) is this project\'s conventions. scope library is the user\'s preferences in every project. instructions replaces that scope\'s whole text, so read the current text in artifact_brief and send the full result.',
      'A recipe with the id of a built-in or wider recipe replaces it in this scope.',
    ].join('\n'),
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        instructions: { type: 'string', description: `The complete conventions text for this scope, up to ${MAX_INSTRUCTIONS} characters. Short, concrete, checkable rules.` },
        recipe: {
          type: 'object',
          description: 'A recipe to add or replace: { id, name, types: ["page"|"doc"|"design"], audience, purpose, sections: [{ key, title, purpose, required }], rules: [string] }.',
        },
        removeRecipe: { type: 'string', description: 'The id of a recipe in this scope to remove.' },
        scope: SCOPE_PARAM,
        workspaceId: WORKSPACE_PARAM,
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        required: ['scope', 'instructions', 'recipes'],
        properties: { scope: { type: 'string' }, instructions: { type: 'string' }, recipes: { type: 'array', items: { type: 'string' } } },
      },
      render: (_args, value) => {
        const fields = record(value);
        const recipes = Array.isArray(fields.recipes) && fields.recipes.length > 0 ? fields.recipes.map(String).join(', ') : 'none';
        return [{ type: 'text', text: `Saved the ${String(fields.scope)} guide. Recipes in this scope: ${recipes}.` }];
      },
    },
    async execute(args, exec) {
      const fields = fieldsOf(args);
      const instructions = optionalString(fields, 'instructions');
      const removeRecipe = optionalString(fields, 'removeRecipe');
      const recipe = fields.recipe ?? undefined;
      if (instructions === undefined && removeRecipe === undefined && recipe === undefined) {
        throw new ArtifactError('artifact/bad-request', 'Send instructions, a recipe, or removeRecipe.');
      }
      const target = await targetFor(host, exec, optionalScope(fields), optionalString(fields, 'workspaceId'));
      const patch: GuidePatch = {
        ...(instructions === undefined ? {} : { instructions }),
        ...(recipe === undefined ? {} : { recipe }),
        ...(removeRecipe === undefined ? {} : { removeRecipe }),
      };
      const saved = await service.saveGuide(target, patch);
      return { scope: saved.scope, instructions: saved.guide.instructions, recipes: saved.guide.recipes.map((item) => item.id) };
    },
  };

  const designList: ToolDefinition = {
    name: 'design_system_list',
    description: 'List named design systems in one scope, its default ID, and catalog revision. Read before creating or updating a named system. Library and workspace catalogs are separate.',
    parameters: { type: 'object', additionalProperties: false, properties: { scope: SCOPE_PARAM, workspaceId: WORKSPACE_PARAM } },
    output: { schema: { type: 'object', properties: { scope: { type: 'string' }, revision: { type: 'integer' }, defaultId: { oneOf: [{ type: 'string' }, { type: 'null' }] }, systems: { type: 'array', items: { type: 'object' } } } }, render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }] },
    async execute(args, exec) {
      const fields = fieldsOf(args);
      const target = await targetFor(host, exec, optionalScope(fields), optionalString(fields, 'workspaceId'));
      const catalog = await service.listDesignSystems(target);
      return { ...catalog, systems: catalog.systems.map(system => ({ ...system })) };
    },
  };
  const rebase: ToolDefinition = {
    name: 'artifact_rebase',
    description: 'Explicitly adopt current or selected design-system and recipe settings for a Page or Document, appending one version without changing content. Ordinary edits preserve pinned settings. Call only when the user requests a design/recipe refresh. Read first and pass baseVersion.',
    parameters: { type: 'object', additionalProperties: false, required: ['id','baseVersion'], properties: { id: { type: 'string' }, baseVersion: { type: 'integer' }, recipe: RECIPE_PARAM, ...DESIGN_SELECTION, workspaceId: WORKSPACE_PARAM } },
    output: { schema: WRITE_SCHEMA, render: (_args, value) => [{ type: 'text', text: writeText(value, 'Rebased') }], presentationMeta: (_args, value) => cardMeta(value) },
    async execute(args, exec) {
      const fields = fieldsOf(args);
      const id = requiredString(fields, 'id');
      const target = await targetFor(host, exec, id.startsWith('art_lib_') ? 'library' : undefined, optionalString(fields, 'workspaceId'));
      const manifest = await service.rebase(target, id, { baseVersion: requiredInteger(fields, 'baseVersion'), recipe: optionalString(fields, 'recipe'), design: designSelection(fields), source: { origin: 'agent', action: 'rebase', ...(exec.agent ? { sessionId: exec.agent.id } : {}) } });
      return { ...summary(manifest, target), warnings: [] };
    },
  };
  return [create, read, update, patch, sheetUpdate, list, remove, importTool, exportTool, designRead, designUpdate, brief, guideUpdate, designList, rebase];
}

/** The services the preview tool needs beyond the artifact host. */
export interface PreviewServices {
  /** Durable image storage; the tool registers only while this is mounted. */
  readonly attachments: {
    saveImages(inputs: readonly { data: Uint8Array; mediaType: string; name?: string }[]): Promise<readonly {
      attachmentId: string;
      mediaType: string;
      bytes: number;
      width: number;
      height: number;
    }[]>;
  };
  /** Model routes, to gate on the calling route's image capability. */
  readonly llm: {
    resolveModelInfo(provider: string, model: string, signal: AbortSignal): Promise<{ inputModalities?: readonly string[] }>;
  };
}

/**
 * Require the calling route to declare image input, so the render reaches the
 * model instead of returning a result it cannot see.
 * @param exec the execution.
 * @param services the preview services.
 */
async function assertImageVisible(exec: ToolExec, services: PreviewServices): Promise<void> {
  const routed = exec.agent?.session?.requestHeader?.().config;
  const provider = routed?.provider;
  const model = routed?.model;
  if (provider === undefined || model === undefined) {
    throw new ArtifactError('artifact/preview-invisible', 'The current model route could not be resolved, so a preview cannot be shown to you. Rely on the design warnings instead.');
  }
  const active = await services.llm.resolveModelInfo(provider, model, exec.signal);
  if (active.inputModalities === undefined || !active.inputModalities.includes('image')) {
    throw new ArtifactError('artifact/preview-invisible', `Model "${model}" does not accept image input, so it cannot see a preview. Rely on the design warnings instead.`);
  }
}

/**
 * The `artifact_preview` tool: render a design and return the image beside the
 * result text, so the model can check the visual result itself. Registered only
 * while durable image storage and model routes are mounted.
 * @param host the artifact services.
 * @param services the image and route services.
 * @returns the tool definition.
 */
export function createPreviewTool(host: ToolHost, services: PreviewServices): ToolDefinition {
  const { service } = host;
  return {
    name: 'artifact_preview',
    description: [
      'Render design content and return the image beside the result, so you can check the visual result yourself: layout, spacing, alignment, contrast, clipping, and that every requested state exists.',
      'Pass the complete content and no id to check a draft before its first save; that writes no version. Pass an id and optionally a version to render a saved design.',
      'Pass path from the artifact_read outline to render one frame, component, or layer on its own at its own size, so a large canvas is not downscaled.',
      'The calling model route must accept image input; the tool refuses on routes that cannot see images.',
    ].join('\n'),
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        id: { type: 'string', description: 'Design artifact id. Omit when checking unsaved content.' },
        version: { type: 'integer', minimum: 1, description: 'Saved version to render. Omit for the current version.' },
        content: { type: 'string', description: 'Complete Design JSX to render without saving, for a draft check. Takes precedence over id.' },
        path: { type: 'string', description: 'Dotted layer path from the artifact_read outline, to render one frame, component, or layer instead of the whole design. Works with a saved id or unsaved content.' },
        workspaceId: WORKSPACE_PARAM,
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        required: ['title', 'width', 'height', 'image'],
        properties: {
          id: { type: 'string' },
          title: { type: 'string' },
          version: { type: 'integer' },
          name: { type: 'string' },
          width: { type: 'integer' },
          height: { type: 'integer' },
          warnings: { type: 'array', items: { type: 'string' } },
          image: {
            type: 'object',
            additionalProperties: false,
            required: ['attachmentId', 'mediaType', 'bytes', 'width', 'height'],
            properties: {
              attachmentId: { type: 'string' },
              mediaType: { type: 'string' },
              bytes: { type: 'integer' },
              width: { type: 'integer' },
              height: { type: 'integer' },
            },
          },
        },
      },
      render: (_args, value) => {
        const fields = record(value);
        const image = record(fields.image ?? null);
        const warnings = Array.isArray(fields.warnings) ? fields.warnings.map(String) : [];
        const version = fields.version;
        const label = version === undefined ? 'unsaved draft' : 'version ' + String(version);
        const name = typeof fields.name === 'string' ? fields.name : undefined;
        const subject = name === undefined ? String(fields.title) : `layer "${name}" in ${String(fields.title)}`;
        const head = `Preview of ${subject} (${label}): ${String(image.width)}x${String(image.height)} px. The image rides beside this text; check layout, spacing, alignment, and text fit against what the user asked for.`;
        const warningLines = warnings.length === 0 ? '' : '\nWarnings:\n' + warnings.map((item) => '- ' + item).join('\n');
        return [
          { type: 'text', text: head + warningLines },
          {
            type: 'image',
            attachment: {
              attachmentId: String(image.attachmentId),
              mediaType: String(image.mediaType),
              bytes: Number(image.bytes),
              width: Number(image.width),
              height: Number(image.height),
            },
          },
        ];
      },
    },
    async execute(args, exec) {
      const fields = fieldsOf(args);
      const content = optionalString(fields, 'content');
      const id = optionalString(fields, 'id');
      const path = optionalString(fields, 'path');
      if (content === undefined && id === undefined) {
        throw new ArtifactError('artifact/bad-request', 'Pass the design id to preview a saved design, or the complete content to preview a draft.');
      }
      await assertImageVisible(exec, services);
      let title: string;
      let version: number | undefined;
      let preview: PreviewResult;
      if (content !== undefined) {
        title = 'Draft mockup';
        preview = await service.previewSource(content, path);
      } else {
        const target = await targetFor(host, exec, String(id).startsWith('art_lib_') ? 'library' : undefined, optionalString(fields, 'workspaceId'));
        const manifest = await service.store.manifest(await service.root(target, String(id)), String(id));
        version = optionalInteger(fields, 'version') ?? manifest.version;
        title = manifest.title;
        preview = await service.preview(target, String(id), version, path);
      }
      const refs = await services.attachments.saveImages([
        {
          data: Buffer.from(preview.data, 'base64'),
          mediaType: 'image/png',
          name: preview.name === undefined ? String(preview.info.nodes) + '-node design preview' : preview.name + ' layer preview',
        },
      ]);
      const ref = refs[0];
      if (ref === undefined) throw new ArtifactError('artifact/design-render-failed', 'The preview image was not stored.');
      return {
        ...(content !== undefined || id === undefined ? {} : { id }),
        ...(version === undefined ? {} : { version }),
        ...(preview.name === undefined ? {} : { name: preview.name }),
        title,
        width: preview.width,
        height: preview.height,
        warnings: preview.info.warnings,
        image: { attachmentId: ref.attachmentId, mediaType: ref.mediaType, bytes: ref.bytes, width: ref.width, height: ref.height },
      };
    },
  };
}
