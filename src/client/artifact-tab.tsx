import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode, Ref } from 'react';
import {
  Button,
  CodeBlock,
  Input,
  IconChevronDownOutlineRegular,
  IconChevronLeftOutlineRegular,
  IconClockOutlineRegular,
  IconCloseOutlineRegular,
  IconDownloadOutlineRegular,
  IconEditOutlineRegular,
  IconEllipsisOutlineRegular,
  IconSaveOutlineRegular,
  IconSlidersTwoOutlineRegular,
  IconSparkleRegular,
  Menu,
  Modal,
  SegmentedControl,
  Tooltip,
} from '@deepseek-ai/dsh-client-ui-primitives';
import type { MenuEntry } from '@deepseek-ai/dsh-client-ui-primitives';
import { FORMATS_BY_TYPE, formatArtifactAddress, parseArtifactAddress } from '../contract.js';
import type { ArtifactAddress, ArtifactPayload, DesignSelection, ExportFormat, VersionEntry } from '../contract.js';
import { api, codeOf, download, errorKey } from './api.js';
import type { CanvasSnapshot, DesignCanvasHandle, SelectedLayer } from './canvas/entry.js';
import { DesignCanvasView } from './design-canvas-view.jsx';
import { DesignInspector, layerGlyph, layerTypeLabel } from './design-inspector.jsx';
import type { InspectorTab } from './design-inspector.jsx';
import { DesignView } from './design-view.jsx';
import { DocView } from './doc-view.jsx';
import { useEditor } from './editor-model.js';
import { printDocument } from './frames.js';
import type { InputActions, TabInfo, TabProps, Translator, UseTabInfo } from './harness.js';
import { HistoryPanel } from './history.jsx';
import { announceListChange, announceVersion, notify, useAnnouncedVersion } from './store.js';
import { PageFrame, SourceEditor } from './page-view.jsx';
import { SheetView } from './sheet-view.jsx';
import { buildDesignQuote, buildReference, plainRequest, quoteText } from './review.js';
import type { Quote } from './review.js';
import { RebaseDialog } from './rebase-dialog.jsx';
import { useHarnessDark } from './theme.js';

/** A small icon-only control with the shared tooltip. */
function IconButton({ label, icon, onClick, pressed, disabled, buttonRef }: {
  label: string;
  icon: ReactNode;
  onClick: () => void;
  pressed?: boolean;
  disabled?: boolean;
  buttonRef?: Ref<HTMLButtonElement>;
}) {
  return (
    <Tooltip label={label} side="bottom" portal>
      <Button ref={buttonRef} size="sm" className="art-icon-button" aria-label={label} aria-pressed={pressed} disabled={disabled} onClick={onClick}>
        {icon}
      </Button>
    </Tooltip>
  );
}

/**
 * The bar over a page that turns a selection into an edit request.
 * @param props the quote and the two actions.
 * @returns the bar.
 */
function SelectionBar({ quote, askLabel, dismissLabel, onAsk, onDismiss }: {
  quote: string;
  askLabel: string;
  dismissLabel: string;
  onAsk: () => void;
  onDismiss: () => void;
}) {
  return (
    <div className="art-selection-bar" role="toolbar" aria-label={askLabel}>
      <span className="art-selection-quote" title={quote}>{quote}</span>
      <Button size="sm" variant="primary" className="art-ask" icon={<IconSparkleRegular size={14} />} onClick={onAsk}>{askLabel}</Button>
      <IconButton label={dismissLabel} icon={<IconCloseOutlineRegular size={14} />} onClick={onDismiss} />
    </div>
  );
}

/**
 * The bar over a design's canvas that turns a selected layer into an edit request.
 * @param props the layer and the two actions.
 * @returns the bar.
 */
