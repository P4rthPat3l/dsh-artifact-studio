import { useState } from 'react';
import { Button, Modal } from '@deepseek-ai/dsh-client-ui-primitives';
import type { Manifest, TransferMode } from '../contract.js';
import { api, codeOf, errorKey } from './api.js';
import type { Where } from './api.js';
import type { Translator, WorkspaceItem } from './harness.js';

/**
 * Pick the workspace an artifact is copied or moved to. The copy keeps its
 * version history, and the host writes it under a new id in the destination.
 * @param props the mode, source, target workspaces, and the outcome actions.
 * @returns the dialog.
 */
export function TransferDialog({ t, mode, where, id, title, targets, onClose, onDone }: {
  t: Translator;
  mode: TransferMode;
  where: Where;
  id: string;
  title: string;
  targets: readonly WorkspaceItem[];
  onClose: () => void;
  onDone: (manifest: Manifest, workspaceId: string) => void;
}) {
  const [choice, setChoice] = useState(targets[0]?.workspaceId ?? '');
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const run = async () => {
    if (choice === '' || busy) return;
    setBusy(true);
    setFailure(null);
    try {
      const { manifest } = await api.transfer(where, id, choice, mode);
      onDone(manifest, choice);
      onClose();
    } catch (error) {
      setFailure(t(errorKey(codeOf(error))));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={() => { if (!busy) onClose(); }}
      title={t(mode === 'copy' ? 'transfer.copyTitle' : 'transfer.moveTitle')}
      closeLabel={t('dialog.close')}
      description={t(mode === 'copy' ? 'transfer.copyHint' : 'transfer.moveHint', { title })}
      footer={<>
        <Button variant="outline" disabled={busy} onClick={onClose}>{t('create.cancel')}</Button>
        <Button variant="primary" disabled={busy || choice === ''} onClick={() => void run()}>
          {t(mode === 'copy' ? 'transfer.copyAction' : 'transfer.moveAction')}
        </Button>
      </>}
    >
      <label className="art-field">
        {t('transfer.target')}
        <select className="art-select" disabled={busy} value={choice} onChange={(event) => setChoice(event.target.value)}>
          {targets.map((target) => (
            <option key={target.workspaceId} value={target.workspaceId}>{target.title}</option>
          ))}
        </select>
      </label>
      {failure === null ? null : <p className="art-modal-error" role="alert">{failure}</p>}
    </Modal>
  );
}
