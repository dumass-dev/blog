import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import dotenv from 'dotenv';
import path from 'path';
import crypto from 'crypto';

dotenv.config();

function createS3Client(endpoint, region, keyId, applicationKey) {
  if (!endpoint || !keyId || !applicationKey) return null;
  const s3Endpoint = endpoint.startsWith('http') ? endpoint : `https://${endpoint}`;
  return new S3Client({
    endpoint: s3Endpoint,
    region: region || 'us-east-005',
    credentials: {
      accessKeyId: keyId,
      secretAccessKey: applicationKey,
    },
  });
}

export const vaults = {
  // Vault 1: Primary Writing & Journals (10 GB)
  journal: {
    id: 'journal',
    name: 'Writing & Journals',
    bucket: process.env.BACKBLAZE_BUCKET || 'q04ti-blog',
    endpoint: process.env.BACKBLAZE_ENDPOINT || 's3.us-east-005.backblazeb2.com',
    region: process.env.BACKBLAZE_REGION || 'us-east-005',
    keyId: process.env.BACKBLAZE_KEY_ID,
    applicationKey: process.env.BACKBLAZE_APPLICATION_KEY,
    client: null
  },
  // Vault 2: Visuals Pool 1 (10 GB)
  media1: {
    id: 'media1',
    name: 'Visuals Pool 1',
    bucket: process.env.BACKBLAZE_MEDIA_BUCKET_1 || 'q04ti-media-1',
    endpoint: process.env.BACKBLAZE_MEDIA_ENDPOINT_1 || 's3.us-east-005.backblazeb2.com',
    region: process.env.BACKBLAZE_MEDIA_REGION_1 || 'us-east-005',
    keyId: process.env.BACKBLAZE_MEDIA_KEY_ID_1,
    applicationKey: process.env.BACKBLAZE_MEDIA_APPLICATION_KEY_1,
    client: null
  },
  // Vault 3: Visuals Pool 2 (10 GB)
  media2: {
    id: 'media2',
    name: 'Visuals Pool 2',
    bucket: process.env.BACKBLAZE_MEDIA_BUCKET_2 || 'q04ti-media-2',
    endpoint: process.env.BACKBLAZE_MEDIA_ENDPOINT_2 || 's3.us-east-005.backblazeb2.com',
    region: process.env.BACKBLAZE_MEDIA_REGION_2 || 'us-east-005',
    keyId: process.env.BACKBLAZE_MEDIA_KEY_ID_2,
    applicationKey: process.env.BACKBLAZE_MEDIA_APPLICATION_KEY_2,
    client: null
  }
};

// Initialize clients for configured vaults
vaults.journal.client = createS3Client(vaults.journal.endpoint, vaults.journal.region, vaults.journal.keyId, vaults.journal.applicationKey);
vaults.media1.client = createS3Client(vaults.media1.endpoint, vaults.media1.region, vaults.media1.keyId, vaults.media1.applicationKey);
vaults.media2.client = createS3Client(vaults.media2.endpoint, vaults.media2.region, vaults.media2.keyId, vaults.media2.applicationKey);

// Fallback pointers for backward compatibility
export const endpoint = process.env.BACKBLAZE_ENDPOINT || vaults.media1.endpoint;
export const region = process.env.BACKBLAZE_REGION || 'us-east-005';
export const bucket = process.env.BACKBLAZE_BUCKET || vaults.media1.bucket || 'q04ti-blog';
export const s3Client = vaults.journal.client || vaults.media1.client || vaults.media2.client;

if (process.env.NODE_ENV !== 'test') {
  const activeNames = Object.values(vaults).filter(v => !!v.client).map(v => `${v.name} [${v.bucket}]`);
  if (activeNames.length > 0) {
    console.log(`Initialized Backblaze B2 Multi-Vault Storage: ${activeNames.join(', ')}`);
  } else {
    console.warn('Warning: Backblaze B2 credentials incomplete in .env. Uploads will fallback to local storage.');
  }
}

