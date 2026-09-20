/**
 * Auto-refresh expired Backblaze B2 presigned URLs on img load failure
 */
export async function handleImageError(e, originalUrl) {
  const img = e.currentTarget;
  if (!img || img.dataset.hasRefreshed === 'true') return;
  img.dataset.hasRefreshed = 'true';

  const targetUrl = originalUrl || img.src;
  if (!targetUrl) return;

  try {
    const res = await fetch(`/api/b2/refresh?url=${encodeURIComponent(targetUrl)}`);
    if (res.ok) {
      const data = await res.json();
      if (data.url && data.url !== targetUrl) {
        img.src = data.url;
      }
    }
  } catch (err) {
    console.error('Failed to refresh image URL:', err);
  }
}
