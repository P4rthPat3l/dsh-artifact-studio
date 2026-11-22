import { useEffect, useState } from 'react';
import { Button, TextShimmer } from '@deepseek-ai/dsh-client-ui-primitives';
import type { PreviewResult } from '../contract.js';
import { api, describeFailure } from './api.js';
import type { Where } from './api.js';
import type { Translator } from './harness.js';

type State =
  | { status: 'loading' }
  | { status: 'ready'; preview: PreviewResult }
  | { status: 'failed'; message: string };

/**
 * The rendered preview of a design. The PNG comes from the host, which
 * compiles and rasterizes the saved source; the browser never runs the engine.
 * @param props the translator, target, artifact, and version.
 * @returns the preview area.
 */
export function DesignView({ t, where, id, version, title }: {
  t: Translator;
  where: Where;
  id: string;
  version: number;
  title: string;
}) {
  const [state, setState] = useState<State>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setState({ status: 'loading' });
    api
      .preview(where, id, version, controller.signal)
      .then((preview) => {
        if (!controller.signal.aborted) setState({ status: 'ready', preview });
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setState({ status: 'failed', message: describeFailure(t, error) });
      });
    return () => controller.abort();
  }, [where.scope, where.workspaceId, id, version, attempt, t]);

  if (state.status === 'loading') {
    return <div className="art-state" role="status" aria-busy="true"><TextShimmer active>{t('preview.loading')}</TextShimmer></div>;
  }
  if (state.status === 'failed') {
    return (
      <div className="art-state" role="alert">
        <span className="art-design-error">{state.message}</span>
        <Button size="sm" variant="outline" onClick={() => setAttempt((value) => value + 1)}>{t('preview.retry')}</Button>
      </div>
    );
  }
  const { preview } = state;
  return (
    <div className="art-design-preview">
      <div className="art-design-canvas">
        <img
          className="art-design-image"
          src={`data:${preview.mediaType};base64,${preview.data}`}
          alt={title}
          width={preview.width}
          height={preview.height}
        />
      </div>
      {preview.info.warnings.length === 0 ? null : (
        <div className="art-design-warnings" role="note">
          <span className="art-design-warnings-title">{t('preview.warnings')}</span>
          <ul>{preview.info.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>
        </div>
      )}
    </div>
  );
}
