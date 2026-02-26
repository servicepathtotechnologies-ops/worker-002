/**
 * Checkpoint Manager
 * 
 * Manages step-level checkpoints for workflow execution.
 * Features:
 * - Step-level checkpoints
 * - Checkpoint versioning
 * - Resume from checkpoint
 * - Checkpoint querying
 */

import { createClient, RedisClientType } from 'redis';
import { WorkflowNode } from '../../../../core/types/ai-types';

export interface Checkpoint {
  id: string;
  executionId: string;
  workflowId: string;
  nodeId: string;
  nodeType: string;
  version: number;
  timestamp: number;
  state: {
    input: any;
    output?: any;
    nodeResults: Record<string, any>;
    completedNodes: string[];
    failedNodes: string[];
    currentNodeId: string;
  };
  metadata?: Record<string, any>;
}

/**
 * Checkpoint Manager
 * Manages workflow execution checkpoints
 */
export class CheckpointManager {
  private redis: RedisClientType | null = null;
  private isConnected = false;
  private readonly checkpointKeyPrefix = 'workflow:checkpoint:';
  private readonly executionCheckpointsKeyPrefix = 'workflow:execution:checkpoints:';
  private readonly latestCheckpointKeyPrefix = 'workflow:execution:latest_checkpoint:';

  /**
   * Initialize Redis connection
   */
  async initialize(redisUrl?: string): Promise<void> {
    try {
      const url = redisUrl || process.env.REDIS_URL || 'redis://localhost:6379';
      this.redis = createClient({ url }) as RedisClientType;
      
      this.redis.on('error', (err) => {
        console.error('[CheckpointManager] Redis error:', err);
        this.isConnected = false;
      });

      this.redis.on('connect', () => {
        console.log('[CheckpointManager] ✅ Connected to Redis');
        this.isConnected = true;
      });

      await this.redis.connect();
      console.log('[CheckpointManager] ✅ Checkpoint manager initialized');
    } catch (error) {
      console.error('[CheckpointManager] ❌ Failed to connect to Redis:', error);
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
   * Create checkpoint
   */
  async createCheckpoint(
    executionId: string,
    workflowId: string,
    nodeId: string,
    nodeType: string,
    state: Checkpoint['state'],
    metadata?: Record<string, any>
  ): Promise<Checkpoint> {
    if (!this.isAvailable()) {
      throw new Error('Checkpoint manager not available');
    }

    // Get next version
    const version = await this.getNextVersion(executionId);

    const checkpoint: Checkpoint = {
      id: `${executionId}:${nodeId}:${version}`,
      executionId,
      workflowId,
      nodeId,
      nodeType,
      version,
      timestamp: Date.now(),
      state,
      metadata,
    };

    const checkpointKey = `${this.checkpointKeyPrefix}${checkpoint.id}`;
    const checkpointData = JSON.stringify(checkpoint);

    // Store checkpoint
    await this.redis!.setEx(checkpointKey, 2592000, checkpointData); // 30 days TTL

    // Add to execution checkpoints list
    const executionCheckpointsKey = `${this.executionCheckpointsKeyPrefix}${executionId}`;
    await this.redis!.zAdd(executionCheckpointsKey, {
      score: version,
      value: checkpoint.id,
    });

    // Update latest checkpoint
    const latestCheckpointKey = `${this.latestCheckpointKeyPrefix}${executionId}`;
    await this.redis!.setEx(latestCheckpointKey, 2592000, checkpoint.id);

    console.log(`[CheckpointManager] ✅ Created checkpoint ${checkpoint.id} (version ${version}, node: ${nodeId})`);
    return checkpoint;
  }

  /**
   * Get next version for execution
   */
  private async getNextVersion(executionId: string): Promise<number> {
    const executionCheckpointsKey = `${this.executionCheckpointsKeyPrefix}${executionId}`;
    const count = await this.redis!.zCard(executionCheckpointsKey);
    return count + 1;
  }

  /**
   * Get checkpoint by ID
   */
  async getCheckpoint(checkpointId: string): Promise<Checkpoint | null> {
    if (!this.isAvailable()) {
      return null;
    }

    const checkpointKey = `${this.checkpointKeyPrefix}${checkpointId}`;
    const checkpointData = await this.redis!.get(checkpointKey);

    if (!checkpointData) {
      return null;
    }

    return JSON.parse(checkpointData);
  }

  /**
   * Get latest checkpoint for execution
   */
  async getLatestCheckpoint(executionId: string): Promise<Checkpoint | null> {
    if (!this.isAvailable()) {
      return null;
    }

    const latestCheckpointKey = `${this.latestCheckpointKeyPrefix}${executionId}`;
    const checkpointId = await this.redis!.get(latestCheckpointKey);

    if (!checkpointId) {
      return null;
    }

    return this.getCheckpoint(checkpointId);
  }

  /**
   * Get all checkpoints for execution
   */
  async getExecutionCheckpoints(executionId: string): Promise<Checkpoint[]> {
    if (!this.isAvailable()) {
      return [];
    }

    const executionCheckpointsKey = `${this.executionCheckpointsKeyPrefix}${executionId}`;
    const checkpointIds = await this.redis!.zRange(executionCheckpointsKey, 0, -1);

    const checkpoints: Checkpoint[] = [];
    for (const checkpointId of checkpointIds) {
      const checkpoint = await this.getCheckpoint(checkpointId);
      if (checkpoint) {
        checkpoints.push(checkpoint);
      }
    }

    return checkpoints;
  }

  /**
   * Get checkpoint by node
   */
  async getCheckpointByNode(executionId: string, nodeId: string): Promise<Checkpoint | null> {
    const checkpoints = await this.getExecutionCheckpoints(executionId);
    const nodeCheckpoints = checkpoints.filter(c => c.nodeId === nodeId);
    
    if (nodeCheckpoints.length === 0) {
      return null;
    }

    // Return latest checkpoint for this node
    return nodeCheckpoints.sort((a, b) => b.version - a.version)[0];
  }

  /**
   * Delete checkpoint
   */
  async deleteCheckpoint(checkpointId: string): Promise<void> {
    if (!this.isAvailable()) {
      return;
    }

    const checkpoint = await this.getCheckpoint(checkpointId);
    if (!checkpoint) {
      return;
    }

    const checkpointKey = `${this.checkpointKeyPrefix}${checkpointId}`;
    await this.redis!.del(checkpointKey);

    const executionCheckpointsKey = `${this.executionCheckpointsKeyPrefix}${checkpoint.executionId}`;
    await this.redis!.zRem(executionCheckpointsKey, checkpointId);

    console.log(`[CheckpointManager] ✅ Deleted checkpoint ${checkpointId}`);
  }

  /**
   * Close Redis connection
   */
  async close(): Promise<void> {
    if (this.redis) {
      await this.redis.quit();
      this.isConnected = false;
      console.log('[CheckpointManager] ✅ Redis connection closed');
    }
  }
}

// Export singleton instance
let checkpointManagerInstance: CheckpointManager | null = null;

export function getCheckpointManager(): CheckpointManager {
  if (!checkpointManagerInstance) {
    checkpointManagerInstance = new CheckpointManager();
  }
  return checkpointManagerInstance;
}
