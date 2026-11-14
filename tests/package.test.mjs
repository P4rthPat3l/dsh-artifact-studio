import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
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
  for (const name of ['@open-pencil/vue', 'vue', 'canvaskit-wasm']) {
    assert.equal(manifest.dependencies[name], undefined, `${name} is a runtime dependency`);
    assert.ok(manifest.devDependencies[name], `${name} is not a build dependency`);
  }
  assert.ok(manifest.files.includes('assets'), 'the assets directory is not shipped');
  assert.ok(manifest.files.includes('client.canvas.js'), 'the canvas chunk is not shipped');
  const notices = await fs.readFile(new URL('../THIRD_PARTY_NOTICES.md', import.meta.url), 'utf8');
  assert.match(notices, /CanvasKit/);
  assert.match(notices, /BSD/);
  assert.match(notices, /Vue/);
});
