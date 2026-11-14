import { defineComponent, h } from 'vue';
import { useCanvasContext, useCanvasInput, useEditor } from '@open-pencil/vue';

/**
 * The canvas element and its pointer and text input. The SDK's headless
 * `CanvasSurface` draws but does not wire input, so the editor shell owns it.
 */
export const CanvasSurface = defineComponent({
  name: 'DesignCanvasSurface',
  setup() {
    const editor = useEditor();
    const context = useCanvasContext();
    useCanvasInput(
      context.canvasRef,
      editor,
      context.hitTestSectionTitle,
      context.hitTestComponentLabel,
      context.hitTestFrameTitle,
    );
    return () =>
      h('canvas', {
        ref: (element: unknown) => {
          context.canvasRef.value = element as HTMLCanvasElement | null;
        },
        style: 'display:block;width:100%;height:100%;outline:none',
      });
  },
});
