/** The bundled design skill the agent loads before it writes an artifact. */

export interface BundledSkill {
  readonly name: string;
  readonly description: string;
  readonly whenToUse: string;
  readonly source: string;
  readonly content: string;
}

const CONTENT = String.raw`# Artifact design

Use this before you call \`artifact_create\`, and before an \`artifact_update\` that changes layout or styling. An artifact is a deliverable the user will look at and keep, so it should read as finished work, not a demo.

## Precedence

1. The user's request wins. If they name a palette, font, layout, or tone, follow it.
2. The design system comes next. Read it with \`design_system_read\` when the work should match earlier artifacts, and use its \`--artifact-*\` variables.
3. Your own choices come last, and only fill the gaps.

## Pick the type

- \`doc\` for prose: reports, briefs, plans, specs, notes. It is Markdown, edited in a rich-text editor, and exported to Word, Markdown, and HTML. Use headings, short paragraphs, lists, tables, task lists, quotes, and fenced code. Do not paste HTML into a doc.
- \`page\` for anything visual or interactive: dashboards, one-pagers, explainers, calculators, diagrams, prototypes.

## The page sandbox

A page renders in an opaque-origin iframe with every network request blocked.

- Inline all CSS and JavaScript. No CDN scripts, web fonts, remote images, \`fetch\`, or WebSocket.
- Draw charts and diagrams with inline SVG or canvas. Embed raster images as \`data:\` URIs only when they are small.
- \`localStorage\`, \`sessionStorage\`, and \`indexedDB\` throw. Keep state in memory.
- Links cannot navigate away. Use in-page anchors and buttons.
- The page is shown in a side panel that is often 380 to 700 pixels wide, and in a full-width view. Build fluid layouts with \`max-width\`, \`minmax()\`, and wrapping. Never set a fixed width over 960 pixels. Wrap wide tables in an \`overflow-x: auto\` container.

## Design tokens

The host injects these on \`:root\` before your markup:

- Colors: \`--artifact-color-primary\`, \`-accent\`, \`-surface\`, \`-text\`, \`-muted\`.
- Fonts: \`--artifact-font-family\` for body text, \`--artifact-font-display\` for headings, \`--artifact-font-mono\` for code and data.
- Sizes: \`--artifact-font-size-0\` to \`-6\`, \`--artifact-space-0\` to \`-6\`, \`--artifact-radius-sm\`, \`-md\`, \`-lg\`.

Use the variables instead of literal colors and fonts. Derive borders and subtle fills from them, for example \`color-mix(in srgb, var(--artifact-color-text) 12%, transparent)\`. A page that hard-codes \`#fff\` cards over token text breaks in dark mode.

Dark mode is opt in. Add \`<meta name="color-scheme" content="light dark">\` and the host switches the color variables to the dark set when the user's theme is dark. Only add it when every color on the page comes from the variables or from \`color-mix\` over them.

## Layout and type

- Start with the content. Decide the one thing the reader must see first and give it the most space.
- One typeface pair at most: the display font for headings, the body font for text. Set body text at 15 to 17 pixels with a line height near 1.6, and keep lines under 75 characters.
- Use the spacing scale for rhythm. Group related items tightly and separate sections clearly.
- Prefer one strong layout over many equal boxes. Avoid a grid of identical icon cards, an all-caps label above every heading, gradient text, glassmorphism, and decorative emoji.
- Use one motion moment at most, and respect \`prefers-reduced-motion\`.
- Numbers use \`font-variant-numeric: tabular-nums\`. Charts label their axes and units, and color encodes meaning, not decoration.
- Interactive controls are real \`button\` and \`input\` elements with visible focus and labels.

## Documents

- Lead with the answer or the decision, then the detail.
- Use one H1 as the title, H2 for sections, and H3 sparingly.
- Keep paragraphs to four sentences or fewer. Use a table for comparisons and a list for steps.

## Updating

- Read the artifact first with \`artifact_read\` when the user may have edited it, and pass that version as \`baseVersion\`.
- For a few local changes, send \`edits\`. Each \`oldText\` must appear exactly once, so include enough surrounding text.
- Send full \`content\` only when you rewrite most of the artifact.
- If the update is refused for a stale version, read again and reapply your change. Never overwrite the user's edits.
- When a create or update returns \`warnings\`, fix them in a follow-up update unless the user asked for that behavior.

## After writing

Tell the user in one or two sentences what you made or changed. Do not repeat the artifact's content in the chat, and do not describe the card.
`;

/** The artifact design skill, registered by the \`dsh-artifacts/skill\` host plugin. */
export const ARTIFACT_DESIGN_SKILL: BundledSkill = {
  name: 'artifact-design',
  description:
    'Design rules for artifact pages and documents: precedence, the page sandbox, design tokens, dark mode, layout, typography, and the update rule.',
  whenToUse: 'Load before artifact_create, and before an artifact_update that changes layout or styling.',
  source: 'bundled',
  content: CONTENT,
};
