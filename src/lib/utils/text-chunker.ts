/**
 * Text Chunking Utility
 * Splits text into overlapping chunks for embedding generation
 */

export interface TextRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface TextChunk {
  id: string;
  text: string;
  tokens: number;
  startIndex: number;
  endIndex: number;
  pageNumber?: number;
  chunkIndex: number;
  rects?: TextRect[]; // Bounding rectangles for PDF highlighting
}

export interface ChunkingOptions {
  chunkSize: number; // In tokens
  chunkOverlap: number; // In tokens
  preserveSentences?: boolean; // Try to chunk at sentence boundaries
  minChunkSize?: number; // Minimum chunk size in tokens
}

/**
 * Estimate token count (rough approximation)
 * GPT-style: ~4 chars per token on average
 */
export function estimateTokenCount(text: string): number {
  // Simple estimation: 1 token ≈ 4 characters
  // This is a rough approximation, real tokenization would be more accurate
  return Math.ceil(text.length / 4);
}

/**
 * Split text by sentences
 */
function splitIntoSentences(text: string): string[] {
  // Split by sentence-ending punctuation followed by space or newline
  const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
  return sentences.map((s) => s.trim()).filter((s) => s.length > 0);
}

/**
 * Split text by words
 */
function splitIntoWords(text: string): string[] {
  return text.split(/\s+/).filter((w) => w.length > 0);
}

/**
 * Create a chunk ID
 */
function createChunkId(documentId: string, chunkIndex: number): string {
  return `${documentId}_chunk_${chunkIndex}`;
}

/**
 * Chunk text into overlapping segments
 */
export function chunkText(
  text: string,
  documentId: string,
  options: ChunkingOptions,
  pageNumber?: number
): TextChunk[] {
  const {
    chunkSize,
    chunkOverlap,
    preserveSentences = true,
    minChunkSize = 50,
  } = options;

  const chunks: TextChunk[] = [];

  // If text is empty, return empty array
  if (!text || text.trim().length === 0) {
    return chunks;
  }

  // If preserveSentences is enabled, chunk by sentences
  if (preserveSentences) {
    return chunkBySentences(text, documentId, options, pageNumber);
  }

  // Otherwise, chunk by words (simpler but may break mid-sentence)
  return chunkByWords(text, documentId, options, pageNumber);
}

/**
 * Chunk text by sentences (better quality, respects sentence boundaries)
 */
function chunkBySentences(
  text: string,
  documentId: string,
  options: ChunkingOptions,
  pageNumber?: number
): TextChunk[] {
  const { chunkSize, chunkOverlap, minChunkSize = 50 } = options;
  const chunks: TextChunk[] = [];

  const sentences = splitIntoSentences(text);
  let currentChunk: string[] = [];
  let currentTokens = 0;
  let chunkIndex = 0;
  let startIndex = 0;

  for (let i = 0; i < sentences.length; i++) {
    const sentence = sentences[i];
    if (!sentence) continue;
    const sentenceTokens = estimateTokenCount(sentence);

    // If adding this sentence would exceed chunk size
    if (currentTokens + sentenceTokens > chunkSize && currentChunk.length > 0) {
      // Save current chunk
      const chunkText = currentChunk.join(' ');
      const chunkTextLength = chunkText.length;

      chunks.push({
        id: createChunkId(documentId, chunkIndex),
        text: chunkText,
        tokens: currentTokens,
        startIndex,
        endIndex: startIndex + chunkTextLength,
        pageNumber,
        chunkIndex,
      });

      // Calculate overlap: keep last N tokens worth of sentences
      const overlapSentences: string[] = [];
      let overlapTokens = 0;

      for (let j = currentChunk.length - 1; j >= 0; j--) {
        const s = currentChunk[j];
        if (!s) continue;
        const t = estimateTokenCount(s);

        if (overlapTokens + t <= chunkOverlap) {
          overlapSentences.unshift(s);
          overlapTokens += t;
        } else {
          break;
        }
      }

      // Start new chunk with overlap
      currentChunk = overlapSentences;
      currentTokens = overlapTokens;
      startIndex += chunkTextLength - overlapSentences.join(' ').length;
      chunkIndex++;
    }

    // Add sentence to current chunk
    currentChunk.push(sentence);
    currentTokens += sentenceTokens;
  }

  // Add final chunk if it meets minimum size
  if (currentChunk.length > 0 && currentTokens >= minChunkSize) {
    const chunkText = currentChunk.join(' ');

    chunks.push({
      id: createChunkId(documentId, chunkIndex),
      text: chunkText,
      tokens: currentTokens,
      startIndex,
      endIndex: startIndex + chunkText.length,
      pageNumber,
      chunkIndex,
    });
  }

  return chunks;
}

/**
 * Chunk text by words (simpler, faster, but may break sentences)
 */
function chunkByWords(
  text: string,
  documentId: string,
  options: ChunkingOptions,
  pageNumber?: number
): TextChunk[] {
  const { chunkSize, chunkOverlap, minChunkSize = 50 } = options;
  const chunks: TextChunk[] = [];

  const words = splitIntoWords(text);
  const avgTokensPerWord = estimateTokenCount(text) / words.length;

  const wordsPerChunk = Math.ceil(chunkSize / avgTokensPerWord);
  const wordsPerOverlap = Math.ceil(chunkOverlap / avgTokensPerWord);

  let chunkIndex = 0;
  let i = 0;

  while (i < words.length) {
    const chunkWords = words.slice(i, i + wordsPerChunk);
    const chunkText = chunkWords.join(' ');
    const chunkTokens = estimateTokenCount(chunkText);

    // Only add if meets minimum size
    if (chunkTokens >= minChunkSize) {
      chunks.push({
        id: createChunkId(documentId, chunkIndex),
        text: chunkText,
        tokens: chunkTokens,
        startIndex: i,
        endIndex: i + chunkWords.length,
        pageNumber,
        chunkIndex,
      });

      chunkIndex++;
    }

    // Move forward by (chunk size - overlap)
    i += wordsPerChunk - wordsPerOverlap;

    // Prevent infinite loop
    if (wordsPerChunk <= wordsPerOverlap) {
      i++;
    }
  }

  return chunks;
}

