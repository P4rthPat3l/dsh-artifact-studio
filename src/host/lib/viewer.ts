import fs from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { escapeHtml } from '../../render.js';
import { BUNDLED_FACES } from './assets.js';
import { ArtifactError } from './errors.js';

/** Where the build writes the viewer chunk, CanvasKit, and the fonts. */
const ASSET_ROOT = fileURLToPath(new URL('../../../assets/', import.meta.url));
/** The compiled viewer, imported from a blob URL by the page. */
const VIEWER_FILE = 'canvas.viewer.js';
/** CanvasKit's WebAssembly binary. */
const CANVASKIT_FILE = 'canvaskit.wasm';
/**
 * What the page may do: run its own inline script and blob module, compile WebAssembly,
 * decode the fonts and the scene, and reach nothing but blobs. No request leaves the file.
 */
const CSP =
  "default-src 'none'; script-src 'unsafe-inline' 'wasm-unsafe-eval' blob:; style-src 'unsafe-inline'; " +
  "img-src data: blob:; font-src data: blob:; connect-src blob:";
/** The page rule that the viewer module does not replace. */
const STYLE = 'html,body{margin:0;height:100%;overflow:hidden;background:#fff}#dsh-mockup{position:fixed;inset:0}';
/**
 * The page's first script: decode the payload and hand it to the viewer. It holds no
 * artifact text, so it is a constant. A failure shows one line instead of a blank page.
 */
const BOOT = `
const node = document.getElementById('dsh-mockup-data');
const data = JSON.parse(node.textContent);
node.remove();
const fail = (error) => {
  const message = document.createElement('p');
  message.textContent = 'This mockup could not be opened. ' + (error && error.message ? error.message : '');
  message.style.cssText = 'font:14px system-ui, sans-serif;padding:24px;color:#1f2933';
  document.body.append(message);
};
const decode = async (base64) => {
  const raw = atob(base64);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
};
try {
  const [viewer, canvaskit, scene] = await Promise.all([
    decode(data.viewer),
    decode(data.canvaskit),
    decode(data.scene),
  ]);
  const fonts = await Promise.all(data.fonts.map(async (font) => ({
    family: font.family,
    style: font.style,
    file: font.file,
    bytes: (await decode(font.data)).buffer,
  })));
  const module = await import(URL.createObjectURL(new Blob([viewer], { type: 'text/javascript' })));
  await module.mountMockupViewer({
    element: document.getElementById('dsh-mockup'),
    scene: scene.buffer,
    canvaskit: canvaskit.buffer,
    fonts,
    title: data.title,
  });
} catch (error) {
  fail(error);
}
`;

/** One bundled face, compressed once and reused by every export. */
interface PackedFont {
  family: string;
  style: string;
  file: string;
  data: string;
}

/** The parts of the payload that never change, compressed once per process. */
interface PackedAssets {
  viewer: string;
  canvaskit: string;
  fonts: readonly PackedFont[];
}

let packed: Promise<PackedAssets> | undefined;

/**
 * Read one asset the build wrote beside the compiled host.
 * @param file the asset path, relative to the assets directory.
 * @returns its bytes.
 */
async function readAsset(file: string): Promise<Buffer> {
  try {
    return await fs.readFile(path.join(ASSET_ROOT, file));
  } catch {
    throw new ArtifactError('artifact/design-unavailable', `The viewer asset ${file} is missing from the package.`, {});
  }
}

/**
 * Compress one asset for inlining.
 * @param bytes the bytes.
 * @returns the gzip bytes as base64.
 */
function pack(bytes: Buffer): string {
  return zlib.gzipSync(bytes, { level: 9 }).toString('base64');
}

/**
 * Read, compress, and keep the viewer, CanvasKit, and the fonts. Every export of a
 * given package shares one copy, so a second export only compresses the scene.
 * @returns the packed parts.
 */
function packedAssets(): Promise<PackedAssets> {
  packed ??= (async (): Promise<PackedAssets> => {
    const viewer = await readAsset(VIEWER_FILE);
    const canvaskit = await readAsset(CANVASKIT_FILE);
    const faces = await Promise.all(
      BUNDLED_FACES.map(async (face): Promise<PackedFont> => ({
        family: face.family,
        style: face.style,
        file: face.file.replace(/^fonts\//, ''),
        data: pack(await readAsset(face.file)),
      })),
    );
    return { viewer: pack(viewer), canvaskit: pack(canvaskit), fonts: faces };
  })();
  return packed;
}

/**
 * A JSON string that cannot end the script element it sits in.
 * @param value the text.
 * @returns its JSON form, with `<` escaped.
 */
function scriptJson(value: string): string {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

/**
 * Build the standalone view-only page for one saved scene: the viewer, CanvasKit,
 * the fonts, and the scene inlined, so the file opens from disk with no server and
 * makes no request.
 * @param input the artifact title and the saved version's .fig bytes.
 * @returns the HTML file.
 */
export async function buildViewerHtml(input: { title: string; fig: Uint8Array }): Promise<Buffer> {
  const assets = await packedAssets();
  const fonts = assets.fonts.map((font) => JSON.stringify(font)).join(',');
  const payload =
    '{"title":' + scriptJson(input.title) +
    ',"viewer":"' + assets.viewer +
    '","canvaskit":"' + assets.canvaskit +
    '","fonts":[' + fonts + '],' +
    '"scene":"' + pack(Buffer.from(input.fig)) + '"}';
  const html = [
    '<!doctype html>',
    '<html>',
    '<head>',
    '<meta charset="utf-8">',
    '<meta http-equiv="content-security-policy" content="' + CSP + '">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    '<title>' + escapeHtml(input.title) + '</title>',
    '<style>' + STYLE + '</style>',
    '</head>',
    '<body>',
    '<div id="dsh-mockup"></div>',
    '<script type="application/json" id="dsh-mockup-data">' + payload + '</script>',
    '<script type="module">' + BOOT + '</script>',
    '</body>',
    '</html>',
    '',
  ].join('\n');
  return Buffer.from(html, 'utf8');
}
