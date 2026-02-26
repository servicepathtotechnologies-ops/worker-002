/**
 * Workflow Orchestrator
 * Coordinates workflow execution with real-time updates
 */

import { EventEmitter } from 'events';
import { ExecutionStateManager, NodeStatus } from './execution-state-manager';
import { VisualizationService } from './visualization-service';
import { executeNode } from '../../api/execute-workflow';
import { getSupabaseClient } from '../../core/database/supabase-compat';
import { LRUNodeOutputsCache } from '../../core/cache/lru-node-outputs-cache';
import { executionReliability, RetryConfig } from '../execution-reliability';
import { workflowCheckpoint } from '../workflow-checkpoint';
import { getWorkflowLogger } from '../workflow-logger';

export interface WorkflowNode {
  id: string;
  type: string;
  data: {
    label: string;
    type: string;
    category: string;
    config: Record<string, unknown>;
  };
}

export interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
}

export interface ExecutionContext {
  executionId: string;
  workflowId: string;
  userId?: string;
  input: unknown;
  nodeOutputs: LRUNodeOutputsCache;
  ifElseResults: Record<string, boolean>;
  switchResults: Record<string, string | null>;
}

/**
 * Workflow Orchestrator
 * Manages workflow execution with real-time state updates
 */
export class WorkflowOrchestrator extends EventEmitter {
  private stateManager: ExecutionStateManager;
  private visualizationService: VisualizationService;
  private supabase: any;
  private logger = getWorkflowLogger();

  constructor(
    stateManager: ExecutionStateManager,
    visualizationService: VisualizationService
  ) {
    super();
    this.stateManager = stateManager;
    this.visualizationService = visualizationService;
    this.supabase = getSupabaseClient();
  }

