import { registerArtifactsRoute } from './lib/http.js';
import { createHandler } from './lib/rpc.js';
import { createService } from './lib/setup.js';
import type { Connection, WebServer, WorkspaceRegistry } from './lib/types.js';

export const name = 'dsh-artifacts';

export const inject = ['workspaceRegistry', 'connection', 'webServer'];

/** The host context the route plugin receives. */
export interface RouteHostContext {
  readonly workspaceRegistry: WorkspaceRegistry;
  readonly connection: Connection;
  readonly webServer: WebServer;
  effect(callback: () => (() => void) | void, label?: string): void;
}

/**
 * Expose the authenticated artifact channel. The browser reads and writes
 * artifacts only through this route.
 * @param ctx the plugin context.
 */
export function apply(ctx: RouteHostContext): void {
  const handler = createHandler(createService(ctx.workspaceRegistry));
  ctx.effect(() => registerArtifactsRoute(ctx, handler), 'dsh-artifacts: authenticated artifact channel');
}
