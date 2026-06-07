import type { StructuredIntent } from './intent-stage';
import type { CapabilitySelectionOutput } from './capability-selection-stage';

const AI_GENERATOR_URL = process.env.AI_GENERATOR_URL?.replace(/\/$/, '');

/**
 * Delegates capability selection to the ai-generator service when AI_GENERATOR_URL is set.
 * Returns null if the env var is absent or the remote call fails, so callers can
 * fall back to running the stage in-process.
 */
export async function runCapabilitySelectionStageRemote(
  intent: StructuredIntent,
  catalog: string,
  correlationId?: string,
): Promise<CapabilitySelectionOutput | null> {
  if (!AI_GENERATOR_URL) return null;

  try {
    const serviceKey = process.env.AI_GENERATOR_SERVICE_KEY ?? '';
    const res = await fetch(`${AI_GENERATOR_URL}/generate/capabilities`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(serviceKey ? { 'x-service-key': serviceKey } : {}),
      },
      body: JSON.stringify({ intent, catalog, correlationId }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!res.ok) {
      console.warn(`[capability-stage-client] ai-generator returned ${res.status} - falling back to local`);
      return null;
    }

    return res.json() as Promise<CapabilitySelectionOutput>;
  } catch (err) {
    console.warn('[capability-stage-client] remote call failed - falling back to local:', err);
    return null;
  }
}
