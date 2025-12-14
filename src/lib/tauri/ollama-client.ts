/**
 * Tauri Ollama Client
 * On Windows, WebView2 blocks fetch to localhost - use Tauri HTTP plugin
 * On Linux/Mac, regular fetch works fine
 */

import { error as logError } from '@tauri-apps/plugin-log';

export interface Message {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface OllamaStatus {
  models?: Array<{ name: string }>;
}

export interface PullProgress {
  status: string;
  digest?: string;
  total?: number;
  completed?: number;
  percent?: number;
}

/**
 * Check Ollama status using Tauri
 * On Windows, WebView2 blocks fetch to localhost - use Tauri commands
 */
export async function checkOllamaStatus(): Promise<OllamaStatus> {
  try {
    const isWindows = typeof navigator !== 'undefined' && navigator.userAgent.includes('Windows');

    if (isWindows) {
      // On Windows, WebView2 blocks fetch - use Tauri command
      const { invoke } = await import('@tauri-apps/api/core');

      const status = await invoke<{ running: boolean; models_available: boolean; models: string[] }>('check_ollama_status');

      if (!status.running) {
        throw new Error('Ollama not running');
      }

      // Convert to expected format
      return {
        models: status.models.map(name => ({ name }))
      };
    } else {
      // On Linux/Mac, fetch works fine
      const response = await fetch('http://localhost:11434/api/tags', {
        method: 'GET',
      });

      if (!response.ok) {
        throw new Error('Ollama not responding');
      }

      const data = await response.json();
      return data;
    }
  } catch (error) {
    throw new Error(`Failed to check Ollama status: ${error}`);
  }
}

/**
 * Chat with Ollama (non-streaming)
 * On Windows, WebView2 blocks fetch - use Tauri command
 */
export async function ollamaChat(
  model: string,
  messages: Message[],
  options?: {
    temperature?: number;
    maxTokens?: number;
    topP?: number;
  }
): Promise<string> {
  try {
    const isWindows = typeof navigator !== 'undefined' && navigator.userAgent.includes('Windows');

    if (isWindows) {
      // On Windows, use Tauri command
      const { invoke } = await import('@tauri-apps/api/core');

      const response = await invoke<string>('ollama_chat', {
        model,
        messages,
        temperature: options?.temperature,
        maxTokens: options?.maxTokens,
        topP: options?.topP,
      });

      return response;
    } else {
      // On Linux/Mac, use fetch
      const response = await fetch('http://localhost:11434/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          messages,
          stream: false,
          options: {
            temperature: options?.temperature || 0.2,
            num_predict: options?.maxTokens || 4096,
            top_p: options?.topP || 0.9,
            repeat_penalty: 1.1,
            repeat_last_n: 64,
          },
        }),
      });

      if (!response.ok) {
        throw new Error('Chat request failed');
      }

      const data = await response.json();
      return data.message?.content || '';
    }
  } catch (error) {
    throw new Error(`Chat failed: ${error}`);
  }
}

/**
 * Generate embedding
 * On Windows, WebView2 blocks fetch - use Tauri command
 */
export async function ollamaGenerateEmbedding(
  model: string,
  text: string
): Promise<number[]> {
  try {
    const isWindows = typeof navigator !== 'undefined' && navigator.userAgent.includes('Windows');

    if (isWindows) {
      // On Windows, use Tauri command
      const { invoke } = await import('@tauri-apps/api/core');

      const response = await invoke<number[]>('ollama_embedding', {
        model,
        text,
      });

      return response;
    } else {
      // On Linux/Mac, use fetch
      const response = await fetch('http://localhost:11434/api/embeddings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          prompt: text,
        }),
      });

      if (!response.ok) {
        throw new Error('Embedding request failed');
      }

      const data = await response.json();
      return data.embedding || [];
    }
  } catch (error) {
    throw new Error(`Embedding generation failed: ${error}`);
  }
}

/**
 * Chat with streaming
 * Windows: Uses Tauri invoke command with event streaming
 * Linux/Mac: Uses native fetch
 */
