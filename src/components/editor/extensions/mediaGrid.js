import { Node } from '@tiptap/core';

export const MediaGrid = Node.create({
  name: 'mediaGrid',
  group: 'block',
  content: 'block+',
  defining: true,

  parseHTML() {
    return [
      {
        tag: 'div.media-grid'
      }
    ];
  },

  renderHTML() {
    return ['div', { class: 'media-grid my-6 p-2 rounded border border-dashed border-[var(--border-subtle)]', 'data-node-type': 'mediaGrid' }, 0];
  },

  markdownTokenizer: {
    name: 'mediaGrid',
    level: 'block',
    start(src) {
      return src.indexOf('[grid]');
    },
    tokenize(src, _tokens, helpers) {
      const match = src.match(/^\[grid\]\r?\n([\s\S]*?)\r?\n\[\/grid\]/i);
      if (match) {
        return {
          type: 'mediaGrid',
          raw: match[0],
          tokens: helpers.blockTokens(match[1].trim())
        };
      }
    }
  },

  parseMarkdown(token, helpers) {
    return helpers.createNode('mediaGrid', {}, helpers.parseBlockChildren(token.tokens || []));
  },

  renderMarkdown(node, h) {
    if (!node.content || node.content.length === 0) {
      return '[grid]\n[/grid]';
    }
    const inner = node.content.map(child => h.renderChild(child)).join('\n\n');
    return `[grid]\n${inner}\n[/grid]`;
  }
});
