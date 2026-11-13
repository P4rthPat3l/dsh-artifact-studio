import { useSyncExternalStore } from 'react';

/** Local view preferences. Pins are a shortcut, never artifact data. */
const PIN_KEY = 'dsh-artifacts.pins';

function readPins(): ReadonlySet<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = window.localStorage.getItem(PIN_KEY);
    if (raw === null) return new Set();
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((value): value is string => typeof value === 'string'));
  } catch {
    return new Set();
  }
}

let pins: ReadonlySet<string> = readPins();
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * The pinned artifact addresses in this window.
 * @returns the addresses.
 */
export function usePins(): ReadonlySet<string> {
  return useSyncExternalStore(subscribe, () => pins, () => pins);
}

/**
 * Pin or unpin one artifact address.
 * @param address the formatted artifact address.
 */
export function togglePin(address: string): void {
  const next = new Set(pins);
  if (next.has(address)) next.delete(address);
  else next.add(address);
  pins = next;
  try {
    window.localStorage.setItem(PIN_KEY, JSON.stringify([...next]));
  } catch {
    // Pins are a convenience; a refused write keeps the in-memory state.
  }
  for (const listener of listeners) listener();
}
