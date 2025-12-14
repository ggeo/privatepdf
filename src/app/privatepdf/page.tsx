'use client';

import { useEffect } from 'react';
import { ChatInterface } from '@/components/chat/chat-interface';
import { StatusIndicator } from '@/components/ollama/status-indicator';
import { ModelSelector } from '@/components/ollama/model-selector';
import { AppSidebar } from '@/components/app-sidebar';
import { UploadDialog } from '@/components/documents/upload-dialog';
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';
import { Download, MessageSquare, FileText, Plus } from 'lucide-react';
import { useChatStore, useCurrentSession } from '@/stores/chat-store';
import { useDocumentStore } from '@/stores/document-store';
import { useOllamaStore } from '@/stores/ollama-store';
import { ModeToggle } from '@/components/mode-toggle';
import { AppProvider, useApp } from '@/contexts/app-context';
import { PdfPreviewProvider, usePdfPreview } from '@/contexts/pdf-preview-context';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { truncateFilename } from '@/lib/utils';

function DemoPageContent() {
  const { initialize } = useOllamaStore();
  const { selectedDocumentId, setSelectedDocument } = usePdfPreview();
  const { uploadDialogOpen, setUploadDialogOpen } = useApp();
  const currentSession = useCurrentSession();
  const { clearCurrentSession, createSession } = useChatStore();
  const { selectedDocumentIds, documents } = useDocumentStore();

  // Initialize ollama store on mount
  useEffect(() => {
    initialize();
  }, [initialize]);

  // Listen for file-opened event (when user opens PDF/DOC with app)
  useEffect(() => {
    const setupFileListener = async () => {
      try {
        const { listen } = await import('@tauri-apps/api/event');
        const unlisten = await listen<string>('file-opened', (event) => {
          console.log('File opened from system:', event.payload);
          // Auto-upload the file
          // TODO: Trigger upload with the file path
          setUploadDialogOpen(true);
        });
        return () => {
          unlisten();
        };
      } catch (e) {
        // Not in Tauri environment
        return undefined;
      }
    };

    setupFileListener();
  }, [setUploadDialogOpen]);

  // Clear current session on mount (start fresh each time app opens)
  useEffect(() => {
    clearCurrentSession();
  }, [clearCurrentSession]);

  // Auto-select first document for PDF preview when documents are selected
  // BUT don't override if a document was just uploaded (onUploadComplete sets it directly)
  useEffect(() => {
    if (selectedDocumentIds.length > 0) {
      // If current selection is valid and in the list, keep it
      if (selectedDocumentId && selectedDocumentIds.includes(selectedDocumentId)) {
        return; // Keep current selection
      }
      // Otherwise select the first one
      setSelectedDocument(selectedDocumentIds[0]!);
    } else {
      // Clear PDF preview when no documents are selected
      setSelectedDocument(null);
    }
  }, [selectedDocumentIds, selectedDocumentId, setSelectedDocument]);

  // Get selected document names for display
  const selectedDocs = documents.filter((d) => selectedDocumentIds.includes(d.id));
  const handleNewChat = () => {
    clearCurrentSession();
    createSession();
  };

  const handleClear = async () => {
    const { confirm } = await import('@tauri-apps/plugin-dialog');

    const confirmed = await confirm('Are you sure you want to clear this chat?', {
      title: 'Clear Chat',
      kind: 'warning',
    });

    if (confirmed) {
      clearCurrentSession();
    }
  };

  const handleExport = () => {
    if (!currentSession) return;

    const chatText = currentSession.messages
      .map((msg) => `${msg.role.toUpperCase()}: ${msg.content}`)
      .join('\n\n');

    const blob = new Blob([chatText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `chat-${currentSession.id}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <header className="sticky top-0 z-10 flex h-16 shrink-0 items-center gap-2 bg-background border-b">
          <div className="flex items-center gap-2 px-4">
            <SidebarTrigger className="-ml-1" />
            <Separator orientation="vertical" className="mr-2 h-4" />
          </div>
          <div className="flex flex-1 items-center justify-between px-4">
            <div className="flex items-center gap-3">
              <MessageSquare className="h-6 w-6 text-primary" />
              <div>
                <h1 className="text-lg font-semibold text-foreground">
                  {currentSession?.title || 'New Chat'}
                </h1>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  {selectedDocumentIds.length > 0 ? (
                    <>
                      <FileText className="h-3 w-3" />
                      {selectedDocs.length === 1 ? (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="truncate max-w-[200px]">
                                {truncateFilename(selectedDocs[0]?.fileName || 'Unknown', 30, 15)}
                              </span>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p className="max-w-xs break-words">{selectedDocs[0]?.fileName}</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      ) : (
                        <span>{selectedDocs.length} documents</span>
                      )}
                    </>
                  ) : (
                    <span>PrivatePDF AI Chat</span>
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <StatusIndicator />
              <Button
                variant="ghost"
                size="sm"
                onClick={handleNewChat}
              >
                <Plus className="h-4 w-4 mr-1" />
                New Chat
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleExport}
                disabled={!currentSession || currentSession.messages.length === 0}
              >
                <Download className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleClear}
                disabled={!currentSession || currentSession.messages.length === 0}
              >
                Clear
              </Button>
              <ModelSelector />
              <ModeToggle />
            </div>
          </div>
        </header>
        <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
          <ChatInterface />
        </div>
      </SidebarInset>

      {/* Upload Dialog */}
      <UploadDialog
        open={uploadDialogOpen}
        onOpenChange={setUploadDialogOpen}
        onUploadComplete={(documentId) => {
          console.log('Single document uploaded:', documentId);
          // Auto-select for PDF preview (chat context is handled in uploadAndProcess)
          setSelectedDocument(documentId);
        }}
        onBatchComplete={(documentIds) => {
          console.log('Batch upload complete:', documentIds);
          // Auto-select first document for PDF preview
          if (documentIds.length > 0) {
            setSelectedDocument(documentIds[0]!);
          }
        }}
      />
    </SidebarProvider>
  );
}

export default function DemoPage() {
  return (
    <AppProvider>
      <PdfPreviewProvider>
        <DemoPageContent />
      </PdfPreviewProvider>
    </AppProvider>
  );
}
