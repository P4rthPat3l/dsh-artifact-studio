import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';
import { parseArtifactAddress } from '../contract.js';
import { ArtifactPanelBody } from './artifact-tab.jsx';
import { GalleryBody, formatScope, parseScopeValue } from './gallery.jsx';
import type { GalleryProject, GalleryScope } from './gallery.jsx';
import { useWorkspaceBinding } from './binding.js';
import type { TabProps, Translator, WorkspacesSource } from './harness.js';

/** Remembers the full page's scope: every project, one project, or the library. */
const SCOPE_KEY = 'dsh-artifact-studio.panel.scope';

/** Remembers the last concrete project, for creation and the design system. */
const WORKSPACE_KEY = 'dsh-artifact-studio.panel.workspace';

/**
 * The full-page Artifacts panel behind the left sidebar row. It lists the
 * chosen scope and opens an artifact in place so the panel works without a
 * session binding.
 * @param props the translator and the workspace registry store.
 * @returns the panel.
 */
export function ArtifactsPanel({ t, workspaces }: { t: Translator; workspaces: WorkspacesSource }): ReactNode {
  // The registry exposes methods on an instance, so bind them through closures.
  const subscribe = useCallback((listener: () => void) => workspaces.subscribe(listener), [workspaces]);
  const getSnapshot = useCallback(() => workspaces.getSnapshot(), [workspaces]);
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const items = snapshot.items;
  const projects = useMemo<GalleryProject[]>(
    () => items.map(({ workspaceId, title }) => ({ workspaceId, title })),
    [items],
  );
  const [scope, setScope] = useState<GalleryScope>(() => parseScopeValue(window.localStorage.getItem(SCOPE_KEY)) ?? { kind: 'all' });
  const [lastProjectId, setLastProjectId] = useState<string | null>(() => {
    const saved = window.localStorage.getItem(WORKSPACE_KEY);
    return saved === null || saved === '' ? null : saved;
  });
  const [selected, setSelected] = useState<string | null>(null);

  // A scope can name a project that is no longer registered; never use it as
  // the design or creation context. The reset effect below repairs the scope
  // once the registry is non-empty.
  const scopeProject = scope.kind === 'workspace'
    ? items.find((item) => item.workspaceId === scope.workspaceId)
    : undefined;
  const contextWorkspaceId = scopeProject !== undefined
    ? scopeProject.workspaceId
    : lastProjectId !== null && items.some((item) => item.workspaceId === lastProjectId)
      ? lastProjectId
      : items[0]?.workspaceId ?? null;

  useEffect(() => {
    if (items.length === 0) return;
    if (scope.kind === 'workspace' && !items.some((item) => item.workspaceId === scope.workspaceId)) {
      setScope({ kind: 'all' });
      return;
    }
    if (contextWorkspaceId !== null && contextWorkspaceId !== lastProjectId) setLastProjectId(contextWorkspaceId);
  }, [items, scope, contextWorkspaceId, lastProjectId]);

  useEffect(() => {
    window.localStorage.setItem(SCOPE_KEY, formatScope(scope));
  }, [scope]);

  useEffect(() => {
    if (lastProjectId !== null) window.localStorage.setItem(WORKSPACE_KEY, lastProjectId);
  }, [lastProjectId]);

  const address = useMemo(() => (selected === null ? undefined : parseArtifactAddress(selected)), [selected]);

  return (
    <div className="art-panel-stack">
      <div className="art-panel-region" hidden={address !== undefined}>
        <GalleryBody
          t={t}
          projects={projects}
          scope={scope}
          contextWorkspaceId={contextWorkspaceId}
          onScopeChange={setScope}
          open={(next) => setSelected(next)}
        />
      </div>
      {address === undefined ? null : <div className="art-panel-region"><ArtifactPanelBody t={t} address={address} workspaceName={items.find(item => address.scope === 'workspace' && item.workspaceId === address.workspaceId)?.title} onBack={() => setSelected(null)} /></div>}
    </div>
  );
}

/**
 * The Artifacts page in the right sidebar. It is the full page fixed to the
 * session's workspace: one list, no scope control, and an in-place artifact view
 * with Back, so the right panel and the left panel behave the same way.
 * @param props the translator, the session, and the workspace hooks.
 * @returns the page.
 */
export function WorkspaceArtifactsPanel({ t, sessionId, useSessions, useWorkspaces, inputActions }: TabProps): ReactNode {
  const binding = useWorkspaceBinding({ sessionId, useSessions, useWorkspaces });
  const workspaceId = binding.workspaceId;
  const title = useWorkspaces((state) => state.items.find((item) => item.workspaceId === workspaceId)?.title);
  const [selected, setSelected] = useState<string | null>(null);

  // A different session workspace starts from the list again.
  useEffect(() => { setSelected(null); }, [workspaceId]);

  const projects = useMemo<GalleryProject[]>(
    () => (workspaceId === null ? [] : [{ workspaceId, title: title ?? workspaceId }]),
    [workspaceId, title],
  );
  const address = useMemo(() => (selected === null ? undefined : parseArtifactAddress(selected)), [selected]);

  if (workspaceId === null) {
    return (
      <section className="art-root" data-dsh-artifact-studio="">
        <div className="art-center" role="status">
          <p className="art-center-hint">{t('empty.noWorkspace')}</p>
        </div>
      </section>
    );
  }

  return (
    <div className="art-panel-stack">
      <div className="art-panel-region" hidden={address !== undefined}>
        <GalleryBody
          t={t}
          projects={projects}
          scope={{ kind: 'workspace', workspaceId }}
          contextWorkspaceId={workspaceId}
          scopeLocked
          open={(next) => setSelected(next)}
        />
      </div>
      {address === undefined ? null : (
        <div className="art-panel-region">
          <ArtifactPanelBody
            t={t}
            address={address}
            workspaceName={title}
            onBack={() => setSelected(null)}
            {...(inputActions === undefined ? {} : { inputActions })}
          />
        </div>
      )}
    </div>
  );
}
