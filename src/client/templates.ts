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

/**
 * Starter content for a new artifact.
 * @param type the artifact type.
 * @param title the title, inserted as text.
 * @returns the content.
 */
export function starterContent(type: ArtifactType, title: string): string {
  if (type === 'doc') return DOC.replace('{{title}}', title.replace(/[\\`*_[\]#]/g, (char) => `\\${char}`));
  const escaped = title.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
  return PAGE.replace('{{title}}', escaped);
}
