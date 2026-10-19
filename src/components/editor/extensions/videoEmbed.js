import { Node } from '@tiptap/core';

export const VideoEmbed = Node.create({
  name: 'videoEmbed',
  group: 'block',
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      src: { default: '' },
      videoType: { default: 'youtube' }
    };
  },

  parseHTML() {
    return [
      {
        tag: 'div.video-responsive',
        getAttrs: (element) => {
          const iframe = element.querySelector('iframe');
          if (iframe) {
            return {
              src: iframe.getAttribute('src') || '',
              videoType: 'youtube'
            };
          }
          const video = element.querySelector('video');
          if (video) {
            return {
              src: video.getAttribute('src') || '',
              videoType: 'file'
            };
          }
          return false;
        }
      }
    ];
  },

  renderHTML({ node }) {
    const { src, videoType } = node.attrs;
    if (videoType === 'file' || /\.(?:mp4|webm)$/i.test(src)) {
      return [
        'div',
        { class: 'video-responsive my-6 rounded overflow-hidden', 'data-node-type': 'videoEmbed' },
        ['video', { controls: 'true', src, class: 'w-full rounded' }]
      ];
    }

    // YouTube embed url extraction
    let embedSrc = src;
    const ytMatch = src.match(/(?:youtube(?:-nocookie)?\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/i);
    if (ytMatch) {
      embedSrc = `https://www.youtube.com/embed/${ytMatch[1]}`;
    }

    return [
      'div',
      { class: 'video-responsive my-6 rounded overflow-hidden shadow-sm aspect-video', 'data-node-type': 'videoEmbed' },
      [
        'iframe',
        {
          src: embedSrc,
          title: 'Embedded video player',
          frameborder: '0',
          allow: 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share',
          allowfullscreen: 'true',
          class: 'w-full h-full'
        }
      ]
    ];
  },

  markdownTokenizer: {
    name: 'videoEmbed',
    level: 'block',
    start(src) {
      const idx1 = src.search(/(?:https?:\/\/)?(?:(?:www|m)\.)?(?:youtube|youtu\.be)/i);
      const idx2 = src.search(/(?:https?:\/\/|\/uploads\/)\S+\.(?:mp4|webm)/i);
      if (idx1 === -1) return idx2;
      if (idx2 === -1) return idx1;
      return Math.min(idx1, idx2);
    },
    tokenize(src) {
      // Must be at line start
      const ytMatch = src.match(/^(?:https?:\/\/)?(?:(?:www|m)\.)?(?:youtube(?:-nocookie)?\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})(?:\S*)?/i);
      if (ytMatch) {
        return {
          type: 'videoEmbed',
          raw: ytMatch[0],
          src: ytMatch[0].trim(),
          videoType: 'youtube'
        };
      }
      const vidMatch = src.match(/^(?:https?:\/\/\S+|\/uploads\/\S+)\.(?:mp4|webm)/i);
      if (vidMatch) {
        return {
          type: 'videoEmbed',
          raw: vidMatch[0],
          src: vidMatch[0].trim(),
          videoType: 'file'
        };
      }
    }
  },

  parseMarkdown(token, helpers) {
    return helpers.createNode('videoEmbed', {
      src: token.src,
      videoType: token.videoType || 'youtube'
    });
  },

  renderMarkdown(node) {
    return node.attrs.src;
  }
});
