import React, { useEffect, useRef } from 'react';
import DOMPurify from 'dompurify';
import { useTypewriterEffect } from '../hooks/useTypewriterEffect';
import { markdownToHtmlUnsanitized } from '../utils/entryMarkdown';

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
        const isAllowedProtocol = parsed.protocol === 'https:' || parsed.protocol === 'http:';
        if (!isAllowedProtocol || !allowedHosts.includes(hostname)) {
          node.removeAttribute('src');
          if (typeof node.remove === 'function') {
            node.remove();
          } else if (node.parentNode) {
            node.parentNode.removeChild(node);
          }
        }
      } catch (_e) {
        node.removeAttribute('src');
        if (typeof node.remove === 'function') {
          node.remove();
        } else if (node.parentNode) {
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

  const rawHtml = markdownToHtmlUnsanitized(content);

  const sanitizedHtml = DOMPurify.sanitize(rawHtml, {
    ADD_TAGS: ['iframe', 'video', 'source', 'figure', 'figcaption'],
    ADD_ATTR: ['allow', 'allowfullscreen', 'frameborder', 'controls', 'decoding', 'loading', 'target', 'style', 'class']
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
