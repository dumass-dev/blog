import { useState, useEffect, useCallback, useRef } from 'react';
import { fetchPublishedEntries, getCachedFeed, getLastFeedFetchFailed, isFeedCacheStale } from '../supabase';

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
  const [error, setError] = useState(false);
  // True while a saved copy is on screen because the live refresh failed
  // (or because the saved copy itself is older than the feed TTL and no
  // refresh has succeeded yet). Cleared by any successful refresh.
  const [stale, setStale] = useState(() => {
    const cached = getInitialEntries();
    return cached.length > 0 && isFeedCacheStale(cacheKey);
  });
  const [refreshing, setRefreshing] = useState(false);
  const isFetchingRef = useRef(false);

  const loadFeed = useCallback(async () => {
    // Prevent concurrent parallel fetches
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;
    setRefreshing(true);
    try {
      const data = await fetchPublishedEntries({ type, category, tag, limit, forHomeFeed });
      const list = filterEntries(data, { type, forHomeFeed });
      setEntries(list);
      // fetchPublishedEntries never throws: it falls back to Supabase, then
      // to the saved cache. The failure flag tells a failed refresh (show
      // an error / a "saved copy" notice) from a genuinely empty blog.
      if (getLastFeedFetchFailed()) {
        if (list.length === 0) {
          setError(true);
          setStale(false);
        } else {
          setError(false);
          setStale(true);
        }
      } else {
        setError(false);
        setStale(false);
      }
    } catch (err) {
      console.error('Error fetching feed:', err);
      setError(true);
    } finally {
      // Always clear the skeleton after the first fetch attempt — never leave it stuck
      setLoading(false);
      setRefreshing(false);
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
    error,
    stale,
    refreshing,
    page,
    setPage,
    totalPages,
    hasMore,
    loadMore,
    refetch: loadFeed
  };
}

export default useFeedData;
