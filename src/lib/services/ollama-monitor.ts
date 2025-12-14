/**
 * Ollama Connection Monitor
 * Monitors connection status and handles reconnection
 */

export type ConnectionStatus = 'connected' | 'disconnected' | 'connecting' | 'error';

export interface MonitorState {
  status: ConnectionStatus;
  lastChecked: Date | null;
  error?: string;
  isModelReady: boolean;
  modelsAvailable: string[];
  isDownloading?: boolean;
  downloadProgress?: number;
  downloadModel?: string;
}

type StatusListener = (state: MonitorState) => void;

class OllamaMonitor {
  private intervalId: NodeJS.Timeout | null = null;
  private listeners: Set<StatusListener> = new Set();
  private currentState: MonitorState = {
    status: 'disconnected',
    lastChecked: null,
    isModelReady: false,
    modelsAvailable: [],
  };
  private hasEverConnected = false;  // Track if we ever successfully connected
  private checkInterval = 5000; // Check every 5 seconds
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 3;
  private consecutiveFailures = 0; // Track consecutive failures before marking as disconnected
  private maxConsecutiveFailures = 2; // Allow 2 failures (6 seconds) before marking disconnected
  private isGenerating = false; // Pause monitoring during active generation

  /**
   * Start monitoring Ollama connection
   */
  start(): void {
    if (this.intervalId) return; // Already monitoring

    // Initial check
    this.checkConnection();

    // Set up periodic checking
    this.intervalId = setInterval(() => {
      this.checkConnection();
    }, this.checkInterval);
  }