function LayerBar({ t, layer, askLabel, dismissLabel, onAsk, onDismiss }: {
  t: Translator;
  layer: SelectedLayer;
  askLabel: string;
  dismissLabel: string;
  onAsk: () => void;
  onDismiss: () => void;
}) {
  const type = layerTypeLabel(t, layer.type);
  return (
    <div className="art-selection-bar art-layer-bar" role="toolbar" aria-label={askLabel}>
      <span className="art-layer-bar-glyph" aria-hidden="true">{layerGlyph(layer.type)}</span>
      <span className="art-layer-bar-text">
        <span className="art-layer-bar-name" title={layer.name}>{layer.name}</span>
        <span className="art-layer-bar-sub">{layer.parentName === '' ? type : t('layer.parentLine', { type, parent: layer.parentName })}</span>
      </span>
      <Button size="sm" variant="primary" className="art-ask" icon={<IconSparkleRegular size={14} />} onClick={onAsk}>{askLabel}</Button>
      <IconButton label={dismissLabel} icon={<IconCloseOutlineRegular size={14} />} onClick={onDismiss} />
    </div>
  );
}

/**
 * The history side panel. It is inline in a wide pane and a modal overlay in a
 * narrow one, where it carries a scrim and keeps Tab inside.
 * @param props the label, close action, and content.
 * @returns the drawer.
 */
