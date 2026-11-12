/** One failure with a stable `artifact/*` code that the route and tools report. */
export class ArtifactError extends Error {
  readonly code: string;

  readonly details: Record<string, unknown>;

  /**
   * @param code stable error code, for example `artifact/stale-version`.
   * @param message message safe to show to the user and the model.
   * @param details optional structured details.
   */
  constructor(code: string, message: string, details: Record<string, unknown> = {}) {
    super(message);
    this.name = 'ArtifactError';
    this.code = code;
    this.details = details;
  }
}

/**
 * Read the errno name of a filesystem failure.
 * @param error the thrown value.
 * @returns the errno name, or undefined when it is not an errno failure.
 */
export function errnoCode(error: unknown): string | undefined {
  if (!(error instanceof Error) || !('code' in error)) return undefined;
  const { code } = error;
  return typeof code === 'string' ? code : undefined;
}
