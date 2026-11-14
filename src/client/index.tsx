import type { ComponentType, ReactNode } from 'react';
import { Toast } from '@deepseek-ai/dsh-client-ui-primitives';
import { parseArtifactAddress } from '../contract.js';
import { configureConnection } from './api.js';
import { installDraftGuard } from './editor-model.js';
import { ArtifactTab } from './artifact-tab.jsx';
import { SurfaceBoundary } from './boundary.jsx';
import { ArtifactCard } from './card.jsx';
import { ComposerButton } from './composer.jsx';
import { DocView } from './doc-view.jsx';
import { ArtifactsPanel } from './panel.jsx';
import type { ClientContext, LayoutService, SessionSlotProps, TabProps, ToolViewProps, Translator, UseTabInfo } from './harness.js';
import { IconArtifacts, IconDoc } from './icons.jsx';
import { ARTIFACT_ID, ARTIFACT_KIND, PANEL_ID } from './ids.js';
import { EN, ZH } from './locale.js';
import { runtime } from './runtime.js';
import { clearNotice, titleOf, useNotice, useTitle } from './store.js';
import { installStyles } from './styles.js';

export { ArtifactCard, ArtifactTab, DocView };
export { ARTIFACT_ID, ARTIFACT_KIND, PANEL_ID };

const NS = 'artifacts';
export const CARD_TOOLS = ['artifact_create', 'artifact_update'] as const;

export const inject = ['connection', 'slots', 'locale', 'sidebarRightTabs', 'sidebarRight', 'workspaces'];

/**
 * The layout service when the composition has one. Only the composer's All
 * artifacts row needs it, so its absence must not park the whole client.
 * @param value the context lookup.
 * @returns the layout, or null.
 */
function layoutOf(value: unknown): LayoutService | null {
  if (value === null || typeof value !== 'object' || !('selectPanel' in value)) return null;
  const { selectPanel } = value;
  if (typeof selectPanel !== 'function') return null;
  return { selectPanel: (panelId) => { selectPanel.call(value, panelId); } };
}

/**
 * Wrap a body in the boundary that keeps a render failure inside its pane.
 * @param Body the body.
 * @returns the wrapped body.
 */
function guarded<P extends { t: Translator }>(Body: ComponentType<P>): ComponentType<P> {
  return function Guarded(props: P): ReactNode {
    return (
      <SurfaceBoundary
        title={props.t('error.surface')}
        hint={props.t('error.surfaceHint')}
        reloadLabel={props.t('action.reloadWindow')}
      >
        <Body {...props} />
      </SurfaceBoundary>
    );
  };
}

function Notice(): ReactNode {
  const notice = useNotice();
  if (notice === null) return null;
  return <Toast key={notice.seq} text={notice.message} onDone={() => clearNotice(notice.seq)} />;
}

function ArtifactTitle({ useTabInfo }: { useTabInfo: UseTabInfo }): ReactNode {
  const { tab } = useTabInfo();
  const address = parseArtifactAddress(tab.contentId ?? tab.navigation?.address);
  const title = useTitle(address?.id);
  return (
    <span className="art-chip">
      <IconDoc />
      <span>{title ?? address?.id ?? ''}</span>
    </span>
  );
}

/**
 * Register the artifact tab type, the full Artifacts page, the chat cards, and
 * the composer menu.
 * @param ctx the plugin context.
 */
export function apply(ctx: ClientContext): void {
  installStyles();
  ctx.effect(installDraftGuard, 'dsh-artifacts: unsaved draft guard');
  configureConnection(ctx.connection);
  runtime.sidebarRight = ctx.sidebarRight;
  runtime.layout = layoutOf(ctx.get('layout'));
  ctx.locale.register(NS, 'en', EN);
  ctx.locale.register(NS, 'zh', ZH);
  const bound = ctx.locale.bind(NS);
  const t: Translator = (key, values) => bound(key, values);

  ctx.effect(
    () =>
      ctx.sidebarRightTabs.register({
        id: ARTIFACT_ID,
        kind: ARTIFACT_KIND,
        priority: 'extension',
        patterns: ['dsh-resource://artifact/**'],
        canOpen: (address) => parseArtifactAddress(address) !== undefined,
        title: (address) => {
          const parsed = parseArtifactAddress(address);
          return parsed === undefined ? '' : (titleOf(parsed.id) ?? parsed.id);
        },
      }),
    'dsh-artifacts: artifact tab type',
  );

  const inject = () => ({ t });
  ctx.effect(() => () => clearNotice(), 'dsh-artifacts: notification cleanup');
  ctx.slots.inject('shell.overlay', () =>
    ctx.slots.register({ name: 'shell.overlay', id: 'dsh-artifacts.notice' }, Notice),
  );
  ctx.slots.inject('sidebar.right.pane.tab', () =>
    ctx.slots.register<TabProps>({ name: 'sidebar.right.pane.tab', key: ARTIFACT_ID, locale: NS, inject }, guarded(ArtifactTab)),
  );
  ctx.slots.inject('sidebar.right.pane.tab.title', () =>
    ctx.slots.register({ name: 'sidebar.right.pane.tab.title', key: ARTIFACT_ID, locale: NS, inject }, ArtifactTitle),
  );
  for (const tool of CARD_TOOLS) {
    ctx.slots.inject('tool.call.toolview', () =>
      ctx.slots.register<ToolViewProps>({ name: 'tool.call.toolview', key: tool, locale: NS, inject }, guarded(ArtifactCard)),
    );
  }
  ctx.slots.inject('conversation.input.left', () =>
    ctx.slots.register<SessionSlotProps>(
      { name: 'conversation.input.left', id: 'dsh-artifacts', order: 40, locale: NS, inject },
      ComposerButton,
    ),
  );

  /** The panel row icon receives the size the sidebar resolves. */
  function PanelIcon({ size }: { size: number }): ReactNode {
    return <IconArtifacts size={size} />;
  }
  const panelInject = () => ({ t, workspaces: ctx.workspaces.list });
  ctx.slots.inject('main', () =>
    ctx.slots.register({ name: 'main', key: PANEL_ID, locale: NS, inject: panelInject }, guarded(ArtifactsPanel)),
  );
  ctx.slots.inject('sidebar.panellist', () =>
    ctx.slots.register({ name: 'sidebar.panellist', id: PANEL_ID, order: 10, label: () => t('panel') }, PanelIcon),
  );
}
