import crypto from 'node:crypto';
import fsSync from 'node:fs';
import fs from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

const ROOT = path.resolve(import.meta.dirname, '..');

/** The Host's durable signing record for `dsh-auth-` browser cookies: the `@deepseek-ai/dsh-client-connection` browser-session grant. */
const CREDENTIAL_RECORD = 'client-connection/browser-session';
const HOST_DEFAULT_COOKIE_MAX_AGE_DAYS = 30;
// The Host rejects cookies that outlive its configured maximum (30 days by
// default), and a run mints fresh, so every mint stays well under that cap.
const COOKIE_LIFETIME_MILLISECONDS = 24 * 60 * 60 * 1000;

const base64url = (bytes) => bytes.toString('base64').replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '');

function credentialsFile() {
  const home = process.env.DSH_HOME ?? path.join(os.homedir(), '.dsh');
  return path.join(home, '.credentials.yaml');
}

/**
 * Read the durable secret that signs the Web GUI's `dsh-auth-` cookies. The
 * Harness stores it in its own credential record; the value must not leave the
 * process, so callers only receive decoded bytes.
 */
async function readBrowserSessionSecret(file = credentialsFile()) {
  const lines = (await fs.readFile(file, 'utf8')).split('\n');
  for (let at = 0; at < lines.length; at += 1) {
    if (lines[at].trim() !== `${CREDENTIAL_RECORD}:`) continue;
    for (let probe = at + 1; probe < Math.min(lines.length, at + 12); probe += 1) {
      const match = lines[probe].match(/^\s+secret:\s*([A-Za-z0-9_-]+)\s*$/);
      if (match === null) continue;
      const secret = Buffer.from(match[1].replaceAll('-', '+').replaceAll('_', '/'), 'base64');
      if (secret.length !== 32) {
        throw new Error(`${CREDENTIAL_RECORD} secret in ${file} is ${secret.length} bytes, not 32`);
      }
      return secret;
    }
    throw new Error(`${CREDENTIAL_RECORD} in ${file} carries no secret under its payload`);
  }
  throw new Error(`${file} has no ${CREDENTIAL_RECORD} record; start the Harness web profile once so it creates one`);
}

/** Mint one authority-bound browser-session cookie, the same shape the Host mints for `/?token=` visits. */
function mintBrowserSessionCookie(authority, secret, lifetime = COOKIE_LIFETIME_MILLISECONDS) {
  if (lifetime > HOST_DEFAULT_COOKIE_MAX_AGE_DAYS * 24 * 60 * 60 * 1000) {
    throw new Error(`a ${lifetime} ms cookie exceeds the Host's default ${HOST_DEFAULT_COOKIE_MAX_AGE_DAYS}-day maximum and would be rejected`);
  }
  const issuedAt = Date.now();
  const expiresAt = issuedAt + lifetime;
  const body = base64url(Buffer.from(JSON.stringify({ version: 1, authority, issuedAt, expiresAt })));
  const signature = base64url(crypto.createHmac('sha256', secret).update(body).digest());
  const name = `dsh-auth-${base64url(crypto.createHash('sha256').update(authority).digest())}`;
  return { name, value: `v1.${body}.${signature}`, expiresAt };
}

/** GET once and resolve the HTTP status, or the request error code. */
function requestStatus(url, cookie) {
  return new Promise((resolve) => {
    const request = http.get(url, { headers: cookie === undefined ? {} : { cookie: `${cookie.name}=${cookie.value}` } }, (response) => {
      response.resume();
      response.on('end', () => resolve(response.statusCode));
    });
    request.on('error', (error) => resolve(error.code ?? 'ERROR'));
    request.end();
  });
}

/**
 * Authenticate the caller for one GUI origin without printing the secret or
 * the cookie: read the record, mint, and confirm the running Host accepts it.
 */
async function authenticateDshWeb(baseUrl = process.env.DSH_WEB_URL ?? 'http://127.0.0.1:40837') {
  const secret = await readBrowserSessionSecret();
  const base = new URL(baseUrl);
  const cookie = mintBrowserSessionCookie(base.host, secret);
  const status = await requestStatus(base.origin, cookie);
  if (status >= 400) {
    throw new Error(`the running Harness rejected the minted browser cookie with HTTP ${status} on ${base.origin}; check that DSH_WEB_URL names the live web profile and that it was not recreated`);
  }
  return {
    base,
    playwrightCookie: { name: cookie.name, value: cookie.value, domain: base.hostname, path: '/', expires: Math.round(cookie.expiresAt / 1000) },
  };
}

async function firstPlayableModule(candidates) {
  const tried = [];
  for (const candidate of candidates.flat()) {
    if (candidate === undefined) continue;
    const modulePath = path.resolve(candidate);
    if (!fsSync.existsSync(path.join(modulePath, 'index.mjs'))) {
      tried.push(modulePath);
      continue;
    }
    try {
      return { chromium: (await import(pathToFileURL(path.join(modulePath, 'index.mjs')).href)).chromium, modulePath };
    } catch (error) {
      tried.push(`${modulePath} (${error.message.split('\n')[0]})`);
    }
  }
  throw new Error(
    `no usable Playwright module found among ${tried.length ? tried.join(', ') : 'the default candidates'};\n`
    + `install one with: mkdir -p .scratch/pw && npm install --prefix .scratch/pw playwright\n`
    + `or set DSH_WEB_CHECK_PLAYWRIGHT to the module's root directory`,
  );
}

