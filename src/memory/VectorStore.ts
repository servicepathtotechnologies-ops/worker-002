/**
 * Vector Store - Manages vector embeddings and similarity search
 * Uses PostgreSQL with pgvector extension
 */

import { PrismaClient } from '@prisma/client';
import { EmbeddingGenerator, getEmbeddingGenerator } from './utils/embeddings';
import { VectorSearchResult, MemoryReference } from './types';

export interface VectorStoreConfig {
  similarityThreshold: number;
  maxResults: number;
  embeddingDimensions: number;
}

/**
 * Vector Store for semantic search
 * Handles storage and retrieval of vector embeddings
 */
export class VectorStore {
  private prisma: PrismaClient;
  private embeddingGenerator: EmbeddingGenerator;
  private config: VectorStoreConfig;

  constructor(prisma: PrismaClient, config: VectorStoreConfig) {
    this.prisma = prisma;
    this.config = config;
    this.embeddingGenerator = getEmbeddingGenerator();
  }

  /**
   * Store embedding for a memory reference
   */
  async storeEmbedding(
    referenceId: string,
    content: string,
    embedding: number[]
  ): Promise<void> {
    // Prisma doesn't directly support vector types, so we use raw SQL
    const embeddingStr = `[${embedding.join(',')}]`;

    await this.prisma.$executeRaw`
      UPDATE memory_references
      SET embedding = ${embeddingStr}::vector
      WHERE id = ${referenceId}::uuid
    `;
  }

  /**
   * Generate and store embedding for content
   */
  async generateAndStoreEmbedding(
    referenceId: string,
    content: string
  ): Promise<void> {
    if (!this.embeddingGenerator.isAvailable()) {
      console.warn('Embedding generator not available, skipping embedding storage');
      return;
    }

    const embedding = await this.embeddingGenerator.generateEmbedding(content);
    await this.storeEmbedding(referenceId, content, embedding);
  }

  /**
   * Find similar workflows using vector similarity search
   */
  async findSimilarWorkflows(
    query: string,
    limit: number = 5
  ): Promise<VectorSearchResult[]> {
    if (!this.embeddingGenerator.isAvailable()) {
      return [];
    }

    // Generate embedding for query
    const queryEmbedding = await this.embeddingGenerator.generateEmbedding(query);
    const embeddingStr = `[${queryEmbedding.join(',')}]`;

    // Use pgvector cosine similarity search
    // Note: This requires pgvector extension to be installed in PostgreSQL
    const results = await this.prisma.$queryRaw<Array<{
      id: string;
      content: string;
      similarity: number;
      metadata: any;
    }>>`
      SELECT 
        id,
        content,
        1 - (embedding <=> ${embeddingStr}::vector) as similarity,
        metadata
      FROM memory_references
      WHERE embedding IS NOT NULL
        AND (1 - (embedding <=> ${embeddingStr}::vector)) >= ${this.config.similarityThreshold}
      ORDER BY embedding <=> ${embeddingStr}::vector
      LIMIT ${limit}
    `;

    return results.map((r: { id: string; similarity: number; content: string; metadata: any }) => ({
      id: r.id,
      score: r.similarity,
      content: r.content,
      metadata: r.metadata,
    }));
  }

  /**
   * Find similar workflows by workflow ID
   */
  async findSimilarToWorkflow(
    workflowId: string,
    limit: number = 5
  ): Promise<VectorSearchResult[]> {
    // Get the workflow's embedding
    const workflow = await this.prisma.workflow.findUnique({
      where: { id: workflowId },
      include: {
        memoryReferences: {
          where: {
            referenceType: 'pattern',
          },
          take: 1,
        },
      },
    });

    if (!workflow || !workflow.memoryReferences.length) {
      return [];
    }

    const reference = workflow.memoryReferences[0];
    if (!reference.content) {
      return [];
    }

    return this.findSimilarWorkflows(reference.content, limit);
  }

  /**
   * Batch store embeddings
   */
  async batchStoreEmbeddings(
    items: Array<{ id: string; content: string }>
  ): Promise<void> {
    if (!this.embeddingGenerator.isAvailable()) {
      console.warn('Embedding generator not available, skipping batch embedding storage');
      return;
    }

    // Generate embeddings in batch
    const contents = items.map(item => item.content);
    const embeddings = await this.embeddingGenerator.generateEmbeddings(contents);

    // Store each embedding
    for (let i = 0; i < items.length; i++) {
      await this.storeEmbedding(items[i].id, items[i].content, embeddings[i]);
    }
  }

  /**
   * Calculate similarity between two embeddings
   */
  async calculateSimilarity(
    embedding1: number[],
    embedding2: number[]
  ): Promise<number> {
    return this.embeddingGenerator.cosineSimilarity(embedding1, embedding2);
  }
}
