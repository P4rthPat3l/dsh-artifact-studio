---
name: Artifact Studio
description: Compact Harness-native controls around editable artifacts.
colors:
  primary: "var(--dsw-alias-brand-primary)"
  surface: "var(--dsw-alias-bg-base)"
  text: "var(--dsw-alias-label-primary)"
  secondary-text: "var(--dsw-alias-label-secondary)"
  hover: "var(--dsw-alias-interactive-bg-hover)"
  selected: "var(--dsw-alias-interactive-bg-hover-accent)"
  focus: "var(--dsw-alias-state-business-primary)"
typography:
  metadata:
    fontFamily: "var(--dsw-font-family)"
    fontSize: "11px"
    lineHeight: "14px"
    fontWeight: 400
  control:
    fontFamily: "var(--dsw-font-family)"
    fontSize: "12px"
    lineHeight: "18px"
    fontWeight: 400
  body:
    fontFamily: "var(--dsw-font-family)"
    fontSize: "13px"
    lineHeight: "20px"
    fontWeight: 400
  title:
    fontFamily: "var(--dsw-font-family)"
    fontSize: "14px"
    lineHeight: "22px"
    fontWeight: 500
rounded:
  inline: "4px"
  control: "8px"
  container: "12px"
  card: "16px"
spacing:
  micro: "2px"
  tight: "4px"
  related: "6px"
  control: "8px"
  group: "12px"
  section: "16px"
  surface: "24px"
components:
  button-small:
    height: "28px"
    rounded: "{rounded.control}"
    typography: "{typography.control}"
  select:
    height: "28px"
    rounded: "{rounded.control}"
    typography: "{typography.control}"
  search:
    height: "36px"
    rounded: "{rounded.container}"
---

# Artifact Studio design system

## Overview

The plugin uses the DeepSeek Harness visual language. Controls stay compact and the artifact gets the remaining space. Preserve the distinction between editor controls and artifact content: a document, page, cell fill, or Mockup can have its own visual identity.

This file documents plugin chrome. Runtime values come from the Harness theme and shared primitives. [The stylesheet](<src/client/styles.ts>) adds only the spacing and dense-control dimensions the host does not provide. The YAML values describe the default scale; use host CSS variables so font preferences and both themes remain supported.

## Colors

Use semantic Harness variables for each job. The theme changes on body[data-ds-dark-theme].

- Text uses --dsw-alias-label-primary or --dsw-alias-label-secondary.
- Resting surfaces use --dsw-alias-bg-base or --dsw-alias-bg-layer-1. The canvas uses --dsw-alias-bg-document-preview.
- Cards use --dsw-alias-card-fill and --dsw-alias-card-fill-hover.
- Hover uses --dsw-alias-interactive-bg-hover. Selected and pressed controls use --dsw-alias-interactive-bg-hover-accent. Never use layer backgrounds to represent an interaction: several resolve to the same white in light mode.
- Keyboard outlines use --dsw-focus-ring-width and --dsw-focus-ring-color, falling back to --dsw-alias-state-business-primary. Grid selection uses that business-blue role.
- Hairline dividers use border-l2. Fields use border-l4. Quiet card boundaries can use border-l1.

The user selected a separate named "DeepSeek Harness" artifact system as the library default. New pages and documents inherit it unless a workspace overrides it. This profile preference is stored outside the repo. Saved versions keep their pinned tokens; changing the library default does not restyle them. Mockups use authored values; sheets retain their cell formatting.

## Typography

Use host font shorthands or their size and line-height pairs: --dsw-font-xxxs-11, --dsw-font-xxs-12, --dsw-font-xs-13, and --dsw-font-s-14. Strong labels use weight 500. Metadata uses 11px; controls and compact lists use 12px; explanatory text uses 13px; section titles use 14px.

Code uses --ds-font-family-code. Do not add another monospace stack. Miniature gallery covers may use 8px, 9px, and 10px text because they are thumbnails, not reading surfaces. Document typography and bold spreadsheet content remain artifact content.

## Layout

Use the local spacing steps of 2, 4, 6, 8, 12, 16, and 24px through --art-space-*. Keep fixed canvas geometry, sheet row sizes, hit areas, and viewport constraints separate from spacing tokens.

Small controls are 28px, inline row actions are 20px, and gallery search matches the 36px filter track. Shared Inputs retain their native 32px height except where a dense row needs 20px or 28px. Primary icon controls expand to 44px touch targets.

The gallery caps at 860px. Editor titles truncate before pushing actions to another row. Below 600px the editor header stacks; below 520px the gallery stacks search and filters. Keep type filters scrollable when labels cannot fit. A narrow inspector overlays the artifact and traps focus; a wide inspector reserves 300px beside it.

Pinned-design identity belongs in header metadata rather than a second toolbar. Warnings and conflicts retain visible banners.

## Elevation & Depth

Floating selection bars, the document format toolbar, and the canvas dock use --dsw-elevation-panel, no extra border, a layer-1 background, and the container radius. Document pages use the host stroke and level-1 shadow. Never tint shadows with the text color: it produces pale halos in dark mode. Leave host scrollbars to the Harness scrollbar stylesheet.

## Shapes

Use --dsw-radius-xs for inline edits and tiny swatches, --dsw-radius-sm for small controls, --dsw-radius-md for containers and floating bars, and --dsw-radius-lg for chat cards. Do not introduce 5px, 6px, 7px, or 10px corners.

## Components

Use @deepseek-ai/dsh-client-ui-primitives for Button, Input, Menu, Modal, Tag, SegmentedControl, Switch, Tooltip, ZoomControls, and TextShimmer. [The declarations](<src/client/primitives.d.ts>) mirror only the props this plugin consumes.

- Inputs render a wrapper and a native input. Put layout dimensions on the wrapper, not another border on its inner input.
- Native selects share art-select for geometry, colors, focus, and typography. Keep browser keyboard behavior.
- Actions use small Buttons in toolbars. Modal actions go in the footer with normal-sized Buttons. Cancel and retry use outline; the committing action uses primary.
- View/Edit/Code and Layers/Properties use SegmentedControl. Preserve tab IDs, panel relationships, arrow navigation, and keyboard focus.
- Loading surfaces expose a status and TextShimmer. Errors expose an alert and a recovery action where one exists. Center full-surface states; keep contextual notes near their controls.
- Prefer shared icons. Plugin-only icons use the 24-unit grid and 1.5 stroke in [icons.tsx](<src/client/icons.tsx>). Sheet and canvas undo/redo share glyphs.
- Flatten embedded ZoomControls only to join the canvas dock; do not override its buttons or menu.

Transitions use --ds-transition-duration-fast and --ds-ease-in-out. Disable authored motion under reduced-motion preferences.

## Do's and Don'ts

- Do verify 380px, 700px, and a wide pane in light and dark, including long names, hover, keyboard focus, pressed controls, errors, and loading.
- Do preserve stored artifact colors. Spreadsheet text without a fill can need a display-only contrast correction against the host grid; saving must not change its style.
- Do localize visible strings in both locale dictionaries. Call type design "Mockup".
- Don't hard-code chrome palettes or fonts, add a parallel component library, or use a surface token for pressed state.
- Don't change the page-kit release or pinned token schema during chrome cleanup. Existing snapshots need an explicit migration for a richer token model.
- Don't assume this file is imported by artifact generation. The brief currently reads its typed catalog, recipes, and guides. DESIGN.md import/export and native Mockup variable binding require separate host contracts.
