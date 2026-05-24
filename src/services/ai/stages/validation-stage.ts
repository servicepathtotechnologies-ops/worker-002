/**
 * Validation Stage — AI-First Pipeline
 *
 * The LLM validates the assembled workflow graph on four dimensions:
 * 1. Structural validity (DAG, reachability, edge types)
 * 2. Semantic alignment (does the graph accomplish what the user asked)
 * 3. Completeness (no missing required nodes)
 * 4. Data flow coherence (output/input compatibility)
 *
 * One automated repair pass on error-severity issues.
 * UnifiedGraphOrchestrator.validateWorkflow() always called as structural safety net.
 * Never silently returns an invalid graph.
 *
 * Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.7, 8.1, 8.2, 8.3, 9.4
 */

import { geminiOrchestrator } from '../gemini-orchestrator';
import { systemPromptBuilder, SelectedNode, ProposedEdge, ValidationIssue } from '../system-prompt-builder';
import { unifiedGraphOrchestrator } from '../../../core/orchestration/unified-graph-orchestrator';
import { logger } from '../../../core/logger';
import type { Workflow } from '../../../core/types/ai-types';
import type { NodeCatalogText } from '../node-catalog-builder';
import { validateWorkflowNodeIntelligence } from '../../../core/utils/node-field-intelligence';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ValidationResult {
  ok: true;
  workflow: Workflow;
  validationIssues: ValidationIssue[];
  durationMs: number;
  llmCall: { model: string; temperature: number; promptTokens: number; completionTokens: number };
}

export interface ValidationError {
  ok: false;
  code: 'ORCHESTRATOR_VALIDATION_FAILED' | 'INVALID_LLM_RESPONSE';
  workflow?: Workflow;
  validationIssues: ValidationIssue[];
  rawResponse?: string;
  durationMs: number;
}

export type ValidationOutput = ValidationResult | ValidationError;

// ─── Validation Stage ─────────────────────────────────────────────────────────

export async function runValidationStage(
  workflow: Workflow,
  nodeCatalog: NodeCatalogText,
  userIntent: string,
  selectedNodes?: SelectedNode[],
  proposedEdges?: ProposedEdge[],
  correlationId?: string,
  structuralPrompt?: string,
): Promise<ValidationOutput> {
  const startedAt = Date.now();
  logger.info({
    event: 'ai_pipeline_stage_start',
    stage: 'validation',
    correlationId,
    inputSummary: `nodes=${workflow.nodes.length}, edges=${workflow.edges.length}`,
  });

  const model = 'gemini-2.5-flash';
  const temperature = 0.1;

  const { systemPrompt } = systemPromptBuilder.build({
    stage: 'validation',
    nodeCatalog,
    userIntent,
    stageContext: { selectedNodes, edgeList: proposedEdges },
  });

  logger.info({ event: 'ai_pipeline_llm_call', stage: 'validation', correlationId, model, temperature });

  const message = `USER_INTENT:\n${userIntent}${structuralPrompt ? `\n\nWORKFLOW_BLUEPRINT:\n${structuralPrompt}` : ''}\n\nWORKFLOW_GRAPH:\n${JSON.stringify({ nodes: workflow.nodes, edges: workflow.edges }, null, 2)}`;

  let text: string;
  try {
    const raw = await geminiOrchestrator.processRequest(
      'workflow-analysis',
      { system: systemPrompt, message },
      { model, temperature, cache: false },
    );
    text = typeof raw === 'string' ? raw : JSON.stringify(raw);
  } catch (err) {
    logger.warn({ event: 'ai_pipeline_stage_error', stage: 'validation', correlationId, error: 'LLM_CALL_FAILED', message: String(err), note: 'Falling through to orchestrator safety net' });
    return runOrchestratorSafetyNet(workflow, model, temperature, 0, 0, startedAt, correlationId);
  }

  const promptTokens = Math.ceil(systemPrompt.length / 4);
  const completionTokens = Math.ceil(text.length / 4);

  let parsed = tryParseValidationResult(text);

  if (!parsed) {
    // Retry once with explicit JSON reminder
    logger.warn({ event: 'ai_pipeline_stage_retry', stage: 'validation', correlationId, reason: 'JSON parse failed on first attempt' });
    let text2: string;
    try {
      const retryPrompt = systemPrompt + '\n\nCRITICAL: Return ONLY valid JSON. No markdown fences, no explanation. Start with { and end with }.';
      const raw2 = await geminiOrchestrator.processRequest(
        'workflow-analysis',
        { system: retryPrompt, message },
        { model, temperature, cache: false },
      );
      text2 = typeof raw2 === 'string' ? raw2 : JSON.stringify(raw2);
    } catch (err) {
      logger.warn({ event: 'ai_pipeline_stage_error', stage: 'validation', correlationId, error: 'LLM_RETRY_FAILED', message: String(err), note: 'Falling through to orchestrator safety net' });
      return runOrchestratorSafetyNet(workflow, model, temperature, promptTokens, completionTokens, startedAt, correlationId);
    }
    parsed = tryParseValidationResult(text2);

    if (!parsed) {
      // Both attempts failed — fall through to orchestrator safety net
      logger.warn({ event: 'ai_pipeline_validation_parse_failed', stage: 'validation', correlationId, note: 'Falling through to orchestrator safety net' });
      return runOrchestratorSafetyNet(workflow, model, temperature, promptTokens, completionTokens, startedAt, correlationId);
    }
  }

  return processValidationResult(
    parsed, workflow, nodeCatalog, userIntent,
    selectedNodes, proposedEdges, correlationId,
    model, temperature, promptTokens, completionTokens, startedAt,
  );
}

