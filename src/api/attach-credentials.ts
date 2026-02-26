/**
 * Attach Credentials API Endpoint
 * 
 * This endpoint is called AFTER workflow generation to inject credentials into nodes.
 * 
 * Flow:
 * 1. User submits prompt
 * 2. Backend generates workflow graph
 * 3. Backend returns graph + required credentials
 * 4. Frontend shows credential modal
 * 5. User submits credentials → THIS ENDPOINT
 * 6. Backend injects credentials into nodes
 * 7. Frontend shows "View Workflow"
 */

import { Request, Response } from 'express';
import { getSupabaseClient } from '../core/database/supabase-compat';
import { workflowLifecycleManager } from '../services/workflow-lifecycle-manager';
import { normalizeWorkflowGraph, validateNormalizedGraph } from '../core/utils/workflow-graph-normalizer';
import { ErrorCode, createError } from '../core/utils/error-codes';

export default async function attachCredentialsHandler(req: Request, res: Response) {
  try {
    // ✅ CRITICAL: Get workflowId from URL params (not body)
    const workflowId = req.params.workflowId || req.body.workflowId;
    const { credentials } = req.body;

    if (!workflowId) {
      return res.status(400).json(
        createError(
          ErrorCode.WORKFLOW_NOT_FOUND,
          'workflowId is required',
          { workflowId: null }
        )
      );
    }

    // ✅ CRITICAL: Allow empty credentials object (workflow may not need credentials)
    if (credentials === null || credentials === undefined) {
      return res.status(400).json(
        createError(
          ErrorCode.INVALID_CREDENTIAL_FORMAT,
          'credentials object is required (can be empty object {})',
          { received: typeof credentials, expected: 'object', workflowId }
        )
      );
    }
    
    if (typeof credentials !== 'object') {
      return res.status(400).json(
        createError(
          ErrorCode.INVALID_CREDENTIAL_FORMAT,
          'credentials must be an object',
          { received: typeof credentials, expected: 'object', workflowId }
        )
      );
    }
    
    // Empty credentials object is valid (workflow may not need credentials)
    console.log(`[AttachCredentials] Received ${Object.keys(credentials).length} credential(s) for workflow ${workflowId}`);

    // Get current user
    const supabase = getSupabaseClient();
    const authHeader = req.headers.authorization;
    let userId: string | undefined;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.replace('Bearer ', '').trim();
      if (token) {
        try {
          const { data: { user }, error: authError } = await supabase.auth.getUser(token);
          if (!authError && user) {
            userId = user.id;
          }
        } catch (authErr) {
          console.warn('[AttachCredentials] Auth error (non-fatal):', authErr);
        }
      }
    }

    // Fetch workflow
    const { data: workflow, error: workflowError } = await supabase
      .from('workflows')
      .select('*')
      .eq('id', workflowId)
      .single();

    if (workflowError || !workflow) {
      console.error('[AttachCredentials] Workflow fetch error:', workflowError);
      return res.status(404).json(
        createError(
          ErrorCode.WORKFLOW_NOT_FOUND,
          'Workflow not found',
          { workflowId, error: workflowError?.message }
        )
      );
    }

    // Verify user owns the workflow (if userId available)
    if (userId && workflow.user_id !== userId) {
      return res.status(403).json(
        createError(
          ErrorCode.UNAUTHORIZED,
          'You do not have permission to modify this workflow',
          { workflowId, userId }
        )
      );
    }

    // ✅ CRITICAL: Phase locking - prevent duplicate attach calls
    // Check phase field first (for execution phases), then fall back to status (for lifecycle)
    const currentPhase = workflow.phase || workflow.status || 'draft';
    
    // ✅ PERMISSIVE: Allow credential attachment in almost all phases except locked ones
    // Only block if workflow is actively executing or archived
    const blockedPhases = ['executing', 'running', 'archived'];
    
    if (blockedPhases.includes(currentPhase)) {
      return res.status(409).json(
        createError(
          ErrorCode.PHASE_LOCKED,
          'Workflow not in credential configuration phase',
          { 
            currentPhase,
            workflowId,
            message: 'Workflow is executing or archived. Cannot attach credentials.',
          },
          true // Recoverable - user can refresh
        )
      );
    }
    
    // ✅ PERMISSIVE: Allow credential attachment in all other phases
    // This includes: draft, active, ready, configuring_*, discover_*, complete, completed, etc.
    // Log the phase for debugging but don't block
    console.log(`[AttachCredentials] ✅ Allowing credential attachment in phase: ${currentPhase}`);

    // Update phase to configuring_credentials (idempotent)
    await supabase
      .from('workflows')
      .update({
        status: 'configuring_credentials',
        updated_at: new Date().toISOString(),
      })
      .eq('id', workflowId);

    // ✅ CRITICAL: Use canonical normalization (same as save/attach-inputs/execute)
    // This ensures consistent graph structure across all operations
    const { normalizeWorkflowForSave } = await import('../core/validation/workflow-save-validator');
    const workflowGraph = workflow.graph || { nodes: workflow.nodes || [], edges: workflow.edges || [] };
    const normalized = normalizeWorkflowForSave(workflowGraph.nodes || [], workflowGraph.edges || []);
    
    // ✅ TELEMETRY: Log normalization fixes
    if (normalized.migrationsApplied.length > 0) {
      console.log('[AttachCredentials] 🔄 Normalization applied:', {
        workflowId,
        migrationsApplied: normalized.migrationsApplied,
        originalNodeCount: (workflowGraph.nodes || []).length,
        normalizedNodeCount: normalized.nodes.length,
        originalEdgeCount: (workflowGraph.edges || []).length,
        normalizedEdgeCount: normalized.edges.length,
      });
    }
    
    // ✅ CRITICAL: Validate normalized graph structure
    const { normalizeWorkflowGraph, validateNormalizedGraph } = await import('../core/utils/workflow-graph-normalizer');
    let normalizedGraph: ReturnType<typeof normalizeWorkflowGraph>;
    try {
      normalizedGraph = normalizeWorkflowGraph({ nodes: normalized.nodes, edges: normalized.edges });
      const validation = validateNormalizedGraph(normalizedGraph);
      if (!validation.valid) {
        return res.status(400).json(
          createError(
            ErrorCode.GRAPH_INVALID_STRUCTURE,
            'Workflow graph validation failed',
            { errors: validation.errors, warnings: validation.warnings, workflowId }
          )
        );
      }
    } catch (error) {
      return res.status(400).json(
        createError(
          ErrorCode.GRAPH_PARSE_ERROR,
          'Failed to normalize workflow graph',
          { error: error instanceof Error ? error.message : String(error), workflowId }
        )
      );
    }

    // ✅ CRITICAL: Check which credentials are already satisfied in vault
    // Skip injection for satisfied OAuth credentials (already connected)
    const { credentialDiscoveryPhase } = await import('../services/ai/credential-discovery-phase');
    const credentialDiscovery = await credentialDiscoveryPhase.discoverCredentials(
      { nodes: normalizedGraph.nodes, edges: normalizedGraph.edges },
      userId
    );
    
    // Filter out satisfied credentials - they don't need injection
    // ✅ Allow object credentials (e.g., SMTP host/user/pass/port bundle)
    const credentialsToInject: Record<string, string | Record<string, any>> = {};
    const satisfiedVaultKeys = new Set(
      (credentialDiscovery.satisfiedCredentials || []).map(c => c.vaultKey.toLowerCase())
    );
    
    for (const [key, value] of Object.entries(credentials)) {
      const normalizedKey = key.toLowerCase();
      // Skip if this credential is already satisfied in vault
      if (satisfiedVaultKeys.has(normalizedKey)) {
        console.log(`[AttachCredentials] Skipping ${key} - already satisfied in vault`);
        continue;
      }

      // ✅ SMTP: Accept JSON string or object
      if (normalizedKey === 'smtp') {
        if (typeof value === 'string') {
          const trimmed = value.trim();
          if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
            try {
              const parsed = JSON.parse(trimmed);
              if (parsed && typeof parsed === 'object') {
                credentialsToInject[key] = parsed as Record<string, any>;
                continue;
              }
            } catch {
              // fall through to keep string
            }
          }
        } else if (value && typeof value === 'object') {
          credentialsToInject[key] = value as Record<string, any>;
          continue;
        }
      }

      // Default: allow string credentials, and also allow objects (for future connectors)
      if (typeof value === 'string') {
        credentialsToInject[key] = value;
      } else if (value && typeof value === 'object') {
        credentialsToInject[key] = value as Record<string, any>;
      } else {
        console.warn(`[AttachCredentials] Skipping ${key} - unsupported credential value type: ${typeof value}`);
      }
    }
    
    // ✅ CRITICAL: Idempotent credential injection - merge with existing
    // If no credentials to inject, use existing workflow graph
    let finalNormalizedGraph: ReturnType<typeof normalizeWorkflowGraph>;
    let injectionResult: any;
    
    if (Object.keys(credentialsToInject).length > 0) {
      console.log(`[AttachCredentials] Injecting ${Object.keys(credentialsToInject).length} credential(s) into workflow ${workflowId}...`);
      injectionResult = await workflowLifecycleManager.injectCredentials(
        {
          nodes: normalizedGraph.nodes,
          edges: normalizedGraph.edges,
        },
        credentialsToInject
      );

      if (!injectionResult.success) {
        console.error('[AttachCredentials] ❌ Credential injection failed:', {
          workflowId,
          errors: injectionResult.errors,
          errorCount: injectionResult.errors?.length || 0,
        });
        return res.status(400).json(
          createError(
            ErrorCode.CREDENTIAL_INJECTION_FAILED,
            'Credential injection failed',
            {
              errors: injectionResult.errors,
              workflow: injectionResult.workflow, // Return workflow anyway for debugging
              workflowId,
            }
          )
        );
      }
      
      console.log('[AttachCredentials] ✅ Credential injection successful');

    // ✅ CRITICAL: Normalize workflow graph before saving (applies linearization)
    // This ensures single-trigger, single-chain structure is enforced
    finalNormalizedGraph = normalizeWorkflowGraph(injectionResult.workflow);
    
    console.log('[AttachCredentials] ✅ Graph linearized:', {
      nodeCount: finalNormalizedGraph.nodes.length,
      edgeCount: finalNormalizedGraph.edges.length,
      triggerNodes: finalNormalizedGraph.nodes.filter(n => {
        const category = n.data?.category || '';
        const nodeType = n.data?.type || n.type || '';
        return category.toLowerCase() === 'triggers' || 
               category.toLowerCase() === 'trigger' ||
               nodeType.includes('trigger') ||
               ['manual_trigger', 'webhook', 'schedule', 'interval', 'form', 'chat_trigger', 'workflow_trigger'].includes(nodeType);
      }).length,
    });
    } else {
      // No credentials to inject - use existing graph
      console.log(`[AttachCredentials] No credentials to inject - using existing workflow graph`);
      finalNormalizedGraph = normalizedGraph;
      injectionResult = {
        success: true,
        workflow: { nodes: normalizedGraph.nodes, edges: normalizedGraph.edges },
      };
    }
    
    // ✅ UNIFIED VALIDATION: Validate single trigger before saving
    const { validateWorkflowForSave } = await import('../core/validation/workflow-save-validator');
    const saveValidation = validateWorkflowForSave(
      finalNormalizedGraph.nodes,
      finalNormalizedGraph.edges
    );
    
    if (!saveValidation.canSave) {
      return res.status(400).json(
        createError(
          ErrorCode.INVALID_INPUT,
          'Workflow validation failed',
          {
            errors: saveValidation.errors,
            warnings: saveValidation.warnings,
            workflowId,
            hint: 'Please fix the validation errors before attaching credentials.',
          }
        )
      );
    }
    
    // Validate workflow is ready for execution
    // Use finalNormalizedGraph which has the correct structure
    const validationResult = await workflowLifecycleManager.validateExecutionReady(
      { nodes: finalNormalizedGraph.nodes, edges: finalNormalizedGraph.edges },
      userId
    );

    // ✅ CRITICAL: Determine final status BEFORE updating
    // Use 'active' for status (enum) and phase values for execution readiness (TEXT)
    const finalStatus = 'active'; // Always use valid enum value
    const finalPhase = validationResult.ready ? 'ready_for_execution' : 'configuring_credentials';

    // ✅ CRITICAL: Update workflow graph AND status in a single atomic operation
    // Also sync phase field if it exists (for backward compatibility)
    // Note: Database uses 'nodes' and 'edges' columns, not 'graph'
    const { data: updateData, error: updateError } = await supabase
      .from('workflows')
      .update({
        nodes: finalNormalizedGraph.nodes,
        edges: finalNormalizedGraph.edges,
        status: finalStatus, // ✅ CRITICAL: Use valid enum value ('active')
        phase: finalPhase, // ✅ CRITICAL: Use TEXT field for execution phase
        updated_at: new Date().toISOString(),
      })
      .eq('id', workflowId)
      .select('id, status, phase, nodes, edges')
      .single();

    if (updateError) {
      console.error('[AttachCredentials] ❌ Workflow update error:', {
        workflowId,
        error: updateError.message,
        errorCode: updateError.code,
        errorDetails: updateError.details,
      });
      return res.status(500).json(
        createError(
          ErrorCode.INTERNAL_ERROR,
          'Failed to update workflow',
          { error: updateError.message, workflowId }
        )
      );
    }

    // ✅ CRITICAL: Verify status was actually persisted
    if (!updateData || updateData.status !== finalStatus || updateData.phase !== finalPhase) {
      console.error('[AttachCredentials] ❌ Status update did not persist:', {
        workflowId,
        expectedStatus: finalStatus,
        expectedPhase: finalPhase,
        actualStatus: updateData?.status,
        actualPhase: updateData?.phase,
      });
      return res.status(500).json(
        createError(
          ErrorCode.INTERNAL_ERROR,
          'Workflow status update did not persist',
          {
            workflowId,
            expectedStatus: finalStatus,
            expectedPhase: finalPhase,
            actualStatus: updateData?.status,
            actualPhase: updateData?.phase,
          }
        )
      );
    }

    console.log(`[AttachCredentials] ✅ Workflow updated - graph saved, status set to ${finalStatus}, phase set to ${finalPhase} for workflow ${workflowId}`);

    // ✅ AUTO-RUN: If workflow is ready, mark it for auto-execution
    if (validationResult.ready) {
      console.log(`[AttachCredentials] ✅ Workflow ${workflowId} marked as ready_for_execution - will auto-run`);

      // ✅ CRITICAL: Audit trail - log credentials attached and ready events
      try {
        await supabase
          .from('workflow_events')
          .insert([
            {
              workflow_id: workflowId,
              event_type: 'CREDS_ATTACHED',
              event_data: {
                credentialsCount: Object.keys(credentialsToInject).length,
                satisfiedCount: Object.keys(credentials).length - Object.keys(credentialsToInject).length,
              },
              created_at: new Date().toISOString(),
            },
            {
              workflow_id: workflowId,
              event_type: 'READY',
              event_data: {
                ready: true,
                autoRun: true,
                inputsAttached: true,
                credentialsAttached: true,
              },
              created_at: new Date().toISOString(),
            },
          ]);
      } catch (auditError) {
        console.warn('[AttachCredentials] Failed to log audit events:', auditError);
      }
    } else {
      // ✅ CRITICAL: Audit trail - log credentials attached even if not ready
      try {
        await supabase
          .from('workflow_events')
          .insert({
            workflow_id: workflowId,
            event_type: 'CREDS_ATTACHED',
            event_data: {
              credentialsCount: Object.keys(credentialsToInject).length,
              satisfiedCount: Object.keys(credentials).length - Object.keys(credentialsToInject).length,
              ready: false,
              missingCredentials: validationResult.missingCredentials,
            },
            created_at: new Date().toISOString(),
          });
      } catch (auditError) {
        console.warn('[AttachCredentials] Failed to log audit event:', auditError);
      }
    }

    return res.json({
      success: true,
      workflow: { nodes: finalNormalizedGraph.nodes, edges: finalNormalizedGraph.edges },
      validation: {
        ready: validationResult.ready,
        errors: validationResult.errors,
        missingCredentials: validationResult.missingCredentials,
      },
      autoRun: validationResult.ready, // Signal frontend to auto-run
      message: validationResult.ready
        ? 'Credentials attached successfully. Workflow is ready for execution and will auto-run.'
        : 'Credentials attached, but workflow is not ready for execution. Missing credentials: ' +
          validationResult.missingCredentials.join(', '),
    });
  } catch (error) {
    console.error('[AttachCredentials] Error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