/**
 * Chunk text by pages (for PDF documents)
 * Now with support for bounding rectangles from PDFTextItem[]
 */
export function chunkByPages(
  pages: Array<{
    pageNumber: number;
    text: string;
    textItems?: Array<{ str: string; x: number; y: number; width: number; height: number; }>;
  }>,
  documentId: string,
  options: ChunkingOptions
): TextChunk[] {
  const allChunks: TextChunk[] = [];
  let globalChunkIndex = 0;

  for (const page of pages) {
    const pageChunks = chunkText(
      page.text,
      documentId,
      options,
      page.pageNumber
    );

    // Re-assign chunk IDs with global index to avoid duplicates
    const reindexedChunks = pageChunks.map((chunk, localIndex) => {
      // Map chunk's character range to text item rectangles
      const rects = page.textItems ? mapChunkToRects(chunk, page.text, page.textItems) : undefined;

      // Debug: Log first chunk's rects
      if (localIndex === 0 && rects && rects.length > 0) {
        console.log(`📐 Page ${page.pageNumber} chunk 0: ${rects.length} rectangles mapped`);
      }

      return {
        ...chunk,
        id: createChunkId(documentId, globalChunkIndex++),
        chunkIndex: globalChunkIndex - 1,
        rects, // Include bounding rectangles
      };
    });

    allChunks.push(...reindexedChunks);
  }

  return allChunks;
}

/**
 * Map a chunk's text content to its corresponding text item rectangles
 * Uses TEXT MATCHING instead of character positions (robust for PDF layouts!)
 */
function mapChunkToRects(
  chunk: TextChunk,
  fullPageText: string,
  textItems: Array<{ str: string; x: number; y: number; width: number; height: number; }>
): TextRect[] {
  const rects: TextRect[] = [];

  // Normalize chunk text for matching (lowercase, collapse whitespace)
  const chunkText = chunk.text.toLowerCase().replace(/\s+/g, ' ').trim();

  // Extract significant words from chunk (skip short words)
  const chunkWords = chunkText.split(' ').filter(word => word.length >= 3);

  if (chunkWords.length === 0) {
    console.warn('⚠️ Chunk has no significant words for matching');
    return rects;
  }

  // Match text items that contain chunk words
  const matchedItems = new Set<number>();

  textItems.forEach((item, itemIndex) => {
    const itemText = (item.str || '').toLowerCase().trim();

    // Check if this text item contains any of the chunk's words
    for (const word of chunkWords) {
      if (itemText.includes(word)) {
        matchedItems.add(itemIndex);
        break; // Found a match, no need to check more words
      }
    }
  });

  // Collect rectangles for matched items
  matchedItems.forEach((itemIndex) => {
    const item = textItems[itemIndex];
    if (item && item.str) {
      rects.push({
        x: item.x,
        y: item.y,
        width: item.width,
        height: item.height,
      });
    }
  });

  console.log(`📍 Chunk matching: ${chunkWords.length} words -> ${matchedItems.size} text items -> ${rects.length} rectangles`);

  return rects;
}

/**
 * Merge small chunks that are below minimum size
 */
export function mergeSmallChunks(
  chunks: TextChunk[],
  minSize: number
): TextChunk[] {
  const merged: TextChunk[] = [];
  let currentMerged: TextChunk | null = null;

  for (const chunk of chunks) {
    if (chunk.tokens < minSize && currentMerged) {
      // Merge with previous chunk
      currentMerged.text += ' ' + chunk.text;
      currentMerged.tokens += chunk.tokens;
      currentMerged.endIndex = chunk.endIndex;
    } else if (chunk.tokens < minSize) {
      // Start merging
      currentMerged = { ...chunk };
    } else {
      // Chunk is large enough
      if (currentMerged) {
        merged.push(currentMerged);
        currentMerged = null;
      }
      merged.push(chunk);
    }
  }

  // Add last merged chunk if exists
  if (currentMerged) {
    merged.push(currentMerged);
  }

  return merged;
}

/**
 * Get chunking statistics
 */
export function getChunkingStats(chunks: TextChunk[]): {
  totalChunks: number;
  avgTokensPerChunk: number;
  minTokens: number;
  maxTokens: number;
  totalTokens: number;
} {
  if (chunks.length === 0) {
    return {
      totalChunks: 0,
      avgTokensPerChunk: 0,
      minTokens: 0,
      maxTokens: 0,
      totalTokens: 0,
    };
  }

  const totalTokens = chunks.reduce((sum, chunk) => sum + chunk.tokens, 0);
  const tokenCounts = chunks.map((c) => c.tokens);

  return {
    totalChunks: chunks.length,
    avgTokensPerChunk: totalTokens / chunks.length,
    minTokens: Math.min(...tokenCounts),
    maxTokens: Math.max(...tokenCounts),
    totalTokens,
  };
}
