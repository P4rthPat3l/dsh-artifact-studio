import { useEffect, useMemo, useState } from 'react';
import { tokensToCss } from '../contract.js';
import type { DesignTokens, ResolvedDesignSystem, Scope } from '../contract.js';
import { api, codeOf, errorKey } from './api.js';
import { PageFrame } from './page-view.jsx';
import type { Translator } from './harness.js';
import { notify } from './store.js';

const COLOR_KEYS = ['primary', 'accent', 'surface', 'text', 'muted'] as const;
const RADIUS_KEYS = ['sm', 'md', 'lg'] as const;

const PREVIEW = (t: Translator) => `<!doctype html><html><head><style>
body { margin: 0; padding: 20px; font-family: var(--artifact-font-family); background: var(--artifact-color-surface); color: var(--artifact-color-text); }
h2 { margin: 0 0 6px; font-size: var(--artifact-font-size-4); letter-spacing: -0.02em; }
p { margin: 0 0 14px; color: var(--artifact-color-muted); }
.row { display: flex; gap: 8px; align-items: center; }
button { padding: 8px 14px; border: 0; border-radius: var(--artifact-radius-md); background: var(--artifact-color-primary); color: #fff; font: inherit; }
.tag { padding: 3px 8px; border-radius: var(--artifact-radius-sm); background: var(--artifact-color-accent); color: #fff; font-size: 12px; }
code { font-family: var(--artifact-font-mono); font-size: 12px; }
</style></head><body><h2>${t('design.previewHeading')}</h2><p>${t('design.previewBody')}</p>
<div class="row"><button>${t('design.previewButton')}</button><span class="tag">+12%</span><code>var(--artifact-color-primary)</code></div></body></html>`;

/**
 * Whether a color is a six-digit hex value the color input can show.
 * @param value the color.
 * @returns whether it is `#rrggbb`.
 */
function isHex(value: string): boolean {
  return /^#[0-9a-f]{6}$/i.test(value);
}

/** Props for the token editor. */
export interface DesignEditorProps {
  t: Translator;
  workspaceId: string | null;
}

/**
 * Edit the design system with a live preview. Saving to the project writes an
 * override; saving to the library changes what every project inherits.
 * @param props the translator and workspace.
 * @returns the editor.
 */
export function DesignEditor({ t, workspaceId }: DesignEditorProps) {
  const [resolved, setResolved] = useState<ResolvedDesignSystem | null>(null);
  const [tokens, setTokens] = useState<DesignTokens | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    api
      .designSystem(workspaceId, controller.signal)
      .then((value) => {
        setResolved(value);
        setTokens(value.tokens);
      })
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true);
      });
    return () => controller.abort();
  }, [workspaceId]);

  const css = useMemo(() => (tokens === null ? '' : tokensToCss(tokens)), [tokens]);

  if (failed) return <p className="art-note">{t('error.generic')}</p>;
  if (resolved === null || tokens === null) return <p className="art-note">{t('empty.loading')}</p>;

  const saveTo = async (scope: Scope) => {
    setBusy(true);
    try {
      const value = await api.saveDesignSystem({ scope, workspaceId }, tokens);
      setResolved(value);
      setTokens(value.tokens);
      notify(t('design.saved'));
    } catch (error) {
      notify(t(errorKey(codeOf(error))));
    } finally {
      setBusy(false);
    }
  };

  const clear = async () => {
    if (workspaceId === null) return;
    setBusy(true);
    try {
      const value = await api.clearDesignSystem(workspaceId);
      setResolved(value);
      setTokens(value.tokens);
    } catch (error) {
      notify(t(errorKey(codeOf(error))));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="art-design">
      <p className="art-design-source">
        {t('design.hint')} {t(`design.source.${resolved.source}`)}
      </p>
      <div className="art-design-group">
        <h3>{t('design.preview')}</h3>
        <div className="art-design-preview" style={{ height: 150, display: 'flex' }}>
          <PageFrame content={PREVIEW(t)} designCss={css} title={tokens.name} frameTitle={t('design.preview')} />
        </div>
      </div>
      <label className="art-field">
        {t('design.name')}
        <input type="text" value={tokens.name} maxLength={80} onChange={(event) => setTokens({ ...tokens, name: event.target.value })} />
      </label>
      <div className="art-design-group">
        <h3>{t('design.colors')}</h3>
        <div className="art-swatches">
          {COLOR_KEYS.map((key) => (
            <div key={key} className="art-swatch">
              <input
                type="color"
                aria-label={t(`design.color.${key}`)}
                value={isHex(tokens.colors[key]) ? tokens.colors[key] : '#000000'}
                onChange={(event) => setTokens({ ...tokens, colors: { ...tokens.colors, [key]: event.target.value } })}
              />
              <span className="art-swatch-text">
                {t(`design.color.${key}`)}
                <input
                  type="text"
                  aria-label={`${t(`design.color.${key}`)} CSS`}
                  value={tokens.colors[key]}
                  onChange={(event) => setTokens({ ...tokens, colors: { ...tokens.colors, [key]: event.target.value } })}
                />
              </span>
            </div>
          ))}
        </div>
      </div>
      <div className="art-design-group">
        <h3>{t('design.type')}</h3>
        <label className="art-field">
          {t('design.font')}
          <input
            type="text"
            value={tokens.typography.fontFamily}
            onChange={(event) => setTokens({ ...tokens, typography: { ...tokens.typography, fontFamily: event.target.value } })}
          />
        </label>
        <label className="art-field">
          {t('design.mono')}
          <input
            type="text"
            value={tokens.typography.monoFamily}
            onChange={(event) => setTokens({ ...tokens, typography: { ...tokens.typography, monoFamily: event.target.value } })}
          />
        </label>
      </div>
      <div className="art-design-group">
        <h3>{t('design.radius')}</h3>
        <div className="art-radius-row">
          {RADIUS_KEYS.map((key) => (
            <label key={key}>
              {t(`design.radius.${key}`)}
              <input
                type="number"
                min={0}
                max={64}
                value={tokens.radius[key]}
                onChange={(event) =>
                  setTokens({ ...tokens, radius: { ...tokens.radius, [key]: Number(event.target.value) || 0 } })
                }
              />
            </label>
          ))}
        </div>
      </div>
      <label className="art-field">
        {t('design.notes')}
        <textarea value={tokens.notes} maxLength={4000} onChange={(event) => setTokens({ ...tokens, notes: event.target.value })} />
        <span className="art-field-hint">{t('design.notesHint')}</span>
      </label>
      <div className="art-design-actions">
        {workspaceId === null ? null : (
          <button type="button" className="art-button art-button-primary" disabled={busy} onClick={() => void saveTo('workspace')}>
            {t('design.saveWorkspace')}
          </button>
        )}
        <button
          type="button"
          className={workspaceId === null ? 'art-button art-button-primary' : 'art-button'}
          disabled={busy}
          onClick={() => void saveTo('library')}
        >
          {t('design.saveLibrary')}
        </button>
        {resolved.source === 'workspace' && workspaceId !== null ? (
          <button type="button" className="art-button" disabled={busy} onClick={() => void clear()}>
            {t('design.clear')}
          </button>
        ) : null}
      </div>
    </div>
  );
}
