/**
 * Capability-based access for the AI workflow editor (analyze, suggest, apply draft/live).
 * Maps application roles ({@link AppRole}) to fine-grained capabilities.
 */

export type AppRole = 'admin' | 'moderator' | 'user';

/** Fine-grained AI editor permissions */
export type AiEditorCapability =
  | 'ai_editor:analyze'
  | 'ai_editor:suggest'
  | 'ai_editor:apply_draft'
  | 'ai_editor:apply_live';

export const AI_EDITOR_CAPABILITIES: AiEditorCapability[] = [
  'ai_editor:analyze',
  'ai_editor:suggest',
  'ai_editor:apply_draft',
  'ai_editor:apply_live',
];

/** Highest-priority role when multiple rows exist */
export function normalizeAppRole(rows: Array<{ role: string } | null | undefined> | null | undefined): AppRole {
  if (!rows || rows.length === 0) return 'user';
  const priority: Record<string, number> = { admin: 3, moderator: 2, user: 1 };
  let best: AppRole = 'user';
  let bestP = 0;
  for (const row of rows) {
    const r = (row?.role as AppRole) || 'user';
    const p = priority[r] ?? 0;
    if (p > bestP) {
      bestP = p;
      best = r;
    }
  }
  return best;
}

/**
 * Capabilities granted to each role (enterprise defaults: restrictive for `user`).
 */
export function capabilitiesForRole(role: AppRole | null | undefined): Set<AiEditorCapability> {
  const r = role || 'user';
  const caps = new Set<AiEditorCapability>();
  switch (r) {
    case 'admin':
      AI_EDITOR_CAPABILITIES.forEach((c) => caps.add(c));
      break;
    case 'moderator':
      caps.add('ai_editor:analyze');
      caps.add('ai_editor:suggest');
      caps.add('ai_editor:apply_draft');
      break;
    case 'user':
    default:
      caps.add('ai_editor:analyze');
      break;
  }
  return caps;
}

export function hasCapability(
  caps: Set<AiEditorCapability>,
  required: AiEditorCapability
): boolean {
  return caps.has(required);
}

/** Workflow lifecycle: active workflows are treated as "live" for apply governance */
export type WorkflowLifecyclePhase = 'draft' | 'active';

export function assertCanApply(
  caps: Set<AiEditorCapability>,
  phase: WorkflowLifecyclePhase
): { ok: true } | { ok: false; reason: string } {
  if (phase === 'active') {
    if (!hasCapability(caps, 'ai_editor:apply_live')) {
      return {
        ok: false,
        reason: 'Applying AI edits to an active (live) workflow requires ai_editor:apply_live (admin).',
      };
    }
    return { ok: true };
  }
  if (!hasCapability(caps, 'ai_editor:apply_draft')) {
    return {
      ok: false,
      reason: 'Applying AI edits requires ai_editor:apply_draft or higher (moderator+).',
    };
  }
  return { ok: true };
}
