/**
 * OCR Service using Tesseract.js
 * Extracts text from scanned PDFs (images)
 */

import { createWorker, type Worker } from 'tesseract.js';

export interface OCRProgress {
  status: string;
  progress: number; // 0-1
}

export interface OCRResult {
  text: string;
  confidence: number;
}

class OCRService {
  private worker: Worker | null = null;

  /**
   * Initialize Tesseract worker
   */
  async initialize(onProgress?: (progress: OCRProgress) => void): Promise<void> {
    if (this.worker) return; // Already initialized

    console.log('🔍 Initializing OCR worker with English + Greek support...');

    // Support both English and Greek languages
    this.worker = await createWorker(['eng', 'ell'], 1, {
      logger: (m) => {
        if (onProgress && m.status && m.progress !== undefined) {
          onProgress({
            status: m.status,
            progress: m.progress,
          });
        }
        console.log('OCR:', m);
      },
    });

    console.log('✅ OCR worker initialized');
  }

  /**
   * Extract text from an image using OCR
   */
  async recognizeImage(
    imageData: ImageData | HTMLCanvasElement,
    onProgress?: (progress: OCRProgress) => void
  ): Promise<OCRResult> {
    if (!this.worker) {
      await this.initialize(onProgress);
    }

    const result = await this.worker!.recognize(imageData as any);

    return {
      text: result.data.text,
      confidence: result.data.confidence,
    };
  }

  /**
   * Extract text from multiple images (for multi-page PDFs)
   */
  async recognizeImages(
    images: (ImageData | HTMLCanvasElement)[],
    onProgress?: (pageIndex: number, totalPages: number, ocrProgress: OCRProgress) => void
  ): Promise<OCRResult[]> {
    if (!this.worker) {
      await this.initialize();
    }

    const results: OCRResult[] = [];

    for (let i = 0; i < images.length; i++) {
      const image = images[i];
      if (!image) continue;

      console.log(`🔍 Processing page ${i + 1}/${images.length} with OCR...`);

      const result = await this.recognizeImage(image, (progress) => {
        onProgress?.(i, images.length, progress);
      });

      results.push(result);
    }

    return results;
  }

  /**
   * Terminate the worker to free up memory
   */
  async terminate(): Promise<void> {
    if (this.worker) {
      await this.worker.terminate();
      this.worker = null;
      console.log('🔍 OCR worker terminated');
    }
  }
}

// Export singleton instance
export const ocrService = new OCRService();
