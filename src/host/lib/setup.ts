import { resolveHome } from './paths.js';
import type { RootConfig } from './paths.js';
import { ArtifactService } from './service.js';
import type { WorkspaceRegistry } from './types.js';

/** Root locations for this deployment: `.dsh/artifacts` in a workspace, `artifacts/v1` in the Harness home. */
export function rootConfig(): RootConfig {
  return { workspaceDir: '.dsh/artifacts', libraryDir: 'artifacts/v1', home: resolveHome() };
}

/**
 * Build the service both plugins use.
 * @param registry the workspace registry.
 * @returns the service.
 */
export function createService(registry: WorkspaceRegistry): ArtifactService {
  return new ArtifactService(rootConfig(), registry);
}
