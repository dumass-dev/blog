import { createClient } from '@supabase/supabase-js';

const defaultUrl = 'https://aidajlxmfxhmsctmciaq.supabase.co';
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || defaultUrl;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

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
  return feedsCache.get(typeKey) || null;
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
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 1000);
    const res = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return null;
    const text = await res.text();
    if (!text || text.trim().startsWith('<')) return null;
    return JSON.parse(text);
  } catch (err) {
    return null;
  }
}

/**
 * Direct blazing-fast Supabase query for public entries
 */
export async function fetchPublishedEntries({ type, limit, tag, category } = {}) {
  try {
    let query = supabase
      .from('entries')
      .select('*')
      .neq('status', 'draft')
      .order('date', { ascending: false });

    if (type) {
      if (type === 'photo') {
        query = query.or('category.ilike.%photos%,type.eq.photo');
      } else {
        query = query.eq('type', type);
      }
    }
    if (category) query = query.ilike('category', `%${category}%`);
    if (tag) query = query.ilike('tags', `%${tag}%`);
    if (limit) query = query.limit(limit);

    const { data, error } = await query;
    if (error) throw error;
    const rawList = data || [];

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
          content: '🔒 This entry is passcode-protected.',
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
    const cacheKey = type || 'all';
    feedsCache.set(cacheKey, list);

    return list;
  } catch (e) {
    console.error('Supabase fetch entries error:', e);
    return feedsCache.get(type || 'all') || [];
  }
}

/**
 * Realtime subscription to entries table
 */
export function subscribeToEntries(onDataChange) {
  const channel = supabase
    .channel('public:entries')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'entries' }, () => {
      onDataChange();
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



