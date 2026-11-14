import { build } from 'esbuild';
import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
// The Web shell provides these modules to every plugin bundle at runtime.
const EXTERNAL = ['react', 'react-dom', 'react/jsx-runtime', 'react-dom/client', '@deepseek-ai/dsh-client-ui-primitives'];
// The engine imports these only on its server path; the browser bundle never runs it.
const NODE_BUILTINS = ['fs', 'path', 'os', 'url', 'node:*'];
// The canvas does not draw WebGPU shader paints, and the shader library is 39 MB of source.
const SHADERS_STUB = path.join(ROOT, 'src/client/canvas/shaders-stub.ts');

/** The CanvasKit build the engine loads, copied into the package beside the host. */
const WASM = path.join(ROOT, 'node_modules/canvaskit-wasm/bin/canvaskit.wasm');
const FONT_SOURCE = path.join(ROOT, 'node_modules/@open-pencil/core/assets');
const FONTS = ['Inter-Regular.ttf', 'Inter-Medium.ttf', 'Inter-SemiBold.ttf', 'Inter-Bold.ttf', 'Inter-ExtraBold.ttf', 'NotoNaskhArabic-Regular.ttf'];
const ICONS = path.join(ROOT, 'node_modules/@iconify-json/mdi/icons.json');
const ROBOTO_SOURCE = path.join(ROOT, 'node_modules/roboto-fontface/fonts/roboto');
const ROBOTO = ['Roboto-Regular.woff2', 'Roboto-Medium.woff2', 'Roboto-Bold.woff2'];

/**
 * Bundle one entry and return its CommonJS text.
 * @param {string} entry - entry file relative to the repository.
 * @param {import('esbuild').BuildOptions} overrides - options for this entry.
 * @returns {Promise<string>} the bundled text.
 */
async function bundle(entry, overrides = {}) {
  const result = await build({
    entryPoints: [path.join(ROOT, entry)],
    bundle: true,
    write: false,
    format: 'cjs',
    platform: 'browser',
    target: ['chrome120'],
    minify: true,
    sourcemap: false,
    jsx: 'automatic',
    jsxImportSource: 'react',
    external: EXTERNAL,
    legalComments: 'none',
    logLevel: 'silent',
    ...overrides,
  });
  if (result.errors.length > 0) {
    for (const error of result.errors) console.error(error.text);
    throw new Error(`Bundle failed: ${entry}`);
  }
  return result.outputFiles[0].text;
}

/**
 * Wrap a CommonJS bundle in the harness module loader format.
 * @param {string} js - the bundled text.
 * @param {{ id: string, chunk?: string, bridge?: boolean }} options - loader options.
 * @returns {string} the client artifact.
 */
function wrap(js, options) {
  const chunkLine = options.chunk === undefined ? '' : `\n  chunk: ${JSON.stringify(options.chunk)},`;
  const bridge = options.bridge === true ? '\n    globalThis.__dshArtifactsRequireAsync = require.async;' : '';
  return `window.__ModuleLoader__.load({
  id: ${JSON.stringify(options.id)},${chunkLine}
  factory(require) {
    var module = { exports: {} };
    var exports = module.exports;${bridge}
${js}
    return module.exports;
  },
});
`;
}

/**
 * Copy the engine files the canvas loads at runtime into the package.
 */
async function copyAssets() {
  const assets = path.join(ROOT, 'assets');
  await fs.mkdir(path.join(assets, 'fonts'), { recursive: true });
  await fs.copyFile(WASM, path.join(assets, 'canvaskit.wasm'));
  await fs.copyFile(ICONS, path.join(assets, 'icons.json'));
  for (const font of FONTS) await fs.copyFile(path.join(FONT_SOURCE, font), path.join(assets, 'fonts', font));
  for (const font of ROBOTO) await fs.copyFile(path.join(ROBOTO_SOURCE, font), path.join(assets, 'fonts', font));
}

const manifest = JSON.parse(await fs.readFile(path.join(ROOT, 'package.json'), 'utf8'));
const defines = {
  __CANVAS_ASSET_VERSION__: JSON.stringify(manifest.version),
};
// The engine loads yoga with top-level await, so it must stay an ES module and is
// served as an asset instead of wrapped in the CommonJS module loader.
const canvas = await bundle('src/client/canvas/entry.ts', {
  format: 'esm',
  external: NODE_BUILTINS,
  alias: { 'shaders/core': SHADERS_STUB },
  define: {
    'process.env.NODE_ENV': '"production"',
    __VUE_OPTIONS_API__: 'true',
    __VUE_PROD_DEVTOOLS__: 'false',
    __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: 'false',
    ...defines,
  },
});
const loader = await bundle('src/client/canvas/loader.ts', { define: defines });
const main = await bundle('src/client/index.tsx', { define: defines });
const doc = await bundle('src/client/doc/entry.ts');
await copyAssets();
await fs.writeFile(path.join(ROOT, 'assets', 'canvas.engine.js'), canvas);
await fs.writeFile(path.join(ROOT, 'client.js'), wrap(main, { id: 'dsh-artifact-studio', bridge: true }));
await fs.writeFile(path.join(ROOT, 'client.doc.js'), wrap(doc, { id: 'dsh-artifact-studio', chunk: 'client.doc.js' }));
await fs.writeFile(path.join(ROOT, 'client.canvas.js'), wrap(loader, { id: 'dsh-artifact-studio', chunk: 'client.canvas.js' }));
console.log(`client.js ${main.length} bytes`);
console.log(`client.doc.js ${doc.length} bytes`);
console.log(`client.canvas.js ${loader.length} bytes`);
console.log(`canvas.engine.js ${canvas.length} bytes`);
