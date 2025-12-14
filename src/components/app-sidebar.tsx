'use client';

import * as React from 'react';
import { History, Settings, Upload, Folder, Trash2, ChevronRight } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { NavMain } from '@/components/nav-main';
import { useApp } from '@/contexts/app-context';
import { useDocumentStore } from '@/stores/document-store';
import { useChatStore } from '@/stores/chat-store';
import { usePdfPreview } from '@/contexts/pdf-preview-context';
import { PdfPreview } from '@/components/pdf/pdf-preview';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { truncateFilename } from '@/lib/utils';
import { clearAllData } from '@/lib/services/indexeddb-storage';
import { APP_VERSION, APP_NAME, SUPPORT_EMAIL } from '@/lib/constants';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar';

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const { openUploadDialog } = useApp();
  const [aboutDialogOpen, setAboutDialogOpen] = React.useState(false);

  const {
    documents,
    loadDocuments,
    selectedDocumentIds,
    toggleDocumentSelection,
    selectAllDocuments,
    clearDocumentSelection,
    deleteDoc,
    clearCurrentDocument,
  } = useDocumentStore();
  const { sessions, currentSessionId, setCurrentSession, deleteSession, clearAllSessions, clearCurrentSession } = useChatStore();
  const { selectedDocumentId, selectedPageNumber, highlightText, setSelectedDocument } = usePdfPreview();

  // Load documents on mount
  React.useEffect(() => {
    loadDocuments();
  }, [loadDocuments]);

  const handleDeleteDocument = async (docId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const { confirm } = await import('@tauri-apps/plugin-dialog');

    const confirmed = await confirm('Are you sure you want to delete this document?', {
      title: 'Delete Document',
      kind: 'warning',
    });

    if (confirmed) {
      // If deleting the currently selected document, clear selection first
      if (selectedDocumentId === docId) {
        setSelectedDocument(null);
      }

      await deleteDoc(docId);
      await loadDocuments();
    }
  };

  const handleClearDatabase = async () => {
    // Use native Tauri dialog
    const { confirm } = await import('@tauri-apps/plugin-dialog');

    const confirmed = await confirm('This will delete ALL documents, chunks, and chat history. Are you sure?', {
      title: 'Clear Database',
      kind: 'warning',
    });

    if (confirmed) {
      try {
        await clearAllData();
        await loadDocuments();
        clearCurrentSession();
        clearDocumentSelection();
        window.location.reload();
      } catch (error) {
        console.error('Failed to clear database:', error);
        const { message } = await import('@tauri-apps/plugin-dialog');
        await message('Failed to clear database. Check console for details.', {
          title: 'Error',
          kind: 'error',
        });
      }
    }
  };

  const allSelected = documents.length > 0 && selectedDocumentIds.length === documents.length;
  const someSelected = selectedDocumentIds.length > 0 && !allSelected;

  const handleDeleteSession = async (sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const { confirm } = await import('@tauri-apps/plugin-dialog');

    const confirmed = await confirm('Are you sure you want to delete this chat?', {
      title: 'Delete Chat',
      kind: 'warning',
    });

    if (confirmed) {
      deleteSession(sessionId);
    }
  };

  const handleClearAllSessions = async () => {
    const { confirm } = await import('@tauri-apps/plugin-dialog');

    const confirmed = await confirm('Are you sure you want to delete all chat history?', {
      title: 'Clear All Chats',
      kind: 'warning',
    });

    if (confirmed) {
      clearAllSessions();
    }
  };

  const data = {
    navMain: [
      {
        title: 'Actions',
        url: '#',
        icon: Upload,
        items: [
          { title: 'Upload Document', url: '#', onClick: openUploadDialog },
          { title: 'Clear Database', url: '#', onClick: handleClearDatabase },
        ],
      },
      {
        title: 'Settings',
        url: '#',
        icon: Settings,
        items: [
          {
            title: 'About',
            url: '#',
            onClick: () => setAboutDialogOpen(true)
          },
        ],
      },
    ],
  };

  return (
    <Sidebar variant="inset" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <a href="/">
                <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                  <Folder className="size-4" />
                </div>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-semibold">PrivatePDF</span>
                  <span className="truncate text-xs">Local AI Chat</span>
                </div>
              </a>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        {/* Documents Section with Checkboxes */}
        <Collapsible defaultOpen className="group/collapsible">
          <SidebarGroup>
            <div className="flex items-center justify-between px-2">
              <CollapsibleTrigger className="flex items-center gap-2 flex-1 py-1.5 text-xs font-medium text-sidebar-foreground/70 outline-none ring-sidebar-ring transition-[margin,opa] hover:text-sidebar-foreground focus-visible:ring-2 group-data-[state=collapsed]/sidebar-wrapper:hidden">
                <ChevronRight className="h-4 w-4 transition-transform group-data-[state=open]/collapsible:rotate-90" />
                <span>Documents</span>
              </CollapsibleTrigger>
              {documents.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 text-xs"
                  onClick={() => (allSelected ? clearDocumentSelection() : selectAllDocuments())}
                >
                  {allSelected ? 'Clear' : 'All'}
                </Button>
              )}
            </div>
            <CollapsibleContent>
              <SidebarGroupContent>
                <SidebarMenu>
                  {documents.length === 0 ? (
                    <SidebarMenuItem>
                      <div className="px-2 py-1 text-sm text-muted-foreground">
                        No documents yet
                      </div>
                    </SidebarMenuItem>
                  ) : (
                    documents.map((doc) => (
                      <SidebarMenuItem key={doc.id}>
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-accent group">
                                <Checkbox
                                  checked={selectedDocumentIds.includes(doc.id)}
                                  onCheckedChange={() => toggleDocumentSelection(doc.id)}
                                  className="flex-shrink-0"
                                />
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm truncate">{truncateFilename(doc.fileName)}</p>
                                  <p className="text-xs text-muted-foreground">
                                    {doc.totalPages} pages
                                  </p>
                                </div>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                                  onClick={(e) => handleDeleteDocument(doc.id, e)}
                                >
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              </div>
                            </TooltipTrigger>
                            <TooltipContent side="right">
                              <p className="max-w-xs break-words">{doc.fileName}</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </SidebarMenuItem>
                    ))
                  )}
                </SidebarMenu>
              </SidebarGroupContent>
            </CollapsibleContent>
          </SidebarGroup>
        </Collapsible>

        {/* Chat History Section */}
        <Collapsible defaultOpen={false} className="group/collapsible">
          <SidebarGroup>
            <div className="flex items-center justify-between px-2">
              <CollapsibleTrigger className="flex items-center gap-2 flex-1 py-1.5 text-xs font-medium text-sidebar-foreground/70 outline-none ring-sidebar-ring transition-[margin,opa] hover:text-sidebar-foreground focus-visible:ring-2 group-data-[state=collapsed]/sidebar-wrapper:hidden">
                <ChevronRight className="h-4 w-4 transition-transform group-data-[state=open]/collapsible:rotate-90" />
                <span>Chat History</span>
              </CollapsibleTrigger>
              {sessions.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 text-xs"
                  onClick={handleClearAllSessions}
                >
                  Clear All
                </Button>
              )}
            </div>
            <CollapsibleContent>
              <SidebarGroupContent>
                <SidebarMenu>
                  {sessions.length === 0 ? (
                    <SidebarMenuItem>
                      <div className="px-2 py-1 text-sm text-muted-foreground">
                        No chat history
                      </div>
                    </SidebarMenuItem>
                  ) : (
                    sessions
                      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
                      .map((session) => (
                        <SidebarMenuItem key={session.id}>
                          <div
                            className={`flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-accent group cursor-pointer ${
                              currentSessionId === session.id ? 'bg-accent' : ''
                            }`}
                            onClick={() => setCurrentSession(session.id)}
                          >
                            <History className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm truncate">{truncateFilename(session.title, 25, 8)}</p>
                              <p className="text-xs text-muted-foreground">
                                {session.messages.length} messages • {new Date(session.updatedAt).toLocaleDateString()}
                              </p>
                            </div>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                              onClick={(e) => handleDeleteSession(session.id, e)}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        </SidebarMenuItem>
                      ))
                  )}
                </SidebarMenu>
              </SidebarGroupContent>
            </CollapsibleContent>
          </SidebarGroup>
        </Collapsible>

        {/* Other Navigation */}
        <NavMain items={data.navMain} />

        {/* PDF Preview Section - Simple browsing, no highlighting */}
        {selectedDocumentId && (
          <Collapsible defaultOpen={false} className="group/collapsible">
            <SidebarGroup>
              <CollapsibleTrigger className="flex items-center gap-2 px-2 py-1.5 text-xs font-medium text-sidebar-foreground/70 outline-none ring-sidebar-ring transition-[margin,opa] hover:text-sidebar-foreground focus-visible:ring-2 group-data-[state=collapsed]/sidebar-wrapper:hidden">
                <ChevronRight className="h-4 w-4 transition-transform group-data-[state=open]/collapsible:rotate-90" />
                <span>PDF Browser</span>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="px-2 py-2">
                  <div className="text-xs text-muted-foreground mb-2 px-2 truncate">
                    {documents.find((d) => d.id === selectedDocumentId)?.fileName || 'PDF Preview'}
                  </div>
                  <PdfPreview
                    documentId={selectedDocumentId}
                    pageNumber={selectedPageNumber}
                    highlightText={undefined}
                    className="h-[500px]"
                  />
                </div>
              </CollapsibleContent>
            </SidebarGroup>
          </Collapsible>
        )}
      </SidebarContent>
      <SidebarFooter>
        <p className="text-xs text-sidebar-foreground/60 px-2">
          🔒 100% Local Processing
        </p>
      </SidebarFooter>

      {/* About Dialog */}
      <Dialog open={aboutDialogOpen} onOpenChange={setAboutDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>About {APP_NAME}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <p className="text-sm text-muted-foreground mb-2">
                A local-first PDF RAG application that uses Ollama for AI inference.
              </p>
              <p className="text-sm text-muted-foreground">
                All processing happens locally on your machine - no cloud uploads, no API dependencies, complete privacy.
              </p>
            </div>

            <div className="border-t pt-4">
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Version</span>
                  <span className="font-medium">{APP_VERSION}</span>
                </div>
              </div>
            </div>

            <div className="border-t pt-4">
              <p className="text-xs text-muted-foreground mb-2">Support</p>
              <a
                href={`mailto:${SUPPORT_EMAIL}`}
                className="text-sm text-primary hover:underline"
              >
                {SUPPORT_EMAIL}
              </a>
            </div>

            <div className="border-t pt-4">
              <p className="text-xs text-muted-foreground">
                🔒 Your data never leaves your device. All PDF processing and AI inference runs locally via Ollama.
              </p>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </Sidebar>
  );
}
