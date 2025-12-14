/**
 * Ollama-based LLM Generation Service
 * Uses Ollama for fast, native LLM inference
 */

import { ollamaService } from './ollama-service';
import type { Message } from './ollama-service';
import { ollamaMonitor } from './ollama-monitor';
import { useSettingsStore } from '@/stores/settings-store'; // Import useSettingsStore

export interface LLMStreamOptions {
  model: string; // Add model property
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  conversationHistory?: Message[]; // Previous messages for context
  onToken?: (token: string) => void;
  onMetrics?: (metrics: { totalTokens: number; tokensPerSecond: number }) => void;
  signal?: AbortSignal; // For cancelling requests
}

/**
 * Generate a response using Ollama with RAG context
 */
export async function generateRAGResponse(
  query: string,
  context: string,
  options: LLMStreamOptions
): Promise<string> {
  const messages = ollamaService.buildRAGPrompt(query, context, options.conversationHistory);

  // For non-streaming response
  const response = await ollamaService.chatSync(messages, {
    model: options.model, // Pass the model
    temperature: options.temperature,
    maxTokens: options.maxTokens,
    topP: options.topP,
  });

  return response;
}

/**
 * Generate a streaming response using Ollama with RAG context
 */
export async function* generateRAGResponseStream(
  query: string,
  context: string,
  options: LLMStreamOptions
): AsyncGenerator<string> {
  console.log('🎯 generateRAGResponseStream called');
  console.log('Query:', query.substring(0, 100));
  console.log('Context length:', context.length);
  console.log('Model:', options.model);
  console.log('Conversation history:', options.conversationHistory?.length || 0, 'messages');

  const messages = ollamaService.buildRAGPrompt(query, context, options.conversationHistory);
  console.log('📝 Built prompt with', messages.length, 'messages');

  const stream = await ollamaService.chat(messages, {
    model: options.model, // Pass the model
    temperature: options.temperature,
    maxTokens: options.maxTokens,
    topP: options.topP,
    signal: options.signal, // Pass abort signal
    onMetrics: (metrics) => {
      options.onMetrics?.({
        totalTokens: metrics.totalTokens,
        tokensPerSecond: metrics.tokensPerSecond,
      });
    },
  });

  console.log('🌊 Starting to consume stream...');
  let tokenCount = 0;
  for await (const token of stream) {
    tokenCount++;
    if (tokenCount <= 5) {
      console.log(`Token ${tokenCount}:`, token.substring(0, 30));
    }
    options.onToken?.(token);
    yield token;
  }
  console.log('✅ Stream complete, total tokens:', tokenCount);
}

/**
 * Generate a simple response without RAG context
 */
export async function generateResponse(
  prompt: string,
  options: LLMStreamOptions
): Promise<string> {
  const messages: Message[] = [
    { role: 'user', content: prompt }
  ];

  const response = await ollamaService.chatSync(messages, {
    model: options.model, // Pass the model
    temperature: options.temperature,
    maxTokens: options.maxTokens,
    topP: options.topP,
  });

  return response;
}

/**
 * Check if LLM is ready (Ollama is running and at least one model is loaded)
 */
export async function isLLMReady(): Promise<boolean> {
  const status = await ollamaService.checkStatus();
  if (!status.isRunning) return false;

  // Check if we have ANY chat model and the embedding model
  const { LIGHT, MEDIUM, LARGE } = ollamaService.CHAT_MODELS;
  const EMBEDDING = ollamaService.EMBEDDING_MODEL;

  // Match models with or without :latest suffix
  const hasChatModel = status.models.some(model =>
    model === LIGHT.name || model === `${LIGHT.name}:latest` ||
    model === MEDIUM.name || model === `${MEDIUM.name}:latest` ||
    model === LARGE.name || model === `${LARGE.name}:latest`
  );
  const hasEmbedding = status.models.some(model =>
    model === EMBEDDING || model === `${EMBEDDING}:latest` || model.startsWith(`${EMBEDDING}:`)
  );

  console.log('Models available:', status.models);
  console.log(`Has any chat model: ${hasChatModel}, Has embedding: ${hasEmbedding}`);

  return hasChatModel && hasEmbedding;
}

/**
 * Initialize LLM (ensure models are downloaded)
 */
export async function initializeLLM(
  onProgress?: (message: string) => void
): Promise<void> {
  console.log('Starting to initialize LLM and download models...');

  // Mark as downloading at the start
  ollamaMonitor.updateDownloadProgress('Preparing...', 0, true);

  try {
    const { selectedTier } = useSettingsStore.getState();
    const selectedChatModel = ollamaService.CHAT_MODELS[selectedTier].name;
    const embeddingModel = ollamaService.EMBEDDING_MODEL;

    // Ensure chat model
    await ollamaService.ensureModels(selectedChatModel, (model, progress) => {
      const isDownloading = progress.status !== 'success';
      const percent = progress.percent || 0;
      ollamaMonitor.updateDownloadProgress(model, percent, isDownloading);
      if (progress.percent !== undefined) {
        onProgress?.(`Downloading ${model}: ${progress.percent}%`);
      } else {
        onProgress?.(progress.status || 'Initializing...');
      }
    });

    // Ensure embedding model
    await ollamaService.ensureModels(embeddingModel, (model, progress) => {
      const isDownloading = progress.status !== 'success';
      const percent = progress.percent || 0;
      ollamaMonitor.updateDownloadProgress(model, percent, isDownloading);
      if (progress.percent !== undefined) {
        onProgress?.(`Downloading ${model}: ${progress.percent}%`);
      } else {
        onProgress?.(progress.status || 'Initializing...');
      }
    });

    console.log('Models downloaded successfully');
    // Clear download state when done
    ollamaMonitor.updateDownloadProgress('', undefined, false);

    // Force a re-check to update status
    await ollamaMonitor.checkNow();
  } catch (error) {
    console.error('Failed to initialize LLM:', error);
    ollamaMonitor.updateDownloadProgress('', undefined, false);
    throw error;
  }
}

/**
 * Get information about the current LLM
 */
export function getLLMInfo(): {
  model: string;
  name: string;
  size: string;
  loaded: boolean;
} {
  const { selectedTier } = useSettingsStore.getState();
  const selectedModel = ollamaService.CHAT_MODELS[selectedTier];

  return {
    model: selectedModel.name,
    name: selectedModel.displayName,
    size: selectedModel.size,
    loaded: true,
  };
}