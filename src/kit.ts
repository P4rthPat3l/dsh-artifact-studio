/**
 * The artifact kit: versioned component CSS and behavior that the renderer
 * injects when a page opts in with <meta name="artifact-kit" content="1">.
 *
 * A published kit version keeps its component definitions. This does not pin
 * the resolved tokens, browser fonts, or authored overrides; those can still
 * change a saved page's appearance.
 */

import { openingTags } from './html-tags.js';

const CSS_V1 = [
  '*, *::before, *::after { box-sizing: border-box; }',
  '[hidden] { display: none !important; }',
  'html { background: var(--artifact-color-background); -webkit-text-size-adjust: 100%; }',
  'body { margin: 0; color: var(--artifact-color-text); font: var(--artifact-font-size-2)/1.6 var(--artifact-font-family); overflow-wrap: anywhere; }',
  '::selection { background: color-mix(in srgb, var(--artifact-color-action) 26%, transparent); }',
  ':focus-visible { outline: 2px solid var(--artifact-color-focus); outline-offset: 2px; }',
  ':where(h1, h2, h3, h4):not(:where(.ak-demo, .ak-demo *)) { margin: 0; font-family: var(--artifact-font-display); font-weight: 600; line-height: 1.2; text-wrap: balance; }',
  ':where(h1):not(:where(.ak-demo, .ak-demo *)) { font-size: clamp(1.9rem, 5vw, 2.6rem); letter-spacing: -0.02em; }',
  ':where(h2):not(:where(.ak-demo, .ak-demo *)) { font-size: clamp(1.35rem, 3.2vw, 1.75rem); letter-spacing: -0.01em; }',
  ':where(h3):not(:where(.ak-demo, .ak-demo *)) { font-size: var(--artifact-font-size-3); }',
  ':where(h4):not(:where(.ak-demo, .ak-demo *)) { font-size: var(--artifact-font-size-2); }',
  ':where(p, ul, ol, dl, figure, blockquote):not(:where(.ak-demo, .ak-demo *)) { margin: 0; }',
  ':where(a):not(:where(.ak-demo, .ak-demo *)) { color: var(--artifact-color-primary); text-underline-offset: 0.2em; }',
  ':where(code, kbd, samp, pre):not(:where(.ak-demo, .ak-demo *)) { font-family: var(--artifact-font-mono); font-size: 0.92em; }',
  ':where(:not(pre) > code):not(:where(.ak-demo, .ak-demo *)) { padding: 0.1em 0.35em; border-radius: var(--artifact-radius-sm); background: color-mix(in srgb, var(--artifact-color-text) 7%, transparent); }',
  'button, input, select, textarea { font: inherit; color: inherit; }',
  'img { max-width: 100%; height: auto; }',
  '.ak-page { display: grid; gap: var(--artifact-space-6); width: min(100% - 2 * var(--artifact-space-4), 72rem); margin-inline: auto; padding-block: var(--artifact-space-5) var(--artifact-space-6); }',
  '.ak-page--narrow { width: min(100% - 2 * var(--artifact-space-4), 48rem); }',
  '.ak-page > * { min-width: 0; }',
  '.ak-header { display: grid; gap: var(--artifact-space-3); padding-bottom: var(--artifact-space-5); border-bottom: 1px solid var(--artifact-color-border); }',
  '.ak-eyebrow { color: var(--artifact-color-muted); font-size: var(--artifact-font-size-1); font-weight: 600; letter-spacing: 0.01em; }',
  '.ak-lede { max-width: 60ch; color: var(--artifact-color-muted); font-size: calc((var(--artifact-font-size-2) + var(--artifact-font-size-3)) / 2); line-height: 1.5; }',
  '.ak-meta { display: flex; flex-wrap: wrap; align-items: center; gap: var(--artifact-space-1) var(--artifact-space-3); padding: 0; list-style: none; color: var(--artifact-color-muted); font-size: var(--artifact-font-size-1); }',
  '.ak-section { display: grid; gap: var(--artifact-space-4); scroll-margin-top: var(--artifact-space-4); }',
  '.ak-section__head { display: grid; gap: var(--artifact-space-1); }',
  '.ak-section__head p { max-width: 68ch; color: var(--artifact-color-muted); }',
  '.ak-prose { display: grid; gap: var(--artifact-space-3); }',
  '.ak-prose > *, .ak-section > p, .ak-section > ul, .ak-section > ol { max-width: 68ch; }',
  '.ak-prose ul, .ak-prose ol, .ak-section > ul, .ak-section > ol { display: grid; gap: var(--artifact-space-1); padding-left: 1.3em; }',
  '.ak-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 16rem), 1fr)); gap: var(--artifact-space-4); }',
  '.ak-split { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 20rem), 1fr)); gap: var(--artifact-space-4); align-items: start; }',
  '.ak-card { display: grid; align-content: start; gap: var(--artifact-space-2); padding: var(--artifact-space-4); border: 1px solid var(--artifact-color-border); border-radius: var(--artifact-radius-lg); background: var(--artifact-color-surface); }',
  '.ak-muted { color: var(--artifact-color-muted); }',
  '.ak-small { font-size: var(--artifact-font-size-1); }',
  '.ak-num { font-family: var(--artifact-font-mono); font-variant-numeric: tabular-nums; }',
  '.ak-callout { --ak-tone: var(--artifact-color-accent); display: grid; gap: var(--artifact-space-1); padding: var(--artifact-space-3) var(--artifact-space-4); border-left: 3px solid var(--ak-tone); border-radius: 0 var(--artifact-radius-md) var(--artifact-radius-md) 0; background: var(--artifact-color-raised); }',
  '.ak-callout__title { font-weight: 650; }',
  '.ak-callout--info { --ak-tone: var(--artifact-color-focus); }',
  '.ak-callout--success { --ak-tone: var(--artifact-color-success); }',
  '.ak-callout--warning { --ak-tone: var(--artifact-color-warning); }',
  '.ak-callout--danger { --ak-tone: var(--artifact-color-danger); }',
  '.ak-badge { --ak-tone: var(--artifact-color-muted); display: inline-flex; align-items: center; gap: 0.4em; padding: 0.1em 0.6em; border: 1px solid color-mix(in srgb, var(--ak-tone) 45%, transparent); border-radius: 999px; color: var(--ak-tone); font-size: var(--artifact-font-size-1); font-weight: 600; line-height: 1.5; white-space: nowrap; }',
  '.ak-badge::before { content: ""; flex: none; width: 0.45em; height: 0.45em; border-radius: 50%; background: currentColor; }',
  '.ak-badge--plain::before { display: none; }',
  '.ak-badge--info { --ak-tone: var(--artifact-color-focus); }',
  '.ak-badge--success { --ak-tone: var(--artifact-color-success); }',
  '.ak-badge--warning { --ak-tone: var(--artifact-color-warning); }',
  '.ak-badge--danger { --ak-tone: var(--artifact-color-danger); }',
  '.ak-facts { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 11rem), 1fr)); gap: var(--artifact-space-3); }',
  '.ak-facts > div { display: grid; gap: 2px; padding-top: var(--artifact-space-2); border-top: 1px solid var(--artifact-color-border); }',
  '.ak-facts dt { color: var(--artifact-color-muted); font-size: var(--artifact-font-size-1); }',
  '.ak-facts dd { margin: 0; font-weight: 600; font-variant-numeric: tabular-nums; }',
  '.ak-table { max-width: 100%; overflow-x: auto; border: 1px solid var(--artifact-color-border); border-radius: var(--artifact-radius-md); background: var(--artifact-color-surface); }',
  '.ak-table table { width: 100%; border-collapse: collapse; font-size: var(--artifact-font-size-1); font-variant-numeric: tabular-nums; }',
  '.ak-table caption { padding: var(--artifact-space-3) var(--artifact-space-3) var(--artifact-space-2); color: var(--artifact-color-muted); text-align: left; }',
  '.ak-table caption strong { color: var(--artifact-color-text); }',
  '.ak-table th, .ak-table td { padding: var(--artifact-space-2) var(--artifact-space-3); border-top: 1px solid var(--artifact-color-border); text-align: left; vertical-align: top; }',
  '.ak-table thead th { background: var(--artifact-color-raised); color: var(--artifact-color-muted); font-weight: 600; }',
  '.ak-table tbody th { font-weight: 600; }',
  '@media (max-width: 640px) {',
  '  .ak-table--stack table, .ak-table--stack caption, .ak-table--stack tbody, .ak-table--stack tr, .ak-table--stack th, .ak-table--stack td { display: block; }',
  '  .ak-table--stack thead { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }',
  '  .ak-table--stack tr { padding: var(--artifact-space-2) 0; border-top: 1px solid var(--artifact-color-border); }',
  '  .ak-table--stack th, .ak-table--stack td { padding: var(--artifact-space-1) var(--artifact-space-3); border: 0; }',
  '  .ak-table--stack td[data-label]::before { content: attr(data-label); display: block; color: var(--artifact-color-muted); font-size: var(--artifact-font-size-0); font-weight: 600; }',
  '}',
  '.ak-code { display: grid; overflow: hidden; border: 1px solid var(--artifact-color-border); border-radius: var(--artifact-radius-md); background: var(--artifact-color-surface); }',
  '.ak-code figcaption { padding: var(--artifact-space-1) var(--artifact-space-3); border-bottom: 1px solid var(--artifact-color-border); color: var(--artifact-color-muted); font: 600 var(--artifact-font-size-0)/1.6 var(--artifact-font-mono); }',
  '.ak-code pre { margin: 0; padding: var(--artifact-space-3); overflow-x: auto; font-size: var(--artifact-font-size-1); line-height: 1.55; tab-size: 2; }',
  '.ak-steps { display: grid; gap: var(--artifact-space-3); padding: 0; list-style: none; counter-reset: ak-step; }',
  '.ak-steps > li { position: relative; display: grid; gap: var(--artifact-space-1); min-height: 2rem; padding-left: 2.75rem; counter-increment: ak-step; }',
  '.ak-steps > li::before { content: counter(ak-step); position: absolute; top: 0; left: 0; display: grid; place-items: center; width: 2rem; height: 2rem; border: 1px solid var(--artifact-color-border); border-radius: 50%; background: var(--artifact-color-raised); font: 600 var(--artifact-font-size-1)/1 var(--artifact-font-mono); }',
  '.ak-decision { display: grid; gap: var(--artifact-space-2); padding: var(--artifact-space-4); border: 1px solid var(--artifact-color-border); border-radius: var(--artifact-radius-lg); background: var(--artifact-color-surface); }',
  '.ak-decision__pick { padding: var(--artifact-space-2) var(--artifact-space-3); border-radius: var(--artifact-radius-md); background: color-mix(in srgb, var(--artifact-color-success) 10%, var(--artifact-color-surface)); }',
  '.ak-quote { display: grid; gap: var(--artifact-space-1); max-width: 68ch; padding-left: var(--artifact-space-4); border-left: 3px solid var(--artifact-color-border); }',
  '.ak-quote p { font-family: var(--artifact-font-display); font-size: calc((var(--artifact-font-size-2) + var(--artifact-font-size-3)) / 2); }',
  '.ak-quote cite { color: var(--artifact-color-muted); font-size: var(--artifact-font-size-1); font-style: normal; }',
  '.ak-switch { display: grid; gap: var(--artifact-space-3); }',
  '.ak-switch > * { min-width: 0; }',
  '.ak-switch__bar { display: inline-flex; flex-wrap: wrap; justify-self: start; gap: 2px; padding: 2px; border: 1px solid var(--artifact-color-border); border-radius: var(--artifact-radius-md); background: var(--artifact-color-raised); }',
  '.ak-switch__bar button { min-height: 36px; padding: 0 var(--artifact-space-3); border: 0; border-radius: max(0px, calc(var(--artifact-radius-md) - 2px)); background: transparent; color: var(--artifact-color-muted); font-size: var(--artifact-font-size-1); font-weight: 600; cursor: pointer; }',
  '.ak-switch__bar button[aria-pressed="true"] { background: var(--artifact-color-surface); color: var(--artifact-color-text); box-shadow: 0 0 0 1px var(--artifact-color-control); text-decoration: underline; text-underline-offset: 0.2em; }',
  '.ak-compare { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 18rem), 1fr)); gap: var(--artifact-space-4); }',
  '.ak-compare > * { display: grid; align-content: start; gap: var(--artifact-space-2); min-width: 0; }',
  '.ak-compare__label { color: var(--artifact-color-muted); font-size: var(--artifact-font-size-1); font-weight: 600; }',
  '.ak-frame { display: grid; overflow: hidden; border: 1px solid var(--artifact-color-border); border-radius: var(--artifact-radius-lg); background: var(--artifact-color-surface); box-shadow: 0 1px 3px color-mix(in srgb, var(--artifact-color-text) 10%, transparent); }',
  '.ak-frame__bar { display: flex; align-items: center; gap: var(--artifact-space-2); min-height: 34px; padding: 0 var(--artifact-space-3); overflow: hidden; border-bottom: 1px solid var(--artifact-color-border); background: var(--artifact-color-raised); color: var(--artifact-color-muted); font: var(--artifact-font-size-0)/1.4 var(--artifact-font-mono); white-space: nowrap; text-overflow: ellipsis; }',
  '.ak-frame__bar::before { content: ""; flex: none; width: 34px; height: 8px; background: radial-gradient(circle, var(--artifact-color-control) 3px, transparent 3.5px) 0 50% / 13px 8px repeat-x; opacity: 0.55; }',
  '.ak-frame__body { min-width: 0; overflow: auto; }',
  '.ak-frame__caption { padding: var(--artifact-space-2) var(--artifact-space-3); border-top: 1px solid var(--artifact-color-border); color: var(--artifact-color-muted); font-size: var(--artifact-font-size-1); }',
  '.ak-demo { color: var(--demo-text, var(--artifact-color-text)); background: var(--demo-bg, transparent); font-family: var(--demo-font, var(--artifact-font-family)); }',
  '.ak-demo { font-size: var(--demo-font-size, 16px); line-height: var(--demo-line-height, 1.5); }',
  ':where(.ak-demo h1, .ak-demo h2, .ak-demo h3, .ak-demo h4, .ak-demo a, .ak-demo code, .ak-demo pre) { font: inherit; color: inherit; letter-spacing: normal; }',
  '.ak-button { display: inline-flex; align-items: center; justify-content: center; gap: var(--artifact-space-1); min-height: 40px; padding: 0 var(--artifact-space-3); border: 1px solid var(--artifact-color-control); border-radius: var(--artifact-radius-sm); background: var(--artifact-color-surface); color: var(--artifact-color-text); font-size: var(--artifact-font-size-1); font-weight: 600; cursor: pointer; }',
  '.ak-button:hover:not(:disabled) { border-color: var(--artifact-color-text); }',
  '.ak-button--primary { border-color: var(--artifact-color-action); background: var(--artifact-color-action); color: var(--artifact-color-action-text); }',
  '.ak-button--primary:hover:not(:disabled) { border-color: var(--artifact-color-action); background: color-mix(in srgb, var(--artifact-color-action) 88%, var(--artifact-color-text)); }',
  '.ak-button:disabled { opacity: 0.5; cursor: not-allowed; }',
  '.ak-actions { display: flex; flex-wrap: wrap; gap: var(--artifact-space-2); }',
  '.ak-field { display: grid; gap: var(--artifact-space-1); font-size: var(--artifact-font-size-1); font-weight: 600; }',
  '.ak-input { width: 100%; min-width: 0; min-height: 40px; padding: var(--artifact-space-1) var(--artifact-space-2); border: 1px solid var(--artifact-color-control); border-radius: var(--artifact-radius-sm); background: var(--artifact-color-surface); font-weight: 400; }',
  '.ak-input::placeholder { color: var(--artifact-color-muted); opacity: 1; }',
  '.ak-input[aria-invalid="true"] { border-color: var(--artifact-color-danger); }',
  '.ak-footer { padding-top: var(--artifact-space-4); border-top: 1px solid var(--artifact-color-border); color: var(--artifact-color-muted); font-size: var(--artifact-font-size-1); }',
  '@media (prefers-reduced-motion: no-preference) { .ak-button, .ak-switch__bar button { transition: background-color 0.15s ease, border-color 0.15s ease; } }',
  '@media print { .ak-switch__bar { display: none; } .ak-switch [data-ak-panel][hidden] { display: grid !important; } .ak-page { width: auto; } }',
].join('\n');