  /**
   * Execute workflow with real-time updates
   */
  async executeWorkflow(
    workflowId: string,
    input: unknown,
    nodes: WorkflowNode[],
    edges: WorkflowEdge[],
    executionId: string,
    userId?: string
  ): Promise<{
    status: 'success' | 'failed';
    output: unknown;
    logs: any[];
  }> {
    // Initialize execution state
    const executionOrder = this.topologicalSort(nodes, edges);
    const totalNodes = executionOrder.length;

    // 🆕 CHECKPOINT: Check if execution can be resumed
    console.log(`[WorkflowOrchestrator] Checking for checkpoint for execution ${executionId}`);
    const resumeResult = await workflowCheckpoint.resumeExecution(executionId, executionOrder);
    
    let startIndex = 0;
    let restoredState: {
      nodeOutputs: LRUNodeOutputsCache;
      ifElseResults: Record<string, boolean>;
      switchResults: Record<string, string | null>;
    } | undefined;
    const completedNodeIds = resumeResult.completedNodeIds || new Set<string>();
    
    if (resumeResult.canResume && resumeResult.restoredState) {
      console.log(`[WorkflowOrchestrator] Resuming execution from checkpoint`);
      console.log(`[WorkflowOrchestrator] Completed nodes: ${completedNodeIds.size}/${totalNodes}`);
      startIndex = resumeResult.nextNodeIndex;
      restoredState = resumeResult.restoredState;
      
      // 🆕 LOGGER: Log checkpoint loaded
      this.logger.logCheckpointLoaded(workflowId, executionId, completedNodeIds.size, {
        totalNodes,
        startIndex,
      });
    } else {
      console.log(`[WorkflowOrchestrator] Starting new execution (no checkpoint found)`);
      
      // 🆕 LOGGER: Log workflow started
      this.logger.logWorkflowStarted(workflowId, executionId, input, {
        totalNodes,
        userId,
      });
    }

    this.stateManager.initializeExecution(
      executionId,
      workflowId,
      totalNodes,
      input
    );

    // Broadcast execution started
    this.visualizationService.broadcastNodeUpdate(
      executionId,
      'execution',
      {
        status: 'running',
        timestamp: Date.now(),
      }
    );

    const context: ExecutionContext = {
      executionId,
      workflowId,
      userId,
      input,
      nodeOutputs: restoredState?.nodeOutputs || (() => {
        const cache = new LRUNodeOutputsCache();
        // Set initial trigger output if needed
        return cache;
      })(),
      ifElseResults: restoredState?.ifElseResults || {},
      switchResults: restoredState?.switchResults || {},
    };

    const logs: any[] = [];
    let finalOutput: unknown = input;
    let hasError = false;
    let errorMessage = '';

    // Execute nodes sequentially (skip completed nodes if resuming)
    for (let i = startIndex; i < executionOrder.length; i++) {
      const node = executionOrder[i];
      
      // 🆕 CHECKPOINT: Skip if node was already completed
      if (completedNodeIds.has(node.id)) {
        console.log(`[WorkflowOrchestrator] Skipping completed node: ${node.id}`);
        
        // 🆕 LOGGER: Log node skipped
        this.logger.logNodeSkipped(workflowId, executionId, node.id, node.data.label, 'Already completed');
        continue;
      }

      // Update node status to pending
      this.stateManager.updateNodeState(
        executionId,
        node.id,
        node.data.label,
        'pending'
      );

      // Determine node input
      const nodeInput = this.getNodeInput(node, edges, context);

      // 🆕 LOGGER: Log node started
      this.logger.logNodeStarted(workflowId, executionId, node.id, node.data.label, nodeInput, {
        nodeType: node.data.type,
        sequence: i,
      });

      // Update node status to running
      this.stateManager.updateNodeState(
        executionId,
        node.id,
        node.data.label,
        'running',
        {
          input: nodeInput,
        }
      );

      try {

        // 🆕 EXECUTION RELIABILITY: Execute node with retry and failure handling
        const retryConfig: Partial<RetryConfig> = {
          maxRetries: 3,
          backoff: 'exponential',
          timeoutMs: 30000,
        };
        
        const executionResult = await executionReliability.executeWithReliability(
          node,
          () => executeNode(
            node,
            nodeInput,
            context.nodeOutputs,
            this.supabase,
            workflowId,
            userId
          ),
          retryConfig,
          {
            executionId,
            workflowId,
            userId,
          }
        );

        if (!executionResult.success) {
          // Execution failed after retries
          hasError = true;
          errorMessage = executionResult.error?.message || 'Node execution failed after retries';
          
          // Log retry attempts
          console.error(`[WorkflowOrchestrator] Node ${node.id} failed after ${executionResult.attempts.length} attempts:`);
          executionResult.attempts.forEach((attempt, idx) => {
            if (!attempt.success) {
              console.error(`  Attempt ${attempt.attempt}: ${attempt.error?.message} (${attempt.duration}ms)`);
            }
          });

          // Update node status to error
          this.stateManager.updateNodeState(
            executionId,
            node.id,
            node.data.label,
            'error',
            {
              error: errorMessage,
              retryAttempts: executionResult.attempts.length,
              finalFailure: executionResult.error?.finalFailure,
            }
          );

          // Add log entry for failure
          logs.push({
            nodeId: node.id,
            nodeName: node.data.label,
            status: 'error',
            startedAt: new Date(executionResult.attempts[0]?.timestamp || Date.now()).toISOString(),
            finishedAt: new Date().toISOString(),
            input: nodeInput,
            error: errorMessage,
            retryAttempts: executionResult.attempts.length,
          });

          // 🆕 CHECKPOINT: Mark node as failed
          await workflowCheckpoint.markNodeFailed(executionId, node.id, errorMessage);
          
          // Check if we should continue execution (non-critical node)
          const shouldContinue = this.shouldContinueAfterFailure(node, executionResult);
          if (!shouldContinue) {
            break; // Stop execution
          }
          
          continue; // Skip to next node
        }

        // Execution succeeded
        const nodeOutput = executionResult.result;

        // Store output
        context.nodeOutputs.set(node.id, nodeOutput);
        finalOutput = nodeOutput;

        // 🆕 LOGGER: Log node completed
        this.logger.logNodeCompleted(
          workflowId,
          executionId,
          node.id,
          node.data.label,
          nodeOutput,
          executionResult.totalDuration,
          {
            retryAttempts: executionResult.attempts.length,
            nodeType: node.data.type,
          }
        );

        // Update node status to success
        this.stateManager.updateNodeState(
          executionId,
          node.id,
          node.data.label,
          'success',
          {
            output: nodeOutput,
            executionDuration: executionResult.totalDuration,
            retryAttempts: executionResult.attempts.length,
          }
        );

        // Add log entry
        logs.push({
          nodeId: node.id,
          nodeName: node.data.label,
          status: 'success',
          startedAt: new Date(executionResult.attempts[0]?.timestamp || Date.now()).toISOString(),
          finishedAt: new Date().toISOString(),
          input: nodeInput,
          output: nodeOutput,
          retryAttempts: executionResult.attempts.length,
          totalDuration: executionResult.totalDuration,
        });

        // Handle special node types
        if (node.data.type === 'if_else') {
          const condition = this.evaluateCondition(node, context);
          context.ifElseResults[node.id] = condition;
        } else if (node.data.type === 'switch') {
          const caseValue = this.evaluateSwitch(node, context);
          context.switchResults[node.id] = caseValue;
        }
        
        // 🆕 CHECKPOINT: Save checkpoint after successful node execution
        await workflowCheckpoint.saveCheckpoint(
          workflowId,
          executionId,
          node.id,
          nodeOutput,
          {
            input: context.input,
            nodeOutputs: context.nodeOutputs,
            ifElseResults: context.ifElseResults,
            switchResults: context.switchResults,
            context: {},
          },
          executionOrder,
          'running'
        );
        
        // 🆕 LOGGER: Log checkpoint saved
        this.logger.logCheckpointSaved(workflowId, executionId, node.id, {
          completedNodes: completedNodeIds.size + 1,
        });
      } catch (error: any) {
        // Unexpected error (not from reliability service)
        hasError = true;
        errorMessage = error.message || 'Unknown error';

        console.error(`[WorkflowOrchestrator] Unexpected error executing node ${node.id}:`, error);

        // 🆕 LOGGER: Log node failed
        this.logger.logNodeFailed(
          workflowId,
          executionId,
          node.id,
          node.data.label,
          error,
          nodeInput,
          {
            nodeType: node.data.type,
            sequence: i,
          }
        );

        // Update node status to error
        this.stateManager.updateNodeState(
          executionId,
          node.id,
          node.data.label,
          'error',
          {
            error: errorMessage,
          }
        );

        // Add error log entry
        logs.push({
          nodeId: node.id,
          nodeName: node.data.label,
          status: 'failed',
          startedAt: new Date().toISOString(),
          finishedAt: new Date().toISOString(),
          error: errorMessage,
        });

        // Break execution on error (unless configured to continue)
        const continueOnError = (node.data.config as any)?.continueOnError;
        if (!continueOnError) {
          break;
        }
      }
    }

    // Set final execution state
    if (hasError) {
      this.stateManager.setExecutionError(executionId, errorMessage);
      
      // 🆕 LOGGER: Log workflow failed
      this.logger.logWorkflowFailed(workflowId, executionId, new Error(errorMessage), {
        nodesExecuted: logs.length,
        totalNodes,
      });
    } else {
      this.stateManager.setExecutionOutput(executionId, finalOutput);
      
      // 🆕 CHECKPOINT: Mark execution as completed
      await workflowCheckpoint.markCompleted(executionId, finalOutput);
      
      // 🆕 LOGGER: Log workflow completed
      this.logger.logWorkflowCompleted(workflowId, executionId, finalOutput, {
        nodesExecuted: logs.length,
        totalNodes,
      });
    }

    return {
      status: hasError ? 'failed' : 'success',
      output: finalOutput,
      logs,
    };
  }

