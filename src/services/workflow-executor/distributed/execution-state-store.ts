/**
 * Execution State Store
 * 
 * Persistent storage for workflow execution state.
 * Provides:
 * - State persistence
 * - Checkpoint management
 * - Recovery support
 * - State querying
 */

import { createClient, RedisClientType } from 'redis';

export interface ExecutionState {
  executionId: string;
  workflowId: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'paused' | 'cancelled';
  currentNodeId?: string;
  completedNodes: string[];
  failedNodes: string[];
  nodeResults: Record<string, any>;
  nodeErrors: Record<string, string>;
  input: any;
  output?: any;
  error?: string;
  startedAt: number;
  completedAt?: number;
  metadata?: Record<string, any>;
  checkpoints: Array<{
    nodeId: string;
    timestamp: number;
    state: any;
  }>;
}

/**
 * Execution State Store
 * Manages persistent execution state in Redis
 */
export class ExecutionStateStore {
  private redis: RedisClientType | null = null;
  private isConnected = false;
  private readonly stateKeyPrefix = 'workflow:execution:state:';
  private readonly checkpointKeyPrefix = 'workflow:execution:checkpoint:';
  private readonly executionIndexKey = 'workflow:execution:index';

  /**
   * Initialize Redis connection
   */
  async initialize(redisUrl?: string): Promise<void> {
    try {
      const url = redisUrl || process.env.REDIS_URL || 'redis://localhost:6379';
      this.redis = createClient({ url }) as RedisClientType;
      
      this.redis.on('error', (err) => {
        console.error('[ExecutionStateStore] Redis error:', err);
        this.isConnected = false;
      });

      this.redis.on('connect', () => {
        console.log('[ExecutionStateStore] ✅ Connected to Redis');
        this.isConnected = true;
      });

      await this.redis.connect();
      console.log('[ExecutionStateStore] ✅ Execution state store initialized');
    } catch (error) {
      console.error('[ExecutionStateStore] ❌ Failed to connect to Redis:', error);
      this.isConnected = false;
      throw error;
    }
  }

  /**
   * Check if Redis is available
   */
  isAvailable(): boolean {
    return this.isConnected && this.redis !== null;
  }

  /**
   * Save execution state
   */
  async saveState(state: ExecutionState): Promise<void> {
    if (!this.isAvailable()) {
      throw new Error('Redis state store not available');
    }

    const stateKey = `${this.stateKeyPrefix}${state.executionId}`;
    const stateData = JSON.stringify(state);

    // Store state with 7 day TTL
    await this.redis!.setEx(stateKey, 604800, stateData);

    // Add to execution index
    await this.redis!.sAdd(this.executionIndexKey, state.executionId);

    console.log(`[ExecutionStateStore] ✅ Saved state for execution ${state.executionId}`);
  }

  /**
   * Get execution state
   */
  async getState(executionId: string): Promise<ExecutionState | null> {
    if (!this.isAvailable()) {
      return null;
    }

    const stateKey = `${this.stateKeyPrefix}${executionId}`;
    const stateData = await this.redis!.get(stateKey);

    if (!stateData) {
      return null;
    }

    return JSON.parse(stateData);
  }

  /**
   * Update execution state
   */
  async updateState(executionId: string, updates: Partial<ExecutionState>): Promise<void> {
    const state = await this.getState(executionId);
    if (!state) {
      throw new Error(`Execution state ${executionId} not found`);
    }

    const updatedState: ExecutionState = {
      ...state,
      ...updates,
    };

    await this.saveState(updatedState);
  }

