import { computed, defineComponent, h, ref, watch } from 'vue';
import type { PropType } from 'vue';
import { LayerTreeRoot, MIXED, useAppearance, useLayerTree, usePosition, useTypography } from '@open-pencil/vue';

/** The translator the tab passes into the chunk. */
type Translate = (key: string) => string;

/** One row the layer tree renders. */
interface RowShape {
  node: { id: string; name: string; visible: boolean; locked: boolean };
  level: number;
  hasChildren: boolean;
}

/** The slot the layer tree fills. */
interface TreeSlot {
  visibleRows: RowShape[];
  expanded: string[];
  selectedIds: Set<string>;
}

/** An inline 16px stroke glyph, so the rail needs no icon font. */
function glyph(paths: string[], rotate = false): ReturnType<typeof h> {
  return h(
    'svg',
    { class: 'op-glyph', viewBox: '0 0 16 16', width: 12, height: 12, 'aria-hidden': 'true', style: rotate ? 'transform:rotate(90deg)' : undefined },
    paths.map((d) => h('path', { d, fill: 'none', stroke: 'currentColor', 'stroke-width': 1.4, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' })),
  );
}

const CHEVRON = ['M6 3l5 5-5 5'];
const EYE = ['M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8Z', 'M8 6.3a1.7 1.7 0 1 0 0 3.4 1.7 1.7 0 0 0 0-3.4Z'];
const EYE_OFF = ['M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8Z', 'M2.5 2.5l11 11'];
const LOCK_CLOSED = ['M4.5 7V5a3.5 3.5 0 0 1 7 0v2', 'M3.5 7h9v6.5h-9z'];
const LOCK_OPEN = ['M4.5 7V5a3.5 3.5 0 0 1 6.5-1.6', 'M3.5 7h9v6.5h-9z'];

/**
 * A numeric field that previews on input and commits on change or blur. The
 * previous value travels with the commit, so the edit is one undo entry.
 */
const NumberField = defineComponent({
  props: {
    t: { type: Function as PropType<Translate>, required: true },
    label: { type: String, required: true },
    value: { type: Number, required: true },
    mixed: { type: Boolean, default: false },
    min: { type: Number, default: undefined },
    max: { type: Number, default: undefined },
    step: { type: Number, default: 1 },
    apply: { type: Function as PropType<(value: number) => void>, required: true },
    commit: { type: Function as PropType<(value: number, previous: number) => void>, required: true },
  },
  setup(props) {
    const draft = ref('');
    const focused = ref(false);
    let previous = 0;
    watch(
      () => [props.value, props.mixed],
      () => {
        if (!focused.value) draft.value = props.mixed ? '' : String(props.value);
      },
      { immediate: true },
    );
    const restore = (): void => {
      draft.value = props.mixed ? '' : String(props.value);
    };
    const finish = (): void => {
      focused.value = false;
      const next = Number(draft.value);
      if (draft.value.trim() === '' || !Number.isFinite(next)) {
        restore();
        return;
      }
      props.commit(next, previous);
    };
    return () =>
      h('label', { class: ['op-field', props.mixed ? 'is-mixed' : ''] }, [
        h('span', { class: 'op-field-label' }, props.label),
        h('input', {
          type: 'number',
          min: props.min,
          max: props.max,
          step: props.step,
          value: draft.value,
          placeholder: props.mixed ? props.t('panel.mixed') : undefined,
          onFocus: () => {
            focused.value = true;
            previous = props.mixed ? 0 : props.value;
            draft.value = props.mixed ? '' : String(props.value);
          },
          onInput: (event: Event) => {
            draft.value = (event.target as HTMLInputElement).value;
            const next = Number(draft.value);
            if (Number.isFinite(next)) props.apply(next);
          },
          onChange: finish,
          onBlur: finish,
          onKeydown: (event: KeyboardEvent) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              (event.target as HTMLInputElement).blur();
            }
            if (event.key === 'Escape') {
              restore();
              (event.target as HTMLInputElement).blur();
            }
          },
        }),
      ]);
  },
});

/**
 * One layer row. It reads the tree context the root provides, so visibility,
 * lock, rename, and selection stay in the SDK's own state.
 */
const LayerRow = defineComponent({
  props: {
    t: { type: Function as PropType<Translate>, required: true },
    row: { type: Object as PropType<RowShape>, required: true },
  },
  setup(props) {
    const tree = useLayerTree();
    const renaming = ref(false);
    const draft = ref('');
    const selected = computed(() => tree.selectedIds.value.has(props.row.node.id));
    const expanded = computed(() => tree.expanded.value.includes(props.row.node.id));
    const commitRename = (): void => {
      if (!renaming.value) return;
      renaming.value = false;
      const name = draft.value.trim();
      if (name !== '' && name !== props.row.node.name) tree.rename(props.row.node.id, name);
    };
    const additive = (event: MouseEvent) => {
      if (event.shiftKey) return { additive: true, range: true };
      if (event.metaKey || event.ctrlKey) return { additive: true, range: false };
      return { additive: false, range: false };
    };
    return () =>
      h(
        'div',
        {
          class: ['op-layer-row', selected.value ? 'is-selected' : ''],
          style: 'padding-left:' + ((props.row.level - 1) * 12 + 6) + 'px',
          role: 'treeitem',
          'aria-selected': selected.value ? 'true' : 'false',
          'aria-level': props.row.level,
          'aria-expanded': props.row.hasChildren ? (expanded.value ? 'true' : 'false') : undefined,
          ref: (element: unknown) => tree.setRowRef(props.row.node.id, element as HTMLElement | null),
          onClick: (event: MouseEvent) => tree.select(props.row.node.id, additive(event)),
          onDblclick: () => {
            draft.value = props.row.node.name;
            renaming.value = true;
          },
        },
        [
          props.row.hasChildren
            ? h(
                'button',
                {
                  class: 'op-layer-caret',
                  'aria-label': props.t(expanded.value ? 'panel.collapse' : 'panel.expand'),
                  onClick: (event: MouseEvent) => {
                    event.stopPropagation();
                    tree.toggleExpand(props.row.node.id);
                  },
                },
                glyph(CHEVRON, expanded.value),
              )
            : h('span', { class: 'op-layer-caret' }),
          renaming.value
            ? h('input', {
                class: 'op-layer-rename',
                value: draft.value,
                'aria-label': props.t('panel.rename'),
                onInput: (event: Event) => {
                  draft.value = (event.target as HTMLInputElement).value;
                },
                onBlur: commitRename,
                onClick: (event: MouseEvent) => event.stopPropagation(),
                onKeydown: (event: KeyboardEvent) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    commitRename();
                  } else if (event.key === 'Escape') {
                    renaming.value = false;
                  }
                },
              })
            : h('span', { class: 'op-layer-name', title: props.row.node.name }, props.row.node.name),
          h('span', { class: 'op-layer-actions' }, [
            h(
              'button',
              {
                class: 'op-icon-button',
                'aria-label': props.t(props.row.node.visible ? 'panel.hide' : 'panel.show'),
                'aria-pressed': props.row.node.visible ? 'true' : 'false',
                onClick: (event: MouseEvent) => {
                  event.stopPropagation();
                  tree.toggleVisibility(props.row.node.id);
                },
              },
              glyph(props.row.node.visible ? EYE : EYE_OFF),
            ),
            h(
              'button',
              {
                class: 'op-icon-button',
                'aria-label': props.t(props.row.node.locked ? 'panel.unlock' : 'panel.lock'),
                'aria-pressed': props.row.node.locked ? 'true' : 'false',
                onClick: (event: MouseEvent) => {
                  event.stopPropagation();
                  tree.toggleLock(props.row.node.id);
                },
              },
              glyph(props.row.node.locked ? LOCK_CLOSED : LOCK_OPEN),
            ),
          ]),
        ],
      );
  },
});

