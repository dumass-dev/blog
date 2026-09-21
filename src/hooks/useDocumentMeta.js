import { useEffect } from 'react';

/**
 * Lightweight hook to dynamically set document title, description, and OpenGraph meta tags
 */
export function useDocumentMeta({ title, description, image, type = 'website' } = {}) {
  useEffect(() => {
    const defaultSiteTitle = 'q04ti — Personal Blog & Digital Journal';
    const defaultDesc = 'A minimalist digital journal, writing, photography stream, and personal reflections.';

    // 1. Set document title
    const fullTitle = title ? `${title} — q04ti` : defaultSiteTitle;
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
