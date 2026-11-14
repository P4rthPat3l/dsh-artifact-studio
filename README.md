# Artifacts for DeepSeek Harness

The agent creates pages and documents as versioned files, and you open them beside the chat. It works offline with no account and no hosted service.

## What it does

- Eight agent tools: `artifact_create`, `artifact_read`, `artifact_update`, `artifact_list`, `artifact_delete`, `artifact_export`, `design_system_read`, and `design_system_update`.
- Two artifact types. A page is a self-contained HTML document rendered in a sandboxed frame with no network. A doc is Markdown edited in a Tiptap rich-text editor.
- Two storage scopes. Workspace artifacts live in `$DSH_HOME/artifacts/workspaces/<workspaceId>/`, keyed by the registered workspace, so the project folder stays clean. Library artifacts live in `$DSH_HOME/artifacts/v1/`, and every project can see them.
- Every save creates a version. You can preview an older version and restore it, which adds a new version.
- A save is refused when someone else saved first, so neither the agent nor you can silently overwrite the other.
- Pages export as HTML. Docs export as Markdown, Word, or HTML. You can print either type or save it as a PDF from the print dialog.
- A design system reaches pages as `--artifact-*` CSS variables. It has a library default and an optional project override.
- The left sidebar opens a full-page Artifacts browser with a project selector. The conversation side panel opens the same editor beside chat. Back preserves gallery search, filters, paging, and scroll.
- Reload and Back ask whether to save, discard, or cancel when edits are pending. Multiple views share a draft and serialize saves. Draft recovery stays in window memory until saved or discarded. It does not survive a browser restart.
- Export saves current edits first and uses that exact version. History exports and prints the selected saved version. A failed save stops output.
- Ask agent builds a request from the artifact identity, the saved version, your words, and optionally the exact text you selected in a document or the page source. The composer separates your prompt from the generated request, keeps a selectable preview, and never sends or stages a chat message. Copy it into your chosen conversation.
- The gallery shows page covers and document excerpts, a pinned group, starter templates, and one recently updated grid with scope badges. The header version picker lists versions and opens History.
- When the agent publishes a newer version, an open clean tab reloads and names the new version. A dirty tab keeps its conflict bar instead.
- Documents have heading, emphasis, list, and code controls. Page source uses Save or Ctrl/Cmd+S; documents autosave after typing.
- The chat shows a card for each create and update. The composer button opens the gallery.

## Install

In the Plugin manager, install the local bundle at `/home/parth/Production/dsh-artifacts`, then reload the window.

## Develop

```bash
npm run typecheck   # host and client
npm test            # build, then host, client, and package tests
```

Sources are TypeScript in `src/`. `npm run build` compiles the host into `dist/` and bundles `client.js` plus the lazy `client.doc.js`. Do not edit the built files.
