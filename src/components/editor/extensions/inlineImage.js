import { Node } from '@tiptap/core';

export const InlineImage = Node.create({
  name: 'inlineImage',
  inline: true,
  group: 'inline',
  atom: true,

  addAttributes() {
    return {
      src: { default: '' },
      alt: { default: '' }
    };
  },

  parseHTML() {
    return [
      {
        tag: 'img',
        getAttrs: (element) => ({
          src: element.getAttribute('src') || '',
          alt: element.getAttribute('alt') || ''
        })
      }
    ];
  },

  renderHTML({ node }) {
    const { src, alt } = node.attrs;
    return ['img', { src, alt: alt || '', class: 'inline-image inline align-middle', loading: 'lazy' }];
  },

  markdownTokenName: 'image',

  parseMarkdown(token, helpers) {
    return helpers.createNode('inlineImage', {
      src: token.href,
      alt: token.text || ''
    });
  },

  renderMarkdown(node) {
    const { src, alt } = node.attrs;
    return `![${alt || ''}](${src})`;
  }
});
