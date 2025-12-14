import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { NetworkInfo } from '@/lib/services/network-detector';
import { detectNetwork, getNetworkSummary } from '@/lib/services/network-detector';
import { ollamaService, EMBEDDING_MODEL } from '@/lib/services/ollama-service';

export interface DownloadProgress {
  model: string;
  status: 'pulling' | 'downloading' | 'verifying' | 'completed' | 'error';
  progress: number; // 0-100
  message?: string;
  error?: string;
}

interface OllamaState {
  // Network detection
  network: NetworkInfo | null;

  // Model download state (pulling from Ollama)
  downloadInProgress: boolean;
  downloadProgress: {
    embedding?: DownloadProgress;
    llm?: DownloadProgress;
  };
  downloadError: string | null;
  downloadModel?: string; // Currently downloading model name

  // Ollama connection
  isOllamaRunning: boolean;
  modelsReady: boolean; // All required models are available in Ollama
  availableModels: string[]; // List of models available in Ollama

  // Initialization state
  initialized: boolean;
  initializationStep: string;

  // Actions
  detectNetworkInfo: () => void;
  downloadModels: (modelName: string) => Promise<void>; // Pull model via Ollama
  checkOllamaStatus: () => Promise<void>;
  refreshAvailableModels: () => Promise<void>;
  initialize: () => Promise<void>;
  reset: () => void;
}

export const useOllamaStore = create<OllamaState>()(
  persist(
    (set, get) => ({
      // Initial state
      network: null,
      downloadInProgress: false,
      downloadProgress: {},
      downloadError: null,
      downloadModel: undefined,
      isOllamaRunning: false,
      modelsReady: false,
      availableModels: [],
      initialized: false,
      initializationStep: 'idle',

      // Actions
      detectNetworkInfo: () => {
        try {
          const network = detectNetwork();
          set({ network });
        } catch (error) {
          console.error('Network detection failed:', error);
        }
      },

      downloadModels: async (modelName) => {
        if (!modelName) {
          console.error('No model name provided for download');
          return;
        }

        try {
          set({
            downloadInProgress: true,
            downloadError: null,
            downloadProgress: {},
            downloadModel: modelName,
            initializationStep: `Pulling ${modelName} from Ollama...`,
          });

          // Determine model type
          const isEmbeddingModel = modelName === EMBEDDING_MODEL;
          const modelType = isEmbeddingModel ? 'embedding' : 'llm';

          // Pull model via Ollama API
          await ollamaService.pullModel(modelName, (progress) => {
            // Calculate progress percentage - handle case where completed might be 0
            let progressPercent = 0;
            if (progress.total && progress.total > 0) {
              progressPercent = Math.round(((progress.completed || 0) / progress.total) * 100);
            } else if (progress.percent !== undefined) {
              // Use pre-calculated percent if available
              progressPercent = progress.percent;
            }

            set((state) => ({
              downloadProgress: {
                ...state.downloadProgress,
                [modelType]: {
                  model: modelName,
                  status: progress.status as any,
                  progress: progressPercent,
                  message: progress.status,
                },
              },
            }));
          });

          set({
            downloadInProgress: false,
            downloadError: null,
            downloadModel: undefined,
          });

          // Refresh available models
          await get().refreshAvailableModels();
        } catch (error) {
          set({
            downloadInProgress: false,
            downloadError: error instanceof Error ? error.message : 'Failed to download model',
            downloadModel: undefined,
          });
          throw error;
        }
      },

      checkOllamaStatus: async () => {
        try {
          const status = await ollamaService.checkStatus();
          set({
            isOllamaRunning: status.isRunning,
          });
        } catch (error) {
          set({ isOllamaRunning: false });
        }
      },

      refreshAvailableModels: async () => {
        try {
          const status = await ollamaService.checkStatus();
          console.log('Ollama Store - refreshAvailableModels:', {
            isRunning: status.isRunning,
            models: status.models,
            modelCount: status.models.length
          });

          set({
            availableModels: status.models,
            isOllamaRunning: status.isRunning,
          });

          // Check if required models are available
          const hasEmbeddingModel = status.models.some(m =>
            m === EMBEDDING_MODEL || m.startsWith(`${EMBEDDING_MODEL}:`)
          );
          // Check if any chat model is available (user might have multiple)
          const hasChatModel = status.models.some(m =>
            m.includes('gemma') || m.includes('llama') || m.includes('qwen')
          );

          const ready = hasEmbeddingModel && hasChatModel;
          console.log('Ollama Store - models check:', {
            hasEmbeddingModel,
            hasChatModel,
            modelsReady: ready
          });

          set({ modelsReady: ready });
        } catch (error) {
          console.error('Failed to refresh available models:', error);
          set({
            availableModels: [],
            modelsReady: false,
            isOllamaRunning: false,
          });
        }
      },

      initialize: async () => {
        set({ initializationStep: 'Initializing Ollama store...' });

        const state = get();

        // Step 1: Detect network
        state.detectNetworkInfo();

        // Step 2: Check Ollama status and available models
        try {
          await state.checkOllamaStatus();
          await state.refreshAvailableModels();
        } catch (error) {
          console.error('Failed to initialize Ollama:', error);
        }

        set({
          initialized: true,
          initializationStep: 'Ready',
        });

        // Clear any existing interval to prevent multiple intervals
        if ((window as any).__ollamaCheckInterval) {
          clearInterval((window as any).__ollamaCheckInterval);
        }

        // Continue checking in background
        const checkInterval = setInterval(async () => {
          try {
            await state.checkOllamaStatus();
            await state.refreshAvailableModels();
          } catch (error) {
            // Silently fail
          }
        }, 5000); // Check every 5 seconds

        // Store interval ID for cleanup
        (window as any).__ollamaCheckInterval = checkInterval;
      },

      reset: () => {
        // Clean up interval on reset to prevent memory leak
        if ((window as any).__ollamaCheckInterval) {
          clearInterval((window as any).__ollamaCheckInterval);
          (window as any).__ollamaCheckInterval = undefined;
        }

        set({
          network: null,
          downloadInProgress: false,
          downloadProgress: {},
          downloadError: null,
          downloadModel: undefined,
          isOllamaRunning: false,
          modelsReady: false,
          availableModels: [],
          initialized: false,
          initializationStep: 'idle',
        });
      },
    }),
    {
      name: 'ollama-storage',
      // Only persist user preferences, not dynamic state
      partialize: () => ({}),
    }
  )
);

// Selectors for common derived state
export const useNetworkSummary = () => {
  const network = useOllamaStore((state) => state.network);
  return network ? getNetworkSummary(network) : 'Not detected';
};

export const useIsModelsReady = () => {
  return useOllamaStore((state) => state.modelsReady);
};

export const useDownloadProgress = () => {
  return useOllamaStore((state) => state.downloadProgress);
};

export const useIsOllamaRunning = () => {
  return useOllamaStore((state) => state.isOllamaRunning);
};
