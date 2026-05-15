/**
 * Distributed Workflow Orchestrator
 * 
 * Durable workflow engine that NEVER stores state in memory between steps.
 * All state is persisted in PostgreSQL (source of truth).
 * Large data is stored in object storage (S3/MinIO).
 * Jobs are distributed via queue system (RabbitMQ/Redis).
 */

import type { DbClient } from '@db/db-js';
import type { WorkflowEdge } from '../../../core/types/ai-types';
import { resolveWinningSwitchEdgeId } from '../../../core/execution/switch-branch-router';
import { QueueClient, NodeJob } from './queue-client';
import { StorageManager } from './storage-manager';

export interface WorkflowDefinition {
  id: string;
  name: string;
  version: number;
  definition: {
    nodes: Array<{
      id: string;
      type: string;
      data: {
        label: string;
        type: string;
        config: Record<string, unknown>;
      };
    }>;
    edges: Array<{
      id: string;
      source: string;
      target: string;
      sourceHandle?: string;
      targetHandle?: string;
    }>;
  };
}

export interface ExecutionInput {
  [key: string]: unknown;
}

/**
 * Distributed Workflow Orchestrator
 * 
 * Main orchestrator for durable workflow execution.
 * NEVER stores state in memory between steps.
 */
export class DistributedOrchestrator {
  private db: DbClient;
  private queue: QueueClient;
  private storage: StorageManager;

  constructor(
    db: DbClient,
    queue: QueueClient,
    storage: StorageManager
  ) {
    this.db = db;
    this.queue = queue;
    this.storage = storage;
  }

  /**
   * Start a new workflow execution
   * 
   * Creates execution record in DB and queues first node(s) for processing.
   * Returns immediately - workflow continues via queue.
   */
  async startExecution(
    workflowId: string,
    inputData: ExecutionInput,
    userId?: string          // ← Bug 1 fix: accept caller's userId so the record is user-scoped
  ): Promise<string> {
    try {
      // 1. Get workflow definition
      const workflowDef = await this.getWorkflowDefinition(workflowId);
      if (!workflowDef) {
        throw new Error(`Workflow definition not found: ${workflowId}`);
      }

      // 2. Create execution record in DB first (to get executionId)
      // Bug 4 fix: always use the caller-supplied workflowId, not workflowDef.id.
      // workflowDef.id may come from the workflow_definitions table and differ from the
      // workflows.id that the rest of the system (lock, event logger, frontend) uses.
      const workflowIdForExecution = workflowId;
      
      const { data: execution, error: execError } = await this.db
        .from('executions')
        .insert({
          workflow_id: workflowIdForExecution,
          status: 'pending',
          // Bug 1 fix: include user_id so db-proxy user-scoped queries can find this record.
          // Falls back to undefined (omitted) if no userId is available, preserving
          // backward-compatibility for any non-authenticated call paths.
          ...(userId ? { user_id: userId } : {}),
          input: {}, // Will update after storing input
          current_node: 'start',
          started_at: new Date().toISOString(),
          metadata: {
            workflow_name: workflowDef.name,
            workflow_version: workflowDef.version,
            workflow_definition_id: workflowDef.id,
          },
        })
        .select()
        .single();

      if (execError || !execution) {
        throw new Error(`Failed to create execution: ${execError?.message}`);
      }

      const executionId = execution.id;

      // 3. Store large input data in object storage if needed (now we have executionId)
      const inputRefs = await this.storage.storeExecutionInput(
        inputData,
        executionId
      );

      // 4. Update execution with input references
      await this.db
        .from('executions')
        .update({ input: inputRefs })
        .eq('id', executionId);

      // 4. Get initial nodes (nodes with no incoming edges)
      const initialNodes = this.getInitialNodes(workflowDef.definition);

      // 5. Create execution steps for initial nodes
      for (const node of initialNodes) {
        await this.createExecutionStep(
          executionId,
          node.id,
          node.data.type,
          node.data.label || node.id,  // pass label for node_name
          inputRefs, // Pass input references
          'pending'
        );

        // 6. Queue first node(s) for processing
        await this.queue.publishJob({
          execution_id: executionId,
          node_id: node.id,
          node_type: node.data.type,
          priority: 5,
        });
      }

      // 7. Update execution status to running
      await this.db
        .from('executions')
        .update({
          status: 'running',
          updated_at: new Date().toISOString(),
        })
        .eq('id', executionId);

      console.log(`[DistributedOrchestrator] ✅ Started execution ${executionId} for workflow ${workflowId}`);
      return executionId;
    } catch (error: any) {
      console.error('[DistributedOrchestrator] ❌ Failed to start execution:', error);
      throw error;
    }
  }

