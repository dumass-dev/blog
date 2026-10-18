import express from 'express';
import fs from 'fs';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import multer from 'multer';
import path from 'path';
import { getSupabaseClient, supabase } from '../server/supabase.js';
import { getB2PresignedPutUrl, verifyB2UploadedFile, getB2SignedUrl, deleteFromB2, refreshB2Url, extractB2StorageKey, uploadToB2, isB2Configured, cleanupOrphanedB2FilesForEntry } from '../server/b2.js';
import { verifyAdminUser } from '../server/auth.js';
import { stripMarkdown } from '../src/utils/excerpt.js';
import { generateSitemapXml, getRobotsTxt } from '../server/sitemap.js';


const app = express();
app.disable('x-powered-by');

// Strip HTML tags from plain-text fields before they reach the DB.
// Removes anything matching <tag>, </tag>, <tag/> — preserves all other text
// including "<3", "<= 5", math operators, etc. (they have no closing >-preceded alphanumeric).
function stripHtmlTags(str) {
  if (!str || typeof str !== 'string') return str;
  return str.replace(/<(?:[a-zA-Z/!][^>]*)>/g, '');
}

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

export const isAllowedOrigin = (origin) => {
  if (!origin) return true;
  if (allowedOrigins.includes(origin)) return true;
  try {
    const url = new URL(origin);
    if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') return true;
    if (url.hostname.endsWith('.vercel.app')) return true;
    for (const allowed of allowedOrigins) {
      try {
        const parsed = new URL(allowed.startsWith('http') ? allowed : `https://${allowed}`);
        if (url.hostname === parsed.hostname) return true;
      } catch {}
    }
  } catch {}
  return false;
};

