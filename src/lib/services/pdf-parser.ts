/**
 * PDF Parsing Service
 * Uses pdf.js to extract text from PDF files
 */

import * as pdfjsLib from 'pdfjs-dist';
import { ocrService } from './ocr-service';

// Configure pdf.js worker
if (typeof window !== 'undefined') {
  // Use worker from public folder (stable path, works in dev + production)
  pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
}

export interface PDFMetadata {
  title?: string;
  author?: string;
  subject?: string;
  creator?: string;
  producer?: string;
  creationDate?: Date;
  modificationDate?: Date;
  keywords?: string;
}

export interface PDFTextItem {
  str: string; // The text content
  x: number;   // X coordinate (PDF coordinates)
  y: number;   // Y coordinate (PDF coordinates)
  width: number;
  height: number;
}

export interface PDFPage {
  pageNumber: number;
  text: string;
  width: number;
  height: number;
  pageHeight: number; // Page height for coordinate transforms
  textItems?: PDFTextItem[]; // Individual text items with positions
  isScanned?: boolean; // True if OCR was used
  ocrConfidence?: number; // OCR confidence (0-100)
}

export interface PDFParseResult {
  metadata: PDFMetadata;
  pages: PDFPage[];
  totalPages: number;
  totalText: string;
  fileSize: number;
  fileName: string;
}

export interface PDFParseProgress {
  currentPage: number;
  totalPages: number;
  progress: number; // 0-100
  status: 'loading' | 'parsing' | 'ocr' | 'completed' | 'error';
  error?: string;
  ocrProgress?: number; // OCR-specific progress (0-100)
}

/**
 * Parse a PDF file and extract all text content
 */
export async function parsePDF(
  file: File,
  onProgress?: (progress: PDFParseProgress) => void
): Promise<PDFParseResult> {
  try {
    // Update progress: loading
    onProgress?.({
      currentPage: 0,
      totalPages: 0,
      progress: 0,
      status: 'loading',
    });

    // Load the PDF document
    const arrayBuffer = await file.arrayBuffer();
    const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
    const pdf = await loadingTask.promise;

    const totalPages = pdf.numPages;

    // Extract metadata
    const metadata = await extractMetadata(pdf);

    // Update progress: parsing started
    onProgress?.({
      currentPage: 0,
      totalPages,
      progress: 5,
      status: 'parsing',
    });

    // Extract text from all pages
    const pages: PDFPage[] = [];
    let totalText = '';

    for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const textContent = await page.getTextContent();
      const viewport = page.getViewport({ scale: 1 });

      // Extract text items with positions
      const textItems: PDFTextItem[] = [];
      const pdfjsLib = await import('pdfjs-dist');

      textContent.items.forEach((item: any) => {
        if (!('str' in item) || !item.str) return;

        // Get transform matrix to calculate position
        const tx = pdfjsLib.Util.transform(viewport.transform, item.transform);
        const x = tx[4];
        const yBottom = tx[5]; // Y at baseline
        const fontSize = Math.sqrt((tx[2] * tx[2]) + (tx[3] * tx[3]));
        const width = item.width * Math.sqrt((tx[0] * tx[0]) + (tx[1] * tx[1]));

        // CRITICAL: Invert Y coordinate from PDF (bottom-left origin) to Canvas (top-left origin)
        // PDF.js gives us Y from bottom, but Canvas draws from top
        const y = viewport.height - yBottom; // Invert Y axis

        textItems.push({
          str: item.str,
          x,
          y, // Already inverted for canvas
          width,
          height: fontSize,
        });
      });

      // Combine all text items
      let pageText = textContent.items
        .map((item: any) => {
          if ('str' in item) {
            return item.str;
          }
          return '';
        })
        .join(' ');

      let isScanned = false;
      let ocrConfidence: number | undefined;

      // Check if page has little to no text (likely scanned)
      const textLength = pageText.trim().length;
      const hasMinimalText = textLength < 50;

      if (hasMinimalText) {
        console.log(`📄 Page ${pageNum} appears to be scanned (${textLength} chars). Using OCR...`);

        // Update progress: OCR
        onProgress?.({
          currentPage: pageNum,
          totalPages,
          progress: 5 + ((pageNum / totalPages) * 95),
          status: 'ocr',
          ocrProgress: 0,
        });

        try {
          // Render page to canvas for OCR
          const scale = 2; // Higher scale for better OCR accuracy
          const scaledViewport = page.getViewport({ scale });
          const canvas = document.createElement('canvas');
          const context = canvas.getContext('2d')!;
          canvas.width = scaledViewport.width;
          canvas.height = scaledViewport.height;

          await page.render({
            canvasContext: context,
            viewport: scaledViewport,
          }).promise;

          // Run OCR
          const ocrResult = await ocrService.recognizeImage(canvas, (progress) => {
            onProgress?.({
              currentPage: pageNum,
              totalPages,
              progress: 5 + ((pageNum / totalPages) * 95),
              status: 'ocr',
              ocrProgress: Math.round(progress.progress * 100),
            });
          });

          pageText = ocrResult.text;
          isScanned = true;
          ocrConfidence = ocrResult.confidence;

          console.log(`✅ OCR completed for page ${pageNum}:`);
          console.log(`   - Confidence: ${ocrConfidence.toFixed(1)}%`);
          console.log(`   - Extracted text length: ${pageText.length} chars`);
          console.log(`   - Text preview: ${pageText.substring(0, 200)}...`);
        } catch (error) {
          console.error(`❌ Failed to OCR page ${pageNum}:`, error);
          console.error('Error details:', error);
          // Keep the original (empty) text
        }
      }

      pages.push({
        pageNumber: pageNum,
        text: pageText,
        width: viewport.width,
        height: viewport.height,
        pageHeight: viewport.height, // Store page height for coordinate transforms
        textItems, // Include text items with positions (Y already inverted!)
        isScanned,
        ocrConfidence,
      });

      totalText += pageText + '\n\n';

      // Update progress
      const progress = 5 + ((pageNum / totalPages) * 95);
      onProgress?.({
        currentPage: pageNum,
        totalPages,
        progress,
        status: 'parsing',
      });
    }

    // Update progress: completed
    onProgress?.({
      currentPage: totalPages,
      totalPages,
      progress: 100,
      status: 'completed',
    });

    return {
      metadata,
      pages,
      totalPages,
      totalText: totalText.trim(),
      fileSize: file.size,
      fileName: file.name,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    onProgress?.({
      currentPage: 0,
      totalPages: 0,
      progress: 0,
      status: 'error',
      error: errorMessage,
    });

    throw new Error(`Failed to parse PDF: ${errorMessage}`);
  }
}

