/* global CustomEvent, EventSource, BroadcastChannel */
import { supabase, invalidateFeedCache, updateCachedEntryViews } from '../supabase.js';

let isInitialized = false;
let sseConnection = null;
let broadcastChannel = null;
let supabaseRealtimeChannel = null;
let lastKnownVersion = null;
let isConnected = false;
const statusListeners = new Set();
const recentEvents = new Map();

/**
 * Clean up old deduplication cache entries older than 4 seconds
 */
function cleanupRecentEvents() {
  const now = Date.now();
  for (const [key, timestamp] of recentEvents.entries()) {
    if (now - timestamp > 4000) {
      recentEvents.delete(key);
    }
  }
}

/**
 * Check if an event was already processed recently (deduplication across SSE, Supabase, and BroadcastChannel)
 */
function isDuplicateEvent(key) {
  cleanupRecentEvents();
  if (recentEvents.has(key)) return true;
  recentEvents.set(key, Date.now());
  return false;
}

/**
 * Notify status listeners (e.g. Live pulse indicators)
 */
function notifyStatus(status) {
  isConnected = Boolean(status);
  statusListeners.forEach(fn => {
    try { fn(isConnected); } catch {}
  });
}

export function subscribeToRealtimeStatus(listener) {
  if (typeof listener !== 'function') return () => {};
  statusListeners.add(listener);
  listener(isConnected);
  return () => statusListeners.delete(listener);
}

export function getRealtimeStatus() {
  return isConnected;
}

/**
 * Main event dispatcher for any realtime mutation
 */
export function dispatchRealtimeMutation(payload, { isLocal = false } = {}) {
  if (!payload || typeof payload !== 'object') return;

  const inner = (payload.payload && typeof payload.payload === 'object') ? payload.payload : payload;
  const eventType = payload.type || payload.event || inner.event || inner.type || 'entry';
  const targetId = inner.id || payload.id || inner.data?.id || payload.data?.id || inner.commentId || payload.commentId || inner.postId || payload.postId || '';
  const op = inner.op || payload.op || inner.eventType || payload.eventType || '';
  const dedupeKey = `${eventType}:${op}:${targetId}:${payload.version || inner.version || ''}`;

  if (!isLocal && isDuplicateEvent(dedupeKey)) {
    return;
  }

  if (payload.version || inner.version) {
    lastKnownVersion = payload.version || inner.version;
  }

  // 1. Entry / Feed changes
  if (
    eventType === 'entry' ||
    eventType === 'entry_created' ||
    eventType === 'entry_updated' ||
    eventType === 'entry_deleted' ||
    eventType === 'resync' ||
    eventType === 'feed'
  ) {
    invalidateFeedCache();

    if (typeof window !== 'undefined') {
      try {
        window.dispatchEvent(new CustomEvent('feed-data-invalidated', { detail: payload }));
        window.dispatchEvent(new CustomEvent('entry-updated', { detail: payload }));
      } catch {}

    }
  }

  // 1b. Targeted Entry View Count updates (instant update, no feed flicker)
  if (eventType === 'entry_view_updated') {
    const postId = inner.id || payload.id;
    const postSlug = inner.slug || payload.slug;
    const views = (typeof inner.views === 'number') ? inner.views : payload.views;

    if (typeof views === 'number') {
      updateCachedEntryViews(postId, postSlug, views);
      if (typeof window !== 'undefined') {
        try {
          window.dispatchEvent(new CustomEvent('entry-views-updated', { detail: { id: postId, slug: postSlug, views } }));
        } catch {}
      }
    }
    return;
  }

  // 2. About page & Site settings changes (Theme, Typewriter, View count)
  if (
    eventType === 'about' ||
    eventType === 'about_updated' ||
    eventType === 'site_settings' ||
    eventType === 'site_settings_updated'
  ) {
    try {
      localStorage.removeItem('cached_about_data');
    } catch {}

    if (typeof window !== 'undefined') {
      try {
        window.dispatchEvent(new CustomEvent('about-data-updated', { detail: payload }));
        window.dispatchEvent(new CustomEvent('site-settings-updated', { detail: payload }));
      } catch {}
    }
  }

  // 3. Reader comments
  if (eventType === 'comment' || eventType === 'comment_created' || eventType === 'comment_deleted') {
    if (typeof window !== 'undefined') {
      try {
        window.dispatchEvent(new CustomEvent('comments-updated', { detail: payload }));
      } catch {}
    }
  }

  // 4. Reactions
  if (eventType === 'reaction' || eventType === 'reaction_updated') {
    if (typeof window !== 'undefined') {
      try {
        window.dispatchEvent(new CustomEvent('reactions-updated', { detail: payload }));
      } catch {}
    }
  }

  // 5. Media
  if (eventType === 'media' || eventType === 'media_updated') {
    if (typeof window !== 'undefined') {
      try {
        window.dispatchEvent(new CustomEvent('media-updated', { detail: payload }));
      } catch {}
    }
  }

  // 6. Now Playing / Music Card
  if (eventType === 'now_playing' || eventType === 'now_playing_updated') {
    if (typeof window !== 'undefined') {
      try {
        window.dispatchEvent(new CustomEvent('now-playing-updated', { detail: payload }));
      } catch {}
    }
  }
}