export function isB2Configured() {
  return !!(vaults.journal.client || vaults.media1.client || vaults.media2.client);
}

// 9.5 GB safety threshold (out of 10 GB free tier cap) before auto-spillover to next account in chain
export const BUCKET_FREE_TIER_LIMIT_BYTES = Number(process.env.BACKBLAZE_MEDIA_MAX_BYTES_1) || (9.5 * 1024 * 1024 * 1024);

const vaultUsageMap = {
  media1: 0,
  media2: 0,
  journal: 0,
};

const vaultFullMap = {
  media1: false,
  media2: false,
  journal: false,
};

export function setVaultUsage(vaultId, bytes) {
  if (vaultUsageMap[vaultId] !== undefined) {
    vaultUsageMap[vaultId] = Math.max(0, Number(bytes) || 0);
    if (vaultUsageMap[vaultId] >= BUCKET_FREE_TIER_LIMIT_BYTES) {
      vaultFullMap[vaultId] = true;
    }
  }
}

export function setMedia1Usage(bytes) {
  setVaultUsage('media1', bytes);
}

export function markVaultFull(vaultId) {
  if (vaultFullMap[vaultId] !== undefined) {
    vaultFullMap[vaultId] = true;
  }
}

export function resetVaultFullStatus() {
  vaultFullMap.media1 = false;
  vaultFullMap.media2 = false;
  vaultFullMap.journal = false;
  vaultUsageMap.media1 = 0;
  vaultUsageMap.media2 = 0;
  vaultUsageMap.journal = 0;
}

// In the unified 30 GB pool, uploads fill in chain: media1 -> media2 -> journal
export function getActiveVault(_target = 'visuals') {
  const chain = [vaults.media1, vaults.media2, vaults.journal].filter(v => !!v.client);

  for (const vault of chain) {
    const isFull = vaultFullMap[vault.id];
    const usage = vaultUsageMap[vault.id] || 0;
    if (!isFull && usage < BUCKET_FREE_TIER_LIMIT_BYTES) {
      return vault;
    }
  }

  return chain[chain.length - 1] || vaults.media1 || vaults.journal;
}

// Keep-alive touch: writes a small .keepalive timestamp file to all buckets so Backblaze never marks accounts dormant
export async function touchAllVaultsKeepAlive() {
  if (process.env.NODE_ENV === 'test') return;
  const configured = Object.values(vaults).filter(v => !!v.client);
  for (const v of configured) {
    try {
      await v.client.send(new PutObjectCommand({
        Bucket: v.bucket,
        Key: '.keepalive',
        Body: JSON.stringify({ active: true, pinged_at: new Date().toISOString() }),
        ContentType: 'application/json'
      }));
    } catch (_err) {
      // Non-blocking
    }
  }
}

// Auto-run keepalive touch on startup and every 24 hours to prevent dormancy
if (process.env.NODE_ENV !== 'test') {
  touchAllVaultsKeepAlive().catch(() => {});
  const keepAliveInterval = setInterval(() => {
    touchAllVaultsKeepAlive().catch(() => {});
  }, 24 * 60 * 60 * 1000);
  if (keepAliveInterval.unref) keepAliveInterval.unref();
}

export function getVaultStorageStats() {
  const configured = [vaults.media1, vaults.media2, vaults.journal].filter(v => !!v.client);
  const activeVault = getActiveVault();
  return [
    {
      id: 'unified_pool',
      name: 'Unified 30 GB Backblaze Media Pool',
      totalAllocatedGb: 30,
      activeBucket: activeVault ? activeVault.bucket : 'none',
      buckets: configured.map(v => ({
        id: v.id,
        bucket: v.bucket,
        isFull: !!vaultFullMap[v.id],
        usageBytes: vaultUsageMap[v.id] || 0
      }))
    }
  ];
}

