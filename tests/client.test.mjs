import { before, test } from 'node:test';
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
  assert.equal(main.definition.id, 'dsh-artifacts');
  plugin = main.definition.factory(main.requireModule);
});

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
            .filter((entry) => !payload.type || entry.manifest.type === payload.type)
            .filter((entry) => !payload.query || entry.manifest.title.toLowerCase().includes(payload.query.toLowerCase()))
            .map((entry) => entry.manifest);
          return { ok: true, value: { items, total: items.length, hasMore: false, truncated: false } };
        }
        case 'get': {
          if (item === undefined) return { ok: false, error: { code: 'artifact/not-found', message: 'gone', details: {} } };
          const version = payload.version ?? item.manifest.version;
          return { ok: true, value: { manifest: { ...item.manifest, version }, content: version === item.manifest.version ? item.content : `version ${version}`, version, designCss: state.designCss } };
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
          const entry = { manifest: manifest(id, payload.type, payload.title, 1, payload.scope), content: payload.content };
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
              tokens: {
                schemaVersion: 1,
                name: 'Default',
                colors: { primary: '#1a4d8f', accent: '#d97706', surface: '#f8fafc', text: '#0f172a', muted: '#64748b' },
                typography: { fontFamily: 'system-ui', monoFamily: 'monospace', scale: [12] },
                spacing: { unit: 4, scale: [4] },
                radius: { sm: 4, md: 8, lg: 12 },
                notes: '',
              },
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
  const records = { tabs: [], slots: [], opened: [], openedTabs: [] };
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

async function pageFixture(suffix) {
  const host = fakeHost();
  const id = `art_ws_regression${suffix}`;
  host.state.artifacts.set(id, { manifest: host.manifest(id, 'page', 'Regression', 3), content: '<p>saved</p>' });
  const { ctx, records } = stubContext(host);
  plugin.apply(ctx);
  const tab = slot(records, 'sidebar.right.pane.tab', 'dsh-artifacts/artifact');
  const view = await render(tab.component, tabProps(`dsh-resource://artifact/workspace/ws-a/${id}`));
  await click([...view.container.querySelectorAll('.art-segment button')].find(button => button.textContent === 'tab.source'));
  return { host, id, view };
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
    assert.ok(view.container.querySelector('[role="alertdialog"]'));
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
    assert.equal(view.container.querySelector('textarea').value, 'version 2');
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
  plugin.apply(ctx); const main = slot(records, 'main', 'dsh-artifacts-panel');
  const view = await render(main.component, main.spec.inject());
  try {
    assert.match(view.container.textContent, /Only A/);
    await act(async () => { const select = view.container.querySelector('[aria-label="panel.workspace"]'); select.value = 'ws-b'; select.dispatchEvent(new Event('change', { bubbles: true })); });
    assert.equal(view.container.querySelector('.art-tile-open'), null);
  } finally { hold.resolve(); await view.unmount(); window.localStorage.clear(); }
});

test('AC-045: back restores the gallery query and scope filter', async () => {
  const host = fakeHost();
  host.state.artifacts.set('art_ws_browsecontext01', { manifest: host.manifest('art_ws_browsecontext01', 'page', 'Find me', 1), content: '' });
  const { ctx, records } = stubContext(host); plugin.apply(ctx);
  const main = slot(records, 'main', 'dsh-artifacts-panel');
  const view = await render(main.component, main.spec.inject());
  try {
    await changeValue(view.container.querySelector('input[type="search"]'), 'Find');
    await click([...view.container.querySelectorAll('.art-toolbar button')].find(button => button.textContent === 'scope.workspace'));
    await act(async () => settle(220));
    await click(view.container.querySelector('.art-tile-open'));
    await click(view.container.querySelector('[aria-label="action.back"]'));
    assert.equal(view.container.querySelector('input[type="search"]').value, 'Find');
    assert.equal([...view.container.querySelectorAll('.art-toolbar button')].find(button => button.textContent === 'scope.workspace').getAttribute('aria-pressed'), 'true');
  } finally { await view.unmount(); }
});

test('AC-036: dirty back can save or cancel and a failed save stays in place', async () => {
  const host = fakeHost(); const id = 'art_ws_backguard0001';
  host.state.artifacts.set(id, { manifest: host.manifest(id, 'page', 'Back guard', 1), content: 'original' });
  const { ctx, records } = stubContext(host); plugin.apply(ctx);
  const main = slot(records, 'main', 'dsh-artifacts-panel'); const view = await render(main.component, main.spec.inject());
  try {
    await click(view.container.querySelector('.art-tile-open'));
    await click([...view.container.querySelectorAll('.art-segment button')].find(button => button.textContent === 'tab.source'));
    await changeValue(view.container.querySelector('textarea'), 'keep me');
    await click(view.container.querySelector('[aria-label="action.back"]'));
    assert.ok(view.container.querySelector('[role="alertdialog"]'));
    host.state.failNext = { endpoint: 'update', error: { code: 'artifact/storage-failure', message: 'failed', details: {} } };
    await click([...view.container.querySelectorAll('button')].find(button => button.textContent === 'tab.saveContinue'));
    assert.equal(view.container.querySelector('textarea').value, 'keep me');
    assert.ok(view.container.querySelector('[role="alertdialog"]'));
    await click([...view.container.querySelectorAll('button')].find(button => button.textContent === 'tab.saveContinue'));
    assert.equal(view.container.querySelector('[data-artifact-id]'), null);
    assert.equal(host.state.artifacts.get(id).content, 'keep me');
  } finally { await view.unmount(); }
});

