import type { EdgeReasoningOutput } from './edge-reasoning-stage';
import type { SelectedNode } from '../system-prompt-builder';
import type { NodeCatalogText } from '../node-catalog-builder';

const AI_GENERATOR_URL = process.env.AI_GENERATOR_URL?.replace(/\/$/, '');

/**
 * Delegates edge reasoning to the ai-generator service when AI_GENERATOR_URL is set.
 * Returns null if the env var is absent or the remote call fails, so callers can
 * fall back to running the stage in-process.
 */
export async function runEdgeReasoningStageRemote(
  selectedNodes: SelectedNode[],
  catalog: NodeCatalogText,
  userIntent: string,
  correlationId?: string,
  structuralPrompt?: string,
): Promise<EdgeReasoningOutput | null> {
  if (!AI_GENERATOR_URL) return null;

  try {
    const serviceKey = process.env.AI_GENERATOR_SERVICE_KEY ?? '';
    const res = await fetch(`${AI_GENERATOR_URL}/generate/edge-reasoning`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(serviceKey ? { 'x-service-key': serviceKey } : {}),
      },
      body: JSON.stringify({
        intent: userIntent,
        catalog,
        correlationId,
        selectedNodes,
        structuralPrompt,
      }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!res.ok) {
      console.warn(`[edge-reasoning-stage-client] ai-generator returned ${res.status} - falling back to local`);
      return null;
    }

    return res.json() as Promise<EdgeReasoningOutput>;
  } catch (err) {
    console.warn('[edge-reasoning-stage-client] remote call failed - falling back to local:', err);
    return null;
  }
}
