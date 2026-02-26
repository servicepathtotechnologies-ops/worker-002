/**
 * Memory Manager - Core memory management service
 * Handles storage, retrieval, and management of workflow memory
 */

import { PrismaClient } from '@prisma/client';
import { CacheManager } from './CacheManager';
import { VectorStore } from './VectorStore';
import {
  WorkflowMemory,
  WorkflowDefinition,
  ExecutionRecord,
  MemoryReference,
  SimilarWorkflow,
  MemoryConfig,
  ExecutionStatistics,
} from './types';
import { getEmbeddingGenerator } from './utils/embeddings';

/**
 * Memory Manager - Main interface for memory operations
 */
export class MemoryManager {
  private prisma: PrismaClient;
  private cache: CacheManager;
  private vectorStore: VectorStore;
  private config: MemoryConfig;

  constructor(prisma: PrismaClient, config: MemoryConfig) {
    this.prisma = prisma;
    this.config = config;
    this.cache = new CacheManager({
      maxSize: config.maxCacheSize,
    });
    this.vectorStore = new VectorStore(prisma, {
      similarityThreshold: config.similarityThreshold,
      maxResults: 5,
      embeddingDimensions: config.vectorDimensions,
    });
  }

  /**
   * Store workflow in memory system
   */
  async storeWorkflow(workflowData: {
    id?: string;
    name: string;
    definition: WorkflowDefinition;
    tags?: string[];
    settings?: Record<string, any>;
  }): Promise<string> {
    const { randomUUID } = require('crypto');
    const workflowId = workflowData.id || randomUUID();

    // 🚨 CRITICAL: Check if DATABASE_URL is available before using Prisma
    if (!process.env.DATABASE_URL) {
      console.warn('⚠️  [Memory] DATABASE_URL not set, skipping database storage (using cache only)');
      // Store in cache only
      const workflowMemory: WorkflowMemory = {
        id: workflowId,
        definition: workflowData.definition,
        metadata: {
          version: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
          isActive: true,
          tags: workflowData.tags || [],
          settings: workflowData.settings || {},
        },
        embeddings: [],
        statistics: {
          totalExecutions: 0,
          successfulExecutions: 0,
          failedExecutions: 0,
          successRate: 0,
          averageExecutionTime: 0,
        },
        references: [],
      };
      this.cache.set(workflowId, workflowMemory);
      return workflowId;
    }

    try {
      // Store in database
      const workflow = await this.prisma.workflow.upsert({
        where: { id: workflowId },
        create: {
          id: workflowId,
          name: workflowData.name,
          definition: workflowData.definition as any,
          tags: (workflowData.tags || []) as any,
          settings: (workflowData.settings || {}) as any,
          isActive: true,
          version: 1,
        },
        update: {
          name: workflowData.name,
          definition: workflowData.definition as any,
          tags: (workflowData.tags || []) as any,
          settings: (workflowData.settings || {}) as any,
          updatedAt: new Date(),
        },
      });

      // Generate and store embedding if enabled
      if (this.config.enableVectorSearch) {
        const embeddingGenerator = getEmbeddingGenerator();
        if (embeddingGenerator.isAvailable()) {
          try {
            const embedding = await embeddingGenerator.generateWorkflowEmbedding({
              name: workflowData.name,
              nodes: workflowData.definition.nodes || [],
              edges: workflowData.definition.edges || [],
              tags: workflowData.tags,
            });

            // Store as memory reference
            const reference = await this.prisma.memoryReference.create({
              data: {
                workflowId: workflowId,
                referenceType: 'pattern',
                content: `Workflow: ${workflowData.name}`,
                metadata: {
                  nodeTypes: workflowData.definition.nodes?.map((n: any) => n.type || n.data?.type).filter(Boolean) || [],
                } as any,
              },
            });

            // Store embedding using raw SQL (pgvector)
            const embeddingStr = `[${embedding.join(',')}]`;
            await this.prisma.$executeRaw`
              UPDATE memory_references
              SET embedding = ${embeddingStr}::vector
              WHERE id = ${reference.id}::uuid
            `;
          } catch (error) {
            console.warn('Failed to generate/store embedding:', error);
          }
        }
      }

      // Update cache
      const statistics = await this.getExecutionStatistics(workflowId);
      const workflowMemory: WorkflowMemory = {
        id: workflowId,
        definition: workflowData.definition,
        metadata: {
          version: workflow.version,
          createdAt: workflow.createdAt,
          updatedAt: workflow.updatedAt,
          isActive: workflow.isActive,
          tags: (workflow.tags as string[]) || [],
          settings: (workflow.settings as Record<string, any>) || {},
        },
        embeddings: [],
        statistics,
        references: [],
      };

      this.cache.set(workflowId, workflowMemory);

      return workflowId;
    } catch (error) {
      console.error('Failed to store workflow:', error);
      throw error;
    }
  }