  /**
   * Save checkpoint
   */
  async saveCheckpoint(executionId: string, nodeId: string, state: any): Promise<void> {
    if (!this.isAvailable()) {
      return;
    }

    const checkpoint = {
      nodeId,
      timestamp: Date.now(),
      state,
    };

    const executionState = await this.getState(executionId);
    if (executionState) {
      executionState.checkpoints.push(checkpoint);
      await this.saveState(executionState);
    }

    // Also store checkpoint separately for quick access
    const checkpointKey = `${this.checkpointKeyPrefix}${executionId}:${nodeId}`;
    await this.redis!.setEx(checkpointKey, 604800, JSON.stringify(checkpoint));

    console.log(`[ExecutionStateStore] ✅ Saved checkpoint for execution ${executionId}, node ${nodeId}`);
  }

  /**
   * Get checkpoint
   */
  async getCheckpoint(executionId: string, nodeId: string): Promise<any | null> {
    if (!this.isAvailable()) {
      return null;
    }

    const checkpointKey = `${this.checkpointKeyPrefix}${executionId}:${nodeId}`;
    const checkpointData = await this.redis!.get(checkpointKey);

    if (!checkpointData) {
      return null;
    }

    return JSON.parse(checkpointData);
  }

  /**
   * Mark node as completed
   */
  async markNodeCompleted(executionId: string, nodeId: string, result: any): Promise<void> {
    const state = await this.getState(executionId);
    if (!state) {
      throw new Error(`Execution state ${executionId} not found`);
    }

    if (!state.completedNodes.includes(nodeId)) {
      state.completedNodes.push(nodeId);
    }

    state.nodeResults[nodeId] = result;

    // Remove from failed nodes if present
    state.failedNodes = state.failedNodes.filter(id => id !== nodeId);
    delete state.nodeErrors[nodeId];

    await this.saveState(state);
    console.log(`[ExecutionStateStore] ✅ Marked node ${nodeId} as completed in execution ${executionId}`);
  }

  /**
   * Mark node as failed
   */
  async markNodeFailed(executionId: string, nodeId: string, error: string): Promise<void> {
    const state = await this.getState(executionId);
    if (!state) {
      throw new Error(`Execution state ${executionId} not found`);
    }

    if (!state.failedNodes.includes(nodeId)) {
      state.failedNodes.push(nodeId);
    }

    state.nodeErrors[nodeId] = error;

    await this.saveState(state);
    console.log(`[ExecutionStateStore] ✅ Marked node ${nodeId} as failed in execution ${executionId}`);
  }

  /**
   * Get all executions for a workflow
   */
  async getWorkflowExecutions(workflowId: string): Promise<ExecutionState[]> {
    if (!this.isAvailable()) {
      return [];
    }

    // Get all execution IDs from index
    const executionIds = await this.redis!.sMembers(this.executionIndexKey);
    const states: ExecutionState[] = [];

    for (const executionId of executionIds) {
      const state = await this.getState(executionId);
      if (state && state.workflowId === workflowId) {
        states.push(state);
      }
    }

    return states;
  }

  /**
   * Delete execution state
   */
  async deleteState(executionId: string): Promise<void> {
    if (!this.isAvailable()) {
      return;
    }

    const stateKey = `${this.stateKeyPrefix}${executionId}`;
    await this.redis!.del(stateKey);

    // Remove from index
    await this.redis!.sRem(this.executionIndexKey, executionId);

    // Delete checkpoints
    const checkpointKeys = await this.redis!.keys(`${this.checkpointKeyPrefix}${executionId}:*`);
    if (checkpointKeys.length > 0) {
      await this.redis!.del(checkpointKeys);
    }

    console.log(`[ExecutionStateStore] ✅ Deleted state for execution ${executionId}`);
  }

  /**
   * Close Redis connection
   */
  async close(): Promise<void> {
    if (this.redis) {
      await this.redis.quit();
      this.isConnected = false;
      console.log('[ExecutionStateStore] ✅ Redis connection closed');
    }
  }
}

// Export singleton instance
let stateStoreInstance: ExecutionStateStore | null = null;

export function getExecutionStateStore(): ExecutionStateStore {
  if (!stateStoreInstance) {
    stateStoreInstance = new ExecutionStateStore();
  }
  return stateStoreInstance;
}
