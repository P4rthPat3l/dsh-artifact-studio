import { useSyncExternalStore } from 'react';

/** The body attribute the Harness theme presenter sets while the dark theme is active. */
const DARK_ATTRIBUTE = 'data-ds-dark-theme';

function read(): boolean {
  return typeof document !== 'undefined' && document.body?.hasAttribute(DARK_ATTRIBUTE) === true;
}

function subscribe(listener: () => void): () => void {
  if (typeof document === 'undefined' || document.body === null) return () => undefined;
  const observer = new MutationObserver(listener);
  observer.observe(document.body, { attributes: true, attributeFilter: [DARK_ATTRIBUTE] });
  return () => observer.disconnect();
}

/**
 * Whether the Harness shows its dark theme, kept current as the user switches.
 * @returns true in the dark theme.
 */
export function useHarnessDark(): boolean {
  return useSyncExternalStore(subscribe, read, () => false);
}
