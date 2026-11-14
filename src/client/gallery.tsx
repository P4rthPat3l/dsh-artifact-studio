import { useCallback, useEffect, useId, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import {
  Button,
  IconChevronLeftOutlineRegular,
  IconCopyOutlineRegular,
  IconPinFillRegular,
  IconPinOutlineRegular,
  IconPlusOutlineRegular,
  IconRefreshOutlineRegular,
  IconSlidersTwoOutlineRegular,
  Menu,
  SegmentedControl,
  Tooltip,
} from '@deepseek-ai/dsh-client-ui-primitives';
import { formatArtifactAddress } from '../contract.js';
import type { ArtifactAddress, ArtifactType, ListResult, Manifest, Scope } from '../contract.js';
import { api, codeOf, errorKey } from './api.js';
import type { Where } from './api.js';
import { DesignEditor } from './design-editor.jsx';
import { pageDocument } from './frames.js';
import type { Translator } from './harness.js';
import { IconDoc, IconPage } from './icons.jsx';
import { relativeTime } from './locale.js';
import { useHarnessDark } from './theme.js';
import { togglePin, usePins } from './preferences.js';
import { announceListChange, notify, rememberTitle, useListChanges } from './store.js';
import { STARTERS } from './composer.jsx';
import { starterContent } from './templates.js';

type SectionState = { status: 'loading' } | { status: 'ready'; page: ListResult } | { status: 'failed'; code?: string };

type Filter = 'all' | Scope;

/** One artifact with the address and request target it needs from any gallery card. */
interface ArtifactView {
  manifest: Manifest;
  address: ArtifactAddress;
  where: Where;
}

const EMPTY_LIST: ListResult = { items: [], total: 0, hasMore: false, truncated: false };

/**
 * Build the view of one manifest, or nothing when a workspace is unknown.
 * @param manifest the listed manifest.
 * @param workspaceId the selected workspace.
 * @returns the view.
 */
function viewOf(manifest: Manifest, workspaceId: string | null): ArtifactView | null {
  if (manifest.scope === 'library') {
    return { manifest, address: { scope: 'library', id: manifest.id }, where: { scope: 'library', workspaceId } };
  }
  if (workspaceId === null) return null;
  return {
    manifest,
    address: { scope: 'workspace', workspaceId, id: manifest.id },
    where: { scope: 'workspace', workspaceId },
  };
}

/**
 * Open an artifact as a right-side tab.
 * @param open the tab's open action.
 * @param view the artifact.
 */
function openArtifact(open: ((address: string) => void) | undefined, view: ArtifactView): void {
  if (open === undefined) return;
  rememberTitle(view.manifest.id, view.manifest.title);
  open(formatArtifactAddress(view.address));
}

interface CoverData {
  version: number;
  content: string;
  designCss: string;
}

const coverCache = new Map<string, CoverData>();
const coverPending = new Map<string, Promise<CoverData>>();

/**
 * Read one artifact payload for its cover, sharing the request between cards.
 * @param view the artifact.
 * @returns the content and tokens.
 */
function loadCover(view: ArtifactView): Promise<CoverData> {
  const key = formatArtifactAddress(view.address);
  const cached = coverCache.get(key);
  if (cached !== undefined && cached.version >= view.manifest.version) return Promise.resolve(cached);
  const pendingKey = `${key}:${view.manifest.version}`;
  const pending = coverPending.get(pendingKey);
  if (pending !== undefined) return pending;
  const request = api
    .get(view.where, view.manifest.id)
    .then((payload) => {
      const data: CoverData = { version: payload.version, content: payload.content, designCss: payload.designCss };
      const previous = coverCache.get(key);
      if (previous === undefined || previous.version <= data.version) {
        if (coverCache.size >= 60) coverCache.clear();
        coverCache.set(key, data);
      }
      return data;
    })
    .finally(() => {
      coverPending.delete(pendingKey);
    });
  coverPending.set(pendingKey, request);
  return request;
}

/**
 * Remove executable code from a page cover. A thumbnail is a static preview,
 * so scripts would only add cost and console noise.
 * @param html the page source.
 * @returns the source without script elements.
 */
function coverHtml(html: string): string {
  if (typeof DOMParser === 'undefined') {
    return html
      .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, '')
      .replace(/<script\b[^>]*\/?>/gi, '')
      .replace(/\son[a-z]+\s*=\s*"[^"]*"/gi, '');
  }
  const parsed = new DOMParser().parseFromString(html, 'text/html');
  for (const node of parsed.querySelectorAll('script, iframe, object, embed, base')) node.remove();
  for (const element of parsed.querySelectorAll('*')) {
    for (const attribute of [...element.attributes]) {
      const name = attribute.name.toLowerCase();
      if (name.startsWith('on') || name === 'srcdoc') element.removeAttribute(attribute.name);
    }
  }
  return parsed.documentElement.outerHTML;
}

