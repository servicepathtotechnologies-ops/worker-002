import { AsyncLocalStorage } from 'async_hooks';

const executionIdAls = new AsyncLocalStorage<string>();

export type ExecutionUsageStageMap = Record<string, { calls: number; tokens: number }>;

export function startExecutionTracking(_executionId: string): void {
  // tracking removed
}

export function getActiveExecutionId(): string | undefined {
  return executionIdAls.getStore();
}

export function canStartExecutionLlmCall(_stage?: string): boolean {
  return true;
}

export function recordExecutionLlmUsage(_totalTokens: number, _stage?: string): void {
  // tracking removed
}

export function getAndClearExecutionUsage(_executionId: string): {
  calls: number;
  tokens: number;
  stages: ExecutionUsageStageMap;
} {
  return { calls: 0, tokens: 0, stages: {} };
}