function DrawerShell({ label, closeLabel, overlay, onClose, head, children }: {
  label: string;
  closeLabel: string;
  overlay: boolean;
  onClose: () => void;
  head?: ReactNode;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    ref.current?.querySelector<HTMLElement>('[data-drawer-initial]')?.focus()
      ?? ref.current?.querySelector<HTMLElement>('.art-version, button')?.focus();
  }, [label]);

  useEffect(() => {
    if (!overlay) return undefined;
    const onFocus = (event: FocusEvent) => {
      const node = ref.current;
      if (node === null || (event.target instanceof Node && node.contains(event.target))) return;
      node.querySelector<HTMLElement>('button')?.focus();
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
          const focusable = [...(ref.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]') ?? [])];
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
          {head ?? <h2>{label}</h2>}
          <IconButton label={closeLabel} icon={<IconCloseOutlineRegular size={14} />} onClick={onClose} />
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
  if (address === undefined) return <section className="art-root"><p className="art-note">{props.t('error.notFound')}</p></section>;
  return <ArtifactBody key={formatArtifactAddress(address)} t={props.t} address={address} useTabInfo={props.useTabInfo} onBack={info.tab.actions?.close} workspaceName={workspaceName} inputActions={props.inputActions} />;
}

export function ArtifactPanelBody({ t, address, onBack, workspaceName, inputActions }: {
  t: Translator; address: ArtifactAddress; onBack: () => void; workspaceName?: string; inputActions?: InputActions;
}) {
  return <ArtifactBody key={formatArtifactAddress(address)} t={t} address={address} onBack={onBack} workspaceName={workspaceName} back inputActions={inputActions} />;
}

interface ArtifactBodyProps {
  t: Translator;
  address: ArtifactAddress;
  useTabInfo?: UseTabInfo;
  onBack?: () => void;
  workspaceName?: string;
  back?: boolean;
  inputActions?: InputActions;
}

type LeaveAction = () => void | Promise<void>;

/** The full page has no tab; the hook is still called once per render. */
const useNoTab = (): TabInfo | undefined => undefined;
type Mode = 'view' | 'edit' | 'source';

function ArtifactBody({ t, address, useTabInfo, onBack, workspaceName, back, inputActions }: ArtifactBodyProps) {
  const { model, state } = useEditor(address);
  const { payload, draft, saving, conflict, failure, failureMessage } = state;
  const where = model.where;
  const id = address.id;
  const dark = useHarnessDark();
  const [mode, setMode] = useState<Mode>('view');
  const [editing, setEditing] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>('layers');
  const [canvasHandle, setCanvasHandle] = useState<DesignCanvasHandle | null>(null);
  const [canvasSnapshot, setCanvasSnapshot] = useState<CanvasSnapshot | null>(null);
  const [canvasSelection, setCanvasSelection] = useState<SelectedLayer[]>([]);
  const [canvasFailure, setCanvasFailure] = useState<string | null>(null);
  const [canvasAttempt, setCanvasAttempt] = useState(0);
  const [overlay, setOverlay] = useState(false);
  const [versions, setVersions] = useState<VersionEntry[] | null>(null);
  const [historyFailed, setHistoryFailed] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [viewing, setViewing] = useState<ArtifactPayload | null>(null);
  const [menu, setMenu] = useState<'export' | 'more' | 'version' | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [rebasing, setRebasing] = useState(false);
  const [renameText, setRenameText] = useState('');
  const [leave, setLeave] = useState<{ run: LeaveAction } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [selection, setSelection] = useState<Quote | null>(null);
  const [fallback, setFallback] = useState<string | null>(null);
  const [updateNotice, setUpdateNotice] = useState<number | null>(null);
  const historySequence = useRef(0);
  const rootRef = useRef<HTMLElement | null>(null);
  const codeRef = useRef<HTMLDivElement | null>(null);
  const historyButton = useRef<HTMLButtonElement | null>(null);
  const historyWasOpen = useRef(false);
  const announced = useAnnouncedVersion(id);
  const info = (useTabInfo ?? useNoTab)();

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

  // A quote names text in the version it came from; a new version makes it stale.
  useEffect(() => {
    setSelection(null);
    setCanvasSelection([]);
  }, [payload?.version, viewing?.version, state.revision]);

  // The inspector reads the canvas handle's snapshots; the view owns its own
  // subscription and only reports the selection it shows in the layer bar.
  useEffect(() => {
    if (canvasHandle === null) {
      setCanvasSnapshot(null);
      return undefined;
    }
    setCanvasSnapshot(canvasHandle.getSnapshot());
    return canvasHandle.subscribe(setCanvasSnapshot);
  }, [canvasHandle]);

  // An old version has no editor, so it stays in View.
  const showingOldVersion = viewing !== null;
  useEffect(() => {
    if (showingOldVersion && mode === 'edit') {
      setMode('view');
      setInspectorOpen(false);
    }
  }, [showingOldVersion, mode]);

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
    setSelection(null);
    setMenu(null);
    setUpdateNotice(null);
  }, []);

  const reload = useCallback(async () => { resetView(); await model.discardAndReload(); }, [model, resetView]);

  useEffect(() => info?.tab.actions?.bindCommands({ refresh: () => guarded(reload) }), [info?.tab.actions, guarded, reload]);

  useEffect(() => {
    if ((payload?.manifest.type !== 'doc' && payload?.manifest.type !== 'sheet') || draft === null || conflict || saving) return;
    const timer = setTimeout(() => void model.save(), 1200);
    return () => clearTimeout(timer);
  }, [draft, conflict, saving, model, payload?.manifest.type]);

  useEffect(() => {
    if (!historyOpen || payload === null) return;
    const controller = new AbortController();
    setVersions(null); setHistoryFailed(false);
    api.history(where, id, controller.signal).then(value => {
      if (!controller.signal.aborted) setVersions(value.versions);
    }).catch(() => { if (!controller.signal.aborted) setHistoryFailed(true); });
    return () => controller.abort();
  }, [historyOpen, payload?.version, model]);

  useEffect(() => () => { ++historySequence.current; }, []);

  useEffect(() => {
    if (historyOpen) { historyWasOpen.current = true; return; }
    if (!historyWasOpen.current) return;
    historyWasOpen.current = false;
    historyButton.current?.focus();
  }, [historyOpen]);

  // A read-only code view has no input events, so its selection comes from the document.
  useEffect(() => {
    if (mode !== 'source' || payload?.manifest.type !== 'page') return undefined;
    const onSelection = () => {
      const node = codeRef.current;
      const current = window.getSelection();
      if (node === null || current === null || current.anchorNode === null || !node.contains(current.anchorNode)) return;
      const next = quoteText(current.toString());
      setSelection(next.text === '' ? null : next);
    };
    document.addEventListener('selectionchange', onSelection);
    return () => document.removeEventListener('selectionchange', onSelection);
  }, [mode, payload?.manifest.type]);

  const onCanvasHandle = useCallback((handle: DesignCanvasHandle | null) => setCanvasHandle(handle), []);
  const onCanvasSelection = useCallback((layers: SelectedLayer[]) => setCanvasSelection(layers), []);
  const onCanvasFailure = useCallback((message: string | null) => setCanvasFailure(message), []);

  const closeInspector = () => setInspectorOpen(false);

  const closeHistory = () => {
    ++historySequence.current;
    setHistoryLoading(false);
    setViewing(null);
    setHistoryOpen(false);
  };

  const openHistory = () => {
    measureOverlay();
    ++historySequence.current;
    setHistoryLoading(false);
    setViewing(null);
    setMenu(null);
    setInspectorOpen(false);
    setHistoryOpen(true);
  };

  const selectVersion = async (version: number) => {
    const sequence = ++historySequence.current;
    setMenu(null);
    setSelection(null);
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

  const rebase = async (selection: DesignSelection) => {
    if (viewing !== null || conflict || busy) return;
    setBusy(true);
    try {
      if (!await model.save()) throw new Error(t('error.stale'));
      const current = model.getSnapshot();
      if (current.draft !== null || current.conflict || current.payload === null) throw new Error(t('error.stale'));
      const result = await api.rebase(where, id, current.payload.version, selection);
      announceVersion(id, result.manifest.version); announceListChange();
      resetView();
      await model.load();
      notify(t('generation.done'));
    } finally { setBusy(false); }
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

  const copy = async (text: string, done: string): Promise<void> => {
    try { await navigator.clipboard.writeText(text); notify(t(done)); }
    catch { setFallback(text); }
  };

  /**
   * Put the selection and an artifact reference into this session's composer.
   * The user finishes the request and sends it; nothing is sent here.
   */
  const askAgent = async (quote: Quote | null, truncatedNotice = 'agent.addedTruncated') => {
    if (busy || conflict || historyLoading || payload === null) return;
    setBusy(true);
    try {
      const version = await resolveOutput();
      if (version === null) return;
      const current = model.getSnapshot().payload ?? payload;
      const reference = buildReference(t, {
        title: current.manifest.title,
        id,
        version,
        current: current.version,
        ...(address.scope === 'workspace' ? { workspaceId: address.workspaceId } : {}),
      });
      const text = quote?.text ?? '';
      setSelection(null);
      setCanvasSelection([]);
      canvasHandle?.clearSelection();
      if (inputActions === undefined) {
        await copy(plainRequest(text, reference), 'agent.copied');
        return;
      }
      const quoted = text === '' || inputActions.insertQuote(text);
      if (quoted && inputActions.insertText(reference, inputActions.captureInsertion())) {
        notify(t(quote?.truncated === true ? truncatedNotice : 'agent.added'));
        return;
      }
      await copy(plainRequest(text, reference), 'agent.insertFailed');
    } finally { setBusy(false); }
  };

  const reportSelection = useCallback((text: string) => {
    const next = quoteText(text);
    setSelection(next.text === '' ? null : next);
  }, []);

  const openVersionMenu = async () => {
    if (menu === 'version') { setMenu(null); return; }
    if (payload === null) return;
    try {
      const value = await api.history(where, id);
      setVersions(value.versions);
    } catch (error) {
      notify(t(errorKey(codeOf(error))));
      return;
    }
    setMenu('version');
  };

  if (payload === null) return (
    <section className="art-root" data-dsh-artifact-studio="" ref={rootRef}><div className="art-center" role={failure === undefined ? 'status' : 'alert'}>
      <p className="art-center-hint">{t(failure === undefined ? 'empty.loading' : errorKey(failure))}</p>
      <div className="art-center-actions">
        {failure === undefined ? null : <Button size="sm" variant="outline" onClick={() => void model.load()}>{t('action.retry')}</Button>}
        {onBack === undefined ? null : <Button size="sm" variant="outline" onClick={onBack}>{t('tab.close')}</Button>}
      </div>
    </div></section>
  );

  const type = payload.manifest.type;
  const selectedPayload = viewing ?? payload;
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
  const showEditor = mode === 'source' && !readOnly && (editing || draft !== null);
  const unpanelled = type === 'doc' || type === 'sheet';

  const exportLabel = (format: ExportFormat): string => {
    if (type === 'design' && format === 'html') return t('export.mockupHtml');
    if (type === 'design' && format === 'html-svg') return t('export.mockupSvgHtml');
    return t(`export.${format}`);
  };
  const exportEntries: MenuEntry[] = [
    ...FORMATS_BY_TYPE[type].map(format => ({ id: format, label: exportLabel(format) })),
    ...(type === 'design' ? [] : [
      { type: 'separator' as const, id: 'export-gap' },
      { id: 'print', label: t('export.print') },
    ]),
  ];
  const runExport = (entry: string) => {
    setMenu(null);
    if (entry === 'print') void output('print');
    else void output(entry as ExportFormat);
  };
  const moreEntries: MenuEntry[] = [
    ...(overlay ? [...exportEntries, { type: 'separator' as const, id: 'more-gap' }] : []),
    ...(type === 'design' || type === 'sheet' || readOnly ? [] : [{ id: 'rebase', label: t('generation.rebase'), disabled: busy || saving || conflict }]),
    { id: 'rename', label: t('tab.rename') },
    { id: 'reload', label: t('tab.reload') },
    { type: 'separator', id: 'danger-gap' },
    { id: 'delete', label: t('tab.delete'), danger: true },
  ];
  const runMore = (entry: string) => {
    setMenu(null);
    if (entry === 'rename') { setRenameText(payload.manifest.title); setRenaming(true); }
    else if (entry === 'rebase') setRebasing(true);
    else if (entry === 'reload') guarded(reload);
    else if (entry === 'delete') setDeleting(true);
    else runExport(entry);
  };
  const versionEntries: MenuEntry[] = [
    ...(versions ?? []).map(entry => ({
      id: 'v' + entry.version,
      label: t('tab.versionOf', { version: entry.version }) + (entry.version === payload.version ? ' · ' + t('tab.currentVersion') : ''),
    })),
    { type: 'separator', id: 'versions-gap' },
    { id: 'all', label: t('tab.allVersions') },
  ];
  const runVersion = (entry: string) => {
    setMenu(null);
    if (entry === 'all') openHistory();
    else void selectVersion(Number(entry.slice(1)));
  };

  const editWithAgent = (
    <Button
      size="sm"
      variant="primary"
      className="art-ask"
      icon={<IconSparkleRegular size={14} />}
      disabled={busy || conflict || historyLoading}
      onClick={() => {
        if (type === 'design') {
          const layer = canvasHandle?.quoteSelection();
          if (layer !== null && layer !== undefined) {
            void askAgent(buildDesignQuote(t, layer), 'agent.addedTruncatedDesign');
            return;
          }
        }
        void askAgent(selection);
      }}
    >
      {t('agent.ask')}
    </Button>
  );

  return (
    <section className="art-root" data-dsh-artifact-studio="" data-artifact-id={id} aria-busy={busy} ref={rootRef}>
      <header className="art-header art-editor-header">
        <div className="art-heading">
          {!back || onBack === undefined ? null : <IconButton label={t('action.back')} icon={<IconChevronLeftOutlineRegular size={16} />} onClick={() => guarded(onBack)} />}
          <div className="art-identity">
            <h1 className="art-title" title={payload.manifest.title}>{payload.manifest.title}</h1>
            <div className="art-meta">
              <span className="art-meta-text">{identity}{address.scope === 'workspace' ? ' · ' + t('scope.workspace') : null}</span>
              <span className="art-meta-dot" aria-hidden="true">·</span>
              <Menu
                open={menu === 'version'}
                onClose={() => setMenu(null)}
                items={versionEntries}
                onSelect={runVersion}
                portal
                autoFocus
                anchor={
                  <Button size="sm" className="art-version-button" aria-label={t('tab.versionPicker')} aria-haspopup="menu" aria-expanded={menu === 'version'} onClick={() => void openVersionMenu()}>
                    {t('gallery.version', { version })}<IconChevronDownOutlineRegular size={12} />
                  </Button>
                }
              />
              <span className="art-meta-dot" aria-hidden="true">·</span>
              <span className="art-save-status" data-tone={tone} aria-live="polite">{status}</span>
              {type === 'design' || type === 'sheet' ? null : <span className="art-generation" title={selectedPayload.generation?.system ? t('design.revision', { name: selectedPayload.generation.system.name, revision: selectedPayload.generation.system.revision }) : undefined}> · {t(selectedPayload.generation ? 'generation.pinned' : 'generation.legacy')}</span>}
            </div>
          </div>
        </div>
        <div className="art-actions art-editor-actions">
          {type === 'doc' || type === 'sheet' ? null : (
            <SegmentedControl<Mode>
              id={'art-mode-' + id}
              className="art-segment"
              label={t('tab.mode')}
              value={mode}
              options={type === 'design'
                ? [
                    { value: 'view', label: t('canvas.viewMode') },
                    { value: 'edit', label: t('canvas.editMode'), disabled: readOnly, title: readOnly ? t('canvas.editOldVersion') : undefined },
                    { value: 'source', label: t('tab.source') },
                  ]
                : [{ value: 'view', label: t('tab.preview') }, { value: 'source', label: t('tab.source') }]}
              onChange={(next) => {
                setMode(next);
                setSelection(null);
                setInspectorOpen(type === 'design' && next === 'edit' && !readOnly);
              }}
            />
          )}
          {type === 'design' && mode === 'edit' && !readOnly ? (
            <IconButton label={t('canvas.inspector')} icon={<IconSlidersTwoOutlineRegular size={16} />} pressed={inspectorOpen} onClick={() => { if (inspectorOpen) setInspectorOpen(false); else { setHistoryOpen(false); setInspectorOpen(true); } }} />
          ) : null}
          {draft === null || readOnly ? null : <IconButton label={t('tab.save')} icon={<IconSaveOutlineRegular size={16} />} disabled={conflict} onClick={() => void model.save()} />}
          <IconButton buttonRef={historyButton} label={t('tab.history')} icon={<IconClockOutlineRegular size={16} />} pressed={historyOpen} onClick={() => { if (historyOpen) closeHistory(); else openHistory(); }} />
          {overlay ? null : (
            <Menu
              open={menu === 'export'}
              onClose={() => setMenu(null)}
              items={exportEntries}
              onSelect={runExport}
              align="end"
              portal
              autoFocus
              anchor={<Button size="sm" icon={<IconDownloadOutlineRegular size={14} />} aria-label={t('tab.export')} aria-haspopup="menu" aria-expanded={menu === 'export'} disabled={busy || historyLoading} onClick={() => setMenu(menu === 'export' ? null : 'export')}>{t('tab.export')}</Button>}
            />
          )}
          {editWithAgent}
          <Menu
            open={menu === 'more'}
            onClose={() => setMenu(null)}
            items={moreEntries}
            onSelect={runMore}
            align="end"
            portal
            autoFocus
            anchor={<Button size="sm" className="art-icon-button" aria-label={t('gallery.more')} aria-haspopup="menu" aria-expanded={menu === 'more'} onClick={() => setMenu(menu === 'more' ? null : 'more')}><IconEllipsisOutlineRegular size={14} /></Button>}
          />
        </div>
      </header>
      {rebasing ? <RebaseDialog t={t} where={where} onClose={() => setRebasing(false)} onApply={rebase} /> : null}
      {renaming ? <form className="art-inline-form" onSubmit={event => { event.preventDefault(); void rename(); }}>
        <Input aria-label={t('tab.rename')} value={renameText} maxLength={120} autoFocus onChange={event => setRenameText(event.target.value)} onKeyDown={event => { if (event.key === 'Escape') setRenaming(false); }} />
        <Button type="submit" size="sm" variant="primary" disabled={saving || conflict}>{t('tab.save')}</Button>
        <Button size="sm" variant="outline" onClick={() => setRenaming(false)}>{t('create.cancel')}</Button>
      </form> : null}
      {updateNotice === null ? null : <div className="art-bar" role="status"><span>{t('tab.agentUpdate', { version: updateNotice })}</span><span className="art-bar-actions"><Button size="sm" variant="outline" onClick={() => { setUpdateNotice(null); openHistory(); }}>{t('tab.viewHistory')}</Button><Button size="sm" variant="outline" onClick={() => setUpdateNotice(null)}>{t('tab.dismiss')}</Button></span></div>}
      {conflict ? <div className="art-bar" data-tone="warn" role="alert"><span className="art-bar-text"><strong>{t('tab.conflictTitle')}</strong><span>{t('tab.conflictHint')}</span></span><span className="art-bar-actions"><Button size="sm" variant="outline" onClick={() => void copy(draft ?? '', 'action.copied')}>{t('tab.copyDraft')}</Button><Button size="sm" variant="outline" onClick={() => guarded(reload)}>{t('tab.discardReload')}</Button></span></div> : null}
      {!conflict && failure !== undefined ? <div className="art-bar" data-tone="error" role="alert"><span>{failureMessage ?? t(errorKey(failure))}</span><Button size="sm" variant="outline" onClick={() => void model.save()}>{t('action.retry')}</Button></div> : null}
      {viewing === null ? null : <div className="art-bar" role="status"><span>{t('tab.viewingOld', { version: viewing.version, current: payload.version })}</span><span className="art-bar-actions"><Button size="sm" variant="outline" onClick={() => { ++historySequence.current; setHistoryLoading(false); setViewing(null); setSelection(null); }}>{t('tab.backToCurrent')}</Button><Button size="sm" variant="outline" disabled={busy} onClick={() => void restore()}>{t('tab.restoreThis')}</Button></span></div>}
      {type !== 'design' || canvasFailure === null ? null : (
        <div className="art-bar" data-tone="error" role="alert">
          <span>{t('canvas.startFailed')}</span>
          <span className="art-bar-actions"><Button size="sm" variant="outline" onClick={() => { setCanvasFailure(null); setCanvasAttempt(value => value + 1); }}>{t('action.retry')}</Button></span>
        </div>
      )}
      <div className="art-body">
        <div
          className="art-stage"
          role={unpanelled ? undefined : 'tabpanel'}
          id={unpanelled ? undefined : 'art-mode-' + id + '-' + mode + '-panel'}
          aria-labelledby={unpanelled ? undefined : 'art-mode-' + id + '-' + mode}
        >
          {(type === 'page' || type === 'sheet') && selection !== null && !historyOpen ? <SelectionBar quote={selection.text} askLabel={t('agent.ask')} dismissLabel={t('tab.dismiss')} onAsk={() => void askAgent(selection)} onDismiss={() => setSelection(null)} /> : null}
          {type === 'design' && mode !== 'source' && !readOnly && canvasSelection[0] !== undefined ? (
            <LayerBar
              t={t}
              layer={canvasSelection[0]}
              askLabel={t('agent.ask')}
              dismissLabel={t('tab.dismiss')}
              onAsk={() => {
                const quote = canvasHandle?.quoteSelection();
                if (quote !== null && quote !== undefined) void askAgent(buildDesignQuote(t, quote), 'agent.addedTruncatedDesign');
              }}
              onDismiss={() => canvasHandle?.clearSelection()}
            />
          ) : null}
          {type === 'sheet' ? (
            <SheetView content={text} revision={(viewing?.version ?? 0) + ':' + state.revision} editable={!readOnly && !conflict} label={payload.manifest.title} loadingLabel={t('empty.loading')} failedLabel={t('error.generic')} design={selectedPayload.design} dark={dark} t={t} onChange={value => model.edit(value)} onSave={() => void model.save()} onSelectionText={reportSelection} />
          ) : type === 'doc' ? (
            <DocView markdown={text} revision={(viewing?.version ?? 0) + ':' + state.revision} editable={!readOnly && !conflict} label={payload.manifest.title} loadingLabel={t('empty.loading')} failedLabel={t('error.generic')} design={selectedPayload.design} dark={dark} t={t} onChange={value => model.edit(value)} onSave={() => void model.save()} onSelectionText={reportSelection} selectionAction={selection === null ? null : <Button size="sm" variant="primary" icon={<IconSparkleRegular size={14} />} onMouseDown={event => event.preventDefault()} onClick={() => void askAgent(selection)}>{t('agent.ask')}</Button>} />
          ) : mode !== 'source' ? (
            type === 'design'
              ? readOnly
                ? <DesignView t={t} where={where} id={id} version={version} title={payload.manifest.title} />
                : <DesignCanvasView
                    t={t}
                    source={text}
                    revision={'0:' + state.revision}
                    title={payload.manifest.title}
                    mode={mode === 'edit' ? 'edit' : 'view'}
                    onChange={value => model.edit(value)}
                    onSave={() => void model.save()}
                    onFailure={onCanvasFailure}
                    onHandle={onCanvasHandle}
                    onSelection={onCanvasSelection}
                    attempt={canvasAttempt}
                    fallback={<DesignView t={t} where={where} id={id} version={version} title={payload.manifest.title} />}
                  />
              : <PageFrame content={text} designCss={selectedPayload.designCss} title={payload.manifest.title} frameTitle={t('tab.frameTitle', { title: payload.manifest.title })} dark={dark} onSelectionText={reportSelection} />
          ) : showEditor ? (
            <SourceEditor value={text} readOnly={false} label={t('tab.source')} hint={type === 'design' ? t('tab.manualSaveDesign') : t('tab.manualSave')} onChange={value => model.edit(value)} onSave={() => void model.save()} onSelectionText={reportSelection} />
          ) : (
            <div className="art-code" ref={codeRef}>
              <div className="art-code-bar">
                <span>{readOnly ? t('tab.readOnly') : t('tab.codeHint')}</span>
                {readOnly ? null : <Button size="sm" variant="outline" icon={<IconEditOutlineRegular size={14} />} onClick={() => setEditing(true)}>{t('tab.editSource')}</Button>}
              </div>
              <CodeBlock code={text} lang={type === 'design' ? 'jsx' : 'html'} lineNumbers showHeader={false} wrap className="art-code-block" copyLabel={t('code.copy')} copiedLabel={t('action.copied')} />
            </div>
          )}
        </div>
        {!historyOpen && !inspectorOpen ? null : (
          <DrawerShell
            label={historyOpen ? t('history.title') : t('canvas.inspector')}
            closeLabel={historyOpen ? t('history.close') : t('canvas.closeInspector')}
            overlay={overlay}
            onClose={historyOpen ? closeHistory : closeInspector}
            head={!historyOpen ? (
              <SegmentedControl<InspectorTab>
                id={'art-inspector-' + id}
                className="art-inspector-tabs"
                options={[
                  { value: 'layers', label: t('panel.layers') },
                  { value: 'properties', label: t('panel.properties') },
                ]}
                value={inspectorTab}
                onChange={setInspectorTab}
                label={t('canvas.inspectorTabs')}
              />
            ) : undefined}
          >
            {historyOpen ? <HistoryPanel t={t} versions={versions} failed={historyFailed} current={payload.version} selected={viewing?.version ?? payload.version} onSelect={version => void selectVersion(version)} /> : (
              <div className="art-inspector" role="tabpanel" id={'art-inspector-' + id + '-' + inspectorTab + '-panel'} aria-labelledby={'art-inspector-' + id + '-' + inspectorTab}>
                <DesignInspector t={t} handle={canvasHandle} snapshot={canvasSnapshot} tab={inspectorTab} />
              </div>
            )}
          </DrawerShell>
        )}
      </div>
      <Modal
        open={leave !== null}
        onClose={() => setLeave(null)}
        title={t('tab.leaveTitle')}
        closeLabel={t('dialog.close')}
        description={t(conflict ? 'tab.conflictHint' : 'tab.leaveHint')}
        footer={<>
          <Button variant="outline" disabled={busy} onClick={() => setLeave(null)}>{t('create.cancel')}</Button>
          <Button variant="outline" disabled={saving || busy} onClick={() => { const run = leave?.run; setLeave(null); if (run !== undefined) void model.discardAndReload().then(run); }}>{t('tab.leaveDiscard')}</Button>
          <Button variant="primary" disabled={conflict || busy} onClick={async () => { setBusy(true); const ok = await model.save(); setBusy(false); const run = leave?.run; if (ok && run !== undefined) { setLeave(null); await run(); } }}>{t('tab.leaveSave')}</Button>
        </>}
      >
        {failure === undefined ? null : <p className="art-modal-error" role="alert">{failureMessage ?? t(errorKey(failure))}</p>}
      </Modal>
      <Modal
        open={deleting}
        onClose={() => setDeleting(false)}
        title={t('tab.deleteTitle')}
        closeLabel={t('dialog.close')}
        description={t('tab.deleteConfirm', { title: payload.manifest.title })}
        footer={<>
          <Button variant="outline" onClick={() => setDeleting(false)}>{t('create.cancel')}</Button>
          <Button variant="primary" onClick={() => {
            setDeleting(false);
            guarded(async () => {
              try { await api.remove(where, id); announceListChange(); onBack?.(); }
              catch (error) { notify(t(errorKey(codeOf(error)))); }
            });
          }}>{t('tab.delete')}</Button>
        </>}
      />
      <Modal
        open={fallback !== null}
        onClose={() => setFallback(null)}
        title={t('agent.copyTitle')}
        closeLabel={t('dialog.close')}
        description={t('action.copyFailed')}
        footer={<Button variant="primary" onClick={() => setFallback(null)}>{t('dialog.done')}</Button>}
      >
        <textarea className="art-fallback" readOnly value={fallback ?? ''} aria-label={t('agent.copyTitle')} onFocus={event => event.currentTarget.select()} />
      </Modal>
    </section>
  );
}
