import { useEffect, useState } from 'react';
import { Button, Modal, TextShimmer } from '@deepseek-ai/dsh-client-ui-primitives';
import type { DesignSelection, DesignSystemRef, ResolvedDesignSystem } from '../contract.js';
import { api, codeOf, errorKey } from './api.js';
import type { Where } from './api.js';
import type { Translator } from './harness.js';

export function RebaseDialog({ t, where, onClose, onApply }: {
  t: Translator; where: Where; onClose: () => void; onApply: (selection: DesignSelection) => Promise<void>;
}) {
  const [systems, setSystems] = useState<DesignSystemRef[] | null>(null);
  const [choice, setChoice] = useState('');
  const [preview, setPreview] = useState<ResolvedDesignSystem | null>(null);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const selected = systems?.find(system => system.scope + ':' + system.id === choice);
  const selection: DesignSelection = selected ? { systemId: selected.id, systemScope: selected.scope, revision: selected.revision } : {};
  useEffect(() => {
    const controller = new AbortController();
    const roots: Where[] = where.scope === 'library' ? [where] : [where, { scope: 'library', workspaceId: null }];
    Promise.all(roots.map(root => api.designSystems(root, controller.signal))).then(lists => {
      if (!controller.signal.aborted) setSystems(lists.flatMap(list => list.systems));
    }).catch(error => { if (!controller.signal.aborted) setFailure(t(errorKey(codeOf(error)))); });
    return () => controller.abort();
  }, [where.scope, where.workspaceId, attempt]);
  useEffect(() => {
    const controller = new AbortController();
    setPreview(null); setFailure(null);
    api.selectedDesign(where, selection, controller.signal).then(value => {
      if (!controller.signal.aborted) setPreview(value);
    }).catch(error => { if (!controller.signal.aborted) setFailure(t(errorKey(codeOf(error)))); });
    return () => controller.abort();
  }, [choice, systems, attempt]);
  const apply = async () => {
    if (!preview || systems === null || busy) return;
    setBusy(true); setFailure(null);
    try {
      // Pin the previewed named revision, not a newly changed default.
      const resolved = preview.system;
      await onApply(resolved ? { systemId: resolved.id, systemScope: resolved.scope, revision: resolved.revision } : selection);
      onClose();
    } catch (error) { setFailure(t(errorKey(codeOf(error)))); }
    finally { setBusy(false); }
  };
  return <Modal open onClose={() => { if (!busy) onClose(); }} title={t('generation.confirm')} closeLabel={t('dialog.close')} footer={<>
    <Button variant="outline" disabled={busy} onClick={onClose}>{t('create.cancel')}</Button>
    <Button variant="primary" disabled={busy || preview === null || systems === null || failure !== null} onClick={() => void apply()}>{t('generation.apply')}</Button>
  </>}>
    <p className="art-note">{t('generation.explain')}</p>
    <label className="art-field">{t('design.system')}<select className="art-select" disabled={busy || systems === null} value={choice} onChange={event => setChoice(event.target.value)}>
      <option value="">{t('design.defaultChoice')}</option>
      {systems?.map(system => <option key={system.scope + system.id} value={system.scope + ':' + system.id}>{system.scope === 'workspace' ? t('scope.workspace') : t('scope.library')}: {t('design.revision', { name: system.name, revision: system.revision })}</option>)}
    </select></label>
    {preview ? <p className="art-note">{preview.system ? t('design.revision', { name: preview.system.name, revision: preview.system.revision }) : preview.tokens.name}</p> : <p className="art-note" role="status"><TextShimmer active>{t('empty.loading')}</TextShimmer></p>}
    {failure ? <div role="alert"><p className="art-modal-error">{failure}</p><Button variant="outline" size="sm" disabled={busy} onClick={() => setAttempt(value => value + 1)}>{t('action.retry')}</Button></div> : null}
  </Modal>;
}
