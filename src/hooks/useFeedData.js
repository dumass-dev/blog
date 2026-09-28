import { useState, useEffect, useCallback, useRef } from 'react';
import { fetchPublishedEntries, getCachedFeed } from '../supabase';

function filterEntries(list, { type, forHomeFeed }) {
  if (!Array.isArray(list)) return [];
  let filtered = list;
  if (forHomeFeed) filtered = filtered.filter(item => item.show_in_feed !== false);
  if (type === 'journal') {
    filtered = filtered.filter(item =>
      item.type !== 'photo' &&
      item.type !== 'update' &&
      item.type !== 'writing' &&
      item.type !== 'essay' &&
      (!item.category || (item.category.toLowerCase() !== 'photos' && item.category.toLowerCase() !== 'writing'))
    );
  } else if (type === 'update') {
    filtered = filtered.filter(item => item.type === 'update');
  } else if (type === 'writing') {
    filtered = filtered.filter(item =>
      item.type === 'writing' || item.type === 'essay' ||
      (item.category && item.category.toLowerCase() === 'writing')
    );
  } else if (type === 'photo') {
    filtered = filtered.filter(item =>
      item.type === 'photo' ||
      (item.category && item.category.toLowerCase() === 'photos')
    );
  }
  return filtered;
}

export function useFeedData({ type, category, tag, limit, forHomeFeed, pageSize = 10 } = {}) {
  const cacheKey = forHomeFeed ? 'home' : (type || 'all');

  const getInitialEntries = () => {
    const cached = getCachedFeed(cacheKey);
    return filterEntries(cached || [], { type, forHomeFeed });
  };

  const [entries, setEntries] = useState(getInitialEntries);

  // Only show the blocking skeleton when there is genuinely no data at all to display.
  // If cached data is available (even derived from a parent feed), render immediately
  // and refresh silently in the background — no skeleton flash on page navigation.
  const [loading, setLoading] = useState(() => {
    const cached = getInitialEntries();
    return cached.length === 0;
  });

  const [page, setPage] = useState(1);
  const isFetchingRef = useRef(false);

  const loadFeed = useCallback(async () => {
    // Prevent concurrent parallel fetches
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;
    try {
      const data = await fetchPublishedEntries({ type, category, tag, limit, forHomeFeed });
      const list = filterEntries(data, { type, forHomeFeed });
      setEntries(list);
    } catch (err) {
      console.error('Error fetching feed:', err);
    } finally {
      // Always clear the skeleton after the first fetch attempt — never leave it stuck
      setLoading(false);
      isFetchingRef.current = false;
    }
  }, [type, category, tag, limit, forHomeFeed]);

  // Initial load + silent background refetch on window focus or cache invalidation
  useEffect(() => {
    let isMounted = true;
    const executeLoad = async () => {
      if (isMounted) await loadFeed();
    };
    executeLoad();

    const handleFocus = () => { loadFeed(); };
    const handleInvalidate = () => { loadFeed(); };

    window.addEventListener('focus', handleFocus);
    window.addEventListener('feed-data-invalidated', handleInvalidate);
    return () => {
      isMounted = false;
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('feed-data-invalidated', handleInvalidate);
    };
  }, [loadFeed]);

  const displayedEntries = pageSize ? entries.slice(0, page * pageSize) : entries;
  const totalPages = pageSize ? Math.ceil(entries.length / pageSize) : 1;
  const hasMore = page < totalPages;

  const loadMore = () => {
    if (hasMore) setPage(prev => prev + 1);
  };

  return {
    entries,
    displayedEntries,
    loading,
    page,
    setPage,
    totalPages,
    hasMore,
    loadMore,
    refetch: loadFeed
  };
}

export default useFeedData;