  /**
   * Get workflow reference with context
   */
  async getWorkflowReference(
    workflowId: string,
    context: Record<string, any> = {}
  ): Promise<WorkflowMemory | null> {
    // Try cache first
    const cached = this.cache.get(workflowId);
    if (cached) {
      return cached;
    }

    // 🚨 CRITICAL: Check if DATABASE_URL is available
    if (!process.env.DATABASE_URL) {
      console.warn('⚠️  [Memory] DATABASE_URL not set, returning null (cache miss)');
      return null;
    }

    try {
      // Fetch from database
      const workflow = await this.prisma.workflow.findUnique({
        where: { id: workflowId },
        include: {
          memoryReferences: true,
        },
      });

      if (!workflow) {
        return null;
      }

      // Get execution statistics
      const statistics = await this.getExecutionStatistics(workflowId);

      // Build workflow memory
      const workflowMemory: WorkflowMemory = {
        id: workflow.id,
        definition: workflow.definition as unknown as WorkflowDefinition,
        metadata: {
          version: workflow.version,
          createdAt: workflow.createdAt,
          updatedAt: workflow.updatedAt,
          isActive: workflow.isActive,
          tags: (workflow.tags as string[]) || [],
          settings: (workflow.settings as Record<string, any>) || {},
        },
        embeddings: [],
        statistics,
        references: workflow.memoryReferences.map((ref: any) => ({
          id: ref.id,
          workflowId: ref.workflowId || undefined,
          referenceType: ref.referenceType as 'example' | 'template' | 'pattern' | 'documentation',
          content: ref.content,
          metadata: (ref.metadata as Record<string, any>) || {},
          createdAt: ref.createdAt,
        })),
      };

      // Cache it
      this.cache.set(workflowId, workflowMemory);

      return workflowMemory;
    } catch (error) {
      console.error('Failed to get workflow reference:', error);
      return null;
    }
  }

  /**
   * Store execution record
   */
  async storeExecution(executionData: {
    workflowId: string;
    status: 'running' | 'success' | 'error' | 'waiting';
    inputData?: any;
    resultData?: any;
    startedAt: Date;
    finishedAt?: Date;
    executionTime?: number;
    errorMessage?: string;
    context?: Record<string, any>;
    nodeExecutions?: Array<{
      nodeId: string;
      nodeType: string;
      inputData?: any;
      outputData?: any;
      status: string;
      error?: string;
      duration?: number;
      sequence: number;
      metadata?: Record<string, any>;
    }>;
  }): Promise<string> {
    const { randomUUID } = require('crypto');
    const executionId = randomUUID();

    // 🚨 CRITICAL: Check if DATABASE_URL is available before using Prisma
    if (!process.env.DATABASE_URL) {
      console.warn('⚠️  [Memory] DATABASE_URL not set, skipping execution storage');
      return executionId;
    }

    try {
      // Store execution
      const execution = await this.prisma.execution.create({
        data: {
          id: executionId,
          workflowId: executionData.workflowId,
          status: executionData.status,
          inputData: executionData.inputData as any,
          resultData: executionData.resultData as any,
          startedAt: executionData.startedAt,
          finishedAt: executionData.finishedAt,
          executionTime: executionData.executionTime,
          errorMessage: executionData.errorMessage,
          context: (executionData.context || {}) as any,
          nodeExecutions: {
            create: (executionData.nodeExecutions || []).map(ne => ({
              nodeId: ne.nodeId,
              nodeType: ne.nodeType,
              inputData: ne.inputData as any,
              outputData: ne.outputData as any,
              status: ne.status,
              error: ne.error,
              duration: ne.duration,
              sequence: ne.sequence,
              metadata: (ne.metadata || {}) as any,
            })),
          },
        },
      });

      // Invalidate cache for workflow (statistics changed)
      this.cache.invalidateWorkflow(executionData.workflowId);

      // Cache execution result
      this.cache.setExecution(executionId, execution);

      return executionId;
    } catch (error) {
      console.error('Failed to store execution:', error);
      // Return executionId even if storage fails (for tracking)
      return executionId;
    }
  }

