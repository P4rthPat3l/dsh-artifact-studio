import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { COLOR_ROLES, DEFAULT_TOKENS, tokensToCss, tokenVariables } from '../dist/contract.js';
import { mergeTokens, resolveDesignSystem, saveDesignSystem } from '../dist/host/lib/design-system.js';

const originalRoles = ['primary', 'accent', 'surface', 'text', 'muted'];
const addedRoles = COLOR_ROLES.filter((role) => !originalRoles.includes(role));
const cssName = (role) => '--artifact-color-' + role.replace(/[A-Z]/g, (letter) => '-' + letter.toLowerCase());

async function withScopes(run) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'artifact-tokens-'));
  const library = { scope: 'library', root: path.join(root, 'library') };
  const workspace = { scope: 'workspace', root: path.join(root, 'workspace'), workspaceId: 'test' };
  await fs.mkdir(library.root);
  await fs.mkdir(workspace.root);
  try { await run({ library, workspace }); }
  finally { await fs.rm(root, { recursive: true, force: true }); }
}

test('DS-AC-001: semantic colors survive both CSS emitters and scoped save/read', async () => {
  assert.equal(COLOR_ROLES.length, 15);
  const css = tokensToCss(DEFAULT_TOKENS);
  assert.doesNotMatch(css, /undefined/);
  for (const dark of [false, true]) {
    const colors = dark ? DEFAULT_TOKENS.colorsDark : DEFAULT_TOKENS.colors;
    const vars = tokenVariables(DEFAULT_TOKENS, dark);
    for (const role of COLOR_ROLES) {
      assert.equal(vars[cssName(role)], colors[role]);
      assert.ok(css.includes(cssName(role) + ': ' + colors[role] + ';'));
    }
  }
  await withScopes(async ({ library, workspace }) => {
    const colors = Object.fromEntries(addedRoles.map((role) => [role, '#123456']));
    const colorsDark = Object.fromEntries(addedRoles.map((role) => [role, '#abcdef']));
    await saveDesignSystem(workspace, library, { colors, colorsDark });
    const read = await resolveDesignSystem(workspace, library);
    assert.equal(read.source, 'workspace');
    for (const role of addedRoles) {
      assert.equal(read.tokens.colors[role], '#123456');
      assert.equal(read.tokens.colorsDark[role], '#abcdef');
    }
  });
});

test('DS-AC-002: legacy palettes retain their brand without rewriting stored files', async () => {
  await withScopes(async ({ library, workspace }) => {
    const old = {
      schemaVersion: 1, name: 'Cool brand',
      colors: { primary: '#124e87', accent: '#2760aa', surface: '#ffffff', text: '#111111', muted: '#666666' },
      colorsDark: { primary: '#a2d1ff', accent: '#83baff', surface: '#101820', text: '#ffffff', muted: '#cccccc' },
      typography: { fontFamily: 'Verdana, sans-serif', displayFamily: 'Georgia, serif' },
    };
    const file = path.join(library.root, 'design-system.json');
    const bytes = JSON.stringify(old);
    await fs.writeFile(file, bytes);
    const inherited = await resolveDesignSystem(workspace, library);
    assert.equal(inherited.source, 'library');
    for (const set of ['colors', 'colorsDark']) {
      const colors = inherited.tokens[set];
      for (const role of originalRoles) assert.equal(colors[role], old[set][role]);
      assert.equal(colors.background, old[set].surface);
      assert.equal(colors.raised, old[set].surface);
      assert.equal(colors.control, old[set].muted);
      assert.equal(colors.action, old[set].primary);
      assert.equal(colors.actionText, old[set].surface);
      assert.equal(colors.focus, old[set].primary);
    }
    assert.equal(inherited.tokens.typography.fontFamily, old.typography.fontFamily);
    assert.equal(inherited.tokens.typography.displayFamily, old.typography.displayFamily);
    assert.equal(await fs.readFile(file, 'utf8'), bytes);
    await saveDesignSystem(workspace, library, { colors: { action: '#335577' } });
    assert.equal((await resolveDesignSystem(workspace, library)).tokens.colors.action, '#335577');
    assert.equal((await resolveDesignSystem(undefined, library)).tokens.colors.action, old.colors.primary);
    assert.equal(await fs.readFile(file, 'utf8'), bytes);
    for (const set of ['colors', 'colorsDark']) {
      for (const partial of [{ primary: '#124e87' }, { surface: '#ffffff', text: '#111111' }]) {
        await fs.writeFile(file, JSON.stringify({ [set]: partial }));
        const resolved = (await resolveDesignSystem(undefined, library)).tokens[set];
        assert.equal(resolved.background, resolved.surface);
        assert.equal(resolved.raised, resolved.surface);
        assert.equal(resolved.focus, resolved.primary);
        assert.equal(resolved.action, resolved.primary);
        assert.equal(resolved.actionText, resolved.surface);
      }
    }
  });
});

test('DS-AC-003: new roles reject unsafe CSS atomically and partial updates preserve explicit roles', async () => {
  const base = mergeTokens(DEFAULT_TOKENS, { colors: { action: '#112233', background: '#ffffff' } });
  assert.equal(mergeTokens(base, { colors: { primary: '#223344' } }).colors.action, '#112233');
  await withScopes(async ({ library, workspace }) => {
    await saveDesignSystem(workspace, library, base);
    const file = path.join(workspace.root, 'design-system.json');
    const bytes = await fs.readFile(file, 'utf8');
    for (const set of ['colors', 'colorsDark']) {
      for (const role of addedRoles) {
        await assert.rejects(saveDesignSystem(workspace, library, { [set]: { [role]: 'red;}</style>' } }),
          (error) => error.code === 'artifact/invalid-tokens');
        assert.equal(await fs.readFile(file, 'utf8'), bytes);
      }
    }
  });
});

function luminance(hex) {
  const channels = hex.slice(1).match(/../g).map((part) => parseInt(part, 16) / 255)
    .map((c) => c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}
function contrast(a, b) {
  const values = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

test('DS-AC-004: built-in text, action, status, focus and control pairs meet contrast thresholds', () => {
  for (const set of ['colors', 'colorsDark']) {
    const colors = DEFAULT_TOKENS[set];
    for (const ground of ['background', 'surface', 'raised']) {
      for (const ink of ['text', 'muted', 'primary', 'success', 'warning', 'danger']) {
        const ratio = contrast(colors[ink], colors[ground]);
        assert.ok(ratio >= 4.5, set + ' ' + ink + '/' + ground + ': ' + ratio);
      }
      for (const ink of ['focus', 'control']) {
        const ratio = contrast(colors[ink], colors[ground]);
        assert.ok(ratio >= 3, set + ' ' + ink + '/' + ground + ': ' + ratio);
      }
    }
    assert.ok(contrast(colors.actionText, colors.action) >= 4.5, set + ' action text');
  }
});
