/**
 * Execution State Manager
 * Tracks real-time execution state for workflows
 */

import { EventEmitter } from 'events';

export type NodeStatus = 'idle' | 'pending' | 'running' | 'success' | 'error' | 'skipped';

export interface NodeExecutionState {
  nodeId: string;
  nodeName: string;
  status: NodeStatus;
  startTime?: number;
  endTime?: number;
  duration?: number;
  input?: unknown;
  output?: unknown;
  error?: string;
  progress?: number;
  sequence: number;
  timestamp: number;
}

export interface ExecutionState {
  executionId: string;
  workflowId: string;
  status: 'pending' | 'running' | 'success' | 'failed' | 'cancelled';
  startTime: number;
  endTime?: number;
  duration?: number;
  progress: number;
  totalNodes: number;
  completedNodes: number;
  nodes: Map<string, NodeExecutionState>;
  input?: unknown;
  output?: unknown;
  error?: string;
}

export type ExecutionStateUpdate = {
  executionId: string;
  nodeId?: string;
  nodeState?: NodeExecutionState;
  overallState?: Partial<ExecutionState>;
};

/**
 * Execution State Manager
 * Manages state for all active workflow executions
 */
export class ExecutionStateManager extends EventEmitter {
  private executions: Map<string, ExecutionState> = new Map();
  private subscriptions: Map<string, Set<(update: ExecutionStateUpdate) => void>> = new Map();

  /**
   * Initialize execution state
   */
  initializeExecution(
    executionId: string,
    workflowId: string,
    totalNodes: number,
    input?: unknown
  ): ExecutionState {
    const execution: ExecutionState = {
      executionId,
      workflowId,
      status: 'pending',
      startTime: Date.now(),
      progress: 0,
      totalNodes,
      completedNodes: 0,
      nodes: new Map(),
      input,
    };

    this.executions.set(executionId, execution);
    this.emit('execution_initialized', execution);
    return execution;
  }

  /**
   * Update node state
   */
  updateNodeState(
    executionId: string,
    nodeId: string,
    nodeName: string,
    status: NodeStatus,
    data?: {
      input?: unknown;
      output?: unknown;
      error?: string;
      progress?: number;
      retryAttempts?: number;
      executionDuration?: number;
      totalDuration?: number;
      finalFailure?: boolean;
      [key: string]: any; // Allow additional metadata
    }
  ): NodeExecutionState {
    const execution = this.executions.get(executionId);
    if (!execution) {
      throw new Error(`Execution ${executionId} not found`);
    }

    const existingNode = execution.nodes.get(nodeId);
    const sequence = existingNode?.sequence || execution.nodes.size + 1;
    const startTime = existingNode?.startTime || (status === 'running' ? Date.now() : undefined);
    const endTime = status === 'success' || status === 'error' || status === 'skipped' 
      ? Date.now() 
      : existingNode?.endTime;

    const nodeState: NodeExecutionState = {
      nodeId,
      nodeName,
      status,
      startTime,
      endTime,
      duration: startTime && endTime ? endTime - startTime : undefined,
      input: data?.input ?? existingNode?.input,
      output: data?.output ?? existingNode?.output,
      error: data?.error ?? existingNode?.error,
      progress: data?.progress ?? existingNode?.progress,
      sequence,
      timestamp: Date.now(),
    };

    execution.nodes.set(nodeId, nodeState);

    // Update overall execution state
    this.updateOverallState(execution);

    // Notify subscribers
    this.notifySubscribers(executionId, {
      executionId,
      nodeId,
      nodeState,
    });

    this.emit('node_state_updated', {
      executionId,
      nodeState,
    });

    return nodeState;
  }

  /**
   * Update overall execution state
   */
  private updateOverallState(execution: ExecutionState): void {
    const nodeStates = Array.from(execution.nodes.values());
    const completedNodes = nodeStates.filter(
      n => n.status === 'success' || n.status === 'error' || n.status === 'skipped'
    ).length;

    execution.completedNodes = completedNodes;
    execution.progress = execution.totalNodes > 0
      ? Math.round((completedNodes / execution.totalNodes) * 100)
      : 0;

    // Determine overall status
    const hasRunning = nodeStates.some(n => n.status === 'running');
    const hasError = nodeStates.some(n => n.status === 'error');
    const allCompleted = completedNodes === execution.totalNodes;

    if (execution.status === 'pending' && hasRunning) {
      execution.status = 'running';
    } else if (allCompleted) {
      execution.status = hasError ? 'failed' : 'success';
      execution.endTime = Date.now();
      execution.duration = execution.endTime - execution.startTime;
    }

    // Update execution in map
    this.executions.set(execution.executionId, execution);
  }

  /**
   * Get execution state
   */
  getExecutionState(executionId: string): ExecutionState | undefined {
    return this.executions.get(executionId);
  }

