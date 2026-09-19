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

/**
 * Helper to safely fetch from API endpoints, returning null if 404/non-JSON
 */
export async function safeApiFetch(url, options = {}) {
  try {
    const res = await fetch(url, options);
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

    if (type) query = query.eq('type', type);
    if (category) query = query.ilike('category', `%${category}%`);
    if (tag) query = query.ilike('tags', `%${tag}%`);
    if (limit) query = query.limit(limit);

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  } catch (e) {
    console.error('Supabase fetch entries error:', e);
    return [];
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