/**
 * Switch groups: buttons with data-ak-option show the data-ak-panel of the
 * same name inside the nearest data-ak-switch. Nested switches stay independent.
 * A switch announces its choice with an ak-change event so a demo can react.
 */
const SCRIPT_V1 = [
  '(function () {',
  '  var marker = "data-ak-switch-ready";',
  '  if (document.documentElement.hasAttribute(marker)) return;',
  '  document.documentElement.setAttribute(marker, "");',
  '  function own(sw, node) { return node.closest("[data-ak-switch]") === sw; }',
  '  function choose(sw, value) {',
  '    sw.querySelectorAll("[data-ak-option]").forEach(function (b) { if (own(sw, b)) b.setAttribute("aria-pressed", String(b.getAttribute("data-ak-option") === value)); });',
  '    sw.querySelectorAll("[data-ak-panel]").forEach(function (p) { if (own(sw, p)) p.hidden = p.getAttribute("data-ak-panel") !== value; });',
  '    sw.dispatchEvent(new CustomEvent("ak-change", { bubbles: true, detail: { value: value } }));',
  '  }',
  '  document.addEventListener("click", function (event) {',
  '    var target = event.target;',
  '    if (!(target instanceof Element)) return;',
  '    var button = target.closest("button[data-ak-option]:not(:disabled)");',
  '    var sw = button && button.closest("[data-ak-switch]");',
  '    if (sw) choose(sw, button.getAttribute("data-ak-option"));',
  '  });',
  '  function init() {',
  '    document.querySelectorAll("[data-ak-switch]").forEach(function (sw) {',
  '      var options = Array.prototype.filter.call(sw.querySelectorAll("[data-ak-option]"), function (b) { return own(sw, b); });',
  '      var pick = options.find(function (b) { return b.getAttribute("aria-pressed") === "true"; }) || options[0];',
  '      if (pick) choose(sw, pick.getAttribute("data-ak-option"));',
  '    });',
  '  }',
  '  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();',
  '})();',
].join('\n');

