/**
 * Semantic Cache Service
 * Caches semantic search results based on query similarity
 * Provides instant results for similar/repeated queries (100x faster)
 */

import { cosineSimilarity } from './embedding-generator';
import type { SearchResult } from './semantic-search';

export interface CacheEntry {
  query: string; // Original query text
  embedding: number[]; // Query embedding vector
  documentId: string; // Document this cache is for
  results: SearchResult[]; // Cached search results
  timestamp: number; // When cached (for LRU eviction)
  hits: number; // How many times this cache was used
}

export interface CacheStats {
  hits: number;
  misses: number;
  hitRate: number;
  totalEntries: number;
}

class SemanticCacheService {
  // In-memory cache: Map<documentId, CacheEntry[]>
  private cache = new Map<string, CacheEntry[]>();

  // Configuration
  private readonly MAX_ENTRIES_PER_DOC = 50; // Limit per document
  private readonly SIMILARITY_THRESHOLD = 0.95; // 95% similar = cache hit
  private readonly MAX_CACHE_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

  // Statistics
  private stats = {
    hits: 0,
    misses: 0,
  };

  /**
   * Find cached results for a similar query
   * Returns cached results if similarity > threshold
   */
  findSimilar(
    queryEmbedding: number[],
    documentId: string
  ): { results: SearchResult[]; similarity: number; query: string } | null {
    const docCache = this.cache.get(documentId);
    if (!docCache || docCache.length === 0) {
      this.stats.misses++;
      return null;
    }

    // Find most similar cached query
    let bestMatch: CacheEntry | null = null;
    let bestSimilarity = 0;

    for (const entry of docCache) {
      // Skip expired entries
      if (Date.now() - entry.timestamp > this.MAX_CACHE_AGE_MS) {
        continue;
      }

      const similarity = cosineSimilarity(queryEmbedding, entry.embedding);

      if (similarity > bestSimilarity) {
        bestSimilarity = similarity;
        bestMatch = entry;
      }
    }

    // Check if similarity meets threshold
    if (bestMatch && bestSimilarity >= this.SIMILARITY_THRESHOLD) {
      this.stats.hits++;
      bestMatch.hits++;
      console.log(`✅ Semantic cache HIT! Similarity: ${(bestSimilarity * 100).toFixed(1)}%`, {
        cachedQuery: bestMatch.query,
        hits: bestMatch.hits,
      });
      return {
        results: bestMatch.results,
        similarity: bestSimilarity,
        query: bestMatch.query,
      };
    }

    this.stats.misses++;
    console.log(`❌ Semantic cache MISS. Best similarity: ${(bestSimilarity * 100).toFixed(1)}%`);
    return null;
  }

  /**
   * Store query results in cache
   */
  store(
    query: string,
    queryEmbedding: number[],
    documentId: string,
    results: SearchResult[]
  ): void {
    let docCache = this.cache.get(documentId);

    if (!docCache) {
      docCache = [];
      this.cache.set(documentId, docCache);
    }

    // Check if query already exists (update instead of duplicate)
    const existingIndex = docCache.findIndex(
      (entry) => cosineSimilarity(queryEmbedding, entry.embedding) > 0.99
    );

    if (existingIndex !== -1) {
      // Update existing entry
      const existingEntry = docCache[existingIndex];
      if (existingEntry) {
        docCache[existingIndex] = {
          query,
          embedding: queryEmbedding,
          documentId,
          results,
          timestamp: Date.now(),
          hits: existingEntry.hits,
        };
        console.log('🔄 Updated existing cache entry');
      }
      return;
    }

    // Add new entry
    const newEntry: CacheEntry = {
      query,
      embedding: queryEmbedding,
      documentId,
      results,
      timestamp: Date.now(),
      hits: 0,
    };

    docCache.push(newEntry);

    // Evict oldest if over limit (LRU)
    if (docCache.length > this.MAX_ENTRIES_PER_DOC) {
      docCache.sort((a, b) => a.timestamp - b.timestamp);
      const evicted = docCache.shift();
      console.log(`🗑️ Evicted oldest cache entry (${evicted?.query.substring(0, 50)}...)`);
    }

    console.log(`💾 Cached query results (${docCache.length}/${this.MAX_ENTRIES_PER_DOC})`);
  }

  /**
   * Clear cache for a specific document
   */
  clearDocument(documentId: string): void {
    const deleted = this.cache.delete(documentId);
    if (deleted) {
      console.log(`🗑️ Cleared cache for document: ${documentId}`);
    }
  }

  /**
   * Clear all cache
   */
  clearAll(): void {
    this.cache.clear();
    this.stats.hits = 0;
    this.stats.misses = 0;
    console.log('🗑️ Cleared all semantic cache');
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    const totalQueries = this.stats.hits + this.stats.misses;
    const hitRate = totalQueries > 0 ? this.stats.hits / totalQueries : 0;

    let totalEntries = 0;
    this.cache.forEach((entries) => {
      totalEntries += entries.length;
    });

    return {
      hits: this.stats.hits,
      misses: this.stats.misses,
      hitRate,
      totalEntries,
    };
  }

  /**
   * Get cache entries for a document (for debugging)
   */
  getDocumentCache(documentId: string): CacheEntry[] | undefined {
    return this.cache.get(documentId);
  }

  /**
   * Clean up expired entries
   */
  cleanExpired(): void {
    let removedCount = 0;

    this.cache.forEach((entries, documentId) => {
      const filtered = entries.filter(
        (entry) => Date.now() - entry.timestamp <= this.MAX_CACHE_AGE_MS
      );

      if (filtered.length < entries.length) {
        removedCount += entries.length - filtered.length;
        this.cache.set(documentId, filtered);
      }
    });

    if (removedCount > 0) {
      console.log(`🧹 Cleaned ${removedCount} expired cache entries`);
    }
  }
}

// Export singleton instance
export const semanticCache = new SemanticCacheService();
