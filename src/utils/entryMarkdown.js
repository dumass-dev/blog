import { marked } from 'marked';
import { escapeNonStandardTags } from './markdown.js';

export const processEmbeds = (rawText) => {
  let processed = rawText ? String(rawText).replace(/\\n/g, '\n').replace(/\r\n/g, '\n') : '';

  // Convert intentional consecutive empty lines (3 or more newlines) outside fenced code blocks into content spacers
  const codeBlockRegex = /(```[\s\S]*?```)/g;
  const parts = processed.split(codeBlockRegex);
  processed = parts.map((part, index) => {
    // Leave code blocks untouched
    if (index % 2 === 1) return part;
    // Normalize empty lines with whitespace so spaces/tabs on blank lines don't break detection
    const normalized = part.replace(/\n[ \t]+(?=\n)/g, '\n');
    return normalized.replace(/\n{3,}/g, (match) => {
      const extraLines = match.length - 2;
      const spacers = Array(extraLines).fill('<div class="content-spacer" aria-hidden="true"></div>').join('\n');
      return `\n\n${spacers}\n\n`;
    });
  }).join('');

  // Convert standalone YouTube URLs into iframe embeds (supports watch, shorts, embed, youtu.be, mobile)
  const youtubeRegex = /(?:^|\n)\s*(?:https?:\/\/)?(?:(?:www|m)\.)?(?:youtube(?:-nocookie)?\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})(?:\S*)?/g;
  processed = processed.replace(youtubeRegex, (_match, videoId) => {
    return `\n<div class="video-responsive"><iframe src="https://www.youtube.com/embed/${videoId}" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe></div>\n`;
  });

  // Convert standalone mp4/webm video URLs into HTML5 video tags
  const videoFileRegex = /(?:^|\n)(https?:\/\/\S+\.(?:mp4|webm)|\/uploads\/\S+\.(?:mp4|webm))/gi;
  processed = processed.replace(videoFileRegex, (_match, videoUrl) => {
    const isValidScheme = /^https?:\/\//i.test(videoUrl) || videoUrl.startsWith('/uploads/');
    if (!isValidScheme) return _match;
    const safeUrl = videoUrl.replace(/"/g, '%22').replace(/'/g, '%27').replace(/`/g, '%60');
    return `\n<div class="video-responsive"><video controls src="${safeUrl}"></video></div>\n`;
  });

  // Convert raw B2 storage keys in markdown images to /api/media/file/... permanent proxy URLs
  processed = processed.replace(/(?:\\)?!\[(.*?)\]\(((?:images|videos|audio|files)\/(?:[a-zA-Z0-9_\-./% ]+)\.[a-zA-Z0-9]+)\)/gi, '![$1](/api/media/file/$2)');
  // Convert presigned Backblaze B2 URLs to clean permanent proxy URLs so they never expire
  processed = processed.replace(/(?:\\)?!\[(.*?)\]\((https?:\/\/[^\s)]*backblazeb2\.com[^\s)]*(?:images|videos|audio|files)\/(?:[a-zA-Z0-9_\-./% ]+)\.[a-zA-Z0-9]+[^\s)]*)\)/gi, (_m, alt, fullUrl) => {
    const match = fullUrl.match(/(?:images|videos|audio|files)\/(?:[a-zA-Z0-9_\-./% ]+)\.[a-zA-Z0-9]+/i);
    return match ? `![${alt}](/api/media/file/${match[0]})` : _m;
  });

  // Helper to parse size and alignment modifiers from alt text (e.g. ![alt|small] or ![alt|300px] or ![alt|medium|left])
  const parseImageSizeAndAlign = (rawAlt) => {
    let cleanAlt = rawAlt || '';
    let sizeClass = '';
    let alignClass = '';
    let customStyle = '';

    const applyModifier = (mod) => {
      let cleanMod = mod.trim().toLowerCase();
      cleanMod = cleanMod.replace(/^(?:w|width|size)\s*[:=]\s*/i, '');

      if (cleanMod === 'small' || cleanMod === 'sm' || cleanMod === 's') {
        sizeClass = 'image-size-small';
      } else if (cleanMod === 'medium' || cleanMod === 'md' || cleanMod === 'm') {
        sizeClass = 'image-size-medium';
      } else if (cleanMod === 'large' || cleanMod === 'lg' || cleanMod === 'l') {
        sizeClass = 'image-size-large';
      } else if (cleanMod === 'full' || cleanMod === 'xl') {
        sizeClass = 'image-size-full';
      } else if (cleanMod === 'left' || cleanMod === 'wrap-left' || cleanMod === 'wrap:left' || cleanMod === 'float-left') {
        alignClass = 'image-align-left';
      } else if (cleanMod === 'right' || cleanMod === 'wrap-right' || cleanMod === 'wrap:right' || cleanMod === 'float-right') {
        alignClass = 'image-align-right';
      } else if (cleanMod === 'center' || cleanMod === 'middle') {
        alignClass = 'image-align-center';
      } else if (/^\d{1,3}%$/.test(cleanMod)) {
        customStyle = `width: ${cleanMod}; max-width: 100%;`;
      } else if (/^\d+(?:px|rem|vw|vh)$/.test(cleanMod)) {
        customStyle = `width: ${cleanMod}; max-width: 100%;`;
      } else if (/^\d+$/.test(cleanMod)) {
        customStyle = `width: ${cleanMod}px; max-width: 100%;`;
      }
    };

    if (cleanAlt.includes('|')) {
      const parts = cleanAlt.split('|');
      cleanAlt = parts[0].trim();
      for (let i = 1; i < parts.length; i++) {
        applyModifier(parts[i]);
      }
    } else {
      const lower = cleanAlt.trim().toLowerCase();
      if (['left', 'wrap-left', 'wrap:left', 'float-left', 'right', 'wrap-right', 'wrap:right', 'float-right', 'center', 'middle', 'small', 'medium', 'large'].includes(lower) || /^\d{1,3}%$/.test(lower)) {
        applyModifier(lower);
        cleanAlt = '';
      }
    }

    if ((alignClass === 'image-align-left' || alignClass === 'image-align-right') && !customStyle && !sizeClass) {
      customStyle = 'width: 45%; max-width: 45%;';
    }

    return { cleanAlt, sizeClass, alignClass, customStyle };
  };

  // Convert images followed by "Caption: " into HTML figure blocks (with size support)
  const captionRegex = /(?:\\)?!\[(.*?)\]\((.*?)\)\s*\r?\n\s*[Cc]aption:\s*([^\r\n]+)/gi;
  processed = processed.replace(captionRegex, (_match, rawAlt, url, captionText) => {
    const { cleanAlt, sizeClass, alignClass, customStyle } = parseImageSizeAndAlign(rawAlt);
    const safeUrl = url.replace(/"/g, '%22').replace(/'/g, '%27');
    const safeAlt = cleanAlt.replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const classes = ['media-figure', sizeClass, alignClass].filter(Boolean).join(' ');
    const styleAttr = customStyle ? ` style="${customStyle}"` : '';
    return `\n<figure class="${classes}"${styleAttr}><img src="${safeUrl}" alt="${safeAlt}" loading="lazy" decoding="async"><figcaption>${captionText.trim()}</figcaption></figure>\n`;
  });

  // Convert all markdown images directly into <img> tags with alignment/size classes
  const allImageRegex = /(?:\\)?!\[(.*?)\]\((.*?)\)/gi;
  processed = processed.replace(allImageRegex, (_match, rawAlt, url) => {
    const { cleanAlt, sizeClass, alignClass, customStyle } = parseImageSizeAndAlign(rawAlt);
    const safeUrl = url.replace(/"/g, '%22').replace(/'/g, '%27');
    const safeAlt = cleanAlt.replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const classes = [sizeClass, alignClass].filter(Boolean).join(' ');
    const classAttr = classes ? ` class="${classes}"` : '';
    const styleAttr = customStyle ? ` style="${customStyle}"` : '';
    return `<img src="${safeUrl}" alt="${safeAlt}"${classAttr}${styleAttr} loading="lazy" decoding="async">`;
  });

  // Handle [grid] shortcode for side-by-side media layouts
  processed = processed.replace(/\[grid\]([\s\S]*?)\[\/grid\]/gi, (match, innerText) => {
    return `\n<div class="media-grid">\n\n${innerText}\n\n</div>\n`;
  });

  // Handle [wrap:left (width)] / [wrap:right (width)] / [wrap:center (width)] shortcode for magazine-style text wraps
  const wrapRegex = /\[wrap:(left|right|center)(?:\s+([\d]+(?:%|px|rem)))?\]([\s\S]*?)\[\/wrap\]/gi;
  processed = processed.replace(wrapRegex, (_match, align, rawWidth, innerText) => {
    const normAlign = align.toLowerCase();
    let customStyle = '';
    if (rawWidth) {
      customStyle = `max-width: ${rawWidth}; width: 100%;`;
    }
    const styleAttr = customStyle ? ` style="${customStyle}"` : '';
    return `\n<div class="editorial-wrap editorial-wrap-${normAlign}"${styleAttr}>\n\n${innerText.trim()}\n\n</div>\n`;
  });

  // Handle [clear] or [break] shortcodes to end floating text wraps cleanly
  processed = processed.replace(/\[(?:clear|break)\]/gi, '\n<div class="editorial-clear"></div>\n');

  return processed;
};

export const unwrapMediaFromParagraphs = (html) => {
  if (!html) return '';
  // 1. Unwrap paragraphs that contain ONLY an image or figure
  let out = html.replace(/<p>\s*((?:<img\b[^>]*>|<figure\b[\s\S]*?<\/figure>))\s*<\/p>/gi, '$1\n');

  // 2. If a paragraph contains an image/figure mixed with text or line breaks, split it so media renders as its own element
  out = out.replace(/<p>([\s\S]*?)<\/p>/gi, (match, inner) => {
    if (!/<img\b|<figure\b/i.test(inner)) return match;
    const parts = inner.split(/(<img\b[^>]*>|<figure\b[\s\S]*?<\/figure>)/gi);
    return parts.map(part => {
      const trimmed = part.trim();
      if (/^<(?:img|figure)\b/i.test(trimmed)) return trimmed;
      const cleanText = trimmed.replace(/^(?:\s*<br\s*\/?>\s*)+|(?:\s*<br\s*\/?>\s*)+$/gi, '').trim();
      return cleanText ? `<p>${cleanText}</p>` : '';
    }).filter(Boolean).join('\n');
  });

  return out;
};

export function markdownToHtmlUnsanitized(content) {
  if (!content) return '';
  const processedContent = escapeNonStandardTags(processEmbeds(content));
  const rawHtml = unwrapMediaFromParagraphs(marked.parse(processedContent, {
    gfm: true,
    breaks: true
  }));
  return rawHtml;
}
