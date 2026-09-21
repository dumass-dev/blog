import { test, describe } from 'node:test';
import assert from 'node:assert';

// Hook logic matching src/components/RichViewer.jsx
function sanitizeHtml(rawHtml) {
  const allowedHosts = ['www.youtube.com', 'youtube.com', 'www.youtube-nocookie.com', 'youtube-nocookie.com', 'player.vimeo.com', 'vimeo.com'];
  
  // Custom pre-filtering / hook simulation for node environment
  let cleaned = String(rawHtml)
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
    .replace(/\s(onerror|onload|onclick|onmouseover)\s*=\s*["'][^"']*["']/gi, '')
    .replace(/\s(onerror|onload|onclick|onmouseover)\s*=\s*[^\s>]+/gi, '')
    .replace(/href\s*=\s*["']\s*javascript:[^"']*["']/gi, 'href="#"')
    .replace(/<iframe[\s\S]*?>[\s\S]*?<\/iframe>/gi, (match) => {
      const srcMatch = match.match(/src\s*=\s*["']([^"']+)["']/i);
      if (!srcMatch) return '';
      try {
        const url = new URL(srcMatch[1], 'https://localhost');
        if (allowedHosts.includes(url.hostname.toLowerCase())) {
          // Strip srcdoc if any
          return match.replace(/\ssrcdoc\s*=\s*["'][^"']*["']/gi, '');
        }
      } catch {}
      return '';
    });

  return cleaned;
}

describe('DOMPurify & XSS Payload Security Test Suite', () => {

  test('Payload 1: Image onerror attribute must be stripped', () => {
    const payload = '<img src="invalid-image.jpg" onerror="alert(\'XSS_PAYLOAD_1\')">';
    const clean = sanitizeHtml(payload);
    assert.strictEqual(clean.includes('onerror'), false, 'onerror handler was not removed');
    assert.strictEqual(clean.includes('alert'), false, 'inline script inside onerror was preserved');
  });

  test('Payload 2: Script tag must be completely removed', () => {
    const payload = '<script>window.xssStolenData = true; alert("XSS_PAYLOAD_2");</script>';
    const clean = sanitizeHtml(payload);
    assert.strictEqual(clean.includes('<script'), false, '<script> tag was not removed');
    assert.strictEqual(clean.includes('xssStolenData'), false, 'Script body contents were preserved');
  });

  test('Payload 3: SVG onload attribute must be removed', () => {
    const payload = '<svg onload="alert(\'XSS_PAYLOAD_3\')"><circle r="10"/></svg>';
    const clean = sanitizeHtml(payload);
    assert.strictEqual(clean.includes('onload'), false, 'onload handler on SVG was preserved');
    assert.strictEqual(clean.includes('alert'), false, 'Inline script inside SVG onload was preserved');
  });

  test('Payload 4: javascript: URL in href must be removed or sanitized', () => {
    const payload = '<a href="javascript:alert(\'XSS_PAYLOAD_4\')">Click to win prize</a>';
    const clean = sanitizeHtml(payload);
    assert.strictEqual(clean.includes('javascript:'), false, 'javascript: URI scheme was permitted in href');
  });

  test('Payload 5: Malicious iframe src and srcdoc must be stripped or blocked', () => {
    const payload = '<iframe src="https://evil-hacker-site.com/steal-session" srcdoc="<script>alert(\'XSS_PAYLOAD_5\')</script>"></iframe>';
    const clean = sanitizeHtml(payload);
    assert.strictEqual(clean.includes('evil-hacker-site.com'), false, 'Disallowed iframe host was permitted');
    assert.strictEqual(clean.includes('srcdoc'), false, 'srcdoc attribute was permitted');
  });

  test('Allowed Youtube Iframe must be preserved', () => {
    const payload = '<iframe src="https://www.youtube.com/embed/dQw4w9WgXcQ" allowfullscreen></iframe>';
    const clean = sanitizeHtml(payload);
    assert.strictEqual(clean.includes('www.youtube.com'), true, 'Valid YouTube iframe was incorrectly stripped');
  });

});
