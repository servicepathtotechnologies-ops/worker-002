import type { StructuredIntent } from './intent-stage';
import type { NodeSelectionConstraints, NodeSelectionOutput } from './node-selection-stage';
import type { NodeCatalogText } from '../node-catalog-builder';

const AI_GENERATOR_URL = process.env.AI_GENERATOR_URL?.replace(/\/$/, '');

/**
 * Delegates node selection to the ai-generator service when AI_GENERATOR_URL is set.
 * Returns null if the env var is absent or the remote call fails, so callers can
 * fall back to running the stage in-process.
 */
export async function runNodeSelectionStageRemote(
  intent: StructuredIntent,
  catalog: NodeCatalogText,
  correlationId?: string,
  structuralPrompt?: string,
  constraints?: NodeSelectionConstraints,
): Promise<NodeSelectionOutput | null> {
  if (!AI_GENERATOR_URL) return null;

  try {
    const serviceKey = process.env.AI_GENERATOR_SERVICE_KEY ?? '';
    const res = await fetch(`${AI_GENERATOR_URL}/generate/node-selection`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(serviceKey ? { 'x-service-key': serviceKey } : {}),
      },
      body: JSON.stringify({
        intent,
        catalog,
        correlationId,
        structuralPrompt,
        constraints,
      }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!res.ok) {
      console.warn(`[node-selection-stage-client] ai-generator returned ${res.status} - falling back to local`);
      return null;
    }

    return res.json() as Promise<NodeSelectionOutput>;
  } catch (err) {
    console.warn('[node-selection-stage-client] remote call failed - falling back to local:', err);
    return null;
  }
}
