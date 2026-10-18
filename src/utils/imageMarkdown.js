/**
 * Utility functions for parsing, resizing, aligning, and re-positioning
 * embedded images/GIFs inside Markdown content.
 */

/**
 * Parse an image alt string that may contain size and alignment modifiers.
 * Format: "alt_text|size|align" or "alt_text|align|size"
 *
 * @param {string} rawAlt
 * @returns {{ cleanAlt: string, size: string, align: 'left'|'center'|'right' }}
 */
export function parseImageModifiers(rawAlt = '') {
  const parts = String(rawAlt || '').split('|').map(p => p.trim());
  const cleanAlt = parts[0] || '';
  let size = '100%';
  let align = 'center';

  for (let i = 1; i < parts.length; i++) {
    const part = parts[i].toLowerCase();
    if (part === 'left' || part === 'right' || part === 'center') {
      align = part;
    } else if (part === 'full' || part === 'xl') {
      size = '100%';
    } else if (part === 'large' || part === 'lg') {
      size = '75%';
    } else if (part === 'medium' || part === 'md') {
      size = '50%';
    } else if (part === 'small' || part === 'sm') {
      size = '25%';
    } else if (/^\d{1,3}%$/.test(part) || /^\d+(?:px|rem|vw|vh)$/.test(part) || /^\d+$/.test(part)) {
      size = /^\d+$/.test(part) ? `${part}px` : part;
    }
  }

  return { cleanAlt, size, align };
}

/**
 * Find all Markdown images embedded in content.
 *
 * @param {string} content
 * @returns {Array<{ index: number, fullMatch: string, rawAlt: string, cleanAlt: string, size: string, align: string, url: string }>}
 */
export function parseEmbeddedImages(content = '') {
  if (!content) return [];
  const regex = /!\[(.*?)\]\((.*?)\)/g;
  const images = [];
  let match;
  let idx = 0;

  while ((match = regex.exec(content)) !== null) {
    const fullMatch = match[0];
    const rawAlt = match[1];
    const url = match[2];
    const { cleanAlt, size, align } = parseImageModifiers(rawAlt);

    images.push({
      index: idx++,
      fullMatch,
      rawAlt,
      cleanAlt: cleanAlt || 'image',
      size,
      align,
      url
    });
  }

  return images;
}

/**
 * Format a new image Markdown tag from components.
 *
 * @param {string} cleanAlt
 * @param {string} size
 * @param {string} align
 * @param {string} url
 * @returns {string}
 */
export function formatImageTag(cleanAlt, size, align, url) {
  const parts = [cleanAlt || 'image'];
  if (size && size !== '100%' && size !== 'full') {
    parts.push(size);
  }
  if (align && align !== 'center') {
    parts.push(align);
  }
  return `![${parts.join('|')}](${url})`;
}

/**
 * Update the size and/or alignment of the N-th image in content.
 *
 * @param {string} content
 * @param {number} targetIndex
 * @param {string} newSize
 * @param {string} newAlign
 * @returns {string}
 */
export function updateImageInContent(content = '', targetIndex, newSize, newAlign) {
  const images = parseEmbeddedImages(content);
  if (!images[targetIndex]) return content;

  const target = images[targetIndex];
  const updatedTag = formatImageTag(
    target.cleanAlt,
    newSize !== undefined ? newSize : target.size,
    newAlign !== undefined ? newAlign : target.align,
    target.url
  );

  let currentIdx = 0;
  return content.replace(/!\[(.*?)\]\((.*?)\)/g, (match) => {
    if (currentIdx++ === targetIndex) {
      return updatedTag;
    }
    return match;
  });
}

/**
 * Move the N-th image up or down in the document content.
 *
 * @param {string} content
 * @param {number} targetIndex
 * @param {'up'|'down'} direction
 * @returns {string}
 */
export function moveImageInContent(content = '', targetIndex, direction = 'up') {
  const images = parseEmbeddedImages(content);
  if (!images[targetIndex]) return content;

  const target = images[targetIndex];
  const tag = target.fullMatch;

  // Split content into paragraph/element blocks
  const blocks = content.split(/\n{2,}/);
  const blockIdx = blocks.findIndex(b => b.includes(tag));
  if (blockIdx === -1) return content;

  const currentBlock = blocks[blockIdx];

  // If the block contains text AND the image, separate the image into its own block first
  if (currentBlock.trim() !== tag.trim()) {
    const beforeTag = currentBlock.substring(0, currentBlock.indexOf(tag)).trim();
    const afterTag = currentBlock.substring(currentBlock.indexOf(tag) + tag.length).trim();
    
    const replacementBlocks = [];
    if (beforeTag) replacementBlocks.push(beforeTag);
    replacementBlocks.push(tag);
    if (afterTag) replacementBlocks.push(afterTag);

    blocks.splice(blockIdx, 1, ...replacementBlocks);
    return moveImageInContent(blocks.join('\n\n'), targetIndex, direction);
  }

  // Swap with adjacent block
  if (direction === 'up' && blockIdx > 0) {
    const prev = blocks[blockIdx - 1];
    blocks[blockIdx - 1] = blocks[blockIdx];
    blocks[blockIdx] = prev;
  } else if (direction === 'down' && blockIdx < blocks.length - 1) {
    const next = blocks[blockIdx + 1];
    blocks[blockIdx + 1] = blocks[blockIdx];
    blocks[blockIdx] = next;
  }

  return blocks.join('\n\n');
}

/**
 * Remove the N-th image from content.
 *
 * @param {string} content
 * @param {number} targetIndex
 * @returns {string}
 */
export function removeImageFromContent(content = '', targetIndex) {
  let currentIdx = 0;
  return content.replace(/!\[(.*?)\]\((.*?)\)/g, (match) => {
    if (currentIdx++ === targetIndex) {
      return '';
    }
    return match;
  }).replace(/\n{3,}/g, '\n\n').trim();
}
