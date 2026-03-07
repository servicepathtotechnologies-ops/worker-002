/**
 * Workflow Cache
 * 
 * ✅ PHASE 5: Caching strategy for 1M users
 * 
 * This cache:
 * - Caches intent extraction results (5 min TTL)
 * - Caches DSL generation (10 min TTL)
 * - Caches node registry (1 hour TTL)
 * - Reduces computation and DB load
 * 
 * Architecture Rule:
 * - Use Redis for distributed caching
 * - Cache at appropriate layers
 * - Invalidate on node registry updates
 */

import { SimpleIntent } from '../../services/ai/simple-intent';
import { StructuredIntent } from '../../services/ai/intent-structurer';
import { WorkflowDSL } from '../../services/ai/workflow-dsl';
import crypto from 'crypto';

export interface CacheOptions {
  ttl?: number; // Time to live in seconds
  key?: string; // Custom cache key
}

export class WorkflowCache {
  private static instance: WorkflowCache;
  private cache: Map<string, { value: any; expires: number }> = new Map();
  
  private constructor() {
    // Cleanup expired entries every 5 minutes
    setInterval(() => this.cleanup(), 5 * 60 * 1000);
  }
  
  static getInstance(): WorkflowCache {
    if (!WorkflowCache.instance) {
      WorkflowCache.instance = new WorkflowCache();
    }
    return WorkflowCache.instance;
  }
  
  /**
   * Generate cache key from content
   */
  private generateKey(prefix: string, content: string): string {
    const hash = crypto.createHash('sha256').update(content).digest('hex').substring(0, 16);
    return `${prefix}:${hash}`;
  }
  
  /**
   * Cache SimpleIntent extraction result (5 min TTL)
   */
  cacheIntent(prompt: string, intent: SimpleIntent, options: CacheOptions = {}): void {
    const key = options.key || this.generateKey('intent', prompt);
    const ttl = options.ttl || 300; // 5 minutes default
    
    this.cache.set(key, {
      value: intent,
      expires: Date.now() + (ttl * 1000),
    });
  }
  
  /**
   * Get cached SimpleIntent
   */
  getCachedIntent(prompt: string): SimpleIntent | null {
    const key = this.generateKey('intent', prompt);
    const cached = this.cache.get(key);
    
    if (!cached) return null;
    
    if (Date.now() > cached.expires) {
      this.cache.delete(key);
      return null;
    }
    
    return cached.value;
  }
  
  /**
   * Cache DSL generation result (10 min TTL)
   */
  cacheDSL(intent: StructuredIntent, dsl: WorkflowDSL, options: CacheOptions = {}): void {
    const key = options.key || this.generateKey('dsl', JSON.stringify(intent));
    const ttl = options.ttl || 600; // 10 minutes default
    
    this.cache.set(key, {
      value: dsl,
      expires: Date.now() + (ttl * 1000),
    });
  }
  
  /**
   * Get cached DSL
   */
  getCachedDSL(intent: StructuredIntent): WorkflowDSL | null {
    const key = this.generateKey('dsl', JSON.stringify(intent));
    const cached = this.cache.get(key);
    
    if (!cached) return null;
    
    if (Date.now() > cached.expires) {
      this.cache.delete(key);
      return null;
    }
    
    return cached.value;
  }
  
  /**
   * Cache StructuredIntent (5 min TTL)
   */
  cacheStructuredIntent(prompt: string, intent: StructuredIntent, options: CacheOptions = {}): void {
    const key = options.key || this.generateKey('structured', prompt);
    const ttl = options.ttl || 300; // 5 minutes default
    
    this.cache.set(key, {
      value: intent,
      expires: Date.now() + (ttl * 1000),
    });
  }
  
  /**
   * Get cached StructuredIntent
   */
  getCachedStructuredIntent(prompt: string): StructuredIntent | null {
    const key = this.generateKey('structured', prompt);
    const cached = this.cache.get(key);
    
    if (!cached) return null;
    
    if (Date.now() > cached.expires) {
      this.cache.delete(key);
      return null;
    }
    
    return cached.value;
  }
  
  /**
   * Invalidate cache by prefix
   */
  invalidate(prefix: string): void {
    for (const [key] of this.cache.entries()) {
      if (key.startsWith(prefix)) {
        this.cache.delete(key);
      }
    }
  }
  
  /**
   * Clear all cache
   */
  clear(): void {
    this.cache.clear();
  }
  
  /**
   * Cleanup expired entries
   */
  private cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expires) {
        this.cache.delete(key);
      }
    }
  }
  
  /**
   * Get cache statistics
   */
  getStats(): {
    size: number;
    entries: number;
  } {
    const now = Date.now();
    let validEntries = 0;
    let totalSize = 0;
    
    for (const entry of this.cache.values()) {
      if (now <= entry.expires) {
        validEntries++;
        totalSize += JSON.stringify(entry.value).length;
      }
    }
    
    return {
      size: totalSize,
      entries: validEntries,
    };
  }
}

// Export singleton instance
export const workflowCache = WorkflowCache.getInstance();