/**
 * Publish a mutation originated by the current user (e.g. Admin saves or deletes)
 * Broadcasts to:
 * 1) Local window CustomEvents & cache invalidation
 * 2) Browser BroadcastChannel (syncs all tabs in same browser)
 * 3) Supabase Realtime Broadcast (syncs all devices/visitors across web)
 */
export function publishRealtimeUpdate(payload) {
  if (!payload || typeof payload !== 'object') return;
  const enriched = {
    ...payload,
    timestamp: new Date().toISOString(),
    broadcastId: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
  };

  // 1. Process locally first
  dispatchRealtimeMutation(enriched, { isLocal: true });

  // 2. Broadcast to other tabs in the same browser
  if (broadcastChannel) {
    try {
      broadcastChannel.postMessage(enriched);
    } catch {}
  }

  // 3. Broadcast to Supabase Realtime channel for cross-device & cross-user sync
  if (supabaseRealtimeChannel) {
    try {
      supabaseRealtimeChannel.send({
        type: 'broadcast',
        event: 'sync',
        payload: enriched
      }).catch(() => {});
    } catch {}
  }

  // 4. Send event to backend to update serverless state & database sync table
  try {
    fetch('/api/realtime-broadcast', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(enriched)
    }).catch(() => {});
  } catch {}
}

/**
 * Setup Server-Sent Events (SSE) stream connection
 */
function setupSSEConnection() {
  if (typeof window === 'undefined' || typeof window.EventSource === 'undefined') return;

  if (sseConnection) {
    try { sseConnection.close(); } catch {}
  }

  let retryDelay = 2000;
  let retryTimer = null;

  const connect = () => {
    try {
      const es = new EventSource('/api/realtime-stream');
      sseConnection = es;

      es.onopen = () => {
        retryDelay = 2000;
        notifyStatus(true);
      };

      const handleEvent = (e) => {
        try {
          const parsed = JSON.parse(e.data);
          dispatchRealtimeMutation(parsed);
        } catch {}
      };

      es.onmessage = handleEvent;
      es.addEventListener('entry_created', handleEvent);
      es.addEventListener('entry_updated', handleEvent);
      es.addEventListener('entry_deleted', handleEvent);
      es.addEventListener('entry_view_updated', handleEvent);
      es.addEventListener('about_updated', handleEvent);
      es.addEventListener('site_settings_updated', handleEvent);
      es.addEventListener('comment_created', handleEvent);
      es.addEventListener('comment_deleted', handleEvent);
      es.addEventListener('reaction_updated', handleEvent);
      es.addEventListener('media_updated', handleEvent);
      es.addEventListener('now_playing_updated', handleEvent);
      es.addEventListener('init', (e) => {
        try {
          const d = JSON.parse(e.data);
          if (d.version) lastKnownVersion = d.version;
          notifyStatus(true);
        } catch {}
      });

      es.onerror = () => {
        notifyStatus(false);
        try { es.close(); } catch {}
        sseConnection = null;
        clearTimeout(retryTimer);
        retryTimer = setTimeout(() => {
          retryDelay = Math.min(retryDelay * 1.5, 30000);
          connect();
        }, retryDelay);
        if (retryTimer && typeof retryTimer.unref === 'function') retryTimer.unref();
      };
    } catch {
      notifyStatus(false);
    }
  };

  connect();
}

/**
 * Setup Supabase Realtime (Postgres Changes + Realtime Broadcast Channel)
 */
