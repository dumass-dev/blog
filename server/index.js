import express from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import { supabase, getSupabaseClient } from './supabase.js';
import { uploadToB2, getB2SignedUrl, deleteFromB2, isB2Configured } from './b2.js';

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
  let dbStatus = 'Connected';

  try {
    const { count: posts } = await getSupabaseClient(req).from('entries').select('*', { count: 'exact', head: true });
    const { count: media } = await getSupabaseClient(req).from('media').select('*', { count: 'exact', head: true });
    postCount = posts || 0;
    mediaCount = media || 0;
  } catch (e) {
    dbStatus = 'Degraded / Error';
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
  <title>q04ti — API Server Status</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600&family=Newsreader:ital,wght@0,400;0,500;1,400&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg: #11100f;
      --card-bg: #181715;
      --border: #262422;
      --border-hover: #3a3733;
      --text: #ededeb;
      --text-muted: #8e8880;
      --accent: #d48c70;
      --green: #4ade80;
      --green-bg: rgba(74, 222, 128, 0.1);
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background-color: var(--bg);
      color: var(--text);
      font-family: 'Inter', system-ui, sans-serif;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      padding: 2rem 1rem;
      line-height: 1.5;
    }
    .container {
      width: 100%;
      max-width: 680px;
    }
    .header {
      margin-bottom: 2.5rem;
      border-b: 1px solid var(--border);
      padding-bottom: 1.5rem;
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
    }
    .title {
      font-family: 'Newsreader', Georgia, serif;
      font-size: 2rem;
      font-weight: 500;
      letter-spacing: -0.02em;
    }
    .subtitle {
      font-size: 0.8125rem;
      color: var(--text-muted);
      margin-top: 0.25rem;
    }
    .status-badge {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      background: var(--green-bg);
      border: 1px solid rgba(74, 222, 128, 0.25);
      color: var(--green);
      font-size: 0.75rem;
      font-family: 'JetBrains Mono', monospace;
      padding: 0.35rem 0.75rem;
      border-radius: 9999px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .dot {
      width: 7px;
      height: 7px;
      background-color: var(--green);
      border-radius: 50%;
      box-shadow: 0 0 8px var(--green);
      animation: pulse 2s infinite;
    }
    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.4; }
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 1rem;
      margin-bottom: 2rem;
    }
    .card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 1.25rem;
      transition: border-color 0.2s;
    }
    .card:hover { border-color: var(--border-hover); }
    .card-label {
      font-size: 0.75rem;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin-bottom: 0.5rem;
    }
    .card-value {
      font-family: 'Newsreader', serif;
      font-size: 1.5rem;
      font-weight: 500;
    }
    .card-sub {
      font-size: 0.75rem;
      color: var(--text-muted);
      font-family: 'JetBrains Mono', monospace;
      margin-top: 0.25rem;
    }
    .section-title {
      font-size: 0.8125rem;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--text-muted);
      margin-bottom: 1rem;
    }
    .endpoints-list {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 8px;
      overflow: hidden;
      margin-bottom: 2rem;
    }
    .endpoint-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 0.875rem 1.25rem;
      border-bottom: 1px solid var(--border);
      text-decoration: none;
      color: var(--text);
      font-size: 0.875rem;
      transition: background 0.15s;
    }
    .endpoint-item:last-child { border-bottom: none; }
    .endpoint-item:hover { background: rgba(255, 255, 255, 0.03); }
    .endpoint-path {
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.8125rem;
      color: var(--accent);
    }
    .endpoint-desc {
      color: var(--text-muted);
      font-size: 0.8125rem;
    }
    .footer {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding-top: 1.5rem;
      border-top: 1px solid var(--border);
      font-size: 0.8125rem;
      color: var(--text-muted);
    }
    .btn {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      background: var(--text);
      color: var(--bg);
      text-decoration: none;
      font-size: 0.8125rem;
      font-weight: 500;
      padding: 0.5rem 1rem;
      border-radius: 6px;
      transition: opacity 0.2s;
    }
    .btn:hover { opacity: 0.9; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div>
        <h1 class="title">q04ti API Server</h1>
        <p class="subtitle">Personal Diary, Essays & Media Storage Backend</p>
      </div>
      <div class="status-badge">
        <div class="dot"></div>
        <span>Online</span>
      </div>
    </div>

    <div class="grid">
      <div class="card">
        <div class="card-label">Database</div>
        <div class="card-value" style="color: var(--green);">Supabase</div>
        <div class="card-sub">${postCount} Entries in Postgres</div>
      </div>

      <div class="card">
        <div class="card-label">Media Storage</div>
        <div class="card-value" style="color: var(--green);">Backblaze B2</div>
        <div class="card-sub">${mediaCount} Media Objects (S3)</div>
      </div>

      <div class="card">
        <div class="card-label">Server Uptime</div>
        <div class="card-value" style="font-family: 'JetBrains Mono', monospace; font-size: 1.125rem;">${uptimeFormatted}</div>
        <div class="card-sub">Port 3001 &bull; Node.js</div>
      </div>
    </div>

    <h2 class="section-title">Available API Endpoints</h2>
    <div class="endpoints-list">
      <a href="/api/posts" class="endpoint-item" target="_blank">
        <span class="endpoint-path">GET /api/posts</span>
        <span class="endpoint-desc">Fetch published journal entries & essays</span>
      </a>
      <a href="/api/media" class="endpoint-item" target="_blank">
        <span class="endpoint-path">GET /api/media</span>
        <span class="endpoint-desc">List media library with pre-signed URLs</span>
      </a>
      <a href="/api/stats" class="endpoint-item" target="_blank">
        <span class="endpoint-path">GET /api/stats</span>
        <span class="endpoint-desc">Admin metrics & view counters</span>
      </a>
      <a href="/api/about" class="endpoint-item" target="_blank">
        <span class="endpoint-path">GET /api/about</span>
        <span class="endpoint-desc">Author bio, projects & links</span>
      </a>
      <a href="/api/health" class="endpoint-item" target="_blank">
        <span class="endpoint-path">GET /api/health</span>
        <span class="endpoint-desc">System health ping endpoint</span>
      </a>
    </div>

    <div class="footer">
      <span>Version 2.0.0 &bull; Supabase & Backblaze B2</span>
      <a href="http://localhost:3000" class="btn">
        <span>Open Blog Site &rarr;</span>
      </a>
    </div>
  </div>
</body>
</html>`;

  res.send(html);
});


app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

/* ==========================================================================
   PUBLIC & ADMIN ENTRY ROUTES (SUPABASE POWERED)
   ========================================================================== */

// GET /api/stats — Admin dashboard summary metrics
app.get('/api/stats', async (req, res) => {
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

// GET /api/posts — List entries with filtering
app.get('/api/posts', async (req, res) => {
  try {
    const { status, type, category, tag, limit } = req.query;

    let query = getSupabaseClient(req).from('entries').select('*').order('date', { ascending: false });

    if (status) {
      query = query.eq('status', status);
    } else {
      // By default, public only sees published entries
      query = query.eq('status', 'published');
    }

    if (type) {
      query = query.eq('type', type);
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

    const { data: posts, error } = await query;

    if (error) throw error;

    // Process posts: Redact passcode-protected posts for non-admins
    const processed = (posts || []).map(post => {
      const has_passcode = Boolean(post.passcode && post.passcode.trim() !== '');
      if (has_passcode) {
        return {
          ...post,
          has_passcode: true,
          passcode: undefined,
          content: '🔒 This entry is passcode-protected. Enter passcode to unlock reading view.',
          excerpt: '🔒 Protected entry',
          cover_image: ''
        };
      }
      return {
        ...post,
        has_passcode: false,
        passcode: undefined
      };
    });

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
      .from('entries')
      .select('*')
      .eq('status', 'published')
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

    let query = getSupabaseClient(req).from('entries').select('*');

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

    // Increment view count in background
    getSupabaseClient(req)
      .from('entries')
      .update({ views: (post.views || 0) + 1 })
      .eq('id', post.id)
      .then(() => {})
      .catch(() => {});

    const has_passcode = Boolean(post.passcode && post.passcode.trim() !== '');
    if (has_passcode) {
      return res.json({
        ...post,
        has_passcode: true,
        passcode: undefined,
        content: '🔒 This entry is passcode-protected. Enter passcode to unlock reading view.',
        excerpt: '🔒 Protected entry',
        cover_image: ''
      });
    }

    res.json({
      ...post,
      has_passcode: false,
      passcode: undefined
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/posts/:id/verify-passcode — Verify entry passcode
app.post('/api/posts/:id/verify-passcode', async (req, res) => {
  try {
    const { id } = req.params;
    const { passcode } = req.body;

    let query = getSupabaseClient(req).from('entries').select('*');
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
    if (isUuid) {
      query = query.eq('id', id);
    } else {
      query = query.eq('slug', id);
    }

    const { data: posts, error } = await query;
    if (error) throw error;

    const post = posts && posts[0];
    if (!post) return res.status(404).json({ error: 'Entry not found.' });

    if (post.passcode && post.passcode.trim() === String(passcode).trim()) {
      return res.json({
        unlocked: true,
        content: post.content,
        cover_image: post.cover_image,
        excerpt: post.excerpt
      });
    }

    res.status(401).json({ unlocked: false, error: 'Incorrect passcode.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/posts — Create new entry
app.post('/api/posts', async (req, res) => {
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

    let finalTitle = title && title.trim() ? title.trim() : 'Untitled Update';
    let finalSlug = slug && slug.trim() ? slug.trim() : slugify(finalTitle);

    if (type === 'update' && (!title || !title.trim())) {
      const now = new Date();
      finalTitle = `Update — ${now.toLocaleDateString()}`;
      finalSlug = `update-${Date.now()}`;
    }

    const entryData = {
      title: finalTitle,
      slug: finalSlug,
      content: content.trim(),
      type: ['journal', 'writing', 'update'].includes(type) ? type : 'journal',
      status: ['published', 'draft', 'unlisted'].includes(status) ? status : 'published',
      category: category ? category.trim() : 'General',
      tags: tags ? tags.trim() : '',
      cover_image: cover_image ? cover_image.trim() : '',
      excerpt: excerpt ? excerpt.trim() : content.trim().substring(0, 150),
      date: date || new Date().toISOString(),
      location: location ? location.trim() : null,
      weather: weather ? weather.trim() : null,
      mood: mood ? mood.trim() : null,
      passcode: passcode && passcode.trim() !== '' ? passcode.trim() : null
    };

    const { data, error } = await getSupabaseClient(req).from('entries').insert([entryData]).select('*').single();

    if (error) throw error;

    res.status(201).json(data);
  } catch (err) {
    console.error('Error creating post in Supabase:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/posts/:id — Edit existing entry
app.put('/api/posts/:id', async (req, res) => {
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
    if (title !== undefined) updates.title = title.trim();
    if (slug !== undefined) updates.slug = slug.trim();
    if (content !== undefined) updates.content = content.trim();
    if (type !== undefined) updates.type = type;
    if (status !== undefined) updates.status = status;
    if (category !== undefined) updates.category = category.trim();
    if (tags !== undefined) updates.tags = tags.trim();
    if (cover_image !== undefined) updates.cover_image = cover_image.trim();
    if (excerpt !== undefined) updates.excerpt = excerpt.trim();
    if (date !== undefined) updates.date = date;
    if (location !== undefined) updates.location = location;
    if (weather !== undefined) updates.weather = weather;
    if (mood !== undefined) updates.mood = mood;
    if (passcode !== undefined) updates.passcode = passcode && passcode.trim() !== '' ? passcode.trim() : null;

    const { data, error } = await getSupabaseClient(req).from('entries').update(updates).eq('id', id).select('*').single();

    if (error) throw error;

    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/posts/:id — Delete entry
app.delete('/api/posts/:id', async (req, res) => {
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

// POST /api/media/upload — Upload media file to Backblaze B2 & record metadata in Supabase
app.post('/api/media/upload', upload.single('file'), async (req, res) => {
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

// GET /api/media — List uploaded media with fresh pre-signed URLs from Backblaze B2
app.get('/api/media', async (req, res) => {
  try {
    const { data: mediaList, error } = await getSupabaseClient(req)
      .from('media')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;

    // Attach temporary pre-signed B2 retrieval URLs for each private asset
    const listWithSignedUrls = await Promise.all(
      (mediaList || []).map(async item => {
        let signedUrl = item.url;
        if (isB2Configured() && item.url && !item.url.startsWith('http')) {
          const freshSignedUrl = await getB2SignedUrl(item.url, 7200); // 2 hour expiration
          if (freshSignedUrl) signedUrl = freshSignedUrl;
        }
        return {
          ...item,
          signed_url: signedUrl
        };
      })
    );

    res.json(listWithSignedUrls);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/media/:id — Delete media from Backblaze B2 and Supabase
app.delete('/api/media/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Fetch media record to get B2 storage key
    const { data: media, error: fetchErr } = await getSupabaseClient(req).from('media').select('*').eq('id', id).single();

    if (fetchErr || !media) {
      return res.status(404).json({ error: 'Media not found.' });
    }

    // Delete from Backblaze B2 if storage key
    if (isB2Configured() && media.url && !media.url.startsWith('http')) {
      await deleteFromB2(media.url);
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
      const { data: posts } = await getSupabaseClient(req).from('entries').select('id').eq('slug', id);
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
      const { data: posts } = await getSupabaseClient(req).from('entries').select('id').eq('slug', id);
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

// DELETE /api/comments/:id
app.delete('/api/comments/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { error } = await getSupabaseClient(req).from('comments').delete().eq('id', id);
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
      const { data: posts } = await getSupabaseClient(req).from('entries').select('id').eq('slug', id);
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

    res.json(counts);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/posts/:id/reactions
app.post('/api/posts/:id/reactions', async (req, res) => {
  try {
    const { id } = req.params;
    const { reaction_type } = req.body;

    if (!['thoughtful', 'cozy', 'loved', 'inspiring'].includes(reaction_type)) {
      return res.status(400).json({ error: 'Invalid reaction type.' });
    }

    let postId = id;
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
    if (!isUuid) {
      const { data: posts } = await getSupabaseClient(req).from('entries').select('id').eq('slug', id);
      if (!posts || !posts[0]) return res.status(404).json({ error: 'Post not found.' });
      postId = posts[0].id;
    }

    const { error } = await getSupabaseClient(req)
      .from('reactions')
      .insert([{ post_id: postId, reaction_type }]);

    if (error) throw error;

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ==========================================================================
   ABOUT & SETTINGS ROUTES (SUPABASE POWERED)
   ========================================================================== */

app.get('/api/about', async (req, res) => {
  try {
    const { data: settings, error } = await getSupabaseClient(req).from('settings').select('*');

    if (error) throw error;

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

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/about', async (req, res) => {
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

if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`Backend server active on http://localhost:${PORT} connected to Supabase & Backblaze B2.`);
  });
}

export default app;

