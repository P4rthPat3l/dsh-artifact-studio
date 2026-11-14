import fs from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Route, WebServer } from './types.js';

/** The URL prefix the canvas fetches engine files from. */
export const ASSET_PREFIX = '/artifacts-canvas';

/** The engine files the route serves, relative to the package's assets directory, with their media types. */
export const ASSET_FILES: ReadonlyMap<string, string> = new Map([
  ['canvas.engine.js', 'text/javascript'],
  ['canvaskit.wasm', 'application/wasm'],
  ['fonts/Inter-Regular.ttf', 'font/ttf'],
  ['fonts/Inter-Medium.ttf', 'font/ttf'],
  ['fonts/Inter-SemiBold.ttf', 'font/ttf'],
  ['fonts/Inter-Bold.ttf', 'font/ttf'],
  ['fonts/Inter-ExtraBold.ttf', 'font/ttf'],
  ['fonts/NotoNaskhArabic-Regular.ttf', 'font/ttf'],
]);

/** Where the build copies the engine files, beside the compiled host. */
const ASSET_ROOT = fileURLToPath(new URL('../../../assets/', import.meta.url));

/**
 * Answer one request for an engine file. The name must match the fixed list;
 * nothing from the request reaches the filesystem path.
 * @param root the assets directory.
 * @returns the route handler.
 */
export function createCanvasAssetHandler(root: string = ASSET_ROOT): (request: IncomingMessage, response: ServerResponse) => Promise<void> {
  return async (request, response): Promise<void> => {
    const method = request.method ?? 'GET';
    if (method !== 'GET' && method !== 'HEAD') {
      response.writeHead(405, { allow: 'GET, HEAD' });
      response.end();
      return;
    }
    let name: string;
    try {
      const url = new URL(request.url ?? '/', 'http://localhost');
      if (!url.pathname.startsWith(ASSET_PREFIX + '/')) {
        missing(response);
        return;
      }
      name = decodeURIComponent(url.pathname.slice(ASSET_PREFIX.length + 1));
    } catch {
      missing(response);
      return;
    }
    const mediaType = ASSET_FILES.get(name);
    if (mediaType === undefined) {
      missing(response);
      return;
    }
    let body: Buffer;
    try {
      body = await fs.readFile(path.join(root, name));
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
  };
}

/**
 * Register the engine asset route.
 * @param ctx the host context.
 * @returns the route disposer.
 */
export function registerCanvasAssetsRoute(ctx: { readonly webServer: WebServer }): () => void {
  const route: Route = { kind: 'prefix', path: ASSET_PREFIX, handler: createCanvasAssetHandler() };
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
