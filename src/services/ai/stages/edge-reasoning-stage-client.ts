import type { ProposedEdge, SelectedNode } from '../system-prompt-builder';
import type { EdgeReasoningOutput } from './edge-reasoning-stage';

const AI_GENERATOR_URL = process.env.AI_GENERATOR_URL?.replace(/\/$/, '');

// ─── JSON-Only Remote (Day 37) ────────────────────────────────────────────────

export interface EdgeReasoningJsonSuccess {
  ok: true;
  orderedNodes: string[];
  edges: ProposedEdge[];
  durationMs: number;
  llmCall: { model: string; temperature: number; promptTokens: number; completionTokens: number };
}

export interface EdgeReasoningJsonError {
  ok: false;
  code: 'CYCLE_DETECTED' | 'INVALID_LLM_RESPONSE';
  rawResponse?: string;
  durationMs: number;
}

export type EdgeReasoningJsonOutput = EdgeReasoningJsonSuccess | EdgeReasoningJsonError;

/**
 * Delegates only the edge-reasoning LLM call, JSON parsing, and cycle-detection retry
 * to the ai-generator service. Returns null when AI_GENERATOR_URL is unset or the
 * remote call fails, so callers can fall back to the local LLM path.
 *
 * The worker keeps: prompt building, WorkflowNode construction (real registry),
 * seeded edge construction, graph orchestrator initialization, switch-case extraction,
 * and branch coverage logic.
 */
export async function runEdgeReasoningJsonRemote(params: {
  systemPrompt: string;
  message: string;
  correlationId?: string;
}): Promise<EdgeReasoningJsonOutput | null> {
  if (!AI_GENERATOR_URL) return null;

  try {
    const serviceKey = process.env.AI_GENERATOR_SERVICE_KEY ?? '';
    const res = await fetch(`${AI_GENERATOR_URL}/generate/edge-reasoning-json`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(serviceKey ? { 'x-service-key': serviceKey } : {}),
      },
      body: JSON.stringify(params),
      signal: AbortSignal.timeout(30_000),
    });

    if (!res.ok) {
      console.warn(`[edge-reasoning-stage-client] ai-generator returned ${res.status} - falling back to local`);
      return null;
    }

    return res.json() as Promise<EdgeReasoningJsonOutput>;
  } catch (err) {
    console.warn('[edge-reasoning-stage-client] remote call failed - falling back to local:', err);
    return null;
  }
}

// ─── Full Stage Remote (Day 42) ───────────────────────────────────────────────

/**
 * Delegates the full edge-reasoning stage (LLM call + JSON parsing + cycle detection +
 * partial materialization) to the ai-generator service. Returns null when
 * AI_GENERATOR_URL is unset or the remote call fails, so callers can fall back to the
 * JSON-only remote or local LLM path.
 *
 * The worker uses orderedNodeIds + edges from the result to re-materialize the
 * workflow with the real registry (defaultConfig, port resolution, etc.).
 */
export async function runEdgeReasoningStageRemote(params: {
  selectedNodes: SelectedNode[];
  catalog: string;
  userIntent: string;
  correlationId?: string;
  structuralPrompt?: string;
}): Promise<EdgeReasoningOutput | null> {
  if (!AI_GENERATOR_URL) return null;

  try {
    const serviceKey = process.env.AI_GENERATOR_SERVICE_KEY ?? '';
    const res = await fetch(`${AI_GENERATOR_URL}/generate/edge-reasoning`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(serviceKey ? { 'x-service-key': serviceKey } : {}),
      },
      body: JSON.stringify(params),
      signal: AbortSignal.timeout(30_000),
    });

    if (!res.ok) {
      console.warn(`[edge-reasoning-stage-client] ai-generator /edge-reasoning returned ${res.status} - falling back`);
      return null;
    }

    return res.json() as Promise<EdgeReasoningOutput>;
  } catch (err) {
    console.warn('[edge-reasoning-stage-client] stage remote call failed - falling back:', err);
    return null;
  }
}
