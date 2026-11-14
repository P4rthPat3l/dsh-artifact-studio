# Artifacts for DeepSeek Harness

The agent creates pages, documents, and OpenPencil designs as versioned files, and you open them beside the chat. It works offline with no account and no hosted service.

## What it does

- Eight agent tools and one bundled skill: `artifact_create`, `artifact_read`, `artifact_update`, `artifact_list`, `artifact_delete`, `artifact_export`, `design_system_read`, and `design_system_update`.
- Three artifact types. A page is a self-contained HTML document rendered in a sandboxed frame with no network. A doc is Markdown edited in a Tiptap rich-text editor. A design is OpenPencil Design JSX: the host compiles it and renders a PNG preview, and the panel opens it on an editable canvas.
- Design previews run in a separate child process with Node's permission model: no network, no file writes, no child processes, and a 20 s deadline. The canvas loads the same engine in the browser from a local asset route. Icons are rejected in this version because the engine resolves them over the network.
- A design opens on a canvas in the panel: pan, zoom, select, move, resize, edit text, draw a frame or text, undo, and redo. Edits become a draft and Save writes a new version of the Design JSX. A version opened from History stays a read-only PNG.
- Two storage scopes. Workspace artifacts live in `$DSH_HOME/artifacts/workspaces/<workspaceId>/`, keyed by the registered workspace, so the project folder stays clean. Library artifacts live in `$DSH_HOME/artifacts/v1/`, and every project can see them.
- Every save creates a version. You can preview an older version and restore it, which adds a new version.
- A save is refused when someone else saved first, so neither the agent nor you can silently overwrite the other.
- Pages export as HTML. Docs export as Markdown, Word, or HTML. You can print either type or save it as a PDF from the print dialog. Designs export as PNG, SVG, or a `.fig` document that opens in OpenPencil.
- A design system reaches pages as `--artifact-*` CSS variables. It has a library default and an optional project override.
- The left sidebar opens the Artifacts page with one scope selector for all projects, one project, or the library. Artifacts open as tabs beside the chat. Back preserves gallery search, the scope and type filters, paging, and scroll.
- A bundled `artifact-design` skill gives the agent design rules, and page writes return warnings for network URLs, browser storage, fixed widths over 960 pixels, and pages that ignore the design tokens.
- The interface uses the Harness's own components and follows its light and dark theme. A page follows dark mode when it declares `<meta name="color-scheme" content="light dark">`.
- Reload and Back ask whether to save, discard, or cancel when edits are pending. Multiple views share a draft and serialize saves. Draft recovery stays in window memory until saved or discarded. It does not survive a browser restart.
- Export saves current edits first and uses that exact version. History exports and prints the selected saved version. A failed save stops output.
- Edit with agent saves pending edits, then puts your selection and a reference to the artifact and its saved version into this conversation's message box. You finish the sentence and send it. Selections work in documents, in the page preview, and in page code. The full Artifacts page has no conversation, so it copies the same text.
- The gallery shows page covers and document excerpts, a pinned group, and one recently updated grid. An empty project offers starter prompts. The header version picker lists versions and opens History.
- When the agent publishes a newer version, an open clean tab reloads and names the new version. A dirty tab keeps its conflict bar instead.
- Documents render on a page styled by the design tokens, so the editor matches the export. Formatting controls appear over a selection. Page code opens read-only with highlighting; Edit code switches to the editor, which saves with Save or Ctrl/Cmd+S. Documents autosave after typing.
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

Sources are TypeScript in `src/`. `npm run build` compiles the host into `dist/`, bundles `client.js` plus the lazy `client.doc.js` and `client.canvas.js`, and copies the canvas engine and its assets into `assets/`. Do not edit the built files.
