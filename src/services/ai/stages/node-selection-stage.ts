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
import { systemPromptBuilder, SelectedNode, NODE_SELECTION_OUTPUT_SCHEMA } from '../system-prompt-builder';
import { unifiedNodeRegistry } from '../../../core/registry/unified-node-registry';
import { logger } from '../../../core/logger';
import type { StructuredIntent } from './intent-stage';
import type { NodeCatalogText } from '../node-catalog-builder';
import { incrementPipelineCounter } from '../pipeline-observability';

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

export interface NodeSelectionConstraints {
  selectedNodeConstraintsByStep?: Record<string, string[]>;
  selectedNodeConstraintsFlat?: string[];
  requiredNodeTypes?: string[];
}

// ─── Node Selection Stage ─────────────────────────────────────────────────────

export async function runNodeSelectionStage(
  intent: StructuredIntent,
  nodeCatalog: NodeCatalogText,
  correlationId?: string,
  structuralPrompt?: string,
  constraints?: NodeSelectionConstraints,
): Promise<NodeSelectionOutput> {
  const startedAt = Date.now();
  const inputSummary = `actions=${intent.actions.length}, triggerType=${intent.triggerType}`;

  logger.info({ event: 'ai_pipeline_stage_start', stage: 'node_selection', correlationId, inputSummary });

  const { systemPrompt } = systemPromptBuilder.build({
    stage: 'node_selection',
    nodeCatalog,
    userIntent: intent.intent,
    stageContext: {
      selectedNodeConstraintsByStep: constraints?.selectedNodeConstraintsByStep,
      selectedNodeConstraintsFlat: constraints?.selectedNodeConstraintsFlat,
    },
  });

  const model = 'gemini-2.5-flash';
  const temperature = 0.1;

  logger.info({ event: 'ai_pipeline_llm_call', stage: 'node_selection', correlationId, model, temperature });

  const message = `STRUCTURED_INTENT:\n${JSON.stringify(intent, null, 2)}${structuralPrompt ? `\n\nWORKFLOW_BLUEPRINT:\n${structuralPrompt}` : ''}`;

  let text: string;
  let structuredResponse: unknown;
  try {
    const raw = await geminiOrchestrator.processRequest(
      'node-suggestion',
      { system: systemPrompt, message },
      {
        model,
        temperature,
        cache: false,
        structuredOutput: {
          mimeType: 'application/json',
          schema: NODE_SELECTION_OUTPUT_SCHEMA as Record<string, unknown>,
        },
      },
    );
    structuredResponse = raw;
    text = typeof raw === 'string' ? raw : JSON.stringify(raw);
  } catch (err) {
    logger.error({ event: 'ai_pipeline_stage_error', stage: 'node_selection', correlationId, error: 'LLM_CALL_FAILED', message: String(err) });
    return { ok: false, code: 'INVALID_LLM_RESPONSE', rawResponse: String(err), durationMs: Date.now() - startedAt };
  }

  const promptTokens = Math.ceil(systemPrompt.length / 4);

  let parsed = parseNodeSelection(structuredResponse) ?? parseNodeSelection(text);

  if (!parsed) {
    incrementPipelineCounter('node_selection_structured_decode_fail');
    // Retry once with schema reminder (compat path).
    logger.warn({ event: 'ai_pipeline_stage_retry', stage: 'node_selection', correlationId, reason: 'STRUCTURED_DECODE_FAILED' });
    let text2: string;
    let raw2: unknown;
    try {
      const retryPrompt = systemPrompt + '\n\nCRITICAL: Return ONLY valid JSON. No markdown, no explanation.';
      raw2 = await geminiOrchestrator.processRequest(
        'node-suggestion',
        { system: retryPrompt, message },
        {
          model,
          temperature,
          cache: false,
          structuredOutput: {
            mimeType: 'application/json',
            schema: NODE_SELECTION_OUTPUT_SCHEMA as Record<string, unknown>,
          },
        },
      );
      text2 = typeof raw2 === 'string' ? raw2 : JSON.stringify(raw2);
    } catch (err) {
      logger.error({ event: 'ai_pipeline_stage_error', stage: 'node_selection', correlationId, error: 'LLM_RETRY_FAILED', message: String(err) });
      return { ok: false, code: 'INVALID_LLM_RESPONSE', rawResponse: String(err), durationMs: Date.now() - startedAt };
    }
    parsed = parseNodeSelection(raw2) ?? parseNodeSelection(text2);

    if (!parsed) {
      const recovered = buildDeterministicNodeSelection(intent);
      if (recovered.length === 0) {
        logger.error({ event: 'ai_pipeline_stage_error', stage: 'node_selection', correlationId, error: 'INVALID_LLM_RESPONSE', llmResponse: text2 });
        return { ok: false, code: 'INVALID_LLM_RESPONSE', rawResponse: text2, durationMs: Date.now() - startedAt };
      }
      incrementPipelineCounter('node_selection_deterministic_recovery_used');
      logger.warn({
        event: 'ai_pipeline_stage_recovered',
        stage: 'node_selection',
        correlationId,
        strategy: 'deterministic_intent_registry_recovery',
        recoveredCount: recovered.length,
      });
      parsed = recovered;
    }
  }

  const validNodes = enforceRegistrySelectionContract(parsed, correlationId, constraints);

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

function parseNodeSelection(input: unknown): Array<{ type: string; role: SelectedNode['role']; reason: string }> | null {
  if (input && typeof input === 'object') {
    return validateNodeSelectionObject(input);
  }
  if (typeof input !== 'string') {
    return null;
  }
  try {
    const cleaned = stripMarkdownFences(input);
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start === -1 || end === -1) return null;
    const obj = JSON.parse(cleaned.substring(start, end + 1));
    return validateNodeSelectionObject(obj);
  } catch {
    return null;
  }
}

