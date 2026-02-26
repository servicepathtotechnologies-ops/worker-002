/**
 * Recovery Manager
 * 
 * Handles recovery of stuck/failed workflow executions.
 * Scans for executions that are stuck in "running" state or steps that are stuck in "running" state.
 * Implements resume logic for crashed workers.
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { QueueClient, NodeJob } from './queue-client';
import { DistributedOrchestrator } from './distributed-orchestrator';

export interface RecoveryConfig {
  stuckExecutionThresholdMs: number; // How long before execution is considered stuck (default: 5 minutes)
  stuckStepThresholdMs: number; // How long before step is considered stuck (default: 2 minutes)
  maxRetries: number; // Maximum retries before marking as failed
}

/**
 * Recovery Manager
 * 
 * Scans for and recovers stuck executions and steps.
 */
export class RecoveryManager {
  private supabase: SupabaseClient;
  private queue: QueueClient;
  private orchestrator: DistributedOrchestrator;
  private config: RecoveryConfig;
  private isRunning: boolean = false;
  private scanInterval?: NodeJS.Timeout;

  constructor(
    supabase: SupabaseClient,
    queue: QueueClient,
    orchestrator: DistributedOrchestrator,
    config?: Partial<RecoveryConfig>
  ) {
    this.supabase = supabase;
    this.queue = queue;
    this.orchestrator = orchestrator;
    this.config = {
      stuckExecutionThresholdMs: config?.stuckExecutionThresholdMs || 5 * 60 * 1000, // 5 minutes
      stuckStepThresholdMs: config?.stuckStepThresholdMs || 2 * 60 * 1000, // 2 minutes
      maxRetries: config?.maxRetries || 3,
    };
  }

  /**
   * Start recovery manager (periodic scanning)
   */
  async start(scanIntervalMs: number = 60000): Promise<void> {
    if (this.isRunning) {
      console.log('[RecoveryManager] Already running');
      return;
    }

    console.log('[RecoveryManager] 🚀 Starting recovery manager...');
    this.isRunning = true;

    // Run initial scan
    await this.scanAndRecover();

    // Schedule periodic scans
    this.scanInterval = setInterval(async () => {
      await this.scanAndRecover();
    }, scanIntervalMs);

    console.log(`[RecoveryManager] ✅ Recovery manager started (scanning every ${scanIntervalMs}ms)`);
  }

  /**
   * Stop recovery manager
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    if (this.scanInterval) {
      clearInterval(this.scanInterval);
      this.scanInterval = undefined;
    }

    this.isRunning = false;
    console.log('[RecoveryManager] ✅ Recovery manager stopped');
  }

  /**
   * Scan for stuck executions and steps, then recover them
   */
  async scanAndRecover(): Promise<void> {
    try {
      const now = new Date();
      const stuckExecutionThreshold = new Date(now.getTime() - this.config.stuckExecutionThresholdMs);
      const stuckStepThreshold = new Date(now.getTime() - this.config.stuckStepThresholdMs);

      // 1. Find stuck executions (running but no activity for threshold time)
      const stuckExecutions = await this.findStuckExecutions(stuckExecutionThreshold);
      for (const execution of stuckExecutions) {
        await this.recoverExecution(execution.id);
      }

      // 2. Find stuck steps (running but no activity for threshold time)
      const stuckSteps = await this.findStuckSteps(stuckStepThreshold);
      for (const step of stuckSteps) {
        await this.recoverStep(step);
      }

      if (stuckExecutions.length > 0 || stuckSteps.length > 0) {
        console.log(`[RecoveryManager] 🔄 Recovered ${stuckExecutions.length} executions and ${stuckSteps.length} steps`);
      }
    } catch (error) {
      console.error('[RecoveryManager] ❌ Error during recovery scan:', error);
    }
  }

  /**
   * Find stuck executions
   */
  private async findStuckExecutions(threshold: Date): Promise<Array<{ id: string; workflow_id: string }>> {
    const { data, error } = await this.supabase
      .from('executions')
      .select('id, workflow_id')
      .eq('status', 'running')
      .lt('updated_at', threshold.toISOString());

    if (error) {
      console.error('[RecoveryManager] Error finding stuck executions:', error);
      return [];
    }

    return data || [];
  }

  /**
   * Find stuck steps
   */
  private async findStuckSteps(threshold: Date): Promise<Array<{ id: string; execution_id: string; node_id: string; node_type: string }>> {
    const { data, error } = await this.supabase
      .from('execution_steps')
      .select('id, execution_id, node_id, node_type, retry_count')
      .eq('status', 'running')
      .lt('updated_at', threshold.toISOString());

    if (error) {
      console.error('[RecoveryManager] Error finding stuck steps:', error);
      return [];
    }

    return data || [];
  }

