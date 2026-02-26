/**
 * Timeout Watchdog for Stuck Runs
 * 
 * Detects and handles stuck executions that haven't sent heartbeats
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseClient } from '../../core/database/supabase-compat';
import { releaseExecutionLock } from './execution-lock';
import { logExecutionEvent } from './execution-event-logger';
import { ErrorCode } from '../../core/utils/error-codes';

const DEFAULT_TIMEOUT_SECONDS = 3600; // 1 hour
const HEARTBEAT_TIMEOUT_SECONDS = 300; // 5 minutes - if no heartbeat for 5 min, consider stuck

/**
 * Check for stuck executions and mark them as failed
 * 
 * @param supabase - Supabase client
 * @param timeoutSeconds - Timeout in seconds (default: 1 hour)
 * @returns Number of stuck executions found and cleaned up
 */
export async function checkStuckExecutions(
  supabase: SupabaseClient = getSupabaseClient(),
  timeoutSeconds: number = DEFAULT_TIMEOUT_SECONDS
): Promise<number> {
  try {
    const now = new Date();
    const timeoutThreshold = new Date(now.getTime() - timeoutSeconds * 1000);
    const heartbeatThreshold = new Date(now.getTime() - HEARTBEAT_TIMEOUT_SECONDS * 1000);

    // Find stuck executions:
    // 1. Status is 'running'
    // 2. Either:
    //    - started_at is older than timeout_seconds, OR
    //    - last_heartbeat is older than HEARTBEAT_TIMEOUT_SECONDS (5 minutes)
    const { data: stuckExecutions, error } = await supabase
      .from('executions')
      .select('id, workflow_id, started_at, last_heartbeat, timeout_seconds, status')
      .eq('status', 'running')
      .or(`started_at.lt.${timeoutThreshold.toISOString()},last_heartbeat.lt.${heartbeatThreshold.toISOString()}`);

    if (error) {
      console.error('[TimeoutWatchdog] Error finding stuck executions:', error);
      return 0;
    }

    if (!stuckExecutions || stuckExecutions.length === 0) {
      return 0;
    }

    console.log(`[TimeoutWatchdog] Found ${stuckExecutions.length} stuck execution(s)`);

    let cleanedCount = 0;

    for (const execution of stuckExecutions) {
      try {
        const executionTimeout = execution.timeout_seconds || timeoutSeconds;
        const executionTimeoutThreshold = new Date(
          new Date(execution.started_at).getTime() + executionTimeout * 1000
        );

        // Check if execution exceeded its timeout
        const exceededTimeout = now > executionTimeoutThreshold;
        // Check if heartbeat is stale
        const staleHeartbeat = execution.last_heartbeat 
          ? new Date(execution.last_heartbeat) < heartbeatThreshold
          : true;

        if (exceededTimeout || staleHeartbeat) {
          const reason = exceededTimeout ? 'timeout' : 'stale_heartbeat';
          const timeoutMs = exceededTimeout 
            ? executionTimeout * 1000 
            : HEARTBEAT_TIMEOUT_SECONDS * 1000;

          console.log(`[TimeoutWatchdog] Marking execution ${execution.id} as failed (${reason})`);

          // Mark execution as failed
          await supabase
            .from('executions')
            .update({
              status: 'failed',
              error: `Execution timed out (${reason}) - no activity for ${Math.round(timeoutMs / 1000)}s`,
              finished_at: now.toISOString(),
            })
            .eq('id', execution.id);

          // Release execution lock
          await releaseExecutionLock(supabase, execution.workflow_id, execution.id);

          // Log timeout event
          await logExecutionEvent(
            supabase,
            execution.id,
            execution.workflow_id,
            'RUN_FAILED',
            {
              reason,
              timeoutMs,
              startedAt: execution.started_at,
              lastHeartbeat: execution.last_heartbeat,
            }
          );

          cleanedCount++;
        }
      } catch (execError) {
        console.error(`[TimeoutWatchdog] Failed to clean up execution ${execution.id}:`, execError);
      }
    }

    console.log(`[TimeoutWatchdog] Cleaned up ${cleanedCount} stuck execution(s)`);
    return cleanedCount;
  } catch (error) {
    console.error('[TimeoutWatchdog] Error checking stuck executions:', error);
    return 0;
  }
}

/**
 * Start periodic timeout watchdog (runs every 5 minutes)
 * 
 * @param intervalMs - Check interval in milliseconds (default: 5 minutes)
 */
export function startTimeoutWatchdog(intervalMs: number = 5 * 60 * 1000): NodeJS.Timeout {
  console.log(`[TimeoutWatchdog] Starting periodic checks (every ${intervalMs / 1000}s)`);

  // Run immediately
  checkStuckExecutions().catch(err => {
    console.error('[TimeoutWatchdog] Initial check failed:', err);
  });

  // Then run periodically
  const interval = setInterval(() => {
    checkStuckExecutions().catch(err => {
      console.error('[TimeoutWatchdog] Periodic check failed:', err);
    });
  }, intervalMs);

  return interval;
}
