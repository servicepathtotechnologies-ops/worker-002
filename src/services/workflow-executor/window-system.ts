/**
 * Window System - Intelligent State Buffering
 * 
 * Manages hot/warm/cold data with efficient memory usage.
 * Implements sliding window pattern with write-through.
 * 
 * Key Features:
 * - LRU eviction for memory efficiency
 * - Write-through to database (durability)
 * - Hot data in memory, warm data in DB
 * - Automatic promotion/demotion
 */

export interface CacheEntry {
  value: unknown;
  timestamp: number;
  persistent?: boolean; // If true, never evicted
  accessCount: number;
}

export interface CacheStats {
  size: number;
  maxSize: number;
  hits: number;
  misses: number;
  hitRate: number;
  evictions: number;
}

/**
 * Window System
 * 
 * Intelligent buffering/caching layer that manages hot/warm/cold data.
 * Implements sliding window pattern with LRU eviction.
 */
export class WindowSystem {
  private cache: Map<string, CacheEntry>;
  private maxSize: number;
  private accessOrder: string[] = []; // For LRU tracking
  
  // Statistics
  private hits: number = 0;
  private misses: number = 0;
  private evictions: number = 0;

  constructor(maxSize: number = 100) {
    if (maxSize < 1) {
      throw new Error('Window size must be at least 1');
    }
    this.cache = new Map();
    this.maxSize = maxSize;
  }

  /**
   * Set value in window (hot data)
   * 
   * Write-through pattern: Also triggers database write (handled by CentralExecutionState).
   * 
   * @param nodeId Node identifier
   * @param value Node output value
   * @param persistent If true, never evicted (default: false)
   */
  set(nodeId: string, value: unknown, persistent: boolean = false): void {
    // Update access order (LRU)
    if (this.accessOrder.includes(nodeId)) {
      this.accessOrder = this.accessOrder.filter(id => id !== nodeId);
    }
    this.accessOrder.push(nodeId);

    // Evict LRU if at capacity
    if (this.cache.size >= this.maxSize && !persistent) {
      const lruId = this.accessOrder[0];
      if (lruId) {
        const entry = this.cache.get(lruId);
        if (entry && !entry.persistent) {
          this.evict(lruId);
        }
      }
    }

    // Store in window
    const existingEntry = this.cache.get(nodeId);
    this.cache.set(nodeId, {
      value,
      timestamp: Date.now(),
      persistent: persistent || existingEntry?.persistent || false,
      accessCount: (existingEntry?.accessCount || 0) + 1,
    });
  }

  /**
   * Get value from window (hot data)
   * 
   * Updates access order for LRU tracking.
   * 
   * @param nodeId Node identifier
   * @returns Node output value or undefined if not found
   */
  get(nodeId: string): unknown | undefined {
    const entry = this.cache.get(nodeId);
    if (!entry) {
      this.misses++;
      return undefined;
    }

    // Update access order (LRU)
    this.accessOrder = this.accessOrder.filter(id => id !== nodeId);
    this.accessOrder.push(nodeId);

    // Update access count and timestamp
    entry.accessCount++;
    entry.timestamp = Date.now();
    this.hits++;

    return entry.value;
  }

  /**
   * Get all values (for template resolution)
   * 
   * Returns snapshot of all cached values.
   * Used by template resolver for {{variable}} syntax.
   */
  getAll(): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    this.cache.forEach((entry, nodeId) => {
      result[nodeId] = entry.value;
    });
    return result;
  }

  /**
   * Evict entry (demote to warm storage)
   * 
   * Removes entry from memory cache.
   * Data is still available in database (warm storage).
   */
  private evict(nodeId: string): void {
    this.cache.delete(nodeId);
    this.accessOrder = this.accessOrder.filter(id => id !== nodeId);
    this.evictions++;
    
    if (process.env.ENABLE_MEMORY_LOGGING === 'true') {
      console.log(`[WindowSystem] Evicted node ${nodeId} (cache size: ${this.cache.size}/${this.maxSize})`);
    }
  }

  /**
   * Warm cache with database data
   * 
   * Loads data from database into memory cache.
   * Used on workflow resume to restore hot data.
   */
  warm(data: Record<string, unknown>): void {
    Object.entries(data).forEach(([nodeId, value]) => {
      this.set(nodeId, value, false);
    });
    
    if (process.env.ENABLE_MEMORY_LOGGING === 'true') {
      console.log(`[WindowSystem] Warmed cache with ${Object.keys(data).length} entries`);
    }
  }

  /**
   * Clear window
   * 
   * Removes all entries from memory cache.
   */
  clear(): void {
    this.cache.clear();
    this.accessOrder = [];
    this.hits = 0;
    this.misses = 0;
    this.evictions = 0;
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    const totalRequests = this.hits + this.misses;
    const hitRate = totalRequests > 0 ? this.hits / totalRequests : 0;

    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      hits: this.hits,
      misses: this.misses,
      hitRate: hitRate,
      evictions: this.evictions,
    };
  }

  /**
   * Check if node is in cache
   */
  has(nodeId: string): boolean {
    return this.cache.has(nodeId);
  }

  /**
   * Get cache entry metadata
   */
  getEntry(nodeId: string): CacheEntry | undefined {
    return this.cache.get(nodeId);
  }

  /**
   * Get size of cache
   */
  size(): number {
    return this.cache.size;
  }

  /**
   * Get all node IDs in cache
   */
  keys(): string[] {
    return Array.from(this.cache.keys());
  }
}
