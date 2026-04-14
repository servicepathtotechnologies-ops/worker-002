/**
 * POST /api/workflows/:workflowId/configure
 * 
 * Accepts credentials and node inputs, validates them, stores them temporarily,
 * then triggers injection + AI auto-config + validation
 */

import { Request, Response } from 'express';
import { getSupabaseClient } from '../core/database/supabase-compat';
import { getUnifiedMissingItems } from '../services/ai/credential-input-discovery';
import { workflowLifecycleManager } from '../services/workflow-lifecycle-manager';
import { workflowValidator } from '../services/ai/workflow-validator';
import { Workflow } from '../core/types/ai-types';

export default async function configureWorkflowHandler(req: Request, res: Response) {
  try {
    const { workflowId } = req.params;
    const { credentials, inputs } = req.body;

    if (!workflowId) {
      return res.status(400).json({
        error: 'workflowId is required',
      });
    }

    console.log(`[ConfigureWorkflow] Configuring workflow ${workflowId}`);

    // Get current missing items to validate against
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
          console.warn('[ConfigureWorkflow] Auth error (non-fatal):', authErr);
        }
      }
    }

    const missingItems = await getUnifiedMissingItems(workflowId, userId);

    // Validate required credentials by credential id/vault key (not provider-level).
    // Provider-only checks are ambiguous when multiple credentials share the same provider.
    const missingCredentialKeys = missingItems.credentials
      .filter(cred => !cred.satisfied)
      .map(cred => String(cred.vaultKey || cred.provider))
      .filter(Boolean);
    const providedCredentialKeys = credentials ? Object.keys(credentials) : [];
    const missingCreds = missingCredentialKeys.filter(key => !providedCredentialKeys.includes(key));

    if (missingCreds.length > 0) {
      return res.status(400).json({
        error: 'Missing required credentials',
        missingCredentials: missingCreds,
        details: `The following credentials are required but not provided: ${missingCreds.join(', ')}`,
      });
    }

    // Validate that all required inputs are provided
    const requiredInputs = missingItems.inputs.filter(input => input.required);
    const providedInputKeys = inputs ? inputs.map((i: any) => `${i.nodeId}_${i.fieldName}`) : [];
    const missingInputs = requiredInputs.filter(input => 
      !providedInputKeys.includes(`${input.nodeId}_${input.fieldName}`)
    );

    if (missingInputs.length > 0) {
      return res.status(400).json({
        error: 'Missing required inputs',
        missingInputs: missingInputs.map(input => ({
          nodeId: input.nodeId,
          nodeType: input.nodeType,
          fieldName: input.fieldName,
        })),
        details: `The following inputs are required but not provided: ${missingInputs.map(i => `${i.nodeId}.${i.fieldName}`).join(', ')}`,
      });
    }

    // Load workflow from database
    const { data: workflowData, error: workflowError } = await supabase
      .from('workflows')
      .select('*')
      .eq('id', workflowId)
      .single();

    if (workflowError || !workflowData) {
      return res.status(404).json({
        error: 'Workflow not found',
        workflowId,
      });
    }

    // Parse workflow structure
    const graphData = typeof workflowData.graph === 'string' 
      ? JSON.parse(workflowData.graph) 
      : workflowData.graph || {};
    
    const persistedMeta =
      (graphData &&
        typeof graphData === 'object' &&
        graphData.metadata &&
        typeof graphData.metadata === 'object' &&
        graphData.metadata) ||
      {};
    let workflow: Workflow = {
      nodes: workflowData.nodes || graphData.nodes || [],
      edges: workflowData.edges || graphData.edges || [],
      metadata: {
        created_at: workflowData.created_at,
        updated_at: workflowData.updated_at,
        workflowId,
        name: workflowData.name || 'Untitled Workflow',
        ...(persistedMeta as Record<string, unknown>),
      },
    };

    // Step 1: Inject credentials
    if (credentials && Object.keys(credentials).length > 0) {
      console.log(`[ConfigureWorkflow] Injecting ${Object.keys(credentials).length} credential(s)`);
      const credentialInjectionResult = await workflowLifecycleManager.injectCredentials(
        workflow,
        credentials,
        userId
      );
      
      if (!credentialInjectionResult.success) {
        return res.status(400).json({
          error: 'Credential injection failed',
          details: credentialInjectionResult.errors || ['Unknown error'],
        });
      }
      
      workflow = credentialInjectionResult.workflow;
    }

    // Step 2: Inject node inputs
    if (inputs && inputs.length > 0) {
      console.log(`[ConfigureWorkflow] Injecting ${inputs.length} input(s)`);
      
      workflow = {
        ...workflow,
        nodes: workflow.nodes.map(node => {
          const nodeInputs = inputs.filter((i: any) => i.nodeId === node.id);
          if (nodeInputs.length === 0) {
            return node;
          }

          const config = { ...(node.data?.config || {}) };
          for (const input of nodeInputs) {
            config[input.fieldName] = input.value;
          }

          return {
            ...node,
            data: {
              ...(node.data || {}),
              config,
            },
          };
        }),
      };
    }

    // Step 3: Preserve existing build values.
    // Do not run a second AI auto-fill pass here, otherwise post-credential configuration
    // can overwrite values generated during the initial workflow build.

    // Step 4: Validate workflow
    console.log(`[ConfigureWorkflow] Validating workflow`);
    const validation = await workflowValidator.validateAndFix(workflow);
    
    if (!validation.valid) {
      return res.status(400).json({
        error: 'Workflow validation failed',
        validationErrors: validation.errors || [],
        warnings: validation.warnings || [],
      });
    }

    // Step 5: Save updated workflow to database
    const updatedWorkflow = validation.fixedWorkflow || workflow;
    
    const { error: updateError } = await supabase
      .from('workflows')
      .update({
        nodes: updatedWorkflow.nodes,
        edges: updatedWorkflow.edges,
        graph: {
          nodes: updatedWorkflow.nodes,
          edges: updatedWorkflow.edges,
        },
        ready_to_run: true, // Mark as ready to run
        updated_at: new Date().toISOString(),
      })
      .eq('id', workflowId);

    if (updateError) {
      console.error('[ConfigureWorkflow] Failed to save workflow:', updateError);
      return res.status(500).json({
        error: 'Failed to save workflow',
        details: updateError.message,
      });
    }

    console.log(`[ConfigureWorkflow] ✅ Workflow ${workflowId} configured and marked as ready_to_run`);

    return res.json({
      success: true,
      workflowId,
      ready_to_run: true,
      message: 'Workflow configured successfully',
    });
  } catch (error: any) {
    console.error('[ConfigureWorkflow] Error:', error);
    return res.status(500).json({
      error: 'Failed to configure workflow',
      message: error.message || 'Unknown error',
    });
  }
}
