/**
 * Strips markdown formatting, code fences, images, links, bare URLs, and headers
 * from text for clean excerpt rendering without altering stored DB content.
 * Handles unclosed fences, truncated markdown, snake_case, C#, 2 * 3, emojis, and RTL text.
 */
export function stripMarkdown(text, maxLength = null) {
  if (!text || typeof text !== 'string') return '';

  let cleaned = text;

  // 1. Remove code blocks / fences (keep inner text)
  cleaned = cleaned.replace(/```[a-zA-Z0-9_-]*\n?([\s\S]*?)(?:```|$)/g, ' $1 ');

  // 2. Remove inline code backticks (keep inner text)
  cleaned = cleaned.replace(/`([^`]*?)(?:`|$)/g, ' $1 ');

  // 3. Remove image syntax ![alt](url) OR unclosed ![alt... or ![alt](url...
  cleaned = cleaned.replace(/!\[[^\]]*?\]\([^)]*?(?:\)|$)/g, ' ');
  cleaned = cleaned.replace(/!\[[^\]]*?$/g, ' ');

  // 4. Handle links [anchor](url) -> keep anchor. Handle unclosed links like [anchor](url... or [anchor...
  cleaned = cleaned.replace(/\[([^\]]+)\]\([^)]*?(?:\)|$)/g, '$1');
  cleaned = cleaned.replace(/\[([^\]]+)$/g, '$1');

  // 5. Remove bare URLs (http:// or https://...)
  cleaned = cleaned.replace(/https?:\/\/\S+/g, ' ');

  // 6. Remove headings: (?<=^|\s)#{1,6}\s+ (requires space/start before # so C# is preserved)
  cleaned = cleaned.replace(/(?<=^|\s)#{1,6}\s+/g, ' ');

  // 7. Remove blockquotes (^\s*>\s+ or inline > )
  cleaned = cleaned.replace(/(?<=^|\s)>\s+/g, ' ');

  // 8. Remove horizontal rules (---, ***, ___)
  cleaned = cleaned.replace(/(?<=^|\s)(?:---|[*]{3,}|_{3,})(?=\s|$)/g, ' ');

  // 9. Remove bold/italic markdown formatting (**text**, __text__, *text*, _text_) WITHOUT eating snake_case (e.g. word_word_word) or math (e.g. 2 * 3)
  // Bold ** or __
  cleaned = cleaned.replace(/(?<=^|\s|[\W_])(?:\*\*|__)(?=\S)([\s\S]*?)(?<=\S)(?:\*\*|__)(?=$|\s|[\W_])/g, '$1');
  // Italic * or _ (must be surrounded by space/punctuation, not word characters like snake_case)
  cleaned = cleaned.replace(/(?<=^|\s|[^\w_])(?:\*|_)(?=\S)([^\n*_]*?)(?<=\S)(?:\*|_)(?=$|\s|[^\w_])/g, '$1');

  // 10. Remove any leftover lone unclosed markdown syntax characters at the end or start
  cleaned = cleaned.replace(/^[*_]{1,3}|[*_]{1,3}$/g, ' ');

  // 11. Collapse multiple spaces and newlines into a single space
  cleaned = cleaned.replace(/\s+/g, ' ').trim();

  // 12. Truncate at word boundary if maxLength is provided
  if (maxLength && maxLength > 0 && cleaned.length > maxLength) {
    let truncated = cleaned.slice(0, maxLength);
    const lastSpace = truncated.lastIndexOf(' ');
    if (lastSpace > maxLength * 0.5) {
      truncated = truncated.slice(0, lastSpace);
    }
    cleaned = truncated.trim() + '...';
  }

  return cleaned;
}