function validateNodeSelectionObject(
  obj: any
): Array<{ type: string; role: SelectedNode['role']; reason: string }> | null {
  if (!obj || typeof obj !== 'object' || !Array.isArray(obj.selectedNodes)) {
    return null;
  }
  const validRoles: Array<SelectedNode['role']> = ['trigger', 'action', 'logic', 'terminal'];
  const parsed: Array<{ type: string; role: SelectedNode['role']; reason: string }> = [];
  for (const raw of obj.selectedNodes) {
    if (!raw || typeof raw !== 'object') continue;
    const type = String(raw.type || '').trim();
    const role = String(raw.role || '').trim() as SelectedNode['role'];
    const reason = String(raw.reason || '').trim();
    if (!type || !validRoles.includes(role) || !reason) continue;
    parsed.push({ type, role, reason });
  }
  return parsed.length > 0 ? parsed : null;
}

export function enforceRegistrySelectionContract(
  parsed: Array<{ type: string; role: SelectedNode['role']; reason: string }>,
  correlationId?: string,
  constraints?: NodeSelectionConstraints,
): SelectedNode[] {
  const allowedSet = new Set(
    (constraints?.selectedNodeConstraintsFlat || [])
      .map((t) => unifiedNodeRegistry.resolveAlias(t) || t)
      .filter(Boolean),
  );
  const requiredTypes = [...new Set((constraints?.requiredNodeTypes || []).map((t) => unifiedNodeRegistry.resolveAlias(t) || t).filter(Boolean))];
  const kept: SelectedNode[] = [];
  for (const node of parsed) {
    const canonical = unifiedNodeRegistry.resolveAlias(node.type) || node.type;
    const def = unifiedNodeRegistry.get(canonical);
    if (!def) {
      logger.warn({ event: 'ai_pipeline_unknown_node_type', stage: 'node_selection', correlationId, unknownType: node.type });
      continue;
    }
    if (allowedSet.size > 0 && !allowedSet.has(canonical)) {
      logger.warn({
        event: 'ai_pipeline_node_not_allowed_by_capability_selection',
        stage: 'node_selection',
        correlationId,
        nodeType: canonical,
      });
      continue;
    }
    kept.push({
      type: canonical,
      role: deriveNodeRole(canonical),
      reason: node.reason,
      nodeId: randomUUID(),
    });
  }

  // Guarantee exactly one trigger in final stage output.
  const triggerNodes = kept.filter((n) => n.role === 'trigger');
  const firstTrigger = triggerNodes[0];
  const withoutExtraTriggers = kept.filter((n, idx) => n.role !== 'trigger' || n === firstTrigger || (n.role === 'trigger' && idx === kept.indexOf(firstTrigger)));
  if (!firstTrigger) {
    const fallbackTrigger = unifiedNodeRegistry.resolveAlias('manual_trigger') || 'manual_trigger';
    if (unifiedNodeRegistry.get(fallbackTrigger)) {
      withoutExtraTriggers.unshift({
        type: fallbackTrigger,
        role: 'trigger',
        reason: 'Required trigger selected from registry',
        nodeId: randomUUID(),
      });
    }
  }
  const seen = new Set(withoutExtraTriggers.map((n) => n.type));
  for (const reqType of requiredTypes) {
    const def = unifiedNodeRegistry.get(reqType);
    if (!def) continue;
    // Branching nodes (switch, if_else) are exempt from type-deduplication —
    // multiple instances of the same branching type are required for nested workflows.
    const isBranching = def.isBranching === true;
    if (!isBranching && seen.has(reqType)) continue;
    withoutExtraTriggers.push({
      type: reqType,
      role: deriveNodeRole(reqType),
      reason: 'Required by user-confirmed capability selection',
      nodeId: randomUUID(),
    });
    seen.add(reqType);
  }
  return withoutExtraTriggers;
}

