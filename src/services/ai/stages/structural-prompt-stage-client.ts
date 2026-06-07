import type { StructuredIntent } from './intent-stage';
import type { StructuralPromptConstraints, StructuralPromptOutput } from './structural-prompt-stage';

const AI_GENERATOR_URL = process.env.AI_GENERATOR_URL?.replace(/\/$/, '');

/**
 * Delegates structural prompt generation to the ai-generator service when AI_GENERATOR_URL is set.
 * Returns null if the env var is absent or the remote call fails, so callers can
 * fall back to running the stage in-process.
 */
export async function runStructuralPromptStageRemote(
  intent: StructuredIntent,
  catalog: string,
  correlationId?: string,
  constraints?: StructuralPromptConstraints,
): Promise<StructuralPromptOutput | null> {
  if (!AI_GENERATOR_URL) return null;

  try {
    const serviceKey = process.env.AI_GENERATOR_SERVICE_KEY ?? '';
    const res = await fetch(`${AI_GENERATOR_URL}/generate/structural-prompt`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(serviceKey ? { 'x-service-key': serviceKey } : {}),
      },
      body: JSON.stringify({
        intent,
        catalog,
        correlationId,
        selectedCapabilities: constraints,
      }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!res.ok) {
      console.warn(`[structural-prompt-stage-client] ai-generator returned ${res.status} - falling back to local`);
      return null;
    }

    return res.json() as Promise<StructuralPromptOutput>;
  } catch (err) {
    console.warn('[structural-prompt-stage-client] remote call failed - falling back to local:', err);
    return null;
  }
}
