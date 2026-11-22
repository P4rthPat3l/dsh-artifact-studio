import { useEffect, useState } from 'react';
import { Button, Menu, Tooltip } from '@deepseek-ai/dsh-client-ui-primitives';
import type { MenuEntry } from '@deepseek-ai/dsh-client-ui-primitives';
import { formatArtifactAddress } from '../contract.js';
import type { Manifest } from '../contract.js';
import { api } from './api.js';
import { useWorkspaceBinding } from './binding.js';
import type { SessionSlotProps } from './harness.js';
import { IconArtifacts, IconDesign, IconDoc, IconPage, IconSheet } from './icons.jsx';
import { PANEL_ID } from './ids.js';
import { runtime } from './runtime.js';
import { rememberTitle, useListChanges } from './store.js';

/** How many recent artifacts the composer menu lists. */
const RECENT_LIMIT = 6;

/** Starting prompts the menu puts in the composer for the user to finish. */
export const STARTERS = ['dashboard', 'explainer', 'report', 'brief', 'sheet'] as const;

/**
 * Order project artifacts so the ones this conversation wrote come first.
 * @param items the listed manifests, newest first.
 * @param sessionId the conversation.
 * @returns at most the menu limit.
 */
function recentForSession(items: readonly Manifest[], sessionId: string): Manifest[] {
  const own = items.filter((item) => item.source.sessionId === sessionId);
  const rest = items.filter((item) => item.source.sessionId !== sessionId);
  return [...own, ...rest].slice(0, RECENT_LIMIT);
}

/**
 * The composer control: this project's recent artifacts, starting prompts, and
 * the full Artifacts page. A prompt is placed in the composer and never sent.
 * @param props slot props.
 * @returns the control.
 */
export function ComposerButton(props: SessionSlotProps) {
  const { t, sessionId, inputActions } = props;
  const binding = useWorkspaceBinding(props);
  const workspaceId = binding.workspaceId;
  const changes = useListChanges();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Manifest[] | null>(null);

  useEffect(() => {
    if (!open || workspaceId === null) return undefined;
    const controller = new AbortController();
    api.list({ scope: 'workspace', workspaceId }, {}, controller.signal)
      .then((page) => { if (!controller.signal.aborted) setItems(recentForSession(page.items, sessionId)); })
      .catch(() => { if (!controller.signal.aborted) setItems([]); });
    return () => controller.abort();
  }, [open, workspaceId, sessionId, changes]);

  const recent: MenuEntry[] = workspaceId === null
    ? [{ type: 'label', id: 'no-workspace', text: t('empty.noWorkspace') }]
    : items === null
      ? [{ type: 'label', id: 'loading', text: t('empty.loading') }]
      : items.length === 0
        ? [{ type: 'label', id: 'empty', text: t('composer.empty') }]
        : items.map((item) => ({ id: 'open:' + item.id, label: item.title, icon: item.type === 'page' ? <IconPage size={14} /> : item.type === 'doc' ? <IconDoc size={14} /> : item.type === 'sheet' ? <IconSheet size={14} /> : <IconDesign size={14} /> }));
  const entries: MenuEntry[] = [
    { type: 'label', id: 'recent', text: t('composer.recent') },
    ...recent,
    ...(inputActions === undefined ? [] : [
      { type: 'separator' as const, id: 'start-gap' },
      { type: 'label' as const, id: 'start', text: t('composer.start') },
      ...STARTERS.map((starter) => ({ id: 'prompt:' + starter, label: t(`prompt.${starter}`) })),
    ]),
    { type: 'separator', id: 'all-gap' },
    { id: 'all', label: t('composer.all') },
  ];

  const select = (entry: string) => {
    setOpen(false);
    if (entry === 'all') { runtime.layout?.selectPanel(PANEL_ID); return; }
    if (entry.startsWith('prompt:') && inputActions !== undefined) {
      inputActions.insertText(t(`prompt.${entry.slice(7)}Text`), inputActions.captureInsertion());
      return;
    }
    const manifest = items?.find((item) => 'open:' + item.id === entry);
    if (manifest === undefined || workspaceId === null) return;
    rememberTitle(manifest.id, manifest.title);
    runtime.sidebarRight?.openResource(formatArtifactAddress({ scope: 'workspace', workspaceId, id: manifest.id }));
  };

  return (
    <Menu
      open={open}
      onClose={() => setOpen(false)}
      items={entries}
      onSelect={select}
      side="top"
      portal
      autoFocus
      anchor={
        <Tooltip label={t('composer.label')} side="top" portal>
          <Button size="sm" className="art-composer" aria-label={t('composer.label')} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
            <IconArtifacts />
          </Button>
        </Tooltip>
      }
    />
  );
}
