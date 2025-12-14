/**
 * DOCX Processing Service
 * Extracts text from Word documents
 */

import mammoth from 'mammoth';

export interface DocxMetadata {
  fileName: string;
  fileSize: number;
}

export interface DocxPage {
  pageNumber: number;
  text: string;
}

export interface DocxParseResult {
  metadata: DocxMetadata;
  pages: DocxPage[];
  totalPages: number;
  totalText: string;
  fileSize: number;
  fileName: string;
}

export interface DocxParseProgress {
  currentPage: number;
  totalPages: number;
  progress: number; // 0-100
  status: 'loading' | 'parsing' | 'completed' | 'error';
  error?: string;
}

/**
 * Parse a DOCX file and extract text
 */
export async function parseDocx(
  file: File,
  onProgress?: (progress: DocxParseProgress) => void
): Promise<DocxParseResult> {
  try {
    // Update progress: loading
    onProgress?.({
      currentPage: 0,
      totalPages: 1,
      progress: 0,
      status: 'loading',
    });

    console.log(`📄 Processing DOCX: ${file.name}`);

    // Update progress: parsing
    onProgress?.({
      currentPage: 0,
      totalPages: 1,
      progress: 10,
      status: 'parsing',
    });

    // Read file as array buffer
    const arrayBuffer = await file.arrayBuffer();

    // Extract text using mammoth
    const result = await mammoth.extractRawText({ arrayBuffer });

    const text = result.value.trim();
    const wordCount = text.split(/\s+/).length;

    console.log(`✅ DOCX parsing completed:`);
    console.log(`   - Extracted text length: ${text.length} chars`);
    console.log(`   - Word count: ${wordCount}`);
    console.log(`   - Text preview: ${text.substring(0, 200)}...`);

    if (result.messages.length > 0) {
      console.warn('Mammoth warnings:', result.messages);
    }

    // Split into pages (approximate - DOCX doesn't have pages like PDF)
    // We'll create "pages" by splitting at ~500 words
    const pages = splitIntoPages(text, 500);

    // Update progress: completed
    onProgress?.({
      currentPage: pages.length,
      totalPages: pages.length,
      progress: 100,
      status: 'completed',
    });

    return {
      metadata: {
        fileName: file.name,
        fileSize: file.size,
      },
      pages,
      totalPages: pages.length,
      totalText: text,
      fileSize: file.size,
      fileName: file.name,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    onProgress?.({
      currentPage: 0,
      totalPages: 1,
      progress: 0,
      status: 'error',
      error: errorMessage,
    });

    throw new Error(`Failed to parse DOCX: ${errorMessage}`);
  }
}

/**
 * Split text into approximate "pages" based on word count
 */
function splitIntoPages(text: string, wordsPerPage: number): DocxPage[] {
  const words = text.split(/\s+/);
  const pages: DocxPage[] = [];
  let pageNumber = 1;

  for (let i = 0; i < words.length; i += wordsPerPage) {
    const pageWords = words.slice(i, i + wordsPerPage);
    const pageText = pageWords.join(' ');

    pages.push({
      pageNumber,
      text: pageText,
    });

    pageNumber++;
  }

  // If no pages created (empty document), create one empty page
  if (pages.length === 0) {
    pages.push({
      pageNumber: 1,
      text: '',
    });
  }

  return pages;
}

/**
 * Validate DOCX file
 */
export function validateDocx(file: File): {
  valid: boolean;
  error?: string;
} {
  // Check file type
  const validTypes = [
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/msword',
  ];
  const validExtensions = ['.docx', '.doc'];

  const hasValidType = validTypes.includes(file.type);
  const hasValidExtension = validExtensions.some((ext) =>
    file.name.toLowerCase().endsWith(ext)
  );

  if (!hasValidType && !hasValidExtension) {
    return {
      valid: false,
      error: 'Invalid file type. Only DOCX files are supported.',
    };
  }

  // Check file size (max 100MB)
  const maxSize = 100 * 1024 * 1024;
  if (file.size > maxSize) {
    return {
      valid: false,
      error: `File too large. Maximum size is 100MB (file is ${(file.size / 1024 / 1024).toFixed(2)}MB).`,
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
