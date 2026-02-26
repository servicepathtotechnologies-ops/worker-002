// Webhook Trigger API Route
// Migrated from Supabase Edge Function

import { Request, Response } from 'express';
import { getSupabaseClient } from '../core/database/supabase-compat';
import { config } from '../core/config';

/**
 * Webhook trigger handler
 * Creates an execution and triggers workflow execution
 */
export default async function webhookTriggerHandler(req: Request, res: Response) {
  const supabase = getSupabaseClient();

  try {
    // Extract workflow ID from URL path
    // Expected: /api/webhook-trigger/:workflowId
    const workflowId = req.params.workflowId || req.query.workflowId as string;

    if (!workflowId) {
      return res.status(400).json({ error: 'Workflow ID is required' });
    }

    console.log(`Webhook triggered for workflow: ${workflowId}`);

    // Get request body if present
    let input: any = {};
    if (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH') {
      input = req.body || {};
    }

    // Query params as additional input
    const queryParams: Record<string, string> = {};
    Object.entries(req.query).forEach(([key, value]) => {
      queryParams[key] = String(value);
    });

    // Extract session_id for conversation memory
    const sessionId = queryParams.session_id || input.session_id || 
                      `session_${Date.now()}_${Math.random().toString(36).substring(7)}`;

    const fullInput = { 
      ...queryParams, 
      ...input, 
      _webhook: true, 
      _method: req.method,
      session_id: sessionId,
      headers: req.headers,
      query: req.query,
      body: req.body,
    };

    // Verify workflow exists and has webhook enabled
    const { data: workflow, error: workflowError } = await supabase
      .from('workflows')
      .select('*')
      .eq('id', workflowId)
      .single();

    if (workflowError || !workflow) {
      console.error('Workflow not found:', workflowError);
      return res.status(404).json({ error: 'Workflow not found' });
    }

    if (!workflow.webhook_url) {
      console.error('Webhook not enabled for workflow:', workflowId);
      return res.status(403).json({ error: 'Webhook not enabled for this workflow' });
    }

    if (workflow.status !== 'active') {
      console.error('Workflow is not active:', workflow.status);
      return res.status(400).json({ error: 'Workflow is not active' });
    }

    // Create execution record
    const startedAt = new Date().toISOString();
    const { data: execution, error: execError } = await supabase
      .from('executions')
      .insert({
        workflow_id: workflowId,
        user_id: workflow.user_id,
        status: 'running',
        trigger: 'webhook',
        input: fullInput,
        logs: [],
        started_at: startedAt,
      })
      .select()
      .single();

    if (execError || !execution) {
      console.error('Execution creation error:', execError);
      return res.status(500).json({ error: 'Failed to create execution' });
    }

    console.log(`Created execution: ${execution.id}`);

    // Trigger workflow execution asynchronously
    // In production, you might want to use a job queue here
    const executeWorkflowUrl = `${config.publicBaseUrl}/api/execute-workflow`;
    
    // Call execute-workflow with the execution ID
    fetch(executeWorkflowUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Internal-Webhook-Execution': 'true', // Bypass Google OAuth for internal webhook-trigger calls
      },
      body: JSON.stringify({
        workflowId,
        executionId: execution.id,
        input: fullInput,
      }),
    }).catch(err => {
      console.error('Error triggering workflow execution:', err);
    });

    // Return immediate response
    return res.json({
      success: true,
      executionId: execution.id,
      message: 'Webhook received, workflow execution started',
      status: 'running',
    });
  } catch (error) {
    console.error('Webhook trigger error:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return res.status(500).json({ error: errorMessage });
  }
}
