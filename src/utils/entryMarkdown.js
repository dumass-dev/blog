import { marked } from 'marked';
import { escapeNonStandardTags } from './markdown.js';

const NBSP_ONLY_LINE = /^(?:&nbsp;\s*)+$/i;
const BR_ONLY_LINE = /^(?:<br\s*\/?>\s*)+$/i;
const LIST_OR_TABLE_LINE = /^\s{0,3}(?:[-*+]|\d{1,9}[.)])\s|^\s*\|/;
export const CONTENT_SPACER_DIV = '<div class="content-spacer" aria-hidden="true"></div>';

// Spacing model (the ONLY model, everywhere):
// - Blocks are separated by blank lines. One blank line = the standard
//   paragraph break. Each ADDITIONAL blank line is one deliberate extra
//   spacer worth exactly one line-height (rendered as a 1lh spacer).
// - No markers are ever stored: no &nbsp;, no <br>, no HTML comments.
// - Legacy migration: a line containing only &nbsp; (the old spacer marker)
//   converts into one extra blank line, preserving the spacer count the old
//   rendering produced.

// How many empty lines a gap between two blocks must contain, given how many
// plain blank lines (blanks) and legacy &nbsp; lines (nbsp) were found in it.
// One deliberate spacer = one extra empty line beyond the standard break.
const gapEmptyLineCount = (blanks, nbsp) => {
  if (nbsp > 0) {
    // Canonical old form "block, blank, (&nbsp;, blank) x N, block" carried
    // nbsp + 1 blanks for nbsp spacers; any blanks beyond that pattern are
    // additional deliberate spacers of their own.
    const extra = nbsp + Math.max(0, blanks - (nbsp + 1));
    return 1 + extra;
  }
  return Math.max(1, blanks);
};

// Normalize entry markdown. Outside fenced code blocks:
// - trailing whitespace is trimmed from every line
// - lines containing only <br> tags are dropped (real junk)
// - deliberate blank-line runs are PRESERVED (they are the spacing)
// - legacy &nbsp;-only lines migrate to extra blank lines (see above)
// - leading and trailing blank lines are dropped
export const normalizeEntryMarkdown = (md) => {
  if (!md) return '';
  const lines = String(md).replace(/\r\n/g, '\n').split('\n');
  const out = [];
  let inFence = false;
  let pendingBlanks = 0;
  let pendingNbsp = 0;
  const flushGap = () => {
    if (out.length && (pendingBlanks > 0 || pendingNbsp > 0)) {
      const count = gapEmptyLineCount(pendingBlanks, pendingNbsp);
      for (let i = 0; i < count; i++) out.push('');
    }
    pendingBlanks = 0;
    pendingNbsp = 0;
  };
  for (const rawLine of lines) {
    const line = rawLine.replace(/[ \t]+$/g, '');
    if (/^\s*```/.test(line)) {
      flushGap();
      inFence = !inFence;
      out.push(line);
      continue;
    }
    if (inFence) {
      out.push(rawLine);
      continue;
    }
    const trimmed = line.trim();
    if (BR_ONLY_LINE.test(trimmed)) continue; // junk: drop, gap counting unaffected
    if (NBSP_ONLY_LINE.test(trimmed)) {
      pendingNbsp += 1;
      continue;
    }
    if (trimmed === '') {
      pendingBlanks += 1;
      continue;
    }
    flushGap();
    out.push(line);
  }
  return out.join('\n');
};

// Walk the blank-line gaps of a markdown string (outside fenced code blocks)
// and rebuild each gap with `buildGap({ blanks, prevLine, nextLine })`, which
// returns the array of lines to emit for that gap. Leading/trailing gaps are
// dropped. Shared by the renderer (blank lines -> spacer divs) and the Visual
// editor parse shim (blank lines -> parseable empty-paragraph placeholders).
const rebuildBlankGaps = (md, buildGap) => {
  const lines = String(md || '').replace(/\r\n/g, '\n').split('\n');
  const out = [];
  let inFence = false;
  let pendingBlanks = 0;
  let prevContentLine = null;
  const flush = (nextLine) => {
    if (pendingBlanks > 0 && out.length) {
      out.push(...buildGap({ blanks: pendingBlanks, prevLine: prevContentLine, nextLine }));
    }
    pendingBlanks = 0;
  };
  for (const rawLine of lines) {
    if (/^\s*```/.test(rawLine)) {
      flush(rawLine);
      inFence = !inFence;
      out.push(rawLine);
      prevContentLine = rawLine;
      continue;
    }
    if (inFence) {
      out.push(rawLine);
      prevContentLine = rawLine;
      continue;
    }
    if (rawLine.trim() === '') {
      pendingBlanks += 1;
      continue;
    }
    flush(rawLine);
    out.push(rawLine);
    prevContentLine = rawLine;
  }
  return out.join('\n');
};