/** One frozen kit release. */
export interface KitRelease {
  readonly css: string;
  readonly script: string;
  /** Every ak- class the CSS defines, derived from the CSS so the list cannot drift. */
  readonly classes: readonly string[];
}

/**
 * Collect the component classes a stylesheet defines.
 * @param css the stylesheet.
 * @returns sorted unique class names.
 */
function classesOf(css: string): string[] {
  return [...new Set([...css.matchAll(/\.(ak-[a-z0-9_-]+)/g)].map((match) => match[1] ?? ''))].sort();
}

export const KITS: Readonly<Record<string, KitRelease>> = {
  '1': { css: CSS_V1, script: SCRIPT_V1, classes: classesOf(CSS_V1) },
};

/** Never interpret inherited object properties as kit releases. */
export function getKit(version: string | undefined): KitRelease | undefined {
  return version !== undefined && Object.hasOwn(KITS, version) ? KITS[version] : undefined;
}

/** The version new pages should declare. */
export const LATEST_KIT = '1';

/** The meta name a page uses to opt in. */
export const KIT_META = 'artifact-kit';

/**
 * The kit version a page declares, if any.
 * @param content the page HTML.
 * @returns the declared version text, or undefined when the page does not opt in.
 */
export function declaredKit(content: string): string | undefined {
  for (const { name, text: tag } of openingTags(content)) {
    if (name !== 'meta') continue;
    const attributes = new Map<string, string>();
    for (const attr of tag.slice(5, -1).matchAll(/([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)) {
      const key = (attr[1] ?? '').toLowerCase();
      if (!attributes.has(key)) attributes.set(key, attr[2] ?? attr[3] ?? attr[4] ?? '');
    }
    if (attributes.get('name')?.toLowerCase() === KIT_META) return attributes.get('content') ?? '';
  }
  return undefined;
}

/**
 * The style and script the renderer adds for a page that opts in to a known
 * kit release. An unknown version adds nothing; the page check reports it.
 * @param content the page HTML.
 * @returns head markup, or an empty string.
 */
export function kitHead(content: string): string {
  const version = declaredKit(content);
  const kit = getKit(version);
  if (kit === undefined) return '';
  return '<style data-artifact-kit="' + version + '">' + kit.css + '</style><script data-artifact-kit="' + version + '">' + kit.script + '</script>';
}

/** The component reference the brief gives the agent for a page. Every class it names exists in the kit. */
export const KIT_REFERENCE = String.raw`Kit 1. Add <meta name="artifact-kit" content="1"> and the renderer injects these classes and the switch script. The kit already styles body text, headings, links, code, focus, and selection from the tokens, so write no base styles of your own. Page CSS may add layout for content the kit does not cover.

Page: <main class="ak-page"> (72rem) or "ak-page ak-page--narrow" (48rem, reading pages).
Header: <header class="ak-header"><h1>Title</h1><p class="ak-lede">One-paragraph answer.</p><ul class="ak-meta"><li>Date</li><li><span class="ak-badge ak-badge--warning">Draft</span></li></ul></header>
Section: <section class="ak-section" data-section="key" aria-labelledby="key"><div class="ak-section__head"><h2 id="key">Heading</h2><p>Optional standfirst.</p></div>...</section>. Long text goes in <div class="ak-prose">.
Layout: ak-grid (cards that wrap), ak-split (two columns that stack), ak-card.
Callout: <aside class="ak-callout ak-callout--info"><p class="ak-callout__title">Title</p><p>Text</p></aside>. Choose ak-callout--info, ak-callout--success, ak-callout--warning, or ak-callout--danger. Use one for a rule or risk, not for emphasis.
Badge: <span class="ak-badge ak-badge--info">Text</span>. Choose ak-badge--info, ak-badge--success, ak-badge--warning, or ak-badge--danger; ak-badge--plain drops the dot. Always carry a text label.
Facts: <dl class="ak-facts"><div><dt>Label</dt><dd>Value</dd></div></dl>.
Table: <div class="ak-table" tabindex="0" role="region" aria-label="..."><table><caption>Scope or source of the rows</caption>...</table></div>. Add ak-table--stack and data-label on each td to stack rows on narrow panels.
Code: <figure class="ak-code"><figcaption>path/or/label</figcaption><pre><code>...</code></pre></figure>.
Steps: <ol class="ak-steps"><li><strong>Step</strong><p>Detail</p></li></ol>.
Decision: <article class="ak-decision"><h3>Question</h3><p>Options and evidence</p><p class="ak-decision__pick"><strong>Recommended:</strong> choice and reason</p></article>.
Quote: <blockquote class="ak-quote"><p>Exact words</p><cite>Who, where</cite></blockquote>.
Switch (before and after, scenarios, tabs of states): <div class="ak-switch" data-ak-switch><div class="ak-switch__bar" role="group" aria-label="View"><button type="button" data-ak-option="before" aria-pressed="true">Before</button><button type="button" data-ak-option="after" aria-pressed="false">After</button></div><div data-ak-panel="before">...</div><div data-ak-panel="after" hidden>...</div></div>. The switch emits an ak-change event with detail.value. Print shows every panel. Give each panel its own visible heading so its meaning survives without the switch buttons.
Compare (side by side): <div class="ak-compare"><div><p class="ak-compare__label">Today</p>...</div><div><p class="ak-compare__label">Proposed</p>...</div></div>.
Product UI replica: <figure class="ak-frame"><div class="ak-frame__bar">app.example.com/settings</div><div class="ak-frame__body ak-demo">...</div><figcaption class="ak-frame__caption">What to notice</figcaption></figure>. Inside .ak-demo, recreate the product's own look: define its colors and fonts once as custom properties on the .ak-demo element (--demo-bg, --demo-text, --demo-font, and any others you need) and use only those variables in the replica's rules. Prefix every replica selector with .ak-demo; this is a styling convention, not CSS isolation. Set --demo-font-size and --demo-line-height when needed.
Controls: ak-button, ak-button--primary, ak-actions (button row), <label class="ak-field">Label<input class="ak-input" name="..."></label>. Buttons use type="button".
Small text: ak-muted, ak-small, ak-num (tabular numbers). Footer: <footer class="ak-footer">.
`;
