import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import {
  Button,
  TextShimmer,
  Tooltip,
  ZoomControls,
} from '@deepseek-ai/dsh-client-ui-primitives';
import type { CanvasMode, CanvasSnapshot, CanvasTool, DesignCanvasHandle, DesignCanvasModule, SelectedLayer } from './canvas/entry.js';
import type { Translator } from './harness.js';
import { IconCursor, IconFrame, IconHand, IconRedo, IconText, IconUndo } from './icons.jsx';

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

type State = { status: 'loading' } | { status: 'ready' } | { status: 'failed' };

/** Props for the in-panel canvas. */
export interface DesignCanvasViewProps {
  t: Translator;
  source: string;
  revision: string;
  title: string;
  mode: CanvasMode;
  onChange(source: string): void;
  onSave(): void;
  onFailure(message: string | null): void;
  onHandle(handle: DesignCanvasHandle | null): void;
  onSelection(selection: SelectedLayer[]): void;
  /** Changes to remount a failed canvas. */
  attempt: number;
  /** The PNG preview, shown until the canvas is ready and if it fails. */
  fallback: ReactNode;
}

/** One dock tool: its label, glyph, and snapshot value. */
const TOOLS: ReadonlyArray<{ value: CanvasTool; label: string; icon: ReactNode }> = [
  { value: 'select', label: 'canvas.select', icon: <IconCursor size={16} /> },
  { value: 'hand', label: 'canvas.hand', icon: <IconHand size={16} /> },
  { value: 'frame', label: 'canvas.frame', icon: <IconFrame size={16} /> },
  { value: 'text', label: 'canvas.text', icon: <IconText size={16} /> },
];

/**
 * The canvas and its floating dock. The PNG stays visible until the engine has
 * drawn its first frame; after a failure the tab shows the bar that owns Retry.
 * @param props the source, revision, mode, and callbacks.
 * @returns the canvas, dock, and stage overlays.
 */
export function DesignCanvasView({ t, source, revision, title, mode, onChange, onSave, onFailure, onHandle, onSelection, attempt, fallback }: DesignCanvasViewProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const handleRef = useRef<DesignCanvasHandle | null>(null);
  const lastEmitted = useRef(source);
  const callbacks = useRef({ onChange, onSave, onFailure, onHandle, onSelection });
  callbacks.current = { onChange, onSave, onFailure, onHandle, onSelection };
  const [state, setState] = useState<State>({ status: 'loading' });
  const [snapshot, setSnapshot] = useState<CanvasSnapshot | null>(null);

  useEffect(() => {
    const element = mountRef.current;
    if (element === null) return undefined;
    let cancelled = false;
    let stop: (() => void) | null = null;
    setState({ status: 'loading' });
    setSnapshot(null);
    void (async () => {
      try {
        const module = await loadEngine();
        if (cancelled) return;
        const handle = await module.mountDesignCanvas({
          element,
          source: lastEmitted.current,
          mode,
          onChange: (text) => {
            lastEmitted.current = text;
            callbacks.current.onChange(text);
          },
          onSave: () => callbacks.current.onSave(),
          onFailure: (message) => {
            setState({ status: 'failed' });
            callbacks.current.onFailure(message);
          },
          t,
        });
        if (cancelled) {
          handle.destroy();
          return;
        }
        handleRef.current = handle;
        callbacks.current.onFailure(null);
        callbacks.current.onHandle(handle);
        setState({ status: 'ready' });
        const initial = handle.getSnapshot();
        setSnapshot(initial);
        callbacks.current.onSelection(initial.selection);
        stop = handle.subscribe((next) => {
          setSnapshot(next);
          callbacks.current.onSelection(next.selection);
        });
      } catch (error) {
        if (!cancelled) {
          setState({ status: 'failed' });
          callbacks.current.onFailure(error instanceof Error ? error.message : String(error));
        }
      }
    })();
    return () => {
      cancelled = true;
      stop?.();
      handleRef.current?.destroy();
      handleRef.current = null;
      callbacks.current.onHandle(null);
    };
    // The engine is remounted only for a fresh attempt; mode and source changes go through the handle.
  }, [attempt]);

  // A new source from the host replaces the graph. Our own edits arrive here as
  // the draft we just serialized, so they are skipped.
  useEffect(() => {
    const handle = handleRef.current;
    if (handle === null || source === lastEmitted.current) return;
    lastEmitted.current = source;
    handle.setSource(source);
  }, [revision, source]);

  useEffect(() => {
    handleRef.current?.setMode(mode);
  }, [mode]);

  const ready = state.status === 'ready';
  const tools = TOOLS.map((tool) => (
    <Tooltip key={tool.value} label={t(tool.label)} side="top" portal>
      <Button
        size="sm"
        className="art-dock-button"
        aria-label={t(tool.label)}
        aria-pressed={snapshot?.tool === tool.value}
        onClick={() => handleRef.current?.setTool(tool.value)}
      >
        {tool.icon}
      </Button>
    </Tooltip>
  ));

  return (
    <div className="art-canvas">
      <div className="art-canvas-stage">
        <div className="art-canvas-mount" ref={mountRef} role="application" aria-label={title} tabIndex={0} hidden={state.status === 'failed'} data-ready={ready ? '1' : undefined} />
        {ready ? null : <div className="art-canvas-fallback">{fallback}</div>}
        {state.status === 'loading' ? <div className="art-canvas-opening" role="status"><TextShimmer active>{t('canvas.opening')}</TextShimmer></div> : null}
        {ready && snapshot !== null && snapshot.rows.length === 0 ? <p className="art-canvas-empty">{t('canvas.empty')}</p> : null}
        {ready ? (
          <div className="art-canvas-dock" role="toolbar" aria-label={t('canvas.toolbar')}>
            {mode === 'edit' ? (
              <>
                {tools}
                <span className="art-dock-divider" aria-hidden="true" />
                <Tooltip label={t('canvas.undo')} side="top" portal>
                  <Button size="sm" className="art-dock-button" aria-label={t('canvas.undo')} disabled={snapshot?.canUndo === false} onClick={() => handleRef.current?.undo()}>
                    <IconUndo size={16} />
                  </Button>
                </Tooltip>
                <Tooltip label={t('canvas.redo')} side="top" portal>
                  <Button size="sm" className="art-dock-button" aria-label={t('canvas.redo')} disabled={snapshot?.canRedo === false} onClick={() => handleRef.current?.redo()}>
                    <IconRedo size={16} />
                  </Button>
                </Tooltip>
                <span className="art-dock-divider" aria-hidden="true" />
              </>
            ) : null}
            <ZoomControls
              className="art-dock-zoom"
              zoom={snapshot?.zoom ?? 1}
              fit={{ label: t('canvas.fit'), selected: snapshot?.fit ?? false, onSelect: () => handleRef.current?.zoomToFit() }}
              labels={{
                controls: t('canvas.zoomControls'),
                out: t('canvas.zoomOut'),
                into: t('canvas.zoomIn'),
                menu: t('canvas.zoomMenu'),
                value: (percent) => t('canvas.zoomValue', { percent }),
              }}
              visible={ready}
              onZoom={(zoom) => handleRef.current?.setZoom(zoom)}
              onActiveChange={() => undefined}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}
