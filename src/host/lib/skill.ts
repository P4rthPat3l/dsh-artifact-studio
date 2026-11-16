/** The bundled design skill the agent loads before it writes an artifact. */

import { fileURLToPath } from 'node:url';

const PAGE_REFERENCE = fileURLToPath(new URL('../../../examples/page-design-system.html', import.meta.url));

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
2. The design system comes next. Read it with \`design_system_read\` before styling a page, and use its \`--artifact-*\` variables.
3. Your own choices come last, and only fill the gaps.

## Projects and scopes

An artifact belongs to the session's project unless the user opened or referenced another project's artifact. The artifact reference names that project's workspace id. Pass it as \`workspaceId\` to the artifact tools and to \`design_system_read\`; omit it for this project. The library is shared across projects, so it needs no workspace id.

## Pick the type

- \`doc\` for prose: reports, briefs, plans, specs, notes. It is Markdown, edited in a rich-text editor, and exported to Word, Markdown, and HTML. Use headings, short paragraphs, lists, tables, task lists, quotes, and fenced code. Do not paste HTML into a doc.
- \`page\` for anything visual or interactive: dashboards, one-pagers, explainers, calculators, diagrams, and clickable prototypes the user asks for as a page.
- \`design\` for a layout the user will open on a canvas: UI mockups, wireframes, layout explorations, and screens that export as PNG, SVG, or a \`.fig\` document.

A request for a mockup or a wireframe always gets \`design\`, even when it shows a flow. Draw each step of the flow as its own frame. If the user offers both, such as "a page or a mockup", make a mockup. Use \`page\` for a mockup only when the user asks for a page or for something clickable. Never title or describe a page as a mockup.

## Choose the reader's task

Establish the audience, their question, and the observable outcome from the request and available evidence. Ask only about a material unresolved decision. A simple artifact does not need its own planning document or approval round unless the project's rules require one.

Choose the structure by the task, not by a favorite template:

- Architecture walkthrough: show boundaries, dependencies, and one request or data flow. Label connections and provide a textual flow beside the diagram.
- Feature walkthrough: name the actor and starting conditions, show the actions and alternate paths, and state the resulting behavior.
- UI proposal: show only the relevant screens and interaction states. Mark simulated actions. A static canvas mockup remains type \`design\`; a requested clickable page remains type \`page\`.
- Technical decision: state the recommendation, compare options with evidence and tradeoffs, and name what would change the decision.
- Investigation report: separate observations, evidence, hypotheses, and unresolved checks. Do not present a hypothesis as a confirmed cause.
- Metrics dashboard: name sources, units, time range, baseline, and missing data. Derive charts, tables, labels, and selection details from one dataset. Never turn missing values into zero.

Do not invent metrics, owners, customer quotes, or product claims. Label illustrative data. Static reports need no fake loading, pending, or error states. Explain charts and diagrams in text as well as color.

## Use one design system

Inspect the project's design language before choosing styles: design docs, CSS custom properties, theme configuration, and existing components. The user's explicit visual brief still wins. If the project has a system, use its palette, type, spacing, radii, and motion together. Do not copy the Artifact Studio editor's controls into the artifact.

Use resolved scope tokens when they match the project. For a requested page in a different project brand, map that brand into page-local semantic variables on \`body\` and use those variables consistently in that page. These local variables are the exception to using injected values directly. Define their dark values with \`:root[data-artifact-theme="dark"] body\` and their export/system values inside \`@media (prefers-color-scheme: dark)\` with \`:root[data-artifact-theme="auto"] body\`. A later bare \`:root\` rule cannot override the more specific injected dark rules. Keep both themes coherent. Do not call \`design_system_update\` to change shared settings unless the user asked for that change. If the project has no system, use the resolved artifact system and its default patterns rather than inventing a competing palette.

For a page, read the packaged HTML reference with the file-read tool: \`${PAGE_REFERENCE}\`. It shows headers, sections, native buttons and fields, a table, status badges, and a callout. Read only the relevant sections. It uses injected tokens and is intended to render through the artifact renderer; opening the bare file alone does not supply tokens. Reuse the relevant structure and CSS inline, not the specimen copy, the complete page layout, or its theme inspection controls by default. Do not add a framework, CDN, build system, or local server for a self-contained page.

## Designs (OpenPencil Design JSX)

A design is OpenPencil Design JSX, not React DOM and not HTML. There are no imports, no HTML tags, and no CSS classes. Icons use the bundled Material Design Icons set.

Call this artifact a mockup when you talk to the user. The tools still take type \`design\`.

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

### When a design write fails

- A compile, icon, or validation error names a problem in your source. Fix the source and try again.
- Any other error, such as "The design renderer stopped" or a missing module, is a fault in the plugin, not in your source. Stop and show the user the exact error.
- Never switch to a \`page\` or a \`doc\` to work around a failed design. Do it only when the user tells you to.

## The page sandbox

A page renders in an opaque-origin iframe with every network request blocked.

- Inline all CSS and JavaScript. No CDN scripts, web fonts, remote images, \`fetch\`, or WebSocket.
- Draw charts and diagrams with inline SVG or canvas. Embed raster images as \`data:\` URIs only when they are small.
- \`localStorage\`, \`sessionStorage\`, and \`indexedDB\` throw. Keep state in memory.
- Links cannot navigate away. Use in-page anchors and buttons.
- The page is shown in a side panel that is often 380 to 700 pixels wide, and in a full-width view. Build fluid layouts with \`max-width\`, \`minmax()\`, and wrapping. Never set a fixed width over 960 pixels. Wrap wide tables in an \`overflow-x: auto\` container.

## Design tokens

The host injects these on \`:root\` before your markup:

- Colors use the prefix \`--artifact-color-\`: \`background\` for the page, \`surface\` for an object, \`raised\` for secondary grouping, \`text\` and \`muted\` for text, \`primary\` for links, and \`accent\` for non-text emphasis.
- \`border\` is a quiet divider; \`control\` is the stronger border that identifies an input. Use \`focus\` for keyboard focus and \`success\`, \`warning\`, or \`danger\` with a text status on a neutral background. Do not rely on color alone.
- Pair \`--artifact-color-action\` backgrounds with \`--artifact-color-action-text\` foregrounds. Never assume the surface color is readable button text. JSON calls this role \`actionText\`; CSS uses \`action-text\`.
- Fonts: \`--artifact-font-family\` for body text, \`--artifact-font-display\` for headings, \`--artifact-font-mono\` for code and data.
- Sizes: \`--artifact-font-size-0\` to \`-6\`, \`--artifact-space-0\` to \`-6\`, \`--artifact-radius-sm\`, \`-md\`, \`-lg\`.

Use the variables instead of literal colors and fonts. Derive borders and subtle fills from them, for example \`color-mix(in srgb, var(--artifact-color-text) 12%, transparent)\`. A page that hard-codes \`#fff\` cards over token text breaks in dark mode.

Dark mode is opt in. Add \`<meta name="color-scheme" content="light dark">\` and the host switches the color variables to the dark set when the user's theme is dark. Use it for new fully token-based pages and verify both themes. Only add it when every color on the page comes from the variables or from \`color-mix\` over them. The root attribute is \`data-artifact-theme\`, not \`data-theme\`. Do not add a theme switcher to every deliverable; the host already selects its theme.

## Layout and type

- Start with the content. Decide the one thing the reader must see first and give it the most space.
- One typeface pair at most: the display font for headings, the body font for text. Set body text at 15 to 17 pixels with a line height near 1.6, and keep lines under 75 characters.
- Use the spacing scale for rhythm. Group related items tightly and separate sections clearly.
- Prefer one strong layout over many equal boxes. Avoid a grid of identical icon cards, an all-caps label above every heading, gradient text, glassmorphism, and decorative emoji.
- Use one motion moment at most, and respect \`prefers-reduced-motion\`.
- Numbers use \`font-variant-numeric: tabular-nums\`. Charts label their axes and units, and color encodes meaning, not decoration.
- Interactive controls are real \`button\`, \`input\`, and \`select\` elements with visible focus and labels. Use \`type="button"\` for actions; native form navigation is blocked. Handle Enter without navigation, validate inputs, and state what a simulated action does. Keep user input on an actual error; add pending and retry states only for actions that need them.
- Match control borders and placeholder text to their semantic roles. Style selection, caret, scrollbars, and tabular numerals as part of the same system. Keep body text at 4.5:1 contrast, large text and control boundaries at 3:1, and provide keyboard access. Saved custom palettes are preserved, so verify their contrast rather than assuming it.
- A page has no storage or feedback bridge and no bundled chart libraries. Interactions are local to the view unless the tools explicitly provide another contract. Do not imply that a local form updates an account or sends a chat message.

## Documents

- Lead with the answer or the decision, then the detail.
- Use one H1 as the title, H2 for sections, and H3 sparingly.
- Keep paragraphs to four sentences or fewer. Use a table for comparisons and a list for steps.

## Check before you save

Every \`artifact_create\` and \`artifact_update\` call writes a new version the user sees in History. Treat each save as a release, not a draft.

- Finish the artifact before the first save. Reread the full draft once for broken markup, CSS that hides or overrides elements such as \`[hidden]\`, controls without handlers, placeholder copy, and the sandbox rules above.
- To check a page visually, render a scratch copy outside the artifact using the real resolved token CSS, \`composePage\`, CSP, and \`sandbox="allow-scripts"\` when available. A bare HTML file cannot verify injected tokens or sandbox behavior. This plugin has no unpublished page-preview tool.
- In one batched pass, check 380 and 700 pixel panels and a wide view in light and dark when supported. Check overflow, long labels, reading order, keyboard focus, contrast, chart/table agreement, and every actual interaction. Check script/resource errors. Fix all concrete findings together and use at most one confirmation pass for normal refinement.
- If browser verification is unavailable, state that rendering and interactions remain unverified. Do not install browser infrastructure or create repeated versions to compensate. If the user needs a saved deliverable, use source preflight and save once with that limit disclosed.
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
    'Author artifact pages, documents, and OpenPencil mockups with project-first design, task-specific structure, semantic tokens, a packaged HTML reference, sandbox rules, accessibility, bounded verification, and version-safe revisions.',
  whenToUse: 'Load before artifact_create, when the user asks for an artifact, and before an artifact_update that changes layout or styling.',
  source: 'bundled',
  content: CONTENT,
};
