import { useEffect } from 'react';
import { installEntryPrefetchIntents, prefetchEntry } from '../utils/prefetch.js';
import { noteListVersions } from '../supabase.js';

// Warms the first page of entries of a list page (10 = the feed page size;
// data only, once per entry per visit, skipped on data-saver — their content
// lands in the entry cache, so a tap paints instantly) and installs the
// global tap/hover intent prefetching for entry links.
export function useEntryPrefetch(entries, count = 10) {
  useEffect(() => { installEntryPrefetchIntents(); }, []);
  useEffect(() => {
    if (!entries || entries.length === 0) return undefined;
    // Learn versions from the list so prefetches use versioned URLs too.
    noteListVersions(entries);
    const slugs = entries.slice(0, count).map((e) => e.slug || e.id).filter(Boolean);
    // Let the page's own rendering and critical fetches go first.
    const timer = setTimeout(() => { slugs.forEach((s) => prefetchEntry(s)); }, 600);
    return () => clearTimeout(timer);
  }, [entries, count]);
}
