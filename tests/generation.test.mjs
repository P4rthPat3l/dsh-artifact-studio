import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { JSDOM } from 'jsdom';
import { ArtifactService } from '../dist/host/lib/service.js';
import { ArtifactStore } from '../dist/host/lib/store.js';
import { createTools } from '../dist/host/lib/tools.js';
import { checkPage } from '../dist/host/lib/checks.js';
import { BUILTIN_RECIPES } from '../dist/host/lib/recipes.js';
import { KITS, KIT_REFERENCE, LATEST_KIT, declaredKit } from '../dist/kit.js';
import { composePage, PAGE_CSP } from '../dist/render.js';
import { DEFAULT_TOKENS, tokensToCss } from '../dist/contract.js';

let base;
let home;
let registry;

before(async () => {
  base = await fs.mkdtemp(path.join(os.tmpdir(), 'dsh-artifact-guide-'));
  home = path.join(base, 'home');
  const records = [
    { id: 'ws-a', path: path.join(base, 'a'), sessionIds: ['ses-a'] },
    { id: 'ws-b', path: path.join(base, 'b'), sessionIds: ['ses-b'] },
  ];
  for (const record of records) await fs.mkdir(record.path, { recursive: true });
  registry = { get: (id) => records.find((item) => item.id === id), list: () => records };
});

after(async () => {
  await fs.rm(base, { recursive: true, force: true });
});

function service() {
  return new ArtifactService({ workspaceBase: 'artifacts/workspaces', libraryDir: 'artifacts/v1', home }, registry, new ArtifactStore());
}

function toolsFor(sessionId, svc = service()) {
  const list = createTools({ service: svc, registry, workingDirectory: { ensure: async () => registry.get(sessionId === 'ses-a' ? 'ws-a' : 'ws-b').path } });
  const byName = Object.fromEntries(list.map((tool) => [tool.name, tool]));
  const exec = { agent: { id: sessionId }, signal: new AbortController().signal };
  return { byName, run: (name, args) => byName[name].execute(args, exec) };
}

const codes = (warnings) => warnings.map((item) => item.split(':')[0]);

const KIT_PAGE = (body, extra = '') => '<!doctype html><html><head><meta name="viewport" content="width=device-width"><meta name="artifact-kit" content="1">' + extra + '</head><body><main class="ak-page">' + body + '</main></body></html>';

test('GEN-AC-001: the brief is deterministic and orders the layers by precedence', async () => {
  const { run } = toolsFor('ses-a');
  await run('artifact_guide_update', { scope: 'library', instructions: 'Write in British English.' });
  await run('artifact_guide_update', { instructions: 'Name the product LeadQuity, never CPL Leadr.' });
  const first = (await run('artifact_brief', { type: 'page', recipe: 'client-scope' })).brief;
  const second = (await run('artifact_brief', { type: 'page', recipe: 'client-scope' })).brief;
  assert.equal(first, second, 'the same inputs must give the same brief');
  const order = ['## Project conventions', '## User preferences', '## Recipe: Client scope of work', '## Design system', '## Components', '## Save'].map((head) => first.indexOf(head));
  assert.ok(order.every((index) => index >= 0), 'every layer is present');
  assert.deepEqual([...order].sort((a, b) => a - b), order, 'layers appear narrowest first');
  assert.match(first, /LeadQuity/);
  assert.match(first, /British English/);
  assert.match(first, /data-section="aim"/);
});

