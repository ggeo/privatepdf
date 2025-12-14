'use client';

import { useEffect } from 'react';
import { useDocumentStore } from '@/stores/document-store';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import { FileText, MoreVertical, Trash2, MessageSquare, Download, Clock, FileCheck } from 'lucide-react';
import type { StoredDocument } from '@/lib/services/indexeddb-storage';

interface DocumentListProps {
  onSelectDocument?: (doc: StoredDocument) => void;
  onChatWithDocument?: (doc: StoredDocument) => void;
}

export function DocumentList({ onSelectDocument, onChatWithDocument }: DocumentListProps) {
  const { documents, loadDocuments, deleteDoc } = useDocumentStore();

  useEffect(() => {
    loadDocuments();
  }, [loadDocuments]);

  const handleDelete = async (docId: string) => {
    if (window.confirm('Delete this document? This cannot be undone.')) {
      await deleteDoc(docId);
    }
  };

  const handleDownload = async (doc: StoredDocument) => {
    // Get chunks for this document
    const { getDocumentChunks } = await import('@/lib/services/indexeddb-storage');
    const chunks = await getDocumentChunks(doc.id);

    // Create a text file with document info
    const content = `Document: ${doc.metadata?.title || doc.fileName}
Pages: ${doc.totalPages}
Uploaded: ${new Date(doc.uploadedAt).toLocaleString()}

Content Preview:
${chunks?.slice(0, 3).map(c => c.text).join('\n\n---\n\n') || 'No content'}
`;

    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${doc.metadata?.title || doc.fileName}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const getStatusBadge = (status: StoredDocument['status']) => {
    const variants = {
      uploaded: { variant: 'secondary' as const, label: 'Uploaded' },
      processing: { variant: 'secondary' as const, label: 'Processing' },
      completed: { variant: 'default' as const, label: 'Ready' },
      error: { variant: 'destructive' as const, label: 'Failed' },
    };

    const config = variants[status] || variants.completed;
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days === 0) return 'Today';
    if (days === 1) return 'Yesterday';
    if (days < 7) return `${days} days ago`;
    return date.toLocaleDateString();
  };

  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
  };

  if (documents.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <div className="p-4 rounded-full bg-muted mb-4">
            <FileText className="h-8 w-8 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-semibold mb-2">No documents yet</h3>
          <p className="text-sm text-muted-foreground text-center max-w-md">
            Upload your first PDF to get started with AI-powered document chat
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Your Documents</h2>
        <span className="text-sm text-muted-foreground">
          {documents.length} {documents.length === 1 ? 'document' : 'documents'}
        </span>
      </div>

      <div className="grid gap-4">
        {documents.map((doc) => (
          <Card
            key={doc.id}
            className="hover:shadow-md transition-shadow cursor-pointer"
            onClick={() => onSelectDocument?.(doc)}
          >
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3 flex-1 min-w-0">
                  <div className="p-2 rounded-lg bg-primary/10 shrink-0">
                    <FileText className="h-5 w-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <CardTitle className="text-base truncate">{doc.metadata?.title || doc.fileName}</CardTitle>
                    <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <FileCheck className="h-3 w-3" />
                        {doc.totalPages} pages
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {formatDate(doc.uploadedAt)}
                      </span>
                      {doc.fileSize && (
                        <span>{formatSize(doc.fileSize)}</span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {getStatusBadge(doc.status)}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                      <Button variant="ghost" size="icon">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onClick={(e) => {
                          e.stopPropagation();
                          onChatWithDocument?.(doc);
                        }}
                        disabled={doc.status !== 'completed'}
                      >
                        <MessageSquare className="h-4 w-4 mr-2" />
                        Chat with document
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDownload(doc);
                        }}
                      >
                        <Download className="h-4 w-4 mr-2" />
                        Download text
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(doc.id);
                        }}
                        className="text-destructive"
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            </CardHeader>
          </Card>
        ))}
      </div>
    </div>
  );
}