/** The layer tree for the page, with selection, expand, visibility, lock, and rename. */
const LayerList = defineComponent({
  props: { t: { type: Function as PropType<Translate>, required: true } },
  setup(props) {
    return () =>
      h(
        LayerTreeRoot,
        { class: 'op-layer-tree', indentPerLevel: 12 },
        {
          default: (slot: TreeSlot) =>
            slot.visibleRows.length === 0
              ? h('p', { class: 'op-panel-empty' }, props.t('panel.none'))
              : h('div', { class: 'op-layer-list', role: 'tree' }, slot.visibleRows.map((row) => h(LayerRow, { key: row.node.id, row, t: props.t }))),
        },
      );
  },
});

/** The properties of the selection: geometry, appearance, and text basics. */
const Properties = defineComponent({
  props: { t: { type: Function as PropType<Translate>, required: true } },
  setup(props) {
    const position = usePosition();
    const appearance = useAppearance();
    const typography = useTypography();
    const count = computed(() => position.ids.value.length);
    const node = computed(() => position.node.value);
    const isText = computed(() => position.isMulti.value === false && node.value !== null && String(node.value.type) === 'TEXT');
    const opacity = computed(() => appearance.opacityPercent.value);
    const radius = computed(() => appearance.cornerRadiusValue.value);
    const visibility = computed(() => appearance.visibilityState.value);
    const field = (label: string, key: 'x' | 'y' | 'width' | 'height' | 'rotation') => {
      const current = position.prop(key).value;
      const mixed = current === MIXED;
      return h(NumberField, {
        t: props.t,
        label: props.t(label),
        value: mixed ? 0 : current,
        mixed,
        apply: (value: number) => position.updateProp(key, value),
        commit: (value: number, previous: number) => position.commitProp(key, value, previous),
      });
    };
    return () => {
      if (count.value === 0) return h('p', { class: 'op-panel-empty' }, props.t('panel.empty'));
      const state = visibility.value;
      const radiusValue = radius.value;
      const radiusMixed = radiusValue === MIXED;
      const opacityValue = opacity.value;
      const opacityMixed = opacityValue === MIXED;
      const children = [
        h('p', { class: 'op-panel-node', title: node.value?.name }, node.value?.name ?? ''),
        h('div', { class: 'op-field-grid' }, [
          field('panel.x', 'x'),
          field('panel.y', 'y'),
          field('panel.width', 'width'),
          field('panel.height', 'height'),
          field('panel.rotation', 'rotation'),
        ]),
        h(NumberField, {
          t: props.t,
          label: props.t('panel.radius'),
          value: radiusMixed ? 0 : radiusValue,
          mixed: radiusMixed,
          min: 0,
          apply: (value: number) => appearance.updateUniformRadius(value),
          commit: (value: number) => {
            appearance.updateUniformRadius(value);
            appearance.commitUniformRadius();
          },
        }),
        h(NumberField, {
          t: props.t,
          label: props.t('panel.opacity'),
          value: opacityMixed ? 0 : opacityValue,
          mixed: opacityMixed,
          min: 0,
          max: 100,
          apply: (value: number) => appearance.updateProp('opacityPercent', value),
          commit: (value: number, previous: number) => appearance.commitProp('opacityPercent', value, previous),
        }),
        h(
          'button',
          {
            class: 'op-panel-toggle',
            'aria-pressed': state === 'visible' ? 'true' : 'false',
            onClick: () => appearance.toggleVisibility(),
          },
          props.t(state === 'visible' ? 'panel.visible' : state === 'hidden' ? 'panel.hidden' : 'panel.mixed'),
        ),
      ];
      if (isText.value) {
        children.push(
          h('div', { class: 'op-field' }, [
            h('span', { class: 'op-field-label' }, props.t('panel.family')),
            h(
              'select',
              {
                value: typography.fontFamily.value,
                onChange: (event: Event) => {
                  void typography.setFamily((event.target as HTMLSelectElement).value);
                },
              },
              ['Inter', 'Roboto', 'Noto Naskh Arabic'].map((family) => h('option', { value: family, selected: typography.fontFamily.value === family }, family)),
            ),
          ]),
          h('div', { class: 'op-field' }, [
            h('span', { class: 'op-field-label' }, props.t('panel.weight')),
            h(
              'select',
              {
                value: String(typography.fontWeight.value),
                onChange: (event: Event) => {
                  void typography.setWeight(Number((event.target as HTMLSelectElement).value));
                },
              },
              [400, 500, 600, 700].map((weight) => h('option', { value: String(weight), selected: typography.fontWeight.value === weight }, String(weight))),
            ),
          ]),
          h(NumberField, {
            t: props.t,
            label: props.t('panel.fontSize'),
            value: typography.fontSize.value,
            mixed: false,
            min: 1,
            apply: (value: number) => typography.updateProp('fontSize', value),
            commit: (value: number, previous: number) => typography.commitProp('fontSize', value, previous),
          }),
        );
      }
      return h('div', { class: 'op-properties' }, children);
    };
  },
});

/** The rail inside the canvas: layers and the selection's properties. */
export const DesignPanels = defineComponent({
  props: { t: { type: Function as PropType<Translate>, required: true } },
  setup(props) {
    return () =>
      h('aside', { class: 'op-panels', 'aria-label': props.t('panel.rail') }, [
        h('section', { class: 'op-panel op-panel-layers' }, [
          h('h2', { class: 'op-panel-title' }, props.t('panel.layers')),
          h(LayerList, { t: props.t }),
        ]),
        h('section', { class: 'op-panel op-panel-properties' }, [
          h('h2', { class: 'op-panel-title' }, props.t('panel.properties')),
          h(Properties, { t: props.t }),
        ]),
      ]);
  },
});
