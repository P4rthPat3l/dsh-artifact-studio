import { useCallback, useEffect, useId, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Button, SegmentedControl } from '@deepseek-ai/dsh-client-ui-primitives';
import type { CanvasTool, DesignCanvasHandle, DesignCanvasModule } from './canvas/entry.js';
import type { Translator } from './harness.js';

let engine: Promise<DesignCanvasModule> | null = null;

/**
 * Tell the engine module from an unknown import result.
 * @param value the imported module.
 * @returns whether it has the canvas export.
 */
function isEngine(value: unknown): value is DesignCanvasModule {
  if (value === null || typeof value !== 'object') return false;
  const fields: Record<string, unknown> = { ...value };
  return typeof fields['mountDesignCanvas'] === 'function';
}

/**
 * Load the canvas chunk once. The chunk is tiny; it fetches the engine ES module
 * from the asset route, which the module loader cannot evaluate itself.
 * @returns the chunk exports.
 */
async function loadEngine(): Promise<DesignCanvasModule> {
  engine ??= (async () => {
    const load = globalThis.__dshArtifactsRequireAsync;
    if (typeof load !== 'function') throw new Error('The canvas loader is unavailable.');
    const loaded: unknown = await load('./client.canvas.js');
    if (!isEngine(loaded)) throw new Error('The canvas engine did not load.');
    return loaded;
  })();
  engine.catch(() => {
    engine = null;
  });
  return engine;
}

type State = { status: 'loading' } | { status: 'ready' } | { status: 'failed'; message: string };

/** Props for the in-panel canvas. */
export interface DesignCanvasViewProps {
  t: Translator;
  source: string;
  revision: string;
  title: string;
  onChange(source: string): void;
  onSave(): void;
  /** The PNG preview, shown until the canvas is ready and if it fails. */
  fallback: ReactNode;
}

/**
 * An editable Design JSX canvas. The PNG stays visible until the engine has
 * drawn its first frame, and stays as the failure surface after that.
 * @param props the source, revision, and save callbacks.
 * @returns the canvas and its toolbar.
 */
export function DesignCanvasView({ t, source, revision, title, onChange, onSave, fallback }: DesignCanvasViewProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const handleRef = useRef<DesignCanvasHandle | null>(null);
  const lastEmitted = useRef(source);
  const callbacks = useRef({ onChange, onSave });
  callbacks.current = { onChange, onSave };
  const [state, setState] = useState<State>({ status: 'loading' });
  const [tool, setTool] = useState<CanvasTool>('select');
  const [attempt, setAttempt] = useState(0);
  const toolId = useId();

  useEffect(() => {
    const element = mountRef.current;
    if (element === null) return undefined;
    let cancelled = false;
    setState({ status: 'loading' });
    void (async () => {
      try {
        const module = await loadEngine();
        if (cancelled) return;
        const handle = await module.mountDesignCanvas({
          element,
          source: lastEmitted.current,
          onChange: (text) => {
            lastEmitted.current = text;
            callbacks.current.onChange(text);
          },
          onSave: () => callbacks.current.onSave(),
          onTool: setTool,
          onFailure: (message) => setState({ status: 'failed', message }),
        });
        if (cancelled) {
          handle.destroy();
          return;
        }
        handleRef.current = handle;
        setState({ status: 'ready' });
      } catch (error) {
        if (!cancelled) setState({ status: 'failed', message: error instanceof Error ? error.message : String(error) });
      }
    })();
    return () => {
      cancelled = true;
      handleRef.current?.destroy();
      handleRef.current = null;
    };
  }, [attempt]);

  // A new source from the host replaces the graph. Our own edits arrive here as
  // the draft we just serialized, so they are skipped.
  useEffect(() => {
    const handle = handleRef.current;
    if (handle === null || source === lastEmitted.current) return;
    lastEmitted.current = source;
    handle.setSource(source);
  }, [revision, source]);

  const call = useCallback((action: (handle: DesignCanvasHandle) => void) => {
    const handle = handleRef.current;
    if (handle !== null) action(handle);
  }, []);

  const ready = state.status === 'ready';
  const tools = [
    { value: 'select' as const, label: t('canvas.select') },
    { value: 'hand' as const, label: t('canvas.hand') },
    { value: 'frame' as const, label: t('canvas.frame') },
    { value: 'text' as const, label: t('canvas.text') },
  ];

  return (
    <div className="art-canvas">
      <div className="art-canvas-toolbar" role="toolbar" aria-label={t('canvas.toolbar')}>
        <SegmentedControl<CanvasTool>
          id={toolId}
          className="art-canvas-tools"
          label={t('canvas.tools')}
          value={tool}
          options={tools}
          disabled={!ready}
          onChange={(next) => {
            setTool(next);
            call((handle) => handle.setTool(next));
          }}
        />
        <Button size="sm" variant="outline" disabled={!ready} onClick={() => call((handle) => handle.undo())}>{t('canvas.undo')}</Button>
        <Button size="sm" variant="outline" disabled={!ready} onClick={() => call((handle) => handle.redo())}>{t('canvas.redo')}</Button>
        <Button size="sm" variant="outline" disabled={!ready} onClick={() => call((handle) => handle.zoomToFit())}>{t('canvas.fit')}</Button>
      </div>
      <div className="art-canvas-stage">
        <div className="art-canvas-mount" ref={mountRef} role="application" aria-label={title} tabIndex={0} hidden={state.status === 'failed'} data-ready={ready ? '1' : undefined} />
        {ready ? null : <div className="art-canvas-fallback">{fallback}</div>}
        {state.status === 'loading' ? <div className="art-canvas-loading" role="status">{t('canvas.loading')}</div> : null}
        {state.status === 'failed' ? (
          <div className="art-canvas-error" role="alert">
            <span>{t('canvas.failed')}</span>
            <span className="art-canvas-detail" title={state.message}>{state.message}</span>
            <Button size="sm" variant="outline" onClick={() => setAttempt((value) => value + 1)}>{t('action.retry')}</Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
