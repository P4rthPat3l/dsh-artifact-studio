# dsh-artifacts

- Read `/home/parth/Documents/deepseek-harness/default-workspace/docs/features/FEAT-002-artifact-studio.md` before changing behavior, contracts, or storage, and update it in the same change.
- TypeScript, ES modules. The host lives in `src/host/` and compiles to `dist/` with `tsc`. The browser client is bundled from `src/client/` by esbuild into `client.js`, plus the lazy `client.doc.js` that carries Tiptap. `src/contract.ts` and `src/render.ts` are shared by both halves.
- Two host plugins come from one package. `dsh-artifacts` registers the `/artifacts-rpc` route. `dsh-artifacts/tools` registers the eight tools. Both build an `ArtifactService` over the same files, and `store.ts` serialises writes per artifact directory inside the process.
- Page previews use `sandbox="allow-scripts"` with no other flags, plus the injected CSP in `src/render.ts`. Do not add `allow-same-origin`. The Web shell has no CSP of its own.
- `composePage` emits the policy, charset, title, and token style as a prologue and puts the artifact inside the body. Never go back to injecting into the page's own `<head>`: a comment or a leading script can defeat a pattern match, and the policy must be parsed before any page byte. The print frame is the one place `allow-modals` appears, because `print()` requires it.
- Every write and delete target goes through `assertWithin` before touching disk, and every lock through `withLock`. A link planted at any level of the tree must fail, not be followed.
- The plugin must not import `@deepseek-ai/dsh-client-ui-primitives`. Every color comes from a `--dsw-*` token.
- Every visible string goes through `t()` with EN and ZH entries in `src/client/locale.ts`. Test AC-023 enforces this.
- Only MIT or Apache-2.0 dependencies. `tests/package.test.mjs` checks the runtime ones.
- `npm test` builds first. A live check needs the bundle reinstalled, through `remove_bundle` then `install_bundle`, and then a window reload.
