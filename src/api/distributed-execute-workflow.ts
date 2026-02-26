/**
 * Distributed Execute Workflow API
 * 
 * New API endpoint that uses the distributed workflow engine.
 * This replaces the old synchronous execute-workflow.ts with queue-based execution.
 */

import { Request, Response } from 'express';
import { getSupabaseClient } from '../core/database/supabase-compat';
import { DistributedOrchestrator } from '../services/workflow-executor/distributed/distributed-orchestrator';
import { QueueClient, createQueueClient } from '../services/workflow-executor/distributed/queue-client';
import { StorageManager } from '../services/workflow-executor/distributed/storage-manager';
import { createObjectStorageService } from '../services/workflow-executor/object-storage-service';
import { ErrorCode } from '../core/utils/error-codes';

/**
 * Normalize If/Else node conditions field
 * Converts string or object formats to the expected array format
 */
function normalizeIfElseConditions(config: Record<string, unknown>): Record<string, unknown> {
  const normalized = { ...config };
  
  if (config.condition && !config.conditions) {
    // Old format: condition (string) -> convert to conditions array
    const conditionStr = typeof config.condition === 'string' ? config.condition : String(config.condition);
    if (conditionStr.trim()) {
      normalized.conditions = [{ expression: conditionStr.trim() }];
    }
  } else if (config.conditions && !Array.isArray(config.conditions)) {
    // Handle case where conditions is sent as string or object
    if (typeof config.conditions === 'string') {
      normalized.conditions = [{ expression: config.conditions }];
    } else if (typeof config.conditions === 'object' && config.conditions !== null) {
      const conditionsObj = config.conditions as Record<string, unknown>;
      if (conditionsObj.expression) {
        // Single condition object - wrap in array
        normalized.conditions = [config.conditions];
      }
    }
  }
  
  return normalized;
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
  const supabase = getSupabaseClient();
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

    // ✅ CRITICAL: Validate workflow is ready for execution (same logic as execute-workflow)
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

    const workflowForValidation = { nodes, edges };
    const executionValidation = await workflowLifecycleManager.validateExecutionReady(
      workflowForValidation,
      currentUserId
    );

    const workflowStatus = workflow.status || 'draft';
    const workflowPhase = workflow.phase || workflow.status || 'draft'; // Use phase for execution readiness
    const credentialDiscovery = await credentialDiscoveryPhase.discoverCredentials(
      { nodes, edges },
      currentUserId
    );
    const requiredCredentialsCount = credentialDiscovery.requiredCredentials?.length || 0;
    const missingCredentialsCount = credentialDiscovery.missingCredentials?.length || 0;
    
    const nodeInputs = workflowLifecycleManager.discoverNodeInputs({ nodes, edges });
    
    // ✅ FIX: Also check for type mismatches in required fields
    // discoverNodeInputs only adds fields that are missing, but we need to check
    // if existing fields have the correct type (e.g., conditions should be array, not string)
    const { nodeDefinitionRegistry } = await import('../core/types/node-definition');
    const typeMismatchInputs: typeof nodeInputs.inputs = [];
    
    for (const node of nodes) {
      const nodeType = node.data?.type || node.type;
      const definition = nodeDefinitionRegistry.get(nodeType);
      if (!definition) continue;
      
      const config = node.data?.config || {};
      
      // ✅ FIX: Normalize If/Else conditions before validation
      const normalizedConfig = nodeType === 'if_else' 
        ? normalizeIfElseConditions(config)
        : config;
      
      // Check all required inputs for type mismatches
      for (const requiredField of definition.requiredInputs) {
        const value = normalizedConfig[requiredField];
        
        // Skip if value is missing (handled by discoverNodeInputs)
        if (value === undefined || value === null || value === '') {
          continue;
        }
        
        // Check if value matches expected type from schema
        const fieldSchema = definition.inputSchema[requiredField];
        if (fieldSchema) {
          const expectedType = fieldSchema.type;
          let typeMismatch = false;
          
          if (expectedType === 'array' && !Array.isArray(value)) {
            typeMismatch = true;
          } else if (expectedType === 'string' && typeof value !== 'string') {
            typeMismatch = true;
          } else if (expectedType === 'number' && typeof value !== 'number') {
            typeMismatch = true;
          } else if (expectedType === 'boolean' && typeof value !== 'boolean') {
            typeMismatch = true;
          } else if (expectedType === 'object' && (typeof value !== 'object' || Array.isArray(value) || value === null)) {
            typeMismatch = true;
          }
          
          if (typeMismatch) {
            // Find the input info from nodeInputs or create a synthetic one
            const existingInput = nodeInputs.inputs.find(i => i.nodeId === node.id && i.fieldName === requiredField);
            if (existingInput) {
              typeMismatchInputs.push(existingInput);
            } else {
              // Create synthetic input info for type mismatch
              typeMismatchInputs.push({
                nodeId: node.id,
                nodeType,
                nodeLabel: node.data?.label || node.id,
                fieldName: requiredField,
                fieldType: expectedType,
                description: fieldSchema.description || requiredField,
                required: true,
              });
            }
          }
        }
      }
    }
    
    const missingInputs = nodeInputs.inputs.filter(input => {
      const node = nodes.find(n => n.id === input.nodeId);
      if (!node) return true;
      const config = node.data?.config || {};
      
      // ✅ FIX: Normalize If/Else conditions before validation
      // Frontend may send conditions as string, but backend expects array
      const normalizedConfig = node.data?.type === 'if_else' 
        ? normalizeIfElseConditions(config)
        : config;
      
      const value = normalizedConfig[input.fieldName];
      
      // For array fields (like conditions), check if it's a valid non-empty array
      if (input.fieldType === 'array') {
        return input.required && (!Array.isArray(value) || value.length === 0);
      }
      
      return input.required && (!value || value === '' || value === null || value === undefined);
    });
    
    // Combine missing inputs and type mismatch inputs
    const allMissingInputs = [...missingInputs, ...typeMismatchInputs];

    const readinessCheck = {
      workflowId,
      phase: workflowPhase,
      status: workflowStatus,
      requiredCredentialsCount,
      missingCredentialsCount,
      missingInputsCount: allMissingInputs.length,
      executionValidationReady: executionValidation.ready,
      executionValidationErrors: executionValidation.errors,
      executionValidationMissingCredentials: executionValidation.missingCredentials,
    };

    console.log('[DistributedExecuteWorkflow] Readiness check:', JSON.stringify(readinessCheck, null, 2));

    // ✅ CRITICAL: Same readiness checks as execute-workflow - check phase field, not status
    const isStatusReady = workflowPhase === 'ready_for_execution' || workflowPhase === 'executing';
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

    // ✅ CRITICAL: Distributed execution locking - prevent double runs
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

    // Start execution (returns immediately - workflow continues via queue)
    // Note: orchestrator.startExecution creates the execution record
    const executionId = await orchestrator.startExecution(workflowId, input);

    // ✅ CRITICAL: Acquire distributed execution lock (atomic)
    const lockResult = await acquireExecutionLock(supabase, workflowId, executionId);
    if (!lockResult.acquired) {
      // Clean up execution record
      await supabase.from('executions').delete().eq('id', executionId);
      await queue.close();
      
      res.status(409).json({
        code: ErrorCode.RUN_ALREADY_ACTIVE,
        error: 'Workflow already has an active execution',
        message: `Cannot start execution - workflow is locked by execution ${lockResult.existingExecutionId}`,
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

    // Return execution ID immediately
    res.json({
      success: true,
      execution_id: executionId,
      status: 'started',
      message: 'Workflow execution started. Use /api/execution-status/:id to check progress.',
    });

    // Close queue connection (orchestrator will handle its own connections)
    await queue.close();
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
  const supabase = getSupabaseClient();
  const { executionId } = req.params;

  try {
    // Get execution
    const { data: execution, error: execError } = await supabase
      .from('executions')
      .select('*')
      .eq('id', executionId)
      .single();

    if (execError || !execution) {
      res.status(404).json({ error: 'Execution not found' });
      return;
    }

    // Get execution steps
    const { data: steps, error: stepsError } = await supabase
      .from('execution_steps')
      .select('*')
      .eq('execution_id', executionId)
      .order('sequence', { ascending: true });

    if (stepsError) {
      console.error('[GetExecutionStatus] Error fetching steps:', stepsError);
    }

    res.json({
      execution_id: executionId,
      status: execution.status,
      workflow_id: execution.workflow_id,
      current_node: execution.current_node,
      started_at: execution.started_at,
      completed_at: execution.completed_at,
      error: execution.error || execution.error_message,
      steps: steps || [],
      progress: {
        total: steps?.length || 0,
        completed: steps?.filter(s => s.status === 'completed').length || 0,
        failed: steps?.filter(s => s.status === 'failed').length || 0,
        running: steps?.filter(s => s.status === 'running').length || 0,
        pending: steps?.filter(s => s.status === 'pending').length || 0,
      },
    });
  } catch (error: any) {
    console.error('[GetExecutionStatus] ❌ Error:', error);
    res.status(500).json({
      error: error.message || 'Failed to get execution status',
    });
  }
}
