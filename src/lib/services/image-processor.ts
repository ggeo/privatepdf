/**
 * Image Processing Service
 * Extracts text from images using OCR
 */

import { ocrService } from './ocr-service';

export interface ImageMetadata {
  fileName: string;
  fileSize: number;
  width: number;
  height: number;
  format: string;
}

export interface ImagePage {
  pageNumber: number;
  text: string;
  width: number;
  height: number;
  ocrConfidence: number;
}

export interface ImageParseResult {
  metadata: ImageMetadata;
  pages: ImagePage[];
  totalPages: number;
  totalText: string;
  fileSize: number;
  fileName: string;
}

export interface ImageParseProgress {
  currentPage: number;
  totalPages: number;
  progress: number; // 0-100
  status: 'loading' | 'ocr' | 'completed' | 'error';
  error?: string;
  ocrProgress?: number;
}

/**
 * Parse an image file and extract text using OCR
 */
export async function parseImage(
  file: File,
  onProgress?: (progress: ImageParseProgress) => void
): Promise<ImageParseResult> {
  try {
    // Update progress: loading
    onProgress?.({
      currentPage: 0,
      totalPages: 1,
      progress: 0,
      status: 'loading',
    });

    // Load image to get dimensions
    const img = await loadImage(file);

    // Create canvas from image
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d')!;
    canvas.width = img.width;
    canvas.height = img.height;
    ctx.drawImage(img, 0, 0);

    // Update progress: OCR
    onProgress?.({
      currentPage: 1,
      totalPages: 1,
      progress: 10,
      status: 'ocr',
      ocrProgress: 0,
    });

    console.log(`🖼️  Processing image: ${file.name} (${img.width}x${img.height})`);

    // Run OCR
    const ocrResult = await ocrService.recognizeImage(canvas, (progress) => {
      onProgress?.({
        currentPage: 1,
        totalPages: 1,
        progress: 10 + (progress.progress * 90),
        status: 'ocr',
        ocrProgress: Math.round(progress.progress * 100),
      });
    });

    console.log(`✅ OCR completed for image:`);
    console.log(`   - Confidence: ${ocrResult.confidence.toFixed(1)}%`);
    console.log(`   - Extracted text length: ${ocrResult.text.length} chars`);
    console.log(`   - Text preview: ${ocrResult.text.substring(0, 200)}...`);

    // Update progress: completed
    onProgress?.({
      currentPage: 1,
      totalPages: 1,
      progress: 100,
      status: 'completed',
    });

    const page: ImagePage = {
      pageNumber: 1,
      text: ocrResult.text,
      width: img.width,
      height: img.height,
      ocrConfidence: ocrResult.confidence,
    };

    return {
      metadata: {
        fileName: file.name,
        fileSize: file.size,
        width: img.width,
        height: img.height,
        format: file.type,
      },
      pages: [page],
      totalPages: 1,
      totalText: ocrResult.text,
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

    throw new Error(`Failed to parse image: ${errorMessage}`);
  }
}

/**
 * Load image from file
 */
function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image'));
    };

    img.src = url;
  });
}

/**
 * Validate image file
 */
export function validateImage(file: File): {
  valid: boolean;
  error?: string;
} {
  // Check file type
  const validTypes = ['image/jpeg', 'image/jpg', 'image/png'];
  if (!validTypes.includes(file.type)) {
    return {
      valid: false,
      error: 'Invalid file type. Only JPG and PNG images are supported.',
    };
  }

  // Check file size (max 50MB)
  const maxSize = 50 * 1024 * 1024;
  if (file.size > maxSize) {
    return {
      valid: false,
      error: `File too large. Maximum size is 50MB (file is ${(file.size / 1024 / 1024).toFixed(2)}MB).`,
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
