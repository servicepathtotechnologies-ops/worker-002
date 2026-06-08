import type { SelectedNode } from '../system-prompt-builder';

const AI_GENERATOR_URL = process.env.AI_GENERATOR_URL?.replace(/\/$/, '');

export interface NodeSelectionJsonSuccess {
  ok: true;
  selectedNodes: Array<Pick<SelectedNode, 'type' | 'role' | 'reason'>>;
  durationMs: number;
  llmCall: { model: string; temperature: number; promptTokens: number; completionTokens: number };
}

export interface NodeSelectionJsonError {
  ok: false;
  code: 'INVALID_LLM_RESPONSE';
  rawResponse?: string;
  durationMs: number;
}

export type NodeSelectionJsonOutput =
  | NodeSelectionJsonSuccess
  | NodeSelectionJsonError;

/**
 * Delegates only the node-selection LLM call and JSON parsing to ai-generator.
 * Registry reconciliation, trigger injection, required-node repair, node-id
 * assignment, and capability policy decisions remain in the worker.
 */
export async function runNodeSelectionJsonRemote(params: {
  systemPrompt: string;
  message: string;
  correlationId?: string;
}): Promise<NodeSelectionJsonOutput | null> {
  if (!AI_GENERATOR_URL) return null;

  try {
    const serviceKey = process.env.AI_GENERATOR_SERVICE_KEY ?? '';
    const res = await fetch(`${AI_GENERATOR_URL}/generate/node-selection-json`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(serviceKey ? { 'x-service-key': serviceKey } : {}),
      },
      body: JSON.stringify(params),
      signal: AbortSignal.timeout(30_000),
    });

    if (!res.ok) {
      console.warn(`[node-selection-stage-client] ai-generator returned ${res.status} - falling back to local`);
      return null;
    }

    return res.json() as Promise<NodeSelectionJsonOutput>;
  } catch (err) {
    console.warn('[node-selection-stage-client] remote call failed - falling back to local:', err);
    return null;
  }
}