const ALLOWED_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.heic', '.heif', '.mp4', '.mov', '.webm', '.mp3', '.m4a', '.wav']);
const ALLOWED_MIMES = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif',
  'video/mp4', 'video/quicktime', 'video/webm', 'audio/mpeg', 'audio/mp4', 'audio/wav', 'audio/x-m4a', 'application/octet-stream'
]);

/**
 * Validate upload buffer magic bytes & extension allowlist
 */
export function validateUploadFile(buffer, originalName, mimeType) {
  const ext = path.extname(originalName || '').toLowerCase();

  // 1. Extension & MIME Allowlist Check
  if (!ext || !ALLOWED_EXTENSIONS.has(ext)) {
    const err = new Error(`File extension '${ext}' is not permitted.`);
    err.statusCode = 415;
    throw err;
  }

  if (mimeType && (mimeType.includes('svg') || mimeType.includes('html') || mimeType.includes('javascript') || !ALLOWED_MIMES.has(mimeType.toLowerCase()))) {
    const err = new Error(`MIME type '${mimeType}' is not permitted.`);
    err.statusCode = 415;
    throw err;
  }

  // 2. Magic Bytes Inspection
  if (buffer && buffer.length >= 4) {
    const headerHex = buffer.slice(0, 12).toString('hex').toUpperCase();

    // Disallow HTML / XML / Script tags in content
    const sampleText = buffer.slice(0, 256).toString('utf8').toLowerCase();
    if (sampleText.includes('<html') || sampleText.includes('<svg') || sampleText.includes('<script') || sampleText.includes('<?php')) {
      const err = new Error('File contains unpermitted HTML/SVG markup.');
      err.statusCode = 415;
      throw err;
    }

    let validMagic = false;
    if (headerHex.startsWith('FFD8FF')) validMagic = true; // JPEG
    else if (headerHex.startsWith('89504E47')) validMagic = true; // PNG
    else if (headerHex.startsWith('47494638')) validMagic = true; // GIF
    else if (headerHex.startsWith('52494646') && headerHex.includes('57454250')) validMagic = true; // WEBP
    else if (headerHex.startsWith('1A45DFA3')) validMagic = true; // WEBM
    else if (buffer.length >= 12 && buffer.slice(4, 8).toString('utf8') === 'ftyp') validMagic = true; // MP4 / M4A
    else if (headerHex.startsWith('494433') || headerHex.startsWith('FFFB') || headerHex.startsWith('FFF3')) validMagic = true; // MP3
    else if (headerHex.startsWith('52494646') && headerHex.includes('57415645')) validMagic = true; // WAV
    else if (headerHex.includes('HEIC') || headerHex.includes('HEIF') || headerHex.includes('MSF1')) validMagic = true; // HEIC

    if (process.env.NODE_ENV !== 'test' && !validMagic) {
      const err = new Error('File magic bytes signature failed verification.');
      err.statusCode = 415;
      throw err;
    }
  }
}

/**
 * Generate a sensible, structured storage key for files.
 * Format: images/2026/09/<uuid>.<ext>
 *         videos/2026/09/<uuid>.<ext>
 *         audio/2026/09/<uuid>.<ext>
 */
export function generateStoragePath(originalName, mimeType) {
  const ext = path.extname(originalName || '').toLowerCase() || '.bin';
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const uniqueId = crypto.randomUUID();

  let folder = 'files';
  if (mimeType.startsWith('image/')) folder = 'images';
  else if (mimeType.startsWith('video/')) folder = 'videos';
  else if (mimeType.startsWith('audio/')) folder = 'audio';

  return `${folder}/${year}/${month}/${uniqueId}${ext}`;
}

/**
 * Upload a file buffer directly to private Backblaze B2 bucket in unified 30 GB chain
 */
