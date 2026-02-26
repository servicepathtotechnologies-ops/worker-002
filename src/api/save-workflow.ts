/**
 * Save Workflow API
 * 
 * Validates and saves workflows with fail-fast validation.
 * Ensures only executable workflows are saved.
 */

import { Request, Response } from 'express';
import { getSupabaseClient } from '../core/database/supabase-compat';
import { validateWorkflowForSave, normalizeWorkflowForSave } from '../core/validation/workflow-save-validator';
import { ErrorCode } from '../core/utils/error-codes';

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
 * Save workflow with validation
 * POST /api/save-workflow
 */
export default async function saveWorkflowHandler(req: Request, res: Response) {
  const supabase = getSupabaseClient();
  
  // ✅ CRITICAL: Require Google OAuth connection for workflow creation/updates
  try {
    const { requireGoogleAuth } = await import('../core/utils/check-google-auth');
    await requireGoogleAuth(req);
  } catch (authError: any) {
    if (authError.code === ErrorCode.GOOGLE_AUTH_REQUIRED) {
      return res.status(403).json(authError);
    }
    return res.status(401).json(authError);
  }

  const { workflowId, name, nodes, edges, user_id } = req.body;

  if (!name) {
    return res.status(400).json({
      code: ErrorCode.INVALID_INPUT,
      error: 'Missing required field',
      message: 'Workflow name is required',
    });
  }

  if (!nodes || !Array.isArray(nodes)) {
    return res.status(400).json({
      code: ErrorCode.INVALID_INPUT,
      error: 'Invalid workflow structure',
      message: 'Nodes must be an array',
    });
  }

  if (!edges || !Array.isArray(edges)) {
    return res.status(400).json({
      code: ErrorCode.INVALID_INPUT,
      error: 'Invalid workflow structure',
      message: 'Edges must be an array',
    });
  }

  try {
    // ✅ DEBUG: Log incoming workflow structure
    // Use category-based trigger detection to recognize ALL nodes from triggers category
    const isTrigger = (n: any) => {
      const category = n.data?.category || '';
      const nodeType = n.data?.type || n.type || '';
      return category.toLowerCase() === 'triggers' || 
             category.toLowerCase() === 'trigger' ||
             nodeType.includes('trigger') ||
             ['manual_trigger', 'webhook', 'schedule', 'interval', 'form', 'chat_trigger', 'form_trigger'].includes(nodeType);
    };
    
    console.log('[SaveWorkflow] 📥 Received workflow:', {
      workflowId,
      name,
      nodeCount: nodes.length,
      edgeCount: edges.length,
      triggerNodes: nodes.filter(isTrigger).map(n => ({
        id: n.id,
        type: n.data?.type || n.type,
        category: n.data?.category,
        label: n.data?.label,
      })),
    });
    
    // 1. Normalize workflow (apply migrations)
    const normalized = normalizeWorkflowForSave(nodes, edges);
    
    // ✅ DEBUG: Log normalization results
    console.log('[SaveWorkflow] 🔄 Normalized workflow:', {
      originalNodeCount: nodes.length,
      normalizedNodeCount: normalized.nodes.length,
      originalEdgeCount: edges.length,
      normalizedEdgeCount: normalized.edges.length,
      migrationsApplied: normalized.migrationsApplied,
      normalizedTriggerNodes: normalized.nodes.filter(isTrigger).map(n => ({
        id: n.id,
        type: n.data?.type || n.type,
        category: n.data?.category,
        label: n.data?.label,
      })),
    });
    
    if (normalized.migrationsApplied.length > 0) {
      console.log('[SaveWorkflow] ✅ Applied migrations:', normalized.migrationsApplied);
    }

    // 2. Validate workflow (fail-fast)
    const validation = validateWorkflowForSave(normalized.nodes, normalized.edges);

    if (!validation.canSave) {
      return res.status(400).json({
        code: ErrorCode.INVALID_INPUT,
        error: 'Workflow validation failed',
        message: `Cannot save workflow: ${validation.errors.join('; ')}`,
        details: {
          errors: validation.errors,
          warnings: validation.warnings,
          migrationsApplied: normalized.migrationsApplied,
        },
        hint: 'Please fix the validation errors before saving.',
      });
    }

    // 3. Log warnings (non-blocking)
    if (validation.warnings.length > 0) {
      console.warn('[SaveWorkflow] Validation warnings:', validation.warnings);
    }

    // 4. Prepare workflow data
    const workflowData: Record<string, unknown> = {
      name,
      nodes: normalized.nodes,
      edges: normalized.edges,
      updated_at: new Date().toISOString(),
      schema_version: 2, // Current schema version
      // ✅ CRITICAL: Include settings, graph, and metadata with safe defaults
      settings: (req.body.settings || {}),
      graph: (req.body.graph || { nodes: normalized.nodes, edges: normalized.edges }),
      metadata: (req.body.metadata || {}),
    };

    if (user_id) {
      workflowData.user_id = user_id;
    }

    // 5. Save or update workflow
    let savedWorkflow;
    let previousDefinition: any = null;

    if (workflowId) {
      // 🆕 VERSIONING: Get previous definition before update
      try {
        const { data: previousWorkflow } = await supabase
          .from('workflows')
          .select('*')
          .eq('id', workflowId)
          .single();

        if (previousWorkflow) {
          previousDefinition = {
            name: previousWorkflow.name,
            nodes: previousWorkflow.nodes || [],
            edges: previousWorkflow.edges || [],
            status: previousWorkflow.status,
            phase: previousWorkflow.phase,
        settings: previousWorkflow.settings || {},
        graph: previousWorkflow.graph || {},
        metadata: previousWorkflow.metadata || {},
          };
        }
      } catch (versionError) {
        // Non-critical - continue without previous definition
        console.warn('[SaveWorkflow] Could not load previous definition for versioning:', versionError);
      }

      // Update existing workflow
      const { data, error } = await supabase
        .from('workflows')
        .update(workflowData)
        .eq('id', workflowId)
        .select()
        .single();

      if (error) {
        console.error('[SaveWorkflow] Update error:', error);
        return res.status(500).json({
          code: ErrorCode.INTERNAL_ERROR,
          error: 'Failed to update workflow',
          message: error.message,
        });
      }

      savedWorkflow = data;
    } else {
      // Create new workflow
      const { data, error } = await supabase
        .from('workflows')
        .insert(workflowData)
        .select()
        .single();

      if (error) {
        console.error('[SaveWorkflow] Insert error:', error);
        return res.status(500).json({
          code: ErrorCode.INTERNAL_ERROR,
          error: 'Failed to create workflow',
          message: error.message,
        });
      }

      savedWorkflow = data;
    }

    // 🆕 VERSIONING: Create version after successful save
    try {
      const { getWorkflowVersionManager } = await import('../services/workflow-versioning');
      const versionManager = getWorkflowVersionManager();

      // Extract user ID from request
      let createdBy: string | undefined;
      try {
        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith('Bearer ')) {
          const token = authHeader.replace('Bearer ', '').trim();
          const { data: { user } } = await supabase.auth.getUser(token);
          if (user) {
            createdBy = user.id;
          }
        }
      } catch (authError) {
        // Non-critical - continue without user ID
      }

      const currentDefinition = {
        name: savedWorkflow.name,
        nodes: savedWorkflow.nodes || [],
        edges: savedWorkflow.edges || [],
        status: savedWorkflow.status,
        phase: savedWorkflow.phase,
        settings: savedWorkflow.settings || {},
        graph: savedWorkflow.graph || {},
        metadata: savedWorkflow.metadata || {},
      };

      await versionManager.createVersion(
        savedWorkflow.id,
        currentDefinition,
        previousDefinition,
        createdBy,
        {
          description: workflowId ? 'Workflow updated' : 'Workflow created',
        }
      );
    } catch (versionError) {
      // Versioning is non-critical - log but don't fail the save
      console.warn('[SaveWorkflow] Versioning failed (non-critical):', versionError);
    }

    // ✅ CRITICAL: Invalidate any workflow caches after save
    try {
      const { getMemoryManager } = await import('../memory');
      const memoryManager = getMemoryManager();
      // MemoryManager uses CacheManager internally - invalidate if available
      if (memoryManager && (memoryManager as any).cache) {
        (memoryManager as any).cache.invalidateWorkflow(savedWorkflow.id);
        console.log(`[SaveWorkflow] ✅ Invalidated cache for workflow ${savedWorkflow.id}`);
      }
    } catch (cacheError) {
      // Cache invalidation is non-critical - log but don't fail
      console.warn('[SaveWorkflow] Cache invalidation failed (non-fatal):', cacheError);
    }

    // ✅ DEBUG: Log graph hash for verification
    const graphHash = JSON.stringify({ 
      nodes: savedWorkflow.nodes?.map((n: any) => ({ id: n.id, type: n.data?.type || n.type, config: n.data?.config })), 
      edges: savedWorkflow.edges?.map((e: any) => ({ source: e.source, target: e.target }))
    });
    const hash = require('crypto').createHash('md5').update(graphHash).digest('hex').substring(0, 8);
    console.log(`[SaveWorkflow] 💾 Workflow saved - Graph hash: ${hash}, Updated at: ${savedWorkflow.updated_at}`);

    // 6. Return success response
    return res.json({
      success: true,
      workflowId: savedWorkflow.id,
      workflow: savedWorkflow,
      validation: {
        valid: validation.valid,
        warnings: validation.warnings,
        migrationsApplied: normalized.migrationsApplied,
      },
    });
  } catch (error: any) {
    console.error('[SaveWorkflow] Unexpected error:', error);
    return res.status(500).json({
      code: ErrorCode.INTERNAL_ERROR,
      error: 'Failed to save workflow',
      message: error.message || 'Unknown error',
    });
  }
}
