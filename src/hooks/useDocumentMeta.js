import { useEffect } from 'react';

/**
 * Lightweight hook to dynamically set document title, description, and OpenGraph meta tags
 */
export function useDocumentMeta({ title, description, image, type = 'website' } = {}) {
  useEffect(() => {
    const authorName = (() => {
      try {
        const stored = localStorage.getItem('site_author_name');
        if (stored && stored.trim()) return stored.trim();
        const cached = localStorage.getItem('cached_about_data');
        if (cached) {
          const parsed = JSON.parse(cached);
          if (parsed?.author_name && parsed.author_name.trim()) return parsed.author_name.trim();
        }
      } catch {}
      return 'q04ti';
    })();
    const defaultSiteTitle = `${authorName} — Personal Blog & Digital Journal`;
    const defaultDesc = 'A minimalist digital journal, writing, photography stream, and personal reflections.';

    // 1. Set document title
    const fullTitle = title ? `${title} — ${authorName}` : defaultSiteTitle;
    document.title = fullTitle;

    // Helper to update or create meta tag
    const setMetaTag = (selector, nameOrProp, attrName, value) => {
      if (!value) return;
      let tag = document.querySelector(selector);
      if (!tag) {
        tag = document.createElement('meta');
        tag.setAttribute(attrName, nameOrProp);
        document.head.appendChild(tag);
      }
      tag.setAttribute('content', value);
    };

    const finalDesc = description || defaultDesc;
    setMetaTag('meta[name="description"]', 'description', 'name', finalDesc);
    setMetaTag('meta[property="og:title"]', 'og:title', 'property', fullTitle);
    setMetaTag('meta[property="og:description"]', 'og:description', 'property', finalDesc);
    setMetaTag('meta[property="og:type"]', 'og:type', 'property', type);
    if (image) {
      setMetaTag('meta[property="og:image"]', 'og:image', 'property', image);
    }
  }, [title, description, image, type]);
}

export default useDocumentMeta;