export async function* ollamaChatStream(
  model: string,
  messages: Message[],
  options?: {
    temperature?: number;
    maxTokens?: number;
    topP?: number;
    signal?: AbortSignal;
  }
): AsyncGenerator<string> {
  const isWindows = typeof navigator !== 'undefined' && navigator.userAgent.includes('Windows');

  // Windows: Use Tauri command with event-based streaming
  if (isWindows) {
    const { invoke } = await import('@tauri-apps/api/core');
    const { listen } = await import('@tauri-apps/api/event');

    // Use an async queue pattern to yield chunks as they arrive
    const chunkQueue: string[] = [];
    let isDone = false;
    let streamError: Error | null = null;
    let resolveWaiting: (() => void) | null = null;

    // Set up event listener BEFORE starting the stream
    const unlisten = await listen('ollama_stream_chunk', (event: any) => {
      const { content, done, error } = event.payload;

      if (error) {
        streamError = new Error(error);
        isDone = true;
        if (resolveWaiting) resolveWaiting();
        return;
      }

      if (content) {
        chunkQueue.push(content);
        // Wake up the generator if it's waiting
        if (resolveWaiting) {
          resolveWaiting();
          resolveWaiting = null;
        }
      }

      if (done) {
        isDone = true;
        if (resolveWaiting) resolveWaiting();
      }
    });

    // Start the stream (don't await - it runs in background)
    invoke('ollama_chat_stream', {
      model,
      messages,
      temperature: options?.temperature,
      maxTokens: options?.maxTokens,
      topP: options?.topP,
    }).catch(error => {
      streamError = error instanceof Error ? error : new Error(String(error));
      isDone = true;
      if (resolveWaiting) resolveWaiting();
    });

    try {
      // Yield chunks as they arrive
      while (true) {
        // If there are chunks in the queue, yield them
        while (chunkQueue.length > 0) {
          yield chunkQueue.shift()!;
        }

        // Check for errors
        if (streamError) {
          throw streamError;
        }

        // If done and queue is empty, we're finished
        if (isDone && chunkQueue.length === 0) {
          break;
        }

        // Wait for more chunks
        await new Promise<void>(resolve => {
          resolveWaiting = resolve;
        });
      }
    } finally {
      unlisten();
    }
    return;
  }

  // Linux/Mac: Use native fetch
  const isGemma2 = model.includes('gemma2');
  const requestBody = {
    model,
    messages,
    stream: true,
    keep_alive: '10m',
    options: {
      temperature: options?.temperature || 0.2,
      num_predict: options?.maxTokens || 4096,
      num_ctx: 16384,
      top_p: options?.topP || 0.9,
      repeat_penalty: isGemma2 ? undefined : 1.1,
      repeat_last_n: 64,
    },
  };

  try {
    const response = await fetch('http://localhost:11434/api/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
      signal: options?.signal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      await logError(`[Ollama Client Stream] HTTP error: ${response.status} - ${errorText}`);
      throw new Error(`Chat request failed: ${response.status} - ${errorText.substring(0, 200)}`);
    }

    const reader = response.body?.getReader();
    const decoder = new TextDecoder();

    if (!reader) {
      await logError('[Ollama Client Stream] No response body received');
      throw new Error('No response body');
    }

    let buffer = '';
    let chunkCount = 0;
    let hasYieldedContent = false;

    try {
      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          if (buffer.length > 0) {
            // Try to process any remaining data in the buffer
            try {
              const data = JSON.parse(buffer);
              if (data.message?.content) {
                yield data.message.content;
              }
            } catch (e) {
              // Ignore parse errors for final buffer
            }
          }
          if (!hasYieldedContent && chunkCount > 0) {
            throw new Error('MODEL_LOADING');
          }
          break;
        }

        // Append new data to buffer. The `stream: true` option is crucial
        // to prevent TextDecoder from throwing errors on multi-byte characters
        // that are split across chunks.
        buffer += decoder.decode(value, { stream: true });

        // Process all complete JSON objects in the buffer
        let newlineIndex;
        while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
          const line = buffer.slice(0, newlineIndex);
          buffer = buffer.slice(newlineIndex + 1);

          if (line.trim() === '') continue;

          try {
            const data = JSON.parse(line);
            chunkCount++;

            if (data.done === true && data.done_reason === 'load') {
              throw new Error('MODEL_LOADING');
            }

            if (data.error) {
              await logError(`[Ollama Client Stream] Ollama error: ${data.error}`);
              throw new Error(`Ollama error: ${data.error}`);
            }

            if (data.message?.content) {
              hasYieldedContent = true;
              yield data.message.content;
            }
          } catch (e) {
            if (e instanceof Error && e.message === 'MODEL_LOADING') {
              throw e;
            }
            // Ignore JSON parse errors silently
          }
        }
      }
    } catch (error) {
      if (error instanceof Error && error.message !== 'MODEL_LOADING') {
        await logError(`[Ollama Client Stream] Stream error: ${error.message}`);
      }
      throw error;
    } finally {
      // Ensure the final part of the stream is decoded
      const finalChunk = decoder.decode();
      if (finalChunk) {
        buffer += finalChunk;
        // Process any complete JSON object that might have been left
        const lines = buffer.split('\n').filter(line => line.trim());
        for (const line of lines) {
          try {
            const data = JSON.parse(line);
            if (data.message?.content) {
              yield data.message.content;
            }
          } catch (e) {
            // Ignore parse errors
          }
        }
      }
      reader.releaseLock();
    }
  } catch (error: any) {
    if (error.message !== 'MODEL_LOADING') {
      await logError(`[Ollama Client Stream] FATAL ERROR: ${error.message || String(error)}`);
    }
    throw error;
  }
}

