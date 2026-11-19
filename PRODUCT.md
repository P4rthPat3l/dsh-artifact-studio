# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Developers using DeepSeek Harness with a local workspace and an agent conversation. The primary daily task for this redesign is reviewing agent output and requesting changes.

## Product Purpose

Artifact Studio keeps agent-created pages, documents, spreadsheets, and mockups available to preview, edit, version, and export. Users can reopen work through the gallery without locating its files manually.

## Operating Context

The plugin runs inside the Harness Web UI. Artifacts open beside the conversation or in a full-page view. A project scope stores artifacts with a workspace. A library scope keeps artifacts available across projects.

## Capabilities and Constraints

- Page artifacts contain self-contained HTML. Document artifacts contain Markdown and support rich-text editing. Sheet artifacts contain a JSON workbook with cell values, styles, and Excel formulas, edited in a grid and exported as CSV or XLSX.
- Saved versions can be previewed, restored, and exported.
- The reviewed agent-edit request is copied for the user to paste into chat. The plugin does not send it automatically or replace a chat draft.
- Unsaved edits, save conflicts, and exact-version output protections must survive the redesign.
- Page previews run in a network-blocked sandbox without same-origin access.
- UI colors follow Harness tokens. Visible interface text supports English and Chinese.
- The redesign covers the plugin, not the surrounding Harness navigation.
- No new storage or API contract is required for the visual redesign.

## Brand Commitments

Keep the Artifact Studio name and the surrounding Harness theme integration. The user requested a full visual redesign of the plugin. The earlier Claude reference is recorded as context, not a confirmed replacement design specification.

## Product Principles

- Give the artifact priority over its controls.
- Keep the artifact's project and saved-version identity clear.
- Protect edits when navigating or producing output.
- Keep agent-edit requests under the user's control.
