/**
 * Chat State Store (Zustand)
 * Manages chat conversations and Ollama LLM interactions
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  generateRAGResponseStream,
  initializeLLM,
  isLLMReady,
} from '@/lib/services/llm-generator';
import { semanticSearch, buildRAGContext } from '@/lib/services/semantic-search';
import type { SearchResult } from '@/lib/services/semantic-search';
import { createStreamSmoother } from '@/lib/utils/stream-smoother';
import { useSettingsStore, SEARCH_SETTINGS } from '@/stores/settings-store';
import { CHAT_MODELS } from '@/lib/services/ollama-service';
import {
  classifyQuery,
  getRetrievalStrategy,
  checkRetrievalSufficiency,
} from '@/lib/services/query-classifier';
import {
  gradeRAGResponse,
  gradeRetrieval,
} from '@/lib/services/adaptive-rag-graders';
import { ollamaMonitor } from '@/lib/services/ollama-monitor';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  sources?: SearchResult[]; // Source documents for RAG
  isStreaming?: boolean;
  metrics?: {
    totalTokens: number;
    tokensPerSecond: number;
  };
}

export interface ChatSession {
  id: string;
  documentId?: string; // If chat is document-specific
  title: string;
  createdAt: Date;
  updatedAt: Date;
  messages: ChatMessage[];
  model: string; // Store the model used for the session
}

interface ChatState {
  // Sessions
  sessions: ChatSession[];
  currentSessionId: string | null;

  // Current chat state
  isGenerating: boolean;
  isInitializing: boolean;
  initProgress: string | null;
  currentMessage: string; // Streaming message being generated

  // Ollama connection state
  isOllamaReady: boolean;

  // Actions
  createSession: (documentId?: string) => string;
  deleteSession: (sessionId: string) => void;
  clearAllSessions: () => void;
  setCurrentSession: (sessionId: string) => void;
  sendMessage: (content: string, documentId?: string) => Promise<void>;
  stopGeneration: () => void;
  clearCurrentSession: () => void;
  initializeOllama: () => Promise<void>;
  reset: () => void;
}

let abortGeneration = false;
let abortController: AbortController | null = null;

// Helper function to remove <think> tags from reasoning models
function cleanThinkTags(text: string): string {
  return text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
}

export const useChatStore = create<ChatState>()(
  persist(
    (set, get) => ({
      // Initial state
      sessions: [],
      currentSessionId: null,
      isGenerating: false,
      isInitializing: false,
      initProgress: null,
      currentMessage: '',
      isOllamaReady: false,

      // Actions
      createSession: (documentId?: string) => {
        const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const { selectedTier } = useSettingsStore.getState();
        const selectedModelName = CHAT_MODELS[selectedTier].name;

        const newSession: ChatSession = {
          id: sessionId,
          documentId,
          title: 'New Chat',
          createdAt: new Date(),
          updatedAt: new Date(),
          messages: [],
          model: selectedModelName,
        };

        set((state) => {
          let sessions = [...state.sessions, newSession];

          // Limit to 10 most recent sessions - delete oldest if exceeding
          if (sessions.length > 10) {
            // Sort by createdAt and keep only the 10 newest
            sessions = sessions
              .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
              .slice(0, 10);
          }

          return {
            sessions,
            currentSessionId: sessionId,
          };
        });

        return sessionId;
      },

      deleteSession: (sessionId: string) => {
        set((state) => ({
          sessions: state.sessions.filter((s) => s.id !== sessionId),
          currentSessionId:
            state.currentSessionId === sessionId ? null : state.currentSessionId,
        }));
      },

      clearAllSessions: () => {
        set({
          sessions: [],
          currentSessionId: null,
        });
      },

      setCurrentSession: (sessionId: string) => {
        set({ currentSessionId: sessionId });
      },

      sendMessage: async (content: string, documentId?: string) => {
        console.log('🚀 sendMessage CALLED! content:', content, 'documentId:', documentId);

        // Reset abort flag and create new abort controller for this request
        abortGeneration = false;
        if (abortController) {
          abortController.abort(); // Cancel any previous request
        }
        abortController = new AbortController();

        let state = get();
        let sessionId = state.currentSessionId;

        // Create session if none exists
        if (!sessionId) {
          console.log('No session found, creating new one');
          sessionId = state.createSession(documentId);
          // Get updated state after creating session
          state = get();
        }

        const session = state.sessions.find((s) => s.id === sessionId);
        if (!session) {
          console.error('❌ Session not found');
          return;
        }

        // Check if Ollama is ready
        console.log('Checking if Ollama is ready...');
        const ready = await isLLMReady();
        console.log('Ollama ready:', ready);
        if (!ready) {
          console.error('❌ Ollama is not ready. Please ensure Ollama is running and models are downloaded.');
          return;
        }

        // Add user message
        const userMessageId = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const userMessage: ChatMessage = {
          id: userMessageId,
          role: 'user',
          content,
          timestamp: new Date(),
        };

        set((state) => ({
          sessions: state.sessions.map((s) =>
            s.id === sessionId
              ? {
                  ...s,
                  messages: [...s.messages, userMessage],
                  updatedAt: new Date(),
                }
              : s
          ),
        }));

        // Initialize assistant message
        const assistantMessageId = `msg_${Date.now() + 1}_${Math.random().toString(36).substr(2, 9)}`;
        const assistantMessage: ChatMessage = {
          id: assistantMessageId,
          role: 'assistant',
          content: '',
          timestamp: new Date(),
          isStreaming: true,
        };

        set((state) => ({
          sessions: state.sessions.map((s) =>
            s.id === sessionId
              ? { ...s, messages: [...s.messages, assistantMessage] }
              : s
          ),
          isGenerating: true,
          currentMessage: '',
        }));

        // Pause Ollama monitor during generation to avoid false disconnections
        ollamaMonitor.setGenerating(true);

        try {
          // Get the currently selected model from settings (needed for grading)
          const { selectedTier } = useSettingsStore.getState();
          const selectedModel = CHAT_MODELS[selectedTier].name;

          // Perform semantic search if document context needed
          let sources: SearchResult[] = [];
          let context = '';

          console.log('sendMessage called with documentId:', documentId);

          // ========== TRUE ADAPTIVE RAG PIPELINE ==========
          // Step 1: Classify query complexity and determine retrieval mode
          // Pass hasDocuments flag to prevent no_retrieval when documents are selected
          const classification = classifyQuery(content, !!documentId);
          let strategy = getRetrievalStrategy(classification.type, classification.retrievalMode);

          console.log('🎯 Adaptive RAG Classification:', {
            type: classification.type,
            complexity: classification.complexity,
            retrievalMode: classification.retrievalMode,
            confidence: classification.confidence.toFixed(2),
            reasoning: classification.reasoning,
          });

          // Step 2: Route based on retrieval mode
          if (classification.retrievalMode === 'no_retrieval') {
            // NO RETRIEVAL PATH: Simple queries answered by LLM knowledge
            console.log('✨ No retrieval needed - using LLM internal knowledge');
            // Skip to generation with empty context
            context = '';
            sources = [];
          } else if (documentId) {
            // RETRIEVAL PATHS: Single-step or multi-step

            const documentIds = documentId.split(',');

            // Step 3: Retrieval with grading
            let retrievalAttempts = 0;
            const maxAttempts = classification.retrievalMode === 'multi_step' ? 3 : 1;

            while (retrievalAttempts < maxAttempts) {
              retrievalAttempts++;
              console.log(`🔍 Retrieval attempt ${retrievalAttempts}/${maxAttempts}`);

              // Retrieve documents
              const currentSources: SearchResult[] = [];
              for (const docId of documentIds) {
                const searchResult = await semanticSearch({
                  text: content,
                  documentId: docId.trim(),
                  topK: strategy.topK,
                  minSimilarity: strategy.minSimilarity,
                  mmrLambda: strategy.mmrLambda,
                });
                currentSources.push(...searchResult.results);
              }

              currentSources.sort((a, b) => b.similarity - a.similarity);
              const topSources = currentSources.slice(0, strategy.topK);

              if (topSources.length === 0) {
                console.warn('❌ No documents retrieved');
                break;
              }

              // Step 4: Grade retrieval quality (LLM-based using user's selected model)
              console.log('📊 Grading retrieval quality...');
              const retrievalGrade = await gradeRetrieval(content, topSources, selectedModel);
              console.log('Retrieval Grade:', retrievalGrade);

              if (retrievalGrade.passed) {
                // Documents are relevant - use them
                sources = topSources;
                console.log('✅ Retrieval passed grading');
                break;
              } else if (classification.retrievalMode === 'multi_step' && retrievalAttempts < maxAttempts) {
                // Multi-step: Try again with different parameters
                console.log(`⚠️ Retrieval failed grading (${retrievalGrade.reasoning}), retrying...`);
                strategy.minSimilarity = Math.max(0.25, strategy.minSimilarity - 0.1);
                strategy.topK = Math.min(strategy.topK + 5, 25);
              } else {
                // Single-step or final attempt: Use what we have
                console.log(`⚠️ Using documents despite failed grading: ${retrievalGrade.reasoning}`);
                sources = topSources;
                break;
              }
            }

            console.log(`Total sources after ${retrievalAttempts} attempts:`, sources.length);

            context = buildRAGContext(sources);
            console.log('Context built, length:', context.length);
            console.log('RAG Context preview:', context.substring(0, 500));
          } else {
            console.log('No documentId provided - skipping RAG search');
          }

          // Controller already created at start of sendMessage
          let generatedText = '';
          let messageMetrics: { totalTokens: number; tokensPerSecond: number } | undefined;
          let streamSmoother: ReturnType<typeof createStreamSmoother> | null = null;

          streamSmoother = createStreamSmoother((textChunk) => {
            // Don't update if aborted
            if (abortGeneration) {
              return;
            }
            generatedText += textChunk;
            set({ currentMessage: generatedText });

            // Update message in real-time
            set((state) => ({
              sessions: state.sessions.map((s) =>
                s.id === sessionId
                  ? {
                      ...s,
                      messages: s.messages.map((m) =>
                        m.id === assistantMessageId
                          ? { ...m, content: generatedText }
                          : m
                      ),
                    }
                  : s
              ),
            }));
          });

          // ADAPTIVE RAG: Use strategy-specific parameters from earlier classification

          console.log('🎯 Using adaptive LLM parameters:', {
            temperature: strategy.temperature,
            maxTokens: strategy.maxTokens,
            queryType: classification.type,
          });

          // Get conversation history from current session (exclude the last 2 messages which are the current user message and empty assistant message)
          const currentSession = get().sessions.find(s => s.id === sessionId);
          const conversationHistory = currentSession?.messages.slice(0, -2).map(msg => ({
            role: msg.role,
            content: msg.content
          })) || [];

          console.log('💬 Including conversation history:', conversationHistory.length, 'previous messages');

          // Retry loop to handle model loading
          let retryCount = 0;
          const MAX_RETRIES = 5; // Allow up to 5 retries for large models (takes ~30 seconds to load)

          while (retryCount <= MAX_RETRIES) {
            try {
              // Generate response with streaming using adaptive parameters
              const stream = generateRAGResponseStream(content, context, {
                model: selectedModel, // Pass the selected model
                maxTokens: strategy.maxTokens, // Adaptive based on query type
                temperature: strategy.temperature, // Adaptive based on query type
                topP: 0.9, // Higher top_p for more diverse token sampling
                conversationHistory, // Pass previous messages for context
                signal: abortController?.signal, // Pass abort signal for cancellation
                onToken: (token) => {
                  if (abortGeneration) {
                    streamSmoother?.cancel();
                    return;
                  }
                  streamSmoother?.add(token);
                },
                onMetrics: (metrics) => {
                  messageMetrics = metrics;
                  console.log(`✓ Response complete: ${metrics.totalTokens} tokens @ ${metrics.tokensPerSecond} tokens/sec`);
                },
              });

              // Process the stream
              for await (const _ of stream) {
                if (abortGeneration) {
                  streamSmoother?.cancel();
                  break;
                }
              }

              // If we got here, streaming succeeded
              break;
            } catch (error: any) {
              if (error.message === 'MODEL_LOADING' && retryCount < MAX_RETRIES) {
                console.log('⏳ Large model is loading, retrying in 2 seconds...');
                retryCount++;

                // Just wait and retry - keep showing 3 dots (no special message)
                await new Promise(resolve => setTimeout(resolve, 2000));
                generatedText = ''; // Reset for retry
              } else {
                // Re-throw non-MODEL_LOADING errors or if max retries exceeded
                throw error;
              }
            }
          }

          // Wait for the smoother to finish (only if not aborted)
          if (!abortGeneration && streamSmoother) {
            await streamSmoother.flush();
          }

          // Finalize message with metrics (only if not aborted)
          if (!abortGeneration) {
            // Step 5: Grade answer quality and hallucination (TRUE ADAPTIVE RAG)
            if (classification.retrievalMode !== 'no_retrieval' && sources.length > 0) {
              console.log('📊 Grading answer quality and hallucination...');
              const grades = await gradeRAGResponse(content, generatedText, sources, selectedModel);

              console.log('Answer Grades:', {
                retrieval: grades.retrieval,
                answer: grades.answer,
                hallucination: grades.hallucination,
                overallPassed: grades.overallPassed,
              });

              // If grading failed and we're in multi-step mode, we could retry
              // For now, we'll log the failure and proceed
              if (!grades.overallPassed) {
                console.warn('⚠️ Answer quality check failed:', {
                  retrieval: grades.retrieval.passed ? '✓' : `✗ ${grades.retrieval.reasoning}`,
                  answer: grades.answer.passed ? '✓' : `✗ ${grades.answer.reasoning}`,
                  hallucination: grades.hallucination.passed ? '✓' : `✗ ${grades.hallucination.reasoning}`,
                });
                // In a full implementation, we could:
                // 1. Regenerate with different prompt
                // 2. Retrieve more documents
                // 3. Add a warning to the user
              } else {
                console.log('✅ Answer passed all quality checks');
              }
            }

            console.log('📌 Attaching sources to message:', sources.map(s => ({
              page: s.pageNumber,
              similarity: s.similarity.toFixed(4),
              snippet: s.chunk.text.substring(0, 100)
            })));

            set((state) => ({
              sessions: state.sessions.map((s) =>
                s.id === sessionId
                  ? {
                      ...s,
                      messages: s.messages.map((m) =>
                        m.id === assistantMessageId
                          ? { ...m,
                              content: cleanThinkTags(generatedText),
                              sources: sources.length > 0 ? sources : undefined,
                              isStreaming: false,
                              metrics: messageMetrics,
                            }
                          : m
                      ),
                      updatedAt: new Date(),
                    }
                  : s
              ),
              isGenerating: false,
              currentMessage: '',
            }));

          // Resume Ollama monitoring after generation completes
          ollamaMonitor.setGenerating(false);
        } else {
            // If aborted, just mark as not streaming without sources
            set((state) => ({
              sessions: state.sessions.map((s) =>
                s.id === sessionId
                  ? {
                      ...s,
                      messages: s.messages.map((m) =>
                        m.id === assistantMessageId
                          ? { ...m, isStreaming: false }
                          : m
                      ),
                    }
                  : s
              ),
              isGenerating: false,
              currentMessage: '',
            }));

          // Resume Ollama monitoring after abort
          ollamaMonitor.setGenerating(false);
        }

          // Update session title based on first message
          if (session.messages.length === 0) {
            const title = content.substring(0, 50) + (content.length > 50 ? '...' : '');
            set((state) => ({
              sessions: state.sessions.map((s) =>
                s.id === sessionId ? { ...s, title } : s
              ),
            }));
          }
        } catch (error: any) {
          console.error('Generation error:', error);

          // Update message with error
          set((state) => ({
            sessions: state.sessions.map((s) =>
              s.id === sessionId
                ? {
                    ...s,
                    messages: s.messages.map((m) =>
                      m.id === assistantMessageId
                        ? {
                            ...m,
                            content: `Error: ${error.message || 'Failed to generate response. Please ensure Ollama is running.'}`,
                            isStreaming: false,
                          }
                        : m
                    ),
                  }
                : s
            ),
            isGenerating: false,
            currentMessage: '',
          }));

          // Resume Ollama monitoring after error
          ollamaMonitor.setGenerating(false);
        }
      },

      stopGeneration: () => {
        console.log('🛑 Stop button clicked - aborting generation');
        abortGeneration = true;
        if (abortController) {
          abortController.abort();
          abortController = null;
        }
        set({ isGenerating: false, currentMessage: '' });

        // Resume Ollama monitoring after manual stop
        ollamaMonitor.setGenerating(false);
      },

      clearCurrentSession: () => {
        // Simply set currentSessionId to null - this will start fresh next time
        set({ currentSessionId: null });
      },

      initializeOllama: async () => {
        set({ isInitializing: true, initProgress: 'Checking Ollama status...' });

        try {
          // Check if Ollama is ready
          const ready = await isLLMReady();

          if (!ready) {
            // Try to initialize models
            await initializeLLM((progress) => {
              set({ initProgress: progress });
            });
          }

          set({
            isInitializing: false,
            initProgress: null,
            isOllamaReady: true,
          });
        } catch (error: any) {
          console.error('Failed to initialize Ollama:', error);
          set({
            isInitializing: false,
            initProgress: null,
            isOllamaReady: false,
          });
          throw error;
        }
      },

      reset: () => {
        set({
          sessions: [],
          currentSessionId: null,
          isGenerating: false,
          isInitializing: false,
          initProgress: null,
          currentMessage: '',
          isOllamaReady: false,
        });
      },
    }),
    {
      name: 'chat-store',
      partialize: (state) => ({
        // Strip sources from messages to save storage space
        // Sources contain large text chunks (12 sources × 1KB each) that cause QuotaExceededError
        sessions: state.sessions.map(session => ({
          ...session,
          messages: session.messages.map(msg => ({
            ...msg,
            sources: undefined, // Don't persist sources - they're only needed in current session
          })),
        })),
        currentSessionId: state.currentSessionId,
      }),
    }
  )
);

// Selectors
export const useCurrentSession = () => {
  return useChatStore((state) => {
    if (!state.currentSessionId) return null;
    return state.sessions.find((s) => s.id === state.currentSessionId);
  });
};

export const useIsGenerating = () => {
  return useChatStore((state) => state.isGenerating);
};