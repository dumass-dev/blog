import React, { useEffect, useRef } from 'react';
import DOMPurify from 'dompurify';
import { useTypewriterEffect } from '../hooks/useTypewriterEffect';
import { markdownToHtmlUnsanitized } from '../utils/entryMarkdown';
import { handleImageError } from '../utils/image';

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

// First-ever view of an image: ask the server for its size (read from the
// file's first bytes, CDN-cached) so the placeholder has the real shape
// instead of the generic 16:9 guess. One request per image, shared.
const dimsRequests = new Map();
function fetchImgDims(key) {
  const m = /^\/api\/media\/file\/(images\/.+)$/.exec(key);
  if (!m) return null;
  if (!dimsRequests.has(key)) {
    dimsRequests.set(key, fetch(`/api/media/dims/${m[1]}`)
      .then(r => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d || !(d.width > 0) || !(d.height > 0)) return null;
        const dims = loadImgDims();
        dims[key] = [d.width, d.height];
        try { localStorage.setItem(IMG_DIMS_KEY, JSON.stringify(dims)); } catch {}
        return dims[key];
      })
      .catch(() => null));
  }
  return dimsRequests.get(key);
}

function applyKnownImgDims(root) {
  const dims = loadImgDims();
  root.querySelectorAll('img').forEach((img) => {
    if (img.style.aspectRatio) return;
    const key = imgDimsKey(img.getAttribute('src') || img.currentSrc || img.src);
    const d = dims[key];
    if (d) {
      img.style.aspectRatio = `${d[0]} / ${d[1]}`;
      return;
    }
    if (img.classList.contains('img-loaded') || (img.complete && img.naturalWidth > 0)) return;
    const pending = fetchImgDims(key);
    if (pending) {
      pending.then((got) => {
        // Only while still loading: a loaded image already shows its own shape.
        if (got && img.isConnected && !img.style.aspectRatio && !img.classList.contains('img-loaded')) {
          img.style.aspectRatio = `${got[0]} / ${got[1]}`;
        }
      });
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

    // A permanently failed image keeps its reserved box and shows the same
    // fallback ProgressiveImage uses (ImageOff icon + "Image unavailable"),
    // instead of an empty grey box. The <img> is replaced by a
    // .image-wrapper div carrying the img's size/align classes (the
    // stylesheet sizes .image-wrapper exactly like the img) plus its inline
    // style and computed margins, so the box stays exactly where the image
    // was. Terminal: only called once every retry below is exhausted.
    const showImageFallback = (img) => {
      if (!img.isConnected || img.dataset.fallbackShown === '1') return;
      img.dataset.fallbackShown = '1';
      const box = document.createElement('div');
      const sizeAlign = Array.from(img.classList).filter((c) => c.startsWith('image-size-') || c.startsWith('image-align-'));
      box.className = ['image-wrapper', 'img-failed-fallback', ...sizeAlign].join(' ');
      box.setAttribute('role', 'img');
      box.setAttribute('aria-label', 'Image unavailable');
      // Keep the img's exact box: inline style (remembered aspect-ratio,
      // custom width) + computed margins (float gaps, flush first photo).
      box.style.cssText = img.style.cssText;
      const computed = window.getComputedStyle(img);
      box.style.marginTop = computed.marginTop;
      box.style.marginBottom = computed.marginBottom;
      box.style.marginLeft = computed.marginLeft;
      box.style.marginRight = computed.marginRight;
      box.style.aspectRatio = img.style.aspectRatio || '16 / 9';
      box.style.minHeight = '64px';
      box.style.setProperty('display', 'flex', 'important');
      box.style.flexDirection = 'column';
      box.style.alignItems = 'center';
      box.style.justifyContent = 'center';
      box.style.gap = '6px';
      box.style.borderRadius = '4px';
      box.style.backgroundColor = 'var(--code-bg)';
      box.style.color = 'var(--text-muted)';
      box.style.fontFamily = 'var(--font-sans)';
      box.style.fontSize = '11px';
      box.style.textAlign = 'center';
      box.style.padding = '8px';
      // Lucide image-off icon, same as ProgressiveImage's error state.
      box.innerHTML =
        '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="opacity:0.6"><line x1="2" x2="22" y1="2" y2="22"/><path d="M10.41 10.41a2 2 0 1 1-2.83-2.83"/><line x1="13.5" x2="6" y1="13.5" y2="21"/><line x1="18" x2="21" y1="12" y2="15"/><path d="M3.59 3.59A1.99 1.99 0 0 0 3 5v14a2 2 0 0 0 2 2h14c.55 0 1.052-.22 1.41-.59"/><path d="M21 15V5a2 2 0 0 0-2-2H9"/></svg><span>Image unavailable</span>';
      img.replaceWith(box);
    };

    // A failed image gets ONE second chance before the fallback box:
    //  - /api/media/file/ URLs: once-only ?retry=1 (forces a fresh redirect
    //    + fresh signature; the browser may have cached the redirect past
    //    its signed URL's lifetime).
    //  - Direct B2 presigned URLs (raw-HTML <img> in content — markdown
    //    images are rewritten to /api/media/file/ first): one refresh via
    //    /api/b2/refresh through handleImageError.
    // Returns true while a retry/refresh is pending (its outcome settles
    // the image); false when every chance is used up and the image should
    // fail. The two paths never combine, and both are guarded (dataset
    // flags) so a second failure goes straight to the fallback with no
    // loop and no double retry.
    const trySecondChance = (img) => {
      if (img.dataset.refreshPending === '1') return true;
      const src = img.getAttribute('src') || '';
      if (!src) return false;
      if (!img.dataset.mediaRetried && src.includes('/api/media/file/')) {
        img.dataset.mediaRetried = '1';
        img.src = src + (src.includes('?') ? '&' : '?') + 'retry=1';
        return true;
      }
      if (img.dataset.hasRefreshed !== 'true' && (src.includes('backblazeb2.com') || src.includes('X-Amz-'))) {
        img.dataset.refreshPending = '1';
        const before = img.src;
        const settle = () => {
          if (img.dataset.refreshPending !== '1') return;
          delete img.dataset.refreshPending;
          if (img.isConnected && img.src === before) showImageFallback(img);
        };
        // Bound the wait: if the refresh hangs, fail the image instead of
        // leaving the shimmer box up forever. A late refresh that lands
        // after the fallback only retargets the detached <img>.
        const timeout = setTimeout(settle, 8000);
        handleImageError({ target: img }, src)
          .then(() => { clearTimeout(timeout); settle(); })
          .catch(() => { clearTimeout(timeout); settle(); });
        return true;
      }
      return false;
    };
    const mark = (img) => {
      if (img.naturalWidth > 0) {
        img.classList.add('img-loaded');
        rememberImgDims(img);
      } else if (!trySecondChance(img)) {
        showImageFallback(img);
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
    const onError = (e) => {
      const img = e.target;
      if (img && img.tagName === 'IMG' && !trySecondChance(img)) showImageFallback(img);
    };
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