export async function uploadToB2(fileBuffer, originalName, mimeType, _targetVault = 'visuals') {
  validateUploadFile(fileBuffer, originalName, mimeType);

  if (process.env.NODE_ENV === 'test') {
    const storageKey = generateStoragePath(originalName || 'test.jpg', mimeType || 'image/jpeg');
    return { storageKey, signedUrl: `http://127.0.0.1:3099/${storageKey}`, bucket: 'dummy-bucket' };
  }

  const chain = [vaults.media1, vaults.media2, vaults.journal].filter(v => !!v.client);
  if (chain.length === 0) {
    throw new Error('Backblaze B2 is not configured in .env file.');
  }

  const storageKey = generateStoragePath(originalName, mimeType);
  let uploadedVault = null;

  // Start with currently active vault in chain, and auto-spillover if full
  const active = getActiveVault();
  let targetIndex = chain.findIndex(v => v.id === active.id);
  if (targetIndex === -1) targetIndex = 0;

  for (let i = targetIndex; i < chain.length; i++) {
    const candidateVault = chain[i];
    try {
      const command = new PutObjectCommand({
        Bucket: candidateVault.bucket,
        Key: storageKey,
        Body: fileBuffer,
        ContentType: mimeType,
      });
      await candidateVault.client.send(command);
      vaultUsageMap[candidateVault.id] = (vaultUsageMap[candidateVault.id] || 0) + fileBuffer.length;
      if (vaultUsageMap[candidateVault.id] >= BUCKET_FREE_TIER_LIMIT_BYTES) {
        vaultFullMap[candidateVault.id] = true;
      }
      uploadedVault = candidateVault;
      keyVaultMap.set(storageKey, candidateVault);
      break;
    } catch (err) {
      const isCapOrQuotaErr = /cap|quota|limit|exceeded|forbidden|full/i.test(err.message || err.code || '');
      if (isCapOrQuotaErr && i < chain.length - 1) {
        console.warn(`Vault ${candidateVault.bucket} full, auto-spilling over to ${chain[i + 1].bucket}...`);
        markVaultFull(candidateVault.id);
        continue;
      }
      throw err;
    }
  }

  if (!uploadedVault) {
    throw new Error('All Backblaze storage vaults are at capacity.');
  }

  const getCommand = new GetObjectCommand({
    Bucket: uploadedVault.bucket,
    Key: storageKey,
  });
  const signedUrl = await getSignedUrl(uploadedVault.client, getCommand, { expiresIn: 86400 });

  return {
    storageKey,
    signedUrl,
    bucket: uploadedVault.bucket,
  };
}

const keyVaultMap = new Map(); // storageKey -> vault
const b2UrlCache = new Map(); // key -> { url, expiresAt }

/**
 * Generate a temporary signed URL for a private Backblaze B2 object (default 24 hours with TTL cache)
 */
