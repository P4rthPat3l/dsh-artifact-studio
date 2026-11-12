import type { ComponentType, ReactNode } from 'react';
import { parseArtifactAddress } from '../contract.js';
import { configureConnection } from './api.js';
import { installDraftGuard } from './editor-model.js';
import { ArtifactTab } from './artifact-tab.jsx';
import { SurfaceBoundary } from './boundary.jsx';
import { ArtifactCard } from './card.jsx';
import { ComposerButton, GALLERY_KIND } from './composer.jsx';
import { DocView } from './doc-view.jsx';
import { Gallery } from './gallery.jsx';
import { ArtifactsPanel } from './panel.jsx';
import type { ClientContext, SessionSlotProps, TabProps, ToolViewProps, Translator, UseTabInfo } from './harness.js';
import { IconArtifacts, IconDoc } from './icons.jsx';
import { EN, ZH } from './locale.js';
import { runtime } from './runtime.js';
import { clearNotice, titleOf, useNotice, useTitle } from './store.js';
import { installStyles } from './styles.js';

export { ArtifactCard, ArtifactTab, DocView, Gallery };

const NS = 'artifacts';
export const GALLERY_ID = 'dsh-artifacts';
export const ARTIFACT_ID = 'dsh-artifacts/artifact';
export const ARTIFACT_KIND = 'artifact';
export const PANEL_ID = 'dsh-artifacts-panel';
export const CARD_TOOLS = ['artifact_create', 'artifact_update'] as const;

export const inject = ['connection', 'slots', 'locale', 'sidebarRightTabs', 'sidebarRight', 'workspaces'];

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
  const message = useNotice();
  return message === null ? null : <div className="art-toast" role="status">{message}</div>;
}

function GalleryTitle({ t }: { t: Translator }): ReactNode {
  return (
    <span className="art-chip">
      <IconArtifacts />
      <span>{t('panel')}</span>
    </span>
  );
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
 * Register the gallery page, the artifact tab type, the chat cards, and the composer button.
 * @param ctx the plugin context.
 */
export function apply(ctx: ClientContext): void {
  installStyles();
  ctx.effect(installDraftGuard, 'dsh-artifacts: unsaved draft guard');
  configureConnection(ctx.connection);
  runtime.sidebarRight = ctx.sidebarRight;
  ctx.locale.register(NS, 'en', EN);
  ctx.locale.register(NS, 'zh', ZH);
  const bound = ctx.locale.bind(NS);
  const t: Translator = (key, values) => bound(key, values);

  ctx.effect(
    () =>
      ctx.sidebarRightTabs.register({
        id: GALLERY_ID,
        kind: GALLERY_KIND,
        priority: 'extension',
        keepMounted: true,
        title: () => t('panel'),
        guide: [
          {
            id: 'artifacts',
            order: 40,
            title: () => t('guide.title'),
            description: () => t('guide.description'),
            icon: () => <IconArtifacts size={22} />,
          },
        ],
      }),
    'dsh-artifacts: gallery tab type',
  );

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
  ctx.effect(() => clearNotice, 'dsh-artifacts: notification cleanup');
  ctx.slots.inject('shell.overlay', () =>
    ctx.slots.register({ name: 'shell.overlay', id: 'dsh-artifacts.notice' }, Notice),
  );
  ctx.slots.inject('sidebar.right.pane.tab', () =>
    ctx.slots.register<TabProps>({ name: 'sidebar.right.pane.tab', key: GALLERY_ID, locale: NS, inject }, guarded(Gallery)),
  );
  ctx.slots.inject('sidebar.right.pane.tab', () =>
    ctx.slots.register<TabProps>({ name: 'sidebar.right.pane.tab', key: ARTIFACT_ID, locale: NS, inject }, guarded(ArtifactTab)),
  );
  ctx.slots.inject('sidebar.right.pane.tab.title', () =>
    ctx.slots.register({ name: 'sidebar.right.pane.tab.title', key: GALLERY_ID, locale: NS, inject }, GalleryTitle),
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
