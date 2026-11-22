import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';
import {
  Button,
  IconChevronDownOutlineRegular,
  IconChevronRightOutlineRegular,
  Input,
  Switch,
} from '@deepseek-ai/dsh-client-ui-primitives';
import type { CanvasSnapshot, DesignCanvasHandle, LayerRowView, PropertyKey } from './canvas/entry.js';
import type { Translator } from './harness.js';
import {
  IconEye,
  IconEyeOff,
  IconLayerFrame,
  IconLayerGroup,
  IconLayerShape,
  IconLayerText,
  IconLock,
  IconLockOpen,
} from './icons.jsx';

/** The inspector's two tabs. */
export type InspectorTab = 'layers' | 'properties';

/** The text face and weight lists the bundled engine can draw. */
const FAMILIES: readonly string[] = ['Inter', 'Roboto', 'Noto Naskh Arabic'];
const WEIGHTS: readonly number[] = [400, 500, 600, 700];

/**
 * The glyph for one layer type.
 * @param type the engine's node type.
 * @returns the icon.
 */
export function layerGlyph(type: string): ReactNode {
  switch (type) {
    case 'FRAME':
    case 'SECTION':
      return <IconLayerFrame size={14} />;
    case 'TEXT':
      return <IconLayerText size={14} />;
    case 'GROUP':
    case 'COMPONENT':
    case 'COMPONENT_SET':
    case 'INSTANCE':
      return <IconLayerGroup size={14} />;
    default:
      return <IconLayerShape size={14} />;
  }
}

/**
 * The localized name of a layer type.
 * @param t the translator.
 * @param type the engine's node type.
 * @returns the label.
 */
export function layerTypeLabel(t: Translator, type: string): string {
  switch (type) {
    case 'FRAME':
      return t('layer.type.frame');
    case 'SECTION':
      return t('layer.type.section');
    case 'TEXT':
      return t('layer.type.text');
    case 'RECTANGLE':
      return t('layer.type.rectangle');
    case 'ELLIPSE':
      return t('layer.type.ellipse');
    case 'LINE':
      return t('layer.type.line');
    case 'VECTOR':
    case 'STAR':
    case 'POLYGON':
      return t('layer.type.vector');
    case 'GROUP':
      return t('layer.type.group');
    case 'COMPONENT':
    case 'COMPONENT_SET':
      return t('layer.type.component');
    case 'INSTANCE':
      return t('layer.type.instance');
    default:
      return t('layer.type.other');
  }
}

/** A numeric field that previews while typing and commits once on Enter or blur. */
function NumberField({ t, label, value, mixed, min, max, step = 1, onPreview, onCommit }: {
  t: Translator;
  label: string;
  value: number | null;
  mixed: boolean;
  min?: number;
  max?: number;
  step?: number;
  onPreview(value: number): void;
  onCommit(value: number, previous: number): void;
}) {
  const [draft, setDraft] = useState('');
  const focused = useRef(false);
  const previous = useRef(0);
  const changed = useRef(false);
  const skipBlur = useRef(false);
  const shown = value === null ? '' : String(value);

  useEffect(() => {
    if (!focused.current) setDraft(value === null ? '' : String(value));
  }, [value]);

  const restore = (): void => setDraft(value === null ? '' : String(value));

  const finish = (): void => {
    focused.current = false;
    const next = Number(draft);
    if (draft.trim() === '' || !Number.isFinite(next)) {
      restore();
      if (changed.current) onCommit(previous.current, previous.current);
      changed.current = false;
      return;
    }
    if (changed.current) onCommit(next, previous.current);
    changed.current = false;
  };

  return (
    <label className="art-inspector-field">
      <span className="art-inspector-field-label">{label}</span>
      <Input
        className="art-inspector-input"
        aria-label={label}
        type="number"
        inputMode="decimal"
        min={min}
        max={max}
        step={step}
        value={draft}
        placeholder={mixed ? t('panel.mixed') : shown === '' ? t('panel.mixed') : undefined}
        onFocus={() => {
          focused.current = true;
          previous.current = value ?? 0;
          changed.current = false;
          setDraft(value === null ? '' : String(value));
        }}
        onChange={(event) => {
          const text = event.target.value;
          setDraft(text);
          const next = Number(text);
          if (text.trim() !== '' && Number.isFinite(next)) {
            changed.current = true;
            onPreview(next);
          }
        }}
        onBlur={() => {
          if (skipBlur.current) {
            skipBlur.current = false;
            focused.current = false;
            restore();
            return;
          }
          finish();
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            event.currentTarget.blur();
          } else if (event.key === 'Escape') {
            event.preventDefault();
            restore();
            if (changed.current) onCommit(previous.current, previous.current);
            changed.current = false;
            skipBlur.current = true;
            event.currentTarget.blur();
          }
        }}
      />
    </label>
  );
}

