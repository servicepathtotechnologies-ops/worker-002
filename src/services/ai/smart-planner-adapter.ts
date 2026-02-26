import { preprocessPrompt } from '../../preprocessor';
import { callPlannerAgent } from '../../planner/plannerAgent';
import { validateWorkflowSpec } from '../../validator/specValidator';
import type { WorkflowSpec } from '../../planner/types';

/**
 * Thin adapter that lets the legacy workflow builder call the new Smart Planner.
 * 
 * - Uses Ollama-based plannerAgent to get a WorkflowSpec.
 * - Validates the spec.
 * - Never throws for planner failures when disabled or unavailable (caller can fall back).
 */
export async function planWorkflowSpecFromPrompt(
  userPrompt: string,
): Promise<WorkflowSpec | undefined> {
  const enabled = process.env.SMART_PLANNER_ENABLED === 'true';
  if (!enabled) {
    return undefined;
  }

  try {
    const cleanPrompt = preprocessPrompt(userPrompt);
    const { spec } = await callPlannerAgent(cleanPrompt);
    const validated = validateWorkflowSpec(spec);
    return validated;
  } catch (error) {
    console.error('[SmartPlannerAdapter] Planner failed, falling back to legacy pipeline:', error);
    return undefined;
  }
}

