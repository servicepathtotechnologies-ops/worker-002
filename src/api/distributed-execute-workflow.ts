/**
 * Distributed Execute Workflow API
 * 
 * New API endpoint that uses the distributed workflow engine.
 * This replaces the old synchronous execute-workflow.ts with queue-based execution.
 */

import { Request, Response } from 'express';
import { getDbClient } from '../core/database/supabase-compat';
import { DistributedOrchestrator } from '../services/workflow-executor/distributed/distributed-orchestrator';
import { QueueClient, createQueueClient } from '../services/workflow-executor/distributed/queue-client';
import { StorageManager } from '../services/workflow-executor/distributed/storage-manager';
import { createObjectStorageService } from '../services/workflow-executor/object-storage-service';
import { ErrorCode } from '../core/utils/error-codes';
import { normalizeIfElseConfig } from '../core/utils/if-else-conditions';

/**
 * Normalize If/Else node conditions field
 * Converts string or object formats to the expected array format
 */
function normalizeIfElseConditions(config: Record<string, unknown>): Record<string, unknown> {
  return normalizeIfElseConfig(config);
}

/**
 * Start workflow execution (distributed)
 * 
 * POST /api/distributed-execute-workflow
 * Body: { workflowId: string, input: Record<string, unknown> }
 */
