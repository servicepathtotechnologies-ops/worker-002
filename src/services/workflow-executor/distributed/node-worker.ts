/**
 * Stateless Node Worker
 * 
 * Base class for processing workflow nodes.
 * Workers are stateless - they read from DB/storage, process, and write back.
 * Can crash/restart anytime - system will recover.
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { StorageManager } from './storage-manager';
import { DistributedOrchestrator } from './distributed-orchestrator';
import { NodeJob } from './queue-client';

export interface NodeWorkerConfig {
  nodeType: string;
  supabase: SupabaseClient;
  storage: StorageManager;
  orchestrator: DistributedOrchestrator;
}

/**
 * Stateless Node Worker
 * 
 * Processes a single node job from the queue.
 * All state is read from/written to external storage.
 */
export abstract class NodeWorker {
  protected nodeType: string;
  protected supabase: SupabaseClient;
  protected storage: StorageManager;
  protected orchestrator: DistributedOrchestrator;

  constructor(config: NodeWorkerConfig) {
    this.nodeType = config.nodeType;
    this.supabase = config.supabase;
    this.storage = config.storage;
    this.orchestrator = config.orchestrator;
  }

  /**
   * Process a node job
   * 
   * This is the main entry point called by the queue consumer.
   */
  async processJob(job: NodeJob): Promise<void> {
    const { execution_id, node_id, step_id } = job;

    try {
      // 1. IDEMPOTENCY: Try to acquire lock by updating status atomically
      // Only proceed if step is in 'pending' state
      if (step_id) {
        const { data: step, error: updateError } = await this.supabase
          .from('execution_steps')
          .update({
            status: 'running',
            started_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', step_id)
          .eq('status', 'pending') // Only update if still pending (atomic check)
          .select()
          .single();

        if (updateError || !step) {
          // Step is not in pending state - already processed or being processed
          console.log(`[NodeWorker:${this.nodeType}] ⏭️  Step ${step_id} is not in pending state, skipping (idempotency)`);
          return;
        }
      } else {
        // Fallback: Mark step as running (if step_id not provided)
        await this.updateStepStatus(
          step_id || '',
          'running',
          { started_at: new Date().toISOString() }
        );
      }

      // 2. Get input data from storage (not from memory!)
      const inputData = await this.loadNodeInputs(execution_id, node_id);

      // 3. Execute node-specific logic
      const result = await this.executeNodeLogic(
        inputData,
        execution_id,
        node_id
      );

      // 4. Store outputs (large data goes to object storage)
      const outputRefs: Record<string, unknown> = {};
      const resultData: Record<string, unknown> = {};

      for (const [key, value] of Object.entries(result.outputs || {})) {
        const storageRef = await this.storage.storeNodeOutput(
          execution_id,
          node_id,
          value
        );

        if (storageRef._storage === 's3') {
          outputRefs[key] = storageRef;
        } else {
          outputRefs[key] = storageRef._data;
        }
      }

      // Store metadata separately (always small)
      if (result.metadata) {
        Object.assign(resultData, result.metadata);
      }

      // 5. Update step as completed
      await this.updateStepStatus(
        step_id || '',
        'completed',
        {
          output_refs: outputRefs,
          result_data: resultData,
          completed_at: new Date().toISOString(),
        }
      );

      // 6. Notify orchestrator of completion
      await this.orchestrator.handleNodeCompletion(
        execution_id,
        node_id,
        outputRefs,
        resultData
      );

      console.log(`[NodeWorker:${this.nodeType}] ✅ Completed node ${node_id} for execution ${execution_id}`);
    } catch (error: any) {
      console.error(`[NodeWorker:${this.nodeType}] ❌ Failed to process node ${node_id}:`, error);

      // Update step as failed
      await this.updateStepStatus(
        step_id || '',
        'failed',
        {
          error: error.message || String(error),
          completed_at: new Date().toISOString(),
        }
      );

      // Notify orchestrator of failure (will handle retry logic)
      await this.orchestrator.handleNodeCompletion(
        execution_id,
        node_id,
        {},
        {},
        error.message || String(error)
      );

      throw error; // Re-throw to trigger queue retry mechanism
    }
  }

  /**
   * Execute node-specific logic
   * 
   * Override this method in specialized workers.
   */
  protected abstract executeNodeLogic(
    inputs: Record<string, unknown>,
    executionId: string,
    nodeId: string
  ): Promise<{
    outputs: Record<string, unknown>;
    metadata?: Record<string, unknown>;
  }>;

  /**
   * Load node inputs from storage
   */
  private async loadNodeInputs(
    executionId: string,
    nodeId: string
  ): Promise<Record<string, unknown>> {
    // Get step to find input_refs
    const { data: step, error: stepError } = await this.supabase
      .from('execution_steps')
      .select('input_refs')
      .eq('execution_id', executionId)
      .eq('node_id', nodeId)
      .single();

    if (stepError || !step) {
      throw new Error(`Execution step not found: ${executionId}/${nodeId}`);
    }

    // Load data from storage references
    const inputRefs = (step.input_refs as Record<string, unknown>) || {};
    return await this.storage.loadNodeInputs(executionId, inputRefs);
  }

  /**
   * Update step status in database
   */
  private async updateStepStatus(
    stepId: string,
    status: string,
    updates: Record<string, unknown> = {}
  ): Promise<void> {
    if (!stepId) {
      // If no step_id, find it by execution_id and node_id
      // This is a fallback - step_id should always be provided
      return;
    }

    await this.supabase
      .from('execution_steps')
      .update({
        status,
        updated_at: new Date().toISOString(),
        ...updates,
      })
      .eq('id', stepId);
  }
}