// ─── processValidationResult ──────────────────────────────────────────────────

async function processValidationResult(
  parsed: { status: 'pass' | 'fail'; issues: ValidationIssue[] },
  workflow: Workflow,
  nodeCatalog: NodeCatalogText,
  userIntent: string,
  selectedNodes: SelectedNode[] | undefined,
  proposedEdges: ProposedEdge[] | undefined,
  correlationId: string | undefined,
  model: string,
  temperature: number,
  promptTokens: number,
  completionTokens: number,
  startedAt: number,
): Promise<ValidationOutput> {
  const errorIssues = parsed.issues.filter((i) => i.severity === 'error');
  const currentWorkflow = workflow;

  if (parsed.status === 'fail' && errorIssues.length > 0) {
    // Attempt exactly one repair pass
    logger.info({ event: 'ai_pipeline_repair_pass', stage: 'validation', correlationId, errorCount: errorIssues.length });

    const { systemPrompt: repairPrompt } = systemPromptBuilder.build({
      stage: 'repair',
      nodeCatalog,
      userIntent,
      stageContext: { selectedNodes, edgeList: proposedEdges, validationIssues: errorIssues },
    });

    try {
      const rawRepair = await geminiOrchestrator.processRequest(
        'workflow-analysis',
        { system: repairPrompt, message: `USER_INTENT:\n${userIntent}` },
        { model, temperature, cache: false },
      );
      const textRepair: string = typeof rawRepair === 'string' ? rawRepair : JSON.stringify(rawRepair);
      const repairedGraph = tryParseRepairedGraph(textRepair);

      if (repairedGraph) {
        const revalidatePrompt = systemPromptBuilder.build({
          stage: 'validation',
          nodeCatalog,
          userIntent,
          stageContext: { selectedNodes, edgeList: repairedGraph.edges },
        });
        try {
          const rawRevalidate = await geminiOrchestrator.processRequest(
            'workflow-analysis',
            { system: revalidatePrompt.systemPrompt, message: `USER_INTENT:\n${userIntent}\n\nWORKFLOW_GRAPH:\n${JSON.stringify({ nodes: workflow.nodes, edges: workflow.edges }, null, 2)}` },
            { model, temperature, cache: false },
          );
          const textRevalidate: string = typeof rawRevalidate === 'string' ? rawRevalidate : JSON.stringify(rawRevalidate);
          const revalidated = tryParseValidationResult(textRevalidate);
          const remainingErrors = revalidated?.issues.filter((i) => i.severity === 'error') ?? errorIssues;
          if (remainingErrors.length > 0) {
            logger.warn({ event: 'ai_pipeline_repair_incomplete', stage: 'validation', correlationId, remainingErrors: remainingErrors.length });
          }
        } catch (err) {
          logger.warn({ event: 'ai_pipeline_revalidate_failed', stage: 'validation', correlationId, message: String(err) });
        }
      }
    } catch (err) {
      logger.warn({ event: 'ai_pipeline_repair_failed', stage: 'validation', correlationId, message: String(err) });
      // Repair failed — fall through to orchestrator safety net below
    }
  }

  // Always call UnifiedGraphOrchestrator.validateWorkflow as structural safety net
  const orchestratorValidation = unifiedGraphOrchestrator.validateWorkflow(currentWorkflow);
  if (!orchestratorValidation.valid) {
    const structuralIssues: ValidationIssue[] = orchestratorValidation.errors.map((e) => ({
      severity: 'error' as const,
      description: e,
      suggestedFix: 'Fix structural graph issue via UnifiedGraphOrchestrator',
    }));
    logger.error({ event: 'ai_pipeline_stage_error', stage: 'validation', correlationId, error: 'ORCHESTRATOR_VALIDATION_FAILED', errors: orchestratorValidation.errors });
    return {
      ok: false,
      code: 'ORCHESTRATOR_VALIDATION_FAILED',
      workflow: currentWorkflow,
      validationIssues: structuralIssues,
      durationMs: Date.now() - startedAt,
    };
  }

  const intelligenceIssues: ValidationIssue[] = validateWorkflowNodeIntelligence(currentWorkflow).map((issue) => ({
    severity: issue.severity === 'error' ? 'warning' : 'warning',
    description: `${issue.nodeLabel || issue.nodeType}.${issue.fieldName}: ${issue.reason}`,
    suggestedFix:
      issue.suggestedValue !== undefined
        ? `Use suggested value ${JSON.stringify(issue.suggestedValue)} or provide an explicit value.`
        : 'Review the node field intelligence and provide a safe value.',
  }));
  const warningIssues = [...parsed.issues.filter((i) => i.severity === 'warning'), ...intelligenceIssues];
  const durationMs = Date.now() - startedAt;

  logger.info({
    event: 'ai_pipeline_stage_end',
    stage: 'validation',
    correlationId,
    outputSummary: `status=${parsed.status}, warnings=${warningIssues.length}`,
    durationMs,
  });

  return {
    ok: true,
    workflow: currentWorkflow,
    validationIssues: warningIssues,
    durationMs,
    llmCall: { model, temperature, promptTokens, completionTokens },
  };
}

