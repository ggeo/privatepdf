/**
 * Highlight utilities used across the chat experience.
 * Handles deriving answer segments and rendering highlighted HTML snippets.
 */

const DEFAULT_MARK_CLASS =
  'bg-primary/10 dark:bg-primary/20 px-2 py-1 rounded font-semibold shadow-sm inline-block my-1 text-muted-foreground outline outline-1 outline-primary/70';

interface HighlightRange {
  start: number;
  end: number;
  text: string;
}

/**
 * Escape HTML-sensitive characters to keep injected content safe.
 */
function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => {
    switch (char) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      case '\'':
        return '&#39;';
      default:
        return char;
    }
  });
}

/**
 * Normalize text for fuzzy matching/highlighting.
 * Supports all Unicode letters (Latin, Greek, Cyrillic, etc.)
 */
export function normalizeTextForSearch(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ') // Keep all Unicode letters and numbers
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Extract a stable highlight range from a chunk of text.
 * Focuses on the central, most relevant portion for long passages.
 */
export function deriveHighlightRange(text: string): HighlightRange {
  if (!text) {
    return { start: 0, end: 0, text: '' };
  }

  if (text.length <= 600) {
    const trimmed = text.trim();
    const startIndex = trimmed ? text.indexOf(trimmed) : 0;
    return {
      start: startIndex >= 0 ? startIndex : 0,
      end: startIndex >= 0 ? startIndex + trimmed.length : text.length,
      text: trimmed,
    };
  }

  const length = text.length;
  let start = Math.floor(length * 0.1);
  let end = Math.floor(length * 0.9);

  while (start > 0 && !'.!?'.includes(text[start - 1]!)) {
    start--;
  }
  while (start < length && /\s/.test(text[start]!)) {
    start++;
  }

  while (end < length && !'.!?'.includes(text[end]!)) {
    end++;
  }
  if (end < length) {
    end++;
  }

  if (end <= start) {
    start = Math.floor(length * 0.1);
    end = Math.min(length, Math.floor(length * 0.9));
  }

  const snippet = text.slice(start, end).trim();
  return {
    start,
    end,
    text: snippet || text.trim(),
  };
}

/**
 * Render text with a highlight span applied to the best matching portion.
 */
export function renderHighlightedHtml(
  text: string,
  highlight: string,
  options?: { markClass?: string }
): { html: string; didHighlight: boolean } {
  const markClass = options?.markClass ?? DEFAULT_MARK_CLASS;
  const safeText = escapeHtml(text);

  if (!highlight) {
    return { html: safeText, didHighlight: false };
  }

  const normalizedHighlight = normalizeTextForSearch(highlight);
  if (!normalizedHighlight) {
    return { html: safeText, didHighlight: false };
  }

  const rawLower = text.toLowerCase();
  let startIndex = rawLower.indexOf(highlight.toLowerCase());
  let highlightSlice = highlight;

  if (startIndex === -1) {
    const partialLength = Math.max(
      20,
      Math.min(Math.floor(highlight.length * 0.6), 160)
    );
    const partialHighlight = highlight.slice(0, partialLength);
    startIndex = rawLower.indexOf(partialHighlight.toLowerCase());
    highlightSlice = startIndex >= 0 ? text.slice(startIndex, startIndex + partialHighlight.length) : '';
  } else {
    highlightSlice = text.slice(startIndex, startIndex + highlight.length);
  }

  if (startIndex === -1 || !highlightSlice) {
    return { html: safeText, didHighlight: false };
  }

  const before = escapeHtml(text.slice(0, startIndex));
  const highlighted = escapeHtml(highlightSlice);
  const after = escapeHtml(text.slice(startIndex + highlightSlice.length));

  return {
    html: `${before}<mark class="${markClass}">${highlighted}</mark>${after}`,
    didHighlight: true,
  };
}

/**
 * Pull a limited set of significant words for PDF highlighting.
 */
export function getSignificantWords(text: string, limit = 12): string[] {
  const normalized = normalizeTextForSearch(text);
  if (!normalized) {
    return [];
  }

  const words = normalized.split(' ').filter((word) => word.length >= 4);
  const deduped = Array.from(new Set(words));
  deduped.sort((a, b) => b.length - a.length);
  return deduped.slice(0, Math.max(1, limit));
}

/**
 * Expose escapeHtml for components that need it directly.
 */
export { escapeHtml };

export const DEFAULT_HIGHLIGHT_MARK_CLASS = DEFAULT_MARK_CLASS;
