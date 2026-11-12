import { useCallback, useEffect, useRef, useState } from 'react';
import { FORMATS_BY_TYPE, parseArtifactAddress } from '../contract.js';
import type { ArtifactAddress, ArtifactPayload, ExportFormat, VersionEntry } from '../contract.js';
import { api, codeOf, download, errorKey } from './api.js';
import type { Where } from './api.js';
import { DocView } from './doc-view.jsx';
import { pageDocument, printDocument } from './frames.js';
import type { TabProps, Translator } from './harness.js';
import { HistoryPanel } from './history.jsx';
import { IconDownload, IconHistory, IconMore, IconRefresh, IconSave } from './icons.jsx';
import { Menu } from './menu.jsx';
import type { MenuItem } from './menu.jsx';
import { PageFrame, SourceEditor } from './page-view.jsx';
import { announceListChange, announceVersion, notify, rememberTitle, useAnnouncedVersion } from './store.js';

/** How long typing waits before a doc autosaves. */
const AUTOSAVE_MS = 1200;

type Load =
  | { status: 'loading' }
  | { status: 'ready'; payload: ArtifactPayload }
  | { status: 'failed'; code: string | undefined };

type SaveState = 'clean' | 'dirty' | 'saving' | 'conflict' | 'error';

/**
 * The request target for an address.
 * @param address the artifact address.
 * @returns where its requests go.
 */
export function whereOf(address: ArtifactAddress): Where {
  return address.scope === 'workspace'
    ? { scope: 'workspace', workspaceId: address.workspaceId }
    : { scope: 'library', workspaceId: null };
}

/**
 * The status line text for a save state.
 * @param t the translator.
 * @param state the state.
 * @returns the text and tone.
 */
function saveLabel(t: Translator, state: SaveState): { text: string; tone?: 'warn' | 'error' } {
  switch (state) {
    case 'dirty':
      return { text: t('tab.unsaved'), tone: 'warn' };
    case 'saving':
      return { text: t('tab.saving') };
    case 'conflict':
      return { text: t('error.stale'), tone: 'error' };
    case 'error':
      return { text: t('error.generic'), tone: 'error' };
    case 'clean':
      return { text: t('tab.saved') };
    default: {
      const unreachable: never = state;
      return { text: String(unreachable) };
    }
  }
}

/**
 * One artifact opened as a right-side tab: preview, source or rich-text
 * editing, versions, export, and print. Its identity is the address, so it
 * survives reloads; it reads the current workspace only to resolve design
 * tokens for a library artifact.
 * @param props slot props.
 * @returns the tab body.
 */
export function ArtifactTab(props: TabProps) {
  const { t, useTabInfo } = props;
  const info = useTabInfo();
  const address = parseArtifactAddress(info.tab.contentId ?? info.tab.navigation?.address);
  if (address === undefined) {
    return (
      <section className="art-root">
        <div className="art-center">
          <p className="art-center-title">{t('error.notFound')}</p>
        </div>
      </section>
    );
  }
  return <ArtifactBody {...props} address={address} />;
}

/**
 * The tab body for a valid address.
 * @param props slot props plus the parsed address.
 * @returns the body.
 */
