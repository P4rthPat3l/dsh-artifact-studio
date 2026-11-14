import { before, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { installDom, settle } from './dom.mjs';

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

let React;
let act;
let createRoot;
let plugin;
let chunk;
let blobs;

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
    if (file !== './client.doc.js') throw new Error(`Unexpected chunk ${file}`);
    return chunk;
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
  ({ createRoot } = require('react-dom/client'));
  const docArtifact = await loadArtifact('client.doc.js');
  assert.equal(docArtifact.definition.chunk, 'client.doc.js');
  chunk = docArtifact.definition.factory(docArtifact.requireModule);
  const main = await loadArtifact('client.js');
  assert.equal(main.definition.id, 'dsh-artifact-studio');
  plugin = main.definition.factory(main.requireModule);
});

beforeEach(() => {
  window.localStorage.clear();
});

const TOKENS = {
  schemaVersion: 1,
  name: 'Default',
  colors: { primary: '#1a4d8f', accent: '#d97706', surface: '#f8fafc', text: '#0f172a', muted: '#64748b' },
  colorsDark: { primary: '#86a8ff', accent: '#45c9a8', surface: '#15171b', text: '#e8e9ec', muted: '#a0a6b2' },
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
    contentFile: type === 'page' ? 'index.html' : 'document.md',
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
          return { ok: true, value: { manifest: { ...item.manifest, version }, content: version === item.manifest.version ? item.content : `version ${version}`, version, designCss: state.designCss, design: TOKENS } };
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
    await click([...view.container.querySelectorAll('button')].find(button => button.textContent === 'tab.saveContinue'));
    assert.equal(view.container.querySelector('textarea').value, 'keep me');
    assert.ok(view.container.querySelector('[role="dialog"][aria-modal="true"]'));
    await click([...view.container.querySelectorAll('button')].find(button => button.textContent === 'tab.saveContinue'));
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
    assert.equal(items.length, 2);
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
    'scope.workspace', 'scope.library', 'type.page', 'type.doc',
    'export.html', 'export.md', 'export.docx', 'design.source.workspace', 'design.source.library', 'design.source.default',
    'design.color.primary', 'design.color.accent', 'design.color.surface', 'design.color.text', 'design.color.muted',
    'design.radius.sm', 'design.radius.md', 'design.radius.lg',
    'format.heading', 'format.bold', 'format.italic', 'format.bulletList', 'format.orderedList', 'format.codeBlock',
    'prompt.dashboard', 'prompt.dashboardText', 'prompt.explainer', 'prompt.explainerText', 'prompt.report', 'prompt.reportText', 'prompt.brief', 'prompt.briefText',
    'agent.reference', 'agent.referenceOld', 'agent.added', 'agent.addedTruncated', 'agent.insertFailed', 'agent.copied',
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
    await click(findButton(pageView, 'tab.discardContinue'));
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
  host.state.artifacts.set('art_ws_cover06501', { manifest: host.manifest('art_ws_cover06501', 'page', 'Cover page', 1), content: '<h1 onclick="window.x = 1">Cover page</h1><script>window.y = 1</script>' });
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
    await click([...bar.querySelectorAll('button')].find(button => button.textContent === 'agent.ask'));
    assert.equal(host.state.artifacts.get(id).content, '<p>unsaved</p>', 'the draft was not saved first');
    assert.deepEqual(composer.calls.map(call => call[0]), ['insertQuote', 'captureInsertion', 'insertText']);
    assert.equal(composer.calls[0][1], '<p>');
    assert.match(composer.calls[2][1], new RegExp('agent\\.reference\\|title=Regression\\|id=' + id + '\\|version=4'));
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
    assert.match(writes[0], new RegExp('agent\\.reference\\|title=Full page\\|id=' + id + '\\|version=2'));

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
  assert.equal(records.tabs.some(definition => definition.kind === 'artifacts'), false, 'the right-sidebar gallery is still registered');
  assert.equal(records.slots.some(entry => entry.spec?.key === 'dsh-artifact-studio' && entry.spec.name === 'sidebar.right.pane.tab'), false);
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
