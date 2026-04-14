/**
 * Structural Prompt Stage — AI-First Pipeline (Stage 2)
 *
 * Generates a plain-language blueprint of the workflow between intent extraction
 * and node selection. The blueprint describes which nodes are needed, how they
 * connect, and what each does in the context of the user's goal.
 *
 * This shared context is passed to all downstream stages (node-selection,
 * edge-reasoning, validation) to improve coherence across the pipeline.
 *
 * Requirements: 2.5
 */

import { geminiOrchestrator } from '../gemini-orchestrator';
import { logger } from '../../../core/logger';
import type { StructuredIntent } from './intent-stage';
import type { NodeCatalogText } from '../node-catalog-builder';
import {
  parseStructuralBlueprintContract,
  type StructuralBlueprintContract,
} from '../structural-blueprint-contract';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface StructuralPromptResult {
  ok: true;
  structuralPrompt: string;
  structuralContract: StructuralBlueprintContract;
  durationMs: number;
  llmCall: { model: string; temperature: number; promptTokens: number; completionTokens: number };
}

export interface StructuralPromptError {
  ok: false;
  code: 'INVALID_LLM_RESPONSE' | 'INVALID_STRUCTURAL_CONTRACT';
  rawResponse: string;
  durationMs: number;
}

export type StructuralPromptOutput = StructuralPromptResult | StructuralPromptError;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Extract plain text from LLM response — handles string, object with .text/.content, or JSON */
function extractText(raw: unknown): string {
  if (typeof raw === 'string') return raw;
  if (raw && typeof raw === 'object') {
    const r = raw as Record<string, unknown>;
    if (typeof r.text === 'string') return r.text;
    if (typeof r.content === 'string') return r.content;
  }
  return '';
}

function parseContractOrNull(text: string): StructuralBlueprintContract | null {
  return parseStructuralBlueprintContract(text);
}

// ─── Structural Prompt Stage ──────────────────────────────────────────────────

export async function runStructuralPromptStage(
  intent: StructuredIntent,
  nodeCatalog: NodeCatalogText,
  correlationId?: string,
): Promise<StructuralPromptOutput> {
  const startedAt = Date.now();
  logger.info({
    event: 'ai_pipeline_stage_start',
    stage: 'structural_prompt',
    correlationId,
    inputSummary: `actions=${intent.actions.length}`,
  });

  const model = 'gemini-2.5-flash';
  const temperature = 0.2;

  const systemPrompt = `You are a deterministic workflow architect.

Given STRUCTURED_INTENT and NODE_CATALOG, produce a strict architecture blueprint that is implementation-ready.

Return ONLY plain text with exactly these sections and headers:

ARCHITECTURE_ORDER:
- ordered list of nodes from trigger to terminals, one node per line as:
  "<index>. <nodeType> - <purpose>"

BRANCHING_RULES:
- explicit branch conditions and thresholds from user intent (e.g. amount > 5000)
- each branch path must name target node sequence
- if no branching needed, output "none"

DATA_FLOW_MAP:
- explicit source -> target mappings, one per line:
  "<fromNode>.<outputField> -> <toNode>.<inputField> (<why>)"
- include transformed values and derived fields when relevant

FIELD_OWNERSHIP_PLAN:
- list important fields and classify as:
  "manual_static", "buildtime_ai_once", or "runtime_ai"
- include structural fields (conditions, cases, form fields) and credential fields
- never leave required structural fields unspecified

VALIDATION_CHECKS:
- list concrete checks for graph correctness (single trigger, reachable nodes, no orphan branch)
- list execution checks (required values present before run)

Constraints:
- no JSON
- no markdown tables
- do not output generic narrative
- be specific to the provided intent and node catalog`;

  const message = `STRUCTURED_INTENT:\n${JSON.stringify(intent, null, 2)}\n\nNODE_CATALOG:\n${nodeCatalog}`;
  const promptTokens = Math.ceil((systemPrompt.length + message.length) / 4);

  logger.info({ event: 'ai_pipeline_llm_call', stage: 'structural_prompt', correlationId, model, temperature });

  let text: string;
  try {
    const raw = await geminiOrchestrator.processRequest(
      'workflow-generation',
      { system: systemPrompt, message },
      { model, temperature, cache: false },
    );
    text = extractText(raw);
  } catch (err) {
    logger.error({ event: 'ai_pipeline_stage_error', stage: 'structural_prompt', correlationId, error: 'LLM_CALL_FAILED', message: String(err) });
    return { ok: false, code: 'INVALID_LLM_RESPONSE', rawResponse: String(err), durationMs: Date.now() - startedAt };
  }

  const parsedFirst = parseContractOrNull(text || '');
  if (!text || text.trim().length === 0 || !parsedFirst) {
    // Retry once with explicit reminder
    logger.warn({ event: 'ai_pipeline_stage_retry', stage: 'structural_prompt', correlationId });
    let text2: string;
    try {
      const raw2 = await geminiOrchestrator.processRequest(
        'workflow-generation',
        {
          system:
            systemPrompt +
            '\n\nCRITICAL: Return all required sections with concrete node/field details. Do not return a generic paragraph.',
          message,
        },
        { model, temperature, cache: false },
      );
      text2 = extractText(raw2);
    } catch (err) {
      logger.error({ event: 'ai_pipeline_stage_error', stage: 'structural_prompt', correlationId, error: 'LLM_RETRY_FAILED', message: String(err) });
      return { ok: false, code: 'INVALID_LLM_RESPONSE', rawResponse: String(err), durationMs: Date.now() - startedAt };
    }

    const parsedSecond = parseContractOrNull(text2 || '');
    if (!text2 || text2.trim().length === 0 || !parsedSecond) {
      logger.error({ event: 'ai_pipeline_stage_error', stage: 'structural_prompt', correlationId, error: 'INVALID_LLM_RESPONSE' });
      return {
        ok: false,
        code: text2 && text2.trim().length > 0 ? 'INVALID_STRUCTURAL_CONTRACT' : 'INVALID_LLM_RESPONSE',
        rawResponse: text2 ?? '',
        durationMs: Date.now() - startedAt,
      };
    }

    const durationMs2 = Date.now() - startedAt;
    logger.info({ event: 'ai_pipeline_stage_end', stage: 'structural_prompt', correlationId, outputSummary: `len=${text2.length}`, durationMs: durationMs2 });
    return {
      ok: true,
      structuralPrompt: text2.trim(),
      structuralContract: parsedSecond,
      durationMs: durationMs2,
      llmCall: { model, temperature, promptTokens, completionTokens: Math.ceil(text2.length / 4) },
    };
  }

  const durationMs = Date.now() - startedAt;
  logger.info({ event: 'ai_pipeline_stage_end', stage: 'structural_prompt', correlationId, outputSummary: `len=${text.length}`, durationMs });

  return {
    ok: true,
    structuralPrompt: text.trim(),
    structuralContract: parsedFirst,
    durationMs,
    llmCall: { model, temperature, promptTokens, completionTokens: Math.ceil(text.length / 4) },
  };
}
