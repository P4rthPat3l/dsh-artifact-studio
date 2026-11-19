import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { checkIcon } from '../scripts/check-icon.mjs';

test('the icon fits the harness metadata cap', async () => {
  const icons = await checkIcon();
  assert.ok(icons.length > 0);
});

test('the patch loads the route plugin and the tools plugin', async () => {
  const patch = await fs.readFile(new URL('../cordis.patch.yml', import.meta.url), 'utf8');
  assert.match(patch, /name: 'dsh-artifact-studio'\n/);
  assert.match(patch, /name: 'dsh-artifact-studio\/tools'/);
  const manifest = JSON.parse(await fs.readFile(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(manifest.exports['./tools'], './dist/host/tools-plugin.js');
  for (const name of Object.keys(manifest.dependencies)) {
    const license = JSON.parse(await fs.readFile(new URL(`../node_modules/${name}/package.json`, import.meta.url), 'utf8')).license;
    assert.equal(license, 'MIT', `${name} is ${license}`);
  }
});
test('the canvas build dependencies stay out of runtime dependencies and ship a notice', async () => {
  const manifest = JSON.parse(await fs.readFile(new URL('../package.json', import.meta.url), 'utf8'));
  for (const name of ['@open-pencil/vue', 'vue', 'canvaskit-wasm', '@iconify-json/mdi', 'roboto-fontface']) {
    assert.equal(manifest.dependencies[name], undefined, `${name} is a runtime dependency`);
    assert.ok(manifest.devDependencies[name], `${name} is not a build dependency`);
  }
  assert.ok(manifest.files.includes('assets'), 'the assets directory is not shipped');
  assert.ok(manifest.files.includes('client.canvas.js'), 'the canvas chunk is not shipped');
  const notices = await fs.readFile(new URL('../THIRD_PARTY_NOTICES.md', import.meta.url), 'utf8');
  assert.match(notices, /CanvasKit/);
  assert.match(notices, /BSD/);
  assert.match(notices, /Vue/);
  assert.match(notices, /Material Design Icons/);
  assert.match(notices, /Roboto/);
  assert.match(notices, /Apache/);
});
test('the whiteboard chunk, Excalidraw, and its fonts ship with notices', async () => {
  const manifest = JSON.parse(await fs.readFile(new URL('../package.json', import.meta.url), 'utf8'));
  assert.ok(manifest.files.includes('client.board.js'), 'the whiteboard chunk is not shipped');
  assert.equal(manifest.devDependencies['@excalidraw/excalidraw'], '^0.18.1');
  assert.ok(!Object.hasOwn(manifest.dependencies, '@excalidraw/excalidraw'), 'Excalidraw must stay a build-time dependency');
  const chunk = await fs.readFile(new URL('../client.board.js', import.meta.url), 'utf8');
  assert.match(chunk, /client\.board\.js/);
  const manifestFile = JSON.parse(await fs.readFile(new URL('../assets/whiteboard/manifest.json', import.meta.url), 'utf8'));
  assert.ok(manifestFile.includes('subset-worker.chunk.js'), 'the font worker is missing from the whiteboard assets');
  assert.ok(manifestFile.some((name) => name.endsWith('.woff2')), 'no whiteboard fonts were copied');
  const notices = await fs.readFile(new URL('../THIRD_PARTY_NOTICES.md', import.meta.url), 'utf8');
  assert.match(notices, /Excalidraw/);
  assert.match(notices, /SIL Open Font License/);
  assert.match(notices, /Xiaolai/);
});

test('the sheet chunk and its formula and zip dependencies ship with notices', async () => {
  const manifest = JSON.parse(await fs.readFile(new URL('../package.json', import.meta.url), 'utf8'));
  assert.ok(manifest.files.includes('client.sheet.js'), 'the sheet chunk is not shipped');
  assert.ok(manifest.dependencies['fast-formula-parser'], 'fast-formula-parser is not a runtime dependency');
  assert.ok(manifest.dependencies.fflate, 'fflate is not a runtime dependency');
  const notices = await fs.readFile(new URL('../THIRD_PARTY_NOTICES.md', import.meta.url), 'utf8');
  assert.match(notices, /fast-formula-parser/);
  assert.match(notices, /chevrotain/);
  assert.match(notices, /Apache-2\.0/);
  assert.match(notices, /fflate/);
});

/**
 * Collect the bare package names a source tree imports.
 * @param {string} dir - directory relative to the repository.
 * @returns {Promise<Set<string>>} package names, without subpaths.
 */
async function importedPackages(dir) {
  const root = new URL('../', import.meta.url).pathname;
  const names = new Set();
  for (const file of await fs.readdir(path.join(root, dir), { recursive: true })) {
    if (!/\.tsx?$/.test(file) || file.endsWith('.d.ts')) continue;
    const text = await fs.readFile(path.join(root, dir, file), 'utf8');
    for (const [, spec] of text.matchAll(/(?:from|import\()\s*'([^'.][^']*)'/g)) {
      if (spec.startsWith('node:')) continue;
      names.add(spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0]);
    }
  }
  return names;
}

test('FEAT-007 AC-067: every package the source imports is declared in package.json', async () => {
  const manifest = JSON.parse(await fs.readFile(new URL('../package.json', import.meta.url), 'utf8'));
  // A strict install such as pnpm links only declared packages, so an undeclared import fails at runtime.
  for (const name of await importedPackages('src/host')) {
    assert.ok(manifest.dependencies[name], `src/host imports ${name}, which is not a runtime dependency`);
  }
  const provided = new Set(['react', 'react-dom', '@deepseek-ai/dsh-client-ui-primitives']);
  for (const name of await importedPackages('src/client')) {
    if (provided.has(name)) continue;
    assert.ok(manifest.dependencies[name] ?? manifest.devDependencies[name], `src/client imports ${name}, which is not declared`);
  }
});
