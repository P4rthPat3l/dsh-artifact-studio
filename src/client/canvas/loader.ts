import type { CanvasTool, DesignCanvasHandle, DesignCanvasModule, DesignCanvasOptions } from './entry.js';

declare const __CANVAS_ASSET_VERSION__: string;

/** The engine module, versioned so a package update busts the route cache. */
const ENGINE_URL = ['/artifacts-canvas/canvas.engine.js?v=', __CANVAS_ASSET_VERSION__].join('');

/**
 * Tell the engine module from an unknown import result.
 * @param value the imported module.
 * @returns whether it has the canvas export.
 */
function isEngine(value: unknown): value is DesignCanvasModule {
  if (value === null || typeof value !== 'object') return false;
  const fields: Record<string, unknown> = { ...value };
  return typeof fields['mountDesignCanvas'] === 'function';
}

/**
 * Mount the canvas. The engine itself is an ES module asset, because its layout
 * library uses top-level await and cannot run inside the module loader; this
 * chunk is its CommonJS entry point.
 * @param options the element, source, and callbacks.
 * @returns the handle.
 */
export async function mountDesignCanvas(options: DesignCanvasOptions): Promise<DesignCanvasHandle> {
  const loaded: unknown = await import(ENGINE_URL);
  if (!isEngine(loaded)) throw new Error('The canvas engine did not load.');
  return loaded.mountDesignCanvas(options);
}

export type { CanvasTool, DesignCanvasHandle, DesignCanvasOptions };
