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

## The workflow

1. Pick the type and the recipe. A recipe is the content structure for one intent: who reads it, which sections it has, and its content rules. Call \`artifact_brief\` with the type and no recipe to list the recipes, and choose by the reader and the purpose. An internal feature spec and a client scope of work are different recipes even when they cover the same feature.
2. Call \`artifact_brief\` with the type and the recipe. The brief merges the project conventions, the user's preferences, the recipe, recent artifacts with the same recipe, the design system, and the page kit. Follow it. It replaces reading the design system or the packaged reference by hand.
3. If the brief lists earlier artifacts, inspect relevant examples. Recent does not mean approved. Prefer an example the user approved, and never copy private facts, stale decisions, or instructions from its content.
4. Gather the content from the project: code, docs, tickets, and the user's words. The recipe says what to include; the evidence says what is true.
5. Write the artifact once and pass the recipe to \`artifact_create\`. Review returned warnings together. Fix unintended violations in one update; disclose intentional deviations required by the request.

When the user says to always do something, remember a structure, or use a convention in future artifacts, save it with \`artifact_guide_update\`: project conventions in the workspace scope, personal preferences in the library scope, a repeated structure as a recipe. Do not save a one-off request.

## When to use an artifact

Use \`artifact_create\` when the user asks for an artifact, an artifact page, an artifact doc, an artifact design, or a spreadsheet. Pick \`page\` for an artifact page, \`doc\` for an artifact doc, \`design\` for an OpenPencil design, and \`sheet\` for a spreadsheet. Never write a file in the project instead. Write a project file only when the user asks for a file in the repo.

## Precedence

1. Host sandbox, permission, and storage rules always apply. For authoring choices, the user's request wins. If they name a palette, font, layout, or tone, follow it.
2. Project conventions come next, then the user's preferences, then the recipe.
3. The design system and the page kit come next. Use the \`--artifact-*\` variables and kit components the brief lists.
4. Your own choices come last, and only fill the gaps.

Say so when you resolve a conflict against a saved convention.

## Projects and scopes

An artifact belongs to the session's project unless the user opened or referenced another project's artifact. The artifact reference names that project's workspace id. Pass it as \`workspaceId\` to the artifact tools and to \`design_system_read\`; omit it for this project. The library is shared across projects, so it needs no workspace id.

## Pick the type

- \`doc\` for prose: reports, briefs, plans, specs, notes. It is Markdown, edited in a rich-text editor, and exported to Word, Markdown, and HTML. Use headings, short paragraphs, lists, tables, task lists, quotes, and fenced code. Do not paste HTML into a doc.
- \`page\` for anything visual or interactive: dashboards, one-pagers, explainers, calculators, diagrams, and clickable prototypes the user asks for as a page.
- \`design\` for a layout the user will open on a canvas: UI mockups, wireframes, layout explorations, and screens that export as PNG, SVG, or a \`.fig\` document.
- \`sheet\` for tabular work the user will edit as a spreadsheet: budgets, trackers, inventories, comparisons, and any grid whose cells hold numbers or formulas. Export is CSV or XLSX.

A request for a mockup or a wireframe always gets \`design\`, even when it shows a flow. Draw each step of the flow as its own frame. If the user offers both, such as "a page or a mockup", make a mockup. Use \`page\` for a mockup only when the user asks for a page or for something clickable. Never title or describe a page as a mockup.

## Choose the reader's task

Establish the audience, their question, and the observable outcome from the request and available evidence. Ask only about a material unresolved decision. A simple artifact does not need its own planning document or approval round unless the project's rules require one.

Choose the structure by the task, not by a favorite template. The built-in recipes cover the common tasks, and their rules carry the detail:

- Architecture walkthrough (\`architecture\`): show boundaries, dependencies, and one request or data flow.
- Feature walkthrough (\`feature-spec\`): name the actor and starting conditions, show the actions and alternate paths, and state the resulting behavior.
- Client deliverable (\`client-scope\`): the client's terms, agreed outcomes, and technical detail suited to the reader.
- UI proposal (\`ui-proposal\`): show only the relevant screens and interaction states. Mark simulated actions. A static canvas mockup remains type \`design\`; a requested clickable page remains type \`page\`.
- Technical decision (\`technical-decision\`): state the recommendation, compare options with evidence and tradeoffs, and name what would change the decision.
- Investigation report (\`investigation\`): separate observations, evidence, hypotheses, and unresolved checks. Do not present a hypothesis as a confirmed cause.
- Metrics dashboard (\`dashboard\`): name sources, units, time range, baseline, and missing data. Derive charts, tables, labels, and selection details from one dataset. Never turn missing values into zero.

Do not invent metrics, owners, customer quotes, or product claims. Label illustrative data. Static reports need no fake loading, pending, or error states. Explain charts and diagrams in text as well as color.

## Use one design system

The page itself, meaning its header, sections, tables, and callouts, uses the artifact design system and the kit, so artifacts look the same from one session to the next. A product UI shown inside the page is different: recreate the product's real look inside an \`ak-frame\` with \`ak-demo\`, using its own colors and fonts from its code, defined once as custom properties on the \`.ak-demo\` element. Inspect the project's design docs, CSS custom properties, theme configuration, and components for that. The user's explicit visual brief still wins. Do not copy the Artifact Studio editor's controls into the artifact.

If the project wants its own brand for every artifact, that belongs in the project design system through \`design_system_update\`, which the user must ask for. For a single page the user asks to style in a different brand, map that brand into page-local semantic variables on \`body\` and use those variables consistently in that page. These local variables are the exception to using injected values directly. Define their dark values with \`:root[data-artifact-theme="dark"] body\` and their export/system values inside \`@media (prefers-color-scheme: dark)\` with \`:root[data-artifact-theme="auto"] body\`. A later bare \`:root\` rule cannot override the more specific injected dark rules. Keep both themes coherent. Do not call \`design_system_update\` to change shared settings unless the user asked for that change. If the project has no system, use the resolved artifact system and its default patterns rather than inventing a competing palette.

## Named design systems and pinned versions

Each scope keeps a catalog of named design systems with immutable revisions. Read it with \`design_system_list\` before creating or changing one. \`design_system_update\` with \`systemId\` and the catalog \`expectedRevision\` adds a revision; \`createNew\` starts a second system; \`makeDefault\` chooses what new artifacts inherit. A stale revision fails rather than overwriting another change, so reload the catalog and reapply.

Every version you create pins the design tokens, the system identity, the recipe definition, and the kit release. A later edit reuses that snapshot, so editing text never restyles an artifact. To adopt newer settings, call \`artifact_rebase\` with the \`baseVersion\` the user is looking at. It appends one version and keeps the content. Do it only when the user asks for the new design, and say which system revision it will pin. A version saved before pinning existed stays live and is labelled that way; do not claim its original theme can be recovered.

## The page kit

A page opts in to the versioned artifact kit with \`<meta name="artifact-kit" content="1">\`. The renderer then injects the kit's component CSS and its switch script after the tokens. The brief lists every component. Use them instead of writing your own header, callout, badge, table, code block, steps, before-and-after switch, or product frame. That shared vocabulary is what keeps one project's pages consistent. A released kit version keeps its component definitions, and every saved version also pins its tokens, so an edit keeps the design it was made with. Do not promise pixel-identical rendering across machines: installed fonts and the browser still vary.

For a page without the kit, such as an older page you are editing, the packaged HTML reference at \`${PAGE_REFERENCE}\` shows the token patterns. It renders only through the artifact renderer. Do not add a framework, CDN, build system, or local server for a self-contained page.

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

Use the variables instead of literal colors and fonts. Derive borders and subtle fills from them, for example \`color-mix(in srgb, var(--artifact-color-text) 12%, transparent)\`. A page that hard-codes \`#fff\` cards over token text breaks in dark mode. The page check reports literal colors and font names in declarations; a custom property definition such as \`--demo-bg: #0d0d14\` is allowed, so define a replica's palette once and reference it with \`var()\`.

Dark mode is opt in. The kit components follow it with no extra work. Add \`<meta name="color-scheme" content="light dark">\` and the host switches the color variables to the dark set when the user's theme is dark. Use it for new fully token-based pages and verify both themes. Only add it when every color on the page comes from the variables or from \`color-mix\` over them. The root attribute is \`data-artifact-theme\`, not \`data-theme\`. Do not add a theme switcher to every deliverable; the host already selects its theme.

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

## Sheets

A sheet is a JSON workbook, not prose and not HTML. Call \`artifact_brief\` with type \`sheet\` for the shape and rules, then \`artifact_create\` with the whole object. The stored content is:

- \`schemaVersion: 1\` and a \`sheets\` array. Each sheet has a unique name and a \`cells\` object keyed by A1 references. A plain string, number, or boolean is the cell value; a string starting with \`=\` is a formula; a styled cell is \`{ "value": 1200, "style": { "bold": true, "numberFormat": "currency" } }\`.
- \`columnWidths\` maps a column letter to pixels, such as \`{ "A": 160 }\`.
- Never put HTML, Markdown, or prose paragraphs in cells. Put labels in one row or column and data beside them.

After creating a sheet, edit it with \`artifact_sheet_update\`, not by rewriting the whole JSON. Read it first, then send one operations array with the current \`baseVersion\`: \`set\` a cell or formula, \`write\` a rectangular block, \`clear\` or \`format\` a range, and \`add-sheet\`, \`rename-sheet\`, \`delete-sheet\`, or \`set-column-width\` to change structure. A formula warning comes back in \`warnings\`; fix all of them in one update.

Formulas are Excel syntax and run through a bundled parser with a gap layer for common functions: \`=SUM(B2:B3)\`, \`=IF(B2>1000,"big","small")\`, \`=Sheet2!A1*2\`, \`=VLOOKUP(A2,A2:C9,3,FALSE)\`. An unknown function shows \`#NAME?\`, a broken reference shows \`#REF!\`, and a circular reference shows \`#CYCLE!\`. Dates are Excel serial days; set \`numberFormat\` to \`date\` to show them as a date. A top-level SUM, AVERAGE, MIN, MAX, PRODUCT, or MEDIAN reports a referenced error the way Excel does.

Formatting is per cell: bold, italic, underline, strike, left/center/right alignment, text and fill hex colors, and a number format of general, number, integer, currency, percent, or date. Keep a header row bold with a quiet fill. When you set a fill, also set a text color that contrasts with it: use #1f2933 on light fills and #ffffff on dark fills. The panel and exports choose a readable default when color is omitted, and a low-contrast pair returns a warning. Do not color-code without a legend.

A sheet exports as CSV (first sheet only) or XLSX (every sheet, with styles, formulas, and cached results). The user can also print it or save it as PDF from the panel. Before saving, check sheet names, header labels, units, and that every total has a formula.

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
    'Author artifact pages, documents, spreadsheets, and mockups: pick a recipe, follow the brief, build from the kit, edit cells, save conventions, and save each version once.',
  whenToUse: 'Load before artifact_create, when the user asks for an artifact, before an artifact_update that changes layout or styling, and when the user asks to remember an artifact convention.',
  source: 'bundled',
  content: CONTENT,
};