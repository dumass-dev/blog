import React, { useEffect } from 'react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';

// Configure DOMPurify hooks once for iframe host allowlist enforcement
if (typeof window !== 'undefined') {
  DOMPurify.removeHook('uponSanitizeElement');
  DOMPurify.addHook('uponSanitizeElement', (node, data) => {
    if (data.tagName === 'iframe') {
      const src = node.getAttribute('src') || '';
      try {
        const parsed = new URL(src, window.location.origin);
        const hostname = parsed.hostname.toLowerCase();
        const allowedHosts = ['www.youtube.com', 'youtube.com', 'www.youtube-nocookie.com', 'youtube-nocookie.com', 'player.vimeo.com', 'vimeo.com'];
        if (!allowedHosts.includes(hostname)) {
          if (node.parentNode) {
            node.parentNode.removeChild(node);
          }
        }
      } catch (_e) {
        if (node.parentNode) {
          node.parentNode.removeChild(node);
        }
      }
    }
  });
}

export default function RichViewer({ content = '' }) {
  useEffect(() => {
    // Clean listener hook cleanup
    return () => {};
  }, []);

  if (!content) return null;

  // Custom processing for video embeds (YouTube / MP4) before rendering HTML
  const processEmbeds = (rawText) => {
    let processed = rawText ? String(rawText).replace(/\\n/g, '\n') : '';

    // Convert standalone YouTube URLs into iframe embeds
    const youtubeRegex = /(?:^|\n)(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})(?:\S*)?/g;
    processed = processed.replace(youtubeRegex, (_match, videoId) => {
      return `\n<div class="video-responsive"><iframe src="https://www.youtube.com/embed/${videoId}" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe></div>\n`;
    });

    // Convert standalone mp4/webm video URLs into HTML5 video tags
    const videoFileRegex = /(?:^|\n)(https?:\/\/\S+\.(?:mp4|webm)|^\/uploads\/\S+\.(?:mp4|webm))/gi;
    processed = processed.replace(videoFileRegex, (_match, videoUrl) => {
      return `\n<div class="video-responsive"><video controls src="${videoUrl}"></video></div>\n`;
    });

    return processed;
  };

  const processedContent = processEmbeds(content);
  const rawHtml = marked.parse(processedContent, {
    gfm: true,
    breaks: true
  });

  const sanitizedHtml = DOMPurify.sanitize(rawHtml, {
    ADD_TAGS: ['iframe', 'video', 'source'],
    ADD_ATTR: ['allow', 'allowfullscreen', 'frameborder', 'controls', 'decoding', 'loading', 'target']
  });

  return (
    <div
      className="prose-editorial"
      dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
    />
  );
}
