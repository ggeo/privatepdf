/**
 * Application-wide constants
 */

// App version (keep in sync with package.json and tauri.conf.json)
export const APP_VERSION = '1.0.0';
export const APP_NAME = 'PrivatePDF';
export const SUPPORT_EMAIL = 'support@example.com'; // Update with your support email

// PDF processing settings
export const PDF_SETTINGS = {
  maxFileSize: 500 * 1024 * 1024, // 500 MB
  maxPages: 10000,
  defaultChunkSize: 256, // tokens (roughly 1024 characters) - balanced for context and highlighting
  defaultChunkOverlap: 50, // tokens (roughly 20% overlap for context continuity)
  batchSize: 5, // pages to process at once
} as const;

// Vector search settings
export const SEARCH_SETTINGS = {
  defaultTopK: 10, // Increased to retrieve more potential matches
  defaultSimilarityThreshold: 0.5, // RAG retrieval threshold
  minSimilarityThreshold: 0.2,
  maxSimilarityThreshold: 0.95,
} as const;

// IndexedDB configuration
export const INDEXEDDB_CONFIG = {
  dbName: 'privatepdf-db',
  version: 1,
  stores: {
    documents: 'documents',
    chunks: 'chunks',
    conversations: 'conversations',
    folders: 'folders',
    settings: 'settings',
  },
} as const;

// Application routes
export const ROUTES = {
  home: '/',
  chat: '/privatepdf',
} as const;

// Error messages
export const ERROR_MESSAGES = {
  pdfTooLarge: 'PDF file is too large. Maximum size is 500MB.',
  pdfTooManyPages: 'PDF has too many pages. Maximum is 10,000 pages.',
  pdfInvalid: 'Invalid PDF file. Please upload a valid PDF document.',
  pdfEncrypted: 'Encrypted PDFs are not supported.',
  modelLoadFailed: 'Failed to load AI model. Please try again.',
  storageQuotaExceeded:
    'Browser storage quota exceeded. Please delete some documents.',
  ollamaNotRunning: 'Ollama is not running. Please start Ollama first.',
  ollamaModelNotFound: 'Required model not found in Ollama. Please download it first.',
} as const;
