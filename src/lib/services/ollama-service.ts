/**
 * Ollama Service
 * Handles all communication with local Ollama instance via Tauri HTTP
 * Desktop-only app - no browser fallback needed
 */

import * as TauriOllama from '@/lib/tauri/ollama-client';

// Model configurations
export const CHAT_MODELS = {
  LIGHT: {
    name: 'gemma3:1b-it-qat',
    displayName: 'Light (Gemma 3 1B QAT)',
    size: '~530MB',
    description: 'Fast responses, works on 4GB+ RAM',
    params: '1B',
  },
  MEDIUM: {
    name: 'gemma3:4b-it-q4_K_M',
    displayName: 'Medium (Gemma 3 4B Q4)',
    size: '~2.4GB',
    description: 'Balanced performance, needs 8GB+ RAM',
    params: '4B',
  },
  LARGE: {
    name: 'qwen3-vl:8b-instruct-q4_K_M',
    displayName: 'Large (Qwen 3 VL 8B Q4)',
    size: '~5.2GB',
    description: 'Best quality, optimized for long context RAG, needs 8GB+ RAM',
    params: '8B',
  },
} as const;

export const EMBEDDING_MODEL = 'nomic-embed-text';



export interface OllamaStatus {

  isRunning: boolean;

  models: string[];

  error?: string;

}



export interface ChatOptions {

  model: string; // Add model property

  temperature?: number;

  maxTokens?: number;

  topP?: number;

  onToken?: (token: string) => void;

  onMetrics?: (metrics: ChatMetrics) => void;

  signal?: AbortSignal; // For cancelling requests

}



export interface ChatMetrics {

  totalTokens: number;

  tokensPerSecond: number;

  totalDuration: number;

  evalDuration: number;

}



export interface PullProgress {

  status: string;

  digest?: string;

  total?: number;

  completed?: number;

  percent?: number;

}



export interface Message {

  role: 'system' | 'user' | 'assistant';

  content: string;

}



class OllamaService {

  private host = 'http://localhost:11434';

  public readonly CHAT_MODELS = CHAT_MODELS;

  public readonly EMBEDDING_MODEL = EMBEDDING_MODEL;



  /**

   * Check if Ollama is running and get available models

   */

  async checkStatus(): Promise<OllamaStatus> {
    try {
      const data = await TauriOllama.checkOllamaStatus();
      const models = data.models?.map((m: any) => m.name) || [];
      return {
        isRunning: true,
        models,
      };
    } catch (error: any) {
      return {
        isRunning: false,
        models: [],
        error: error.message || 'Cannot connect to Ollama',
      };
    }
  }



  /**

   * Pull a model with progress tracking

   */

  async pullModel(
    modelName: string,
    onProgress?: (progress: PullProgress) => void
  ): Promise<void> {
    console.log(`Starting to pull model: ${modelName}`);

    try {
      await TauriOllama.ollamaPullModelStream(modelName, onProgress);
      console.log(`Successfully pulled model: ${modelName}`);
    } catch (error: any) {
      console.error(`Failed to pull model ${modelName}:`, error);
      throw new Error(`Failed to pull model: ${error.message}`);
    }
  }




  /**

   * Chat with streaming response

   */

  async *chat(
    messages: Message[],
    options: ChatOptions
  ): AsyncGenerator<string> {
    const { model, temperature = 0.2, maxTokens = 2048, topP = 0.7, signal } = options;

    console.log('🤖 Ollama Chat Request:', {
      model,
      messageCount: messages.length,
      systemPrompt: messages[0]?.content.substring(0, 150),
      userPrompt: messages[messages.length - 1]?.content.substring(0, 200),
      temperature,
      maxTokens,
      topP,
    });

    try {
      yield* TauriOllama.ollamaChatStream(model, messages, {
        temperature,
        maxTokens,
        topP,
        signal, // Pass abort signal
      });
    } catch (error: any) {
      // Re-throw MODEL_LOADING error as-is so chat-store can handle retry
      if (error.message === 'MODEL_LOADING') {
        throw error;
      }
      throw new Error(`Chat failed: ${error.message}`);
    }
  }




  /**
   * Chat without streaming (for simple responses)
   */
  async chatSync(
    messages: Message[],
    options: ChatOptions
  ): Promise<string> {
    const { model, temperature = 0.2, maxTokens = 2048, topP = 0.7 } = options;

    try {
      return await TauriOllama.ollamaChat(model, messages, {
        temperature,
        maxTokens,
        topP,
      });
    } catch (error: any) {
      throw new Error(`Chat failed: ${error.message}`);
    }
  }



  /**

   * Generate embeddings for text

   */

