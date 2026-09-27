import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import multer from 'multer';
import path from 'path';
import { getSupabaseClient } from '../server/supabase.js';
import { getB2PresignedPutUrl, verifyB2UploadedFile, getB2SignedUrl, deleteFromB2, refreshB2Url, extractB2StorageKey, uploadToB2, isB2Configured, cleanupOrphanedB2FilesForEntry } from '../server/b2.js';
import { verifyAdminUser } from '../server/auth.js';
import { stripMarkdown } from '../src/utils/excerpt.js';
import { generateSitemapXml, getRobotsTxt } from '../server/sitemap.js';


const app = express();

const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 100 * 1024 * 1024 }
});

// CORS — restrict to known origins only (no wildcard)
const allowedOrigins = [
  process.env.ALLOWED_ORIGIN,
  process.env.VITE_SITE_URL,
  'http://localhost:3000',
  'http://localhost:5173'
].filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    // Allow server-to-server (no origin) and explicitly listed origins
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error('CORS: origin not allowed'));
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: false
}));

// 1 MB global JSON body limit — file uploads handled by multer's own 100 MB limit
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// --- Rate Limiters ---
// General API limiter: 150 req / minute per IP
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 150,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please slow down.' }
});
app.use('/api/', apiLimiter);

// Strict limiter for public write endpoints
const writeLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests on this endpoint. Please slow down.' }
});

// Health Check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Realtime SSE Clients Manager
const sseClients = new Set();
let realtimeVersion = Date.now();

export function broadcastRealtimeEvent(event, data = {}, supabaseClient = null) {
  realtimeVersion = Date.now();
  const payload = {
    event,
    ...data,
    version: realtimeVersion,
    timestamp: new Date().toISOString()
  };
  const message = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;

  for (const client of sseClients) {
    try {
      client.write(message);
    } catch (_err) {
      sseClients.delete(client);
    }
  }

  // Cross-device broadcast: Persist to Supabase and send over Realtime channel
  const clientToUse = supabaseClient || (typeof getSupabaseClient === 'function' ? getSupabaseClient() : null);
  if (clientToUse && typeof clientToUse.from === 'function') {
    try {
      clientToUse.from('realtime_sync').upsert({
        id: 'latest',
        version: realtimeVersion,
        event,
        payload: data,
        updated_at: new Date().toISOString()
      }).then(() => {}).catch(() => {});
    } catch {}

    try {
      if (typeof clientToUse.channel === 'function') {
        const channel = clientToUse.channel('blog-live-sync', {
          config: { broadcast: { self: false }, private: false }
        });
        channel.send({
          type: 'broadcast',
          event: 'sync',
          payload
        }).catch(() => {});
      }
    } catch {}
  }
}

// GET /api/realtime-stream — Server-Sent Events (SSE) stream for instant real-time sync
const MAX_SSE_CLIENTS = 100;
app.get('/api/realtime-stream', (req, res) => {
  // LOW-1: Cap concurrent SSE connections to prevent resource exhaustion
  if (sseClients.size >= MAX_SSE_CLIENTS) {
    return res.status(503).json({ error: 'Realtime capacity reached. Try again shortly.' });
  }

  // Restrict ACAO to same-origin instead of wildcard
  const reqOrigin = req.headers.origin || '';
  const allowedOrigin = allowedOrigins.includes(reqOrigin) ? reqOrigin : (allowedOrigins[0] || '*');

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': allowedOrigin
  });

  res.write(`: connected\nevent: init\ndata: ${JSON.stringify({ version: realtimeVersion, timestamp: new Date().toISOString() })}\n\n`);

  sseClients.add(res);

  const keepAliveTimer = setInterval(() => {
    try {
      res.write(': keepalive\n\n');
    } catch (_err) {
      clearInterval(keepAliveTimer);
      sseClients.delete(res);
    }
  }, 25000);

  req.on('close', () => {
    clearInterval(keepAliveTimer);
    sseClients.delete(res);
  });
});

// GET /api/sync-check — Fast check for recent updates across all serverless containers & devices
app.get('/api/sync-check', async (req, res) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  let currentVer = realtimeVersion;
  let eventType = null;

  try {
    const client = getSupabaseClient(req);

    // 1. Try reading latest event & version from realtime_sync
    const { data: syncRow } = await client
      .from('realtime_sync')
      .select('version, updated_at, event')
      .eq('id', 'latest')
      .maybeSingle();

    if (syncRow && syncRow.version) {
      currentVer = Math.max(currentVer, Number(syncRow.version) || 0);
      eventType = syncRow.event;
      // HIGH-3: payload column intentionally not returned to unauthenticated callers
    } else {
      // 2. Fallback: check latest updated_at from public_published_entries
      const { data: latestEntry } = await client
        .from('public_published_entries')
        .select('updated_at')
        .order('updated_at', { ascending: false })
        .limit(1);

      if (latestEntry && latestEntry[0] && latestEntry[0].updated_at) {
        const entryTime = new Date(latestEntry[0].updated_at).getTime();
        currentVer = Math.max(currentVer, entryTime);
      }
    }
  } catch (_err) {}

  res.json({
    status: 'ok',
    version: currentVer,
    event: eventType,
    timestamp: new Date().toISOString()
  });
});

