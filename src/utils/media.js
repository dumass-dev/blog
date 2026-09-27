/**
 * Resolve a media URL or raw B2 storage key to a browser-loadable URL.
 * Converts raw storage keys ('images/2026/09/...') and Backblaze B2 URLs
 * to permanent proxy endpoints ('/api/media/file/...').
 */
export function resolveMediaUrl(url) {
  if (!url || typeof url !== 'string') return '';
  const trimmed = url.trim();
  if (!trimmed || /q04ti-quote|quote-/i.test(trimmed)) return '';

  // 1. Raw B2 storage key (e.g. "images/2026/09/abc.jpg")
  if (/^(?:images|videos|audio|files)\//i.test(trimmed) && !trimmed.startsWith('/')) {
    return `/api/media/file/${trimmed}`;
  }

  // 2. Backblaze B2 URL (extract key and route through proxy so it never expires)
  if (trimmed.includes('backblazeb2.com') || (trimmed.includes('X-Amz-') && /^(?:images|videos|audio|files)\//i.test(trimmed))) {
    const match = trimmed.match(/(?:images|videos|audio|files)\/(?:[a-zA-Z0-9_\-./% ]+)\.[a-zA-Z0-9]+/i);
    if (match) {
      return `/api/media/file/${match[0]}`;
    }
  }

  return trimmed;
}
