import { createService } from './lib/setup.js';
import { createPreviewTool, createTools } from './lib/tools.js';
import type { PreviewServices, ToolDefinition, WorkingDirectory } from './lib/tools.js';
import type { WorkspaceRegistry } from './lib/types.js';

export const name = 'dsh-artifact-studio-tools';

export const inject = ['tools', 'workspaceRegistry', 'workingDirectory'];

/** The image-backed services, when the profile mounts them. */
interface PreviewScope {
  readonly attachments: PreviewServices['attachments'];
  readonly llm: PreviewServices['llm'];
}

/** The host context the tools plugin receives. */
export interface ToolsHostContext {
  readonly tools: { register(definition: ToolDefinition): () => void };
  readonly workspaceRegistry: WorkspaceRegistry;
  readonly workingDirectory: WorkingDirectory;
  /** Cordis optional-service injection, used for the image-backed preview tool. */
  inject(names: readonly string[], ready: (scope: PreviewScope) => void): void;
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
  // The preview tool needs durable image storage and model routes; without
  // either, designs still report warnings and the tool never appears.
  ctx.inject?.(['attachments', 'llm'], (scope) => {
    ctx.tools.register(createPreviewTool(
      { service, registry: ctx.workspaceRegistry, workingDirectory: ctx.workingDirectory },
      { attachments: scope.attachments, llm: scope.llm },
    ));
  });
}
