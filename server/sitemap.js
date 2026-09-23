/**
 * Helper utilities for dynamic XML sitemap generation & robots.txt
 */

export function escapeXml(str) {
  return String(str || '').replace(/[<>&'"]/g, (c) => {
    switch (c) {
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '&': return '&amp;';
      case '\'': return '&apos;';
      case '"': return '&quot;';
      default: return c;
    }
  });
}

export function generateSitemapXml(entries = [], baseUrl = 'https://blog.q04ti.dev') {
  const cleanBase = baseUrl.replace(/\/+$/, '');
  
  const staticPaths = [
    '/',
    '/journal',
    '/writing',
    '/photos',
    '/updates',
    '/archive',
    '/about'
  ];

  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
  xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';

  for (const path of staticPaths) {
    const loc = `${cleanBase}${path === '/' ? '/' : path}`;
    xml += '  <url>\n';
    xml += `    <loc>${escapeXml(loc)}</loc>\n`;
    xml += '  </url>\n';
  }

  const validEntries = (entries || []).filter(post => {
    if (!post) return false;
    const isPublished = (post.status || 'published') === 'published';
    const hasPasscode = Boolean(
      post.has_passcode ||
      post.is_protected ||
      (post.passcode && String(post.passcode).trim() !== '')
    );
    const showInFeed = post.show_in_feed !== false && Boolean(post.show_in_feed !== false);
    return isPublished && !hasPasscode && showInFeed;
  });

  for (const entry of validEntries) {
    const slugOrId = entry.slug || entry.id;
    if (!slugOrId) continue;
    const loc = `${cleanBase}/entry/${slugOrId}`;
    
    let lastmod = '';
    const dateVal = entry.updated_at || entry.date || entry.created_at;
    if (dateVal) {
      const d = new Date(dateVal);
      if (!isNaN(d.getTime())) {
        lastmod = d.toISOString();
      }
    }

    xml += '  <url>\n';
    xml += `    <loc>${escapeXml(loc)}</loc>\n`;
    if (lastmod) {
      xml += `    <lastmod>${escapeXml(lastmod)}</lastmod>\n`;
    }
    xml += '  </url>\n';
  }

  xml += '</urlset>';
  return xml;
}

export function getRobotsTxt(baseUrl = 'https://blog.q04ti.dev') {
  const cleanBase = baseUrl.replace(/\/+$/, '');
  return `User-agent: *\nAllow: /\n\nSitemap: ${cleanBase}/sitemap.xml\n`;
}
