import type { ArtifactType } from '../contract.js';

/** Starter content for a page made from the panel; it uses the design tokens so a token change shows at once. */
const PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<style>
  body {
    margin: 0;
    font-family: var(--artifact-font-family);
    color: var(--artifact-color-text);
    background: var(--artifact-color-surface);
  }
  main { max-width: 720px; margin: 0 auto; padding: var(--artifact-space-6) var(--artifact-space-4); }
  h1 { font-size: var(--artifact-font-size-5); margin: 0 0 var(--artifact-space-2); letter-spacing: -0.02em; }
  h1 { font-family: var(--artifact-font-display); }
  p { color: var(--artifact-color-muted); line-height: 1.6; }
</style>
</head>
<body>
<main>
  <h1>{{title}}</h1>
  <p>Select any text and choose Edit with agent, or edit the code yourself.</p>
</main>
</body>
</html>
`;

const DOC = `# {{title}}

Start writing, or select text and choose Edit with agent.
`;

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
