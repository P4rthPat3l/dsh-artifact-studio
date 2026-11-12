import type { Manifest, Scope } from '../../contract.js';
import { ArtifactError } from './errors.js';
import { workspaceForSession } from './paths.js';
import type { ArtifactService, Target } from './service.js';
import type { WorkspaceRegistry } from './types.js';
import {
  fieldsOf,
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

/** A JSON value, as tool outputs and presentation meta must be. */
export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

/** The calling agent: its id is the session id. */
export interface ToolAgent {
  readonly id: string;
}

/** The execution context the tool registry passes. */
export interface ToolExec {
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
    render(args: unknown, value: JsonValue): TextBlock[];
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
    'workspace (default) stores it in this project under .dsh/artifacts. library stores it in the user profile, shared by every project; use it only when the user asks for something reusable across projects.',
};

const PAGE_GUIDE = [
  'A page is one self-contained HTML document rendered in a sandbox with no network: external scripts, stylesheets, fonts, images, and fetch are blocked. Inline all CSS and JavaScript, draw charts with inline SVG or canvas, and embed images as data: URIs.',
  'Pages receive the design system as CSS custom properties: --artifact-color-primary, -accent, -surface, -text, -muted; --artifact-font-family; --artifact-font-mono; --artifact-font-size-0 to -6; --artifact-space-0 to -6; --artifact-radius-sm, -md, -lg. Use them instead of hard-coded colors and fonts.',
  'A doc is Markdown: headings, lists, task lists, links, tables, quotes, and fenced code.',
].join('\n');

/**
 * The scope context of a call: the session's workspace, plus an explicit scope.
 * @param host the tool host.
 * @param exec the execution.
 * @param scope an explicit scope.
 * @returns the target.
 */
async function targetFor(host: ToolHost, exec: ToolExec, scope: Scope | undefined): Promise<Target> {
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
  };
}

