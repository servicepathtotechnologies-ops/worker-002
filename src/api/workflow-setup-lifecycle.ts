import { Request, Response } from 'express';
import { getDbClient } from '../core/database/supabase-compat';
import { normalizeWorkflowForSave, validateWorkflowForSave } from '../core/validation/workflow-save-validator';
import { buildSyncedGraphPayload, resolveWorkflowGraphState } from './workflow-graph-state';
import { workflowLifecycleManager } from '../services/workflow-lifecycle-manager';
import { subscriptionService } from '../services/subscription-service';
import { getCacheRedisClient, invalidateWorkflowDbCache } from '../middleware/redisGetCache';

export function isSetupPending(workflow: any): boolean {
  if (!workflow) return false;
  if (workflow.setup_completed === false) return true;
  const metadata = workflow.metadata && typeof workflow.metadata === 'object' ? workflow.metadata : {};
  return Boolean((metadata as any)?.aiSetup?.pending === true);
}

export function setupPendingResponse(workflowId?: string) {
  return {
    code: 'WORKFLOW_SETUP_PENDING',
    error: 'Workflow setup is not complete',
    message: 'Finish the workflow setup before opening or running this workflow.',
    workflowId,
  };
}

export function assertVisibleWorkflow(workflow: any): void {
  if (isSetupPending(workflow)) {
    const err: any = new Error('Workflow setup is not complete');
    err.statusCode = 409;
    err.body = setupPendingResponse(workflow?.id);
    throw err;
  }
}

async function requireUserId(req: Request): Promise<string> {
  const { requireAuthenticatedUser } = await import('../core/utils/check-google-auth');
  return requireAuthenticatedUser(req);
}

function metadataWithPendingMarker(metadata: unknown, pending: boolean): Record<string, unknown> {
  const base = metadata && typeof metadata === 'object' && !Array.isArray(metadata)
    ? { ...(metadata as Record<string, unknown>) }
    : {};
  const aiSetup = base.aiSetup && typeof base.aiSetup === 'object' && !Array.isArray(base.aiSetup)
    ? { ...(base.aiSetup as Record<string, unknown>) }
    : {};
  base.aiSetup = {
    ...aiSetup,
    pending,
    stage: pending ? 'ai_setup_pending' : 'complete',
    updatedAt: new Date().toISOString(),
  };
  return base;
}

export async function setupDraftWorkflowHandler(req: Request, res: Response) {
  const supabase = getDbClient();
  let userId: string;
  try {
    userId = await requireUserId(req);
  } catch (authError: any) {
    return res.status(401).json(authError);
  }

  const { workflowId, name, nodes, edges, metadata } = req.body || {};
  if (!Array.isArray(nodes) || !Array.isArray(edges)) {
    return res.status(400).json({
      code: 'INVALID_WORKFLOW_SETUP_DRAFT',
      error: 'Invalid workflow structure',
      message: 'nodes and edges must be arrays',
    });
  }

  const normalized = normalizeWorkflowForSave(nodes, edges);
  const validation = validateWorkflowForSave(normalized.nodes, normalized.edges, {
    freezeBoundary: { frozen: false },
  });

  if (!validation.canSave) {
    return res.status(400).json({
      code: 'WORKFLOW_SETUP_DRAFT_INVALID',
      error: 'Workflow validation failed',
      message: `Cannot create setup draft: ${validation.errors.join('; ')}`,
      details: { errors: validation.errors, warnings: validation.warnings },
    });
  }

  const mergedMetadata = metadataWithPendingMarker(metadata, true);
  const workflowData = {
    name: typeof name === 'string' && name.trim() ? name.trim() : 'AI Generated Workflow',
    nodes: normalized.nodes,
    edges: normalized.edges,
    graph: buildSyncedGraphPayload(normalized.nodes, normalized.edges, mergedMetadata),
    metadata: mergedMetadata,
    user_id: userId,
    status: 'draft',
    phase: 'draft',
    confirmed: false,
    setup_completed: false,
    setup_stage: 'ai_setup_pending',
    setup_completed_at: null,
    updated_at: new Date().toISOString(),
    schema_version: 2,
  };

  if (workflowId) {
    const { data: existing, error: existingError } = await supabase
      .from('workflows')
      .select('*')
      .eq('id', workflowId)
      .single();

    if (existingError || !existing) {
      const { data, error } = await supabase
        .from('workflows')
        .insert({ id: workflowId, ...workflowData } as any)
        .select()
        .single();

      if (error) {
        return res.status(500).json({ error: 'Failed to create setup draft', message: error.message });
      }

      return res.json({ success: true, workflowId: data.id, workflow: data, validation });
    }
    if ((existing as any).user_id !== userId) {
      return res.status(403).json({ error: 'Forbidden', workflowId });
    }
    if (!isSetupPending(existing)) {
      return res.status(409).json({
        code: 'WORKFLOW_ALREADY_COMMITTED',
        error: 'Workflow setup is already complete',
        workflowId,
      });
    }

    const { data, error } = await supabase
      .from('workflows')
      .update(workflowData as any)
      .eq('id', workflowId)
      .select()
      .single();

    if (error) {
      return res.status(500).json({ error: 'Failed to update setup draft', message: error.message });
    }

    return res.json({ success: true, workflowId: data.id, workflow: data, validation });
  }

  const { data, error } = await supabase
    .from('workflows')
    .insert(workflowData as any)
    .select()
    .single();

  if (error) {
    return res.status(500).json({ error: 'Failed to create setup draft', message: error.message });
  }

  return res.json({ success: true, workflowId: data.id, workflow: data, validation });
}

