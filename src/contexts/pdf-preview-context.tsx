'use client';

import React, { createContext, useContext, useState } from 'react';

interface PdfPreviewContextType {
  selectedDocumentId: string | null;
  selectedPageNumber: number;
  highlightText: string | undefined;
  setSelectedDocument: (documentId: string | null) => void;
  setSelectedPage: (pageNumber: number) => void;
  setHighlightText: (text: string | undefined) => void;
  jumpToPage: (documentId: string, pageNumber: number, highlightText?: string) => void;
}

const PdfPreviewContext = createContext<PdfPreviewContextType | undefined>(undefined);

export function PdfPreviewProvider({ children }: { children: React.ReactNode }) {
  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(null);
  const [selectedPageNumber, setSelectedPageNumber] = useState<number>(1);
  const [highlightText, setHighlightText] = useState<string | undefined>(undefined);

  const jumpToPage = (documentId: string, pageNumber: number, text?: string) => {
    console.log('🎯 jumpToPage called with:', {
      documentId,
      pageNumber,
      textLength: text?.length || 0
    });

    setSelectedDocumentId(documentId);
    setSelectedPageNumber(pageNumber);
    setHighlightText(text);

    console.log('✅ State updated:', {
      selectedDocumentId: documentId,
      selectedPageNumber: pageNumber,
      hasHighlightText: !!text
    });
  };

  return (
    <PdfPreviewContext.Provider
      value={{
        selectedDocumentId,
        selectedPageNumber,
        highlightText,
        setSelectedDocument: setSelectedDocumentId,
        setSelectedPage: setSelectedPageNumber,
        setHighlightText,
        jumpToPage,
      }}
    >
      {children}
    </PdfPreviewContext.Provider>
  );
}

export function usePdfPreview() {
  const context = useContext(PdfPreviewContext);
  if (context === undefined) {
    throw new Error('usePdfPreview must be used within a PdfPreviewProvider');
  }
  return context;
}