function ArtifactBody({ t, useTabInfo, address }: TabProps & { address: ArtifactAddress }) {
  const info = useTabInfo();
  const where = whereOf(address);
  const id = address.id;
  const [load, setLoad] = useState<Load>({ status: 'loading' });
  const [mode, setMode] = useState<'preview' | 'source'>('preview');
  const [draft, setDraft] = useState<string | null>(null);
  const [save, setSave] = useState<SaveState>('clean');
  const [showHistory, setShowHistory] = useState(false);
  const [versions, setVersions] = useState<VersionEntry[] | null>(null);
  const [historyFailed, setHistoryFailed] = useState(false);
  const [viewing, setViewing] = useState<ArtifactPayload | null>(null);
  const [menu, setMenu] = useState<'export' | 'more' | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const announced = useAnnouncedVersion(id);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const draftRef = useRef<string | null>(null);
  draftRef.current = draft;
  const saveRef = useRef(save);
  saveRef.current = save;
  // The newest version this tab wrote itself; its own announcement must not read as someone else's change.
  const ownVersion = useRef(0);
  const viewingRef = useRef<ArtifactPayload | null>(null);
  viewingRef.current = viewing;

  const current = load.status === 'ready' ? load.payload : null;
  const manifest = current?.manifest ?? null;

  const reload = useCallback(() => setReloadKey((value) => value + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    api
      .get(where, id, undefined, controller.signal)
      .then((payload) => {
        if (controller.signal.aborted) return;
        rememberTitle(id, payload.manifest.title);
        announceVersion(id, payload.manifest.version);
        setLoad({ status: 'ready', payload });
        setDraft(null);
        setSave('clean');
        setViewing(null);
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setLoad({ status: 'failed', code: codeOf(error) });
      });
    return () => controller.abort();
    // `where` is derived from the address, which `id` and the scope fields cover.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, address.scope, reloadKey]);

  // Another tab, the card, or the agent saved a newer version: reload when nothing local would be lost.
  useEffect(() => {
    if (manifest === null || announced <= Math.max(manifest.version, ownVersion.current)) return;
    if (draftRef.current === null) reload();
    else setSave('conflict');
    // A reload here is automatic, so it never asks; it only happens with no draft.
  }, [announced, manifest, reload]);

  useEffect(() => {
    if (!showHistory || manifest === null) return undefined;
    const controller = new AbortController();
    setVersions(null);
    setHistoryFailed(false);
    api
      .history(where, id, controller.signal)
      .then((value) => {
        if (!controller.signal.aborted) setVersions(value.versions);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setVersions([]);
        setHistoryFailed(true);
        notify(t(errorKey(codeOf(error))));
      });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showHistory, manifest?.version, id]);

  /**
   * Save the current draft. The version this write builds on is read at call
   * time, never captured, so a timer never sends a stale base version and the
   * tab cannot conflict with its own save.
   */
  const persistRef = useRef<() => Promise<void>>(async () => undefined);
  const versionRef = useRef(0);
  versionRef.current = manifest?.version ?? versionRef.current;
  const scheduleSave = useCallback(() => {
    if (timer.current !== undefined) clearTimeout(timer.current);
    timer.current = setTimeout(() => void persistRef.current(), AUTOSAVE_MS);
  }, []);

  persistRef.current = async () => {
    if (timer.current !== undefined) {
      clearTimeout(timer.current);
      timer.current = undefined;
    }
    const text = draftRef.current;
    if (text === null) return;
    if (saveRef.current === 'saving') {
      // A save is in flight; ask again after it settles instead of dropping the change.
      scheduleSave();
      return;
    }
    if (saveRef.current === 'conflict') return;
    setSave('saving');
    try {
      const { manifest: next } = await api.update(where, id, versionRef.current, text);
      versionRef.current = next.version;
      ownVersion.current = next.version;
      announceVersion(id, next.version);
      announceListChange();
      setLoad((previous) =>
        previous.status === 'ready'
          ? { status: 'ready', payload: { ...previous.payload, manifest: next, content: text, version: next.version } }
          : previous,
      );
      if (draftRef.current !== null && draftRef.current !== text) {
        setSave('dirty');
        scheduleSave();
      } else {
        setDraft(null);
        setSave('clean');
      }
    } catch (error) {
      const code = codeOf(error);
      setSave(code === 'artifact/stale-version' ? 'conflict' : 'error');
      if (code !== 'artifact/stale-version') notify(t(errorKey(code)));
    }
  };

  const persist = useCallback(() => persistRef.current(), []);

  /**
   * Reload the tab, asking first when unsaved typing would be lost.
   * @returns whether the reload happened.
   */
  const reloadKeepingDraft = useCallback((): boolean => {
    if (draftRef.current !== null && !window.confirm(t('tab.discardConfirm'))) return false;
    reload();
    return true;
  }, [reload, t]);

  useEffect(() => {
    const actions = info.tab.actions;
    if (actions === undefined) return undefined;
    return actions.bindCommands({ refresh: () => void reloadKeepingDraft() });
  }, [info.tab.actions, reloadKeepingDraft]);

  const edit = useCallback(
    (text: string, autosave: boolean) => {
      setDraft(text);
      setSave((state) => (state === 'conflict' ? state : 'dirty'));
      if (autosave) scheduleSave();
      else if (timer.current !== undefined) {
        clearTimeout(timer.current);
        timer.current = undefined;
      }
    },
    [scheduleSave],
  );

  useEffect(
    () => () => {
      if (timer.current !== undefined) clearTimeout(timer.current);
    },
    [],
  );

  const selectVersion = useCallback(
    (version: number) => {
      if (manifest === null) return;
      if (version === manifest.version) {
        setViewing(null);
        return;
      }
      api
        .get(where, id, version)
        .then(setViewing)
        .catch((error: unknown) => notify(t(errorKey(codeOf(error)))));
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [manifest, id, t],
  );

  const restore = useCallback(async () => {
    if (manifest === null || viewing === null) return;
    if (draftRef.current !== null && !window.confirm(t('tab.discardConfirm'))) return;
    try {
      const { manifest: next } = await api.restore(where, id, viewing.version, manifest.version);
      ownVersion.current = next.version;
      announceVersion(id, next.version);
      announceListChange();
      setViewing(null);
      reload();
    } catch (error) {
      notify(t(errorKey(codeOf(error))));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [manifest, viewing, id, reload, t]);

  const runExport = useCallback(
    async (format: ExportFormat) => {
      try {
        const file = await api.exportFile(where, id, format);
        download(file);
        notify(t('export.done', { name: file.fileName, path: file.path }));
      } catch (error) {
        notify(t(errorKey(codeOf(error))));
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [id, t],
  );

  const runPrint = useCallback(async () => {
    if (current === null) return;
    try {
      if (current.manifest.type === 'page') {
        printDocument(pageDocument(draftRef.current ?? current.content, current.designCss, current.manifest.title));
      } else if (viewingRef.current !== null) {
        notify(t('tab.printOldVersion'));
      } else {
        printDocument((await api.printable(where, id)).html);
      }
    } catch (error) {
      notify(t(errorKey(codeOf(error))));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, id, t]);

  const rename = useCallback(
    async (title: string) => {
      setRenaming(false);
      if (manifest === null || title.trim() === '' || title.trim() === manifest.title) return;
      try {
        const { manifest: next } = await api.rename(where, id, manifest.version, title);
        rememberTitle(id, next.title);
        ownVersion.current = next.version;
        announceVersion(id, next.version);
        announceListChange();
        reload();
      } catch (error) {
        notify(t(errorKey(codeOf(error))));
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [manifest, id, reload, t],
  );

  const remove = useCallback(async () => {
    if (manifest === null) return;
    if (!window.confirm(t('tab.deleteConfirm', { title: manifest.title }))) return;
    try {
      await api.remove(where, id);
      announceListChange();
      info.tab.actions?.close();
    } catch (error) {
      notify(t(errorKey(codeOf(error))));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [manifest, id, info.tab.actions, t]);

  if (load.status === 'loading') {
    return (
      <section className="art-root" data-dsh-artifacts="">
        <div className="art-center">
          <p className="art-center-hint">{t('empty.loading')}</p>
        </div>
      </section>
    );
  }
  if (load.status === 'failed') {
    const missing = load.code === 'artifact/not-found';
    return (
      <section className="art-root" data-dsh-artifacts="">
        <div className="art-center" role="alert">
          <p className="art-center-title">{missing ? t('tab.deleted') : t(errorKey(load.code))}</p>
          {missing ? <p className="art-center-hint">{t('tab.deletedHint')}</p> : null}
          <div className="art-empty-actions">
            {missing ? null : (
              <button type="button" className="art-button" onClick={reload}>
                {t('action.retry')}
              </button>
            )}
            <button type="button" className="art-button" onClick={() => info.tab.actions?.close()}>
              {t('tab.close')}
            </button>
          </div>
        </div>
      </section>
    );
  }

  const payload = load.payload;
  const shown = viewing ?? payload;
  const readOnly = viewing !== null;
  const text = viewing === null ? (draft ?? payload.content) : viewing.content;
  const status = saveLabel(t, save);
  const exportItems: MenuItem[] = [
    ...FORMATS_BY_TYPE[payload.manifest.type].map((format) => ({
      id: format,
      label: t(`export.${format}`),
      run: () => void runExport(format),
    })),
    { id: 'print', label: t('export.print'), separatorBefore: true, run: () => void runPrint() },
  ];
  const moreItems: MenuItem[] = [
    { id: 'rename', label: t('tab.rename'), run: () => setRenaming(true) },
    { id: 'reload', label: t('tab.reload'), run: reload },
    { id: 'delete', label: t('tab.delete'), separatorBefore: true, run: () => void remove() },
  ];

  return (
    <section className="art-root" data-dsh-artifacts="" data-artifact-id={id}>
      <header className="art-header art-relative">
        <div className="art-heading">
          {renaming ? (
            <input
              className="art-title-input"
              aria-label={t('tab.rename')}
              defaultValue={payload.manifest.title}
              maxLength={120}
              autoFocus
              onBlur={(event) => void rename(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void rename(event.currentTarget.value);
                if (event.key === 'Escape') setRenaming(false);
              }}
            />
          ) : (
            <span className="art-title" title={payload.manifest.title}>
              {payload.manifest.title}
            </span>
          )}
          <span className="art-meta">
            <span className="art-badge" data-scope={payload.manifest.scope}>
              {t(`scope.${payload.manifest.scope}`)}
            </span>
            <span>{t('gallery.version', { version: payload.manifest.version })}</span>
          </span>
        </div>
        <div className="art-actions">
          {payload.manifest.type === 'page' ? (
            <div className="art-segment" role="group">
              <button type="button" aria-pressed={mode === 'preview'} onClick={() => setMode('preview')}>
                {t('tab.preview')}
              </button>
              <button type="button" aria-pressed={mode === 'source'} onClick={() => setMode('source')}>
                {t('tab.source')}
              </button>
            </div>
          ) : null}
          {draft !== null && viewing === null ? (
            <button
              type="button"
              className="art-icon-button"
              aria-label={t('tab.save')}
              title={t('tab.save')}
              onClick={() => void persist()}
            >
              <IconSave />
            </button>
          ) : null}
          <button
            type="button"
            className="art-icon-button"
            aria-label={t('tab.history')}
            title={t('tab.history')}
            aria-pressed={showHistory}
            onClick={() => {
              setShowHistory((value) => !value);
              setViewing(null);
            }}
          >
            <IconHistory />
          </button>
          <button
            type="button"
            className="art-icon-button"
            aria-label={t('tab.export')}
            title={t('tab.export')}
            aria-haspopup="menu"
            aria-expanded={menu === 'export'}
            onClick={() => setMenu(menu === 'export' ? null : 'export')}
          >
            <IconDownload />
          </button>
          <button
            type="button"
            className="art-icon-button"
            aria-label={t('tab.reload')}
            title={t('tab.reload')}
            onClick={reload}
          >
            <IconRefresh />
          </button>
          <button
            type="button"
            className="art-icon-button"
            aria-label={t('gallery.more')}
            title={t('gallery.more')}
            aria-haspopup="menu"
            aria-expanded={menu === 'more'}
            onClick={() => setMenu(menu === 'more' ? null : 'more')}
          >
            <IconMore />
          </button>
        </div>
        {menu === 'export' ? <Menu label={t('tab.export')} items={exportItems} onClose={() => setMenu(null)} /> : null}
        {menu === 'more' ? <Menu label={t('gallery.more')} items={moreItems} onClose={() => setMenu(null)} /> : null}
      </header>
      {save === 'conflict' ? (
        <div className="art-bar" data-tone="warn" role="alert">
          <span className="art-bar-text">
            <strong>{t('tab.conflictTitle')}</strong>
            <span>{t('tab.conflictHint', { current: Math.max(announced, payload.manifest.version) })}</span>
          </span>
          <span className="art-bar-actions">
            <button type="button" className="art-button" onClick={reload}>
              {t('tab.reload')}
            </button>
          </span>
        </div>
      ) : null}
      {viewing !== null ? (
        <div className="art-bar" role="status">
          <span className="art-bar-text">
            <span>{t('tab.viewingOld', { version: viewing.version, current: payload.manifest.version })}</span>
          </span>
          <span className="art-bar-actions">
            <button type="button" className="art-button" onClick={() => setViewing(null)}>
              {t('tab.backToCurrent')}
            </button>
            <button type="button" className="art-button art-button-primary" onClick={() => void restore()}>
              {t('tab.restoreThis')}
            </button>
          </span>
        </div>
      ) : null}
      <div className="art-body">
        <div className="art-stage">
          {payload.manifest.type === 'page' && mode === 'preview' ? (
            <PageFrame
              content={text}
              designCss={payload.designCss}
              title={payload.manifest.title}
              frameTitle={t('tab.frameTitle', { title: payload.manifest.title })}
            />
          ) : null}
          {payload.manifest.type === 'page' && mode === 'source' ? (
            <SourceEditor
              value={text}
              readOnly={readOnly}
              label={t('tab.source')}
              onChange={(value) => edit(value, false)}
              onSave={() => void persist()}
            />
          ) : null}
          {payload.manifest.type === 'doc' ? (
            <DocView
              markdown={text}
              revision={`${viewing === null ? 0 : viewing.version}:${reloadKey}`}
              editable={!readOnly && save !== 'conflict'}
              label={payload.manifest.title}
              loadingLabel={t('empty.loading')}
              failedLabel={t('error.generic')}
              onChange={(value) => edit(value, true)}
              onSave={() => void persist()}
            />
          ) : null}
        </div>
        {showHistory ? (
          <HistoryPanel
            t={t}
            versions={versions}
            failed={historyFailed}
            current={payload.manifest.version}
            selected={shown.version}
            onSelect={selectVersion}
          />
        ) : null}
      </div>
      <footer className="art-status">
        <span>{payload.manifest.type === 'page' ? t('tab.scripts') : t(`type.${payload.manifest.type}`)}</span>
        <span data-tone={status.tone} aria-live="polite">
          {status.text}
        </span>
      </footer>
    </section>
  );
}
