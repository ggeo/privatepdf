/**
 * Semantic Search Service
 * Performs vector similarity search on document chunks using Ollama embeddings
 * Now with semantic caching for 100x faster repeated queries
 */

import { generateEmbedding, cosineSimilarity } from './embedding-generator';
import { searchChunks, getDocumentChunks, getAllStoredChunks } from './indexeddb-storage';
import type { StoredChunk } from './indexeddb-storage';
import { SEARCH_SETTINGS } from '@/lib/constants';
import { semanticCache } from './semantic-cache';

export interface SearchQuery {
  text: string;
  documentId?: string; // Search within specific document
  topK?: number; // Number of results to return
  minSimilarity?: number; // Minimum similarity threshold
  rerank?: boolean; // Apply re-ranking
  mmrLambda?: number; // MMR lambda parameter (0-1, higher = more relevance)
}

export interface SearchResult {
  chunk: StoredChunk;
  similarity: number;
  pageNumber?: number;
  snippet: string;
  highlights: string[];
}

export interface SearchContext {
  query: string;
  results: SearchResult[];
  totalResults: number;
  searchTime: number; // milliseconds
  model: string;
}

/**
 * Perform semantic search on document chunks using Ollama
 * With semantic caching for instant results on similar queries
 */
export async function semanticSearch(
  query: SearchQuery
): Promise<SearchContext> {
  const startTime = performance.now();

  const {
    text,
    documentId,
    topK = SEARCH_SETTINGS.defaultTopK,
    minSimilarity = SEARCH_SETTINGS.defaultSimilarityThreshold,
    rerank = true,
    mmrLambda = 0.85, // Default to high relevance
  } = query;

  console.log('🔧 Search params:', { topK, minSimilarity, minSimilarityType: typeof minSimilarity, rerank });

  try {
    // Generate query embedding using Ollama
    const queryEmbedding = await generateEmbedding(text);
    console.log('Query embedding generated, dimension:', queryEmbedding.vector.length);

    // 🚀 SEMANTIC CACHE: Check if we have similar query cached
    if (documentId) {
      const cachedResult = semanticCache.findSimilar(queryEmbedding.vector, documentId);

      if (cachedResult) {
        const searchTime = performance.now() - startTime;
        console.log(`⚡ Semantic cache HIT! Returning cached results in ${searchTime.toFixed(0)}ms (skipped vector search)`);

        return {
          query: text,
          results: cachedResult.results,
          totalResults: cachedResult.results.length,
          searchTime,
          model: 'nomic-embed-text (cached)',
        };
      }
    }

    // Get chunks from IndexedDB
    let chunks: StoredChunk[];
    if (documentId) {
      console.log('Getting chunks for document:', documentId);
      chunks = await getDocumentChunks(documentId);
      console.log('Retrieved chunks from IndexedDB:', chunks.length);
      console.log('Sample chunk:', chunks[0]);
    } else {
      chunks = await getAllStoredChunks(); // Get all chunks
    }

    // Calculate similarity scores and filter out invalid chunks
    const resultsWithScores: SearchResult[] = chunks
      .filter((chunk) => {
        if (!chunk.embedding || chunk.embedding.length === 0) {
          console.log('Chunk has no embedding:', chunk.id);
          return false;
        }
        return true;
      })
      .map((chunk) => {
        // Calculate cosine similarity
        const similarity = cosineSimilarity(
          queryEmbedding.vector,
          Array.from(chunk.embedding!)
        );

        // Log chunks that mention BURBANK to debug
        if (chunk.text.toLowerCase().includes('burbank')) {
          console.log(`🔍 BURBANK chunk found! ID: ${chunk.id}, similarity: ${similarity}, page: ${chunk.pageNumber}`);
          console.log('Snippet:', chunk.text.substring(0, 300));
        }

        console.log(`Chunk ${chunk.id} similarity:`, similarity, 'threshold:', minSimilarity);

        return {
          chunk,
          similarity,
          pageNumber: chunk.pageNumber,
          snippet: chunk.text, // Return full chunk text instead of snippet
          highlights: extractHighlights(chunk.text),
        };
      })
      .filter((result) => {
        const passed = result.similarity >= minSimilarity;

        if (!passed) {
          console.log(`❌ Chunk filtered out: similarity ${result.similarity.toFixed(4)} < threshold ${minSimilarity}`);
        } else {
          console.log(`✅ Chunk PASSED: similarity ${result.similarity.toFixed(4)} >= threshold ${minSimilarity}, page: ${result.pageNumber}`);
        }

        return passed;
      });

    // Sort by similarity (descending)
    resultsWithScores.sort((a, b) => b.similarity - a.similarity);

    // Apply re-ranking if enabled
    let finalResults = resultsWithScores;
    if (rerank) {
      finalResults = await rerankResults(resultsWithScores, text);
    }

    // Apply MMR (Maximal Marginal Relevance) for diversity
    // Use adaptive lambda from query (higher = more relevance, lower = more diversity)
    const diverseResults = applyMMR(finalResults, topK, mmrLambda);

    const topResults = diverseResults;

    const searchTime = performance.now() - startTime;

    // 💾 SEMANTIC CACHE: Store results for future similar queries
    if (documentId && topResults.length > 0) {
      semanticCache.store(text, queryEmbedding.vector, documentId, topResults);
    }

    return {
      query: text,
      results: topResults,
      totalResults: resultsWithScores.length,
      searchTime,
      model: 'nomic-embed-text',
    };
  } catch (error: any) {
    console.error('Semantic search failed:', error);
    throw new Error(`Search failed: ${error.message}`);
  }
}

