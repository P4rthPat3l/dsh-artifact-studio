import type { ArtifactType } from '../contract.js';

/** Starter content for a page made from the panel; it uses the design tokens so a token change shows at once. */
const PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  body {
    margin: 0;
    font-family: var(--artifact-font-family);
    color: var(--artifact-color-text);
    background: var(--artifact-color-surface);
  }
  main { max-width: 720px; margin: 0 auto; padding: var(--artifact-space-6) var(--artifact-space-4); }
  h1 { font-size: var(--artifact-font-size-5); margin: 0 0 var(--artifact-space-2); letter-spacing: -0.02em; }
  p { color: var(--artifact-color-muted); line-height: 1.6; }
  button {
    padding: var(--artifact-space-1) var(--artifact-space-3);
    border: 0;
    border-radius: var(--artifact-radius-md);
    background: var(--artifact-color-primary);
    color: #fff;
    font: inherit;
    cursor: pointer;
  }
</style>
</head>
<body>
<main>
  <h1>{{title}}</h1>
  <p>Edit this page in Source, or ask the agent to build it out.</p>
  <button type="button" onclick="this.textContent = 'Clicked ' + (++this.dataset.n || (this.dataset.n = 1)) + ' times'">Try me</button>
</main>
</body>
</html>
`;

const DOC = `# {{title}}

Start writing, or ask the agent to draft this document.
`;

const DASHBOARD = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  * { box-sizing: border-box; }
  body {
    margin: 0;
    font-family: var(--artifact-font-family);
    color: var(--artifact-color-text);
    background: var(--artifact-color-surface);
  }
  main { max-width: 960px; margin: 0 auto; padding: 40px 32px 64px; }
  .eyebrow { margin: 0 0 8px; font-size: 12px; letter-spacing: .08em; text-transform: uppercase; color: var(--artifact-color-muted); }
  h1 { margin: 0 0 8px; font-size: 32px; line-height: 1.15; letter-spacing: -0.02em; }
  .lede { margin: 0 0 28px; color: var(--artifact-color-muted); line-height: 1.6; max-width: 60ch; }
  .metrics { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; margin-bottom: 20px; }
  .metric { padding: 16px; border: 1px solid color-mix(in srgb, var(--artifact-color-text) 12%, transparent); border-radius: var(--artifact-radius-md); background: #fff; }
  .metric span { display: block; font-size: 12px; color: var(--artifact-color-muted); }
  .metric strong { display: block; margin: 6px 0 4px; font-size: 26px; letter-spacing: -0.02em; }
  .metric small { color: var(--artifact-color-accent); font-size: 12px; }
  .panel { margin-top: 16px; padding: 20px; border: 1px solid color-mix(in srgb, var(--artifact-color-text) 12%, transparent); border-radius: var(--artifact-radius-md); background: #fff; }
  .panel-head { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; margin-bottom: 12px; }
  h2 { margin: 0; font-size: 15px; }
  .panel-head span { font-size: 12px; color: var(--artifact-color-muted); }
  svg { display: block; width: 100%; height: auto; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th, td { padding: 9px 8px; border-bottom: 1px solid color-mix(in srgb, var(--artifact-color-text) 10%, transparent); text-align: left; }
  th { color: var(--artifact-color-muted); font-weight: 500; }
  td:last-child, th:last-child { text-align: right; }
</style>
</head>
<body>
<main>
  <p class="eyebrow">Overview</p>
  <h1>{{title}}</h1>
  <p class="lede">A starter dashboard built from the example numbers below. Replace the data, or ask the agent to connect a real source.</p>

  <section class="metrics" aria-label="Key metrics">
    <article class="metric"><span>Revenue</span><strong>$128.4k</strong><small>+12.6% vs last month</small></article>
    <article class="metric"><span>Orders</span><strong>1,842</strong><small>+4.1% vs last month</small></article>
    <article class="metric"><span>Average order</span><strong>$69.70</strong><small>+8.2% vs last month</small></article>
  </section>

  <section class="panel">
    <div class="panel-head"><h2>Revenue by month</h2><span>Last 6 months</span></div>
    <svg viewBox="0 0 640 220" role="img" aria-label="Bar chart of monthly revenue">
      <g style="fill: var(--artifact-color-primary)">
        <rect x="20" y="120" width="72" height="80" rx="4" />
        <rect x="120" y="96" width="72" height="104" rx="4" />
        <rect x="220" y="108" width="72" height="92" rx="4" />
        <rect x="320" y="72" width="72" height="128" rx="4" />
        <rect x="420" y="48" width="72" height="152" rx="4" />
        <rect x="520" y="28" width="72" height="172" rx="4" />
      </g>
      <g style="fill: var(--artifact-color-muted); font-size: 12px">
        <text x="56" y="216" text-anchor="middle">Jun</text>
        <text x="156" y="216" text-anchor="middle">Jul</text>
        <text x="256" y="216" text-anchor="middle">Aug</text>
        <text x="356" y="216" text-anchor="middle">Sep</text>
        <text x="456" y="216" text-anchor="middle">Oct</text>
        <text x="556" y="216" text-anchor="middle">Nov</text>
      </g>
    </svg>
  </section>

  <section class="panel">
    <div class="panel-head"><h2>Recent orders</h2><span>Example rows</span></div>
    <table>
      <thead><tr><th>Customer</th><th>Product</th><th>Total</th></tr></thead>
      <tbody>
        <tr><td>Northwind</td><td>Team plan</td><td>$1,240</td></tr>
        <tr><td>Contoso</td><td>Starter plan</td><td>$320</td></tr>
        <tr><td>Fabrikam</td><td>Team plan</td><td>$1,240</td></tr>
      </tbody>
    </table>
  </section>
</main>
</body>
</html>
`;

