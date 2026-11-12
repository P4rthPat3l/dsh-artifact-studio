import type { VersionEntry } from '../contract.js';
import type { Translator } from './harness.js';
import { relativeTime } from './locale.js';

/** Props for the version list. */
export interface HistoryPanelProps {
  t: Translator;
  versions: VersionEntry[] | null;
  failed: boolean;
  current: number;
  selected: number;
  onSelect: (version: number) => void;
  onClose: () => void;
}

/**
 * Describe who made a version and how.
 * @param t the translator.
 * @param entry the version.
 * @returns the line.
 */
function describe(t: Translator, entry: VersionEntry): string {
  const who = entry.source.origin === 'agent' ? t('history.byAgent') : t('history.byUser');
  const what =
    entry.source.action === 'restore' && entry.source.restoredFrom !== undefined
      ? t('history.restored', { version: entry.source.restoredFrom })
      : entry.source.action === 'create'
        ? t('history.created')
        : t('history.updated');
  return `${who} · ${what} · ${relativeTime(t, entry.createdAt)}`;
}

/**
 * The version list beside an artifact. Picking a version previews it; restore
 * happens from the preview bar.
 * @param props versions and selection.
 * @returns the panel.
 */
export function HistoryPanel({ t, versions, failed, current, selected, onSelect, onClose }: HistoryPanelProps) {
  return (
    <aside className="art-history" aria-label={t('history.title')}>
      <div className="art-history-head"><span>{t('history.title')}</span><button type="button" className="art-text-button" onClick={onClose}>{t('history.close')}</button></div>
      {versions === null ? <p className="art-note">{t('empty.loading')}</p> : null}
      {failed ? <p className="art-note">{t('error.generic')}</p> : null}
      {!failed && versions !== null && versions.length <= 1 ? <p className="art-note">{t('history.empty')}</p> : null}
      {versions?.map((entry) => (
        <button
          key={entry.version}
          type="button"
          className="art-version"
          aria-current={entry.version === selected ? 'true' : undefined}
          onClick={() => onSelect(entry.version)}
        >
          <span className="art-version-top">
            <span>{t('tab.versionOf', { version: entry.version })}</span>
            {entry.version === current ? <span className="art-badge">{t('history.current')}</span> : null}
          </span>
          <span className="art-version-sub">{describe(t, entry)}</span>
        </button>
      ))}
    </aside>
  );
}
