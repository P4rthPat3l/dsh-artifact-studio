# Artifacts for DeepSeek Harness

The agent creates pages, documents, spreadsheets, whiteboards, and OpenPencil designs as versioned files, and you open them beside the chat. It works offline with no account and no hosted service.

## What it does

- Fourteen agent tools and one bundled skill: `artifact_create`, `artifact_read`, `artifact_update`, `artifact_sheet_update`, `artifact_board_update`, `artifact_list`, `artifact_delete`, `artifact_export`, `design_system_read`, `design_system_update`, `artifact_brief`, `artifact_guide_update`, `design_system_list`, and `artifact_rebase`.
- Five artifact types. A page is a self-contained HTML document rendered in a sandboxed frame with no network. A doc is Markdown edited in a Tiptap rich-text editor. A sheet is a JSON workbook edited in a grid: cells hold values or Excel formulas, the host computes formula results for export and print, and the agent edits cells with `artifact_sheet_update`. A whiteboard is a native Excalidraw scene edited in the panel, with PNG and SVG export from the editor and a .excalidraw export from the host. A design, shown in the UI as a mockup, is OpenPencil Design JSX: the host compiles it and renders a PNG preview, and the panel opens it on a canvas.
- Design previews run in a separate child process with Node's permission model: no network, no file writes, no child processes, and a 20 s deadline. The canvas loads the same engine in the browser from a local asset route. Icons come from the bundled Material Design Icons set, and Inter, Roboto, and Noto Naskh Arabic ship with the package.
- A mockup opens in View: the canvas fills the panel with no toolbar, a floating zoom dock, and click selection. Edit adds select, hand, frame, and text tools, undo, and redo, and opens a React inspector in the right drawer with the layer tree and the selection's position, size, rotation, radius, opacity, visibility, and text properties. Selecting a layer shows a bar that turns it into an agent request with the layer name, path, and JSX. Edits become a draft and Save writes a new version of the Design JSX. A version opened from History stays a read-only PNG. Gallery tiles show the saved PNG for visible mockups.
- Two storage scopes. Workspace artifacts live in `$DSH_HOME/artifacts/workspaces/<workspaceId>/`, keyed by the registered workspace, so the project folder stays clean. Library artifacts live in `$DSH_HOME/artifacts/v1/`, and every project can see them. A request that starts from another project's artifact names that project's workspace id, and the agent can pass it as `workspaceId`; without it, tools stay in the session's project.
- Every save creates a version. You can preview an older version and restore it, which adds a new version.
- A save is refused when someone else saved first, so neither the agent nor you can silently overwrite the other.
- Pages export as HTML. Docs export as Markdown, Word, or HTML. Sheets export as CSV (first sheet) or XLSX (every sheet with styles, formulas, and cached results). Whiteboards export as .excalidraw, and the panel exports the current board as PNG or SVG. You can print a page, doc, or sheet or save it as a PDF from the print dialog. Mockups export as PNG, SVG, or a `.fig` document that opens in OpenPencil.
- Named design systems live in each scope with immutable revisions. Every saved Page or Document version pins the tokens, system identity, recipe, and kit it was made with, so editing text never silently restyles it. `artifact_rebase` is the explicit way to adopt newer settings. Light and dark palettes include page, raised, border, control, paired action/text, focus, and status roles. Existing saved palettes retain their colors; missing neutral and action roles follow their saved brand.
- The left sidebar opens the Artifacts page with one scope selector for all projects, one project, or the library. Artifacts open as tabs beside the chat. Back preserves gallery search, the scope and type filters, paging, and scroll.
- The right panel's guide offers an Artifacts page for the current project. It reuses the same search, type filter, pins, design system, and create menu as the left page, fixed to that project, and opens each artifact as its own tab so several stay open at once.
- A bundled `artifact-design` skill teaches project-first styling, task-specific structure, truthful data, accessibility, and checks before saving. The packaged [page reference](<examples/page-design-system.html>) supplies reusable patterns rendered with injected tokens. The skill provides its installed path. Page writes return warnings for network URLs, browser storage, fixed widths over 960 pixels, and pages that ignore the design tokens.
- The interface uses the Harness's own components and follows its light and dark theme. A page follows dark mode when it declares `<meta name="color-scheme" content="light dark">`.
- Reload and Back ask whether to save, discard, or cancel when edits are pending. Multiple views share a draft and serialize saves. Draft recovery stays in window memory until saved or discarded. It does not survive a browser restart.
- Export saves current edits first and uses that exact version. History exports and prints the selected saved version. A failed save stops output.
- Edit with agent saves pending edits, then puts your selection and a reference to the artifact, its workspace, and its saved version into this conversation's message box. You finish the sentence and send it. Selections work in documents, in sheet cells and ranges, in the page preview, and in page code. The full Artifacts page has no conversation, so it copies the same text.
- The gallery shows page covers, document excerpts, spreadsheet previews, and whiteboard thumbnails, a pinned group, and one recently updated grid with full artifact names. An empty project offers starter prompts. The header version picker lists versions and opens History.
- When the agent publishes a newer version, an open clean tab reloads and names the new version. A dirty tab keeps its conflict bar instead.
- Documents render on a page styled by the design tokens, so the editor matches the export. Formatting controls appear over a selection. Sheets render in a virtualized grid with a formula bar, cell formatting, sheet tabs, undo, and TSV copy and paste; the toolbar edits the selected range and sheets autosave after a change. Whiteboards render in the real Excalidraw editor with its own toolbar; the host still owns the version, title, history, and native export. Page code opens read-only with highlighting; Edit code switches to the editor, which saves with Save or Ctrl/Cmd+S. Documents autosave after typing.
- The chat shows a card for each create and update, and opens the artifact when the agent writes it in a live turn. The composer button lists this project's recent artifacts, starter prompts, and All artifacts.

