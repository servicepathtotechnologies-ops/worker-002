/**
 * Workflow Confirmation API
 * 
 * POST /api/workflow/confirm
 * POST /api/workflow/reject
 * 
 * Handles workflow confirmation and rejection.
 * If approved: continues pipeline execution.
 * If rejected: allows tool replacement or workflow regeneration.
 */

import { Request, Response } from 'express';
import { workflowPipelineOrchestrator } from '../services/ai/workflow-pipeline-orchestrator';
import { workflowConfirmationManager, WorkflowState } from '../services/ai/workflow-confirmation-manager';
import { toolSubstitutionEngine } from '../services/ai/tool-substitution-engine';
import { getSupabaseClient } from '../core/database/supabase-compat';
import { nodeLibrary } from '../services/nodes/node-library';
import { normalizeNodeType } from '../core/utils/node-type-normalizer';

interface ConfirmRequest {
  workflowId: string;
  approved: boolean;
  toolOverrides?: Record<string, {
    nodeId: string;
    newTool: string;
    reasoning?: string;
  }>;
  nodeOverrides?: Record<string, {
    nodeId: string;
    action: 'replace' | 'remove' | 'add';
    newNodeType?: string;
    newNodeConfig?: Record<string, any>;
    reasoning?: string;
  }>;
  feedback?: string;
}

/**
 * Apply tool overrides to workflow
 */
function applyToolOverrides(
  workflow: { nodes: any[]; edges: any[] },
  toolOverrides: Record<string, { nodeId: string; newTool: string; reasoning?: string }>
): { nodes: any[]; edges: any[] } {
  const updatedNodes = workflow.nodes.map(node => {
    const override = Object.values(toolOverrides).find(o => o.nodeId === node.id);
    if (override) {
      const nodeType = normalizeNodeType(node);
      const newSchema = nodeLibrary.getSchema(override.newTool);
      
      if (!newSchema) {
        console.warn(`[WorkflowConfirm] Tool override failed: ${override.newTool} not found in node library`);
        return node;
      }

      console.log(`[WorkflowConfirm] Applying tool override: ${nodeType} → ${override.newTool} for node ${node.id}`);
      
      return {
        ...node,
        data: {
          ...node.data,
          type: override.newTool,
          label: newSchema.label || override.newTool,
          category: newSchema.category || node.data?.category,
          config: node.data?.config || {},
        },
      };
    }
    return node;
  });

  return {
    nodes: updatedNodes,
    edges: workflow.edges,
  };
}

/**
 * Apply node overrides to workflow
 */