test('GEN-AC-002: a project guide stays in its project, and the library guide reaches every project', async () => {
  const { run } = toolsFor('ses-b');
  const brief = (await run('artifact_brief', { type: 'doc', recipe: 'feature-spec' })).brief;
  assert.doesNotMatch(brief, /LeadQuity/, 'project A conventions leaked into project B');
  assert.match(brief, /British English/);
  assert.doesNotMatch(brief, /## Components/, 'a doc brief does not carry the page kit');
});

test('GEN-AC-003: without a recipe the brief lists only recipes for the type, and a project recipe replaces a built-in one', async () => {
  const { run } = toolsFor('ses-a');
  const recipe = { id: 'client-scope', name: 'Enacton SOW', types: ['page'], purpose: 'Table-first SOW.', sections: [{ key: 'aim', title: 'Aim', purpose: 'One paragraph.' }, { key: 'journey', title: 'Journey', purpose: 'One row per journey point.' }], rules: ['No pricing.'] };
  const saved = await run('artifact_guide_update', { recipe });
  assert.deepEqual(saved.recipes, ['client-scope']);
  const menu = await run('artifact_brief', { type: 'design' });
  assert.equal(menu.recipe, null);
  assert.match(menu.brief, /- general \(builtin\)/);
  assert.doesNotMatch(menu.brief, /client-scope/, 'a page-only recipe is offered for a design');
  const own = await run('artifact_brief', { type: 'page', recipe: 'client-scope' });
  assert.match(own.brief, /Recipe: Enacton SOW \(client-scope, workspace\)/);
  assert.match(own.brief, /data-section="journey"/);
  const other = await toolsFor('ses-b').run('artifact_brief', { type: 'page', recipe: 'client-scope' });
  assert.match(other.brief, /Recipe: Client scope of work \(client-scope, builtin\)/);
  await run('artifact_guide_update', { removeRecipe: 'client-scope' });
});

test('GEN-AC-004: an unknown recipe, a recipe for another type, and an invalid recipe are refused before anything is written', async () => {
  const { run } = toolsFor('ses-a');
  const reject = async (promise, code) => assert.rejects(promise, (error) => error.code === code);
  await reject(run('artifact_brief', { type: 'page', recipe: 'nope' }), 'artifact/unknown-recipe');
  await reject(run('artifact_create', { type: 'design', title: 'x', content: '<Frame />', recipe: 'client-scope' }), 'artifact/unknown-recipe');
  await reject(run('artifact_guide_update', { recipe: { id: 'Bad Id', name: 'x', types: ['page'], purpose: 'x' } }), 'artifact/invalid-guide');
  await reject(run('artifact_guide_update', { instructions: 'x'.repeat(6001) }), 'artifact/invalid-guide');
  await reject(run('artifact_guide_update', {}), 'artifact/bad-request');
});

test('GEN-AC-005: the recipe is stored on the manifest, kept across updates, listed, and filterable', async () => {
  const { run } = toolsFor('ses-a');
  const created = await run('artifact_create', { type: 'doc', title: 'Spec one', content: '# Spec', recipe: 'feature-spec' });
  assert.equal(created.recipe, 'feature-spec');
  const updated = await run('artifact_update', { id: created.id, baseVersion: 1, content: '# Spec two' });
  assert.equal(updated.recipe, 'feature-spec', 'an update without recipe keeps it');
  const plain = await run('artifact_create', { type: 'doc', title: 'Plain', content: '# Plain' });
  assert.equal(plain.recipe, null);
  const retagged = await run('artifact_update', { id: plain.id, baseVersion: 1, recipe: 'investigation' });
  assert.equal(retagged.recipe, 'investigation');
  assert.equal(retagged.version, 2);
  const listed = await run('artifact_list', { recipe: 'feature-spec' });
  assert.deepEqual(listed.items.map((item) => item.id), [created.id]);
});

test('GEN-AC-006: the brief points to earlier artifacts with the same recipe so a series stays consistent', async () => {
  const { run } = toolsFor('ses-a');
  const spec = (await run('artifact_list', { recipe: 'feature-spec' })).items[0];
  const brief = (await run('artifact_brief', { type: 'doc', recipe: 'feature-spec' })).brief;
  assert.match(brief, /## Match earlier artifacts/);
  assert.ok(brief.includes(spec.id));
  const other = (await run('artifact_brief', { type: 'doc', recipe: 'technical-decision' })).brief;
  assert.doesNotMatch(other, /## Match earlier artifacts/);
});

test('GEN-AC-007: a page that declares the kit renders with the frozen kit after the tokens and before its own styles', () => {
  const css = tokensToCss(DEFAULT_TOKENS);
  const page = KIT_PAGE('<header class="ak-header"><h1>T</h1></header>', '<style>.ak-header{gap:0}</style>');
  const html = composePage(page, css, PAGE_CSP, 'Kit');
  const tokens = html.indexOf('data-artifact-tokens');
  const kit = html.indexOf('<style data-artifact-kit="1">');
  const own = html.indexOf('.ak-header{gap:0}');
  assert.ok(tokens >= 0 && kit > tokens && own > kit, 'order is tokens, kit, page');
  assert.ok(html.indexOf('Content-Security-Policy') < kit, 'the policy still comes first');
  assert.doesNotMatch(composePage('<p>old page</p>', css, PAGE_CSP, 'Old'), /data-artifact-kit/, 'a page without the meta gets no kit');
  assert.doesNotMatch(composePage(KIT_PAGE('').replace('content="1"', 'content="9"'), css, PAGE_CSP, 'Unknown'), /data-artifact-kit/);
  assert.equal(declaredKit('<meta content="1" name="artifact-kit">'), '1');
  assert.equal(LATEST_KIT, '1');
});

test('GEN-AC-008: the kit uses only injected tokens and literal-free values, and the reference names only kit classes', () => {
  const kit = KITS['1'];
  const css = tokensToCss(DEFAULT_TOKENS);
  for (const [, variable] of kit.css.matchAll(/var\((--artifact-[\w-]+)/g)) assert.ok(css.includes(variable + ':'), variable + ' is not injected');
  assert.doesNotMatch(kit.css, /#[0-9a-f]{3,8}\b|rgba?\(/i, 'the kit hard-codes a color');
  assert.doesNotMatch(kit.css + kit.script, /https?:|localStorage|fetch\(/);
  const named = new Set([...KIT_REFERENCE.matchAll(/\b(ak-[a-z0-9_-]+)/g)].map((match) => match[1]).filter((name) => !['ak-option', 'ak-panel', 'ak-change', 'ak-switch'].includes(name) || kit.classes.includes(name)));
  for (const name of named) assert.ok(kit.classes.includes(name), name + ' is in the reference but not the kit');
});

test('GEN-AC-009: the kit switch shows one panel per group, keeps nested groups apart, and announces the choice', async () => {
  const page = KIT_PAGE('<div class="ak-switch" data-ak-switch id="outer"><div class="ak-switch__bar"><button type="button" data-ak-option="before" aria-pressed="true">Before</button><button type="button" data-ak-option="after" aria-pressed="false">After</button></div><div data-ak-panel="before">B<div class="ak-switch" data-ak-switch id="inner"><button type="button" data-ak-option="x">X</button><button type="button" data-ak-option="y" aria-pressed="true">Y</button><div data-ak-panel="x">x</div><div data-ak-panel="y">y</div></div></div><div data-ak-panel="after">A</div></div>');
  const dom = new JSDOM(composePage(page, tokensToCss(DEFAULT_TOKENS), PAGE_CSP, 'Switch'), { runScripts: 'dangerously' });
  try {
    const doc = dom.window.document;
    // The kit script runs from the head, so it sets the first state once the body has parsed.
    if (doc.readyState === 'loading') await new Promise((resolve) => doc.addEventListener('DOMContentLoaded', resolve, { once: true }));
    const panel = (name) => doc.querySelector('[data-ak-panel="' + name + '"]');
    assert.equal(panel('before').hidden, false);
    assert.equal(panel('after').hidden, true);
    assert.equal(panel('x').hidden, true, 'the inner group starts on its pressed option');
    assert.equal(panel('y').hidden, false);
    let seen = null;
    doc.getElementById('outer').addEventListener('ak-change', (event) => { if (event.target.id === 'outer') seen = event.detail.value; });
    doc.querySelector('[data-ak-option="after"]').click();
    assert.equal(seen, 'after');
    assert.equal(panel('before').hidden, true);
    assert.equal(panel('after').hidden, false);
    assert.equal(doc.querySelector('[data-ak-option="after"]').getAttribute('aria-pressed'), 'true');
    assert.equal(panel('y').hidden, false, 'the outer click must not touch the inner group');
  } finally {
    dom.window.close();
  }
});

test('GEN-AC-010: the page check reports literal colors and fonts, unknown kit classes, and missing recipe sections', () => {
  const recipe = BUILTIN_RECIPES.find((item) => item.id === 'investigation');
  const sections = recipe.sections.filter((item) => item.required).map((item) => '<section class="ak-section" data-section="' + item.key + '"><h2>' + item.title + '</h2></section>').join('');
  const clean = KIT_PAGE(sections, '<style>.demo-wrap{--demo-bg:#0d0d14;--demo-font:"DM Mono", monospace;background:var(--demo-bg);font-family:var(--demo-font)}</style>');
  assert.deepEqual(checkPage(clean, { recipe }), [], 'custom property definitions and var() uses are allowed');
  assert.deepEqual(codes(checkPage(clean.replace('.demo-wrap{', '.demo-wrap{color:#fff;'), { recipe })), ['hard-coded-color']);
  assert.deepEqual(codes(checkPage(clean.replace('<h2>', '<h2 style="font-family: Georgia, serif">'), { recipe })), ['hard-coded-font']);
  assert.deepEqual(codes(checkPage(clean.replace('class="ak-section"', 'class="ak-section ak-hero"'), { recipe })), ['kit-class']);
  assert.deepEqual(codes(checkPage(clean.replace('data-section="cause"', ''), { recipe })), ['recipe-sections']);
  assert.match(checkPage(clean.replace('data-section="cause"', ''), { recipe })[0], /data-section="cause"/);
  assert.deepEqual(codes(checkPage(clean.replace('<meta name="artifact-kit" content="1">', '<style>body{color:var(--artifact-color-text)}</style>'), { recipe })), ['no-kit']);
  assert.deepEqual(codes(checkPage(clean.replace('content="1"', 'content="7"'))), ['kit-version', 'no-tokens']);
  const sample = KIT_PAGE('<pre><code>.x { color: #fff; font-family: Inter }</code></pre>');
  assert.deepEqual(checkPage(sample), [], 'a code sample is not a declaration');
});

test('GEN-AC-011: a page create returns recipe warnings, and an older page without a recipe keeps its old checks', async () => {
  const { run } = toolsFor('ses-a');
  const created = await run('artifact_create', { type: 'page', title: 'Bug', recipe: 'investigation', content: KIT_PAGE('<section class="ak-section" data-section="problem"><h2>Problem</h2></section>') });
  assert.deepEqual(codes(created.warnings), ['recipe-sections']);
  const old = await run('artifact_create', { type: 'page', title: 'Old', content: '<meta name="viewport" content="width=device-width"><style>body{color:var(--artifact-color-text)}</style><h1>Old</h1>' });
  assert.deepEqual(old.warnings, []);
});

test('GEN-AC-012: an invalid guide is reported and a partial save never replaces it', async () => {
  const svc = service();
  const file = path.join(home, 'artifacts/workspaces/ws-b/guide.json');
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, '{ not json');
  await assert.rejects(svc.guides({ workspaceId: 'ws-b' }), (error) => error.code === 'artifact/invalid-guide');
  await assert.rejects(svc.saveGuide({ workspaceId: 'ws-b' }, { instructions: 'Short tables.' }), (error) => error.code === 'artifact/invalid-guide');
  assert.equal(await fs.readFile(file, 'utf8'), '{ not json');
  await fs.writeFile(file, JSON.stringify({ schemaVersion: 99, instructions: 'Future', recipes: [] }));
  await assert.rejects(svc.saveGuide({ workspaceId: 'ws-b' }, { instructions: 'x' }), (error) => error.code === 'artifact/invalid-guide');
  assert.equal(JSON.parse(await fs.readFile(file, 'utf8')).schemaVersion, 99);
});

test('GEN-AC-013: a guide file planted as a link is refused, not followed', { skip: process.platform === 'win32' }, async () => {
  const svc = service();
  const file = path.join(home, 'artifacts/workspaces/ws-b/guide.json');
  const outside = path.join(base, 'outside.json');
  await fs.writeFile(outside, JSON.stringify({ instructions: 'planted' }));
  await fs.rm(file, { force: true });
  await fs.symlink(outside, file);
  await assert.rejects(svc.guides({ workspaceId: 'ws-b' }), (error) => error.code === 'artifact/forbidden-path');
  await assert.rejects(svc.saveGuide({ workspaceId: 'ws-b' }, { instructions: 'x' }), (error) => error.code === 'artifact/forbidden-path');
  assert.equal(JSON.parse(await fs.readFile(outside, 'utf8')).instructions, 'planted');
  await fs.rm(file);
});

test('GEN-AC-014: the brief for a mockup carries literal token values, and every built-in recipe is valid', async () => {
  const brief = (await toolsFor('ses-b').run('artifact_brief', { type: 'design', recipe: 'general' })).brief;
  assert.ok(brief.includes('primary ' + DEFAULT_TOKENS.colors.primary));
  assert.doesNotMatch(brief, /artifact-kit/);
  const ids = BUILTIN_RECIPES.map((item) => item.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const recipe of BUILTIN_RECIPES) assert.ok(recipe.types.length > 0 && recipe.purpose.length > 0, recipe.id);
});

test('GEN-AC-015: library briefs and renders do not depend on the calling workspace', async () => {
  const svc = service();
  await svc.saveDesignSystem({ workspaceId: 'ws-a' }, { name: 'Project A brand' });
  const a = await toolsFor('ses-a', svc).run('artifact_brief', { scope: 'library', type: 'page', recipe: 'general' });
  const b = await toolsFor('ses-b', svc).run('artifact_brief', { scope: 'library', type: 'page', recipe: 'general' });
  assert.equal(a.brief, b.brief);
  assert.doesNotMatch(a.brief, /LeadQuity|Project A brand/);
  const artifact = await svc.create({ scope: 'library' }, { type: 'page', title: 'Shared', content: KIT_PAGE('<h1>Shared</h1>'), source: { origin: 'agent', action: 'create' } });
  const first = await svc.read({ workspaceId: 'ws-a' }, artifact.id);
  const second = await svc.read({ workspaceId: 'ws-b' }, artifact.id);
  assert.deepEqual(first.design, second.design);
});

test('GEN-AC-016: prototype names are not kit releases and inert examples cannot activate the kit', () => {
  for (const version of ['constructor', '__proto__', 'toString']) {
    const page = KIT_PAGE('').replace('content="1"', 'content="' + version + '"');
    assert.doesNotThrow(() => checkPage(page));
    assert.ok(codes(checkPage(page)).includes('kit-version'));
    assert.doesNotMatch(composePage(page, '', PAGE_CSP, 'Unknown'), /<style data-artifact-kit/);
  }
  for (const html of ["<!-- <meta name=\"artifact-kit\" content=\"1\"> -->","<script>const demo = '<meta name=\"artifact-kit\" content=\"1\">';</script>","<textarea><meta name=\"artifact-kit\" content=\"1\"></textarea>","<meta name=\"artifact-kit-other\" content=\"1\">","<meta data-name=\"artifact-kit\" content=\"1\">","<div title='<meta name=\"artifact-kit\" content=\"1\">'></div>"]) {
    assert.equal(declaredKit(html), undefined, html);
  }
});

test('GEN-AC-017: recipe discovery omits the kit and chosen briefs expose token roles and actual scale bounds', async () => {
  const { run } = toolsFor('ses-a');
  const menu = await run('artifact_brief', { type: 'page' });
  assert.doesNotMatch(menu.brief, /## Components/);
  const chosen = await run('artifact_brief', { type: 'page', recipe: 'feature-spec' });
  assert.match(chosen.brief, /--artifact-color-action-text/);
  assert.match(chosen.brief, /--artifact-font-size-0/);
  assert.match(chosen.brief, /--artifact-space-0/);
  const mockup = await run('artifact_brief', { type: 'design', recipe: 'general' });
  assert.ok(mockup.brief.includes(DEFAULT_TOKENS.typography.fontFamily));
});

test('GEN-AC-018: assigning a recipe alone checks the saved page against its required sections', async () => {
  const { run } = toolsFor('ses-a');
  const page = await run('artifact_create', { type: 'page', title: 'Retag', content: KIT_PAGE('<h1>Draft</h1>') });
  const tagged = await run('artifact_update', { id: page.id, baseVersion: 1, recipe: 'investigation' });
  assert.ok(codes(tagged.warnings).includes('recipe-sections'));
});

test('GEN-AC-019: exported kit scripts initialize once when composed again', async () => {
  const page = KIT_PAGE('<div data-ak-switch><button type="button" data-ak-option="a">A</button><button type="button" data-ak-option="b">B</button><p data-ak-panel="a">A</p><p data-ak-panel="b" hidden>B</p></div>');
  const exported = composePage(page, tokensToCss(DEFAULT_TOKENS), PAGE_CSP, 'Export');
  const dom = new JSDOM(composePage(exported, tokensToCss(DEFAULT_TOKENS), PAGE_CSP, 'Reopened'), { runScripts: 'dangerously' });
  try {
    const doc = dom.window.document;
    if (doc.readyState === 'loading') await new Promise(resolve => doc.addEventListener('DOMContentLoaded', resolve, { once: true }));
    let changes = 0;
    doc.addEventListener('ak-change', () => changes++);
    doc.querySelector('[data-ak-option="b"]').click();
    assert.equal(changes, 1);
  } finally { dom.window.close(); }
});

test('GEN-AC-020: route create, update and list preserve recipe behavior', async () => {
  const { createHandler } = await import('../dist/host/lib/rpc.js');
  const handle = createHandler(service());
  const created = await handle('create', { workspaceId: 'ws-a', type: 'doc', title: 'Route recipe', content: '# Route', recipe: 'architecture' });
  assert.equal(created.ok, true);
  assert.equal(created.value.manifest.recipe, 'architecture');
  const id = created.value.manifest.id;
  const updated = await handle('update', { workspaceId: 'ws-a', id, baseVersion: 1, recipe: 'technical-decision' });
  assert.equal(updated.ok, true);
  assert.equal(updated.value.manifest.recipe, 'technical-decision');
  const list = await handle('list', { workspaceId: 'ws-a', recipe: 'technical-decision' });
  assert.ok(list.value.items.some(item => item.id === id));
  assert.ok(list.value.items.every(item => item.recipe === 'technical-decision'));
});

test('GEN-AC-021: recomposition replaces generated styles with the current resolved tokens', () => {
  const first = composePage(KIT_PAGE('<h1>Exported</h1>'), ':root{--artifact-color-primary:#111}', PAGE_CSP, 'One');
  const second = composePage(first, ':root{--artifact-color-primary:#222}', PAGE_CSP, 'Two');
  assert.equal([...second.matchAll(/<style data-artifact-tokens/g)].length, 1);
  assert.equal([...second.matchAll(/<style data-artifact-kit/g)].length, 1);
  assert.doesNotMatch(second, /primary:#111/);
});

test('GEN-AC-022: truncated tag input does not cause repeated full-source scanning', () => {
  const malformed = '<a '.repeat(50000) + 'x';
  const start = performance.now();
  assert.equal(declaredKit(malformed), undefined);
  checkPage(malformed);
  assert.ok(performance.now() - start < 1000, '150 KB of truncated tags took over one second');
});

test('GEN-AC-023: style hints accept variable fallbacks, SVG references and font declarations', () => {
  const page = KIT_PAGE('<h1>Style examples</h1>', '<style>@font-face{font-family:"Brand";src:url(data:font/woff2;base64,AAAA)} .x{color:var(--demo-text,#fff);fill:url(#fade);content:"#abcdef";font-family:var(--demo-font)}</style>');
  assert.deepEqual(checkPage(page), []);
});