  /**
   * Handle node completion
   * 
   * Called when a node worker finishes processing.
   * Updates step status, determines next nodes, and queues them.
   */
  async handleNodeCompletion(
    executionId: string,
    nodeId: string,
    outputRefs: Record<string, unknown>,
    resultData?: Record<string, unknown>,
    error?: string
  ): Promise<void> {
    try {
      // 1. Get execution step
      const { data: step, error: stepError } = await this.db
        .from('execution_steps')
        .select('*')
        .eq('execution_id', executionId)
        .eq('node_id', nodeId)
        .single();

      if (stepError || !step) {
        throw new Error(`Execution step not found: ${executionId}/${nodeId}`);
      }

      // 2. Update step status in DB
      const updateData: any = {
        status: error ? 'failed' : 'completed',
        output_refs: outputRefs,
        result_data: resultData || {},
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      if (error) {
        updateData.error = error;
      }

      await this.db
        .from('execution_steps')
        .update(updateData)
        .eq('id', step.id);

      if (error) {
        // Handle failure with retry logic
        await this.handleNodeFailure(executionId, nodeId, step.id, error);
        return;
      }

      // 3. Get workflow definition
      const { data: execution } = await this.db
        .from('executions')
        .select('workflow_id')
        .eq('id', executionId)
        .single();

      if (!execution) {
        throw new Error(`Execution not found: ${executionId}`);
      }

      const workflowDef = await this.getWorkflowDefinition(execution.workflow_id);
      if (!workflowDef) {
        throw new Error(`Workflow definition not found: ${execution.workflow_id}`);
      }

      // 4. Get next nodes from workflow definition
      const nextNodes = this.getNextNodes(workflowDef.definition, nodeId, outputRefs);

      // 5. Check if workflow is complete
      if (nextNodes.length === 0) {
        // No more nodes - workflow is complete
        await this.completeExecution(executionId, outputRefs);
        
        // ✅ CRITICAL: Release execution lock
        const { releaseExecutionLock } = await import('../../execution/execution-lock');
        const { logExecutionEvent } = await import('../../execution/execution-event-logger');
        
        const { data: execution } = await this.db
          .from('executions')
          .select('workflow_id')
          .eq('id', executionId)
          .single();
        
        if (execution?.workflow_id) {
          await releaseExecutionLock(this.db, execution.workflow_id, executionId);
          await logExecutionEvent(
            this.db,
            executionId,
            execution.workflow_id,
            'LOCK_RELEASED',
            { workflowId: execution.workflow_id, executionId }
          );
          await logExecutionEvent(
            this.db,
            executionId,
            execution.workflow_id,
            'RUN_FINISHED',
            { success: true }
          );
        }
        
        return;
      }

      // 6. Create and queue next nodes
      for (const nextNode of nextNodes) {
        // Prepare input data for next node (from storage/previous outputs)
        const nextInput = await this.prepareNodeInput(
          executionId,
          nextNode.id,
          workflowDef.definition,
          outputRefs
        );

        // Create execution step
        const stepId = await this.createExecutionStep(
          executionId,
          nextNode.id,
          nextNode.data.type,
          nextNode.data.label || nextNode.id,  // pass label for node_name
          nextInput,
          'pending'
        );

        // Queue next node
        await this.queue.publishJob({
          execution_id: executionId,
          node_id: nextNode.id,
          node_type: nextNode.data.type,
          step_id: stepId,
          priority: 5,
        });
      }

      console.log(`[DistributedOrchestrator] ✅ Node ${nodeId} completed, queued ${nextNodes.length} next nodes`);
    } catch (error: any) {
      console.error('[DistributedOrchestrator] ❌ Failed to handle node completion:', error);
      throw error;
    }
  }

  /**
   * Get workflow definition from database
   */
  async getWorkflowDefinition(workflowId: string): Promise<WorkflowDefinition | null> {
    // Check if workflowId is a UUID (format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx)
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(workflowId);

    if (isUUID) {
      // Try workflow_definitions by ID first (if it's a UUID)
      const { data: defById, error: defByIdError } = await this.db
        .from('workflow_definitions')
        .select('*')
        .eq('id', workflowId)
        .eq('is_active', true)
        .order('version', { ascending: false })
        .limit(1)
        .single();

      if (!defByIdError && defById) {
        return {
          id: defById.id,
          name: defById.name,
          version: defById.version,
          definition: defById.definition as WorkflowDefinition['definition'],
        };
      }

      // Try workflows table by ID
      const { data: workflow, error: workflowError } = await this.db
        .from('workflows')
        .select('*')
        .eq('id', workflowId)
        .single();

      if (!workflowError && workflow) {
        return {
          id: workflow.id,
          name: workflow.name || workflowId,
          version: 1,
          definition: {
            nodes: (workflow.nodes as any[]) || [],
            edges: (workflow.edges as any[]) || [],
          },
        };
      }
    } else {
      // Not a UUID, try by name in workflow_definitions
      const { data: def, error: defError } = await this.db
        .from('workflow_definitions')
        .select('*')
        .eq('name', workflowId)
        .eq('is_active', true)
        .order('version', { ascending: false })
        .limit(1)
        .single();

      if (!defError && def) {
        return {
          id: def.id,
          name: def.name,
          version: def.version,
          definition: def.definition as WorkflowDefinition['definition'],
        };
      }
    }

    return null;
  }

  /**
   * Get initial nodes (nodes with no incoming edges)
   */
  getInitialNodes(definition: WorkflowDefinition['definition']): Array<{ id: string; data: { type: string; label: string; config: Record<string, unknown> } }> {
    const nodeIds = new Set(definition.nodes.map(n => n.id));
    const targetIds = new Set(definition.edges.map(e => e.target));

    return definition.nodes
      .filter(node => !targetIds.has(node.id))
      .map(node => ({
        id: node.id,
        data: node.data,
      }));
  }

  /**
   * Get next nodes (nodes that depend on completed node)
   */
  getNextNodes(
    definition: WorkflowDefinition['definition'],
    completedNodeId: string,
    completedNodeOutput?: Record<string, unknown>
  ): Array<{ id: string; data: { type: string; label: string; config: Record<string, unknown> } }> {
    const completedNode = definition.nodes.find(n => n.id === completedNodeId);
    const nextEdges = definition.edges.filter((e) =>
      e.source === completedNodeId &&
      this.edgeFollowsFromCompletedNode(e, completedNode, completedNodeOutput, definition)
    );
    
    // Get target nodes
    const nextNodeIds = new Set(nextEdges.map(e => e.target));
    
    // Check if all dependencies are satisfied
    const nextNodes: Array<{ id: string; data: { type: string; label: string; config: Record<string, unknown> } }> = [];
    
    for (const nodeId of nextNodeIds) {
      const node = definition.nodes.find(n => n.id === nodeId);
      if (!node) continue;

      // Check if all incoming edges have completed nodes
      const incomingEdges = definition.edges.filter(e => e.target === nodeId);
      const allDependenciesMet = incomingEdges.every(edge => {
        // Check if source node has completed step
        return true; // Simplified - in production, check execution_steps
      });

      if (allDependenciesMet) {
        nextNodes.push({
          id: node.id,
          data: node.data,
        });
      }
    }

    return nextNodes;
  }

  /**
   * Whether `edge` (outgoing from `completedNode`) should run given `completedNodeOutput`.
   */
  private edgeFollowsFromCompletedNode(
    edge: WorkflowDefinition['definition']['edges'][number],
    completedNode: WorkflowDefinition['definition']['nodes'][number] | undefined,
    completedNodeOutput: Record<string, unknown> | undefined,
    definition: WorkflowDefinition['definition']
  ): boolean {
    if (!completedNode) return true;

    if (completedNode.data?.type === 'switch') {
      if (!completedNodeOutput || typeof completedNodeOutput !== 'object') return true;
      const matched =
        (completedNodeOutput as any).matchedCase ??
        (completedNodeOutput as any).result ??
        null;
      const winning = resolveWinningSwitchEdgeId({
        switchNode: completedNode,
        allEdges: definition.edges as WorkflowEdge[],
        matchedCase: matched == null ? null : String(matched),
        expressionValue: (completedNodeOutput as any).expressionValue,
      });
      return winning !== null && edge.id === winning;
    }

    const sourceHandle = edge.sourceHandle;
    if (!sourceHandle) return true;
    if (!completedNodeOutput || typeof completedNodeOutput !== 'object') return true;

    if (sourceHandle === 'true' || sourceHandle === 'false') {
      const raw =
        (completedNodeOutput as any).condition_result ??
        (completedNodeOutput as any).condition ??
        (completedNodeOutput as any).result ??
        (completedNodeOutput as any).output;
      if (typeof raw !== 'boolean') return true;
      return sourceHandle === 'true' ? raw : !raw;
    }

    return true;
  }

  /**
   * Create execution step in database
   */
  async createExecutionStep(
    executionId: string,
    nodeId: string,
    nodeType: string,
    nodeName: string,        // ← added: human-readable label for the UI
    inputRefs: Record<string, unknown>,
    status: string
  ): Promise<string> {
    // Get sequence number (count of existing steps)
    const { count } = await this.db
      .from('execution_steps')
      .select('*', { count: 'exact', head: true })
      .eq('execution_id', executionId);

    const sequence = (count || 0) + 1;

    const { data: step, error: stepError } = await this.db
      .from('execution_steps')
      .insert({
        execution_id: executionId,
        node_id: nodeId,
        node_name: nodeName,   // ← stored so the UI shows the label, not the raw ID
        node_type: nodeType,
        status: status,
        input_refs: inputRefs,
        sequence: sequence,
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (stepError || !step) {
      throw new Error(`Failed to create execution step: ${stepError?.message}`);
    }

    return step.id;
  }

  /**
   * Prepare input data for next node
   */
  async prepareNodeInput(
    executionId: string,
    nodeId: string,
    definition: WorkflowDefinition['definition'],
    previousOutputRefs: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    // Find incoming edges
    const incomingEdges = definition.edges.filter(e => e.target === nodeId);
    
    // Collect input from all source nodes
    const inputData: Record<string, unknown> = {};

    for (const edge of incomingEdges) {
      // Get output from source node
      const { data: sourceStep } = await this.db
        .from('execution_steps')
        .select('output_refs')
        .eq('execution_id', executionId)
        .eq('node_id', edge.source)
        .eq('status', 'completed')
        .single();

      if (sourceStep?.output_refs) {
        // Merge output refs into input
        Object.assign(inputData, sourceStep.output_refs);
      }
    }

    return inputData;
  }

  /**
   * Handle node failure with retry logic
   */
  private async handleNodeFailure(
    executionId: string,
    nodeId: string,
    stepId: string,
    error: string
  ): Promise<void> {
    // Get step to check retry count and node_type
    const { data: step } = await this.db
      .from('execution_steps')
      .select('retry_count, max_retries, node_type')
      .eq('id', stepId)
      .single();

    if (!step) return;

    const retryCount = (step.retry_count || 0) + 1;
    const maxRetries = step.max_retries || 3;
    const nodeType = step.node_type || '';

    if (retryCount < maxRetries) {
      // Retry the node
      await this.db
        .from('execution_steps')
        .update({
          retry_count: retryCount,
          status: 'pending',
          error: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', stepId);

      // Re-queue with exponential backoff
      await this.queue.publishJobWithBackoff({
        execution_id: executionId,
        node_id: nodeId,
        node_type: nodeType,
        step_id: stepId,
        priority: 3, // Lower priority for retries
        retry_attempt: retryCount,
      }, retryCount, 1000); // Base delay: 1 second

      console.log(`[DistributedOrchestrator] 🔄 Retrying node ${nodeId} (attempt ${retryCount}/${maxRetries})`);
    } else {
      // Max retries exceeded - mark execution as failed
      const { data: execution } = await this.db
        .from('executions')
        .select('workflow_id')
        .eq('id', executionId)
        .single();

      await this.db
        .from('executions')
        .update({
          status: 'failed',
          error_message: `Node ${nodeId} failed after ${maxRetries} retries: ${error}`,
          completed_at: new Date().toISOString(),
          last_heartbeat: new Date().toISOString(),
        })
        .eq('id', executionId);

      // Bust Redis cache so the polling endpoint returns the real "failed" status immediately
      try {
        const { getCacheRedisClient, invalidateExecutionStatusCache } = await import('../../../middleware/redisGetCache');
        const client = await getCacheRedisClient(process.env.REDIS_URL || 'redis://localhost:6379');
        if (client) await invalidateExecutionStatusCache(executionId, client);
      } catch {
        // non-fatal — polling will eventually see the DB update
      }

      // ✅ CRITICAL: Release execution lock on failure
      if (execution?.workflow_id) {
        try {
          const { releaseExecutionLock } = await import('../../execution/execution-lock');
          const { logExecutionEvent } = await import('../../execution/execution-event-logger');
          
          await releaseExecutionLock(this.db, execution.workflow_id, executionId);
          await logExecutionEvent(
            this.db,
            executionId,
            execution.workflow_id,
            'RUN_FAILED',
            { error: `Node ${nodeId} failed after ${maxRetries} retries: ${error}` }
          );
          await logExecutionEvent(
            this.db,
            executionId,
            execution.workflow_id,
            'LOCK_RELEASED',
            { workflowId: execution.workflow_id, executionId, reason: 'failure' }
          );
        } catch (lockError) {
          console.warn('[DistributedOrchestrator] Failed to release lock on failure:', lockError);
        }
      }

      console.log(`[DistributedOrchestrator] ❌ Node ${nodeId} failed after ${maxRetries} retries`);
    }
  }

  /**
   * Complete execution
   */
  private async completeExecution(
    executionId: string,
    finalOutput: Record<string, unknown>
  ): Promise<void> {
    // Store final output
    const outputRefs = await this.storage.storeExecutionOutput(executionId, finalOutput);

    // Get workflow_id for lock release
    const { data: execution } = await this.db
      .from('executions')
      .select('workflow_id')
      .eq('id', executionId)
      .single();

    await this.db
      .from('executions')
      .update({
        status: 'completed',
        output: outputRefs,
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        last_heartbeat: new Date().toISOString(),
      })
      .eq('id', executionId);

    // ✅ CRITICAL: Release execution lock
    if (execution?.workflow_id) {
      try {
        const { releaseExecutionLock } = await import('../../execution/execution-lock');
        const { logExecutionEvent } = await import('../../execution/execution-event-logger');
        
        await releaseExecutionLock(this.db, execution.workflow_id, executionId);
        await logExecutionEvent(
          this.db,
          executionId,
          execution.workflow_id,
          'LOCK_RELEASED',
          { workflowId: execution.workflow_id, executionId }
        );
        await logExecutionEvent(
          this.db,
          executionId,
          execution.workflow_id,
          'RUN_FINISHED',
          { success: true }
        );
      } catch (lockError) {
        console.warn('[DistributedOrchestrator] Failed to release lock:', lockError);
      }
    }

    console.log(`[DistributedOrchestrator] ✅ Execution ${executionId} completed`);
  }
}
