import { useEffect } from 'react';
import { formatArtifactAddress, scopeOfId } from '../contract.js';
import type { ArtifactAddress } from '../contract.js';
import type { ToolViewProps } from './harness.js';
import { IconDoc, IconPage } from './icons.jsx';
import { runtime } from './runtime.js';
import { announceListChange, announceVersion, rememberTitle } from './store.js';

/** The card payload a tool result stores in its meta. */
export interface CardMeta {
  id: string;
  type: 'page' | 'doc';
  title: string;
  version: number;
  address: ArtifactAddress;
}

/**
 * Read the stored card payload; anything unexpected means no card.
 * @param meta the tool result meta.
 * @returns the payload, or null.
 */
export function readCardMeta(meta: unknown): CardMeta | null {
  if (meta === null || typeof meta !== 'object') return null;
  const fields: Record<string, unknown> = { ...meta };
  const { id, type, title, version, workspaceId } = fields;
  if (fields.kind !== 'artifact' || typeof id !== 'string' || typeof title !== 'string' || typeof version !== 'number') {
    return null;
  }
  if (type !== 'page' && type !== 'doc') return null;
  const scope = scopeOfId(id);
  if (scope === undefined) return null;
  if (scope === 'workspace') {
    if (typeof workspaceId !== 'string' || workspaceId === '') return null;
    return { id, type, title, version, address: { scope, workspaceId, id } };
  }
  return { id, type, title, version, address: { scope, id } };
}

/**
 * Text the tool produced, for an error the card shows.
 * @param content the result content.
 * @returns the text.
 */
function resultText(content: readonly unknown[] | undefined): string {
  if (!Array.isArray(content)) return '';
  return content
    .map((part: unknown) => {
      if (part === null || typeof part !== 'object') return '';
      const fields: Record<string, unknown> = { ...part };
      return fields.type === 'text' && typeof fields.text === 'string' ? fields.text : '';
    })
    .filter((part) => part !== '')
    .join('\n')
    .trim();
}

/**
 * The chat card for `artifact_create` and `artifact_update`: the artifact's
 * title, type, scope, and version, and an Open action. It announces the
 * version so an open tab of the same artifact reloads.
 * @param props tool view props.
 * @returns the card.
 */
export function ArtifactCard({ t, phase, toolName, block }: ToolViewProps) {
  const meta = phase === 'result' && block?.isError !== true ? readCardMeta(block?.meta) : null;

  useEffect(() => {
    if (meta === null) return;
    rememberTitle(meta.id, meta.title);
    announceVersion(meta.id, meta.version);
    announceListChange();
  }, [meta?.id, meta?.version, meta?.title]);

  if (phase !== 'result') {
    return (
      <div className="art-card" data-artifact-card="working">
        <span className="art-card-icon">
          <IconPage />
        </span>
        <span className="art-card-status" role="status">
          {t('card.working')}
        </span>
        <span />
      </div>
    );
  }
  if (block?.isError === true) {
    return (
      <div className="art-card" data-artifact-card="error">
        <span className="art-card-icon">
          <IconPage />
        </span>
        <span className="art-card-text">
          <span className="art-card-title">{t('card.failed')}</span>
          <span className="art-card-status" data-tone="error">
            {resultText(block.content)}
          </span>
        </span>
        <span />
      </div>
    );
  }
  if (meta === null) {
    return (
      <div className="art-card" data-artifact-card="missing">
        <span className="art-card-icon">
          <IconPage />
        </span>
        <span className="art-card-status">{t('card.missing')}</span>
        <span />
      </div>
    );
  }
  const address = formatArtifactAddress(meta.address);
  return (
    <div className="art-card" data-artifact-card="ready" data-artifact-id={meta.id}>
      <span className="art-card-icon">{meta.type === 'page' ? <IconPage /> : <IconDoc />}</span>
      <span className="art-card-text">
        <span className="art-card-title" title={meta.title}>
          {meta.title}
        </span>
        <span className="art-card-sub">
          <span>{toolName === 'artifact_update' ? t('card.updated') : t('card.created')}</span>
          <span>·</span>
          <span>{t(`type.${meta.type}`)}</span>
          <span className="art-badge" data-scope={meta.address.scope}>
            {t(`scope.${meta.address.scope}`)}
          </span>
          <span>{t('gallery.version', { version: meta.version })}</span>
        </span>
      </span>
      <button type="button" className="art-button" onClick={() => runtime.sidebarRight?.openResource(address)}>
        {t('card.open')}
      </button>
    </div>
  );
}