/**
 * Take the first readable words from Markdown for a document cover.
 * @param markdown the document source.
 * @returns the excerpt.
 */
function excerpt(markdown: string): string {
  const plain = markdown
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[#>*_`~]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return plain.length > 220 ? `${plain.slice(0, 220).trimEnd()}...` : plain;
}

/**
 * A lazy preview of one artifact. Pages render in the same opaque sandbox as
 * the editor, without scripts, and only mount near the viewport. Documents
 * show their opening text instead of a frame.
 * @param props the artifact and translator.
 * @returns the cover.
 */
function ArtifactCover({ t, view }: { t: Translator; view: ArtifactView }) {
  const [data, setData] = useState<CoverData | null>(null);
  const [failed, setFailed] = useState(false);
  const [visible, setVisible] = useState(typeof IntersectionObserver === 'undefined');
  const [url, setUrl] = useState<string | null>(null);
  const ref = useRef<HTMLSpanElement | null>(null);
  const dark = useHarnessDark();
  const key = formatArtifactAddress(view.address);
  const title = view.manifest.title;
  const type = view.manifest.type;
  const version = view.manifest.version;

  useEffect(() => {
    if (visible) return undefined;
    const node = ref.current;
    if (node === null) return undefined;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        setVisible(true);
        observer.disconnect();
      }
    }, { rootMargin: '140px' });
    observer.observe(node);
    return () => observer.disconnect();
  }, [visible]);

  useEffect(() => {
    if (!visible) return undefined;
    let cancelled = false;
    loadCover(view)
      .then((value) => {
        if (!cancelled && value.version === version) {
          setData(value);
          setFailed(false);
        }
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
    // The address and version fully describe the payload this card needs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, key, version]);

  useEffect(() => {
    if (type !== 'page' || data === null) {
      setUrl(null);
      return undefined;
    }
    const next = URL.createObjectURL(new Blob([pageDocument(coverHtml(data.content), data.designCss, title, dark ? 'dark' : 'light')], { type: 'text/html' }));
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [data, type, title, dark]);

  const icon = type === 'page' ? <IconPage /> : <IconDoc />;
  if (failed) return <span className="art-cover" ref={ref} aria-hidden="true"><span className="art-cover-fallback">{icon}</span></span>;
  if (type === 'page') {
    return (
      <span className="art-cover" ref={ref} aria-hidden="true">
        {url === null ? <span className="art-cover-fallback">{icon}</span> : <span className="art-cover-frame-wrap"><iframe className="art-cover-frame" src={url} sandbox="" title={t('gallery.coverTitle', { title })} tabIndex={-1} loading="lazy" referrerPolicy="no-referrer" /></span>}
      </span>
    );
  }
  const text = data === null ? '' : excerpt(data.content);
  return (
    <span className="art-cover" ref={ref} aria-hidden="true">
      {text === '' ? <span className="art-cover-fallback">{icon}</span> : <span className="art-cover-doc"><span className="art-cover-doc-title">{title}</span><span className="art-cover-doc-text">{text}</span></span>}
    </span>
  );
}

/**
 * One gallery card: a preview, identity, and a pin action.
 * @param props the artifact, pin state, and open action.
 * @returns the card.
 */
function ArtifactTile({ t, view, pinned, onOpen }: {
  t: Translator;
  view: ArtifactView;
  pinned: boolean;
  onOpen: (view: ArtifactView) => void;
}) {
  const address = formatArtifactAddress(view.address);
  const pinLabel = t(pinned ? 'gallery.unpin' : 'gallery.pin', { title: view.manifest.title });
  return (
    <li className="art-tile">
      <button type="button" className="art-tile-open" onClick={() => onOpen(view)}>
        <ArtifactCover t={t} view={view} />
        <span className="art-tile-body">
          <span className="art-tile-title" title={view.manifest.title}>{view.manifest.title}</span>
          <span className="art-tile-sub">
            {t(`type.${view.manifest.type}`)} · {t('gallery.updated', { time: relativeTime(t, view.manifest.updatedAt) })} · {t('gallery.version', { version: view.manifest.version })}
            {view.manifest.scope === 'library' ? ' · ' + t('scope.library') : ''}
          </span>
        </span>
      </button>
      <Tooltip label={pinLabel} side="left" portal>
        <button type="button" className="art-tile-pin" aria-label={pinLabel} aria-pressed={pinned} onClick={() => togglePin(address)}>
          {pinned ? <IconPinFillRegular size={14} /> : <IconPinOutlineRegular size={14} />}
        </button>
      </Tooltip>
    </li>
  );
}

/**
 * One headed grid of cards.
 * @param props the heading and artifacts.
 * @returns the section.
 */
function TileSection({ t, heading, views, pinned, onOpen }: {
  t: Translator;
  heading: string;
  views: ArtifactView[];
  pinned: ReadonlySet<string>;
  onOpen: (view: ArtifactView) => void;
}) {
  const headingId = useId();
  if (views.length === 0) return null;
  return (
    <section className="art-section" aria-labelledby={headingId}>
      <div className="art-section-head">
        <h2 className="art-section-title" id={headingId}>{heading}</h2>
        <span className="art-section-hint">{t('gallery.count', { count: views.length })}</span>
      </div>
      <ul className="art-grid">
        {views.map((view) => (
          <ArtifactTile key={formatArtifactAddress(view.address)} t={t} view={view} pinned={pinned.has(formatArtifactAddress(view.address))} onOpen={onOpen} />
        ))}
      </ul>
    </section>
  );
}

/**
 * Load one scope's list with search and paging.
 * @param where the scope target, or null when it cannot be listed.
 * @param query the search text.
 * @param type the type filter.
 * @param changes a counter that forces a reload.
 * @returns the state and a show-more action.
 */
function useSection(where: Where | null, query: string, type: ArtifactType | undefined, changes: number): { state: SectionState; more: () => void } {
  const [result, setResult] = useState<{ key: string; state: SectionState }>({ key: '', state: { status: 'loading' } });
  const [shown, setShown] = useState(1);
  const key = (where === null ? 'none' : where.scope + ':' + (where.workspaceId ?? '')) + ':' + query + ':' + (type ?? '');
  const state: SectionState = where === null
    ? { status: 'ready', page: EMPTY_LIST }
    : result.key === key ? result.state : { status: 'loading' };

  useEffect(() => setShown(1), [key, query]);

  useEffect(() => {
    if (where === null) return undefined;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const pages: ListResult[] = [];
        for (let index = 0; index < shown; index += 1) {
          pages.push(await api.list(where, { query, type, offset: index * 50 }, controller.signal));
          if (!pages[pages.length - 1]?.hasMore) break;
        }
        const last = pages[pages.length - 1];
        if (last === undefined || controller.signal.aborted) return;
        setResult({ key, state: { status: 'ready', page: { ...last, items: pages.flatMap((page) => page.items) } } });
      } catch (error) {
        if (!controller.signal.aborted) setResult({ key, state: { status: 'failed', code: codeOf(error) } });
      }
    }, query === '' ? 0 : 180);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
    // where is captured by key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, query, changes, shown]);

  return { state, more: () => setShown((value) => value + 1) };
}

/**
 * The first-run state: what to ask the agent for, with a copy action because
 * this page has no conversation of its own.
 * @param props the translator and the scope that is empty.
 * @returns the empty state.
 */
function Starters({ t, scope }: { t: Translator; scope: Scope }) {
  const copy = async (text: string) => {
    try { await navigator.clipboard.writeText(text); notify(t('gallery.promptCopied')); }
    catch { notify(t('action.copyFailed')); }
  };
  return (
    <div className="art-empty">
      <p className="art-empty-title">{t(scope === 'library' ? 'empty.libraryTitle' : 'empty.workspaceTitle')}</p>
      <p className="art-empty-hint">{t(scope === 'library' ? 'empty.libraryHint' : 'empty.workspaceHint')}</p>
      <ul className="art-starters">
        {STARTERS.map((starter) => (
          <li key={starter} className="art-starter">
            <span className="art-starter-text">
              <span className="art-starter-name">{t(`prompt.${starter}`)}</span>
              <span className="art-starter-hint">{t(`prompt.${starter}Text`)}</span>
            </span>
            <Tooltip label={t('gallery.copyPrompt')} side="left" portal>
              <Button size="sm" className="art-icon-button" aria-label={t('gallery.copyPromptNamed', { name: t(`prompt.${starter}`) })} onClick={() => void copy(t(`prompt.${starter}Text`))}>
                <IconCopyOutlineRegular size={14} />
              </Button>
            </Tooltip>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Props for the gallery body on the full Artifacts page. */
export interface GalleryBodyProps {
  t: Translator;
  workspaceId: string | null;
  open?: (address: string) => void;
  toolbar?: ReactNode;
}

/**
 * The Artifacts gallery: one recent grid with pins, the chosen workspace and
 * the profile library, filters, and blank page and document creation.
 * @param props the workspace, the open action, and an optional header control.
 * @returns the page body.
 */
export function GalleryBody({ t, workspaceId, open, toolbar }: GalleryBodyProps) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [type, setType] = useState<ArtifactType | undefined>(undefined);
  const [view, setView] = useState<'list' | 'design'>('list');
  const [menu, setMenu] = useState(false);
  const [localChanges, setLocalChanges] = useState(0);
  const changes = useListChanges() + localChanges;
  const pins = usePins();
  const workspace = useSection(workspaceId === null ? null : { scope: 'workspace', workspaceId }, query, type, changes);
  const library = useSection({ scope: 'library', workspaceId }, query, type, changes);
  const filterId = useId();
  const typeId = useId();

  const onOpen = useCallback((target: ArtifactView) => openArtifact(open, target), [open]);

  const onCreate = useCallback(
    async (nextType: ArtifactType, scope: Scope) => {
      if (scope === 'workspace' && workspaceId === null) return;
      const title = t(nextType === 'page' ? 'create.untitledPage' : 'create.untitledDoc');
      try {
        const { manifest } = await api.create({ scope, workspaceId }, nextType, title, starterContent(nextType, title));
        announceListChange();
        const next = viewOf(manifest, workspaceId);
        if (next !== null) onOpen(next);
      } catch (error) {
        notify(t(errorKey(codeOf(error))));
      }
    },
    [workspaceId, t, onOpen],
  );

  const createScope: Scope = filter === 'library' || workspaceId === null ? 'library' : 'workspace';
  const workspaceItems = filter !== 'library' && workspace.state.status === 'ready' ? workspace.state.page : null;
  const libraryItems = filter !== 'workspace' && library.state.status === 'ready' ? library.state.page : null;
  const loading = (filter !== 'library' && workspaceId !== null && workspace.state.status === 'loading')
    || (filter !== 'workspace' && library.state.status === 'loading');
  const failure = (filter !== 'library' && workspaceId !== null && workspace.state.status === 'failed')
    ? workspace.state.code
    : (filter !== 'workspace' && library.state.status === 'failed' ? library.state.code : undefined);
  const views: ArtifactView[] = [];
  for (const item of workspaceItems?.items ?? []) {
    const next = viewOf(item, workspaceId);
    if (next !== null) views.push(next);
  }
  for (const item of libraryItems?.items ?? []) {
    const next = viewOf(item, workspaceId);
    if (next !== null) views.push(next);
  }
  views.sort((left, right) => Date.parse(right.manifest.updatedAt) - Date.parse(left.manifest.updatedAt));
  const pinnedViews = views.filter((item) => pins.has(formatArtifactAddress(item.address)));
  const recentViews = views.filter((item) => !pins.has(formatArtifactAddress(item.address)));
  const hasMore = workspaceItems?.hasMore === true || libraryItems?.hasMore === true;
  const truncated = workspaceItems?.truncated === true || libraryItems?.truncated === true;
  const noWorkspace = workspaceId === null && filter === 'workspace';
  const emptyScope: Scope = filter === 'library' || workspaceId === null ? 'library' : 'workspace';

  const more = () => {
    if (filter !== 'library') workspace.more();
    if (filter !== 'workspace') library.more();
  };

  return (
    <section className="art-root" data-dsh-artifacts="">
      <header className="art-header">
        <div className="art-heading">
          {view === 'design' ? (
            <Tooltip label={t('panel')} side="bottom" portal>
              <Button size="sm" className="art-icon-button" aria-label={t('panel')} onClick={() => setView('list')}>
                <IconChevronLeftOutlineRegular size={16} />
              </Button>
            </Tooltip>
          ) : null}
          <span className="art-title">{view === 'design' ? t('design.title') : t('panel')}</span>
        </div>
        {view === 'list' ? toolbar : null}
        {view === 'list' ? (
          <div className="art-actions">
            <Tooltip label={t('gallery.design')} side="bottom" portal>
              <Button size="sm" className="art-icon-button" aria-label={t('gallery.design')} onClick={() => setView('design')}>
                <IconSlidersTwoOutlineRegular size={16} />
              </Button>
            </Tooltip>
            <Tooltip label={t('gallery.refresh')} side="bottom" portal>
              <Button size="sm" className="art-icon-button" aria-label={t('gallery.refresh')} onClick={() => setLocalChanges((value) => value + 1)}>
                <IconRefreshOutlineRegular size={16} />
              </Button>
            </Tooltip>
            <Menu
              open={menu}
              onClose={() => setMenu(false)}
              align="end"
              portal
              autoFocus
              items={[
                { id: 'page', label: t('gallery.newPage') + ' · ' + t(`scope.${createScope}`), icon: <IconPage size={14} /> },
                { id: 'doc', label: t('gallery.newDoc') + ' · ' + t(`scope.${createScope}`), icon: <IconDoc size={14} /> },
              ]}
              onSelect={(entry) => { setMenu(false); void onCreate(entry === 'doc' ? 'doc' : 'page', createScope); }}
              anchor={<Button size="sm" variant="outline" icon={<IconPlusOutlineRegular size={14} />} aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu((value) => !value)}>{t('gallery.create')}</Button>}
            />
          </div>
        ) : null}
      </header>
      {view === 'design' ? (
        <div className="art-scroll">
          <DesignEditor t={t} workspaceId={workspaceId} />
        </div>
      ) : (
        <div className="art-scroll">
          <div className="art-gallery">
            <div className="art-toolbar">
              <input
                className="art-search"
                type="search"
                aria-label={t('gallery.searchLabel')}
                placeholder={t('gallery.search')}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
              <SegmentedControl<'all' | ArtifactType>
                id={typeId}
                className="art-segment"
                label={t('filter.type')}
                value={type ?? 'all'}
                options={[{ value: 'all', label: t('type.all') }, { value: 'page', label: t('type.page') }, { value: 'doc', label: t('type.doc') }]}
                onChange={(next) => setType(next === 'all' ? undefined : next)}
              />
              <SegmentedControl<Filter>
                id={filterId}
                className="art-segment"
                label={t('filter.scope')}
                value={filter}
                options={[{ value: 'all', label: t('filter.all') }, { value: 'workspace', label: t('scope.workspace') }, { value: 'library', label: t('scope.library') }]}
                onChange={setFilter}
              />
            </div>
            <div role="tabpanel" id={typeId + '-' + (type ?? 'all') + '-panel'} aria-labelledby={typeId + '-' + (type ?? 'all')}>
            <div role="tabpanel" id={filterId + '-' + filter + '-panel'} aria-labelledby={filterId + '-' + filter}>
            {loading ? <p className="art-note">{t('empty.loading')}</p> : null}
            {!loading && failure !== undefined && views.length === 0 ? (
              <div className="art-empty" role="alert">
                <p className="art-empty-title">{t(errorKey(failure))}</p>
                <Button size="sm" variant="outline" onClick={() => setLocalChanges((value) => value + 1)}>{t('action.retry')}</Button>
              </div>
            ) : null}
            {!loading && failure !== undefined && views.length > 0 ? (
              <div className="art-bar" role="status">
                <span>{t(errorKey(failure))}</span>
                <Button size="sm" variant="outline" onClick={() => setLocalChanges((value) => value + 1)}>{t('action.retry')}</Button>
              </div>
            ) : null}
            {!loading && failure === undefined && views.length === 0 ? (
              query !== '' ? (
                <p className="art-note">{t('empty.noMatch')}</p>
              ) : type !== undefined ? (
                <p className="art-note">{t('empty.typeMatch', { type: t(`type.${type}`) })}</p>
              ) : noWorkspace ? (
                <p className="art-note">{t('empty.noWorkspace')}</p>
              ) : (
                <Starters t={t} scope={emptyScope} />
              )
            ) : null}
            {!loading && views.length > 0 ? (
              <>
                <TileSection t={t} heading={t('gallery.pinned')} views={pinnedViews} pinned={pins} onOpen={onOpen} />
                {recentViews.length === 0 ? <p className="art-note">{t('gallery.allPinned')}</p> : <TileSection t={t} heading={t('gallery.recent')} views={recentViews} pinned={pins} onOpen={onOpen} />}
                {hasMore ? <div className="art-gallery-more"><Button size="sm" variant="outline" onClick={more}>{t('gallery.more')}</Button></div> : null}
                {truncated ? <p className="art-note">{t('gallery.truncated')}</p> : null}
              </>
            ) : null}
            </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
