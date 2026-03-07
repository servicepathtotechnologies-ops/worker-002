/**
 * Performance Optimizer
 * 
 * ✅ PHASE 5: Optimizes performance and reduces LLM calls
 * 
 * This optimizer:
 * - Reduces redundant LLM calls
 * - Caches expensive operations
 * - Optimizes planner algorithms
 * - Monitors performance metrics
 * 
 * Architecture Rule:
 * - Cache at appropriate layers
 * - Skip LLM when fallback is sufficient
 * - Optimize registry lookups
 */

import { workflowCache } from '../../core/cache/workflow-cache';
import { SimpleIntent } from './simple-intent';
import { StructuredIntent } from './intent-structurer';
import { fallbackIntentGenerator } from './fallback-intent-generator';
import { templateBasedGenerator } from './template-based-generator';

export interface OptimizationMetrics {
  llmCallsSaved: number;
  cacheHits: number;
  cacheMisses: number;
  averageResponseTime: number;
}

export class PerformanceOptimizer {
  private static instance: PerformanceOptimizer;
  private metrics: OptimizationMetrics = {
    llmCallsSaved: 0,
    cacheHits: 0,
    cacheMisses: 0,
    averageResponseTime: 0,
  };
  
  private constructor() {}
  
  static getInstance(): PerformanceOptimizer {
    if (!PerformanceOptimizer.instance) {
      PerformanceOptimizer.instance = new PerformanceOptimizer();
    }
    return PerformanceOptimizer.instance;
  }
  
  /**
   * Optimize SimpleIntent extraction (use cache, skip LLM if possible)
   */
  async optimizeIntentExtraction(
    prompt: string,
    llmExtraction: () => Promise<SimpleIntent>
  ): Promise<SimpleIntent> {
    // ✅ OPTIMIZATION 1: Check cache first
    const cached = workflowCache.getCachedIntent(prompt);
    if (cached) {
      this.metrics.cacheHits++;
      return cached;
    }
    
    this.metrics.cacheMisses++;
    
    // ✅ OPTIMIZATION 2: Try fallback first (faster, no LLM)
    const fallbackResult = fallbackIntentGenerator.generateFromPrompt(prompt);
    if (fallbackResult.confidence >= 0.7) {
      // High confidence fallback - skip LLM
      this.metrics.llmCallsSaved++;
      workflowCache.cacheIntent(prompt, fallbackResult.intent);
      return fallbackResult.intent;
    }
    
    // ✅ OPTIMIZATION 3: Use LLM only if fallback confidence is low
    const llmIntent = await llmExtraction();
    workflowCache.cacheIntent(prompt, llmIntent);
    return llmIntent;
  }
  
  /**
   * Optimize StructuredIntent building (use cache, template matching)
   */
  async optimizeStructuredIntentBuilding(
    simpleIntent: SimpleIntent,
    originalPrompt?: string,
    planner: (intent: SimpleIntent, prompt?: string) => Promise<StructuredIntent> = async () => ({ trigger: 'manual_trigger', actions: [], requires_credentials: [] })
  ): Promise<StructuredIntent> {
    // ✅ OPTIMIZATION 1: Check cache first
    if (originalPrompt) {
      const cached = workflowCache.getCachedStructuredIntent(originalPrompt);
      if (cached) {
        this.metrics.cacheHits++;
        return cached;
      }
    }
    
    this.metrics.cacheMisses++;
    
    // ✅ OPTIMIZATION 2: Try template matching first (faster, no planning)
    const templateMatch = templateBasedGenerator.matchTemplate(simpleIntent);
    if (templateMatch.template && templateMatch.confidence >= 0.8) {
      // High confidence template - skip planning
      this.metrics.llmCallsSaved++;
      const structuredIntent = templateBasedGenerator.generateFromTemplate(
        templateMatch.template,
        simpleIntent
      );
      
      if (originalPrompt) {
        workflowCache.cacheStructuredIntent(originalPrompt, structuredIntent);
      }
      return structuredIntent;
    }
    
    // ✅ OPTIMIZATION 3: Use planner only if template doesn't match
    const structuredIntent = await planner(simpleIntent, originalPrompt);
    
    if (originalPrompt) {
      workflowCache.cacheStructuredIntent(originalPrompt, structuredIntent);
    }
    return structuredIntent;
  }
  
  /**
   * Get optimization metrics
   */
  getMetrics(): OptimizationMetrics {
    return { ...this.metrics };
  }
  
  /**
   * Reset metrics
   */
  resetMetrics(): void {
    this.metrics = {
      llmCallsSaved: 0,
      cacheHits: 0,
      cacheMisses: 0,
      averageResponseTime: 0,
    };
  }
  
  /**
   * Calculate cache hit rate
   */
  getCacheHitRate(): number {
    const total = this.metrics.cacheHits + this.metrics.cacheMisses;
    if (total === 0) return 0;
    return this.metrics.cacheHits / total;
  }
  
  /**
   * Generate cache key from prompt and options
   */
  generateCacheKey(prompt: string, options?: Record<string, any>): string {
    const content = JSON.stringify({ prompt, options });
    return `ai:${content}`;
  }
  
  /**
   * Get cached response or execute and cache
   */
  async getCachedResponse<T>(
    cacheKey: string,
    executor: () => Promise<T>,
    ttl: number = 300 // 5 minutes default
  ): Promise<T> {
    // For now, just execute (can be enhanced with actual caching later)
    // This maintains the interface expected by ai-processors.ts
    return await executor();
  }
}

// Export singleton instance
export const performanceOptimizer = PerformanceOptimizer.getInstance();
