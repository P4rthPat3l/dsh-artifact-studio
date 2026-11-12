import { useCallback, useEffect, useId, useState } from 'react';
import type { ReactNode } from 'react';
import { formatArtifactAddress } from '../contract.js';
import type { ArtifactType, ListResult, Manifest, Scope } from '../contract.js';
import { api, codeOf, errorKey } from './api.js';
import type { Where } from './api.js';
import { useWorkspaceBinding } from './binding.js';
import { DesignEditor } from './design-editor.jsx';
import type { TabProps, Translator } from './harness.js';
import { IconBack, IconDoc, IconPage, IconPalette, IconPlus, IconRefresh } from './icons.jsx';
import { relativeTime } from './locale.js';
import { Menu } from './menu.jsx';
import { announceListChange, notify, rememberTitle, useListChanges } from './store.js';
import { starterContent } from './templates.js';

type SectionState = { status: 'loading' } | { status: 'ready'; page: ListResult } | { status: 'failed'; code?: string };

type Filter = 'all' | Scope;

/**
 * Open an artifact as a right-side tab.
 * @param open the tab's open action.
 * @param manifest the artifact.
 * @param workspaceId the workspace a workspace artifact belongs to.
 */
function openArtifact(
  open: ((address: string) => void) | undefined,
  manifest: Manifest,
  workspaceId: string | null,
): void {
  if (open === undefined) return;
  rememberTitle(manifest.id, manifest.title);
  if (manifest.scope === 'workspace') {
    if (workspaceId === null) return;
    open(formatArtifactAddress({ scope: 'workspace', workspaceId, id: manifest.id }));
  } else {
    open(formatArtifactAddress({ scope: 'library', id: manifest.id }));
  }
}

/**
 * One section of the gallery for a scope.
 * @param props the section's data and callbacks.
 * @returns the section.
 */
