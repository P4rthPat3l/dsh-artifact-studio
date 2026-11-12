import { Editor } from '@tiptap/core';
import { TaskItem, TaskList } from '@tiptap/extension-list';
import { TableKit } from '@tiptap/extension-table';
import { Markdown } from '@tiptap/markdown';
import StarterKit from '@tiptap/starter-kit';

/** The handle the tab keeps to one mounted document editor. */
export interface DocEditorHandle {
  getMarkdown(): string;
  setMarkdown(markdown: string): void;
  setEditable(editable: boolean): void;
  destroy(): void;
}

/** Options for one editor. */
export interface DocEditorOptions {
  element: HTMLElement;
  markdown: string;
  editable: boolean;
  label: string;
  onChange: (markdown: string) => void;
}

/**
 * Mount a Markdown editor. Markdown is the only stored form; the editor parses
 * it on load and serialises it on every change.
 * @param options the mount options.
 * @returns the handle.
 */
export function mountDocEditor(options: DocEditorOptions): DocEditorHandle {
  let applying = false;
  const editor = new Editor({
    element: options.element,
    extensions: [
      StarterKit.configure({ link: { openOnClick: false, autolink: true } }),
      TaskList,
      TaskItem.configure({ nested: true }),
      TableKit.configure({ table: { resizable: false } }),
      Markdown,
    ],
    content: options.markdown,
    contentType: 'markdown',
    editable: options.editable,
    editorProps: {
      attributes: { class: 'art-prose', 'aria-label': options.label, role: 'textbox', 'aria-multiline': 'true' },
    },
    onUpdate: ({ editor: current }) => {
      if (!applying) options.onChange(current.getMarkdown());
    },
  });
  return {
    getMarkdown: () => editor.getMarkdown(),
    setMarkdown(markdown) {
      applying = true;
      try {
        editor.commands.setContent(markdown, { contentType: 'markdown', emitUpdate: false });
      } finally {
        applying = false;
      }
    },
    setEditable: (editable) => editor.setEditable(editable, false),
    destroy: () => editor.destroy(),
  };
}

/** What the chunk exports. */
export interface DocChunk {
  mountDocEditor: typeof mountDocEditor;
}
