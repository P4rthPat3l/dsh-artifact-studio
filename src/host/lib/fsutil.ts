import { randomBytes } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { ArtifactError, errnoCode } from './errors.js';

/** Locks, one chain per key, so two writers to the same files take turns. */
const locks = new Map<string, Promise<unknown>>();

/**
 * Run a task after earlier tasks on the same key. A rejected task does not
 * break the chain, so a refused write never blocks the next one.
 * @param key the resource the task owns.
 * @param task the work.
 * @returns the task result.
 */
export async function withLock<T>(key: string, task: () => Promise<T>): Promise<T> {
  const previous = locks.get(key) ?? Promise.resolve();
  const next = previous.then(task, task);
  const settled = next.catch(() => undefined);
  locks.set(key, settled);
  try {
    return await next;
  } finally {
    if (locks.get(key) === settled) locks.delete(key);
  }
}

/**
 * Write a file through an exclusive temp file, an fsync, and a rename, so a
 * reader never sees a partial file and a planted link at the temp name cannot
 * redirect the write.
 * @param file the destination.
 * @param data the content.
 */
export async function writeAtomic(file: string, data: string | Uint8Array): Promise<void> {
  const temp = path.join(
    path.dirname(file),
    `.${path.basename(file)}.${randomBytes(8).toString('hex')}.tmp`,
  );
  try {
    const handle = await fs.open(temp, 'wx');
    try {
      if (typeof data === 'string') await handle.writeFile(data, 'utf8');
      else await handle.writeFile(data);
      await handle.sync();
    } finally {
      await handle.close();
    }
    await fs.rename(temp, file);
  } catch (error) {
    await fs.rm(temp, { force: true });
    throw error;
  }
}

/**
 * Refuse a path whose real location is not the selected root or inside it.
 *
 * The deepest existing ancestor is resolved through `realpath` and the missing
 * tail is re-attached, so a link anywhere above the target, not only at its
 * last component, is caught before anything is written or removed.
 * @param root the canonical scope root.
 * @param target the path to check.
 */
export async function assertWithin(root: string, target: string): Promise<void> {
  let current = path.resolve(target);
  const missing: string[] = [];
  for (;;) {
    try {
      const canonical = await fs.realpath(current);
      const full = path.join(canonical, ...missing.reverse());
      if (full !== root && !full.startsWith(root.endsWith(path.sep) ? root : `${root}${path.sep}`)) {
        throw new ArtifactError('artifact/forbidden-path', 'That path leaves the artifact root.', {});
      }
      return;
    } catch (error) {
      if (error instanceof ArtifactError) throw error;
      if (errnoCode(error) !== 'ENOENT') throw error;
      const parent = path.dirname(current);
      if (parent === current) {
        throw new ArtifactError('artifact/forbidden-path', 'That path leaves the artifact root.', {});
      }
      missing.push(path.basename(current));
      current = parent;
    }
  }
}
