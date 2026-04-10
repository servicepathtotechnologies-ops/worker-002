/**
 * Workflow Credentials API
 *
 * POST /api/workflow/credentials
 *
 * Saves user-entered credential values to the PendingCredentialStore so they
 * are available when the user clicks "Continue Workflow".
 *
 * Requirements: 3.1
 */

import { Request, Response } from 'express';
import { pendingCredentialStore } from '../services/ai/pending-credential-store';

interface SaveCredentialsRequest {
  workflowId: string;
  provider: string;
  fields: Record<string, string>;
}

/**
 * POST /api/workflow/credentials
 * Body: { workflowId, provider, fields }
 */
export async function saveWorkflowCredentials(req: Request, res: Response): Promise<void> {
  const { workflowId, provider, fields } = req.body as SaveCredentialsRequest;

  if (!workflowId || typeof workflowId !== 'string') {
    res.status(400).json({ error: 'workflowId is required' });
    return;
  }

  if (!provider || typeof provider !== 'string') {
    res.status(400).json({ error: 'provider is required' });
    return;
  }

  if (!fields || typeof fields !== 'object' || Array.isArray(fields)) {
    res.status(400).json({ error: 'fields must be an object' });
    return;
  }

  pendingCredentialStore.set(workflowId, provider, fields);

  res.json({ ok: true });
}

export default saveWorkflowCredentials;
