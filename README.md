# Artifacts for DeepSeek Harness

The agent creates pages and documents as versioned files, and you open them beside the chat. It works offline with no account and no hosted service.

## What it does

- Eight agent tools: `artifact_create`, `artifact_read`, `artifact_update`, `artifact_list`, `artifact_delete`, `artifact_export`, `design_system_read`, and `design_system_update`.
- Two artifact types. A page is a self-contained HTML document rendered in a sandboxed frame with no network. A doc is Markdown edited in a Tiptap rich-text editor.
- Two storage scopes. Project artifacts live in `<workspace>/.dsh/artifacts/`. Library artifacts live in `$DSH_HOME/artifacts/v1/`, and every project can see them.
- Every save creates a version. You can preview an older version and restore it, which adds a new version.
- A save is refused when someone else saved first, so neither the agent nor you can silently overwrite the other.
- Pages export as HTML. Docs export as Markdown, Word, or HTML. You can print either type or save it as a PDF from the print dialog.
- A design system reaches pages as `--artifact-*` CSS variables. It has a library default and an optional project override.
- The chat shows a card for each create and update. The right sidebar has an Artifacts page, and the composer has a button that opens it.

## Install

In the Plugin manager, install the local bundle at `/home/parth/Production/dsh-artifacts`, then reload the window.

## Develop

```bash
npm run typecheck   # host and client
npm test            # build, then host, client, and package tests
```

Sources are TypeScript in `src/`. `npm run build` compiles the host into `dist/` and bundles `client.js` plus the lazy `client.doc.js`. Do not edit the built files.