  /**
   * Topological sort to determine execution order
   */
  private topologicalSort(nodes: WorkflowNode[], edges: WorkflowEdge[]): WorkflowNode[] {
    const inDegree: Record<string, number> = {};
    const adjacency: Record<string, string[]> = {};
    const nodeMap: Record<string, WorkflowNode> = {};

    nodes.forEach(node => {
      inDegree[node.id] = 0;
      adjacency[node.id] = [];
      nodeMap[node.id] = node;
    });

    edges.forEach(edge => {
      adjacency[edge.source].push(edge.target);
      inDegree[edge.target] = (inDegree[edge.target] || 0) + 1;
    });

    const queue: string[] = [];
    Object.entries(inDegree).forEach(([nodeId, degree]) => {
      if (degree === 0) queue.push(nodeId);
    });

    const sorted: WorkflowNode[] = [];
    while (queue.length > 0) {
      const nodeId = queue.shift()!;
      sorted.push(nodeMap[nodeId]);

      adjacency[nodeId].forEach(neighbor => {
        inDegree[neighbor]--;
        if (inDegree[neighbor] === 0) queue.push(neighbor);
      });
    }

    return sorted;
  }

  /**
   * Get input for a node based on incoming edges
   */
  private getNodeInput(
    node: WorkflowNode,
    edges: WorkflowEdge[],
    context: ExecutionContext
  ): unknown {
    const inputEdges = edges.filter(e => e.target === node.id);

    if (inputEdges.length === 0) {
      return context.input;
    }

    if (inputEdges.length === 1) {
      const sourceNodeId = inputEdges[0].source;
      const sourceOutput = context.nodeOutputs.get(sourceNodeId);
      return sourceOutput !== undefined ? sourceOutput : context.input;
    }

    // Multiple inputs - merge them
    const inputs: Record<string, unknown> = {};
    inputEdges.forEach(edge => {
      const sourceOutput = context.nodeOutputs.get(edge.source);
      if (sourceOutput !== undefined) {
        const key = edge.sourceHandle || edge.source;
        inputs[key] = sourceOutput;
      }
    });

    return Object.keys(inputs).length > 0 ? inputs : context.input;
  }

