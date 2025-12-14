/**
 * IndexedDB Storage Service
 * Stores documents, chunks, and embeddings locally in the browser
 */

import { INDEXEDDB_CONFIG } from '@/lib/constants';
import type { TextChunk } from '@/lib/utils/text-chunker';
import type { Embedding } from './embedding-generator';

export interface StoredDocument {
  id: string;
  fileName: string;
  fileSize: number;
  totalPages: number;
  metadata: {
    title?: string;
    author?: string;
    creationDate?: string;
  };
  uploadedAt: number;
  processedAt?: number;
  status: 'uploaded' | 'processing' | 'completed' | 'error';
  error?: string;
  fileData?: ArrayBuffer; // Store the original PDF file for preview
}

export interface TextRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface StoredChunk {
  id: string;
  documentId: string;
  text: string;
  tokens: number;
  pageNumber?: number;
  chunkIndex: number;
  // Bounding rectangles for precise highlighting (PDF.js coordinates)
  rects?: TextRect[];
  embedding?: number[];
  createdAt: number;
}

let db: IDBDatabase | null = null;

/**
 * Initialize IndexedDB
 */
export async function initializeDB(): Promise<void> {
  if (db) {
    return; // Already initialized
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(
      INDEXEDDB_CONFIG.dbName,
      INDEXEDDB_CONFIG.version
    );

    request.onerror = () => {
      reject(new Error('Failed to open IndexedDB'));
    };

    request.onsuccess = () => {
      db = request.result;
      resolve();
    };

    request.onupgradeneeded = (event) => {
      const database = (event.target as IDBOpenDBRequest).result;

      // Create documents store
      if (!database.objectStoreNames.contains('documents')) {
        const documentsStore = database.createObjectStore('documents', {
          keyPath: 'id',
        });
        documentsStore.createIndex('uploadedAt', 'uploadedAt', { unique: false });
        documentsStore.createIndex('status', 'status', { unique: false });
      }

      // Create chunks store
      if (!database.objectStoreNames.contains('chunks')) {
        const chunksStore = database.createObjectStore('chunks', {
          keyPath: 'id',
        });
        chunksStore.createIndex('documentId', 'documentId', { unique: false });
        chunksStore.createIndex('pageNumber', 'pageNumber', { unique: false });
      }

      // Create conversations store (for future use)
      if (!database.objectStoreNames.contains('conversations')) {
        const conversationsStore = database.createObjectStore('conversations', {
          keyPath: 'id',
        });
        conversationsStore.createIndex('documentId', 'documentId', {
          unique: false,
        });
        conversationsStore.createIndex('createdAt', 'createdAt', {
          unique: false,
        });
      }

      // Create folders store (for future use)
      if (!database.objectStoreNames.contains('folders')) {
        database.createObjectStore('folders', { keyPath: 'id' });
      }

      // Create settings store
      if (!database.objectStoreNames.contains('settings')) {
        database.createObjectStore('settings', { keyPath: 'key' });
      }
    };
  });
}

/**
 * Ensure DB is initialized
 */
async function ensureDB(): Promise<IDBDatabase> {
  if (!db) {
    await initializeDB();
  }
  if (!db) {
    throw new Error('Database not initialized');
  }
  return db;
}

// ==================== Document Operations ====================

/**
 * Save a document to IndexedDB
 */
export async function saveDocument(document: StoredDocument): Promise<void> {
  console.log(`💾 [IndexedDB] Saving document: ${document.id}, title: ${document.title}`);
  const database = await ensureDB();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction(['documents'], 'readwrite');
    const store = transaction.objectStore('documents');
    const request = store.put(document);

    request.onsuccess = () => {
      console.log(`✅ [IndexedDB] Document saved successfully: ${document.id}`);
      resolve();
    };
    request.onerror = () => {
      console.error(`❌ [IndexedDB] Failed to save document: ${document.id}`);
      reject(new Error('Failed to save document'));
    };
  });
}

/**
 * Get a document by ID
 */
export async function getDocument(id: string): Promise<StoredDocument | null> {
  const database = await ensureDB();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction(['documents'], 'readonly');
    const store = transaction.objectStore('documents');
    const request = store.get(id);

    request.onsuccess = () => {
      resolve(request.result || null);
    };
    request.onerror = () => reject(new Error('Failed to get document'));
  });
}

/**
 * Get all documents
 */
export async function getAllDocuments(): Promise<StoredDocument[]> {
  const database = await ensureDB();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction(['documents'], 'readonly');
    const store = transaction.objectStore('documents');
    const request = store.getAll();

    request.onsuccess = () => {
      resolve(request.result || []);
    };
    request.onerror = () => reject(new Error('Failed to get documents'));
  });
}

/**
 * Delete a document (and all its chunks)
 */
export async function deleteDocument(id: string): Promise<void> {
  const database = await ensureDB();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction(
      ['documents', 'chunks'],
      'readwrite'
    );

    // Delete document
    const documentsStore = transaction.objectStore('documents');
    documentsStore.delete(id);

    // Delete all chunks for this document
    const chunksStore = transaction.objectStore('chunks');
    const index = chunksStore.index('documentId');
    const range = IDBKeyRange.only(id);
    const cursorRequest = index.openCursor(range);

    cursorRequest.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest).result;
      if (cursor) {
        cursor.delete();
        cursor.continue();
      }
    };

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(new Error('Failed to delete document'));
  });
}

// ==================== Chunk Operations ====================