const BRIEF = `# {{title}}

## Context

What is happening now, and why this work exists.

## Goal

One sentence that defines success.

## Scope

- Included:
- Not included:

## Open questions

- What still needs an answer?
`;

/** A template offered in an empty gallery. */
export interface ArtifactTemplate {
  id: 'blank-page' | 'dashboard' | 'blank-doc' | 'brief';
  type: ArtifactType;
  titleKey: string;
  hintKey: string;
}

/** The starter set. It teaches the page and document types without a marketplace. */
export const TEMPLATES: readonly ArtifactTemplate[] = [
  { id: 'blank-page', type: 'page', titleKey: 'template.blankPage', hintKey: 'template.blankPageHint' },
  { id: 'dashboard', type: 'page', titleKey: 'template.dashboard', hintKey: 'template.dashboardHint' },
  { id: 'blank-doc', type: 'doc', titleKey: 'template.blankDoc', hintKey: 'template.blankDocHint' },
  { id: 'brief', type: 'doc', titleKey: 'template.brief', hintKey: 'template.briefHint' },
];

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
}

function escapeMarkdown(value: string): string {
  return value.replace(/[\\`*_\[\]#]/g, (char) => `\\${char}`);
}

/**
 * Starter content for a new artifact.
 * @param type the artifact type.
 * @param title the title, inserted as text.
 * @returns the content.
 */
export function starterContent(type: ArtifactType, title: string): string {
  if (type === 'doc') return DOC.replace('{{title}}', escapeMarkdown(title));
  return PAGE.replace('{{title}}', escapeHtml(title));
}

/**
 * Content for one gallery template.
 * @param id the template id.
 * @param title the localized title.
 * @returns the page HTML or document Markdown.
 */
export function templateContent(id: ArtifactTemplate['id'], title: string): string {
  if (id === 'dashboard') return DASHBOARD.replace('{{title}}', escapeHtml(title));
  if (id === 'brief') return BRIEF.replace('{{title}}', escapeMarkdown(title));
  return starterContent(id === 'blank-doc' ? 'doc' : 'page', title);
}
