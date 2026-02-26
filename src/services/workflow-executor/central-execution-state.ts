/**
 * Central Execution State Object
 * 
 * Coordinates state across:
 * - Memory (hot data, fast access)
 * - Database (warm data, ACID compliance)
 * - Object Storage (cold data, large payloads)
 * 
 * This is the single source of truth coordinator for execution state.
 * Implements multi-tier storage strategy for enterprise-grade reliability.
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { PersistentLayer, ExecutionStateSnapshot } from './persistent-layer';
import { WindowSystem } from './window-system';
import { ObjectStorageService } from './object-storage-service';

export interface ExecutionState {
  executionId: string;
  workflowId: string;
  status: string;
  currentNode: string | null;
  nodeOutputs: Record<string, unknown>;
  input: unknown;
  startedAt: string;
}

/**
 * Central Execution State
 * 
 * Unified state container that coordinates all execution state.
 * Implements multi-tier storage: Memory → Database → Object Storage
 */
export class CentralExecutionState {
  private executionId: string;
  private workflowId: string;
  
  // Multi-tier storage
  private memoryCache: WindowSystem; // Hot data
  private persistentLayer: PersistentLayer; // Warm data (ACID)
  private objectStorage?: ObjectStorageService; // Cold data (large payloads)

  // State tracking
  private state: ExecutionState;
  private initialized: boolean = false;

  constructor(
    executionId: string,
    workflowId: string,
    persistentLayer: PersistentLayer,
    objectStorage?: ObjectStorageService
  ) {
    this.executionId = executionId;
    this.workflowId = workflowId;
    this.persistentLayer = persistentLayer;
    this.objectStorage = objectStorage;
    
    // Initialize window system (100 node window)
    const cacheSize = parseInt(process.env.NODE_OUTPUTS_CACHE_SIZE || '100', 10);
    this.memoryCache = new WindowSystem(cacheSize);

    // Initialize empty state (will be loaded from DB)
    this.state = {
      executionId,
      workflowId,
      status: 'pending',
      currentNode: null,
      nodeOutputs: {},
      input: null,
      startedAt: new Date().toISOString(),
    };
  }

  /**
   * Initialize state from database (source of truth)
   * 
   * Loads execution state from persistent layer and warms memory cache.
   * This is called on workflow start or resume.
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return; // Already initialized
    }

    try {
      // Load from persistent layer (source of truth)
      const snapshot = await this.persistentLayer.restoreExecutionState(this.executionId);
      
      // Reconstruct state object
      this.state = {
        executionId: snapshot.executionId,
        workflowId: snapshot.workflowId,
        status: snapshot.status,
        currentNode: snapshot.currentNode,
        nodeOutputs: snapshot.stepOutputs,
        input: snapshot.input,
        startedAt: snapshot.startedAt,
      };

      // Warm memory cache with database data
      Object.entries(snapshot.stepOutputs).forEach(([nodeId, output]) => {
        // Check if it's an object storage reference
        if (this.isObjectStorageReference(output)) {
          // Store reference in cache, will load on demand
          this.memoryCache.set(nodeId, output, true); // Mark as persistent
        } else {
          // Store actual data in cache
          this.memoryCache.set(nodeId, output, false);
        }
      });

      this.initialized = true;
      console.log(`[CentralExecutionState] ✅ Initialized from database (${Object.keys(snapshot.stepOutputs).length} nodes)`);
    } catch (error: any) {
      // If execution doesn't exist, start fresh
      if (error.message?.includes('not found')) {
        this.initialized = true;
        console.log(`[CentralExecutionState] ✅ Initialized new execution`);
        return;
      }
      throw error;
    }
  }

  /**
   * Get node output (multi-tier lookup)
   * 
   * Strategy:
   * 1. Check memory cache (fastest) - hot data
   * 2. Check database (if cache miss) - warm data
   * 3. Check object storage (if large payload) - cold data
   * 
   * This implements the "window system" pattern for efficient state access.
   */
  async getNodeOutput(nodeId: string): Promise<unknown | null> {
    // 1. Try memory cache first (hot data)
    const cached = this.memoryCache.get(nodeId);
    if (cached !== undefined) {
      // Check if it's an object storage reference
      if (this.isObjectStorageReference(cached)) {
        // Load from object storage (cold data)
        if (this.objectStorage) {
          try {
            const loaded = await this.objectStorage.load(cached as any);
            // Update cache with actual data (promote to hot)
            this.memoryCache.set(nodeId, loaded, false);
            return loaded;
          } catch (error) {
            console.error(`[CentralExecutionState] Failed to load from object storage:`, error);
            return null;
          }
        }
        return null;
      }
      return cached;
    }

    // 2. Check database (warm data)
    const dbOutput = await this.persistentLayer.getNodeOutput(this.executionId, nodeId);
    if (dbOutput) {
      // Check if it's a reference to object storage
      if (this.isObjectStorageReference(dbOutput)) {
        // 3. Load from object storage (cold data)
        if (this.objectStorage) {
          try {
            const loaded = await this.objectStorage.load(dbOutput as any);
            // Warm cache with actual data
            this.memoryCache.set(nodeId, loaded, false);
            return loaded;
          } catch (error) {
            console.error(`[CentralExecutionState] Failed to load from object storage:`, error);
            return null;
          }
        }
        return null;
      }

      // Warm cache with database data
      this.memoryCache.set(nodeId, dbOutput, false);
      return dbOutput;
    }

    return null;
  }

