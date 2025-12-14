/**
 * Document Processing Orchestrator
 * Coordinates document parsing (PDF/Image/DOCX), chunking, embedding, and storage
 */

import { parsePDF, validatePDF, type PDFParseResult } from './pdf-parser';
import { parseImage, validateImage, type ImageParseResult } from './image-processor';
import { parseDocx, validateDocx, type DocxParseResult } from './docx-processor';
import { chunkByPages, type TextChunk } from '@/lib/utils/text-chunker';
import { generateEmbeddings } from './embedding-generator';
import {
  saveDocument,
  saveChunks,
  type StoredDocument,
  type StoredChunk,
} from './indexeddb-storage';
import { PDF_SETTINGS } from '@/lib/constants';

// Union type for all parse results
type ParseResult = PDFParseResult | ImageParseResult | DocxParseResult;

export interface ProcessingProgress {
  stage:
    | 'validating'
    | 'parsing'
    | 'chunking'
    | 'embedding'
    | 'storing'
    | 'completed'
    | 'error';
  progress: number; // 0-100
  message: string;
  currentPage?: number;
  totalPages?: number;
  currentChunk?: number;
  totalChunks?: number;
  error?: string;
}

export interface ProcessingResult {
  documentId: string;
  document: StoredDocument;
  chunks: StoredChunk[];
  processingTime: number; // milliseconds
  stats: {
    totalPages: number;
    totalChunks: number;
    totalTokens: number;
    fileSize: number;
  };
}

/**
 * Detect file type from File object
 */
function getFileType(file: File): 'pdf' | 'image' | 'docx' | 'unknown' {
  const ext = file.name.toLowerCase();

  if (file.type === 'application/pdf' || ext.endsWith('.pdf')) {
    return 'pdf';
  }

  if (file.type.startsWith('image/') || ext.endsWith('.jpg') || ext.endsWith('.jpeg') || ext.endsWith('.png')) {
    return 'image';
  }

  if (file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || ext.endsWith('.docx')) {
    return 'docx';
  }

  return 'unknown';
}

/**
 * Process a document (PDF/Image/DOCX) end-to-end
 */
