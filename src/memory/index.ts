/**
 * Memory System - Main export
 * n8n-style memory and reference system for AI workflow agent
 */

import { PrismaClient } from '@prisma/client';
import { MemoryManager } from './MemoryManager';
import { ReferenceBuilder } from './ReferenceBuilder';
import { WorkflowAnalyzer } from './WorkflowAnalyzer';
import { CacheManager } from './CacheManager';
import { VectorStore } from './VectorStore';
import { getMemoryConfig } from './config';

// Singleton Prisma client
let prismaClient: PrismaClient | null = null;

/**
 * Get or create Prisma client
 */
export function getPrismaClient(): PrismaClient {
  if (!prismaClient) {
    prismaClient = new PrismaClient({
      log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
    });
  }
  return prismaClient;
}

/**
 * Get memory manager instance
 */
let memoryManagerInstance: MemoryManager | null = null;

export function getMemoryManager(): MemoryManager {
  if (!memoryManagerInstance) {
    const prisma = getPrismaClient();
    const config = getMemoryConfig();
    memoryManagerInstance = new MemoryManager(prisma, config);
  }
  return memoryManagerInstance;
}

/**
 * Get reference builder instance
 */
let referenceBuilderInstance: ReferenceBuilder | null = null;

export function getReferenceBuilder(): ReferenceBuilder {
  if (!referenceBuilderInstance) {
    const memoryManager = getMemoryManager();
    referenceBuilderInstance = new ReferenceBuilder(memoryManager);
  }
  return referenceBuilderInstance;
}

/**
 * Get workflow analyzer instance
 */
let workflowAnalyzerInstance: WorkflowAnalyzer | null = null;

export function getWorkflowAnalyzer(): WorkflowAnalyzer {
  if (!workflowAnalyzerInstance) {
    workflowAnalyzerInstance = new WorkflowAnalyzer();
  }
  return workflowAnalyzerInstance;
}

// Export types and classes
export * from './types';
export { MemoryManager } from './MemoryManager';
export { ReferenceBuilder } from './ReferenceBuilder';
export { WorkflowAnalyzer } from './WorkflowAnalyzer';
export { CacheManager } from './CacheManager';
export { VectorStore } from './VectorStore';
export { EmbeddingGenerator } from './utils/embeddings';