  /**
   * Set node output (write-through pattern)
   * 
   * Strategy:
   * 1. Write to memory cache (fast access) - hot data
   * 2. Write to database (ACID compliance) - warm data
   * 3. Write to object storage if large (payload > 1MB) - cold data
   * 
   * This ensures durability while maintaining performance.
   */
  async setNodeOutput(
    nodeId: string,
    nodeName: string,
    nodeType: string,
    input: unknown,
    output: unknown,
    sequence: number
  ): Promise<void> {
    // Determine storage strategy based on payload size
    const payloadSize = JSON.stringify(output).length;
    const MAX_DB_SIZE = 1024 * 1024; // 1MB

    let finalOutput: unknown = output;

    // If payload is large, store in object storage
    if (payloadSize > MAX_DB_SIZE && this.objectStorage) {
      try {
        const storageRef = await this.objectStorage.store(
          this.executionId,
          nodeId,
          output
        );
        finalOutput = storageRef; // Store reference in DB
        console.log(`[CentralExecutionState] Stored large payload (${payloadSize} bytes) in object storage`);
      } catch (error) {
        console.error(`[CentralExecutionState] Failed to store in object storage, falling back to DB:`, error);
        // Fallback to database (may fail if too large, but we try)
      }
    }

    // 1. Update memory cache (hot data) - store actual data for fast access
    this.memoryCache.set(nodeId, output, false);

    // 2. Checkpoint to database (ACID compliance)
    // Store reference if large, actual data if small
    await this.persistentLayer.checkpointNodeExecution(
      this.executionId,
      nodeId,
      nodeName,
      nodeType,
      input,
      finalOutput, // Reference if large, actual data if small
      'success',
      sequence
    );

    // 3. Update state object
    this.state.nodeOutputs[nodeId] = output;
    this.state.currentNode = nodeId;

    console.log(`[CentralExecutionState] ✅ Set node output ${nodeId} (${payloadSize} bytes, sequence ${sequence})`);
  }

  /**
   * Get all node outputs (for template resolution)
   * 
   * Returns memory cache snapshot (fast access for template resolution).
   * This is used by the template resolver for {{variable}} syntax.
   */
  getAllNodeOutputs(): Record<string, unknown> {
    return this.memoryCache.getAll();
  }

  /**
   * Check if value is object storage reference
   */
  private isObjectStorageReference(value: unknown): boolean {
    return (
      typeof value === 'object' &&
      value !== null &&
      '_storage' in value &&
      (value as any)._storage === 's3'
    );
  }

  /**
   * Get current execution state
   * 
   * Returns immutable copy of state.
   */
  getState(): ExecutionState {
    return {
      ...this.state,
      nodeOutputs: { ...this.state.nodeOutputs }, // Deep copy
    };
  }

  /**
   * Update execution status
   */
  async updateStatus(
    status: 'running' | 'success' | 'failed' | 'waiting',
    output?: unknown,
    error?: string
  ): Promise<void> {
    this.state.status = status;
    await this.persistentLayer.updateExecutionStatus(
      this.executionId,
      status,
      output,
      error
    );
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    return this.memoryCache.getStats();
  }
}