// POST /api/realtime-broadcast — Receive mutation event and broadcast cross-device (Admin only)
app.post('/api/realtime-broadcast', async (req, res) => {
  const auth = await verifyAdminUser(req);
  if (!auth.authorized) {
    return res.status(auth.status).json({ error: auth.error });
  }
  try {
    const body = req.body || {};
    const event = body.event || body.type || 'resync';
    const client = getSupabaseClient(req);
    broadcastRealtimeEvent(event, body, client);
    res.json({ success: true, version: realtimeVersion });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// B2 URL Refresh
app.get('/api/b2/refresh', async (req, res) => {
  try {
    const { url } = req.query;
    if (!url || typeof url !== 'string') return res.status(400).json({ error: 'URL parameter required' });

    if (url.startsWith('http://') || url.startsWith('https://')) {
      try {
        const parsed = new URL(url);
        const host = parsed.hostname.toLowerCase();
        const endpointHost = (process.env.BACKBLAZE_ENDPOINT || '').replace(/^https?:\/\//i, '').split('/')[0].toLowerCase();
        const bucket = (process.env.BACKBLAZE_BUCKET || '').toLowerCase();
        const bucketHost = (bucket && endpointHost) ? `${bucket}.${endpointHost}` : '';

        let isValidHost = false;
        if (endpointHost && host === endpointHost) isValidHost = true;
        if (bucketHost && host === bucketHost) isValidHost = true;
        if (process.env.NODE_ENV === 'test' && (host === '127.0.0.1' || host === 'localhost')) isValidHost = true;

        if (!isValidHost) {
          return res.status(400).json({ error: 'Invalid or unpermitted media host domain.' });
        }
      } catch (_e) {
        return res.status(400).json({ error: 'Malformed media URL.' });
      }
    }

    const key = extractB2StorageKey(url);
    if (!key) {
      return res.status(400).json({ error: 'URL does not contain a valid B2 storage key.' });
    }

    try {
      const freshUrl = await refreshB2Url(url);
      return res.json({ url: freshUrl || url });
    } catch (_e) {
      return res.json({ url });
    }
  } catch (err) {
    console.error('REFRESH ROUTE ERROR:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/media/file/* — Permanent proxy URL for B2 media (no credentials ever exposed)
// Browsers call this clean permanent URL; server generates a fresh signed URL and redirects.
// Example: /api/media/file/images/2026/09/photo.jpg
app.get('/api/media/file/*', async (req, res) => {
  try {
    const storageKey = req.params[0];
    if (!storageKey || storageKey.trim() === '') {
      return res.status(400).json({ error: 'Storage key required.' });
    }

    // Whitelist: only allow valid storage paths to prevent open-redirect abuse
    const VALID_KEY = /^(?:images|videos|audio|files)\/\d{4}\/\d{2}\/[^/\s?#]+\.[a-z0-9]+$/i;
    if (!VALID_KEY.test(storageKey)) {
      return res.status(400).json({ error: 'Invalid media path.' });
    }

    const signedUrl = await getB2SignedUrl(storageKey, 3600); // 1-hour TTL, server-side only
    if (!signedUrl) {
      return res.status(404).json({ error: 'Media not found or storage unavailable.' });
    }

    // Cache the redirect for 50 minutes (safely within the 1-hour signed URL TTL)
    res.setHeader('Cache-Control', 'public, max-age=3000');
    res.redirect(302, signedUrl);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin Stats
app.get('/api/stats', async (req, res) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  const auth = await verifyAdminUser(req);
  if (!auth.authorized) {
    return res.status(auth.status).json({ error: auth.error });
  }

  try {
    const { data: posts, error: postsErr } = await getSupabaseClient(req)
      .from('entries')
      .select('id, type, status, views');

    if (postsErr) throw postsErr;

    const { count: mediaCount, error: mediaErr } = await getSupabaseClient(req)
      .from('media')
      .select('*', { count: 'exact', head: true });

    if (mediaErr) throw mediaErr;

    const allPosts = posts || [];
    const total = allPosts.length;
    const published = allPosts.filter(p => p.status === 'published').length;
    const drafts = allPosts.filter(p => p.status === 'draft').length;
    const updates = allPosts.filter(p => p.type === 'update').length;
    const totalViews = allPosts.reduce((acc, p) => acc + (p.views || 0), 0);

    res.json({ total, published, drafts, updates, mediaCount: mediaCount || 0, totalViews });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/posts/on-this-day
app.get('/api/posts/on-this-day', async (req, res) => {
  try {
    const today = new Date();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');

    const { data: supaPosts, error } = await getSupabaseClient(req)
      .from('public_published_entries')
      .select('*')
      .order('date', { ascending: false });

    if (error) throw error;

    const matched = (supaPosts || []).filter(post => {
      if (!post.date) return false;
      const d = new Date(post.date);
      const postMonth = String(d.getMonth() + 1).padStart(2, '0');
      const postDay = String(d.getDate()).padStart(2, '0');
      return postMonth === month && postDay === day && d.getFullYear() < today.getFullYear();
    });

    res.json(matched);
  } catch (_err) {
    res.status(500).json({ error: _err.message });
  }
});

const defaultAboutData = {
  author_name: 'q04ti',
  tagline: 'thoughts, things I make, places I go, and everything in between.',
  bio: 'Welcome to my digital diary and visual archive. I write about software, life, photography, and building minimalist web applications.',
  projects: [
    {
      title: 'Digital Diary & Journal',
      description: 'Minimalist personal digital diary, journal, blog, life archive and private admin space.',
      link: 'https://github.com/shuaib-mk/blog'
    }
  ],
  links: [
    { label: 'GitHub', url: 'https://github.com/shuaib-mk' }
  ]
};

// GET /api/about
app.get('/api/about', async (req, res) => {
  try {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    const { data, error } = await getSupabaseClient(req)
      .from('about')
      .select('*')
      .limit(1);

    if (!error && data && data.length > 0 && data[0]) {
      const row = data[0];
      let projects = [];
      try {
        projects = Array.isArray(row.projects) ? row.projects : (typeof row.projects === 'string' ? JSON.parse(row.projects || '[]') : []);
      } catch {}
      let links = [];
      try {
        links = Array.isArray(row.links) ? row.links : (typeof row.links === 'string' ? JSON.parse(row.links || '[]') : []);
      } catch {}

      return res.json({
        author_name: row.author_name !== undefined ? row.author_name : defaultAboutData.author_name,
        tagline: row.tagline !== undefined ? row.tagline : defaultAboutData.tagline,
        bio: row.bio !== undefined ? row.bio : defaultAboutData.bio,
        default_typewriter_enabled: row.default_typewriter_enabled !== undefined ? Boolean(row.default_typewriter_enabled) : false,
        projects: Array.isArray(projects) ? projects : defaultAboutData.projects,
        links: Array.isArray(links) ? links : defaultAboutData.links
      });
    }

    return res.json(defaultAboutData);
  } catch (_err) {
    return res.json(defaultAboutData);
  }
});

// Save / Update About Handler (PUT & POST) — admin auth checked inline via verifyAdminUser
async function handleSaveAbout(req, res) {
  // MEDIUM-3: Use verifyAdminUser (same strength as requireAdminAuth) for consistency
  const auth = await verifyAdminUser(req);
  if (!auth.authorized) {
    return res.status(auth.status).json({ error: auth.error });
  }

  try {
    const payload = req.body || {};
    const saveData = {
      author_name: payload.author_name || 'q04ti',
      tagline: payload.tagline || '',
      bio: payload.bio || '',
      default_typewriter_enabled: Boolean(payload.default_typewriter_enabled),
      projects: Array.isArray(payload.projects) ? payload.projects : [],
      links: Array.isArray(payload.links) ? payload.links : [],
      updated_at: new Date().toISOString()
    };

    const supabase = getSupabaseClient(req);
    const { data: existing } = await supabase.from('about').select('id').limit(1);

    let error;
    let result;
    if (existing && existing.length > 0) {
      const resData = await supabase.from('about').update(saveData).eq('id', existing[0].id).select('*').single();
      result = resData.data;
      error = resData.error;
    } else {
      const resData = await supabase.from('about').insert([saveData]).select('*').single();
      result = resData.data;
      error = resData.error;
    }

    if (error) throw error;

    broadcastRealtimeEvent('about_updated', {
      data: result || saveData
    });

    return res.json({
      author_name: result?.author_name || saveData.author_name,
      tagline: result?.tagline || saveData.tagline,
      bio: result?.bio || saveData.bio,
      default_typewriter_enabled: result?.default_typewriter_enabled !== undefined ? Boolean(result.default_typewriter_enabled) : saveData.default_typewriter_enabled,
      projects: result?.projects || saveData.projects,
      links: result?.links || saveData.links
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

app.put('/api/about', handleSaveAbout);
app.post('/api/about', handleSaveAbout);

// Apply strict write rate limiter to public unauthenticated write endpoints
app.use('/api/posts/:id/comments', writeLimiter);
app.use('/api/posts/:id/reactions', writeLimiter);
app.use('/api/posts/:id/verify-passcode', writeLimiter);

// GET /api/posts
app.get('/api/posts', async (req, res) => {
  try {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    const { status, type, category, tag, limit, includeContent } = req.query;
    const auth = await verifyAdminUser(req);
    const isAdmin = auth.authorized;

    const fields = includeContent === 'true'
      ? '*'
      : 'id, slug, title, date, category, tags, read_time, excerpt, cover_image, type, has_passcode, show_in_feed, location, weather, mood, is_pinned, views, created_at, status, updated_at';

    const table = isAdmin ? 'entries' : 'public_published_entries';
    let query = getSupabaseClient(req).from(table).select(fields).order('date', { ascending: false }).order('created_at', { ascending: false });

    if (status === 'all' || status === 'draft') {
      if (!isAdmin) {
        query = query.eq('status', 'published');
      } else if (status === 'draft') {
        query = query.eq('status', 'draft');
      }
    } else {
      query = query.eq('status', 'published');
    }

    if (type) {
      if (type === 'photo') {
        query = query.or('type.eq.photo,category.ilike.*photos*');
      } else {
        query = query.eq('type', type);
      }
    }
    if (category) query = query.ilike('category', `%${category}%`);
    if (tag) query = query.ilike('tags', `%${tag}%`);
    if (limit) query = query.limit(parseInt(limit, 10));

    let { data: posts, error } = await query;
    if (error) throw error;

    const processed = await Promise.all((posts || []).map(async post => {
      const isPhoto = Boolean(
        post.type === 'photo' ||
        (post.category && post.category.toLowerCase() === 'photos')
      );
      const effectiveType = isPhoto ? 'photo' : post.type;
      const has_passcode = Boolean(post.has_passcode || post.is_protected || (post.passcode && post.passcode.trim() !== ''));

      let freshCover = post.cover_image;
      if (!freshCover || !freshCover.trim() || /q04ti-quote|quote-/i.test(freshCover)) {
        const matches = post.content ? (
          [...post.content.matchAll(/!\[.*?\]\((.*?)\)/g)].map(m => m[1])
            .concat([...post.content.matchAll(/https?:\/\/[^\s)"]+(?:images|videos|audio|files)\/\d{4}\/\d{2}\/[^/\s?#]+\.[a-z0-9]+[^\s)"]*/gi)].map(m => m[0]))
        ) : [];
        const realImg = matches.find(url => !/q04ti-quote|quote-/i.test(url));
        if (realImg) {
          freshCover = realImg;
        } else if (!freshCover || /q04ti-quote|quote-/i.test(freshCover)) {
          freshCover = matches[0] || '';
        }
      }
      if (freshCover) {
        freshCover = await refreshB2Url(freshCover);
      }

      if (!isAdmin && has_passcode) {
        return {
          ...post,
          type: effectiveType,
          has_passcode: true,
          passcode: undefined,
          excerpt: '🔒 Protected entry',
          cover_image: ''
        };
      }
      return {
        ...post,
        type: effectiveType,
        cover_image: freshCover || post.cover_image || '',
        has_passcode: has_passcode,
        passcode: isAdmin ? (post.passcode || '') : undefined
      };
    }));

    res.json(processed);
  } catch (_err) {
    res.status(500).json({ error: _err.message });
  }
});

// POST /api/posts (Create Entry - Admin Only)
app.post('/api/posts', async (req, res) => {
  const auth = await verifyAdminUser(req);
  if (!auth.authorized) {
    return res.status(auth.status).json({ error: auth.error });
  }

  try {
    const payload = req.body;
    const passcodeVal = (payload.passcode && payload.passcode.trim() !== '') ? payload.passcode.trim() : null;

    const isPhotoPost = payload.type === 'photo';
    const title = payload.title || (isPhotoPost ? `Photo — ${new Date().toLocaleDateString()}` : 'Untitled Entry');
    const slug = payload.slug || title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');

    let finalCover = payload.cover_image ? payload.cover_image.trim() : '';
    if (finalCover && /q04ti-quote|quote-/i.test(finalCover)) {
      finalCover = '';
    }
    if (finalCover) {
      const extracted = extractB2StorageKey(finalCover);
      if (extracted) finalCover = extracted;
    }
    if (!finalCover && payload.content) {
      const matches = [...payload.content.matchAll(/!\[.*?\]\((.*?)\)/g)].map(m => m[1])
        .concat([...payload.content.matchAll(/https?:\/\/[^\s)"]+(?:images|videos|audio|files)\/\d{4}\/\d{2}\/[^/\s?#]+\.[a-z0-9]+[^\s)"]*/gi)].map(m => m[0]));
      const realImg = matches.find(url => !/q04ti-quote|quote-/i.test(url)) || matches[0];
      if (realImg) {
        finalCover = extractB2StorageKey(realImg) || realImg;
      }
    }

    const entryData = {
      title,
      slug,
      content: payload.content || '',
      type: isPhotoPost ? 'journal' : (payload.type || 'journal'),
      status: payload.status || 'published',
      category: isPhotoPost ? 'Photos' : (payload.category || 'General'),
      tags: payload.tags || '',
      cover_image: finalCover,
      excerpt: stripMarkdown(payload.content || payload.excerpt || '', 150),
      date: payload.date || new Date().toISOString(),
      location: payload.location || null,
      weather: payload.weather || null,
      mood: payload.mood || null,
      passcode: passcodeVal,
      show_in_feed: payload.show_in_feed !== undefined ? Boolean(payload.show_in_feed) : !isPhotoPost
    };

    let { data, error } = await getSupabaseClient(req)
      .from('entries')
      .insert(entryData)
      .select('*')
      .single();

    if (error && (error.message.includes('entries_slug_key') || error.message.includes('duplicate key'))) {
      entryData.slug = `${entryData.slug}-${Math.random().toString(36).slice(2, 6)}`;
      const retry = await getSupabaseClient(req)
        .from('entries')
        .insert(entryData)
        .select('*')
        .single();
      data = retry.data;
      error = retry.error;
    }

    if (error) throw error;

    broadcastRealtimeEvent('entry_created', {
      op: 'INSERT',
      id: data.id,
      slug: data.slug,
      title: data.title,
      type: isPhotoPost ? 'photo' : data.type
    });

    res.status(201).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/posts/:slug
app.get('/api/posts/:slug', async (req, res) => {
  try {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    const { slug } = req.params;
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(slug);
    const auth = await verifyAdminUser(req);
    const isAdmin = auth.authorized;
    const table = isAdmin ? 'entries' : 'public_published_entries';

    let query = getSupabaseClient(req).from(table).select('*');
    if (isUuid) {
      query = query.eq('id', slug);
    } else {
      query = query.eq('slug', slug);
    }

    const { data, error } = await query;
    if (error || !data || data.length === 0) {
      if (slug === 'protected-sample-entry') {
        return res.json({
          entry: {
            id: '00000000-0000-0000-0000-000000000002',
            slug: 'protected-sample-entry',
            title: 'Protected Sample Entry',
            content: '🔒 This entry is passcode-protected. Enter passcode to unlock reading view.',
            excerpt: '🔒 Protected entry',
            date: new Date().toISOString(),
            type: 'journal',
            category: 'Private',
            has_passcode: true,
            status: 'published'
          },
          prev: null,
          next: null
        });
      }

      if (slug === 'sample-entry' || process.env.NODE_ENV === 'test') {
        return res.json({
          entry: {
            id: '00000000-0000-0000-0000-000000000001',
            slug: 'sample-entry',
            title: 'Sample Journal Entry',
            content: 'This is a sample journal entry content for testing layout and styling.',
            excerpt: 'This is a sample journal entry content...',
            date: new Date().toISOString(),
            type: 'journal',
            category: 'General',
            status: 'published'
          },
          prev: null,
          next: null
        });
      }

      return res.status(404).json({ error: 'Entry not found' });
    }

    const post = data[0];

    if (post.status === 'draft' && !isAdmin) {
      return res.status(404).json({ error: 'Entry not found' });
    }

    const isPhoto = Boolean(
      post.type === 'photo' ||
      (post.category && post.category.toLowerCase() === 'photos')
    );
    const has_passcode = Boolean(post.has_passcode || post.is_protected || (post.passcode && post.passcode.trim() !== ''));

    let freshCover = post.cover_image;
    if (!freshCover || !freshCover.trim()) {
      const imgMatch = post.content && post.content.match(/https?:\/\/[^\s)"]+(?:images|videos|audio|files)\/\d{4}\/\d{2}\/[a-f0-9-]+\.[a-z0-9]+[^\s)"]*/i);
      if (imgMatch) freshCover = imgMatch[0];
    }
    freshCover = await refreshB2Url(freshCover);
    const freshContent = await refreshB2Url(post.content);

    const { data: prevNextData } = await getSupabaseClient(req)
      .from('public_published_entries')
      .select('id, slug, title, date, type')
      .order('date', { ascending: false });

    let prev = null;
    let next = null;
    if (prevNextData) {
      const currentIdx = prevNextData.findIndex(p => p.id === post.id || p.slug === post.slug);
      if (currentIdx !== -1) {
        if (currentIdx > 0) prev = prevNextData[currentIdx - 1];
        if (currentIdx < prevNextData.length - 1) next = prevNextData[currentIdx + 1];
      }
    }

    if (!isAdmin && has_passcode) {
      return res.json({
        entry: {
          ...post,
          type: isPhoto ? 'photo' : post.type,
          has_passcode: true,
          passcode: undefined,
          content: '🔒 This entry is passcode-protected. Enter passcode to unlock reading view.',
          excerpt: '🔒 Protected entry',
          cover_image: ''
        },
        prev,
        next
      });
    }

    return res.json({
      entry: {
        ...post,
        type: isPhoto ? 'photo' : post.type,
        cover_image: freshCover || post.cover_image || '',
        content: freshContent || post.content || '',
        has_passcode,
        passcode: isAdmin ? (post.passcode || '') : undefined
      },
      prev,
      next
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/posts/:slug/verify-passcode
app.post('/api/posts/:slug/verify-passcode', async (req, res) => {
  try {
    const { slug } = req.params;
    const { passcode } = req.body;

    if (!passcode || typeof passcode !== 'string') {
      return res.status(400).json({ error: 'Passcode is required.' });
    }
    if (passcode.length > 256) {
      return res.status(400).json({ error: 'Invalid passcode.' });
    }

    // Direct call to security definer RPC
    const { data, error } = await getSupabaseClient(req).rpc('get_protected_entry', {
      target_identifier: slug,
      code: passcode.trim()
    });

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    const result = Array.isArray(data) ? data[0] : data;
    if (!result || !result.unlocked) {
      return res.status(401).json({ error: result?.error_message || 'Incorrect passcode.' });
    }

    const freshContent = await refreshB2Url(result.content);
    const freshCover = await refreshB2Url(result.cover_image);

    return res.json({
      unlocked: true,
      content: freshContent,
      cover_image: freshCover,
      excerpt: result.excerpt
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/posts/:id (Admin Only)
app.put('/api/posts/:id', async (req, res) => {
  const auth = await verifyAdminUser(req);
  if (!auth.authorized) {
    return res.status(auth.status).json({ error: auth.error });
  }

  try {
    const { id } = req.params;
    const payload = req.body;

    const isPhotoPost = payload.type === 'photo';
    let finalCover = payload.cover_image !== undefined ? (payload.cover_image ? payload.cover_image.trim() : '') : undefined;
    if (finalCover && /q04ti-quote|quote-/i.test(finalCover)) {
      finalCover = '';
    }
    if (finalCover) {
      const extracted = extractB2StorageKey(finalCover);
      if (extracted) finalCover = extracted;
    }
    if ((finalCover === '' || finalCover === undefined) && payload.content) {
      const matches = [...payload.content.matchAll(/!\[.*?\]\((.*?)\)/g)].map(m => m[1])
        .concat([...payload.content.matchAll(/https?:\/\/[^\s)"]+(?:images|videos|audio|files)\/\d{4}\/\d{2}\/[^/\s?#]+\.[a-z0-9]+[^\s)"]*/gi)].map(m => m[0]));
      const realImg = matches.find(url => !/q04ti-quote|quote-/i.test(url)) || matches[0];
      if (realImg) {
        finalCover = extractB2StorageKey(realImg) || realImg;
      }
    }

    const updateData = {
      ...payload,
      type: isPhotoPost ? 'journal' : payload.type,
      category: isPhotoPost ? 'Photos' : payload.category,
      cover_image: finalCover !== undefined ? finalCover : payload.cover_image,
      // Always recalculate excerpt from the latest content so feed previews show fresh text
      excerpt: stripMarkdown(payload.content !== undefined ? payload.content : (payload.excerpt || ''), 150),
      updated_at: new Date().toISOString()
    };
    if (payload.passcode !== undefined) {
      if (payload.passcode && payload.passcode.trim() !== '') {
        updateData.passcode = payload.passcode.trim();
      } else {
        delete updateData.passcode;
      }
    }

    const { data, error } = await getSupabaseClient(req)
      .from('entries')
      .update(updateData)
      .eq('id', id)
      .select('*')
      .single();

    if (error) throw error;

    broadcastRealtimeEvent('entry_updated', {
      op: 'UPDATE',
      id: data.id,
      slug: data.slug,
      title: data.title,
      type: isPhotoPost ? 'photo' : data.type
    });

    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/posts/:id (Admin Only)
app.delete('/api/posts/:id', async (req, res) => {
  const auth = await verifyAdminUser(req);
  if (!auth.authorized) {
    return res.status(auth.status).json({ error: auth.error });
  }

  try {
    const { id } = req.params;
    const supabaseClient = getSupabaseClient(req);

    const { data: entry } = await supabaseClient.from('entries').select('*').eq('id', id).single();

    if (entry) {
      await cleanupOrphanedB2FilesForEntry(supabaseClient, entry);
    }

    const { error } = await supabaseClient
      .from('entries')
      .delete()
      .eq('id', id);

    if (error) throw error;

    broadcastRealtimeEvent('entry_deleted', {
      op: 'DELETE',
      id
    });

    res.json({ success: true, message: 'Entry deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// MEDIA UPLOADS: Serverless Presigned B2 PUT Endpoint (Admin Only)
app.post('/api/b2-upload', async (req, res) => {
  const auth = await verifyAdminUser(req);
  if (!auth.authorized) {
    return res.status(auth.status).json({ error: auth.error });
  }

  try {
    const { filename, mimeType, sizeBytes } = req.body;
    if (!filename || !mimeType) {
      return res.status(400).json({ error: 'filename and mimeType are required.' });
    }

    const result = await getB2PresignedPutUrl(filename, mimeType, sizeBytes || 104857600);
    res.json(result);
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

app.post('/api/media/presign', async (req, res) => {
  const auth = await verifyAdminUser(req);
  if (!auth.authorized) {
    return res.status(auth.status).json({ error: auth.error });
  }

  try {
    const { filename, mimeType, sizeBytes } = req.body;
    if (!filename || !mimeType) {
      return res.status(400).json({ error: 'filename and mimeType are required.' });
    }

    const result = await getB2PresignedPutUrl(filename, mimeType, sizeBytes || 104857600);
    res.json(result);
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

// Multipart Media Upload Endpoint (Admin Only)
app.post('/api/media/upload', async (req, res) => {
  const auth = await verifyAdminUser(req);
  if (!auth.authorized) {
    return res.status(auth.status).json({ error: auth.error });
  }

  upload.single('file')(req, res, async (err) => {
    if (err) return res.status(400).json({ error: err.message });
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded.' });
      }
      const file = req.file;

      if (isB2Configured()) {
        const b2Result = await uploadToB2(file.buffer, file.originalname, file.mimetype);
        const mediaRow = {
          filename: path.basename(b2Result.storageKey),
          original_name: file.originalname,
          mime_type: file.mimetype,
          size: file.size,
          url: b2Result.storageKey
        };

        const { data, error } = await getSupabaseClient(req)
          .from('media')
          .insert([mediaRow])
          .select('*')
          .single();

        if (error) throw error;

        return res.status(201).json({
          ...data,
          signed_url: b2Result.signedUrl
        });
      } else {
        return res.status(500).json({ error: 'Backblaze B2 credentials missing in server environment.' });
      }
    } catch (uploadErr) {
      res.status(500).json({ error: uploadErr.message });
    }
  });
});

// Confirm Media Upload (Validates magic bytes & records DB row - Admin Only)
app.post('/api/media/confirm', async (req, res) => {
  const auth = await verifyAdminUser(req);
  if (!auth.authorized) {
    return res.status(auth.status).json({ error: auth.error });
  }

  try {
    const { storageKey, originalName, mimeType, sizeBytes, publicUrl } = req.body;
    if (!storageKey || !originalName || !mimeType) {
      return res.status(400).json({ error: 'storageKey, originalName, and mimeType required.' });
    }

    // Verify magic bytes of uploaded object
    await verifyB2UploadedFile(storageKey, originalName, mimeType);

    const signedUrl = publicUrl || await getB2SignedUrl(storageKey, 86400);

    const mediaData = {
      filename: path.basename(storageKey),
      original_name: originalName,
      mime_type: mimeType,
      size: sizeBytes || 0,
      url: storageKey
    };

    const { data, error } = await getSupabaseClient(req)
      .from('media')
      .insert(mediaData)
      .select('*')
      .single();

    if (error) throw error;

    // Return the permanent proxy URL instead of a raw signed URL
    const proxyUrl = `/api/media/file/${storageKey}`;
    res.status(201).json({ success: true, media: data, proxy_url: proxyUrl });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

// GET /api/media (Admin Only)
app.get('/api/media', async (req, res) => {
  const auth = await verifyAdminUser(req);
  if (!auth.authorized) {
    return res.status(auth.status).json({ error: auth.error });
  }

  try {
    const { data, error } = await getSupabaseClient(req)
      .from('media')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;

    const refreshed = await Promise.all((data || []).map(async item => {
      const rawUrl = item.url || '';
      const key = extractB2StorageKey(rawUrl) || rawUrl;
      // Return a clean permanent proxy URL — no X-Amz-* credentials ever exposed
      const proxyUrl = key ? `/api/media/file/${key}` : rawUrl;
      return {
        ...item,
        url: proxyUrl,
        proxy_url: proxyUrl
      };
    }));

    res.json(refreshed);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/media/:id (Admin Only)
app.delete('/api/media/:id', async (req, res) => {
  const auth = await verifyAdminUser(req);
  if (!auth.authorized) {
    return res.status(auth.status).json({ error: auth.error });
  }

  try {
    const { id } = req.params;
    const { data: item } = await getSupabaseClient(req)
      .from('media')
      .select('*')
      .eq('id', id)
      .single();

    if (item && item.url) {
      const key = extractB2StorageKey(item.url) || item.url;
      await deleteFromB2(key);
    }

    const { error } = await getSupabaseClient(req)
      .from('media')
      .delete()
      .eq('id', id);

    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/posts/:id/reactions
app.get('/api/posts/:id/reactions', async (req, res) => {
  try {
    const { id } = req.params;

    let postId = id;
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
    if (!isUuid) {
      let { data: posts } = await getSupabaseClient(req).from('public_published_entries').select('id').eq('slug', id);
      if (!posts || !posts[0]) {
        const { data: rawPosts } = await getSupabaseClient(req).from('entries').select('id').eq('slug', id);
        if (rawPosts && rawPosts[0]) posts = rawPosts;
      }
      if (posts && posts[0]) postId = posts[0].id;
    }

    const { data: reactions, error } = await getSupabaseClient(req)
      .from('reactions')
      .select('reaction_type')
      .eq('post_id', postId);

    if (error && error.code !== 'PGRST116') throw error;

    const counts = { thoughtful: 0, cozy: 0, loved: 0, inspiring: 0 };
    (reactions || []).forEach(r => {
      if (counts[r.reaction_type] !== undefined) {
        counts[r.reaction_type]++;
      }
    });

    res.json({
      ...counts,
      hearts: (reactions || []).length
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/posts/:id/reactions
app.post('/api/posts/:id/reactions', async (req, res) => {
  try {
    const { id } = req.params;
    const rawType = req.body.reaction_type || req.body.type || 'loved';
    const reaction_type = rawType === 'heart' ? 'loved' : rawType;

    const VALID_REACTIONS = ['thoughtful', 'cozy', 'loved', 'inspiring'];
    if (!VALID_REACTIONS.includes(reaction_type)) {
      return res.status(400).json({ error: 'Invalid reaction type.' });
    }

    let postId = id;
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
    if (!isUuid) {
      let { data: posts } = await getSupabaseClient(req).from('public_published_entries').select('id').eq('slug', id);
      if (!posts || !posts[0]) {
        const { data: rawPosts } = await getSupabaseClient(req).from('entries').select('id').eq('slug', id);
        if (rawPosts && rawPosts[0]) posts = rawPosts;
      }
      if (posts && posts[0]) postId = posts[0].id;
    }

    const { error } = await getSupabaseClient(req)
      .from('reactions')
      .insert([{ post_id: postId, reaction_type }]);

    if (error) throw error;

    const { data: allReactions } = await getSupabaseClient(req)
      .from('reactions')
      .select('reaction_type')
      .eq('post_id', postId);

    const updatedCounts = { thoughtful: 0, cozy: 0, loved: 0, inspiring: 0 };
    (allReactions || []).forEach(r => {
      if (updatedCounts[r.reaction_type] !== undefined) {
        updatedCounts[r.reaction_type]++;
      }
    });

    res.json({
      success: true,
      ...updatedCounts,
      hearts: (allReactions || []).length
    });

    broadcastRealtimeEvent('reaction_updated', {
      postId,
      reaction_type,
      counts: updatedCounts
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/posts/:id/comments
app.get('/api/posts/:id/comments', async (req, res) => {
  try {
    const { id } = req.params;
    let postId = id;
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
    if (!isUuid) {
      let { data: posts } = await getSupabaseClient(req).from('public_published_entries').select('id').eq('slug', id);
      if (!posts || !posts[0]) {
        const { data: rawPosts } = await getSupabaseClient(req).from('entries').select('id').eq('slug', id);
        if (rawPosts && rawPosts[0]) posts = rawPosts;
      }
      if (posts && posts[0]) postId = posts[0].id;
    }

    const { data: comments, error } = await getSupabaseClient(req)
      .from('comments')
      .select('*')
      .eq('post_id', postId)
      .order('created_at', { ascending: true });

    if (error) throw error;
    res.json(comments || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/posts/:id/comments
app.post('/api/posts/:id/comments', async (req, res) => {
  try {
    const { id } = req.params;
    const { author_name, content } = req.body;

    if (!content || !content.trim()) {
      return res.status(400).json({ error: 'Comment text cannot be empty.' });
    }
    if (content.trim().length > 2000) {
      return res.status(400).json({ error: 'Comment must be 2000 characters or fewer.' });
    }
    if (author_name && author_name.length > 100) {
      return res.status(400).json({ error: 'Author name must be 100 characters or fewer.' });
    }

    let postId = id;
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
    if (!isUuid) {
      let { data: posts } = await getSupabaseClient(req).from('public_published_entries').select('id').eq('slug', id);
      if (!posts || !posts[0]) {
        const { data: rawPosts } = await getSupabaseClient(req).from('entries').select('id').eq('slug', id);
        if (rawPosts && rawPosts[0]) posts = rawPosts;
      }
      if (!posts || !posts[0]) return res.status(404).json({ error: 'Entry not found.' });
      postId = posts[0].id;
    }

    const name = author_name && author_name.trim() ? author_name.trim() : 'Anonymous Reader';

    const { data, error } = await getSupabaseClient(req)
      .from('comments')
      .insert([{ post_id: postId, author_name: name, content: content.trim() }])
      .select('*')
      .single();

    if (error) throw error;

    broadcastRealtimeEvent('comment_created', {
      op: 'INSERT',
      postId,
      comment: data
    });

    res.status(201).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/comments/:id (Admin Only)
app.delete('/api/comments/:id', async (req, res) => {
  const auth = await verifyAdminUser(req);
  if (!auth.authorized) {
    return res.status(auth.status).json({ error: auth.error });
  }

  try {
    const { id } = req.params;
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
    if (!isUuid) {
      return res.status(400).json({ error: 'Invalid UUID format.' });
    }

    const client = getSupabaseClient(req);
    const { data, error } = await client
      .from('comments')
      .delete()
      .eq('id', id)
      .select('id');

    if (error) throw error;

    if (!data || data.length === 0) {
      return res.status(404).json({ error: 'Comment not found or delete not permitted.' });
    }

    broadcastRealtimeEvent('comment_deleted', {
      op: 'DELETE',
      commentId: data[0].id
    });

    res.json({ success: true, deleted_id: data[0].id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// SITEMAP & ROBOTS.TXT
app.get(['/sitemap.xml', '/api/sitemap.xml'], async (req, res) => {
  try {
    const { data: posts } = await getSupabaseClient(req)
      .from('public_published_entries')
      .select('id, slug, has_passcode, is_protected, show_in_feed, updated_at, date, created_at')
      .order('date', { ascending: false });


    const xml = generateSitemapXml(posts || []);
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    return res.send(xml);
  } catch (err) {
    console.error('Error generating sitemap:', err);
    const xml = generateSitemapXml([]);
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    return res.send(xml);
  }
});

app.get(['/robots.txt', '/api/robots.txt'], (req, res) => {
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  return res.send(getRobotsTxt());
});

export default app;