const SUMMARY_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'scope', 'type', 'title', 'version', 'updatedAt', 'contentBytes', 'workspaceId'],
  properties: {
    id: { type: 'string' },
    scope: { type: 'string', enum: ['workspace', 'library'] },
    type: { type: 'string', enum: ['page', 'doc'] },
    title: { type: 'string' },
    version: { type: 'integer' },
    updatedAt: { type: 'string' },
    contentBytes: { type: 'integer' },
    workspaceId: { oneOf: [{ type: 'string' }, { type: 'null' }] },
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
  return `${verb} ${String(fields.type)} "${String(fields.title)}" id=${String(fields.id)} scope=${String(fields.scope)} version=${String(fields.version)}.`;
}

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
      '',
      PAGE_GUIDE,
    ].join('\n'),
    parameters: {
      type: 'object',
      additionalProperties: false,
      required: ['type', 'title', 'content'],
      properties: {
        type: { type: 'string', enum: ['page', 'doc'], description: 'page for HTML, doc for Markdown.' },
        title: { type: 'string', description: 'Short title, 1 to 120 characters.' },
        content: { type: 'string', description: 'The full HTML document or Markdown text, up to 2 MiB.' },
        scope: SCOPE_PARAM,
      },
    },
    output: {
      schema: SUMMARY_SCHEMA,
      render: (_args, value) => [{ type: 'text', text: `${line(value, 'Created')} The user sees a card with an Open action.` }],
      presentationMeta: (_args, value) => cardMeta(value),
    },
    async execute(args, exec) {
      const fields = fieldsOf(args);
      const target = await targetFor(host, exec, optionalScope(fields));
      const manifest = await service.create(target, {
        type: requiredType(fields),
        title: requiredString(fields, 'title'),
        content: optionalString(fields, 'content') ?? '',
        source: { origin: 'agent', action: 'create', ...(exec.agent === undefined ? {} : { sessionId: exec.agent.id }) },
      });
      return summary(manifest, target);
    },
  };

  const read: ToolDefinition = {
    name: 'artifact_read',
    description:
      'Read an artifact\'s current content and version, or an earlier version. Read before updating an artifact the user may have edited.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      required: ['id'],
      properties: {
        id: { type: 'string', description: 'Artifact id from artifact_create or artifact_list.' },
        version: { type: 'integer', description: 'An earlier version to read. Omit for the current one.' },
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        required: ['artifact', 'readVersion', 'content'],
        properties: { artifact: SUMMARY_SCHEMA, readVersion: { type: 'integer' }, content: { type: 'string' } },
      },
      render: (_args, value) => {
        const fields = record(value);
        const artifact = record(fields.artifact ?? null);
        return [
          {
            type: 'text',
            text: `${line(artifact, 'Artifact')} Showing version ${String(fields.readVersion)}.\n\n${String(fields.content)}`,
          },
        ];
      },
    },
    async execute(args, exec) {
      const fields = fieldsOf(args);
      const id = requiredString(fields, 'id');
      const target = await targetFor(host, exec, id.startsWith('art_lib_') ? 'library' : undefined);
      const result = await service.read(target, id, optionalInteger(fields, 'version'));
      return { artifact: summary(result.manifest, target), readVersion: result.version, content: result.content };
    },
  };

  const update: ToolDefinition = {
    name: 'artifact_update',
    description:
      'Save a new version of an artifact, either with complete new content or with exact text edits. The update is refused when baseVersion is not the current version, for example after the user edited it; read it again and reapply your change.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      required: ['id', 'baseVersion'],
      properties: {
        id: { type: 'string' },
        baseVersion: { type: 'integer', description: 'The version your change is based on.' },
        content: { type: 'string', description: 'Complete replacement content. Use this or edits.' },
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
      },
    },
    output: {
      schema: SUMMARY_SCHEMA,
      render: (_args, value) => [{ type: 'text', text: line(value, 'Updated') }],
      presentationMeta: (_args, value) => cardMeta(value),
    },
    async execute(args, exec) {
      const fields = fieldsOf(args);
      const id = requiredString(fields, 'id');
      const target = await targetFor(host, exec, id.startsWith('art_lib_') ? 'library' : undefined);
      const content = optionalString(fields, 'content');
      const edits = optionalEdits(fields);
      const title = optionalString(fields, 'title');
      if (content === undefined && edits === undefined && title === undefined) {
        throw new ArtifactError('artifact/bad-request', 'Send content, edits, or a title.');
      }
      const manifest = await service.update(target, id, {
        baseVersion: requiredInteger(fields, 'baseVersion'),
        content,
        edits,
        title,
        source: { origin: 'agent', action: 'update', ...(exec.agent === undefined ? {} : { sessionId: exec.agent.id }) },
      });
      return summary(manifest, target);
    },
  };

  const list: ToolDefinition = {
    name: 'artifact_list',
    description: 'List artifacts in this project or the profile library, newest first, at most 50 per call.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        scope: { type: 'string', enum: ['workspace', 'library'], description: 'Defaults to workspace.' },
        type: { type: 'string', enum: ['page', 'doc'] },
        query: { type: 'string', description: 'Title substring, case-insensitive.' },
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
          return `- ${String(row.id)} ${String(row.type)} v${String(row.version)} "${String(row.title)}" (updated ${String(row.updatedAt)})`;
        });
        const head = `${items.length} of ${String(fields.total)} artifacts${fields.hasMore === true ? '; more with a higher offset' : ''}.`;
        return [{ type: 'text', text: [head, ...lines].join('\n') }];
      },
    },
    async execute(args, exec) {
      const fields = fieldsOf(args);
      const target = await targetFor(host, exec, optionalScope(fields));
      const page = await service.list(target, {
        query: optionalString(fields, 'query'),
        type: optionalType(fields),
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
      properties: { id: { type: 'string' } },
    },
    output: {
      schema: { type: 'object', additionalProperties: false, required: ['id', 'trashPath'], properties: { id: { type: 'string' }, trashPath: { type: 'string' } } },
      render: (_args, value) => [{ type: 'text', text: `Moved ${String(record(value).id)} to ${String(record(value).trashPath)}.` }],
    },
    async execute(args, exec) {
      const fields = fieldsOf(args);
      const id = requiredString(fields, 'id');
      const target = await targetFor(host, exec, id.startsWith('art_lib_') ? 'library' : undefined);
      const result = await service.remove(target, id);
      return { id, trashPath: result.trashPath };
    },
  };

  const exportTool: ToolDefinition = {
    name: 'artifact_export',
    description:
      'Write an artifact to a standalone file and return its path. A page exports as html; a doc exports as md, docx, or printable html.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      required: ['id', 'format'],
      properties: { id: { type: 'string' }, format: { type: 'string', enum: ['html', 'md', 'docx'] } },
    },
    output: {
      schema: { type: 'object', additionalProperties: false, required: ['path', 'bytes'], properties: { path: { type: 'string' }, bytes: { type: 'integer' } } },
      render: (_args, value) => [{ type: 'text', text: `Exported ${String(record(value).bytes)} bytes to ${String(record(value).path)}.` }],
    },
    async execute(args, exec) {
      const fields = fieldsOf(args);
      const id = requiredString(fields, 'id');
      const target = await targetFor(host, exec, id.startsWith('art_lib_') ? 'library' : undefined);
      const file = await service.export(target, id, requiredFormat(fields));
      return { path: file.path, bytes: file.bytes };
    },
  };

  const designRead: ToolDefinition = {
    name: 'design_system_read',
    description:
      'Read the design tokens that pages and docs in this project inherit, and whether they come from the project, the profile library, or the built-in default.',
    parameters: { type: 'object', additionalProperties: false, properties: {} },
    output: {
      schema: { type: 'object', additionalProperties: false, required: ['source', 'tokens'], properties: { source: { type: 'string' }, tokens: { type: 'string' } } },
      render: (_args, value) => [{ type: 'text', text: `Design system from ${String(record(value).source)}:\n${String(record(value).tokens)}` }],
    },
    async execute(_args, exec) {
      const target = await targetFor(host, exec, undefined).catch((error: unknown) => {
        if (error instanceof ArtifactError && error.code === 'artifact/no-workspace') return {};
        throw error;
      });
      const resolved = await service.designSystem(target);
      return { source: resolved.source, tokens: JSON.stringify(resolved.tokens, null, 2) };
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
        tokens: {
          type: 'object',
          description:
            'Partial tokens: name, notes, colors {primary, accent, surface, text, muted}, typography {fontFamily, monoFamily, scale[]}, spacing {unit, scale[]}, radius {sm, md, lg}. Sizes are pixels.',
        },
        scope: {
          type: 'string',
          enum: ['workspace', 'library'],
          description: 'workspace (default) overrides tokens for this project only. library changes the profile default every project inherits.',
        },
      },
    },
    output: {
      schema: { type: 'object', additionalProperties: false, required: ['scope', 'tokens'], properties: { scope: { type: 'string' }, tokens: { type: 'string' } } },
      render: (_args, value) => [{ type: 'text', text: `Saved ${String(record(value).scope)} design system:\n${String(record(value).tokens)}` }],
    },
    async execute(args, exec) {
      const fields = fieldsOf(args);
      const target = await targetFor(host, exec, optionalScope(fields));
      const saved = await service.saveDesignSystem(target, fields.tokens);
      return { scope: saved.scope, tokens: JSON.stringify(saved.tokens, null, 2) };
    },
  };

  return [create, read, update, list, remove, exportTool, designRead, designUpdate];
}
