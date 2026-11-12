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
            .filter((entry) => !payload.query || entry.manifest.title.toLowerCase().includes(payload.query.toLowerCase()))
            .map((entry) => entry.manifest);
          return { ok: true, value: { items, total: items.length, hasMore: false, truncated: false } };
        }
        case 'get':
          if (item === undefined) return { ok: false, error: { code: 'artifact/not-found', message: 'gone', details: {} } };
          return { ok: true, value: { manifest: { ...item.manifest }, content: item.content, version: item.manifest.version, designCss: state.designCss } };
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
    assert.equal(view.container.querySelector('.art-row'), null);
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
    await click(view.container.querySelector('.art-row'));
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
    await click(view.container.querySelector('.art-row'));
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
  try {
    await click([...view.container.querySelectorAll('button')].find(button => button.textContent === 'agent.edit'));
    const request = view.container.querySelector('.art-request textarea');
    assert.ok(request); assert.match(request.value, new RegExp(id)); assert.match(request.value, /version=3/);
    await changeValue(request, request.value + '\nMake the title shorter');
    await click([...view.container.querySelectorAll('button')].find(button => button.textContent === 'agent.copy'));
    assert.match(request.value, /Make the title shorter/);
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
  const row = [...view.container.querySelectorAll('.art-row')].find((element) => element.textContent.includes('Alpha report'));
  await click(row);
  assert.deepEqual(opened, ['dsh-resource://artifact/workspace/ws-a/art_ws_gallery0001']);
  const libraryRow = [...view.container.querySelectorAll('.art-row')].find((element) => element.textContent.includes('Brand notes'));
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
  assert.ok(view.container.querySelector('.art-section'), 'the page rendered no sections');
  await view.unmount();
});

test('AC-035: the full page opens an artifact in place and returns', async () => {
  const host = fakeHost();
  host.state.artifacts.set('art_ws_page000020', { manifest: host.manifest('art_ws_page000020', 'page', 'Panel page', 1), content: '<h1>Panel</h1>' });
  const { ctx, records } = stubContext(host);
  plugin.apply(ctx);
  const main = slot(records, 'main', 'dsh-artifacts-panel');
  const view = await render(main.component, main.spec.inject());
  const row = [...view.container.querySelectorAll('.art-row')].find((element) => element.textContent.includes('Panel page'));
  assert.ok(row, 'no artifact row rendered');
  await click(row);
  assert.ok(view.container.querySelector('iframe'), 'the panel did not open the artifact in place');
  const back = view.container.querySelector('[aria-label="action.back"]');
  assert.ok(back, 'the panel has no back control');
  await click(back);
  assert.ok(view.container.querySelector('[aria-label="panel.workspace"]'), 'back did not return to the gallery');
  await view.unmount();
});
