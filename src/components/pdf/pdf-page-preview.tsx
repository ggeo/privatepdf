'use client';

import React, { useEffect, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { Loader2 } from 'lucide-react';
import { getSignificantWords } from '@/lib/utils/highlight';
import { trace, info, warn, error as logError, debug } from '@tauri-apps/plugin-log';

// Configure PDF.js worker
if (typeof window !== 'undefined') {
  // Use worker from public folder (stable path, works in dev + production)
  pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
}

interface TextRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface PdfPagePreviewProps {
  documentId: string;
  pageNumber: number;
  highlightText?: string; // The actual chunk text to highlight (BEST METHOD!)
  highlightRects?: TextRect[]; // DEPRECATED - scale issues
  startOffset?: number; // DEPRECATED
  endOffset?: number;   // DEPRECATED
  className?: string;
  debugMode?: boolean; // Show all text items for debugging
}


/**
 * Simple PDF page preview for source cards
 * Shows a single page with highlighted text using dual canvas approach
 */
export function PdfPagePreview({ documentId, pageNumber, highlightRects, highlightText, startOffset, endOffset, className, debugMode = false }: PdfPagePreviewProps) {
  const pdfCanvasRef = useRef<HTMLCanvasElement>(null);
  const highlightCanvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let renderTask: any = null;

    const renderPage = async () => {
      if (!pdfCanvasRef.current || !highlightCanvasRef.current) return;

      try {
        setIsLoading(true);
        setError(null);

        // Get PDF from IndexedDB
        const { getDocument } = await import('@/lib/services/indexeddb-storage');
        const doc = await getDocument(documentId);

        if (!doc || !doc.fileData) {
          throw new Error('PDF not found');
        }

        if (cancelled) return;

        // Load PDF directly from ArrayBuffer (works in Tauri)
        const loadingTask = pdfjsLib.getDocument({ data: doc.fileData });
        const pdf = await loadingTask.promise;

        if (cancelled) return;

        // Get page
        const page = await pdf.getPage(pageNumber);
        if (cancelled) return;

        // Setup canvases
        const scale = 1.5; // Good quality for inline preview
        const viewport = page.getViewport({ scale });

        const pdfCanvas = pdfCanvasRef.current;
        const highlightCanvas = highlightCanvasRef.current;

        if (!pdfCanvas || !highlightCanvas || cancelled) return;

        // Set dimensions for both canvases
        pdfCanvas.height = highlightCanvas.height = viewport.height;
        pdfCanvas.width = highlightCanvas.width = viewport.width;

        const pdfContext = pdfCanvas.getContext('2d');
        const highlightContext = highlightCanvas.getContext('2d');

        if (!pdfContext || !highlightContext) return;

        // Render PDF on main canvas
        renderTask = page.render({
          canvasContext: pdfContext,
          viewport: viewport,
        });

        await renderTask.promise;

        if (cancelled) return;

        // Clear any previous highlights
        highlightContext.clearRect(0, 0, highlightCanvas.width, highlightCanvas.height);

        // Debug mode: show ALL text items
        if (debugMode) {
          console.log('🐛 DEBUG MODE: Drawing all text item boundaries');
          await debugDrawAllTextItems(page, viewport, highlightContext);
        }
        // BEST METHOD: Match chunk text to text layer at CURRENT scale
        if (highlightText && highlightText.length > 20) {
          console.log('✅ Highlighting by text matching at current viewport scale');
          await highlightByTextMatching(page, viewport, highlightContext, highlightText);
        } else if (!debugMode) {
          console.log('ℹ️ No highlight text provided');
        }

        setIsLoading(false);
      } catch (err: any) {
        if (!cancelled && err?.name !== 'RenderingCancelledException') {
          console.error('❌ Failed to render PDF page:', err);
          setError('Failed to load PDF page');
          setIsLoading(false);
        }
      }
    };

    renderPage();

    return () => {
      cancelled = true;
      if (renderTask) {
        try {
          renderTask.cancel();
        } catch (e) {
          // Ignore
        }
      }
    };
  }, [documentId, pageNumber, highlightText]);

  // CORRECT APPROACH: Find EXACT chunk text sequence in page, then highlight ONLY that
  const highlightByTextMatching = async (page: any, viewport: any, context: CanvasRenderingContext2D, chunkText: string) => {
    await info('🔍 Finding EXACT chunk text in PDF page...');
    console.log('🔍 Finding EXACT chunk text in PDF page...');

    // Get the text content at CURRENT viewport scale
    const textContent = await page.getTextContent();
    const items = textContent.items;

    await debug(`Got ${items.length} text items from PDF page`);

    // Log first 5 items to understand structure
    for (let i = 0; i < Math.min(5, items.length); i++) {
      const item = items[i] as any;
      await trace(`Item ${i}: "${item.str}" transform: [${item.transform.map((n: number) => n.toFixed(2)).join(', ')}] width: ${item.width}`);
    }

    // Use items in their original order from PDF.js (already correct)
    const sortedItems = [...items];

    // Build the full page text with SORTED item indices
    let fullPageText = '';
    const itemMap: Array<{ startChar: number; endChar: number; item: any; originalIndex: number }> = [];

    sortedItems.forEach((item: any, sortedIndex: number) => {
      if (!('str' in item) || !item.str) return;

      const startChar = fullPageText.length;
      fullPageText += item.str;
      const endChar = fullPageText.length;

      // Find original index
      const originalIndex = items.indexOf(item);
      itemMap.push({ startChar, endChar, item, originalIndex });

      // Add space between items (but track it properly)
      if (sortedIndex < sortedItems.length - 1) {
        fullPageText += ' ';
      }
    });

    await info(`📄 Page text: ${fullPageText.length} chars, ${items.length} text items`);
    await info(`📝 Chunk text: ${chunkText.length} chars`);

    // THIS IS THE PROBLEM: Chunk is almost entire page!
    const percentOfPage = ((chunkText.length / fullPageText.length) * 100).toFixed(1);
    await warn(`⚠️ Chunk is ${percentOfPage}% of the page!`);

    await debug(`📊 First 100 chars of page: ${fullPageText.substring(0, 100)}`);
    await debug(`📊 First 100 chars of chunk: ${chunkText.substring(0, 100)}`);
    await debug(`📊 Last 100 chars of chunk: ${chunkText.substring(chunkText.length - 100)}`);

    console.log(`📄 Page text: ${fullPageText.length} chars, ${items.length} text items`);
    console.log(`📝 Chunk text: ${chunkText.length} chars`);
    console.log(`📊 First 200 chars of page:`, fullPageText.substring(0, 200));

    // Normalize both texts for matching (keep single spaces)
    const normalizedPage = fullPageText.toLowerCase().replace(/\s+/g, ' ').trim();
    const normalizedChunk = chunkText.toLowerCase().replace(/\s+/g, ' ').trim();

    await info(`🔎 Searching for: ${normalizedChunk.substring(0, 100)}`);
    console.log(`🔎 Searching for:`, normalizedChunk.substring(0, 100));

    // Find the EXACT chunk text in the page text
    const matchIndex = normalizedPage.indexOf(normalizedChunk);

    await debug(`Match index: ${matchIndex}`);

    if (matchIndex === -1) {
      await warn('⚠️ Exact match not found. Trying fuzzy match...');
      console.warn('⚠️ Exact match not found. Trying fuzzy match...');

      // FALLBACK: Try matching first and last 30 characters
      const chunkStart = normalizedChunk.substring(0, 30);
      const chunkEnd = normalizedChunk.substring(normalizedChunk.length - 30);

      const startMatch = normalizedPage.indexOf(chunkStart);
      const endMatch = normalizedPage.indexOf(chunkEnd);

      if (startMatch !== -1 && endMatch !== -1 && endMatch > startMatch) {
        console.log('📍 Found partial match using start/end matching');
        // Highlight from start to end match
        return highlightByRange(startMatch, endMatch + 30, itemMap, viewport, context);
      }

      console.warn('❌ Could not find chunk text in page');
      return;
    }

    await info(`✅ Found exact match at position ${matchIndex}`);
    console.log(`✅ Found exact match at position ${matchIndex}`);

    const matchEnd = matchIndex + normalizedChunk.length;
    return highlightByRange(matchIndex, matchEnd, itemMap, viewport, context);
  };

  // Helper function to highlight a range of characters
  const highlightByRange = async (
    matchStart: number,
    matchEnd: number,
    itemMap: Array<{ startChar: number; endChar: number; item: any; originalIndex: number }>,
    viewport: any,
    context: CanvasRenderingContext2D
  ) => {
    // Find which text items fall within the match range
    const matchedItems: Array<any> = [];

    await info(`🔍 Looking for items in character range ${matchStart}-${matchEnd}`);

    itemMap.forEach(({ startChar, endChar, item }, index) => {
      // Check if this item overlaps with the match range
      // Using the actual character positions from itemMap
      const overlaps = endChar > matchStart && startChar < matchEnd;

      if (index < 10) {
        trace(`Item ${index}: "${item.str}" chars ${startChar}-${endChar}, overlaps: ${overlaps}`).catch(() => {});
      }

      if (overlaps) {
        matchedItems.push(item);
        if (matchedItems.length <= 5) {
          debug(`Matched: "${item.str}" (chars ${startChar}-${endChar})`).catch(() => {});
        }
      }
    });

    await warn(`🎯 Matched ${matchedItems.length} text items for highlighting - THIS SEEMS HIGH!`);
    console.log(`🎯 Matched ${matchedItems.length} text items for highlighting`);

    // Draw highlights for ONLY the matched items
    let drawnCount = 0;

    await info(`🎨 Drawing highlights for ${matchedItems.length} matched items`);

    for (const item of matchedItems) {
      if (!item || !item.transform) continue;

      const tx = pdfjsLib.Util.transform(viewport.transform, item.transform);
      const x = tx[4];
      const y = tx[5]; // This is the baseline

      // Calculate font size from transform matrix
      const fontHeight = Math.sqrt((tx[2] * tx[2]) + (tx[3] * tx[3]));

      // CRITICAL FIX: Use Canvas measureText for ACCURATE width!
      context.save();
      context.font = `${fontHeight}px sans-serif`;
      const metrics = context.measureText(item.str);
      const accurateWidth = metrics.width;
      context.restore();

      // Compare with old calculation for debugging
      const oldWidth = item.width * tx[0];

      if (drawnCount < 5) {
        await info(`[${drawnCount}] "${item.str}": measured=${accurateWidth.toFixed(1)}px vs calculated=${oldWidth.toFixed(1)}px`);
      }

      // Draw yellow highlight with ACCURATE width
      context.fillStyle = 'rgba(255, 255, 0, 0.4)';
      context.fillRect(x, y - fontHeight, accurateWidth, fontHeight);
      drawnCount++;

      if (drawnCount <= 5) {
        console.log(`  [${drawnCount}] ✓ "${item.str}" at (${Math.round(x)}, ${Math.round(y)}) size: ${Math.round(accurateWidth)}x${Math.round(fontHeight)}`);
      }
    }

    await info(`✅ Highlighted ${drawnCount} text items with accurate canvas-measured widths`);
    console.log(`✅ Highlighted ${drawnCount} text items`);
  };

  // Debug function: draw boxes around ALL text items
  const debugDrawAllTextItems = async (page: any, viewport: any, context: CanvasRenderingContext2D) => {
    const textContent = await page.getTextContent();
    const items = textContent.items;

    console.log(`🐛 Drawing ${items.length} text items`);

    items.forEach((item: any, index: number) => {
      if (!item.str) return;

      const tx = pdfjsLib.Util.transform(viewport.transform, item.transform);
      const x = tx[4];
      const y = tx[5]; // baseline
      const fontSize = Math.sqrt((tx[2] * tx[2]) + (tx[3] * tx[3]));

      // Use same width calculation as highlighting
      const width = item.width * tx[0]; // tx[0] is horizontal scale

      // Draw blue rectangles around all text items
      context.strokeStyle = 'rgba(0, 100, 255, 0.5)';
      context.lineWidth = 1;
      context.strokeRect(x, y - fontSize, width, fontSize);

      if (index < 10) {
        console.log(`  [${index}] "${item.str}" at (${Math.round(x)}, ${Math.round(y)}), width: ${Math.round(width)}, fontSize: ${Math.round(fontSize)}`);
      }
    });
  };

  // NEW: Highlight using character offsets (Themis approach - 100% accurate!)
  const highlightByOffsets = async (page: any, viewport: any, context: CanvasRenderingContext2D, startOffset: number, endOffset: number) => {
    try {
      const textContent = await page.getTextContent();
      const items = textContent.items;

      if (!items || items.length === 0) {
        console.warn('⚠️ No text items found on page');
        return;
      }

      // Build full page text and track character-to-item mapping
      let fullPageText = '';
      const charToItemMap: Array<{ itemIndex: number; charInItem: number }> = [];

      items.forEach((item: any, itemIndex: number) => {
        const str = item.str || '';
        for (let i = 0; i < str.length; i++) {
          charToItemMap.push({ itemIndex, charInItem: i });
          fullPageText += str[i];
        }
        // Add space between items
        if (itemIndex < items.length - 1) {
          charToItemMap.push({ itemIndex: -1, charInItem: -1 }); // Space
          fullPageText += ' ';
        }
      });

      console.log(`📄 Page has ${fullPageText.length} characters, ${items.length} text items`);
      console.log(`🎯 Highlighting chars ${startOffset} to ${endOffset}`);

      // Validate offsets
      if (startOffset < 0 || endOffset > fullPageText.length || startOffset >= endOffset) {
        console.error('❌ Invalid offsets:', { startOffset, endOffset, textLength: fullPageText.length });
        return;
      }

      // Find which items need highlighting
      const itemsToHighlight = new Set<number>();

      for (let pos = startOffset; pos < endOffset && pos < charToItemMap.length; pos++) {
        const mapping = charToItemMap[pos];
        if (mapping && mapping.itemIndex !== -1) {
          itemsToHighlight.add(mapping.itemIndex);
        }
      }

      console.log(`✅ Found ${itemsToHighlight.size} items to highlight`);

      // Draw highlights
      itemsToHighlight.forEach((itemIndex) => {
        const item = items[itemIndex];
        if (!item || !item.str) return;

        const tx = pdfjsLib.Util.transform(viewport.transform, item.transform);
        const x = tx[4];
        let y = tx[5];
        const fontSize = Math.sqrt((tx[2] * tx[2]) + (tx[3] * tx[3]));
        const width = item.width * Math.sqrt((tx[0] * tx[0]) + (tx[1] * tx[1]));

        y -= fontSize;

        context.fillStyle = 'rgba(255, 255, 0, 0.4)';
        context.fillRect(x, y, width, fontSize);
      });

      console.log('✅ Highlighting complete!');
    } catch (err) {
      console.error('❌ Failed to highlight by offsets:', err);
    }
  };

  // FALLBACK: Highlight text items containing keywords (less accurate)
  const highlightTextOnPage = async (page: any, viewport: any, context: CanvasRenderingContext2D, searchText: string) => {
    try {
      const textContent = await page.getTextContent();
      const items = textContent.items;

      if (!items || items.length === 0) {
        console.warn('⚠️ No text items found on page');
        return;
      }

      // Extract keywords (5+ chars)
      const keywords = searchText
        .toLowerCase()
        .split(/\s+/)
        .filter(word => word.length >= 5)
        .slice(0, 15);

      console.log('🔑 Keywords:', keywords.join(', '));

      let count = 0;

      // Highlight items containing keywords
      items.forEach((item: any) => {
        if (!item || !item.str) return;

        const lower = item.str.toLowerCase();
        if (!keywords.some(kw => lower.includes(kw))) return;

        const tx = pdfjsLib.Util.transform(viewport.transform, item.transform);
        const x = tx[4];
        let y = tx[5];
        const fontSize = Math.sqrt((tx[2] * tx[2]) + (tx[3] * tx[3]));
        const width = item.width * Math.sqrt((tx[0] * tx[0]) + (tx[1] * tx[1]));

        y -= fontSize;

        context.fillStyle = 'rgba(255, 255, 0, 0.3)';
        context.fillRect(x, y, width, fontSize);
        count++;
      });

      console.log(`✅ Highlighted ${count} items`);
    } catch (err) {
      console.error('❌ Failed:', err);
    }
  };

  if (error) {
    return (
      <div className="flex items-center justify-center p-4 text-sm text-muted-foreground">
        {error}
      </div>
    );
  }

  return (
    <div className={className}>
      {isLoading && (
        <div className="flex items-center justify-center p-8">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      )}
      <div ref={containerRef} className="relative inline-block">

        {/* Main PDF canvas */}
        <canvas
          ref={pdfCanvasRef}
          className={`max-w-full h-auto border border-border rounded shadow-sm ${isLoading ? 'hidden' : ''}`}
        />
        {/* Highlight overlay canvas */}
        <canvas
          ref={highlightCanvasRef}
          className={`absolute top-0 left-0 max-w-full h-auto pointer-events-none ${isLoading ? 'hidden' : ''}`}
          style={{ mixBlendMode: 'multiply' }}
        />
      </div>
    </div>
  );
}
