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

## When to use an artifact

Use \`artifact_create\` when the user asks for an artifact, an artifact page, an artifact doc, or an artifact design. Pick \`page\` for an artifact page, \`doc\` for an artifact doc, and \`design\` for an OpenPencil design. Never write a file in the project instead. Write a project file only when the user asks for a file in the repo.

## Precedence

1. The user's request wins. If they name a palette, font, layout, or tone, follow it.
2. The design system comes next. Read it with \`design_system_read\` when the work should match earlier artifacts, and use its \`--artifact-*\` variables.
3. Your own choices come last, and only fill the gaps.

## Pick the type

- \`doc\` for prose: reports, briefs, plans, specs, notes. It is Markdown, edited in a rich-text editor, and exported to Word, Markdown, and HTML. Use headings, short paragraphs, lists, tables, task lists, quotes, and fenced code. Do not paste HTML into a doc.
- \`page\` for anything visual or interactive: dashboards, one-pagers, explainers, calculators, diagrams, prototypes.
- \`design\` for a layout the user will open on a canvas: UI mockups, layout explorations, and screens that export as PNG, SVG, or a \`.fig\` document.

## Designs (OpenPencil Design JSX)

A design is OpenPencil Design JSX, not React DOM and not HTML. There are no imports, no HTML tags, and no CSS classes. Icons use the bundled Material Design Icons set.

- Elements: \`Frame\`, \`Text\`, \`Rectangle\`, \`Ellipse\`, \`Line\`, \`Star\`, \`Polygon\`, \`Vector\`, \`Group\`, \`Section\`.
- Layout props: \`w\`, \`h\`, \`p\`, \`px\`, \`py\`, \`gap\`, \`flex\` (\`row\` or \`col\`), \`items\`, \`justify\`, \`bg\`, \`rounded\`, \`stroke\`, \`strokeWidth\`, \`opacity\`.
- Use \`flex\`, not \`dir\`. \`dir\` is accepted and does nothing, so every child sits at the same origin. A frame with \`flex\` sizes itself to its children unless you give it \`w\` or \`h\`.
- Text props: \`size\`, \`weight\`, \`color\`, \`font\`, \`lineHeight\`, \`letterSpacing\`, \`textAlign\`, \`maxLines\`.
- Put a background on the outer \`Frame\`; the preview crops transparent space around the content.
- Example: \`<Frame w={720} p={40} bg="#ffffff" flex="col" gap={12}><Text size={40} weight={700} color="#16181d">Title</Text><Text size={16} color="#5b6170">One line of context.</Text></Frame>\`
- Icons: \`<Icon name="mdi:home" size={24} color="#1b1712" />\`. Only the \`mdi:\` set is bundled. Common names: \`home\`, \`search\`, \`user\`, \`heart\`, \`star\`, \`check\`, \`close\`, \`plus\`, \`arrow-right\`, \`settings\`, \`bell\`, \`calendar\`, \`mail\`, \`image\`, \`file\`, \`folder\`, \`trash\`, \`edit\`, \`download\`, \`lock\`, \`eye\`, \`cart\`, \`chart-bar\`, \`alert\`, \`clock\`, \`map-marker\`, \`menu\`, \`chevron-right\`. An unknown set or name refuses the save. Icons draw as vectors and keep their 24 unit box.
- Text uses Inter, Roboto, or Noto Naskh Arabic, which ship with the package. Any other family substitutes a default face and returns a warning.
- A design has no network and no external images. Use solid and gradient fills, shapes, and text.
- The stored artifact is the JSX source. Send the complete source as \`content\` when you update a design. The host compiles and validates before saving, so a compile error refuses the write and returns the compiler message.
- Export is PNG, SVG, or \`.fig\`. The user can open the \`.fig\` in OpenPencil for a full canvas editor.

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

## Check before you save

Every \`artifact_create\` and \`artifact_update\` call writes a new version the user sees in History. Treat each save as a release, not a draft.

- Finish the artifact before the first save. Reread the full draft once for broken markup, CSS that hides or overrides elements such as \`[hidden]\`, controls without handlers, placeholder copy, and the sandbox rules above.
- To check a page visually, render a scratch copy outside the artifact, for example a temporary HTML file in a browser tool. Fix what you find there, then create the artifact once.
- If a check after saving finds problems, fix all of them in one \`artifact_update\`. Never send one update per finding.
- Do not run polish passes the user did not ask for. One create, plus at most one corrective update, is the normal result of one request.

## Updating

- Read the artifact first with \`artifact_read\` when the user may have edited it, and pass that version as \`baseVersion\`.
- For a few local changes, send \`edits\`. Each \`oldText\` must appear exactly once, so include enough surrounding text.
- Send full \`content\` only when you rewrite most of the artifact.
- If the update is refused for a stale version, read again and reapply your change. Never overwrite the user's edits.
- When a create or update returns \`warnings\`, fix all of them in one follow-up update unless the user asked for that behavior.
- Several changes the user asked for in one message go into one update.

## After writing

Tell the user in one or two sentences what you made or changed. Do not repeat the artifact's content in the chat, and do not describe the card.
`;

/** The artifact design skill, registered by the \`dsh-artifact-studio/skill\` host plugin. */
export const ARTIFACT_DESIGN_SKILL: BundledSkill = {
  name: 'artifact-design',
  description:
    'Design rules for artifact pages, documents, and OpenPencil designs: when to use an artifact, precedence, the page sandbox, Design JSX, design tokens, dark mode, layout, typography, and the update rule.',
  whenToUse: 'Load before artifact_create, when the user asks for an artifact, and before an artifact_update that changes layout or styling.',
  source: 'bundled',
  content: CONTENT,
};