/** Use an already installed Playwright; the script installs nothing. */
async function findPlaywright() {
  const npxCache = path.join(os.homedir(), '.npm', '_npx');
  const cachedInstalls = fsSync.existsSync(npxCache)
    ? (await fs.readdir(npxCache)).map((entry) => path.join(npxCache, entry, 'node_modules', 'playwright'))
    : [];
  return firstPlayableModule([
    process.env.DSH_WEB_CHECK_PLAYWRIGHT,
    path.join(ROOT, '.scratch', 'pw', 'node_modules', 'playwright'),
    cachedInstalls,
    path.join(os.homedir(), '.hermes', 'hermes-agent', 'node_modules', 'playwright'),
  ]);
}

async function findRegistryChrome() {
  const registry = path.join(os.homedir(), '.cache', 'ms-playwright');
  if (!fsSync.existsSync(registry)) return undefined;
  const builds = (await fs.readdir(registry))
    .filter((entry) => /^(chromium|chromium_headless_shell)-\d+$/.test(entry) && !entry.endsWith('(1)'))
    .sort((left, right) => Number(right.split('-')[1]) - Number(left.split('-')[1]));
  for (const build of builds) {
    for (const inner of (build.startsWith('chromium_headless_shell')
      ? ['chrome-headless-shell-linux64/chrome-headless-shell', 'chrome-linux/headless_shell']
      : ['chrome-linux/chrome', 'chrome-linux64/chrome'])) {
      const executable = path.join(registry, build, inner);
      if (fsSync.existsSync(executable)) return executable;
    }
  }
  return undefined;
}

async function launchChromium(chromium) {
  const override = process.env.DSH_WEB_CHECK_CHROME;
  if (override !== undefined) return chromium.launch({ headless: true, executablePath: override });
  try {
    return await chromium.launch({ headless: true });
  } catch (error) {
    const executable = await findRegistryChrome();
    if (executable === undefined) throw error;
    return chromium.launch({ headless: true, executablePath: executable });
  }
}

/**
 * Open one authenticated, fresh browser context against the running Web GUI.
 * Returns `{ base, browser, context }`; callers add their own pages and close
 * the browser when done.
 */
export async function openDshSession(options = {}) {
  const { base, playwrightCookie } = await authenticateDshWeb(options.baseUrl);
  const { chromium } = await findPlaywright();
  const browser = await launchChromium(chromium);
  const context = await browser.newContext({
    viewport: { width: options.width ?? 1280, height: options.height ?? 900 },
  });
  await context.addCookies([playwrightCookie]);
  return { base, browser, context };
}

async function webCheck(args) {
  const { values } = parseArgs({
    args,
    options: {
      url: { type: 'string' },
      path: { type: 'string' },
      width: { type: 'string', default: '1280' },
      height: { type: 'string', default: '900' },
      out: { type: 'string' },
      click: { type: 'string', multiple: true, default: [] },
      'wait-for': { type: 'string', multiple: true, default: [] },
      expect: { type: 'string', multiple: true, default: [] },
      eval: { type: 'string', multiple: true, default: [] },
      dark: { type: 'boolean' },
      'full-page': { type: 'boolean' },
    },
  });
  const { base, browser, context } = await openDshSession({
    baseUrl: values.url,
    width: Number(values.width),
    height: Number(values.height),
  });
  const screenshot = path.resolve(ROOT, values.out ?? path.join('.scratch', 'web-check', `${new Date().toISOString().replaceAll(/[:.]/g, '-')}.png`));
  const page = await context.newPage();
  const summary = { url: '', title: '', console: [], pageErrors: [], requestFailed: [], evals: [], screenshot };
  try {
    page.on('console', (message) => summary.console.push(`${message.type()}: ${message.text().slice(0, 300)}`));
    page.on('pageerror', (error) => summary.pageErrors.push(String(error).slice(0, 300)));
    page.on('requestfailed', (request) => summary.requestFailed.push(`${request.failure()?.errorText ?? 'failed'} ${request.url().slice(0, 200)}`));
    const target = new URL(values.path ?? base.pathname, base);
    summary.url = target.href;
    await page.goto(target.href, { waitUntil: 'load' });
    await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
    if (values.dark) {
      await page.evaluate(() => { document.body.dataset.dsDarkTheme = ''; });
    }
    for (const selector of values['wait-for']) {
      await page.locator(selector).first().waitFor({ state: 'visible', timeout: 15000 });
    }
    for (const selector of values.click) {
      await page.click(selector);
    }
    // A state that only follows a click, such as an autosave finishing, is an
    // assertion: the run fails when it never appears.
    for (const selector of values.expect) {
      await page.locator(selector).first().waitFor({ state: 'visible', timeout: 15000 });
    }
    // A probe runs in the page and may await, so a check can wait for a
    // background effect before reading the state it produced.
    for (const expression of values.eval) {
      summary.evals.push(await page.evaluate(expression));
    }
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    summary.title = await page.title();
    await fs.mkdir(path.dirname(screenshot), { recursive: true });
    await page.screenshot({ path: screenshot, fullPage: values['full-page'] });
  } finally {
    await browser.close();
  }
  summary.console = summary.console.slice(0, 40);
  summary.pageErrors = summary.pageErrors.slice(0, 20);
  summary.requestFailed = summary.requestFailed.filter(
    (entry) => !/\b(?:ERR_(?:ABORTED|EMPTY_RESPONSE)|net::ERR_BLOCKED_BY_CLIENT)/.test(entry),
  ).slice(0, 20);
  summary.pageErrorCount = summary.pageErrors.length;
  console.log(JSON.stringify(summary, null, 2));
  if (summary.pageErrors.length > 0) process.exitCode = 1;
}

if (process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  webCheck(process.argv.slice(2)).catch((error) => {
    console.error(`web check failed: ${error.message}`);
    process.exitCode = 1;
  });
}