export async function getB2SignedUrl(storageKey, expiresInSeconds = 86400) {
  if (process.env.NODE_ENV === 'test') {
    return `http://127.0.0.1:3099/${storageKey}`;
  }

  if (!isB2Configured() || !storageKey) return null;

  const now = Date.now();
  const cached = b2UrlCache.get(storageKey);
  // Reuse a cached URL only while it has plenty of life left: the media
  // proxy lets browsers/CDN cache its redirect for up to 1 hour, so a URL
  // handed out with less than that remaining could be served after it has
  // expired (a broken image until the cached redirect runs out).
  const MIN_REMAINING_MS = 2 * 60 * 60 * 1000;
  if (cached && cached.expiresAt > now + MIN_REMAINING_MS) {
    return cached.url;
  }

  // 1. Check if vault is already known in memory
  let vault = keyVaultMap.get(storageKey);

  // 2. Discover the bucket that really holds the file (one retry: a slow
  // or failed Backblaze reply must not be mistaken for "not here").
  let verified = Boolean(vault);
  if (!vault) {
    const activeVaults = [vaults.media1, vaults.media2, vaults.journal].filter(v => !!v.client);
    for (let pass = 0; pass < 2 && !vault; pass++) {
      for (const v of activeVaults) {
        try {
          await v.client.send(new HeadObjectCommand({ Bucket: v.bucket, Key: storageKey }));
          vault = v;
          keyVaultMap.set(storageKey, v);
          break;
        } catch (_err) {
          // Not in this bucket (or no answer), check next
        }
      }
    }
    verified = Boolean(vault);
  }

  // 3. Not found anywhere: sign for the first bucket in the chain, but do
  // NOT cache it. This used to fall back to whichever bucket the instance
  // currently thought was "active" and cache that guess for 24h, so a
  // transient miss produced a "Key not found" link that stuck around.
  if (!vault) {
    vault = [vaults.media1, vaults.media2, vaults.journal].find(v => !!v.client);
  }

  if (!vault || !vault.client) return null;

  try {
    const getCommand = new GetObjectCommand({
      Bucket: vault.bucket,
      Key: storageKey,
    });
    const freshUrl = await getSignedUrl(vault.client, getCommand, { expiresIn: expiresInSeconds });
    if (freshUrl && verified) {
      b2UrlCache.set(storageKey, {
        url: freshUrl,
        expiresAt: now + (expiresInSeconds * 1000)
      });
    }
    return freshUrl;
  } catch (err) {
    console.error('Error generating signed URL for key:', storageKey, err.message);
    return null;
  }
}

/**
 * Extract storage key from Backblaze B2 URL or raw storage key
 */
export function extractB2StorageKey(urlOrKey) {
  if (!urlOrKey || typeof urlOrKey !== 'string') return null;
  const match = urlOrKey.match(/(?:images|videos|audio|files)\/\d{4}\/\d{2}\/[^/\s?#]+\.[a-z0-9]+/i);
  return match ? match[0] : null;
}

// Permanent address for one of our stored files: the site's own media
// proxy (/api/media/file/<key>), which signs a fresh short-lived link on
// each visit. Nothing handed to browsers can expire, and building it needs
// no call to Backblaze (signing every cover in every list used to make the
// server ask Backblaze in the US about each one). Non-storage URLs
// (YouTube, other sites) are returned unchanged.
export function toMediaProxyUrl(value) {
  if (!value || typeof value !== 'string') return value;
  const v = value.trim();
  if (v.startsWith('/api/media/file/')) return v;
  const key = extractB2StorageKey(v);
  if (!key) return value;
  if (v === key || /backblazeb2\.com/i.test(v)) return `/api/media/file/${key}`;
  return value;
}

// Same for every raw Backblaze link inside a post body, each to ITS OWN
// file (refreshB2Url replaced every link with the first image's link).
export function proxyB2UrlsInText(text) {
  if (!text || typeof text !== 'string' || !/backblazeb2\.com/i.test(text)) return text;
  return text.replace(/https?:\/\/[^\s)"'<>]*backblazeb2\.com\/[^\s)"'<>]*/gi, (m) => {
    const key = extractB2StorageKey(m);
    return key ? `/api/media/file/${key}` : m;
  });
}

/**
 * Refresh expired presigned Backblaze B2 URL in string if present
 */
export async function refreshB2Url(urlOrText) {
  if (!urlOrText || typeof urlOrText !== 'string') return urlOrText;
  const key = extractB2StorageKey(urlOrText);
  if (!key) return urlOrText;

  const freshUrl = await getB2SignedUrl(key, 86400); // 24 hours valid
  if (!freshUrl) return urlOrText;

  if (urlOrText === key) return freshUrl;
  return urlOrText.replace(/https?:\/\/[^\s)"]+(?:images|videos|audio|files)\/\d{4}\/\d{2}\/[^/\s?#]+\.[a-z0-9]+[^\s)"]*/gi, freshUrl);
}

