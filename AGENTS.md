# dsh-artifact-studio

- Read `/home/parth/Documents/deepseek-harness/default-workspace/docs/features/FEAT-002-artifact-studio.md` before changing behavior, contracts, or storage, and update it in the same change.
- TypeScript, ES modules. The host lives in `src/host/` and compiles to `dist/` with `tsc`. The browser client is bundled from `src/client/` by esbuild into `client.js`, plus the lazy `client.doc.js` that carries Tiptap. `src/contract.ts` and `src/render.ts` are shared by both halves.
- Three host plugins come from one package. `dsh-artifact-studio` registers the `/artifacts-rpc` route. `dsh-artifact-studio/tools` registers the eight tools. `dsh-artifact-studio/skill` registers the bundled `artifact-design` skill from `src/host/lib/skill.ts`; it is separate so a composition without `skills` still loads the tools. The route and tools build an `ArtifactService` over the same files, and `store.ts` serialises writes per artifact directory inside the process.
- Page previews use `sandbox="allow-scripts"` with no other flags, plus the injected CSP in `src/render.ts`. Do not add `allow-same-origin`. The Web shell has no CSP of its own.
- `composePage` emits the policy, charset, title, and token style as a prologue and puts the artifact inside the body. Never go back to injecting into the page's own `<head>`: a comment or a leading script can defeat a pattern match, and the policy must be parsed before any page byte. The print frame is the one place `allow-modals` appears, because `print()` requires it.
- Every write and delete target goes through `assertWithin` before touching disk, and every lock through `withLock`. A link planted at any level of the tree must fail, not be followed.
- Chrome uses `@deepseek-ai/dsh-client-ui-primitives` (Button, Menu, Modal, Toast, SegmentedControl, CodeBlock, TextShimmer, icons). The Web shell provides it to plugin bundles at runtime, so `scripts/build.mjs` marks it external. It ships no types: `src/client/primitives.d.ts` declares only what the plugin uses, from the package source in the installed Harness. Tests load `tests/primitives-stub.cjs` in its place. Icons must be exported names; a missing sprite symbol renders nothing.
- Plugin chrome colors come from `--dsw-*` tokens. The Harness marks dark mode with `data-ds-dark-theme` on `<body>`, not `data-theme`; `src/client/theme.ts` watches it.
- A page follows the dark token colors only when it opts in with `<meta name="color-scheme" content="light dark">`; `composePage` then sets `data-artifact-theme`. Pages without the meta keep the light colors, because they may paint literal light backgrounds.
- Every visible string goes through `t()` with EN and ZH entries in `src/client/locale.ts`. Test AC-023 enforces this.
- Only MIT or Apache-2.0 dependencies. `tests/package.test.mjs` checks the runtime ones.
- `npm test` builds first. A live check needs the bundle reinstalled, through `remove_bundle` then `install_bundle`, and then a window reload.

- `src/client/editor-model.ts` owns one shared editor per full artifact address. Draft and in-flight write state are separate. Only unsaved models survive the last pane unmount, in window memory. Never persist draft content in localStorage.
- Document replacement revisions advance only after external content is accepted. Own saves must not rebuild the document or move its caret. The lazy editor must read the latest props when its chunk resolves.
- Edit with agent saves first, then calls the tab's own session `inputActions.insertQuote` and `insertText`. Never call `submit` or `setDraft`, and never infer a conversation from an artifact's source session. Surfaces without `inputActions`, such as the left full page, copy the same text instead.
- `src/client/review.ts` builds the quote and the artifact reference (title, id, saved version). Only the selected text travels; never include the whole artifact or a stale copy of its content.
- Preview frames get `SELECTION_BRIDGE` so a selection inside the page becomes a quote. The listener accepts only messages whose `event.source` is that frame; a page can at most fill a quote the user still reviews before sending.
- The chat card opens the artifact tab only when it watched the call run before the result arrived; a card that mounts already settled, as on transcript replay, never opens a tab.
- Gallery covers are scriptless, opaque-origin iframes. Keep `sandbox=""` and strip scripts and inline handlers; a cover is decoration, not a second preview.
- Pins are local view preferences in `localStorage`. Never write them to a manifest, a version, or the host.
- Export and print accept an optional saved version. Never fall back to latest when a requested version is missing. Scope-root confinement must run before creating directories.
