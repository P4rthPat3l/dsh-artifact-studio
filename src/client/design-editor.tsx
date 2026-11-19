import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@deepseek-ai/dsh-client-ui-primitives';
import { COLOR_ROLES, tokensToCss } from '../contract.js';
import type { DesignCatalog, DesignTokens, ResolvedDesignSystem, Scope, TokenColors } from '../contract.js';
import type { Where } from './api.js';
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
  const where: Where = { workspaceId, scope: workspaceId === null ? 'library' : 'workspace' };
  const [catalog, setCatalog] = useState<DesignCatalog | null>(null);
  const [selected, setSelected] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const sequence = useRef(0);
  const dirty = resolved !== null && tokens !== null && JSON.stringify(tokens) !== JSON.stringify(resolved.tokens);

  useEffect(() => {
    const controller = new AbortController();
    setResolved(null); setTokens(null); setCatalog(null); setFailed(false);
    Promise.all([api.designSystem(workspaceId, controller.signal), api.designSystems(where, controller.signal)])
      .then(([value, list]) => {
        if (controller.signal.aborted) return;
        setResolved(value); setTokens(value.tokens); setCatalog(list);
      })
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true);
      });
    return () => controller.abort();
  }, [workspaceId]);

  const css = useMemo(() => (tokens === null ? '' : tokensToCss(tokens)), [tokens]);

  if (failed) return <p className="art-note">{t('error.generic')}</p>;
  if (resolved === null || tokens === null) return <p className="art-note">{t('empty.loading')}</p>;

  const saveTo = async (scope: Scope, copy = false) => {
    setBusy(true);
    try {
      const target = { scope, workspaceId: scope === 'library' ? null : workspaceId };
      const list = scope === where.scope ? catalog : await api.designSystems(target);
      if (list === null) return;
      const systemId = !copy && resolved.system?.scope === scope ? resolved.system.id : undefined;
      const options = copy || systemId ? { systemId, createNew: systemId === undefined, expectedRevision: list.revision } : undefined;
      const value = await api.saveDesignSystem(target, tokens, options);
      if (scope === where.scope) {
        setResolved(value); setTokens(value.tokens); setSelected(value.system?.id ?? '');
        setCatalog(await api.designSystems(where));
      }
      setMessage(null);
      notify(t('design.saved'));
    } catch (error) {
      setMessage(t(errorKey(codeOf(error))));
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
      setMessage(t(errorKey(codeOf(error))));
    } finally {
      setBusy(false);
    }
  };

  const select = async (id: string) => {
    if (dirty) {
      setMessage(t('design.unsavedSelection'));
      return;
    }
    const request = ++sequence.current;
    setBusy(true);
    try {
      const value = await api.selectedDesign(where, id === '' ? {} : { systemId: id, systemScope: where.scope });
      if (request === sequence.current) { setSelected(id); setResolved(value); setTokens(value.tokens); setMessage(null); }
    } catch (error) { setMessage(t(errorKey(codeOf(error)))); }
    finally { if (request === sequence.current) setBusy(false); }
  };
  const reloadCatalog = async () => {
    try { setCatalog(await api.designSystems(where)); setMessage(null); }
    catch (error) { setMessage(t(errorKey(codeOf(error)))); }
  };
  const makeDefault = async () => {
    if (!catalog || !resolved.system || resolved.system.scope !== where.scope) return;
    setBusy(true);
    try { await api.setDesignDefault(where, resolved.system.id, catalog.revision); await reloadCatalog(); notify(t('design.saved')); }
    catch (error) { setMessage(t(errorKey(codeOf(error)))); }
    finally { setBusy(false); }
  };
  return (
    <div className="art-design">
      <label className="art-field">{t('design.system')}
        <select value={selected} disabled={busy} onChange={event => void select(event.target.value)}>
          <option value="">{t('design.defaultChoice')}</option>
          {catalog?.systems.map(system => <option key={system.id} value={system.id}>{t('design.revision', { name: system.name, revision: system.revision })}</option>)}
        </select>
      </label>
      <p className="art-note">{t('design.pinHint')}</p>
      {resolved.system ? <p className="art-note">{t('design.revision', { name: resolved.system.name, revision: resolved.system.revision })}</p> : null}
      {message ? <p role="alert" className="art-note">{message}</p> : null}
      <div className="art-design-actions">
        <Button size="sm" disabled={busy || !catalog} onClick={() => void saveTo(where.scope, true)}>{t('design.copy')}</Button>
        {resolved.system?.scope === where.scope ? <Button size="sm" disabled={busy || dirty || catalog?.defaultId === resolved.system.id} onClick={() => void makeDefault()}>{t('design.useDefault')}</Button> : null}
        <Button size="sm" disabled={busy} onClick={() => void reloadCatalog()}>{t('design.catalogReload')}</Button>
        {dirty ? <Button size="sm" disabled={busy} onClick={() => { setTokens(resolved.tokens); setMessage(null); }}>{t('design.discardEdits')}</Button> : null}
      </div>
      <p className="art-design-source">
        {t('design.hint')} {t(`design.source.${resolved.source}`)}
      </p>
      <div className="art-design-group">
        <h3>{t('design.preview')}</h3>
        <div className="art-design-preview" style={{ height: 150, display: 'flex' }}>
          <PageFrame content={PREVIEW(t)} designCss={css} title={tokens.name} frameTitle={t('design.preview')} dark={dark} />
        </div>
      </div>
      <fieldset disabled={busy} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
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
      </fieldset>
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
