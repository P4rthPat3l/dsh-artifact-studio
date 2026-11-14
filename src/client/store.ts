import { useSyncExternalStore } from 'react';

/**
 * Small module-level stores shared by slots that the Harness mounts
 * independently: the tool card, the tabs, and the tab titles.
 */

type Listener = () => void;

/** A value with subscribers. */
function createCell<T>(initial: T) {
  let value = initial;
  const listeners = new Set<Listener>();
  return {
    get: () => value,
    set(next: T) {
      value = next;
      for (const listener of listeners) listener();
    },
    subscribe(listener: Listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

const titles = createCell<ReadonlyMap<string, string>>(new Map());

/**
 * Remember the title of an artifact so tab chips show it before the tab loads.
 * @param id the artifact id.
 * @param title its title.
 */
export function rememberTitle(id: string, title: string): void {
  if (titles.get().get(id) === title) return;
  const next = new Map(titles.get());
  next.set(id, title);
  titles.set(next);
}

export function titleOf(id: string): string | undefined {
  return titles.get().get(id);
}

export function useTitle(id: string | undefined): string | undefined {
  return useSyncExternalStore(titles.subscribe, () => (id === undefined ? undefined : titles.get().get(id)));
}

/** The newest version anyone in this window has seen, per artifact. */
const versions = createCell<ReadonlyMap<string, number>>(new Map());

/**
 * Announce that an artifact reached a version, so open tabs reload without polling.
 * @param id the artifact id.
 * @param version the version.
 */
export function announceVersion(id: string, version: number): void {
  if ((versions.get().get(id) ?? 0) >= version) return;
  const next = new Map(versions.get());
  next.set(id, version);
  versions.set(next);
}

export function useAnnouncedVersion(id: string | undefined): number {
  return useSyncExternalStore(versions.subscribe, () => (id === undefined ? 0 : (versions.get().get(id) ?? 0)));
}

/** A bump counter the gallery watches to reload after a create or delete anywhere in the window. */
const listChanges = createCell(0);

export function announceListChange(): void {
  listChanges.set(listChanges.get() + 1);
}

export function useListChanges(): number {
  return useSyncExternalStore(listChanges.subscribe, listChanges.get);
}

/** One shown notice; the sequence restarts the banner when the same text repeats. */
export interface Notice {
  seq: number;
  message: string;
}

const notice = createCell<Notice | null>(null);

export function notify(message: string): void {
  notice.set({ seq: (notice.get()?.seq ?? 0) + 1, message });
}

export function useNotice(): Notice | null {
  return useSyncExternalStore(notice.subscribe, notice.get);
}

/**
 * Remove a notice once its banner finished, unless a newer one replaced it.
 * @param seq the finished notice, or undefined to clear any.
 */
export function clearNotice(seq?: number): void {
  const current = notice.get();
  if (current === null || (seq !== undefined && current.seq !== seq)) return;
  notice.set(null);
}
