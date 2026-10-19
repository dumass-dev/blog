import { Node } from '@tiptap/core';

export const MediaImage = Node.create({
  name: 'mediaImage',
  group: 'block',
  atom: true,
  draggable: false,

  addAttributes() {
    return {
      src: { default: '' },
      alt: { default: '' },
      size: { default: '' },
      align: { default: '' },
      caption: { default: '' }
    };
  },

  parseHTML() {
    return [
      {
        tag: 'figure.media-figure',
        getAttrs: (element) => {
          const img = element.querySelector('img');
          const figcaption = element.querySelector('figcaption');
          const classList = Array.from(element.classList);
          let size = '';
          let align = '';
          for (const cls of classList) {
            if (cls.startsWith('image-size-')) size = cls.replace('image-size-', '');
            if (cls.startsWith('image-align-')) align = cls.replace('image-align-', '');
          }
          return {
            src: img?.getAttribute('src') || '',
            alt: img?.getAttribute('alt') || '',
            size,
            align,
            caption: figcaption?.textContent || ''
          };
        }
      },
      {
        tag: 'div.media-image-block',
        getAttrs: (element) => {
          const img = element.querySelector('img');
          const classList = Array.from(element.classList);
          let size = '';
          let align = '';
          for (const cls of classList) {
            if (cls.startsWith('image-size-')) size = cls.replace('image-size-', '');
            if (cls.startsWith('image-align-')) align = cls.replace('image-align-', '');
          }
          return {
            src: img?.getAttribute('src') || '',
            alt: img?.getAttribute('alt') || '',
            size,
            align,
            caption: ''
          };
        }
      },
      {
        tag: 'img',
        getAttrs: (element) => {
          const classList = Array.from(element.classList);
          let size = '';
          let align = '';
          for (const cls of classList) {
            if (cls.startsWith('image-size-')) size = cls.replace('image-size-', '');
            if (cls.startsWith('image-align-')) align = cls.replace('image-align-', '');
          }
          return {
            src: element.getAttribute('src') || '',
            alt: element.getAttribute('alt') || '',
            size,
            align,
            caption: ''
          };
        }
      }
    ];
  },

  renderHTML({ node }) {
    const { src, alt, size, align, caption } = node.attrs;
    const sizeClass = size ? `image-size-${size}` : '';
    const alignClass = align ? `image-align-${align}` : '';

    if (caption) {
      const classes = ['media-figure', sizeClass, alignClass].filter(Boolean).join(' ');
      return [
        'figure',
        { class: classes, 'data-node-type': 'mediaImage' },
        ['img', { src, alt: alt || '', loading: 'lazy' }],
        ['figcaption', { class: 'text-center text-xs text-[var(--text-muted)] mt-1.5 italic font-sans' }, caption]
      ];
    }

    const classes = ['media-image-block', sizeClass, alignClass].filter(Boolean).join(' ');
    return [
      'div',
      { class: classes, 'data-node-type': 'mediaImage' },
      ['img', { src, alt: alt || '', class: [sizeClass, alignClass].filter(Boolean).join(' ') || undefined, loading: 'lazy' }]
    ];
  },

  markdownTokenizer: {
    name: 'mediaImage',
    level: 'block',
    start(src) {
      const match = src.match(/(?:\\)?!\[/);
      return match ? match.index : -1;
    },
    tokenize(src) {
      // Must be at the start of block (or trimmed start)
      const match = src.match(/^(?:\\)?!\[(.*?)\]\((.*?)\)(?:\s*\r?\n\s*[Cc]aption:\s*([^\r\n]+))?/i);
      if (match) {
        return {
          type: 'mediaImage',
          raw: match[0],
          rawAlt: match[1],
          src: match[2],
          caption: match[3] ? match[3].trim() : ''
        };
      }
    }
  },

  parseMarkdown(token, helpers) {
    const rawAlt = token.rawAlt || '';
    let alt = rawAlt;
    let size = '';
    let align = '';

    if (rawAlt.includes('|')) {
      const parts = rawAlt.split('|');
      alt = parts[0].trim();
      for (let i = 1; i < parts.length; i++) {
        let mod = parts[i].trim().toLowerCase();
        mod = mod.replace(/^(?:w|width|size)\s*[:=]\s*/i, '');
        if (['small', 'sm', 's'].includes(mod)) size = 'small';
        else if (['medium', 'md', 'm'].includes(mod)) size = 'medium';
        else if (['large', 'lg', 'l'].includes(mod)) size = 'large';
        else if (['full', 'xl'].includes(mod)) size = 'full';
        else if (/^\d{1,3}%$/.test(mod) || /^\d+(?:px|rem|vw|vh)$/.test(mod)) size = mod;
        else if (['left', 'wrap-left', 'wrap:left', 'float-left'].includes(mod)) align = 'left';
        else if (['right', 'wrap-right', 'wrap:right', 'float-right'].includes(mod)) align = 'right';
        else if (['center', 'middle'].includes(mod)) align = 'center';
      }
    } else {
      let lower = rawAlt.trim().toLowerCase();
      lower = lower.replace(/^(?:w|width|size)\s*[:=]\s*/i, '');
      if (['small', 'sm', 's'].includes(lower)) { size = 'small'; alt = ''; }
      else if (['medium', 'md', 'm'].includes(lower)) { size = 'medium'; alt = ''; }
      else if (['large', 'lg', 'l'].includes(lower)) { size = 'large'; alt = ''; }
      else if (['full', 'xl'].includes(lower)) { size = 'full'; alt = ''; }
      else if (/^\d{1,3}%$/.test(lower) || /^\d+(?:px|rem|vw|vh)$/.test(lower)) { size = lower; alt = ''; }
      else if (['left', 'wrap-left', 'wrap:left', 'float-left'].includes(lower)) { align = 'left'; alt = ''; }
      else if (['right', 'wrap-right', 'wrap:right', 'float-right'].includes(lower)) { align = 'right'; alt = ''; }
      else if (['center', 'middle'].includes(lower)) { align = 'center'; alt = ''; }
    }

    return helpers.createNode('mediaImage', {
      src: token.src,
      alt,
      size,
      align,
      caption: token.caption || ''
    });
  },

  renderMarkdown(node) {
    const { src, alt, size, align, caption } = node.attrs;
    const mods = [size, align].filter(Boolean);
    const altPart = [alt, ...mods].filter(Boolean).join('|');
    let md = `![${altPart}](${src})`;
    if (caption) {
      md += `\nCaption: ${caption}`;
    }
    return md;
  }
});