/**
 * Extract metadata from PDF document
 */
async function extractMetadata(pdf: any): Promise<PDFMetadata> {
  try {
    const metadata = await pdf.getMetadata();
    const info = metadata.info;

    return {
      title: info?.Title || undefined,
      author: info?.Author || undefined,
      subject: info?.Subject || undefined,
      creator: info?.Creator || undefined,
      producer: info?.Producer || undefined,
      creationDate: info?.CreationDate ? parseDate(info.CreationDate) : undefined,
      modificationDate: info?.ModDate ? parseDate(info.ModDate) : undefined,
      keywords: info?.Keywords || undefined,
    };
  } catch (error) {
    console.warn('Failed to extract PDF metadata:', error);
    return {};
  }
}

/**
 * Parse PDF date string (format: D:YYYYMMDDHHmmSSOHH'mm')
 */
function parseDate(dateString: string): Date | undefined {
  try {
    // Remove D: prefix if present
    const cleaned = dateString.replace(/^D:/, '');

    // Extract components
    const year = parseInt(cleaned.substring(0, 4));
    const month = parseInt(cleaned.substring(4, 6)) - 1; // JS months are 0-indexed
    const day = parseInt(cleaned.substring(6, 8));
    const hour = parseInt(cleaned.substring(8, 10)) || 0;
    const minute = parseInt(cleaned.substring(10, 12)) || 0;
    const second = parseInt(cleaned.substring(12, 14)) || 0;

    return new Date(year, month, day, hour, minute, second);
  } catch (error) {
    console.warn('Failed to parse PDF date:', dateString);
    return undefined;
  }
}

/**
 * Validate PDF file
 */
export function validatePDF(file: File): {
  valid: boolean;
  error?: string;
} {
  // Check file type
  if (file.type !== 'application/pdf' && !file.name.endsWith('.pdf')) {
    return {
      valid: false,
      error: 'Invalid file type. Only PDF files are supported.',
    };
  }

  // Check file size (max 500MB from constants)
  const maxSize = 500 * 1024 * 1024; // 500MB
  if (file.size > maxSize) {
    return {
      valid: false,
      error: `File too large. Maximum size is 500MB (file is ${(file.size / 1024 / 1024).toFixed(2)}MB).`,
    };
  }

  // Check if file is empty
  if (file.size === 0) {
    return {
      valid: false,
      error: 'File is empty.',
    };
  }

  return { valid: true };
}

/**
 * Get a summary of PDF parse result
 */
export function getPDFSummary(result: PDFParseResult): string {
  const parts: string[] = [];

  parts.push(`${result.fileName}`);
  parts.push(`${result.totalPages} pages`);
  parts.push(`${(result.fileSize / 1024 / 1024).toFixed(2)}MB`);

  if (result.metadata.title) {
    parts.push(`Title: ${result.metadata.title}`);
  }

  const wordCount = result.totalText.split(/\s+/).length;
  parts.push(`~${wordCount.toLocaleString()} words`);

  return parts.join(' | ');
}

/**
 * Extract text from a specific page range
 */
export function extractPageRange(
  pages: PDFPage[],
  startPage: number,
  endPage: number
): string {
  return pages
    .filter((page) => page.pageNumber >= startPage && page.pageNumber <= endPage)
    .map((page) => page.text)
    .join('\n\n');
}

/**
 * Search for text in PDF pages
 */
export function searchInPDF(
  pages: PDFPage[],
  query: string,
  caseInsensitive: boolean = true
): Array<{
  pageNumber: number;
  matches: number;
  snippet: string;
}> {
  const results: Array<{
    pageNumber: number;
    matches: number;
    snippet: string;
  }> = [];

  const searchQuery = caseInsensitive ? query.toLowerCase() : query;

  for (const page of pages) {
    const pageText = caseInsensitive ? page.text.toLowerCase() : page.text;

    // Count matches
    const matches = (pageText.match(new RegExp(searchQuery, 'g')) || []).length;

    if (matches > 0) {
      // Find first occurrence and extract snippet
      const index = pageText.indexOf(searchQuery);
      const snippetStart = Math.max(0, index - 50);
      const snippetEnd = Math.min(page.text.length, index + searchQuery.length + 50);
      const snippet = '...' + page.text.substring(snippetStart, snippetEnd) + '...';

      results.push({
        pageNumber: page.pageNumber,
        matches,
        snippet,
      });
    }
  }

  return results;
}