function setupSupabaseRealtime() {
  if (typeof window === 'undefined' || !supabase) return;

  try {
    supabaseRealtimeChannel = supabase
      .channel('blog-live-sync', {
        config: {
          broadcast: { self: false },
          private: false
        }
      })
      .on('broadcast', { event: 'sync' }, (message) => {
        if (message && message.payload) {
          dispatchRealtimeMutation(message.payload);
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'realtime_sync' }, (payload) => {
        if (payload && payload.new) {
          const innerPayload = (payload.new.payload && typeof payload.new.payload === 'object') ? payload.new.payload : {};
          dispatchRealtimeMutation({
            type: payload.new.event || 'resync',
            version: payload.new.version,
            ...innerPayload
          });
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'entries' }, (payload) => {
        if (payload.new && typeof payload.new.views === 'number') {
          dispatchRealtimeMutation({
            type: 'entry_view_updated',
            id: payload.new.id,
            slug: payload.new.slug,
            views: payload.new.views
          });
        }
        dispatchRealtimeMutation({
          type: 'entry',
          op: payload.eventType,
          id: payload.new?.id || payload.old?.id,
          slug: payload.new?.slug || payload.old?.slug,
          data: payload.new
        });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'about' }, (payload) => {
        dispatchRealtimeMutation({
          type: 'about',
          op: payload.eventType,
          data: payload.new
        });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'comments' }, (payload) => {
        dispatchRealtimeMutation({
          type: 'comment',
          op: payload.eventType,
          postId: payload.new?.post_id || payload.old?.post_id,
          commentId: payload.new?.id || payload.old?.id
        });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reactions' }, (payload) => {
        dispatchRealtimeMutation({
          type: 'reaction',
          op: payload.eventType,
          postId: payload.new?.post_id || payload.old?.post_id
        });
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          notifyStatus(true);
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          notifyStatus(false);
          setTimeout(() => {
            if (typeof window !== 'undefined' && document.visibilityState === 'visible') {
              try {
                supabaseRealtimeChannel?.subscribe();
              } catch {}
            }
          }, 4000);
        }
      });
  } catch (err) {
    console.warn('Supabase Realtime setup notice:', err.message);
  }
}

/**
 * Setup Browser Native BroadcastChannel for instant multi-tab sync
 */
function setupBroadcastChannel() {
  if (typeof window === 'undefined' || typeof window.BroadcastChannel === 'undefined') return;

  try {
    broadcastChannel = new BroadcastChannel('blog_sync_realtime');
    broadcastChannel.onmessage = (e) => {
      if (e && e.data) {
        dispatchRealtimeMutation(e.data);
      }
    };
  } catch {}
}

/**
 * Fast sync-check to ensure no missed updates across mobile devices & serverless instances
 */
async function checkSyncVersion() {
  try {
    const res = await fetch('/api/sync-check', { cache: 'no-store' });
    if (!res.ok) return;
    const data = await res.json();
    if (data && data.version) {
      if (lastKnownVersion !== null && data.version > lastKnownVersion) {
        const eventType = data.event || 'resync';
        dispatchRealtimeMutation({
          type: eventType,
          version: data.version,
          payload: data.payload
        });
      }
      lastKnownVersion = data.version;
    }
  } catch {}
}

/**
 * Initialize unified realtime synchronization
 * Safe to call multiple times (idempotent)
 */
export function initRealtimeSync() {
  if (typeof window === 'undefined' || isInitialized) return;
  isInitialized = true;

  // 1. Browser Native Tab Broadcast
  setupBroadcastChannel();

  // 2. Server-Sent Events (SSE) Stream
  setupSSEConnection();

  // 3. Supabase Realtime (Postgres CDC + Global Broadcast)
  setupSupabaseRealtime();

  // 4. Initial sync version check
  checkSyncVersion();

  // 5. Tab visibility change & active fast-sync check (Every 3.5s when visible)
  try {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        checkSyncVersion();
      }
    });

    window.addEventListener('focus', () => {
      checkSyncVersion();
    });

    window.addEventListener('online', () => {
      checkSyncVersion();
    });

    // Fast 3.5s background sync-check while tab is visible on mobile or desktop
    const syncInterval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        checkSyncVersion();
      }
    }, 3500);
    if (syncInterval && typeof syncInterval.unref === 'function') {
      syncInterval.unref();
    }
  } catch {}
}
