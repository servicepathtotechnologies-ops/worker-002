import type { Workflow } from '../../../core/types/ai-types';
import type { ValidationLlmOutput } from './validation-stage';
import type { SelectedNode, ProposedEdge } from '../system-prompt-builder';
import type { NodeCatalogText } from '../node-catalog-builder';

const AI_GENERATOR_URL = process.env.AI_GENERATOR_URL?.replace(/\/$/, '');

/**
 * Delegates validation LLM work to the ai-generator service when AI_GENERATOR_URL is set.
 * Returns null if the env var is absent or the remote call fails, so callers can
 * fall back to running the stage in-process.
 */
export async function runValidationStageRemote(
  workflow: Workflow,
  catalog: NodeCatalogText,
  userIntent: string,
  selectedNodes?: SelectedNode[],
  proposedEdges?: ProposedEdge[],
  correlationId?: string,
  structuralPrompt?: string,
): Promise<ValidationLlmOutput | null> {
  if (!AI_GENERATOR_URL) return null;

  try {
    const serviceKey = process.env.AI_GENERATOR_SERVICE_KEY ?? '';
    const res = await fetch(`${AI_GENERATOR_URL}/generate/validation`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(serviceKey ? { 'x-service-key': serviceKey } : {}),
      },
      body: JSON.stringify({
        intent: userIntent,
        catalog,
        correlationId,
        workflow: { nodes: workflow.nodes, edges: workflow.edges },
        selectedNodes,
        proposedEdges,
        structuralPrompt,
      }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!res.ok) {
      console.warn(`[validation-stage-client] ai-generator returned ${res.status} - falling back to local`);
      return null;
    }

    return res.json() as Promise<ValidationLlmOutput>;
  } catch (err) {
    console.warn('[validation-stage-client] remote call failed - falling back to local:', err);
    return null;
  }
}
