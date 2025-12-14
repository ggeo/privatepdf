/**
 * Document & Search State Store (Zustand)
 * Manages PDF documents, processing, and search state
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { StoredDocument, StoredChunk } from '@/lib/services/indexeddb-storage';
import type { SearchContext, SearchQuery } from '@/lib/services/semantic-search';
import type { ProcessingProgress, ProcessingResult } from '@/lib/services/document-processor';

import {
  getAllDocuments,
  getDocument,
  deleteDocument,
  getDocumentChunks,
  getDBStats,
} from '@/lib/services/indexeddb-storage';
import { processDocument } from '@/lib/services/document-processor';
import { semanticSearch, clearDocumentCache } from '@/lib/services/semantic-search';

interface DocumentState {
  // Documents
  documents: StoredDocument[];
  currentDocument: StoredDocument | null; // Keep for backward compatibility
  selectedDocumentIds: string[]; // NEW: Multiple document selection
  currentChunks: StoredChunk[];
  _hasHydrated: boolean; // Track if store has been hydrated from localStorage
  _hasLoadedDocuments: boolean; // Track if documents have been loaded from IndexedDB

  // Processing
  isProcessing: boolean;
  processingProgress: ProcessingProgress | null;
  lastProcessingResult: ProcessingResult | null;

  // Search
  isSearching: boolean;
  currentSearch: SearchContext | null;
  searchHistory: string[];

  // Stats
  stats: {
    totalDocuments: number;
    totalChunks: number;
    storageUsage: number;
  };

  // Actions
  loadDocuments: () => Promise<void>;
  loadDocument: (id: string) => Promise<void>;
  toggleDocumentSelection: (id: string) => void; // NEW: Toggle document selection
  selectAllDocuments: () => void; // NEW: Select all documents
  clearDocumentSelection: () => void; // NEW: Clear all selections
  clearCurrentDocument: () => void;
  uploadAndProcess: (file: File, modelName: string) => Promise<ProcessingResult>;
  deleteDoc: (id: string) => Promise<void>;
  search: (query: SearchQuery) => Promise<SearchContext>;
  clearSearch: () => void;
  refreshStats: () => Promise<void>;
  reset: () => void;
}

export const useDocumentStore = create<DocumentState>()(
  persist(
    (set, get) => ({
      // Initial state
      documents: [],
      currentDocument: null,
      selectedDocumentIds: [],
      currentChunks: [],
      _hasHydrated: false,
      _hasLoadedDocuments: false,
      isProcessing: false,
      processingProgress: null,
      lastProcessingResult: null,
      isSearching: false,
      currentSearch: null,
      searchHistory: [],
      stats: {
        totalDocuments: 0,
        totalChunks: 0,
        storageUsage: 0,
      },

      // Actions
      loadDocuments: async () => {
        try {
          console.log('🔄 [Document Store] Loading documents from IndexedDB...');
          const docs = await getAllDocuments();
          set({ documents: docs });

          // Clean up invalid document selections (persisted IDs that no longer exist)
          const state = get();
          const validDocIds = docs.map((d: StoredDocument) => d.id);
          const invalidSelections = state.selectedDocumentIds.filter(
            (id: string) => !validDocIds.includes(id)
          );

          if (invalidSelections.length > 0) {
            console.log(`🧹 Cleaning up ${invalidSelections.length} invalid document selections`);
            set({
              selectedDocumentIds: state.selectedDocumentIds.filter((id: string) =>
                validDocIds.includes(id)
              ),
            });
          }

          // Mark documents as loaded - CRITICAL for preventing race condition!
          set({ _hasLoadedDocuments: true });
          console.log('✅ [Document Store] Documents loaded from IndexedDB:', {
            totalDocuments: docs.length,
            selectedDocumentIds: state.selectedDocumentIds.length,
            validSelections: state.selectedDocumentIds.filter(id => validDocIds.includes(id)).length,
          });

          // Refresh stats
          await state.refreshStats();
        } catch (error) {
          console.error('Failed to load documents:', error);
          // Even on error, mark as loaded to prevent infinite waiting
          set({ _hasLoadedDocuments: true });
        }
      },

      loadDocument: async (id: string) => {
        try {
          const doc = await getDocument(id);
          if (!doc) {
            console.error('Document not found:', id);
            return;
          }

          const chunks = await getDocumentChunks(id);

          set({
            currentDocument: doc,
            currentChunks: chunks,
          });
        } catch (error) {
          console.error('Failed to load document:', error);
        }
      },

      toggleDocumentSelection: (id: string) => {
        set((state: DocumentState) => {
          const isSelected = state.selectedDocumentIds.includes(id);
          const newSelectedIds = isSelected
            ? state.selectedDocumentIds.filter((docId: string) => docId !== id)
            : [...state.selectedDocumentIds, id];

          console.log('toggleDocumentSelection called for:', id);
          console.log('Was selected:', isSelected);
          console.log('New selected IDs:', newSelectedIds);

          // Update currentDocument for backward compatibility
          const currentDocument = newSelectedIds.length > 0
            ? state.documents.find((d: StoredDocument) => d.id === newSelectedIds[0]) || null
            : null;

          return {
            selectedDocumentIds: newSelectedIds,
            currentDocument,
          };
        });
      },

      selectAllDocuments: () => {
        set((state: DocumentState) => ({
          selectedDocumentIds: state.documents.map((d: StoredDocument) => d.id),
          currentDocument: state.documents[0] || null,
        }));
      },

      clearDocumentSelection: () => {
        set({
          selectedDocumentIds: [],
          currentDocument: null,
          currentChunks: [],
        });
      },

      clearCurrentDocument: () => {
        set({
          currentDocument: null,
          selectedDocumentIds: [],
          currentChunks: [],
        });
      },

      uploadAndProcess: async (file: File, _modelName: string) => {
        console.log(`📤 [Document Store] Starting upload and process for: ${file.name}`);

        set({
          isProcessing: true,
          processingProgress: {
            stage: 'validating',
            progress: 0,
            message: 'Starting...',
          },
        });

        try {
          const result = await processDocument(file, (progress) => {
            set({ processingProgress: progress });
          });

          console.log(`✅ [Document Store] Document processed, ID: ${result.documentId}`);

          set({
            isProcessing: false,
            processingProgress: null,
            lastProcessingResult: result,
          });

          // Reload documents list
          console.log(`🔄 [Document Store] Reloading documents list...`);
          const state = get();
          await state.loadDocuments();
          console.log(`✅ [Document Store] Documents list reloaded successfully`);

          // Auto-select the uploaded document AFTER loadDocuments completes
          console.log(`🎯 [Document Store] Auto-selecting uploaded document: ${result.documentId}`);
          state.toggleDocumentSelection(result.documentId);

          return result;
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';

          set({
            isProcessing: false,
            processingProgress: {
              stage: 'error',
              progress: 0,
              message: 'Processing failed',
              error: errorMessage,
            },
          });

          throw error;
        }
      },

      deleteDoc: async (id: string) => {
        try {
          await deleteDocument(id);

          // Clear semantic cache for this document
          clearDocumentCache(id);
          console.log(`🗑️ Cleared semantic cache for deleted document: ${id}`);

          // Update state
          set((state: DocumentState) => ({
            documents: state.documents.filter((d: StoredDocument) => d.id !== id),
            currentDocument:
              state.currentDocument?.id === id ? null : state.currentDocument,
            currentChunks: state.currentDocument?.id === id ? [] : state.currentChunks,
          }));

          // Refresh stats
          const state = get();
          await state.refreshStats();
        } catch (error) {
          console.error('Failed to delete document:', error);
          throw error;
        }
      },

      search: async (query: SearchQuery) => {
        set({ isSearching: true });

        try {
          const searchResult = await semanticSearch(query);

          set((state: DocumentState) => ({
            isSearching: false,
            currentSearch: searchResult,
            searchHistory: [
              query.text,
              ...state.searchHistory.filter((q: string) => q !== query.text),
            ].slice(0, 10), // Keep last 10 searches
          }));

          return searchResult;
        } catch (error) {
          set({ isSearching: false });
          console.error('Search failed:', error);
          throw error;
        }
      },

      clearSearch: () => {
        set({
          currentSearch: null,
        });
      },

      refreshStats: async () => {
        try {
          const stats = await getDBStats();
          set({ stats });
        } catch (error) {
          console.error('Failed to refresh stats:', error);
        }
      },

      reset: () => {
        set({
          documents: [],
          currentDocument: null,
          currentChunks: [],
          isProcessing: false,
          processingProgress: null,
          lastProcessingResult: null,
          isSearching: false,
          currentSearch: null,
          searchHistory: [],
          stats: {
            totalDocuments: 0,
            totalChunks: 0,
            storageUsage: 0,
          },
        });
      },
    }),
    {
      name: 'document-storage',
      // Persist both search history and selected documents
      partialize: (state: DocumentState) => ({
        searchHistory: state.searchHistory,
        selectedDocumentIds: state.selectedDocumentIds,
      }) as Pick<DocumentState, 'searchHistory' | 'selectedDocumentIds'>,
      // Merge strategy: Use persisted selectedDocumentIds ONLY if documents exist
      merge: (persistedState: unknown, currentState: DocumentState) => {
        const merged = {
          ...currentState,
          ...(persistedState as Partial<DocumentState>),
        };

        // Validate that persisted document IDs actually exist in IndexedDB
        // This will be checked when documents are loaded
        return merged;
      },
      // Track when hydration completes
      onRehydrateStorage: () => (state) => {
        if (state) {
          state._hasHydrated = true;
          console.log('📦 Document store hydrated from localStorage', {
            selectedDocumentIds: state.selectedDocumentIds,
            searchHistory: state.searchHistory.length,
          });
        }
      },
    }
  )
);

// Selectors for common derived state
export const useDocuments = () => {
  return useDocumentStore((state) => state.documents);
};

export const useCurrentDocument = () => {
  return useDocumentStore((state) => state.currentDocument);
};

export const useIsProcessing = () => {
  return useDocumentStore((state) => state.isProcessing);
};

export const useProcessingProgress = () => {
  return useDocumentStore((state) => state.processingProgress);
};

export const useCurrentSearch = () => {
  return useDocumentStore((state) => state.currentSearch);
};

export const useIsSearching = () => {
  return useDocumentStore((state) => state.isSearching);
};

export const useDocumentStats = () => {
  return useDocumentStore((state) => state.stats);
};

export const useHasHydrated = () => {
  return useDocumentStore((state) => state._hasHydrated);
};
