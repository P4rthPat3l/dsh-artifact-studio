import { resolveHome } from './paths.js';
import type { RootConfig } from './paths.js';
import { ArtifactService } from './service.js';
import type { WorkspaceRegistry } from './types.js';

/** Root locations for this deployment: per-workspace stores and the library, both under the Harness home. */
export function rootConfig(): RootConfig {
  return { workspaceBase: 'artifacts/workspaces', libraryDir: 'artifacts/v1', home: resolveHome() };
}

/**
 * Build the service both plugins use.
 * @param registry the workspace registry.
 * @returns the service.
 */
export function createService(registry: WorkspaceRegistry): ArtifactService {
  return new ArtifactService(rootConfig(), registry);
}