  /**
   * Stop monitoring
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  /**
   * Subscribe to status changes
   */
  subscribe(listener: StatusListener): () => void {
    this.listeners.add(listener);
    // Immediately notify of current state
    listener(this.currentState);

    // Return unsubscribe function
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Get current state
   */
  getState(): MonitorState {
    return { ...this.currentState };
  }

  /**
   * Pause monitoring during active generation
   */
  setGenerating(generating: boolean): void {
    this.isGenerating = generating;
  }

  /**
   * Check Ollama connection and models
   */
  private async checkConnection(): Promise<void> {
    // Skip check if currently generating to avoid false disconnections
    if (this.isGenerating) {
      return;
    }

    const previousStatus = this.currentState.status;

    try {
      // Only show "connecting" status on first check
      if (previousStatus === 'disconnected') {
        this.updateState({ status: 'connecting' });
      }

      // Check if Ollama is running
      const isWindows = typeof navigator !== 'undefined' && navigator.userAgent.includes('Windows');

      let models: string[] = [];

      if (isWindows) {
        // On Windows, WebView2 blocks fetch to localhost - use Tauri command instead
        const { invoke } = await import('@tauri-apps/api/core');

        try {
          const isRunning = await invoke<boolean>('ping_ollama');

          if (!isRunning) {
            throw new Error('Ollama is not running');
          }

          // Get model list using check_ollama_status
          const status = await invoke<{ running: boolean; models_available: boolean; models: string[] }>('check_ollama_status');

          if (!status.running) {
            throw new Error('Ollama is not running');
          }

          // Use the actual model list from Rust
          models = status.models || [];

        } catch (error: any) {
          throw new Error('Ollama is not running');
        }

      } else {
        // On Linux/Mac, fetch works fine
        const baseUrl = 'http://localhost:11434';

        // First check if server is up using fast /api/version endpoint
        const versionResponse = await fetch(`${baseUrl}/api/version`, {
          method: 'GET',
          signal: AbortSignal.timeout(10000),
        }).catch(() => null);

        if (!versionResponse || !versionResponse.ok) {
          throw new Error('Ollama is not running');
        }

        // Server is up, now check for models
        const tagsResponse = await fetch(`${baseUrl}/api/tags`, {
          method: 'GET',
          signal: AbortSignal.timeout(10000),
        }).catch(() => null);

        if (!tagsResponse || !tagsResponse.ok) {
          throw new Error('Ollama is not ready');
        }

        const data = await tagsResponse.json();
        models = data.models?.map((m: any) => m.name) || [];
      }

      // Check if required models are available
      // We need at least one chat model (light, medium, or large) and the embedding model
      const chatModels = ['gemma3:1b-it-qat', 'gemma3:4b-it-q4_K_M', 'qwen3-vl:8b-instruct-q4_K_M'];
      const embeddingModel = 'nomic-embed-text';

      // Match models with or without :latest suffix
      const hasChatModel = chatModels.some(chatModel =>
        models.some((m: string) => m === chatModel || m === `${chatModel}:latest`)
      );
      const hasEmbedding = models.some((m: string) =>
        m === embeddingModel || m === `${embeddingModel}:latest` || m.startsWith(`${embeddingModel}:`)
      );
      const hasRequiredModels = hasChatModel && hasEmbedding;

      this.updateState({
        status: 'connected',
        lastChecked: new Date(),
        modelsAvailable: models,
        isModelReady: hasRequiredModels,
        error: undefined,
      });

      // Mark that we've successfully connected at least once
      this.hasEverConnected = true;

      // Reset reconnect attempts and consecutive failures on successful connection
      this.reconnectAttempts = 0;
      this.consecutiveFailures = 0;

      // Only log on status change to reduce console noise
      if (previousStatus !== 'connected') {
        console.log('✓ Ollama connected successfully');
      }
    } catch (error: any) {
      // Increment consecutive failures
      this.consecutiveFailures++;

      // Only mark as disconnected after multiple consecutive failures
      // This prevents false disconnections during heavy GPU usage
      if (this.consecutiveFailures >= this.maxConsecutiveFailures) {
        this.updateState({
          status: 'disconnected',
          lastChecked: new Date(),
          error: 'Ollama is not running',
          isModelReady: false,
          modelsAvailable: [],
        });

        // Reset reconnect attempts
        this.reconnectAttempts = 0;

        // Only log on first disconnection
        if (previousStatus === 'connected') {
          console.log(`✗ Ollama disconnected after ${this.consecutiveFailures} failed checks`);
        }
      }
      // Removed "will retry" log message to reduce log spam
    }
  }

  /**
   * Update state and notify listeners
   */
  private updateState(partialState: Partial<MonitorState>): void {
    this.currentState = { ...this.currentState, ...partialState };
    this.notifyListeners();
  }

  /**
   * Notify all listeners of state change
   */
  private notifyListeners(): void {
    this.listeners.forEach(listener => {
      listener(this.currentState);
    });
  }

  /**
   * Force a connection check
   */
  async checkNow(): Promise<MonitorState> {
    await this.checkConnection();
    return this.getState();
  }

  /**
   * Check if Ollama is ready for use
   */
  isReady(): boolean {
    return this.currentState.status === 'connected' && this.currentState.isModelReady;
  }

  /**
   * Get connection status message for UI
   */
  getStatusMessage(): string {
    const { status, error, isModelReady, isDownloading, downloadProgress, downloadModel } = this.currentState;

    switch (status) {
      case 'connected':
        if (isDownloading && downloadProgress !== undefined) {
          return `Downloading ${downloadModel || 'model'}: ${downloadProgress}%`;
        }
        if (!isModelReady) {
          return 'Ollama connected';
        }
        return 'Ollama ready';
      case 'connecting':
        return 'Connecting to Ollama...';
      case 'error':
        return error || 'Connection error';
      case 'disconnected':
        return 'Ollama not running';
      default:
        return 'Unknown status';
    }
  }

  /**
   * Get status color for UI indicators
   */
  getStatusColor(): 'green' | 'yellow' | 'red' | 'gray' {
    const { status, isModelReady } = this.currentState;

    switch (status) {
      case 'connected':
        return isModelReady ? 'green' : 'yellow';
      case 'connecting':
        return 'yellow';
      case 'error':
        return 'red';
      case 'disconnected':
        return 'gray';
      default:
        return 'gray';
    }
  }

  /**
   * Update download progress
   */
  updateDownloadProgress(model: string, progress: number | undefined, isDownloading: boolean): void {
    this.updateState({
      isDownloading,
      downloadProgress: progress,
      downloadModel: model,
    });
  }

  /**
   * Check if Ollama is likely installed (we've connected before or currently connected)
   */
  isLikelyInstalled(): boolean {
    return this.hasEverConnected || this.currentState.status === 'connected';
  }
}

// Export singleton instance
export const ollamaMonitor = new OllamaMonitor();