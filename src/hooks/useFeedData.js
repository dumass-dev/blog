import { useState, useEffect, useCallback } from 'react';
import { fetchPublishedEntries, getCachedFeed } from '../supabase';

export function useFeedData({ type, category, tag, limit, forHomeFeed, pageSize = 10 } = {}) {
  const cacheKey = forHomeFeed ? 'home' : (type || 'all');
  
  const [entries, setEntries] = useState(() => {
    const cached = getCachedFeed(cacheKey);
    if (!Array.isArray(cached)) return [];
    if (forHomeFeed) return cached.filter(item => item.show_in_feed !== false);
    if (type === 'journal') {
      return cached.filter(item => 
        item.type !== 'photo' && 
        (!item.category || item.category.toLowerCase() !== 'photos')
      );
    }
    return cached;
  });

  const [loading, setLoading] = useState(() => {
    const cached = getCachedFeed(cacheKey);
    return !cached || cached.length === 0;
  });

  const [page, setPage] = useState(1);

  const loadFeed = useCallback(async () => {
    try {
      const data = await fetchPublishedEntries({ type, category, tag, limit, forHomeFeed });
      let list = Array.isArray(data) ? data : [];
      if (forHomeFeed) {
        list = list.filter(item => item.show_in_feed !== false);
      }
      if (type === 'journal') {
        list = list.filter(item => 
          item.type !== 'photo' && 
          (!item.category || item.category.toLowerCase() !== 'photos')
        );
      }
      setEntries(list);
      setLoading(false);
    } catch (err) {
      console.error('Error fetching feed:', err);
      setLoading(false);
    }
  }, [type, category, tag, limit, forHomeFeed]);

  // Initial load + Refetch on window focus
  useEffect(() => {
    let isMounted = true;

    const executeLoad = async () => {
      if (isMounted) await loadFeed();
    };

    executeLoad();

    const handleFocus = () => {
      loadFeed();
    };

    window.addEventListener('focus', handleFocus);
    return () => {
      isMounted = false;
      window.removeEventListener('focus', handleFocus);
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
