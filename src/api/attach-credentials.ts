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
import { createHash } from 'crypto';
import { getSupabaseClient } from '../core/database/supabase-compat';
import { workflowLifecycleManager } from '../services/workflow-lifecycle-manager';
import { ErrorCode, createError } from '../core/utils/error-codes';
import { validateStructuralReadiness } from '../core/validation/workflow-save-validator';
import {
  diffWorkflowTopology,
  fingerprintWorkflowTopology,
  type WorkflowTopologyFingerprint,
} from '../core/utils/workflow-topology-fingerprint';
import { unifiedNodeRegistry } from '../core/registry/unified-node-registry';
import { isCredentialOwnership } from '../core/utils/field-ownership';

/** Wizard sends `cred_<nodeId>_<fieldName>` — allow through vault-key filter; injectCredentials maps per node. */
function credentialPayloadKeyMatchesWorkflowNode(key: string, nodeIds: string[]): boolean {
  const kl = key.toLowerCase();
  if (!kl.startsWith('cred_')) return false;
  return nodeIds.some((id) => id && kl.startsWith(`cred_${id.toLowerCase()}_`));
}

function parseScopedCredentialField(
  key: string,
  nodeIds: string[]
): { nodeId: string; fieldName: string } | null {
  if (!key.toLowerCase().startsWith('cred_')) return null;
  const rest = key.substring('cred_'.length);
  for (const nodeId of nodeIds) {
    const prefix = `${nodeId}_`;
    if (rest.startsWith(prefix)) {
      return { nodeId, fieldName: rest.substring(prefix.length) };
    }
  }
  return null;
}

function validatePostFreezeGraphSafety(graph: { nodes: any[]; edges: any[] }): string[] {
  const errors: string[] = [];
  const nodes = Array.isArray(graph.nodes) ? graph.nodes : [];
  const edges = Array.isArray(graph.edges) ? graph.edges : [];
  const nodeIds = new Set(nodes.map((n: any) => String(n?.id || '')).filter(Boolean));

  if (nodeIds.size === 0) {
    errors.push('Workflow has no nodes.');
    return errors;
  }

  const triggerNodes = nodes.filter((n: any) => {
    const category = String(n?.data?.category || '').toLowerCase();
    const nodeType = String(n?.data?.type || n?.type || '');
    return (
      category === 'trigger' ||
      category === 'triggers' ||
      nodeType.includes('trigger') ||
      ['manual_trigger', 'webhook', 'schedule', 'interval', 'form', 'chat_trigger', 'workflow_trigger'].includes(nodeType)
    );
  });
  if (triggerNodes.length !== 1) {
    errors.push(`Workflow must have exactly one trigger (found ${triggerNodes.length}).`);
  }

  for (const edge of edges) {
    const source = String(edge?.source || '');
    const target = String(edge?.target || '');
    if (!source || !target) {
      errors.push('Edge missing source or target.');
      continue;
    }
    if (!nodeIds.has(source) || !nodeIds.has(target)) {
      errors.push(`Edge references missing node(s): ${source} -> ${target}`);
    }
    if (source === target) {
      errors.push(`Self-loop edge detected at node ${source}`);
    }
  }

  return errors;
}

function sortObjectKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortObjectKeysDeep);
  }
  if (value && typeof value === 'object') {
    const input = value as Record<string, unknown>;
    const sortedKeys = Object.keys(input).sort((a, b) => a.localeCompare(b));
    const normalized: Record<string, unknown> = {};
    for (const key of sortedKeys) {
      normalized[key] = sortObjectKeysDeep(input[key]);
    }
    return normalized;
  }
  return value;
}

