/* Shared site-settings store.
 *
 * Previously every context/component fetched /api/about on its own at mount
 * (theme, typewriter, view-count, header, footer, now-playing, activity —
 * 6+ identical requests per page load, each a serverless call + DB read).
 * This module fetches it ONCE per session and shares the result; every
 * caller awaits the same in-flight promise.
 *
 * Realtime is unaffected: settings changes still arrive through realtime.js
 * (SSE / Supabase / tab broadcast / sync-check poll) as window events, and
 * the contexts keep applying those payloads exactly as before. The store
 * additionally mirrors event payloads into the shared cache (and does a
 * single de-duped refetch when an event carries no usable payload), so the
 * cached copy can never drift from what the contexts applied.
 */

const SETTINGS_KEYS = [
  'author_name',
  'tagline',
  'bio',
  'projects',
  'links',
  'default_theme',
  'default_typewriter_enabled',
  'show_view_count',
  'show_music_widget',
  'show_on_home'
];

let cached = null;
let inflight = null;
const listeners = new Set();

function persist() {
  try {
    if (typeof window !== 'undefined' && window.localStorage && cached) {
      localStorage.setItem('cached_about_data', JSON.stringify(cached));
      if (cached.author_name && String(cached.author_name).trim()) {
        localStorage.setItem('site_author_name', String(cached.author_name).trim());
      }
    }
  } catch {}
}

function notify() {
  listeners.forEach((fn) => {
    try { fn(cached); } catch {}
  });
}

export function getSiteSettings() {
  return cached;
}

export function subscribeSiteSettings(fn) {
  if (typeof fn !== 'function') return () => {};
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/**
 * Fetch the shared settings. Concurrent callers share one request; once
 * loaded, the cached copy is returned without a new request. A failed
 * fetch is never cached, so a later caller retries. Pass { force: true }
 * to refetch (still de-duped against any in-flight request).
 */
export function fetchSiteSettings({ force = false } = {}) {
  if (!force && cached) return Promise.resolve(cached);
  if (inflight) return inflight;

  inflight = fetch('/api/about')
    .then((res) => {
      if (!res.ok) throw new Error(`settings fetch failed: ${res.status}`);
      return res.json();
    })
    .then((data) => {
      if (data && typeof data === 'object') {
        cached = data;
        persist();
        notify();
      }
      return cached;
    })
    .catch((err) => {
      inflight = null;
      throw err;
    })
    .finally(() => {
      inflight = null;
    });

  return inflight;
}

/** Merge a partial settings object (e.g. a realtime event payload). */
export function applySiteSettings(partial) {
  if (!partial || typeof partial !== 'object') return;
  const picked = {};
  let found = false;
  for (const key of SETTINGS_KEYS) {
    if (Object.prototype.hasOwnProperty.call(partial, key)) {
      picked[key] = partial[key];
      found = true;
    }
  }
  if (!found) return;
  cached = { ...(cached || {}), ...picked };
  persist();
  notify();
}

// Mirror realtime settings events into the shared cache. The events are
// dispatched by realtime.js; contexts keep their own listeners and apply
// the same payloads to their own state, exactly as before.
if (typeof window !== 'undefined') {
  const handleSettingsEvent = (e) => {
    const detail = e?.detail;
    const inner = detail?.data || detail?.payload || detail;
    const before = cached;
    applySiteSettings(inner);
    if (cached === before) {
      // Event carried no usable settings payload — converge with one
      // shared refetch instead of every component refetching on its own.
      fetchSiteSettings({ force: true }).catch(() => {});
    }
  };
  window.addEventListener('about-data-updated', handleSettingsEvent);
  window.addEventListener('site-settings-updated', handleSettingsEvent);
}
