import { AsyncLocalStorage } from 'async_hooks';

export type BuildAiUsageCall = {
  at: string;
  provider: string;
  model: string;
  stage: string;
  source?: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
};

export type BuildAiUsageTotals = {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  callCount: number;
};

export type BuildAiUsageSnapshot = {
  calls: BuildAiUsageCall[];
  totals: BuildAiUsageTotals;
  byStage: Record<
    string,
    { promptTokens: number; completionTokens: number; totalTokens: number; callCount: number }
  >;
};

type Store = {
  calls: BuildAiUsageCall[];
};

const als = new AsyncLocalStorage<Store>();

function emptyTotals(): BuildAiUsageTotals {
  return { promptTokens: 0, completionTokens: 0, totalTokens: 0, callCount: 0 };
}

function addToTotals(
  t: BuildAiUsageTotals,
  prompt: number,
  completion: number,
  total: number
): void {
  t.promptTokens += prompt;
  t.completionTokens += completion;
  t.totalTokens += total;
  t.callCount += 1;
}

export function runWithBuildUsageTracking<T>(fn: () => T | Promise<T>): T | Promise<T> {
  return als.run({ calls: [] }, fn);
}

export function getBuildUsageStore(): Store | undefined {
  return als.getStore();
}

export function recordLlmUsage(params: {
  provider: string;
  model: string;
  usage?: { promptTokens: number; completionTokens: number; totalTokens: number };
  stage?: string;
  source?: string;
}): void {
  const store = als.getStore();
  if (!store || !params.usage) {
    return;
  }
  const { promptTokens, completionTokens, totalTokens } = params.usage;
  const call: BuildAiUsageCall = {
    at: new Date().toISOString(),
    provider: params.provider,
    model: params.model,
    stage: params.stage?.trim() || 'llm',
    source: params.source,
    promptTokens,
    completionTokens,
    totalTokens,
  };
  store.calls.push(call);
}

/** Snapshot current request accumulation (empty if no active tracking context). */
export function snapshotBuildAiUsage(): BuildAiUsageSnapshot {
  const store = als.getStore();
  if (!store || store.calls.length === 0) {
    return { calls: [], totals: emptyTotals(), byStage: {} };
  }

  const totals = emptyTotals();
  const byStage: BuildAiUsageSnapshot['byStage'] = {};

  for (const c of store.calls) {
    addToTotals(totals, c.promptTokens, c.completionTokens, c.totalTokens);
    if (!byStage[c.stage]) {
      byStage[c.stage] = { promptTokens: 0, completionTokens: 0, totalTokens: 0, callCount: 0 };
    }
    addToTotals(byStage[c.stage], c.promptTokens, c.completionTokens, c.totalTokens);
  }

  return { calls: [...store.calls], totals, byStage };
}

export type PersistedBuildAiUsage = BuildAiUsageSnapshot & {
  lastUpdatedAt: string;
};

/** Merge a new snapshot into existing metadata.buildAiUsage (cumulative across generate + attach-inputs). */
export function mergePersistedBuildAiUsage(
  existing: unknown,
  delta: BuildAiUsageSnapshot
): PersistedBuildAiUsage {
  const prev = existing && typeof existing === 'object' && 'totals' in (existing as object)
    ? (existing as PersistedBuildAiUsage)
    : null;

  const baseTotals = prev?.totals ?? emptyTotals();
  const nextTotals: BuildAiUsageTotals = {
    promptTokens: baseTotals.promptTokens + delta.totals.promptTokens,
    completionTokens: baseTotals.completionTokens + delta.totals.completionTokens,
    totalTokens: baseTotals.totalTokens + delta.totals.totalTokens,
    callCount: baseTotals.callCount + delta.totals.callCount,
  };

  const prevByStage = prev?.byStage ?? {};
  const nextByStage: BuildAiUsageSnapshot['byStage'] = { ...prevByStage };
  for (const [stage, st] of Object.entries(delta.byStage)) {
    const p = nextByStage[stage] ?? emptyTotals();
    nextByStage[stage] = {
      promptTokens: p.promptTokens + st.promptTokens,
      completionTokens: p.completionTokens + st.completionTokens,
      totalTokens: p.totalTokens + st.totalTokens,
      callCount: p.callCount + st.callCount,
    };
  }

  const prevCalls = Array.isArray(prev?.calls) ? prev!.calls : [];
  const calls = [...prevCalls, ...delta.calls];

  return {
    calls,
    totals: nextTotals,
    byStage: nextByStage,
    lastUpdatedAt: new Date().toISOString(),
  };
}
