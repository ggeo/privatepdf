'use client';

import { useEffect, useRef, useState } from 'react';
import { useChatStore, useCurrentSession, useIsGenerating } from '@/stores/chat-store';
import { useDocumentStore } from '@/stores/document-store';
import { ChatMessageComponent } from './chat-message';
import { ChatInput } from './chat-input';
import { OllamaSetupModal } from '@/components/ollama/ollama-setup-modal';
import { ModelSelectorModal } from '@/components/ollama/model-selector-modal';
import { Button } from '@/components/ui/button';
import { MessageSquare, AlertCircle, Power, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ollamaMonitor } from '@/lib/services/ollama-monitor';
import { usePdfPreview } from '@/contexts/pdf-preview-context';
import { useSidebar } from '@/components/ui/sidebar';
import { deriveHighlightRange } from '@/lib/utils/highlight';

interface ChatInterfaceProps {
  className?: string;
}

export function ChatInterface({ className }: ChatInterfaceProps) {
  // Get selected documents from document store
  const { selectedDocumentIds, documents } = useDocumentStore();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const lastHighlightedMessageIdRef = useRef<string | null>(null);
  const [showSetupModal, setShowSetupModal] = useState(false);
  const [showModelSelector, setShowModelSelector] = useState(false);
  const [isOllamaRunning, setIsOllamaRunning] = useState(false);
  const [isOllamaReady, setIsOllamaReady] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState<number | undefined>();
  const [downloadModel, setDownloadModel] = useState<string | undefined>();
  const [isStarting, setIsStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);

  const currentSession = useCurrentSession();
  const isGenerating = useIsGenerating();
  const { jumpToPage } = usePdfPreview();
  const { setOpen, setOpenMobile, isMobile } = useSidebar();

  const {
    sendMessage,
    stopGeneration,
    initializeOllama,
    isInitializing,
    initProgress,
  } = useChatStore();

  // Check Ollama status on mount
  useEffect(() => {
    let unsubscribe: (() => void) | null = null;

    const checkOllamaStatus = async () => {
      // Start monitoring
      ollamaMonitor.start();

      // Subscribe to status changes
      unsubscribe = ollamaMonitor.subscribe(async (state) => {
        console.log('[Chat Interface] Monitor state update:', {
          status: state.status,
          isModelReady: state.isModelReady,
          modelsAvailable: state.modelsAvailable,
          isDownloading: state.isDownloading,
        });

        const running = state.status === 'connected';
        const ready = running && state.isModelReady;

        console.log('[Chat Interface] Derived state:', {
          running,
          ready,
          isModelReady: state.isModelReady,
        });

        setIsOllamaRunning(running);
        setIsOllamaReady(ready);
        setIsDownloading(state.isDownloading || false);
        setDownloadProgress(state.downloadProgress);
        setDownloadModel(state.downloadModel);

        // Simple logic:
        // 1. If connected and ready - hide all modals
        // 2. NEVER auto-show model selector - user downloads models via Settings
        // 3. If not connected - DON'T auto-show modal, let user click button

        if (ready) {
          // Everything works - hide all modals
          setShowSetupModal(false);
          setShowModelSelector(false);
        }
        // NEVER auto-show any modals - user must manually trigger them
      });

    };

    checkOllamaStatus();

    return () => {
      unsubscribe?.();
    };
  }, [initializeOllama]);

  // Get selected document names for display
  const selectedDocs = documents.filter((d) => selectedDocumentIds.includes(d.id));
  const selectedDocNames =
    selectedDocs.length === 0
      ? ''
      : selectedDocs.length === 1
      ? selectedDocs[0]?.fileName || 'Unknown'
      : `${selectedDocs.length} documents`;

  // Auto-scroll to bottom when new messages arrive - with debouncing
  useEffect(() => {
    const scrollContainer = messagesEndRef.current?.parentElement?.parentElement;
    if (!scrollContainer || !messagesEndRef.current) return;

    // Check if user is near bottom (within 150px)
    const isNearBottom = scrollContainer.scrollHeight - scrollContainer.scrollTop - scrollContainer.clientHeight < 150;

    if (isNearBottom) {
      // Directly set scrollTop instead of using scrollIntoView to prevent animation jitter
      const timeoutId = setTimeout(() => {
        if (scrollContainer) {
          scrollContainer.scrollTop = scrollContainer.scrollHeight;
        }
      }, 10);

      return () => clearTimeout(timeoutId);
    }

    return undefined;
  }, [currentSession?.messages]);

  // Auto-focus the PDF preview on the top source once an answer finishes streaming.
  useEffect(() => {
    if (!currentSession) {
      return;
    }

    const lastAssistantMessage = [...currentSession.messages]
      .reverse()
      .find((message) => message.role === 'assistant' && message.sources && message.sources.length > 0);

    if (!lastAssistantMessage || lastAssistantMessage.isStreaming) {
      return;
    }

    if (lastHighlightedMessageIdRef.current === lastAssistantMessage.id) {
      return;
    }

    const topSource = lastAssistantMessage.sources?.[0];
    if (!topSource || !topSource.pageNumber || !topSource.chunk.documentId) {
      return;
    }

    const highlightRange = deriveHighlightRange(topSource.snippet ?? '');
    const highlight =
      highlightRange.text?.trim() ||
      topSource.highlights?.[0]?.trim() ||
      topSource.snippet;

    setOpen(true);
    if (isMobile) {
      setOpenMobile(true);
    }

    jumpToPage(topSource.chunk.documentId, topSource.pageNumber, highlight);
    lastHighlightedMessageIdRef.current = lastAssistantMessage.id;
  }, [currentSession?.messages, isMobile, jumpToPage, setOpen, setOpenMobile]);


  const handleSend = async (message: string) => {
    if (!isOllamaReady) {
      setShowSetupModal(true);
      return;
    }

    // CRITICAL FIX: Wait for BOTH localStorage hydration AND IndexedDB document loading
    // This prevents the race condition where selectedDocumentIds exists in localStorage
    // but documents haven't been loaded yet from IndexedDB, causing the selection to be invalid
    console.log('⏳ Waiting for document store to be fully ready...');
    const startTime = Date.now();
    const timeout = 2000; // 2 seconds timeout

    while (Date.now() - startTime < timeout) {
      const state = useDocumentStore.getState();

      // Check BOTH conditions - this is the key fix!
      if (state._hasHydrated && state._hasLoadedDocuments) {
        console.log('✅ Document store fully ready:', {
          hasHydrated: state._hasHydrated,
          hasLoadedDocuments: state._hasLoadedDocuments,
          selectedDocumentIds: state.selectedDocumentIds.length,
          totalDocuments: state.documents.length,
        });
        break;
      }

      // Log current state while waiting
      if (Date.now() - startTime > 200) { // Only log after 200ms to avoid spam
        console.log('⏳ Still waiting...', {
          hasHydrated: state._hasHydrated,
          hasLoadedDocuments: state._hasLoadedDocuments,
          elapsed: Date.now() - startTime,
        });
      }

      // Wait 50ms before checking again
      await new Promise(resolve => setTimeout(resolve, 50));
    }

    // Final check - log a warning if timed out
    const finalState = useDocumentStore.getState();
    if (!finalState._hasHydrated || !finalState._hasLoadedDocuments) {
      console.warn('⚠️ Document store not fully ready after 2s timeout:', {
        hasHydrated: finalState._hasHydrated,
        hasLoadedDocuments: finalState._hasLoadedDocuments,
        selectedDocumentIds: finalState.selectedDocumentIds.length,
        documents: finalState.documents.length,
      });
    }

    // Now it's safe to read selectedDocumentIds - both hydration and loading are complete
    const currentSelectedIds = useDocumentStore.getState().selectedDocumentIds;
    const documentIds = currentSelectedIds.length > 0 ? currentSelectedIds.join(',') : undefined;

    console.log('📤 Sending message with document context:', {
      documentIds,
      selectedCount: currentSelectedIds.length,
      documentsLoaded: finalState.documents.length,
      message: message.substring(0, 100),
    });

    await sendMessage(message, documentIds);
  };

  const handleModelSelected = async (modelName: string) => {
    console.log('Model selected:', modelName);
    setShowModelSelector(false);
    // Wait a moment for model to finish loading, then re-check status
    setTimeout(async () => {
      await ollamaMonitor.checkNow();
    }, 1000);
  };

  const handleStartOllama = async () => {
    setIsStarting(true);
    setStartError(null);
    try {
      const { startOllamaService } = await import('@/lib/tauri/commands');
      await startOllamaService();

      // Windows needs 6-12 seconds for Ollama to bind port 11434
      // Wait longer, then retry aggressively until ready (up to 30 seconds)
      await new Promise(resolve => setTimeout(resolve, 8000));

      // First check
      ollamaMonitor.checkNow();

      // Retry every 2 seconds for up to 30 seconds
      const retryInterval = setInterval(() => {
        ollamaMonitor.checkNow();
      }, 2000);

      // Clear retry after 30 seconds
      setTimeout(() => clearInterval(retryInterval), 30000);

    } catch (error: any) {
      console.error('Failed to start Ollama:', error);
      const message = error?.message || String(error) || 'Failed to start Ollama. Please make sure it is installed and running.';
      setStartError(message);
      // Always show setup / install instructions when start fails
      setShowSetupModal(true);
    } finally {
      setIsStarting(false);
    }
  };

  return (
    <div className={cn('flex flex-col h-full', className)}>
      {/* Model Initialization Progress */}
      {isInitializing && initProgress && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-background/80 backdrop-blur-sm">
          <div className="bg-card border rounded-lg p-6 max-w-sm w-full">
            <div className="space-y-4">
              <h3 className="font-semibold">Initializing AI Models</h3>
              <p className="text-sm text-muted-foreground">{initProgress}</p>
              <div className="w-full bg-secondary rounded-full h-2">
                <div className="bg-primary h-2 rounded-full animate-pulse" style={{ width: '50%' }} />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto">
        {isDownloading ? (
          <div className="flex flex-col items-center justify-center h-full text-center p-8">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mb-4" />
            <h3 className="text-lg font-medium mb-2">Downloading AI Models</h3>
            <p className="text-sm text-muted-foreground max-w-md mb-4">
              {downloadModel ? `Downloading ${downloadModel}` : 'Preparing models...'}
            </p>
            {downloadProgress !== undefined && (
              <div className="w-full max-w-xs">
                <div className="flex justify-between text-sm text-muted-foreground mb-2">
                  <span>Progress</span>
                  <span>{downloadProgress}%</span>
                </div>
                <div className="w-full bg-secondary rounded-full h-2">
                  <div
                    className="bg-primary h-2 rounded-full transition-all duration-300"
                    style={{ width: `${downloadProgress}%` }}
                  />
                </div>
              </div>
            )}
            <p className="text-xs text-muted-foreground mt-4">
              This may take a few minutes on first run
            </p>
          </div>
        ) : !isOllamaRunning ? (
          <div className="flex flex-col items-center justify-center h-full text-center p-8">
            <AlertCircle className="h-12 w-12 text-orange-500 mb-4" />
            <h3 className="text-lg font-medium mb-2">Ollama Not Running</h3>
            <p className="text-sm text-muted-foreground max-w-md mb-4">
              Click the button below to start Ollama service
            </p>
            <Button
              onClick={handleStartOllama}
              disabled={isStarting}
              variant="default"
              size="lg"
            >
              {isStarting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Starting Ollama...
                </>
              ) : (
                <>
                  <Power className="h-4 w-4 mr-2" />
                  Start Ollama
                </>
              )}
            </Button>
            {startError && (
              <div className="mt-4 space-y-3">
                <p className="text-sm text-red-500">{startError}</p>
                <Button variant="outline" onClick={() => setShowSetupModal(true)}>
                  Setup Ollama (Install Instructions)
                </Button>
              </div>
            )}
          </div>
        ) : !currentSession || currentSession.messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center p-8">
            <MessageSquare className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">No messages yet</h3>
            <p className="text-sm text-muted-foreground max-w-md">
              {selectedDocumentIds.length > 0
                ? `Ask questions about ${selectedDocNames} to get started`
                : 'Select documents from the sidebar and start chatting'}
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-4 p-4">
            {currentSession.messages.map((message) => (
              <ChatMessageComponent
                key={message.id}
                message={message}
                isStreaming={message.isStreaming}
              />
            ))}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input */}
      <div className="border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 p-4">
        <ChatInput
          onSend={handleSend}
          onStop={stopGeneration}
          isGenerating={isGenerating}
          disabled={!isOllamaReady}
          placeholder={
            !isOllamaRunning
              ? 'Please install Ollama first...'
              : !isOllamaReady
              ? 'Please download AI models from Settings first...'
              : selectedDocumentIds.length > 0
              ? `Ask a question about ${selectedDocNames}...`
              : 'Select documents from sidebar to get started...'
          }
        />
        {!isOllamaRunning && (
          <p className="text-xs text-muted-foreground mt-2">
            Tip: Click "Start Ollama" above to enable AI features
          </p>
        )}
        {isOllamaRunning && !isOllamaReady && (
          <p className="text-xs text-orange-500 mt-2">
            Tip: Click "Light" button above to download AI models, then you can chat
          </p>
        )}
      </div>

      {/* Ollama Setup Modal (when Ollama is not running) */}
      <OllamaSetupModal
        isOpen={showSetupModal}
        onClose={() => {
          setShowSetupModal(false);
          // Re-check status after setup
          ollamaMonitor.checkNow();
        }}
      />

      {/* Model Selector Modal (when Ollama is running but no models) */}
      <ModelSelectorModal
        isOpen={showModelSelector}
        onClose={() => setShowModelSelector(false)}
        onModelSelected={handleModelSelected}
      />
    </div>
  );
}
