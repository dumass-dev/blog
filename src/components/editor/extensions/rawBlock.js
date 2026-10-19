import { Node } from '@tiptap/core';

export const RawBlock = Node.create({
  name: 'rawBlock',
  group: 'block',
  atom: true,

  addAttributes() {
    return {
      raw: { default: '' }
    };
  },

  parseHTML() {
    return [
      {
        tag: 'div.raw-markdown-block',
        getAttrs: (element) => ({
          raw: element.getAttribute('data-raw') || element.textContent || ''
        })
      }
    ];
  },

  renderHTML({ node }) {
    const raw = node.attrs.raw || '';
    return [
      'div',
      {
        class: 'raw-markdown-block my-4 p-3 rounded bg-[var(--code-bg)] border border-[var(--border-subtle)] font-mono text-xs overflow-x-auto text-[var(--text-secondary)]',
        'data-raw': raw,
        'data-node-type': 'rawBlock'
      },
      ['div', { class: 'text-[10px] font-sans uppercase tracking-wider text-[var(--accent-warm)] mb-1 select-none' }, 'Raw HTML / Embed Block'],
      ['pre', { class: 'whitespace-pre-wrap select-all' }, raw]
    ];
  },

  markdownTokenName: 'html',

  parseMarkdown(token, helpers) {
    return helpers.createNode('rawBlock', {
      raw: (token.raw || token.text || '').trim()
    });
  },

  renderMarkdown(node) {
    return node.attrs.raw || '';
  }
});
