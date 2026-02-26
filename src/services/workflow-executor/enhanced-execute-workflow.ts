/**
 * Enhanced Execute Workflow Handler
 * Integrates new real-time execution system with existing workflow execution
 */

import { Request, Response } from 'express';
import { getSupabaseClient } from '../../core/database/supabase-compat';
import { getExecutionStateManager } from './execution-state-manager';
import { VisualizationService } from './visualization-service';
import { WorkflowOrchestrator } from './workflow-orchestrator';

interface WorkflowNode {
  id: string;
  type: string;
  data: {
    label: string;
    type: string;
    category: string;
    config: Record<string, unknown>;
  };
}

interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
}

/**
 * Enhanced execute workflow handler with real-time updates
 * Can be used as a drop-in replacement or alongside existing handler
 */
export async function enhancedExecuteWorkflow(
  req: Request,
  res: Response,
  options: {
    useRealtime?: boolean;
    useWorkerPool?: boolean;
  } = {}
): Promise<void> {
  const { useRealtime = true, useWorkerPool = false } = options;
  const supabase = getSupabaseClient();
  const { workflowId, executionId: providedExecutionId, input = {} } = req.body;

  if (!workflowId) {
    res.status(400).json({ error: 'workflowId is required' });
    return;
  }

  let executionId: string | undefined;
  const stateManager = getExecutionStateManager();
  let visualizationService: VisualizationService | null = null;

  try {
    // Fetch workflow
    const { data: workflow, error: workflowError } = await supabase
      .from('workflows')
      .select('*')
      .eq('id', workflowId)
      .single();

    if (workflowError || !workflow) {
      res.status(404).json({ error: 'Workflow not found' });
      return;
    }

    // ✅ EXECUTION GUARD: Workflow must be confirmed before execution
    // Check both confirmed field and status field for backward compatibility
    const isConfirmed = workflow.confirmed === true || workflow.status === 'active';
    if (!isConfirmed) {
      console.error(`[EnhancedExecuteWorkflow] ❌ Execution blocked - Workflow ${workflowId} is not confirmed`);
      res.status(403).json({
        error: 'Workflow execution not allowed',
        message: 'Workflow must be confirmed before execution',
        workflowId,
        confirmed: workflow.confirmed,
        status: workflow.status,
        hint: 'Please confirm the workflow through the confirmation API before executing it.',
      });
      return;
    }

    const nodes = workflow.nodes as WorkflowNode[];
    const edges = workflow.edges as WorkflowEdge[];

    // Handle execution ID (for resuming from webhook/form triggers)
    if (providedExecutionId) {
      const { data: existingExecution, error: fetchError } = await supabase
        .from('executions')
        .select('id, started_at, input')
        .eq('id', providedExecutionId)
        .single();

      if (fetchError || !existingExecution) {
        res.status(404).json({ error: 'Execution not found' });
        return;
      }

      executionId = existingExecution.id;

      if (!existingExecution.started_at) {
        await supabase
          .from('executions')
          .update({ started_at: new Date().toISOString() })
          .eq('id', executionId);
      }

      await supabase
        .from('executions')
        .update({ status: 'running' })
        .eq('id', executionId);
    } else {
      // Create new execution
      const startedAt = new Date().toISOString();
      const { data: newExecution, error: execError } = await supabase
        .from('executions')
        .insert({
          workflow_id: workflowId,
          user_id: workflow.user_id,
          status: 'running',
          trigger: 'manual',
          input,
          logs: [],
          started_at: startedAt,
        })
        .select()
        .single();

      if (execError || !newExecution) {
        console.error('Execution creation error:', execError);
        res.status(500).json({ error: 'Failed to create execution' });
        return;
      }

      executionId = newExecution.id;
    }

    // Ensure executionId is defined
    if (!executionId) {
      res.status(500).json({ error: 'Failed to initialize execution' });
      return;
    }

    // Initialize real-time services if enabled
    if (useRealtime) {
      // Get or create visualization service
      // Note: In production, this should be a singleton injected via dependency injection
      visualizationService = new VisualizationService(stateManager);
    }

    // Create orchestrator
    const orchestrator = new WorkflowOrchestrator(
      stateManager,
      visualizationService || ({} as VisualizationService)
    );

    // Execute workflow
    const result = await orchestrator.executeWorkflow(
      workflowId,
      input,
      nodes,
      edges,
      executionId,
      workflow.user_id
    );

    // Update execution in database
    const finishedAt = new Date().toISOString();
    const executionState = stateManager.getExecutionState(executionId);
    const durationMs = executionState?.duration || 0;

    await supabase
      .from('executions')
      .update({
        status: result.status,
        output: result.output,
        logs: result.logs,
        finished_at: finishedAt,
        duration_ms: durationMs,
        ...(result.status === 'failed' && { error: executionState?.error }),
      })
      .eq('id', executionId);

    // Return response
    if (result.status === 'failed') {
      res.status(500).json({
        error: executionState?.error || 'Execution failed',
        executionId,
        logs: result.logs,
        output: result.output,
      });
      return;
    }

    res.json({
      status: 'success',
      success: true,
      executionId,
      output: result.output,
      logs: result.logs,
      durationMs,
    });
    return;
  } catch (error) {
    console.error('Enhanced execute workflow error:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);

    // Update execution state if we have an executionId
    if (executionId) {
      stateManager.setExecutionError(executionId, errorMessage);
      
      const { error: updateError } = await supabase
        .from('executions')
        .update({
          status: 'failed',
          error: errorMessage,
          finished_at: new Date().toISOString(),
        })
        .eq('id', executionId);
      
      if (updateError) {
        console.error('Failed to update execution error:', updateError);
      }
    }

    res.status(500).json({
      error: errorMessage,
      executionId: executionId ?? 'unknown',
    });
    return;
  }
}