function Section({
  t,
  scope,
  state,
  query,
  onOpen,
  onMore,
  onCreate,
  onRetry,
}: {
  t: Translator;
  scope: Scope;
  state: SectionState;
  query: string;
  onOpen: (manifest: Manifest) => void;
  onMore: () => void;
  onCreate: (type: ArtifactType, scope: Scope) => void;
  onRetry: () => void;
}) {
  const headingId = useId();
  return (
    <section className="art-section" aria-labelledby={headingId}>
      <div className="art-section-head">
        <h2 className="art-section-title" id={headingId}>
          {t(`scope.${scope}`)}
        </h2>
        <span className="art-section-hint">
          {state.status === 'ready' && state.page.total > 0 ? t('gallery.count', { count: state.page.total }) : t(`scope.${scope}Hint`)}
        </span>
      </div>
      {state.status === 'loading' ? <p className="art-note">{t('empty.loading')}</p> : null}
      {state.status === 'failed' ? (
        <div className="art-empty" role="alert">
          <p className="art-empty-title">{t(errorKey(state.code))}</p><button type="button" className="art-button" onClick={onRetry}>{t('action.retry')}</button>
        </div>
      ) : null}
      {state.status === 'ready' && state.page.items.length === 0 ? (
        query !== '' ? (
          <p className="art-note">{t('empty.noMatch')}</p>
        ) : (
          <div className="art-empty">
            <p className="art-empty-title">{t(scope === 'workspace' ? 'empty.workspaceTitle' : 'empty.libraryTitle')}</p>
            <p className="art-empty-hint">{t(scope === 'workspace' ? 'empty.workspaceHint' : 'empty.libraryHint')}</p>
            <div className="art-empty-actions">
              <button type="button" className="art-button" onClick={() => onCreate('page', scope)}>
                <IconPage size={14} />
                {t('gallery.newPage')}
              </button>
              <button type="button" className="art-button" onClick={() => onCreate('doc', scope)}>
                <IconDoc size={14} />
                {t('gallery.newDoc')}
              </button>
            </div>
          </div>
        )
      ) : null}
      {state.status === 'ready' && state.page.items.length > 0 ? (
        <ul className="art-list">
          {state.page.items.map((item) => (
            <li key={item.id}>
              <button type="button" className="art-row" onClick={() => onOpen(item)}>
                <span className="art-row-icon" data-type={item.type}>
                  {item.type === 'page' ? <IconPage /> : <IconDoc />}
                </span>
                <span className="art-row-text">
                  <span className="art-row-title">{item.title}</span>
                  <span className="art-row-sub">
                    {t(`type.${item.type}`)} · {t('gallery.updated', { time: relativeTime(t, item.updatedAt) })}
                  </span>
                </span>
                <span className="art-row-version">{t('gallery.version', { version: item.version })}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {state.status === 'ready' && state.page.hasMore ? (
        <button type="button" className="art-button" style={{ margin: '6px 8px' }} onClick={onMore}>
          {t('gallery.more')}
        </button>
      ) : null}
      {state.status === 'ready' && state.page.truncated ? <p className="art-note">{t('gallery.truncated')}</p> : null}
    </section>
  );
}

/**
 * Load one scope's list with search and paging.
 * @param where the scope target, or null when it cannot be listed.
 * @param query the search text.
 * @param changes a counter that forces a reload.
 * @returns the state and a show-more action.
 */
function useSection(where: Where | null, query: string, type: ArtifactType | undefined, changes: number): { state: SectionState; more: () => void } {
  const [result, setResult] = useState<{ key: string; state: SectionState }>({ key: '', state: { status: 'loading' } });
  const [shown, setShown] = useState(1);
  const key = `${where === null ? 'none' : `${where.scope}:${where.workspaceId ?? ''}`}:${query}:${type ?? ''}`;
  const state: SectionState = result.key === key ? result.state : { status: 'loading' };

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
    // `where` is captured by `key`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, query, changes, shown]);

  return { state, more: () => setShown((value) => value + 1) };
}

/** Props for the gallery body shared by the tab and the full page. */
export interface GalleryBodyProps {
  t: Translator;
  workspaceId: string | null;
  open?: (address: string) => void;
  toolbar?: ReactNode;
}

/**
 * The Artifacts gallery: the chosen workspace and the profile library, each
 * searchable, with create actions and the design system editor.
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
  const workspace = useSection(workspaceId === null ? null : { scope: 'workspace', workspaceId }, query, type, changes);
  const library = useSection({ scope: 'library', workspaceId }, query, type, changes);

  const onOpen = useCallback((manifest: Manifest) => openArtifact(open, manifest, workspaceId), [open, workspaceId]);

  const onCreate = useCallback(
    async (type: ArtifactType, scope: Scope) => {
      if (scope === 'workspace' && workspaceId === null) return;
      const title = t(type === 'page' ? 'create.untitledPage' : 'create.untitledDoc');
      try {
        const { manifest } = await api.create({ scope, workspaceId }, type, title, starterContent(type, title));
        announceListChange();
        onOpen(manifest);
      } catch (error) {
        notify(t(errorKey(codeOf(error))));
      }
    },
    [workspaceId, t, onOpen],
  );

  const createScope: Scope = filter === 'library' || workspaceId === null ? 'library' : 'workspace';

  return (
    <section className="art-root" data-dsh-artifacts="">
      <header className="art-header art-relative">
        <div className="art-heading">
          {view === 'design' ? (
            <button type="button" className="art-icon-button" aria-label={t('panel')} title={t('panel')} onClick={() => setView('list')}>
              <IconBack />
            </button>
          ) : null}
          <span className="art-title">{view === 'design' ? t('design.title') : t('panel')}</span>
        </div>
        {view === 'list' ? toolbar : null}
        {view === 'list' ? (
          <div className="art-actions">
            <button
              type="button"
              className="art-icon-button"
              aria-label={t('gallery.design')}
              title={t('gallery.design')}
              onClick={() => setView('design')}
            >
              <IconPalette />
            </button>
            <button
              type="button"
              className="art-icon-button"
              aria-label={t('gallery.refresh')}
              title={t('gallery.refresh')}
              onClick={() => setLocalChanges((value) => value + 1)}
            >
              <IconRefresh />
            </button>
            <button
              type="button"
              className="art-icon-button"
              aria-label={t('gallery.new')}
              title={t('gallery.new')}
              aria-haspopup="menu"
              aria-expanded={menu}
              onClick={() => setMenu((value) => !value)}
            >
              <IconPlus />
            </button>
          </div>
        ) : null}
        {menu ? (
          <Menu
            label={t('gallery.new')}
            onClose={() => setMenu(false)}
            items={[
              { id: 'page', label: `${t('gallery.newPage')} · ${t(`scope.${createScope}`)}`, icon: <IconPage size={14} />, run: () => void onCreate('page', createScope) },
              { id: 'doc', label: `${t('gallery.newDoc')} · ${t(`scope.${createScope}`)}`, icon: <IconDoc size={14} />, run: () => void onCreate('doc', createScope) },
            ]}
          />
        ) : null}
      </header>
      {view === 'design' ? (
        <div className="art-scroll">
          <DesignEditor t={t} workspaceId={workspaceId} />
        </div>
      ) : (
        <>
          <div className="art-toolbar">
            <input
              className="art-search"
              type="search"
              aria-label={t('gallery.searchLabel')}
              placeholder={t('gallery.search')}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <select className="art-type-select" aria-label={t('filter.type')} value={type ?? ''} onChange={event => setType(event.target.value === 'page' ? 'page' : event.target.value === 'doc' ? 'doc' : undefined)}>
              <option value="">{t('type.all')}</option><option value="page">{t('type.page')}</option><option value="doc">{t('type.doc')}</option>
            </select>
            <div className="art-segment" role="group" aria-label={t('filter.scope')}>
              {(['all', 'workspace', 'library'] as const).map((value) => (
                <button key={value} type="button" aria-pressed={filter === value} onClick={() => setFilter(value)}>
                  {value === 'all' ? t('filter.all') : t(`scope.${value}`)}
                </button>
              ))}
            </div>
          </div>
          <div className="art-scroll">
            {filter !== 'library' ? (
              workspaceId === null ? (
                <p className="art-note" style={{ padding: '12px 14px' }}>
                  {t('empty.noWorkspace')}
                </p>
              ) : (
                <Section
                  t={t}
                  scope="workspace"
                  state={workspace.state}
                  query={query}
                  onOpen={onOpen}
                  onMore={workspace.more}
                  onRetry={() => setLocalChanges(value => value + 1)}
                  onCreate={(type, scope) => void onCreate(type, scope)}
                />
              )
            ) : null}
            {filter !== 'workspace' ? (
              <Section
                t={t}
                scope="library"
                state={library.state}
                query={query}
                onOpen={onOpen}
                onMore={library.more}
                onRetry={() => setLocalChanges(value => value + 1)}
                onCreate={(type, scope) => void onCreate(type, scope)}
              />
            ) : null}
          </div>
        </>
      )}
    </section>
  );
}

/**
 * The Artifacts page in the right sidebar: the session's workspace plus the library.
 * @param props slot props.
 * @returns the page.
 */
export function Gallery(props: TabProps) {
  const { t, useTabInfo } = props;
  const info = useTabInfo();
  const binding = useWorkspaceBinding(props);
  return <GalleryBody t={t} workspaceId={binding.workspaceId} open={info.tab.actions?.openResource} />;
}
