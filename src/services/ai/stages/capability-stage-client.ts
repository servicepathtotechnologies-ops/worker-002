import type { CapabilityOptionStep } from './capability-selection-stage';

const AI_GENERATOR_URL = process.env.AI_GENERATOR_URL?.replace(/\/$/, '');

export interface CapabilitySelectionJsonSuccess {
  ok: true;
  steps: CapabilityOptionStep[];
  durationMs: number;
  llmCall: { model: string; temperature: number; promptTokens: number; completionTokens: number };
}

export interface CapabilitySelectionJsonError {
  ok: false;
  code: 'INVALID_LLM_RESPONSE';
  rawResponse?: string;
  durationMs: number;
}

export type CapabilitySelectionJsonOutput =
  | CapabilitySelectionJsonSuccess
  | CapabilitySelectionJsonError;

/**
 * Delegates only the capability-selection LLM call and JSON parsing to
 * ai-generator when AI_GENERATOR_URL is set. Registry reconciliation,
 * destination coverage repair, deterministic fallback, and capability policy
 * decisions remain in the worker.
 */
export async function runCapabilitySelectionJsonRemote(
  params: {
    systemPrompt: string;
    message: string;
    correlationId?: string;
  },
): Promise<CapabilitySelectionJsonOutput | null> {
  if (!AI_GENERATOR_URL) return null;

  try {
    const serviceKey = process.env.AI_GENERATOR_SERVICE_KEY ?? '';
    const res = await fetch(`${AI_GENERATOR_URL}/generate/capability-selection-json`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(serviceKey ? { 'x-service-key': serviceKey } : {}),
      },
      body: JSON.stringify(params),
      signal: AbortSignal.timeout(30_000),
    });

    if (!res.ok) {
      console.warn(`[capability-stage-client] ai-generator returned ${res.status} - falling back to local`);
      return null;
    }

    return res.json() as Promise<CapabilitySelectionJsonOutput>;
  } catch (err) {
    console.warn('[capability-stage-client] remote call failed - falling back to local:', err);
    return null;
  }
}
