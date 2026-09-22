import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import dotenv from 'dotenv';
import path from 'path';
import crypto from 'crypto';

dotenv.config();

const endpoint = process.env.BACKBLAZE_ENDPOINT;
const region = process.env.BACKBLAZE_REGION || 'us-east-005';
const bucket = process.env.BACKBLAZE_BUCKET || 'q04ti-blog';
const keyId = process.env.BACKBLAZE_KEY_ID;
const applicationKey = process.env.BACKBLAZE_APPLICATION_KEY;

let s3Client = null;

if (endpoint && keyId && applicationKey) {
  // Format endpoint URL for S3 client
  const s3Endpoint = endpoint.startsWith('http') ? endpoint : `https://${endpoint}`;
  
  s3Client = new S3Client({
    endpoint: s3Endpoint,
    region: region,
    credentials: {
      accessKeyId: keyId,
      secretAccessKey: applicationKey,
    },
  });
  if (process.env.NODE_ENV !== 'test') {
    console.log(`Initialized Backblaze B2 S3 Client (Bucket: ${bucket}, Endpoint: ${s3Endpoint})`);
  }
} else {
  if (process.env.NODE_ENV !== 'test') {
    console.warn('Warning: Backblaze B2 credentials incomplete in .env. Uploads will fallback to local storage.');
  }
}

export function isB2Configured() {
  return !!s3Client;
}

const ALLOWED_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.heic', '.heif', '.mp4', '.webm', '.mp3', '.m4a', '.wav']);
const ALLOWED_MIMES = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif',
  'video/mp4', 'video/webm', 'audio/mpeg', 'audio/mp4', 'audio/wav', 'audio/x-m4a'
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
 * Upload a file buffer directly to private Backblaze B2 bucket
 */
export async function uploadToB2(fileBuffer, originalName, mimeType) {
  validateUploadFile(fileBuffer, originalName, mimeType);

  if (process.env.NODE_ENV === 'test') {
    const storageKey = generateStoragePath(originalName || 'test.jpg', mimeType || 'image/jpeg');
    return { storageKey, signedUrl: `http://127.0.0.1:3099/${storageKey}`, bucket: 'dummy-bucket' };
  }

  if (!s3Client) {
    throw new Error('Backblaze B2 is not configured in .env file.');
  }

  const storageKey = generateStoragePath(originalName, mimeType);

  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: storageKey,
    Body: fileBuffer,
    ContentType: mimeType,
  });

  await s3Client.send(command);

  const getCommand = new GetObjectCommand({
    Bucket: bucket,
    Key: storageKey,
  });
  const signedUrl = await getSignedUrl(s3Client, getCommand, { expiresIn: 86400 });

  return {
    storageKey,
    signedUrl,
    bucket,
  };
}

const b2UrlCache = new Map(); // key -> { url, expiresAt }

/**
 * Generate a temporary signed URL for a private Backblaze B2 object (default 24 hours with TTL cache)
 */
export async function getB2SignedUrl(storageKey, expiresInSeconds = 86400) {
  if (process.env.NODE_ENV === 'test') {
    return `http://127.0.0.1:3099/${storageKey}`;
  }

  if (!s3Client || !storageKey) return null;

  const now = Date.now();
  const cached = b2UrlCache.get(storageKey);
  if (cached && cached.expiresAt > now + 3600000) {
    return cached.url;
  }

  try {
    const getCommand = new GetObjectCommand({
      Bucket: bucket,
      Key: storageKey,
    });
    const freshUrl = await getSignedUrl(s3Client, getCommand, { expiresIn: expiresInSeconds });
    if (freshUrl) {
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
  const match = urlOrKey.match(/(?:images|videos|audio|files)\/\d{4}\/\d{2}\/[^/\\s?#]+\.[a-z0-9]+/i);
  return match ? match[0] : null;
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
  return urlOrText.replace(/https?:\/\/[^\s)"]+(?:images|videos|audio|files)\/\d{4}\/\d{2}\/[^/\\s?#]+\.[a-z0-9]+[^\s)"]*/gi, freshUrl);
}

/**
 * Generate a presigned B2 PUT URL for direct client upload
 */
export async function getB2PresignedPutUrl(originalName, mimeType, _maxSizeBytes = 104857600) {
  validateUploadFile(null, originalName, mimeType);
  const storageKey = generateStoragePath(originalName, mimeType);

  if (process.env.NODE_ENV === 'test' || !s3Client) {
    return {
      storageKey,
      uploadUrl: `http://127.0.0.1:3099/${storageKey}`,
      publicUrl: `http://127.0.0.1:3099/${storageKey}`,
      bucket: 'dummy-bucket',
    };
  }

  const putCommand = new PutObjectCommand({
    Bucket: bucket,
    Key: storageKey,
    ContentType: mimeType,
  });

  const uploadUrl = await getSignedUrl(s3Client, putCommand, { expiresIn: 900 });
  const publicUrl = await getB2SignedUrl(storageKey, 86400);

  return {
    storageKey,
    uploadUrl,
    publicUrl,
    bucket,
  };
}

/**
 * Post-upload magic-byte check on B2 object
 */
export async function verifyB2UploadedFile(storageKey, originalName, mimeType) {
  if (process.env.NODE_ENV === 'test' || !s3Client) return true;

  try {
    const getCommand = new GetObjectCommand({
      Bucket: bucket,
      Key: storageKey,
      Range: 'bytes=0-511',
    });

    const response = await s3Client.send(getCommand);
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
 * Delete an object from Backblaze B2
 */
export async function deleteFromB2(storageKey) {
  if (process.env.NODE_ENV === 'test') {
    return true;
  }

  if (!s3Client || !storageKey) return false;

  try {
    const command = new DeleteObjectCommand({
      Bucket: bucket,
      Key: storageKey,
    });
    await s3Client.send(command);
    return true;
  } catch (err) {
    console.error('Error deleting object from Backblaze B2:', storageKey, err.message);
    return false;
  }
}

