'use client';

import { useState, useEffect, useRef } from 'react';
import { PDFUpload } from './pdf-upload';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface UploadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUploadComplete?: (documentId: string) => void;
  onBatchComplete?: (documentIds: string[]) => void;
}

export function UploadDialog({ open, onOpenChange, onUploadComplete, onBatchComplete }: UploadDialogProps) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [componentKey, setComponentKey] = useState(0);
  const prevOpenRef = useRef(open);

  // Force remount of PDFUpload component when dialog opens
  // This ensures hasCalledOnComplete flag is reset for each new upload session
  useEffect(() => {
    if (open && !prevOpenRef.current) {
      // Dialog just opened - increment key to force remount
      setComponentKey(prev => prev + 1);
    }
    prevOpenRef.current = open;
  }, [open]);

  const handleOpenChange = (newOpen: boolean) => {
    // Prevent closing if files are being processed
    if (!newOpen && isProcessing) {
      return;
    }
    onOpenChange(newOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="max-w-2xl max-h-[90vh] overflow-y-auto"
        onPointerDownOutside={(e) => {
          // Prevent closing when clicking outside during processing
          if (isProcessing) {
            e.preventDefault();
          }
        }}
        onEscapeKeyDown={(e) => {
          // Prevent closing with Escape key during processing
          if (isProcessing) {
            e.preventDefault();
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>Upload PDF Documents</DialogTitle>
          <DialogDescription>
            Upload single or multiple PDF files to chat with using AI. All processing happens locally.
          </DialogDescription>
        </DialogHeader>
        <PDFUpload
          key={componentKey}
          onUploadComplete={(documentId) => {
            onUploadComplete?.(documentId);
          }}
          onBatchComplete={(documentIds) => {
            onBatchComplete?.(documentIds);
            setIsProcessing(false); // Mark processing complete
          }}
          onProcessingChange={(processing) => {
            setIsProcessing(processing);
          }}
          onClose={() => {
            if (!isProcessing) {
              onOpenChange(false);
            }
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
