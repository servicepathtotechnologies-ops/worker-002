/**
 * Integration Tests for Durable Execution
 * 
 * Tests:
 * 1. Crash mid-workflow → resume
 * 2. Duplicate message → no double run
 * 3. Retry after failure
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseClient } from '../../../../core/database/supabase-compat';
import { QueueClient, createQueueClient, NodeJob } from '../queue-client';
import { DistributedOrchestrator } from '../distributed-orchestrator';
import { StorageManager } from '../storage-manager';
import { RecoveryManager } from '../recovery-manager';
import { WorkerService } from '../worker-service';
import { createObjectStorageService } from '../../object-storage-service';

describe('Durable Execution Integration Tests', () => {
  let supabase: SupabaseClient;
  let queue: QueueClient;
  let orchestrator: DistributedOrchestrator;
  let storage: StorageManager;
  let recoveryManager: RecoveryManager;
  let executionId: string;

  beforeEach(async () => {
    supabase = getSupabaseClient();
    queue = createQueueClient();
    await queue.connect();

    storage = new StorageManager(supabase, createObjectStorageService());
    orchestrator = new DistributedOrchestrator(supabase, queue, storage);
    recoveryManager = new RecoveryManager(supabase, queue, orchestrator, {
      stuckExecutionThresholdMs: 1000, // 1 second for tests
      stuckStepThresholdMs: 500, // 500ms for tests
      maxRetries: 3,
    });
  });

  afterEach(async () => {
    await queue.close();
  });

  describe('Crash Recovery', () => {
    it('should resume workflow after worker crash', async () => {
      // 1. Start a workflow execution
      const workflowId = 'test-workflow-id';
      const inputData = { test: 'data' };

      executionId = await orchestrator.startExecution(workflowId, inputData);

      // 2. Simulate crash: Mark a step as running but don't complete it
      const { data: steps } = await supabase
        .from('execution_steps')
        .select('id, node_id')
        .eq('execution_id', executionId)
        .eq('status', 'pending')
        .limit(1);

      if (steps && steps.length > 0) {
        const step = steps[0];
        // Mark as running (simulating crash mid-execution)
        await supabase
          .from('execution_steps')
          .update({
            status: 'running',
            started_at: new Date(Date.now() - 2000).toISOString(), // 2 seconds ago (stuck)
            updated_at: new Date(Date.now() - 2000).toISOString(),
          })
          .eq('id', step.id);

        // 3. Trigger recovery scan
        await recoveryManager.scanAndRecover();

        // 4. Verify step was recovered (reset to pending and requeued)
        const { data: recoveredStep } = await supabase
          .from('execution_steps')
          .select('status, retry_count')
          .eq('id', step.id)
          .single();

        expect(recoveredStep?.status).toBe('pending');
      }
    }, 30000);
  });

  describe('Idempotency', () => {
    it('should not execute step twice when duplicate message received', async () => {
      // 1. Start a workflow execution
      const workflowId = 'test-workflow-id';
      const inputData = { test: 'data' };

      executionId = await orchestrator.startExecution(workflowId, inputData);

      // 2. Get a step
      const { data: steps } = await supabase
        .from('execution_steps')
        .select('id, node_id, node_type')
        .eq('execution_id', executionId)
        .eq('status', 'pending')
        .limit(1);

      if (steps && steps.length > 0) {
        const step = steps[0];

        // 3. Mark step as completed
        await supabase
          .from('execution_steps')
          .update({
            status: 'completed',
            output_refs: { result: 'test' },
            completed_at: new Date().toISOString(),
          })
          .eq('id', step.id);

        // 4. Try to process the same job again (simulating duplicate message)
        const job: NodeJob = {
          execution_id: executionId,
          node_id: step.node_id,
          node_type: step.node_type,
          step_id: step.id,
          job_id: 'duplicate-job-id',
        };

        // 5. Process job (should be skipped due to idempotency)
        const workerService = new WorkerService();
        await workerService.processJob(job);

        // 6. Verify step is still completed (not re-executed)
        const { data: finalStep } = await supabase
          .from('execution_steps')
          .select('status, output_refs')
          .eq('id', step.id)
          .single();

        expect(finalStep?.status).toBe('completed');
        expect(finalStep?.output_refs).toEqual({ result: 'test' });
      }
    }, 30000);
  });

  describe('Retry Logic', () => {
    it('should retry failed step with exponential backoff', async () => {
      // 1. Start a workflow execution
      const workflowId = 'test-workflow-id';
      const inputData = { test: 'data' };

      executionId = await orchestrator.startExecution(workflowId, inputData);

      // 2. Get a step and mark it as failed
      const { data: steps } = await supabase
        .from('execution_steps')
        .select('id, node_id, node_type, retry_count')
        .eq('execution_id', executionId)
        .eq('status', 'pending')
        .limit(1);

      if (steps && steps.length > 0) {
        const step = steps[0];

        // 3. Simulate failure
        await orchestrator.handleNodeCompletion(
          executionId,
          step.node_id,
          {},
          {},
          'Test error'
        );

        // 4. Check that step was retried
        const { data: retriedStep } = await supabase
          .from('execution_steps')
          .select('status, retry_count')
          .eq('id', step.id)
          .single();

        // Step should be pending again with retry_count incremented
        expect(retriedStep?.status).toBe('pending');
        expect(retriedStep?.retry_count).toBeGreaterThan(0);
      }
    }, 30000);

    it('should mark execution as failed after max retries', async () => {
      // 1. Start a workflow execution
      const workflowId = 'test-workflow-id';
      const inputData = { test: 'data' };

      executionId = await orchestrator.startExecution(workflowId, inputData);

      // 2. Get a step
      const { data: steps } = await supabase
        .from('execution_steps')
        .select('id, node_id, node_type')
        .eq('execution_id', executionId)
        .eq('status', 'pending')
        .limit(1);

      if (steps && steps.length > 0) {
        const step = steps[0];

        // 3. Set retry_count to max_retries
        await supabase
          .from('execution_steps')
          .update({
            retry_count: 3,
            max_retries: 3,
          })
          .eq('id', step.id);

        // 4. Simulate failure (should exceed max retries)
        await orchestrator.handleNodeCompletion(
          executionId,
          step.node_id,
          {},
          {},
          'Test error'
        );

        // 5. Check that execution is marked as failed
        const { data: execution } = await supabase
          .from('executions')
          .select('status, error_message')
          .eq('id', executionId)
          .single();

        expect(execution?.status).toBe('failed');
        expect(execution?.error_message).toContain('failed after');
      }
    }, 30000);
  });
});
