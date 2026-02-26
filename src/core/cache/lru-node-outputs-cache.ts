/**
 * LRU Cache for Node Outputs
 * 
 * Prevents unbounded memory growth by limiting cache size and evicting
 * least recently used entries when the limit is reached.
 * 
 * Features:
 * - LRU eviction policy (evicts least recently used when full)
 * - Configurable cache size (default: 100 entries)
 * - Cache statistics (hits, misses, hit rate)
 * - Timestamp tracking for LRU determination
 * - Support for persistent entries (never evicted)
 * 
 * @example
 * ```typescript
 * const cache = new LRUNodeOutputsCache(100);
 * cache.set('node-1', { data: 'value' });
 * const output = cache.get('node-1');
 * const stats = cache.getStats();
 * ```
 */

export interface CacheEntry {
  value: unknown;
  /**
   * Access timestamp (LRU): updated on get() and set()
   */
  timestamp: number;
  /**
   * Set timestamp (dataflow): updated ONLY on set()
   * Used to determine "previous node output" without being affected by reads (get()).
   */
  setTimestamp: number;
  persistent?: boolean; // If true, never evicted
}

export interface CacheStats {
  size: number;
  maxSize: number;
  hits: number;
  misses: number;
  hitRate: number;
  evictions: number;
}

export class LRUNodeOutputsCache {
  private cache: Map<string, CacheEntry>;
  private maxSize: number;
  private cloneOnGet: boolean;
  private hits: number = 0;
  private misses: number = 0;
  private evictions: number = 0;

  /**
   * Create a new LRU cache for node outputs
   * 
   * @param maxSize Maximum number of entries to keep in cache (default: 100)
   * @param cloneOnGet If true, get() returns a deep clone of the value (default: false)
   *                   Set to true when values need to be modified without affecting cache
   *                   (e.g., JavaScript node's getNodeOutput() expects a deep clone)
   * @throws {Error} If maxSize is less than 1
   */
  constructor(maxSize: number = 100, cloneOnGet: boolean = false) {
    if (maxSize < 1) {
      throw new Error('Cache size must be at least 1');
    }
    this.cache = new Map();
    this.maxSize = maxSize;
    this.cloneOnGet = cloneOnGet;
  }

  /**
   * Set a node output in cache
   * 
   * If the entry already exists, updates the value and timestamp (marks as recently used).
   * If the cache is at capacity, evicts the least recently used non-persistent entry.
   * 
   * @param nodeId Node identifier (e.g., 'node-1', 'trigger')
   * @param output Node output value
   * @param persistent If true, this entry will never be evicted (default: false)
   */
  set(nodeId: string, output: unknown, persistent: boolean = false): void {
    // If already exists, update value and timestamp (mark as recently used)
    if (this.cache.has(nodeId)) {
      const entry = this.cache.get(nodeId)!;
      entry.value = output;
      const now = Date.now();
      entry.timestamp = now;
      entry.setTimestamp = now;
      entry.persistent = persistent || entry.persistent; // Can upgrade to persistent

      // ✅ DETERMINISTIC "MOST RECENT" ORDERING (CORE DATAFLOW CONTRACT)
      // Many parts of the engine interpret the "previous output" as the last entry
      // in getAll() (which follows Map insertion order). Map insertion order does
      // NOT change when you update an existing key, so without this, "previous output"
      // can point to stale entries even when timestamps are updated.
      //
      // Move this key to the end to reflect "most recently set".
      this.cache.delete(nodeId);
      this.cache.set(nodeId, entry);
      return;
    }

    // If at capacity, evict LRU non-persistent entry
    if (this.cache.size >= this.maxSize) {
      const evicted = this.evictLRU();
      if (evicted) {
        this.evictions++;
        if (process.env.ENABLE_MEMORY_LOGGING === 'true') {
          console.log(`[Memory] Evicted LRU node output: ${evicted} (cache size: ${this.maxSize})`);
        }
      } else {
        // All entries are persistent, cannot evict
        if (process.env.ENABLE_MEMORY_LOGGING === 'true') {
          console.warn(`[Memory] Cache full but all entries are persistent. Cannot evict.`);
        }
        // Still add the entry (will exceed maxSize, but preserves persistent entries)
      }
    }

    // Add new entry
    const now = Date.now();
    this.cache.set(nodeId, {
      value: output,
      timestamp: now,
      setTimestamp: now,
      persistent,
    });
  }

  /**
   * Get a node output from cache
   * 
   * Updates the timestamp to mark the entry as recently used (LRU behavior).
   * 
   * @param nodeId Node identifier
   * @returns Node output value (deep cloned if cloneOnGet is true), or undefined if not found (cache miss)
   */
  get(nodeId: string): unknown | undefined {
    const entry = this.cache.get(nodeId);
    if (entry) {
      // Update timestamp (mark as recently used)
      entry.timestamp = Date.now();
      this.hits++;
      
      // Return deep clone if cloneOnGet is enabled
      if (this.cloneOnGet) {
        return this.deepClone(entry.value);
      }
      
      return entry.value;
    }
    this.misses++;
    return undefined;
  }

  /**
   * Check if a node output exists in cache (without updating timestamp)
   * 
   * @param nodeId Node identifier
   * @returns True if entry exists, false otherwise
   */
  has(nodeId: string): boolean {
    return this.cache.has(nodeId);
  }

