import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { FORMATS_BY_TYPE, formatArtifactAddress, parseArtifactAddress } from '../contract.js';
import type { ArtifactAddress, ArtifactPayload, ExportFormat, VersionEntry } from '../contract.js';
import { api, codeOf, download, errorKey } from './api.js';
import { DocView } from './doc-view.jsx';
import { useEditor } from './editor-model.js';
import { printDocument } from './frames.js';
import type { TabProps, Translator, UseTabInfo } from './harness.js';
import { HistoryPanel } from './history.jsx';
import { IconBack, IconChevron, IconClose, IconDownload, IconHistory, IconMore, IconSave } from './icons.jsx';
import { Menu } from './menu.jsx';
import { announceListChange, announceVersion, notify, useAnnouncedVersion } from './store.js';
import { PageFrame, SourceEditor } from './page-view.jsx';
import { buildRequest, quoteText } from './review.js';

type Drawer = 'request' | 'history';

/** The quote captured from a document or source selection. */
interface Selection {
  text: string;
  truncated: boolean;
}

/** The request composer holds the user's words, the quote, and the saved version. */
interface RequestDraft {
  prompt: string;
  quote: string;
  truncated: boolean;
  version: number;
}

/**
 * A slim action over the artifact that turns a selection into a request
 * without leaving the artifact.
 * @param props the quote and the two actions.
 * @returns the bar.
 */
function SelectionBar({ quote, label, askLabel, dismissLabel, onAsk, onDismiss }: {
  quote: string;
  label: string;
  askLabel: string;
  dismissLabel: string;
  onAsk: () => void;
  onDismiss: () => void;
}) {
  return (
    <div className="art-selection-bar" role="toolbar" aria-label={label}>
      <span className="art-selection-quote" title={quote}>{quote}</span>
      <button type="button" className="art-button art-button-primary" onClick={onAsk}>{askLabel}</button>
      <button type="button" className="art-icon-button" aria-label={dismissLabel} title={dismissLabel} onClick={onDismiss}><IconClose /></button>
    </div>
  );
}

interface DrawerShellProps {
  label: string;
  closeLabel: string;
  overlay: boolean;
  onClose: () => void;
  children: ReactNode;
}

/**
 * One contextual side panel. It is inline in a wide pane and a modal overlay in
 * a narrow one, where it carries a scrim and keeps Tab inside.
 * @param props the label, close action, and content.
 * @returns the drawer.
 */
function DrawerShell({ label, closeLabel, overlay, onClose, children }: DrawerShellProps) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const initial = ref.current?.querySelector<HTMLElement>('[data-drawer-initial]')
      ?? ref.current?.querySelector<HTMLElement>('button');
    initial?.focus();
  }, [label]);

  useEffect(() => {
    if (!overlay) return undefined;
    const onFocus = (event: FocusEvent) => {
      const node = ref.current;
      if (node === null || (event.target instanceof Node && node.contains(event.target))) return;
      const initial = node.querySelector<HTMLElement>('[data-drawer-initial]') ?? node.querySelector<HTMLElement>('button');
      initial?.focus();
    };
    document.addEventListener('focusin', onFocus);
    return () => document.removeEventListener('focusin', onFocus);
  }, [overlay]);

  return (
    <div className="art-drawer-layer" data-overlay={overlay ? 'true' : undefined}>
      {!overlay ? null : <div className="art-drawer-scrim" aria-hidden="true" onPointerDown={onClose} />}
      <aside
        ref={ref}
        className="art-drawer"
        role="dialog"
        aria-modal={overlay ? 'true' : undefined}
        aria-label={label}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            onClose();
            return;
          }
          if (event.key !== 'Tab' || !overlay) return;
          const focusable = [...(ref.current?.querySelectorAll<HTMLElement>('button:not(:disabled), textarea:not(:disabled), input:not(:disabled), select:not(:disabled), a[href]') ?? [])];
          const first = focusable[0];
          const last = focusable[focusable.length - 1];
          if (first === undefined || last === undefined) return;
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
          }
        }}
      >
        <div className="art-drawer-head">
          <h2>{label}</h2>
          <button type="button" className="art-icon-button" aria-label={closeLabel} title={closeLabel} onClick={onClose}>
            <IconClose />
          </button>
        </div>
        <div className="art-drawer-body">{children}</div>
      </aside>
    </div>
  );
}

