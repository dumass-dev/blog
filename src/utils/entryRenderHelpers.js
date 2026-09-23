/**
 * Helper utilities for entry title rendering & linking across views
 */

export function shouldRenderTitleInFeed(entry) {
  if (!entry) return false;
  return Boolean(entry.title && String(entry.title).trim() !== '');
}

export function shouldRenderDetailTitle(entry) {
  if (!entry) return false;
  return Boolean(entry.title && String(entry.title).trim() !== '');
}

export function getUpdateItemTitleLink(entry) {
  if (!entry) return '/updates';
  return `/entry/${entry.slug || entry.id}`;
}
