/**
 * Temporal-Style Workflow Engine
 * 
 * Comprehensive workflow execution engine with:
 * - Workflow state machine
 * - Event sourcing execution history
 * - Deterministic replay
 * - Resume from failure
 * - Step level checkpoints
 * - Persistent state storage
 */

import { Workflow, WorkflowNode, WorkflowEdge } from '../../../../core/types/ai-types';
import { WorkflowStateMachineManager, WorkflowStateMachine, WorkflowState } from './workflow-state-machine';
import { EventStore, EventType, getEventStore } from './event-store';
import { CheckpointManager, Checkpoint, getCheckpointManager } from './checkpoint-manager';
import { WorkflowReplayEngine, workflowReplayEngine } from './workflow-replay-engine';
import { randomUUID } from 'crypto';

export interface WorkflowExecutionOptions {
  input: any;
  timeout?: number;
  maxRetries?: number;
  enableCheckpoints?: boolean;
  checkpointInterval?: number; // Checkpoint every N nodes
  metadata?: Record<string, any>;
}

export interface WorkflowExecutionResult {
  executionId: string;
  success: boolean;
  output?: any;
  error?: string;
  state: WorkflowState;
  executionTime: number;
  eventsCount: number;
  checkpointsCount: number;
}

/**
 * Temporal-Style Workflow Engine
 * Main orchestrator for workflow execution
 */
export class TemporalStyleWorkflowEngine {
  private stateMachineManager: WorkflowStateMachineManager;
  private eventStore: EventStore;
  private checkpointManager: CheckpointManager;
  private replayEngine: WorkflowReplayEngine;
  private stateMachines = new Map<string, WorkflowStateMachine>();
  private isInitialized = false;

  constructor() {
    this.stateMachineManager = new WorkflowStateMachineManager();
    this.eventStore = getEventStore();
    this.checkpointManager = getCheckpointManager();
    this.replayEngine = workflowReplayEngine;
  }

  /**
   * Initialize engine
   */
  async initialize(redisUrl?: string): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    await this.eventStore.initialize(redisUrl);
    await this.checkpointManager.initialize(redisUrl);