  /**
   * Evaluate if-else condition
   */
  private evaluateCondition(node: WorkflowNode, context: ExecutionContext): boolean {
    const config = node.data.config as any;
    const condition = config?.condition || '';
    
    if (!condition) return true;

    // Simple condition evaluation
    // In production, use a proper expression evaluator
    try {
      const input = this.getNodeInput(node, [], context);
      const inputObj = typeof input === 'object' && input !== null ? input : { value: input };
      
      // Replace variables in condition
      let evaluatedCondition = condition;
      const allOutputs = context.nodeOutputs.getAll();
      Object.keys(allOutputs).forEach(key => {
        const value = allOutputs[key];
        evaluatedCondition = evaluatedCondition.replace(
          new RegExp(`\\$\\{${key}\\}`, 'g'),
          JSON.stringify(value)
        );
      });

      // Evaluate condition (simplified - use proper evaluator in production)
      return eval(evaluatedCondition);
    } catch {
      return false;
    }
  }

  /**
   * Determine if execution should continue after node failure
   */
  private shouldContinueAfterFailure(
    node: WorkflowNode,
    executionResult: { error?: { retryable: boolean; finalFailure?: boolean } } | null
  ): boolean {
    // Check node config for continueOnError flag
    const continueOnError = (node.data.config as any)?.continueOnError;
    if (continueOnError === true) {
      return true;
    }
    
    // Check if error is retryable and not final failure
    if (executionResult?.error) {
      // If it's retryable but still failed, it might be a transient issue
      // Allow continuation for non-critical nodes
      if (executionResult.error.retryable && !executionResult.error.finalFailure) {
        // Check if node is marked as non-critical
        const isNonCritical = (node.data.config as any)?.nonCritical === true;
        return isNonCritical;
      }
    }
    
    // Default: stop execution on failure
    return false;
  }

  /**
   * Evaluate switch case
   */
  private evaluateSwitch(node: WorkflowNode, context: ExecutionContext): string | null {
    const config = node.data.config as any;
    const value = config?.value || '';
    const cases = config?.cases || {};

    const input = this.getNodeInput(node, [], context);
    const inputValue = typeof input === 'object' && input !== null 
      ? (input as any)[value] || input 
      : input;

    // Find matching case
    for (const [caseValue, caseConfig] of Object.entries(cases)) {
      if (String(inputValue) === String(caseValue)) {
        return caseValue;
      }
    }

    return config?.defaultCase || null;
  }
}
