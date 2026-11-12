import { useCallback, useEffect, useRef, useState } from 'react';
import { FORMATS_BY_TYPE, formatArtifactAddress, parseArtifactAddress } from '../contract.js';
import type { ArtifactAddress, ArtifactPayload, ExportFormat, VersionEntry } from '../contract.js';
import { api, codeOf, download, errorKey } from './api.js';
import { DocView } from './doc-view.jsx';
import { useEditor } from './editor-model.js';
import { printDocument } from './frames.js';
import type { TabProps, Translator, UseTabInfo } from './harness.js';
import { HistoryPanel } from './history.jsx';
import { IconBack, IconDownload, IconHistory, IconMore, IconSave } from './icons.jsx';
import { Menu } from './menu.jsx';
import { announceListChange, announceVersion, notify, useAnnouncedVersion } from './store.js';
import { PageFrame, SourceEditor } from './page-view.jsx';

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
  const [showHistory, setShowHistory] = useState(false);
  const [versions, setVersions] = useState<VersionEntry[] | null>(null);
  const [historyFailed, setHistoryFailed] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [viewing, setViewing] = useState<ArtifactPayload | null>(null);
  const [menu, setMenu] = useState<'export' | 'more' | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [renameText, setRenameText] = useState('');
  const [leave, setLeave] = useState<{ run: LeaveAction } | null>(null);
  const [busy, setBusy] = useState(false);
  const [request, setRequest] = useState<string | null>(null);
  const historySequence = useRef(0);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const announced = useAnnouncedVersion(id);
  const info = useTabInfo?.();

  useEffect(() => { model.externalVersion(announced); }, [announced, model, saving, payload?.version]);

  const guarded = useCallback((run: LeaveAction) => {
    if (model.getSnapshot().draft !== null || model.getSnapshot().saving) setLeave({ run });
    else void run();
  }, [model]);

  const resetView = useCallback(() => {
    ++historySequence.current;
    setHistoryLoading(false);
    setViewing(null);
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
    if (!showHistory || payload === null) return;
    const controller = new AbortController();
    setVersions(null); setHistoryFailed(false);
    api.history(where, id, controller.signal).then(value => {
      if (!controller.signal.aborted) setVersions(value.versions);
    }).catch(() => { if (!controller.signal.aborted) setHistoryFailed(true); });
    return () => controller.abort();
  }, [showHistory, payload?.version, model]);

  useEffect(() => () => { ++historySequence.current; }, []);

  const selectVersion = async (version: number) => {
    const sequence = ++historySequence.current;
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

  const copy = async (text: string) => {
    try { await navigator.clipboard.writeText(text); notify(t('action.copied')); }
    catch { setRequest(text); notify(t('action.copyFailed')); }
  };

  const prepareRequest = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const version = await resolveOutput();
      if (version !== null) setRequest(t('agent.request', {
        title: payload?.manifest.title ?? id, address: formatArtifactAddress(address), id,
        scope: address.scope, workspace: address.scope === 'workspace' ? address.workspaceId : t('scope.library'), version,
      }));
    } finally { setBusy(false); }
  };

  if (payload === null) return (
    <section className="art-root" data-dsh-artifacts=""><div className="art-center" role={failure === undefined ? 'status' : 'alert'}>
      <p>{t(failure === undefined ? 'empty.loading' : errorKey(failure))}</p>
      {failure === undefined ? null : <button className="art-button" onClick={() => void model.load()}>{t('action.retry')}</button>}
      {onBack === undefined ? null : <button className="art-button" onClick={onBack}>{t('tab.close')}</button>}
    </div></section>
  );

  const text = viewing?.content ?? draft ?? payload.content;
  const readOnly = viewing !== null;
  const status = saving ? t('tab.saving') : conflict ? t('error.stale') : failure !== undefined ? t(errorKey(failure)) : draft !== null ? t('tab.unsaved') : t('tab.saved');

  return (
    <section className="art-root" data-dsh-artifacts="" data-artifact-id={id} aria-busy={busy}>
      <header className="art-header art-editor-header">
        <div className="art-heading">
          {!back || onBack === undefined ? null : <button className="art-icon-button" aria-label={t('action.back')} title={t('action.back')} onClick={() => guarded(onBack)}><IconBack /></button>}
          <div className="art-identity">
            <span className="art-title" title={payload.manifest.title}>{payload.manifest.title}</span>
            <span className="art-meta">{address.scope === 'workspace' ? workspaceName ?? address.workspaceId : t('scope.library')} · {t(`scope.${address.scope}`)} · {t('gallery.version', { version: payload.version })}</span>
          </div>
        </div>
        <div className="art-actions art-editor-actions">
          {payload.manifest.type !== 'page' ? null : <div className="art-segment" role="group" aria-label={t('tab.mode')}>
            <button type="button" aria-pressed={mode === 'preview'} onClick={() => setMode('preview')}>{t('tab.preview')}</button>
            <button type="button" aria-pressed={mode === 'source'} onClick={() => setMode('source')}>{t('tab.source')}</button>
          </div>}
          {draft === null || readOnly ? null : <button className="art-icon-button" aria-label={t('tab.save')} title={t('tab.save')} disabled={conflict} onClick={() => void model.save()}><IconSave /></button>}
          <button className="art-icon-button" aria-label={t('tab.history')} title={t('tab.history')} aria-pressed={showHistory} onClick={() => { setShowHistory(value => !value); ++historySequence.current; setHistoryLoading(false); setViewing(null); }}><IconHistory /></button>
          <button className="art-button" aria-label={t('tab.export')} aria-haspopup="menu" aria-expanded={menu === 'export'} disabled={busy || historyLoading} onClick={() => setMenu(menu === 'export' ? null : 'export')}><IconDownload />{t('tab.export')}</button>
          <button className="art-icon-button" aria-label={t('gallery.more')} title={t('gallery.more')} aria-haspopup="menu" aria-expanded={menu === 'more'} onClick={() => setMenu(menu === 'more' ? null : 'more')}><IconMore /></button>
        </div>
        {menu === 'export' ? <Menu label={t('tab.export')} onClose={() => setMenu(null)} items={[
          ...FORMATS_BY_TYPE[payload.manifest.type].map(format => ({ id: format, label: t(`export.${format}`), run: () => void output(format) })),
          { id: 'print', label: t('export.print'), separatorBefore: true, run: () => void output('print') },
        ]} /> : null}
        {menu === 'more' ? <Menu label={t('gallery.more')} onClose={() => setMenu(null)} items={[
          { id: 'rename', label: t('tab.rename'), run: () => { setRenameText(payload.manifest.title); setRenaming(true); } },
          { id: 'reload', label: t('tab.reload'), run: () => guarded(reload) },
          { id: 'agent', label: t('agent.edit'), run: () => void prepareRequest() },
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
      <div className="art-edit-strip">
        <span aria-live="polite">{historyLoading ? t('empty.loading') : readOnly ? t('tab.versionOf', { version: viewing.version }) : status}</span>
        <button className="art-text-button" disabled={busy || conflict || historyLoading} onClick={() => void prepareRequest()}>{t('agent.edit')}</button>
      </div>
      {request === null ? null : <div className="art-request">
        <label className="art-field">{t('agent.review')}<textarea value={request} onChange={event => setRequest(event.target.value)} /></label>
        <p className="art-note">{t('agent.copyHint')}</p><div className="art-form-actions"><button className="art-button" onClick={() => setRequest(null)}>{t('create.cancel')}</button><button className="art-button art-button-primary" onClick={() => void copy(request)}>{t('agent.copy')}</button></div>
      </div>}
      {conflict ? <div className="art-bar" data-tone="warn" role="alert"><span className="art-bar-text"><strong>{t('tab.conflictTitle')}</strong><span>{t('tab.conflictHint')}</span></span><span className="art-bar-actions"><button className="art-button" onClick={() => void copy(draft ?? '')}>{t('tab.copyDraft')}</button><button className="art-button" onClick={() => guarded(reload)}>{t('tab.discardReload')}</button></span></div> : null}
      {!conflict && failure !== undefined ? <div className="art-bar" role="alert"><span>{t(errorKey(failure))}</span><button className="art-button" onClick={() => void model.save()}>{t('action.retry')}</button></div> : null}
      {viewing === null ? null : <div className="art-bar" role="status"><span>{t('tab.viewingOld', { version: viewing.version, current: payload.version })}</span><span className="art-bar-actions"><button className="art-button" onClick={() => { ++historySequence.current; setHistoryLoading(false); setViewing(null); }}>{t('tab.backToCurrent')}</button><button className="art-button" disabled={busy} onClick={() => void restore()}>{t('tab.restoreThis')}</button></span></div>}
      <div className="art-body">
        <div className="art-stage">
          {payload.manifest.type === 'page' ? mode === 'preview' ? <PageFrame content={text} designCss={payload.designCss} title={payload.manifest.title} frameTitle={t('tab.frameTitle', { title: payload.manifest.title })} /> : <SourceEditor value={text} readOnly={readOnly} label={t('tab.source')} onChange={value => model.edit(value)} onSave={() => void model.save()} /> : <DocView markdown={text} revision={`${viewing?.version ?? 0}:${state.revision}`} editable={!readOnly && !conflict} label={payload.manifest.title} loadingLabel={t('empty.loading')} failedLabel={t('error.generic')} t={t} onChange={value => model.edit(value)} onSave={() => void model.save()} />}
        </div>
        {!showHistory ? null : <HistoryPanel t={t} versions={versions} failed={historyFailed} current={payload.version} selected={viewing?.version ?? payload.version} onSelect={version => void selectVersion(version)} onClose={() => { ++historySequence.current; setHistoryLoading(false); setViewing(null); setShowHistory(false); }} />}
      </div>
      <footer className="art-status"><span>{t(payload.manifest.type === 'page' ? 'tab.manualSave' : 'tab.autosave')}</span><span>{t('tab.outputVersion', { version: viewing?.version ?? payload.version })}</span></footer>
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
