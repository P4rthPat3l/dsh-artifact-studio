import { useEffect, useMemo, useState } from 'react';
import { Button } from '@deepseek-ai/dsh-client-ui-primitives';
import { COLOR_ROLES, tokensToCss } from '../contract.js';
import type { DesignTokens, ResolvedDesignSystem, Scope, TokenColors } from '../contract.js';
import { api, codeOf, errorKey } from './api.js';
import { PageFrame } from './page-view.jsx';
import type { Translator } from './harness.js';
import { notify } from './store.js';
import { useHarnessDark } from './theme.js';

const RADIUS_KEYS = ['sm', 'md', 'lg'] as const;

const PREVIEW = (t: Translator) => `<!doctype html><html><head><meta name="color-scheme" content="light dark"><style>
body { margin: 0; padding: 20px; font-family: var(--artifact-font-family); background: var(--artifact-color-surface); color: var(--artifact-color-text); }
h2 { margin: 0 0 6px; font-family: var(--artifact-font-display); font-size: var(--artifact-font-size-4); letter-spacing: -0.02em; }
p { margin: 0 0 14px; color: var(--artifact-color-muted); }
.row { display: flex; gap: 8px; align-items: center; }
button { padding: 8px 14px; border: 0; border-radius: var(--artifact-radius-md); background: var(--artifact-color-action); color: var(--artifact-color-action-text); font: inherit; }
.tag { padding: 3px 8px; border-radius: var(--artifact-radius-sm); background: var(--artifact-color-raised); color: var(--artifact-color-success); font-size: 12px; }
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
  workspaceTitle?: string;
}

/**
 * Edit the design system with a live preview. Saving to the project writes an
 * override; saving to the library changes what every project inherits.
 * @param props the translator and workspace.
 * @returns the editor.
 */
export function DesignEditor({ t, workspaceId, workspaceTitle }: DesignEditorProps) {
  const [resolved, setResolved] = useState<ResolvedDesignSystem | null>(null);
  const [tokens, setTokens] = useState<DesignTokens | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const dark = useHarnessDark();

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
          <PageFrame content={PREVIEW(t)} designCss={css} title={tokens.name} frameTitle={t('design.preview')} dark={dark} />
        </div>
      </div>
      <label className="art-field">
        {t('design.name')}
        <input type="text" value={tokens.name} maxLength={80} onChange={(event) => setTokens({ ...tokens, name: event.target.value })} />
      </label>
      {(['colors', 'colorsDark'] as const).map((set) => (
        <div key={set} className="art-design-group">
          <h3>{t(set === 'colors' ? 'design.colors' : 'design.colorsDark')}</h3>
          <div className="art-swatches">
            {COLOR_ROLES.map((key) => {
              const setColor = (value: string) => {
                const next: TokenColors = { ...tokens[set], [key]: value };
                setTokens({ ...tokens, [set]: next });
              };
              return (
                <div key={key} className="art-swatch">
                  <input
                    type="color"
                    aria-label={t(`design.color.${key}`) + ' ' + t(set === 'colors' ? 'design.colors' : 'design.colorsDark')}
                    value={isHex(tokens[set][key]) ? tokens[set][key] : '#000000'}
                    onChange={(event) => setColor(event.target.value)}
                  />
                  <span className="art-swatch-text">
                    {t(`design.color.${key}`)}
                    <input
                      type="text"
                      aria-label={t(`design.color.${key}`) + ' ' + t(set === 'colors' ? 'design.colors' : 'design.colorsDark') + ' CSS'}
                      value={tokens[set][key]}
                      onChange={(event) => setColor(event.target.value)}
                    />
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      ))}
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
          {t('design.display')}
          <input
            type="text"
            value={tokens.typography.displayFamily}
            onChange={(event) => setTokens({ ...tokens, typography: { ...tokens.typography, displayFamily: event.target.value } })}
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
          <Button size="sm" variant="primary" disabled={busy} onClick={() => void saveTo('workspace')}>
            {workspaceTitle === undefined ? t('design.saveWorkspace') : t('design.saveWorkspaceNamed', { name: workspaceTitle })}
          </Button>
        )}
        <Button size="sm" variant={workspaceId === null ? 'primary' : 'outline'} disabled={busy} onClick={() => void saveTo('library')}>
          {t('design.saveLibrary')}
        </Button>
        {resolved.source === 'workspace' && workspaceId !== null ? (
          <Button size="sm" variant="outline" disabled={busy} onClick={() => void clear()}>
            {t('design.clear')}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
