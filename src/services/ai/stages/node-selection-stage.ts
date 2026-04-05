/**
 * Node Selection Stage — AI-First Pipeline
 *
 * Selects node types from the Node_Catalog based on structured intent.
 * NO keyword pre-filter. NO tag matching. Pure AI selection.
 * Post-LLM: validates selected types against registry; discards unknowns.
 *
 * Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 8.1, 8.2, 8.3
 */

import { randomUUID } from 'crypto';
import { geminiOrchestrator } from '../gemini-orchestrator';
import { systemPromptBuilder, SelectedNode } from '../system-prompt-builder';
import { unifiedNodeRegistry } from '../../../core/registry/unified-node-registry';
import { logger } from '../../../core/logger';
import type { StructuredIntent } from './intent-stage';
import type { NodeCatalogText } from '../node-catalog-builder';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface NodeSelectionResult {
  ok: true;
  selectedNodes: SelectedNode[];
  durationMs: number;
  llmCall: { model: string; temperature: number; promptTokens: number; completionTokens: number };
}

export interface NodeSelectionError {
  ok: false;
  code: 'NO_VALID_NODES' | 'INVALID_LLM_RESPONSE';
  rawResponse: string;
  durationMs: number;
}

export type NodeSelectionOutput = NodeSelectionResult | NodeSelectionError;

// ─── Node Selection Stage ─────────────────────────────────────────────────────

export async function runNodeSelectionStage(
  intent: StructuredIntent,
  nodeCatalog: NodeCatalogText,
  correlationId?: string,
  structuralPrompt?: string,
): Promise<NodeSelectionOutput> {
  const startedAt = Date.now();
  const inputSummary = `actions=${intent.actions.length}, triggerType=${intent.triggerType}`;

  logger.info({ event: 'ai_pipeline_stage_start', stage: 'node_selection', correlationId, inputSummary });

  const { systemPrompt } = systemPromptBuilder.build({
    stage: 'node_selection',
    nodeCatalog,
    userIntent: intent.intent,
  });

  const model = 'gemini-2.5-flash';
  const temperature = 0.1;

  logger.info({ event: 'ai_pipeline_llm_call', stage: 'node_selection', correlationId, model, temperature });

  const message = `STRUCTURED_INTENT:\n${JSON.stringify(intent, null, 2)}${structuralPrompt ? `\n\nWORKFLOW_BLUEPRINT:\n${structuralPrompt}` : ''}`;

  let text: string;
  try {
    const raw = await geminiOrchestrator.processRequest(
      'node-suggestion',
      { system: systemPrompt, message },
      { model, temperature, cache: false },
    );
    text = typeof raw === 'string' ? raw : JSON.stringify(raw);
  } catch (err) {
    logger.error({ event: 'ai_pipeline_stage_error', stage: 'node_selection', correlationId, error: 'LLM_CALL_FAILED', message: String(err) });
    return { ok: false, code: 'INVALID_LLM_RESPONSE', rawResponse: String(err), durationMs: Date.now() - startedAt };
  }

  const promptTokens = Math.ceil(systemPrompt.length / 4);

  let parsed = tryParseNodeSelection(text);

  if (!parsed) {
    // Retry once with schema reminder
    logger.warn({ event: 'ai_pipeline_stage_retry', stage: 'node_selection', correlationId });
    let text2: string;
    try {
      const retryPrompt = systemPrompt + '\n\nCRITICAL: Return ONLY valid JSON. No markdown, no explanation.';
      const raw2 = await geminiOrchestrator.processRequest(
        'node-suggestion',
        { system: retryPrompt, message },
        { model, temperature, cache: false },
      );
      text2 = typeof raw2 === 'string' ? raw2 : JSON.stringify(raw2);
    } catch (err) {
      logger.error({ event: 'ai_pipeline_stage_error', stage: 'node_selection', correlationId, error: 'LLM_RETRY_FAILED', message: String(err) });
      return { ok: false, code: 'INVALID_LLM_RESPONSE', rawResponse: String(err), durationMs: Date.now() - startedAt };
    }
    parsed = tryParseNodeSelection(text2);

    if (!parsed) {
      logger.error({ event: 'ai_pipeline_stage_error', stage: 'node_selection', correlationId, error: 'INVALID_LLM_RESPONSE', llmResponse: text2 });
      return { ok: false, code: 'INVALID_LLM_RESPONSE', rawResponse: text2, durationMs: Date.now() - startedAt };
    }
  }

  // Post-LLM: validate each type against registry — discard unknowns, log warnings
  const validNodes: SelectedNode[] = [];
  for (const node of parsed) {
    if (unifiedNodeRegistry.has ? unifiedNodeRegistry.has(node.type) : !!unifiedNodeRegistry.get(node.type)) {
      validNodes.push({ ...node, nodeId: randomUUID() });
    } else {
      logger.warn({ event: 'ai_pipeline_unknown_node_type', stage: 'node_selection', correlationId, unknownType: node.type });
    }
  }

  const durationMs = Date.now() - startedAt;
  const completionTokens = Math.ceil(text.length / 4);

  if (validNodes.length === 0) {
    // No fallback to keyword matching — return structured error
    logger.error({ event: 'ai_pipeline_stage_error', stage: 'node_selection', correlationId, error: 'NO_VALID_NODES', llmResponse: text });
    return { ok: false, code: 'NO_VALID_NODES', rawResponse: text, durationMs };
  }

  logger.info({
    event: 'ai_pipeline_stage_end',
    stage: 'node_selection',
    correlationId,
    outputSummary: `selectedNodes=${validNodes.length}`,
    durationMs,
  });

  return {
    ok: true,
    selectedNodes: validNodes,
    durationMs,
    llmCall: { model, temperature, promptTokens, completionTokens },
  };
}

function stripMarkdownFences(text: string): string {
  return text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
}

function tryParseNodeSelection(text: string): Array<{ type: string; role: SelectedNode['role']; reason: string }> | null {
  try {
    const cleaned = stripMarkdownFences(text);
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start === -1 || end === -1) return null;
    const obj = JSON.parse(cleaned.substring(start, end + 1));
    if (!Array.isArray(obj.selectedNodes)) return null;
    return obj.selectedNodes.filter(
      (n: any) => typeof n.type === 'string' && n.type.length > 0,
    );
  } catch {
    return null;
  }
}
