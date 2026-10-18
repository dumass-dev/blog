import React, { useEffect, useRef } from 'react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { useTypewriterEffect } from '../hooks/useTypewriterEffect';
import { escapeNonStandardTags } from '../utils/markdown';

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
  const containerRef = useRef(null);

  useEffect(() => {
    // Clean listener hook cleanup
    return () => {};
  }, []);

  const processEmbeds = (rawText) => {
    let processed = rawText ? String(rawText).replace(/\\n/g, '\n') : '';

    // Convert standalone YouTube URLs into iframe embeds (supports watch, shorts, embed, youtu.be, mobile)
    const youtubeRegex = /(?:^|\n)\s*(?:https?:\/\/)?(?:(?:www|m)\.)?(?:youtube(?:-nocookie)?\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})(?:\S*)?/g;
    processed = processed.replace(youtubeRegex, (_match, videoId) => {
      return `\n<div class="video-responsive"><iframe src="https://www.youtube.com/embed/${videoId}" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe></div>\n`;
    });

    // Convert standalone mp4/webm video URLs into HTML5 video tags
    const videoFileRegex = /(?:^|\n)(https?:\/\/\S+\.(?:mp4|webm)|\/uploads\/\S+\.(?:mp4|webm))/gi;
    processed = processed.replace(videoFileRegex, (_match, videoUrl) => {
      // MEDIUM-1: Validate and escape the URL before inserting into HTML to prevent
      // attribute injection attacks in case DOMPurify is ever bypassed
      const isValidScheme = /^https?:\/\//i.test(videoUrl) || videoUrl.startsWith('/uploads/');
      if (!isValidScheme) return _match;
      const safeUrl = videoUrl.replace(/"/g, '%22').replace(/'/g, '%27').replace(/`/g, '%60');
      return `\n<div class="video-responsive"><video controls src="${safeUrl}"></video></div>\n`;
    });

    // Convert raw B2 storage keys in markdown images to /api/media/file/... permanent proxy URLs
    processed = processed.replace(/!\[(.*?)\]\(((?:images|videos|audio|files)\/(?:[a-zA-Z0-9_\-./% ]+)\.[a-zA-Z0-9]+)\)/gi, '![$1](/api/media/file/$2)');
    // Convert presigned Backblaze B2 URLs to clean permanent proxy URLs so they never expire
    processed = processed.replace(/!\[(.*?)\]\((https?:\/\/[^\s)]*backblazeb2\.com[^\s)]*(?:images|videos|audio|files)\/(?:[a-zA-Z0-9_\-./% ]+)\.[a-zA-Z0-9]+[^\s)]*)\)/gi, (_m, alt, fullUrl) => {
      const match = fullUrl.match(/(?:images|videos|audio|files)\/(?:[a-zA-Z0-9_\-./% ]+)\.[a-zA-Z0-9]+/i);
      return match ? `![${alt}](/api/media/file/${match[0]})` : _m;
    });

    // Convert images followed by "Caption: " into HTML figure blocks
    const captionRegex = /!\[(.*?)\]\((.*?)\)\nCaption:\s*(.+)/gi;
    processed = processed.replace(captionRegex, (match, alt, url, captionText) => {
      const safeUrl = url.replace(/"/g, '%22').replace(/'/g, '%27');
      const safeAlt = alt.replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      return `\n<figure class="media-figure"><img src="${safeUrl}" alt="${safeAlt}"><figcaption>${captionText}</figcaption></figure>\n`;
    });

    // Handle [grid] shortcode for side-by-side media layouts
    processed = processed.replace(/\[grid\]([\s\S]*?)\[\/grid\]/gi, (match, innerText) => {
      return `\n<div class="media-grid">\n\n${innerText}\n\n</div>\n`;
    });

    return processed;
  };

  const processedContent = escapeNonStandardTags(processEmbeds(content));
  const rawHtml = marked.parse(processedContent, {
    gfm: true,
    breaks: true
  });

  const sanitizedHtml = DOMPurify.sanitize(rawHtml, {
    ADD_TAGS: ['iframe', 'video', 'source', 'figure', 'figcaption'],
    ADD_ATTR: ['allow', 'allowfullscreen', 'frameborder', 'controls', 'decoding', 'loading', 'target']
  });

  useTypewriterEffect(containerRef, sanitizedHtml, { maxDuration: 500 });

  if (!content) return null;

  return (
    <div
      ref={containerRef}
      className="prose-editorial"
      dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
    />
  );
}
