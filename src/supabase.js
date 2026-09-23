import { createClient } from '@supabase/supabase-js';

const defaultUrl = 'https://aidajlxmfxhmsctmciaq.supabase.co';
const metaEnv = (typeof import.meta !== 'undefined' && import.meta.env) ? import.meta.env : (process?.env || {});
const supabaseUrl = metaEnv.VITE_SUPABASE_URL || defaultUrl;
const supabaseAnonKey = metaEnv.VITE_SUPABASE_ANON_KEY || '';

let client;
try {
  client = createClient(supabaseUrl, supabaseAnonKey || 'placeholder-anon-key');
} catch (err) {
  console.warn('Supabase client fallback:', err.message);
  client = createClient(defaultUrl, 'placeholder-anon-key');
}

export const supabase = client;

// In-memory SWR cache for zero-delay instant page navigation
const entriesCache = new Map();
const feedsCache = new Map();

export function getCachedEntry(slugOrId) {
  if (!slugOrId) return null;
  return entriesCache.get(slugOrId) || null;
}

export function getCachedFeed(typeKey = 'all') {
  if (feedsCache.has(typeKey)) return feedsCache.get(typeKey);
  try {
    const raw = localStorage.getItem(`feed_cache_${typeKey}`);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        feedsCache.set(typeKey, parsed);
        return parsed;
      }
    }
  } catch {}
  return null;
}

export function cacheEntry(entry) {
  if (!entry) return;
  if (entry.id) entriesCache.set(entry.id, entry);
  if (entry.slug) entriesCache.set(entry.slug, entry);
}

/**
 * Helper to safely fetch from API endpoints, returning null if 404/non-JSON
 */
export async function safeApiFetch(url, options = {}) {
  try {
    const { timeout = 5000, ...fetchOptions } = options;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    const res = await fetch(url, { ...fetchOptions, signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return null;
    const text = await res.text();
    if (!text || text.trim().startsWith('<')) return null;
    return JSON.parse(text);
  } catch (_err) {
    return null;
  }
}

/**
 * Direct blazing-fast Supabase query for public entries
 */
export async function fetchPublishedEntries({ type, limit, tag, category, forHomeFeed } = {}) {
  // 1. Try server API endpoint FIRST so Backblaze B2 presigned S3 URLs are freshly generated
  try {
    const params = new URLSearchParams();
    if (type) params.append('type', type);
    if (category) params.append('category', category);
    if (tag) params.append('tag', tag);
    if (limit) params.append('limit', String(limit));

    const queryStr = params.toString();
    const apiUrl = `/api/posts${queryStr ? `?${queryStr}` : ''}`;
    const apiData = await safeApiFetch(apiUrl);

    if (Array.isArray(apiData)) {
      let list = apiData;
      if (forHomeFeed) {
        list = list.filter(item => item.show_in_feed !== false);
      }
      if (type === 'journal') {
        list = list.filter(item => 
          item.type !== 'photo' && 
          (!item.category || item.category.toLowerCase() !== 'photos')
        );
      }

      // Cache entries and feed list for instant UI rendering
      list.forEach(item => cacheEntry(item));
      const cacheKey = forHomeFeed ? 'home' : (type || 'all');
      feedsCache.set(cacheKey, list);
      try {
        localStorage.setItem(`feed_cache_${cacheKey}`, JSON.stringify(list));
      } catch {}

      return list;
    }
  } catch (_apiErr) {}

  // 2. Secondary fallback: Query safe public_published_entries view if API server endpoint is offline
  try {
    let query = supabase
      .from('public_published_entries')
      .select('*')
      .order('date', { ascending: false });

    if (type) {
      if (type === 'photo') {
        query = query.or('type.eq.photo,category.ilike.*photos*');
      } else {
        query = query.eq('type', type);
      }
    }
    if (category) query = query.ilike('category', `%${category}%`);
    if (tag) query = query.ilike('tags', `%${tag}%`);
    if (limit) query = query.limit(limit);

    let { data, error } = await query;
    
    if (error || !data || (type === 'photo' && data.length === 0)) {
      try {
        const { data: allData } = await supabase
          .from('public_published_entries')
          .select('*')
          .order('date', { ascending: false });

        if (allData && allData.length > 0) {
          if (type === 'photo') {
            data = allData.filter(item => 
              item.type === 'photo' || 
              (item.category && item.category.toLowerCase().includes('photos')) ||
              (item.cover_image && item.cover_image.trim() !== '')
            );
          } else {
            data = allData;
          }
        }
      } catch (_fallbackErr) {}
    }

    let rawList = data || [];
    if (forHomeFeed) {
      rawList = rawList.filter(item => item.show_in_feed !== false);
    }
    if (type === 'journal') {
      rawList = rawList.filter(item => 
        item.type !== 'photo' && 
        (!item.category || item.category.toLowerCase() !== 'photos')
      );
    }

    // Check if user is logged in as admin locally
    let isLocalAdmin = false;
    try {
      const keys = Object.keys(localStorage);
      const authKey = keys.find(k => k.includes('auth-token') || k.includes('sb-token'));
      if (authKey) {
        const parsed = JSON.parse(localStorage.getItem(authKey));
        if (parsed?.user || parsed?.currentSession?.user) isLocalAdmin = true;
      }
    } catch {}

    const list = rawList.map(item => {
      const isPhoto = Boolean(
        item.type === 'photo' ||
        (item.category && item.category.toLowerCase() === 'photos')
      );
      const hasPasscode = Boolean(item.has_passcode || (item.passcode && item.passcode.trim() !== ''));

      if (!isLocalAdmin && hasPasscode) {
        return {
          ...item,
          type: isPhoto ? 'photo' : item.type,
          has_passcode: true,
          passcode: undefined,
          excerpt: '🔒 Protected entry',
          cover_image: ''
        };
      }

      return {
        ...item,
        type: isPhoto ? 'photo' : item.type
      };
    });
    
    // Cache entries and feed list for instant UI rendering
    list.forEach(item => cacheEntry(item));
    const cacheKey = forHomeFeed ? 'home' : (type || 'all');
    feedsCache.set(cacheKey, list);
    try {
      localStorage.setItem(`feed_cache_${cacheKey}`, JSON.stringify(list));
    } catch {}

    return list;
  } catch (e) {
    console.error('Supabase fetch entries error:', e);
    const fallbackKey = forHomeFeed ? 'home' : (type || 'all');
    return getCachedFeed(fallbackKey) || [];
  }
}

/**
 * No-op subscription for entries (Anon readers do not listen to Supabase realtime DB after Phase 1 RLS)
 */
export function subscribeToEntries() {
  return () => {};
}

/**
 * Realtime subscription to comments table
 */
export function subscribeToComments(postId, onDataChange) {
  const channel = supabase
    .channel(`public:comments:${postId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'comments' }, payload => {
      if (!postId || payload.new?.post_id === postId || payload.old?.post_id === postId) {
        onDataChange();
      }
    })
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

/**
 * Realtime subscription to reactions table
 */
export function subscribeToReactions(postId, onDataChange) {
  const channel = supabase
    .channel(`public:reactions:${postId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'reactions' }, payload => {
      if (!postId || payload.new?.post_id === postId || payload.old?.post_id === postId) {
        onDataChange();
      }
    })
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}



