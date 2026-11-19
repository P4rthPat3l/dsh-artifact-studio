/**
 * The lazy whiteboard chunk. It carries Excalidraw and the scene adapter, so
 * the main plugin bundle stays small until a whiteboard opens.
 */

import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { BoardEditor } from './editor.js';
import type { BoardEditorHandle, BoardEditorOptions } from './editor.js';

export type { BoardEditorHandle, BoardEditorOptions };
export type { BoardLive } from './editor.js';

/** What the chunk exports. */
export interface BoardChunk {
  mountBoardEditor: typeof mountBoardEditor;
}

/**
 * Mount one whiteboard editor in a container.
 * @param options the content, appearance, and callbacks.
 * @returns the imperative handle.
 */
export function mountBoardEditor(options: BoardEditorOptions): BoardEditorHandle {
  let inner: BoardEditorHandle | undefined;
  const root = createRoot(options.element);
  root.render(createElement(BoardEditor, {
    options,
    register: (handle: BoardEditorHandle) => {
      inner = handle;
    },
  }));
  return {
    getJson: () => (inner === undefined ? options.content : inner.getJson()),
    setContent: (json) => inner?.setContent(json),
    setEditable: (editable) => inner?.setEditable(editable),
    setAppearance: (dark) => inner?.setAppearance(dark),
    createImage: (format) => (inner === undefined ? Promise.resolve(null) : inner.createImage(format)),
    flush: () => inner?.flush(),
    destroy: () => {
      try {
        root.unmount();
      } catch {
        // React refuses a second unmount; closing a tab twice is harmless.
      }
    },
  };
}
