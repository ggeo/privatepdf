/**
 * Ollama-based Embedding Generation Service
 * Uses Ollama for fast, native embedding generation
 */

import { ollamaService } from './ollama-service';

export interface Embedding {
  vector: number[];
  dimension: number;
}

export interface EmbeddingProgress {
  current: number;
  total: number;
  progress: number;
  message: string;
}

/**
 * Generate embedding for a single text using Ollama
 */
export async function generateEmbedding(text: string): Promise<Embedding> {
  try {
    const vector = await ollamaService.generateEmbedding(text);
    return {
      vector,
      dimension: vector.length,
    };
  } catch (error: any) {
    throw new Error(`Failed to generate embedding: ${error.message}`);
  }
}

/**
 * Generate embeddings for multiple texts (batch processing)
 */
export async function generateEmbeddings(
  texts: string[],
  onProgress?: (progress: EmbeddingProgress) => void
): Promise<Embedding[]> {
  const embeddings: Embedding[] = [];
  const total = texts.length;

  for (let i = 0; i < total; i++) {
    const current = i + 1;
    const text = texts[i];

    if (text) { // Ensure text is not undefined
      // Report progress
      onProgress?.({
        current,
        total,
        progress: Math.round((current / total) * 100),
        message: `Generating embedding ${current}/${total}`,
      });

      // Generate embedding
      const embedding = await generateEmbedding(text);
      embeddings.push(embedding);
    }
  }

  return embeddings;
}

/**
 * Calculate cosine similarity between two embeddings
 */
export function cosineSimilarity(embedding1: number[], embedding2: number[]): number {
  if (embedding1.length !== embedding2.length) {
    throw new Error('Embeddings must have the same dimension');
  }

  let dotProduct = 0;
  let norm1 = 0;
  let norm2 = 0;

  for (let i = 0; i < embedding1.length; i++) {
    dotProduct += embedding1[i]! * embedding2[i]!;
    norm1 += embedding1[i]! * embedding1[i]!;
    norm2 += embedding2[i]! * embedding2[i]!;
  }

  norm1 = Math.sqrt(norm1);
  norm2 = Math.sqrt(norm2);

  if (norm1 === 0 || norm2 === 0) {
    return 0;
  }

  return dotProduct / (norm1 * norm2);
}

/**
 * Get information about the current embedding model
 */
export function getEmbeddingInfo(): {
  model: string;
  name: string;
  dimensions: number;
  size: string;
} {
  return {
    model: 'nomic-embed-text',
    name: 'Nomic Embed Text',
    dimensions: 768,
    size: '274MB',
  };
}