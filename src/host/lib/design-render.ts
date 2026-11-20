import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { DesignInfo } from '../../contract.js';
import type { WorkerFormat, WorkerRequest, WorkerResponse, WorkerSuccess } from '../worker/protocol.js';
import { ArtifactError } from './errors.js';
import { isSvgPageModel } from './svg-model.js';
import type { SvgPageModel } from './svg-model.js';

/** How long one render may take before the child is killed. */
const TIMEOUT_MS = 20_000;
/** Stdout above this size means something is wrong with the child. */
const MAX_STDOUT = 64 * 1024 * 1024;
/** Stderr kept for a failure message. */
const MAX_STDERR = 8 * 1024;
/** Workers that may run at once; each peaks near 250 MB. */
const MAX_CONCURRENT = 2;
/** Longest side of a preview image. */
export const PREVIEW_MAX_SIDE = 1600;

const WORKER = fileURLToPath(new URL('../worker/design-worker.js', import.meta.url));
const PLUGIN_ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const resolveFrom = createRequire(import.meta.url);
const NODE_MAJOR = Number.parseInt(process.versions.node.split('.')[0] ?? '0', 10);
const PERMISSION_FLAG = NODE_MAJOR >= 23 ? '--permission' : undefined;

/**
 * The nearest ancestor that is a node_modules directory, which is the tree the
 * engine and its dependencies were installed into.
 * @param file a file inside the tree.
 * @returns the directory, or the file's own directory when there is none.
 */
function nearestNodeModules(file: string): string {
  let dir = path.dirname(file);
  for (;;) {
    if (path.basename(dir) === 'node_modules') return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return path.dirname(file);
    dir = parent;
  }
}

/**
 * Every directory the worker may read: its own package and the installed
 * engine. Nothing else, so a design cannot read a workspace or a home file.
 */
function readRoots(): string[] {
  const roots = new Set<string>([PLUGIN_ROOT]);
  try {
    roots.add(nearestNodeModules(resolveFrom.resolve('@open-pencil/core/package.json')));
  } catch {
    // Left to the worker to resolve; a missing engine fails there with a clear message.
  }
  return [...roots];
}

const READ_ROOTS = readRoots();

/**
 * The child environment. Under Electron the binary only runs Node with this
 * flag, and Node options from the host must not leak into the worker.
 * @returns the environment.
 */
function workerEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env };
  if (process.versions.electron !== undefined) env['ELECTRON_RUN_AS_NODE'] = '1';
  delete env['NODE_OPTIONS'];
  return env;
}

/**
 * The command line for one worker run.
 * @returns the arguments, before the worker script.
 */
function workerArgs(): string[] {
  if (PERMISSION_FLAG === undefined) {
    throw new ArtifactError(
      'artifact/design-unavailable',
      'Design rendering needs Node 23 or newer for its sandbox. Upgrade the Harness runtime.',
    );
  }
  return [PERMISSION_FLAG, ...READ_ROOTS.map((root) => `--allow-fs-read=${root}`), WORKER];
}

/**
 * Tell a design summary from an unknown value.
 * @param value the value.
 * @returns whether it is a summary.
 */
function isInfo(value: unknown): value is DesignInfo {
  if (value === null || typeof value !== 'object') return false;
  const fields: Record<string, unknown> = { ...value };
  return (
    typeof fields.pages === 'number' &&
    typeof fields.nodes === 'number' &&
    fields.types !== null &&
    typeof fields.types === 'object' &&
    Array.isArray(fields.fonts) &&
    Array.isArray(fields.warnings)
  );
}

/**
 * Tell a worker response from an unknown value.
 * @param value the value.
 * @returns whether it is a response.
 */
function isResponse(value: unknown): value is WorkerResponse {
  if (value === null || typeof value !== 'object') return false;
  const fields: Record<string, unknown> = { ...value };
  if (fields.ok === false) return typeof fields.code === 'string' && typeof fields.message === 'string';
  return fields.ok === true && isInfo(fields.info);
}

/** One preview image and its summary. */
export interface RenderedPreview {
  bytes: Buffer;
  width: number;
  height: number;
  info: DesignInfo;
}

/** One exported file. */
export interface RenderedExport {
  bytes: Buffer;
  mediaType: string;
}

/**
 * Runs Design JSX in a separate, sandboxed Node process. Every call compiles
 * and renders from scratch; the caller caches what it needs.
 */
export class DesignRenderer {
  private active = 0;

  private readonly waiting: Array<() => void> = [];

  /**
   * Compile and summarize a source without rasterizing it.
   * @param source the Design JSX source.
   * @returns the summary.
   */
  async inspect(source: string): Promise<DesignInfo> {
    return (await this.request(source, { action: 'inspect' })).info;
  }

  /**
   * Compile and rasterize a source.
   * @param source the Design JSX source.
   * @param maxSide the longest side in pixels; zero keeps the design's own size.
   * @returns the image and summary.
   */
  async preview(source: string, maxSide: number): Promise<RenderedPreview> {
    const response = await this.request(source, { action: 'preview', maxSide });
    if (typeof response.data !== 'string' || typeof response.width !== 'number' || typeof response.height !== 'number') {
      throw new ArtifactError('artifact/design-render-failed', 'The design renderer returned no image.');
    }
    return {
      bytes: Buffer.from(response.data, 'base64'),
      width: response.width,
      height: response.height,
      info: response.info,
    };
  }

