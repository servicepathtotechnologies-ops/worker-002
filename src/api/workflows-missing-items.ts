/**
 * GET /api/workflows/:workflowId/missing-items
 * 
 * Returns unified list of missing credentials and sensitive inputs for a workflow
 */

import { Request, Response } from 'express';
import { getUnifiedMissingItems } from '../services/ai/credential-input-discovery';
import { getDbClient } from '../core/database/supabase-compat';

export default async function getMissingItemsHandler(req: Request, res: Response) {
  try {
    const { workflowId } = req.params;

    if (!workflowId) {
      return res.status(400).json({
        error: 'workflowId is required',
      });
    }

    // Extract user ID from auth header (optional)
    const supabase = getDbClient();
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
          console.warn('[MissingItems] Auth error (non-fatal):', authErr);
        }
      }
    }

    console.log(`[MissingItems] Getting missing items for workflow ${workflowId}`);

    const missingItems = await getUnifiedMissingItems(workflowId, userId);

    return res.json({
      success: true,
      workflowId,
      ...missingItems,
    });
  } catch (error: any) {
    console.error('[MissingItems] Error:', error);
    return res.status(500).json({
      error: 'Failed to get missing items',
      message: error.message || 'Unknown error',
    });
  }
}
