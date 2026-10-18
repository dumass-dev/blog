/* global CustomEvent */
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

export function invalidateFeedCache() {
  feedsCache.clear();
  entriesCache.clear();
  try {
    const keys = ['home', 'all', 'journal', 'writing', 'photo', 'update'];
    keys.forEach(k => localStorage.removeItem(`feed_cache_${k}`));
  } catch {}

  if (typeof window !== 'undefined') {
    try {
      window.dispatchEvent(new CustomEvent('feed-data-invalidated'));
    } catch {}
  }
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

  // Fallback: If a specific section feed (like 'journal', 'writing', 'photo', 'update') is not yet cached independently,
  // derive it instantly from 'home' or 'all' feed cache for 0ms instant section page navigation
  if (typeKey !== 'all' && typeKey !== 'home') {
    const parentCache = feedsCache.get('home') || feedsCache.get('all') || (() => {
      try {
        const rawHome = localStorage.getItem('feed_cache_home') || localStorage.getItem('feed_cache_all');
        return rawHome ? JSON.parse(rawHome) : null;
      } catch { return null; }
    })();

    if (Array.isArray(parentCache) && parentCache.length > 0) {
      let derived = parentCache;
      if (typeKey === 'journal') {
        derived = parentCache.filter(item => 
          item.type !== 'photo' &&
          item.type !== 'update' &&
          (!item.category || item.category.toLowerCase() !== 'photos')
        );
      } else if (typeKey === 'writing') {
        derived = parentCache.filter(item => 
          item.type === 'writing' || item.type === 'essay' ||
          (item.category && item.category.toLowerCase() === 'writing')
        );
      } else if (typeKey === 'photo') {
        derived = parentCache.filter(item => 
          item.type === 'photo' || 
          (item.category && item.category.toLowerCase() === 'photos')
        );
      } else if (typeKey === 'update') {
        derived = parentCache.filter(item => item.type === 'update');
      }

      if (Array.isArray(derived) && derived.length > 0) {
        feedsCache.set(typeKey, derived);
        return derived;
      }
    }
  }

  return null;
}

export function cacheEntry(entry) {
  if (!entry) return;
  if (entry.id) entriesCache.set(entry.id, entry);
  if (entry.slug) entriesCache.set(entry.slug, entry);
}

export function updateCachedEntryViews(id, slug, views) {
  if (typeof views !== 'number') return;
  
  if (id && entriesCache.has(id)) {
    const item = entriesCache.get(id);
    if (item) item.views = views;
  }
  if (slug && entriesCache.has(slug)) {
    const item = entriesCache.get(slug);
    if (item) item.views = views;
  }

  for (const [key, feedList] of feedsCache.entries()) {
    if (Array.isArray(feedList)) {
      let changed = false;
      feedList.forEach(entry => {
        if ((id && entry.id === id) || (slug && entry.slug === slug)) {
          entry.views = views;
          changed = true;
        }
      });
      if (changed) {
        try {
          localStorage.setItem(`feed_cache_${key}`, JSON.stringify(feedList));
        } catch {}
      }
    }
  }
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
          item.type !== 'update' && 
          (!item.category || item.category.toLowerCase() !== 'photos')
        );
      } else if (type === 'update') {
        list = list.filter(item => item.type === 'update');
      } else if (type === 'writing') {
        list = list.filter(item => 
          item.type === 'writing' || item.type === 'essay' || 
          (item.category && item.category.toLowerCase() === 'writing')
        );
      } else if (type === 'photo') {
        list = list.filter(item => 
          item.type === 'photo' || 
          (item.category && item.category.toLowerCase() === 'photos')
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
      .order('date', { ascending: false })
      .order('created_at', { ascending: false });

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
        item.type !== 'update' && 
        (!item.category || item.category.toLowerCase() !== 'photos')
      );
    } else if (type === 'update') {
      rawList = rawList.filter(item => item.type === 'update');
    } else if (type === 'writing') {
      rawList = rawList.filter(item => 
        item.type === 'writing' || item.type === 'essay' || 
        (item.category && item.category.toLowerCase() === 'writing')
      );
    } else if (type === 'photo') {
      rawList = rawList.filter(item => 
        item.type === 'photo' || 
        (item.category && item.category.toLowerCase() === 'photos')
      );
    }

    // HIGH-4: Use real Supabase session check instead of spoofable localStorage heuristic
    let isLocalAdmin = false;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const sessionUserId = session?.user?.id || '';
      const adminId = (metaEnv.VITE_ADMIN_USER_ID || '').trim();
      isLocalAdmin = Boolean(sessionUserId && adminId && sessionUserId === adminId);
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
 * Global Realtime channel for instant cross-device updates
 */
let globalRealtimeChannel = null;

export function initSupabaseRealtime() {
  if (typeof window === 'undefined' || !supabase || globalRealtimeChannel) return;

  try {
    globalRealtimeChannel = supabase
      .channel('public-realtime-sync')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'entries' },
        (payload) => {
          invalidateFeedCache();
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('feed-data-invalidated', { detail: payload }));
          }
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'about' },
        (payload) => {
          localStorage.removeItem('cached_about_data');
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('about-data-updated', { detail: payload }));
          }
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'comments' },
        (payload) => {
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('comments-updated', { detail: payload }));
          }
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'reactions' },
        (payload) => {
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('reactions-updated', { detail: payload }));
          }
        }
      )
      .subscribe();
  } catch (err) {
    console.warn('Realtime subscription skipped:', err.message);
  }
}

// Automatically subscribe in browser (skip in node test environment)
if (typeof window !== 'undefined' && (typeof process === 'undefined' || process?.env?.NODE_ENV !== 'test')) {
  initSupabaseRealtime();
}

/**
 * Realtime subscription for entries
 */
export function subscribeToEntries(onDataChange) {
  if (typeof window === 'undefined' || !supabase) return () => {};
  const channel = supabase
    .channel(`public:entries:${Date.now()}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'entries' }, () => {
      invalidateFeedCache();
      if (typeof onDataChange === 'function') onDataChange();
    })
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

/**
 * Realtime subscription to comments table
 */
export function subscribeToComments(postId, onDataChange) {
  if (typeof window === 'undefined' || !supabase || typeof supabase.channel !== 'function') return () => {};
  try {
    const channel = supabase
      .channel(`public:comments:${postId || 'all'}:${Date.now()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'comments' }, payload => {
        if (!postId || payload.new?.post_id === postId || payload.old?.post_id === postId) {
          if (typeof onDataChange === 'function') onDataChange();
        }
      })
      .subscribe();

    return () => {
      try { supabase.removeChannel(channel); } catch {}
    };
  } catch {
    return () => {};
  }
}

/**
 * Realtime subscription to reactions table
 */
export function subscribeToReactions(postId, onDataChange) {
  if (typeof window === 'undefined' || !supabase || typeof supabase.channel !== 'function') return () => {};
  try {
    const channel = supabase
      .channel(`public:reactions:${postId || 'all'}:${Date.now()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reactions' }, payload => {
        if (!postId || payload.new?.post_id === postId || payload.old?.post_id === postId) {
          if (typeof onDataChange === 'function') onDataChange();
        }
      })
      .subscribe();

    return () => {
      try { supabase.removeChannel(channel); } catch {}
    };
  } catch {
    return () => {};
  }
}