// Render-time expansion: each extra blank line (beyond the standard single
// blank line between blocks) becomes one .content-spacer block whose height
// is exactly one line tall (1lh). Inside/between list items and table
// rows, extra blanks collapse to a normal break instead (a spacer element
// would break the list/table structure).
export const expandBlankLineSpacers = (md) => rebuildBlankGaps(md, ({ blanks, prevLine, nextLine }) => {
  const extra = blanks - 1;
  if (extra <= 0) return [''];
  if ((prevLine && LIST_OR_TABLE_LINE.test(prevLine)) || (nextLine && LIST_OR_TABLE_LINE.test(nextLine))) return [''];
  const gap = [''];
  for (let i = 0; i < extra; i++) gap.push(CONTENT_SPACER_DIV, '');
  return gap;
});

// INTERNAL parse shim for the Visual editor only. TipTap/marked cannot turn
// extra blank lines into empty paragraphs (it collapses them), so while
// loading markdown into the editor each extra blank line is temporarily
// expanded into a placeholder paragraph line. This representation never
// reaches storage and never the Markdown tab: the editor converts those
// placeholder paragraphs into true empty paragraphs on load, and serializing
// the document converts empty paragraphs back into plain blank lines.
export const markdownForVisualParse = (md) => rebuildBlankGaps(md, ({ blanks, prevLine, nextLine }) => {
  const extra = blanks - 1;
  if (extra <= 0) return [''];
  if ((prevLine && LIST_OR_TABLE_LINE.test(prevLine)) || (nextLine && LIST_OR_TABLE_LINE.test(nextLine))) return [''];
  const gap = [''];
  for (let i = 0; i < extra; i++) gap.push('&nbsp;', '');
  return gap;
});

// Convert raw TipTap serializer output into canonical entry markdown.
// The serializer joins document blocks with exactly "\n\n" and renders an
// empty paragraph block as an empty item (or, from the second consecutive
// one, as an &nbsp; item). Every empty paragraph in the visual document is
// a deliberate spacer the author added with Enter, so each empty item is
// stored as exactly ONE extra plain blank line:
// [p, empty, p] -> "p\n\n\np". Fenced code blocks pass through verbatim; the
// empty items touching a fence are block separators, not paragraphs, and are
// preserved as-is.
export const serializeVisualMarkdown = (md) => {
  if (!md) return '';
  const fenceSplit = String(md).replace(/\r\n/g, '\n').split(/(```[\s\S]*?```)/g);
  const lastSegIdx = fenceSplit.length - 1;
  const rebuilt = fenceSplit.map((segment, segIdx) => {
    if (segIdx % 2 === 1) return segment; // fenced code block: verbatim
    const items = segment.split('\n\n');
    let out = '';
    items.forEach((item, itemIdx) => {
      const trimmed = item.trim();
      const isEmptyPara = trimmed === '' || NBSP_ONLY_LINE.test(trimmed);
      const touchesFence = (itemIdx === 0 && segIdx > 0) || (itemIdx === items.length - 1 && segIdx < lastSegIdx);
      if (itemIdx === 0) {
        out += isEmptyPara && !touchesFence ? '' : item;
        return;
      }
      if (isEmptyPara && !touchesFence) {
        out += '\n'; // one extra blank line per empty paragraph
      } else {
        out += '\n\n' + item;
      }
    });
    return out;
  }).join('');
  return normalizeEntryMarkdown(rebuilt);
};

export const processEmbeds = (rawText) => {
  let processed = rawText ? String(rawText).replace(/\\n/g, '\n').replace(/\r\n/g, '\n') : '';

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
  const processedContent = escapeNonStandardTags(processEmbeds(expandBlankLineSpacers(normalizeEntryMarkdown(content))));
  const rawHtml = unwrapMediaFromParagraphs(marked.parse(processedContent, {
    gfm: true,
    breaks: true
  }));
  return rawHtml;
}