  async generateEmbedding(text: string): Promise<number[]> {
    try {
      return await TauriOllama.ollamaGenerateEmbedding(this.EMBEDDING_MODEL, text);
    } catch (error: any) {
      throw new Error(`Embedding generation failed: ${error.message}`);
    }
  }



  /**

   * Generate embeddings for multiple texts (batch)

   */

  async generateEmbeddings(

    texts: string[],

    onProgress?: (index: number, total: number) => void

  ): Promise<number[][]> {

    const embeddings: number[][] = [];



    for (let i = 0; i < texts.length; i++) {

      onProgress?.(i + 1, texts.length);

      const text = texts[i];

      if (text) {

        const embedding = await this.generateEmbedding(text);

        embeddings.push(embedding);

      }

    }



    return embeddings;

  }



    /**



     * Ensure required models are available



     */



    async ensureModels(



      modelName: string, // Expect a specific model name to ensure



      onProgress?: (model: string, progress: PullProgress) => void



    ): Promise<void> {



      const status = await this.checkStatus();



  



      if (!status.isRunning) {



        throw new Error('Ollama is not running. Please install and start Ollama.');



      }



  



      // Check if the specific model is available



      if (!status.models.includes(modelName)) {



        console.log(`Pulling model: ${modelName}`);



        await this.pullModel(modelName, (progress) => {



          onProgress?.(modelName, progress);



        });



      }



    }



  

  



  /**

   * Build RAG context from search results

   */

  buildRAGContext(chunks: Array<{ text: string; similarity: number }>): string {

    if (chunks.length === 0) {

      return '';

    }



    const context = chunks

      .map((chunk, i) => `[${i + 1}] ${chunk.text}`)

      .join('\n\n');



    return `Context from document:\n${context}`;

  }



  /**

   * Build prompt for RAG query

   */

  buildRAGPrompt(query: string, context: string, conversationHistory?: Message[]): Message[] {

    // If no context provided, use general chat

    if (!context || context.trim().length === 0) {

      const messages: Message[] = [

        {

          role: 'system',

          content: `You are a helpful AI assistant. Answer the user's questions clearly and concisely.

IMPORTANT:
- RESPOND IN THE SAME LANGUAGE AS THE QUESTION
- Use markdown formatting in ALL responses:
  - Start sections with ## (example: ## Summary, ## Answer)
  - Use **bold** for important terms
  - Use - for bullet points
  - Add blank lines between sections`,

        },
      ];

      // Add conversation history if provided (last 5 messages to keep context manageable)
      if (conversationHistory && conversationHistory.length > 0) {
        const recentHistory = conversationHistory.slice(-5);
        messages.push(...recentHistory);
      }

      // Add current query
      messages.push({
        role: 'user',
        content: query,
      });

      return messages;
    }



    // With context, use RAG prompt

    const messages: Message[] = [

      {

        role: 'system',

        content: `You are a helpful AI assistant that answers questions based on the provided document excerpts.

When answering:
1. RESPOND IN THE SAME LANGUAGE AS THE QUESTION - if the question is in Greek, answer in Greek; if in English, answer in English
2. Provide EXTREMELY DETAILED, COMPREHENSIVE, and COMPLETE answers using ALL relevant information from the document excerpts
3. DO NOT summarize - include EVERY relevant detail, fact, and point from the sources
4. If the excerpts don't fully answer the question, provide what information is available and note what's missing
5. Write AT LEAST 3-5 paragraphs or 10+ bullet points for substantive questions - DO NOT give brief answers
6. Include background, context, explanations, and examples when available in the sources
7. If you need to make reasonable inferences from the context, state that clearly
8. You have access to previous conversation history - use it to understand follow-up questions and provide contextual answers

CRITICAL: Your answers should be LONG and DETAILED. Short answers are NOT acceptable.
- Expand on every point mentioned in the excerpts
- Provide full explanations, not summaries
- Include all related information, even if it seems redundant
- The user wants comprehensive information, not concise summaries

IMPORTANT: Use markdown formatting in ALL responses:
- Start sections with ## (example: ## Summary, ## Key Points, ## Background, ## Detailed Explanation)
- Use **bold** for important terms
- Use - for bullet points
- Add blank lines between sections
- Create multiple sections to organize your comprehensive answer`,

        },
    ];

    // Add conversation history if provided (last 5 exchanges to keep context window manageable)
    if (conversationHistory && conversationHistory.length > 0) {
      const recentHistory = conversationHistory.slice(-10); // Last 10 messages = 5 exchanges
      messages.push(...recentHistory);
    }

    // Add current query with context
    messages.push({

          role: 'user',

          content: `Document excerpts:

${context}



---



Question: ${query}



Please answer based on the excerpts above.`,

        });

    return messages;
  }
}

// Export singleton instance
export const ollamaService = new OllamaService();
