import type { DesignInfo } from '../../contract.js';

/** Actions the host can ask the renderer to perform. */
type WorkerAction = 'inspect' | 'preview' | 'export' | 'import-fig' | 'patch';

/** Formats a design export can produce. */
export type WorkerFormat = 'png' | 'svg' | 'fig' | 'html-svg';

/** One request to the renderer child. */
export interface WorkerRequest {
  /** Random marker the host uses to find its response in stdout. */
  nonce: string;
  action: WorkerAction;
  source: string;
  /** Longest side of a preview, in pixels. Zero means the design's own size. */
  maxSide?: number;
  format?: WorkerFormat;
  /** Base64 .fig file bytes for an import. The host read the file; the child sees no filesystem. */
  bytes?: string;
  /** The Design JSX of one layer, for a patch. Its single root replaces the layer at `targetPath` in place. */
  patch?: string;
  /** The dotted index path from the page to one layer: the layer a patch replaces, or the layer to preview or export. */
  targetPath?: string;
}

/** One successful answer. */
export interface WorkerSuccess {
  ok: true;
  info: DesignInfo;
  mediaType?: string;
  data?: string;
  width?: number;
  height?: number;
  /** The stored Design JSX an import produced. */
  source?: string;
  /** The layer name when the request rendered one node. */
  name?: string;
}

/** One failed answer, with a stable artifact error code. */
interface WorkerFailure {
  ok: false;
  code: string;
  message: string;
}

export type WorkerResponse = WorkerSuccess | WorkerFailure;
