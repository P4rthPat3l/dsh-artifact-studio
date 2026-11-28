/**
 * The lazy sheet editor chunk. It carries the grid, the formula engine, and
 * the editor chrome, so the main plugin bundle stays small until a sheet opens.
 */

import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import type { DesignTokens } from '../../contract.js';
import type { Translator } from '../harness.js';
import { SheetEditor } from './editor.js';

/** Callbacks and labels the mounted editor reads at call time. */
export interface SheetLive {
  onChange(json: string): void;
  onSave(): void;
  onSelectionText(text: string): void;
  notify(text: string): void;
  t: Translator;
}

/** What the panel gives one mounted editor. */
export interface SheetEditorOptions {
  element: HTMLElement;
  content: string;
  editable: boolean;
  label: string;
  design?: DesignTokens;
  dark: boolean;
  live: { current: SheetLive };
}

/** The handle the tab keeps while a sheet is mounted. */
export interface SheetEditorHandle {
  getJson(): string;
  setContent(json: string): void;
  setEditable(editable: boolean): void;
  setAppearance(design: DesignTokens | undefined, dark: boolean): void;
  destroy(): void;
}

/**
 * Mount one sheet editor in a container.
 * @param options the content, appearance, and callbacks.
 * @returns the imperative handle.
 */
export function mountSheetEditor(options: SheetEditorOptions): SheetEditorHandle {
  let handle: SheetEditorHandle | undefined;
  const root = createRoot(options.element);
  root.render(createElement(SheetEditor, {
    options,
    register: (next: SheetEditorHandle) => {
      handle = next;
    },
  }));
  return {
    getJson: () => (handle === undefined ? options.content : handle.getJson()),
    setContent: (json) => handle?.setContent(json),
    setEditable: (editable) => handle?.setEditable(editable),
    setAppearance: (design, dark) => handle?.setAppearance(design, dark),
    destroy: () => {
      try {
        root.unmount();
      } catch {
        // React refuses a second unmount; closing a tab twice is harmless.
      }
    },
  };
}

/** What the chunk exports. */
export interface SheetChunk {
  mountSheetEditor: typeof mountSheetEditor;
}
