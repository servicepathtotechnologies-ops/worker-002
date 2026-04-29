/**
 * Execution Event Logger
 * 
 * Logs execution events to workflow_execution_events table for timeline/audit/debugging
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export type ExecutionEventType =
  | 'RUN_STARTED'
  | 'RUN_FINISHED'
  | 'RUN_FAILED'
  | 'RUN_CANCELLED'
  | 'NODE_STARTED'
  | 'NODE_FINISHED'
  | 'NODE_FAILED'
  | 'NODE_RETRY'
  | 'NODE_SKIPPED'
  | 'NODE_SELF_VALIDATION'
  | 'AUTONOMOUS_REMEDIATION'
  | 'CONFIG_ATTACHED'
  | 'HEARTBEAT'
  | 'LOCK_ACQUIRED'
  | 'LOCK_RELEASED'
  | 'RESUME_STARTED'
  // Generic warning event used for optimistic execution readiness messages
  | 'WARNING';

export interface ExecutionEventData {
  [key: string]: any;
}

const CHECK_CONSTRAINT_VIOLATION = '23514';

function isMissingRelationError(error: any): boolean {
  return (
    error?.message?.includes('does not exist') ||
    error?.message?.includes('relation') ||
    error?.code === '42P01'
  );
}

function fallbackEventTypeForConstraint(eventType: ExecutionEventType): ExecutionEventType | null {
  switch (eventType) {
    case 'NODE_SELF_VALIDATION':
      return 'NODE_FINISHED';
    case 'AUTONOMOUS_REMEDIATION':
      return 'NODE_RETRY';
    case 'WARNING':
      return 'RUN_STARTED';
    default:
      return null;
  }
}

async function insertExecutionEvent(
  supabase: SupabaseClient,
  executionId: string,
  workflowId: string,
  eventType: ExecutionEventType,
  eventData: ExecutionEventData,
  nodeId: string | undefined,
  nodeName: string | undefined,
  sequence: number
) {
  return supabase
    .from('workflow_execution_events')
    .insert({
      execution_id: executionId,
      workflow_id: workflowId,
      event_type: eventType,
      event_data: eventData,
      node_id: nodeId,
      node_name: nodeName,
      sequence,
      created_at: new Date().toISOString(),
    })
    .select()
    .single();
}

/**
 * Log execution event.
 *
 * ⚠️ IMPORTANT:
 * This function is intentionally **best-effort** and MUST NOT throw.
 * Failing to write an execution log should never cause the workflow itself
 * to fail – it should only be surfaced via console logging.
 */
export async function logExecutionEvent(
  supabase: SupabaseClient,
  executionId: string,
  workflowId: string,
  eventType: ExecutionEventType,
  eventData: ExecutionEventData = {},
  nodeId?: string,
  nodeName?: string,
  sequence: number = 0
): Promise<void> {
  try {
    let { data, error } = await insertExecutionEvent(
      supabase,
      executionId,
      workflowId,
      eventType,
      eventData,
      nodeId,
      nodeName,
      sequence
    );

    if (error?.code === CHECK_CONSTRAINT_VIOLATION) {
      const fallbackEventType = fallbackEventTypeForConstraint(eventType);
      if (fallbackEventType) {
        const fallback = await insertExecutionEvent(
          supabase,
          executionId,
          workflowId,
          fallbackEventType,
          {
            ...eventData,
            originalEventType: eventType,
            downgradedForConstraint: true,
          },
          nodeId,
          nodeName,
          sequence
        );
        data = fallback.data;
        error = fallback.error;
      }
    }

    if (error) {
      // ✅ CRITICAL: Log error details for debugging, but DO NOT throw.
      // Logging failures must not break workflow execution.
      console.error('[ExecutionEventLogger] ❌ Event insert failed:', {
        executionId,
        workflowId,
        eventType,
        error: error.message,
        errorCode: error.code,
        errorDetails: error.details,
        errorHint: error.hint,
        tableMissing: isMissingRelationError(error),
        constraintMismatch: error.code === CHECK_CONSTRAINT_VIOLATION,
      });

      return;
    }

    // ✅ TEMP: Structured logging for successful event insert
    if (process.env.ENABLE_EVENT_LOGGING === 'true') {
      console.log('[ExecutionEventLogger] ✅ Event logged:', {
        executionId,
        workflowId,
        eventType,
        eventId: data?.id,
      });
    }
  } catch (error) {
    // ✅ CRITICAL: Never throw from logger – callers should not fail because of this.
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[ExecutionEventLogger] ❌ Failed to log event:', {
      executionId,
      workflowId,
      eventType,
      error: errorMessage,
    });

    // Swallow the error to avoid impacting workflow execution.
    return;
  }
}

/**
 * Get execution timeline (all events for an execution)
 */
export async function getExecutionTimeline(
  supabase: SupabaseClient,
  executionId: string
): Promise<any[]> {
  try {
    const { data, error } = await supabase
      .from('workflow_execution_events')
      .select('*')
      .eq('execution_id', executionId)
      .order('created_at', { ascending: true })
      .order('sequence', { ascending: true });

    if (error) {
      console.error('[ExecutionEventLogger] Failed to get timeline:', error);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error('[ExecutionEventLogger] Failed to get timeline:', error);
    return [];
  }
}
