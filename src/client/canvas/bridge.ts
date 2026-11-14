import { defineComponent, h, onScopeDispose, watch } from 'vue';
import type { Component } from 'vue';
import { useAppearance, useLayerTree, usePosition, useTypography } from '@open-pencil/vue';
import type { Editor } from '@open-pencil/core/editor';
import type {
  CanvasProperties,
  CanvasSnapshot,
  CanvasTool,
  LayerRowView,
  PropertyKey,
  SelectedLayer,
} from './entry.js';

/** How a row click extends the current selection. */
export type SelectionMode = 'replace' | 'add' | 'range';

/** One layer type's localized name, resolved by the inspector. */
const CANVAS_TOOLS: Readonly<Record<string, CanvasTool>> = {
  SELECT: 'select',
  HAND: 'hand',
  FRAME: 'frame',
  TEXT: 'text',
};

/** An empty snapshot, used before the Vue bridge has mounted. */
export const EMPTY_SNAPSHOT: CanvasSnapshot = {
  selection: [],
  rows: [],
  properties: { ids: [], name: null, type: null, x: null, y: null, width: null, height: null, rotation: null, radius: null, opacity: null, visible: null, text: null },
  isText: false,
  canUndo: false,
  canRedo: false,
  zoom: 1,
  tool: 'select',
  fit: true,
};

/**
 * Turn a selected canvas value into a number, or null when the selection disagrees.
 * @param value the composable's value, which may be the mixed marker.
 * @returns the number or null.
 */
function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' ? value : null;
}

/** What the React inspector can ask of the mounted canvas. */
export interface CanvasBridge {
  component: Component;
  snapshot(): CanvasSnapshot;
  subscribe(listener: (snapshot: CanvasSnapshot) => void): () => void;
  notify(): void;
  select(id: string, mode: SelectionMode): void;
  clearSelection(): void;
  toggleExpand(id: string): void;
  toggleVisibility(id: string): void;
  toggleLock(id: string): void;
  rename(id: string, name: string): void;
  setVisible(visible: boolean): void;
  preview(prop: PropertyKey, value: number): void;
  commit(prop: PropertyKey, value: number, previous: number): void;
  setFamily(family: string): void;
  setWeight(weight: number): void;
  dispose(): void;
}

/**
 * Provide the React inspector with a plain snapshot of the Vue editor and a
 * small set of mutations. The Vue composables only exist inside their provider
 * tree, so a hidden component reads them and hands the results out through this
 * object.
 * @param editor the mounted editor.
 * @param toolFor the panel tool the editor is showing.
 * @param isFit whether the last zoom action was a fit.
 * @returns the bridge, whose component must render inside LayerTreeRoot.
 */
