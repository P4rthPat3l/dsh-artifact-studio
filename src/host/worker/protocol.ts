import type { DesignInfo } from '../../contract.js';

/** Actions the host can ask the renderer to perform. */
export type WorkerAction = 'inspect' | 'preview' | 'export';

/** Formats a design export can produce. */
export type WorkerFormat = 'png' | 'svg' | 'fig';

/** One request to the renderer child. */
export interface WorkerRequest {
  /** Random marker the host uses to find its response in stdout. */
  nonce: string;
  action: WorkerAction;
  source: string;
  /** Longest side of a preview, in pixels. Zero means the design's own size. */
  maxSide?: number;
  format?: WorkerFormat;
}

/** One successful answer. */
export interface WorkerSuccess {
  ok: true;
  info: DesignInfo;
  mediaType?: string;
  data?: string;
  width?: number;
  height?: number;
}

/** One failed answer, with a stable artifact error code. */
export interface WorkerFailure {
  ok: false;
  code: string;
  message: string;
}

export type WorkerResponse = WorkerSuccess | WorkerFailure;
