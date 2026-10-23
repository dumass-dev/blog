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

  const rawHtml = markdownToHtmlUnsanitized(content);

  const sanitizedHtml = DOMPurify.sanitize(rawHtml, {
    ADD_TAGS: ['iframe', 'video', 'source', 'figure', 'figcaption'],
    ADD_ATTR: ['allow', 'allowfullscreen', 'frameborder', 'controls', 'decoding', 'loading', 'target', 'style', 'class']
  });

  useTypewriterEffect(containerRef, sanitizedHtml, { maxDuration: 500 });

  // Tag entry images once they settle so the stylesheet can clear the
  // loading shimmer (see the prose img rules in index.css): .img-loaded on
  // success, .img-failed on error. Delegated on the container so it
  // survives the innerHTML render; the sweeps cover images that already
  // finished (from cache, or during the typewriter reveal) before the
  // listeners could see their events.
  useEffect(() => {
    const root = containerRef.current;
    if (!root) return undefined;
    const mark = (img) => {
      if (img.naturalWidth > 0) img.classList.add('img-loaded');
      else img.classList.add('img-failed');
    };
    const sweep = () => {
      root.querySelectorAll('img').forEach((img) => { if (img.complete) mark(img); });
    };
    const onLoad = (e) => { if (e.target && e.target.tagName === 'IMG') e.target.classList.add('img-loaded'); };
    const onError = (e) => { if (e.target && e.target.tagName === 'IMG') e.target.classList.add('img-failed'); };
    root.addEventListener('load', onLoad, true);
    root.addEventListener('error', onError, true);
    sweep();
    const settle = setTimeout(sweep, 700);
    return () => {
      root.removeEventListener('load', onLoad, true);
      root.removeEventListener('error', onError, true);
      clearTimeout(settle);
    };
  }, [sanitizedHtml]);

  if (!content) return null;

  return (
    <div
      ref={containerRef}
      className="prose-editorial"
      dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
    />
  );
}
