/**
 * Distributed Workflow Execution Engine
 * 
 * Main orchestrator for distributed workflow execution.
 * Features:
 * - Queue-based execution
 * - Stateless workers
 * - Workflow task scheduling
 * - Retryable jobs
 * - Persistent execution state
 * - Horizontal scaling support
 */

import { Workflow, WorkflowNode, WorkflowEdge } from '../../../core/types/ai-types';
import { RedisQueueManager, QueueJob } from './redis-queue-manager';
import { ExecutionStateStore, ExecutionState } from './execution-state-store';
import { randomUUID } from 'crypto';

export interface ExecutionOptions {
  priority?: number;
  maxRetries?: number;
  retryDelay?: number;
  timeout?: number;
  metadata?: Record<string, any>;
}

export interface ExecutionResult {
  executionId: string;
  success: boolean;
  output?: any;
  error?: string;
  completedNodes: string[];
  failedNodes: string[];
  executionTime: number;
}

/**
 * Distributed Execution Engine
 * Orchestrates distributed workflow execution
 */
export class DistributedExecutionEngine {
  private queueManager: RedisQueueManager;
  private stateStore: ExecutionStateStore;
  private workerPool: Map<string, any> = new Map(); // Worker registry
  private isInitialized = false;

  constructor() {
    this.queueManager = new RedisQueueManager();
    this.stateStore = new ExecutionStateStore();
  }

  /**
   * Initialize engine
   */
  async initialize(redisUrl?: string): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    await this.queueManager.initialize(redisUrl);
    await this.stateStore.initialize(redisUrl);

    // Start scheduled job processor
    this.startScheduledJobProcessor();

    this.isInitialized = true;
    console.log('[DistributedExecutionEngine] ✅ Distributed execution engine initialized');
  }

  /**
   * Execute workflow
   */
  async executeWorkflow(
    workflow: Workflow,
    input: any,
    options: ExecutionOptions = {}
  ): Promise<string> {
    if (!this.isInitialized) {
      throw new Error('Execution engine not initialized');
    }

    const executionId = randomUUID();
    const workflowId = workflow.metadata?.id || 'unknown';

    // Create initial execution state
    const initialState: ExecutionState = {
      executionId,
      workflowId,
      status: 'pending',
      completedNodes: [],
      failedNodes: [],
      nodeResults: {},
      nodeErrors: {},
      input,
      startedAt: Date.now(),
      checkpoints: [],
      metadata: options.metadata,
    };

    await this.stateStore.saveState(initialState);

    // Find trigger node
    const triggerNode = workflow.nodes.find(node => {
      const nodeType = node.type || node.data?.type || '';
      return nodeType.includes('trigger') || nodeType === 'manual_trigger';
    });

    if (!triggerNode) {
      throw new Error('No trigger node found in workflow');
    }

    // Schedule initial node execution
    await this.scheduleNode(executionId, triggerNode.id, triggerNode, input, options, workflowId);

    console.log(`[DistributedExecutionEngine] ✅ Started execution ${executionId} for workflow ${workflowId}`);
    return executionId;
  }

  /**
   * Schedule node execution
   */
  private async scheduleNode(
    executionId: string,
    nodeId: string,
    node: WorkflowNode,
    input: any,
    options: ExecutionOptions,
    workflowId: string
  ): Promise<void> {
    const nodeType = node.type || node.data?.type || 'unknown';

    const job: QueueJob = {
      id: randomUUID(),
      workflowId: workflowId,
      executionId,
      nodeId,
      nodeType,
      input,
      priority: options.priority || 0,
      maxRetries: options.maxRetries || 3,
      retryCount: 0,
      retryDelay: options.retryDelay || 5000,
      createdAt: Date.now(),
      status: 'pending',
      metadata: options.metadata,
    };

    await this.queueManager.enqueue(job);
    console.log(`[DistributedExecutionEngine] ✅ Scheduled node ${nodeId} (${nodeType}) for execution ${executionId}`);
  }

  /**
   * Process node execution result
   */
  async processNodeResult(
    executionId: string,
    nodeId: string,
    result: any,
    error?: string
  ): Promise<void> {
    const state = await this.stateStore.getState(executionId);
    if (!state) {
      throw new Error(`Execution state ${executionId} not found`);
    }

    if (error) {
      await this.stateStore.markNodeFailed(executionId, nodeId, error);
      state.status = 'failed';
      state.error = error;
    } else {
      await this.stateStore.markNodeCompleted(executionId, nodeId, result);
    }

    // Get workflow to find next nodes
    // TODO: Load workflow from storage
    // For now, we'll update state and let workers handle next nodes

    await this.stateStore.saveState(state);
  }

  /**
   * Get execution status
   */
  async getExecutionStatus(executionId: string): Promise<ExecutionState | null> {
    return await this.stateStore.getState(executionId);
  }

  /**
   * Get execution result
   */
  async getExecutionResult(executionId: string): Promise<ExecutionResult | null> {
    const state = await this.stateStore.getState(executionId);
    if (!state) {
      return null;
    }

    const executionTime = state.completedAt
      ? state.completedAt - state.startedAt
      : Date.now() - state.startedAt;

    return {
      executionId,
      success: state.status === 'completed',
      output: state.output,
      error: state.error,
      completedNodes: state.completedNodes,
      failedNodes: state.failedNodes,
      executionTime,
    };
  }

  /**
   * Cancel execution
   */
  async cancelExecution(executionId: string): Promise<void> {
    const state = await this.stateStore.getState(executionId);
    if (!state) {
      throw new Error(`Execution state ${executionId} not found`);
    }

    state.status = 'cancelled';
    await this.stateStore.saveState(state);

    console.log(`[DistributedExecutionEngine] ✅ Cancelled execution ${executionId}`);
  }

  /**
   * Retry failed node
   */
  async retryNode(executionId: string, nodeId: string, delayMs?: number): Promise<void> {
    const state = await this.stateStore.getState(executionId);
    if (!state) {
      throw new Error(`Execution state ${executionId} not found`);
    }

    // Get job for this node
    // TODO: Store job ID in state or retrieve from queue
    // For now, we'll create a new job
    const jobId = `${executionId}:${nodeId}`;
    await this.queueManager.retryJob(jobId, delayMs);

    console.log(`[DistributedExecutionEngine] ✅ Scheduled retry for node ${nodeId} in execution ${executionId}`);
  }

  /**
   * Start scheduled job processor
   */
  private startScheduledJobProcessor(): void {
    setInterval(async () => {
      try {
        await this.queueManager.processScheduledJobs();
      } catch (error) {
        console.error('[DistributedExecutionEngine] ❌ Error processing scheduled jobs:', error);
      }
    }, 1000); // Check every second
  }

  /**
   * Get queue statistics
   */
  async getQueueStats() {
    return await this.queueManager.getStats();
  }

  /**
   * Close engine
   */
  async close(): Promise<void> {
    await this.queueManager.close();
    await this.stateStore.close();
    this.isInitialized = false;
    console.log('[DistributedExecutionEngine] ✅ Distributed execution engine closed');
  }
}

// Export singleton instance
let engineInstance: DistributedExecutionEngine | null = null;

export function getDistributedExecutionEngine(): DistributedExecutionEngine {
  if (!engineInstance) {
    engineInstance = new DistributedExecutionEngine();
  }
  return engineInstance;
}