  /**
   * Recover a stuck execution
   */
  private async recoverExecution(executionId: string): Promise<void> {
    try {
      console.log(`[RecoveryManager] 🔄 Recovering execution ${executionId}`);

      // Get execution details
      const { data: execution, error: execError } = await this.supabase
        .from('executions')
        .select('workflow_id, status')
        .eq('id', executionId)
        .single();

      if (execError || !execution) {
        console.error(`[RecoveryManager] Execution not found: ${executionId}`);
        return;
      }

      // Find the last completed step
      const { data: lastStep } = await this.supabase
        .from('execution_steps')
        .select('node_id, output_refs')
        .eq('execution_id', executionId)
        .eq('status', 'completed')
        .order('sequence', { ascending: false })
        .limit(1)
        .single();

      if (lastStep) {
        // Resume from last completed step
        await this.resumeExecutionFromStep(executionId, execution.workflow_id, lastStep.node_id, lastStep.output_refs);
      } else {
        // No completed steps - restart from beginning
        await this.restartExecution(executionId, execution.workflow_id);
      }
    } catch (error) {
      console.error(`[RecoveryManager] ❌ Failed to recover execution ${executionId}:`, error);
    }
  }

  /**
   * Recover a stuck step
   */
  private async recoverStep(step: { id: string; execution_id: string; node_id: string; node_type: string; retry_count?: number }): Promise<void> {
    try {
      const retryCount = (step.retry_count || 0) + 1;

      if (retryCount > this.config.maxRetries) {
        // Max retries exceeded - mark step as failed
        await this.supabase
          .from('execution_steps')
          .update({
            status: 'failed',
            error: 'Step stuck and max retries exceeded',
            updated_at: new Date().toISOString(),
          })
          .eq('id', step.id);

        // Mark execution as failed if this was a critical step
        await this.supabase
          .from('executions')
          .update({
            status: 'failed',
            error_message: `Step ${step.node_id} failed after ${this.config.maxRetries} retries`,
            updated_at: new Date().toISOString(),
          })
          .eq('id', step.execution_id);

        console.log(`[RecoveryManager] ❌ Step ${step.node_id} exceeded max retries, marked as failed`);
        return;
      }

      // Reset step to pending and requeue
      await this.supabase
        .from('execution_steps')
        .update({
          status: 'pending',
          retry_count: retryCount,
          error: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', step.id);

      // Requeue the job
      await this.queue.publishJob({
        execution_id: step.execution_id,
        node_id: step.node_id,
        node_type: step.node_type,
        step_id: step.id,
        priority: 3, // Lower priority for retries
        retry_attempt: retryCount,
      });

      console.log(`[RecoveryManager] 🔄 Requeued stuck step ${step.node_id} (retry ${retryCount}/${this.config.maxRetries})`);
    } catch (error) {
      console.error(`[RecoveryManager] ❌ Failed to recover step ${step.id}:`, error);
    }
  }

  /**
   * Resume execution from a specific step
   */
  private async resumeExecutionFromStep(
    executionId: string,
    workflowId: string,
    lastCompletedNodeId: string,
    lastOutputRefs: any
  ): Promise<void> {
    // Get workflow definition
    const workflowDef = await this.orchestrator.getWorkflowDefinition(workflowId);
    if (!workflowDef) {
      throw new Error(`Workflow definition not found: ${workflowId}`);
    }

    // Get next nodes from workflow definition
    const nextNodes = this.orchestrator.getNextNodes(workflowDef.definition, lastCompletedNodeId);

    // Queue next nodes
    for (const nextNode of nextNodes) {
      const nextInput = await this.orchestrator.prepareNodeInput(
        executionId,
        nextNode.id,
        workflowDef.definition,
        lastOutputRefs
      );

      const stepId = await this.orchestrator.createExecutionStep(
        executionId,
        nextNode.id,
        nextNode.data.type,
        nextInput,
        'pending'
      );

      await this.queue.publishJob({
        execution_id: executionId,
        node_id: nextNode.id,
        node_type: nextNode.data.type,
        step_id: stepId,
        priority: 5,
      });
    }

    console.log(`[RecoveryManager] ✅ Resumed execution ${executionId} from node ${lastCompletedNodeId}`);
  }

  /**
   * Restart execution from beginning
   */
  private async restartExecution(executionId: string, workflowId: string): Promise<void> {
    // Get workflow definition
    const workflowDef = await this.orchestrator.getWorkflowDefinition(workflowId);
    if (!workflowDef) {
      throw new Error(`Workflow definition not found: ${workflowId}`);
    }

    // Get initial nodes
    const initialNodes = this.orchestrator.getInitialNodes(workflowDef.definition);

    // Get execution input
    const { data: execution } = await this.supabase
      .from('executions')
      .select('input')
      .eq('id', executionId)
      .single();

    const inputRefs = execution?.input || {};

    // Queue initial nodes
    for (const node of initialNodes) {
      const stepId = await this.orchestrator.createExecutionStep(
        executionId,
        node.id,
        node.data.type,
        inputRefs,
        'pending'
      );

      await this.queue.publishJob({
        execution_id: executionId,
        node_id: node.id,
        node_type: node.data.type,
        step_id: stepId,
        priority: 5,
      });
    }

    console.log(`[RecoveryManager] ✅ Restarted execution ${executionId} from beginning`);
  }
}