function fingerprintCredentialsPayload(credentials: Record<string, unknown>): string {
  const canonical = JSON.stringify(sortObjectKeysDeep(credentials));
  return createHash('sha256').update(canonical).digest('hex');
}

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
    const payloadFingerprint = fingerprintCredentialsPayload(credentials as Record<string, unknown>);
    
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
    const previousAttachCredentials = (workflow as any)?.metadata?.attachCredentials;
    const previousPayloadFingerprint =
      previousAttachCredentials && typeof previousAttachCredentials === 'object'
        ? (previousAttachCredentials as any).lastPayloadFingerprint
        : undefined;
    const isDuplicateReadyRequest =
      Boolean((workflow as any)?.metadata?.freezeBoundary?.frozen) &&
      currentPhase === 'ready_for_execution' &&
      typeof previousPayloadFingerprint === 'string' &&
      previousPayloadFingerprint === payloadFingerprint;
    
    // ✅ PHASE GUARD: credentials can be attached only after attach-inputs establishes freeze boundary.
    // Supported phases are:
    // - ready_for_ownership (primary credential entry point)
    // - configuring_credentials (retry path when credential requirements remain unresolved)
    const blockedPhases = ['executing', 'running', 'archived'];
    const allowedCredentialPhases = new Set(['ready_for_ownership', 'configuring_credentials']);

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
          true
        )
      );
    }

    // Idempotent no-op: when already ready_for_execution and payload is unchanged,
    // return success instead of failing phase guard. This avoids client retries causing 409.
    if (isDuplicateReadyRequest || (currentPhase === 'ready_for_execution' && Object.keys(credentials || {}).length === 0)) {
      return res.status(200).json({
        success: true,
        workflowId,
        status: workflow.status || 'active',
        phase: currentPhase,
        message: 'Workflow already ready for execution; no credential changes applied.',
      });
    }

    if (!allowedCredentialPhases.has(currentPhase)) {
      return res.status(409).json(
        createError(
          ErrorCode.INVALID_PHASE,
          'Workflow is not in a credential-configuration phase',
          {
            currentPhase,
            workflowId,
            requiredPhases: Array.from(allowedCredentialPhases),
            message: `Workflow phase is "${currentPhase}" but must be one of: ${Array.from(allowedCredentialPhases).join(', ')}. Call attach-inputs first.`,
          },
          true
        )
      );
    }

    console.log(`[AttachCredentials] ✅ Phase check passed: ${currentPhase}`);

    // Phase transitions are decided after readiness validation (no eager phase mutation).

    // Post-freeze: keep graph immutable (no rewiring/normalization). Only run lightweight safety checks.
    const workflowGraph = workflow.graph || { nodes: workflow.nodes || [], edges: workflow.edges || [] };
    const parsedNodes = typeof workflowGraph.nodes === 'string' ? JSON.parse(workflowGraph.nodes) : workflowGraph.nodes;
    const parsedEdges = typeof workflowGraph.edges === 'string' ? JSON.parse(workflowGraph.edges) : workflowGraph.edges;
    const freezeBoundary = (workflow as any)?.metadata?.freezeBoundary || null;
    if (!freezeBoundary?.frozen) {
      return res.status(409).json(
        createError(
          ErrorCode.INVALID_PHASE,
          'Workflow is not frozen for ownership yet. Run attach-inputs first.',
          { workflowId, currentPhase, requiredPhase: 'ready_for_ownership' },
          true
        )
      );
    }
    const workflowGraphReconciled = {
      nodes: Array.isArray(parsedNodes) ? parsedNodes : [],
      edges: Array.isArray(parsedEdges) ? parsedEdges : [],
    };
    const structuralReadiness = validateStructuralReadiness((workflowGraphReconciled as any).nodes || [], { strict: true });
    if (structuralReadiness.errors.length > 0) {
      return res.status(409).json(
        createError(
          ErrorCode.INVALID_PHASE,
          'Structural inputs are incomplete. Attach inputs before credentials.',
          {
            workflowId,
            phase: 'configuring_inputs',
            structuralErrors: structuralReadiness.errors,
          },
          true
        )
      );
    }
    const lightweightSafetyErrors = validatePostFreezeGraphSafety({
      nodes: workflowGraphReconciled.nodes || [],
      edges: workflowGraphReconciled.edges || [],
    });
    if (lightweightSafetyErrors.length > 0) {
      return res.status(400).json(
        createError(
          ErrorCode.GRAPH_INVALID_STRUCTURE,
          'Workflow graph failed post-freeze safety checks',
          { errors: lightweightSafetyErrors, workflowId }
        )
      );
    }
    let normalizedGraph: { nodes: any[]; edges: any[] };
    let baselineTopologyFingerprint!: WorkflowTopologyFingerprint;
    try {
      normalizedGraph = {
        nodes: workflowGraphReconciled.nodes || [],
        edges: workflowGraphReconciled.edges || [],
      };
      baselineTopologyFingerprint = fingerprintWorkflowTopology(
        normalizedGraph.nodes,
        normalizedGraph.edges
      );
      console.log('[AttachCredentials] 📌 Baseline topology fingerprint:', {
        workflowId,
        fingerprint: baselineTopologyFingerprint.fingerprint,
        nodeCount: baselineTopologyFingerprint.nodeIdsSorted.length,
        edgeCount: baselineTopologyFingerprint.edgeKeysSorted.length,
      });
    } catch (error) {
      return res.status(400).json(
        createError(
          ErrorCode.GRAPH_PARSE_ERROR,
          'Failed to normalize workflow graph',
          { error: error instanceof Error ? error.message : String(error), workflowId }
        )
      );
    }

    // Same graph as this handler's reconcile + normalize (not a DB reload — row may still list stale types).
    const { credentialDiscoveryPhase } = await import('../services/ai/credential-discovery-phase');
    const credentialDiscovery = await credentialDiscoveryPhase.discoverCredentials(
      {
        nodes: normalizedGraph.nodes as any,
        edges: normalizedGraph.edges as any,
      } as any,
      userId
    );
    
    // Filter out satisfied credentials - they don't need injection
    // ✅ Allow object credentials (e.g., SMTP host/user/pass/port bundle)
    const credentialsToInject: Record<string, string | Record<string, any>> = {};
    const rejectedCredentialKeys: string[] = [];
    const satisfiedVaultKeys = new Set(
      (credentialDiscovery.satisfiedCredentials || []).map(c => c.vaultKey.toLowerCase())
    );
    const allowedVaultKeys = new Set(
      (credentialDiscovery.requiredCredentials || []).map(c => String(c.vaultKey || '').toLowerCase()).filter(Boolean)
    );
    const graphNodeIds = (normalizedGraph.nodes || []).map((n: any) => String(n?.id || '')).filter(Boolean);

    for (const [key, value] of Object.entries(credentials)) {
      const normalizedKey = key.toLowerCase();
      const nodeScopedCred = credentialPayloadKeyMatchesWorkflowNode(key, graphNodeIds);
      const scoped = parseScopedCredentialField(key, graphNodeIds);
      if (!allowedVaultKeys.has(normalizedKey) && !nodeScopedCred) {
        console.warn(`[AttachCredentials] Rejected unknown/non-credential key "${key}"`);
        rejectedCredentialKeys.push(key);
        continue;
      }
      if (scoped) {
        const node = (normalizedGraph.nodes || []).find((n: any) => String(n?.id || '') === scoped.nodeId);
        const nodeType = String(node?.data?.type || node?.type || '');
        const fieldDef = unifiedNodeRegistry.get(nodeType)?.inputSchema?.[scoped.fieldName];
        if (!fieldDef || !isCredentialOwnership(scoped.fieldName, fieldDef)) {
          rejectedCredentialKeys.push(key);
          continue;
        }
      }
      // Skip if this credential is already satisfied in vault (vault keys only — node-scoped answers always apply)
      if (!nodeScopedCred && satisfiedVaultKeys.has(normalizedKey)) {
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

    if (rejectedCredentialKeys.length > 0) {
      return res.status(400).json(
        createError(
          ErrorCode.INVALID_CREDENTIAL_FORMAT,
          'One or more provided credential keys are invalid for this workflow.',
          {
            workflowId,
            rejectedKeys: rejectedCredentialKeys,
            allowedCredentialKeys: Array.from(allowedVaultKeys),
          },
          true
        )
      );
    }
    
    // ✅ CRITICAL: Idempotent credential injection - merge with existing
    // If no credentials to inject, use existing workflow graph
    let finalNormalizedGraph: { nodes: any[]; edges: any[] };
    let injectionResult: any;
    
    if (Object.keys(credentialsToInject).length > 0) {
      console.log(`[AttachCredentials] Injecting ${Object.keys(credentialsToInject).length} credential(s) into workflow ${workflowId}...`);
      injectionResult = await workflowLifecycleManager.injectCredentials(
        {
          nodes: normalizedGraph.nodes,
          edges: normalizedGraph.edges,
        },
        credentialsToInject,
        userId
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

    // Post-freeze graph must remain topology-equivalent.
    finalNormalizedGraph = {
      nodes: injectionResult.workflow?.nodes || [],
      edges: injectionResult.workflow?.edges || [],
    };

    console.log('[AttachCredentials] ✅ Graph normalized (topologyPreserve):', {
      nodeCount: finalNormalizedGraph.nodes.length,
      edgeCount: finalNormalizedGraph.edges.length,
      triggerNodes: finalNormalizedGraph.nodes.filter((n: any) => {
        const category = n.data?.category || '';
        const nodeType = n.data?.type || n.type || '';
        return (
          category.toLowerCase() === 'triggers' ||
          category.toLowerCase() === 'trigger' ||
          nodeType.includes('trigger') ||
          [
            'manual_trigger',
            'webhook',
            'schedule',
            'interval',
            'form',
            'chat_trigger',
            'workflow_trigger',
          ].includes(nodeType)
        );
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
    
    const finalSafetyErrors = validatePostFreezeGraphSafety({
      nodes: finalNormalizedGraph.nodes,
      edges: finalNormalizedGraph.edges,
    });
    if (finalSafetyErrors.length > 0) {
      return res.status(400).json(
        createError(
          ErrorCode.INVALID_INPUT,
          'Workflow graph failed post-freeze safety checks',
          {
            errors: finalSafetyErrors,
            workflowId,
            hint: 'Please fix the graph safety issues before attaching credentials.',
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

    const finalTopologyFingerprint = fingerprintWorkflowTopology(
      finalNormalizedGraph.nodes,
      finalNormalizedGraph.edges
    );
    if (finalTopologyFingerprint.fingerprint !== baselineTopologyFingerprint.fingerprint) {
      const diff = diffWorkflowTopology(baselineTopologyFingerprint, finalTopologyFingerprint);
      console.error('[AttachCredentials] ❌ Topology mutation blocked:', { workflowId, diff });
      return res.status(409).json(
        createError(
          ErrorCode.TOPOLOGY_MUTATION_BLOCKED_ATTACH_CREDENTIALS,
          'Workflow topology must not change during credential attachment.',
          {
            workflowId,
            baselineFingerprint: baselineTopologyFingerprint.fingerprint,
            finalFingerprint: finalTopologyFingerprint.fingerprint,
            diff,
          },
          true
        )
      );
    }
    // Topology-only freeze: credential injection may update credentialId / vault-backed fields;
    // do not 409 on protected-config hash drift vs prior attach-inputs snapshot.

    // ✅ CRITICAL: Update workflow graph AND status in a single atomic operation
    // Also sync phase field if it exists (for backward compatibility)
    // Note: Database uses 'nodes' and 'edges' columns, not 'graph'
    const metadataToPersist = {
      ...(((workflow as any)?.metadata || {}) as Record<string, unknown>),
      attachCredentials: {
        ...(((workflow as any)?.metadata?.attachCredentials || {}) as Record<string, unknown>),
        lastPayloadFingerprint: payloadFingerprint,
        lastAppliedAt: new Date().toISOString(),
      },
    };

    const { data: updateData, error: updateError } = await supabase
      .from('workflows')
      .update({
        nodes: finalNormalizedGraph.nodes,
        edges: finalNormalizedGraph.edges,
        metadata: metadataToPersist,
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
