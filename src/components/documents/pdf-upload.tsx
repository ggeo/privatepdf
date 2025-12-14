'use client';

import { useCallback, useState, useEffect } from 'react';
import { useDropzone } from 'react-dropzone';
import { useDocumentStore } from '@/stores/document-store';
import { useOllamaStore } from '@/stores/ollama-store';
import { useSettingsStore } from '@/stores/settings-store';
import { CHAT_MODELS } from '@/lib/services/ollama-service';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { Upload, FileText, X, AlertTriangle, WifiOff, FolderOpen, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { open } from '@tauri-apps/plugin-dialog';
import { readDir, readFile } from '@tauri-apps/plugin-fs';

interface PDFUploadProps {
  onUploadComplete?: (documentId: string) => void;
  onBatchComplete?: (documentIds: string[]) => void; // NEW: Called when all files in batch are done
  onProcessingChange?: (isProcessing: boolean) => void; // NEW: Track processing state
  onClose?: () => void;
  className?: string;
}

interface FileQueueItem {
  file: File;
  status: 'pending' | 'processing' | 'completed' | 'error';
  progress: number;
  error?: string;
  documentId?: string;
}

export function PDFUpload({ onUploadComplete, onBatchComplete, onProcessingChange, onClose, className }: PDFUploadProps) {
  const { uploadAndProcess, isProcessing, processingProgress } = useDocumentStore();
  const { modelsReady, network } = useOllamaStore();
  const { selectedTier } = useSettingsStore();
  const [error, setError] = useState<string | null>(null);
  const [workerReady, setWorkerReady] = useState(false);
  const [fileQueue, setFileQueue] = useState<FileQueueItem[]>([]);
  const [currentFileIndex, setCurrentFileIndex] = useState<number>(-1);

  const isCellular = network?.isCellular ?? false;
  const isOnline = network?.online ?? true;

  // Desktop apps should NEVER show cellular warnings
  const isTauri = typeof window !== 'undefined' && (window as any).__TAURI__;
  const showCellularWarning = !isTauri && isCellular && isOnline;

  useEffect(() => {
    setWorkerReady(modelsReady);
  }, [modelsReady]);

  // Process queue
  useEffect(() => {
    if (fileQueue.length === 0 || isProcessing) return;

    // Check if Ollama is ready before processing
    if (!modelsReady) {
      // Mark all pending files as errors
      setFileQueue((queue) =>
        queue.map((item) =>
          item.status === 'pending'
            ? {
                ...item,
                status: 'error' as const,
                error: 'Ollama is not running. Please start Ollama first.',
              }
            : item
        )
      );
      setError('Ollama is not running. Please start Ollama before uploading PDFs.');
      return;
    }

    const nextIndex = fileQueue.findIndex((item) => item.status === 'pending');
    if (nextIndex === -1) {
      // All files processed - call onBatchComplete with all successful document IDs
      setCurrentFileIndex(-1);
      onProcessingChange?.(false); // Notify that processing is complete

      const completedDocIds = fileQueue
        .filter((f) => f.status === 'completed' && f.documentId)
        .map((f) => f.documentId!);

      if (completedDocIds.length > 0 && onBatchComplete) {
        onBatchComplete(completedDocIds);
      }

      return;
    }

    setCurrentFileIndex(nextIndex);
    onProcessingChange?.(true); // Notify that processing has started
    processFile(nextIndex);
  }, [fileQueue, isProcessing, modelsReady, onBatchComplete, onProcessingChange]);

  const processFile = async (index: number) => {
    const item = fileQueue[index];
    if (!item) return;

    // Double-check Ollama is ready
    if (!modelsReady) {
      setFileQueue((queue) =>
        queue.map((f, i) =>
          i === index
            ? {
                ...f,
                status: 'error' as const,
                error: 'Ollama is not running. Please start Ollama first.',
              }
            : f
        )
      );
      return;
    }

    // Update status to processing
    setFileQueue((queue) =>
      queue.map((f, i) => (i === index ? { ...f, status: 'processing' as const } : f))
    );

    try {
      const modelName = CHAT_MODELS[selectedTier].name;
      const result = await uploadAndProcess(item.file, modelName as any);

      // Update status to completed
      setFileQueue((queue) =>
        queue.map((f, i) =>
          i === index
            ? { ...f, status: 'completed' as const, progress: 100, documentId: result.documentId }
            : f
        )
      );

      console.log(`✅ [PDF Upload] Document processed successfully: ${result.documentId}`);

      // Auto-select each uploaded document for preview
      onUploadComplete?.(result.documentId);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to process PDF';

      // Update status to error
      setFileQueue((queue) =>
        queue.map((f, i) =>
          i === index ? { ...f, status: 'error' as const, error: errorMessage } : f
        )
      );

      setError(errorMessage);
    }
  };

  const validateFile = (file: File): string | null => {
    // Validate file type
    const validTypes = [
      'application/pdf',
      'image/jpeg',
      'image/jpg',
      'image/png',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ];
    const validExtensions = ['.pdf', '.jpg', '.jpeg', '.png', '.docx'];

    const hasValidType = validTypes.includes(file.type);
    const hasValidExtension = validExtensions.some(ext =>
      file.name.toLowerCase().endsWith(ext)
    );

    if (!hasValidType && !hasValidExtension) {
      return `${file.name}: Invalid file type (supported: PDF, JPG, PNG, DOCX)`;
    }

    // Validate file size (max 500MB)
    const maxSize = 500 * 1024 * 1024;
    if (file.size > maxSize) {
      return `${file.name}: File too large (max 500MB)`;
    }

    return null;
  };

  const onDrop = useCallback(
    async (acceptedFiles: File[]) => {
      setError(null);

      if (acceptedFiles.length === 0) {
        setError('No files selected');
        return;
      }

      // Validate all files
      const validFiles: File[] = [];
      const errors: string[] = [];

      for (const file of acceptedFiles) {
        const validationError = validateFile(file);
        if (validationError) {
          errors.push(validationError);
        } else {
          validFiles.push(file);
        }
      }

      if (errors.length > 0) {
        setError(errors.join('\n'));
      }

      if (validFiles.length === 0) {
        return;
      }

      // Add files to queue
      const newItems: FileQueueItem[] = validFiles.map((file) => ({
        file,
        status: 'pending',
        progress: 0,
      }));

      setFileQueue((queue) => [...queue, ...newItems]);
    },
    []
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf'],
      'image/jpeg': ['.jpg', '.jpeg'],
      'image/png': ['.png'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
    },
    multiple: true, // Allow multiple files
    disabled: !workerReady,
  });

  const clearCompleted = () => {
    setFileQueue((queue) => queue.filter((item) => item.status !== 'completed'));
  };

  const clearAll = () => {
    setFileQueue([]);
    setCurrentFileIndex(-1);
    setError(null);
  };

  const totalFiles = fileQueue.length;
  const completedFiles = fileQueue.filter((f) => f.status === 'completed').length;
  const hasFiles = totalFiles > 0;
  const allProcessed = fileQueue.every((f) => f.status === 'completed' || f.status === 'error');
  const isCurrentlyProcessing = currentFileIndex >= 0;

  return (
    <div className={cn('space-y-4', className)}>
      {/* Ollama Status Warning */}
      {!modelsReady && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            Ollama is not running. Please start Ollama before uploading PDFs. PDFs need to be processed with AI to enable chat functionality.
          </AlertDescription>
        </Alert>
      )}

      {/* Cellular Warning */}
      {showCellularWarning && (
        <Alert variant="destructive">
          <WifiOff className="h-4 w-4" />
          <AlertDescription>
            You're on a cellular connection. Processing large PDFs may use significant data.
            Consider switching to WiFi.
          </AlertDescription>
        </Alert>
      )}

      {/* Upload Area */}
      <Card>
        <CardContent className="p-6">
          {!hasFiles ? (
            <div
              {...getRootProps()}
              className={cn(
                'border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors',
                isDragActive
                  ? 'border-primary bg-primary/5'
                  : 'border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/50'
              )}
            >
              <input {...getInputProps()} />

              <div className="flex flex-col items-center gap-4">
                <div className="p-4 rounded-full bg-primary/10">
                  <Upload className="h-8 w-8 text-primary" />
                </div>

                <div className="space-y-2">
                  <h3 className="text-lg font-semibold">
                    {!workerReady
                      ? 'Initializing AI models...'
                      : isDragActive
                      ? 'Drop your PDFs here'
                      : 'Upload PDF Documents'}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    {!workerReady
                      ? 'Please wait...'
                      : 'Drag and drop files or folder, or click to browse'}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Supports single or multiple PDF files up to 500MB each
                  </p>
                </div>

                <div className="flex gap-2">
                  <Button type="button" variant="default" size="sm" disabled={!workerReady}>
                    <FileText className="h-4 w-4 mr-2" />
                    Choose Files
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={!workerReady}
                    onClick={async (e) => {
                      e.preventDefault();
                      e.stopPropagation();

                      try {
                        // Use Tauri's native folder picker
                        const selectedFolder = await open({
                          directory: true,
                          multiple: false,
                        });

                        if (!selectedFolder || typeof selectedFolder !== 'string') {
                          console.log('No folder selected');
                          return;
                        }

                        console.log('📁 Selected folder:', selectedFolder);

                        // Read all entries in the folder
                        const entries = await readDir(selectedFolder);
                        console.log(`📄 Found ${entries.length} entries in folder`);

                        // Filter for PDF files
                        const pdfEntries = entries.filter(entry =>
                          entry.isFile && entry.name.toLowerCase().endsWith('.pdf')
                        );

                        console.log(`📄 Found ${pdfEntries.length} PDF files`);

                        if (pdfEntries.length === 0) {
                          setError('No PDF files found in the selected folder');
                          return;
                        }

                        // Read all PDF files and convert to File objects
                        const filePromises = pdfEntries.map(async (entry) => {
                          const fullPath = `${selectedFolder}/${entry.name}`;
                          console.log(`📖 Reading: ${fullPath}`);

                          const fileData = await readFile(fullPath);
                          const blob = new Blob([fileData], { type: 'application/pdf' });
                          return new File([blob], entry.name, { type: 'application/pdf' });
                        });

                        const pdfFiles = await Promise.all(filePromises);
                        console.log(`✅ Loaded ${pdfFiles.length} PDF files`);

                        // Pass to onDrop handler
                        onDrop(pdfFiles);
                      } catch (err) {
                        console.error('Error selecting folder:', err);
                        setError('Failed to read folder: ' + (err instanceof Error ? err.message : 'Unknown error'));
                      }
                    }}
                  >
                    <FolderOpen className="h-4 w-4 mr-2" />
                    Choose Folder
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Queue Header */}
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold">
                    Upload Queue ({completedFiles}/{totalFiles})
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    {currentFileIndex >= 0
                      ? `Processing ${fileQueue[currentFileIndex]?.file.name}...`
                      : 'All files processed'}
                  </p>
                </div>
                <div className="flex gap-2">
                  {completedFiles > 0 && (
                    <Button variant="outline" size="sm" onClick={clearCompleted}>
                      Clear Completed
                    </Button>
                  )}
                  <Button variant="ghost" size="sm" onClick={clearAll}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {/* File List */}
              <div className="space-y-2 max-h-[400px] overflow-y-auto">
                {fileQueue.map((item, index) => (
                  <div
                    key={index}
                    className="flex items-center gap-3 p-3 rounded-lg border bg-card"
                  >
                    <div className="flex-shrink-0">
                      {item.status === 'completed' ? (
                        <CheckCircle2 className="h-5 w-5 text-green-500" />
                      ) : item.status === 'error' ? (
                        <AlertTriangle className="h-5 w-5 text-destructive" />
                      ) : item.status === 'processing' ? (
                        <div className="h-5 w-5 rounded-full bg-primary/20 animate-pulse" />
                      ) : (
                        <FileText className="h-5 w-5 text-muted-foreground" />
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{item.file.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {(item.file.size / 1024 / 1024).toFixed(2)} MB
                      </p>
                      {item.status === 'processing' && processingProgress && (
                        <div className="mt-2 space-y-1">
                          <Progress value={processingProgress.progress || 0} className="h-1" />
                          <p className="text-xs text-muted-foreground">
                            {processingProgress.message}
                          </p>
                        </div>
                      )}
                      {item.error && (
                        <p className="text-xs text-destructive mt-1">{item.error}</p>
                      )}
                    </div>

                    <div className="flex-shrink-0 text-xs text-muted-foreground capitalize">
                      {item.status}
                    </div>
                  </div>
                ))}
              </div>

              {/* Add more files button - HIDDEN, user should close dialog and reopen to upload more */}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Error Display */}
      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription className="whitespace-pre-line">{error}</AlertDescription>
        </Alert>
      )}

      {/* Info */}
      {!hasFiles && (
        <div className="flex items-start gap-2 text-xs text-muted-foreground">
          <FileText className="h-4 w-4 shrink-0 mt-0.5" />
          <p>
            Your PDFs will be processed locally in your browser using Ollama. Files will be split
            into chunks, embeddings will be generated, and everything will be stored in your
            browser's local storage. Processing time depends on file size and your hardware.
          </p>
        </div>
      )}

      {/* Done button - shows when all files are processed */}
      {hasFiles && allProcessed && !isCurrentlyProcessing && onClose && (
        <Button onClick={onClose} className="w-full" size="lg">
          Done
        </Button>
      )}
    </div>
  );
}
