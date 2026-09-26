// Standard allowed HTML tags in rich text / markdown
export const STANDARD_HTML_TAGS = new Set([
  'a', 'abbr', 'address', 'article', 'aside', 'b', 'bdi', 'bdo', 'blockquote', 'br',
  'caption', 'cite', 'code', 'col', 'colgroup', 'data', 'dd', 'del', 'details', 'dfn',
  'div', 'dl', 'dt', 'em', 'figcaption', 'figure', 'footer', 'h1', 'h2', 'h3',
  'h4', 'h5', 'h6', 'header', 'hr', 'i', 'iframe', 'img', 'ins', 'kbd', 'li',
  'mark', 'nav', 'ol', 'p', 'pre', 'q', 'rp', 'rt', 'ruby', 's', 'samp',
  'section', 'small', 'source', 'span', 'strong', 'sub', 'summary', 'sup',
  'svg', 'table', 'tbody', 'td', 'tfoot', 'th', 'thead', 'time', 'tr', 'u',
  'ul', 'var', 'video', 'wbr'
]);

/**
 * Escapes raw non-standard XML/HTML tags (like <path fill="...">, <vector>, <custom-tag>)
 * in markdown prose while preserving code blocks, inline code, full <svg> blocks,
 * and valid standard HTML tags.
 */
export function escapeNonStandardTags(text) {
  if (!text) return '';

  // Protect code blocks (```...``` and `...`) and full SVG blocks from modification
  const preservedBlocks = [];
  let placeholderText = String(text).replace(/(```[\s\S]*?```|`[^`\n]+`|<svg[\s\S]*?<\/svg>)/g, (match) => {
    const placeholder = `__PRESERVED_BLOCK_${preservedBlocks.length}__`;
    preservedBlocks.push(match);
    return placeholder;
  });

  // Match any tag-like pattern <tag ...> or </tag> or <tag/>
  // If tagName is not in STANDARD_HTML_TAGS, escape '<' and '>' so it renders as safe text
  placeholderText = placeholderText.replace(/<\/?([a-zA-Z0-9_-]+)(?:\s+[^>]*)?\/?>/g, (match, tagName) => {
    const tagLower = tagName.toLowerCase();
    if (STANDARD_HTML_TAGS.has(tagLower)) {
      return match;
    }
    return match.replace(/</g, '&lt;').replace(/>/g, '&gt;');
  });

  // Restore preserved blocks
  return placeholderText.replace(/__PRESERVED_BLOCK_(\d+)__/g, (_, idx) => preservedBlocks[Number(idx)]);
}