export function createCanvasBridge(editor: Editor, toolFor: (tool: string) => CanvasTool, isFit: () => boolean): CanvasBridge {
  const listeners = new Set<(snapshot: CanvasSnapshot) => void>();
  let current = EMPTY_SNAPSHOT;
  let scheduled = false;
  let ready = false;
  let mounted: {
    tree: ReturnType<typeof useLayerTree>;
    position: ReturnType<typeof usePosition>;
    appearance: ReturnType<typeof useAppearance>;
    typography: ReturnType<typeof useTypography>;
  } | null = null;

  const build = (): CanvasSnapshot => {
    if (mounted === null) return EMPTY_SNAPSHOT;
    const { tree, position, appearance, typography } = mounted;
    const nodes = editor.getSelectedNodes();
    const pageId = editor.state.currentPageId;
    const selection: SelectedLayer[] = nodes.map((node) => {
      const parent = node.parentId === null || node.parentId === pageId ? undefined : editor.graph.getNode(node.parentId);
      return { id: node.id, name: node.name, type: node.type, parentName: parent?.name ?? '' };
    });
    const rows: LayerRowView[] = tree.visibleRows.value.map((row) => ({
      id: row.node.id,
      name: row.node.name,
      type: row.node.type,
      level: row.level,
      hasChildren: row.hasChildren,
      expanded: tree.expanded.value.includes(row.node.id),
      visible: row.node.visible,
      locked: row.node.locked,
      selected: tree.selectedIds.value.has(row.node.id),
    }));
    const primary = position.node.value ?? position.nodes.value[0];
    const properties: CanvasProperties = {
      ids: [...position.ids.value],
      name: primary?.name ?? null,
      type: primary?.type ?? null,
      x: numberOrNull(position.prop('x').value),
      y: numberOrNull(position.prop('y').value),
      width: numberOrNull(position.prop('width').value),
      height: numberOrNull(position.prop('height').value),
      rotation: numberOrNull(position.prop('rotation').value),
      radius: numberOrNull(appearance.cornerRadiusValue.value),
      opacity: numberOrNull(appearance.opacityPercent.value),
      visible: appearance.visibilityState.value === 'mixed' ? null : appearance.visibilityState.value === 'visible',
      text: typography.node.value?.type === 'TEXT'
        ? { family: typography.fontFamily.value, weight: typography.fontWeight.value, fontSize: typography.fontSize.value }
        : null,
    };
    const selectionText = nodes.length === 1 && nodes[0]?.type === 'TEXT';
    return {
      selection,
      rows,
      properties,
      isText: selectionText,
      canUndo: editor.undo.canUndo,
      canRedo: editor.undo.canRedo,
      zoom: editor.state.zoom,
      tool: toolFor(editor.state.activeTool),
      fit: isFit(),
    };
  };

  const emit = (): void => {
    current = build();
    for (const listener of listeners) listener(current);
  };

  const schedule = (): void => {
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(() => {
      scheduled = false;
      emit();
    });
  };

  const stopEvents = [
    editor.onEditorEvent('history:changed', schedule),
    editor.onEditorEvent('selection:changed', schedule),
    editor.onEditorEvent('viewport:changed', schedule),
    editor.onEditorEvent('tool:changed', schedule),
    editor.onEditorEvent('node:updated', schedule),
    editor.onEditorEvent('node:previewUpdated', schedule),
    editor.onEditorEvent('graph:replaced', schedule),
    editor.onEditorEvent('page:changed', schedule),
  ];

  const Bridge = defineComponent({
    name: 'DesignInspectorBridge',
    setup() {
      const tree = useLayerTree();
      const position = usePosition();
      const appearance = useAppearance();
      const typography = useTypography();
      mounted = { tree, position, appearance, typography };
      const stopWatch = watch(
        () => [
          tree.treeVersion.value,
          tree.expanded.value.join(','),
          [...tree.selectedIds.value].join(','),
          position.prop('x').value,
          position.prop('y').value,
          position.prop('width').value,
          position.prop('height').value,
          position.prop('rotation').value,
          appearance.opacityPercent.value,
          appearance.cornerRadiusValue.value,
          appearance.visibilityState.value,
          typography.fontFamily.value,
          typography.fontWeight.value,
          typography.fontSize.value,
        ],
        schedule,
        { flush: 'post' },
      );
      onScopeDispose(stopWatch);
      ready = true;
      schedule();
      return () => null;
    },
  });

  return {
    component: Bridge,
    snapshot: () => {
      if (ready) current = build();
      return current;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    notify: schedule,
    select(id, mode) {
      mounted?.tree.select(id, { additive: mode === 'add', range: mode === 'range' });
    },
    clearSelection() {
      editor.clearSelection();
    },
    toggleExpand(id) {
      mounted?.tree.toggleExpand(id);
    },
    toggleVisibility(id) {
      mounted?.tree.toggleVisibility(id);
    },
    toggleLock(id) {
      mounted?.tree.toggleLock(id);
    },
    rename(id, name) {
      mounted?.tree.rename(id, name);
    },
    setVisible(visible) {
      const ids = [...editor.state.selectedIds];
      if (ids.length === 0) return;
      editor.undo.runBatch('Change visibility', () => {
        for (const id of ids) editor.updateNodeWithUndo(id, { visible }, 'Change visibility');
      });
    },
    preview(prop, value) {
      if (mounted === null) return;
      if (prop === 'radius') mounted.appearance.updateUniformRadius(value);
      else if (prop === 'opacity') mounted.appearance.updateProp('opacityPercent', value);
      else if (prop === 'fontSize') mounted.typography.updateProp('fontSize', value);
      else mounted.position.updateProp(prop, value);
    },
    commit(prop, value, previous) {
      if (mounted === null) return;
      if (prop === 'radius') {
        mounted.appearance.updateUniformRadius(value);
        mounted.appearance.commitUniformRadius();
      } else if (prop === 'opacity') mounted.appearance.commitProp('opacityPercent', value, previous);
      else if (prop === 'fontSize') mounted.typography.commitProp('fontSize', value, previous);
      else mounted.position.commitProp(prop, value, previous);
    },
    setFamily(family) {
      void mounted?.typography.setFamily(family);
    },
    setWeight(weight) {
      void mounted?.typography.setWeight(weight);
    },
    dispose() {
      for (const stop of stopEvents) stop();
      listeners.clear();
      mounted = null;
      ready = false;
    },
  };
}