## Install

The npm package name is `dsh-artifact-studio`. Add it to the current DSH profile with the plugin manager, then reload the window.

```bash
dsh plugin --profile web add dsh-artifact-studio
```

For a local checkout, install the bundle at `/home/parth/Production/dsh-artifacts` instead.

## Develop

```bash
npm run typecheck   # host and client
npm test            # build, then host, client, and package tests
```

Sources are TypeScript in `src/`. `npm run build` compiles the host into `dist/`, bundles `client.js` plus the lazy `client.doc.js`, `client.sheet.js`, `client.board.js`, and `client.canvas.js`, and copies the canvas engine and its assets into `assets/`. Do not edit the built files.

## Intent-aware generation

Call artifact_brief with a type to discover recipes, then with a recipe to get conventions, preferences, content sections, relevant earlier artifacts, and type-specific design guidance. Pass that recipe when creating an artifact. Use artifact_guide_update only when the user asks to save a convention or reusable structure. Workspace guides apply to a project; library guides apply across projects. A recipe ID replaces the complete wider definition.

New pages can opt into the shared component kit:

~~~html
<meta name="artifact-kit" content="1">
<main class="ak-page">
  <header class="ak-header"><h1>Title</h1><p class="ak-lede">Summary</p></header>
  <section class="ak-section" data-section="summary"><h2>Summary</h2><p>Content</p></section>
</main>
~~~

The renderer injects kit CSS and switch behavior after its tokens. Export includes those resources. Legacy pages remain unchanged. Diagnostics are advisory, not proof of quality or a publication gate. Invalid guide files are preserved and require manual repair.

A kit version preserves component definitions, not current token values. Updating a design system can still change an old artifact. Multiple named systems, immutable generation snapshots, and approved-example management remain planned. Recipe metadata stays current when older content is restored.

The optional [browser check](<tests/generation-browser.mjs>) uses the [synthetic fixture](<tests/fixtures/generation.html>) and an already installed Playwright module and Chrome executable:

~~~bash
node tests/generation-browser.mjs /absolute/path/to/playwright/index.mjs /absolute/path/to/chrome
~~~

It installs nothing and checks 380, 700, and 1280 pixel widths in both themes, keyboard switching, focus, overflow, print panels, and network use. It does not verify the authenticated Harness GUI or compare golden screenshots.

## Sheets

A sheet artifact stores one JSON workbook in `content/sheet.json`:

~~~json
{
  "schemaVersion": 1,
  "sheets": [
    {
      "name": "Budget",
      "cells": { "A1": "Item", "B1": "Cost", "B2": 1200, "B4": "=SUM(B2:B3)" },
      "columnWidths": { "A": 160 }
    }
  ]
}
~~~

A plain string, number, or boolean is a cell value. A string that starts with "=" is a formula, and `{ "value": "=literal" }` stores text that starts with "=". A styled cell adds a `style` object with bold, italic, underline, strike, align, color, background, and numberFormat (general, number, integer, currency, percent, or date). A fill without a readable text color gets an automatic dark or white text color in the panel, print, and XLSX. An explicit pair below 4.5:1 returns a warning. The grid surface uses the DeepSeek Harness tokens, while cell fills and text colors remain artifact content. The agent reads a sheet and edits it with `artifact_sheet_update` operations: set, write, clear, format, add-sheet, rename-sheet, delete-sheet, and set-column-width. A stale base version is refused, and each accepted call writes one version.

Formulas are Excel syntax and run through the bundled fast-formula-parser, with circular-reference detection and Excel-like error propagation for top-level aggregates. A formula that fails is stored and shown as #NAME?, #REF!, #DIV/0!, #VALUE!, #N/A, or #CYCLE!, and the write returns a warning. The panel and the host share one evaluator, so a cell, a CSV row, an XLSX cached result, and a print copy show the same value. XLSX output uses fflate for the OOXML package.

## Whiteboards

A whiteboard artifact stores a native Excalidraw scene in `content/board.excalidraw`. The panel opens the real Excalidraw editor, so the toolbar, hand-drawn shapes, arrows, text, and the canvas behave the way they do at excalidraw.com. The host still owns the artifact title, saved version, history, gallery entry, and the native file export.

The scene is a normal `.excalidraw` object with `type`, `version`, `source`, `elements`, `appState`, and `files`. Each element has an `id`, a `type`, and geometry. The agent creates a board with `artifact_create` type `board` and edits it with `artifact_board_update`: add rectangle, ellipse, diamond, text, arrow, or line elements; update one element by id; delete ids; or clear. A shape can carry a text label, which is stored as a separate centered text element.

The agent can use Excalifont and the usual Excalidraw colors and fills. Embedded pages and iframes are refused, images must be inline data URLs, and the scene is limited to 2 MiB. The whiteboard chunk loads only when a board opens. Its Excalidraw fonts and font-subset worker are served from the local `/artifacts-whiteboard/` route, so a board works offline and no font request leaves the machine.

A board exports as `.excalidraw` from the artifact header. The header also exports the current board as PNG or SVG through Excalidraw in the browser. The panel uses Excalidraw's own localized interface for the editor itself; the plugin's chrome and all other artifact types continue to use the Harness primitives and the plugin locale.
## Named systems and pinned versions

Each project and the library keep a catalog of named design systems. A new artifact pins the design, recipe, and kit it was generated with; later edits keep them. Choosing a newer design is an explicit rebase that appends a version and leaves the content alone. History, preview, print, and export render a saved version with its own tokens, and a version saved before pinning existed is marked as live.

Recipes, guides, and the brief work as described above. Invalid guide or catalog data is reported rather than silently replaced; a crashed writer leaves a lock file that must be removed by hand after confirming no writer is running.