    this.isInitialized = true;
    console.log('[TemporalStyleWorkflowEngine] ✅ Temporal workflow engine initialized');
  }

  /**
   * Execute workflow
   */
  async executeWorkflow(
    workflow: Workflow,
    options: WorkflowExecutionOptions
  ): Promise<WorkflowExecutionResult> {
    if (!this.isInitialized) {
      throw new Error('Workflow engine not initialized');
    }

    const executionId = randomUUID();
    const workflowId = workflow.metadata?.id || 'unknown';
    const startTime = Date.now();

    console.log(`[TemporalStyleWorkflowEngine] 🚀 Starting workflow execution ${executionId}`);

    // Create state machine
    const stateMachine = this.stateMachineManager.create(workflowId, executionId);
    this.stateMachines.set(executionId, stateMachine);

    // Emit workflow started event
    await this.eventStore.appendEvent({
      executionId,
      workflowId,
      type: EventType.WORKFLOW_STARTED,
      timestamp: Date.now(),
      data: {
        input: options.input,
        workflow: {
          nodes: workflow.nodes.length,
          edges: workflow.edges.length,
        },
      },
      metadata: options.metadata,
    });

    // Transition to RUNNING
    const updatedStateMachine = this.stateMachineManager.transition(
      stateMachine,
      WorkflowState.RUNNING,
      'Workflow execution started'
    );
    this.stateMachines.set(executionId, updatedStateMachine);

    await this.eventStore.appendEvent({
      executionId,
      workflowId,
      type: EventType.STATE_TRANSITION,
      timestamp: Date.now(),
      data: {
        from: WorkflowState.CREATED,
        to: WorkflowState.RUNNING,
      },
    });

    try {
      // Execute workflow nodes
      const result = await this.executeNodes(
        workflow,
        executionId,
        workflowId,
        options
      );

      // Transition to COMPLETED
      const completedStateMachine = this.stateMachineManager.transition(
        updatedStateMachine,
        WorkflowState.COMPLETED,
        'Workflow execution completed'
      );
      this.stateMachines.set(executionId, completedStateMachine);

      await this.eventStore.appendEvent({
        executionId,
        workflowId,
        type: EventType.WORKFLOW_COMPLETED,
        timestamp: Date.now(),
        data: {
          output: result,
        },
      });

      const executionTime = Date.now() - startTime;
      const events = await this.eventStore.getExecutionEvents(executionId);
      const checkpoints = await this.checkpointManager.getExecutionCheckpoints(executionId);

      console.log(`[TemporalStyleWorkflowEngine] ✅ Workflow execution completed in ${executionTime}ms`);

      return {
        executionId,
        success: true,
        output: result,
        state: WorkflowState.COMPLETED,
        executionTime,
        eventsCount: events.length,
        checkpointsCount: checkpoints.length,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[TemporalStyleWorkflowEngine] ❌ Workflow execution failed: ${errorMessage}`);

      // Transition to FAILED
      const failedStateMachine = this.stateMachineManager.transition(
        updatedStateMachine,
        WorkflowState.FAILED,
        `Workflow execution failed: ${errorMessage}`
      );
      this.stateMachines.set(executionId, failedStateMachine);

      await this.eventStore.appendEvent({
        executionId,
        workflowId,
        type: EventType.WORKFLOW_FAILED,
        timestamp: Date.now(),
        data: {
          error: errorMessage,
        },
      });

      const executionTime = Date.now() - startTime;
      const events = await this.eventStore.getExecutionEvents(executionId);
      const checkpoints = await this.checkpointManager.getExecutionCheckpoints(executionId);

      return {
        executionId,
        success: false,
        error: errorMessage,
        state: WorkflowState.FAILED,
        executionTime,
        eventsCount: events.length,
        checkpointsCount: checkpoints.length,
      };
    }
  }

  /**
   * Execute workflow nodes
   */
  private async executeNodes(
    workflow: Workflow,
    executionId: string,
    workflowId: string,
    options: WorkflowExecutionOptions
  ): Promise<any> {
    const nodeResults: Record<string, any> = {};
    const completedNodes: string[] = [];
    const failedNodes: string[] = [];

    // Find trigger node
    const triggerNode = workflow.nodes.find(node => {
      const nodeType = node.type || node.data?.type || '';
      return nodeType.includes('trigger') || nodeType === 'manual_trigger';
    });

    if (!triggerNode) {
      throw new Error('No trigger node found in workflow');
    }

    // Build execution order (topological sort)
    const executionOrder = this.getExecutionOrder(workflow.nodes, workflow.edges);

    // Execute nodes in order
    for (const node of executionOrder) {
      const nodeId = node.id;
      const nodeType = node.type || node.data?.type || 'unknown';

      // Emit node started event
      await this.eventStore.appendEvent({
        executionId,
        workflowId,
        type: EventType.NODE_STARTED,
        timestamp: Date.now(),
        data: {
          nodeId,
          nodeType,
        },
      });

      try {
        // Get input for node (from previous node results)
        const input = this.getNodeInput(node, nodeResults, options.input);

        // Execute node
        const result = await this.executeNode(node, input);

        // Store result
        nodeResults[nodeId] = result;
        completedNodes.push(nodeId);

        // Emit node completed event
        await this.eventStore.appendEvent({
          executionId,
          workflowId,
          type: EventType.NODE_COMPLETED,
          timestamp: Date.now(),
          data: {
            nodeId,
            nodeType,
            result,
          },
        });

        // Create checkpoint if enabled
        if (options.enableCheckpoints !== false) {
          const checkpointInterval = options.checkpointInterval || 1;
          if (completedNodes.length % checkpointInterval === 0) {
            await this.checkpointManager.createCheckpoint(
              executionId,
              workflowId,
              nodeId,
              nodeType,
              {
                input: options.input,
                output: result,
                nodeResults: { ...nodeResults },
                completedNodes: [...completedNodes],
                failedNodes: [...failedNodes],
                currentNodeId: nodeId,
              }
            );

            await this.eventStore.appendEvent({
              executionId,
              workflowId,
              type: EventType.CHECKPOINT_CREATED,
              timestamp: Date.now(),
              data: {
                nodeId,
                checkpointId: `${executionId}:${nodeId}:${completedNodes.length}`,
              },
            });
          }
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        failedNodes.push(nodeId);

        // Emit node failed event
        await this.eventStore.appendEvent({
          executionId,
          workflowId,
          type: EventType.NODE_FAILED,
          timestamp: Date.now(),
          data: {
            nodeId,
            nodeType,
            error: errorMessage,
          },
        });

        // Throw error to fail workflow
        throw error;
      }
    }

    // Return final output (from last node)
    const lastNode = executionOrder[executionOrder.length - 1];
    return nodeResults[lastNode.id];
  }

  /**
   * Execute single node
   */
  private async executeNode(node: WorkflowNode, input: any): Promise<any> {
    // TODO: Implement actual node execution
    // This would involve:
    // 1. Loading node configuration
    // 2. Executing node logic
    // 3. Returning result

    // Placeholder implementation
    console.log(`[TemporalStyleWorkflowEngine] Executing node ${node.id} (${node.type || node.data?.type})`);
    await this.sleep(100);
    return input; // Placeholder
  }

  /**
   * Get node input (from previous node results)
   */
  private getNodeInput(
    node: WorkflowNode,
    nodeResults: Record<string, any>,
    initialInput: any
  ): any {
    // Find incoming edges
    // For now, return initial input or last result
    const lastResult = Object.values(nodeResults).pop();
    return lastResult || initialInput;
  }

  /**
   * Get execution order (topological sort)
   */
  private getExecutionOrder(nodes: WorkflowNode[], edges: WorkflowEdge[]): WorkflowNode[] {
    // Build dependency graph
    const incoming = new Map<string, string[]>();
    const outgoing = new Map<string, string[]>();

    for (const edge of edges) {
      if (!incoming.has(edge.target)) {
        incoming.set(edge.target, []);
      }
      incoming.get(edge.target)!.push(edge.source);

      if (!outgoing.has(edge.source)) {
        outgoing.set(edge.source, []);
      }
      outgoing.get(edge.source)!.push(edge.target);
    }

    // Find nodes with no incoming edges (start nodes)
    const queue: WorkflowNode[] = nodes.filter(node => {
      const incomingCount = incoming.get(node.id)?.length || 0;
      return incomingCount === 0;
    });

    const ordered: WorkflowNode[] = [];
    const visited = new Set<string>();

    while (queue.length > 0) {
      const node = queue.shift()!;
      if (visited.has(node.id)) {
        continue;
      }

      visited.add(node.id);
      ordered.push(node);

      // Add dependent nodes
      const dependents = outgoing.get(node.id) || [];
      for (const dependentId of dependents) {
        const dependent = nodes.find(n => n.id === dependentId);
        if (dependent && !visited.has(dependentId)) {
          // Check if all dependencies are satisfied
          const dependencies = incoming.get(dependentId) || [];
          if (dependencies.every(dep => visited.has(dep))) {
            queue.push(dependent);
          }
        }
      }
    }

    return ordered;
  }

  /**
   * Resume workflow from failure
   */
  async resumeFromFailure(executionId: string): Promise<WorkflowExecutionResult> {
    const stateMachine = this.stateMachines.get(executionId);
    if (!stateMachine) {
      throw new Error(`Execution ${executionId} not found`);
    }

    if (!this.stateMachineManager.canResume(stateMachine.currentState)) {
      throw new Error(`Cannot resume from state ${stateMachine.currentState}`);
    }

    // Get latest checkpoint
    const checkpoint = await this.checkpointManager.getLatestCheckpoint(executionId);
    if (!checkpoint) {
      throw new Error(`No checkpoint found for execution ${executionId}`);
    }

    console.log(`[TemporalStyleWorkflowEngine] 🔄 Resuming execution ${executionId} from checkpoint ${checkpoint.id}`);

    // Transition to RUNNING
    const updatedStateMachine = this.stateMachineManager.transition(
      stateMachine,
      WorkflowState.RUNNING,
      'Resuming from failure'
    );
    this.stateMachines.set(executionId, updatedStateMachine);

    await this.eventStore.appendEvent({
      executionId,
      workflowId: checkpoint.workflowId,
      type: EventType.STATE_TRANSITION,
      timestamp: Date.now(),
      data: {
        from: stateMachine.currentState,
        to: WorkflowState.RUNNING,
        reason: 'Resuming from failure',
        checkpointId: checkpoint.id,
      },
    });

    // TODO: Load workflow and continue execution from checkpoint
    // This would involve:
    // 1. Loading workflow definition
    // 2. Resuming from checkpoint state
    // 3. Continuing execution from last completed node

    throw new Error('Resume from failure not fully implemented');
  }

  /**
   * Replay workflow execution
   */
  async replayExecution(
    executionId: string,
    fromVersion?: number,
    toVersion?: number
  ): Promise<any> {
    console.log(`[TemporalStyleWorkflowEngine] 🔄 Replaying execution ${executionId}`);
    return await this.replayEngine.replay(executionId, fromVersion, toVersion);
  }

  /**
   * Get execution state
   */
  async getExecutionState(executionId: string): Promise<WorkflowStateMachine | null> {
    return this.stateMachines.get(executionId) || null;
  }

  /**
   * Get execution events
   */
  async getExecutionEvents(executionId: string) {
    return await this.eventStore.getExecutionEvents(executionId);
  }

  /**
   * Get execution checkpoints
   */
  async getExecutionCheckpoints(executionId: string) {
    return await this.checkpointManager.getExecutionCheckpoints(executionId);
  }

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Close engine
   */
  async close(): Promise<void> {
    await this.eventStore.close();
    await this.checkpointManager.close();
    this.isInitialized = false;
    console.log('[TemporalStyleWorkflowEngine] ✅ Temporal workflow engine closed');
  }
}

// Export singleton instance
let engineInstance: TemporalStyleWorkflowEngine | null = null;

export function getTemporalWorkflowEngine(): TemporalStyleWorkflowEngine {
  if (!engineInstance) {
    engineInstance = new TemporalStyleWorkflowEngine();
  }
  return engineInstance;
}