/**
 * Save chunks to IndexedDB (batch operation)
 */
export async function saveChunks(chunks: StoredChunk[]): Promise<void> {
  const database = await ensureDB();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction(['chunks'], 'readwrite');
    const store = transaction.objectStore('chunks');

    for (const chunk of chunks) {
      store.put(chunk);
    }

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(new Error('Failed to save chunks'));
  });
}

/**
 * Get all chunks for a document
 */
export async function getDocumentChunks(
  documentId: string
): Promise<StoredChunk[]> {
  const database = await ensureDB();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction(['chunks'], 'readonly');
    const store = transaction.objectStore('chunks');
    const index = store.index('documentId');
    const request = index.getAll(documentId);

    request.onsuccess = () => {
      resolve(request.result || []);
    };
    request.onerror = () => reject(new Error('Failed to get chunks'));
  });
}

/**
 * Get all chunks from IndexedDB
 */
export async function getAllStoredChunks(): Promise<StoredChunk[]> {
  const database = await ensureDB();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction(['chunks'], 'readonly');
    const store = transaction.objectStore('chunks');
    const request = store.getAll();

    request.onsuccess = () => {
      resolve(request.result || []);
    };
    request.onerror = () => reject(new Error('Failed to get all chunks'));
  });
}

/**
 * Search chunks by similarity (requires embeddings to be stored)
 */
export async function searchChunks(
  queryEmbedding: number[],
  topK: number = 5,
  documentId?: string
): Promise<Array<{ chunk: StoredChunk; similarity: number }>> {
  const database = await ensureDB();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction(['chunks'], 'readonly');
    const store = transaction.objectStore('chunks');

    let request: IDBRequest;

    if (documentId) {
      // Search within specific document
      const index = store.index('documentId');
      request = index.getAll(documentId);
    } else {
      // Search all chunks
      request = store.getAll();
    }

    request.onsuccess = () => {
      const chunks: StoredChunk[] = request.result || [];

      // Filter chunks that have embeddings
      const chunksWithEmbeddings = chunks.filter((c) => c.embedding);

      // Calculate similarities
      const results = chunksWithEmbeddings.map((chunk) => {
        const similarity = cosineSimilarity(queryEmbedding, chunk.embedding!);
        return { chunk, similarity };
      });

      // Sort by similarity (descending)
      results.sort((a, b) => b.similarity - a.similarity);

      // Return top-k
      resolve(results.slice(0, topK));
    };

    request.onerror = () => reject(new Error('Failed to search chunks'));
  });
}

/**
 * Calculate cosine similarity between two vectors
 */
function cosineSimilarity(vec1: number[], vec2: number[]): number {
  if (vec1.length !== vec2.length) {
    throw new Error('Vectors must have the same dimension');
  }

  let dotProduct = 0;
  let norm1 = 0;
  let norm2 = 0;

  for (let i = 0; i < vec1.length; i++) {
    dotProduct += vec1[i]! * vec2[i]!;
    norm1 += vec1[i]! * vec1[i]!;
    norm2 += vec2[i]! * vec2[i]!;
  }

  norm1 = Math.sqrt(norm1);
  norm2 = Math.sqrt(norm2);

  if (norm1 === 0 || norm2 === 0) {
    return 0;
  }

  return dotProduct / (norm1 * norm2);
}

// ==================== Storage Management ====================

/**
 * Get storage usage estimate
 */
export async function getStorageUsage(): Promise<{
  usage: number; // bytes
  quota: number; // bytes
  percentage: number; // 0-100
}> {
  if (!('storage' in navigator) || !('estimate' in navigator.storage)) {
    return { usage: 0, quota: 0, percentage: 0 };
  }

  const estimate = await navigator.storage.estimate();
  const usage = estimate.usage || 0;
  const quota = estimate.quota || 0;
  const percentage = quota > 0 ? (usage / quota) * 100 : 0;

  return { usage, quota, percentage };
}

/**
 * Clear all data from IndexedDB
 */
export async function clearAllData(): Promise<void> {
  const database = await ensureDB();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction(
      ['documents', 'chunks', 'conversations', 'folders', 'settings'],
      'readwrite'
    );

    transaction.objectStore('documents').clear();
    transaction.objectStore('chunks').clear();
    transaction.objectStore('conversations').clear();
    transaction.objectStore('folders').clear();
    transaction.objectStore('settings').clear();

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(new Error('Failed to clear data'));
  });
}

/**
 * Get database statistics
 */
export async function getDBStats(): Promise<{
  totalDocuments: number;
  totalChunks: number;
  storageUsage: number;
}> {
  const database = await ensureDB();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction(['documents', 'chunks'], 'readonly');

    const documentsStore = transaction.objectStore('documents');
    const chunksStore = transaction.objectStore('chunks');

    const documentsCount = documentsStore.count();
    const chunksCount = chunksStore.count();

    Promise.all([
      new Promise<number>((res, rej) => {
        documentsCount.onsuccess = () => res(documentsCount.result);
        documentsCount.onerror = () => rej();
      }),
      new Promise<number>((res, rej) => {
        chunksCount.onsuccess = () => res(chunksCount.result);
        chunksCount.onerror = () => rej();
      }),
      getStorageUsage(),
    ])
      .then(([docs, chunks, storage]) => {
        resolve({
          totalDocuments: docs,
          totalChunks: chunks,
          storageUsage: storage.usage,
        });
      })
      .catch(() => reject(new Error('Failed to get stats')));
  });
}
