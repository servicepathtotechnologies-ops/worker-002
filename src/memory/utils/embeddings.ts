/**
 * Embedding Generation Utility
 * Generates vector embeddings for workflow descriptions and content
 */

import OpenAI from 'openai';
import { config } from '../../core/config';

export interface EmbeddingConfig {
  model: string;
  dimensions: number;
  apiKey?: string;
}

/**
 * Embedding Generator
 * Supports OpenAI embeddings (can be extended for other providers)
 */
export class EmbeddingGenerator {
  private openai: OpenAI | null = null;
  private config: EmbeddingConfig;
  private model: string;

  constructor(embeddingConfig?: Partial<EmbeddingConfig>) {
    this.config = {
      model: embeddingConfig?.model || 'text-embedding-3-small',
      dimensions: embeddingConfig?.dimensions || 1536,
      apiKey: embeddingConfig?.apiKey || config.openaiApiKey,
    };
    this.model = this.config.model;

    // Initialize OpenAI client if API key is available
    if (this.config.apiKey) {
      this.openai = new OpenAI({
        apiKey: this.config.apiKey,
      });
    }
  }

  /**
   * Generate embedding for text content
   */
  async generateEmbedding(text: string): Promise<number[]> {
    if (!this.openai) {
      throw new Error('OpenAI API key not configured. Set OPENAI_API_KEY environment variable.');
    }

    try {
      const response = await this.openai.embeddings.create({
        model: this.model,
        input: text,
        dimensions: this.config.dimensions,
      });

      return response.data[0].embedding;
    } catch (error: any) {
      throw new Error(`Failed to generate embedding: ${error.message}`);
    }
  }

  /**
   * Generate embeddings for multiple texts (batch)
   */
  async generateEmbeddings(texts: string[]): Promise<number[][]> {
    if (!this.openai) {
      throw new Error('OpenAI API key not configured. Set OPENAI_API_KEY environment variable.');
    }

    try {
      const response = await this.openai.embeddings.create({
        model: this.model,
        input: texts,
        dimensions: this.config.dimensions,
      });

      return response.data.map((item: { embedding: number[] }) => item.embedding);
    } catch (error: any) {
      throw new Error(`Failed to generate embeddings: ${error.message}`);
    }
  }

  /**
   * Generate embedding for workflow definition
   * Creates a text representation of the workflow for embedding
   */
  async generateWorkflowEmbedding(workflow: {
    name: string;
    nodes: any[];
    edges: any[];
    tags?: string[];
  }): Promise<number[]> {
    // Create a descriptive text representation
    const nodeTypes = workflow.nodes.map(n => n.type || n.data?.type).filter(Boolean);
    const nodeTypesStr = [...new Set(nodeTypes)].join(', ');
    const description = `Workflow: ${workflow.name}. Node types: ${nodeTypesStr}. Tags: ${workflow.tags?.join(', ') || 'none'}`;

    return this.generateEmbedding(description);
  }

  /**
   * Calculate cosine similarity between two vectors
   */
  cosineSimilarity(vecA: number[], vecB: number[]): number {
    if (vecA.length !== vecB.length) {
      throw new Error('Vectors must have the same length');
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < vecA.length; i++) {
      dotProduct += vecA[i] * vecB[i];
      normA += vecA[i] * vecA[i];
      normB += vecB[i] * vecB[i];
    }

    const denominator = Math.sqrt(normA) * Math.sqrt(normB);
    if (denominator === 0) {
      return 0;
    }

    return dotProduct / denominator;
  }

  /**
   * Check if embeddings are available
   */
  isAvailable(): boolean {
    return this.openai !== null;
  }
}

// Singleton instance
let embeddingGenerator: EmbeddingGenerator | null = null;

/**
 * Get or create embedding generator instance
 */
export function getEmbeddingGenerator(): EmbeddingGenerator {
  if (!embeddingGenerator) {
    embeddingGenerator = new EmbeddingGenerator({
      apiKey: config.openaiApiKey,
    });
  }
  return embeddingGenerator;
}
