/**
 * Distributed Workflow Orchestrator
 * 
 * Durable workflow engine that NEVER stores state in memory between steps.
 * All state is persisted in PostgreSQL (source of truth).
 * Large data is stored in object storage (S3/MinIO).
 * Jobs are distributed via queue system (RabbitMQ/Redis).
 */

import { SupabaseClient } from '@supabase/supabase-js';
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
  private supabase: SupabaseClient;
  private queue: QueueClient;
  private storage: StorageManager;

  constructor(
    supabase: SupabaseClient,
    queue: QueueClient,
    storage: StorageManager
  ) {
    this.supabase = supabase;
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
    inputData: ExecutionInput
  ): Promise<string> {
    try {
      // 1. Get workflow definition
      const workflowDef = await this.getWorkflowDefinition(workflowId);
      if (!workflowDef) {
        throw new Error(`Workflow definition not found: ${workflowId}`);
      }

      // 2. Create execution record in DB first (to get executionId)
      // Use workflow definition ID (UUID) if available, otherwise use workflowId as string
      const workflowIdForExecution = workflowDef.id || workflowId;
      
      const { data: execution, error: execError } = await this.supabase
        .from('executions')
        .insert({
          workflow_id: workflowIdForExecution,
          status: 'pending',
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
      await this.supabase
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
      await this.supabase
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
      const { data: step, error: stepError } = await this.supabase
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

      await this.supabase
        .from('execution_steps')
        .update(updateData)
        .eq('id', step.id);

      if (error) {
        // Handle failure with retry logic
        await this.handleNodeFailure(executionId, nodeId, step.id, error);
        return;
      }

      // 3. Get workflow definition
      const { data: execution } = await this.supabase
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
      const nextNodes = this.getNextNodes(workflowDef.definition, nodeId);

      // 5. Check if workflow is complete
      if (nextNodes.length === 0) {
        // No more nodes - workflow is complete
        await this.completeExecution(executionId, outputRefs);
        
        // ✅ CRITICAL: Release execution lock
        const { releaseExecutionLock } = await import('../../execution/execution-lock');
        const { logExecutionEvent } = await import('../../execution/execution-event-logger');
        
        const { data: execution } = await this.supabase
          .from('executions')
          .select('workflow_id')
          .eq('id', executionId)
          .single();
        
        if (execution?.workflow_id) {
          await releaseExecutionLock(this.supabase, execution.workflow_id, executionId);
          await logExecutionEvent(
            this.supabase,
            executionId,
            execution.workflow_id,
            'LOCK_RELEASED',
            { workflowId: execution.workflow_id, executionId }
          );
          await logExecutionEvent(
            this.supabase,
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
      const { data: defById, error: defByIdError } = await this.supabase
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
      const { data: workflow, error: workflowError } = await this.supabase
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
      const { data: def, error: defError } = await this.supabase
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
    completedNodeId: string
  ): Array<{ id: string; data: { type: string; label: string; config: Record<string, unknown> } }> {
    // Find edges where source is the completed node
    const nextEdges = definition.edges.filter(e => e.source === completedNodeId);
    
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
   * Create execution step in database
   */
  async createExecutionStep(
    executionId: string,
    nodeId: string,
    nodeType: string,
    inputRefs: Record<string, unknown>,
    status: string
  ): Promise<string> {
    // Get sequence number (count of existing steps)
    const { count } = await this.supabase
      .from('execution_steps')
      .select('*', { count: 'exact', head: true })
      .eq('execution_id', executionId);

    const sequence = (count || 0) + 1;

    const { data: step, error: stepError } = await this.supabase
      .from('execution_steps')
      .insert({
        execution_id: executionId,
        node_id: nodeId,
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
      const { data: sourceStep } = await this.supabase
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
    const { data: step } = await this.supabase
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
      await this.supabase
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
      const { data: execution } = await this.supabase
        .from('executions')
        .select('workflow_id')
        .eq('id', executionId)
        .single();

      await this.supabase
        .from('executions')
        .update({
          status: 'failed',
          error_message: `Node ${nodeId} failed after ${maxRetries} retries: ${error}`,
          completed_at: new Date().toISOString(),
          last_heartbeat: new Date().toISOString(),
        })
        .eq('id', executionId);

      // ✅ CRITICAL: Release execution lock on failure
      if (execution?.workflow_id) {
        try {
          const { releaseExecutionLock } = await import('../../execution/execution-lock');
          const { logExecutionEvent } = await import('../../execution/execution-event-logger');
          
          await releaseExecutionLock(this.supabase, execution.workflow_id, executionId);
          await logExecutionEvent(
            this.supabase,
            executionId,
            execution.workflow_id,
            'RUN_FAILED',
            { error: `Node ${nodeId} failed after ${maxRetries} retries: ${error}` }
          );
          await logExecutionEvent(
            this.supabase,
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
    const { data: execution } = await this.supabase
      .from('executions')
      .select('workflow_id')
      .eq('id', executionId)
      .single();

    await this.supabase
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
        
        await releaseExecutionLock(this.supabase, execution.workflow_id, executionId);
        await logExecutionEvent(
          this.supabase,
          executionId,
          execution.workflow_id,
          'LOCK_RELEASED',
          { workflowId: execution.workflow_id, executionId }
        );
        await logExecutionEvent(
          this.supabase,
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
