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

/**
 * Generate a sensible, structured storage key for files.
 * Format: images/2026/09/<uuid>.<ext>
 *         videos/2026/09/<uuid>.<ext>
 *         audio/2026/09/<uuid>.<ext>
 */
export function generateStoragePath(originalName, mimeType) {
  const ext = path.extname(originalName) || '';
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

/**
 * Generate a temporary signed URL for a private Backblaze B2 object (default 1 hour)
 */
export async function getB2SignedUrl(storageKey, expiresInSeconds = 3600) {
  if (process.env.NODE_ENV === 'test') {
    return `http://127.0.0.1:3099/${storageKey}`;
  }

  if (!s3Client || !storageKey) return null;

  try {
    const getCommand = new GetObjectCommand({
      Bucket: bucket,
      Key: storageKey,
    });
    return await getSignedUrl(s3Client, getCommand, { expiresIn: expiresInSeconds });
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
  const match = urlOrKey.match(/(?:images|videos|audio|files)\/\d{4}\/\d{2}\/[a-f0-9\-]+\.[a-z0-9]+/i);
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
  return urlOrText.replace(/https?:\/\/[^\s\)\"]+(?:images|videos|audio|files)\/\d{4}\/\d{2}\/[a-f0-9\-]+\.[a-z0-9]+[^\s\)\"]*/gi, freshUrl);
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
