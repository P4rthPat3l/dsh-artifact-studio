import { Editor } from '@tiptap/core';
import { TaskItem, TaskList } from '@tiptap/extension-list';
import { TableKit } from '@tiptap/extension-table';
import { Markdown } from '@tiptap/markdown';
import StarterKit from '@tiptap/starter-kit';

export type DocFormat = 'heading' | 'bold' | 'italic' | 'bulletList' | 'orderedList' | 'codeBlock';

/** The handle the tab keeps to one mounted document editor. */
export interface DocEditorHandle {
  getMarkdown(): string;
  setMarkdown(markdown: string): void;
  setEditable(editable: boolean): void;
  format(command: DocFormat): void;
  destroy(): void;
}

/** Options for one editor. */
export interface DocEditorOptions {
  element: HTMLElement;
  markdown: string;
  editable: boolean;
  label: string;
  onChange: (markdown: string) => void;
  onSelectionChange?: (active: readonly DocFormat[]) => void;
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
    onTransaction: ({ editor: current }) => {
      const formats: DocFormat[] = ['heading', 'bold', 'italic', 'bulletList', 'orderedList', 'codeBlock'];
      options.onSelectionChange?.(formats.filter(command => command === 'heading'
        ? current.isActive('heading', { level: 2 }) : current.isActive(command)));
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
    format(command) {
      if (!editor.isEditable) return;
      const chain = editor.chain().focus();
      switch (command) {
        case 'heading': chain.toggleHeading({ level: 2 }).run(); break;
        case 'bold': chain.toggleBold().run(); break;
        case 'italic': chain.toggleItalic().run(); break;
        case 'bulletList': chain.toggleBulletList().run(); break;
        case 'orderedList': chain.toggleOrderedList().run(); break;
        case 'codeBlock': chain.toggleCodeBlock().run(); break;
        default: { const unreachable: never = command; throw new Error(String(unreachable)); }
      }
    },
    destroy: () => editor.destroy(),
  };
}

/** What the chunk exports. */
export interface DocChunk {
  mountDocEditor: typeof mountDocEditor;
}