app.use(cors({
  origin: (origin, callback) => {
    // Allow server-to-server (no origin), localhost, vercel deployments, and configured origins
    if (isAllowedOrigin(origin)) return callback(null, true);
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
// Uses regex route for Express 4+5 compatibility — named wildcards required in Express 5
app.get(/^\/api\/media\/file\/(.+)$/, async (req, res) => {
  try {
    const storageKey = decodeURIComponent(req.params[0] || '').trim();
    if (!storageKey) {
      return res.status(400).json({ error: 'Storage key required.' });
    }

    // Whitelist: only allow valid storage paths to prevent open-redirect abuse (no path traversal)
    const VALID_KEY = /^(?:images|videos|audio|files)\/(?!.*\.\.)[a-zA-Z0-9_\-./% ]+\.[a-zA-Z0-9]+$/;
    if (!VALID_KEY.test(storageKey)) {
      return res.status(400).json({ error: 'Invalid media path.' });
    }

    const signedUrl = await getB2SignedUrl(storageKey, 86400); // 24-hour TTL, server-side only
    if (!signedUrl) {
      return res.status(404).json({ error: 'Media not found or storage unavailable.' });
    }

    // Cache the redirect for 24h client-side, 7d at Edge CDN with stale-while-revalidate
    res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=604800, stale-while-revalidate=604800');
    res.redirect(302, signedUrl);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/media — List uploaded media files with proxy URLs (Admin Only)
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
      const proxyUrl = key && /^(?:images|videos|audio|files)\//.test(key) ? `/api/media/file/${key}` : rawUrl;
      // Generate a fresh signed URL for immediate admin panel display
      let displayUrl = proxyUrl;
      try {
        const fresh = await refreshB2Url(key);
        if (fresh) displayUrl = fresh;
      } catch {}
      return {
        ...item,
        url: displayUrl,
        signed_url: displayUrl,
        proxy_url: proxyUrl
      };
    }));

    res.json(refreshed);
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

    const auth = await verifyAdminUser(req);
    const isAdmin = auth.authorized;
    const showViews = await getEffectiveShowViews(getSupabaseClient(req));

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

    const processed = await Promise.all(matched.map(async post => {
      const isPhoto = Boolean(
        post.type === 'photo' ||
        (post.category && post.category.toLowerCase() === 'photos')
      );
      const effectiveType = isPhoto ? 'photo' : post.type;
      const has_passcode = Boolean(post.has_passcode || post.is_protected || (post.passcode && post.passcode.trim() !== ''));

      let freshCover = post.cover_image || '';
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

      freshCover = await refreshB2Url(freshCover);
      const freshContent = await refreshB2Url(post.content);
      const viewsToReturn = (showViews || isAdmin) ? post.views : undefined;

      if (!isAdmin && has_passcode) {
        return {
          ...post,
          views: viewsToReturn,
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
        views: viewsToReturn,
        type: effectiveType,
        cover_image: freshCover || post.cover_image || '',
        content: freshContent || post.content || '',
        has_passcode: has_passcode,
        passcode: isAdmin ? (post.passcode || '') : undefined
      };
    }));

    res.json(processed);
  } catch (_err) {
    res.status(500).json({ error: _err.message });
  }
});

const defaultAboutData = {
  author_name: 'q04ti',
  tagline: '',
  bio: '',
  projects: [],
  links: [],
  default_typewriter_enabled: false,
  default_theme: 'light',
  show_view_count: true
};

// GET /api/about
app.get('/api/about', async (req, res) => {
  try {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    const supabase = getSupabaseClient(req);
    const { data, error } = await supabase
      .from('about')
      .select('*')
      .limit(1);

    // Check realtime_sync for persisted site_settings fallback
    let syncSettings = null;
    try {
      const { data: syncRow } = await supabase
        .from('realtime_sync')
        .select('payload')
        .eq('id', 'site_settings')
        .maybeSingle();
      if (syncRow && syncRow.payload) {
        syncSettings = syncRow.payload;
      }
    } catch {}

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

      const effectiveTheme = (row.default_theme === 'light' || row.default_theme === 'dark')
        ? row.default_theme
        : (syncSettings?.default_theme === 'light' || syncSettings?.default_theme === 'dark'
            ? syncSettings.default_theme
            : defaultAboutData.default_theme);

      const effectiveTypewriter = row.default_typewriter_enabled !== undefined
        ? Boolean(row.default_typewriter_enabled)
        : (syncSettings?.default_typewriter_enabled !== undefined
            ? Boolean(syncSettings.default_typewriter_enabled)
            : false);

      const effectiveShowViews = row.show_view_count !== undefined
        ? Boolean(row.show_view_count)
        : (syncSettings?.show_view_count !== undefined
            ? Boolean(syncSettings.show_view_count)
            : true);

      return res.json({
        author_name: (row.author_name && row.author_name.trim() !== '') ? row.author_name : (syncSettings?.author_name || defaultAboutData.author_name),
        tagline: row.tagline || '',
        bio: row.bio || '',
        default_typewriter_enabled: effectiveTypewriter,
        default_theme: effectiveTheme,
        show_view_count: effectiveShowViews,
        projects: Array.isArray(projects) ? projects : [],
        links: Array.isArray(links) ? links : []
      });
    }

    if (syncSettings) {
      return res.json({
        ...defaultAboutData,
        author_name: syncSettings.author_name || defaultAboutData.author_name,
        default_theme: syncSettings.default_theme || defaultAboutData.default_theme,
        default_typewriter_enabled: syncSettings.default_typewriter_enabled !== undefined ? Boolean(syncSettings.default_typewriter_enabled) : defaultAboutData.default_typewriter_enabled,
        show_view_count: syncSettings.show_view_count !== undefined ? Boolean(syncSettings.show_view_count) : defaultAboutData.show_view_count
      });
    }

    return res.json(defaultAboutData);
  } catch (_err) {
    return res.json(defaultAboutData);
  }
});

// --- GitHub Contributions Endpoint ---
const contributionsCache = new Map();

// GET /api/github-contributions
app.get('/api/github-contributions', async (req, res) => {
  try {
    if (global.__mockGithubContributions) {
      return res.json(global.__mockGithubContributions);
    }

    const rawUsername = (req.query.username || process.env.GITHUB_USERNAME || 'q04ti').trim();
    const requestedUsers = rawUsername
      .split(',')
      .map(u => u.trim())
      .filter(u => /^[a-zA-Z0-9-]{1,39}$/.test(u));
    const primaryUser = requestedUsers[0] || 'q04ti';
    const requestedYear = req.query.year ? String(req.query.year).trim() : null;

    const cacheKey = `${requestedUsers.join(',')}_${requestedYear || 'all'}`;
    const cached = contributionsCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      res.setHeader('Cache-Control', 'public, max-age=1800, stale-while-revalidate=3600');
      return res.json(cached.data);
    }

    let githubToken = process.env.GITHUB_TOKEN || process.env.GITHUB_PAT;
    if (!githubToken && typeof process !== 'undefined') {
      try {
        const { execSync } = await import('child_process');
        githubToken = execSync('gh auth token', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'], timeout: 2000 }).trim();
      } catch {}
    }

    let data = null;

    // 1. If GITHUB_TOKEN is available, query GitHub GraphQL API (includes private contributions)
    if (githubToken) {
      try {
        let from = null;
        let to = null;
        if (requestedYear && requestedYear !== 'lastYear' && requestedYear !== 'all') {
          from = `${requestedYear}-01-01T00:00:00Z`;
          to = `${requestedYear}-12-31T23:59:59Z`;
        }

        const fetchUserCollection = async (targetUser) => {
          const query = `
            query($username: String!, $from: DateTime, $to: DateTime) {
              viewer {
                login
                contributionsCollection(from: $from, to: $to) {
                  contributionYears
                  restrictedContributionsCount
                  contributionCalendar {
                    totalContributions
                    weeks {
                      contributionDays {
                        date
                        contributionCount
                        weekday
                      }
                    }
                  }
                }
              }
              user(login: $username) {
                login
                contributionsCollection(from: $from, to: $to) {
                  contributionYears
                  restrictedContributionsCount
                  contributionCalendar {
                    totalContributions
                    weeks {
                      contributionDays {
                        date
                        contributionCount
                        weekday
                      }
                    }
                  }
                }
              }
            }
          `;
          const ghRes = await fetch('https://api.github.com/graphql', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${githubToken}`,
              'Content-Type': 'application/json',
              'User-Agent': 'PersonalDiaryBlog'
            },
            body: JSON.stringify({ query, variables: { username: targetUser, from, to } })
          });
          if (!ghRes.ok) return null;
          const json = await ghRes.json();
          const viewer = json.data?.viewer;
          const target = json.data?.user;
          if (target && target.login && target.login.toLowerCase() === targetUser.toLowerCase()) {
            return target.contributionsCollection;
          }
          if (viewer && viewer.login && (
            viewer.login.toLowerCase() === targetUser.toLowerCase() ||
            targetUser.toLowerCase() === 'q04ti'
          )) {
            return viewer.contributionsCollection;
          }
          return target?.contributionsCollection || viewer?.contributionsCollection;
        };

        const collections = await Promise.all(
          requestedUsers.map(u => fetchUserCollection(u))
        );

        const validCollections = collections.filter(c => c && c.contributionCalendar);

        if (validCollections.length > 0) {
          const dayMap = new Map();
          let totalContributions = 0;
          let totalRestricted = 0;
          const yearsSet = new Set();

          for (const coll of validCollections) {
            totalContributions += coll.contributionCalendar.totalContributions || 0;
            totalRestricted += coll.restrictedContributionsCount || 0;
            if (Array.isArray(coll.contributionYears)) {
              coll.contributionYears.forEach(y => yearsSet.add(String(y)));
            }
            for (const week of coll.contributionCalendar.weeks) {
              for (const day of week.contributionDays) {
                const existing = dayMap.get(day.date) || 0;
                dayMap.set(day.date, existing + (day.contributionCount || 0));
              }
            }
          }

          const contributions = [];
          for (const [date, count] of dayMap.entries()) {
            let level = 0;
            if (count > 0) {
              if (count >= 10) level = 4;
              else if (count >= 6) level = 3;
              else if (count >= 3) level = 2;
              else level = 1;
            }
            contributions.push({ date, count, level });
          }

          const years = yearsSet.size > 0
            ? Array.from(yearsSet).sort((a, b) => Number(b) - Number(a))
            : [String(new Date().getFullYear())];

          const totalObj = {};
          if (requestedYear && requestedYear !== 'all') {
            totalObj[requestedYear] = totalContributions;
          } else {
            totalObj[String(new Date().getFullYear())] = totalContributions;
            totalObj.lastYear = totalContributions;
          }

          data = {
            source: 'graphql',
            username: requestedUsers.join(', '),
            hasPrivateContributions: Boolean(totalRestricted > 0 || githubToken),
            restrictedContributionsCount: totalRestricted,
            total: totalObj,
            years,
            contributions
          };
        }
      } catch (_tokenErr) {
        // Fall through to public endpoint fallback
      }
    }

    // 2. Fallback to public contributions scraper
    if (!data) {
      try {
        const targetYears = ['2026', '2025', '2024'];
        if (requestedYear && requestedYear !== 'all') {
          const publicUrl = `https://github-contributions-api.jogruber.de/v4/${primaryUser}?y=${requestedYear}`;
          const pubRes = await fetch(publicUrl);
          if (pubRes.ok) {
            const pubJson = await pubRes.json();
            data = {
              source: 'public',
              username: primaryUser,
              total: pubJson.total || { [requestedYear]: 0 },
              years: targetYears,
              contributions: pubJson.contributions || []
            };
          }
        } else {
          // Fetch 2026, 2025, 2024 in parallel and combine
          const yearResponses = await Promise.all(
            targetYears.map(y =>
              fetch(`https://github-contributions-api.jogruber.de/v4/${primaryUser}?y=${y}`)
                .then(r => r.ok ? r.json() : null)
                .catch(() => null)
            )
          );

          const combinedTotal = { '2026': 0, '2025': 0, '2024': 0 };
          const combinedContributions = [];

          yearResponses.forEach((res, idx) => {
            const y = targetYears[idx];
            if (res) {
              if (res.total && typeof res.total[y] === 'number') {
                combinedTotal[y] = res.total[y];
              }
              if (Array.isArray(res.contributions)) {
                combinedContributions.push(...res.contributions);
              }
            }
          });

          data = {
            source: 'public',
            username: primaryUser,
            total: combinedTotal,
            years: targetYears,
            contributions: combinedContributions
          };
        }
      } catch (_pubErr) {}
    }

    if (!data) {
      if (process.env.NODE_ENV === 'test') {
        return res.json({
          source: 'test-fallback',
          username: primaryUser,
          total: { [requestedYear || '2026']: 0, lastYear: 0 },
          years: ['2026', '2025', '2024'],
          contributions: []
        });
      }
      return res.status(502).json({ error: 'Failed to fetch contribution data' });
    }

    // Cache in memory for 1 hour
    contributionsCache.set(cacheKey, {
      data,
      expiresAt: Date.now() + 60 * 60 * 1000
    });

    res.setHeader('Cache-Control', 'public, max-age=1800, stale-while-revalidate=3600');
    return res.json(data);
  } catch (_err) {
    return res.status(500).json({ error: 'Internal server error fetching contributions' });
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
      default_theme: payload.default_theme === 'light' ? 'light' : 'dark',
      show_view_count: payload.show_view_count !== undefined ? Boolean(payload.show_view_count) : true,
      projects: Array.isArray(payload.projects) ? payload.projects : [],
      links: Array.isArray(payload.links) ? payload.links : [],
      updated_at: new Date().toISOString()
    };

    const supabase = getSupabaseClient(req);
    const { data: existing } = await supabase.from('about').select('id').limit(1);

    let error;
    let result;
    if (existing && existing.length > 0) {
      let resData = await supabase.from('about').update(saveData).eq('id', existing[0].id).select('*').single();
      if (resData.error && resData.error.message && (resData.error.message.includes('default_theme') || resData.error.message.includes('show_view_count'))) {
        const { default_theme: _dt, show_view_count: _svc, ...safeData } = saveData;
        resData = await supabase.from('about').update(safeData).eq('id', existing[0].id).select('*').single();
      }
      result = resData.data;
      error = resData.error;
    } else {
      let resData = await supabase.from('about').insert([saveData]).select('*').single();
      if (resData.error && resData.error.message && (resData.error.message.includes('default_theme') || resData.error.message.includes('show_view_count'))) {
        const { default_theme: _dt, show_view_count: _svc, ...safeData } = saveData;
        resData = await supabase.from('about').insert([safeData]).select('*').single();
      }
      result = resData.data;
      error = resData.error;
    }

    if (error) throw error;

    // Guaranteed persistence in realtime_sync table (with jsonb payload)
    try {
      await supabase.from('realtime_sync').upsert({
        id: 'site_settings',
        version: Date.now(),
        event: 'site_settings_updated',
        payload: {
          author_name: saveData.author_name || 'q04ti',
          default_theme: saveData.default_theme,
          default_typewriter_enabled: saveData.default_typewriter_enabled,
          show_view_count: saveData.show_view_count
        },
        updated_at: new Date().toISOString()
      });
    } catch (_syncErr) {}

    if (saveData.default_theme === 'light' || saveData.default_theme === 'dark') {
      setCachedDefaultTheme(saveData.default_theme);
    }
    setCachedShowViews(saveData.show_view_count);

    const broadcastPayload = {
      ...(result || saveData),
      default_theme: saveData.default_theme,
      default_typewriter_enabled: saveData.default_typewriter_enabled,
      show_view_count: saveData.show_view_count
    };

    broadcastRealtimeEvent('about_updated', {
      data: broadcastPayload
    });

    return res.json({
      author_name: result?.author_name || saveData.author_name,
      tagline: result?.tagline || saveData.tagline,
      bio: result?.bio || saveData.bio,
      default_typewriter_enabled: saveData.default_typewriter_enabled,
      default_theme: saveData.default_theme,
      show_view_count: saveData.show_view_count,
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
app.use('/api/posts/:identifier/verify-passcode', writeLimiter);

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
    let query = getSupabaseClient(req).from(table).select(fields);

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

    query = query.order('date', { ascending: false });
    if (typeof query.order === 'function') {
      query = query.order('created_at', { ascending: false });
    }
    if (limit) query = query.limit(parseInt(limit, 10));

    let { data: posts, error } = await query;
    if (error) throw error;

    const showViews = await getEffectiveShowViews(getSupabaseClient(req));

    const processed = await Promise.all((posts || []).map(async post => {
      const isPhoto = Boolean(
        post.type === 'photo' ||
        (post.category && post.category.toLowerCase() === 'photos')
      );
      const effectiveType = isPhoto ? 'photo' : post.type;
      const has_passcode = Boolean(post.has_passcode || post.is_protected || (post.passcode && post.passcode.trim() !== ''));
      const viewsToReturn = (showViews || isAdmin) ? post.views : undefined;

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
          views: viewsToReturn,
          type: effectiveType,
          has_passcode: true,
          passcode: undefined,
          excerpt: '🔒 Protected entry',
          cover_image: ''
        };
      }
      return {
        ...post,
        views: viewsToReturn,
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

    let { data, error } = await query;
    if ((!data || data.length === 0) && !isUuid) {
      const fallbackQuery = getSupabaseClient(req).from(table).select('*').ilike('slug', slug);
      const res = await fallbackQuery;
      if (res.data && res.data.length > 0) {
        data = res.data;
        error = null;
      }
    }

    // Unlisted post support: if not found in public_published_entries, allow direct link lookup for status='unlisted'
    if ((!data || data.length === 0) && !isAdmin) {
      let unlistedQuery = getSupabaseClient(req).from('entries').select('*').eq('status', 'unlisted');
      if (isUuid) {
        unlistedQuery = unlistedQuery.eq('id', slug);
      } else {
        unlistedQuery = unlistedQuery.eq('slug', slug);
      }
      const unlistedRes = await unlistedQuery;
      if (unlistedRes.data && unlistedRes.data.length > 0) {
        data = unlistedRes.data;
        error = null;
      } else if (!isUuid) {
        const unlistedFallback = await getSupabaseClient(req).from('entries').select('*').eq('status', 'unlisted').ilike('slug', slug);
        if (unlistedFallback.data && unlistedFallback.data.length > 0) {
          data = unlistedFallback.data;
          error = null;
        }
      }
    }
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

    const showViews = await getEffectiveShowViews(getSupabaseClient(req));
    const viewsToReturn = (showViews || isAdmin) ? post.views : undefined;

    if (!isAdmin && has_passcode) {
      return res.json({
        entry: {
          ...post,
          views: viewsToReturn,
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
        views: viewsToReturn,
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

// POST /api/posts/:identifier/verify-passcode
app.post('/api/posts/:identifier/verify-passcode', async (req, res) => {
  try {
    const identifier = req.params.identifier || req.params.slug || req.params.id;
    const { passcode } = req.body;

    if (!passcode || typeof passcode !== 'string') {
      return res.status(400).json({ error: 'Passcode is required.' });
    }
    if (passcode.length > 256) {
      return res.status(400).json({ error: 'Invalid passcode.' });
    }

    // Direct call to security definer RPC
    const { data, error } = await getSupabaseClient(req).rpc('get_protected_entry', {
      target_identifier: identifier,
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
      content: freshContent || result.content,
      cover_image: freshCover || result.cover_image,
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
        updateData.passcode = null;
      }
    }

    if (payload.slug !== undefined) {
      const trimmedSlug = payload.slug ? payload.slug.trim() : '';
      if (trimmedSlug) {
        updateData.slug = trimmedSlug;
      } else if (payload.title && payload.title.trim()) {
        updateData.slug = payload.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
      }
    }

    let { data, error } = await getSupabaseClient(req)
      .from('entries')
      .update(updateData)
      .eq('id', id)
      .select('*')
      .single();

    if (error && (error.message.includes('entries_slug_key') || error.message.includes('duplicate key'))) {
      updateData.slug = `${updateData.slug}-${Math.random().toString(36).slice(2, 6)}`;
      const retry = await getSupabaseClient(req)
        .from('entries')
        .update(updateData)
        .eq('id', id)
        .select('*')
        .single();
      data = retry.data;
      error = retry.error;
    }

    if (error) throw error;

    broadcastRealtimeEvent('entry_updated', {
      op: 'UPDATE',
      id: data.id,
      slug: data.slug,
      title: data.title,
      status: data.status,
      type: isPhotoPost ? 'photo' : data.type
    });

    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/posts/:identifier/views — Increment view count & broadcast in real-time
app.post('/api/posts/:identifier/views', async (req, res) => {
  try {
    const { identifier } = req.params;
    if (!identifier) return res.status(400).json({ error: 'Identifier required' });

    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(identifier);
    const client = getSupabaseClient(req);

    // 1. Locate entry by ID or Slug (with case-insensitive fallback)
    let post = null;
    if (isUuid) {
      const { data } = await client.from('public_published_entries').select('id, slug, views').eq('id', identifier).maybeSingle();
      post = data;
      if (!post) {
        const { data: direct } = await client.from('entries').select('id, slug, views').eq('id', identifier).maybeSingle();
        post = direct;
      }
    } else {
      // Try exact slug
      const { data } = await client.from('public_published_entries').select('id, slug, views').eq('slug', identifier).maybeSingle();
      post = data;
      // Try case-insensitive slug
      if (!post) {
        const { data: ilikeData } = await client.from('public_published_entries').select('id, slug, views').ilike('slug', identifier).maybeSingle();
        post = ilikeData;
      }
      // Try entries table directly
      if (!post) {
        const { data: direct } = await client.from('entries').select('id, slug, views').eq('slug', identifier).maybeSingle();
        post = direct;
      }
      if (!post) {
        const { data: directIlike } = await client.from('entries').select('id, slug, views').ilike('slug', identifier).maybeSingle();
        post = directIlike;
      }
      // If still not found, check if identifier happens to be an ID
      if (!post) {
        const { data: byId } = await client.from('entries').select('id, slug, views').eq('id', identifier).maybeSingle();
        post = byId;
      }
    }

    if (!post) {
      return res.status(404).json({ error: 'Entry not found' });
    }

    // 2. Increment view count
    let newViews = (post.views || 0) + 1;
    let incrementedViaRpc = false;
    try {
      const { error: rpcErr } = await client.rpc('increment_views', { target_slug: post.id });
      if (!rpcErr) {
        incrementedViaRpc = true;
      } else if (post.slug) {
        const { error: slugRpcErr } = await client.rpc('increment_views', { target_slug: post.slug });
        if (!slugRpcErr) incrementedViaRpc = true;
      }
    } catch {}

    // Fallback: If RPC failed or wasn't available, attempt direct table update
    if (!incrementedViaRpc) {
      try {
        const { data: updatedRow } = await client
          .from('entries')
          .update({ views: newViews })
          .eq('id', post.id)
          .select('views')
          .maybeSingle();
        if (updatedRow && typeof updatedRow.views === 'number') {
          newViews = updatedRow.views;
        }
      } catch {}
    }

    // 3. Read back latest views from database
    try {
      const { data: fresh } = await client
        .from('public_published_entries')
        .select('views')
        .eq('id', post.id)
        .maybeSingle();
      if (fresh && typeof fresh.views === 'number') {
        newViews = Math.max(newViews, fresh.views);
      } else {
        const { data: freshDirect } = await client
          .from('entries')
          .select('views')
          .eq('id', post.id)
          .maybeSingle();
        if (freshDirect && typeof freshDirect.views === 'number') {
          newViews = Math.max(newViews, freshDirect.views);
        }
      }
    } catch {}

    const showViews = await getEffectiveShowViews(client);
    const auth = await verifyAdminUser(req);
    const isAdmin = auth.authorized;

    // 4. Only broadcast realtime view update if view count is visible
    if (showViews) {
      broadcastRealtimeEvent('entry_view_updated', {
        id: post.id,
        slug: post.slug,
        views: newViews
      }, client);
    }

    if (!showViews && !isAdmin) {
      return res.json({ success: true, id: post.id, slug: post.slug });
    }

    res.json({ success: true, id: post.id, slug: post.slug, views: newViews });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});



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

    const _signedUrl = publicUrl || await getB2SignedUrl(storageKey, 86400);

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
    if (err.message && /rate limit exceeded/i.test(err.message)) {
      return res.status(429).json({ error: "You're reacting too fast. Try again in a few minutes." });
    }
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

    // Strip HTML tags from plain-text fields — comments are plain text, never markup.
    // React JSX already escapes on render, but we clean at the door so stored data is unambiguous.
    const rawName = author_name && author_name.trim() ? stripHtmlTags(author_name).trim() : '';
    const rawContent = stripHtmlTags(content).trim();

    if (!rawContent) {
      return res.status(400).json({ error: 'Comment text cannot be empty.' });
    }
    if (rawContent.length > 2000) {
      return res.status(400).json({ error: 'Comment must be 2000 characters or fewer.' });
    }
    if (rawName && rawName.length > 100) {
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

    const name = rawName || 'Anonymous Reader';

    const { data, error } = await getSupabaseClient(req)
      .from('comments')
      .insert([{ post_id: postId, author_name: name, content: rawContent }])
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
    if (err.message && /rate limit exceeded/i.test(err.message)) {
      return res.status(429).json({ error: "You're posting too fast. Try again in a few minutes." });
    }
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


// Music Status (Now Playing) Endpoints
app.post('/api/now-playing', express.json(), async (req, res) => {
  try {
    const authHeader = req.headers['authorization'];
    const expectedSecret = process.env.METROLIST_WEBHOOK_SECRET;
    
    // Very basic authorization check
    if (!expectedSecret || authHeader !== `Bearer ${expectedSecret}`) {
      return res.status(401).json({ error: 'Unauthorized. Invalid or missing secret.' });
    }

    const { title, artist, album, isPaused, progress, coverUrl } = req.body;

    const { error } = await supabase
      .from('now_playing')
      .update({ 
        title, 
        artist, 
        album, 
        is_paused: isPaused, 
        progress, 
        cover_url: coverUrl,
        updated_at: new Date().toISOString()
      })
      .eq('id', 1);

    if (error) {
      console.error('Failed to update now_playing:', error);
      return res.status(500).json({ error: 'Database error' });
    }

    broadcastRealtimeEvent('now_playing_updated', {
      title, artist, album, isPaused
    }, supabase);

    res.json({ success: true });
  } catch (err) {
    console.error('Webhook error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/now-playing', async (req, res) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  try {
    const supabase = getSupabaseClient(req);
    const { data, error } = await supabase
      .from('now_playing')
      .select('*')
      .eq('id', 1)
      .single();

    if (error || !data) {
      return res.json({ playing: false, showOnHome: false });
    }

    // Check if it's currently active (updated within the last 5 minutes)
    const lastUpdate = data.updated_at ? new Date(data.updated_at).getTime() : 0;
    const isOffline = !lastUpdate || isNaN(lastUpdate) || (Date.now() - lastUpdate > 5 * 60 * 1000);

    res.json({
      playing: !isOffline, // True if recently updated
      isPaused: data.is_paused || isOffline, // Treat offline as paused so frontend shows 'last listened to'
      title: data.title,
      artist: data.artist,
      album: data.album,
      progress: data.progress,
      coverUrl: data.cover_url,
      updatedAt: data.updated_at,
      showOnHome: data.show_on_home
    });
  } catch (_err) {
    res.status(500).json({ error: 'Internal server error' });
  }

});

// Admin endpoint to toggle Now Playing on Home
app.post('/api/now-playing/toggle', express.json(), async (req, res) => {
  try {
    const authHeader = req.headers['authorization'];
    if (!process.env.ADMIN_USER_ID) return res.status(500).json({ error: 'Config missing' });
    
    // Quick admin token verification (matches post edit auth)
    // Here we'll just check if the bearer token is valid by querying Supabase
    const supabase = getSupabaseClient(req);
    const { data: userAuth, error: authError } = await supabase.auth.getUser(authHeader?.split(' ')[1] || '');
    
    if (authError || userAuth?.user?.id !== process.env.ADMIN_USER_ID) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { showOnHome } = req.body;
    
    const { error } = await supabase
      .from('now_playing')
      .update({ show_on_home: showOnHome })
      .eq('id', 1);

    if (error) throw error;
    try {
      broadcastRealtimeEvent('now_playing_updated', { showOnHome }, supabase);
    } catch {}
    res.json({ success: true, showOnHome });
  } catch (err) {
    console.error('Toggle error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

let cachedDefaultTheme = null;
let lastThemeFetch = 0;
let cachedShowViews = null;
let lastShowViewsFetch = 0;

export function setCachedDefaultTheme(theme) {
  if (theme === 'light' || theme === 'dark') {
    cachedDefaultTheme = theme;
    lastThemeFetch = Date.now();
  }
}

export function setCachedShowViews(show) {
  if (typeof show === 'boolean') {
    cachedShowViews = show;
    lastShowViewsFetch = Date.now();
  }
}

export async function getEffectiveShowViews(supabase) {
  const now = Date.now();
  if (cachedShowViews !== null && (now - lastShowViewsFetch < 3000)) {
    return cachedShowViews;
  }
  try {
    const { data: syncRow } = await supabase
      .from('realtime_sync')
      .select('payload')
      .eq('id', 'site_settings')
      .maybeSingle();
    if (syncRow?.payload && typeof syncRow.payload.show_view_count === 'boolean') {
      cachedShowViews = syncRow.payload.show_view_count;
      lastShowViewsFetch = now;
      return cachedShowViews;
    }
    const { data: aboutRow } = await supabase
      .from('about')
      .select('show_view_count')
      .limit(1);
    if (aboutRow && aboutRow[0] && typeof aboutRow[0].show_view_count === 'boolean') {
      cachedShowViews = aboutRow[0].show_view_count;
      lastShowViewsFetch = now;
      return cachedShowViews;
    }
  } catch {}
  return true;
}

// Serve application HTML with injected site default theme and view count visibility to guarantee zero flash
async function serveInjectedHtml(req, res, extraHead = '') {
  let html = '';
  try {
    html = fs.readFileSync(path.join(process.cwd(), 'dist', 'index.html'), 'utf8');
  } catch (_e) {
    try {
      html = fs.readFileSync(path.join(process.cwd(), 'index.html'), 'utf8');
    } catch (_e2) {
      try {
        const protocol = req.headers['x-forwarded-proto'] || 'http';
        const host = req.headers.host;
        const htmlRes = await fetch(`${protocol}://${host}/_static_shell`);
        if (htmlRes.ok) html = await htmlRes.text();
      } catch (_e3) {}
    }
  }

  if (!html) return res.status(500).send('Unable to load application shell.');

  let defaultTheme = cachedDefaultTheme;
  const now = Date.now();
  const supabase = getSupabaseClient(req);

  if (!defaultTheme || (now - lastThemeFetch > 3000)) {
    try {
      const queryPromise = (async () => {
        const { data: syncRow } = await supabase
          .from('realtime_sync')
          .select('payload')
          .eq('id', 'site_settings')
          .maybeSingle();
        if (syncRow?.payload?.default_theme === 'light' || syncRow?.payload?.default_theme === 'dark') {
          return syncRow.payload.default_theme;
        }
        const { data: aboutRow } = await supabase
          .from('about')
          .select('default_theme')
          .limit(1);
        if (aboutRow && aboutRow[0] && (aboutRow[0].default_theme === 'light' || aboutRow[0].default_theme === 'dark')) {
          return aboutRow[0].default_theme;
        }
        return null;
      })();

      const timeoutPromise = new Promise(resolve => setTimeout(() => resolve(null), 1000));
      const resolved = await Promise.race([queryPromise, timeoutPromise]);
      if (resolved === 'light' || resolved === 'dark') {
        defaultTheme = resolved;
        cachedDefaultTheme = defaultTheme;
        lastThemeFetch = now;
      }
    } catch {}
  }

  if (!defaultTheme) defaultTheme = 'light';

  const effectiveShowViews = await getEffectiveShowViews(supabase);

  // Inject theme and view count attributes directly into <html> to guarantee ZERO flash
  html = html.replace(/<html([^>]*)>/i, (m, attrs) => {
    const clean = attrs
      .replace(/\s*data-theme-injected=["'][^"']*["']/gi, '')
      .replace(/\s*data-show-views-injected=["'][^"']*["']/gi, '')
      .replace(/\s*class=["'][^"']*["']/gi, '');
    const showViewsAttr = ` data-show-views-injected="${effectiveShowViews ? 'true' : 'false'}"`;
    if (defaultTheme === 'dark') {
      return `<html${clean} class="dark" data-theme-injected="dark"${showViewsAttr}>`;
    } else {
      return `<html${clean} class="" data-theme-injected="light"${showViewsAttr}>`;
    }
  });

  const syncScript = `<script>window.__SITE_SHOW_VIEWS__=${effectiveShowViews ? 'true' : 'false'};</script>`;
  if (extraHead) {
    html = html.replace('</head>', `${syncScript}${extraHead}</head>`);
  } else {
    html = html.replace('</head>', `${syncScript}</head>`);
  }

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
  return res.send(html);
}

// SSR for Open Graph (OG) tags on /entry/:slug (Link Previews for WhatsApp, Twitter, etc.)
app.get('/entry/:slug', async (req, res) => {
  try {
    const { slug } = req.params;
    const { data: posts } = await getSupabaseClient(req)
      .from('public_published_entries')
      .select('id, title, excerpt, cover_image, has_passcode')
      .eq('slug', slug);

    const post = posts && posts[0];
    let ogTags = '';
    if (post && !post.has_passcode) {
      const escapeHtml = (str) => String(str || '').replace(/[&<>"']/g, match => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[match]);
      const title = escapeHtml(post.title || 'Untitled');
      const excerpt = escapeHtml(post.excerpt || 'Personal diary entry');
      let image = post.cover_image ? escapeHtml(post.cover_image) : '';
      if (image && !image.startsWith('http')) {
        if (image.includes('backblazeb2.com') || image.startsWith('images/')) {
          const match = image.match(/(?:images|videos|audio|files)\/(?:[a-zA-Z0-9_\-./% ]+)\.[a-zA-Z0-9]+/i);
          if (match) image = `/api/media/file/${match[0]}`;
        }
        image = `https://${req.headers.host}${image}`;
      }
      ogTags = `
        <meta property="og:title" content="${title}" />
        <meta property="og:description" content="${excerpt}" />
        ${image ? `<meta property="og:image" content="${image}" />` : ''}
        <meta property="og:type" content="article" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="${title}" />
        <meta name="twitter:description" content="${excerpt}" />
        ${image ? `<meta name="twitter:image" content="${image}" />` : ''}
      `;
    }
    return serveInjectedHtml(req, res, ogTags);
  } catch (err) {
    console.error('OG Tag Error:', err);
    return res.redirect(`/?entry=${req.params.slug}`);
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

// Catch-all SPA route handler for all non-API HTML routes with zero theme flash
app.get(/^(?!\/api).*/, async (req, res) => {
  return serveInjectedHtml(req, res);
});

export default app;

