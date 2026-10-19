import { Node } from '@tiptap/core';

export const EditorialClear = Node.create({
  name: 'editorialClear',
  group: 'block',
  atom: true,

  parseHTML() {
    return [
      {
        tag: 'div.editorial-clear'
      }
    ];
  },

  renderHTML() {
    return [
      'div',
      {
        class: 'editorial-clear my-2 py-1 text-center text-[10px] uppercase tracking-wider text-[var(--text-muted)] border-y border-dashed border-[var(--border-subtle)] select-none',
        'data-node-type': 'editorialClear',
        'aria-label': 'End wrap float'
      },
      '— clear wrap float —'
    ];
  },

  markdownTokenizer: {
    name: 'editorialClear',
    level: 'block',
    start(src) {
      return src.search(/\[(?:clear|break)\]/i);
    },
    tokenize(src) {
      const match = src.match(/^\[(?:clear|break)\]/i);
      if (match) {
        return {
          type: 'editorialClear',
          raw: match[0],
          text: match[0]
        };
      }
    }
  },

  parseMarkdown(_token, helpers) {
    return helpers.createNode('editorialClear');
  },

  renderMarkdown() {
    return '[clear]';
  }
});