export function ArtifactTab(props: TabProps) {
  const info = props.useTabInfo();
  const address = parseArtifactAddress(info.tab.contentId ?? info.tab.navigation?.address);
  const workspaceName = props.useWorkspaces(state => state.items.find(item => address?.scope === 'workspace' && item.workspaceId === address.workspaceId)?.title);
  if (address === undefined) return <section className="art-root"><p>{props.t('error.notFound')}</p></section>;
  return <ArtifactBody key={formatArtifactAddress(address)} t={props.t} address={address} useTabInfo={props.useTabInfo} onBack={info.tab.actions?.close} workspaceName={workspaceName} />;
}

export function ArtifactPanelBody({ t, address, onBack, workspaceName }: {
  t: Translator; address: ArtifactAddress; onBack: () => void; workspaceName?: string;
}) {
  return <ArtifactBody key={formatArtifactAddress(address)} t={t} address={address} onBack={onBack} workspaceName={workspaceName} back />;
}

interface ArtifactBodyProps {
  t: Translator;
  address: ArtifactAddress;
  useTabInfo?: UseTabInfo;
  onBack?: () => void;
  workspaceName?: string;
  back?: boolean;
}

type LeaveAction = () => void | Promise<void>;

function ArtifactBody({ t, address, useTabInfo, onBack, workspaceName, back }: ArtifactBodyProps) {
  const { model, state } = useEditor(address);
  const { payload, draft, saving, conflict, failure } = state;
  const where = model.where;
  const id = address.id;
  const [mode, setMode] = useState<'preview' | 'source'>('preview');
  const [drawer, setDrawer] = useState<Drawer | null>(null);
  const [overlay, setOverlay] = useState(false);
  const [versions, setVersions] = useState<VersionEntry[] | null>(null);
  const [historyFailed, setHistoryFailed] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [viewing, setViewing] = useState<ArtifactPayload | null>(null);
  const [menu, setMenu] = useState<'export' | 'more' | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [renameText, setRenameText] = useState('');
  const [leave, setLeave] = useState<{ run: LeaveAction } | null>(null);
  const [busy, setBusy] = useState(false);
  const [request, setRequest] = useState<RequestDraft | null>(null);
  const [requestCopied, setRequestCopied] = useState(false);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [versionMenu, setVersionMenu] = useState(false);
  const [updateNotice, setUpdateNotice] = useState<number | null>(null);
  const historySequence = useRef(0);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const rootRef = useRef<HTMLElement | null>(null);
  const requestButton = useRef<HTMLButtonElement | null>(null);
  const historyButton = useRef<HTMLButtonElement | null>(null);
  const drawerOpener = useRef<HTMLElement | null>(null);
  const drawerWasOpen = useRef(false);
  const announced = useAnnouncedVersion(id);
  const info = useTabInfo?.();

  useEffect(() => {
    // Our own save announces after the payload moves, so a higher announced
    // version here means another writer published while this tab was open.
    if (payload !== null && announced > payload.version && draft === null && !saving && !conflict) {
      setUpdateNotice(announced);
    }
    model.externalVersion(announced);
  }, [announced, model, saving, payload?.version, draft, conflict]);

  useEffect(() => {
    if (conflict) setUpdateNotice(null);
  }, [conflict]);

  const loaded = payload !== null;
  /* Measured at open time as well as on resize: a missed observer callback must not leave a modal drawer non-modal. */
  const measureOverlay = useCallback(() => {
    const element = rootRef.current;
    const width = element === null ? 0 : element.clientWidth;
    setOverlay(width > 0 ? width <= 600 : window.innerWidth <= 600);
  }, []);

  useEffect(() => {
    const element = rootRef.current;
    if (element === null) return undefined;
    measureOverlay();
    const observer = new ResizeObserver(measureOverlay);
    observer.observe(element);
    window.addEventListener('resize', measureOverlay);
    return () => { observer.disconnect(); window.removeEventListener('resize', measureOverlay); };
  }, [loaded, measureOverlay]);

  const guarded = useCallback((run: LeaveAction) => {
    if (model.getSnapshot().draft !== null || model.getSnapshot().saving) setLeave({ run });
    else void run();
  }, [model]);

  const resetView = useCallback(() => {
    ++historySequence.current;
    setHistoryLoading(false);
    setViewing(null);
    setRequest(null);
    setRequestCopied(false);
    setSelection(null);
    setVersionMenu(false);
    setUpdateNotice(null);
  }, []);

  const reload = useCallback(async () => { resetView(); await model.discardAndReload(); }, [model, resetView]);

  useEffect(() => info?.tab.actions?.bindCommands({ refresh: () => guarded(reload) }), [info?.tab.actions, guarded, reload]);


  useEffect(() => {
    if (payload?.manifest.type !== 'doc' || draft === null || conflict || saving) return;
    const timer = setTimeout(() => void model.save(), 1200);
    return () => clearTimeout(timer);
  }, [draft, conflict, saving, model, payload?.manifest.type]);

  useEffect(() => {
    if (leave === null) return;
    const previous = document.activeElement;
    dialogRef.current?.querySelector('button')?.focus();
    return () => { if (previous instanceof HTMLElement && previous.isConnected) previous.focus(); };
  }, [leave]);

  useEffect(() => {
    if (drawer !== 'history' || payload === null) return;
    const controller = new AbortController();
    setVersions(null); setHistoryFailed(false);
    api.history(where, id, controller.signal).then(value => {
      if (!controller.signal.aborted) setVersions(value.versions);
    }).catch(() => { if (!controller.signal.aborted) setHistoryFailed(true); });
    return () => controller.abort();
  }, [drawer, payload?.version, model]);

  useEffect(() => () => { ++historySequence.current; }, []);

  useEffect(() => {
    if (drawer !== null) {
      drawerWasOpen.current = true;
      return;
    }
    if (!drawerWasOpen.current) return;
    drawerWasOpen.current = false;
    const opener = drawerOpener.current;
    const target = opener !== null && opener.isConnected ? opener : requestButton.current;
    target?.focus();
  }, [drawer]);

  useEffect(() => {
    if (drawer === null) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      if (drawer === 'history') {
        ++historySequence.current;
        setHistoryLoading(false);
        setViewing(null);
      }
      setDrawer(null);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [drawer]);

  const closeDrawer = () => {
    if (drawer === 'history') {
      ++historySequence.current;
      setHistoryLoading(false);
      setViewing(null);
    }
    setRequestCopied(false);
    setDrawer(null);
  };

  const openHistory = () => {
    measureOverlay();
    const active = document.activeElement;
    drawerOpener.current = active instanceof HTMLElement && active.isConnected ? active : historyButton.current;
    ++historySequence.current;
    setHistoryLoading(false);
    setViewing(null);
    setDrawer('history');
  };

  const selectVersion = async (version: number) => {
    const sequence = ++historySequence.current;
    setVersionMenu(false);
    setSelection(null);
    if (version !== (viewing?.version ?? payload?.version)) {
      setRequest(null);
      setRequestCopied(false);
      setDrawer(current => (current === 'request' ? null : current));
    }
    if (version === payload?.version) { setHistoryLoading(false); setViewing(null); return; }
    setHistoryLoading(true);
    try {
      const result = await api.get(where, id, version);
      if (sequence === historySequence.current) setViewing(result);
    } catch (error) { if (sequence === historySequence.current) notify(t(errorKey(codeOf(error)))); }
    finally { if (sequence === historySequence.current) setHistoryLoading(false); }
  };

  const resolveOutput = async (): Promise<number | null> => {
    if (historyLoading) return null;
    if (viewing !== null) return viewing.version;
    if (!await model.save()) return null;
    return model.getSnapshot().payload?.version ?? null;
  };

  const output = async (format: ExportFormat | 'print') => {
    if (busy) return;
    setBusy(true);
    try {
      const version = await resolveOutput();
      if (version === null) return;
      if (format === 'print') printDocument((await api.printable(where, id, version)).html);
      else {
        const file = await api.exportFile(where, id, format, version);
        download(file);
        notify(t('export.done', { name: file.fileName, path: file.path }));
      }
    } catch (error) { notify(t(errorKey(codeOf(error)))); }
    finally { setBusy(false); }
  };

  const rename = async () => {
    if (renameText.trim() === '' || saving) return;
    if (await model.save(renameText.trim())) setRenaming(false);
  };

  const restore = async () => {
    if (viewing === null || busy) return;
    const version = viewing.version;
    guarded(async () => {
      setBusy(true);
      try {
        const next = await api.restore(where, id, version, model.getSnapshot().payload?.version ?? 0);
        announceVersion(id, next.manifest.version); announceListChange();
        resetView();
        await model.load();
      } catch (error) { notify(t(errorKey(codeOf(error)))); }
      finally { setBusy(false); }
    });
  };

  const copy = async (text: string): Promise<boolean> => {
    try { await navigator.clipboard.writeText(text); notify(t('action.copied')); return true; }
    catch { notify(t('action.copyFailed')); return false; }
  };

  const openRequest = async (quote = '', truncated = false) => {
    if (busy || conflict || historyLoading) return;
    measureOverlay();
    const active = document.activeElement;
    const opener = active instanceof HTMLElement && active.isConnected ? active : requestButton.current;
    setBusy(true);
    try {
      const version = await resolveOutput();
      if (version === null) return;
      setRequest(previous => previous !== null && previous.version === version
        ? { ...previous, quote: quote.trim() === '' ? previous.quote : quote, truncated: quote.trim() === '' ? previous.truncated : truncated }
        : { prompt: '', quote, truncated, version });
      setRequestCopied(false);
      // A selection bar unmounts when the drawer opens, so return focus to the
      // editor that carried the selection, not to a removed button.
      drawerOpener.current = quote.trim() === ''
        ? opener
        : (rootRef.current?.querySelector<HTMLElement>('.art-prose, .art-source') ?? opener);
      setSelection(null);
      setDrawer('request');
    } finally { setBusy(false); }
  };

  const reportSelection = useCallback((text: string) => {
    const next = quoteText(text);
    setSelection(next.text === '' ? null : next);
  }, []);

  const openVersionMenu = async () => {
    if (versionMenu) { setVersionMenu(false); return; }
    if (payload === null) return;
    try {
      const value = await api.history(where, id);
      setVersions(value.versions);
    } catch (error) {
      notify(t(errorKey(codeOf(error))));
      return;
    }
    measureOverlay();
    setVersionMenu(true);
  };

  const exportItems = [
    ...FORMATS_BY_TYPE[payload?.manifest.type ?? 'page'].map(format => ({ id: `export-${format}`, label: t(`export.${format}`), run: () => void output(format) })),
    { id: 'export-print', label: t('export.print'), run: () => void output('print') },
  ];

  if (payload === null) return (
    <section className="art-root" data-dsh-artifacts="" ref={rootRef}><div className="art-center" role={failure === undefined ? 'status' : 'alert'}>
      <p>{t(failure === undefined ? 'empty.loading' : errorKey(failure))}</p>
      {failure === undefined ? null : <button className="art-button" onClick={() => void model.load()}>{t('action.retry')}</button>}
      {onBack === undefined ? null : <button className="art-button" onClick={onBack}>{t('tab.close')}</button>}
    </div></section>
  );

  const text = viewing?.content ?? draft ?? payload.content;
  const readOnly = viewing !== null;
  const version = viewing?.version ?? payload.version;
  const status = saving
    ? t('tab.saving')
    : conflict
      ? t('tab.conflictTitle')
      : historyLoading
        ? t('empty.loading')
        : viewing !== null
          ? t('tab.readOnly')
          : failure !== undefined
            ? t('tab.saveFailed')
            : draft !== null ? t('tab.unsaved') : t('tab.saved');
  const tone = conflict || (failure !== undefined && !saving) ? 'error' : saving ? 'warn' : undefined;
  const identity = address.scope === 'workspace' ? workspaceName ?? address.workspaceId : t('scope.library');
  const requestText = request === null ? '' : buildRequest(t, {
    title: payload.manifest.title,
    address,
    id,
    version: request.version,
    workspace: identity,
    quote: request.quote,
    prompt: request.prompt,
  });

  const copyRequest = async () => {
    if (request === null || request.prompt.trim() === '' || requestText === '') return;
    if (await copy(requestText)) setRequestCopied(true);
  };

  return (
    <section className="art-root" data-dsh-artifacts="" data-artifact-id={id} aria-busy={busy} ref={rootRef}>
      <header className="art-header art-editor-header">
        <div className="art-heading">
          {!back || onBack === undefined ? null : <button className="art-icon-button" aria-label={t('action.back')} title={t('action.back')} onClick={() => guarded(onBack)}><IconBack /></button>}
          <div className="art-identity">
            <h1 className="art-title" title={payload.manifest.title}>{payload.manifest.title}</h1>
            <div className="art-meta">
              <span className="art-meta-text">{identity}{address.scope === 'workspace' ? ` · ${t('scope.workspace')}` : null} ·</span>
              <button
                type="button"
                className="art-version-button"
                aria-label={t('tab.versionPicker')}
                aria-haspopup="menu"
                aria-expanded={versionMenu}
                onClick={() => void openVersionMenu()}
              >
                {t('gallery.version', { version })}<IconChevron />
              </button>
              <span className="art-meta-text"> · </span>
              <span className="art-save-status" data-tone={tone} aria-live="polite">{status}</span>
            </div>
          </div>
        </div>
        <div className="art-actions art-editor-actions">
          {payload.manifest.type !== 'page' ? null : <div className="art-segment" role="group" aria-label={t('tab.mode')}>
            <button type="button" aria-pressed={mode === 'preview'} onClick={() => { setMode('preview'); setSelection(null); }}>{t('tab.preview')}</button>
            <button type="button" aria-pressed={mode === 'source'} onClick={() => { setMode('source'); setSelection(null); }}>{t('tab.source')}</button>
          </div>}
          {draft === null || readOnly ? null : <button className="art-icon-button" aria-label={t('tab.save')} title={t('tab.save')} disabled={conflict} onClick={() => void model.save()}><IconSave /></button>}
          <button ref={historyButton} className="art-icon-button" aria-label={t('tab.history')} title={t('tab.history')} aria-pressed={drawer === 'history'} onClick={() => { if (drawer === 'history') closeDrawer(); else openHistory(); }}><IconHistory /></button>
          {overlay ? null : <button className="art-button" aria-label={t('tab.export')} aria-haspopup="menu" aria-expanded={menu === 'export'} disabled={busy || historyLoading} onClick={() => setMenu(menu === 'export' ? null : 'export')}><IconDownload />{t('tab.export')}</button>}
          <button ref={requestButton} type="button" className="art-button art-button-primary art-request-button" aria-haspopup="dialog" disabled={busy || conflict || historyLoading} onClick={() => void openRequest()}>{t('agent.ask')}</button>
          <button className="art-icon-button" aria-label={t('gallery.more')} title={t('gallery.more')} aria-haspopup="menu" aria-expanded={menu === 'more'} onClick={() => setMenu(menu === 'more' ? null : 'more')}><IconMore /></button>
        </div>
        {versionMenu ? <Menu label={t('tab.versionPicker')} align="left" onClose={() => setVersionMenu(false)} items={[
          ...(versions ?? []).map(entry => ({
            id: `version-${entry.version}`,
            label: `${t('tab.versionOf', { version: entry.version })}${entry.version === payload.version ? ` · ${t('tab.currentVersion')}` : ''}`,
            run: () => void selectVersion(entry.version),
          })),
          { id: 'versions-all', label: t('tab.allVersions'), separatorBefore: true, run: openHistory },
        ]} /> : null}
        {menu === 'export' ? <Menu label={t('tab.export')} onClose={() => setMenu(null)} items={[
          ...FORMATS_BY_TYPE[payload.manifest.type].map(format => ({ id: format, label: t(`export.${format}`), run: () => void output(format) })),
          { id: 'print', label: t('export.print'), separatorBefore: true, run: () => void output('print') },
        ]} /> : null}
        {menu === 'more' ? <Menu label={t('gallery.more')} onClose={() => setMenu(null)} items={[
          ...(overlay ? exportItems : []),
          { id: 'rename', label: t('tab.rename'), separatorBefore: overlay, run: () => { setRenameText(payload.manifest.title); setRenaming(true); } },
          { id: 'reload', label: t('tab.reload'), run: () => guarded(reload) },
          { id: 'agent', label: t('agent.edit'), run: () => void openRequest() },
          { id: 'delete', label: t('tab.delete'), separatorBefore: true, run: () => {
            if (!window.confirm(t('tab.deleteConfirm', { title: payload.manifest.title }))) return;
            guarded(async () => {
              try { await api.remove(where, id); announceListChange(); onBack?.(); }
              catch (error) { notify(t(errorKey(codeOf(error)))); }
            });
          } },
        ]} /> : null}
      </header>
      {renaming ? <form className="art-inline-form" onSubmit={event => { event.preventDefault(); void rename(); }}>
        <input aria-label={t('tab.rename')} value={renameText} maxLength={120} autoFocus onChange={event => setRenameText(event.target.value)} onKeyDown={event => { if (event.key === 'Escape') setRenaming(false); }} />
        <button className="art-button" disabled={saving || conflict}>{t('tab.save')}</button><button className="art-button" type="button" onClick={() => setRenaming(false)}>{t('create.cancel')}</button>
      </form> : null}
      {updateNotice === null ? null : <div className="art-bar" role="status"><span>{t('tab.agentUpdate', { version: updateNotice })}</span><span className="art-bar-actions"><button className="art-button" onClick={() => { setUpdateNotice(null); openHistory(); }}>{t('tab.viewHistory')}</button><button className="art-button" onClick={() => setUpdateNotice(null)}>{t('tab.dismiss')}</button></span></div>}
      {conflict ? <div className="art-bar" data-tone="warn" role="alert"><span className="art-bar-text"><strong>{t('tab.conflictTitle')}</strong><span>{t('tab.conflictHint')}</span></span><span className="art-bar-actions"><button className="art-button" onClick={() => void copy(draft ?? '')}>{t('tab.copyDraft')}</button><button className="art-button" onClick={() => guarded(reload)}>{t('tab.discardReload')}</button></span></div> : null}
      {!conflict && failure !== undefined ? <div className="art-bar" role="alert"><span>{t(errorKey(failure))}</span><button className="art-button" onClick={() => void model.save()}>{t('action.retry')}</button></div> : null}
      {viewing === null ? null : <div className="art-bar" role="status"><span>{t('tab.viewingOld', { version: viewing.version, current: payload.version })}</span><span className="art-bar-actions"><button className="art-button" onClick={() => { ++historySequence.current; setHistoryLoading(false); setViewing(null); setRequest(null); setRequestCopied(false); setSelection(null); setDrawer(current => (current === 'request' ? null : current)); }}>{t('tab.backToCurrent')}</button><button className="art-button" disabled={busy} onClick={() => void restore()}>{t('tab.restoreThis')}</button></span></div>}
      <div className="art-body">
        <div className="art-stage">
          {selection === null || drawer !== null ? null : <SelectionBar quote={selection.text} label={t('agent.ask')} askLabel={t('agent.ask')} dismissLabel={t('tab.dismiss')} onAsk={() => void openRequest(selection.text, selection.truncated)} onDismiss={() => setSelection(null)} />}
          {payload.manifest.type === 'page' ? mode === 'preview' ? <PageFrame content={text} designCss={payload.designCss} title={payload.manifest.title} frameTitle={t('tab.frameTitle', { title: payload.manifest.title })} /> : <SourceEditor value={text} readOnly={readOnly} label={t('tab.source')} onChange={value => model.edit(value)} onSave={() => void model.save()} onSelectionText={reportSelection} /> : <DocView markdown={text} revision={`${viewing?.version ?? 0}:${state.revision}`} editable={!readOnly && !conflict} label={payload.manifest.title} loadingLabel={t('empty.loading')} failedLabel={t('error.generic')} t={t} onChange={value => model.edit(value)} onSave={() => void model.save()} onSelectionText={reportSelection} />}
        </div>
        {drawer !== 'request' || request === null ? null : <DrawerShell label={t('agent.ask')} closeLabel={t('drawer.closeRequest')} overlay={overlay} onClose={closeDrawer}>
          <div className="art-request art-request-body">
            <div className="art-request-context" aria-label={t('agent.context')}>
              <span className="art-badge" data-scope={address.scope}>{t(`scope.${address.scope}`)}</span>
              <span className="art-request-dot" aria-hidden="true">·</span>
              <span className="art-request-title" title={payload.manifest.title}>{payload.manifest.title}</span>
              <span className="art-request-dot" aria-hidden="true">·</span>
              <span className="art-request-version">{t('gallery.version', { version: request.version })}</span>
            </div>
            {request.quote === '' ? null : <div className="art-quote">
              <div className="art-quote-head">
                <span>{t('agent.quote')}</span>
                <button type="button" className="art-quote-remove" onClick={() => { setRequest({ ...request, quote: '', truncated: false }); setRequestCopied(false); }}>{t('agent.removeQuote')}</button>
              </div>
              <blockquote>{request.quote}</blockquote>
              {request.truncated ? <p className="art-field-hint">{t('agent.truncated')}</p> : null}
            </div>}
            <label className="art-field">{t('agent.promptLabel')}
              <textarea
                data-drawer-initial
                value={request.prompt}
                placeholder={t('agent.promptPlaceholder')}
                onChange={event => { setRequest({ ...request, prompt: event.target.value }); setRequestCopied(false); }}
              />
            </label>
            {request.prompt.trim() === '' ? <p className="art-field-hint">{t('agent.promptRequired')}</p> : null}
            <p className="art-note">{t('agent.copyHint')}</p>
            {requestCopied ? <p className="art-note" role="status">{t('agent.copiedHint')}</p> : null}
            <details className="art-request-preview">
              <summary>{t('agent.preview')}</summary>
              <pre>{requestText}</pre>
            </details>
            <div className="art-form-actions">
              <button type="button" className="art-button art-button-primary" disabled={request.prompt.trim() === ''} onClick={() => void copyRequest()}>{t('agent.copyRequest')}</button>
            </div>
          </div>
        </DrawerShell>}
        {drawer !== 'history' ? null : <DrawerShell label={t('history.title')} closeLabel={t('history.close')} overlay={overlay} onClose={closeDrawer}>
          <HistoryPanel t={t} versions={versions} failed={historyFailed} current={payload.version} selected={viewing?.version ?? payload.version} onSelect={version => void selectVersion(version)} />
        </DrawerShell>}
      </div>
      {payload.manifest.type !== 'page' ? null : <footer className="art-status"><span>{t('tab.manualSave')}</span><span>{t('tab.outputVersion', { version })}</span></footer>}
      {leave === null ? null : <div className="art-dialog-shade"><div className="art-dialog" role="alertdialog" aria-modal="true" aria-label={t('tab.leaveTitle')} aria-describedby={`leave-hint-${id}`} ref={dialogRef} onKeyDown={event => {
        if (event.key === 'Escape') { event.stopPropagation(); setLeave(null); }
        if (event.key === 'Tab') {
          const buttons = [...(dialogRef.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])];
          const index = buttons.findIndex(button => button === document.activeElement);
          event.preventDefault(); buttons[(index + (event.shiftKey ? -1 : 1) + buttons.length) % buttons.length]?.focus();
        }
      }}><h2>{t('tab.leaveTitle')}</h2><p id={`leave-hint-${id}`}>{t(conflict ? 'tab.conflictHint' : 'tab.leaveHint')}</p>{failure === undefined ? null : <p role="alert">{t(errorKey(failure))}</p>}<div className="art-form-actions">
        <button className="art-button" disabled={busy} onClick={() => setLeave(null)}>{t('create.cancel')}</button>
        <button className="art-button" disabled={saving || busy} onClick={() => { const run = leave.run; setLeave(null); void model.discardAndReload().then(run); }}>{t('tab.discardContinue')}</button>
        <button className="art-button art-button-primary" disabled={conflict || busy} onClick={async () => { setBusy(true); const ok = await model.save(); setBusy(false); if (ok) { const run = leave.run; setLeave(null); await run(); } }}>{t('tab.saveContinue')}</button>
      </div></div></div>}
    </section>
  );
}
