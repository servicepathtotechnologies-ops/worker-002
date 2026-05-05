import type { Request } from 'express';
import { getDbClient } from '../../core/database/supabase-compat';
import type { AppRole, AiEditorCapability, WorkflowLifecyclePhase } from '../../core/types/ai-editor-auth';
import {
  capabilitiesForRole,
  hasCapability,
  normalizeAppRole,
  assertCanApply,
} from '../../core/types/ai-editor-auth';

export interface AiEditorPrincipal {
  userId: string;
  email?: string;
  role: AppRole;
  capabilities: Set<AiEditorCapability>;
}

const SKIP_AUTH = process.env.AI_EDITOR_SKIP_AUTH === 'true' || process.env.AI_EDITOR_SKIP_AUTH === '1';

/**
 * Resolve the caller for AI editor routes.
 * - When AI_EDITOR_SKIP_AUTH is set, returns a synthetic admin principal (local dev only).
 * - Otherwise requires Authorization: Bearer <jwt>.
 */
export async function resolveAiEditorPrincipal(req: Request): Promise<
  | { ok: true; principal: AiEditorPrincipal }
  | { ok: false; status: number; error: string }
> {
  if (SKIP_AUTH) {
    const role: AppRole = 'admin';
    return {
      ok: true,
      principal: {
        userId: 'dev-ai-editor',
        email: 'dev@local',
        role,
        capabilities: capabilitiesForRole(role),
      },
    };
  }

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return { ok: false, status: 401, error: 'Authorization Bearer token required' };
  }
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!token) {
    return { ok: false, status: 401, error: 'Empty bearer token' };
  }

  try {
    const supabase = getDbClient();
    const { data: authData, error: authError } = await supabase.auth.getUser(token);
    if (authError || !authData?.user) {
      return { ok: false, status: 401, error: 'Invalid or expired token' };
    }

    const userId = authData.user.id;
    const { data: roleRows, error: roleError } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', userId);

    if (roleError) {
      console.warn('[ai-editor-rbac] user_roles query failed:', roleError.message);
    }

    const role = normalizeAppRole(roleRows || []);
    const capabilities = capabilitiesForRole(role);

    return {
      ok: true,
      principal: {
        userId,
        email: authData.user.email,
        role,
        capabilities,
      },
    };
  } catch (e: any) {
    console.error('[ai-editor-rbac] resolvePrincipal error:', e);
    return { ok: false, status: 503, error: e?.message || 'Auth service unavailable' };
  }
}

export function requireCapability(
  principal: AiEditorPrincipal,
  capability: AiEditorCapability
): { ok: true } | { ok: false; status: number; error: string } {
  if (!hasCapability(principal.capabilities, capability)) {
    return {
      ok: false,
      status: 403,
      error: `Missing capability: ${capability}`,
    };
  }
  return { ok: true };
}

export async function fetchWorkflowLifecyclePhase(workflowId: string | undefined): Promise<WorkflowLifecyclePhase> {
  if (!workflowId || workflowId === 'new' || workflowId === 'unsaved') {
    return 'draft';
  }
  try {
    const supabase = getDbClient();
    const { data, error } = await supabase.from('workflows').select('status').eq('id', workflowId).maybeSingle();
    if (error || !data) {
      return 'draft';
    }
    return data.status === 'active' ? 'active' : 'draft';
  } catch {
    return 'draft';
  }
}

export function canApplyForPhase(
  principal: AiEditorPrincipal,
  phase: WorkflowLifecyclePhase
): ReturnType<typeof assertCanApply> {
  return assertCanApply(principal.capabilities, phase);
}
