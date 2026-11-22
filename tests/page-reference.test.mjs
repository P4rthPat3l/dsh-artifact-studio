import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { JSDOM } from 'jsdom';
import { composeBrief } from '../dist/host/lib/brief.js';
import { BUILTIN_RECIPES } from '../dist/host/lib/recipes.js';
import { DEFAULT_TOKENS, tokensToCss } from '../dist/contract.js';
import { composePage, PAGE_CSP } from '../dist/render.js';
import { checkPage } from '../dist/host/lib/checks.js';

const reference = new URL('../examples/page-design-system.html', import.meta.url);

test('DS-AC-005: selected page brief supplies styling and bounded verification without other format manuals', async () => {
  const content = composeBrief({ type: 'page', recipe: { ...BUILTIN_RECIPES.find(recipe => recipe.id === 'dashboard'), source: 'builtin' },
    layers: { workspace: { schemaVersion: 1, instructions: '', recipes: [] }, library: { schemaVersion: 1, instructions: '', recipes: [] } },
    tokens: DEFAULT_TOKENS, tokenSource: 'default', siblings: [] });
  for (const phrase of ['Metrics dashboard', 'Inspect the project', 'one dataset', 'Never turn missing values into zero',
    '380 and 700', 'both themes', 'keyboard focus', 'remain unverified', 'one confirmation pass',
    'localStorage', 'one update', 'no unpublished page-preview tool',
    ':root[data-artifact-theme="dark"] body', ':root[data-artifact-theme="auto"] body']) {
    assert.ok(content.includes(phrase), phrase);
  }
  assert.ok(content.includes(reference.pathname), 'page brief must expose the installed absolute reference path');
  await fs.access(reference);
});

test('DS-AC-006: packaged reference uses supported variables without network or storage dependencies', async () => {
  const source = await fs.readFile(reference, 'utf8');
  const manifest = JSON.parse(await fs.readFile(new URL('../package.json', import.meta.url), 'utf8'));
  assert.ok(manifest.files.includes('examples/page-design-system.html'));
  assert.deepEqual(checkPage(source), []);
  const css = tokensToCss(DEFAULT_TOKENS);
  for (const [, variable] of source.matchAll(/var\((--artifact-[\w-]+)/g)) {
    assert.ok(css.includes(variable + ':'), variable + ' is not injected');
  }
  assert.doesNotMatch(source, /(?:https?:|localStorage|sessionStorage|indexedDB|fetch\()/);
  const dom = new JSDOM(composePage(source, css, PAGE_CSP, 'Reference', '', 'dark'), { runScripts: 'dangerously' });
  try {
    const doc = dom.window.document;
    assert.equal(doc.documentElement.dataset.artifactTheme, 'dark');
    assert.equal(doc.querySelector('button[data-theme="host"]').getAttribute('aria-pressed'), 'true');
    doc.querySelector('button[data-theme="light"]').click();
    assert.equal(doc.documentElement.dataset.artifactTheme, 'light');
    doc.querySelector('button[data-theme="host"]').click();
    assert.equal(doc.documentElement.dataset.artifactTheme, 'dark');
    doc.getElementById('apply').click();
    assert.equal(doc.getElementById('workspace').getAttribute('aria-invalid'), 'true');
    assert.equal(doc.getElementById('workspace-error').hidden, false);
    doc.getElementById('workspace').value = 'Example';
    doc.getElementById('apply').click();
    assert.match(doc.getElementById('choice-status').textContent, /Example.*Nothing was saved or sent/);
    doc.getElementById('reset-choice').click();
    assert.equal(doc.getElementById('workspace').value, '');
    assert.equal(doc.getElementById('workspace-error').hidden, true);
    for (const input of doc.querySelectorAll('input, select')) assert.ok(input.name);
    for (const button of doc.querySelectorAll('button')) assert.equal(button.type, 'button');
    for (const control of doc.querySelectorAll('form input, form select, form button')) {
      assert.notEqual(typeof dom.window.HTMLFormElement.prototype[control.id], 'function', 'Control ID shadows a form method: ' + control.id);
    }
    assert.ok(doc.querySelector('table caption'));
    assert.ok(doc.querySelector('.table-wrap[tabindex="0"]'));
  } finally { dom.window.close(); }
});
