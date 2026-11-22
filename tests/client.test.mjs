import { before, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { installDom, settle } from './dom.mjs';
import { DEFAULT_TOKENS, COLOR_ROLES } from '../dist/contract.js';

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

let React;
let act;
let createRoot;
let plugin;
let chunk;
let sheetChunk;
let canvasFake;
let blobs;

/** What the fake canvas chunk does for the current test. */
const canvasDispatch = { enabled: false, mounts: [], attempts: 0, gate: null, fail: null, snapshot: null, quote: null };

/** A snapshot with no layers, matching an empty canvas. */
function emptyCanvasSnapshot() {
  return {
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
}

const CANVAS_QUOTE = { name: 'Card', path: 'Card', type: 'FRAME', parentName: '', jsx: '<Frame w={320} p={24} bg="#ffffff" />' };

/**
 * Evaluate a built client artifact the way the harness module loader does.
 * @param {string} name - the artifact file.
 * @returns {Promise<{ definition: object, requireModule: Function }>} the loader record.
 */
async function loadArtifact(name) {
  const source = await fs.readFile(path.join(root, name), 'utf8');
  let definition;
  // The built chunk reads the real window (Tiptap listens on it), so the loader hook goes on the jsdom window.
  window.__ModuleLoader__ = { load: (value) => { definition = value; } };
  new Function('window', source)(window);
  delete window.__ModuleLoader__;
  assert.ok(definition, `${name} did not call the module loader`);
  const requireModule = (specifier) => {
    if (['react', 'react-dom', 'react/jsx-runtime', 'react-dom/client'].includes(specifier)) return require(specifier);
    if (specifier === '@deepseek-ai/dsh-client-ui-primitives') return require('./primitives-stub.cjs');
    throw new Error(`Unexpected module ${specifier}`);
  };
  requireModule.async = async (file) => {
    if (file === './client.doc.js') return chunk;
    if (file === './client.sheet.js') return sheetChunk;
    if (file === './client.canvas.js' && canvasFake !== undefined) return canvasFake;
    throw new Error(`Unexpected chunk ${file}`);
  };
  return { definition, requireModule };
}

before(async () => {
  installDom();
  global.IS_REACT_ACT_ENVIRONMENT = true;
  blobs = new Map();
  let counter = 0;
  URL.createObjectURL = (blob) => {
    const url = `blob:test/${(counter += 1)}`;
    blobs.set(url, blob);
    return url;
  };
  URL.revokeObjectURL = (url) => blobs.delete(url);
  React = require('react');
  ({ act } = require('react'));
  ({ createRoot } = require('react-dom/client'));  canvasFake = {
    async mountDesignCanvas(options) {
      canvasDispatch.attempts += 1;
      if (!canvasDispatch.enabled) throw new Error('The canvas chunk is not available in this test.');
      if (canvasDispatch.gate !== null) await canvasDispatch.gate.promise;
      if (canvasDispatch.fail !== null) throw new Error(canvasDispatch.fail);
      const listeners = [];
      const handle = {
        options,
        sources: [],
        destroyed: false,
        snapshot: canvasDispatch.snapshot ?? emptyCanvasSnapshot(),
        setSource(source) { this.sources.push(source); },
        setMode(mode) { this.mode = mode; },
        setTool(tool) { this.tool = tool; },
        undo() { this.undos = (this.undos ?? 0) + 1; },
        redo() { this.redos = (this.redos ?? 0) + 1; },
        zoomToFit() { this.fits = (this.fits ?? 0) + 1; this.emit({ ...this.snapshot, fit: true }); },
        setZoom(zoom) { this.zooms = [...(this.zooms ?? []), zoom]; this.emit({ ...this.snapshot, zoom, fit: false }); },
        getSnapshot() { return this.snapshot; },
        subscribe(listener) {
          listeners.push(listener);
          return () => {
            const index = listeners.indexOf(listener);
            if (index !== -1) listeners.splice(index, 1);
          };
        },
        emit(next) {
          this.snapshot = next;
          for (const listener of [...listeners]) listener(next);
        },
        select(id, mode) {
          this.selects = [...(this.selects ?? []), { id, mode }];
          const rows = this.snapshot.rows.map(row => ({
            ...row,
            selected: mode === 'add' ? (row.id === id ? !row.selected : row.selected) : row.id === id,
          }));
          this.emit({ ...this.snapshot, rows, properties: { ...this.snapshot.properties, ids: rows.filter(row => row.selected).map(row => row.id) } });
        },
        clearSelection() {
          this.cleared = (this.cleared ?? 0) + 1;
          const rows = this.snapshot.rows.map(row => ({ ...row, selected: false }));
          this.emit({ ...this.snapshot, selection: [], rows, properties: { ...this.snapshot.properties, ids: [] } });
        },
        toggleExpand(id) {
          this.expanded = [...(this.expanded ?? []), id];
          const rows = this.snapshot.rows.map(row => row.id === id ? { ...row, expanded: !row.expanded } : row);
          this.emit({ ...this.snapshot, rows });
        },
        toggleVisibility(id) {
          this.visibilities = [...(this.visibilities ?? []), id];
          const rows = this.snapshot.rows.map(row => row.id === id ? { ...row, visible: !row.visible } : row);
          this.emit({ ...this.snapshot, rows });
        },
        toggleLock(id) {
          this.locks = [...(this.locks ?? []), id];
          const rows = this.snapshot.rows.map(row => row.id === id ? { ...row, locked: !row.locked } : row);
          this.emit({ ...this.snapshot, rows });
        },
        rename(id, name) {
          this.renames = [...(this.renames ?? []), { id, name }];
          const rows = this.snapshot.rows.map(row => row.id === id ? { ...row, name } : row);
          this.emit({ ...this.snapshot, rows });
        },
        setVisible(visible) { this.visible = visible; },
        setFamily(family) { this.families = [...(this.families ?? []), family]; },
        setWeight(weight) { this.weights = [...(this.weights ?? []), weight]; },
        preview(prop, value) { this.previews = [...(this.previews ?? []), [prop, value]]; },
        commit(prop, value, previous) { this.commits = [...(this.commits ?? []), [prop, value, previous]]; },
        quoteSelection() { return canvasDispatch.quote ?? CANVAS_QUOTE; },
        destroy() { this.destroyed = true; },
      };
      canvasDispatch.mounts.push(handle);
      return handle;
    },
  };
  const docArtifact = await loadArtifact('client.doc.js');
  assert.equal(docArtifact.definition.chunk, 'client.doc.js');
  chunk = docArtifact.definition.factory(docArtifact.requireModule);
  const sheetArtifact = await loadArtifact('client.sheet.js');
  assert.equal(sheetArtifact.definition.chunk, 'client.sheet.js');
  sheetChunk = sheetArtifact.definition.factory(sheetArtifact.requireModule);
  const main = await loadArtifact('client.js');
  assert.equal(main.definition.id, 'dsh-artifact-studio');
  plugin = main.definition.factory(main.requireModule);
});

beforeEach(() => {
  window.localStorage.clear();
  canvasDispatch.enabled = false;
  canvasDispatch.mounts.length = 0;
  canvasDispatch.attempts = 0;
  canvasDispatch.gate = null;
  canvasDispatch.fail = null;
  canvasDispatch.snapshot = null;
  canvasDispatch.quote = null;
});

const DESIGN_INFO = {
  pages: 1,
  nodes: 3,
  types: { FRAME: 1, TEXT: 2 },
  fonts: ['Inter'],
  warnings: ['Font "Roboto" is not bundled. The preview substitutes a default face.'],
};
const DESIGN_SOURCE = '<Frame w={320} p={24} bg="#ffffff"><Text size={24}>Quarterly</Text></Frame>';

const TOKENS = {
  schemaVersion: 1,
  name: 'Default',
  colors: { ...DEFAULT_TOKENS.colors, primary: '#1a4d8f', accent: '#d97706', surface: '#f8fafc', text: '#0f172a', muted: '#64748b' },
  colorsDark: { ...DEFAULT_TOKENS.colorsDark, primary: '#86a8ff', accent: '#45c9a8', surface: '#15171b', text: '#e8e9ec', muted: '#a0a6b2' },
  typography: { fontFamily: 'system-ui', displayFamily: 'Georgia, serif', monoFamily: 'monospace', scale: [12] },
  spacing: { unit: 4, scale: [4] },
  radius: { sm: 4, md: 8, lg: 12 },
  notes: '',
};

/** A fake host route backed by an in-memory artifact set. */
function fakeHost() {
  const calls = [];
  const state = {
    artifacts: new Map(),
    designCss: ':root { --artifact-color-primary: #1a4d8f; }',
    failNext: null,
    previewHandler: null,
  };
  const manifest = (id, type, title, version, scope = 'workspace') => ({
    schemaVersion: 1,
    id,
    scope,
    type,
    title,
    createdAt: '2026-11-12T00:00:00.000Z',
    updatedAt: new Date().toISOString(),
    version,
    contentFile: type === 'page' ? 'index.html' : type === 'design' ? 'design.jsx' : 'document.md',
    contentBytes: 1,
    contentHash: 'sha256:x',
    source: { origin: 'agent', action: 'create' },
  });
  const rpc = {
    async call(route, endpoint, payload) {
      calls.push({ route, endpoint, payload });
      if (state.failNext !== null && state.failNext.endpoint === endpoint) {
        const error = state.failNext.error;
        state.failNext = null;
        return { ok: false, error };
      }
      const item = state.artifacts.get(payload.id);
      switch (endpoint) {
        case 'list': {
          const items = [...state.artifacts.values()]
            .filter((entry) => entry.manifest.scope === payload.scope)
            .filter((entry) => payload.scope !== 'workspace' || (entry.workspaceId ?? 'ws-a') === payload.workspaceId)
            .filter((entry) => !payload.type || entry.manifest.type === payload.type)
            .filter((entry) => !payload.query || entry.manifest.title.toLowerCase().includes(payload.query.toLowerCase()))
            .map((entry) => entry.manifest);
          return { ok: true, value: { items, total: items.length, hasMore: false, truncated: false } };
        }
        case 'get': {
          if (item === undefined) return { ok: false, error: { code: 'artifact/not-found', message: 'gone', details: {} } };
          const version = payload.version ?? item.manifest.version;
          return { ok: true, value: { manifest: { ...item.manifest, version }, content: version === item.manifest.version ? item.content : `version ${version}`, version, designCss: state.designCss, design: TOKENS, ...(item.designInfo === undefined ? {} : { designInfo: item.designInfo }) } };
        }
        case 'update': {
          if (payload.baseVersion !== item.manifest.version) {
            return { ok: false, error: { code: 'artifact/stale-version', message: 'stale', details: { current: item.manifest.version } } };
          }
          item.manifest = { ...item.manifest, version: item.manifest.version + 1, title: payload.title ?? item.manifest.title };
          if (payload.content !== undefined) item.content = payload.content;
          return { ok: true, value: { manifest: { ...item.manifest } } };
        }
        case 'create': {
          const id = `art_${payload.scope === 'library' ? 'lib' : 'ws'}_new${String(calls.length).padStart(8, '0')}`;
          const entry = { manifest: manifest(id, payload.type, payload.title, 1, payload.scope), content: payload.content, workspaceId: payload.scope === 'workspace' ? payload.workspaceId : undefined };
          state.artifacts.set(id, entry);
          return { ok: true, value: { manifest: entry.manifest } };
        }
        case 'history':
          return {
            ok: true,
            value: {
              versions: Array.from({ length: item.manifest.version }, (_, index) => ({
                version: item.manifest.version - index,
                createdAt: '2026-11-12T00:00:00.000Z',
                contentHash: 'sha256:x',
                contentBytes: 1,
                source: { origin: 'agent', action: 'update' },
              })),
            },
          };
        case 'restore': {
          if (payload.baseVersion !== item.manifest.version) return { ok: false, error: { code: 'artifact/stale-version', message: 'stale', details: {} } };
          item.content = `restored ${payload.version}`;
          item.manifest = { ...item.manifest, version: item.manifest.version + 1 };
          return { ok: true, value: { manifest: { ...item.manifest } } };
        }
        case 'preview':
          if (state.previewHandler !== null) return state.previewHandler(payload);
          return {
            ok: true,
            value: { mediaType: 'image/png', data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB', width: 320, height: 120, info: item.designInfo ?? DESIGN_INFO },
          };
        case 'designSystems':
          return { ok: true, value: { scope: payload.scope, revision: 0, defaultId: null, systems: [] } };
        case 'rebase': {
          if (payload.baseVersion !== item.manifest.version) return { ok: false, error: { code: 'artifact/stale-version', message: 'stale', details: {} } };
          item.manifest = { ...item.manifest, version: item.manifest.version + 1 };
          return { ok: true, value: { manifest: { ...item.manifest } } };
        }
        case 'setDesignDefault':
        case 'saveDesignSystem':
        case 'designSystem':
          return {
            ok: true,
            value: {
              tokens: TOKENS,
              source: 'default',
              css: state.designCss,
            },
          };
        default:
          return { ok: false, error: { code: 'artifact/not-found', message: endpoint, details: {} } };
      }
    },
  };
  return { calls, state, rpc, manifest };
}

/** A plugin context that records registrations. */
function stubContext(host) {
  const records = { tabs: [], slots: [], opened: [], openedTabs: [], panels: [] };
  const ctx = {
    connection: { rpc: host.rpc },
    locale: {
      register: (ns, lang, dict) => records.slots.push({ dict: lang, ns, keys: Object.keys(dict) }),
      bind: () => (key, values) => {
        let text = key;
        for (const [name, value] of Object.entries(values ?? {})) text += `|${name}=${value}`;
        return text;
      },
    },
    sidebarRight: {
      openResource: (address) => records.opened.push(address),
      openTab: (kind) => records.openedTabs.push(kind),
    },
    sidebarRightTabs: { register: (definition) => { records.tabs.push(definition); return () => undefined; } },
    get: (name) => (name === 'layout' ? { selectPanel: (id) => records.panels.push(id) } : undefined),
    workspaces: (() => {
      const snapshot = { items: [{ workspaceId: 'ws-a', path: '/work/a', title: 'Work A', sessionIds: ['ses-a'] }] };
      return { list: { getSnapshot: () => snapshot, subscribe: () => () => undefined } };
    })(),
    slots: {
      inject: (_name, callback) => callback(),
      register: (spec, component) => {
        records.slots.push({ spec, component });
        return () => undefined;
      },
    },
    effect: (callback) => callback(),
  };
  return { ctx, records };
}

function slot(records, name, key) {
  const found = records.slots.find((entry) => entry.spec?.name === name && (entry.spec.key === key || entry.spec.id === key));
  assert.ok(found, `missing slot ${name}:${key}`);
  return found;
}

/** Render a slot component with the props the harness would inject. */
async function render(component, props) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const rootNode = createRoot(container);
  await act(async () => {
    rootNode.render(React.createElement(component, props));
  });
  await act(async () => {
    await settle(60);
  });
  return {
    container,
    rerender: async (next) => {
      await act(async () => rootNode.render(React.createElement(component, next)));
      await act(async () => settle(60));
    },
    unmount: () => act(async () => rootNode.unmount()),
  };
}

const t = (key, values) => {
  let text = key;
  for (const [name, value] of Object.entries(values ?? {})) text += `|${name}=${value}`;
  return text;
};

function tabProps(address, extra = {}) {
  const actions = { bindCommands: () => () => undefined, openResource: extra.open ?? (() => undefined), close: extra.close ?? (() => undefined) };
  return {
    t,
    sessionId: 'ses-a',
    useSessions: (select) => select({ byId: { 'ses-a': { cwd: '/work/a' } } }),
    useWorkspaces: (select) => select({ items: [{ workspaceId: 'ws-a', path: '/work/a', sessionIds: ['ses-a'] }] }),
    useTabInfo: () => ({ tab: { id: 'tab-1', contentId: address, navigation: { address }, actions }, panel: { id: 'p' } }),
  };
}

async function click(element) {
  await act(async () => {
    element.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await settle(60);
  });
}

async function changeValue(element, value) {
  await act(async () => {
    const prototype = element.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, 'value').set.call(element, value);
    element.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

/** Switch a page tab to its code and, when it is still read-only, to the editor. */
async function openSource(view) {
  await click([...view.container.querySelectorAll('.art-segment button')].find(button => button.textContent === 'tab.source'));
  const edit = [...view.container.querySelectorAll('button')].find(button => button.textContent === 'tab.editSource');
  if (edit !== undefined) await click(edit);
}

async function pageFixture(suffix, extra = {}) {
  const host = fakeHost();
  const id = `art_ws_regression${suffix}`;
  host.state.artifacts.set(id, { manifest: host.manifest(id, 'page', 'Regression', 3), content: '<p>saved</p>' });
  const { ctx, records } = stubContext(host);
  plugin.apply(ctx);
  const tab = slot(records, 'sidebar.right.pane.tab', 'dsh-artifact-studio/artifact');
  const view = await render(tab.component, { ...tabProps(`dsh-resource://artifact/workspace/ws-a/${id}`), ...extra });
  await openSource(view);
  return { host, id, view, records };
}

/** Composer actions that record every call; a real composer is never reached. */
function composerActions(options = {}) {
  const calls = [];
  return {
    calls,
    actions: {
      insertQuote: (text) => { calls.push(['insertQuote', text]); return options.quote ?? true; },
      captureInsertion: () => { calls.push(['captureInsertion']); return { start: 0, end: 0, draftRev: 1 }; },
      insertText: (text) => { calls.push(['insertText', text]); return options.text ?? true; },
    },
  };
}

/** Render the full Artifacts page the left sidebar opens. */
async function galleryView(records) {
  const main = slot(records, 'main', 'dsh-artifact-studio-panel');
  return render(main.component, main.spec.inject());
}

/** Render the right sidebar's Artifacts page, bound to session ses-a in Work A. */
async function rightGalleryView(records, extra = {}) {
  const body = slot(records, 'sidebar.right.pane.tab', 'dsh-artifact-studio/artifacts');
  const useWorkspaces = (select) => select({ items: [{ workspaceId: 'ws-a', path: '/work/a', title: 'Work A', sessionIds: ['ses-a'] }] });
  return { body, view: await render(body.component, { ...tabProps(null), useWorkspaces, ...extra }) };
}

/**
 * Choose a full-page scope through its select.
 * @param {object} view - the rendered page.
 * @param {string} value - all, library, or ws:<id>.
 */
async function chooseScope(view, value) {
  await act(async () => {
    const select = view.container.querySelector('[aria-label="scope.label"]');
    select.value = value;
    select.dispatchEvent(new Event('change', { bubbles: true }));
    await settle(220);
  });
}

/** Select the opening characters of a document so its toolbar appears. */
async function selectDoc(view, end = 3) {
  const prose = view.container.querySelector('.art-prose');
  prose.focus();
  await act(async () => { selectIn(prose, 0, end); await settle(80); });
  return prose;
}

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

test('AC-036: reload asks before discarding and cancel retains the draft', async () => {
  const { host, view } = await pageFixture('reload');
  try {
    await changeValue(view.container.querySelector('textarea'), '<p>draft</p>');
    await click(view.container.querySelector('[aria-label="gallery.more"]'));
    await click([...view.container.querySelectorAll('[role="menuitem"]')].find(button => button.textContent === 'tab.reload'));
    assert.ok(view.container.querySelector('[role="dialog"][aria-modal="true"]'));
    await click([...view.container.querySelectorAll('button')].find(button => button.textContent === 'create.cancel'));
    assert.equal(view.container.querySelector('textarea').value, '<p>draft</p>');
    assert.equal(host.calls.filter(call => call.endpoint === 'get').length, 1);
  } finally { await view.unmount(); }
});

test('AC-037: rename keeps a dirty draft and persists its content', async () => {
  const { host, id, view } = await pageFixture('rename');
  try {
    await changeValue(view.container.querySelector('textarea'), '<p>draft rename</p>');
    await click(view.container.querySelector('[aria-label="gallery.more"]'));
    await click([...view.container.querySelectorAll('[role="menuitem"]')].find(button => button.textContent === 'tab.rename'));
    const input = view.container.querySelector('[aria-label="tab.rename"]');
    await changeValue(input, 'Renamed safely');
    await act(async () => { input.closest('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); await settle(30); });
    assert.equal(view.container.querySelector('textarea').value, '<p>draft rename</p>');
    assert.equal(host.state.artifacts.get(id).manifest.title, 'Renamed safely');
    assert.equal(host.state.artifacts.get(id).content, '<p>draft rename</p>');
  } finally { await view.unmount(); }
});

test('AC-038: edits during save wait and use the accepted next version', async () => {
  const { host, id, view } = await pageFixture('serial');
  const original = host.rpc.call;
  const first = deferred();
  let updates = 0;
  host.rpc.call = async (...args) => { if (args[1] === 'update' && ++updates === 1) await first.promise; return original(...args); };
  try {
    await changeValue(view.container.querySelector('textarea'), '<p>first</p>');
    await click(view.container.querySelector('[aria-label="tab.save"]'));
    await changeValue(view.container.querySelector('textarea'), '<p>second</p>');
    await click(view.container.querySelector('[aria-label="tab.save"]'));
    assert.equal(updates, 1, 'a second write started before the first settled');
    await act(async () => { first.resolve(); await settle(60); });
    assert.equal(host.state.artifacts.get(id).content, '<p>second</p>');
    assert.deepEqual(host.calls.filter(call => call.endpoint === 'update').map(call => call.payload.baseVersion), [3, 4]);
    assert.doesNotMatch(view.container.textContent, /tab.conflictTitle/);
  } finally { first.resolve(); await view.unmount(); }
});

test('AC-044: stale history responses cannot replace the latest selection', async () => {
  const { host, view } = await pageFixture('history');
  const original = host.rpc.call;
  const reads = new Map();
  host.rpc.call = async (...args) => {
    if (args[1] === 'get' && args[2].version !== undefined) {
      const hold = deferred(); reads.set(args[2].version, hold);
      await hold.promise;
      const result = await original(...args);
      result.value.version = args[2].version; result.value.content = `version ${args[2].version}`;
      return result;
    }
    return original(...args);
  };
  try {
    await click(view.container.querySelector('[aria-label="tab.history"]'));
    const versions = [...view.container.querySelectorAll('.art-version')];
    await click(versions.find(button => button.textContent.includes('tab.versionOf|version=1')));
    await click(versions.find(button => button.textContent.includes('tab.versionOf|version=2')));
    await act(async () => { reads.get(2).resolve(); await settle(10); reads.get(1).resolve(); await settle(20); });
    assert.match(view.container.querySelector('.art-code').textContent, /version 2/);
    assert.equal(view.container.querySelector('textarea'), null, 'a historical version opened an editor');
  } finally { for (const read of reads.values()) read.resolve(); await view.unmount(); }
});

test('AC-043: switching projects hides old rows while the matching list is pending', async () => {
  const host = fakeHost();
  host.state.artifacts.set('art_ws_oldproject0001', { manifest: host.manifest('art_ws_oldproject0001', 'page', 'Only A', 1), content: '' });
  const hold = deferred(); const original = host.rpc.call;
  host.rpc.call = async (...args) => { if (args[1] === 'list' && args[2].workspaceId === 'ws-b') { await hold.promise; return { ok: true, value: { items: [], total: 0, hasMore: false, truncated: false } }; } return original(...args); };
  const { ctx, records } = stubContext(host);
  ctx.workspaces.list.getSnapshot = () => snapshot;
  const snapshot = { items: [{ workspaceId: 'ws-a', title: 'A' }, { workspaceId: 'ws-b', title: 'B' }] };
  window.localStorage.setItem('dsh-artifact-studio.panel.scope', 'ws:ws-a');
  plugin.apply(ctx); const main = slot(records, 'main', 'dsh-artifact-studio-panel');
  const view = await render(main.component, main.spec.inject());
  try {
    assert.match(view.container.textContent, /Only A/);
    await act(async () => { const select = view.container.querySelector('[aria-label="scope.label"]'); select.value = 'ws:ws-b'; select.dispatchEvent(new Event('change', { bubbles: true })); });
    assert.equal(view.container.querySelector('.art-tile-open'), null);
  } finally { hold.resolve(); await view.unmount(); window.localStorage.clear(); }
});

test('AC-045: back restores the gallery query and scope', async () => {
  const host = fakeHost();
  host.state.artifacts.set('art_ws_browsecontext01', { manifest: host.manifest('art_ws_browsecontext01', 'page', 'Find me', 1), content: '' });
  const { ctx, records } = stubContext(host); plugin.apply(ctx);
  const main = slot(records, 'main', 'dsh-artifact-studio-panel');
  const view = await render(main.component, main.spec.inject());
  try {
    await changeValue(view.container.querySelector('input[type="search"]'), 'Find');
    await chooseScope(view, 'ws:ws-a');
    await click(view.container.querySelector('.art-tile-open'));
    await click(view.container.querySelector('[aria-label="action.back"]'));
    assert.equal(view.container.querySelector('input[type="search"]').value, 'Find');
    assert.equal(view.container.querySelector('[aria-label="scope.label"]').value, 'ws:ws-a');
  } finally { await view.unmount(); }
});

test('AC-036: dirty back can save or cancel and a failed save stays in place', async () => {
  const host = fakeHost(); const id = 'art_ws_backguard0001';
  host.state.artifacts.set(id, { manifest: host.manifest(id, 'page', 'Back guard', 1), content: 'original' });
  const { ctx, records } = stubContext(host); plugin.apply(ctx);
  const main = slot(records, 'main', 'dsh-artifact-studio-panel'); const view = await render(main.component, main.spec.inject());
  try {
    await click(view.container.querySelector('.art-tile-open'));
    await openSource(view);
    await changeValue(view.container.querySelector('textarea'), 'keep me');
    await click(view.container.querySelector('[aria-label="action.back"]'));
    assert.ok(view.container.querySelector('[role="dialog"][aria-modal="true"]'));
    host.state.failNext = { endpoint: 'update', error: { code: 'artifact/storage-failure', message: 'failed', details: {} } };
    await click([...view.container.querySelectorAll('button')].find(button => button.textContent === 'tab.leaveSave'));
    assert.equal(view.container.querySelector('textarea').value, 'keep me');
    assert.ok(view.container.querySelector('[role="dialog"][aria-modal="true"]'));
    await click([...view.container.querySelectorAll('button')].find(button => button.textContent === 'tab.leaveSave'));
    assert.equal(view.container.querySelector('[data-artifact-id]'), null);
    assert.equal(host.state.artifacts.get(id).content, 'keep me');
  } finally { await view.unmount(); }
});

test('AC-036: unmount preserves a recoverable draft by artifact identity', async () => {
  const { host, id, view } = await pageFixture('retain');
  await changeValue(view.container.querySelector('textarea'), 'retained draft'); await view.unmount();
  const { ctx, records } = stubContext(host); plugin.apply(ctx);
  const reopened = await render(slot(records, 'sidebar.right.pane.tab', 'dsh-artifact-studio/artifact').component, tabProps(`dsh-resource://artifact/workspace/ws-a/${id}`));
  try {
    await openSource(reopened);
    assert.equal(reopened.container.querySelector('textarea').value, 'retained draft');
    await click(reopened.container.querySelector('[aria-label="tab.save"]'));
  } finally { await reopened.unmount(); }
});

test('AC-040: export waits for save and pins its version or stops on failure', async () => {
  const { host, view } = await pageFixture('output');
  const original = host.rpc.call; const outputs = [];
  host.rpc.call = async (...args) => { if (args[1] === 'export') { outputs.push(args[2]); return { ok: true, value: { path: '/export.html', fileName: 'export.html', bytes: 0, mediaType: 'text/html', data: '' } }; } return original(...args); };
  window.HTMLAnchorElement.prototype.click = () => undefined;
  try {
    await changeValue(view.container.querySelector('textarea'), 'new output');
    await click(view.container.querySelector('[aria-label="tab.export"]'));
    await click([...view.container.querySelectorAll('[role="menuitem"]')].find(button => button.textContent === 'export.html'));
    assert.equal(outputs[0].version, 4);
    assert.equal(host.calls.filter(call => call.endpoint === 'update')[0].payload.content, 'new output');
    await changeValue(view.container.querySelector('textarea'), 'failed output');
    host.state.failNext = { endpoint: 'update', error: { code: 'artifact/stale-version', message: 'stale', details: { current: 5 } } };
    await click(view.container.querySelector('[aria-label="tab.export"]'));
    await click([...view.container.querySelectorAll('[role="menuitem"]')].find(button => button.textContent === 'export.html'));
    assert.equal(outputs.length, 1);
  } finally { await view.unmount(); }
});

test('AC-039: conflict copy failure keeps a selectable draft and requires explicit discard', async () => {
  const { host, id, view } = await pageFixture('copyconflict');
  try {
    await changeValue(view.container.querySelector('textarea'), 'my conflicting draft');
    host.state.artifacts.get(id).manifest.version += 1;
    await click(view.container.querySelector('[aria-label="tab.save"]'));
    await click([...view.container.querySelectorAll('button')].find(button => button.textContent === 'tab.copyDraft'));
    assert.ok([...view.container.querySelectorAll('textarea')].some(input => input.value === 'my conflicting draft'));
    await click([...view.container.querySelectorAll('button')].find(button => button.textContent === 'tab.discardReload'));
    assert.ok(view.container.querySelector('[role="dialog"][aria-modal="true"]'));
  } finally { await view.unmount(); }
});

test('AC-048: visible heading control updates the document and round-trips Markdown', async () => {
  const changes = [];
  const view = await render(plugin.DocView, { markdown: 'Heading text', revision: '1', editable: true, label: 'Formatting doc', loadingLabel: 'Loading', failedLabel: 'Failed', onChange: text => changes.push(text), onSave: () => undefined, t });
  try {
    assert.equal(view.container.querySelector('.art-doc-toolbar'), null, 'the toolbar shows without a selection');
    await selectDoc(view);
    await click([...view.container.querySelectorAll('button')].find(button => button.textContent === 'format.heading'));
    assert.ok(view.container.querySelector('h2'));
    assert.equal([...view.container.querySelectorAll('button')].find(button => button.textContent === 'format.heading').getAttribute('aria-pressed'), 'true');
    assert.match(changes.at(-1), /^## Heading text/);
    const mount = document.createElement('div'); document.body.appendChild(mount);
    const handle = chunk.mountDocEditor({ element: mount, markdown: changes.at(-1), editable: true, label: 'Roundtrip', onChange: () => undefined });
    assert.match(handle.getMarkdown(), /^## Heading text/); handle.destroy(); mount.remove();
  } finally { await view.unmount(); }
});

test('AC-036: document reload replaces editor content only after the read completes', async () => {
  const host = fakeHost(); const id = 'art_ws_docreload0001';
  host.state.artifacts.set(id, { manifest: host.manifest(id, 'doc', 'Reload doc', 1), content: '# Original' });
  const { ctx, records } = stubContext(host); plugin.apply(ctx);
  const view = await render(slot(records, 'sidebar.right.pane.tab', 'dsh-artifact-studio/artifact').component, tabProps(`dsh-resource://artifact/workspace/ws-a/${id}`));
  try {
    host.state.artifacts.get(id).content = '# External'; host.state.artifacts.get(id).manifest.version = 2;
    await click(view.container.querySelector('[aria-label="gallery.more"]'));
    const original = host.rpc.call; const hold = deferred();
    host.rpc.call = async (...args) => { if (args[1] === 'get') await hold.promise; return original(...args); };
    await click([...view.container.querySelectorAll('[role="menuitem"]')].find(button => button.textContent === 'tab.reload'));
    await act(async () => { hold.resolve(); await settle(40); });
    assert.match(view.container.querySelector('.art-prose').textContent, /External/);
  } finally { await view.unmount(); }
});

test('AC-036: two views share a draft and closing one cannot remove its recovery', async () => {
  const { host, id, view } = await pageFixture('twoviews');
  const { ctx, records } = stubContext(host); plugin.apply(ctx);
  const component = slot(records, 'sidebar.right.pane.tab', 'dsh-artifact-studio/artifact').component;
  const props = tabProps(`dsh-resource://artifact/workspace/ws-a/${id}`);
  const second = await render(component, props);
  await changeValue(view.container.querySelector('textarea'), 'shared recovered draft');
  await second.unmount(); await view.unmount();
  const reopened = await render(component, props);
  try {
    await openSource(reopened);
    assert.equal(reopened.container.querySelector('textarea').value, 'shared recovered draft');
    await click(reopened.container.querySelector('[aria-label="tab.save"]'));
  } finally { await reopened.unmount(); }
});

test('AC-039: edits made while restore is pending remain recoverable', async () => {
  const { host, view } = await pageFixture('restorerace');
  const original = host.rpc.call; const hold = deferred();
  host.rpc.call = async (...args) => { if (args[1] === 'restore') await hold.promise; return original(...args); };
  try {
    await click(view.container.querySelector('[aria-label="tab.history"]'));
    await click([...view.container.querySelectorAll('.art-version')].find(button => button.textContent.includes('tab.versionOf|version=1')));
    await click([...view.container.querySelectorAll('button')].find(button => button.textContent === 'tab.restoreThis'));
    await click([...view.container.querySelectorAll('button')].find(button => button.textContent === 'tab.backToCurrent'));
    await changeValue(view.container.querySelector('textarea'), 'typing during restore');
    await act(async () => { hold.resolve(); await settle(40); });
    assert.equal(view.container.querySelector('textarea').value, 'typing during restore');
    assert.match(view.container.textContent, /tab.conflictTitle/);
  } finally { hold.resolve(); await view.unmount(); }
});

test('AC-036: retained unmounted drafts still warn before window unload', async () => {
  const { view } = await pageFixture('unload');
  await changeValue(view.container.querySelector('textarea'), 'unmounted draft'); await view.unmount();
  const event = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(event);
  assert.equal(event.defaultPrevented, true);
});

test('AC-048: lazy document mount uses the newest content and editability', async () => {
  const hold = deferred();
  const main = await loadArtifact('client.js');
  const delayedRequire = specifier => main.requireModule(specifier);
  delayedRequire.async = () => hold.promise;
  const fresh = main.definition.factory(delayedRequire);
  const props = { markdown: 'Current', revision: 'old', editable: true, label: 'Latest props', loadingLabel: 'Loading', failedLabel: 'Failed', onChange: () => undefined, onSave: () => undefined, t };
  const view = await render(fresh.DocView, props);
  try {
    await view.rerender({ ...props, markdown: 'Historical', revision: 'new', editable: false });
    await act(async () => { hold.resolve(chunk); await settle(20); });
    assert.equal(view.container.querySelector('.art-prose').textContent, 'Historical');
    assert.equal(view.container.querySelector('.art-prose').getAttribute('contenteditable'), 'false');
  } finally { hold.resolve(chunk); globalThis.__dshArtifactsRequireAsync = main.requireModule.async; await view.unmount(); }
});

test('AC-038: document views receive the same pending draft', async () => {
  const host = fakeHost(); const id = 'art_ws_docshared0001';
  host.state.artifacts.set(id, { manifest: host.manifest(id, 'doc', 'Shared doc', 1), content: '# Original' });
  const { ctx, records } = stubContext(host); plugin.apply(ctx);
  const component = slot(records, 'sidebar.right.pane.tab', 'dsh-artifact-studio/artifact').component;
  const props = tabProps(`dsh-resource://artifact/workspace/ws-a/${id}`);
  const first = await render(component, props); const second = await render(component, props);
  try {
    await selectDoc(first);
    await click([...first.container.querySelectorAll('button')].find(button => button.textContent === 'format.bulletList'));
    assert.ok(first.container.querySelector('.art-prose ul'));
    assert.ok(second.container.querySelector('.art-prose ul'));
  } finally { await first.unmount(); await second.unmount(); }
});

test('AC-040: output is blocked while a historical version is still loading', async () => {
  const { host, view } = await pageFixture('historyoutput');
  const original = host.rpc.call; const hold = deferred();
  host.rpc.call = async (...args) => { if (args[1] === 'get' && args[2].version !== undefined) await hold.promise; return original(...args); };
  try {
    await click(view.container.querySelector('[aria-label="tab.history"]'));
    await click([...view.container.querySelectorAll('.art-version')].find(button => button.textContent.includes('tab.versionOf|version=1')));
    assert.equal(view.container.querySelector('[aria-label="tab.export"]').disabled, true);
    assert.equal(host.calls.some(call => call.endpoint === 'export'), false);
    await act(async () => { hold.resolve(); await settle(20); });
    assert.equal(view.container.querySelector('[aria-label="tab.export"]').disabled, false);
  } finally { hold.resolve(); await view.unmount(); }
});

test('AC-009: page iframe has only allow-scripts', async () => {
  const host = fakeHost();
  host.state.artifacts.set('art_ws_page000001', { manifest: host.manifest('art_ws_page000001', 'page', 'Dash', 1), content: '<h1>Hi</h1>' });
  const { ctx, records } = stubContext(host);
  plugin.apply(ctx);
  const tab = slot(records, 'sidebar.right.pane.tab', 'dsh-artifact-studio/artifact');
  const view = await render(tab.component, tabProps('dsh-resource://artifact/workspace/ws-a/art_ws_page000001'));
  const frame = view.container.querySelector('iframe');
  assert.ok(frame, 'no iframe');
  assert.equal(frame.getAttribute('sandbox'), 'allow-scripts');
  assert.equal(frame.getAttribute('title'), 'tab.frameTitle|title=Dash');
  await view.unmount();
});

test('AC-010: page documents carry the network-blocking policy', async () => {
  const host = fakeHost();
  host.state.artifacts.set('art_ws_page000002', { manifest: host.manifest('art_ws_page000002', 'page', 'Net', 1), content: '<script>fetch("https://evil.example")</script>' });
  const { ctx, records } = stubContext(host);
  plugin.apply(ctx);
  const tab = slot(records, 'sidebar.right.pane.tab', 'dsh-artifact-studio/artifact');
  const view = await render(tab.component, tabProps('dsh-resource://artifact/workspace/ws-a/art_ws_page000002'));
  const frame = view.container.querySelector('iframe');
  const html = await blobs.get(frame.getAttribute('src')).text();
  assert.match(html, /http-equiv="Content-Security-Policy"/);
  assert.match(html, /connect-src &#39;none&#39;/);
  assert.match(html, /default-src &#39;none&#39;/);
  assert.ok(html.indexOf('Content-Security-Policy') < html.indexOf('fetch('), 'the policy must precede page scripts');
  await view.unmount();
});

test('AC-011: save refreshes the same tab', async () => {
  const host = fakeHost();
  host.state.artifacts.set('art_ws_page000003', { manifest: host.manifest('art_ws_page000003', 'page', 'Edit', 1), content: '<p>one</p>' });
  const { ctx, records } = stubContext(host);
  plugin.apply(ctx);
  const tab = slot(records, 'sidebar.right.pane.tab', 'dsh-artifact-studio/artifact');
  const view = await render(tab.component, tabProps('dsh-resource://artifact/workspace/ws-a/art_ws_page000003'));
  await openSource(view);
  const textarea = view.container.querySelector('textarea');
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
    setter.call(textarea, '<p>two</p>');
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    await settle(20);
  });
  await click(view.container.querySelector('[aria-label="tab.save"]'));
  assert.equal(host.state.artifacts.get('art_ws_page000003').content, '<p>two</p>');
  const previewButton = [...view.container.querySelectorAll('.art-segment button')].find((button) => button.textContent === 'tab.preview');
  await click(previewButton);
  const frame = view.container.querySelector('iframe');
  assert.match(await blobs.get(frame.getAttribute('src')).text(), /<p>two<\/p>/);
  assert.match(view.container.textContent, /gallery\.version\|version=2/);
  assert.doesNotMatch(view.container.textContent, /tab\.conflictTitle/, 'a tab must not treat its own save as a conflict');
  await view.unmount();
});

test('AC-012: doc editor loads Markdown and saves Markdown', async () => {
  const markdown = '# Title\n\n- one\n- two\n\n[link](https://example.com)\n\n```js\nconst a = 1;\n```\n';
  const mount = document.createElement('div');
  document.body.appendChild(mount);
  const changes = [];
  const handle = chunk.mountDocEditor({ element: mount, markdown, editable: true, label: 'Doc', onChange: (value) => changes.push(value) });
  const out = handle.getMarkdown();
  for (const part of ['# Title', '- one', '[link](https://example.com)', '```js', 'const a = 1;']) {
    assert.ok(out.includes(part), `missing ${part} in ${out}`);
  }
  handle.setMarkdown('# Replaced');
  assert.equal(changes.length, 0, 'programmatic content must not count as an edit');
  assert.match(handle.getMarkdown(), /^# Replaced/);
  assert.ok(mount.querySelector('[aria-label="Doc"]'));
  handle.destroy();
});

test('AC-015: tool card opens the artifact tab', async () => {
  const host = fakeHost();
  const { ctx, records } = stubContext(host);
  plugin.apply(ctx);
  const card = slot(records, 'tool.call.toolview', 'artifact_create');
  assert.ok(slot(records, 'tool.call.toolview', 'artifact_update'));
  const meta = { kind: 'artifact', v: 1, id: 'art_ws_card000001', scope: 'workspace', type: 'page', title: 'Q3 dashboard', version: 3, workspaceId: 'ws-a' };
  const view = await render(card.component, { t, phase: 'result', toolName: 'artifact_create', block: { isError: false, meta, content: [] } });
  assert.match(view.container.textContent, /Q3 dashboard/);
  assert.match(view.container.textContent, /type\.page/);
  assert.match(view.container.textContent, /gallery\.version\|version=3/);
  await click(view.container.querySelector('button'));
  assert.deepEqual(records.opened, ['dsh-resource://artifact/workspace/ws-a/art_ws_card000001']);
  await view.unmount();
  const failed = await render(card.component, { t, phase: 'result', block: { isError: true, content: [{ type: 'text', text: 'artifact/too-large' }] } });
  assert.match(failed.container.textContent, /card\.failed/);
  assert.match(failed.container.textContent, /too-large/);
  await failed.unmount();
});

test('AC-016: artifact tab restores from its address', async () => {
  const host = fakeHost();
  host.state.artifacts.set('art_lib_restore0001', { manifest: host.manifest('art_lib_restore0001', 'doc', 'Lib doc', 4, 'library'), content: '# Lib' });
  const { ctx, records } = stubContext(host);
  plugin.apply(ctx);
  const definition = records.tabs.find((item) => item.kind === 'artifact');
  assert.ok(definition.patterns.includes('dsh-resource://artifact/**'));
  assert.equal(definition.canOpen('dsh-resource://artifact/library/art_lib_restore0001'), true);
  assert.equal(definition.canOpen('dsh-resource://artifact/library/../../x'), false);
  const tab = slot(records, 'sidebar.right.pane.tab', 'dsh-artifact-studio/artifact');
  const view = await render(tab.component, tabProps('dsh-resource://artifact/library/art_lib_restore0001'));
  const get = host.calls.find((call) => call.endpoint === 'get');
  assert.deepEqual(get.payload, { scope: 'library', id: 'art_lib_restore0001' });
  assert.match(view.container.textContent, /Lib doc/);
  assert.match(view.container.textContent, /scope\.library/);
  await view.unmount();
});

test('AC-008: the full page lists projects and the library and opens a row', async () => {
  const host = fakeHost();
  host.state.artifacts.set('art_ws_gallery0001', { manifest: host.manifest('art_ws_gallery0001', 'page', 'Alpha report', 1), content: '' });
  host.state.artifacts.set('art_lib_gallery001', { manifest: host.manifest('art_lib_gallery001', 'doc', 'Brand notes', 2, 'library'), content: '' });
  const { ctx, records } = stubContext(host);
  plugin.apply(ctx);
  const view = await galleryView(records);
  const lists = host.calls.filter((call) => call.endpoint === 'list').map((call) => call.payload);
  assert.ok(lists.some((payload) => payload.scope === 'workspace' && payload.workspaceId === 'ws-a'));
  assert.ok(lists.some((payload) => payload.scope === 'library'));
  assert.match(view.container.textContent, /Alpha report/);
  assert.match(view.container.textContent, /Brand notes/);
  const libraryRow = [...view.container.querySelectorAll('.art-tile-open')].find((element) => element.textContent.includes('Brand notes'));
  await click(libraryRow);
  const get = host.calls.find((call) => call.endpoint === 'get' && call.payload.id === 'art_lib_gallery001' && call.payload.version === undefined);
  assert.equal(get.payload.scope, 'library');
  assert.ok(view.container.querySelector('[data-artifact-id="art_lib_gallery001"]'), 'the library artifact did not open in place');
  await view.unmount();
});

test('AC-086: the full page has one scope control with all projects, each project, and the library', async () => {
  const host = fakeHost();
  host.state.artifacts.set('art_ws_scope08601', { workspaceId: 'ws-a', manifest: host.manifest('art_ws_scope08601', 'page', 'Project only', 1), content: '' });
  host.state.artifacts.set('art_lib_scope08601', { manifest: host.manifest('art_lib_scope08601', 'doc', 'Library only', 1, 'library'), content: '' });
  const { ctx, records } = stubContext(host);
  plugin.apply(ctx);
  const view = await galleryView(records);
  const lastList = () => host.calls.filter((call) => call.endpoint === 'list').slice(-1)[0].payload;
  try {
    const select = view.container.querySelector('[aria-label="scope.label"]');
    assert.ok(select, 'no scope control');
    assert.equal(select.value, 'all', 'the page did not start on all projects');
    assert.deepEqual([...select.querySelectorAll('option')].map((option) => option.value), ['all', 'ws:ws-a', 'library']);
    assert.equal(view.container.querySelector('.art-toolbar [role="tablist"][aria-label="filter.scope"]'), null, 'the storage filter is still there');
    assert.doesNotMatch(view.container.textContent, /filter\.all/, 'the old storage filter still renders');
    assert.match(view.container.textContent, /Project only/);
    assert.match(view.container.textContent, /Library only/);
    assert.equal(window.localStorage.getItem('dsh-artifact-studio.panel.scope'), 'all');

    await chooseScope(view, 'ws:ws-a');
    assert.match(view.container.textContent, /Project only/);
    assert.doesNotMatch(view.container.textContent, /Library only/);
    assert.equal(lastList().scope, 'workspace');
    assert.equal(window.localStorage.getItem('dsh-artifact-studio.panel.scope'), 'ws:ws-a');

    await chooseScope(view, 'library');
    assert.match(view.container.textContent, /Library only/);
    assert.doesNotMatch(view.container.textContent, /Project only/);
    assert.equal(lastList().scope, 'library');
    assert.equal(window.localStorage.getItem('dsh-artifact-studio.panel.scope'), 'library');
  } finally { await view.unmount(); }
});

test('AC-087: all projects merges every project and the library with project labels', async () => {
  const host = fakeHost();
  const alphaManifest = { ...host.manifest('art_ws_global08701', 'page', 'Alpha page', 1), updatedAt: '2026-01-01T00:00:00.000Z' };
  const betaManifest = { ...host.manifest('art_ws_global08702', 'doc', 'Beta doc', 1), updatedAt: '2026-02-01T00:00:00.000Z' };
  const sharedManifest = { ...host.manifest('art_lib_global0871', 'page', 'Shared page', 1, 'library'), updatedAt: '2026-03-01T00:00:00.000Z' };
  host.state.artifacts.set('art_ws_global08701', { workspaceId: 'ws-a', manifest: alphaManifest, content: '' });
  host.state.artifacts.set('art_ws_global08702', { workspaceId: 'ws-b', manifest: betaManifest, content: '' });
  host.state.artifacts.set('art_lib_global0871', { manifest: sharedManifest, content: '' });
  const { ctx, records } = stubContext(host);
  const snapshot = { items: [
    { workspaceId: 'ws-a', title: 'Work A' },
    { workspaceId: 'ws-b', title: 'Work B' },
  ] };
  ctx.workspaces.list.getSnapshot = () => snapshot;
  plugin.apply(ctx);
  const view = await galleryView(records);
  try {
    assert.match(view.container.textContent, /Alpha page/);
    assert.match(view.container.textContent, /Beta doc/);
    assert.match(view.container.textContent, /Shared page/);
    const order = [...view.container.querySelectorAll('.art-tile-open')].map((element) => element.querySelector('.art-tile-title').textContent);
    assert.deepEqual(order, ['Shared page', 'Beta doc', 'Alpha page'], 'the merged list is not newest first');
    const alpha = [...view.container.querySelectorAll('.art-tile-open')].find((element) => element.textContent.includes('Alpha page'));
    const beta = [...view.container.querySelectorAll('.art-tile-open')].find((element) => element.textContent.includes('Beta doc'));
    const shared = [...view.container.querySelectorAll('.art-tile-open')].find((element) => element.textContent.includes('Shared page'));
    assert.match(alpha.textContent, /Work A/);
    assert.match(beta.textContent, /Work B/);
    assert.match(shared.textContent, /scope\.library/);
    const lists = host.calls.filter((call) => call.endpoint === 'list').map((call) => call.payload);
    assert.ok(lists.some((payload) => payload.scope === 'workspace' && payload.workspaceId === 'ws-a'));
    assert.ok(lists.some((payload) => payload.scope === 'workspace' && payload.workspaceId === 'ws-b'));
    assert.ok(lists.some((payload) => payload.scope === 'library'));
  } finally { await view.unmount(); }
});

test('AC-088: a failed project does not hide the other projects in the global list', async () => {
  const host = fakeHost();
  host.state.artifacts.set('art_ws_global08801', { workspaceId: 'ws-a', manifest: host.manifest('art_ws_global08801', 'page', 'Visible A', 1), content: '' });
  host.state.artifacts.set('art_ws_global08802', { workspaceId: 'ws-b', manifest: host.manifest('art_ws_global08802', 'page', 'Hidden B', 1), content: '' });
  const original = host.rpc.call;
  host.rpc.call = async (route, endpoint, payload, signal) => {
    if (endpoint === 'list' && payload.workspaceId === 'ws-b') return { ok: false, error: { code: 'artifact/storage-failure', message: 'failed', details: {} } };
    return original(route, endpoint, payload, signal);
  };
  const { ctx, records } = stubContext(host);
  const snapshot = { items: [
    { workspaceId: 'ws-a', title: 'Work A' },
    { workspaceId: 'ws-b', title: 'Work B' },
  ] };
  ctx.workspaces.list.getSnapshot = () => snapshot;
  plugin.apply(ctx);
  const view = await galleryView(records);
  try {
    await act(async () => settle(80));
    assert.match(view.container.textContent, /Visible A/);
    assert.doesNotMatch(view.container.textContent, /Hidden B/);
    const bar = view.container.querySelector('.art-bar');
    assert.match(bar.textContent, /gallery\.failedProjects/);
    assert.equal(bar.getAttribute('data-tone'), 'warn');
  } finally { await view.unmount(); }

  const failing = fakeHost();
  const failingOriginal = failing.rpc.call;
  failing.rpc.call = async (route, endpoint, payload, signal) => {
    if (endpoint === 'list') return { ok: false, error: { code: 'artifact/storage-failure', message: 'failed', details: {} } };
    return failingOriginal(route, endpoint, payload, signal);
  };
  const failingContext = stubContext(failing);
  plugin.apply(failingContext.ctx);
  const failed = await galleryView(failingContext.records);
  try {
    assert.ok(failed.container.querySelector('[role="alert"]'), 'no error state after every source failed');
    assert.match(failed.container.textContent, /error\.generic/);
  } finally { await failed.unmount(); }
});

test('AC-089: creating from all projects targets the named project', async () => {
  const host = fakeHost();
  host.state.artifacts.set('art_ws_create08901', { workspaceId: 'ws-a', manifest: host.manifest('art_ws_create08901', 'page', 'Alpha page', 1), content: '' });
  host.state.artifacts.set('art_ws_create08902', { workspaceId: 'ws-b', manifest: host.manifest('art_ws_create08902', 'doc', 'Beta doc', 1), content: '' });
  host.state.artifacts.set('art_lib_create08901', { manifest: host.manifest('art_lib_create08901', 'doc', 'Library doc', 1, 'library'), content: '' });
  const { ctx, records } = stubContext(host);
  const snapshot = { items: [
    { workspaceId: 'ws-a', title: 'Work A' },
    { workspaceId: 'ws-b', title: 'Work B' },
  ] };
  ctx.workspaces.list.getSnapshot = () => snapshot;
  plugin.apply(ctx);
  const view = await galleryView(records);
  try {
    await changeValue(view.container.querySelector('input[type="search"]'), 'Beta');
    await act(async () => settle(220));
    assert.match(view.container.textContent, /Beta doc/);
    assert.doesNotMatch(view.container.textContent, /Alpha page/);
    assert.doesNotMatch(view.container.textContent, /Library doc/);

    await changeValue(view.container.querySelector('input[type="search"]'), '');
    await act(async () => settle(220));
    await click([...view.container.querySelectorAll('.art-toolbar button')].find((button) => button.textContent === 'type.doc'));
    await act(async () => settle(220));
    assert.match(view.container.textContent, /Beta doc/);
    assert.match(view.container.textContent, /Library doc/);
    assert.doesNotMatch(view.container.textContent, /Alpha page/);

    await click(findButton(view, 'gallery.create'));
    const items = [...view.container.querySelectorAll('[role="menuitem"]')];
    assert.equal(items.length, 4);
    assert.ok(items.some((item) => item.textContent.includes('type.design') || item.textContent.includes('gallery.newDesign')), 'the create menu has no design entry');
    assert.ok(items.some((item) => item.textContent.includes('gallery.newSheet')), 'the create menu has no sheet entry');
    assert.ok(items.every((item) => item.textContent.includes('Work A')), 'the create menu did not name the target project');
    await click(items[0]);
    const create = host.calls.find((call) => call.endpoint === 'create');
    assert.ok(create, 'no create call was made');
    assert.equal(create.payload.scope, 'workspace');
    assert.equal(create.payload.workspaceId, 'ws-a');
  } finally { await view.unmount(); }

  const empty = fakeHost();
  const { ctx: emptyCtx, records: emptyRecords } = stubContext(empty);
  const emptySnapshot = { items: [] };
  emptyCtx.workspaces.list.getSnapshot = () => emptySnapshot;
  plugin.apply(emptyCtx);
  const emptyView = await galleryView(emptyRecords);
  try {
    await click(findButton(emptyView, 'gallery.create'));
    const emptyItems = [...emptyView.container.querySelectorAll('[role="menuitem"]')];
    assert.ok(emptyItems.every((item) => item.textContent.includes('scope.library')), 'the library was not named as the target');
    await click(emptyItems[0]);
    const emptyCreate = empty.calls.find((call) => call.endpoint === 'create');
    assert.ok(emptyCreate, 'no library create call was made');
    assert.equal(emptyCreate.payload.scope, 'library');
  } finally { await emptyView.unmount(); }
});

test('AC-090: the design system control is a palette and edits the scope in context', async () => {
  const host = fakeHost();
  const { ctx, records } = stubContext(host);
  plugin.apply(ctx);
  const view = await galleryView(records);
  try {
    const button = view.container.querySelector('[aria-label="gallery.design"]');
    assert.ok(button, 'no design system control');
    assert.ok(button.querySelector('svg'), 'the design system control has no icon');
    await chooseScope(view, 'library');
    await click(view.container.querySelector('[aria-label="gallery.design"]'));
    assert.ok(view.container.querySelector('.art-design'), 'the design editor did not open');
    assert.equal(findButton(view, 'design.saveWorkspaceNamed|name=Work A'), undefined, 'the library scope offered a project save');
    assert.ok(findButton(view, 'design.saveLibrary'), 'the library scope lost the library save');
    const libraryDesign = host.calls.filter((call) => call.endpoint === 'designSystem').slice(-1)[0];
    assert.equal(libraryDesign.payload.workspaceId, undefined, 'the library design editor asked for a project');
    await click(view.container.querySelector('[aria-label="panel"]'));
    await chooseScope(view, 'ws:ws-a');
    await click(view.container.querySelector('[aria-label="gallery.design"]'));
    assert.ok(findButton(view, 'design.saveWorkspaceNamed|name=Work A'), 'the project scope did not name the save target');
    const projectDesign = host.calls.filter((call) => call.endpoint === 'designSystem').slice(-1)[0];
    assert.equal(projectDesign.payload.workspaceId, 'ws-a', 'the project design editor did not ask for the project');
  } finally { await view.unmount(); }
});

test('AC-094: agent requests name the artifact workspace', async () => {
  const host = fakeHost();
  const ownId = 'art_ws_ref0940001';
  host.state.artifacts.set(ownId, { manifest: host.manifest(ownId, 'page', 'Own page', 2), content: '<p>x</p>' });
  const sharedId = 'art_lib_ref0940001';
  host.state.artifacts.set(sharedId, { manifest: host.manifest(sharedId, 'doc', 'Shared doc', 1, 'library'), content: '# x' });
  const { ctx, records } = stubContext(host);
  plugin.apply(ctx);
  const tab = slot(records, 'sidebar.right.pane.tab', 'dsh-artifact-studio/artifact');

  const own = composerActions();
  const ownView = await render(tab.component, { ...tabProps('dsh-resource://artifact/workspace/ws-a/' + ownId), inputActions: own.actions });
  try {
    await click(findButton(ownView, 'agent.ask'));
    const insert = own.calls.find((call) => call[0] === 'insertText');
    assert.ok(insert, 'the workspace reference was not inserted');
    assert.match(insert[1], new RegExp('agent\\.referenceProject\\|title=Own page\\|id=' + ownId));
    assert.match(insert[1], /workspaceId=ws-a/);
  } finally { await ownView.unmount(); }

  const shared = composerActions();
  const sharedView = await render(tab.component, { ...tabProps('dsh-resource://artifact/library/' + sharedId), inputActions: shared.actions });
  try {
    await click(findButton(sharedView, 'agent.ask'));
    const insert = shared.calls.find((call) => call[0] === 'insertText');
    assert.ok(insert, 'the library reference was not inserted');
    assert.match(insert[1], new RegExp('agent\\.reference\\|title=Shared doc\\|id=' + sharedId));
    assert.doesNotMatch(insert[1], /workspaceId/, 'a library request named a workspace');
  } finally { await sharedView.unmount(); }
});

test('AC-095: the right panel lists the current workspace only', async () => {
  const host = fakeHost();
  const ownId = 'art_ws_right095001';
  host.state.artifacts.set(ownId, { workspaceId: 'ws-a', manifest: host.manifest(ownId, 'page', 'Own page', 2), content: '<p>a</p>' });
  const otherId = 'art_ws_right095002';
  host.state.artifacts.set(otherId, { workspaceId: 'ws-b', manifest: host.manifest(otherId, 'doc', 'Other project', 1), content: '# b' });
  const { ctx, records } = stubContext(host);
  plugin.apply(ctx);

  const definition = records.tabs.find((entry) => entry.kind === 'artifacts');
  assert.ok(definition, 'the right-panel artifacts type is not registered');
  assert.equal(definition.id, 'dsh-artifact-studio/artifacts');
  assert.equal(definition.priority, 'extension');
  assert.equal(definition.patterns, undefined, 'a page type must not claim resource addresses');
  assert.equal(definition.guide.length, 1, 'the guide has no artifacts entry');
  assert.equal(definition.guide[0].order, 30);
  assert.equal(definition.guide[0].title(), 'panel');
  assert.ok(definition.guide[0].description().startsWith('right.guideHint'));
  assert.ok(definition.guide[0].icon, 'the guide entry has no glyph');

  const { view } = await rightGalleryView(records);
  try {
    await act(async () => settle(80));
    assert.match(view.container.textContent, /Own page/);
    assert.doesNotMatch(view.container.textContent, /Other project/);
    assert.equal(view.container.querySelector('[aria-label="scope.label"]'), null, 'the fixed list still shows a scope select');
    assert.match(view.container.querySelector('.art-scope-fixed').textContent, /Work A/);
    const lists = host.calls.filter((call) => call.endpoint === 'list').map((call) => call.payload);
    assert.ok(lists.length > 0, 'no list call was made');
    assert.ok(lists.every((payload) => payload.scope === 'workspace' && payload.workspaceId === 'ws-a'), 'the fixed list asked for another scope');
    for (const button of view.container.querySelectorAll('button')) {
      const name = button.getAttribute('aria-label') ?? button.textContent.trim();
      assert.ok(name.length > 0, 'unnamed button in the right-panel list: ' + button.outerHTML);
    }
  } finally { await view.unmount(); }
});

test('AC-096: the right panel opens an artifact as a tab and creates in the workspace', async () => {
  const host = fakeHost();
  const id = 'art_ws_right096001';
  host.state.artifacts.set(id, { workspaceId: 'ws-a', manifest: host.manifest(id, 'page', 'Right page', 2), content: '<p>right</p>' });
  const otherId = 'art_ws_right096002';
  host.state.artifacts.set(otherId, { workspaceId: 'ws-a', manifest: host.manifest(otherId, 'doc', 'Second page', 1), content: '# second' });
  const { ctx, records } = stubContext(host);
  plugin.apply(ctx);
  const { view } = await rightGalleryView(records);
  try {
    await act(async () => settle(80));
    await click(view.container.querySelector('.art-tile-open'));
    await act(async () => settle(120));
    assert.ok(records.opened.includes('dsh-resource://artifact/workspace/ws-a/' + id), 'the card did not open the artifact as its own tab');
    assert.ok(view.container.querySelector('.art-tile-open'), 'opening a card hid the list');

    const second = [...view.container.querySelectorAll('.art-tile-open')].find((tile) => tile.textContent.includes('Second page'));
    assert.ok(second, 'the second artifact is not in the list');
    await click(second);
    await act(async () => settle(120));
    assert.ok(records.opened.includes('dsh-resource://artifact/workspace/ws-a/' + otherId), 'the second card did not open a second tab');
    assert.ok(view.container.querySelector('.art-tile-open'), 'opening a second card hid the list');

    const opened = records.opened.length;
    await click(findButton(view, 'gallery.create'));
    const items = [...view.container.querySelectorAll('[role="menuitem"]')];
    assert.equal(items.length, 4);
    assert.ok(items.every((item) => item.textContent.includes('Work A')), 'the create menu did not name the workspace');
    await click(items[1]);
    await act(async () => settle(120));
    const create = host.calls.find((call) => call.endpoint === 'create');
    assert.ok(create, 'no create call was made');
    assert.equal(create.payload.scope, 'workspace');
    assert.equal(create.payload.workspaceId, 'ws-a');
    assert.equal(records.opened.length, opened + 1, 'the created artifact did not open as a tab');
    assert.match(records.opened[records.opened.length - 1], /^dsh-resource:\/\/artifact\/workspace\/ws-a\/art_ws_new\d{8}$/);
  } finally { await view.unmount(); }
});

test('AC-097: gallery card titles are not truncated', async () => {
  const css = await fs.readFile(path.join(root, 'src/client/styles.ts'), 'utf8');
  const rule = css.match(/\.art-tile-title \{([^}]*)\}/);
  assert.ok(rule, 'no gallery card title rule');
  assert.doesNotMatch(rule[1], /text-overflow:\s*ellipsis/, 'the card title still ellipsizes');
  assert.doesNotMatch(rule[1], /white-space:\s*nowrap/, 'the card title is still one line');
  assert.match(rule[1], /overflow-wrap:\s*anywhere/, 'a long name cannot wrap inside a narrow card');
});

test('AC-098: the right-panel page strings and controls are localized and named', async () => {
  const { EN, ZH } = await import('../src/client/locale.ts');
  for (const key of ['right.guideHint', 'agent.referenceProject', 'agent.referenceOldProject']) {
    assert.ok(EN[key], 'en is missing ' + key);
    assert.ok(ZH[key], 'zh is missing ' + key);
  }
  assert.deepEqual(Object.keys(EN).sort(), Object.keys(ZH).sort());
  const host = fakeHost();
  const { ctx, records } = stubContext(host);
  plugin.apply(ctx);
  const { view } = await rightGalleryView(records);
  try {
    await act(async () => settle(80));
    assert.ok(view.container.querySelector('[aria-label="gallery.searchLabel"]'), 'the search box has no label');
    assert.ok(findButton(view, 'gallery.create'), 'the create action has no accessible name');
    assert.ok(byLabel(view, 'gallery.refresh'), 'the refresh action has no accessible name');
  } finally { await view.unmount(); }
});

test('DS-AC-008: semantic colors have localized form controls and a paired action preview', async () => {
  const { EN, ZH } = await import('../src/client/locale.ts');
  for (const role of COLOR_ROLES) {
    assert.ok(EN['design.color.' + role], role + ' EN');
    assert.ok(ZH['design.color.' + role], role + ' ZH');
  }
  const host = fakeHost();
  const { ctx, records } = stubContext(host);
  plugin.apply(ctx);
  const view = await galleryView(records);
  try {
    await click(view.container.querySelector('[aria-label="gallery.design"]'));
    for (const role of COLOR_ROLES) {
      for (const set of ['design.colors', 'design.colorsDark']) {
        const input = [...view.container.querySelectorAll('input[type="text"]')]
          .find((item) => item.getAttribute('aria-label') === 'design.color.' + role + ' ' + set + ' CSS');
        assert.ok(input, role + ' ' + set);
        assert.ok(input.value, role + ' has no resolved value');
      }
    }
    const preview = [...blobs.values()].map((blob) => blob.text());
    const html = (await Promise.all(preview)).join('\n');
    assert.match(html, /background: var\(--artifact-color-action\); color: var\(--artifact-color-action-text\)/);
    assert.match(html, /background: var\(--artifact-color-raised\); color: var\(--artifact-color-success\)/);
  } finally { await view.unmount(); }
});

test('AC-019: a stale UI save shows the conflict bar and keeps the draft', async () => {
  const host = fakeHost();
  host.state.artifacts.set('art_ws_conflict001', { manifest: host.manifest('art_ws_conflict001', 'page', 'Race', 1), content: '<p>a</p>' });
  const { ctx, records } = stubContext(host);
  plugin.apply(ctx);
  const tab = slot(records, 'sidebar.right.pane.tab', 'dsh-artifact-studio/artifact');
  const view = await render(tab.component, tabProps('dsh-resource://artifact/workspace/ws-a/art_ws_conflict001'));
  await openSource(view);
  const textarea = view.container.querySelector('textarea');
  await act(async () => {
    Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set.call(textarea, '<p>mine</p>');
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    await settle(20);
  });
  host.state.artifacts.get('art_ws_conflict001').manifest.version = 2;
  await click(view.container.querySelector('[aria-label="tab.save"]'));
  assert.ok(view.container.querySelector('[role="alert"]'), 'no conflict bar');
  assert.match(view.container.textContent, /tab\.conflictTitle/);
  assert.equal(view.container.querySelector('textarea').value, '<p>mine</p>');
  assert.equal(host.state.artifacts.get('art_ws_conflict001').content, '<p>a</p>');
  await view.unmount();
});

test('AC-022: artifact surfaces are keyboard and screen-reader reachable', async () => {
  const host = fakeHost();
  host.state.artifacts.set('art_ws_a11y0000001', { manifest: host.manifest('art_ws_a11y0000001', 'page', 'A11y', 2), content: '<p>x</p>' });
  const { ctx, records } = stubContext(host);
  plugin.apply(ctx);
  for (const [key, address] of [
    ['dsh-artifact-studio/artifact', 'dsh-resource://artifact/workspace/ws-a/art_ws_a11y0000001'],
    ['dsh-artifact-studio-panel', null],
  ]) {
    const view = address === null ? await galleryView(records) : await render(slot(records, 'sidebar.right.pane.tab', key).component, tabProps(address));
    for (const button of view.container.querySelectorAll('button')) {
      const name = button.getAttribute('aria-label') ?? button.textContent.trim();
      assert.ok(name.length > 0, `unnamed button in ${key}: ${button.outerHTML}`);
      assert.notEqual(button.tabIndex, -1);
    }
    for (const svg of view.container.querySelectorAll('svg')) assert.equal(svg.getAttribute('aria-hidden'), 'true');
    for (const frame of view.container.querySelectorAll('iframe')) assert.ok(frame.getAttribute('title'));
    for (const input of view.container.querySelectorAll('input')) assert.ok(input.getAttribute('aria-label'));
    await view.unmount();
  }
  const view = await render(slot(records, 'sidebar.right.pane.tab', 'dsh-artifact-studio/artifact').component, tabProps('dsh-resource://artifact/workspace/ws-a/art_ws_a11y0000001'));
  const exportButton = view.container.querySelector('[aria-label="tab.export"]');
  exportButton.focus();
  await click(exportButton);
  const menu = view.container.querySelector('[role="menu"]');
  assert.ok(menu);
  assert.equal(document.activeElement, menu.querySelector('button'));
  await act(async () => {
    menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await settle(20);
  });
  assert.equal(view.container.querySelector('[role="menu"]'), null);
  assert.equal(document.activeElement, exportButton);
  await view.unmount();
});

test('AC-023: locale dictionaries cover every used key', async () => {
  const sources = await fs.readdir(path.join(root, 'src/client'), { recursive: true });
  const { EN, ZH } = await import('../src/client/locale.ts');
  const used = new Set();
  for (const file of sources.filter((name) => /\.(ts|tsx)$/.test(name))) {
    const text = await fs.readFile(path.join(root, 'src/client', file), 'utf8');
    for (const match of text.matchAll(/\bt\(\s*'([a-zA-Z0-9.]+)'/g)) used.add(match[1]);
  }
  const dynamic = [
    'scope.workspace', 'scope.library', 'type.page', 'type.doc', 'type.design', 'type.sheet',
    'export.html', 'export.md', 'export.docx', 'export.png', 'export.svg', 'export.fig', 'export.csv', 'export.xlsx',
    'create.untitledDesign', 'create.untitledSheet', 'tab.manualSaveDesign',
    'prompt.sheet', 'prompt.sheetText', 'gallery.newSheet',
    'design.source.workspace', 'design.source.library', 'design.source.default',
    'design.color.primary', 'design.color.accent', 'design.color.surface', 'design.color.text', 'design.color.muted',
    'design.radius.sm', 'design.radius.md', 'design.radius.lg',
    'format.heading', 'format.bold', 'format.italic', 'format.bulletList', 'format.orderedList', 'format.codeBlock',
    'prompt.dashboard', 'prompt.dashboardText', 'prompt.explainer', 'prompt.explainerText', 'prompt.report', 'prompt.reportText', 'prompt.brief', 'prompt.briefText', 'prompt.sheet', 'prompt.sheetText',
    'agent.reference', 'agent.referenceOld', 'agent.referenceProject', 'agent.referenceOldProject', 'agent.added', 'agent.addedTruncated', 'agent.insertFailed', 'agent.copied',
    'card.creating', 'card.updating', 'card.updatingUntitled', 'card.working', 'card.created', 'card.updated',
  ];
  for (const key of dynamic) used.add(key);
  const apiSource = await fs.readFile(path.join(root, 'src/client/api.ts'), 'utf8');
  for (const match of apiSource.matchAll(/return '(error\.[a-zA-Z]+)'/g)) used.add(match[1]);
  assert.ok(used.size > 60, `only ${used.size} keys found`);
  for (const key of used) {
    assert.ok(EN[key], `en is missing ${key}`);
    assert.ok(ZH[key], `zh is missing ${key}`);
  }
  assert.deepEqual(Object.keys(EN).sort(), Object.keys(ZH).sort());
});

test('AC-028: the artifact view fills the panel in its fullscreen mode', async () => {
  const css = await fs.readFile(path.join(root, 'src/client/styles.ts'), 'utf8');
  assert.match(css, /\.art-root \{[^}]*height: 100%;[^}]*\}/s);
  assert.match(css, /\.art-frame \{[^}]*flex: 1;[^}]*width: 100%;/s);
  assert.doesNotMatch(css, /\.art-(root|stage|frame) \{[^}]*max-width/s);
});

test('AC-034: the left navigation row opens a full artifacts page', async () => {
  const host = fakeHost();
  const { ctx, records } = stubContext(host);
  plugin.apply(ctx);
  const nav = slot(records, 'sidebar.panellist', 'dsh-artifact-studio-panel');
  assert.equal(nav.spec.order, 10, 'the row needs an order between the shipped rows');
  assert.ok(nav.spec.label, 'the row needs a label');
  const main = slot(records, 'main', 'dsh-artifact-studio-panel');
  const view = await render(main.component, main.spec.inject());
  const options = view.container.querySelectorAll('[aria-label="scope.label"] option');
  assert.equal(options.length, 3, 'expected all projects, the project, and the library');
  assert.deepEqual([...options].map((option) => option.textContent), ['scope.all', 'Work A', 'scope.library']);
  assert.ok(view.container.querySelector('.art-starters'), 'the page rendered no starter state');
  await view.unmount();
});

test('AC-035: the full page opens an artifact in place and returns', async () => {
  const host = fakeHost();
  host.state.artifacts.set('art_ws_page000020', { manifest: host.manifest('art_ws_page000020', 'page', 'Panel page', 1), content: '<h1>Panel</h1>' });
  const { ctx, records } = stubContext(host);
  plugin.apply(ctx);
  const main = slot(records, 'main', 'dsh-artifact-studio-panel');
  const view = await render(main.component, main.spec.inject());
  const row = [...view.container.querySelectorAll('.art-tile-open')].find((element) => element.textContent.includes('Panel page'));
  assert.ok(row, 'no artifact row rendered');
  await click(row);
  assert.ok(view.container.querySelector('iframe'), 'the panel did not open the artifact in place');
  const back = view.container.querySelector('[aria-label="action.back"]');
  assert.ok(back, 'the panel has no back control');
  await click(back);
  assert.ok(view.container.querySelector('[aria-label="scope.label"]'), 'back did not return to the gallery');
  await view.unmount();
});

/** Render a document artifact tab with the shared fake host. */
async function docFixture(suffix, version = 1, content = '# Doc') {
  const host = fakeHost();
  const id = `art_ws_doc${suffix}`;
  host.state.artifacts.set(id, { manifest: host.manifest(id, 'doc', 'Doc title', version), content });
  const { ctx, records } = stubContext(host);
  plugin.apply(ctx);
  const tab = slot(records, 'sidebar.right.pane.tab', 'dsh-artifact-studio/artifact');
  const view = await render(tab.component, tabProps(`dsh-resource://artifact/workspace/ws-a/${id}`));
  return { host, id, view };
}

function findButton(view, text) {
  return [...view.container.querySelectorAll('button')].find(button => button.textContent === text);
}

function drawerOf(view) {
  return view.container.querySelector('.art-drawer');
}

async function openRequest(view) {
  await click(findButton(view, 'agent.ask'));
}

/**
 * Select the first text node inside an element and announce the change.
 * @param {Element} element - the editor root.
 * @param {number} start - start offset.
 * @param {number} end - end offset.
 */
function selectIn(element, start, end) {
  const walker = document.createTreeWalker(element, window.NodeFilter.SHOW_TEXT);
  const node = walker.nextNode();
  assert.ok(node, 'no text node to select');
  const range = document.createRange();
  range.setStart(node, start);
  range.setEnd(node, end);
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
  document.dispatchEvent(new Event('selectionchange', { bubbles: true }));
}

test('AC-054: gallery creation is labelled and a type-filtered empty result names the filter', async () => {
  const host = fakeHost();
  host.state.artifacts.set('art_ws_gallery05401', { manifest: host.manifest('art_ws_gallery05401', 'page', 'Project page', 1), content: '' });
  host.state.artifacts.set('art_lib_gallery0541', { manifest: host.manifest('art_lib_gallery0541', 'doc', 'Library doc', 2, 'library'), content: '' });
  const { ctx, records } = stubContext(host);
  plugin.apply(ctx);
  const main = slot(records, 'main', 'dsh-artifact-studio-panel');
  const view = await render(main.component, main.spec.inject());
  const create = () => findButton(view, 'gallery.create');
  try {
    assert.ok(create(), 'the create action has no visible text label');
    const row = [...view.container.querySelectorAll('.art-tile-open')].find(element => element.textContent.includes('Project page'));
    assert.ok(row);
    assert.match(row.textContent, /type\.page/);
    assert.match(row.textContent, /gallery\.updated/);
    assert.match(row.textContent, /gallery\.version\|version=1/);

    await click(create());
    assert.ok([...view.container.querySelectorAll('[role="menuitem"]')].every(item => item.textContent.includes('Work A')));
    await act(async () => {
      view.container.querySelector('[role="menu"]').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      await settle(20);
    });

    await chooseScope(view, 'library');
    await click(create());
    assert.ok([...view.container.querySelectorAll('[role="menuitem"]')].every(item => item.textContent.includes('scope.library')));
    await act(async () => {
      view.container.querySelector('[role="menu"]').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      await settle(20);
    });

    await chooseScope(view, 'ws:ws-a');
    await click([...view.container.querySelectorAll('.art-toolbar button')].find(button => button.textContent === 'type.doc'));
    await act(async () => settle(120));
    const section = view.container.querySelector('.art-gallery');
    assert.match(section.textContent, /empty\.typeMatch\|type=type\.doc/);
    assert.doesNotMatch(section.textContent, /empty\.workspaceTitle/, 'a filtered result claimed the project is empty');

    const css = await fs.readFile(path.join(root, 'src/client/styles.ts'), 'utf8');
    assert.match(css, /\.art-gallery \{[^}]*max-width:/s);
    assert.match(css, /@container \(max-width: 520px\) \{[\s\S]*?\.art-toolbar \{[^}]*flex-direction: column/s);
  } finally { await view.unmount(); }
});

test('AC-055: narrow panes stack controls and a closed drawer leaves the artifact the main area', async () => {
  const css = await fs.readFile(path.join(root, 'src/client/styles.ts'), 'utf8');
  assert.match(css, /\.art-root \{[^}]*min-width: 0;/s);
  assert.match(css, /\.art-toolbar \{[^}]*flex-wrap: wrap;/s);
  assert.match(css, /@container \(max-width: 600px\) \{[\s\S]*?\.art-editor-header \.art-heading \{ flex-basis: 100%;/);
  assert.match(css, /@container \(max-width: 520px\) \{[\s\S]*?\.art-toolbar \{[^}]*flex-direction: column/s);
  assert.match(css, /\.art-drawer-layer\[data-overlay="true"\] \{[^}]*position: absolute;/s);
  assert.doesNotMatch(css, /\.art-root \{[^}]*overflow-x: auto/s);

  const host = fakeHost();
  host.state.artifacts.set('art_ws_width0550001', { manifest: host.manifest('art_ws_width0550001', 'page', 'Width page', 1), content: '<p>x</p>' });
  const { ctx, records } = stubContext(host);
  plugin.apply(ctx);
  const tab = slot(records, 'sidebar.right.pane.tab', 'dsh-artifact-studio/artifact');
  const view = await render(tab.component, tabProps('dsh-resource://artifact/workspace/ws-a/art_ws_width0550001'));
  try {
    assert.ok(drawerOf(view) === null, 'a supporting panel is open by default');
    assert.ok(view.container.querySelector('.art-body > .art-stage'));
    assert.equal(view.container.querySelectorAll('.art-body > *').length, 1, 'a closed drawer still occupies the main area');
  } finally { await view.unmount(); }

  const main = slot(records, 'main', 'dsh-artifact-studio-panel');
  const panel = await render(main.component, main.spec.inject());
  try {
    await click(panel.container.querySelector('.art-tile-open'));
    assert.ok(panel.container.querySelector('[aria-label="action.back"]'), 'no route back to the gallery');
  } finally { await panel.unmount(); }
});

test('AC-057: save protection, conflict, sandbox, exact-version output, and document autosave keep their contracts', async () => {
  const host = fakeHost();
  const pageId = 'art_ws_contract05701';
  const docId = 'art_ws_contract05702';
  host.state.artifacts.set(pageId, { manifest: host.manifest(pageId, 'page', 'Contract page', 2), content: '<p>one</p>' });
  host.state.artifacts.set(docId, { manifest: host.manifest(docId, 'doc', 'Contract doc', 1), content: '# Doc' });
  const { ctx, records } = stubContext(host);
  plugin.apply(ctx);
  const tab = slot(records, 'sidebar.right.pane.tab', 'dsh-artifact-studio/artifact');
  const pageView = await render(tab.component, tabProps(`dsh-resource://artifact/workspace/ws-a/${pageId}`));
  window.HTMLAnchorElement.prototype.click = () => undefined;
  try {
    assert.equal(pageView.container.querySelector('iframe').getAttribute('sandbox'), 'allow-scripts');
    await openSource(pageView);
    await changeValue(pageView.container.querySelector('.art-source'), '<p>two</p>');
    await click(pageView.container.querySelector('[aria-label="tab.save"]'));
    assert.equal(host.state.artifacts.get(pageId).content, '<p>two</p>');

    await changeValue(pageView.container.querySelector('.art-source'), '<p>mine</p>');
    host.state.artifacts.get(pageId).manifest.version += 1;
    await click(pageView.container.querySelector('[aria-label="tab.save"]'));
    assert.match(pageView.container.textContent, /tab\.conflictTitle/);
    assert.equal(pageView.container.querySelector('.art-source').value, '<p>mine</p>');

    await click(findButton(pageView, 'tab.discardReload'));
    await click(findButton(pageView, 'tab.leaveDiscard'));
    assert.equal(pageView.container.querySelector('.art-source').value, '<p>two</p>');

    const clean = await render(tab.component, tabProps(`dsh-resource://artifact/workspace/ws-a/${pageId}`));
    try {
      await click(clean.container.querySelector('[aria-label="tab.history"]'));
      await click([...clean.container.querySelectorAll('.art-version')].find(button => button.textContent.includes('tab.versionOf|version=1')));
      const exports = [];
      const prints = [];
      const original = host.rpc.call;
      host.rpc.call = async (...args) => {
        if (args[1] === 'export') { exports.push(args[2]); return { ok: true, value: { path: '/e.html', fileName: 'e.html', bytes: 0, mediaType: 'text/html', data: '' } }; }
        if (args[1] === 'printable') { prints.push(args[2]); return { ok: true, value: { html: '<html><head></head><body></body></html>' } }; }
        return original(...args);
      };
      await click(clean.container.querySelector('[aria-label="tab.export"]'));
      await click([...clean.container.querySelectorAll('[role="menuitem"]')].find(button => button.textContent === 'export.html'));
      assert.equal(exports[0].version, 1);
      await click(clean.container.querySelector('[aria-label="tab.export"]'));
      await click([...clean.container.querySelectorAll('[role="menuitem"]')].find(button => button.textContent === 'export.print'));
      assert.equal(prints[0].version, 1, 'print did not pin the selected version');
      const printFrame = [...document.querySelectorAll('iframe[aria-hidden="true"]')].at(-1);
      if (printFrame !== undefined) {
        Object.defineProperty(printFrame, 'contentWindow', { value: window, configurable: true });
        window.dispatchEvent(new window.MessageEvent('message', { data: 'dsh-artifact-printed', source: window }));
      }

      await click(findButton(clean, 'tab.restoreThis'));
      await act(async () => settle(80));
      assert.equal(host.state.artifacts.get(pageId).manifest.version, 5, 'restore did not append a version');
    } finally { await clean.unmount(); }

    const docView = await render(tab.component, tabProps(`dsh-resource://artifact/workspace/ws-a/${docId}`));
    try {
      await selectDoc(docView);
      await click(findButton(docView, 'format.heading'));
      await act(async () => settle(1400));
      assert.ok(host.calls.some(call => call.endpoint === 'update' && call.payload.id === docId), 'document autosave did not run');
      assert.match(host.state.artifacts.get(docId).content, /^## Doc/);
    } finally { await docView.unmount(); }
  } finally { await pageView.unmount(); }
});

test('AC-061: a clean tab acknowledges an agent update while a dirty tab keeps its conflict', async () => {
  const host = fakeHost();
  const id = 'art_ws_update06101';
  host.state.artifacts.set(id, { manifest: host.manifest(id, 'page', 'Update target', 3), content: '<p>v3</p>' });
  const { ctx, records } = stubContext(host);
  plugin.apply(ctx);
  const tab = slot(records, 'sidebar.right.pane.tab', 'dsh-artifact-studio/artifact');
  const view = await render(tab.component, tabProps(`dsh-resource://artifact/workspace/ws-a/${id}`));
  const card = slot(records, 'tool.call.toolview', 'artifact_create');
  try {
    host.state.artifacts.get(id).manifest.version = 4;
    host.state.artifacts.get(id).content = '<p>v4</p>';
    const announced = await render(card.component, {
      t,
      sessionId: 'ses-a',
      useSessions: (select) => select({ byId: { 'ses-a': { cwd: '/work/a' } } }),
      useWorkspaces: (select) => select({ items: [{ workspaceId: 'ws-a', path: '/work/a', title: 'Work A', sessionIds: ['ses-a'] }] }),
      phase: 'result',
      toolName: 'artifact_create',
      block: { isError: false, meta: { kind: 'artifact', id, type: 'page', title: 'Update target', version: 4, workspaceId: 'ws-a' }, content: [] },
    });
    await announced.unmount();
    await act(async () => settle(120));
    assert.match(view.container.textContent, /tab\.agentUpdate\|version=4/);
    assert.equal(host.calls.filter(call => call.endpoint === 'get').length, 2, 'the clean tab did not reload');
    await click(findButton(view, 'tab.dismiss'));
    assert.doesNotMatch(view.container.textContent, /tab\.agentUpdate/);
  } finally { await view.unmount(); }

  const dirtyId = 'art_ws_update06102';
  host.state.artifacts.set(dirtyId, { manifest: host.manifest(dirtyId, 'page', 'Dirty target', 3), content: '<p>v3</p>' });
  const dirty = await render(tab.component, tabProps(`dsh-resource://artifact/workspace/ws-a/${dirtyId}`));
  try {
    await openSource(dirty);
    await changeValue(dirty.container.querySelector('.art-source'), '<p>mine</p>');
    host.state.artifacts.get(dirtyId).manifest.version = 4;
    host.state.artifacts.get(dirtyId).content = '<p>v4</p>';
    const announced = await render(card.component, {
      t,
      sessionId: 'ses-a',
      useSessions: (select) => select({ byId: { 'ses-a': { cwd: '/work/a' } } }),
      useWorkspaces: (select) => select({ items: [{ workspaceId: 'ws-a', path: '/work/a', title: 'Work A', sessionIds: ['ses-a'] }] }),
      phase: 'result',
      toolName: 'artifact_create',
      block: { isError: false, meta: { kind: 'artifact', id: dirtyId, type: 'page', title: 'Dirty target', version: 4, workspaceId: 'ws-a' }, content: [] },
    });
    await announced.unmount();
    await act(async () => settle(120));
    assert.match(dirty.container.textContent, /tab\.conflictTitle/);
    assert.equal(dirty.container.querySelector('.art-source').value, '<p>mine</p>');
    assert.doesNotMatch(dirty.container.textContent, /tab\.agentUpdate/);
  } finally { await dirty.unmount(); }
});

test('AC-065: gallery covers render pages in an empty-script sandbox and documents as excerpts', async () => {
  const host = fakeHost();
  host.state.artifacts.set('art_ws_cover06501', { manifest: host.manifest('art_ws_cover06501', 'page', 'Cover page', 1), content: '<meta name="artifact-kit" content="1"><h1 onclick="window.x = 1">Cover page</h1><script>window.y = 1</script>' });
  host.state.artifacts.set('art_lib_cover06501', { manifest: host.manifest('art_lib_cover06501', 'doc', 'Cover doc', 1, 'library'), content: '# Cover doc\n\nReadable opening words.' });
  const { ctx, records } = stubContext(host);
  plugin.apply(ctx);
  const view = await galleryView(records);
  try {
    await act(async () => settle(160));
    const frame = view.container.querySelector('.art-cover-frame');
    assert.ok(frame, 'the page cover did not render');
    assert.equal(frame.getAttribute('sandbox'), '', 'the cover can run page scripts');
    assert.ok(frame.getAttribute('title'));
    const source = await blobs.get(frame.getAttribute('src')).text();
    assert.doesNotMatch(source, /<script/i, 'the cover kept a script element');
    assert.doesNotMatch(source, /onclick/i, 'the cover kept an inline handler');
    assert.match(source, /data-artifact-kit="1"/, 'the cover lost the kit CSS');
    assert.match(source, /^<!doctype html>/i, 'the cover entered quirks mode');
    assert.match(view.container.querySelector('.art-cover-doc-text').textContent, /Readable opening words/);
    assert.ok(host.calls.every(call => call.endpoint === 'get' || call.endpoint === 'list'), 'a cover wrote data');
  } finally { await view.unmount(); }
});

test('AC-066: pinning an artifact moves it into the pinned group and persists', async () => {
  const host = fakeHost();
  host.state.artifacts.set('art_ws_pin0660001', { manifest: host.manifest('art_ws_pin0660001', 'page', 'Pin me', 1), content: '' });
  const { ctx, records } = stubContext(host);
  plugin.apply(ctx);
  const view = await galleryView(records);
  try {
    const pin = view.container.querySelector('.art-tile-pin');
    await click(pin);
    assert.equal(view.container.querySelector('.art-tile-pin').getAttribute('aria-pressed'), 'true');
    assert.match(view.container.textContent, /gallery\.pinned/);
    assert.equal(JSON.parse(window.localStorage.getItem('dsh-artifact-studio.pins')).length, 1);
    await click(view.container.querySelector('.art-tile-pin'));
    assert.doesNotMatch(view.container.textContent, /gallery\.pinned/);
    assert.deepEqual(JSON.parse(window.localStorage.getItem('dsh-artifact-studio.pins')), []);
  } finally { await view.unmount(); window.localStorage.clear(); }
});

test('AC-067: the header version picker lists versions and previews one', async () => {
  const { view } = await pageFixture('versions067');
  try {
    const trigger = view.container.querySelector('.art-version-button');
    trigger.focus();
    await click(trigger);
    let menu = view.container.querySelector('[role="menu"]');
    assert.ok(menu, 'the version menu did not open');
    assert.match(menu.textContent, /tab\.versionOf\|version=3/);
    await act(async () => {
      menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      await settle(40);
    });
    assert.equal(view.container.querySelector('[role="menu"]'), null, 'Escape did not close the version menu');
    assert.equal(document.activeElement, trigger, 'focus did not return to the version trigger');
    trigger.focus();
    await click(trigger);
    menu = view.container.querySelector('[role="menu"]');
    await click([...menu.querySelectorAll('button')].find(button => button.textContent.includes('tab.versionOf|version=2')));
    await act(async () => settle(100));
    assert.match(view.container.textContent, /tab\.viewingOld\|version=2\|current=3/);
    assert.match(view.container.querySelector('.art-version-button').textContent, /version=2/);
  } finally { await view.unmount(); }
});

test('AC-061: opening a tab after another view announced a version does not claim an update', async () => {
  const host = fakeHost();
  const id = 'art_ws_update06103';
  host.state.artifacts.set(id, { manifest: host.manifest(id, 'page', 'Already current', 4), content: '<p>v4</p>' });
  const { ctx, records } = stubContext(host);
  plugin.apply(ctx);
  const card = slot(records, 'tool.call.toolview', 'artifact_create');
  const announced = await render(card.component, {
    t,
    sessionId: 'ses-a',
    useSessions: (select) => select({ byId: { 'ses-a': { cwd: '/work/a' } } }),
    useWorkspaces: (select) => select({ items: [{ workspaceId: 'ws-a', path: '/work/a', title: 'Work A', sessionIds: ['ses-a'] }] }),
    phase: 'result',
    toolName: 'artifact_create',
    block: { isError: false, meta: { kind: 'artifact', id, type: 'page', title: 'Already current', version: 4, workspaceId: 'ws-a' }, content: [] },
  });
  await announced.unmount();
  const tab = slot(records, 'sidebar.right.pane.tab', 'dsh-artifact-studio/artifact');
  const view = await render(tab.component, tabProps(`dsh-resource://artifact/workspace/ws-a/${id}`));
  try {
    await act(async () => settle(80));
    assert.doesNotMatch(view.container.textContent, /tab\.agentUpdate/);
  } finally { await view.unmount(); }
});

test('AC-069: a failed scope does not hide loaded cards from the other scope', async () => {
  const host = fakeHost();
  host.state.artifacts.set('art_ws_partial06901', { manifest: host.manifest('art_ws_partial06901', 'page', 'Still visible', 1), content: '<p>x</p>' });
  const original = host.rpc.call;
  host.rpc.call = async (route, endpoint, payload, signal) => {
    if (endpoint === 'list' && payload.scope === 'library') return { ok: false, error: { code: 'artifact/storage-failure', message: 'failed', details: {} } };
    return original(route, endpoint, payload, signal);
  };
  const { ctx, records } = stubContext(host);
  plugin.apply(ctx);
  const view = await galleryView(records);
  try {
    await act(async () => settle(80));
    assert.match(view.container.textContent, /Still visible/);
    assert.match(view.container.querySelector('.art-bar').textContent, /gallery\.failedProjects/);
  } finally { await view.unmount(); }
});


test('AC-074: the preview frame follows the Harness theme for pages that opt in', async () => {
  const host = fakeHost();
  const id = 'art_ws_theme0740001';
  host.state.artifacts.set(id, { manifest: host.manifest(id, 'page', 'Themed', 1), content: '<meta name="color-scheme" content="light dark"><p>x</p>' });
  host.state.artifacts.set('art_ws_theme0740002', { manifest: host.manifest('art_ws_theme0740002', 'page', 'Light only', 1), content: '<p>y</p>' });
  const { ctx, records } = stubContext(host);
  plugin.apply(ctx);
  const tab = slot(records, 'sidebar.right.pane.tab', 'dsh-artifact-studio/artifact');
  const view = await render(tab.component, tabProps('dsh-resource://artifact/workspace/ws-a/' + id));
  const light = await render(tab.component, tabProps('dsh-resource://artifact/workspace/ws-a/art_ws_theme0740002'));
  try {
    const html = async (target) => blobs.get(target.container.querySelector('iframe').getAttribute('src')).text();
    assert.match(await html(view), /<html data-artifact-theme="light">/);
    await act(async () => { document.body.setAttribute('data-ds-dark-theme', ''); await settle(60); });
    assert.match(await html(view), /<html data-artifact-theme="dark">/, 'the frame did not switch with the Harness theme');
    assert.match(await html(light), /<html><head>/, 'a page that did not opt in was switched to dark colors');
  } finally {
    document.body.removeAttribute('data-ds-dark-theme');
    await view.unmount();
    await light.unmount();
  }
});

test('AC-075: artifact chrome renders through the shared primitives', async () => {
  const { view } = await pageFixture('prim075');
  try {
    const header = view.container.querySelector('.art-header');
    for (const label of ['tab.history', 'tab.export', 'gallery.more']) {
      assert.ok(header.querySelector('.prim-button[aria-label="' + label + '"]'), label + ' is not a shared Button');
    }
    assert.ok(header.querySelector('[role="tablist"][aria-label="tab.mode"]'), 'the view switch is not the shared segmented control');
    await click(header.querySelector('[aria-label="gallery.more"]'));
    let confirmed = false;
    const original = window.confirm;
    window.confirm = () => { confirmed = true; return true; };
    await click([...view.container.querySelectorAll('[role="menuitem"]')].find(item => item.textContent === 'tab.delete'));
    window.confirm = original;
    assert.equal(confirmed, false, 'delete still uses window.confirm');
    const dialog = view.container.querySelector('[role="dialog"][aria-label="tab.deleteTitle"]');
    assert.ok(dialog, 'delete did not open the shared modal');
    await click([...dialog.querySelectorAll('button')].find(button => button.textContent === 'create.cancel'));
    assert.equal(view.container.querySelector('[aria-label="tab.deleteTitle"]'), null);
    const source = await fs.readFile(path.join(root, 'src/client/artifact-tab.tsx'), 'utf8');
    assert.doesNotMatch(source, /window\.confirm/);
  } finally { await view.unmount(); }
});

test('AC-076: page code is read-only until Edit', async () => {
  const host = fakeHost();
  const id = 'art_ws_code0760001';
  host.state.artifacts.set(id, { manifest: host.manifest(id, 'page', 'Code view', 2), content: '<p>code</p>' });
  const { ctx, records } = stubContext(host);
  plugin.apply(ctx);
  const tab = slot(records, 'sidebar.right.pane.tab', 'dsh-artifact-studio/artifact');
  const view = await render(tab.component, tabProps('dsh-resource://artifact/workspace/ws-a/' + id));
  try {
    await click([...view.container.querySelectorAll('.art-segment button')].find(button => button.textContent === 'tab.source'));
    assert.equal(view.container.querySelector('textarea'), null, 'the code opened editable');
    assert.match(view.container.querySelector('.art-code').textContent, /<p>code<\/p>/);
    await click(findButton(view, 'tab.editSource'));
    const area = view.container.querySelector('.art-source');
    assert.ok(area, 'Edit did not open the source editor');
    await changeValue(area, '<p>edited</p>');
    await act(async () => {
      area.dispatchEvent(new KeyboardEvent('keydown', { key: 's', ctrlKey: true, bubbles: true }));
      await settle(60);
    });
    assert.equal(host.state.artifacts.get(id).content, '<p>edited</p>');
  } finally { await view.unmount(); }
});

test('AC-077: documents use the artifact typography and a selection toolbar', async () => {
  const { view } = await docFixture('surface077', 1, 'Opening words');
  try {
    const page = view.container.querySelector('.art-docpage');
    assert.ok(page, 'no page surface');
    assert.equal(page.style.getPropertyValue('--artifact-font-display'), 'Georgia, serif');
    assert.equal(page.style.getPropertyValue('--artifact-color-surface'), '#f8fafc');
    assert.equal(view.container.querySelector('.art-doc-toolbar'), null, 'the toolbar shows with no selection');
    await selectDoc(view, 7);
    const toolbar = view.container.querySelector('.art-doc-toolbar');
    assert.ok(toolbar, 'the toolbar did not appear for a selection');
    assert.ok(findButton(view, 'format.bold'));
    assert.ok([...toolbar.querySelectorAll('button')].some(button => button.textContent === 'agent.ask'), 'the selection toolbar has no edit request');
    const css = await fs.readFile(path.join(root, 'src/client/styles.ts'), 'utf8');
    assert.match(css, /DOC_STYLE/, 'the editor does not reuse the export typography');
  } finally { await view.unmount(); }
  await act(async () => { window.getSelection().removeAllRanges(); document.dispatchEvent(new Event('selectionchange')); await settle(20); });
});

test('AC-078: edit with agent inserts a quote and reference without sending', async () => {
  const composer = composerActions();
  const { host, id, view } = await pageFixture('ask078', { inputActions: composer.actions });
  try {
    await changeValue(view.container.querySelector('.art-source'), '<p>unsaved</p>');
    const area = view.container.querySelector('.art-source');
    area.focus();
    area.setSelectionRange(0, 3);
    // A pointer selection ends with mouseup, which the source editor reports.
    await act(async () => { area.dispatchEvent(new MouseEvent('mouseup', { bubbles: true })); await settle(40); });
    const bar = view.container.querySelector('.art-selection-bar');
    assert.ok(bar, 'no selection action appeared');
    const action = [...bar.querySelectorAll('button')].find(button => button.textContent === 'agent.ask');
    assert.ok(action.classList.contains('art-ask'), 'the selection action can shrink and wrap its label');
    const styles = await fs.readFile(path.join(root, 'src/client/styles.ts'), 'utf8');
    assert.match(styles, /\.art-ask \{ flex: none; white-space: nowrap; \}/, 'the selection action can wrap to several lines');
    await click(action);
    assert.equal(host.state.artifacts.get(id).content, '<p>unsaved</p>', 'the draft was not saved first');
    assert.deepEqual(composer.calls.map(call => call[0]), ['insertQuote', 'captureInsertion', 'insertText']);
    assert.equal(composer.calls[0][1], '<p>');
    assert.match(composer.calls[2][1], new RegExp('agent\\.referenceProject\\|title=Regression\\|id=' + id + '\\|version=4'));
    assert.match(composer.calls[2][1], /workspaceId=ws-a/, 'the request does not name the artifact workspace');
    assert.equal(view.container.querySelector('.art-selection-bar'), null);

    composer.calls.length = 0;
    await click(findButton(view, 'agent.ask'));
    assert.deepEqual(composer.calls.map(call => call[0]), ['captureInsertion', 'insertText'], 'the header action quoted nothing yet called insertQuote');

    composer.calls.length = 0;
    await changeValue(view.container.querySelector('.art-source'), '<p>will fail</p>');
    host.state.failNext = { endpoint: 'update', error: { code: 'artifact/storage-failure', message: 'failed', details: {} } };
    await click(findButton(view, 'agent.ask'));
    assert.deepEqual(composer.calls, [], 'a failed save still reached the composer');
    const source = await fs.readFile(path.join(root, 'src/client/artifact-tab.tsx'), 'utf8');
    assert.doesNotMatch(source, /\.submit\(|setDraft\(/, 'the tab can send or replace the message');
  } finally { await view.unmount(); }
});

test('AC-079: the full page copies the reference instead', async () => {
  const host = fakeHost();
  const id = 'art_ws_copy0790001';
  host.state.artifacts.set(id, { manifest: host.manifest(id, 'page', 'Full page', 2), content: '<p>x</p>' });
  const { ctx, records } = stubContext(host);
  plugin.apply(ctx);
  const writes = [];
  Object.defineProperty(window.navigator, 'clipboard', { value: { writeText: async (text) => { writes.push(text); } }, configurable: true });
  const view = await galleryView(records);
  try {
    await click(view.container.querySelector('.art-tile-open'));
    await click(findButton(view, 'agent.ask'));
    assert.equal(writes.length, 1, 'the request was not copied');
    assert.match(writes[0], new RegExp('agent\\.referenceProject\\|title=Full page\\|id=' + id + '\\|version=2'));
    assert.match(writes[0], /workspaceId=ws-a/);

    Object.defineProperty(window.navigator, 'clipboard', { value: { writeText: async () => { throw new Error('denied'); } }, configurable: true });
    await click(findButton(view, 'agent.ask'));
    const fallback = view.container.querySelector('.art-fallback');
    assert.ok(fallback, 'clipboard denial left no selectable request');
    assert.match(fallback.value, /agent\.reference/);
  } finally { await view.unmount(); }
});

test('AC-080: live results open the artifact once and replayed results never do', async () => {
  const host = fakeHost();
  const { ctx, records } = stubContext(host);
  plugin.apply(ctx);
  const card = slot(records, 'tool.call.toolview', 'artifact_create');
  const meta = { kind: 'artifact', v: 1, id: 'art_ws_live0800001', scope: 'workspace', type: 'page', title: 'Live', version: 1, workspaceId: 'ws-a' };
  const base = { t, toolName: 'artifact_create' };
  const live = await render(card.component, { ...base, phase: 'start', block: { args: { title: 'Live' } } });
  await live.rerender({ ...base, phase: 'result', block: { isError: false, meta, content: [] } });
  await live.rerender({ ...base, phase: 'result', block: { isError: false, meta, content: [] } });
  assert.deepEqual(records.opened, ['dsh-resource://artifact/workspace/ws-a/art_ws_live0800001']);
  await live.unmount();
  const again = await render(card.component, { ...base, phase: 'start', block: { args: { title: 'Live' } } });
  await again.rerender({ ...base, phase: 'result', block: { isError: false, meta, content: [] } });
  assert.equal(records.opened.length, 1, 'a remounted card opened the same result twice');
  await again.unmount();
  const replay = await render(card.component, { ...base, phase: 'result', block: { isError: false, meta: { ...meta, id: 'art_ws_replay080001' }, content: [] } });
  assert.equal(records.opened.length, 1, 'a replayed result opened a tab');
  await replay.unmount();
});

test('AC-081: the running card shows the title with a shimmer', async () => {
  const host = fakeHost();
  const { ctx, records } = stubContext(host);
  plugin.apply(ctx);
  const card = slot(records, 'tool.call.toolview', 'artifact_update');
  const view = await render(card.component, { t, toolName: 'artifact_update', phase: 'start', block: { args: { id: 'art_ws_x', title: 'Q4 plan' } } });
  try {
    assert.ok(view.container.querySelector('[data-shimmer]'), 'no shimmer while running');
    assert.match(view.container.textContent, /card\.updating\|title=Q4 plan/);
    await view.rerender({ t, toolName: 'artifact_update', phase: 'preparing', block: {} });
    assert.match(view.container.textContent, /card\.updatingUntitled/);
  } finally { await view.unmount(); }
});

test('AC-082: the composer menu lists recent artifacts and inserts starter prompts', async () => {
  const host = fakeHost();
  for (let index = 0; index < 8; index += 1) {
    const id = 'art_ws_recent08200' + index;
    const manifest = host.manifest(id, 'page', 'Recent ' + index, 1);
    if (index === 7) manifest.source = { origin: 'agent', action: 'create', sessionId: 'ses-a' };
    host.state.artifacts.set(id, { manifest, content: '' });
  }
  const { ctx, records } = stubContext(host);
  plugin.apply(ctx);
  assert.ok(records.tabs.some(definition => definition.kind === 'artifacts'), 'the right-panel artifacts page is not registered');
  assert.equal(records.slots.some(entry => entry.spec?.key === 'dsh-artifact-studio' && entry.spec.name === 'sidebar.right.pane.tab'), false, 'the retired unnamed gallery is back');
  const button = slot(records, 'conversation.input.left', 'dsh-artifact-studio');
  const composer = composerActions();
  const props = { t, sessionId: 'ses-a', inputActions: composer.actions, useSessions: (select) => select({ byId: { 'ses-a': { cwd: '/work/a' } } }), useWorkspaces: (select) => select({ items: [{ workspaceId: 'ws-a', path: '/work/a', sessionIds: ['ses-a'] }] }) };
  const view = await render(button.component, props);
  try {
    await click(view.container.querySelector('[aria-label="composer.label"]'));
    const rows = [...view.container.querySelectorAll('[role="menuitem"]')].map(item => item.textContent);
    const recent = rows.filter(text => text.startsWith('Recent'));
    assert.equal(recent.length, 6, 'the menu did not cap recent artifacts at six');
    assert.equal(recent[0], 'Recent 7', 'this session\'s artifact is not first');
    await click([...view.container.querySelectorAll('[role="menuitem"]')].find(item => item.textContent === 'prompt.dashboard'));
    assert.deepEqual(composer.calls.map(call => call[0]), ['captureInsertion', 'insertText']);
    assert.equal(composer.calls[1][1], 'prompt.dashboardText');
    await click(view.container.querySelector('[aria-label="composer.label"]'));
    await click([...view.container.querySelectorAll('[role="menuitem"]')].find(item => item.textContent === 'Recent 7'));
    assert.deepEqual(records.opened, ['dsh-resource://artifact/workspace/ws-a/art_ws_recent082007']);
    await click(view.container.querySelector('[aria-label="composer.label"]'));
    await click([...view.container.querySelectorAll('[role="menuitem"]')].find(item => item.textContent === 'composer.all'));
    assert.deepEqual(records.panels, ['dsh-artifact-studio-panel']);
  } finally { await view.unmount(); }
});

test('AC-085: starter prompts name the artifact type', async () => {
  const { EN } = await import('../src/client/locale.ts');
  const host = fakeHost();
  const { ctx, records } = stubContext(host);
  plugin.apply(ctx);
  const button = slot(records, 'conversation.input.left', 'dsh-artifact-studio');
  const composer = composerActions();
  const starterT = (key, values) => (key.startsWith('prompt.') ? EN[key] : t(key, values));
  const view = await render(button.component, {
    t: starterT,
    sessionId: 'ses-a',
    inputActions: composer.actions,
    useSessions: (select) => select({ byId: { 'ses-a': { cwd: '/work/a' } } }),
    useWorkspaces: (select) => select({ items: [{ workspaceId: 'ws-a', path: '/work/a', sessionIds: ['ses-a'] }] }),
  });
  const pick = async (label) => {
    await click(view.container.querySelector('[aria-label="composer.label"]'));
    await click([...view.container.querySelectorAll('[role="menuitem"]')].find(item => item.textContent === label));
  };
  try {
    await pick(EN['prompt.report']);
    await pick(EN['prompt.dashboard']);
    const inserted = composer.calls.filter(call => call[0] === 'insertText').map(call => call[1]);
    assert.equal(inserted.length, 2);
    assert.match(inserted[0], /artifact doc/);
    assert.match(inserted[1], /artifact page/);
  } finally { await view.unmount(); }
});

test('FEAT-007 AC-014: a design tab shows the rendered preview and its source', async () => {
  const host = fakeHost();
  const id = 'art_ws_design01401';
  host.state.artifacts.set(id, { manifest: host.manifest(id, 'design', 'Card', 1), content: DESIGN_SOURCE, designInfo: DESIGN_INFO });
  const { ctx, records } = stubContext(host);
  plugin.apply(ctx);
  const tab = slot(records, 'sidebar.right.pane.tab', 'dsh-artifact-studio/artifact');
  const view = await render(tab.component, tabProps('dsh-resource://artifact/workspace/ws-a/' + id));
  try {
    const previewCall = host.calls.find((call) => call.endpoint === 'preview');
    assert.ok(previewCall, 'the tab did not request a preview');
    const image = view.container.querySelector('img.art-design-image');
    assert.ok(image, 'the tab rendered no preview image');
    assert.match(image.getAttribute('src'), /^data:image\/png;base64,/);
    assert.match(view.container.textContent, /Roboto/);
    await click(findButton(view, 'tab.export'));
    const formats = [...view.container.querySelectorAll('[role="menuitem"]')].map((item) => item.textContent);
    assert.deepEqual(formats, ['export.png', 'export.svg', 'export.fig', 'export.mockupHtml', 'export.mockupSvgHtml']);
    await click(findButton(view, 'tab.export'));
    await click([...view.container.querySelectorAll('.art-segment button')].find((button) => button.textContent === 'tab.source'));
    assert.match(view.container.textContent, /Quarterly/);
    assert.doesNotMatch(view.container.textContent, /export.print/);
  } finally { await view.unmount(); }
});


/** Open a design tab whose canvas chunk is available. */
async function canvasFixture(suffix, extra = {}) {
  const host = fakeHost();
  const id = 'art_ws_canvas' + suffix;
  host.state.artifacts.set(id, { manifest: host.manifest(id, 'design', 'Card', 1), content: DESIGN_SOURCE, designInfo: DESIGN_INFO });
  canvasDispatch.enabled = true;
  const { ctx, records } = stubContext(host);
  plugin.apply(ctx);
  const tab = slot(records, 'sidebar.right.pane.tab', 'dsh-artifact-studio/artifact');
  const view = await render(tab.component, { ...tabProps('dsh-resource://artifact/workspace/ws-a/' + id), ...extra });
  return { host, id, view };
}

async function flushCanvas() {
  await act(async () => { await settle(40); });
}

test('FEAT-007 AC-017: the design tab mounts the canvas over the PNG', async () => {
  const gate = deferred();
  canvasDispatch.gate = gate;
  const { view } = await canvasFixture('01701');
  try {
    assert.ok(view.container.querySelector('img.art-design-image'), 'the PNG did not show first');
    assert.ok(view.container.querySelector('.art-canvas-opening'), 'the opening note is missing');
    assert.equal(canvasDispatch.mounts.length, 0);
    await act(async () => { gate.resolve(); await settle(40); });
    const mount = view.container.querySelector('.art-canvas-mount');
    assert.equal(mount.getAttribute('data-ready'), '1');
    assert.equal(view.container.querySelector('img.art-design-image'), null, 'the PNG stayed over the canvas');
    assert.equal(canvasDispatch.mounts.length, 1);
    assert.equal(canvasDispatch.mounts[0].options.source, DESIGN_SOURCE);
  } finally { gate.resolve(); await view.unmount(); }
});

test('FEAT-007 AC-018: a canvas edit becomes a draft and writes nothing', async () => {
  const { host, id, view } = await canvasFixture('01801');
  try {
    const handle = canvasDispatch.mounts[0];
    await act(async () => { handle.options.onChange('SERIALIZED_CARD'); await settle(20); });
    assert.match(view.container.textContent, /tab.unsaved/);
    assert.equal(host.calls.filter((call) => call.endpoint === 'update').length, 0);
    assert.equal(host.state.artifacts.get(id).content, DESIGN_SOURCE);
    assert.ok(view.container.querySelector('[aria-label="tab.save"]'), 'the save control is hidden');
  } finally { await view.unmount(); }
});

test('FEAT-007 AC-019: a canvas save writes the serialized source as a new version', async () => {
  const { host, id, view } = await canvasFixture('01901');
  try {
    const handle = canvasDispatch.mounts[0];
    await act(async () => { handle.options.onChange('SERIALIZED_CARD'); await settle(20); });
    await click(view.container.querySelector('[aria-label="tab.save"]'));
    const update = host.calls.find((call) => call.endpoint === 'update');
    assert.equal(update.payload.content, 'SERIALIZED_CARD');
    assert.equal(update.payload.baseVersion, 1);
    assert.equal(host.state.artifacts.get(id).manifest.version, 2);
    assert.equal(host.state.artifacts.get(id).content, 'SERIALIZED_CARD');
  } finally { await view.unmount(); }
});

test('FEAT-007 AC-020: a canvas failure keeps the PNG and the source editor', async () => {
  canvasDispatch.fail = 'WebGL is not available.';
  const { view } = await canvasFixture('02001');
  try {
    assert.ok(view.container.querySelector('img.art-design-image'));
    assert.match(view.container.textContent, /canvas.startFailed/);
    assert.ok(view.container.querySelector('.art-bar[data-tone="error"]'), 'the failure bar has no error tone');
    assert.ok(findButton(view, 'action.retry'));
    await openSource(view);
    assert.ok(view.container.querySelector('textarea'));
  } finally { await view.unmount(); }
});

test('FEAT-007 AC-021: closing the tab destroys the canvas', async () => {
  const { view } = await canvasFixture('02101');
  const handle = canvasDispatch.mounts[0];
  await view.unmount();
  assert.equal(handle.destroyed, true);
});

test('FEAT-007 AC-022: an old design version shows the PNG and mounts no canvas', async () => {
  const host = fakeHost();
  const id = 'art_ws_canvas02201';
  host.state.artifacts.set(id, { manifest: host.manifest(id, 'design', 'Card', 2), content: DESIGN_SOURCE, designInfo: DESIGN_INFO });
  canvasDispatch.enabled = true;
  const { ctx, records } = stubContext(host);
  plugin.apply(ctx);
  const tab = slot(records, 'sidebar.right.pane.tab', 'dsh-artifact-studio/artifact');
  const view = await render(tab.component, tabProps('dsh-resource://artifact/workspace/ws-a/' + id));
  const first = canvasDispatch.mounts[0];
  try {
    await click(view.container.querySelector('[aria-label="tab.history"]'));
    await click([...view.container.querySelectorAll('.art-version')].find(button => button.textContent.includes('tab.versionOf|version=1')));
    await flushCanvas();
    assert.equal(first.destroyed, true);
    assert.equal(canvasDispatch.mounts.length, 1);
    assert.ok(view.container.querySelector('img.art-design-image'));
  } finally { await view.unmount(); }
});




/** A button, link, or control with an accessible label. */
function byLabel(view, label) {
  return view.container.querySelector('[aria-label="' + label + '"]');
}

/** Change a select's value and announce it. */
async function changeSelect(select, value) {
  await act(async () => {
    select.value = value;
    select.dispatchEvent(new Event('change', { bubbles: true }));
    await settle(30);
  });
}

/** A snapshot carrying layer rows and the selection they imply. */
function rowsSnapshot(rows, extra = {}) {
  const base = emptyCanvasSnapshot();
  const selected = rows.filter(row => row.selected).map(row => row.id);
  const properties = { ...base.properties, ...(extra.properties ?? {}), ids: (extra.properties ?? {}).ids ?? selected };
  return { ...base, rows, ...extra, properties };
}

/** One row for the fake layer tree. */
function layerRow(id, name, type, level, extra = {}) {
  return { id, name, type, level, hasChildren: false, expanded: false, visible: true, locked: false, selected: false, ...extra };
}

/** Open the design's Edit mode from its header. */
async function openEdit(view) {
  const button = [...view.container.querySelectorAll('.art-segment button')].find(entry => entry.textContent === 'canvas.editMode');
  assert.ok(button, 'the Edit mode control is missing');
  await click(button);
}

/** Switch the inspector to its Properties tab. */
async function openProperties(view) {
  const tab = [...view.container.querySelectorAll('[role="tab"]')].find(entry => entry.textContent === 'panel.properties');
  assert.ok(tab, 'the Properties tab is missing');
  await click(tab);
}

/** The single drawer's accessible name. */
function drawerLabel(view) {
  const drawer = drawerOf(view);
  return drawer === null ? null : drawer.getAttribute('aria-label');
}

test('FEAT-007 AC-043: a mockup opens in View with no tool buttons', async () => {
  const { view } = await canvasFixture('04301');
  try {
    const handle = canvasDispatch.mounts[0];
    assert.equal(handle.options.mode, 'view');
    assert.deepEqual([...view.container.querySelectorAll('.art-segment button')].map(button => button.textContent), ['canvas.viewMode', 'canvas.editMode', 'tab.source']);
    assert.ok(view.container.querySelector('.art-canvas-dock'), 'no floating dock');
    assert.ok(byLabel(view, 'canvas.zoomControls'), 'the dock has no zoom controls');
    assert.equal(byLabel(view, 'canvas.select'), null, 'View shows the select tool');
    assert.equal(byLabel(view, 'canvas.hand'), null, 'View shows the hand tool');
    assert.equal(byLabel(view, 'canvas.undo'), null, 'View shows undo');
  } finally { await view.unmount(); }
});

test('FEAT-007 AC-044: pages keep Preview and Code', async () => {
  const host = fakeHost();
  const id = 'art_ws_page0440001';
  host.state.artifacts.set(id, { manifest: host.manifest(id, 'page', 'Page', 1), content: '<p>x</p>' });
  const { ctx, records } = stubContext(host);
  plugin.apply(ctx);
  const tab = slot(records, 'sidebar.right.pane.tab', 'dsh-artifact-studio/artifact');
  const view = await render(tab.component, tabProps('dsh-resource://artifact/workspace/ws-a/' + id));
  try {
    assert.deepEqual([...view.container.querySelectorAll('.art-segment button')].map(button => button.textContent), ['tab.preview', 'tab.source']);
    assert.equal(view.container.querySelector('.art-canvas-dock'), null);
    assert.equal(view.container.querySelector('.art-layer-tree'), null);
  } finally { await view.unmount(); }
});

test('FEAT-007 AC-045: opening fits the content and the dock reports the scale', async () => {
  const { view } = await canvasFixture('04501');
  try {
    const handle = canvasDispatch.mounts[0];
    await click(byLabel(view, 'canvas.zoomMenu'));
    let fit = [...view.container.querySelectorAll('[role="menuitem"]')].find(item => item.textContent === 'canvas.fit');
    assert.ok(fit, 'the zoom menu has no Fit entry');
    await click(fit);
    assert.equal(handle.fits, 1, 'Fit did not reach the handle');
    await click(byLabel(view, 'canvas.zoomMenu'));
    fit = [...view.container.querySelectorAll('[role="menuitem"]')].find(item => item.textContent === 'canvas.fit');
    assert.equal(fit.getAttribute('data-selected'), 'true', 'Fit is not marked selected');
    assert.match(byLabel(view, 'canvas.zoomMenu').textContent, /canvas.zoomValue\|percent=100/);
  } finally { await view.unmount(); }
});

test('FEAT-007 AC-046: Edit mode adds the tools and opens the inspector', async () => {
  const { view } = await canvasFixture('04601');
  try {
    const handle = canvasDispatch.mounts[0];
    await openEdit(view);
    assert.equal(handle.mode, 'edit', 'Entering Edit did not reach the handle');
    for (const label of ['canvas.select', 'canvas.hand', 'canvas.frame', 'canvas.text', 'canvas.undo', 'canvas.redo']) {
      assert.ok(byLabel(view, label), label + ' is missing from the Edit dock');
    }
    assert.equal(byLabel(view, 'canvas.undo').disabled, true, 'Undo is enabled with no history');
    assert.equal(byLabel(view, 'canvas.redo').disabled, true, 'Redo is enabled with no history');
    assert.equal(drawerLabel(view), 'canvas.inspector', 'Edit did not open the inspector');
    await click(byLabel(view, 'canvas.frame'));
    assert.equal(handle.tool, 'frame', 'the frame tool did not reach the handle');
    await act(async () => { handle.emit({ ...handle.snapshot, canUndo: true }); await settle(20); });
    assert.equal(byLabel(view, 'canvas.undo').disabled, false, 'Undo stays disabled with history');
  } finally { await view.unmount(); }
});

test('FEAT-007 AC-047: a selected layer shows the layer bar', async () => {
  const { view } = await canvasFixture('04701');
  try {
    const handle = canvasDispatch.mounts[0];
    const layer = { id: 'n1', name: 'Pro plan', type: 'TEXT', parentName: 'Pricing' };
    await act(async () => { handle.emit({ ...handle.snapshot, selection: [layer] }); await settle(30); });
    const bar = view.container.querySelector('.art-layer-bar');
    assert.ok(bar, 'no layer bar for the selection');
    assert.match(bar.textContent, /Pro plan/);
    assert.match(bar.textContent, /layer\.parentLine\|type=layer\.type\.text\|parent=Pricing/);
    assert.ok([...bar.querySelectorAll('button')].some(button => button.textContent === 'agent.ask'), 'the layer bar has no Edit with agent');
    await click(bar.querySelector('[aria-label="tab.dismiss"]'));
    assert.equal(handle.cleared, 1, 'dismiss did not clear the selection');
  } finally { await view.unmount(); }
});

test('FEAT-007 AC-048: Edit with agent quotes the selected layer', async () => {
  const composer = composerActions();
  const { host, view } = await canvasFixture('04801', { inputActions: composer.actions });
  try {
    const handle = canvasDispatch.mounts[0];
    canvasDispatch.quote = { name: 'Pro plan', path: 'Pricing / Plan row / Pro plan', type: 'TEXT', parentName: 'Plan row', jsx: '<Text size={16}>Pro</Text>' };
    await act(async () => { handle.options.onChange('SERIALIZED_CARD'); await settle(20); });
    await act(async () => {
      handle.emit({ ...handle.snapshot, selection: [{ id: 'n1', name: 'Pro plan', type: 'TEXT', parentName: 'Plan row' }] });
      await settle(20);
    });
    const bar = view.container.querySelector('.art-layer-bar');
    await click([...bar.querySelectorAll('button')].find(button => button.textContent === 'agent.ask'));
    assert.equal(host.state.artifacts.get('art_ws_canvas04801').content, 'SERIALIZED_CARD', 'the draft was not saved first');
    assert.deepEqual(composer.calls.map(call => call[0]), ['insertQuote', 'captureInsertion', 'insertText']);
    assert.match(composer.calls[0][1], /agent\.quoteDesign\|name=Pro plan\|path=Pricing \/ Plan row \/ Pro plan/);
    assert.match(composer.calls[0][1], /<Text size=\{16\}>Pro<\/Text>/);
    assert.match(composer.calls[2][1], /agent\.reference/);
    assert.equal(view.container.querySelector('.art-layer-bar'), null, 'the layer bar stayed after asking');
  } finally { await view.unmount(); }
});

test('FEAT-007 AC-049: a long layer quote is truncated', async () => {
  const { buildDesignQuote, DESIGN_QUOTE_LIMIT } = await import('../src/client/review.ts');
  const short = buildDesignQuote(t, { name: 'Card', path: 'Card', type: 'FRAME', parentName: '', jsx: '<Frame />' });
  assert.equal(short.truncated, false);
  const long = buildDesignQuote(t, { name: 'Card', path: 'Card', type: 'FRAME', parentName: '', jsx: '<Frame />'.repeat(1000) });
  assert.equal(long.truncated, true);
  assert.ok(long.text.length <= DESIGN_QUOTE_LIMIT, 'the truncated quote is over the limit');
  assert.match(long.text, /agent\.quoteCut\|limit=4000/);
});

test('FEAT-007 AC-050: the inspector and History share one drawer', async () => {
  const { view } = await canvasFixture('05001');
  try {
    await openEdit(view);
    assert.equal(drawerLabel(view), 'canvas.inspector');
    await click(byLabel(view, 'tab.history'));
    assert.equal(drawerLabel(view), 'history.title', 'History did not replace the inspector');
    assert.equal(view.container.querySelectorAll('.art-drawer').length, 1, 'two drawers are open at once');
    await click(view.container.querySelector('.art-header [aria-label="canvas.inspector"]'));
    assert.equal(drawerLabel(view), 'canvas.inspector', 'the inspector toggle did not reopen the inspector');
    assert.equal(view.container.querySelectorAll('.art-drawer').length, 1);
  } finally { await view.unmount(); }
});

test('FEAT-007 AC-051: Layer rows drive the handle', async () => {
  canvasDispatch.snapshot = rowsSnapshot([
    layerRow('f1', 'Pricing', 'FRAME', 1, { hasChildren: true, expanded: true }),
    layerRow('t1', 'Pro plan', 'TEXT', 2, { selected: true }),
  ], { properties: { name: 'Pro plan', type: 'TEXT' } });
  const { view } = await canvasFixture('05101');
  try {
    const handle = canvasDispatch.mounts[0];
    await openEdit(view);
    const row = view.container.querySelector('[data-layer-id="t1"]');
    assert.ok(row, 'the Text row is missing');
    assert.equal(row.getAttribute('aria-selected'), 'true');
    assert.ok(row.classList.contains('is-selected'), 'the selected row has no selected style');
    await click(row);
    assert.deepEqual(handle.selects.at(-1), { id: 't1', mode: 'replace' });
    await click(view.container.querySelector('[data-layer-id="f1"] [aria-label="panel.collapse"]'));
    assert.deepEqual(handle.expanded, ['f1']);
    await click(view.container.querySelector('[data-layer-id="t1"] [aria-label="panel.hide"]'));
    assert.deepEqual(handle.visibilities, ['t1']);
    await click(view.container.querySelector('[data-layer-id="t1"] [aria-label="panel.lock"]'));
    assert.deepEqual(handle.locks, ['t1']);
    await click(row);
    await act(async () => {
      row.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
      await settle(20);
    });
    const input = byLabel(view, 'panel.rename');
    assert.ok(input, 'double-click did not open the rename field');
    await changeValue(input, 'Upgrade');
    await act(async () => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      await settle(20);
    });
    assert.deepEqual(handle.renames, [{ id: 't1', name: 'Upgrade' }]);
  } finally { await view.unmount(); }
});

test('FEAT-007 AC-052: Layers are keyboard reachable', async () => {
  canvasDispatch.snapshot = rowsSnapshot([
    layerRow('f1', 'Pricing', 'FRAME', 1, { hasChildren: true }),
    layerRow('t1', 'Pro plan', 'TEXT', 2),
  ]);
  const { view } = await canvasFixture('05201');
  try {
    await openEdit(view);
    const tree = view.container.querySelector('[role="tree"]');
    assert.ok(tree, 'no tree');
    tree.focus();
    await act(async () => {
      tree.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
      await settle(20);
    });
    const first = view.container.querySelector('[data-layer-id="f1"]');
    assert.equal(first.getAttribute('aria-selected'), 'true', 'arrow down did not select the first row');
    assert.equal(first.getAttribute('aria-level'), '1');
    await act(async () => {
      tree.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
      await settle(20);
    });
    assert.equal(first.getAttribute('aria-expanded'), 'true', 'arrow right did not expand the frame');
    await act(async () => {
      tree.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
      await settle(20);
    });
    assert.equal(view.container.querySelector('[data-layer-id="t1"]').getAttribute('aria-selected'), 'true');
    await act(async () => {
      tree.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      await settle(20);
    });
    assert.ok(byLabel(view, 'panel.rename'), 'Enter did not start a rename');
  } finally { await view.unmount(); }
});

test('FEAT-007 AC-053: a number field previews and commits once', async () => {
  canvasDispatch.snapshot = rowsSnapshot([
    layerRow('t1', 'Pro plan', 'RECTANGLE', 1, { selected: true }),
  ], { properties: { name: 'Pro plan', type: 'RECTANGLE', x: 0, y: 0, width: 130, height: 20, rotation: 0, radius: 4, opacity: 100, visible: true } });
  const { view } = await canvasFixture('05301');
  try {
    const handle = canvasDispatch.mounts[0];
    await openEdit(view);
    await openProperties(view);
    const input = byLabel(view, 'panel.w');
    assert.ok(input, 'the width field is missing');
    assert.equal(input.value, '130');
    await act(async () => { input.focus(); await settle(10); });
    await changeValue(input, '200');
    assert.deepEqual(handle.previews.at(-1), ['width', 200], 'typing did not preview the width');
    await act(async () => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      await settle(30);
    });
    assert.deepEqual(handle.commits.at(-1), ['width', 200, 130], 'the width did not commit once with its previous value');
    assert.equal(handle.commits.filter(call => call[0] === 'width').length, 1);
  } finally { await view.unmount(); }
});

test('FEAT-007 AC-054: Mixed values read as Mixed', async () => {
  canvasDispatch.snapshot = rowsSnapshot([
    layerRow('a', 'One', 'RECTANGLE', 1, { selected: true }),
    layerRow('b', 'Two', 'RECTANGLE', 1, { selected: true }),
  ], { properties: { name: 'One', type: 'RECTANGLE', x: 0, y: 0, width: null, height: 20, rotation: 0, radius: 4, opacity: null, visible: true } });
  const { view } = await canvasFixture('05401');
  try {
    const handle = canvasDispatch.mounts[0];
    await openEdit(view);
    await openProperties(view);
    const width = byLabel(view, 'panel.w');
    assert.equal(width.value, '');
    assert.equal(width.getAttribute('placeholder'), 'panel.mixed');
    await act(async () => { width.focus(); await settle(10); });
    await changeValue(width, '50');
    await act(async () => {
      width.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      await settle(30);
    });
    assert.deepEqual(handle.commits.at(-1), ['width', 50, 0], 'a mixed field did not apply to the selection');
  } finally { await view.unmount(); }
});

test('FEAT-007 AC-055: the inspector explains the empty states', async () => {
  const { view } = await canvasFixture('05501');
  try {
    const handle = canvasDispatch.mounts[0];
    await openEdit(view);
    await openProperties(view);
    assert.match(view.container.textContent, /panel\.selectLayerHint/);
    await act(async () => {
      handle.emit(rowsSnapshot([
        layerRow('f1', 'Pricing', 'FRAME', 1, { selected: true }),
      ], { properties: { name: 'Pricing', type: 'FRAME', x: 0, y: 0, width: 320, height: 200, rotation: 0, radius: 0, opacity: 100, visible: true } }));
      await settle(20);
    });
    assert.match(view.container.textContent, /panel\.selectTextHint/);
  } finally { await view.unmount(); }
});

test('FEAT-007 AC-056: Text fields edit one text layer', async () => {
  canvasDispatch.snapshot = rowsSnapshot([
    layerRow('t1', 'Pro plan', 'TEXT', 1, { selected: true }),
  ], {
    isText: true,
    properties: { name: 'Pro plan', type: 'TEXT', x: 0, y: 0, width: 120, height: 20, rotation: 0, radius: 0, opacity: 100, visible: true, text: { family: 'Inter', weight: 400, fontSize: 16 } },
  });
  const { view } = await canvasFixture('05601');
  try {
    const handle = canvasDispatch.mounts[0];
    await openEdit(view);
    await openProperties(view);
    const family = byLabel(view, 'panel.family');
    assert.ok(family, 'the family control is missing');
    assert.deepEqual([...family.options].map(option => option.value), ['Inter', 'Roboto', 'Noto Naskh Arabic']);
    await changeSelect(family, 'Roboto');
    assert.deepEqual(handle.families, ['Roboto']);
    const weight = byLabel(view, 'panel.weight');
    assert.deepEqual([...weight.options].map(option => option.value), ['400', '500', '600', '700']);
    await changeSelect(weight, '700');
    assert.deepEqual(handle.weights, [700]);
    const size = byLabel(view, 'panel.fontSize');
    await changeValue(size, '22');
    assert.deepEqual(handle.previews.at(-1), ['fontSize', 22]);
  } finally { await view.unmount(); }
});

test('FEAT-007 AC-057: an old version opens in View only', async () => {
  const host = fakeHost();
  const id = 'art_ws_canvas05701';
  host.state.artifacts.set(id, { manifest: host.manifest(id, 'design', 'Card', 2), content: DESIGN_SOURCE, designInfo: DESIGN_INFO });
  canvasDispatch.enabled = true;
  const { ctx, records } = stubContext(host);
  plugin.apply(ctx);
  const tab = slot(records, 'sidebar.right.pane.tab', 'dsh-artifact-studio/artifact');
  const view = await render(tab.component, tabProps('dsh-resource://artifact/workspace/ws-a/' + id));
  try {
    await click(byLabel(view, 'tab.history'));
    await click([...view.container.querySelectorAll('.art-version')].find(button => button.textContent.includes('tab.versionOf|version=1')));
    await flushCanvas();
    const edit = [...view.container.querySelectorAll('.art-segment button')].find(button => button.textContent === 'canvas.editMode');
    assert.equal(edit.disabled, true, 'Edit is offered for an old version');
    assert.equal(byLabel(view, 'canvas.inspector'), null, 'the inspector toggle is offered for an old version');
    assert.match(view.container.textContent, /tab\.viewingOld/);
  } finally { await view.unmount(); }
});

test('FEAT-007 AC-058: a canvas failure keeps the PNG with a retry bar', async () => {
  canvasDispatch.fail = 'The canvas chunk did not load.';
  const { view } = await canvasFixture('05801');
  try {
    assert.ok(view.container.querySelector('img.art-design-image'));
    const bar = view.container.querySelector('.art-bar[data-tone="error"]');
    assert.ok(bar, 'no error bar');
    assert.match(bar.textContent, /canvas\.startFailed/);
    await click(findButton(view, 'action.retry'));
    assert.equal(canvasDispatch.attempts, 2, 'Retry did not remount the canvas');
  } finally { await view.unmount(); }
});

test('FEAT-007 AC-059: the type is called Mockup in both languages', async () => {
  const { EN, ZH } = await import('../src/client/locale.ts');
  assert.equal(EN['type.design'], 'Mockup');
  assert.equal(ZH['type.design'], '原型');
  assert.equal(EN['gallery.newDesign'], 'New mockup');
  assert.equal(ZH['gallery.newDesign'], '新建原型');
  assert.equal(EN['create.untitledDesign'], 'Untitled mockup');
  assert.equal(ZH['create.untitledDesign'], '未命名原型');
  assert.equal(EN['gallery.design'], 'Design system', 'the token editor was renamed');
  assert.equal(ZH['design.title'], '设计系统');
});

test('FEAT-007 AC-060: Gallery covers fetch only for visible mockups', async () => {
  const host = fakeHost();
  for (const suffix of ['a', 'b', 'c']) {
    const id = 'art_ws_mock060' + suffix.repeat(3);
    host.state.artifacts.set(id, { manifest: host.manifest(id, 'design', 'Mockup ' + suffix, 1), content: DESIGN_SOURCE, designInfo: DESIGN_INFO });
  }
  const { ctx, records } = stubContext(host);
  plugin.apply(ctx);

  const pending = [];
  let previews = 0;
  host.state.previewHandler = async () => {
    previews += 1;
    const gate = deferred();
    pending.push(gate);
    await gate.promise;
    return { ok: true, value: { mediaType: 'image/png', data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB', width: 320, height: 120, info: DESIGN_INFO } };
  };

  try {
    const view = await galleryView(records);
    await act(async () => settle(400));
    assert.equal(previews, 2, 'more than two covers started at once');
    pending[0].resolve();
    await act(async () => settle(160));
    assert.equal(previews, 3, 'the queued cover did not start after a slot freed');
    pending[1].resolve();
    pending[2].resolve();
    await act(async () => settle(200));
    await view.unmount();
    const before = previews;
    const again = await galleryView(records);
    await act(async () => settle(150));
    assert.equal(previews, before, 'a second gallery render refetched a cached cover');
    await again.unmount();
  } finally {
    host.state.previewHandler = null;
  }
});

test('FEAT-007 AC-060: mockup covers wait for visibility', async () => {
  const host = fakeHost();
  const id = 'art_ws_mock060visible';
  host.state.artifacts.set(id, { manifest: host.manifest(id, 'design', 'Hidden mockup', 1), content: DESIGN_SOURCE, designInfo: DESIGN_INFO });
  const { ctx, records } = stubContext(host);
  plugin.apply(ctx);
  global.IntersectionObserver = class {
    constructor(callback) { this.callback = callback; }
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  try {
    const view = await galleryView(records);
    await act(async () => settle(220));
    assert.ok(view.container.querySelector('.art-cover'), 'no cover mounted');
    assert.equal(host.calls.filter(call => call.endpoint === 'preview').length, 0, 'an off-screen cover fetched its PNG');
    assert.ok(view.container.querySelector('.art-cover-fallback'), 'the hidden cover has no fallback glyph');
    await view.unmount();
  } finally {
    delete global.IntersectionObserver;
  }
});

test('FEAT-007 AC-061: the skill calls the type a mockup', async () => {
  const { ARTIFACT_DESIGN_SKILL } = await import('../src/host/lib/skill.ts');
  assert.match(ARTIFACT_DESIGN_SKILL.content, /Call this artifact a mockup when you talk to the user/);
  assert.match(ARTIFACT_DESIGN_SKILL.content, /tools still take type/);
});

test('FEAT-007 AC-062: an empty design shows a hint in the canvas', async () => {
  const { view } = await canvasFixture('06201');
  try {
    const hint = view.container.querySelector('.art-canvas-empty');
    assert.ok(hint, 'no empty-canvas hint');
    assert.match(hint.textContent, /canvas\.empty/);
    assert.ok(view.container.querySelector('.art-canvas-dock'), 'the dock disappeared on an empty design');
  } finally { await view.unmount(); }
});

test('FEAT-007 AC-063: the inspector toggle reopens the drawer', async () => {
  const { view } = await canvasFixture('06301');
  try {
    await openEdit(view);
    await click(byLabel(view, 'canvas.closeInspector'));
    assert.equal(drawerOf(view), null, 'the inspector stayed open');
    const edit = [...view.container.querySelectorAll('.art-segment button')].find(button => button.textContent === 'canvas.editMode');
    assert.equal(edit.getAttribute('aria-selected'), 'true', 'closing the inspector left Edit mode');
    await click(view.container.querySelector('.art-header [aria-label="canvas.inspector"]'));
    assert.equal(drawerLabel(view), 'canvas.inspector', 'the toggle did not reopen the inspector');
    assert.equal(edit.getAttribute('aria-selected'), 'true');
  } finally { await view.unmount(); }
});

test('FEAT-007 AC-064: Narrow panels keep the header controls', async () => {
  const css = await fs.readFile(path.join(root, 'src/client/styles.ts'), 'utf8');
  assert.match(css, /\.art-canvas-dock \{[^}]*position: absolute;/s);
  assert.match(css, /@container \(max-width: 600px\) \{[\s\S]*?\.art-canvas-dock \{/s);
  assert.match(css, /@container \(max-width: 600px\) \{[\s\S]*?\.art-layer-bar \{/s);
  assert.match(css, /\.art-editor-header \{[^}]*flex-wrap: wrap;/s);
  assert.doesNotMatch(css, /\.art-canvas-toolbar/);
});

test('FEAT-007 AC-065: Every new inspector and dock string is localized', async () => {
  const { EN, ZH } = await import('../src/client/locale.ts');
  for (const key of ['canvas.viewMode', 'canvas.editMode', 'canvas.opening', 'canvas.startFailed', 'canvas.empty', 'canvas.inspector', 'canvas.inspectorTabs', 'canvas.editOldVersion', 'agent.quoteDesign', 'agent.quoteCut', 'agent.addedTruncatedDesign', 'layer.parentLine', 'layer.type.frame', 'panel.positionSize', 'panel.appearance', 'panel.text', 'panel.selectLayerHint', 'panel.selectTextHint']) {
    assert.ok(EN[key], 'en is missing ' + key);
    assert.ok(ZH[key], 'zh is missing ' + key);
  }
  assert.deepEqual(Object.keys(EN).sort(), Object.keys(ZH).sort());
});


const SHEET_CONTENT = JSON.stringify({
  schemaVersion: 1,
  sheets: [{
    name: 'Budget',
    cells: {
      A1: 'Item', B1: 'Cost', A2: 'Hosting', B2: 1200, B3: 800,
      B4: '=SUM(B2:B3)', C2: '=B2*1.2',
    },
  }],
});

/** Mount the sheet editor chunk directly with recording callbacks. */
async function mountSheet(content = SHEET_CONTENT, editable = true) {
  const element = document.createElement('div');
  document.body.appendChild(element);
  const changes = [];
  const selections = [];
  let saves = 0;
  const live = {
    current: {
      onChange: (json) => changes.push(json),
      onSave: () => { saves += 1; },
      onSelectionText: (text) => selections.push(text),
      t,
    },
  };
  const handle = sheetChunk.mountSheetEditor({ element, content, editable, label: 'Budget', dark: false, live });
  await act(async () => settle(80));
  return { element, handle, changes, selections, savesRef: () => saves };
}

/** Click one cell of the mounted grid. */
async function clickSheetCell(element, column, row) {
  const scroll = element.querySelector('.art-sheet-scroll');
  assert.ok(scroll, 'the sheet grid did not render');
  const x = column * 96 + 40;
  const y = (row - 1) * 28 + 14;
  await act(async () => {
    scroll.dispatchEvent(new window.MouseEvent('pointerdown', { bubbles: true, clientX: x, clientY: y }));
    await settle(30);
  });
  return scroll;
}

test('SHEET-AC-101: the sheet editor renders values and commits a formula-bar edit', async () => {
  const { element, handle, changes, selections } = await mountSheet();
  try {
    assert.match(element.textContent, /Hosting/);
    assert.match(element.textContent, /1440/);
    assert.match(element.textContent, /2000/);
    await clickSheetCell(element, 1, 2);
    const bar = element.querySelector('[aria-label="sheet.formulaBar"]');
    assert.equal(bar.value, '1200');
    await changeValue(bar, '1500');
    await act(async () => {
      bar.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      await settle(60);
    });
    assert.ok(changes.length > 0);
    const last = JSON.parse(changes[changes.length - 1]);
    assert.equal(last.sheets[0].cells.B2, 1500);
    assert.match(element.textContent, /1800/);
    assert.ok(selections.some((text) => text.includes('Budget!')), JSON.stringify(selections));
  } finally {
    handle.destroy();
    element.remove();
  }
});

test('SHEET-AC-102: formatting changes the draft and undo restores it', async () => {
  const { element, handle, changes } = await mountSheet();
  try {
    await clickSheetCell(element, 0, 1);
    await click([...element.querySelectorAll('button')].find((button) => button.getAttribute('aria-label') === 'sheet.bold'));
    const bolded = JSON.parse(changes[changes.length - 1]);
    assert.equal(bolded.sheets[0].cells.A1.style.bold, true);
    await click([...element.querySelectorAll('button')].find((button) => button.getAttribute('aria-label') === 'sheet.undo'));
    const undone = JSON.parse(changes[changes.length - 1]);
    assert.equal(undone.sheets[0].cells.A1.style, undefined);
  } finally {
    handle.destroy();
    element.remove();
  }
});

test('SHEET-AC-103: a read-only sheet does not accept edits', async () => {
  const { element, handle, changes } = await mountSheet(SHEET_CONTENT, false);
  try {
    const scroll = await clickSheetCell(element, 0, 1);
    await act(async () => {
      scroll.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'x', bubbles: true }));
      await settle(30);
    });
    assert.equal(element.querySelector('.art-sheet-cell-input'), null);
    assert.equal(changes.length, 0);
  } finally {
    handle.destroy();
    element.remove();
  }
});

test('SHEET-AC-104: the gallery shows a sheet cover and the sheet type filter', async () => {
  const host = fakeHost();
  host.state.artifacts.set('art_ws_sheetcover01', { manifest: host.manifest('art_ws_sheetcover01', 'sheet', 'Budget', 2), content: SHEET_CONTENT });
  const { ctx, records } = stubContext(host);
  plugin.apply(ctx);
  const view = await galleryView(records);
  await act(async () => settle(150));
  assert.ok(view.container.querySelector('.art-cover-sheet'), 'a sheet cover should render');
  assert.match(view.container.textContent, /Budget/);
  assert.match(view.container.textContent, /Hosting/);
  assert.match(view.container.textContent, /type.sheet/);
  assert.match(view.container.textContent, /type.all/);
  await view.unmount();
});

test('SHEET-AC-105: a sheet card names its type and opens the tab', async () => {
  const host = fakeHost();
  const { ctx, records } = stubContext(host);
  plugin.apply(ctx);
  const card = slot(records, 'tool.call.toolview', 'artifact_create');
  const meta = { kind: 'artifact', v: 1, id: 'art_ws_sheetcard01', scope: 'workspace', type: 'sheet', title: 'Budget', version: 1, workspaceId: 'ws-a' };
  const view = await render(card.component, { t, phase: 'result', toolName: 'artifact_create', block: { isError: false, meta, content: [] } });
  assert.match(view.container.textContent, /Budget/);
  assert.match(view.container.textContent, /type.sheet/);
  await click(view.container.querySelector('button'));
  assert.deepEqual(records.opened, ['dsh-resource://artifact/workspace/ws-a/art_ws_sheetcard01']);
  await view.unmount();
});

test('SHEET-AC-106: the artifact tab mounts the sheet editor and autosaves a cell edit', async () => {
  const host = fakeHost();
  const id = 'art_ws_sheettab001';
  host.state.artifacts.set(id, { manifest: host.manifest(id, 'sheet', 'Budget tab', 1), content: SHEET_CONTENT });
  const { ctx, records } = stubContext(host);
  plugin.apply(ctx);
  const tab = slot(records, 'sidebar.right.pane.tab', 'dsh-artifact-studio/artifact');
  const view = await render(tab.component, tabProps('dsh-resource://artifact/workspace/ws-a/' + id));
  await act(async () => settle(200));
  const bar = view.container.querySelector('.art-sheet-formula-input');
  assert.ok(bar, 'sheet editor did not mount: ' + view.container.textContent.slice(0, 200));
  await changeValue(bar, '42');
  await act(async () => settle(60));
  await act(async () => {
    bar.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await settle(60);
  });
  await act(async () => settle(1400));
  assert.equal(host.state.artifacts.get(id).manifest.version, 2);
  assert.match(host.state.artifacts.get(id).content, /"A1": 42/);
  await view.unmount();
});
test('SHEET-AC-107: a filled cell gets a readable default text color', async () => {
  const content = JSON.stringify({
    schemaVersion: 1,
    sheets: [{
      name: 'Contrast',
      cells: {
        A1: { value: 'Light', style: { background: '#eceff4' } },
        B1: { value: 'Dark', style: { background: '#1e1e1e' } },
        C1: { value: 'Explicit', style: { background: '#ffffff', color: '#1f2933' } },
        A2: { value: 'Invisible', style: { background: '#ffffff', color: '#ffffff' } },
      },
    }],
  });
  const { element, handle } = await mountSheet(content);
  try {
    const light = element.querySelector('[data-cell="A1"]');
    const dark = element.querySelector('[data-cell="B1"]');
    const explicit = element.querySelector('[data-cell="C1"]');
    const invisible = element.querySelector('[data-cell="A2"]');
    assert.ok(light && dark && explicit && invisible, 'the filled cells did not render');
    assert.equal(light.style.background, 'rgb(236, 239, 244)');
    assert.notEqual(light.style.color, '');
    assert.notEqual(light.style.color, 'rgb(255, 255, 255)');
    assert.match(light.style.color, /(31,\s*41,\s*51|#1f2933)/i);
    assert.match(dark.style.color, /(255,\s*255,\s*255|#ffffff)/i);
    assert.match(explicit.style.color, /(31,\s*41,\s*51|#1f2933)/i);
    assert.match(invisible.style.color, /(31,\s*41,\s*51|#1f2933)/i);
  } finally {
    handle.destroy();
    element.remove();
  }
});