export async function commitSetupWorkflowHandler(req: Request, res: Response) {
  const supabase = getDbClient();
  let userId: string;
  try {
    userId = await requireUserId(req);
  } catch (authError: any) {
    return res.status(401).json(authError);
  }

  const { workflowId } = req.params;
  const { data: workflow, error } = await supabase
    .from('workflows')
    .select('*')
    .eq('id', workflowId)
    .single();

  if (error || !workflow) {
    return res.status(404).json({ error: 'Workflow not found', workflowId });
  }
  if ((workflow as any).user_id !== userId) {
    return res.status(403).json({ error: 'Forbidden', workflowId });
  }

  const graph = resolveWorkflowGraphState(workflow as any);
  const candidate = {
    nodes: Array.isArray(graph.nodes) ? graph.nodes : [],
    edges: Array.isArray(graph.edges) ? graph.edges : [],
    metadata: (workflow as any).metadata || {},
  };
  const readiness = await workflowLifecycleManager.validateExecutionReady(candidate as any, userId);

  if (!readiness.ready) {
    const errorSummary = readiness.errors?.length
      ? readiness.errors.join(' | ')
      : 'Workflow setup is incomplete';
    return res.status(409).json({
      code: 'WORKFLOW_SETUP_INCOMPLETE',
      error: 'Workflow setup is incomplete',
      message: errorSummary,
      workflowId,
      details: readiness,
    });
  }

  const wasSetupPending = isSetupPending(workflow);

  if (wasSetupPending) {
    await subscriptionService.ensureFreeSubscription(userId);
    const canCreateWorkflow = await subscriptionService.canCreateWorkflow(userId);
    if (!canCreateWorkflow) {
      const usage = await subscriptionService.getSubscriptionUsage(userId);
      return res.status(403).json({
        code: 'WORKFLOW_LIMIT_EXCEEDED',
        error: 'Workflow Limit Exceeded',
        message: `You've reached your workflow limit (${usage.workflowLimit}). Upgrade your plan to create more workflows.`,
        details: usage,
      });
    }
  }

  const metadata = metadataWithPendingMarker((workflow as any).metadata, false);
  const { data: updated, error: updateError } = await supabase
    .from('workflows')
    .update({
      status: 'active',
      phase: 'ready_for_execution',
      confirmed: true,
      setup_completed: true,
      setup_stage: 'complete',
      setup_completed_at: new Date().toISOString(),
      metadata,
      graph: buildSyncedGraphPayload(candidate.nodes, candidate.edges, metadata),
      nodes: candidate.nodes,
      edges: candidate.edges,
      updated_at: new Date().toISOString(),
    } as any)
    .eq('id', workflowId)
    .select()
    .single();

  if (updateError) {
    return res.status(500).json({ error: 'Failed to commit workflow setup', message: updateError.message });
  }

  // Bust Redis cache so the next workflow fetch gets fresh data with setup_completed = true.
  // The workflowId lives in query params so we can't predict the cache key hash — we clear
  // all /api/db/workflows:* entries. Safe: TTL is short and commit is a rare operation.
  const cacheClient = await getCacheRedisClient(process.env.REDIS_URL || 'redis://redis:6379');
  if (cacheClient) {
    await invalidateWorkflowDbCache(cacheClient).catch(() => {});
  }

  if (wasSetupPending) {
    await subscriptionService.incrementWorkflowCount(userId);
  }

  return res.json({
    success: true,
    workflowId,
    workflow: updated,
    status: updated.status,
    phase: updated.phase,
    ready: true,
  });
}