/** The Layers tab: an accessible tree that selects, expands, hides, locks, and renames. */
function LayersPanel({ t, handle, snapshot }: { t: Translator; handle: DesignCanvasHandle; snapshot: CanvasSnapshot }) {
  const [renaming, setRenaming] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const rows = snapshot.rows;
  const selectedIndex = rows.findIndex((row) => row.selected);

  const selectAt = (index: number): void => {
    const row = rows[index];
    if (row !== undefined) handle.select(row.id, 'replace');
  };

  const startRename = (row: LayerRowView): void => {
    setDraft(row.name);
    setRenaming(row.id);
  };

  const commitRename = (row: LayerRowView): void => {
    const name = draft.trim();
    setRenaming(null);
    if (name !== '' && name !== row.name) handle.rename(row.id, name);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    const row = selectedIndex === -1 ? undefined : rows[selectedIndex];
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      selectAt(selectedIndex === -1 ? 0 : Math.min(selectedIndex + 1, rows.length - 1));
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      selectAt(selectedIndex === -1 ? rows.length - 1 : Math.max(selectedIndex - 1, 0));
      return;
    }
    if (row === undefined) return;
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      if (row.hasChildren && row.expanded) {
        handle.toggleExpand(row.id);
        return;
      }
      for (let index = selectedIndex - 1; index >= 0; index -= 1) {
        if (rows[index]!.level < row.level) {
          handle.select(rows[index]!.id, 'replace');
          return;
        }
      }
      return;
    }
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      if (row.hasChildren && !row.expanded) handle.toggleExpand(row.id);
      else {
        const next = rows[selectedIndex + 1];
        if (next !== undefined && next.level > row.level) handle.select(next.id, 'replace');
      }
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      startRename(row);
    }
  };

  if (rows.length === 0) return <p className="art-inspector-empty">{t('panel.none')}</p>;

  return (
    <div className="art-layer-tree" role="tree" aria-label={t('panel.layers')} tabIndex={0} onKeyDown={onKeyDown}>
      {rows.map((row) => (
        <div
          key={row.id}
          className={'art-layer-row' + (row.selected ? ' is-selected' : '')}
          data-layer-id={row.id}
          role="treeitem"
          aria-level={row.level}
          aria-selected={row.selected}
          aria-expanded={row.hasChildren ? row.expanded : undefined}
          style={{ paddingInlineStart: (row.level - 1) * 14 + 6 }}
          onClick={(event) => {
            if (event.shiftKey) handle.select(row.id, 'range');
            else if (event.metaKey || event.ctrlKey) handle.select(row.id, 'add');
            else handle.select(row.id, 'replace');
          }}
          onDoubleClick={() => startRename(row)}
        >
          {row.hasChildren ? (
            <Button
              size="sm"
              className="art-layer-caret"
              aria-label={t(row.expanded ? 'panel.collapse' : 'panel.expand')}
              onClick={(event) => {
                event.stopPropagation();
                handle.toggleExpand(row.id);
              }}
            >
              {row.expanded ? <IconChevronDownOutlineRegular size={12} /> : <IconChevronRightOutlineRegular size={12} />}
            </Button>
          ) : <span className="art-layer-caret" aria-hidden="true" />}
          <span className="art-layer-icon" aria-hidden="true">{layerGlyph(row.type)}</span>
          {renaming === row.id ? (
            <Input
              className="art-layer-rename"
              aria-label={t('panel.rename')}
              autoFocus
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onClick={(event) => event.stopPropagation()}
              onBlur={() => commitRename(row)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  commitRename(row);
                } else if (event.key === 'Escape') {
                  event.preventDefault();
                  setRenaming(null);
                }
              }}
            />
          ) : (
            <span className="art-layer-name" title={row.name}>{row.name}</span>
          )}
          <span className="art-layer-actions">
            <Button
              size="sm"
              className="art-layer-action"
              aria-label={t(row.visible ? 'panel.hide' : 'panel.show')}
              aria-pressed={!row.visible}
              onClick={(event) => {
                event.stopPropagation();
                handle.toggleVisibility(row.id);
              }}
            >
              {row.visible ? <IconEye size={13} /> : <IconEyeOff size={13} />}
            </Button>
            <Button
              size="sm"
              className="art-layer-action"
              aria-label={t(row.locked ? 'panel.unlock' : 'panel.lock')}
              aria-pressed={row.locked}
              onClick={(event) => {
                event.stopPropagation();
                handle.toggleLock(row.id);
              }}
            >
              {row.locked ? <IconLock size={13} /> : <IconLockOpen size={13} />}
            </Button>
          </span>
        </div>
      ))}
    </div>
  );
}

