import { useEffect, useRef } from 'react';
import { IconChevronRightOutlineRegular, StateDot, TextShimmer } from '@deepseek-ai/dsh-client-ui-primitives';
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
 * The title the call is writing, read from its arguments once they exist.
 * @param args the parsed call arguments.
 * @returns the title, or undefined.
 */
function titleArgument(args: unknown): string | undefined {
  if (args === null || typeof args !== 'object') return undefined;
  const fields: Record<string, unknown> = { ...args };
  return typeof fields.title === 'string' && fields.title.trim() !== '' ? fields.title.trim() : undefined;
}

/** Results this window already opened, so a remount never opens a second tab. */
const opened = new Set<string>();

/**
 * The chat card for artifact_create and artifact_update. While the call
 * runs it names what is being written; once the result arrives it opens the
 * artifact, but only when this card watched the call run, so replayed history
 * never opens tabs.
 * @param props tool view props.
 * @returns the card.
 */
export function ArtifactCard({ t, phase, toolName, block }: ToolViewProps) {
  const meta = phase === 'result' && block?.isError !== true ? readCardMeta(block?.meta) : null;
  const sawRunning = useRef(phase !== 'result');
  if (phase !== 'result') sawRunning.current = true;
  const updating = toolName === 'artifact_update';

  useEffect(() => {
    if (meta === null) return;
    rememberTitle(meta.id, meta.title);
    announceVersion(meta.id, meta.version);
    announceListChange();
    const key = meta.id + ':' + meta.version;
    if (!sawRunning.current || opened.has(key)) return;
    opened.add(key);
    runtime.sidebarRight?.openResource(formatArtifactAddress(meta.address));
  }, [meta?.id, meta?.version, meta?.title]);

  if (phase !== 'result') {
    const title = titleArgument(block?.args);
    const label = title === undefined
      ? t(updating ? 'card.updatingUntitled' : 'card.working')
      : t(updating ? 'card.updating' : 'card.creating', { title });
    return (
      <div className="art-card" data-artifact-card="working">
        <span className="art-card-icon"><IconPage /></span>
        <span className="art-card-text">
          <TextShimmer active className="art-card-title"><span role="status">{label}</span></TextShimmer>
        </span>
        <StateDot state="ongoing" />
      </div>
    );
  }
  if (block?.isError === true) {
    return (
      <div className="art-card" data-artifact-card="error">
        <span className="art-card-icon" data-tone="error"><IconPage /></span>
        <span className="art-card-text">
          <span className="art-card-title">{t('card.failed')}</span>
          <span className="art-card-sub" data-tone="error">{resultText(block.content)}</span>
        </span>
      </div>
    );
  }
  if (meta === null) {
    return (
      <div className="art-card" data-artifact-card="missing">
        <span className="art-card-icon"><IconPage /></span>
        <span className="art-card-sub">{t('card.missing')}</span>
      </div>
    );
  }
  const address = formatArtifactAddress(meta.address);
  return (
    <button
      type="button"
      className="art-card art-card-open"
      data-artifact-card="ready"
      data-artifact-id={meta.id}
      aria-label={t('card.openNamed', { title: meta.title })}
      onClick={() => runtime.sidebarRight?.openResource(address)}
    >
      <span className="art-card-icon">{meta.type === 'page' ? <IconPage /> : <IconDoc />}</span>
      <span className="art-card-text">
        <span className="art-card-title" title={meta.title}>{meta.title}</span>
        <span className="art-card-sub">
          {t(updating ? 'card.updated' : 'card.created')} · {t(`type.${meta.type}`)} · {t('gallery.version', { version: meta.version })}
          {meta.address.scope === 'library' ? ' · ' + t('scope.library') : ''}
        </span>
      </span>
      <span className="art-card-go" aria-hidden="true"><IconChevronRightOutlineRegular size={14} /></span>
    </button>
  );
}
