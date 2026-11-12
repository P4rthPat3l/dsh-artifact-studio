import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';
import { parseArtifactAddress } from '../contract.js';
import { ArtifactPanelBody } from './artifact-tab.jsx';
import { GalleryBody } from './gallery.jsx';
import type { Translator, WorkspacesSource } from './harness.js';

/** Remembers the workspace the full page last showed. */
const WORKSPACE_KEY = 'dsh-artifacts.panel.workspace';

/**
 * The full-page Artifacts panel behind the left sidebar row. It lists the
 * chosen workspace and the library, and opens an artifact in place so the
 * panel works without a session binding.
 * @param props the translator and the workspace registry store.
 * @returns the panel.
 */
export function ArtifactsPanel({ t, workspaces }: { t: Translator; workspaces: WorkspacesSource }): ReactNode {
  // The registry exposes methods on an instance, so bind them through closures.
  const subscribe = useCallback((listener: () => void) => workspaces.subscribe(listener), [workspaces]);
  const getSnapshot = useCallback(() => workspaces.getSnapshot(), [workspaces]);
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const items = snapshot.items;
  const [workspaceId, setWorkspaceId] = useState<string | null>(() => {
    const saved = window.localStorage.getItem(WORKSPACE_KEY);
    return saved === null || saved === '' ? (items[0]?.workspaceId ?? null) : saved;
  });
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    if (items.length === 0) {
      if (workspaceId !== null) setWorkspaceId(null);
      return;
    }
    if (workspaceId === null || !items.some((item) => item.workspaceId === workspaceId)) {
      setWorkspaceId(items[0]?.workspaceId ?? null);
    }
  }, [items, workspaceId]);

  useEffect(() => {
    if (workspaceId !== null) window.localStorage.setItem(WORKSPACE_KEY, workspaceId);
  }, [workspaceId]);

  const address = useMemo(() => (selected === null ? undefined : parseArtifactAddress(selected)), [selected]);

  return (
    <div className="art-panel-stack">
    <div className="art-panel-region" hidden={address !== undefined}>
    <GalleryBody
      t={t}
      workspaceId={workspaceId}
      open={(next) => setSelected(next)}
      toolbar={
        items.length === 0 ? null : (
          <label className="art-workspace">
            <span className="art-workspace-label">{t('panel.workspace')}</span>
            <select
              className="art-workspace-select"
              aria-label={t('panel.workspace')}
              value={workspaceId ?? ''}
              onChange={(event) => setWorkspaceId(event.target.value === '' ? null : event.target.value)}
            >
              {items.map((item) => (
                <option key={item.workspaceId} value={item.workspaceId}>
                  {item.title}
                </option>
              ))}
            </select>
          </label>
        )
      }
    />
    </div>
    {address === undefined ? null : <div className="art-panel-region"><ArtifactPanelBody t={t} address={address} workspaceName={items.find(item => address.scope === 'workspace' && item.workspaceId === address.workspaceId)?.title} onBack={() => setSelected(null)} /></div>}
    </div>
  );
}