/**
 * Generate a presigned B2 PUT URL for direct client upload
 */
// The vault (bucket) a storage key lives in: in-memory hint first, then
// the bucket the client says it uploaded to (must be one of ours), then a
// HEAD probe across all vaults. Memory alone is not enough on Vercel —
// each request can land on a fresh instance that remembers nothing.
// True when the bucket holding this key has been confirmed (by a HEAD) on
// this instance — lets the media proxy cache only verified redirects.
export function isStorageKeyLocated(storageKey) {
  return keyVaultMap.has(storageKey);
}

export async function findVaultForKey(storageKey, bucketHint) {
  const known = keyVaultMap.get(storageKey);
  if (known) return known;
  const all = [vaults.media1, vaults.media2, vaults.journal].filter(v => !!v.client);
  const hinted = bucketHint ? all.find(v => v.bucket === bucketHint) : null;
  const order = hinted ? [hinted, ...all.filter(v => v !== hinted)] : all;
  for (const v of order) {
    try {
      await v.client.send(new HeadObjectCommand({ Bucket: v.bucket, Key: storageKey }));
      keyVaultMap.set(storageKey, v);
      return v;
    } catch (_err) {
      // not in this bucket
    }
  }
  return null;
}

export async function getB2PresignedPutUrl(originalName, mimeType, _maxSizeBytes = 104857600, _targetVault = 'visuals', excludeBuckets = []) {
  validateUploadFile(null, originalName, mimeType);
  const storageKey = generateStoragePath(originalName, mimeType);

  if (process.env.NODE_ENV === 'test' || !isB2Configured()) {
    return {
      storageKey,
      uploadUrl: `http://127.0.0.1:3099/${storageKey}`,
      publicUrl: `http://127.0.0.1:3099/${storageKey}`,
      bucket: 'dummy-bucket',
    };
  }

  // Buckets the browser just found full (it couldn't upload there) are
  // skipped, following the chain media1 -> media2 -> journal.
  // Skipped for THIS request only — never remembered as "full", so one
  // refused upload (or a CORS hiccup) can't push later uploads out of the
  // chain order.
  const skip = new Set(Array.isArray(excludeBuckets) ? excludeBuckets.map(String) : []);
  const chain = [vaults.media1, vaults.media2, vaults.journal].filter(v => !!v.client && !skip.has(v.bucket));
  const vault = chain.find(v => !vaultFullMap[v.id] && (vaultUsageMap[v.id] || 0) < BUCKET_FREE_TIER_LIMIT_BYTES) || chain[0];
  if (!vault || !vault.client) {
    const err = new Error(skip.size ? 'All storage buckets are full or refused the upload.' : 'Backblaze B2 is not configured in .env file.');
    err.statusCode = skip.size ? 507 : 500;
    throw err;
  }

  const putCommand = new PutObjectCommand({
    Bucket: vault.bucket,
    Key: storageKey,
    ContentType: mimeType,
  });

  const uploadUrl = await getSignedUrl(vault.client, putCommand, { expiresIn: 900 });
  keyVaultMap.set(storageKey, vault);
  const publicUrl = await getB2SignedUrl(storageKey, 86400);

  return {
    storageKey,
    uploadUrl,
    publicUrl,
    bucket: vault.bucket,
  };
}

/**
 * Post-upload magic-byte check on B2 object
 */
export async function verifyB2UploadedFile(storageKey, originalName, mimeType, bucketHint) {
  if (process.env.NODE_ENV === 'test' || !isB2Configured()) return true;

  const vault = await findVaultForKey(storageKey, bucketHint);
  if (!vault) {
    const err = new Error('Uploaded file not found in storage.');
    err.statusCode = 400;
    throw err;
  }

  try {
    const getCommand = new GetObjectCommand({
      Bucket: vault.bucket,
      Key: storageKey,
      Range: 'bytes=0-511',
    });

    const response = await vault.client.send(getCommand);
    const chunks = [];
    for await (const chunk of response.Body) {
      chunks.push(chunk);
    }
    const headBuffer = Buffer.concat(chunks);
    validateUploadFile(headBuffer, originalName, mimeType);
    return true;
  } catch (err) {
    // Delete invalid object from B2 if magic byte check failed
    await deleteFromB2(storageKey);
    throw err;
  }
}