function applyNodeOverrides(
  workflow: { nodes: any[]; edges: any[] },
  nodeOverrides: Record<string, {
    nodeId: string;
    action: 'replace' | 'remove' | 'add';
    newNodeType?: string;
    newNodeConfig?: Record<string, any>;
    reasoning?: string;
  }>
): { nodes: any[]; edges: any[] } {
  let updatedNodes = [...workflow.nodes];
  let updatedEdges = [...workflow.edges];

  Object.values(nodeOverrides).forEach(override => {
    if (override.action === 'remove') {
      // Remove node and its edges
      console.log(`[WorkflowConfirm] Removing node ${override.nodeId}`);
      updatedNodes = updatedNodes.filter(n => n.id !== override.nodeId);
      updatedEdges = updatedEdges.filter(
        e => e.source !== override.nodeId && e.target !== override.nodeId
      );
    } else if (override.action === 'replace' && override.newNodeType) {
      // Replace node type
      const nodeIndex = updatedNodes.findIndex(n => n.id === override.nodeId);
      if (nodeIndex !== -1) {
        const node = updatedNodes[nodeIndex];
        const newSchema = nodeLibrary.getSchema(override.newNodeType);
        
        if (!newSchema) {
          console.warn(`[WorkflowConfirm] Node override failed: ${override.newNodeType} not found in node library`);
          return;
        }

        console.log(`[WorkflowConfirm] Replacing node ${override.nodeId}: ${normalizeNodeType(node)} → ${override.newNodeType}`);
        
        updatedNodes[nodeIndex] = {
          ...node,
          data: {
            ...node.data,
            type: override.newNodeType,
            label: newSchema.label || override.newNodeType,
            category: newSchema.category || node.data?.category,
            config: override.newNodeConfig || node.data?.config || {},
          },
        };
      }
    } else if (override.action === 'add' && override.newNodeType) {
      // Add new node
      const newSchema = nodeLibrary.getSchema(override.newNodeType);
      if (!newSchema) {
        console.warn(`[WorkflowConfirm] Node add failed: ${override.newNodeType} not found in node library`);
        return;
      }

      const newNodeId = `node_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      console.log(`[WorkflowConfirm] Adding new node ${newNodeId} of type ${override.newNodeType}`);
      
      updatedNodes.push({
        id: newNodeId,
        type: 'custom',
        position: { x: 0, y: 0 },
        data: {
          type: override.newNodeType,
          label: newSchema.label || override.newNodeType,
          category: newSchema.category || 'action',
          config: override.newNodeConfig || {},
        },
      });
    }
  });

  return {
    nodes: updatedNodes,
    edges: updatedEdges,
  };
}

/**
 * Update workflow state in database
 */
async function updateWorkflowStateInDatabase(
  workflowId: string,
  state: WorkflowState,
  workflow?: { nodes: any[]; edges: any[] },
  userId?: string
): Promise<void> {
  const supabase = getSupabaseClient();

  try {
    // Check if workflow exists in database
    const { data: existingWorkflow, error: fetchError } = await supabase
      .from('workflows')
      .select('id, status')
      .eq('id', workflowId)
      .single();

    if (fetchError && fetchError.code !== 'PGRST116') { // PGRST116 = not found
      console.error(`[WorkflowConfirm] Error fetching workflow:`, fetchError);
      throw fetchError;
    }

    // Map WorkflowState to database status
    let dbStatus: string;
    switch (state) {
      case WorkflowState.STATE_CONFIRMED:
        dbStatus = 'active'; // or 'draft' if you want to keep it as draft until saved
        break;
      case WorkflowState.STATE_REJECTED:
        dbStatus = 'draft'; // Keep as draft when rejected
        break;
      case WorkflowState.STATE_WAITING_CONFIRMATION:
        dbStatus = 'draft';
        break;
      default:
        dbStatus = 'draft';
    }

    if (existingWorkflow) {
      // Update existing workflow
      const updateData: any = {
        status: dbStatus,
        updated_at: new Date().toISOString(),
      };

      // If workflow data is provided, update nodes and edges
      if (workflow) {
        updateData.nodes = workflow.nodes;
        updateData.edges = workflow.edges;
      }

      const { error: updateError } = await supabase
        .from('workflows')
        .update(updateData)
        .eq('id', workflowId);

      if (updateError) {
        console.error(`[WorkflowConfirm] Error updating workflow:`, updateError);
        throw updateError;
      }

      console.log(`[WorkflowConfirm] ✅ Updated workflow ${workflowId} state to ${state} (DB status: ${dbStatus})`);
    } else {
      // Create new workflow entry if it doesn't exist
      if (!workflow) {
        throw new Error('Cannot create workflow without workflow data');
      }

      if (!userId) {
        // Try to get user from auth
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          throw new Error('User ID required to create workflow');
        }
        userId = user.id;
      }

      const { error: createError } = await supabase
        .from('workflows')
        .insert({
          id: workflowId,
          user_id: userId,
          name: `Workflow ${workflowId.substring(0, 8)}`,
          nodes: workflow.nodes,
          edges: workflow.edges,
          status: dbStatus,
          confirmed: state === WorkflowState.STATE_CONFIRMED ? true : false,
        });

      if (createError) {
        console.error(`[WorkflowConfirm] Error creating workflow:`, createError);
        throw createError;
      }

      console.log(`[WorkflowConfirm] ✅ Created workflow ${workflowId} with state ${state} (DB status: ${dbStatus})`);
    }
  } catch (error) {
    console.error(`[WorkflowConfirm] Database update failed:`, error);
    throw error;
  }
}

/**
 * POST /api/workflow/confirm
 * Confirm workflow and continue pipeline execution
 */
export async function confirmWorkflow(req: Request, res: Response) {
  try {
    const { workflowId, approved, toolOverrides, nodeOverrides, feedback } = req.body as ConfirmRequest;

    if (!workflowId) {
      return res.status(400).json({
        error: 'Missing required field',
        message: 'workflowId is required',
      });
    }

    if (approved === undefined) {
      return res.status(400).json({
        error: 'Missing required field',
        message: 'approved is required',
      });
    }

    console.log(`[WorkflowConfirm] Processing confirmation for workflow ${workflowId}, approved: ${approved}`);

    // Get confirmation request
    const confirmationRequest = workflowConfirmationManager.getConfirmationRequest(workflowId);
    if (!confirmationRequest) {
      return res.status(404).json({
        error: 'Workflow confirmation request not found',
        message: `No confirmation request found for workflow ID: ${workflowId}`,
      });
    }

    // Get user ID from auth
    const supabaseClient = getSupabaseClient();
    const { data: { user } } = await supabaseClient.auth.getUser();
    const userId = user?.id;

    // Apply overrides if provided
    let workflow = confirmationRequest.workflow;
    if (toolOverrides && Object.keys(toolOverrides).length > 0) {
      console.log(`[WorkflowConfirm] Applying ${Object.keys(toolOverrides).length} tool override(s)`);
      
      // Use tool substitution engine for proper tool replacement
      const substitutions = Object.values(toolOverrides).map(override => ({
        nodeId: override.nodeId,
        newTool: override.newTool,
      }));
      
      const substitutionResult = await toolSubstitutionEngine.substituteTools(
        {
          nodes: workflow.nodes,
          edges: workflow.edges,
        },
        substitutions,
        userId
      );
      
      if (substitutionResult.success) {
        workflow = {
          nodes: substitutionResult.workflow.nodes || [],
          edges: substitutionResult.workflow.edges || [],
        };
        
        // Log substitution results
        substitutionResult.substitutedNodes.forEach(sub => {
          console.log(`[WorkflowConfirm] ✅ Substituted ${sub.fromTool} → ${sub.toTool} for node ${sub.nodeId}`);
        });
        
        if (substitutionResult.warnings.length > 0) {
          console.warn(`[WorkflowConfirm] ⚠️  Substitution warnings:`, substitutionResult.warnings);
        }
      } else {
        console.error(`[WorkflowConfirm] ❌ Tool substitution failed:`, substitutionResult.errors);
        return res.status(400).json({
          success: false,
          error: 'Tool substitution failed',
          errors: substitutionResult.errors,
          warnings: substitutionResult.warnings,
        });
      }
    }

    if (nodeOverrides && Object.keys(nodeOverrides).length > 0) {
      console.log(`[WorkflowConfirm] Applying ${Object.keys(nodeOverrides).length} node override(s)`);
      workflow = applyNodeOverrides(workflow, nodeOverrides);
    }

    // Submit confirmation
    const confirmationResponse = workflowConfirmationManager.submitConfirmation(
      workflowId,
      approved,
      feedback
    );

    if (!approved) {
      // Workflow rejected
      console.log(`[WorkflowConfirm] Workflow ${workflowId} rejected by user`);
      
      // Update database state
      await updateWorkflowStateInDatabase(
        workflowId,
        WorkflowState.STATE_REJECTED,
        workflow,
        userId
      );

      return res.json({
        success: true,
        workflowId,
        state: WorkflowState.STATE_REJECTED,
        message: 'Workflow rejected. You can regenerate or modify the workflow.',
        workflow: workflow, // Return modified workflow for regeneration
      });
    }

    // Workflow approved - continue pipeline execution
    console.log(`[WorkflowConfirm] Workflow ${workflowId} approved, continuing pipeline execution`);

    // Get credentials from request (if provided)
    const { existingCredentials, providedCredentials } = req.body;

    // Continue pipeline after confirmation
    const pipelineResult = await workflowPipelineOrchestrator.continuePipelineAfterConfirmation(
      workflowId,
      true, // confirmed
      existingCredentials,
      providedCredentials,
      {
        mode: 'build',
        onProgress: (step, stepName, progress, details) => {
          console.log(`[WorkflowConfirm] Pipeline progress: Step ${step} (${stepName}) - ${progress}%`);
        },
      }
    );

    if (!pipelineResult.success) {
      console.error(`[WorkflowConfirm] Pipeline continuation failed:`, pipelineResult.errors);
      
      // Update database state to reflect failure
      await updateWorkflowStateInDatabase(
        workflowId,
        WorkflowState.STATE_REJECTED,
        undefined,
        userId
      );

      return res.status(500).json({
        success: false,
        workflowId,
        error: 'Pipeline continuation failed',
        errors: pipelineResult.errors,
        warnings: pipelineResult.warnings,
      });
    }

    // Update database with final workflow
    await updateWorkflowStateInDatabase(
      workflowId,
      WorkflowState.STATE_CONFIRMED,
      pipelineResult.workflow ? {
        nodes: pipelineResult.workflow.nodes || [],
        edges: pipelineResult.workflow.edges || [],
      } : undefined,
      userId
    );

    // ✅ CRITICAL: Set confirmed field to true when workflow is confirmed
    // Note: supabaseClient is already declared above
    const { error: confirmError } = await supabaseClient
      .from('workflows')
      .update({ confirmed: true })
      .eq('id', workflowId);

    if (confirmError) {
      console.error(`[WorkflowConfirm] Error setting confirmed flag:`, confirmError);
      // Don't throw - status update is more important
    } else {
      console.log(`[WorkflowConfirm] ✅ Set confirmed=true for workflow ${workflowId}`);
    }

    console.log(`[WorkflowConfirm] ✅ Workflow ${workflowId} confirmed and pipeline completed successfully`);

    return res.json({
      success: true,
      workflowId,
      state: WorkflowState.STATE_CONFIRMED,
      workflow: pipelineResult.workflow,
      structuredIntent: pipelineResult.structuredIntent,
      credentialDetection: pipelineResult.credentialDetection,
      errors: pipelineResult.errors,
      warnings: pipelineResult.warnings,
      requiresCredentials: pipelineResult.requiresCredentials,
    });
  } catch (error) {
    console.error(`[WorkflowConfirm] Error processing confirmation:`, error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * POST /api/workflow/reject
 * Reject workflow (alias for confirm with approved=false)
 */
export async function rejectWorkflow(req: Request, res: Response) {
  // Reject is just confirm with approved=false
  return confirmWorkflow(req, res);
}

/**
 * Default export for Express route
 */
export default async function workflowConfirmHandler(req: Request, res: Response) {
  // Route based on path
  if (req.path.includes('/reject')) {
    return rejectWorkflow(req, res);
  }
  return confirmWorkflow(req, res);
}
