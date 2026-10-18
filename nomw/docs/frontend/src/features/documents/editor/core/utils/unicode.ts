/**
 * Unicode-aware text segmentation and boundary utilities.
 * Supports Vietnamese tone marks, combining grapheme clusters, emojis, CJK, and surrogate pairs.
 */

// Global cached segmenters
let graphemeSegmenter: any = null;
let wordSegmenter: any = null;

try {
  const IntlAny = Intl as any;
  if (typeof IntlAny !== 'undefined' && IntlAny.Segmenter) {
    graphemeSegmenter = new IntlAny.Segmenter('vi', { granularity: 'grapheme' });
    wordSegmenter = new IntlAny.Segmenter('vi', { granularity: 'word' });
  }
} catch (e) {
  console.warn('Intl.Segmenter not supported or failed to initialize, falling back to polyfill clusters');
}

/**
 * Split text into grapheme clusters (never breaks combining diacritics or emoji sequences)
 */
export function getGraphemeClusters(text: string): string[] {
  if (!text) return [];
  if (graphemeSegmenter) {
    const segments = graphemeSegmenter.segment(text);
    const clusters: string[] = [];
    for (const seg of segments) {
      clusters.push(seg.segment);
    }
    return clusters;
  }

  // Fallback: Unicode regex matching grapheme clusters (combining marks + emojis)
  const regex = /(\P{M}\p{M}*|[\uD800-\uDBFF][\uDC00-\uDFFF]|\n|\r\n|.)/gus;
  return text.match(regex) || Array.from(text);
}

export interface WordSegment {
  word: string;
  startIndex: number;
  endIndex: number;
  isWordLike: boolean;
}

/**
 * Split text into word segments with indices
 */
export function getWordSegments(text: string): WordSegment[] {
  if (!text) return [];
  if (wordSegmenter) {
    const segments = wordSegmenter.segment(text);
    const words: WordSegment[] = [];
    for (const seg of segments) {
      words.push({
        word: seg.segment,
        startIndex: seg.index,
        endIndex: seg.index + seg.segment.length,
        isWordLike: Boolean(seg.isWordLike),
      });
    }
    return words;
  }

  // Fallback regex word splitting
  const words: WordSegment[] = [];
  const regex = /[\p{L}\p{N}_]+|[^\s\p{L}\p{N}_]+|\s+/gu;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    const word = match[0];
    const isWordLike = /[\p{L}\p{N}_]/u.test(word);
    words.push({
      word,
      startIndex: match.index,
      endIndex: match.index + word.length,
      isWordLike,
    });
  }
  return words;
}

/**
 * Find word boundaries for a given character offset (used for double-click and word navigation)
 */
export function getWordBoundsAtOffset(text: string, offset: number): { start: number; end: number } {
  if (!text || text.length === 0) return { start: 0, end: 0 };
  const safeOffset = Math.max(0, Math.min(offset, text.length));

  const words = getWordSegments(text);
  if (words.length === 0) return { start: 0, end: text.length };

  // Find the segment containing the offset
  for (const seg of words) {
    if (safeOffset >= seg.startIndex && safeOffset <= seg.endIndex) {
      if (seg.isWordLike || words.length === 1) {
        return { start: seg.startIndex, end: seg.endIndex };
      }
    }
  }

  // Fallback: look at adjacent word segment
  for (let i = 0; i < words.length; i++) {
    const seg = words[i];
    if (safeOffset <= seg.endIndex) {
      return { start: seg.startIndex, end: seg.endIndex };
    }
  }

  return { start: 0, end: text.length };
}

/**
 * Find previous word boundary before offset (for Ctrl/Cmd + Left Arrow)
 */
export function getPreviousWordOffset(text: string, offset: number): number {
  if (offset <= 0) return 0;
  const words = getWordSegments(text);
  for (let i = words.length - 1; i >= 0; i--) {
    const seg = words[i];
    if (seg.startIndex < offset) {
      if (seg.isWordLike) {
        return seg.startIndex;
      }
    }
  }
  return 0;
}

/**
 * Find next word boundary after offset (for Ctrl/Cmd + Right Arrow)
 */
export function getNextWordOffset(text: string, offset: number): number {
  if (offset >= text.length) return text.length;
  const words = getWordSegments(text);
  for (let i = 0; i < words.length; i++) {
    const seg = words[i];
    if (seg.endIndex > offset) {
      if (seg.isWordLike) {
        return seg.endIndex;
      }
    }
  }
  return text.length;
}

/**
 * Find previous grapheme boundary before offset (for Backspace / Left Arrow)
 */
export function getPreviousGraphemeOffset(text: string, offset: number): number {
  if (offset <= 0) return 0;
  const clusters = getGraphemeClusters(text);
  let cur = 0;
  let prev = 0;
  for (const cl of clusters) {
    const next = cur + cl.length;
    if (next >= offset) {
      return cur;
    }
    prev = cur;
    cur = next;
  }
  return prev;
}

/**
 * Find next grapheme boundary after offset (for Delete / Right Arrow)
 */
export function getNextGraphemeOffset(text: string, offset: number): number {
  if (offset >= text.length) return text.length;
  const clusters = getGraphemeClusters(text);
  let cur = 0;
  for (const cl of clusters) {
    cur += cl.length;
    if (cur > offset) {
      return cur;
    }
  }
  return text.length;
}
