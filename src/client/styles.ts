import { DOC_STYLE } from '../render.js';

const STYLE_ID = 'dsh-artifact-studio/styles';

/** The export's document typography, scoped to the editor's page surface. */
const DOC_SURFACE = DOC_STYLE.split('\n').map((rule) => {
  const brace = rule.indexOf('{');
  const selectors = rule.slice(0, brace).split(',').map((part) => part.trim()).filter((part) => part !== 'body' && part !== '.art-docpage');
  const scoped = selectors.length === 0 ? '.art-docpage' : selectors.map((part) => '.art-docpage .art-prose ' + part).join(', ');
  return scoped + ' ' + rule.slice(brace);
}).join('\n');

/** Every color comes from a Harness token, so light and dark themes follow the app. */
const CSS = `
body {
  --art-space-2: 2px;
  --art-space-4: 4px;
  --art-space-6: 6px;
  --art-space-8: 8px;
  --art-space-12: 12px;
  --art-space-16: 16px;
  --art-space-24: 24px;
  --art-control-inline: 20px;
  --art-control-sm: 28px;
  --art-control-md: 36px;
}
.art-root {
  position: relative;
  container-type: inline-size;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  min-width: 0;
  color: var(--dsw-alias-label-primary);
  background: var(--dsw-alias-bg-base);
  font: var(--dsw-font-xs-13);
}
.art-root *, .art-root *::before, .art-root *::after, .art-card * { box-sizing: border-box; }
.art-root ::selection { background: color-mix(in srgb, var(--dsw-alias-state-business-primary) 28%, transparent); }
.art-root :focus-visible, .art-card :focus-visible, .art-composer:focus-visible {
  outline: var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary));
  outline-offset: 1px;
}
.art-header {
  flex: none;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--art-space-12);
  min-height: 44px;
  padding: var(--art-space-8) var(--art-space-12);
  border-bottom: .5px solid var(--dsw-alias-border-l2);
}
.art-heading { flex: 1 1 auto; min-width: 0; overflow: hidden; display: flex; align-items: center; gap: var(--art-space-8); }
.art-title {
  min-width: 0;
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--dsw-font-s-14-font-size);
  font-weight: 500;
  line-height: var(--dsw-font-s-14-line-height);
  color: var(--dsw-alias-label-primary);
}
.art-meta {
  display: flex;
  align-items: baseline;
  gap: var(--art-space-2);
  min-width: 0;
  color: var(--dsw-alias-label-secondary);
  font-size: var(--dsw-font-xxxs-11-font-size);
  line-height: var(--dsw-font-xxxs-11-line-height);
  font-variant-numeric: tabular-nums;
}
.art-meta-text { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.art-save-status { flex: none; white-space: nowrap; }
.art-save-status[data-tone="warn"] { color: var(--dsw-alias-state-warn-primary); }
.art-save-status[data-tone="error"] { color: var(--dsw-alias-state-error-primary); }
.art-actions { flex: none; display: flex; align-items: center; gap: var(--art-space-4); }
.art-toolbar {
  flex: none;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--art-space-8);
  padding: var(--art-space-8) 0;
  border-bottom: .5px solid var(--dsw-alias-border-l2);
}
.art-search { flex: 1 1 140px; min-width: 140px; height: var(--art-control-md); }
.art-search input::placeholder { color: var(--dsw-alias-label-secondary); }
.art-scroll { flex: 1; min-height: 0; overflow: auto; scrollbar-gutter: stable; }
.art-gallery {
  width: 100%;
  max-width: 860px;
  margin-inline: auto;
  padding: 0 var(--art-space-12) var(--art-space-24);
}
.art-section { padding: var(--art-space-4) 0 var(--art-space-16); }
.art-section-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--art-space-8);
  padding: var(--art-space-8) 0 var(--art-space-6);
}
.art-section-title { margin: 0; font-size: var(--dsw-font-xxs-12-font-size); font-weight: 500; color: var(--dsw-alias-label-primary); }
.art-section-hint { font-size: var(--dsw-font-xxxs-11-font-size); color: var(--dsw-alias-label-secondary); }
.art-grid { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(210px, 1fr)); gap: var(--art-space-8); }
.art-tile {
  position: relative;
  min-width: 0;
  overflow: hidden;
  border: .5px solid var(--dsw-alias-border-l1);
  border-radius: var(--dsw-radius-md);
  background: var(--dsw-alias-card-fill);
}
.art-tile:hover { border-color: var(--dsw-alias-border-l2); background: var(--dsw-alias-card-fill-hover); }
.art-tile-open {
  display: block;
  width: 100%;
  padding: 0;
  border: none;
  border-radius: inherit;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.art-tile-open:focus-visible { outline: var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary)); outline-offset: -2px; }
.art-tile-body { display: flex; flex-direction: column; gap: var(--art-space-2); padding: var(--art-space-8) var(--art-space-8) var(--art-space-8); }
.art-tile-title { min-width: 0; overflow-wrap: anywhere; font-size: var(--dsw-font-xxs-12-font-size); font-weight: 500; line-height: var(--dsw-font-xxs-12-line-height); }
.art-tile-sub { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: var(--dsw-font-xxxs-11-font-size); color: var(--dsw-alias-label-secondary); }
.art-tile-pin {
  position: absolute;
  z-index: 2;
  top: 6px;
  right: 6px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: var(--art-control-sm);
  height: var(--art-control-sm);
  padding: 0;
  border: none;
  border-radius: var(--dsw-radius-sm);
  background: color-mix(in srgb, var(--dsw-alias-bg-base) 82%, transparent);
  color: var(--dsw-alias-label-secondary);
  cursor: pointer;
  opacity: .72;
}
.art-tile-pin:hover, .art-tile-pin:focus-visible { opacity: 1; background: var(--dsw-alias-bg-base); color: var(--dsw-alias-label-primary); }
.art-tile-pin[aria-pressed="true"] { opacity: 1; color: var(--dsw-alias-brand-primary); }
.art-cover { display: block; position: relative; aspect-ratio: 4 / 3; overflow: hidden; background: var(--dsw-alias-bg-layer-2); border-bottom: .5px solid var(--dsw-alias-border-l1); }
.art-cover-frame-wrap { display: block; width: 274px; height: 205px; margin: 0 auto; overflow: hidden; }
.art-cover-frame { display: block; width: 720px; height: 540px; border: 0; transform: scale(.38); transform-origin: top left; pointer-events: none; background: var(--dsw-static-neutral-00); }
.art-cover-fallback { display: flex; align-items: center; justify-content: center; width: 100%; height: 100%; color: var(--dsw-alias-label-secondary); }
.art-cover-fallback svg { width: 26px; height: 26px; opacity: .55; }
.art-cover-design { display: block; width: 100%; height: 100%; object-fit: contain; background: var(--dsw-alias-bg-document-preview); }
.art-cover-sheet { display: flex; flex-direction: column; gap: var(--art-space-4); height: 100%; padding: var(--art-space-8) var(--art-space-8) var(--art-space-8); background: var(--dsw-alias-bg-base); overflow: hidden; }
.art-cover-sheet-name { flex: none; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 10px; font-weight: 500; color: var(--dsw-alias-label-secondary); }
.art-cover-sheet-table { display: flex; flex-direction: column; border: .5px solid var(--dsw-alias-border-l1); border-radius: var(--dsw-radius-xs); overflow: hidden; }
.art-cover-sheet-row { display: flex; min-height: 18px; border-bottom: .5px solid var(--dsw-alias-border-l1); }
.art-cover-sheet-row:last-child { border-bottom: 0; }
.art-cover-sheet-index { flex: none; width: 14px; display: flex; align-items: center; justify-content: center; background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-tertiary); font-size: 8px; }
.art-cover-sheet-cell { flex: 1 1 0; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; padding: var(--art-space-2) var(--art-space-4); border-left: .5px solid var(--dsw-alias-border-l1); font-size: 9px; color: var(--dsw-alias-label-primary); }
.art-cover-doc { display: flex; flex-direction: column; gap: var(--art-space-6); height: 100%; padding: var(--art-space-12) var(--art-space-12) var(--art-space-8); background: var(--dsw-alias-bg-base); }
.art-cover-doc-title { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: var(--dsw-font-xxs-12-font-size); font-weight: 500; }
.art-cover-doc-text { display: -webkit-box; overflow: hidden; -webkit-line-clamp: 6; -webkit-box-orient: vertical; font-size: var(--dsw-font-xxxs-11-font-size); line-height: var(--dsw-font-xxxs-11-line-height); color: var(--dsw-alias-label-secondary); }
.art-gallery-more { display: flex; justify-content: center; padding: var(--art-space-4) 0 var(--art-space-8); }
.art-empty {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: var(--art-space-6);
  margin: 2px 0 6px;
  padding: var(--art-space-12);
  border: 1px dashed var(--dsw-alias-border-l1);
  border-radius: var(--dsw-radius-md);
  color: var(--dsw-alias-label-secondary);
}
.art-empty-title { margin: 0; font-size: var(--dsw-font-xxs-12-font-size); font-weight: 500; color: var(--dsw-alias-label-primary); }
.art-empty-hint { margin: 0; font-size: var(--dsw-font-xxs-12-font-size); line-height: var(--dsw-font-xxs-12-line-height); max-width: 44ch; }
.art-center {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--art-space-8);
  padding: var(--art-space-24);
  text-align: center;
  color: var(--dsw-alias-label-secondary);
}
.art-center-title { margin: 0; font-size: var(--dsw-font-xs-13-font-size); font-weight: 500; color: var(--dsw-alias-label-primary); }
.art-center-hint { margin: 0; max-width: 40ch; font-size: var(--dsw-font-xxs-12-font-size); line-height: var(--dsw-font-xxs-12-line-height); }
.art-note { margin: 0; padding: var(--art-space-4) var(--art-space-8); font-size: var(--dsw-font-xxxs-11-font-size); color: var(--dsw-alias-label-secondary); }
.art-body { flex: 1; min-height: 0; min-width: 0; display: flex; }
.art-stage { position: relative; flex: 1; min-width: 0; min-height: 0; display: flex; flex-direction: column; background: var(--dsw-alias-bg-layer-1); }
.art-drawer-layer { flex: none; display: flex; min-width: 0; min-height: 0; }
.art-drawer-layer[data-overlay="true"] { position: absolute; inset: 0; z-index: 30; justify-content: flex-end; }
.art-drawer {
  flex: none;
  display: flex;
  flex-direction: column;
  width: 300px;
  min-width: 0;
  min-height: 0;
  border-left: .5px solid var(--dsw-alias-border-l2);
  background: var(--dsw-alias-bg-base);
}
.art-drawer-layer[data-overlay="true"] .art-drawer { position: relative; z-index: 1; width: min(320px, 100%); }
.art-drawer-scrim { position: absolute; inset: 0; background: var(--dsw-alias-bg-mask-1); }
.art-drawer-head { flex: none; display: flex; align-items: center; justify-content: space-between; gap: var(--art-space-8); padding: var(--art-space-8) var(--art-space-8) var(--art-space-8) var(--art-space-12); border-bottom: .5px solid var(--dsw-alias-border-l2); }
.art-drawer-head h2 { margin: 0; font-size: var(--dsw-font-xs-13-font-size); font-weight: 500; line-height: var(--dsw-font-xs-13-line-height); }
.art-drawer-body { flex: 1; min-height: 0; overflow: auto; }

/* Design previews are rendered on the host; the plugin only frames the image. */
.art-design-preview { flex: 1; min-height: 0; overflow: auto; padding: var(--art-space-16); display: flex; flex-direction: column; align-items: center; gap: var(--art-space-12); background: var(--dsw-alias-bg-layer-1); }
.art-design-canvas { display: flex; justify-content: center; width: 100%; }
.art-design-image { display: block; max-width: 100%; height: auto; border-radius: var(--dsw-radius-md); background: var(--dsw-static-neutral-00); box-shadow: var(--dsw-shadow-lv2); }
.art-design-error { max-width: 52ch; color: var(--dsw-alias-label-primary); line-height: var(--dsw-font-xs-13-line-height); }
.art-design-warnings { width: 100%; max-width: 720px; padding: var(--art-space-8) var(--art-space-12); border: .5px solid var(--dsw-alias-border-l2); border-radius: var(--dsw-radius-sm); background: var(--dsw-alias-bg-base); color: var(--dsw-alias-label-secondary); font-size: var(--dsw-font-xxs-12-font-size); }
.art-design-warnings-title { display: block; margin-bottom: 4px; font-weight: 500; color: var(--dsw-alias-label-primary); }
.art-design-warnings ul { margin: 0; padding-left: var(--art-space-16); }

/* The iframe canvas is the artifact's, not plugin chrome: HTML paints white by default, so a page that sets no background must not inherit the host theme. */
.art-frame { flex: 1; width: 100%; min-height: 0; border: none; background: var(--dsw-static-neutral-00); }
.art-source {
  flex: 1;
  min-height: 0;
  width: 100%;
  padding: var(--art-space-12) var(--art-space-12);
  border: none;
  resize: none;
  background: var(--dsw-alias-bg-base);
  color: var(--dsw-alias-label-primary);
  font-family: var(--ds-font-family-code);
  font-size: var(--dsw-font-xxs-12-font-size);
  line-height: var(--dsw-font-xxs-12-line-height);
  tab-size: 2;
}
.art-source:focus { outline: none; }
.art-history-body { display: flex; flex-direction: column; min-height: 0; }
.art-version {
  display: flex;
  flex-direction: column;
  gap: var(--art-space-2);
  width: 100%;
  padding: var(--art-space-8) var(--art-space-12);
  border: none;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.art-version:hover { background: var(--dsw-alias-interactive-bg-hover); }
.art-version[aria-current="true"] { background: var(--dsw-alias-interactive-bg-hover-accent); }
.art-version-top { display: flex; align-items: center; justify-content: space-between; gap: var(--art-space-6); font-size: var(--dsw-font-xxs-12-font-size); font-weight: 500; font-variant-numeric: tabular-nums; }
.art-version-sub { font-size: var(--dsw-font-xxxs-11-font-size); color: var(--dsw-alias-label-secondary); }
.art-bar {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--art-space-8);
  padding: var(--art-space-8) var(--art-space-12);
  border-bottom: .5px solid var(--dsw-alias-border-l2);
  background: var(--dsw-alias-bg-layer-2);
  font-size: var(--dsw-font-xxs-12-font-size);
}
.art-bar[data-tone="warn"] { background: color-mix(in srgb, var(--dsw-alias-state-warn-primary) 14%, var(--dsw-alias-bg-base)); }
.art-bar[data-tone="error"] { background: color-mix(in srgb, var(--dsw-alias-state-error-primary) 12%, var(--dsw-alias-bg-base)); }
.art-bar-text { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
.art-bar-text strong { font-weight: 500; }
.art-bar-actions { flex: none; display: flex; gap: var(--art-space-6); }
.art-field { display: flex; flex-direction: column; gap: var(--art-space-4); font-size: var(--dsw-font-xxs-12-font-size); color: var(--dsw-alias-label-secondary); }
.art-field textarea { height: 84px; padding: var(--art-space-8); border: .5px solid var(--dsw-alias-border-l4); border-radius: var(--dsw-radius-sm); background: var(--dsw-alias-bg-base); color: var(--dsw-alias-label-primary); font: var(--dsw-font-xs-13); resize: vertical; }
.art-field input:focus, .art-field textarea:focus { outline: none; border-color: var(--dsw-alias-state-business-primary); }
.art-field-hint { font-size: var(--dsw-font-xxxs-11-font-size); color: var(--dsw-alias-label-secondary); }
.art-design { display: flex; flex-direction: column; gap: var(--art-space-16); padding: var(--art-space-12) var(--art-space-12) 40px; }
.art-design-group { display: flex; flex-direction: column; gap: var(--art-space-8); }
.art-design-group h3 { margin: 0; font-size: var(--dsw-font-xxs-12-font-size); font-weight: 500; color: var(--dsw-alias-label-primary); }
.art-swatches { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: var(--art-space-8); }
.art-swatch {
  display: flex;
  align-items: center;
  gap: var(--art-space-8);
  padding: var(--art-space-6) var(--art-space-8);
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: var(--dsw-radius-sm);
}
.art-swatch input[type="color"] { flex: none; width: var(--art-control-sm); height: var(--art-control-sm); padding: 0; border: none; border-radius: var(--dsw-radius-sm); background: none; cursor: pointer; }
.art-swatch-text { flex: 1; display: flex; flex-direction: column; min-width: 0; font-size: var(--dsw-font-xxxs-11-font-size); color: var(--dsw-alias-label-secondary); }
.art-swatch-text input {
  width: 100%;
  min-width: 0;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--dsw-alias-label-primary);
  font-family: var(--ds-font-family-code);
  font-size: var(--dsw-font-xxs-12-font-size);
}
.art-swatch-text input:focus { outline: none; }
.art-radius-row { display: grid; grid-template-columns: repeat(3, 1fr); gap: var(--art-space-8); }
.art-radius-row label { display: flex; flex-direction: column; gap: var(--art-space-4); font-size: var(--dsw-font-xxxs-11-font-size); color: var(--dsw-alias-label-secondary); }
.art-radius-row input { width: 100%; font-variant-numeric: tabular-nums; }
.art-token-preview { height: 150px; display: flex; overflow: hidden; border: .5px solid var(--dsw-alias-border-l2); border-radius: var(--dsw-radius-md); }
.art-design-source { font-size: var(--dsw-font-xxs-12-font-size); color: var(--dsw-alias-label-secondary); }
.art-design-actions { display: flex; flex-wrap: wrap; gap: var(--art-space-6); }
.art-composer {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: var(--art-control-sm);
  padding: 0;
  border: none;
  border-radius: var(--dsw-radius-sm);
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  cursor: pointer;
}
.art-composer:hover { background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-primary); }
.art-chip { display: inline-flex; align-items: center; gap: var(--art-space-6); min-width: 0; }
.art-chip svg { flex: none; width: 14px; height: 14px; color: var(--dsw-alias-label-secondary); }
.art-chip span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.art-workspace { display: flex; align-items: center; gap: var(--art-space-6); margin-left: auto; min-width: 0; }
.art-workspace-label { font-size: var(--dsw-font-xxxs-11-font-size); color: var(--dsw-alias-label-secondary); white-space: nowrap; }
.art-workspace-select { max-width: 180px; min-width: 90px; }
.art-scope-fixed { flex: none; max-width: 180px; margin-left: auto; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: var(--dsw-font-xxs-12-font-size); color: var(--dsw-alias-label-secondary); }
.art-panel-stack, .art-panel-region { height: 100%; min-height: 0; min-width: 0; }
.art-panel-region[hidden] { display: none; }
.art-editor-header { position: relative; flex-wrap: nowrap; padding: var(--art-space-8) var(--art-space-12); gap: var(--art-space-8); }
.art-identity { display: flex; flex-direction: column; min-width: 0; flex: 1; gap: 1px; }
.art-identity .art-meta { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.art-editor-actions { margin-left: auto; flex: none; flex-wrap: nowrap; justify-content: flex-end; }
.art-inline-form { display: flex; gap: var(--art-space-6); padding: var(--art-space-8) var(--art-space-12); }
.art-inline-form > span { min-width: 0; flex: 1; }
.art-selection-bar {
  position: absolute;
  z-index: 12;
  left: 50%;
  bottom: 14px;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: var(--art-space-8);
  width: max-content;
  max-width: min(620px, calc(100% - 24px));
  padding: var(--art-space-6) var(--art-space-8) var(--art-space-6) var(--art-space-8);
  border: 0;
  border-radius: var(--dsw-radius-md);
  background: var(--dsw-alias-bg-layer-1);
  box-shadow: var(--dsw-elevation-panel);
}
.art-selection-quote { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: var(--dsw-font-xxs-12-font-size); color: var(--dsw-alias-label-secondary); }
.art-version-button {
  display: inline-flex;
  align-items: center;
  gap: 1px;
  height: var(--art-control-inline);
  padding: 0 var(--art-space-4);
  border: .5px solid var(--dsw-alias-border-l1);
  border-radius: var(--dsw-radius-xs);
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  font: inherit;
  font-size: var(--dsw-font-xxxs-11-font-size);
  font-variant-numeric: tabular-nums;
  cursor: pointer;
}
.art-version-button:hover, .art-version-button[aria-expanded="true"] { background: var(--dsw-alias-interactive-bg-hover-accent); color: var(--dsw-alias-label-primary); }
.art-version-button svg { width: 12px; height: 12px; }
.art-bar { flex-wrap: wrap; }
.art-bar-actions { flex-wrap: wrap; }
.art-source:focus-visible, .art-prose:focus-visible, .art-swatch-text input:focus-visible { outline: var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary)); outline-offset: -2px; }
@container (max-width: 600px) {
  .art-editor-header { flex-wrap: wrap; }
  .art-editor-header .art-heading { flex-basis: 100%; }
  .art-editor-actions { width: 100%; flex-wrap: wrap; justify-content: flex-end; }
  .art-editor-actions .art-segment { margin-right: auto; }
  .art-drawer-layer { position: absolute; inset: 0; z-index: 30; justify-content: flex-end; }
  .art-drawer { width: min(320px, 100%); }
  .art-workspace-label { display: none; }
  .art-docpage { padding: 28px 20px 64px; }
  .art-canvas-dock { gap: 0; padding: var(--art-space-2) var(--art-space-4); max-width: calc(100% - 12px); }
  .art-dock-divider { margin: 0 2px; }
  .art-layer-bar { bottom: 54px; }
}
@container (max-width: 520px) {
  .art-toolbar { flex-direction: column; align-items: stretch; }
  .art-search { width: 100%; flex: none; }
  .art-toolbar .art-segment { align-self: flex-start; max-width: 100%; overflow-x: auto; }
  .art-gallery { padding: 0 var(--art-space-8) var(--art-space-16); }
  .art-grid { grid-template-columns: 1fr; }
  .art-cover { aspect-ratio: 16 / 10; }
  .art-selection-bar { left: 8px; right: 8px; width: auto; max-width: none; transform: none; }
  .art-selection-quote { flex: 1; }
}
@media (pointer: coarse) { .art-icon-button, .art-tile-pin, .art-composer { min-height: 44px; min-width: 44px; } }
@media (prefers-reduced-motion: no-preference) {
  .art-tile, .art-tile-pin, .art-version, .art-card-open { transition: background-color var(--ds-transition-duration-fast) var(--ds-ease-in-out), color var(--ds-transition-duration-fast) var(--ds-ease-in-out), border-color var(--ds-transition-duration-fast) var(--ds-ease-in-out), opacity var(--ds-transition-duration-fast) var(--ds-ease-in-out); }
  .art-doc-toolbar { animation: art-rise var(--ds-transition-duration-fast) var(--ds-ease-in-out); }
}
@keyframes art-rise { from { opacity: 0; transform: translate(-50%, 4px); } to { opacity: 1; transform: translate(-50%, 0); } }
.art-icon-button { flex: none; width: var(--art-control-sm); padding: 0; }
.art-icon-button[aria-pressed="true"] { background: var(--dsw-alias-interactive-bg-hover-accent); color: var(--dsw-alias-label-primary); }
.art-meta-dot { color: var(--dsw-alias-label-tertiary); padding: 0 var(--art-space-2); }
.art-ask { flex: none; white-space: nowrap; }
.art-center-actions { display: flex; gap: var(--art-space-8); }
.art-modal-error { margin: 0; color: var(--dsw-alias-state-error-primary); font-size: var(--dsw-font-xs-13-font-size); }
.art-fallback { width: 100%; min-height: 140px; padding: var(--art-space-8) var(--art-space-12); border: 1px solid var(--dsw-alias-border-l1); border-radius: var(--dsw-radius-sm); background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-primary); font: var(--dsw-font-xxs-12); font-family: var(--ds-font-family-code); resize: vertical; }
.art-code, .art-source-wrap { flex: 1; min-height: 0; display: flex; flex-direction: column; background: var(--dsw-alias-bg-base); }
.art-code { overflow: auto; }
.art-code-bar { flex: none; position: sticky; top: 0; z-index: 2; display: flex; align-items: center; justify-content: space-between; gap: var(--art-space-8); min-height: 40px; padding: var(--art-space-6) var(--art-space-12); border-bottom: .5px solid var(--dsw-alias-border-l2); background: var(--dsw-alias-bg-base); color: var(--dsw-alias-label-secondary); font-size: var(--dsw-font-xxs-12-font-size); }
.art-code-block { margin: 0; border: none; border-radius: 0; }
.art-code pre.prim-code { margin: 0; padding: var(--art-space-12) var(--art-space-12); white-space: pre-wrap; font: var(--dsw-font-xxs-12); font-family: var(--ds-font-family-code); }
.art-doc { position: relative; flex: 1; min-height: 0; overflow: auto; background: var(--dsw-alias-bg-layer-1); }
.art-docpage[hidden] { display: none; }
.art-docpage { box-sizing: border-box; width: min(100%, 820px); min-height: calc(100% - 32px); margin: 16px auto; padding: 56px 64px 96px; border-radius: var(--dsw-radius-md); background: var(--artifact-color-surface, var(--dsw-alias-bg-base)); box-shadow: var(--dsw-elevation-stroke), var(--dsw-shadow-lv1); }
.art-doc-mount { max-width: 70ch; margin: 0 auto; }
.art-prose, .art-prose:focus-visible { outline: none; }
.art-prose > :first-child { margin-top: 0; }
.art-prose ul[data-type="taskList"] { list-style: none; padding-left: .2em; }
.art-prose ul[data-type="taskList"] li { display: flex; gap: var(--art-space-8); }
.art-prose ul[data-type="taskList"] li > label { flex: none; margin-top: .25em; }
.art-prose ul[data-type="taskList"] li > div { flex: 1; }
.art-prose ::selection { background: color-mix(in srgb, var(--artifact-color-primary, var(--dsw-alias-brand-primary)) 24%, transparent); }
.art-doc-toolbar { position: absolute; z-index: 15; display: flex; flex-wrap: wrap; justify-content: center; max-width: calc(100% - 16px); align-items: center; gap: var(--art-space-2); padding: var(--art-space-4); border-radius: var(--dsw-radius-md); background: var(--dsw-alias-bg-layer-1); box-shadow: var(--dsw-elevation-panel); transform: translateX(-50%); white-space: nowrap; }
.art-doc-toolbar [aria-pressed="true"] { background: var(--dsw-alias-interactive-bg-hover-accent); color: var(--dsw-alias-label-primary); }
.art-doc-toolbar-gap, .art-dock-divider, .art-sheet-divider { flex: none; width: .5px; height: var(--art-control-inline); margin: 0 var(--art-space-4); background: var(--dsw-alias-border-l2); }
.art-card { display: grid; grid-template-columns: 36px minmax(0, 1fr) auto; align-items: center; gap: var(--art-space-12); width: 100%; max-width: 480px; padding: var(--art-space-8) var(--art-space-12) var(--art-space-8) var(--art-space-8); border: .5px solid var(--dsw-alias-border-l1); border-radius: var(--dsw-radius-lg); background: var(--dsw-alias-card-fill); color: var(--dsw-alias-label-primary); font: inherit; font-size: var(--dsw-font-xs-13-font-size); text-align: left; }
.art-card-open { cursor: pointer; }
.art-card-open:hover { border-color: var(--dsw-alias-border-l2); background: var(--dsw-alias-card-fill-hover); }
.art-card-open:hover .art-card-go { color: var(--dsw-alias-label-primary); transform: translateX(1px); }
.art-card-icon { display: flex; align-items: center; justify-content: center; width: 36px; height: 36px; border-radius: var(--dsw-radius-md); border: .5px solid var(--dsw-alias-border-l1); background: var(--dsw-alias-bg-base); color: var(--dsw-alias-label-secondary); }
.art-card-icon[data-tone="error"] { color: var(--dsw-alias-state-error-primary); }
.art-card-icon svg { width: 18px; height: 18px; }
.art-card-text { min-width: 0; display: flex; flex-direction: column; gap: var(--art-space-2); }
.art-card-title { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 500; }
.art-card-sub { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: var(--dsw-font-xxs-12-font-size); color: var(--dsw-alias-label-secondary); }
.art-card-sub[data-tone="error"] { color: var(--dsw-alias-state-error-primary); white-space: normal; }
.art-card-go { display: flex; color: var(--dsw-alias-label-secondary); transition: transform var(--ds-transition-duration-fast) var(--ds-ease-in-out), color var(--ds-transition-duration-fast) var(--ds-ease-in-out); }
.art-composer svg { width: 16px; height: 16px; }
.art-starters { list-style: none; display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: var(--art-space-8); margin: 10px 0 0; padding: 0; }
.art-starter { display: flex; align-items: flex-start; gap: var(--art-space-8); padding: var(--art-space-8) var(--art-space-8) var(--art-space-8) var(--art-space-12); border: .5px solid var(--dsw-alias-border-l1); border-radius: var(--dsw-radius-md); background: var(--dsw-alias-bg-base); }
.art-starter-text { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: var(--art-space-2); }
.art-starter-name { font-size: var(--dsw-font-xs-13-font-size); font-weight: 500; color: var(--dsw-alias-label-primary); }
.art-starter-hint { font-size: var(--dsw-font-xxs-12-font-size); line-height: var(--dsw-font-xxs-12-line-height); color: var(--dsw-alias-label-secondary); }
.art-tile-pin svg { width: 14px; height: 14px; }
.art-canvas { flex: 1; min-height: 0; display: flex; flex-direction: column; }
.art-canvas-stage { position: relative; flex: 1; min-height: 0; overflow: hidden; background: var(--dsw-alias-bg-document-preview); }
.art-canvas-mount { position: absolute; inset: 0; }
.art-canvas-mount[hidden] { display: none; }
.art-canvas-mount:focus-visible { outline: var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary)); outline-offset: -2px; }
.art-canvas-fallback { position: absolute; inset: 0; display: flex; overflow: auto; }
.art-canvas-opening {
  position: absolute;
  z-index: 3;
  top: 10px;
  left: 12px;
  padding: var(--art-space-2) var(--art-space-8);
  border: .5px solid var(--dsw-alias-border-l2);
  border-radius: var(--dsw-radius-sm);
  background: var(--dsw-alias-bg-base);
  color: var(--dsw-alias-label-secondary);
  font-size: var(--dsw-font-xxs-12-font-size);
}
.art-canvas-empty {
  position: absolute;
  z-index: 2;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0;
  padding: var(--art-space-24);
  color: var(--dsw-alias-label-secondary);
  font-size: var(--dsw-font-xxs-12-font-size);
  text-align: center;
  pointer-events: none;
}
.art-canvas-dock {
  position: absolute;
  z-index: 3;
  left: 50%;
  bottom: 14px;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: var(--art-space-2);
  max-width: calc(100% - 20px);
  padding: var(--art-space-4) var(--art-space-6);
  border: 0;
  border-radius: var(--dsw-radius-md);
  background: var(--dsw-alias-bg-layer-1);
  box-shadow: var(--dsw-elevation-panel);
}
.art-dock-button { flex: none; width: 28px; padding: 0; }
.art-dock-button[aria-pressed="true"] { background: var(--dsw-alias-interactive-bg-hover-accent); color: var(--dsw-alias-label-primary); }
.art-canvas-dock .art-dock-zoom,
.art-canvas-dock .art-dock-zoom.visible {
  position: static;
  inset: auto;
  transform: none;
  opacity: 1;
  pointer-events: auto;
  padding: 0;
  border: 0;
  border-radius: 0;
  background: transparent;
  box-shadow: none;
  transition: none;
}
.art-layer-bar { bottom: 62px; gap: var(--art-space-8); max-width: min(560px, calc(100% - 24px)); }
.art-layer-bar-glyph { flex: none; display: flex; color: var(--dsw-alias-label-secondary); }
.art-layer-bar-text { display: flex; flex-direction: column; min-width: 0; gap: 0; }
.art-layer-bar-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: var(--dsw-font-xxs-12-font-size); font-weight: 500; color: var(--dsw-alias-label-primary); }
.art-layer-bar-sub { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: var(--dsw-font-xxxs-11-font-size); color: var(--dsw-alias-label-secondary); }
.art-inspector { display: flex; flex-direction: column; min-height: 0; height: 100%; }
.art-inspector-tabs { flex: 1; min-width: 0; }
.art-layer-tree { flex: 1; min-height: 0; overflow: auto; padding: var(--art-space-4) var(--art-space-6) var(--art-space-8); outline: none; }
.art-layer-tree:focus-visible { outline: var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary)); outline-offset: -2px; }
.art-layer-row { display: flex; align-items: center; gap: var(--art-space-4); height: var(--art-control-sm); padding-inline-end: var(--art-space-4); border-radius: var(--dsw-radius-sm); color: var(--dsw-alias-label-primary); font-size: var(--dsw-font-xxs-12-font-size); }
.art-layer-row:hover, .art-layer-row:focus-within { background: var(--dsw-alias-interactive-bg-hover); }
.art-layer-row.is-selected { background: var(--dsw-alias-interactive-bg-hover-accent); }
.art-layer-caret { flex: none; display: flex; align-items: center; justify-content: center; width: 16px; height: 16px; padding: 0; border: 0; border-radius: var(--dsw-radius-xs); background: none; color: var(--dsw-alias-label-secondary); cursor: pointer; }
.art-layer-icon { flex: none; display: flex; color: var(--dsw-alias-label-secondary); }
.art-layer-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.art-layer-rename { flex: 1; min-width: 0; height: var(--art-control-inline); padding: 0 var(--art-space-4); }
.art-layer-rename input { font: var(--dsw-font-xxs-12); }
.art-layer-actions { display: none; flex: none; gap: var(--art-space-2); }
.art-layer-row:hover .art-layer-actions, .art-layer-row:focus-within .art-layer-actions, .art-layer-row.is-selected .art-layer-actions { display: flex; }
.art-layer-action { display: flex; align-items: center; justify-content: center; width: 20px; height: var(--art-control-inline); padding: 0; border: 0; border-radius: var(--dsw-radius-xs); background: none; color: var(--dsw-alias-label-secondary); cursor: pointer; }
.art-layer-action:hover { background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-primary); }
.art-inspector-empty { margin: 0; padding: var(--art-space-12) var(--art-space-12); color: var(--dsw-alias-label-secondary); font-size: var(--dsw-font-xxs-12-font-size); line-height: var(--dsw-font-xxs-12-line-height); }
.art-inspector-properties { display: flex; flex-direction: column; gap: var(--art-space-12); padding: var(--art-space-8) var(--art-space-12) var(--art-space-16); font-variant-numeric: tabular-nums; }
.art-inspector-node { display: flex; align-items: center; gap: var(--art-space-6); min-width: 0; }
.art-inspector-node-icon { flex: none; display: flex; color: var(--dsw-alias-label-secondary); }
.art-inspector-node-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: var(--dsw-font-xxs-12-font-size); font-weight: 500; }
.art-inspector-node-type { flex: none; color: var(--dsw-alias-label-secondary); font-size: var(--dsw-font-xxxs-11-font-size); }
.art-inspector-actions { display: flex; flex-wrap: wrap; gap: var(--art-space-4); }
.art-inspector .art-inspector-action { flex: none; width: 24px; padding: 0; height: var(--art-control-sm); }
.art-inspector-color { flex: none; width: 22px; height: 22px; padding: 0; border: none; border-radius: var(--dsw-radius-sm); background: none; cursor: pointer; }
.art-inspector-swatches { display: flex; flex-wrap: wrap; gap: var(--art-space-4); }
.art-inspector-swatch { width: 16px; height: 16px; padding: 0; border: 0.5px solid var(--dsw-alias-border-l1); border-radius: var(--dsw-radius-xs); cursor: pointer; }
.art-inspector-swatch:hover { border-color: var(--dsw-alias-border-l2); }
.art-inspector-group { display: flex; flex-direction: column; gap: var(--art-space-6); }
.art-inspector-heading { margin: 0; font-size: var(--dsw-font-xxxs-11-font-size); font-weight: 500; color: var(--dsw-alias-label-secondary); }
.art-inspector-grid { display: grid; grid-template-columns: 1fr 1fr; gap: var(--art-space-6); }
.art-inspector-field { display: flex; align-items: center; gap: var(--art-space-6); min-width: 0; }
.art-inspector-field-label { flex: none; color: var(--dsw-alias-label-tertiary); font-size: var(--dsw-font-xxxs-11-font-size); }
.art-inspector .art-inspector-input { flex: 1; min-width: 0; height: var(--art-control-sm); padding: 0 var(--art-space-6); border-radius: var(--dsw-radius-sm); }
.art-inspector .art-inspector-input input { font-size: var(--dsw-font-xxs-12-font-size); }
.art-inspector-appearance { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: end; gap: var(--art-space-8); }
.art-inspector-switch { display: flex; align-items: center; gap: var(--art-space-6); height: var(--art-control-sm); }
.art-inspector-select { width: 100%; font-variant-numeric: tabular-nums; }
.art-inspector-hint { margin: 0; color: var(--dsw-alias-label-secondary); font-size: var(--dsw-font-xxs-12-font-size); line-height: var(--dsw-font-xxs-12-line-height); }
.op-root { display: flex; width: 100%; height: 100%; min-width: 0; }
.op-canvas { position: relative; flex: 1; min-width: 0; height: 100%; }
.op-surface { width: 100%; height: 100%; }
.op-bridge { display: none; }
/* The engine's IME textarea hides itself with Tailwind classes, which this shell does not ship. */
textarea[data-canvas-text-input] { position: fixed; left: 0; top: 0; width: 1px; height: 1px; margin: 0; border: 0; padding: 0; resize: none; overflow: hidden; opacity: 0; pointer-events: none; }

/* Sheet editor: Harness chrome around an artifact-token grid. */
.art-sheet { flex: 1; min-height: 0; display: flex; flex-direction: column; background: var(--dsw-alias-bg-layer-1); }
.art-sheet-mount { flex: 1; min-height: 0; display: flex; flex-direction: column; }
.art-sheet-editor { flex: 1; min-height: 0; display: flex; flex-direction: column; background: var(--dsw-alias-bg-layer-1); }
.art-sheet-toolbar { flex: none; display: flex; flex-direction: column; gap: var(--art-space-2); padding: var(--art-space-4); border-bottom: .5px solid var(--dsw-alias-border-l2); background: var(--dsw-alias-bg-layer-1); }
.art-sheet-formula { display: flex; align-items: center; gap: var(--art-space-6); min-width: 0; }
.art-sheet-ref { flex: none; min-width: 64px; max-width: 160px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; padding: 0 var(--art-space-6); font-size: var(--dsw-font-xxxs-11-font-size); font-variant-numeric: tabular-nums; color: var(--dsw-alias-label-secondary); }
.art-sheet-formula-input { flex: 1; min-width: 0; height: var(--art-control-sm); padding: 0 var(--art-space-8); border: .5px solid var(--dsw-alias-border-l2); border-radius: var(--dsw-radius-sm); background: var(--dsw-alias-bg-base); color: var(--dsw-alias-label-primary); font: inherit; font-size: var(--dsw-font-xxs-12-font-size); font-family: var(--ds-font-family-code); }
.art-sheet-formula-input:focus { outline: none; border-color: var(--dsw-alias-state-business-primary); }
.art-sheet-formatbar { display: flex; flex-wrap: wrap; align-items: center; gap: 1px; min-width: 0; }
.art-sheet-tool { flex: none; min-width: 26px; padding: 0 var(--art-space-4); }
.art-sheet-tool-text { font-size: var(--dsw-font-xs-13-font-size); }
.art-sheet-format-label { min-width: 64px; justify-content: flex-start; font-size: var(--dsw-font-xxxs-11-font-size); }
.art-sheet-color { position: relative; display: inline-flex; align-items: center; justify-content: center; width: var(--art-control-sm); height: var(--art-control-sm); border-radius: var(--dsw-radius-sm); cursor: pointer; }
.art-sheet-color:hover { background: var(--dsw-alias-interactive-bg-hover); }
.art-sheet-color input { position: absolute; inset: 0; width: 100%; height: 100%; opacity: 0; cursor: pointer; border: 0; }
.art-sheet-color-swatch { width: 16px; height: 16px; border-radius: var(--dsw-radius-xs); border: .5px solid var(--dsw-alias-border-l3); }
.art-sheet-color-letter { display: inline-flex; align-items: center; justify-content: center; background: var(--dsw-alias-bg-base); font-size: var(--dsw-font-xxxs-11-font-size); font-weight: 500; }
.art-sheet-error { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: var(--art-space-6); padding: var(--art-space-24); text-align: center; }
.art-sheet-error > p:first-child { margin: 0; font: var(--dsw-font-xs-13); color: var(--dsw-alias-label-primary); }
.art-sheet-error-detail { margin: 0; max-width: 52ch; color: var(--dsw-alias-label-secondary); font: var(--dsw-font-xxs-12); font-family: var(--ds-font-family-code); }
.art-sheet-gridwrap { position: relative; flex: 1; min-height: 0; min-width: 0; overflow: hidden; background: var(--dsw-alias-bg-base); }
.art-sheet-corner { position: absolute; z-index: 4; top: 0; left: 0; width: 48px; height: var(--art-control-sm); border-right: .5px solid var(--dsw-alias-border-l2); border-bottom: .5px solid var(--dsw-alias-border-l2); background: var(--dsw-alias-bg-layer-2); }
.art-sheet-colheads { position: absolute; z-index: 3; top: 0; left: 48px; right: 0; height: var(--art-control-sm); overflow: hidden; border-bottom: .5px solid var(--dsw-alias-border-l2); background: var(--dsw-alias-bg-layer-2); }
.art-sheet-colheads-inner, .art-sheet-rowheads-inner { position: absolute; top: 0; left: 0; }
.art-sheet-colhead { position: absolute; top: 0; height: var(--art-control-sm); display: flex; align-items: center; justify-content: center; border-right: .5px solid var(--dsw-alias-border-l2); color: var(--dsw-alias-label-secondary); font-size: var(--dsw-font-xxxs-11-font-size); }
.art-sheet-colhead[data-active="true"], .art-sheet-rowhead[data-active="true"] { background: var(--dsw-alias-interactive-bg-hover-accent); color: var(--dsw-alias-label-primary); font-weight: 500; }
.art-sheet-headbutton { width: 100%; height: 100%; padding: 0; border: 0; background: transparent; color: inherit; font: inherit; cursor: pointer; }
.art-sheet-resize { position: absolute; z-index: 1; top: 0; right: -3px; width: 6px; height: 100%; cursor: col-resize; }
.art-sheet-resize::after { content: ''; position: absolute; top: 25%; left: 2px; width: 1px; height: 50%; background: var(--dsw-alias-border-l3); opacity: 0; }
.art-sheet-colhead:hover .art-sheet-resize::after { opacity: 1; }
.art-sheet-rowheads { position: absolute; z-index: 3; top: 28px; left: 0; bottom: 0; width: 48px; overflow: hidden; border-right: .5px solid var(--dsw-alias-border-l2); background: var(--dsw-alias-bg-layer-2); }
.art-sheet-rowhead { position: absolute; left: 0; width: 48px; display: flex; align-items: center; justify-content: center; border-bottom: .5px solid var(--dsw-alias-border-l2); color: var(--dsw-alias-label-secondary); font-size: var(--dsw-font-xxxs-11-font-size); }
.art-sheet-scroll { position: absolute; z-index: 2; top: 28px; left: 48px; right: 0; bottom: 0; overflow: auto; outline: none; }
.art-sheet-scroll:focus-visible { outline: var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary)); outline-offset: -2px; }
.art-sheet-canvas { position: relative; }
.art-sheet-cell { position: absolute; display: flex; align-items: center; overflow: hidden; padding: 0 var(--art-space-6); border-right: .5px solid var(--dsw-alias-border-l2); border-bottom: .5px solid var(--dsw-alias-border-l2); background: var(--dsw-alias-bg-base); color: var(--dsw-alias-label-primary); font-size: var(--dsw-font-xxs-12-font-size); line-height: var(--dsw-font-xxs-12-line-height); white-space: nowrap; }
.art-sheet-selected { position: absolute; z-index: 1; pointer-events: none; background: color-mix(in srgb, var(--dsw-alias-state-business-primary) 12%, transparent); }
.art-sheet-active { position: absolute; z-index: 2; pointer-events: none; box-shadow: inset 0 0 0 2px var(--dsw-alias-state-business-primary); }
.art-sheet-cell-input { position: absolute; z-index: 3; margin: 0; padding: 0 var(--art-space-4); border: 2px solid var(--dsw-alias-state-business-primary); border-radius: 0; background: var(--dsw-alias-bg-base); color: var(--dsw-alias-label-primary); font: inherit; font-size: var(--dsw-font-xxs-12-font-size); outline: none; }
.art-sheet-find { position: absolute; z-index: 5; top: calc(var(--art-control-sm) + var(--art-space-4)); right: 20px; display: flex; flex-direction: column; gap: var(--art-space-4); width: min(340px, calc(100% - 88px)); padding: var(--art-space-6); border: .5px solid var(--dsw-alias-border-l2); border-radius: var(--dsw-radius-md); background: var(--dsw-alias-bg-layer-1); box-shadow: var(--dsw-elevation-panel); }
.art-sheet-find-row { display: flex; align-items: center; gap: var(--art-space-2); min-width: 0; }
.art-sheet-find-input { flex: 1; min-width: 0; height: var(--art-control-sm); padding: 0 var(--art-space-6); border: .5px solid var(--dsw-alias-border-l4); border-radius: var(--dsw-radius-xs); background: var(--dsw-alias-bg-base); color: var(--dsw-alias-label-primary); font: inherit; font-size: var(--dsw-font-xxs-12-font-size); }
.art-sheet-find-input:focus { outline: none; border-color: var(--dsw-alias-state-business-primary); }
.art-sheet-find-count { flex: none; min-width: 64px; text-align: center; color: var(--dsw-alias-label-secondary); font-size: var(--dsw-font-xxxs-11-font-size); font-variant-numeric: tabular-nums; white-space: nowrap; }
.art-sheet-find-tool { flex: none; min-width: 22px; padding: 0 var(--art-space-2); }
.art-sheet-find-action { flex: none; font-size: var(--dsw-font-xxxs-11-font-size); }
.art-sheet-cell[data-match="true"] { box-shadow: inset 0 0 0 1px var(--dsw-alias-state-warn-primary); }
.art-sheet-cell[data-match="current"] { box-shadow: inset 0 0 0 2px var(--dsw-alias-state-business-primary); }
.art-sheet-tabs { flex: none; display: flex; align-items: center; gap: var(--art-space-2); padding: var(--art-space-2) var(--art-space-4); border-top: .5px solid var(--dsw-alias-border-l2); background: var(--dsw-alias-bg-layer-1); overflow-x: auto; }
.art-sheet-tablist { display: flex; align-items: center; gap: var(--art-space-2); min-width: 0; }
.art-sheet-tab { flex: none; }
.art-sheet-tab-button { height: var(--art-control-sm); padding: 0 var(--art-space-8); border: .5px solid transparent; border-radius: var(--dsw-radius-xs); background: transparent; color: var(--dsw-alias-label-secondary); font: inherit; font-size: var(--dsw-font-xxxs-11-font-size); white-space: nowrap; cursor: pointer; }
.art-sheet-tab-button[aria-selected="true"] { border-color: var(--dsw-alias-border-l2); background: var(--dsw-alias-bg-base); color: var(--dsw-alias-label-primary); font-weight: 500; }
.art-sheet-tab-input { width: 96px; height: var(--art-control-sm); padding: 0 var(--art-space-4); border: .5px solid var(--dsw-alias-state-business-primary); border-radius: var(--dsw-radius-xs); background: var(--dsw-alias-bg-base); color: var(--dsw-alias-label-primary); font: inherit; font-size: var(--dsw-font-xxxs-11-font-size); }
.art-sheet-add, .art-sheet-tab-more { flex: none; min-width: 24px; padding: 0 var(--art-space-4); }
@media (max-width: 420px) { .art-sheet-ref { display: none; } .art-sheet-format-label { min-width: 0; } }
.art-sheet-tool[aria-pressed="true"] { background: var(--dsw-alias-interactive-bg-hover-accent); color: var(--dsw-alias-label-primary); }
.art-sheet-status { flex: none; display: flex; align-items: center; gap: var(--art-space-8); min-width: 0; padding: 0 var(--art-space-6); height: var(--art-control-sm); border-top: .5px solid var(--dsw-alias-border-l2); background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-secondary); font-size: var(--dsw-font-xxxs-11-font-size); font-variant-numeric: tabular-nums; overflow: hidden; }
.art-sheet-status-ref { flex: none; max-width: 140px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--dsw-alias-label-primary); }
.art-sheet-status-item { flex: none; white-space: nowrap; }
.art-sheet-status-gap { flex: 1; min-width: 0; }
.art-sheet-zoom { flex: none; display: flex; align-items: center; gap: 1px; }
.art-sheet-zoom-button { flex: none; min-width: 22px; padding: 0 var(--art-space-2); font-size: var(--dsw-font-xs-13-font-size); }
.art-sheet-zoom-value { flex: none; min-width: 44px; height: var(--art-control-sm); padding: 0 var(--art-space-4); border: .5px solid transparent; border-radius: var(--dsw-radius-xs); background: transparent; color: var(--dsw-alias-label-secondary); font: inherit; font-variant-numeric: tabular-nums; cursor: pointer; }
.art-sheet-zoom-value:hover { background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-primary); }
.art-select { min-width: 0; height: var(--art-control-sm); padding: 0 var(--art-space-8); border: .5px solid var(--dsw-alias-border-l4); border-radius: var(--dsw-radius-sm); background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-primary); font: var(--dsw-font-xxs-12); }
.art-select:focus { border-color: var(--dsw-alias-state-business-primary); }
.art-generation { max-width: 180px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.art-state { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: var(--art-space-8); min-height: 96px; padding: var(--art-space-24); text-align: center; color: var(--dsw-alias-label-secondary); font: var(--dsw-font-xs-13); }
.art-state p { margin: 0; max-width: 52ch; }
`;

/** Install the plugin stylesheet once. */
export function installStyles(): void {
  if (typeof document === 'undefined') return;
  if (document.querySelector(`style[data-plugin-css="${STYLE_ID}"]`) !== null) return;
  const tag = document.createElement('style');
  tag.dataset.plugin = 'dsh-artifact-studio';
  tag.dataset.pluginCss = STYLE_ID;
  tag.textContent = CSS + DOC_SURFACE;
  document.head.appendChild(tag);
}
