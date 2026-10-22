import { MarkdownManager } from '@tiptap/markdown';
import { StarterKit } from '@tiptap/starter-kit';
import { customEditorialExtensions } from '../components/editor/extensions/index.js';
import { markdownToHtmlUnsanitized } from './entryMarkdown.js';

let sharedManager = null;

export const getFidelityMarkdownManager = () => {
  if (!sharedManager) {
    const sk = StarterKit.configure({
      underline: false,
      trailingNode: false,
      link: {
        openOnClick: false,
        protocols: ['http', 'https', 'mailto', 'tel']
      }
    });
    sharedManager = new MarkdownManager({
      extensions: [sk, ...customEditorialExtensions],
      markedOptions: {
        gfm: true,
        breaks: true
      }
    });
  }
  return sharedManager;
};

export const markdownToDoc = (markdownText) => {
  const manager = getFidelityMarkdownManager();
  return manager.parse(markdownText || '');
};

export const docToMarkdown = (doc) => {
  const manager = getFidelityMarkdownManager();
  return manager.serialize(doc || { type: 'doc', content: [] });
};

export const roundTripMarkdown = (markdownText) => {
  if (!markdownText) return '';
  const doc = markdownToDoc(markdownText);
  return docToMarkdown(doc);
};

export const extractMediaTokens = (html) => {
  if (!html) return [];
  const tokens = [];

  // Match img tags
  const imgRegex = /<img\b([^>]*)>/gi;
  let match;
  while ((match = imgRegex.exec(html)) !== null) {
    const attrs = match[1];
    const srcMatch = attrs.match(/src=["']([^"']*)["']/i);
    const altMatch = attrs.match(/alt=["']([^"']*)["']/i);
    tokens.push({
      type: 'img',
      src: srcMatch ? srcMatch[1] : '',
      alt: altMatch ? altMatch[1] : ''
    });
  }

  // Match video tags
  const videoRegex = /<video\b([^>]*)>/gi;
  while ((match = videoRegex.exec(html)) !== null) {
    const attrs = match[1];
    const srcMatch = attrs.match(/src=["']([^"']*)["']/i);
    tokens.push({
      type: 'video',
      src: srcMatch ? srcMatch[1] : ''
    });
  }

  // Match iframe tags
  const iframeRegex = /<iframe\b([^>]*)>/gi;
  while ((match = iframeRegex.exec(html)) !== null) {
    const attrs = match[1];
    const srcMatch = attrs.match(/src=["']([^"']*)["']/i);
    tokens.push({
      type: 'iframe',
      src: srcMatch ? srcMatch[1] : ''
    });
  }

  // Match figcaption tags
  const captionRegex = /<figcaption\b[^>]*>([\s\S]*?)<\/figcaption>/gi;
  while ((match = captionRegex.exec(html)) !== null) {
    tokens.push({
      type: 'caption',
      text: match[1].replace(/<[^>]+>/g, '').trim()
    });
  }

  return tokens;
};

export const normalizeTextContent = (html) => {
  if (!html) return '';
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
};

// Inline HTML tags the Visual schema cannot represent. The markdown parser
// silently flattens these to plain text (the words survive, the formatting
// does not), and the text/media comparison below cannot see formatting-only
// loss — so an entry using them would degrade invisibly on any Visual edit
// + save. Detect them deterministically (fence- and code-span-aware) and
// let the gate keep such entries in Markdown mode. Tags with markdown
// equivalents (<strong>, <em>, <code>, <a>, <s>…) are NOT listed: the
// parser converts those to real marks and they round-trip faithfully.
// Block-level raw HTML is likewise fine (carried by the RawBlock node).
const UNREPRESENTABLE_INLINE_HTML = /<\/?(?:u|mark|span|abbr|small|cite|q|time|data|var|samp|ins|font|bdi|bdo|dfn)\b[^>]*>/i;

export const findUnrepresentableInlineHtml = (md) => {
  if (!md) return null;
  let inFence = false;
  for (const line of String(md).replace(/\r\n/g, '\n').split('\n')) {
    if (/^\s*```/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    // Strip inline code spans: tags inside backticks are literal text.
    const prose = line.replace(/`[^`\n]*`/g, '');
    const match = prose.match(UNREPRESENTABLE_INLINE_HTML);
    if (match) return match[0];
  }
  return null;
};

export const checkFidelity = (sourceMarkdown) => {
  if (!sourceMarkdown || typeof sourceMarkdown !== 'string') {
    return { ok: true, roundtripped: sourceMarkdown || '' };
  }

  const rawTag = findUnrepresentableInlineHtml(sourceMarkdown);
  if (rawTag) {
    const tagName = (rawTag.match(/^<\/?([a-z]+)/i) || [])[1] || 'html';
    return {
      ok: false,
      reason: `Text content altered: raw HTML <${tagName.toLowerCase()}> formatting that the Visual editor cannot keep`,
      roundtripped: sourceMarkdown
    };
  }

  try {
    const roundtripped = roundTripMarkdown(sourceMarkdown);
    const htmlA = markdownToHtmlUnsanitized(sourceMarkdown);
    const htmlB = markdownToHtmlUnsanitized(roundtripped);

    // 1. Compare media elements (exact source and count in exact order)
    const mediaA = extractMediaTokens(htmlA);
    const mediaB = extractMediaTokens(htmlB);

    if (mediaA.length !== mediaB.length) {
      return {
        ok: false,
        reason: `Media element count mismatch (original: ${mediaA.length}, roundtripped: ${mediaB.length})`,
        roundtripped,
        mediaA,
        mediaB
      };
    }

    for (let i = 0; i < mediaA.length; i++) {
      const a = mediaA[i];
      const b = mediaB[i];
      if (a.type !== b.type || a.src !== b.src) {
        return {
          ok: false,
          reason: `Media mismatch at position ${i}: ${a.type} (${a.src}) vs ${b.type} (${b.src})`,
          roundtripped
        };
      }
    }

    // 2. Compare normalized text content
    const textA = normalizeTextContent(htmlA);
    const textB = normalizeTextContent(htmlB);

    if (textA !== textB) {
      // Find diff snippet
      let diffIdx = 0;
      while (diffIdx < textA.length && diffIdx < textB.length && textA[diffIdx] === textB[diffIdx]) {
        diffIdx++;
      }
      const snippetA = textA.slice(Math.max(0, diffIdx - 15), diffIdx + 25);
      const snippetB = textB.slice(Math.max(0, diffIdx - 15), diffIdx + 25);
      return {
        ok: false,
        reason: `Text content altered around position ${diffIdx}: [${snippetA}] vs [${snippetB}]`,
        roundtripped
      };
    }

    return {
      ok: true,
      roundtripped
    };
  } catch (err) {
    return {
      ok: false,
      reason: `Fidelity check threw an exception: ${err.message}`,
      roundtripped: sourceMarkdown
    };
  }
};
