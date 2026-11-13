const STYLE_ID = 'dsh-artifacts/styles';

/** Every color comes from a Harness token, so light and dark themes follow the app. */
const CSS = `
.art-root {
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  min-width: 0;
  color: var(--dsw-alias-label-primary);
  background: var(--dsw-alias-bg-base);
  font-size: 13px;
  line-height: 1.5;
}
.art-root *, .art-root *::before, .art-root *::after, .art-card * { box-sizing: border-box; }
.art-root ::selection { background: color-mix(in srgb, var(--dsw-alias-brand-primary) 28%, transparent); }
.art-root :focus-visible, .art-card :focus-visible, .art-composer:focus-visible {
  outline: 2px solid var(--dsw-alias-brand-primary);
  outline-offset: 1px;
}
.art-header {
  flex: none;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
  min-height: 44px;
  padding: 8px 12px;
  border-bottom: .5px solid var(--dsw-alias-border-l2);
}
.art-heading { flex: 1 1 auto; min-width: 0; overflow: hidden; display: flex; align-items: center; gap: 8px; }
.art-title {
  min-width: 0;
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 14px;
  font-weight: 600;
  line-height: 1.35;
  color: var(--dsw-alias-label-primary);
}
.art-title-input {
  min-width: 0;
  flex: 1;
  height: 26px;
  padding: 0 6px;
  border: 1px solid var(--dsw-alias-brand-primary);
  border-radius: 6px;
  background: var(--dsw-alias-bg-base);
  color: var(--dsw-alias-label-primary);
  font: inherit;
  font-weight: 600;
}
.art-meta {
  display: flex;
  align-items: baseline;
  gap: 2px;
  min-width: 0;
  color: var(--dsw-alias-label-secondary);
  font-size: 11px;
  line-height: 1.4;
  font-variant-numeric: tabular-nums;
}
.art-meta-text { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.art-save-status { flex: none; white-space: nowrap; }
.art-save-status[data-tone="warn"] { color: var(--dsw-alias-state-warn-primary); }
.art-save-status[data-tone="error"] { color: var(--dsw-alias-state-error-primary); }
.art-badge {
  display: inline-flex;
  align-items: center;
  height: 18px;
  padding: 0 6px;
  border-radius: 4px;
  background: var(--dsw-alias-bg-layer-2);
  color: var(--dsw-alias-label-secondary);
  font-size: 11px;
  font-weight: 500;
  white-space: nowrap;
}
.art-badge[data-scope="library"] {
  background: color-mix(in srgb, var(--dsw-alias-brand-primary) 14%, transparent);
  color: var(--dsw-alias-brand-primary);
}
.art-actions { flex: none; display: flex; align-items: center; gap: 4px; }
.art-icon-button {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  cursor: pointer;
}
.art-icon-button svg { width: 16px; height: 16px; }
.art-icon-button:hover { background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-primary); }
.art-icon-button[aria-pressed="true"] { background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-primary); }
.art-icon-button:disabled { opacity: .45; cursor: default; }
.art-segment {
  display: inline-flex;
  padding: 2px;
  border-radius: 7px;
  background: var(--dsw-alias-bg-layer-2);
}
.art-segment button {
  height: 24px;
  padding: 0 10px;
  border: none;
  border-radius: 5px;
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}
.art-segment button[aria-pressed="true"] {
  background: var(--dsw-alias-bg-base);
  color: var(--dsw-alias-label-primary);
  box-shadow: 0 1px 2px color-mix(in srgb, var(--dsw-alias-label-primary) 12%, transparent);
}
.art-toolbar {
  flex: none;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  padding: 10px 0;
  border-bottom: .5px solid var(--dsw-alias-border-l2);
}
.art-search {
  flex: 1;
  min-width: 0;
  height: 30px;
  padding: 0 10px;
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 7px;
  background: var(--dsw-alias-bg-base);
  color: var(--dsw-alias-label-primary);
  font: inherit;
}
.art-search::placeholder { color: var(--dsw-alias-label-secondary); }
.art-search:focus { outline: none; border-color: var(--dsw-alias-brand-primary); }
.art-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 30px;
  padding: 0 12px;
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 7px;
  background: var(--dsw-alias-bg-base);
  color: var(--dsw-alias-label-primary);
  font: inherit;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  white-space: nowrap;
}
.art-button svg { width: 14px; height: 14px; }
.art-button:hover { background: var(--dsw-alias-bg-layer-2); }
.art-button:disabled { opacity: .5; cursor: default; }
.art-button-primary {
  border-color: transparent;
  background: var(--dsw-alias-brand-primary);
  color: var(--dsw-alias-bg-base);
}
.art-button-primary:hover { background: color-mix(in srgb, var(--dsw-alias-brand-primary) 88%, var(--dsw-alias-label-primary)); }
.art-button-danger { color: var(--dsw-alias-state-error-primary); }
.art-scroll { flex: 1; min-height: 0; overflow: auto; scrollbar-gutter: stable; }
.art-scroll::-webkit-scrollbar, .art-drawer-body::-webkit-scrollbar { width: 10px; height: 10px; }
.art-scroll::-webkit-scrollbar-thumb, .art-drawer-body::-webkit-scrollbar-thumb {
  border: 3px solid transparent;
  border-radius: 10px;
  background: color-mix(in srgb, var(--dsw-alias-label-secondary) 40%, transparent) padding-box;
}
.art-gallery {
  width: 100%;
  max-width: 860px;
  margin-inline: auto;
  padding: 0 12px 24px;
}
.art-section { padding: 4px 0 18px; }
.art-section-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  padding: 10px 0 6px;
}
.art-section-title { margin: 0; font-size: 12px; font-weight: 600; color: var(--dsw-alias-label-primary); }
.art-section-hint { font-size: 11px; color: var(--dsw-alias-label-secondary); }
.art-grid { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(210px, 1fr)); gap: 10px; }
.art-tile {
  position: relative;
  min-width: 0;
  overflow: hidden;
  border: .5px solid var(--dsw-alias-border-l1);
  border-radius: 10px;
  background: var(--dsw-alias-bg-layer-1);
}
.art-tile:hover { border-color: var(--dsw-alias-border-l2); background: var(--dsw-alias-bg-layer-2); }
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
.art-tile-open:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: -2px; }
.art-tile-body { display: flex; flex-direction: column; gap: 3px; padding: 9px 10px 10px; }
.art-tile-title { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; font-weight: 600; }
.art-tile-sub { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 11px; color: var(--dsw-alias-label-secondary); }
.art-tile-scope { align-self: flex-start; margin-top: 2px; }
.art-tile-pin {
  position: absolute;
  z-index: 2;
  top: 6px;
  right: 6px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  padding: 0;
  border: none;
  border-radius: 6px;
  background: color-mix(in srgb, var(--dsw-alias-bg-base) 82%, transparent);
  color: var(--dsw-alias-label-secondary);
  cursor: pointer;
  opacity: .72;
}
.art-tile-pin:hover, .art-tile-pin:focus-visible { opacity: 1; background: var(--dsw-alias-bg-base); color: var(--dsw-alias-label-primary); }
.art-tile-pin[aria-pressed="true"] { opacity: 1; color: var(--dsw-alias-brand-primary); }
.art-tile-pin svg { width: 15px; height: 15px; }
.art-cover { display: block; position: relative; aspect-ratio: 4 / 3; overflow: hidden; background: var(--dsw-alias-bg-layer-2); border-bottom: .5px solid var(--dsw-alias-border-l1); }
.art-cover-frame-wrap { display: block; width: 274px; height: 205px; margin: 0 auto; overflow: hidden; }
.art-cover-frame { display: block; width: 720px; height: 540px; border: 0; transform: scale(.38); transform-origin: top left; pointer-events: none; background: var(--dsw-static-neutral-00); }
.art-cover-fallback { display: flex; align-items: center; justify-content: center; width: 100%; height: 100%; color: var(--dsw-alias-label-secondary); }
.art-cover-fallback svg { width: 26px; height: 26px; opacity: .55; }
.art-cover-doc { display: flex; flex-direction: column; gap: 6px; height: 100%; padding: 14px 14px 10px; background: var(--dsw-alias-bg-base); }
.art-cover-doc-title { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; font-weight: 600; }
.art-cover-doc-text { display: -webkit-box; overflow: hidden; -webkit-line-clamp: 6; -webkit-box-orient: vertical; font-size: 11px; line-height: 1.6; color: var(--dsw-alias-label-secondary); }
.art-gallery-more { display: flex; justify-content: center; padding: 4px 0 10px; }
.art-templates { align-items: stretch; }
.art-templates-title { margin: 18px 0 8px; font-size: 12px; font-weight: 600; }
.art-templates-grid { list-style: none; display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 8px; width: 100%; margin: 0; padding: 0; }
.art-template {
  display: flex;
  align-items: flex-start;
  gap: 9px;
  width: 100%;
  padding: 10px;
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 9px;
  background: var(--dsw-alias-bg-base);
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.art-template:hover { background: var(--dsw-alias-bg-layer-2); border-color: var(--dsw-alias-border-l2); }
.art-template-icon { display: flex; align-items: center; justify-content: center; flex: none; width: 28px; height: 28px; border-radius: 7px; background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-secondary); }
.art-template-icon[data-type="page"] { color: var(--dsw-alias-brand-primary); }
.art-template-text { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.art-template-name { font-size: 12px; font-weight: 600; }
.art-template-hint { font-size: 11px; line-height: 1.5; color: var(--dsw-alias-label-secondary); }
.art-empty {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
  margin: 2px 0 6px;
  padding: 14px;
  border: 1px dashed var(--dsw-alias-border-l1);
  border-radius: 10px;
  color: var(--dsw-alias-label-secondary);
}
.art-empty-title { margin: 0; font-size: 12px; font-weight: 600; color: var(--dsw-alias-label-primary); }
.art-empty-hint { margin: 0; font-size: 12px; line-height: 1.55; max-width: 44ch; }
.art-empty-actions { display: flex; gap: 6px; margin-top: 4px; }
.art-center {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 24px;
  text-align: center;
  color: var(--dsw-alias-label-secondary);
}
.art-center-title { margin: 0; font-size: 13px; font-weight: 600; color: var(--dsw-alias-label-primary); }
.art-center-hint { margin: 0; max-width: 40ch; font-size: 12px; line-height: 1.55; }
.art-note { margin: 0; padding: 4px 8px; font-size: 11px; color: var(--dsw-alias-label-secondary); }
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
.art-drawer-scrim { position: absolute; inset: 0; background: var(--dsw-alias-bg-mask-2); }
.art-drawer-head { flex: none; display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 8px 8px 8px 12px; border-bottom: .5px solid var(--dsw-alias-border-l2); }
.art-drawer-head h2 { margin: 0; font-size: 13px; font-weight: 600; line-height: 1.4; }
.art-drawer-body { flex: 1; min-height: 0; overflow: auto; }
/* The iframe canvas is the artifact's, not plugin chrome: HTML paints white by default, so a page that sets no background must not inherit the host theme. */
.art-frame { flex: 1; width: 100%; min-height: 0; border: none; background: var(--dsw-static-neutral-00); }
.art-source {
  flex: 1;
  min-height: 0;
  width: 100%;
  padding: 12px 14px;
  border: none;
  resize: none;
  background: var(--dsw-alias-bg-base);
  color: var(--dsw-alias-label-primary);
  font-family: ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace;
  font-size: 12px;
  line-height: 1.6;
  tab-size: 2;
}
.art-source:focus { outline: none; }
.art-doc { flex: 1; min-height: 0; overflow: auto; background: var(--dsw-alias-bg-base); }
.art-doc-mount { max-width: 72ch; margin: 0 auto; padding: 28px 28px 80px; }
.art-prose { outline: none; font-size: 14px; line-height: 1.7; color: var(--dsw-alias-label-primary); }
.art-prose > :first-child { margin-top: 0; }
.art-prose h1, .art-prose h2, .art-prose h3 { line-height: 1.25; letter-spacing: -0.01em; margin: 1.6em 0 .5em; }
.art-prose h1 { font-size: 1.75em; }
.art-prose h2 { font-size: 1.35em; }
.art-prose h3 { font-size: 1.12em; }
.art-prose p { margin: .7em 0; }
.art-prose a { color: var(--dsw-alias-brand-primary); text-underline-offset: 2px; }
.art-prose code { padding: .1em .35em; border-radius: 4px; background: var(--dsw-alias-bg-layer-2); font-family: ui-monospace, Menlo, Consolas, monospace; font-size: .88em; }
.art-prose pre { padding: 12px 14px; border-radius: 8px; background: var(--dsw-alias-bg-layer-2); overflow: auto; }
.art-prose pre code { padding: 0; background: none; }
.art-prose blockquote { margin: 1em 0; padding: 0 0 0 14px; border-left: 2px solid var(--dsw-alias-border-l1); color: var(--dsw-alias-label-secondary); }
.art-prose ul, .art-prose ol { padding-left: 1.4em; }
.art-prose ul[data-type="taskList"] { list-style: none; padding-left: .2em; }
.art-prose ul[data-type="taskList"] li { display: flex; gap: 8px; }
.art-prose ul[data-type="taskList"] li > label { flex: none; margin-top: .2em; }
.art-prose ul[data-type="taskList"] li > div { flex: 1; }
.art-prose table { border-collapse: collapse; margin: 1em 0; }
.art-prose th, .art-prose td { padding: 6px 10px; border: 1px solid var(--dsw-alias-border-l1); text-align: left; vertical-align: top; }
.art-prose th { background: var(--dsw-alias-bg-layer-2); font-weight: 600; }
.art-prose hr { border: none; border-top: 1px solid var(--dsw-alias-border-l1); margin: 2em 0; }
.art-history-body { display: flex; flex-direction: column; min-height: 0; }
.art-version {
  display: flex;
  flex-direction: column;
  gap: 2px;
  width: 100%;
  padding: 8px 12px;
  border: none;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.art-version:hover { background: var(--dsw-alias-bg-layer-1); }
.art-version[aria-current="true"] { background: var(--dsw-alias-bg-layer-2); }
.art-version-top { display: flex; align-items: center; justify-content: space-between; gap: 6px; font-size: 12px; font-weight: 500; font-variant-numeric: tabular-nums; }
.art-version-sub { font-size: 11px; color: var(--dsw-alias-label-secondary); }
.art-bar {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 8px 12px;
  border-bottom: .5px solid var(--dsw-alias-border-l2);
  background: var(--dsw-alias-bg-layer-2);
  font-size: 12px;
}
.art-bar[data-tone="warn"] { background: color-mix(in srgb, var(--dsw-alias-state-warn-primary) 14%, var(--dsw-alias-bg-base)); }
.art-bar[data-tone="error"] { background: color-mix(in srgb, var(--dsw-alias-state-error-primary) 12%, var(--dsw-alias-bg-base)); }
.art-bar-text { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
.art-bar-text strong { font-weight: 600; }
.art-bar-actions { flex: none; display: flex; gap: 6px; }
.art-status {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  height: 28px;
  padding: 0 12px;
  border-top: .5px solid var(--dsw-alias-border-l2);
  color: var(--dsw-alias-label-secondary);
  font-size: 11px;
  white-space: nowrap;
}
.art-status span { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.art-menu {
  position: absolute;
  z-index: 20;
  top: calc(100% - 6px);
  right: 6px;
  min-width: 200px;
  padding: 4px;
  border: .5px solid var(--dsw-alias-border-l2);
  border-radius: 10px;
  background: var(--dsw-alias-bg-overlay);
  box-shadow: 0 8px 28px color-mix(in srgb, var(--dsw-alias-label-primary) 16%, transparent);
}
.art-menu button {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  height: 30px;
  padding: 0 10px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--dsw-alias-label-primary);
  font: inherit;
  font-size: 12px;
  text-align: left;
  cursor: pointer;
}
.art-menu[data-align="left"] { left: 56px; right: auto; }
.art-menu button:hover, .art-menu button:focus-visible { background: var(--dsw-alias-bg-layer-2); outline: none; }
.art-menu hr { margin: 4px 0; border: none; border-top: .5px solid var(--dsw-alias-border-l2); }
.art-relative { position: relative; }
.art-form { display: flex; flex-direction: column; gap: 10px; padding: 12px; border-bottom: .5px solid var(--dsw-alias-border-l2); background: var(--dsw-alias-bg-layer-1); }
.art-field { display: flex; flex-direction: column; gap: 4px; font-size: 12px; color: var(--dsw-alias-label-secondary); }
.art-field input[type="text"], .art-field textarea {
  height: 30px;
  padding: 0 9px;
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 7px;
  background: var(--dsw-alias-bg-base);
  color: var(--dsw-alias-label-primary);
  font: inherit;
  font-size: 13px;
}
.art-field textarea { height: 84px; padding: 8px 9px; resize: vertical; line-height: 1.5; }
.art-field input:focus, .art-field textarea:focus { outline: none; border-color: var(--dsw-alias-brand-primary); }
.art-field-hint { font-size: 11px; color: var(--dsw-alias-label-secondary); }
.art-form-actions { display: flex; justify-content: flex-end; gap: 6px; }
.art-radio { display: flex; gap: 6px; }
.art-design { display: flex; flex-direction: column; gap: 18px; padding: 14px 14px 40px; }
.art-design-group { display: flex; flex-direction: column; gap: 8px; }
.art-design-group h3 { margin: 0; font-size: 12px; font-weight: 600; color: var(--dsw-alias-label-primary); }
.art-swatches { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 8px; }
.art-swatch {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 8px;
}
.art-swatch input[type="color"] { flex: none; width: 26px; height: 26px; padding: 0; border: none; border-radius: 6px; background: none; cursor: pointer; }
.art-swatch-text { display: flex; flex-direction: column; min-width: 0; font-size: 11px; color: var(--dsw-alias-label-secondary); }
.art-swatch-text input {
  width: 100%;
  min-width: 0;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--dsw-alias-label-primary);
  font-family: ui-monospace, Menlo, Consolas, monospace;
  font-size: 12px;
}
.art-swatch-text input:focus { outline: none; }
.art-radius-row { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
.art-radius-row label { display: flex; flex-direction: column; gap: 4px; font-size: 11px; color: var(--dsw-alias-label-secondary); }
.art-radius-row input {
  height: 28px;
  padding: 0 8px;
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 6px;
  background: var(--dsw-alias-bg-base);
  color: var(--dsw-alias-label-primary);
  font: inherit;
  font-variant-numeric: tabular-nums;
}
.art-design-preview { overflow: hidden; border: 1px solid var(--dsw-alias-border-l1); border-radius: 10px; }
.art-design-source { font-size: 12px; color: var(--dsw-alias-label-secondary); }
.art-design-actions { display: flex; flex-wrap: wrap; gap: 6px; }
.art-toast {
  position: fixed;
  z-index: 80;
  left: 50%;
  bottom: 24px;
  transform: translateX(-50%);
  max-width: min(560px, 86vw);
  padding: 8px 12px;
  border-radius: 8px;
  background: var(--dsw-alias-label-primary);
  color: var(--dsw-alias-bg-base);
  font-size: 12px;
  box-shadow: 0 8px 24px color-mix(in srgb, var(--dsw-alias-label-primary) 22%, transparent);
  overflow-wrap: anywhere;
}
.art-card {
  display: grid;
  grid-template-columns: 34px 1fr auto;
  align-items: center;
  gap: 10px;
  width: 100%;
  max-width: 520px;
  padding: 10px 10px 10px 12px;
  border: .5px solid var(--dsw-alias-border-l1);
  border-radius: 12px;
  background: var(--dsw-alias-bg-layer-1);
  color: var(--dsw-alias-label-primary);
  font-size: 13px;
}
.art-card-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border-radius: 8px;
  background: var(--dsw-alias-bg-layer-2);
  color: var(--dsw-alias-brand-primary);
}
.art-card-icon svg { width: 18px; height: 18px; }
.art-card-text { min-width: 0; display: flex; flex-direction: column; gap: 1px; }
.art-card-title { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 600; }
.art-card-sub { display: flex; align-items: center; gap: 6px; font-size: 11px; color: var(--dsw-alias-label-secondary); }
.art-card-status { font-size: 12px; color: var(--dsw-alias-label-secondary); }
.art-card-status[data-tone="error"] { color: var(--dsw-alias-state-error-primary); }
.art-composer {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: none;
  border-radius: 7px;
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  cursor: pointer;
}
.art-composer svg { width: 16px; height: 16px; }
.art-composer:hover { background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-primary); }
.art-chip { display: inline-flex; align-items: center; gap: 6px; min-width: 0; }
.art-chip svg { flex: none; width: 14px; height: 14px; color: var(--dsw-alias-label-secondary); }
.art-chip span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.art-workspace { display: flex; align-items: center; gap: 6px; margin-left: auto; min-width: 0; }
.art-workspace-label { font-size: 11px; color: var(--dsw-alias-label-secondary); white-space: nowrap; }
.art-workspace-select {
  max-width: 180px; min-width: 90px; height: 26px; padding: 0 6px;
  border: .5px solid var(--dsw-alias-border-l2); border-radius: 6px;
  background: var(--dsw-alias-bg-base); color: var(--dsw-alias-label-primary);
  font: inherit; font-size: 12px;
}
.art-panel-stack, .art-panel-region { height: 100%; min-height: 0; min-width: 0; }
.art-panel-region[hidden] { display: none; }
.art-root { container-type: inline-size; }
.art-editor-header { position: relative; flex-wrap: wrap; padding: 8px 12px; gap: 10px; }
.art-identity { display: flex; flex-direction: column; min-width: 0; flex: 1; gap: 1px; }
.art-identity .art-meta { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.art-editor-actions { margin-left: auto; flex: none; flex-wrap: wrap; justify-content: flex-end; }
.art-icon-button { min-width: 32px; width: 32px; height: 32px; }
.art-segment button { min-height: 28px; }
.art-inline-form { display: flex; gap: 6px; padding: 8px 12px; }
.art-inline-form input { min-width: 0; flex: 1; padding: 4px 8px; background: var(--dsw-alias-bg-base); color: var(--dsw-alias-label-primary); border: 1px solid var(--dsw-alias-border-l1); border-radius: 6px; font: inherit; }
.art-selection-bar {
  position: absolute;
  z-index: 12;
  left: 50%;
  bottom: 14px;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 8px;
  width: max-content;
  max-width: min(620px, calc(100% - 24px));
  padding: 7px 8px 7px 11px;
  border: .5px solid var(--dsw-alias-border-l2);
  border-radius: 10px;
  background: var(--dsw-alias-bg-overlay);
  box-shadow: 0 8px 24px color-mix(in srgb, var(--dsw-alias-label-primary) 18%, transparent);
}
.art-selection-quote { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; color: var(--dsw-alias-label-secondary); }
.art-selection-bar .art-button { flex: none; }
.art-version-button {
  display: inline-flex;
  align-items: center;
  gap: 1px;
  height: 20px;
  padding: 0 4px;
  border: .5px solid var(--dsw-alias-border-l1);
  border-radius: 5px;
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  font: inherit;
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  cursor: pointer;
}
.art-version-button:hover, .art-version-button[aria-expanded="true"] { background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-primary); }
.art-version-button svg { width: 12px; height: 12px; }
.art-request-body { display: flex; flex-direction: column; gap: 10px; padding: 12px; }
.art-request-body .art-field textarea { height: 132px; }
.art-request-context { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; font-size: 12px; }
.art-request-title { min-width: 0; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 500; }
.art-request-version { color: var(--dsw-alias-label-secondary); font-variant-numeric: tabular-nums; }
.art-request-dot { color: var(--dsw-alias-label-secondary); }
.art-quote { display: flex; flex-direction: column; gap: 4px; padding: 8px 10px; border-left: 2px solid var(--dsw-alias-brand-primary); border-radius: 0 7px 7px 0; background: var(--dsw-alias-bg-layer-1); }
.art-quote-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; font-size: 11px; color: var(--dsw-alias-label-secondary); }
.art-quote-remove { padding: 0; border: none; background: transparent; color: var(--dsw-alias-brand-primary); font: inherit; font-size: 11px; cursor: pointer; }
.art-quote blockquote { margin: 0; max-height: 110px; overflow: auto; white-space: pre-wrap; font-size: 12px; line-height: 1.5; }
.art-request-preview { font-size: 12px; color: var(--dsw-alias-label-secondary); }
.art-request-preview summary { cursor: pointer; }
.art-request-preview pre { max-height: 200px; overflow: auto; margin: 8px 0 0; padding: 10px; border-radius: 8px; background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-primary); white-space: pre-wrap; font-size: 11px; line-height: 1.5; }
.art-dialog-shade { position: absolute; inset: 0; z-index: 40; display: flex; align-items: center; justify-content: center; padding: 16px; background: color-mix(in srgb, var(--dsw-alias-label-primary) 25%, transparent); }
.art-root { position: relative; }
.art-dialog { width: 100%; max-width: 440px; padding: 20px; border-radius: 12px; background: var(--dsw-alias-bg-overlay); color: var(--dsw-alias-label-primary); box-shadow: 0 12px 36px color-mix(in srgb, var(--dsw-alias-label-primary) 20%, transparent); }
.art-dialog h2 { margin: 0 0 8px; font-size: 16px; }
.art-dialog p { margin: 0 0 20px; line-height: 1.6; color: var(--dsw-alias-label-secondary); }
.art-dialog .art-form-actions { flex-wrap: wrap; }
.art-doc-toolbar .art-button[aria-pressed="true"] { background: var(--dsw-alias-bg-layer-2); border-color: var(--dsw-alias-brand-primary); }
.art-doc-toolbar { display: flex; flex-wrap: wrap; gap: 4px; padding: 8px 12px; border-bottom: 1px solid var(--dsw-alias-border-l2); }
.art-bar { flex-wrap: wrap; }
.art-bar-actions { flex-wrap: wrap; }
.art-search { flex-basis: 140px; }
.art-type-select { height: 30px; max-width: 140px; padding: 0 6px; border: 1px solid var(--dsw-alias-border-l1); border-radius: 6px; background: var(--dsw-alias-bg-base); color: var(--dsw-alias-label-primary); font: inherit; }
.art-source:focus-visible, .art-prose:focus-visible, .art-swatch-text input:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: -2px; }
.art-status { height: 28px; padding: 0 12px; }
@container (max-width: 600px) {
  .art-editor-header .art-heading { flex-basis: 100%; }
  .art-editor-actions { width: 100%; justify-content: flex-end; }
  .art-editor-actions .art-segment { margin-right: auto; }
  .art-drawer-layer { position: absolute; inset: 0; z-index: 30; justify-content: flex-end; }
  .art-drawer { width: min(320px, 100%); }
  .art-workspace-label { display: none; }
  .art-doc-mount { padding: 20px 16px 48px; }
}
@container (max-width: 520px) {
  .art-toolbar { flex-direction: column; align-items: stretch; }
  .art-search { width: 100%; flex: none; }
  .art-type-select { width: 100%; max-width: none; }
  .art-toolbar .art-segment { align-self: flex-start; flex-wrap: wrap; }
  .art-gallery { padding: 0 10px 18px; }
  .art-grid { grid-template-columns: 1fr; }
  .art-cover { aspect-ratio: 16 / 10; }
  .art-selection-bar { left: 8px; right: 8px; width: auto; max-width: none; transform: none; }
  .art-selection-quote { flex: 1; }
  .art-request-body { padding: 10px; }
}
@media (pointer: coarse) { .art-icon-button, .art-button, .art-segment button { min-height: 44px; min-width: 44px; } }
@media (prefers-reduced-motion: no-preference) {
  .art-tile, .art-tile-pin, .art-version, .art-icon-button, .art-button { transition: background-color .12s ease-out, color .12s ease-out, border-color .12s ease-out, opacity .12s ease-out; }
  .art-toast { animation: art-rise .18s cubic-bezier(.16, 1, .3, 1); }
}
@keyframes art-rise { from { opacity: 0; transform: translate(-50%, 6px); } to { opacity: 1; transform: translate(-50%, 0); } }
`;

/** Install the plugin stylesheet once. */
export function installStyles(): void {
  if (typeof document === 'undefined') return;
  if (document.querySelector(`style[data-plugin-css="${STYLE_ID}"]`) !== null) return;
  const tag = document.createElement('style');
  tag.dataset.plugin = 'dsh-artifacts';
  tag.dataset.pluginCss = STYLE_ID;
  tag.textContent = CSS;
  document.head.appendChild(tag);
}
