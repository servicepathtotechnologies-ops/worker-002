import { AsyncLocalStorage } from 'async_hooks';

const executionIdAls = new AsyncLocalStorage<string>();

export type ExecutionUsageStageMap = Record<string, { calls: number; tokens: number }>;
type ExecutionUsage = { calls: number; tokens: number; stages: ExecutionUsageStageMap };

const usageMap = new Map<string, ExecutionUsage>();

function getRuntimeAiMaxCalls(): number {
  const n = Number.parseInt(process.env.WORKFLOW_RUNTIME_AI_MAX_CALLS || '2', 10);
  return Number.isFinite(n) && n >= 0 ? n : 2;
}

function getRuntimeAiTokenBudget(): number {
  const n = Number.parseInt(process.env.WORKFLOW_RUNTIME_AI_TOKEN_BUDGET || '25000', 10);
  return Number.isFinite(n) && n >= 0 ? n : 25000;
}

function isBudgetedRuntimeStage(stage?: string): boolean {
  return stage === 'runtime_input_resolution' || stage === 'runtime_autofill';
}

/**
 * Call once after executionId is established.
 * Uses enterWith() so the context propagates through all subsequent async calls
 * in the same request chain, including LLM adapter calls made by AI nodes.
 */
export function startExecutionTracking(executionId: string): void {
  usageMap.set(executionId, { calls: 0, tokens: 0, stages: {} });
  executionIdAls.enterWith(executionId);
}

export function getActiveExecutionId(): string | undefined {
  return executionIdAls.getStore();
}

export function canStartExecutionLlmCall(stage?: string): boolean {
  if (!isBudgetedRuntimeStage(stage)) return true;
  const executionId = executionIdAls.getStore();
  if (!executionId) return true;
  const usage = usageMap.get(executionId);
  if (!usage) return true;
  return usage.calls < getRuntimeAiMaxCalls() && usage.tokens < getRuntimeAiTokenBudget();
}

/** Called by llm-adapter for every LLM completion. No-op if no active execution context. */
export function recordExecutionLlmUsage(totalTokens: number, stage = 'runtime_llm'): void {
  const executionId = executionIdAls.getStore();
  if (!executionId) return;
  const usage = usageMap.get(executionId);
  if (usage) {
    usage.calls += 1;
    usage.tokens += totalTokens;
    const stageKey = stage || 'runtime_llm';
    usage.stages[stageKey] = usage.stages[stageKey] || { calls: 0, tokens: 0 };
    usage.stages[stageKey].calls += 1;
    usage.stages[stageKey].tokens += totalTokens;
  }
}

/** Retrieve and clear accumulated usage. Returns zeroes if tracking was never started. */
export function getAndClearExecutionUsage(executionId: string): {
  calls: number;
  tokens: number;
  stages: ExecutionUsageStageMap;
} {
  const usage = usageMap.get(executionId) ?? { calls: 0, tokens: 0, stages: {} };
  usageMap.delete(executionId);
  return usage;
}
