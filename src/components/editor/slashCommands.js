import { Extension } from '@tiptap/core';
import Suggestion from '@tiptap/suggestion';

export const slashCommandItems = [
  {
    title: 'Text',
    description: 'Start writing plain paragraph text',
    icon: 'Type',
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setParagraph().run();
    }
  },
  {
    title: 'Heading 1',
    description: 'Large top-level chapter heading',
    icon: 'Heading1',
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleHeading({ level: 1 }).run();
    }
  },
  {
    title: 'Heading 2',
    description: 'Medium section heading',
    icon: 'Heading2',
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleHeading({ level: 2 }).run();
    }
  },
  {
    title: 'Heading 3',
    description: 'Small subsection heading',
    icon: 'Heading3',
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleHeading({ level: 3 }).run();
    }
  },
  {
    title: 'Bullet List',
    description: 'Create an unordered bullet list',
    icon: 'List',
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleBulletList().run();
    }
  },
  {
    title: 'Numbered List',
    description: 'Create an ordered sequential list',
    icon: 'ListOrdered',
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleOrderedList().run();
    }
  },
  {
    title: 'Quote',
    description: 'Add a blockquote or reflection',
    icon: 'Quote',
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleBlockquote().run();
    }
  },
  {
    title: 'Code Block',
    description: 'Monospace fenced code block',
    icon: 'Code',
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleCodeBlock().run();
    }
  },
  {
    title: 'Add Photo / Media',
    description: 'Insert an image from media library or URL',
    icon: 'Image',
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).run();
      if (typeof window !== 'undefined' && typeof window.CustomEvent === 'function') {
        window.dispatchEvent(new window.CustomEvent('editor-open-media-picker'));
      }
    }
  },
  {
    title: 'Video Embed',
    description: 'Embed YouTube or MP4 video URL',
    icon: 'Video',
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).run();
      if (typeof window !== 'undefined' && typeof window.CustomEvent === 'function') {
        window.dispatchEvent(new window.CustomEvent('editor-open-video-dialog'));
      }
    }
  },
  {
    title: '2-Column Media Grid',
    description: 'Side-by-side images in a 2-column grid',
    icon: 'Columns',
    command: ({ editor, range }) => {
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .insertContent({
          type: 'mediaGrid',
          content: [{ type: 'paragraph' }]
        })
        .run();
    }
  },
  {
    title: 'Wrap Media Left',
    description: 'Float media to the left with wrapped text',
    icon: 'AlignLeft',
    command: ({ editor, range }) => {
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .insertContent({
          type: 'editorialWrap',
          attrs: { align: 'left', width: '45%' },
          content: [{ type: 'paragraph' }]
        })
        .run();
    }
  },
  {
    title: 'Wrap Media Right',
    description: 'Float media to the right with wrapped text',
    icon: 'AlignRight',
    command: ({ editor, range }) => {
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .insertContent({
          type: 'editorialWrap',
          attrs: { align: 'right', width: '45%' },
          content: [{ type: 'paragraph' }]
        })
        .run();
    }
  },
  {
    title: 'Clear Floating Wrap',
    description: 'End floating wraps and resume full-width text',
    icon: 'Minus',
    command: ({ editor, range }) => {
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .insertContent({ type: 'editorialClear' })
        .run();
    }
  },
  {
    title: 'Horizontal Divider',
    description: 'Insert a subtle thematic break line',
    icon: 'Minus',
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setHorizontalRule().run();
    }
  }
];

export const SlashCommands = Extension.create({
  name: 'slashCommands',

  addOptions() {
    return {
      suggestion: {
        char: '/',
        command: ({ editor, range, props }) => {
          props.command({ editor, range });
        },
        items: ({ query }) => {
          const q = (query || '').toLowerCase().trim();
          if (!q) return slashCommandItems;
          return slashCommandItems.filter(
            item =>
              item.title.toLowerCase().includes(q) ||
              item.description.toLowerCase().includes(q)
          );
        }
      }
    };
  },

  addProseMirrorPlugins() {
    return [
      Suggestion({
        editor: this.editor,
        ...this.options.suggestion
      })
    ];
  }
});