export default async function distributedExecuteWorkflow(
  req: Request,
  res: Response
): Promise<void> {
  const supabase = getDbClient();
  const { workflowId, input = {} } = req.body;

  if (!workflowId) {
    res.status(400).json({ error: 'workflowId is required' });
    return;
  }

  try {
    // ✅ CRITICAL: Re-fetch workflow from DB and validate readiness (same as execute-workflow)
    const { data: workflow, error: workflowError } = await supabase
      .from('workflows')
      .select('*')
      .eq('id', workflowId)
      .single();

    if (workflowError || !workflow) {
      res.status(404).json({
        code: ErrorCode.WORKFLOW_NOT_FOUND,
        error: 'Workflow not found',
        message: workflowError?.message || 'The specified workflow could not be found.',
        workflowId,
      });
      return;
    }

    // ✅ EXECUTION GUARD: Workflow must be confirmed before execution
    // Check both confirmed field and status field for backward compatibility
    const { isSetupPending, setupPendingResponse } = await import('./workflow-setup-lifecycle');
    if (isSetupPending(workflow)) {
      res.status(409).json(setupPendingResponse(workflowId));
      return;
    }

    const isConfirmed = workflow.confirmed === true || workflow.status === 'active';
    if (!isConfirmed) {
      console.error(`[DistributedExecuteWorkflow] ❌ Execution blocked - Workflow ${workflowId} is not confirmed`);
      res.status(403).json({
        code: 'WORKFLOW_NOT_CONFIRMED',
        error: 'Workflow execution not allowed',
        message: 'Workflow must be confirmed before execution',
        workflowId,
        confirmed: workflow.confirmed,
        status: workflow.status,
        hint: 'Please confirm the workflow through the confirmation API before executing it.',
      });
      return;
    }

    const nodes = workflow.nodes as any[];
    const edges = workflow.edges as any[];

    const { workflowLifecycleManager } = await import('../services/workflow-lifecycle-manager');
    const { credentialDiscoveryPhase } = await import('../services/ai/credential-discovery-phase');

    // Get current user for credential checks
    let currentUserId: string | undefined;
    try {
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.replace('Bearer ', '').trim();
        if (token) {
          const { data: { user }, error: authError } = await supabase.auth.getUser(token);
          if (!authError && user) {
            currentUserId = user.id;
          }
        }
      }
    } catch (authErr) {
      // Auth is optional
    }

    const workflowStatus = workflow.status || 'draft';
    const workflowPhase = workflow.phase || workflow.status || 'draft';
    const isStatusReady = workflowPhase === 'ready_for_execution' || workflowPhase === 'executing';

    // ✅ FAST PATH: Workflow already confirmed ready — skip the expensive 5-layer validation pipeline.
    // The pipeline checks graph structure which doesn't change at runtime; only re-run it for
    // un-confirmed workflows (draft/built) where the structure may not have been validated yet.
    let executionValidation: { ready: boolean; errors: string[]; missingCredentials: string[] };
    let credentialDiscovery: Awaited<ReturnType<typeof credentialDiscoveryPhase.discoverCredentials>>;
    let allMissingInputs: ReturnType<typeof workflowLifecycleManager.discoverNodeInputs>['inputs'];

    if (isStatusReady) {
      // Fast path: trust the phase, only check credentials and inputs (cheap DB queries)
      [executionValidation, credentialDiscovery] = await Promise.all([
        Promise.resolve({ ready: true, errors: [], missingCredentials: [] }),
        credentialDiscoveryPhase.discoverCredentials({ nodes, edges }, currentUserId),
      ]);

      const nodeInputs = workflowLifecycleManager.discoverNodeInputs({ nodes, edges });
      allMissingInputs = nodeInputs.inputs.filter(inp => {
        const node = nodes.find((n: any) => n.id === inp.nodeId);
        if (!node) return true;
        const config = node.data?.type === 'if_else'
          ? normalizeIfElseConditions(node.data?.config || {})
          : (node.data?.config || {});
        const value = config[inp.fieldName];
        if (inp.fieldType === 'array') return inp.required && (!Array.isArray(value) || value.length === 0);
        return inp.required && (value === undefined || value === null || value === '');
      });
    } else {
      // Full validation path for workflows not yet confirmed as ready
      const [validationResult, discoveryResult] = await Promise.all([
        workflowLifecycleManager.validateExecutionReady({ nodes, edges }, currentUserId),
        credentialDiscoveryPhase.discoverCredentials({ nodes, edges }, currentUserId),
      ]);
      executionValidation = validationResult;
      credentialDiscovery = discoveryResult;

      const nodeInputs = workflowLifecycleManager.discoverNodeInputs({ nodes, edges });
      const { nodeDefinitionRegistry } = await import('../core/types/node-definition');
      const typeMismatchInputs: typeof nodeInputs.inputs = [];

      for (const node of nodes) {
        const nodeType = node.data?.type || node.type;
        const definition = nodeDefinitionRegistry.get(nodeType);
        if (!definition) continue;
        const normalizedConfig = nodeType === 'if_else'
          ? normalizeIfElseConditions(node.data?.config || {})
          : (node.data?.config || {});
        for (const requiredField of definition.requiredInputs) {
          const value = normalizedConfig[requiredField];
          if (value === undefined || value === null || value === '') continue;
          const fieldSchema = definition.inputSchema[requiredField];
          if (!fieldSchema) continue;
          const expectedType = fieldSchema.type;
          const typeMismatch =
            (expectedType === 'array' && !Array.isArray(value)) ||
            (expectedType === 'string' && typeof value !== 'string') ||
            (expectedType === 'number' && typeof value !== 'number') ||
            (expectedType === 'boolean' && typeof value !== 'boolean') ||
            (expectedType === 'object' && (typeof value !== 'object' || Array.isArray(value) || value === null));
          if (typeMismatch) {
            const existing = nodeInputs.inputs.find(i => i.nodeId === node.id && i.fieldName === requiredField);
            typeMismatchInputs.push(existing || {
              nodeId: node.id, nodeType, nodeLabel: node.data?.label || node.id,
              fieldName: requiredField, fieldType: expectedType,
              inputType: expectedType === 'number' ? 'number' : expectedType === 'boolean' ? 'select' : 'textarea',
              description: fieldSchema.description || requiredField, required: true,
            });
          }
        }
      }

      const missingInputs = nodeInputs.inputs.filter(inp => {
        const node = nodes.find((n: any) => n.id === inp.nodeId);
        if (!node) return true;
        const config = node.data?.type === 'if_else'
          ? normalizeIfElseConditions(node.data?.config || {})
          : (node.data?.config || {});
        const value = config[inp.fieldName];
        if (inp.fieldType === 'array') return inp.required && (!Array.isArray(value) || value.length === 0);
        return inp.required && (!value || value === '' || value === null || value === undefined);
      });
      allMissingInputs = [...missingInputs, ...typeMismatchInputs];
    }

    const requiredCredentialsCount = credentialDiscovery.requiredCredentials?.length || 0;
    const missingCredentialsCount = credentialDiscovery.missingCredentials?.length || 0;

    const readinessCheck = {
      workflowId,
      phase: workflowPhase,
      status: workflowStatus,
      requiredCredentialsCount,
      missingCredentialsCount,
      missingInputsCount: allMissingInputs.length,
      missingInputs: allMissingInputs.map((input: any) => ({
        nodeId: input.nodeId,
        nodeType: input.nodeType,
        nodeLabel: input.nodeLabel,
        fieldName: input.fieldName,
        fieldType: input.fieldType,
        description: input.description,
        required: input.required,
      })),
      missingCredentials: (credentialDiscovery.missingCredentials || []).map((credential: any) => {
        const firstNodeId = Array.isArray(credential.nodeIds) ? credential.nodeIds[0] : credential.nodeId;
        const firstNodeType = Array.isArray(credential.nodeTypes) ? credential.nodeTypes[0] : credential.nodeType;
        const matchingNode = firstNodeId ? nodes.find((n: any) => n.id === firstNodeId) : null;
        const derivedNodeLabel = matchingNode
          ? (matchingNode.data?.label || matchingNode.data?.type || firstNodeType || '')
          : (firstNodeType || '');
        return {
          nodeId: firstNodeId || '',
          nodeType: firstNodeType || '',
          nodeLabel: derivedNodeLabel,
          provider: credential.provider,
          displayName: credential.displayName,
          vaultKey: credential.vaultKey,
          credentialId: credential.credentialId,
        };
      }),
      executionValidationReady: executionValidation.ready,
      executionValidationErrors: executionValidation.errors,
      executionValidationMissingCredentials: executionValidation.missingCredentials,
    };

    console.log('[DistributedExecuteWorkflow] Readiness check:', JSON.stringify(readinessCheck, null, 2));

    const isStatusReadyLegacy = workflowStatus === 'ready' && executionValidation.ready && allMissingInputs.length === 0;
    const credentialsAttached = missingCredentialsCount === 0;

    if (!isStatusReady && !isStatusReadyLegacy) {
      if (executionValidation.ready && allMissingInputs.length === 0 && missingCredentialsCount === 0) {
        console.log(`[DistributedExecuteWorkflow] Validation passes but phase is "${workflowPhase}" - updating to active, phase to ready_for_execution`);
        
        // ✅ CRITICAL: Update status to 'active' (valid enum) and phase to 'ready_for_execution' (TEXT)
        const { data: statusUpdateData, error: statusUpdateError } = await supabase
          .from('workflows')
          .update({
            status: 'active', // Use valid enum value
            phase: 'ready_for_execution', // Use TEXT field for execution readiness
            updated_at: new Date().toISOString(),
          })
          .eq('id', workflowId)
          .select('id, status, phase')
          .single();

        if (statusUpdateError) {
          console.error('[DistributedExecuteWorkflow] ❌ Failed to update workflow status:', {
            workflowId,
            error: statusUpdateError.message,
            errorCode: statusUpdateError.code,
          });
          res.status(500).json({
            code: ErrorCode.INTERNAL_ERROR,
            error: 'Failed to update workflow status',
            message: `Validation passed but could not update status: ${statusUpdateError.message}`,
            phase: workflowStatus,
          });
          return;
        }

        // ✅ CRITICAL: Verify status was actually persisted
        if (!statusUpdateData || statusUpdateData.status !== 'active' || statusUpdateData.phase !== 'ready_for_execution') {
          console.error('[DistributedExecuteWorkflow] ❌ Status update did not persist:', {
            workflowId,
            expectedStatus: 'active',
            expectedPhase: 'ready_for_execution',
            actualStatus: statusUpdateData?.status,
            actualPhase: statusUpdateData?.phase,
          });
          res.status(500).json({
            code: ErrorCode.INTERNAL_ERROR,
            error: 'Workflow status update did not persist',
            message: `Validation passed but status update failed to persist`,
            phase: workflowStatus,
          });
          return;
        }

        console.log(`[DistributedExecuteWorkflow] ✅ Status updated to active, phase to ready_for_execution for workflow ${workflowId}`);
      } else {
        res.status(400).json({
          code: ErrorCode.EXECUTION_NOT_READY,
          error: 'Workflow not ready for execution',
          message: `Workflow phase is "${workflowPhase}" but must be "ready_for_execution"`,
          phase: workflowPhase,
          status: workflowStatus,
          details: readinessCheck,
          hint: 'Workflow must have inputs and credentials attached before execution.',
        });
        return;
      }
    }

    if (allMissingInputs.length > 0) {
      res.status(400).json({
        code: ErrorCode.EXECUTION_MISSING_INPUTS,
        error: 'Workflow not ready for execution',
        message: `Workflow requires inputs that are not configured: ${allMissingInputs.map(i => `${i.nodeLabel}.${i.fieldName}`).join(', ')}`,
        phase: workflowStatus,
        details: readinessCheck,
        hint: 'Please attach inputs to this workflow using /api/workflows/:id/attach-inputs before executing.',
      });
      return;
    }

    if (!executionValidation.ready && !credentialsAttached) {
      const missingCreds = executionValidation.missingCredentials.join(', ');
      res.status(400).json({
        code: ErrorCode.EXECUTION_MISSING_CREDENTIALS,
        error: 'Workflow not ready for execution',
        message: `Workflow requires credentials that are not injected: ${missingCreds}`,
        phase: workflowStatus,
        details: readinessCheck,
        hint: 'Please attach credentials to this workflow using /api/workflows/:id/attach-credentials before executing.',
      });
      return;
    }

    // ✅ PRE-FLIGHT: Check for existing active execution BEFORE creating any records.
    // This prevents phantom queue jobs when the lock check fails after the execution is already queued.
    const { acquireExecutionLock } = await import('../services/execution/execution-lock');
    const { logExecutionEvent } = await import('../services/execution/execution-event-logger');

    // Initialize distributed workflow components
    const queue = createQueueClient();
    await queue.connect();

    const storage = new StorageManager(
      supabase,
      createObjectStorageService()
    );

    const orchestrator = new DistributedOrchestrator(
      supabase,
      queue,
      storage
    );

    // ✅ PRE-FLIGHT: Read current lock state on the workflow row
    const { data: wfLockCheck } = await supabase
      .from('workflows')
      .select('active_execution_id')
      .eq('id', workflowId)
      .single();

    const existingActiveId = wfLockCheck?.active_execution_id as string | null;
    if (existingActiveId) {
      const { data: existingExec } = await supabase
        .from('executions')
        .select('id, status, last_heartbeat, started_at')
        .eq('id', existingActiveId)
        .single();

      const STALE_MS = 5 * 60 * 1000; // 5 minutes
      const lastHb = existingExec?.last_heartbeat ? new Date(existingExec.last_heartbeat).getTime() : 0;
      const isReallyRunning =
        existingExec &&
        existingExec.status === 'running' &&
        lastHb > 0 &&
        Date.now() - lastHb < STALE_MS;

      if (isReallyRunning) {
        await queue.close();
        res.status(409).json({
          code: ErrorCode.RUN_ALREADY_ACTIVE,
          error: 'Workflow already has an active execution',
          message: `Workflow is currently executing. Please wait for it to finish.`,
          details: { workflowId, existingExecutionId: existingActiveId },
          recoverable: true,
        });
        return;
      }

      // Stale or missing execution — clear the lock before starting
      console.log(`[DistributedExecuteWorkflow] Clearing stale lock for execution ${existingActiveId}`);
      await supabase
        .from('workflows')
        .update({ active_execution_id: null, updated_at: new Date().toISOString() })
        .eq('id', workflowId)
        .eq('active_execution_id', existingActiveId);

      if (existingExec?.status === 'running') {
        await supabase
          .from('executions')
          .update({ status: 'failed', error: 'Cleaned up stale execution', finished_at: new Date().toISOString() })
          .eq('id', existingActiveId);
      }
    }

    // Start execution (returns immediately - workflow continues via queue)
    // Lock is clear at this point — pre-flight ensured it.
    // Bug 1 fix: pass the authenticated user's ID (or the workflow owner's ID as fallback)
    // so the execution record is visible to user-scoped db-proxy queries.
    const executionId = await orchestrator.startExecution(
      workflowId,
      input,
      currentUserId ?? (workflow as any).user_id
    );

    // Invalidate executions list Redis cache so the sidebar reflects the new execution
    try {
      const { getCacheRedisClient } = await import('../middleware/redisGetCache');
      const cacheClient = await getCacheRedisClient(process.env.REDIS_URL || 'redis://redis:6379');
      if (cacheClient) {
        const keys = await cacheClient.keys('/api/db/executions:*');
        if (keys.length) await cacheClient.del(keys);
      }
    } catch (_) {}

    // ✅ Acquire distributed execution lock (atomic — should always succeed after pre-flight)
    const lockResult = await acquireExecutionLock(supabase, workflowId, executionId);
    if (!lockResult.acquired) {
      // Rare race condition — clean up and return 409
      await supabase.from('executions').delete().eq('id', executionId);
      await queue.close();

      res.status(409).json({
        code: ErrorCode.RUN_ALREADY_ACTIVE,
        error: 'Workflow already has an active execution',
        message: `Cannot start execution — workflow is locked by execution ${lockResult.existingExecutionId}`,
        details: {
          workflowId,
          executionId,
          existingExecutionId: lockResult.existingExecutionId,
        },
        recoverable: true,
      });
      return;
    }

    // Log lock acquired and run started events
    await logExecutionEvent(supabase, executionId, workflowId, 'LOCK_ACQUIRED', {
      workflowId,
      executionId,
    });
    await logExecutionEvent(supabase, executionId, workflowId, 'RUN_STARTED', {
      workflowId,
      executionId,
      input,
      trigger: 'manual',
      distributed: true,
    });

    // Capture auth header before the HTTP response is sent (req may be GC'd after res.json)
    const authHeader = req.headers.authorization;

    // Return execution ID immediately — client starts polling now
    res.json({
      success: true,
      execution_id: executionId,
      status: 'started',
      message: 'Workflow execution started. Use /api/execution-status/:id to check progress.',
    });

    // Close queue connection (no longer blocking — response already sent)
    queue.close().catch(() => {});

    // ✅ BACKGROUND EXECUTION: run the full proven engine after the HTTP response is flushed.
    // The Redis queue worker is not yet implemented for standard node types (google_sheets, gmail, etc.),
    // so we fire the existing synchronous execute-workflow engine as a detached background task.
    // execute-workflow.ts detects the existing executionId via the resume path and runs all nodes.
    setImmediate(async () => {
      try {
        console.log(`[DistributedExecute] 🔵 Starting background execution for ${executionId}`);
        const { default: executeWorkflow } = await import('./execute-workflow');
        await executeWorkflow(
          {
            body: { workflowId, executionId, input },
            headers: { authorization: authHeader },
          } as any,
          {
            json: () => {},
            status: () => ({ json: () => {} }),
            set: () => {},
            setHeader: () => {},
          } as any
        );
        console.log(`[DistributedExecute] ✅ Background execution finished for ${executionId}`);
      } catch (bgErr: any) {
        console.error(`[DistributedExecute] ❌ Background execution failed for ${executionId}:`, bgErr?.message);
        try {
          await supabase
            .from('executions')
            .update({
              status: 'failed',
              error: bgErr?.message || String(bgErr),
              finished_at: new Date().toISOString(),
            })
            .eq('id', executionId)
            .eq('status', 'running');
        } catch (_) {}
      }
    });
  } catch (error: any) {
    console.error('[DistributedExecuteWorkflow] ❌ Error:', error);
    
    // ✅ CRITICAL: Release lock on error if execution was created
    if (workflowId) {
      try {
        const { data: workflow } = await supabase
          .from('workflows')
          .select('active_execution_id')
          .eq('id', workflowId)
          .single();
        
        if (workflow?.active_execution_id) {
          const { releaseExecutionLock } = await import('../services/execution/execution-lock');
          await releaseExecutionLock(supabase, workflowId, workflow.active_execution_id);
        }
      } catch (cleanupError) {
        console.error('[DistributedExecuteWorkflow] Failed to cleanup on error:', cleanupError);
      }
    }
    
    res.status(500).json({
      error: error.message || 'Failed to start workflow execution',
      details: error.stack,
    });
  }
}

