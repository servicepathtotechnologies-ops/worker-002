const COUNTER_KEYS = [
  'node_selection_structured_decode_fail',
  'node_selection_deterministic_recovery_used',
  'normalizer_startup_unknown_aggregated',
  'normalizer_runtime_unknown_total',
] as const;

export type PipelineCounterKey = (typeof COUNTER_KEYS)[number];

const counters: Record<PipelineCounterKey, number> = {
  node_selection_structured_decode_fail: 0,
  node_selection_deterministic_recovery_used: 0,
  normalizer_startup_unknown_aggregated: 0,
  normalizer_runtime_unknown_total: 0,
};

export function incrementPipelineCounter(key: PipelineCounterKey, by: number = 1): number {
  const delta = Number.isFinite(by) ? by : 1;
  counters[key] = Math.max(0, counters[key] + delta);
  return counters[key];
}

export function getPipelineCounters(): Record<PipelineCounterKey, number> {
  return { ...counters };
}

export function resetPipelineCounters(): void {
  for (const key of COUNTER_KEYS) {
    counters[key] = 0;
  }
}
