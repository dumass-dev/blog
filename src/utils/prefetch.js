import { safeApiFetch, cacheEntry, getCachedEntry, getEntryVersion, noteEntryVersion } from '../supabase.js';

// Quietly fetch entries (and, on clear intent, their images) before the
// reader taps, so opening an entry paints from cache instead of waiting
// on the network. Everything here is best-effort: failures are swallowed
// and the normal open-entry fetch still happens on tap.

const jsonDone = new Set();
const imagesDone = new Set();
let imageBudget = 6; // max entries per session whose images get pre-warmed

function getConnection() {
  try { return navigator.connection || null; } catch { return null; }
}

function entryImageUrls(content) {
  if (!content) return [];
  const urls = new Set();
  for (const m of content.matchAll(/!\[[^\]]*\]\(([^)\s]+)\)/g)) urls.add(m[1]);
  for (const m of content.matchAll(/<img[^>]+src="([^"]+)"/g)) urls.add(m[1]);
  return [...urls].slice(0, 8);
}

async function ensureEntry(slug) {
  const cached = getCachedEntry(slug);
  if (cached && cached.content) return cached;
  const v = getEntryVersion(slug) || (cached && cached.updated_at) || null;
  const data = await safeApiFetch(`/api/posts/${encodeURIComponent(slug)}${v ? `?v=${encodeURIComponent(v)}` : ''}`);
  if (data && data.entry) {
    cacheEntry(data.entry);
    if (data.entry.updated_at) noteEntryVersion(data.entry.slug || slug, data.entry.updated_at, data.entry.id);
    return data.entry;
  }
  return null;
}

export async function prefetchEntry(slug, { images = false } = {}) {
  if (!slug || typeof window === 'undefined') return;
  const conn = getConnection();
  if (conn && conn.saveData) return; // respect data-saver
  try {
    let entry = null;
    if (!jsonDone.has(slug)) {
      jsonDone.add(slug);
      entry = await ensureEntry(slug);
      if (!entry) jsonDone.delete(slug); // allow a later retry
    }
    if (images && !imagesDone.has(slug) && imageBudget > 0) {
      if (conn && /^(slow-)?2g$/.test(conn.effectiveType || '')) return;
      if (!entry) entry = getCachedEntry(slug);
      const urls = entryImageUrls(entry && entry.content);
      if (urls.length > 0) {
        imagesDone.add(slug);
        imageBudget -= 1;
        urls.forEach((u) => { const img = new Image(); img.src = u; });
      }
    }
  } catch { /* prefetch is best-effort */ }
}

let intentsInstalled = false;
export function installEntryPrefetchIntents() {
  if (intentsInstalled || typeof window === 'undefined') return;
  intentsInstalled = true;
  const fromEvent = (e) => {
    const target = e.target;
    const a = target && target.closest ? target.closest('a[href^="/entry/"]') : null;
    if (!a) return;
    const slug = decodeURIComponent(a.getAttribute('href').slice('/entry/'.length));
    if (slug) prefetchEntry(slug, { images: true });
  };
  document.addEventListener('touchstart', fromEvent, { passive: true });
  document.addEventListener('pointerover', fromEvent, { passive: true });
  document.addEventListener('focusin', fromEvent);
}
