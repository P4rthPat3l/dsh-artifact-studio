import { createService } from './lib/setup.js';
import { createTools } from './lib/tools.js';
import type { ToolDefinition, WorkingDirectory } from './lib/tools.js';
import type { WorkspaceRegistry } from './lib/types.js';

export const name = 'dsh-artifacts-tools';

export const inject = ['tools', 'workspaceRegistry', 'workingDirectory'];

/** The host context the tools plugin receives. */
export interface ToolsHostContext {
  readonly tools: { register(definition: ToolDefinition): () => void };
  readonly workspaceRegistry: WorkspaceRegistry;
  readonly workingDirectory: WorkingDirectory;
}

/**
 * Register the artifact and design-system tools. The route is a separate
 * plugin, so the panel keeps working in a composition without these tools.
 * @param ctx the plugin context.
 */
export function apply(ctx: ToolsHostContext): void {
  const service = createService(ctx.workspaceRegistry);
  for (const tool of createTools({ service, registry: ctx.workspaceRegistry, workingDirectory: ctx.workingDirectory })) {
    ctx.tools.register(tool);
  }
}
