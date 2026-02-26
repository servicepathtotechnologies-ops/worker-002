/**
 * Cache Manager - LRU Cache for active workflows
 * Tier 1: In-memory cache for fast access
 */

import { LRUCache } from 'lru-cache';
import { WorkflowMemory } from './types';

export interface CacheConfig {
  maxSize: number;
  ttl?: number; // Time to live in milliseconds
}

/**
 * Cache Manager for workflow memory
 * Implements LRU (Least Recently Used) eviction policy
 */
export class CacheManager {
  private cache: LRUCache<string, WorkflowMemory>;
  private executionCache: LRUCache<string, any>;
  private analysisCache: LRUCache<string, any>;

  constructor(config: CacheConfig) {
    // Workflow cache - stores full workflow memory
    this.cache = new LRUCache<string, WorkflowMemory>({
      max: config.maxSize || 100,
      ttl: config.ttl || 5 * 60 * 1000, // 5 minutes default
      updateAgeOnGet: true, // Refresh TTL on access
    });

    // Execution results cache - shorter TTL
    this.executionCache = new LRUCache<string, any>({
      max: 50,
      ttl: 5 * 60 * 1000, // 5 minutes
    });

    // Analysis results cache
    this.analysisCache = new LRUCache<string, any>({
      max: 100,
      ttl: 10 * 60 * 1000, // 10 minutes
    });
  }

  /**
   * Get workflow from cache
   */
  get(workflowId: string): WorkflowMemory | undefined {
    return this.cache.get(workflowId);
  }

  /**
   * Store workflow in cache
   */
  set(workflowId: string, workflow: WorkflowMemory): void {
    this.cache.set(workflowId, workflow);
  }

  /**
   * Check if workflow exists in cache
   */
  has(workflowId: string): boolean {
    return this.cache.has(workflowId);
  }

  /**
   * Remove workflow from cache
   */
  delete(workflowId: string): boolean {
    return this.cache.delete(workflowId);
  }

  /**
   * Clear all cache entries
   */
  clear(): void {
    this.cache.clear();
    this.executionCache.clear();
    this.analysisCache.clear();
  }

  /**
   * Get execution result from cache
   */
  getExecution(executionId: string): any | undefined {
    return this.executionCache.get(executionId);
  }

  /**
   * Store execution result in cache
   */
  setExecution(executionId: string, result: any): void {
    this.executionCache.set(executionId, result);
  }

  /**
   * Get analysis result from cache
   */
  getAnalysis(workflowId: string): any | undefined {
    return this.analysisCache.get(workflowId);
  }

  /**
   * Store analysis result in cache
   */
  setAnalysis(workflowId: string, analysis: any): void {
    this.analysisCache.set(workflowId, analysis);
  }

  /**
   * Get cache statistics
   */
  getStats() {
    // Get a sample key to check TTL (if cache has entries)
    const sampleKey = this.cache.keys().next().value;
    return {
      workflowCache: {
        size: this.cache.size,
        maxSize: this.cache.max,
        remainingTTL: sampleKey ? this.cache.getRemainingTTL(sampleKey) : undefined,
      },
      executionCache: {
        size: this.executionCache.size,
        maxSize: this.executionCache.max,
      },
      analysisCache: {
        size: this.analysisCache.size,
        maxSize: this.analysisCache.max,
      },
    };
  }

  /**
   * Invalidate cache for a workflow (e.g., on update)
   */
  invalidateWorkflow(workflowId: string): void {
    this.delete(workflowId);
    this.analysisCache.delete(workflowId);
  }
}