/**
 * Get execution status
 * 
 * GET /api/execution-status/:executionId
 */
export async function getExecutionStatus(
  req: Request,
  res: Response
): Promise<void> {
  const supabase = getDbClient();
  const { executionId } = req.params;
  const lite = String(req.query.lite || '').toLowerCase() === '1' || String(req.query.lite || '').toLowerCase() === 'true';

  try {
    // Get execution
    const { data: execution, error: execError } = await supabase
      .from('executions')
      .select(lite
        // Bug 2 fix: use the actual column names written by execute-workflow.ts.
        // 'finished_at' (not 'completed_at') and 'error' (not 'error_message').
        ? 'id, workflow_id, status, current_node, started_at, finished_at, error'
        : '*')
      .eq('id', executionId)
      .single();

    if (execError || !execution) {
      res.status(404).json({ error: 'Execution not found' });
      return;
    }

    // Get execution steps
    const { data: steps, error: stepsError } = await supabase
      .from('execution_steps')
      .select(lite
        // Include input_json and output_json even in lite mode so the frontend can
        // render the node-by-node data flow (input → output) during live polling.
        ? 'id, node_id, node_name, node_type, status, error, sequence, started_at, completed_at, input_json, output_json'
        : '*')
      .eq('execution_id', executionId)
      .order('sequence', { ascending: true });

    if (stepsError) {
      console.error('[GetExecutionStatus] Error fetching steps:', stepsError);
    }

    const response: Record<string, unknown> = {
      execution_id: executionId,
      status: execution.status,
      workflow_id: execution.workflow_id,
      current_node: execution.current_node,
      started_at: execution.started_at,
      // Bug 2 fix: map finished_at → completed_at so the frontend's isTerminalStatus check works.
      // execute-workflow.ts writes 'finished_at'; expose it as 'completed_at' for the polling client.
      completed_at: execution.finished_at ?? execution.completed_at ?? null,
      // Bug 2 fix: read 'error' column (not 'error_message') — that's what execute-workflow.ts writes.
      error: execution.error ?? execution.error_message ?? null,
      steps: steps || [],
      progress: {
        total: steps?.length || 0,
        completed: steps?.filter((s: any) => s.status === 'completed' || s.status === 'success').length || 0,
        failed: steps?.filter((s: any) => s.status === 'failed').length || 0,
        running: steps?.filter((s: any) => s.status === 'running').length || 0,
        pending: steps?.filter((s: any) => s.status === 'pending').length || 0,
      },
    };
    if (!lite) {
      response.execution = execution;
    }
    res.json(response);
  } catch (error: any) {
    console.error('[GetExecutionStatus] ❌ Error:', error);
    res.status(500).json({
      error: error.message || 'Failed to get execution status',
    });
  }
}
