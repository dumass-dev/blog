// One upload routine for the media picker and the Media Manager.
//
// Files go straight from the browser to Backblaze (Vercel rejects request
// bodies over 4.5 MB, so big photos and videos can't pass through the
// server). Storage is a chain of three free 10 GB buckets on separate
// accounts (media-1 -> media-2 -> q04ti-blog). The server can't reliably
// know which bucket is full (its memory resets on every cold start), so a
// bucket that refuses the upload (full / storage cap) is skipped: we ask for
// the next bucket and try again. Small files keep the server upload as a
// last resort.

const SERVER_LIMIT_BYTES = 4 * 1024 * 1024; // safely under Vercel's 4.5 MB body cap
const MAX_BUCKET_ATTEMPTS = 3;

function authHeaders(token, json = true) {
  return {
    ...(json ? { 'Content-Type': 'application/json' } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {})
  };
}

async function readError(res, fallback) {
  const data = await res.json().catch(() => ({}));
  return data.error || fallback;
}

async function uploadViaServer(file, token) {
  const formData = new FormData();
  formData.append('file', file);
  const res = await fetch('/api/media/upload', {
    method: 'POST',
    headers: authHeaders(token, false),
    body: formData
  });
  if (!res.ok) throw new Error(await readError(res, 'Upload failed.'));
  return res.json().catch(() => ({}));
}

/**
 * Upload a file to media storage. Resolves with the server's media record
 * response; throws an Error with a readable message on failure.
 */
export async function uploadMediaFile(file, token) {
  if (!file) throw new Error('No file selected.');
  const mimeType = file.type || 'application/octet-stream';
  const isSmall = file.size < SERVER_LIMIT_BYTES;
  const excludeBuckets = [];
  let lastError = null;

  for (let attempt = 0; attempt < MAX_BUCKET_ATTEMPTS; attempt++) {
    // 1. Ask the server for a signed upload URL in the next usable bucket.
    let presign;
    try {
      const res = await fetch('/api/b2-upload', {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify({ filename: file.name, mimeType, sizeBytes: file.size, excludeBuckets })
      });
      if (!res.ok) throw new Error(await readError(res, 'Could not authorize the upload.'));
      presign = await res.json();
    } catch (err) {
      lastError = err;
      break; // the server can't hand out a bucket — no point retrying buckets
    }

    // 2. Send the file straight to that bucket.
    let refused = false;
    try {
      const put = await fetch(presign.uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': mimeType },
        body: file
      });
      if (!put.ok) {
        const text = await put.text().catch(() => '');
        refused = true;
        lastError = new Error(`Storage refused the upload (HTTP ${put.status})${text ? `: ${text.slice(0, 120)}` : ''}`);
      }
    } catch (err) {
      // Network/CORS failure — or a full bucket whose error lacks CORS headers.
      refused = true;
      lastError = new Error(`Couldn't reach storage (${err.message}). If this keeps happening, check the bucket's CORS rules.`);
    }

    if (refused) {
      if (presign.bucket && !excludeBuckets.includes(presign.bucket)) {
        excludeBuckets.push(presign.bucket);
        continue; // try the next bucket in the chain
      }
      break;
    }

    // 3. Confirm: the server checks the file in the bucket it landed in and records it.
    const confirm = await fetch('/api/media/confirm', {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({
        storageKey: presign.storageKey,
        originalName: file.name,
        mimeType,
        sizeBytes: file.size,
        publicUrl: presign.publicUrl,
        bucket: presign.bucket
      })
    });
    if (!confirm.ok) throw new Error(await readError(confirm, 'The uploaded file failed verification.'));
    return confirm.json().catch(() => ({}));
  }

  // Direct upload didn't work: small files can still go through the server
  // (which also skips full buckets on its own).
  if (isSmall) return uploadViaServer(file, token);

  const sizeMb = (file.size / 1024 / 1024).toFixed(1);
  throw new Error(`Upload failed for this ${sizeMb} MB file. ${lastError ? lastError.message : ''}`.trim());
}
