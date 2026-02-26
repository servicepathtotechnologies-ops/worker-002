/**
 * Distributed Execution Locking
 * 
 * Prevents double runs by using atomic DB updates.
 * Only one active execution per workflow is allowed.
 * Automatically cleans up stale locks from crashed/stuck executions.
 */

import { SupabaseClient } from '@supabase/supabase-js';

export interface ExecutionLockResult {
  acquired: boolean;
  executionId?: string;
  existingExecutionId?: string;
  error?: string;
  staleLockCleaned?: boolean;
}

const STALE_EXECUTION_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes - consider execution stale if no heartbeat for 5 min
const MAX_EXECUTION_TIME_MS = 60 * 60 * 1000; // 1 hour - max execution time

/**
 * Check if an execution is stale (crashed or stuck)
 * 
 * @param supabase - Supabase client
 * @param executionId - Execution ID to check
 * @returns true if execution is stale, false otherwise
 */
async function isExecutionStale(
  supabase: SupabaseClient,
  executionId: string
): Promise<boolean> {
  try {
    const { data: execution, error } = await supabase
      .from('executions')
      .select('id, status, started_at, last_heartbeat, timeout_seconds')
      .eq('id', executionId)
      .single();

    if (error || !execution) {
      // Execution doesn't exist - consider it stale
      return true;
    }

    // If execution is already finished, it's not stale (but shouldn't hold lock)
    if (execution.status === 'success' || execution.status === 'failed') {
      return true; // Consider it stale for lock purposes
    }

    // ✅ CRITICAL: If execution is "waiting" (form node paused), consider it stale for lock purposes
    // This allows new executions to start while form is waiting for submission
    // The waiting execution will re-acquire the lock when form is submitted
    if (execution.status === 'waiting') {
      return true; // Consider it stale for lock purposes - allows new executions
    }

    // If execution is not running, it's stale
    if (execution.status !== 'running') {
      return true;
    }

    const now = new Date();
    const startedAt = execution.started_at ? new Date(execution.started_at) : null;
    const lastHeartbeat = execution.last_heartbeat ? new Date(execution.last_heartbeat) : null;

    // Check if execution exceeded max time
    if (startedAt) {
      const executionTime = now.getTime() - startedAt.getTime();
      const maxTime = (execution.timeout_seconds || MAX_EXECUTION_TIME_MS / 1000) * 1000;
      if (executionTime > maxTime) {
        console.log(`[ExecutionLock] Execution ${executionId} exceeded max time: ${executionTime}ms > ${maxTime}ms`);
        return true;
      }
    }

    // Check if heartbeat is stale
    if (lastHeartbeat) {
      const heartbeatAge = now.getTime() - lastHeartbeat.getTime();
      if (heartbeatAge > STALE_EXECUTION_THRESHOLD_MS) {
        console.log(`[ExecutionLock] Execution ${executionId} has stale heartbeat: ${heartbeatAge}ms > ${STALE_EXECUTION_THRESHOLD_MS}ms`);
        return true;
      }
    } else if (startedAt) {
      // No heartbeat at all, but execution started - check if it's been too long
      const timeSinceStart = now.getTime() - startedAt.getTime();
      if (timeSinceStart > STALE_EXECUTION_THRESHOLD_MS) {
        console.log(`[ExecutionLock] Execution ${executionId} has no heartbeat and started ${timeSinceStart}ms ago`);
        return true;
      }
    }

    return false;
  } catch (error) {
    console.error(`[ExecutionLock] Error checking if execution ${executionId} is stale:`, error);
    // On error, assume stale to be safe
    return true;
  }
}

/**
 * Release execution lock for a workflow
 * 
 * @param supabase - Supabase client
 * @param workflowId - Workflow ID
 * @param executionId - Execution ID to release
 */