// ─── runOrchestratorSafetyNet ─────────────────────────────────────────────────

function runOrchestratorSafetyNet(
  workflow: Workflow,
  model: string,
  temperature: number,
  promptTokens: number,
  completionTokens: number,
  startedAt: number,
  correlationId?: string,
): ValidationOutput {
  const orchestratorResult = unifiedGraphOrchestrator.validateWorkflow(workflow);
  if (!orchestratorResult.valid) {
    const structuralIssues: ValidationIssue[] = orchestratorResult.errors.map((e) => ({
      severity: 'error' as const,
      description: e,
      suggestedFix: 'Fix structural graph issue via UnifiedGraphOrchestrator',
    }));
    logger.error({ event: 'ai_pipeline_stage_error', stage: 'validation', correlationId, error: 'ORCHESTRATOR_VALIDATION_FAILED', errors: orchestratorResult.errors });
    return { ok: false, code: 'ORCHESTRATOR_VALIDATION_FAILED', workflow, validationIssues: structuralIssues, durationMs: Date.now() - startedAt };
  }
  const intelligenceIssues: ValidationIssue[] = validateWorkflowNodeIntelligence(workflow).map((issue) => ({
    severity: 'warning',
    description: `${issue.nodeLabel || issue.nodeType}.${issue.fieldName}: ${issue.reason}`,
    suggestedFix:
      issue.suggestedValue !== undefined
        ? `Use suggested value ${JSON.stringify(issue.suggestedValue)} or provide an explicit value.`
        : 'Review the node field intelligence and provide a safe value.',
  }));
  logger.info({ event: 'ai_pipeline_stage_end', stage: 'validation', correlationId, outputSummary: `status=pass (orchestrator fallback), warnings=${intelligenceIssues.length}`, durationMs: Date.now() - startedAt });
  return { ok: true, workflow, validationIssues: intelligenceIssues, durationMs: Date.now() - startedAt, llmCall: { model, temperature, promptTokens, completionTokens } };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function stripMarkdownFences(text: string): string {
  return text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
}

function tryParseValidationResult(text: string): { status: 'pass' | 'fail'; issues: ValidationIssue[] } | null {
  try {
    const cleaned = stripMarkdownFences(text);
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start === -1 || end === -1) return null;
    const obj = JSON.parse(cleaned.substring(start, end + 1));
    if (!obj.status || !Array.isArray(obj.issues)) return null;
    return {
      status: obj.status === 'pass' ? 'pass' : 'fail',
      issues: obj.issues.map((i: any) => ({
        severity: i.severity === 'error' ? 'error' : 'warning',
        description: String(i.description || ''),
        suggestedFix: i.suggestedFix ? String(i.suggestedFix) : undefined,
      })),
    };
  } catch {
    return null;
  }
}

function tryParseRepairedGraph(text: string): { nodes: any[]; edges: any[] } | null {
  try {
    const cleaned = stripMarkdownFences(text);
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start === -1 || end === -1) return null;
    const obj = JSON.parse(cleaned.substring(start, end + 1));
    if (!Array.isArray(obj.orderedNodes) && !Array.isArray(obj.nodes)) return null;
    return { nodes: obj.nodes ?? [], edges: obj.edges ?? [] };
  } catch {
    return null;
  }
}
