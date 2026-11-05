// After a new deploy, a tab that was opened before it still runs the old
// bundle and asks for page chunks (Editor, Dashboard…) by their old hashed
// names, which the new deploy no longer serves — the page crashed with
// "Failed to fetch dynamically imported module". Reloading picks up the
// new version. Guarded so a genuinely missing chunk (or offline) can never
// cause a reload loop: at most one automatic reload per 30 seconds.

const STALE_CHUNK_RE = /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|Unable to preload CSS|ChunkLoadError|Loading chunk [\w-]+ failed/i;
const KEY = 'stale_chunk_reload_at';
const WINDOW_MS = 30000;

export function isStaleChunkError(error) {
  const msg = typeof error === 'string' ? error : (error && (error.message || String(error))) || '';
  return STALE_CHUNK_RE.test(msg);
}

// Returns true when a reload was started (caller should stop handling).
export function reloadForNewVersion() {
  if (typeof window === 'undefined') return false;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return false;
  try {
    const last = Number(window.sessionStorage.getItem(KEY) || 0);
    if (Date.now() - last < WINDOW_MS) return false;
    window.sessionStorage.setItem(KEY, String(Date.now()));
  } catch {
    return false; // can't guard against loops without storage — don't auto-reload
  }
  window.location.reload();
  return true;
}