export async function releaseExecutionLock(
  supabase: SupabaseClient,
  workflowId: string,
  executionId: string
): Promise<void> {
  try {
    // Only release if this execution holds the lock
    await supabase
      .from('workflows')
      .update({
        active_execution_id: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', workflowId)
      .eq('active_execution_id', executionId); // Only release if we hold the lock
  } catch (error) {
    console.error('[ExecutionLock] Failed to release lock:', error);
    // Non-fatal - lock will be cleaned up by timeout watchdog
  }
}

/**
 * Force release a stale execution lock
 * 
 * @param supabase - Supabase client
 * @param workflowId - Workflow ID
 * @param executionId - Stale execution ID to clean up
 */
async function cleanupStaleLock(
  supabase: SupabaseClient,
  workflowId: string,
  executionId: string
): Promise<void> {
  try {
    console.log(`[ExecutionLock] Cleaning up stale lock for execution ${executionId} on workflow ${workflowId}`);
    
    // Mark execution as failed if it's still running
    await supabase
      .from('executions')
      .update({
        status: 'failed',
        error: 'Execution lock was cleaned up - execution was stale or crashed',
        finished_at: new Date().toISOString(),
      })
      .eq('id', executionId)
      .eq('status', 'running');

    // Release the lock
    await releaseExecutionLock(supabase, workflowId, executionId);

    // Log cleanup event
    try {
      const { logExecutionEvent } = await import('./execution-event-logger');
      await logExecutionEvent(supabase, executionId, workflowId, 'LOCK_RELEASED', {
        reason: 'stale_execution_cleanup',
        workflowId,
        executionId,
        cleaned: true,
      });
    } catch (logError) {
      // Non-fatal - continue even if logging fails
      console.warn('[ExecutionLock] Failed to log cleanup event:', logError);
    }
  } catch (error) {
    console.error(`[ExecutionLock] Failed to cleanup stale lock for execution ${executionId}:`, error);
    throw error;
  }
}

/**
 * Acquire execution lock for a workflow
 * Uses atomic UPDATE to prevent race conditions
 * Automatically cleans up stale locks before acquiring
 * 
 * @param supabase - Supabase client
 * @param workflowId - Workflow ID
 * @param executionId - New execution ID to lock
 * @returns Lock acquisition result
 */
export async function acquireExecutionLock(
  supabase: SupabaseClient,
  workflowId: string,
  executionId: string
): Promise<ExecutionLockResult> {
  try {
    // ✅ STEP 1: Check if there's an existing lock and if it's stale
    const { data: workflow } = await supabase
      .from('workflows')
      .select('active_execution_id')
      .eq('id', workflowId)
      .single();

    const existingExecutionId = workflow?.active_execution_id;

    if (existingExecutionId) {
      // Check if existing execution is stale
      const isStale = await isExecutionStale(supabase, existingExecutionId);
      
      if (isStale) {
        console.log(`[ExecutionLock] Existing execution ${existingExecutionId} is stale, cleaning up...`);
        try {
          await cleanupStaleLock(supabase, workflowId, existingExecutionId);
          console.log(`[ExecutionLock] ✅ Successfully cleaned up stale lock for execution ${existingExecutionId}`);
        } catch (cleanupError) {
          console.error(`[ExecutionLock] ❌ Failed to cleanup stale lock:`, cleanupError);
          // Continue anyway - try to acquire lock
        }
      } else {
        // Execution is still active and not stale
        return {
          acquired: false,
          existingExecutionId,
          error: 'Workflow already has an active execution',
        };
      }
    }

    // ✅ STEP 2: Atomic update - only set active_execution_id if it's NULL
    // This prevents double runs even with concurrent requests
    const { data, error } = await supabase
      .from('workflows')
      .update({
        active_execution_id: executionId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', workflowId)
      .is('active_execution_id', null) // Only update if no active execution
      .select('active_execution_id')
      .single();

    if (error) {
      // Check if error is because active_execution_id is not null (lock already held)
      if (error.code === 'PGRST116' || error.message?.includes('0 rows')) {
        // Lock is still held (race condition - another request acquired it)
        const { data: workflowCheck } = await supabase
          .from('workflows')
          .select('active_execution_id')
          .eq('id', workflowId)
          .single();

        return {
          acquired: false,
          existingExecutionId: workflowCheck?.active_execution_id || undefined,
          error: 'Workflow already has an active execution',
        };
      }

      return {
        acquired: false,
        error: error.message || 'Failed to acquire execution lock',
      };
    }

    if (!data || data.active_execution_id !== executionId) {
      // Lock was not acquired (another execution is active - race condition)
      const { data: workflowCheck } = await supabase
        .from('workflows')
        .select('active_execution_id')
        .eq('id', workflowId)
        .single();

      return {
        acquired: false,
        existingExecutionId: workflowCheck?.active_execution_id || undefined,
        error: 'Workflow already has an active execution',
      };
    }

    // ✅ STEP 3: Lock acquired successfully
    // Update execution with lock timestamp
    await supabase
      .from('executions')
      .update({
        lock_acquired_at: new Date().toISOString(),
        last_heartbeat: new Date().toISOString(),
      })
      .eq('id', executionId);

    return {
      acquired: true,
      executionId,
      staleLockCleaned: existingExecutionId ? true : false,
    };
  } catch (error: any) {
    return {
      acquired: false,
      error: error.message || 'Failed to acquire execution lock',
    };
  }
}

/**
 * Check if workflow has active execution
 * 
 * @param supabase - Supabase client
 * @param workflowId - Workflow ID
 * @returns Active execution ID or null
 */
export async function getActiveExecution(
  supabase: SupabaseClient,
  workflowId: string
): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from('workflows')
      .select('active_execution_id')
      .eq('id', workflowId)
      .single();

    if (error || !data) {
      return null;
    }

    return data.active_execution_id || null;
  } catch (error) {
    console.error('[ExecutionLock] Failed to check active execution:', error);
    return null;
  }
}
