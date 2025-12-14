'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, FileText } from 'lucide-react';
import type { SearchResult } from '@/lib/services/semantic-search';
import { PdfPagePreview } from '@/components/pdf/pdf-page-preview';
import { Button } from '@/components/ui/button';
import {
  DEFAULT_HIGHLIGHT_MARK_CLASS,
  renderHighlightedHtml,
} from '@/lib/utils/highlight';

interface SourceCardProps {
  source: SearchResult;
  index: number;
}

export function SourceCard({ source, index }: SourceCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [showPdfPreview, setShowPdfPreview] = useState(false);

  const fullText = source.snippet ?? '';
  // With 256-token chunks (~1024 chars), show preview with expand option
  const previewText =
    fullText.length > 400 ? `${fullText.slice(0, 300)}...` : fullText;
  const shouldShowExpand = fullText.length > 400;

  // Use the chunk text directly for highlighting
  // 256-token chunks (~1024 chars) provide balanced context and precision
  const pdfHighlightText = useMemo(() => {
    return source.chunk.text.trim();
  }, [source.chunk.text]);

  // Debug logging
  useEffect(() => {
    console.log('🎯 SourceCard data:', {
      fullTextLength: fullText.length,
      pdfHighlightLength: pdfHighlightText.length,
      areTheSame: fullText === pdfHighlightText,
      fullTextFull: fullText,
      pdfHighlightFull: pdfHighlightText,
      pageNumber: source.pageNumber,
    });
  }, [pdfHighlightText, source.pageNumber, fullText]);

  // For HTML rendering, use the SAME highlight text
  const renderedText = useMemo(() => {
    const text = isExpanded ? fullText : previewText;
    const { html } = renderHighlightedHtml(text, pdfHighlightText, {
      markClass: DEFAULT_HIGHLIGHT_MARK_CLASS,
    });
    return html;
  }, [fullText, previewText, pdfHighlightText, isExpanded]);

  const handleTogglePdfPreview = useCallback(
    (event: React.MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();

      if (!source.pageNumber || !source.chunk.documentId) {
        return;
      }

      // Toggle PDF preview AND expand text
      setShowPdfPreview((prev) => !prev);
      if (!showPdfPreview) {
        setIsExpanded(true); // Also expand text when showing PDF
      }
    },
    [source, showPdfPreview]
  );

  return (
    <div className="relative rounded-lg border-2 border-border bg-card p-4 text-sm shadow-sm transition-all hover:bg-muted">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b pb-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-base font-bold text-primary">
            {source.pageNumber ? `Page ${source.pageNumber}` : `Source ${index + 1}`}
          </span>
          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
            {Math.round(source.similarity * 100)}% match
          </span>
        </div>
        <div className="flex items-center gap-2">
          {source.pageNumber && source.chunk.documentId && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="flex h-7 items-center gap-1 rounded-md border-primary bg-primary/10 px-3 text-xs hover:bg-primary hover:text-primary-foreground"
              onClick={handleTogglePdfPreview}
            >
              <FileText className="h-3 w-3" />
              <span>{showPdfPreview ? 'Hide' : 'Show'} PDF</span>
            </Button>
          )}
          {shouldShowExpand && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="flex h-7 items-center gap-1 px-2 text-xs text-muted-foreground hover:text-primary"
              onClick={() => setIsExpanded((prev) => !prev)}
            >
              {isExpanded ? (
                <>
                  <span>Show less</span>
                  <ChevronUp className="h-3 w-3" />
                </>
              ) : (
                <>
                  <span>Show full text</span>
                  <ChevronDown className="h-3 w-3" />
                </>
              )}
            </Button>
          )}
        </div>
      </div>

      <div
        className="whitespace-pre-wrap leading-relaxed text-muted-foreground"
        dangerouslySetInnerHTML={{
          __html: renderedText,
        }}
      />

      {/* PDF Page Preview - shown when expanded */}
      {showPdfPreview && source.pageNumber && source.chunk.documentId && (
        <div className="mt-4 border-t pt-4">
          <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
            <FileText className="h-3 w-3" />
            <span>PDF Page {source.pageNumber}</span>
          </div>
          <PdfPagePreview
            documentId={source.chunk.documentId}
            pageNumber={source.pageNumber}
            highlightText={pdfHighlightText} // Use the same highlight text as displayed above
            className="rounded border border-border bg-muted/30 p-2"
          />
        </div>
      )}
    </div>
  );
}