/**
 * Extract all B2 storage keys referenced in a string (cover_image or content)
 */
export function extractAllB2StorageKeys(text) {
  if (!text || typeof text !== 'string') return [];
  const regex = /(?:images|videos|audio|files)\/\d{4}\/\d{2}\/[^/\s?#]+\.[a-z0-9]+/gi;
  const matches = text.match(regex);
  if (!matches) return [];
  return Array.from(new Set(matches));
}

const testDeletedB2Keys = new Set();

export function getTestDeletedB2Keys() {
  return Array.from(testDeletedB2Keys);
}

export function clearTestDeletedB2Keys() {
  testDeletedB2Keys.clear();
}

/**
 * Safely clean up B2 files referenced by an entry being deleted.
 * Only deletes a B2 file if it is NOT referenced by any other entry
 * and does NOT have a row in the media table.
 */
export async function cleanupOrphanedB2FilesForEntry(supabaseClient, entry) {
  if (!entry) return;

  const coverKeys = extractAllB2StorageKeys(entry.cover_image);
  const contentKeys = extractAllB2StorageKeys(entry.content);
  const allKeys = Array.from(new Set([...coverKeys, ...contentKeys]));

  if (allKeys.length === 0) return;

  for (const key of allKeys) {
    try {
      // 1. Check if referenced in any OTHER entry (excluding entry.id)
      const { data: otherEntries } = await supabaseClient
        .from('entries')
        .select('id')
        .neq('id', entry.id)
        .or(`cover_image.ilike.%${key}%,content.ilike.%${key}%`)
        .limit(1);

      if (otherEntries && otherEntries.length > 0) {
        // Still referenced in another entry — skip B2 delete
        continue;
      }

      // 2. Check if key has a matching row in the media table
      const filename = path.basename(key);
      const { data: mediaRows } = await supabaseClient
        .from('media')
        .select('id')
        .or(`url.ilike.%${key}%,filename.ilike.%${filename}%`)
        .limit(1);

      if (mediaRows && mediaRows.length > 0) {
        // Referenced in media library — skip B2 delete
        continue;
      }

      // 3. File is truly orphaned — delete from B2
      await deleteFromB2(key);
    } catch (err) {
      console.error('Error during B2 orphan check/cleanup for key:', key, err.message);
    }
  }
}

/**
 * Delete an object from Backblaze B2
 */
export async function deleteFromB2(storageKey) {
  if (storageKey && process.env.NODE_ENV === 'test') {
    testDeletedB2Keys.add(storageKey);
    return true;
  }

  if (!isB2Configured() || !storageKey) return false;

  let vault = keyVaultMap.get(storageKey);
  const activeVaults = [vaults.media1, vaults.media2, vaults.journal].filter(v => !!v.client);

  if (!vault) {
    for (const v of activeVaults) {
      try {
        await v.client.send(new HeadObjectCommand({ Bucket: v.bucket, Key: storageKey }));
        vault = v;
        break;
      } catch (_err) {}
    }
  }

  if (!vault) vault = getActiveVault('visuals') || vaults.journal;
  if (!vault || !vault.client) return false;

  try {
    const command = new DeleteObjectCommand({
      Bucket: vault.bucket,
      Key: storageKey,
    });
    await vault.client.send(command);
    keyVaultMap.delete(storageKey);
    b2UrlCache.delete(storageKey);
    return true;
  } catch (err) {
    console.error('Error deleting object from Backblaze B2:', storageKey, err.message);
    return false;
  }
}