/**
 * Pull model with progress using streaming
 * On Windows: Uses Tauri command with event streaming (WebView2 blocks fetch streaming)
 * On Linux/Mac: Uses native fetch streaming
 */
export async function ollamaPullModelStream(
  modelName: string,
  onProgress?: (progress: PullProgress) => void
): Promise<void> {
  const isWindows = typeof navigator !== 'undefined' && navigator.userAgent.includes('Windows');

  if (isWindows) {
    // On Windows, use Tauri command which emits progress events
    const { invoke } = await import('@tauri-apps/api/core');
    const { listen } = await import('@tauri-apps/api/event');

    // Set up listener for progress events from Rust
    const unlisten = await listen('model_download_progress', (event: any) => {
      const data = event.payload;

      const progress: PullProgress = {
        status: data.status || 'downloading',
        digest: data.digest,
        total: data.total,
        completed: data.completed,
        percent: data.percent !== undefined ? Math.round(data.percent) : 0,
      };

      onProgress?.(progress);
    });

    try {
      // Call Tauri command which streams progress via events
      await invoke('download_ollama_model', { modelName });
    } finally {
      // Clean up listener
      unlisten();
    }
    return;
  }

  // Linux/Mac: Use native fetch streaming
  const response = await fetch('http://localhost:11434/api/pull', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: modelName,
      stream: true,
    }),
  });

  if (!response.ok) {
    await logError(`[Ollama Client Pull] Failed to pull model: HTTP ${response.status}`);
    throw new Error(`Failed to pull model: ${response.status}`);
  }

  const reader = response.body?.getReader();
  const decoder = new TextDecoder();

  if (!reader) {
    await logError('[Ollama Client Pull] No response body');
    throw new Error('No response body');
  }

  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    // Append to buffer and process complete lines
    buffer += decoder.decode(value, { stream: true });

    // Process complete JSON lines (newline-delimited JSON)
    let newlineIndex;
    while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, newlineIndex);
      buffer = buffer.slice(newlineIndex + 1);

      if (!line.trim()) continue;

      try {
        const data = JSON.parse(line);

        // Calculate progress percentage
        let percent = 0;
        if (data.total && data.total > 0) {
          percent = Math.round(((data.completed || 0) / data.total) * 100);
        }

        const progress: PullProgress = {
          status: data.status || 'downloading',
          digest: data.digest,
          total: data.total,
          completed: data.completed,
          percent,
        };

        onProgress?.(progress);
      } catch (e) {
        // Ignore JSON parse errors for incomplete chunks
      }
    }
  }

  // Process any remaining data in buffer
  if (buffer.trim()) {
    try {
      const data = JSON.parse(buffer);
      const percent = data.total && data.total > 0
        ? Math.round(((data.completed || 0) / data.total) * 100)
        : 0;

      onProgress?.({
        status: data.status || 'completed',
        digest: data.digest,
        total: data.total,
        completed: data.completed,
        percent,
      });
    } catch (e) {
      // Ignore final buffer parse errors
    }
  }
}
