import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import { getSupabaseClient } from './supabase.js';
import { stripMarkdown } from '../src/utils/excerpt.js';
import { uploadToB2, deleteFromB2, isB2Configured, refreshB2Url, extractB2StorageKey } from './b2.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Memory storage for file uploads to pipe directly to Backblaze B2
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 100 * 1024 * 1024 } // 100MB max
});

// Helper: Slugify title
function slugify(text) {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/[\s\W-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const serverStartTime = Date.now();

/**
 * Strict Server-Side Admin Authentication Middleware (Fail Closed)
 * Verifies Supabase JWT token server-side and checks against ADMIN_USER_ID
 */
async function requireAdminAuth(req, res, next) {
  const rawAdminId = process.env.ADMIN_USER_ID || '';
  const cleanAdminId = rawAdminId.trim().toLowerCase();

  if (!cleanAdminId) {
    console.error('SECURITY ERROR: ADMIN_USER_ID environment variable is missing or whitespace-only. Access denied (Fail Closed).');
    return res.status(403).json({ error: 'Server authentication unconfigured. Access denied.' });
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or malformed Authorization header.' });
  }

  const token = authHeader.split(' ')[1];
  if (!token || token.trim() === '') {
    return res.status(401).json({ error: 'Authentication token missing.' });
  }

  let user = null;
  let authError = null;

  try {
    const client = getSupabaseClient(req);
    const authPromise = client.auth.getUser(token);
    const timeoutPromise = new Promise(resolve => 
      setTimeout(() => resolve({ data: null, error: { message: 'Auth timeout', isTimeout: true } }), 5000)
    );
    const result = await Promise.race([authPromise, timeoutPromise]);
    if (result) {
      if (result.error) {
        authError = result.error;
      }
      if (result.data && result.data.user) {
        user = result.data.user;
      }
    }
  } catch (err) {
    authError = err;
  }

  if (authError && (authError.isTimeout || authError.message === 'Auth timeout' || authError.status >= 500)) {
    return res.status(503).json({ error: 'Authentication service unavailable. Fail closed.' });
  }

  if (!user) {
    return res.status(401).json({ error: 'Invalid, revoked, or expired authentication token.' });
  }

  const cleanUserId = (user.id || '').trim().toLowerCase();

  if (!cleanUserId || cleanUserId !== cleanAdminId) {
    return res.status(403).json({ error: 'Forbidden: Authenticated user is not authorized as owner/admin.' });
  }

  req.user = user;
  next();
}

// Health & Root Status — Serving a sleek, editorial dark-mode status dashboard for browsers
app.get(['/', '/api', '/api/'], async (req, res) => {
  const acceptsHtml = req.headers.accept && req.headers.accept.includes('text/html');

  if (!acceptsHtml) {
    return res.json({
      status: 'online',
      name: 'q04ti Blog API Server (Supabase & Backblaze B2 Powered)',
      version: '2.0.0',
      website: 'http://localhost:3000',
      b2_configured: isB2Configured(),
      endpoints: {
        posts: '/api/posts',
        media: '/api/media',
        about: '/api/about',
        stats: '/api/stats',
        health: '/api/health'
      }
    });
  }

  // Fetch quick metrics for browser dashboard
  let postCount = 0;
  let mediaCount = 0;
  let _dbStatus = 'Connected';

  try {
    const { count: posts } = await getSupabaseClient(req).from('entries').select('*', { count: 'exact', head: true });
    const { count: media } = await getSupabaseClient(req).from('media').select('*', { count: 'exact', head: true });
    postCount = posts || 0;
    mediaCount = media || 0;
  } catch (_e) {
    _dbStatus = 'Degraded / Error';
  }

  const uptimeSec = Math.floor((Date.now() - serverStartTime) / 1000);
  const hours = Math.floor(uptimeSec / 3600);
  const minutes = Math.floor((uptimeSec % 3600) / 60);
  const seconds = uptimeSec % 60;
  const uptimeFormatted = `${hours}h ${minutes}m ${seconds}s`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>q04ti — API Service</title>
  <script>
    (function() {
      try {
        var saved = localStorage.getItem('diary-theme') || localStorage.getItem('theme');
        var isDark = saved ? saved === 'dark' : (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
        if (isDark) {
          document.documentElement.classList.add('dark');
        } else {
          document.documentElement.classList.remove('dark');
        }
      } catch(e) {}
    })();
  </script>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Newsreader:ital,wght@0,400;0,500;1,400&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg: #FFFFFF;
      --card-bg: #FAFAFA;
      --border: #E2E2E2;
      --border-hover: #000000;
      --text: #000000;
      --text-secondary: #444444;
      --text-muted: #777777;
      --accent-warm: #000000;
    }
    html.dark, body.dark {
      --bg: #0C0C0C;
      --card-bg: #141413;
      --border: #222220;
      --border-hover: #383734;
      --text: #EBE8E3;
      --text-secondary: #A09D96;
      --text-muted: #66645F;
      --accent-warm: #EBE8E3;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background-color: var(--bg);
      color: var(--text);
      font-family: 'Newsreader', Georgia, serif;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      padding: 3rem 1.5rem;
      line-height: 1.6;
      -webkit-font-smoothing: antialiased;
      transition: background-color 0.2s ease, color 0.2s ease;
    }
    .container {
      width: 100%;
      max-width: 640px;
    }
    .header {
      margin-bottom: 2.5rem;
      border-bottom: 1px solid var(--border);
      padding-bottom: 1.5rem;
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
    }
    .title {
      font-size: 2.25rem;
      font-weight: 500;
      letter-spacing: -0.02em;
    }
    .subtitle {
      font-family: 'Inter', system-ui, sans-serif;
      font-size: 0.8125rem;
      color: var(--text-muted);
      margin-top: 0.25rem;
    }
    .status-badge {
      display: inline-flex;
      align-items: center;
      gap: 0.4rem;
      font-family: 'Inter', system-ui, sans-serif;
      font-size: 0.7rem;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--text-secondary);
      padding: 0.25rem 0.6rem;
      border: 1px solid var(--border);
      border-radius: 4px;
      background: var(--card-bg);
      transition: background-color 0.2s, border-color 0.2s, color 0.2s;
    }
    .status-badge:hover {
      border-color: var(--border-hover);
    }
    .dot {
      width: 6px;
      height: 6px;
      background-color: #10B981;
      border-radius: 50%;
      box-shadow: 0 0 6px rgba(16, 185, 129, 0.4);
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 1rem;
      margin-bottom: 2.5rem;
    }
    .card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 1.25rem;
      transition: border-color 0.2s, background-color 0.2s;
    }
    .card:hover { border-color: var(--border-hover); }
    .card-label {
      font-family: 'Inter', system-ui, sans-serif;
      font-size: 0.7rem;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.08em;
      margin-bottom: 0.35rem;
    }
    .card-value {
      font-size: 1.65rem;
      font-weight: 500;
    }
    .card-sub {
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.725rem;
      color: var(--text-muted);
      margin-top: 0.25rem;
    }
    .section-title {
      font-family: 'Inter', system-ui, sans-serif;
      font-size: 0.7rem;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--text-muted);
      margin-bottom: 1rem;
    }
    .endpoints-list {
      border: 1px solid var(--border);
      border-radius: 6px;
      overflow: hidden;
      margin-bottom: 2.5rem;
      background: var(--card-bg);
      transition: background-color 0.2s, border-color 0.2s;
    }
    .endpoint-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 0.9rem 1.25rem;
      border-bottom: 1px solid var(--border);
      text-decoration: none;
      color: var(--text);
      transition: background 0.15s;
    }
    .endpoint-item:last-child { border-bottom: none; }
    .endpoint-item:hover { background: rgba(0, 0, 0, 0.03); }
    html.dark .endpoint-item:hover { background: rgba(255, 255, 255, 0.03); }
    .endpoint-path {
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.8125rem;
      color: var(--text);
    }
    .endpoint-desc {
      font-family: 'Inter', system-ui, sans-serif;
      color: var(--text-muted);
      font-size: 0.775rem;
    }
    .footer {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding-top: 1.5rem;
      border-top: 1px solid var(--border);
      font-family: 'Inter', system-ui, sans-serif;
      font-size: 0.775rem;
      color: var(--text-muted);
    }
    .btn {
      display: inline-flex;
      align-items: center;
      gap: 0.4rem;
      background: var(--text);
      color: var(--bg);
      text-decoration: none;
      font-family: 'Inter', system-ui, sans-serif;
      font-size: 0.775rem;
      font-weight: 500;
      padding: 0.45rem 0.9rem;
      border-radius: 4px;
      transition: opacity 0.2s;
    }
    .btn:hover { opacity: 0.85; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div>
        <h1 class="title">q04ti API</h1>
        <p class="subtitle">Personal Journal, Essays & Backblaze Media Backend</p>
      </div>
      <div style="display: flex; align-items: center; gap: 0.5rem;">
        <button id="theme-toggle-btn" class="status-badge" style="cursor: pointer; background: var(--card-bg);" title="Toggle Dark/Light Mode">
          <span id="theme-toggle-text">🌙 Dark</span>
        </button>
        <div class="status-badge">
          <div class="dot"></div>
          <span>Active</span>
        </div>
      </div>
    </div>

    <div class="grid">
      <div class="card">
        <div class="card-label">Postgres Engine</div>
        <div class="card-value">Supabase</div>
        <div class="card-sub">${postCount} DB entries</div>
      </div>

      <div class="card">
        <div class="card-label">Object Storage</div>
        <div class="card-value">Backblaze B2</div>
        <div class="card-sub">${mediaCount} media files</div>
      </div>

      <div class="card">
        <div class="card-label">Uptime</div>
        <div class="card-value" style="font-family: 'JetBrains Mono', monospace; font-size: 1.25rem;">${uptimeFormatted}</div>
        <div class="card-sub">Node.js Engine</div>
      </div>
    </div>

    <h2 class="section-title">API Endpoints</h2>
    <div class="endpoints-list">
      <a href="/api/posts" class="endpoint-item" target="_blank">
        <span class="endpoint-path">GET /api/posts</span>
        <span class="endpoint-desc">Published entries & journal feed</span>
      </a>
      <a href="/api/media" class="endpoint-item" target="_blank">
        <span class="endpoint-path">GET /api/media</span>
        <span class="endpoint-desc">Backblaze S3 media object index</span>
      </a>
      <a href="/api/stats" class="endpoint-item" target="_blank">
        <span class="endpoint-path">GET /api/stats</span>
        <span class="endpoint-desc">Author studio metrics & counters</span>
      </a>
      <a href="/api/about" class="endpoint-item" target="_blank">
        <span class="endpoint-path">GET /api/about</span>
        <span class="endpoint-desc">Bio & profile info</span>
      </a>
      <a href="/api/health" class="endpoint-item" target="_blank">
        <span class="endpoint-path">GET /api/health</span>
        <span class="endpoint-desc">Health check ping</span>
      </a>
    </div>

    <div class="footer">
      <span>q04ti Blog Engine &bull; Supabase & B2</span>
      <a href="/" class="btn">
        <span>Open Blog Site &rarr;</span>
      </a>
    </div>
  </div>

  <script>
    const btn = document.getElementById('theme-toggle-btn');
    const txt = document.getElementById('theme-toggle-text');

    function applyTheme(t) {
      if (t === 'dark') {
        document.documentElement.classList.add('dark');
        if (document.body) document.body.classList.add('dark');
        if (txt) txt.textContent = '☀️ Light';
      } else {
        document.documentElement.classList.remove('dark');
        if (document.body) document.body.classList.remove('dark');
        if (txt) txt.textContent = '🌙 Dark';
      }
    }

    const isCurrentlyDark = document.documentElement.classList.contains('dark');
    applyTheme(isCurrentlyDark ? 'dark' : 'light');

    if (btn) {
      btn.addEventListener('click', () => {
        const isDark = document.documentElement.classList.contains('dark');
        const nextTheme = isDark ? 'light' : 'dark';
        try {
          localStorage.setItem('diary-theme', nextTheme);
          localStorage.setItem('theme', nextTheme);
        } catch(e) {}
        applyTheme(nextTheme);
      });
    }
  </script>
</body>
</html>`;

  res.send(html);
});


app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// GET /api/b2/refresh — Auto-refresh expired presigned Backblaze B2 S3 URLs
app.get('/api/b2/refresh', async (req, res) => {
  try {
    const { url } = req.query;
    if (!url) return res.status(400).json({ error: 'URL query parameter required' });
    const freshUrl = await refreshB2Url(url);
    res.json({ url: freshUrl });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


/* ==========================================================================
   PUBLIC & ADMIN ENTRY ROUTES (SUPABASE POWERED)
   ========================================================================== */

// GET /api/stats — Admin dashboard summary metrics (Requires Admin Auth)
app.get('/api/stats', requireAdminAuth, async (req, res) => {
  try {
    const supabaseClient = getSupabaseClient(req);

    const { data: posts, error: postsErr } = await supabaseClient
      .from('entries')
      .select('id, type, status, views');

    if (postsErr) throw postsErr;

    const { count: mediaCount, error: mediaErr } = await supabaseClient
      .from('media')
      .select('*', { count: 'exact', head: true });

    if (mediaErr) throw mediaErr;

    const allPosts = posts || [];
    const total = allPosts.length;
    const published = allPosts.filter(p => p.status === 'published').length;
    const drafts = allPosts.filter(p => p.status === 'draft').length;
    const updates = allPosts.filter(p => p.type === 'update').length;
    const totalViews = allPosts.reduce((acc, p) => acc + (p.views || 0), 0);

    res.json({
      total,
      published,
      drafts,
      updates,
      mediaCount: mediaCount || 0,
      totalViews
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Helper: Check if request is authenticated as owner/admin
 */
async function checkIsAdmin(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return false;
  const token = authHeader.split(' ')[1];
  if (!token || !token.trim()) return false;
  const cleanAdminId = (process.env.ADMIN_USER_ID || '').trim().toLowerCase();
  if (!cleanAdminId) return false;

  try {
    const client = getSupabaseClient(req);
    const { data } = await client.auth.getUser(token);
    if (data && data.user && (data.user.id || '').trim().toLowerCase() === cleanAdminId) {
      return true;
    }
  } catch {}
  return false;
}

// GET /api/posts — List entries with filtering
app.get('/api/posts', async (req, res) => {
  try {
    res.setHeader('Cache-Control', 'public, max-age=15, stale-while-revalidate=120');
    const { status, type, category, tag, limit } = req.query;
    const isAdmin = await checkIsAdmin(req);

    let query = getSupabaseClient(req).from('entries').select('*').order('date', { ascending: false });

    // Restrict status=all or status=draft to authenticated admin only
    if (status === 'all' || status === 'draft') {
      if (!isAdmin) {
        query = query.eq('status', 'published');
      } else if (status === 'draft') {
        query = query.eq('status', 'draft');
      }
    } else {
      // By default, public only sees published entries
      query = query.eq('status', 'published');
    }

    if (type) {
      if (type === 'photo') {
        query = query.or('type.eq.photo,category.ilike.*photos*');
      } else {
        query = query.eq('type', type);
      }
    }

    if (category) {
      query = query.ilike('category', `%${category}%`);
    }

    if (tag) {
      query = query.ilike('tags', `%${tag}%`);
    }

    if (limit) {
      query = query.limit(parseInt(limit, 10));
    }

    let { data: posts, error } = await query;

    if (error || !posts || (type === 'photo' && posts.length === 0)) {
      try {
        const { data: fallbackPosts } = await getSupabaseClient(req)
          .from('entries')
          .select('*')
          .eq('status', 'published')
          .order('date', { ascending: false });

        if (fallbackPosts && fallbackPosts.length > 0) {
          if (type === 'photo') {
            posts = fallbackPosts.filter(item => 
              item.type === 'photo' || 
              (item.category && item.category.toLowerCase().includes('photos')) ||
              (item.cover_image && item.cover_image.trim() !== '')
            );
          } else {
            posts = fallbackPosts;
          }
        }
      } catch (_fbErr) {}
    }

    // Process posts: Redact passcode-protected posts ONLY for non-admins & refresh B2 presigned URLs
    const processed = await Promise.all((posts || []).map(async post => {
      const isPhoto = Boolean(
        post.type === 'photo' ||
        (post.category && post.category.toLowerCase() === 'photos')
      );
      const effectiveType = isPhoto ? 'photo' : post.type;
      const has_passcode = Boolean(post.has_passcode || post.is_protected || (post.passcode && post.passcode.trim() !== ''));

      let freshCover = post.cover_image;
      if (!freshCover || !freshCover.trim()) {
        const imgMatch = post.content && post.content.match(/https?:\/\/[^\s)"]+(?:images|videos|audio|files)\/\d{4}\/\d{2}\/[a-f0-9-]+\.[a-z0-9]+[^\s)"]*/i);
        if (imgMatch) freshCover = imgMatch[0];
      }
      freshCover = await refreshB2Url(freshCover);
      const freshContent = await refreshB2Url(post.content);

      if (!isAdmin && has_passcode) {
        return {
          ...post,
          type: effectiveType,
          has_passcode: true,
          passcode: undefined,
          content: '🔒 This entry is passcode-protected. Enter passcode to unlock reading view.',
          excerpt: '🔒 Protected entry',
          cover_image: ''
        };
      }
      return {
        ...post,
        type: effectiveType,
        cover_image: freshCover || post.cover_image || '',
        content: freshContent || post.content || '',
        has_passcode: has_passcode,
        passcode: isAdmin ? (post.passcode || '') : undefined
      };
    }));

    res.json(processed);
  } catch (err) {
    console.error('Error fetching posts from Supabase:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/posts/on-this-day — Fetch historical memory entries
app.get('/api/posts/on-this-day', async (req, res) => {
  try {
    const today = new Date();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');

    const { data: posts, error } = await getSupabaseClient(req)
      .from('public_published_entries')
      .select('*')
      .order('date', { ascending: false });

    if (error) throw error;

    const matched = (posts || []).filter(post => {
      if (!post.date) return false;
      const d = new Date(post.date);
      const postMonth = String(d.getMonth() + 1).padStart(2, '0');
      const postDay = String(d.getDate()).padStart(2, '0');
      return postMonth === month && postDay === day;
    });

    res.json(matched);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/posts/:identifier — Fetch single entry by ID or Slug
app.get('/api/posts/:identifier', async (req, res) => {
  try {
    const { identifier } = req.params;
    const isAdmin = await checkIsAdmin(req);
    const table = isAdmin ? 'entries' : 'public_published_entries';

    let query = getSupabaseClient(req).from(table).select('*');

    // Non-admin requests only fetch published entries (redundant on view, but clean)
    if (!isAdmin) {
      query = query.eq('status', 'published');
    }

    // Check if UUID or slug
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(identifier);
    if (isUuid) {
      query = query.eq('id', identifier);
    } else {
      query = query.eq('slug', identifier);
    }

    const { data: posts, error } = await query;
    if (error) throw error;

    const post = posts && posts[0];
    if (!post) {
      return res.status(404).json({ error: 'Entry not found.' });
    }

    // Increment view count in background via RPC
    getSupabaseClient(req)
      .rpc('increment_views', { target_slug: post.slug || post.id })
      .then(() => {})
      .catch(() => {});

    const isPhoto = Boolean(
      post.type === 'photo' ||
      (post.category && post.category.toLowerCase() === 'photos')
    );
    const effectiveType = isPhoto ? 'photo' : post.type;
    const has_passcode = Boolean(post.has_passcode || post.is_protected || (post.passcode && post.passcode.trim() !== ''));

    let freshCover = post.cover_image;
    if (!freshCover || !freshCover.trim()) {
      const imgMatch = post.content && post.content.match(/https?:\/\/[^\s)"]+(?:images|videos|audio|files)\/\d{4}\/\d{2}\/[a-f0-9-]+\.[a-z0-9]+[^\s)"]*/i);
      if (imgMatch) freshCover = imgMatch[0];
    }
    freshCover = await refreshB2Url(freshCover);

    const isUnlocked = isAdmin || !has_passcode || (req.query.unlocked === 'true');

    if (!isUnlocked) {
      return res.json({
        id: post.id,
        slug: post.slug,
        title: post.title,
        date: post.date,
        type: effectiveType,
        category: post.category,
        tags: post.tags,
        read_time: post.read_time,
        location: post.location,
        weather: post.weather,
        mood: post.mood,
        is_pinned: post.is_pinned,
        views: post.views,
        created_at: post.created_at,
        updated_at: post.updated_at,
        has_passcode: true,
        is_protected: true,
        excerpt: '🔒 Protected entry',
        cover_image: '',
        content: '🔒 This entry is passcode-protected.'
      });
    }

    const freshContent = await refreshB2Url(post.content);

    res.json({
      ...post,
      type: effectiveType,
      cover_image: freshCover || post.cover_image || '',
      content: freshContent || post.content || '',
      has_passcode
    });
  } catch (err) {
    console.error('Error fetching post:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/posts/:id/verify-passcode — Verify entry passcode
app.post('/api/posts/:id/verify-passcode', async (req, res) => {
  try {
    const { id } = req.params;
    const { passcode } = req.body;

    if (!passcode || typeof passcode !== 'string') {
      return res.status(400).json({ error: 'Passcode is required.' });
    }

    const { data, error } = await getSupabaseClient(req).rpc('get_protected_entry', {
      target_identifier: id,
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

// POST /api/posts — Create new entry (Requires Admin Auth)
app.post('/api/posts', requireAdminAuth, async (req, res) => {
  try {
    const {
      title,
      slug,
      content,
      type = 'journal',
      status = 'published',
      category,
      tags,
      cover_image,
      excerpt,
      date,
      location,
      weather,
      mood,
      passcode
    } = req.body;

    if (!content || !content.trim()) {
      return res.status(400).json({ error: 'Content is required.' });
    }

    let finalTitle = title && title.trim() ? title.trim() : (type === 'photo' ? `Photo — ${new Date().toLocaleDateString()}` : 'Untitled Update');
    let finalSlug = slug && slug.trim() ? slug.trim() : (type === 'photo' ? `photo-${Date.now()}` : slugify(finalTitle));

    if (type === 'update' && (!title || !title.trim())) {
      const now = new Date();
      finalTitle = `Update — ${now.toLocaleDateString()}`;
      finalSlug = `update-${Date.now()}`;
    }

    const isPhotoType = (type === 'photo');
    const dbType = isPhotoType ? 'journal' : (['journal', 'writing', 'update'].includes(type) ? type : 'journal');
    const dbCategory = isPhotoType ? (category && category.trim() ? category.trim() : 'Photos') : (category ? category.trim() : 'General');

    let finalCoverImage = cover_image ? cover_image.trim() : '';
    if (!finalCoverImage && content) {
      const imgMatch = content.match(/!\[.*?\]\((.*?)\)/) || content.match(/https?:\/\/[^\s)"]+(?:images|videos|audio|files)\/\d{4}\/\d{2}\/[a-f0-9-]+\.[a-z0-9]+[^\s)"]*/i);
      if (imgMatch) finalCoverImage = imgMatch[1] || imgMatch[0];
    }

    const entryData = {
      title: finalTitle,
      slug: finalSlug,
      content: content.trim(),
      type: dbType,
      status: ['published', 'draft', 'unlisted'].includes(status) ? status : 'published',
      category: dbCategory,
      tags: tags ? tags.trim() : '',
      cover_image: finalCoverImage,
      excerpt: stripMarkdown(excerpt || content, 150),
      date: date || new Date().toISOString(),
      location: location ? location.trim() : null,
      weather: weather ? weather.trim() : null,
      mood: mood ? mood.trim() : null,
      passcode: (passcode && passcode.trim() !== '') ? passcode.trim() : null,
      show_in_feed: req.body.show_in_feed !== undefined ? Boolean(req.body.show_in_feed) : (type !== 'photo')
    };

    let { data, error } = await getSupabaseClient(req).from('entries').insert([entryData]).select('*').single();

    if (error && (error.message.includes('show_in_feed') || error.message.includes('schema cache'))) {
      delete entryData.show_in_feed;
      const retry = await getSupabaseClient(req).from('entries').insert([entryData]).select('*').single();
      data = retry.data;
      error = retry.error;
    }

    if (error) throw error;

    res.status(201).json({
      ...data,
      type: isPhotoType ? 'photo' : data.type
    });
  } catch (err) {
    console.error('Error creating post in Supabase:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/posts/:id — Edit existing entry (Requires Admin Auth)
app.put('/api/posts/:id', requireAdminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const {
      title,
      slug,
      content,
      type,
      status,
      category,
      tags,
      cover_image,
      excerpt,
      date,
      location,
      weather,
      mood,
      passcode
    } = req.body;

    const updates = {};
    let isPhotoUpdate = false;
    if (type !== undefined) {
      if (type === 'photo') {
        isPhotoUpdate = true;
        updates.type = 'journal';
        if (!category) updates.category = 'Photos';
      } else {
        updates.type = type;
      }
    }
    if (title !== undefined) updates.title = title.trim();
    if (slug !== undefined) updates.slug = slug.trim();
    if (content !== undefined) updates.content = content.trim();
    if (status !== undefined) updates.status = status;
    if (category !== undefined) updates.category = category.trim();
    if (tags !== undefined) updates.tags = tags.trim();
    if (cover_image !== undefined) updates.cover_image = cover_image.trim();
    if (excerpt !== undefined) updates.excerpt = excerpt.trim();
    if (date !== undefined) updates.date = date;
    if (location !== undefined) updates.location = location;
    if (weather !== undefined) updates.weather = weather;
    if (mood !== undefined) updates.mood = mood;
    if (passcode !== undefined) {
      if (passcode && passcode.trim() !== '') {
        updates.passcode = passcode.trim();
      } else {
        updates.passcode = null;
      }
    }
    if (req.body.show_in_feed !== undefined) updates.show_in_feed = Boolean(req.body.show_in_feed);

    let { data, error } = await getSupabaseClient(req).from('entries').update(updates).eq('id', id).select('*').single();

    if (error && (error.message.includes('show_in_feed') || error.message.includes('schema cache'))) {
      delete updates.show_in_feed;
      const retry = await getSupabaseClient(req).from('entries').update(updates).eq('id', id).select('*').single();
      data = retry.data;
      error = retry.error;
    }

    if (error) throw error;

    res.json({
      ...data,
      type: (isPhotoUpdate || (data.category && data.category.toLowerCase() === 'photos')) ? 'photo' : data.type
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/posts/:id — Delete entry (Requires Admin Auth)
app.delete('/api/posts/:id', requireAdminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { error } = await getSupabaseClient(req).from('entries').delete().eq('id', id);

    if (error) throw error;

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ==========================================================================
   MEDIA UPLOAD & STORAGE (BACKBLAZE B2 + SUPABASE METADATA)
   ========================================================================== */

// POST /api/media/upload — Upload media file to Backblaze B2 & record metadata in Supabase (Requires Admin Auth)
app.post('/api/media/upload', requireAdminAuth, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded.' });
    }

    const file = req.file;

    if (isB2Configured()) {
      // 1. Upload file binary directly to Backblaze B2
      const b2Result = await uploadToB2(file.buffer, file.originalname, file.mimetype);

      // 2. Insert metadata row into Supabase 'media' table
      const mediaRow = {
        filename: path.basename(b2Result.storageKey),
        original_name: file.originalname,
        mime_type: file.mimetype,
        size: file.size,
        url: b2Result.storageKey // Store the B2 key reference
      };

      const { data, error } = await getSupabaseClient(req).from('media').insert([mediaRow]).select('*').single();

      if (error) throw error;

      return res.status(201).json({
        ...data,
        signed_url: b2Result.signedUrl
      });
    } else {
      return res.status(500).json({ error: 'Backblaze B2 credentials missing in server .env file.' });
    }
  } catch (err) {
    console.error('Upload Error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/media — List uploaded media with fresh pre-signed URLs from Backblaze B2 (Requires Admin Auth)
app.get('/api/media', requireAdminAuth, async (req, res) => {
  try {
    const { data: mediaList, error } = await getSupabaseClient(req)
      .from('media')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;

    // Attach temporary pre-signed B2 retrieval URLs for each private asset
    const listWithSignedUrls = await Promise.all(
      (mediaList || []).map(async item => {
        const rawUrl = item.url || '';
        const key = extractB2StorageKey(rawUrl) || rawUrl;
        const freshUrl = await refreshB2Url(key);
        return {
          ...item,
          url: freshUrl || rawUrl,
          signed_url: freshUrl || rawUrl
        };
      })
    );

    res.json(listWithSignedUrls);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/media/:id — Delete media from Backblaze B2 and Supabase (Requires Admin Auth)
app.delete('/api/media/:id', requireAdminAuth, async (req, res) => {
  try {
    const { id } = req.params;

    // Fetch media record to get B2 storage key
    const { data: media, error: fetchErr } = await getSupabaseClient(req).from('media').select('*').eq('id', id).single();

    if (fetchErr || !media) {
      return res.status(404).json({ error: 'Media not found.' });
    }

    // Delete from Backblaze B2 if storage key
    if (isB2Configured() && media.url) {
      const key = extractB2StorageKey(media.url) || media.url;
      await deleteFromB2(key);
    }

    // Delete row from Supabase
    const { error: delErr } = await getSupabaseClient(req).from('media').delete().eq('id', id);
    if (delErr) throw delErr;

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ==========================================================================
   COMMENTS & REACTIONS (SUPABASE POWERED)
   ========================================================================== */

// GET /api/posts/:id/comments
app.get('/api/posts/:id/comments', async (req, res) => {
  try {
    const { id } = req.params;

    // Get post UUID if slug was passed
    let postId = id;
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
    if (!isUuid) {
      const { data: posts } = await getSupabaseClient(req).from('public_published_entries').select('id').eq('slug', id);
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

    let postId = id;
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
    if (!isUuid) {
      const { data: posts } = await getSupabaseClient(req).from('public_published_entries').select('id').eq('slug', id);
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

    res.status(201).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/comments/:id — Delete comment (Requires Admin Auth)
app.delete('/api/comments/:id', requireAdminAuth, async (req, res) => {
  try {
    const { id } = req.params;

    // Validate UUID format
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

    res.json({ success: true, deleted_id: data[0].id });
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
      const { data: posts } = await getSupabaseClient(req).from('public_published_entries').select('id').eq('slug', id);
      if (posts && posts[0]) postId = posts[0].id;
    }

    const { data: reactions, error } = await getSupabaseClient(req)
      .from('reactions')
      .select('reaction_type')
      .eq('post_id', postId);

    if (error) throw error;

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

    if (!['thoughtful', 'cozy', 'loved', 'inspiring'].includes(reaction_type)) {
      return res.status(400).json({ error: 'Invalid reaction type.' });
    }

    let postId = id;
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
    if (!isUuid) {
      const { data: posts } = await getSupabaseClient(req).from('public_published_entries').select('id').eq('slug', id);
      if (!posts || !posts[0]) return res.status(404).json({ error: 'Post not found.' });
      postId = posts[0].id;
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
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ==========================================================================
   ABOUT & SETTINGS ROUTES (SUPABASE POWERED)
   ========================================================================== */

let cachedAboutData = null;
let cachedAboutTimestamp = 0;

app.get('/api/about', async (req, res) => {
  try {
    if (cachedAboutData && (Date.now() - cachedAboutTimestamp < 60000)) {
      return res.json(cachedAboutData);
    }

    const { data: settings, error } = await getSupabaseClient(req).from('settings').select('*');

    if (error && !cachedAboutData) throw error;

    const result = {
      author_name: 'q04ti',
      tagline: 'thoughts, things I make, places I go, and everything in between.',
      bio: '',
      projects: [],
      links: []
    };

    (settings || []).forEach(row => {
      if (row.key === 'projects' || row.key === 'links') {
        try {
          result[row.key] = JSON.parse(row.value);
        } catch {
          result[row.key] = [];
        }
      } else {
        result[row.key] = row.value;
      }
    });

    cachedAboutData = result;
    cachedAboutTimestamp = Date.now();

    res.json(result);
  } catch (err) {
    if (cachedAboutData) return res.json(cachedAboutData);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/about', requireAdminAuth, async (req, res) => {
  try {
    const { author_name, tagline, bio, projects, links } = req.body;

    const rowsToUpsert = [];
    if (author_name !== undefined) rowsToUpsert.push({ key: 'author_name', value: author_name });
    if (tagline !== undefined) rowsToUpsert.push({ key: 'tagline', value: tagline });
    if (bio !== undefined) rowsToUpsert.push({ key: 'bio', value: bio });
    if (projects !== undefined) rowsToUpsert.push({ key: 'projects', value: JSON.stringify(projects) });
    if (links !== undefined) rowsToUpsert.push({ key: 'links', value: JSON.stringify(links) });

    if (rowsToUpsert.length > 0) {
      const { error } = await getSupabaseClient(req).from('settings').upsert(rowsToUpsert);
      if (error) throw error;
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

if (!process.env.VERCEL && process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`Backend server active on http://localhost:${PORT} connected to Supabase & Backblaze B2.`);
  });
}

export default app;

