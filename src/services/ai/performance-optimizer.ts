// Performance Optimizer - Caching and request optimization

interface CacheEntry {
  response: any;
  timestamp: number;
  ttl: number;
}

/**
 * Performance Optimizer
 * Implements caching and request batching for Ollama
 */
export class PerformanceOptimizer {
  private responseCache = new Map<string, CacheEntry>();
  private defaultTTL = 5 * 60 * 1000; // 5 minutes
  private maxCacheSize = 1000;

  /**
   * Get cached response or generate new one
   */
  async getCachedResponse<T>(
    cacheKey: string,
    generator: () => Promise<T>,
    ttl?: number
  ): Promise<T> {
    const cached = this.responseCache.get(cacheKey);
    const cacheTTL = ttl || this.defaultTTL;

    if (cached && Date.now() - cached.timestamp < cacheTTL) {
      return cached.response as T;
    }

    const response = await generator();
    
    // Add to cache
    this.responseCache.set(cacheKey, {
      response,
      timestamp: Date.now(),
      ttl: cacheTTL,
    });

    // Cleanup old entries if cache is too large
    if (this.responseCache.size > this.maxCacheSize) {
      this.cleanupCache();
    }

    return response;
  }

  /**
   * Generate cache key from prompt and options
   */
  generateCacheKey(prompt: string, options: Record<string, any>): string {
    const key = `${prompt}:${JSON.stringify(options)}`;
    // Simple hash
    let hash = 0;
    for (let i = 0; i < key.length; i++) {
      const char = key.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return `cache_${Math.abs(hash)}`;
  }

  /**
   * Cleanup old cache entries
   */
  private cleanupCache(): void {
    const now = Date.now();
    const entriesToRemove: string[] = [];

    for (const [key, entry] of this.responseCache.entries()) {
      if (now - entry.timestamp > entry.ttl) {
        entriesToRemove.push(key);
      }
    }

    entriesToRemove.forEach(key => this.responseCache.delete(key));

    // If still too large, remove oldest 20%
    if (this.responseCache.size > this.maxCacheSize) {
      const sorted = Array.from(this.responseCache.entries())
        .sort((a, b) => a[1].timestamp - b[1].timestamp);
      
      const toRemove = Math.floor(this.maxCacheSize * 0.2);
      for (let i = 0; i < toRemove; i++) {
        this.responseCache.delete(sorted[i][0]);
      }
    }
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.responseCache.clear();
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): {
    size: number;
    maxSize: number;
    hitRate?: number;
  } {
    return {
      size: this.responseCache.size,
      maxSize: this.maxCacheSize,
    };
  }
}

// Export singleton
export const performanceOptimizer = new PerformanceOptimizer();
