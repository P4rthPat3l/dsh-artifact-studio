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
