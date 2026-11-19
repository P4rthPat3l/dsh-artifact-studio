import fs from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Route, WebServer } from './types.js';

/** The URL prefix the whiteboard chunk fetches its fonts and worker files from. */
export const BOARD_ASSET_PREFIX = '/artifacts-whiteboard';

/** Where the build copies the whiteboard assets, beside the compiled host. */
const BOARD_ROOT = fileURLToPath(new URL('../../../assets/whiteboard/', import.meta.url));

/** The manifest the build writes, so the route serves only known files. */
const MANIFEST = path.join(BOARD_ROOT, 'manifest.json');

let allowlist: ReadonlyMap<string, string> | null = null;

/**
 * Read the file allowlist once. Every name is relative and has no traversal.
 * @returns the name to media type map.
 */
async function files(): Promise<ReadonlyMap<string, string>> {
  if (allowlist !== null) return allowlist;
  let names: unknown;
  try {
    names = JSON.parse(await fs.readFile(MANIFEST, 'utf8'));
  } catch {
    names = [];
  }
  const map = new Map<string, string>();
  if (Array.isArray(names)) {
    for (const value of names) {
      if (typeof value !== 'string' || value === '' || value.includes('..') || value.includes('\\') || value.startsWith('/')) continue;
      const extension = path.extname(value);
      const mediaType = extension === '.woff2'
        ? 'font/woff2'
        : extension === '.js' ? 'text/javascript' : extension === '.json' ? 'application/json' : null;
      if (mediaType !== null) map.set(value, mediaType);
    }
  }
  allowlist = map;
  return map;
}

/**
 * Answer one request for a whiteboard asset. Only names in the build manifest
 * are served; nothing else from the request can reach the filesystem.
 * @param request the request.
 * @param response the response.
 */
export async function handleBoardAsset(request: IncomingMessage, response: ServerResponse): Promise<void> {
  const method = request.method ?? 'GET';
  if (method !== 'GET' && method !== 'HEAD') {
    response.writeHead(405, { allow: 'GET, HEAD' });
    response.end();
    return;
  }
  let name: string;
  try {
    const url = new URL(request.url ?? '/', 'http://localhost');
    if (!url.pathname.startsWith(BOARD_ASSET_PREFIX + '/')) {
      missing(response);
      return;
    }
    name = decodeURIComponent(url.pathname.slice(BOARD_ASSET_PREFIX.length + 1));
  } catch {
    missing(response);
    return;
  }
  const mediaType = (await files()).get(name);
  if (mediaType === undefined) {
    missing(response);
    return;
  }
  const target = path.resolve(BOARD_ROOT, name);
  if (!target.startsWith(path.resolve(BOARD_ROOT) + path.sep)) {
    missing(response);
    return;
  }
  let body: Buffer;
  try {
    body = await fs.readFile(target);
  } catch {
    missing(response);
    return;
  }
  response.writeHead(200, {
    'content-type': mediaType,
    'content-length': body.byteLength,
    'cache-control': 'public, max-age=31536000, immutable',
    'x-content-type-options': 'nosniff',
  });
  response.end(method === 'HEAD' ? undefined : body);
}

/**
 * Register the whiteboard asset route.
 * @param ctx the host context.
 * @returns the route disposer.
 */
export function registerBoardAssetsRoute(ctx: { readonly webServer: WebServer }): () => void {
  const route: Route = { kind: 'prefix', path: BOARD_ASSET_PREFIX, handler: handleBoardAsset };
  return ctx.webServer.register(route);
}

/**
 * Refuse an unknown file.
 * @param response the response.
 */
function missing(response: ServerResponse): void {
  response.writeHead(404, { 'content-type': 'text/plain', 'cache-control': 'no-store' });
  response.end('not found');
}
