import { ArtifactError } from './errors.js';
import type { ArtifactService, Target } from './service.js';
import type { EndpointHandler, EndpointResult } from './types.js';
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
import type { Fields } from './validate.js';

/** Every endpoint the route serves. */
export const ENDPOINTS = [
  'list',
  'get',
  'create',
  'update',
  'delete',
  'history',
  'restore',
  'export',
  'printable',
  'designSystem',
  'saveDesignSystem',
  'clearDesignSystem',
] as const;

type Endpoint = (typeof ENDPOINTS)[number];

/**
 * The scope context of a request. A library request may carry a workspace id;
 * it is kept so the design system still resolves the workspace override.
 * @param fields the request.
 * @returns the target.
 */
function targetOf(fields: Fields): Target {
  const workspaceId = optionalString(fields, 'workspaceId');
  const scope = optionalScope(fields);
  return {
    ...(workspaceId === undefined || workspaceId === '' ? {} : { workspaceId }),
    ...(scope === undefined ? {} : { scope }),
  };
}

/**
 * Run one endpoint. Every browser write is recorded as a user version.
 * @param service the artifact service.
 * @param endpoint the endpoint.
 * @param fields the request.
 * @returns the endpoint value.
 */
async function dispatch(service: ArtifactService, endpoint: Endpoint, fields: Fields): Promise<unknown> {
  const target = targetOf(fields);
  const user = { origin: 'user' as const };
  switch (endpoint) {
    case 'list':
      return service.list(target, {
        query: optionalString(fields, 'query'),
        type: optionalType(fields),
        offset: optionalInteger(fields, 'offset'),
        limit: optionalInteger(fields, 'limit'),
      });
    case 'get':
      return service.read(target, requiredString(fields, 'id'), optionalInteger(fields, 'version'));
    case 'create':
      return {
        manifest: await service.create(target, {
          type: requiredType(fields),
          title: requiredString(fields, 'title'),
          content: optionalString(fields, 'content') ?? '',
          source: { ...user, action: 'create' },
        }),
      };
    case 'update':
      return {
        manifest: await service.update(target, requiredString(fields, 'id'), {
          baseVersion: requiredInteger(fields, 'baseVersion'),
          content: optionalString(fields, 'content'),
          edits: optionalEdits(fields),
          title: optionalString(fields, 'title'),
          source: { ...user, action: 'update' },
        }),
      };
    case 'delete':
      return service.remove(target, requiredString(fields, 'id'));
    case 'history':
      return { versions: await service.history(target, requiredString(fields, 'id')) };
    case 'restore':
      return {
        manifest: await service.restore(
          target,
          requiredString(fields, 'id'),
          requiredInteger(fields, 'version'),
          { ...user, action: 'restore' },
          optionalInteger(fields, 'baseVersion'),
        ),
      };
    case 'export':
      return service.export(target, requiredString(fields, 'id'), requiredFormat(fields));
    case 'printable':
      return service.printable(target, requiredString(fields, 'id'));
    case 'designSystem':
      return service.designSystem(target);
    case 'saveDesignSystem':
      return service.saveDesignSystem(target, fields.tokens);
    case 'clearDesignSystem':
      return service.clearWorkspaceDesignSystem(target);
    default: {
      const unreachable: never = endpoint;
      throw new ArtifactError('artifact/not-found', `Unknown endpoint ${String(unreachable)}.`);
    }
  }
}

/**
 * Tell an endpoint name from an unknown string.
 * @param value the requested endpoint.
 * @returns whether the route serves it.
 */
function isEndpoint(value: string): value is Endpoint {
  return ENDPOINTS.some((endpoint) => endpoint === value);
}

/**
 * Build the handler the route calls. Failures become stable `artifact/*` codes.
 * @param service the artifact service.
 * @returns the handler.
 */
export function createHandler(service: ArtifactService): EndpointHandler {
  return async (endpoint, payload): Promise<EndpointResult> => {
    try {
      if (!isEndpoint(endpoint)) throw new ArtifactError('artifact/not-found', `Unknown endpoint ${endpoint}.`);
      return { ok: true, value: await dispatch(service, endpoint, fieldsOf(payload)) };
    } catch (error) {
      if (error instanceof ArtifactError) {
        return { ok: false, error: { code: error.code, message: error.message, details: error.details } };
      }
      console.error('[dsh-artifacts] request failed', endpoint, error instanceof Error ? error.message : error);
      return {
        ok: false,
        error: { code: 'artifact/storage-failure', message: 'The artifact request failed.', details: {} },
      };
    }
  };
}