test('AC-036: unmount preserves a recoverable draft by artifact identity', async () => {
  const { host, id, view } = await pageFixture('retain');
  await changeValue(view.container.querySelector('textarea'), 'retained draft'); await view.unmount();
  const { ctx, records } = stubContext(host); plugin.apply(ctx);
  const reopened = await render(slot(records, 'sidebar.right.pane.tab', 'dsh-artifacts/artifact').component, tabProps(`dsh-resource://artifact/workspace/ws-a/${id}`));
  try {
    await click([...reopened.container.querySelectorAll('.art-segment button')].find(button => button.textContent === 'tab.source'));
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
    assert.ok(view.container.querySelector('[role="alertdialog"]'));
  } finally { await view.unmount(); }
});

test('AC-047: agent edit request is reviewable and never submits or writes', async () => {
  const { host, id, view } = await pageFixture('agent');
  const writes = [];
  Object.defineProperty(window.navigator, 'clipboard', {
    value: { writeText: async (text) => { writes.push(text); } },
    configurable: true,
  });
  try {
    await click(findButton(view, 'agent.ask'));
    const prompt = view.container.querySelector('.art-request textarea');
    const preview = view.container.querySelector('.art-request-preview pre');
    assert.ok(prompt); assert.ok(preview);
    assert.match(preview.textContent, new RegExp(id));
    assert.match(preview.textContent, /version=3/);
    await changeValue(prompt, 'Make the title shorter');
    assert.match(view.container.querySelector('.art-request-preview pre').textContent, /Make the title shorter/);
    await click(findButton(view, 'agent.copyRequest'));
    assert.equal(writes.length, 1);
    assert.match(writes[0], /Make the title shorter/);
    assert.ok(host.calls.every(call => ['get', 'list'].includes(call.endpoint)), 'request preparation wrote or submitted data');
  } finally { await view.unmount(); }
});

