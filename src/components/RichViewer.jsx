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

// Remembered natural sizes of entry images, keyed by URL path (the signed
// query string changes on every load; the path identifies the image).
// Stored content carries no dimensions, so the first-ever load of an image
// falls back to the stylesheet's generic placeholder ratio — but once an
// image has loaded anywhere on this browser, its real shape is remembered
// and the placeholder reserves exactly that shape on every later visit:
// no wrong-shaped box, no layout jump when the image arrives.
const IMG_DIMS_KEY = 'img_dims_v1';
let imgDimsCache = null;

function loadImgDims() {
  if (imgDimsCache) return imgDimsCache;
  try {
    const parsed = JSON.parse(localStorage.getItem(IMG_DIMS_KEY) || '{}');
    imgDimsCache = (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) ? parsed : {};
  } catch {
    imgDimsCache = {};
  }
  return imgDimsCache;
}

function imgDimsKey(src) {
  try {
    return new URL(src, window.location.href).pathname;
  } catch {
    return src;
  }
}

function rememberImgDims(img) {
  if (!img.naturalWidth || !img.naturalHeight) return;
  const dims = loadImgDims();
  const key = imgDimsKey(img.currentSrc || img.src);
  const prev = dims[key];
  if (prev && prev[0] === img.naturalWidth && prev[1] === img.naturalHeight) return;
  dims[key] = [img.naturalWidth, img.naturalHeight];
  const keys = Object.keys(dims);
  if (keys.length > 300) keys.slice(0, keys.length - 300).forEach(k => { delete dims[k]; });
  try {
    localStorage.setItem(IMG_DIMS_KEY, JSON.stringify(dims));
  } catch {}
}

function applyKnownImgDims(root) {
  const dims = loadImgDims();
  root.querySelectorAll('img').forEach((img) => {
    if (img.style.aspectRatio) return;
    const d = dims[imgDimsKey(img.currentSrc || img.src)];
    if (d) img.style.aspectRatio = `${d[0]} / ${d[1]}`;
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
      if (img.naturalWidth > 0) {
        img.classList.add('img-loaded');
        rememberImgDims(img);
      } else {
        img.classList.add('img-failed');
      }
    };
    const sweep = () => {
      applyKnownImgDims(root);
      root.querySelectorAll('img').forEach((img) => { if (img.complete) mark(img); });
    };
    const onLoad = (e) => {
      if (e.target && e.target.tagName === 'IMG') {
        e.target.classList.add('img-loaded');
        rememberImgDims(e.target);
      }
    };
    const onError = (e) => { if (e.target && e.target.tagName === 'IMG') e.target.classList.add('img-failed'); };
    root.addEventListener('load', onLoad, true);
    root.addEventListener('error', onError, true);
    // The typewriter reveal can rebuild parts of the DOM after mount;
    // re-apply remembered shapes to any image element that appears.
    const observer = new MutationObserver(sweep);
    observer.observe(root, { childList: true, subtree: true });
    sweep();
    const settle = setTimeout(sweep, 700);
    return () => {
      root.removeEventListener('load', onLoad, true);
      root.removeEventListener('error', onError, true);
      observer.disconnect();
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