  /**
   * Compile and export a source.
   * @param source the Design JSX source.
   * @param format the output format.
   * @returns the file bytes and media type.
   */
  async exportContent(source: string, format: WorkerFormat): Promise<RenderedExport> {
    const response = await this.request(source, { action: 'export', format });
    if (typeof response.data !== 'string' || typeof response.mediaType !== 'string') {
      throw new ArtifactError('artifact/design-render-failed', 'The design renderer returned no file.');
    }
    return { bytes: Buffer.from(response.data, 'base64'), mediaType: response.mediaType };
  }

  /**
   * Compile a design into the page model the SVG viewer needs: the shapes SVG and one
   * record per text node, after the layout the panel shows.
   * @param source the Design JSX source.
   * @returns the page model.
   */
  async pageModel(source: string): Promise<SvgPageModel> {
    const response = await this.request(source, { action: 'export', format: 'html-svg' });
    if (typeof response.data !== 'string') {
      throw new ArtifactError('artifact/design-render-failed', 'The design renderer returned no page model.');
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(Buffer.from(response.data, 'base64').toString('utf8'));
    } catch {
      throw new ArtifactError('artifact/design-render-failed', 'The design renderer returned an unreadable page model.');
    }
    if (!isSvgPageModel(parsed)) {
      throw new ArtifactError('artifact/design-render-failed', 'The design renderer returned an unexpected page model.');
    }
    return parsed;
  }

  /**
   * Run a task with at most two children alive.
   * @param task the work.
   * @returns the task result.
   */
  private async run<T>(task: () => Promise<T>): Promise<T> {
    if (this.active >= MAX_CONCURRENT) await new Promise<void>((resolve) => this.waiting.push(resolve));
    this.active += 1;
    try {
      return await task();
    } finally {
      this.active -= 1;
      this.waiting.shift()?.();
    }
  }

  /**
   * Send one request to a fresh child and wait for its marked line.
   * @param source the Design JSX source.
   * @param partial the action and its options.
   * @returns the response.
   */
  private async request(
    source: string,
    partial: Omit<WorkerRequest, 'nonce' | 'source'>,
  ): Promise<WorkerSuccess> {
    return this.run(async () => {
      const nonce = randomBytes(12).toString('hex');
      const response = await this.spawnAndWait({ nonce, source, ...partial });
      if (!response.ok) throw new ArtifactError(response.code, response.message);
      return response;
    });
  }

  /**
   * Spawn the worker, write the request, and read the marked response.
   * @param request the request.
   * @returns the response.
   */
  private spawnAndWait(request: WorkerRequest): Promise<WorkerResponse> {
    const args = workerArgs();
    return new Promise<WorkerResponse>((resolve, reject) => {
      let stdout = '';
      let stderr = '';
      let settled = false;
      let timedOut = false;
      const child = spawn(process.execPath, args, { env: workerEnv(), stdio: ['pipe', 'pipe', 'pipe'] });
      const timer = setTimeout(() => {
        timedOut = true;
        child.kill('SIGKILL');
      }, TIMEOUT_MS);
      const finish = (settle: () => void): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        settle();
      };
      const fail = (code: string, message: string): void => {
        finish(() => reject(new ArtifactError(code, message)));
      };
      child.on('error', (error) => fail('artifact/design-render-failed', `The design renderer did not start: ${error.message}`));
      child.stdout.on('data', (chunk: Buffer) => {
        stdout += chunk.toString('utf8');
        if (stdout.length > MAX_STDOUT) {
          child.kill('SIGKILL');
          fail('artifact/design-render-failed', 'The design renderer produced too much output.');
        }
      });
      child.stderr.on('data', (chunk: Buffer) => {
        if (stderr.length < MAX_STDERR) stderr += chunk.toString('utf8');
      });
      child.on('close', (code, signal) => {
        if (settled) return;
        if (timedOut) {
          fail('artifact/design-timeout', 'The design took too long to render and was stopped.');
          return;
        }
        const line = stdout.split('\n').find((item) => item.startsWith(request.nonce));
        if (line === undefined) {
          const detail = stderr.trim().slice(0, 400);
          const status = code === null ? String(signal ?? 'unknown') : String(code);
          fail(
            'artifact/design-render-failed',
            `The design renderer stopped (exit ${status}).${detail === '' ? '' : ' ' + detail}`,
          );
          return;
        }
        let parsed: unknown;
        try {
          parsed = JSON.parse(line.slice(request.nonce.length));
        } catch {
          fail('artifact/design-render-failed', 'The design renderer returned invalid JSON.');
          return;
        }
        if (!isResponse(parsed)) {
          fail('artifact/design-render-failed', 'The design renderer returned an unexpected shape.');
          return;
        }
        finish(() => resolve(parsed));
      });
      child.stdin.on('error', () => undefined);
      child.stdin.end(JSON.stringify(request));
    });
  }
}