  /**
   * Get node state
   */
  getNodeState(executionId: string, nodeId: string): NodeExecutionState | undefined {
    const execution = this.executions.get(executionId);
    return execution?.nodes.get(nodeId);
  }

  /**
   * Subscribe to execution updates
   */
  subscribe(
    executionId: string,
    callback: (update: ExecutionStateUpdate) => void
  ): () => void {
    if (!this.subscriptions.has(executionId)) {
      this.subscriptions.set(executionId, new Set());
    }

    this.subscriptions.get(executionId)!.add(callback);

    // Send current state immediately
    const execution = this.executions.get(executionId);
    if (execution) {
      callback({
        executionId,
        overallState: {
          status: execution.status,
          progress: execution.progress,
          completedNodes: execution.completedNodes,
          totalNodes: execution.totalNodes,
        },
      });
    }

    // Return unsubscribe function
    return () => {
      const subs = this.subscriptions.get(executionId);
      if (subs) {
        subs.delete(callback);
        if (subs.size === 0) {
          this.subscriptions.delete(executionId);
        }
      }
    };
  }

  /**
   * Notify subscribers of updates
   */
  private notifySubscribers(executionId: string, update: ExecutionStateUpdate): void {
    const subscribers = this.subscriptions.get(executionId);
    if (subscribers) {
      subscribers.forEach(callback => {
        try {
          callback(update);
        } catch (error) {
          console.error(`[ExecutionStateManager] Error in subscriber callback:`, error);
        }
      });
    }
  }

  /**
   * Calculate progress percentage
   */
  calculateProgress(execution: ExecutionState): number {
    if (execution.totalNodes === 0) return 0;
    return Math.round((execution.completedNodes / execution.totalNodes) * 100);
  }

  /**
   * Determine overall status
   */
  determineOverallStatus(execution: ExecutionState): ExecutionState['status'] {
    const nodeStates = Array.from(execution.nodes.values());
    const hasRunning = nodeStates.some(n => n.status === 'running');
    const hasError = nodeStates.some(n => n.status === 'error');
    const allCompleted = execution.completedNodes === execution.totalNodes;

    if (hasRunning) return 'running';
    if (allCompleted) return hasError ? 'failed' : 'success';
    return execution.status;
  }

  /**
   * Set execution output
   */
  setExecutionOutput(executionId: string, output: unknown): void {
    const execution = this.executions.get(executionId);
    if (execution) {
      execution.output = output;
      this.executions.set(executionId, execution);
      
      this.notifySubscribers(executionId, {
        executionId,
        overallState: { output },
      });
    }
  }

  /**
   * Set execution error
   */
  setExecutionError(executionId: string, error: string): void {
    const execution = this.executions.get(executionId);
    if (execution) {
      execution.error = error;
      execution.status = 'failed';
      execution.endTime = Date.now();
      execution.duration = execution.endTime - execution.startTime;
      this.executions.set(executionId, execution);
      
      this.notifySubscribers(executionId, {
        executionId,
        overallState: { status: 'failed', error },
      });
    }
  }

  /**
   * Cancel execution
   */
  cancelExecution(executionId: string): void {
    const execution = this.executions.get(executionId);
    if (execution && execution.status === 'running') {
      execution.status = 'cancelled';
      execution.endTime = Date.now();
      execution.duration = execution.endTime - execution.startTime;
      this.executions.set(executionId, execution);
      
      this.notifySubscribers(executionId, {
        executionId,
        overallState: { status: 'cancelled' },
      });
    }
  }

  /**
   * Clean up old executions (older than specified time)
   */
  cleanup(maxAge: number = 3600000): void { // Default 1 hour
    const now = Date.now();
    const toDelete: string[] = [];

    this.executions.forEach((execution, executionId) => {
      const age = now - execution.startTime;
      if (age > maxAge && (execution.status === 'success' || execution.status === 'failed')) {
        toDelete.push(executionId);
      }
    });

    toDelete.forEach(id => {
      this.executions.delete(id);
      this.subscriptions.delete(id);
    });

    if (toDelete.length > 0) {
      console.log(`[ExecutionStateManager] Cleaned up ${toDelete.length} old executions`);
    }
  }

  /**
   * Get all active executions
   */
  getActiveExecutions(): ExecutionState[] {
    return Array.from(this.executions.values()).filter(
      e => e.status === 'running' || e.status === 'pending'
    );
  }
}

// Export singleton instance
let stateManagerInstance: ExecutionStateManager | null = null;

export function getExecutionStateManager(): ExecutionStateManager {
  if (!stateManagerInstance) {
    stateManagerInstance = new ExecutionStateManager();
    
    // Periodic cleanup
    setInterval(() => {
      stateManagerInstance?.cleanup();
    }, 60000); // Every minute
  }
  return stateManagerInstance;
}
