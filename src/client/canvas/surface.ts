import { defineComponent, h, onBeforeUnmount, onMounted, ref } from 'vue';
import { useCanvasContext, useCanvasInput, useEditor, useTextEdit } from '@open-pencil/vue';
import type { CanvasMode } from './entry.js';
import { wheelZoom } from './zoom.js';

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
 * selection and panning; a double click never reaches the engine there,
 * because the engine's dblclick handler ignores the enabled flag and would
 * still rename or start a text edit. Plain wheel panning stays with the
 * engine's canvas listener; Ctrl or Cmd wheel zooming is caught here first,
 * because the engine applies four times the scale of one notch.
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
    useTextEdit(context.canvasRef, editor, { isEnabled: () => props.mode === 'edit' });
    let pan: PanDrag | null = null;
    const host = ref<HTMLDivElement | null>(null);

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

    /**
     * Zoom on Ctrl or Cmd wheel, and keep the event from the engine's own zoom step.
     * Capture on the wrapper runs before the canvas listener, which the stop prevents.
     * @param event the wheel event.
     */
    const onWheel = (event: WheelEvent): void => {
      if (!event.ctrlKey && !event.metaKey) return;
      const canvas = context.canvasRef.value;
      if (canvas === null) return;
      event.preventDefault();
      event.stopPropagation();
      const rect = canvas.getBoundingClientRect();
      const zoom = wheelZoom(editor.state.zoom, event.deltaY, event.deltaMode);
      editor.setZoomAroundPoint(zoom, event.clientX - rect.left, event.clientY - rect.top);
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

    /**
     * Keep double clicks from the engine outside Edit: the capture on the
     * wrapper runs before the canvas target listeners, so a View double click
     * can neither rename a label nor open a text edit.
     */
    const onDblClick = (event: MouseEvent): void => {
      if (props.mode !== 'edit') event.stopPropagation();
    };

    onMounted(() => {
      host.value?.addEventListener('wheel', onWheel, { capture: true, passive: false });
      host.value?.addEventListener('dblclick', onDblClick, { capture: true });
    });
    onBeforeUnmount(() => {
      host.value?.removeEventListener('wheel', onWheel, true);
      host.value?.removeEventListener('dblclick', onDblClick, true);
    });

    return () =>
      h('div', { class: 'op-surface', ref: host }, [
        h('canvas', {
          ref: (element: unknown) => {
            context.canvasRef.value = element as HTMLCanvasElement | null;
          },
          style: 'display:block;width:100%;height:100%;outline:none',
          onMousedown: onMouseDown,
          onMousemove: onMouseMove,
          onMouseup: onMouseUp,
          onMouseleave: onMouseUp,
        }),
      ]);
  },
});