/**
 * Build RAG context from search results
 */
export function buildRAGContext(results: SearchResult[]): string {
  if (results.length === 0) {
    return '';
  }

  const contextParts = results.map((result, index) => {
    const source = result.pageNumber ? `Page ${result.pageNumber}` : `Chunk ${result.chunk.id}`;
    return `[${index + 1}] ${source}:\n${result.chunk.text}`;
  });

  return contextParts.join('\n\n---\n\n');
}

/**
 * Extract the continuous passage that should be highlighted
 * Returns the exact text passage that contains the answer - the FULL chunk text
 */
function extractHighlights(text: string): string[] {
  // SIMPLE APPROACH: Return the entire chunk text!
  // The highlighting will be done in the UI by finding the query-relevant portion
  // This ensures we don't cut off important context

  console.log('🎯 Returning full chunk text for highlighting, length:', text.length, 'chars');

  return [text];
}

/**
 * Apply Maximal Marginal Relevance (MMR) to diversify results
 * MMR balances relevance and diversity to avoid redundant chunks
 *
 * @param results - Sorted search results
 * @param topK - Number of results to return
 * @param lambda - Balance between relevance (1.0) and diversity (0.0), default 0.5
 */
function applyMMR(results: SearchResult[], topK: number, lambda: number = 0.5): SearchResult[] {
  if (results.length <= topK) {
    return results;
  }

  const selected: SearchResult[] = [];
  const remaining = [...results];

  // Always select the most relevant document first
  selected.push(remaining.shift()!);

  // Iteratively select documents that maximize MMR score
  while (selected.length < topK && remaining.length > 0) {
    let bestIndex = 0;
    let bestScore = -Infinity;

    for (let i = 0; i < remaining.length; i++) {
      const candidate = remaining[i];
      if (!candidate || !candidate.chunk.embedding) continue;

      // Calculate max similarity to already selected documents
      let maxSimToSelected = 0;
      for (const selectedDoc of selected) {
        if (!selectedDoc.chunk.embedding) continue;

        const sim = cosineSimilarity(
          Array.from(candidate.chunk.embedding),
          Array.from(selectedDoc.chunk.embedding)
        );
        maxSimToSelected = Math.max(maxSimToSelected, sim);
      }

      // MMR score = lambda * relevance - (1 - lambda) * max_similarity_to_selected
      const mmrScore = lambda * candidate.similarity - (1 - lambda) * maxSimToSelected;

      if (mmrScore > bestScore) {
        bestScore = mmrScore;
        bestIndex = i;
      }
    }

    const selectedItem = remaining.splice(bestIndex, 1)[0];
    if (selectedItem) {
      selected.push(selectedItem);
    }
  }

  console.log('📊 MMR diversity: Selected', selected.length, 'diverse chunks from', results.length, 'candidates');
  return selected;
}

/**
 * Re-rank results using a more sophisticated scoring method
 */
async function rerankResults(
  results: SearchResult[],
  query: string
): Promise<SearchResult[]> {
  // Simple re-ranking based on keyword matching
  // In a production system, you might use a cross-encoder model

  return results.map((result) => {
    let boost = 0;
    const queryWords = query.toLowerCase().split(/\s+/);
    const chunkText = result.chunk.text.toLowerCase();

    // Boost for exact phrase match
    if (chunkText.includes(query.toLowerCase())) {
      boost += 0.2;
    }

    // Boost for all query words present
    const allWordsPresent = queryWords.every((word) => chunkText.includes(word));
    if (allWordsPresent) {
      boost += 0.1;
    }

    // Apply boost to similarity score
    return {
      ...result,
      similarity: Math.min(1, result.similarity + boost),
    };
  }).sort((a, b) => b.similarity - a.similarity);
}

/**
 * Perform hybrid search (semantic + keyword)
 */
export async function hybridSearch(
  query: SearchQuery
): Promise<SearchContext> {
  // Perform semantic search
  const semanticResults = await semanticSearch(query);

  // For hybrid search, we could also do keyword matching
  // and combine the results with semantic results
  // This is a simplified version

  return semanticResults;
}

/**
 * Get semantic cache statistics
 */
export function getCacheStats() {
  return semanticCache.getStats();
}

/**
 * Clear semantic cache for a document
 */
export function clearDocumentCache(documentId: string) {
  semanticCache.clearDocument(documentId);
}

/**
 * Clear all semantic cache
 */
export function clearAllCache() {
  semanticCache.clearAll();
}

/**
 * Clean up expired cache entries
 */
export function cleanExpiredCache() {
  semanticCache.cleanExpired();
}