function deriveNodeRole(nodeType: string): SelectedNode['role'] {
  if (unifiedNodeRegistry.isTrigger(nodeType)) return 'trigger';
  const category = String(unifiedNodeRegistry.getCategory(nodeType) || '').toLowerCase();
  if (category === 'logic') return 'logic';
  // Use registry flag instead of hardcoded type name
  if (unifiedNodeRegistry.get(nodeType)?.workflowBehavior?.alwaysTerminal === true) return 'terminal';
  return 'action';
}

function buildDeterministicNodeSelection(
  intent: StructuredIntent
): Array<{ type: string; role: SelectedNode['role']; reason: string }> {
  const selected = new Map<string, { type: string; role: SelectedNode['role']; reason: string }>();
  const allTypes = unifiedNodeRegistry.getAllTypes();
  const triggerAlias = unifiedNodeRegistry.resolveAlias(String(intent.triggerType || '').trim()) || '';
  const fallbackTrigger =
    (triggerAlias && unifiedNodeRegistry.isTrigger(triggerAlias) && triggerAlias) ||
    (unifiedNodeRegistry.has('manual_trigger') ? 'manual_trigger' : allTypes.find((t) => unifiedNodeRegistry.isTrigger(t)) || '');

  if (fallbackTrigger) {
    selected.set(fallbackTrigger, {
      type: fallbackTrigger,
      role: 'trigger',
      reason: `Trigger derived from intent.triggerType="${intent.triggerType}"`,
    });
  }

  const actionTexts = Array.isArray(intent.actions) ? intent.actions : [];
  for (const action of actionTexts) {
    const actionText = String(action || '').trim().toLowerCase();
    if (!actionText) continue;
    let bestType = '';
    let bestScore = 0;
    for (const type of allTypes) {
      if (unifiedNodeRegistry.isTrigger(type)) continue;
      const score = scoreTypeForAction(type, actionText);
      if (score > bestScore) {
        bestScore = score;
        bestType = type;
      }
    }
    if (bestType && bestScore > 0) {
      selected.set(bestType, {
        type: bestType,
        role: deriveNodeRole(bestType),
        reason: `Matched intent action "${actionText}"`,
      });
    }
  }

  return [...selected.values()];
}

function scoreTypeForAction(type: string, actionText: string): number {
  const def: any = unifiedNodeRegistry.get(type);
  if (!def) return 0;
  const lexicon = [
    type,
    String(def.label || ''),
    ...(Array.isArray(def.tags) ? def.tags : []),
    ...(Array.isArray(def.keywords) ? def.keywords : []),
    ...(Array.isArray(def.capabilities) ? def.capabilities : []),
  ]
    .map((s) => String(s || '').toLowerCase().trim())
    .filter(Boolean);
  let score = 0;
  for (const token of lexicon) {
    if (!token) continue;
    if (actionText.includes(token)) score += 3;
    const tokenWords = token.split(/[^a-z0-9]+/).filter((w) => w.length > 2);
    for (const word of tokenWords) {
      if (actionText.includes(word)) score += 1;
    }
  }
  return score;
}