export async function processDocument(
  file: File,
  onProgress?: (progress: ProcessingProgress) => void
): Promise<ProcessingResult> {
  const startTime = performance.now();
  const documentId = crypto.randomUUID();
  const fileType = getFileType(file);

  try {
    // Stage 1: Validate file
    onProgress?.({
      stage: 'validating',
      progress: 0,
      message: `Validating ${fileType.toUpperCase()} file...`,
    });

    let validation;
    if (fileType === 'pdf') {
      validation = validatePDF(file);
    } else if (fileType === 'image') {
      validation = validateImage(file);
    } else if (fileType === 'docx') {
      validation = validateDocx(file);
    } else {
      throw new Error('Unsupported file type');
    }

    if (!validation.valid) {
      throw new Error(validation.error);
    }

    // Stage 2: Parse file
    onProgress?.({
      stage: 'parsing',
      progress: 5,
      message: `Processing ${fileType.toUpperCase()} and extracting text...`,
    });

    let parseResult: ParseResult;

    if (fileType === 'pdf') {
      parseResult = await parsePDF(file, (parseProgress) => {
        const message = parseProgress.status === 'ocr'
          ? `OCR processing page ${parseProgress.currentPage} of ${parseProgress.totalPages}... ${parseProgress.ocrProgress || 0}%`
          : `Parsing page ${parseProgress.currentPage} of ${parseProgress.totalPages}...`;

        onProgress?.({
          stage: 'parsing',
          progress: 5 + (parseProgress.progress / 100) * 30,
          message,
          currentPage: parseProgress.currentPage,
          totalPages: parseProgress.totalPages,
        });
      });
    } else if (fileType === 'image') {
      parseResult = await parseImage(file, (parseProgress) => {
        const message = parseProgress.status === 'ocr'
          ? `OCR processing image... ${parseProgress.ocrProgress || 0}%`
          : `Loading image...`;

        onProgress?.({
          stage: 'parsing',
          progress: 5 + (parseProgress.progress / 100) * 30,
          message,
          currentPage: parseProgress.currentPage,
          totalPages: parseProgress.totalPages,
        });
      });
    } else if (fileType === 'docx') {
      parseResult = await parseDocx(file, (parseProgress) => {
        onProgress?.({
          stage: 'parsing',
          progress: 5 + (parseProgress.progress / 100) * 30,
          message: 'Extracting text from Word document...',
          currentPage: parseProgress.currentPage,
          totalPages: parseProgress.totalPages,
        });
      });
    } else {
      throw new Error('Unsupported file type');
    }

    // Check if document is too large (max pages)
    if (parseResult.totalPages > PDF_SETTINGS.maxPages) {
      throw new Error(
        `Document has too many pages. Maximum is ${PDF_SETTINGS.maxPages} pages.`
      );
    }

    // Stage 3: Chunk text
    onProgress?.({
      stage: 'chunking',
      progress: 35,
      message: 'Splitting text into chunks...',
    });

    const chunks = chunkByPages(
      parseResult.pages.map((p) => ({
        pageNumber: p.pageNumber,
        text: p.text,
        textItems: 'textItems' in p ? p.textItems : undefined, // Include text items for PDF highlighting
      })),
      documentId,
      {
        chunkSize: PDF_SETTINGS.defaultChunkSize,
        chunkOverlap: PDF_SETTINGS.defaultChunkOverlap,
        preserveSentences: true,
      }
    );

    console.log('✅ Chunking complete!', {
      totalPages: parseResult.totalPages,
      totalChunks: chunks.length,
      firstChunk: chunks[0]?.text.substring(0, 100),
      lastChunk: chunks[chunks.length - 1]?.text.substring(0, 100),
    });

    onProgress?.({
      stage: 'chunking',
      progress: 40,
      message: `Created ${chunks.length} chunks`,
    });

    // Stage 4: Generate embeddings
    onProgress?.({
      stage: 'embedding',
      progress: 50,
      message: 'Generating embeddings...',
    });

    // Generate embeddings for all chunks
    const chunkTexts = chunks.map((c) => c.text);
    const embeddings = await generateEmbeddings(chunkTexts, (embProgress) => {
      onProgress?.({
        stage: 'embedding',
        progress: 50 + (embProgress.progress / 100) * 40,
        message: `Generating embedding ${embProgress.current} of ${embProgress.total}...`,
        currentChunk: embProgress.current,
        totalChunks: embProgress.total,
      });
    });

    // Stage 5: Store in IndexedDB
    onProgress?.({
      stage: 'storing',
      progress: 90,
      message: 'Saving to local storage...',
    });

    // Get file data as ArrayBuffer for PDF preview
    const fileData = await file.arrayBuffer();

    // Create stored document
    const storedDocument: StoredDocument = {
      id: documentId,
      fileName: file.name,
      fileSize: file.size,
      totalPages: parseResult.totalPages,
      metadata: fileType === 'pdf' && 'title' in parseResult.metadata
        ? {
            title: parseResult.metadata.title,
            author: parseResult.metadata.author,
            creationDate: parseResult.metadata.creationDate?.toISOString(),
          }
        : {}, // Image and DOCX files don't have title/author metadata
      uploadedAt: Date.now(),
      processedAt: Date.now(),
      status: 'completed',
      fileData, // Store the file data for PDF preview
    };

    // Save document
    await saveDocument(storedDocument);

    // Create stored chunks with embeddings
    const storedChunks: StoredChunk[] = chunks.map((chunk, index) => ({
      id: chunk.id,
      documentId,
      text: chunk.text,
      tokens: chunk.tokens,
      pageNumber: chunk.pageNumber,
      chunkIndex: chunk.chunkIndex,
      startIndex: chunk.startIndex, // Character offset for highlighting
      endIndex: chunk.endIndex,     // Character offset for highlighting
      rects: chunk.rects,           // Bounding rectangles for PDF highlighting
      embedding: embeddings[index]!.vector,
      createdAt: Date.now(),
    }));

    // Save chunks
    console.log('💾 Saving chunks to IndexedDB:', {
      totalChunks: storedChunks.length,
      documentId,
      sampleChunkIds: storedChunks.slice(0, 3).map(c => c.id),
    });
    await saveChunks(storedChunks);
    console.log('✅ Chunks saved successfully!');

    onProgress?.({
      stage: 'storing',
      progress: 95,
      message: 'Saved successfully!',
    });

    // Stage 6: Complete
    const processingTime = performance.now() - startTime;

    onProgress?.({
      stage: 'completed',
      progress: 100,
      message: 'Processing complete!',
    });

    // Calculate stats
    const totalTokens = chunks.reduce((sum, c) => sum + c.tokens, 0);

    return {
      documentId,
      document: storedDocument,
      chunks: storedChunks,
      processingTime,
      stats: {
        totalPages: parseResult.totalPages,
        totalChunks: chunks.length,
        totalTokens,
        fileSize: file.size,
      },
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    onProgress?.({
      stage: 'error',
      progress: 0,
      message: 'Processing failed',
      error: errorMessage,
    });

    // Save document with error status
    try {
      const errorDocument: StoredDocument = {
        id: documentId,
        fileName: file.name,
        fileSize: file.size,
        totalPages: 0,
        metadata: {},
        uploadedAt: Date.now(),
        status: 'error',
        error: errorMessage,
      };
      await saveDocument(errorDocument);
    } catch (saveError) {
      console.error('Failed to save error document:', saveError);
    }

    throw new Error(`Document processing failed: ${errorMessage}`);
  }
}

/**
 * Get processing estimate (time and cost)
 */
export function estimateProcessing(
  fileSize: number,
  pageCount?: number
): {
  estimatedTime: number; // seconds
  estimatedChunks: number;
  warnings: string[];
} {
  const warnings: string[] = [];

  // Estimate pages if not provided (rough: 1 page = 50KB)
  const estimatedPages = pageCount || Math.ceil(fileSize / 50000);

  // Estimate chunks (rough: 1 page = 2 chunks)
  const estimatedChunks = estimatedPages * 2;

  // Estimate time
  // - Parsing: ~0.1s per page
  // - Chunking: ~0.05s per page
  // - Embedding: ~0.2s per chunk (varies by hardware)
  const parsingTime = estimatedPages * 0.1;
  const chunkingTime = estimatedPages * 0.05;
  const embeddingTime = estimatedChunks * 0.2;
  const totalTime = parsingTime + chunkingTime + embeddingTime;

  // Warnings
  if (estimatedPages > 100) {
    warnings.push('Large document - may take several minutes to process');
  }

  if (estimatedPages > PDF_SETTINGS.maxPages) {
    warnings.push(`Document exceeds maximum ${PDF_SETTINGS.maxPages} pages`);
  }

  if (fileSize > PDF_SETTINGS.maxFileSize) {
    warnings.push(
      `File exceeds maximum ${PDF_SETTINGS.maxFileSize / 1024 / 1024}MB`
    );
  }

  return {
    estimatedTime: Math.ceil(totalTime),
    estimatedChunks,
    warnings,
  };
}

/**
 * Format processing time for display
 */
export function formatProcessingTime(milliseconds: number): string {
  const seconds = milliseconds / 1000;

  if (seconds < 60) {
    return `${seconds.toFixed(1)}s`;
  }

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60);

  return `${minutes}m ${remainingSeconds}s`;
}

/**
 * Format file size for display
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes}B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)}KB`;
  }

  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

/**
 * Get processing summary for display
 */
export function getProcessingSummary(result: ProcessingResult): string {
  const parts: string[] = [];

  parts.push(`${result.stats.totalPages} pages`);
  parts.push(`${result.stats.totalChunks} chunks`);
  parts.push(`~${result.stats.totalTokens.toLocaleString()} tokens`);
  parts.push(`${formatProcessingTime(result.processingTime)}`);

  return parts.join(' | ');
}