/** The Properties tab: geometry, appearance, and text for the selection. */
function PropertiesPanel({ t, handle, snapshot }: { t: Translator; handle: DesignCanvasHandle; snapshot: CanvasSnapshot }) {
  const properties = snapshot.properties;
  if (properties.ids.length === 0) return <p className="art-inspector-empty">{t('panel.selectLayerHint')}</p>;
  const number = (key: PropertyKey, label: string, value: number | null, extra: { min?: number; max?: number; step?: number } = {}) => (
    <NumberField
      t={t}
      label={label}
      value={value}
      mixed={value === null}
      {...extra}
      onPreview={(next) => handle.preview(key, next)}
      onCommit={(next, previous) => handle.commit(key, next, previous)}
    />
  );
  return (
    <div className="art-inspector-properties">
      <div className="art-inspector-node">
        <span className="art-inspector-node-icon" aria-hidden="true">{layerGlyph(properties.type ?? '')}</span>
        <span className="art-inspector-node-name" title={properties.name ?? ''}>{properties.name}</span>
        <span className="art-inspector-node-type">{layerTypeLabel(t, properties.type ?? '')}</span>
      </div>
      <section className="art-inspector-group">
        <h3 className="art-inspector-heading">{t('panel.positionSize')}</h3>
        <div className="art-inspector-grid">
          {number('x', t('panel.x'), properties.x)}
          {number('y', t('panel.y'), properties.y)}
          {number('width', t('panel.w'), properties.width, { min: 1 })}
          {number('height', t('panel.h'), properties.height, { min: 1 })}
          {number('rotation', t('panel.rotation'), properties.rotation)}
          {number('radius', t('panel.radius'), properties.radius, { min: 0 })}
        </div>
      </section>
      <section className="art-inspector-group">
        <h3 className="art-inspector-heading">{t('panel.appearance')}</h3>
        <div className="art-inspector-appearance">
          {number('opacity', t('panel.opacity'), properties.opacity, { min: 0, max: 100 })}
          <label className="art-inspector-switch">
            <span className="art-inspector-field-label">{t('panel.visible')}</span>
            <Switch checked={properties.visible === true} label={t('panel.visible')} onChange={(next) => handle.setVisible(next)} />
          </label>
        </div>
      </section>
      {snapshot.isText && properties.text !== null ? (
        <section className="art-inspector-group">
          <h3 className="art-inspector-heading">{t('panel.text')}</h3>
          <div className="art-inspector-grid">
            <label className="art-inspector-field">
              <span className="art-inspector-field-label">{t('panel.family')}</span>
              <select className="art-select art-inspector-select" aria-label={t('panel.family')} value={properties.text.family} onChange={(event) => handle.setFamily(event.target.value)}>
                {FAMILIES.map((family) => <option key={family} value={family}>{family}</option>)}
              </select>
            </label>
            <label className="art-inspector-field">
              <span className="art-inspector-field-label">{t('panel.weight')}</span>
              <select className="art-select art-inspector-select" aria-label={t('panel.weight')} value={String(properties.text.weight)} onChange={(event) => handle.setWeight(Number(event.target.value))}>
                {WEIGHTS.map((weight) => <option key={weight} value={String(weight)}>{String(weight)}</option>)}
              </select>
            </label>
            {number('fontSize', t('panel.fontSize'), properties.text.fontSize, { min: 1 })}
          </div>
        </section>
      ) : (
        <p className="art-inspector-hint">{t('panel.selectTextHint')}</p>
      )}
    </div>
  );
}

/**
 * The drawer body: Layers and Properties for the canvas handle's snapshot.
 * @param props the translator, handle, snapshot, and active tab.
 * @returns the panel.
 */
export function DesignInspector({ t, handle, snapshot, tab }: {
  t: Translator;
  handle: DesignCanvasHandle | null;
  snapshot: CanvasSnapshot | null;
  tab: InspectorTab;
}) {
  if (handle === null || snapshot === null) return <p className="art-inspector-empty">{t('canvas.opening')}</p>;
  return tab === 'layers'
    ? <LayersPanel t={t} handle={handle} snapshot={snapshot} />
    : <PropertiesPanel t={t} handle={handle} snapshot={snapshot} />;
}
