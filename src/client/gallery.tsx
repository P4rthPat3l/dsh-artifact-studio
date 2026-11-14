import { useCallback, useEffect, useId, useRef, useState } from 'react';
import {
  Button,
  IconChevronLeftOutlineRegular,
  IconCopyOutlineRegular,
  IconPinFillRegular,
  IconPinOutlineRegular,
  IconPlusOutlineRegular,
  IconRefreshOutlineRegular,
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
import { IconDesign, IconDoc, IconPage, IconPalette } from './icons.jsx';
import { relativeTime } from './locale.js';
import { useHarnessDark } from './theme.js';
import { togglePin, usePins } from './preferences.js';
import { announceListChange, notify, rememberTitle, useListChanges } from './store.js';
import { STARTERS } from './composer.jsx';
import { starterContent } from './templates.js';

/** Where the full page is looking: every project, one project, or the library. */
export type GalleryScope =
  | { kind: 'all' }
  | { kind: 'library' }
  | { kind: 'workspace'; workspaceId: string };

/** A registered project, as the scope control and the global list label it. */
export interface GalleryProject {
  workspaceId: string;
  title: string;
}

/** One artifact with the address and request target it needs from any gallery card. */
interface ArtifactView {
  manifest: Manifest;
  address: ArtifactAddress;
  where: Where;
  /** The owning project's title, for a card in the global list. */
  project: string | null;
}

/**
 * Encode a scope for the select control and local storage.
 * @param scope the scope.
 * @returns all, library, or ws:<id>.
 */
export function formatScope(scope: GalleryScope): string {
  return scope.kind === 'workspace' ? 'ws:' + scope.workspaceId : scope.kind;
}

/**
 * Read a scope from the select value or local storage.
 * @param value the encoded scope.
 * @returns the scope, or undefined when the value is not one.
 */
export function parseScopeValue(value: string | null | undefined): GalleryScope | undefined {
  if (value === 'all') return { kind: 'all' };
  if (value === 'library') return { kind: 'library' };
  if (value === null || value === undefined || !value.startsWith('ws:')) return undefined;
  const workspaceId = value.slice(3);
  return workspaceId === '' ? undefined : { kind: 'workspace', workspaceId };
}

/**
 * Build the view of one manifest, or nothing when a workspace is unknown.
 * @param manifest the listed manifest.
 * @param contextWorkspaceId the project that supplies design tokens to library renders.
 * @param project the owning project, or null for a library artifact.
 * @returns the view.
 */
function viewOf(manifest: Manifest, contextWorkspaceId: string | null, project: GalleryProject | null): ArtifactView | null {
  if (manifest.scope === 'library') {
    return {
      manifest,
      address: { scope: 'library', id: manifest.id },
      where: { scope: 'library', workspaceId: contextWorkspaceId },
      project: null,
    };
  }
  if (project === null) return null;
  return {
    manifest,
    address: { scope: 'workspace', workspaceId: project.workspaceId, id: manifest.id },
    where: { scope: 'workspace', workspaceId: project.workspaceId },
    project: project.title,
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

/**
 * The cache key of a cover. A library render uses the context project's
 * tokens, so the same library artifact can look different per project.
 * @param view the artifact.
 * @returns the cache key.
 */
function coverKey(view: ArtifactView): string {
  const address = formatArtifactAddress(view.address);
  return view.manifest.scope === 'library' ? address + '@' + (view.where.workspaceId ?? '') : address;
}

const coverCache = new Map<string, CoverData>();
const coverPending = new Map<string, Promise<CoverData>>();

/** The most mockup covers that may fetch at once, matching the host's render limit. */
const COVER_CONCURRENCY = 2;

/** Mockup cover data URLs, keyed by address and version, for this window. */
const designCoverCache = new Map<string, string>();
const designCoverQueue: Array<{ start(): void }> = [];
let designCoverActive = 0;

/** Start queued cover fetches until the limit is reached. */
function pumpDesignCovers(): void {
  while (designCoverActive < COVER_CONCURRENCY && designCoverQueue.length > 0) {
    const task = designCoverQueue.shift();
    if (task === undefined) return;
    designCoverActive += 1;
    task.start();
  }
}

/**
 * Ask for one mockup cover, running at most two requests at once.
 * @param start the request; it must settle the promise it returns.
 * @returns a cancel action that also drops a queued request.
 */
function queueDesignCover(start: () => Promise<void>): () => void {
  const task = {
    start: () => {
      void start().finally(() => {
        designCoverActive -= 1;
        pumpDesignCovers();
      });
    },
  };
  designCoverQueue.push(task);
  pumpDesignCovers();
  return () => {
    const index = designCoverQueue.indexOf(task);
    if (index !== -1) designCoverQueue.splice(index, 1);
  };
}

/**
 * Read one artifact payload for its cover, sharing the request between cards.
 * @param view the artifact.
 * @returns the content and tokens.
 */
function loadCover(view: ArtifactView): Promise<CoverData> {
  const key = coverKey(view);
  const cached = coverCache.get(key);
  if (cached !== undefined && cached.version >= view.manifest.version) return Promise.resolve(cached);
  const pendingKey = key + ':' + view.manifest.version;
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
    .replace(/\x60{3}[\s\S]*?\x60{3}/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[#>*_\x60~]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return plain.length > 220 ? plain.slice(0, 220).trimEnd() + '...' : plain;
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
  const [designUrl, setDesignUrl] = useState<string | null>(null);
  const ref = useRef<HTMLSpanElement | null>(null);
  const dark = useHarnessDark();
  const key = coverKey(view);
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

  // A mockup cover is the saved PNG from the host, fetched only once the tile is
  // near the viewport, at most two at a time, and kept for the window session.
  useEffect(() => {
    if (!visible || type !== 'design') return undefined;
    const cacheKey = key + '@' + version;
    const cached = designCoverCache.get(cacheKey);
    if (cached !== undefined) {
      setDesignUrl(cached);
      setFailed(false);
      return undefined;
    }
    const controller = new AbortController();
    let cancelled = false;
    const cancel = queueDesignCover(async () => {
      try {
        const preview = await api.preview(view.where, view.manifest.id, version, controller.signal);
        if (cancelled) return;
        const next = 'data:' + preview.mediaType + ';base64,' + preview.data;
        if (designCoverCache.size >= 40) designCoverCache.clear();
        designCoverCache.set(cacheKey, next);
        setDesignUrl(next);
        setFailed(false);
      } catch {
        if (!cancelled) setFailed(true);
      }
    });
    return () => {
      cancelled = true;
      controller.abort();
      cancel();
    };
    // The address and version fully describe the preview this card needs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, key, version, type]);

  useEffect(() => {
    // Pages and documents read their own content; only mockups ask for a PNG.
    if (!visible || type === 'design') return undefined;
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

  const icon = type === 'page' ? <IconPage /> : type === 'doc' ? <IconDoc /> : <IconDesign />;
  if (failed) return <span className="art-cover" ref={ref} aria-hidden="true"><span className="art-cover-fallback">{icon}</span></span>;
  if (type === 'design') {
    return (
      <span className="art-cover" ref={ref} aria-hidden="true">
        {designUrl === null ? <span className="art-cover-fallback">{icon}</span> : <img className="art-cover-design" src={designUrl} alt="" />}
      </span>
    );
  }
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
function ArtifactTile({ t, view, pinned, onOpen, showProject }: {
  t: Translator;
  view: ArtifactView;
  pinned: boolean;
  onOpen: (view: ArtifactView) => void;
  showProject: boolean;
}) {
  const address = formatArtifactAddress(view.address);
  const pinLabel = t(pinned ? 'gallery.unpin' : 'gallery.pin', { title: view.manifest.title });
  const badge = view.manifest.scope === 'library'
    ? ' · ' + t('scope.library')
    : showProject && view.project !== null ? ' · ' + view.project : '';
  return (
    <li className="art-tile">
      <button type="button" className="art-tile-open" onClick={() => onOpen(view)}>
        <ArtifactCover t={t} view={view} />
        <span className="art-tile-body">
          <span className="art-tile-title" title={view.manifest.title}>{view.manifest.title}</span>
          <span className="art-tile-sub">
            {t(`type.${view.manifest.type}`)} · {t('gallery.updated', { time: relativeTime(t, view.manifest.updatedAt) })} · {t('gallery.version', { version: view.manifest.version })}
            {badge}
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
function TileSection({ t, heading, views, pinned, onOpen, showProject }: {
  t: Translator;
  heading: string;
  views: ArtifactView[];
  pinned: ReadonlySet<string>;
  onOpen: (view: ArtifactView) => void;
  showProject: boolean;
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
          <ArtifactTile key={formatArtifactAddress(view.address)} t={t} view={view} pinned={pinned.has(formatArtifactAddress(view.address))} onOpen={onOpen} showProject={showProject} />
        ))}
      </ul>
    </section>
  );
}

/** One list target: a project or the library. */
interface ListSource {
  where: Where;
  project: GalleryProject | null;
}

/**
 * The sources the current scope reads.
 * @param scope the scope.
 * @param projects the registered projects.
 * @param contextWorkspaceId the project that supplies library design tokens.
 * @returns one source per store.
 */
function sourcesOf(scope: GalleryScope, projects: readonly GalleryProject[], contextWorkspaceId: string | null): ListSource[] {
  const library: ListSource = { where: { scope: 'library', workspaceId: contextWorkspaceId }, project: null };
  if (scope.kind === 'library') return [library];
  if (scope.kind === 'workspace') {
    const project = projects.find((item) => item.workspaceId === scope.workspaceId);
    return project === undefined ? [] : [{ where: { scope: 'workspace', workspaceId: project.workspaceId }, project }];
  }
  return [
    ...projects.map((project): ListSource => ({ where: { scope: 'workspace', workspaceId: project.workspaceId }, project })),
    library,
  ];
}

/** How many artifacts one project contributes to a global page. */
const GLOBAL_LIMIT = 12;

type ScopeState =
  | { status: 'loading' }
  | { status: 'ready'; items: ArtifactView[]; hasMore: boolean; truncated: boolean; failed: number }
  | { status: 'failed'; code?: string };

/**
 * Load the scope's list with search, type filtering, paging, and partial
 * failures. The global scope fans out to every project and the library.
 * @param scope the scope.
 * @param projects the registered projects.
 * @param contextWorkspaceId the project that supplies library design tokens.
 * @param query the search text.
 * @param type the type filter.
 * @param changes a counter that forces a reload.
 * @returns the state and a show-more action.
 */
function useScopeList(
  scope: GalleryScope,
  projects: readonly GalleryProject[],
  contextWorkspaceId: string | null,
  query: string,
  type: ArtifactType | undefined,
  changes: number,
): { state: ScopeState; more: () => void } {
  const [pages, setPages] = useState(1);
  const [result, setResult] = useState<{ key: string; state: ScopeState }>({ key: '', state: { status: 'loading' } });
  const projectKey = projects.map((project) => project.workspaceId + ':' + project.title).join(',');
  const key = formatScope(scope) + ':' + projectKey + ':' + (contextWorkspaceId ?? '') + ':' + query + ':' + (type ?? '');
  const global = scope.kind === 'all';
  const state: ScopeState = result.key === key ? result.state : { status: 'loading' };

  useEffect(() => setPages(1), [key, query]);

  useEffect(() => {
    const targets = sourcesOf(scope, projects, contextWorkspaceId);
    if (targets.length === 0) {
      setResult({ key, state: { status: 'ready', items: [], hasMore: false, truncated: false, failed: 0 } });
      return undefined;
    }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      const limit = global ? GLOBAL_LIMIT : undefined;
      // Keep the pages a source already returned when a later page fails, so
      // Show more cannot erase the first page of that source.
      const outcomes = await Promise.all(targets.map(async (target): Promise<{ loaded: ListResult[]; failed: boolean; code?: string }> => {
        const loaded: ListResult[] = [];
        for (let index = 0; index < pages; index += 1) {
          try {
            const page = await api.list(
              target.where,
              {
                query,
                type,
                offset: index * (limit ?? 50),
                ...(limit === undefined ? {} : { limit }),
              },
              controller.signal,
            );
            loaded.push(page);
            if (!page.hasMore) break;
          } catch (error) {
            return { loaded, failed: true, code: codeOf(error) };
          }
        }
        return { loaded, failed: false };
      }));
      if (controller.signal.aborted) return;
      const items: ArtifactView[] = [];
      let hasMore = false;
      let truncated = false;
      let failed = 0;
      let firstCode: string | undefined;
      outcomes.forEach((outcome, index) => {
        const target = targets[index];
        if (target === undefined) return;
        if (outcome.failed) {
          failed += 1;
          if (firstCode === undefined) firstCode = outcome.code;
        }
        const last = outcome.loaded[outcome.loaded.length - 1];
        if (last === undefined) return;
        if (last.hasMore) hasMore = true;
        if (last.truncated) truncated = true;
        for (const page of outcome.loaded) {
          for (const manifest of page.items) {
            const view = viewOf(manifest, contextWorkspaceId, target.project);
            if (view !== null) items.push(view);
          }
        }
      });
      if (failed === targets.length) {
        setResult({ key, state: { status: 'failed', code: firstCode } });
        return;
      }
      items.sort((left, right) => Date.parse(right.manifest.updatedAt) - Date.parse(left.manifest.updatedAt));
      setResult({ key, state: { status: 'ready', items, hasMore, truncated, failed } });
    }, query === '' ? 0 : 180);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
    // key captures scope, projects, context, query, and type.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, changes, pages]);

  return { state, more: () => setPages((value) => value + 1) };
}

/**
 * The first-run state: what to ask the agent for, with a copy action because
 * this page has no conversation of its own.
 * @param props the translator and the empty scope.
 * @returns the empty state.
 */
function Starters({ t, variant }: { t: Translator; variant: 'all' | Scope }) {
  const title = variant === 'all' ? 'empty.allTitle' : variant === 'library' ? 'empty.libraryTitle' : 'empty.workspaceTitle';
  const hint = variant === 'all' ? 'empty.allHint' : variant === 'library' ? 'empty.libraryHint' : 'empty.workspaceHint';
  const copy = async (text: string) => {
    try { await navigator.clipboard.writeText(text); notify(t('gallery.promptCopied')); }
    catch { notify(t('action.copyFailed')); }
  };
  return (
    <div className="art-empty">
      <p className="art-empty-title">{t(title)}</p>
      <p className="art-empty-hint">{t(hint)}</p>
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
  projects: readonly GalleryProject[];
  scope: GalleryScope;
  contextWorkspaceId: string | null;
  onScopeChange: (scope: GalleryScope) => void;
  open?: (address: string) => void;
}

/**
 * The Artifacts gallery: one recent grid with pins, one scope control, and
 * blank page and document creation.
 * @param props the projects, the scope, the open action, and the scope action.
 * @returns the page body.
 */
export function GalleryBody({ t, projects, scope, contextWorkspaceId, onScopeChange, open }: GalleryBodyProps) {
  const [query, setQuery] = useState('');
  const [type, setType] = useState<ArtifactType | undefined>(undefined);
  const [view, setView] = useState<'list' | 'design'>('list');
  const [menu, setMenu] = useState(false);
  const [localChanges, setLocalChanges] = useState(0);
  const changes = useListChanges() + localChanges;
  const pins = usePins();
  const list = useScopeList(scope, projects, contextWorkspaceId, query, type, changes);
  const typeId = useId();
  const targetProject = projects.find((project) => project.workspaceId === contextWorkspaceId) ?? null;
  const designWorkspaceId = scope.kind === 'library' ? null : contextWorkspaceId;
  const designProject = designWorkspaceId === null
    ? null
    : projects.find((project) => project.workspaceId === designWorkspaceId) ?? null;
  const createScope: Scope = scope.kind === 'library' || targetProject === null ? 'library' : 'workspace';
  const createTitle = createScope === 'library' ? t('scope.library') : targetProject?.title ?? t('scope.library');
  const state = list.state;
  const views = state.status === 'ready' ? state.items : [];

  const onOpen = useCallback((target: ArtifactView) => openArtifact(open, target), [open]);

  const onCreate = useCallback(
    async (nextType: ArtifactType, nextScope: Scope) => {
      if (nextScope === 'workspace' && contextWorkspaceId === null) return;
      const title = t(nextType === 'page' ? 'create.untitledPage' : nextType === 'doc' ? 'create.untitledDoc' : 'create.untitledDesign');
      try {
        const { manifest } = await api.create({ scope: nextScope, workspaceId: contextWorkspaceId }, nextType, title, starterContent(nextType, title));
        announceListChange();
        const project = nextScope === 'workspace'
          ? projects.find((item) => item.workspaceId === contextWorkspaceId) ?? null
          : null;
        const next = viewOf(manifest, contextWorkspaceId, project);
        if (next !== null) onOpen(next);
      } catch (error) {
        notify(t(errorKey(codeOf(error))));
      }
    },
    [contextWorkspaceId, projects, t, onOpen],
  );

  const pinnedViews = views.filter((item) => pins.has(formatArtifactAddress(item.address)));
  const recentViews = views.filter((item) => !pins.has(formatArtifactAddress(item.address)));

  return (
    <section className="art-root" data-dsh-artifact-studio="">
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
        {view === 'list' ? (
          <label className="art-workspace">
            <span className="art-workspace-label">{t('scope.label')}</span>
            <select
              className="art-workspace-select"
              aria-label={t('scope.label')}
              value={formatScope(scope)}
              onChange={(event) => {
                const next = parseScopeValue(event.target.value);
                if (next !== undefined) onScopeChange(next);
              }}
            >
              <option value="all">{t('scope.all')}</option>
              {projects.map((project) => (
                <option key={project.workspaceId} value={'ws:' + project.workspaceId}>{project.title}</option>
              ))}
              <option value="library">{t('scope.library')}</option>
            </select>
          </label>
        ) : null}
        {view === 'list' ? (
          <div className="art-actions">
            <Tooltip label={t('gallery.design')} side="bottom" portal>
              <Button size="sm" className="art-icon-button" aria-label={t('gallery.design')} onClick={() => setView('design')}>
                <IconPalette size={16} />
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
                { id: 'page', label: t('gallery.newPage') + ' · ' + createTitle, icon: <IconPage size={14} /> },
                { id: 'doc', label: t('gallery.newDoc') + ' · ' + createTitle, icon: <IconDoc size={14} /> },
                { id: 'design', label: t('gallery.newDesign') + ' · ' + createTitle, icon: <IconDesign size={14} /> },
              ]}
              onSelect={(entry) => { setMenu(false); void onCreate(entry === 'doc' ? 'doc' : entry === 'design' ? 'design' : 'page', createScope); }}
              anchor={<Button size="sm" variant="outline" icon={<IconPlusOutlineRegular size={14} />} aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu((value) => !value)}>{t('gallery.create')}</Button>}
            />
          </div>
        ) : null}
      </header>
      {view === 'design' ? (
        <div className="art-scroll">
          <DesignEditor t={t} workspaceId={designWorkspaceId} workspaceTitle={designProject?.title} />
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
                options={[{ value: 'all', label: t('type.all') }, { value: 'page', label: t('type.page') }, { value: 'doc', label: t('type.doc') }, { value: 'design', label: t('type.design') }]}
                onChange={(next) => setType(next === 'all' ? undefined : next)}
              />
            </div>
            <div role="tabpanel" id={typeId + '-' + (type ?? 'all') + '-panel'} aria-labelledby={typeId + '-' + (type ?? 'all')}>
              {state.status === 'loading' ? <p className="art-note">{t('empty.loading')}</p> : null}
              {state.status === 'failed' ? (
                <div className="art-empty" role="alert">
                  <p className="art-empty-title">{t(errorKey(state.code))}</p>
                  <Button size="sm" variant="outline" onClick={() => setLocalChanges((value) => value + 1)}>{t('action.retry')}</Button>
                </div>
              ) : null}
              {state.status === 'ready' && state.failed > 0 ? (
                <div className="art-bar" data-tone="warn" role="status">
                  <span>{t('gallery.failedProjects')}</span>
                  <Button size="sm" variant="outline" onClick={() => setLocalChanges((value) => value + 1)}>{t('action.retry')}</Button>
                </div>
              ) : null}
              {state.status === 'ready' && state.items.length === 0 && state.failed === 0 ? (
                query !== '' ? (
                  <p className="art-note">{t('empty.noMatch')}</p>
                ) : type !== undefined ? (
                  <p className="art-note">{t('empty.typeMatch', { type: t(`type.${type}`) })}</p>
                ) : (
                  <Starters t={t} variant={scope.kind} />
                )
              ) : null}
              {state.status === 'ready' && state.items.length > 0 ? (
                <>
                  <TileSection t={t} heading={t('gallery.pinned')} views={pinnedViews} pinned={pins} onOpen={onOpen} showProject={scope.kind === 'all'} />
                  {recentViews.length === 0 ? <p className="art-note">{t('gallery.allPinned')}</p> : <TileSection t={t} heading={t('gallery.recent')} views={recentViews} pinned={pins} onOpen={onOpen} showProject={scope.kind === 'all'} />}
                  {state.hasMore ? <div className="art-gallery-more"><Button size="sm" variant="outline" onClick={list.more}>{t('gallery.more')}</Button></div> : null}
                  {state.truncated ? <p className="art-note">{t('gallery.truncated')}</p> : null}
                </>
              ) : null}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