  /**
   * Get all entries as a plain object (for template resolution)
   * 
   * This method is used when spreading nodeOutputs into template context.
   * Returns all cached entries as a Record<string, unknown>.
   * 
   * @returns Object with all cached entries
   */
  getAll(): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    this.cache.forEach((entry, key) => {
      result[key] = entry.value;
    });
    return result;
  }

  /**
   * Get the most recently set entry (by timestamp), optionally excluding meta keys.
   *
   * ✅ CORE DATAFLOW CONTRACT:
   * Many parts of the engine need the "previous node output". Using Map insertion order
   * is not reliable once keys are updated (e.g., $json/json). This method provides a
   * deterministic "most recent" selection based on timestamps.
   */
  getMostRecentOutput(excludeKeys: string[] = []): unknown | undefined {
    const exclude = new Set(excludeKeys);
    let newestTs = -1;
    let newestValue: unknown | undefined = undefined;

    for (const [key, entry] of this.cache.entries()) {
      if (exclude.has(key)) continue;
      const ts = entry.setTimestamp ?? entry.timestamp;
      if (ts > newestTs) {
        newestTs = ts;
        newestValue = entry.value;
      }
    }

    return newestValue;
  }

  /**
   * Clear all entries from cache
   * 
   * Resets statistics and frees memory.
   * Called when workflow completes to prevent memory leaks.
   */
  clear(): void {
    const size = this.cache.size;
    this.cache.clear();
    this.hits = 0;
    this.misses = 0;
    this.evictions = 0;
    
    if (process.env.ENABLE_MEMORY_LOGGING === 'true') {
      console.log(`[Memory] Cleared node outputs cache (freed ${size} entries)`);
    }
  }

  /**
   * Get cache statistics
   * 
   * @returns Cache statistics including size, hits, misses, hit rate, and evictions
   */
  getStats(): CacheStats {
    const total = this.hits + this.misses;
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      hits: this.hits,
      misses: this.misses,
      hitRate: total > 0 ? this.hits / total : 0,
      evictions: this.evictions,
    };
  }

  /**
   * Get the current cache size
   * 
   * @returns Number of entries currently in cache
   */
  size(): number {
    return this.cache.size;
  }

  /**
   * Find and evict the least recently used non-persistent entry
   * 
   * Performance: O(N) where N is cache size. This is acceptable for typical cache sizes (100 entries).
   * For larger caches (>1000 entries), consider implementing O(1) eviction with a doubly-linked list.
   * 
   * @returns The key of the evicted entry, or null if all entries are persistent
   */
  private evictLRU(): string | null {
    let oldest = Infinity;
    let lruKey: string | null = null;
    
    // Find the oldest non-persistent entry
    this.cache.forEach((entry, key) => {
      // Skip persistent entries
      if (entry.persistent) {
        return;
      }
      
      if (entry.timestamp < oldest) {
        oldest = entry.timestamp;
        lruKey = key;
      }
    });
    
    // Evict the LRU entry if found
    if (lruKey !== null) {
      this.cache.delete(lruKey);
    }
    
    return lruKey;
  }

  /**
   * Deep clone a value using JSON serialization
   * 
   * Handles circular references gracefully (they become undefined in the clone).
   * For values that cannot be serialized (functions, undefined), returns the original value.
   * 
   * @param value Value to clone
   * @returns Deep cloned value, or original if cloning fails
   */
  private deepClone(value: unknown): unknown {
    // Handle primitives and null
    if (value === null || typeof value !== 'object') {
      return value;
    }

    // Handle undefined (JSON.stringify omits it, so we preserve it)
    if (value === undefined) {
      return undefined;
    }

    try {
      // Use JSON serialization for deep cloning
      // This handles most cases but will lose functions, undefined, and circular refs
      return JSON.parse(JSON.stringify(value));
    } catch (error) {
      // If cloning fails (e.g., circular reference), return original
      // This is safer than throwing, as the cache should be resilient
      if (process.env.ENABLE_MEMORY_LOGGING === 'true') {
        console.warn(`[Memory] Failed to deep clone value for node output, returning original:`, error);
      }
      return value;
    }
  }

  /**
   * Mark an entry as persistent (never evicted)
   * 
   * Useful for entries like 'trigger' that should always be available.
   * 
   * @param nodeId Node identifier
   * @returns True if entry was found and marked, false otherwise
   */
  markPersistent(nodeId: string): boolean {
    const entry = this.cache.get(nodeId);
    if (entry) {
      entry.persistent = true;
      return true;
    }
    return false;
  }

  /**
   * Get all node IDs currently in cache
   * 
   * Useful for debugging and monitoring.
   * 
   * @returns Array of node IDs
   */
  getKeys(): string[] {
    return Array.from(this.cache.keys());
  }

  /**
   * Warm the cache with multiple entries at once
   * 
   * Useful for resuming workflow execution from logs or restoring cache state.
   * All entries are set with the same timestamp (current time) and marked as non-persistent.
   * 
   * @param entries Record of nodeId -> output value pairs to load into cache
   * @param persistent If true, all entries will be marked as persistent (default: false)
   */
  warm(entries: Record<string, unknown>, persistent: boolean = false): void {
    const timestamp = Date.now();
    
    for (const [nodeId, output] of Object.entries(entries)) {
      // If cache is at capacity, evict LRU before adding
      if (this.cache.size >= this.maxSize && !this.cache.has(nodeId)) {
        const evicted = this.evictLRU();
        if (evicted) {
          this.evictions++;
        }
      }
      
      // Set entry with same timestamp for all warmed entries
      this.cache.set(nodeId, {
        value: output,
        timestamp,
        setTimestamp: timestamp,
        persistent,
      });
    }
    
    if (process.env.ENABLE_MEMORY_LOGGING === 'true') {
      console.log(`[Memory] Warmed cache with ${Object.keys(entries).length} entries`);
    }
  }
}
