'use client';

import React, { useEffect, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut, FileText } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getSignificantWords, normalizeTextForSearch } from '@/lib/utils/highlight';

// Configure PDF.js worker
if (typeof window !== 'undefined') {
  // Use worker from public folder (stable path, works in dev + production)
  pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
}

interface PdfPreviewProps {
  documentId: string;
  pageNumber?: number;
  highlightText?: string;
  className?: string;
}

export function PdfPreview({ documentId, pageNumber = 1, highlightText, className }: PdfPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [pdfDoc, setPdfDoc] = useState<PDFDocumentProxy | null>(null);
  const [currentPage, setCurrentPage] = useState(pageNumber);
  const [numPages, setNumPages] = useState(0);
  const [scale, setScale] = useState(1.0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);

  // Update current page when pageNumber prop changes
  useEffect(() => {
    console.log('📄 PDF Preview received new page number:', pageNumber);
    setCurrentPage(pageNumber);
  }, [pageNumber]);

  // Log when props change
  useEffect(() => {
    console.log('🔄 PDF Preview props updated:', {
      documentId,
      pageNumber,
      currentPage,
      hasHighlightText: !!highlightText,
      highlightTextLength: highlightText?.length || 0
    });
  }, [documentId, pageNumber, currentPage, highlightText]);

  // Load PDF from IndexedDB with retry logic to handle race conditions
  useEffect(() => {
    let retryCount = 0;
    const maxRetries = 3;
    const retryDelays = [100, 300, 900]; // Exponential backoff: 100ms, 300ms, 900ms

    const loadPdf = async (attemptNumber: number = 0): Promise<void> => {
      try {
        setIsLoading(true);
        setError(null);

        console.log(`📄 [PDF Preview] Loading attempt ${attemptNumber + 1}/${maxRetries + 1} for document: ${documentId}`);

        // Get PDF from IndexedDB
        const { getDocument } = await import('@/lib/services/indexeddb-storage');
        const doc = await getDocument(documentId);

        if (!doc || !doc.fileData) {
          // Document not found - might be a race condition with upload
          if (attemptNumber < maxRetries) {
            const delay = retryDelays[attemptNumber]!;
            console.log(`⏳ [PDF Preview] Document not found, retrying in ${delay}ms... (attempt ${attemptNumber + 1}/${maxRetries})`);

            // Wait and retry
            await new Promise(resolve => setTimeout(resolve, delay));
            return loadPdf(attemptNumber + 1);
          } else {
            throw new Error('PDF not found in database');
          }
        }

        console.log(`✅ [PDF Preview] Document loaded successfully on attempt ${attemptNumber + 1}`);

        // Load PDF document directly from ArrayBuffer (works in Tauri)
        // Don't use blob URLs - they become blob:tauri://localhost which pdf.js can't load
        const loadingTask = pdfjsLib.getDocument({ data: doc.fileData });
        const pdf = await loadingTask.promise;
        setPdfDoc(pdf);
        setNumPages(pdf.numPages);
        setIsLoading(false);
      } catch (err: any) {
        console.error(`❌ [PDF Preview] Failed to load PDF after ${attemptNumber + 1} attempts:`, err);
        setError(err.message || 'Failed to load PDF');
        setIsLoading(false);
      }
    };

    loadPdf();
  }, [documentId]);

  // Render PDF page
  useEffect(() => {
    let renderTask: any = null;
    let cancelled = false;

    const renderPage = async () => {
      if (!pdfDoc || !canvasRef.current || cancelled) return;

      try {
        // Cancel any previous render task first
        if (renderTask) {
          try {
            renderTask.cancel();
          } catch (e) {
            // Ignore cancel errors
          }
        }

        const page = await pdfDoc.getPage(currentPage);
        if (cancelled) return;

        const viewport = page.getViewport({ scale });
        const canvas = canvasRef.current;
        if (!canvas || cancelled) return;

        const context = canvas.getContext('2d');
        if (!context || cancelled) return;

        // Clear canvas before rendering
        canvas.height = viewport.height;
        canvas.width = viewport.width;

        const renderContext = {
          canvasContext: context,
          viewport: viewport,
        };

        // Start new render
        renderTask = page.render(renderContext);

        // Wait for render to complete
        await renderTask.promise;

        // Only highlight if not cancelled and text is provided
        if (!cancelled && highlightText) {
          await highlightTextOnPage(page, viewport, context, highlightText);
        }
      } catch (err: any) {
        // Silently ignore cancelled render errors
        if (err?.name !== 'RenderingCancelledException' && !cancelled) {
          console.error('Failed to render page:', err);
        }
      } finally {
        renderTask = null;
      }
    };

    renderPage();

    // Cleanup function
    return () => {
      cancelled = true;
      if (renderTask) {
        try {
          renderTask.cancel();
        } catch (e) {
          // Ignore errors during cleanup
        }
        renderTask = null;
      }
    };
  }, [pdfDoc, currentPage, scale, highlightText]);

  // Highlight the best matching passage on the rendered page.
  const highlightTextOnPage = async (
    page: PDFPageProxy,
    viewport: any,
    context: CanvasRenderingContext2D,
    searchText: string
  ) => {
    try {
      if (!searchText?.trim()) {
        return;
      }

      const textContent = await page.getTextContent();
      const items = textContent.items.filter((item: any) => (item.str || '').trim().length);
      if (!items.length) {
        return;
      }

      const normalizedItems = items.map((item: any) => ({
        item,
        normalized: normalizeTextForSearch(item.str || ''),
      }));

      const significantWords = getSignificantWords(searchText, 14);
      if (!significantWords.length) {
        return;
      }

      const targetWords = new Set(significantWords);
      let bestWindow = { start: -1, end: -1, score: 0 };

      for (let start = 0; start < normalizedItems.length; start++) {
        const matched = new Set<string>();

        for (
          let end = start;
          end < normalizedItems.length && end < start + 35;
          end++
        ) {
        const entry = normalizedItems[end];
        if (!entry) {
          continue;
        }

        const words = entry.normalized.split(' ');
          for (const word of words) {
            if (targetWords.has(word)) {
              matched.add(word);
            }
          }

          if (!matched.size) {
            continue;
          }

          const coverage = matched.size / targetWords.size;

          if (
            coverage > bestWindow.score ||
            (coverage === bestWindow.score &&
              (bestWindow.start === -1 || end - start < bestWindow.end - bestWindow.start))
          ) {
            bestWindow = { start, end, score: coverage };
          }

          if (coverage === 1) {
            break;
          }
        }
      }

      if (bestWindow.start === -1) {
        const fallbackWord = significantWords[0]!;
        const fallbackIndex = normalizedItems.findIndex((entry) =>
          entry.normalized.includes(fallbackWord)
        );

        if (fallbackIndex === -1) {
          return;
        }

        bestWindow = { start: fallbackIndex, end: fallbackIndex, score: 0.1 };
      }

      const startIdx = Math.max(0, bestWindow.start - 1);
      const endIdx = Math.min(items.length - 1, bestWindow.end + 1);

      context.save();
      for (let index = startIdx; index <= endIdx; index++) {
        const item: any = items[index];
        const transform = viewport.transform;
        const tx = item.transform;

        const x = tx[4] * transform[0] + transform[4];
        const y = viewport.height - (tx[5] * transform[3] + transform[5]);
        const width = (item.width || 0) * transform[0];
        const height = (item.height || 0) * transform[3];

        if (!width || !height) {
          continue;
        }

        context.fillStyle = 'rgba(234, 179, 8, 0.35)';
        context.fillRect(x, y - height, width, height);

        context.strokeStyle = 'rgba(234, 179, 8, 0.75)';
        context.lineWidth = Math.max(1, height * 0.08);
        context.strokeRect(x, y - height, width, height);
      }
      context.restore();
    } catch (err) {
      console.error('❌ Highlight error:', err);
    }
  };

  const handlePrevPage = () => {
    if (currentPage > 1) {
      setCurrentPage(currentPage - 1);
    }
  };

  const handleNextPage = () => {
    if (currentPage < numPages) {
      setCurrentPage(currentPage + 1);
    }
  };

  const handleZoomIn = () => {
    setScale(Math.min(scale + 0.2, 3.0));
  };

  const handleZoomOut = () => {
    setScale(Math.max(scale - 0.2, 0.5));
  };

  if (error) {
    return (
      <Card className={cn('p-4', className)}>
        <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground">
          <FileText className="h-12 w-12 mb-2 opacity-50" />
          <p className="text-sm">Failed to load PDF</p>
          <p className="text-xs mt-1">{error}</p>
        </div>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <Card className={cn('p-4', className)}>
        <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mb-2" />
          <p className="text-sm">Loading PDF...</p>
        </div>
      </Card>
    );
  }

  return (
    <Card className={cn('flex flex-col h-full', className)}>
      {/* Compact Toolbar */}
      <div className="flex items-center justify-between p-1.5 border-b bg-muted/50">
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={handlePrevPage}
            disabled={currentPage <= 1}
            className="h-6 w-6"
          >
            <ChevronLeft className="h-3 w-3" />
          </Button>
          <span className="text-xs font-medium px-1">
            {currentPage}/{numPages}
          </span>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleNextPage}
            disabled={currentPage >= numPages}
            className="h-6 w-6"
          >
            <ChevronRight className="h-3 w-3" />
          </Button>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={handleZoomOut}
            disabled={scale <= 0.5}
            className="h-6 w-6"
          >
            <ZoomOut className="h-3 w-3" />
          </Button>
          <span className="text-xs font-medium px-1">
            {Math.round(scale * 100)}%
          </span>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleZoomIn}
            disabled={scale >= 3.0}
            className="h-6 w-6"
          >
            <ZoomIn className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {/* PDF Canvas */}
      <div className="flex-1 overflow-auto bg-muted/30 p-2">
        <div className="flex justify-center">
          <canvas
            ref={canvasRef}
            className="shadow-md border border-border max-w-full h-auto"
          />
        </div>
      </div>
    </Card>
  );
}
