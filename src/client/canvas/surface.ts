import { defineComponent, h } from 'vue';
import { useCanvasContext, useCanvasInput, useEditor } from '@open-pencil/vue';
import type { CanvasMode } from './entry.js';

/** The pan drag the view surface runs itself, since the engine keeps no read-only input path. */
interface PanDrag {
  startX: number;
  startY: number;
  panX: number;
  panY: number;
}

/**
 * The canvas element and its pointer and text input. The SDK's headless
 * CanvasSurface draws but does not wire input, so the editor shell owns it.
 * In View the engine's input is disabled and this surface keeps only click
 * selection and panning; wheel zoom and pan stay with the engine's canvas
 * listener, which is always mounted.
 */
export const CanvasSurface = defineComponent({
  name: 'DesignCanvasSurface',
  props: {
    mode: { type: String as () => CanvasMode, default: 'edit' as CanvasMode },
  },
  setup(props) {
    const editor = useEditor();
    const context = useCanvasContext();
    useCanvasInput(
      context.canvasRef,
      editor,
      context.hitTestSectionTitle,
      context.hitTestComponentLabel,
      context.hitTestFrameTitle,
      undefined,
      undefined,
      () => props.mode === 'edit',
    );
    let pan: PanDrag | null = null;

    /**
     * The canvas and graph coordinates of a pointer event.
     * @param event the mouse event.
     * @returns screen and canvas coordinates, or null before the canvas exists.
     */
    const coords = (event: MouseEvent): { sx: number; sy: number; cx: number; cy: number } | null => {
      const canvas = context.canvasRef.value;
      if (canvas === null) return null;
      const rect = canvas.getBoundingClientRect();
      const sx = event.clientX - rect.left;
      const sy = event.clientY - rect.top;
      const point = editor.screenToCanvas(sx, sy);
      return { sx, sy, cx: point.x, cy: point.y };
    };

    const onMouseDown = (event: MouseEvent): void => {
      if (props.mode !== 'view') return;
      const point = coords(event);
      if (point === null) return;
      if (event.button === 1) {
        event.preventDefault();
        pan = { startX: event.clientX, startY: event.clientY, panX: editor.state.panX, panY: editor.state.panY };
        return;
      }
      if (event.button !== 0) return;
      const hit = editor.hitTestAtPoint(point.cx, point.cy);
      if (hit !== null) {
        editor.select([hit.id], event.shiftKey || event.metaKey || event.ctrlKey);
        return;
      }
      editor.clearSelection();
      pan = { startX: event.clientX, startY: event.clientY, panX: editor.state.panX, panY: editor.state.panY };
    };

    const onMouseMove = (event: MouseEvent): void => {
      if (pan === null) return;
      editor.state.panX = pan.panX + (event.clientX - pan.startX);
      editor.state.panY = pan.panY + (event.clientY - pan.startY);
      editor.requestRepaint();
    };

    const onMouseUp = (): void => {
      pan = null;
    };

    return () =>
      h('canvas', {
        ref: (element: unknown) => {
          context.canvasRef.value = element as HTMLCanvasElement | null;
        },
        style: 'display:block;width:100%;height:100%;outline:none',
        onMousedown: onMouseDown,
        onMousemove: onMouseMove,
        onMouseup: onMouseUp,
        onMouseleave: onMouseUp,
        onDblclick: (event: MouseEvent) => {
          if (props.mode === 'view') event.preventDefault();
        },
      });
  },
});