  /**
   * Find similar workflows using vector search
   */
  async findSimilarWorkflows(
    query: string,
    limit: number = 5
  ): Promise<SimilarWorkflow[]> {
    if (!this.config.enableVectorSearch) {
      return [];
    }

    const results = await this.vectorStore.findSimilarWorkflows(query, limit);

    // Fetch full workflow data for each result
    const similarWorkflows: SimilarWorkflow[] = [];

    for (const result of results) {
      const reference = await this.prisma.memoryReference.findUnique({
        where: { id: result.id },
        include: {
          workflow: true,
        },
      });

      if (reference?.workflow) {
        const statistics = await this.getExecutionStatistics(reference.workflow.id);
        similarWorkflows.push({
          workflowId: reference.workflow.id,
          name: reference.workflow.name,
          similarity: result.score,
          definition: reference.workflow.definition as unknown as WorkflowDefinition,
          metadata: {
            version: reference.workflow.version,
            createdAt: reference.workflow.createdAt,
            updatedAt: reference.workflow.updatedAt,
            isActive: reference.workflow.isActive,
            tags: (reference.workflow.tags as string[]) || [],
            settings: (reference.workflow.settings as Record<string, any>) || {},
          },
          statistics,
        });
      }
    }

    return similarWorkflows;
  }

  /**
   * Get execution statistics for a workflow
   */
  async getExecutionStatistics(workflowId: string): Promise<ExecutionStatistics> {
    // 🚨 CRITICAL: Check if DATABASE_URL is available
    if (!process.env.DATABASE_URL) {
      // Return empty statistics if database not available
      return {
        totalExecutions: 0,
        successfulExecutions: 0,
        failedExecutions: 0,
        successRate: 0,
        averageExecutionTime: 0,
      };
    }

    try {
      const executions = await this.prisma.execution.findMany({
      where: { workflowId },
      orderBy: { startedAt: 'desc' },
    });

    const totalExecutions = executions.length;
    const successfulExecutions = executions.filter((e: any) => e.status === 'success').length;
    const failedExecutions = executions.filter((e: any) => e.status === 'error').length;
    const successRate = totalExecutions > 0 ? successfulExecutions / totalExecutions : 0;

    const executionTimes = executions
      .filter((e: any) => e.executionTime !== null)
      .map((e: any) => e.executionTime!);
    const averageExecutionTime =
      executionTimes.length > 0
        ? executionTimes.reduce((a: number, b: number) => a + b, 0) / executionTimes.length
        : 0;

      const lastExecution = executions[0];
      const lastSuccessful = executions.find((e: any) => e.status === 'success');
      const lastFailed = executions.find((e: any) => e.status === 'error');

      return {
        totalExecutions,
        successfulExecutions,
        failedExecutions,
        successRate,
        averageExecutionTime,
        lastExecutionAt: lastExecution?.startedAt,
        lastSuccessfulExecutionAt: lastSuccessful?.startedAt,
        lastFailedExecutionAt: lastFailed?.startedAt,
      };
    } catch (error) {
      // 🚨 CRITICAL: Handle Prisma errors gracefully
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage.includes('DATABASE_URL') || errorMessage.includes('Environment variable not found') || 
          errorMessage.includes('schema cache')) {
        console.warn('⚠️  [Memory] Database not available, returning empty statistics:', errorMessage);
        return {
          totalExecutions: 0,
          successfulExecutions: 0,
          failedExecutions: 0,
          successRate: 0,
          averageExecutionTime: 0,
        };
      }
      // Re-throw other errors
      throw error;
    }
  }

  /**
   * Prune old execution data
   */
  async pruneOldExecutions(retentionDays: number = 30): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    const result = await this.prisma.execution.deleteMany({
      where: {
        startedAt: {
          lt: cutoffDate,
        },
      },
    });

    return result.count;
  }

  /**
   * Store memory reference
   */
  async storeMemoryReference(reference: {
    workflowId?: string;
    referenceType: 'example' | 'template' | 'pattern' | 'documentation';
    content: string;
    metadata?: Record<string, any>;
  }): Promise<string> {
    const { randomUUID } = require('crypto');
    const referenceId = randomUUID();

    const created = await this.prisma.memoryReference.create({
      data: {
        id: referenceId,
        workflowId: reference.workflowId,
        referenceType: reference.referenceType,
        content: reference.content,
        metadata: (reference.metadata || {}) as any,
      },
    });

    // Generate and store embedding if enabled
    if (this.config.enableVectorSearch) {
      await this.vectorStore.generateAndStoreEmbedding(referenceId, reference.content);
    }

    return referenceId;
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    return this.cache.getStats();
  }
}
