import type { IntentStageOutput } from './intent-stage';

const AI_GENERATOR_URL = process.env.AI_GENERATOR_URL?.replace(/\/$/, '');

/**
 * Delegates intent analysis to the ai-generator service when AI_GENERATOR_URL is set.
 * Returns null if the env var is absent or the remote call fails, so callers can
 * fall back to running the stage in-process.
 */
export async function runIntentStageRemote(
  userPrompt: string,
  catalog: string,
  correlationId?: string,
): Promise<IntentStageOutput | null> {
  if (!AI_GENERATOR_URL) return null;

  try {
    const serviceKey = process.env.AI_GENERATOR_SERVICE_KEY ?? '';
    const res = await fetch(`${AI_GENERATOR_URL}/generate/intent`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(serviceKey ? { 'x-service-key': serviceKey } : {}),
      },
      body: JSON.stringify({ prompt: userPrompt, catalog, correlationId }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!res.ok) {
      console.warn(`[intent-stage-client] ai-generator returned ${res.status} — falling back to local`);
      return null;
    }

    return res.json() as Promise<IntentStageOutput>;
  } catch (err) {
    console.warn('[intent-stage-client] remote call failed — falling back to local:', err);
    return null;
  }
}