test('AC-048: visible heading control updates the document and round-trips Markdown', async () => {
  const changes = [];
  const view = await render(plugin.DocView, { markdown: 'Heading text', revision: '1', editable: true, label: 'Formatting doc', loadingLabel: 'Loading', failedLabel: 'Failed', onChange: text => changes.push(text), onSave: () => undefined, t });
  try {
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
  const view = await render(slot(records, 'sidebar.right.pane.tab', 'dsh-artifacts/artifact').component, tabProps(`dsh-resource://artifact/workspace/ws-a/${id}`));
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
  const component = slot(records, 'sidebar.right.pane.tab', 'dsh-artifacts/artifact').component;
  const props = tabProps(`dsh-resource://artifact/workspace/ws-a/${id}`);
  const second = await render(component, props);
  await changeValue(view.container.querySelector('textarea'), 'shared recovered draft');
  await second.unmount(); await view.unmount();
  const reopened = await render(component, props);
  try {
    await click([...reopened.container.querySelectorAll('.art-segment button')].find(button => button.textContent === 'tab.source'));
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
  const component = slot(records, 'sidebar.right.pane.tab', 'dsh-artifacts/artifact').component;
  const props = tabProps(`dsh-resource://artifact/workspace/ws-a/${id}`);
  const first = await render(component, props); const second = await render(component, props);
  try {
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
  const tab = slot(records, 'sidebar.right.pane.tab', 'dsh-artifacts/artifact');
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
  const tab = slot(records, 'sidebar.right.pane.tab', 'dsh-artifacts/artifact');
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
  const tab = slot(records, 'sidebar.right.pane.tab', 'dsh-artifacts/artifact');
  const view = await render(tab.component, tabProps('dsh-resource://artifact/workspace/ws-a/art_ws_page000003'));
  const sourceButton = [...view.container.querySelectorAll('.art-segment button')].find((button) => button.textContent === 'tab.source');
  await click(sourceButton);
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
  const tab = slot(records, 'sidebar.right.pane.tab', 'dsh-artifacts/artifact');
  const view = await render(tab.component, tabProps('dsh-resource://artifact/library/art_lib_restore0001'));
  const get = host.calls.find((call) => call.endpoint === 'get');
  assert.deepEqual(get.payload, { scope: 'library', id: 'art_lib_restore0001' });
  assert.match(view.container.textContent, /Lib doc/);
  assert.match(view.container.textContent, /scope\.library/);
  await view.unmount();
});

test('AC-008: gallery lists the workspace and the library and opens a row', async () => {
  const host = fakeHost();
  host.state.artifacts.set('art_ws_gallery0001', { manifest: host.manifest('art_ws_gallery0001', 'page', 'Alpha report', 1), content: '' });
  host.state.artifacts.set('art_lib_gallery001', { manifest: host.manifest('art_lib_gallery001', 'doc', 'Brand notes', 2, 'library'), content: '' });
  const { ctx, records } = stubContext(host);
  plugin.apply(ctx);
  const gallery = slot(records, 'sidebar.right.pane.tab', 'dsh-artifacts');
  const opened = [];
  const view = await render(gallery.component, tabProps('sidebar://artifacts', { open: (address) => opened.push(address) }));
  const lists = host.calls.filter((call) => call.endpoint === 'list').map((call) => call.payload);
  assert.ok(lists.some((payload) => payload.scope === 'workspace' && payload.workspaceId === 'ws-a'));
  assert.ok(lists.some((payload) => payload.scope === 'library'));
  assert.match(view.container.textContent, /Alpha report/);
  assert.match(view.container.textContent, /Brand notes/);
  const row = [...view.container.querySelectorAll('.art-tile-open')].find((element) => element.textContent.includes('Alpha report'));
  await click(row);
  assert.deepEqual(opened, ['dsh-resource://artifact/workspace/ws-a/art_ws_gallery0001']);
  const libraryRow = [...view.container.querySelectorAll('.art-tile-open')].find((element) => element.textContent.includes('Brand notes'));
  await click(libraryRow);
  assert.equal(opened[1], 'dsh-resource://artifact/library/art_lib_gallery001');
  await view.unmount();
});

test('AC-019: a stale UI save shows the conflict bar and keeps the draft', async () => {
  const host = fakeHost();
  host.state.artifacts.set('art_ws_conflict001', { manifest: host.manifest('art_ws_conflict001', 'page', 'Race', 1), content: '<p>a</p>' });
  const { ctx, records } = stubContext(host);
  plugin.apply(ctx);
  const tab = slot(records, 'sidebar.right.pane.tab', 'dsh-artifacts/artifact');
  const view = await render(tab.component, tabProps('dsh-resource://artifact/workspace/ws-a/art_ws_conflict001'));
  await click([...view.container.querySelectorAll('.art-segment button')].find((button) => button.textContent === 'tab.source'));
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
    ['dsh-artifacts/artifact', 'dsh-resource://artifact/workspace/ws-a/art_ws_a11y0000001'],
    ['dsh-artifacts', 'sidebar://artifacts'],
  ]) {
    const view = await render(slot(records, 'sidebar.right.pane.tab', key).component, tabProps(address));
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
  const view = await render(slot(records, 'sidebar.right.pane.tab', 'dsh-artifacts/artifact').component, tabProps('dsh-resource://artifact/workspace/ws-a/art_ws_a11y0000001'));
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
    'scope.workspace', 'scope.library', 'scope.workspaceHint', 'scope.libraryHint', 'type.page', 'type.doc',
    'export.html', 'export.md', 'export.docx', 'design.source.workspace', 'design.source.library', 'design.source.default',
    'design.color.primary', 'design.color.accent', 'design.color.surface', 'design.color.text', 'design.color.muted',
    'design.radius.sm', 'design.radius.md', 'design.radius.lg',
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

test('the composer button opens the gallery page', async () => {
  const host = fakeHost();
  const { ctx, records } = stubContext(host);
  plugin.apply(ctx);
  const button = slot(records, 'conversation.input.left', 'dsh-artifacts');
  const view = await render(button.component, { t });
  await click(view.container.querySelector('button'));
  assert.deepEqual(records.openedTabs, ['artifacts']);
  await view.unmount();
});

test('AC-034: the left navigation row opens a full artifacts page', async () => {
  const host = fakeHost();
  const { ctx, records } = stubContext(host);
  plugin.apply(ctx);
  const nav = slot(records, 'sidebar.panellist', 'dsh-artifacts-panel');
  assert.equal(nav.spec.order, 10, 'the row needs an order between the shipped rows');
  assert.ok(nav.spec.label, 'the row needs a label');
  const main = slot(records, 'main', 'dsh-artifacts-panel');
  const view = await render(main.component, main.spec.inject());
  const options = view.container.querySelectorAll('[aria-label="panel.workspace"] option');
  assert.equal(options.length, 1, 'expected one workspace option');
  assert.equal(options[0].textContent, 'Work A');
  assert.ok(view.container.querySelector('.art-templates'), 'the page rendered no starter state');
  await view.unmount();
});

test('AC-035: the full page opens an artifact in place and returns', async () => {
  const host = fakeHost();
  host.state.artifacts.set('art_ws_page000020', { manifest: host.manifest('art_ws_page000020', 'page', 'Panel page', 1), content: '<h1>Panel</h1>' });
  const { ctx, records } = stubContext(host);
  plugin.apply(ctx);
  const main = slot(records, 'main', 'dsh-artifacts-panel');
  const view = await render(main.component, main.spec.inject());
  const row = [...view.container.querySelectorAll('.art-tile-open')].find((element) => element.textContent.includes('Panel page'));
  assert.ok(row, 'no artifact row rendered');
  await click(row);
  assert.ok(view.container.querySelector('iframe'), 'the panel did not open the artifact in place');
  const back = view.container.querySelector('[aria-label="action.back"]');
  assert.ok(back, 'the panel has no back control');
  await click(back);
  assert.ok(view.container.querySelector('[aria-label="panel.workspace"]'), 'back did not return to the gallery');
  await view.unmount();
});

/** Render a document artifact tab with the shared fake host. */
async function docFixture(suffix, version = 1, content = '# Doc') {
  const host = fakeHost();
  const id = `art_ws_doc${suffix}`;
  host.state.artifacts.set(id, { manifest: host.manifest(id, 'doc', 'Doc title', version), content });
  const { ctx, records } = stubContext(host);
  plugin.apply(ctx);
  const tab = slot(records, 'sidebar.right.pane.tab', 'dsh-artifacts/artifact');
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

test('AC-049: the header carries identity, saved version, and live save status without duplicate strips', async () => {
  const host = fakeHost();
  const id = 'art_ws_header000001';
  const title = 'A very long artifact title that must truncate before it can push the header actions out of the pane';
  host.state.artifacts.set(id, { manifest: host.manifest(id, 'page', title, 3), content: '<p>saved</p>' });
  const { ctx, records } = stubContext(host);
  plugin.apply(ctx);
  const tab = slot(records, 'sidebar.right.pane.tab', 'dsh-artifacts/artifact');
  const view = await render(tab.component, tabProps(`dsh-resource://artifact/workspace/ws-a/${id}`));
  try {
    assert.equal(view.container.querySelectorAll('.art-header').length, 1, 'expected exactly one header');
    assert.ok(view.container.querySelector('.art-edit-strip') === null, 'the duplicate status strip is still present');
    const header = view.container.querySelector('.art-header');
    const meta = header.querySelector('.art-meta');
    assert.ok(meta, 'the identity line is missing');
    assert.match(meta.textContent, /scope\.workspace/);
    assert.match(meta.textContent, /ws-a/);
    assert.match(meta.textContent, /gallery\.version\|version=3/);
    assert.match(meta.textContent, /tab\.saved/);
    const status = header.querySelector('.art-save-status[aria-live="polite"]');
    assert.ok(status, 'save status is not announced in the identity line');
    assert.match(status.textContent, /tab\.saved/);
    const heading = header.querySelector('.art-title');
    assert.equal(heading.textContent, title);
    assert.equal(heading.getAttribute('title'), title);
    assert.ok(header.querySelector('[aria-label="tab.history"]'));
    assert.ok(header.querySelector('[aria-label="tab.export"]'));
    assert.ok(findButton(view, 'agent.ask'), 'Request changes is not a visible header action');
    const footer = view.container.querySelector('.art-status');
    assert.ok(footer, 'the page save hint footer is missing');
    assert.match(footer.textContent, /tab\.manualSave/);
    assert.match(footer.textContent, /tab\.outputVersion\|version=3/);
    assert.equal(footer.querySelectorAll('span').length, 2, 'the footer must stay one slim line');
    const css = await fs.readFile(path.join(root, 'src/client/styles.ts'), 'utf8');
    assert.match(css, /\.art-title \{[^}]*overflow: hidden;[^}]*text-overflow: ellipsis;/s);
    assert.match(css, /\.art-editor-actions \{[^}]*flex: none;/s);
  } finally { await view.unmount(); }

  const doc = await docFixture('header0001');
  try {
    const header = doc.view.container.querySelector('.art-header');
    assert.match(header.querySelector('.art-meta').textContent, /tab\.saved/);
    assert.match(header.querySelector('.art-meta').textContent, /gallery\.version\|version=1/);
    assert.ok(doc.view.container.querySelector('.art-status') === null, 'documents keep the always-on footer');
  } finally { await doc.view.unmount(); }
});

test('AC-050: Request changes uses the saved version and never opens after a failed save', async () => {
  const { host, id, view } = await pageFixture('request050');
  const address = `dsh-resource://artifact/workspace/ws-a/${id}`;
  const original = host.rpc.call;
  const hold = deferred();
  try {
    assert.ok(findButton(view, 'agent.ask'), 'Request changes is hidden behind More');
    await changeValue(view.container.querySelector('.art-source'), '<p>request draft</p>');
    let started = 0;
    host.rpc.call = async (...args) => { if (args[1] === 'update') { started += 1; await hold.promise; } return original(...args); };
    await click(findButton(view, 'agent.ask'));
    assert.ok(drawerOf(view) === null, 'the request opened before its save finished');
    assert.equal(started, 1, 'Request changes did not save the draft before opening');
    await act(async () => { hold.resolve(); await settle(80); });
    let box = drawerOf(view)?.querySelector('textarea');
    assert.ok(box, 'the request drawer did not open after the save');
    assert.match(drawerOf(view).querySelector('.art-request-preview pre').textContent, new RegExp(address));
    assert.match(drawerOf(view).querySelector('.art-request-preview pre').textContent, /version=4/);
    await click(view.container.querySelector('[aria-label="drawer.closeRequest"]'));
    assert.ok(drawerOf(view) === null);

    await click(view.container.querySelector('[aria-label="tab.history"]'));
    await click([...view.container.querySelectorAll('.art-version')].find(button => button.textContent.includes('tab.versionOf|version=2')));
    const updates = host.calls.filter(call => call.endpoint === 'update').length;
    await openRequest(view);
    box = drawerOf(view)?.querySelector('textarea');
    assert.ok(box, 'the historical request did not open');
    assert.match(drawerOf(view).querySelector('.art-request-preview pre').textContent, /version=2/);
    assert.equal(host.calls.filter(call => call.endpoint === 'update').length, updates, 'a historical request saved');
    await click(view.container.querySelector('[aria-label="drawer.closeRequest"]'));

    await click(findButton(view, 'tab.backToCurrent'));
    await changeValue(view.container.querySelector('.art-source'), '<p>failed request</p>');
    host.rpc.call = original;
    host.state.failNext = { endpoint: 'update', error: { code: 'artifact/storage-failure', message: 'failed', details: {} } };
    await openRequest(view);
    assert.ok(drawerOf(view) === null, 'a failed save still opened a request');
    assert.ok(view.container.querySelector('[role="alert"]'));
  } finally { hold.resolve(); await view.unmount(); }
});

test('AC-051: Request changes opens a drawer and returns focus without remounting the preview', async () => {
  const { host, id, view } = await pageFixture('request051');
  try {
    const frame = view.container.querySelector('iframe');
    const opener = findButton(view, 'agent.ask');
    opener.focus();
    await openRequest(view);
    const drawer = drawerOf(view);
    assert.ok(drawer, 'no request drawer');
    assert.equal(drawer.getAttribute('role'), 'dialog');
    assert.equal(drawer.getAttribute('aria-label'), 'agent.ask');
    assert.ok(drawer.contains(document.activeElement), 'focus did not move into the drawer');
    assert.ok(view.container.querySelector('iframe') === frame, 'opening the drawer remounted the preview');
    await act(async () => {
      drawer.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      await settle(40);
    });
    assert.ok(drawerOf(view) === null, 'Escape did not close the drawer');
    assert.ok(document.activeElement === opener, 'focus did not return to the opener');

    const writes = [];
    Object.defineProperty(window.navigator, 'clipboard', {
      value: { writeText: async (text) => { writes.push(text); } },
      configurable: true,
    });
    opener.focus();
    await openRequest(view);
    await changeValue(drawerOf(view).querySelector('textarea'), 'Make the title shorter');
    const before = host.calls.length;
    await click(findButton(view, 'agent.copyRequest'));
    assert.equal(writes.length, 1);
    assert.match(writes[0], new RegExp(id));
    assert.equal(host.calls.length, before, 'copying the request sent something to the host');
  } finally { await view.unmount(); }
});

test('AC-052: History and Request share one drawer and version selection clears a stale request', async () => {
  const { host, id, view } = await pageFixture('request052');
  window.HTMLAnchorElement.prototype.click = () => undefined;
  try {
    await openRequest(view);
    const box = drawerOf(view).querySelector('textarea');
    await changeValue(box, 'Keep this typed line');
    const typed = box.value;
    await click(view.container.querySelector('[aria-label="tab.history"]'));
    assert.equal(view.container.querySelectorAll('.art-drawer').length, 1, 'two side panels opened at once');
    assert.equal(drawerOf(view).getAttribute('aria-label'), 'history.title');
    await openRequest(view);
    assert.equal(drawerOf(view).querySelector('textarea').value, typed, 'typed request text was lost when switching panels');

    await click(view.container.querySelector('[aria-label="tab.history"]'));
    await click([...view.container.querySelectorAll('.art-version')].find(button => button.textContent.includes('tab.versionOf|version=2')));
    await openRequest(view);
    const regenerated = drawerOf(view).querySelector('textarea');
    assert.doesNotMatch(regenerated.value, /Keep this typed line/, 'a stale request survived a version change');
    assert.match(drawerOf(view).querySelector('.art-request-preview pre').textContent, /version=2/);
    await click(view.container.querySelector('[aria-label="drawer.closeRequest"]'));
    assert.equal(view.container.querySelector('.art-source').readOnly, true, 'a historical preview is editable');

    const exports = [];
    const original = host.rpc.call;
    host.rpc.call = async (...args) => {
      if (args[1] === 'export') { exports.push(args[2]); return { ok: true, value: { path: '/e.html', fileName: 'e.html', bytes: 0, mediaType: 'text/html', data: '' } }; }
      return original(...args);
    };
    await click(view.container.querySelector('[aria-label="tab.export"]'));
    await click([...view.container.querySelectorAll('[role="menuitem"]')].find(button => button.textContent === 'export.html'));
    assert.equal(exports[0].version, 2, 'historical export did not pin its version');
    assert.match(view.container.textContent, /gallery\.version\|version=2/);
  } finally { await view.unmount(); }
});

test('AC-053: panel transitions keep drafts, document revision, and the editor mount', async () => {
  const { host, id, view } = await docFixture('panel053', 1, '# Heading text');
  try {
    const prose = view.container.querySelector('.art-prose');
    const mount = view.container.querySelector('.art-doc');
    const revision = mount.getAttribute('data-doc-revision');
    await click(findButton(view, 'format.heading'));
    assert.ok(prose.querySelector('h2'), 'formatting did not reach the document');
    await openRequest(view);
    assert.ok(drawerOf(view));
    assert.ok(view.container.querySelector('.art-prose') === prose, 'the request drawer remounted the document');
    assert.equal(view.container.querySelector('.art-doc').getAttribute('data-doc-revision'), revision, 'a panel transition advanced the document revision');
    await click(view.container.querySelector('[aria-label="drawer.closeRequest"]'));
    await click(view.container.querySelector('[aria-label="tab.history"]'));
    await click(view.container.querySelector('[aria-label="history.close"]'));
    assert.ok(view.container.querySelector('.art-prose') === prose, 'history remounted the document');
    assert.equal(view.container.querySelector('.art-doc').getAttribute('data-doc-revision'), revision);
    assert.ok(view.container.querySelector('.art-doc-toolbar'), 'formatting disappeared for an editable document');
    assert.match(prose.textContent, /Heading text/);
    assert.match(host.state.artifacts.get(id).content, /^## Heading text/);
  } finally { await view.unmount(); }

  const page = await pageFixture('panel053b');
  try {
    assert.ok(findButton(page.view, 'tab.preview'));
    assert.ok(findButton(page.view, 'tab.source'));
    assert.ok(page.view.container.querySelector('.art-doc-toolbar') === null, 'page source gained document formatting');
  } finally { await page.view.unmount(); }
});

test('AC-054: gallery creation is labelled and a type-filtered empty result names the filter', async () => {
  const host = fakeHost();
  host.state.artifacts.set('art_ws_gallery05401', { manifest: host.manifest('art_ws_gallery05401', 'page', 'Project page', 1), content: '' });
  host.state.artifacts.set('art_lib_gallery0541', { manifest: host.manifest('art_lib_gallery0541', 'doc', 'Library doc', 2, 'library'), content: '' });
  const { ctx, records } = stubContext(host);
  plugin.apply(ctx);
  const main = slot(records, 'main', 'dsh-artifacts-panel');
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
    assert.ok([...view.container.querySelectorAll('[role="menuitem"]')].every(item => item.textContent.includes('scope.workspace')));
    await act(async () => {
      view.container.querySelector('[role="menu"]').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      await settle(20);
    });

    await click([...view.container.querySelectorAll('.art-toolbar button')].find(button => button.textContent === 'scope.library'));
    await click(create());
    assert.ok([...view.container.querySelectorAll('[role="menuitem"]')].every(item => item.textContent.includes('scope.library')));
    await act(async () => {
      view.container.querySelector('[role="menu"]').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      await settle(20);
    });

    await click([...view.container.querySelectorAll('.art-toolbar button')].find(button => button.textContent === 'scope.workspace'));
    await act(async () => {
      const select = view.container.querySelector('[aria-label="filter.type"]');
      Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set.call(select, 'doc');
      select.dispatchEvent(new Event('change', { bubbles: true }));
      await settle(120);
    });
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
  const tab = slot(records, 'sidebar.right.pane.tab', 'dsh-artifacts/artifact');
  const view = await render(tab.component, tabProps('dsh-resource://artifact/workspace/ws-a/art_ws_width0550001'));
  try {
    assert.ok(drawerOf(view) === null, 'a supporting panel is open by default');
    assert.ok(view.container.querySelector('.art-body > .art-stage'));
    assert.equal(view.container.querySelectorAll('.art-body > *').length, 1, 'a closed drawer still occupies the main area');
  } finally { await view.unmount(); }

  const main = slot(records, 'main', 'dsh-artifacts-panel');
  const panel = await render(main.component, main.spec.inject());
  try {
    await click(panel.container.querySelector('.art-tile-open'));
    assert.ok(panel.container.querySelector('[aria-label="action.back"]'), 'no route back to the gallery');
  } finally { await panel.unmount(); }
});

test('AC-056: new controls are named, localized, and the narrow drawer is modal', async () => {
  const originalWidth = window.innerWidth;
  Object.defineProperty(window, 'innerWidth', { value: 360, configurable: true });
  const { view } = await pageFixture('a11y056');
  try {
    await openRequest(view);
    const drawer = drawerOf(view);
    assert.ok(drawer);
    assert.equal(drawer.getAttribute('aria-modal'), 'true');
    assert.ok(view.container.querySelector('.art-drawer-scrim'), 'the modal drawer left the background reachable');
    const close = drawer.querySelector('[aria-label="drawer.closeRequest"]');
    assert.ok(close, 'the drawer has no named close control');
    const focusables = [...drawer.querySelectorAll('button:not(:disabled), textarea:not(:disabled)')];
    focusables.at(-1).focus();
    await act(async () => {
      drawer.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
      await settle(20);
    });
    assert.ok(document.activeElement === focusables[0], 'Tab escaped the modal drawer');

    const { EN, ZH } = await import('../src/client/locale.ts');
    for (const key of ['agent.ask', 'drawer.closeRequest', 'tab.readOnly', 'empty.typeMatch', 'gallery.create']) {
      assert.ok(EN[key], `en is missing ${key}`);
      assert.ok(ZH[key], `zh is missing ${key}`);
    }
    const css = await fs.readFile(path.join(root, 'src/client/styles.ts'), 'utf8');
    assert.doesNotMatch(css, /#[0-9a-f]{3,8}\b/i, 'styles.ts hard-codes a color');
    assert.match(css, /:focus-visible[^}]*outline: 2px solid var\(--dsw-alias-brand-primary\)/s);
  } finally {
    Object.defineProperty(window, 'innerWidth', { value: originalWidth, configurable: true });
    await view.unmount();
  }
});

test('AC-057: save protection, conflict, sandbox, exact-version output, and document autosave keep their contracts', async () => {
  const host = fakeHost();
  const pageId = 'art_ws_contract05701';
  const docId = 'art_ws_contract05702';
  host.state.artifacts.set(pageId, { manifest: host.manifest(pageId, 'page', 'Contract page', 2), content: '<p>one</p>' });
  host.state.artifacts.set(docId, { manifest: host.manifest(docId, 'doc', 'Contract doc', 1), content: '# Doc' });
  const { ctx, records } = stubContext(host);
  plugin.apply(ctx);
  const tab = slot(records, 'sidebar.right.pane.tab', 'dsh-artifacts/artifact');
  const pageView = await render(tab.component, tabProps(`dsh-resource://artifact/workspace/ws-a/${pageId}`));
  window.HTMLAnchorElement.prototype.click = () => undefined;
  try {
    assert.equal(pageView.container.querySelector('iframe').getAttribute('sandbox'), 'allow-scripts');
    await click(findButton(pageView, 'tab.source'));
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
      await click(findButton(docView, 'format.heading'));
      await act(async () => settle(1400));
      assert.ok(host.calls.some(call => call.endpoint === 'update' && call.payload.id === docId), 'document autosave did not run');
      assert.match(host.state.artifacts.get(docId).content, /^## Doc/);
    } finally { await docView.unmount(); }
  } finally { await pageView.unmount(); }
});

test('AC-058: a document selection becomes a quoted request and focus returns to the editor', async () => {
  const { view } = await docFixture('select058', 1, 'Heading text');
  try {
    const prose = view.container.querySelector('.art-prose');
    assert.ok(prose);
    prose.focus();
    await act(async () => { selectIn(prose, 0, 7); await settle(80); });
    const bar = view.container.querySelector('.art-selection-bar');
    assert.ok(bar, 'no selection action appeared');
    await click(bar.querySelector('button'));
    assert.equal(view.container.querySelector('.art-selection-bar'), null, 'the selection bar stayed open');
    const drawer = drawerOf(view);
    assert.ok(drawer, 'the composer did not open');
    const quote = drawer.querySelector('.art-quote blockquote');
    assert.equal(quote.textContent, 'Heading');
    assert.equal(document.activeElement, drawer.querySelector('textarea'), 'the prompt did not take focus');
    await click(drawer.querySelector('[aria-label="drawer.closeRequest"]'));
    assert.equal(document.activeElement, prose, 'focus did not return to the editor');
  } finally { await view.unmount(); }
});

test('AC-059: a page source selection quotes exactly the selected source', async () => {
  const { view } = await pageFixture('source059');
  try {
    const area = view.container.querySelector('.art-source');
    area.focus();
    area.setSelectionRange(0, 3);
    await act(async () => { area.dispatchEvent(new Event('select', { bubbles: true })); await settle(60); });
    const bar = view.container.querySelector('.art-selection-bar');
    assert.ok(bar, 'no selection action appeared over the source');
    await click(bar.querySelector('button'));
    assert.equal(drawerOf(view).querySelector('.art-quote blockquote').textContent, '<p>');
    assert.equal(area.value, '<p>saved</p>');
    await click(drawerOf(view).querySelector('[aria-label="drawer.closeRequest"]'));
    assert.equal(document.activeElement, area, 'focus did not return to the source editor');
  } finally { await view.unmount(); }
});

test('AC-060: the copied request carries identity, version, quote, and prompt', async () => {
  const { host, id, view } = await pageFixture('copy060');
  const writes = [];
  Object.defineProperty(window.navigator, 'clipboard', {
    value: { writeText: async (text) => { writes.push(text); } },
    configurable: true,
  });
  try {
    const area = view.container.querySelector('.art-source');
    area.focus();
    area.setSelectionRange(0, 3);
    await act(async () => { area.dispatchEvent(new Event('select', { bubbles: true })); await settle(60); });
    await click(view.container.querySelector('.art-selection-bar button'));
    const drawer = drawerOf(view);
    const prompt = drawer.querySelector('textarea');
    assert.equal(prompt.value, '', 'the composer mixed boilerplate into the prompt');
    await changeValue(prompt, 'Change the copy');
    const preview = drawer.querySelector('.art-request-preview pre').textContent;
    assert.match(preview, new RegExp(id));
    assert.match(preview, /version=3/);
    assert.match(preview, /Selected text:/);
    assert.match(preview, /<p>/);
    assert.match(preview, /Change the copy/);
    await click(findButton(view, 'agent.copyRequest'));
    assert.equal(writes.length, 1);
    assert.match(writes[0], /Selected text:/);
    assert.match(writes[0], /Change the copy/);
    assert.equal(host.calls.filter(call => call.endpoint === 'update').length, 0, 'copying wrote the artifact');

    await click(findButton(view, 'agent.removeQuote'));
    assert.doesNotMatch(drawer.querySelector('.art-request-preview pre').textContent, /Selected text:/);
  } finally { await view.unmount(); }
});

test('AC-061: a clean tab acknowledges an agent update while a dirty tab keeps its conflict', async () => {
  const host = fakeHost();
  const id = 'art_ws_update06101';
  host.state.artifacts.set(id, { manifest: host.manifest(id, 'page', 'Update target', 3), content: '<p>v3</p>' });
  const { ctx, records } = stubContext(host);
  plugin.apply(ctx);
  const tab = slot(records, 'sidebar.right.pane.tab', 'dsh-artifacts/artifact');
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
    await click(findButton(dirty, 'tab.source'));
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

test('AC-063: clipboard denial keeps the request visible and selectable', async () => {
  const { view } = await pageFixture('denied063');
  Object.defineProperty(window.navigator, 'clipboard', {
    value: { writeText: async () => { throw new Error('denied'); } },
    configurable: true,
  });
  try {
    await openRequest(view);
    const drawer = drawerOf(view);
    await changeValue(drawer.querySelector('textarea'), 'Change it');
    await click(findButton(view, 'agent.copyRequest'));
    assert.ok(drawer.querySelector('.art-request-preview pre').textContent.includes('Change it'));
    assert.ok(drawer.querySelector('textarea:not([disabled])'));
  } finally { await view.unmount(); }
});

test('AC-065: gallery covers render pages in an empty-script sandbox and documents as excerpts', async () => {
  const host = fakeHost();
  host.state.artifacts.set('art_ws_cover06501', { manifest: host.manifest('art_ws_cover06501', 'page', 'Cover page', 1), content: '<h1 onclick="window.x = 1">Cover page</h1><script>window.y = 1</script>' });
  host.state.artifacts.set('art_lib_cover06501', { manifest: host.manifest('art_lib_cover06501', 'doc', 'Cover doc', 1, 'library'), content: '# Cover doc\n\nReadable opening words.' });
  const { ctx, records } = stubContext(host);
  plugin.apply(ctx);
  const gallery = slot(records, 'sidebar.right.pane.tab', 'dsh-artifacts');
  const view = await render(gallery.component, tabProps('sidebar://artifacts'));
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
  const gallery = slot(records, 'sidebar.right.pane.tab', 'dsh-artifacts');
  const view = await render(gallery.component, tabProps('sidebar://artifacts'));
  try {
    const pin = view.container.querySelector('.art-tile-pin');
    await click(pin);
    assert.equal(view.container.querySelector('.art-tile-pin').getAttribute('aria-pressed'), 'true');
    assert.match(view.container.textContent, /gallery\.pinned/);
    assert.equal(JSON.parse(window.localStorage.getItem('dsh-artifacts.pins')).length, 1);
    await click(view.container.querySelector('.art-tile-pin'));
    assert.doesNotMatch(view.container.textContent, /gallery\.pinned/);
    assert.deepEqual(JSON.parse(window.localStorage.getItem('dsh-artifacts.pins')), []);
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

test('AC-068: an empty gallery creates from a starter template', async () => {
  const host = fakeHost();
  const { ctx, records } = stubContext(host);
  plugin.apply(ctx);
  const main = slot(records, 'main', 'dsh-artifacts-panel');
  const view = await render(main.component, main.spec.inject());
  try {
    const templates = [...view.container.querySelectorAll('.art-template')];
    assert.equal(templates.length, 4, 'the empty gallery did not offer the starter set');
    const dashboard = templates.find(template => template.textContent.includes('template.dashboard'));
    await click(dashboard);
    const create = host.calls.find(call => call.endpoint === 'create');
    assert.ok(create, 'the template did not create an artifact');
    assert.equal(create.payload.type, 'page');
    assert.match(create.payload.content, /Revenue by month/);
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
  const tab = slot(records, 'sidebar.right.pane.tab', 'dsh-artifacts/artifact');
  const view = await render(tab.component, tabProps(`dsh-resource://artifact/workspace/ws-a/${id}`));
  try {
    await act(async () => settle(80));
    assert.doesNotMatch(view.container.textContent, /tab\.agentUpdate/);
  } finally { await view.unmount(); }
});

test('AC-062: a long selection is trimmed to the request cap and says so', async () => {
  const host = fakeHost();
  const id = 'art_ws_long0620001';
  const content = '<p>' + 'x'.repeat(2100) + '</p>';
  host.state.artifacts.set(id, { manifest: host.manifest(id, 'page', 'Long selection', 1), content });
  const { ctx, records } = stubContext(host);
  plugin.apply(ctx);
  const tab = slot(records, 'sidebar.right.pane.tab', 'dsh-artifacts/artifact');
  const view = await render(tab.component, tabProps(`dsh-resource://artifact/workspace/ws-a/${id}`));
  try {
    await click(findButton(view, 'tab.source'));
    const area = view.container.querySelector('.art-source');
    area.focus();
    area.setSelectionRange(0, 2100);
    await act(async () => { area.dispatchEvent(new Event('select', { bubbles: true })); await settle(60); });
    await click(view.container.querySelector('.art-selection-bar button'));
    const drawer = drawerOf(view);
    assert.ok(drawer.querySelector('.art-field-hint').textContent.includes('agent.truncated'));
    const preview = drawer.querySelector('.art-request-preview pre').textContent;
    assert.ok(preview.length < 2600, 'the request kept the whole selection');
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
  const gallery = slot(records, 'sidebar.right.pane.tab', 'dsh-artifacts');
  const view = await render(gallery.component, tabProps('sidebar://artifacts'));
  try {
    await act(async () => settle(80));
    assert.match(view.container.textContent, /Still visible/);
    assert.match(view.container.querySelector('.art-bar').textContent, /error\.generic/);
  } finally { await view.unmount(); }
});
