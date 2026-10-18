/**
 * Convert plain text (such as an entry title) into a URL-friendly slug.
 * Removes special punctuation, emojis, spaces, and normalizes consecutive hyphens.
 *
 * @param {string} text
 * @returns {string}
 */
export function slugify(text) {
  if (!text) return '';
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/[\s\W-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
