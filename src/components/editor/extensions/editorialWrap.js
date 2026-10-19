import { Node } from '@tiptap/core';

export const EditorialWrap = Node.create({
  name: 'editorialWrap',
  group: 'block',
  content: 'block+',
  defining: true,

  addAttributes() {
    return {
      align: { default: 'left' },
      width: { default: '' }
    };
  },

  parseHTML() {
    return [
      {
        tag: 'div.editorial-wrap',
        getAttrs: (element) => {
          const classList = Array.from(element.classList);
          let align = 'left';
          for (const cls of classList) {
            if (cls.startsWith('editorial-wrap-')) {
              align = cls.replace('editorial-wrap-', '');
            }
          }
          const width = element.style.maxWidth || element.style.width || '';
          return { align, width };
        }
      }
    ];
  },

  renderHTML({ node }) {
    const { align, width } = node.attrs;
    const style = width ? `max-width: ${width}; width: 100%;` : undefined;
    return [
      'div',
      {
        class: `editorial-wrap editorial-wrap-${align || 'left'} my-4 p-2 rounded border border-dashed border-[var(--border-subtle)]`,
        style,
        'data-node-type': 'editorialWrap'
      },
      0
    ];
  },

  markdownTokenizer: {
    name: 'editorialWrap',
    level: 'block',
    start(src) {
      return src.search(/\[wrap:(?:left|right|center)/i);
    },
    tokenize(src, _tokens, helpers) {
      const match = src.match(/^\[wrap:(left|right|center)(?:\s+([\d]+(?:%|px|rem)))?\]\r?\n([\s\S]*?)\r?\n\[\/wrap\]/i);
      if (match) {
        return {
          type: 'editorialWrap',
          raw: match[0],
          align: match[1].toLowerCase(),
          width: match[2] || '',
          tokens: helpers.blockTokens(match[3].trim())
        };
      }
    }
  },

  parseMarkdown(token, helpers) {
    return helpers.createNode(
      'editorialWrap',
      { align: token.align, width: token.width || '' },
      helpers.parseBlockChildren(token.tokens || [])
    );
  },

  renderMarkdown(node, h) {
    const { align, width } = node.attrs;
    const header = `[wrap:${align || 'left'}${width ? ' ' + width : ''}]`;
    if (!node.content || node.content.length === 0) {
      return `${header}\n[/wrap]`;
    }
    const inner = node.content.map(child => h.renderChild(child)).join('\n\n');
    return `${header}\n${inner}\n[/wrap]`;
  }
});
