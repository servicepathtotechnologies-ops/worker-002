import { Request, Response } from 'express';
import { getSupabaseClient } from '../core/database/supabase-compat';
import { releaseExecutionLock } from '../services/execution/execution-lock';

export async function cancelExecutionRoute(req: Request, res: Response) {
  const { executionId } = req.params;
  const userId = (req as any).user?.id;

  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const supabase = getSupabaseClient();

  // Load execution and verify ownership via the parent workflow
  const { data: execution, error: fetchError } = await supabase
    .from('executions')
    .select('id, status, workflow_id, workflows(user_id)')
    .eq('id', executionId)
    .single();

  if (fetchError || !execution) {
    return res.status(404).json({ error: 'Execution not found' });
  }

  const ownerUserId = (execution as any).workflows?.user_id;
  if (ownerUserId !== userId) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  if (execution.status !== 'running' && execution.status !== 'waiting') {
    return res.status(409).json({
      error: 'Execution is not active',
      status: execution.status,
    });
  }

  const workflowId = execution.workflow_id;

  // Mark execution as failed
  await supabase
    .from('executions')
    .update({
      status: 'failed',
      error: 'Cancelled by user',
      finished_at: new Date().toISOString(),
    })
    .eq('id', executionId);

  // Release the workflow lock (no-op if this execution doesn't hold it)
  if (workflowId) {
    await releaseExecutionLock(supabase, workflowId, executionId);
  }

  console.log(`[CancelExecution] Execution ${executionId} cancelled by user ${userId}`);

  return res.json({ success: true, executionId, status: 'failed' });
}
