/**
 * Detect whether upstream JSON is too thin to drive runtime AI mapping.
 * Manual trigger and similar nodes often emit only metadata (_trigger) or empty inputData;
 * Object.keys().length > 0 would incorrectly skip the config-only resolution path.
 */

function isMeaningfulLeafValue(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (typeof value === 'number' || typeof value === 'boolean') return true;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'object') return Object.keys(value as Record<string, unknown>).length > 0;
  return true;
}

/**
 * True when there is no substantive payload from upstream (only trigger/meta/empty inputData).
 */
export function isEffectivelyEmptyUpstreamPayload(output: unknown): boolean {
  if (output === null || output === undefined) return true;
  if (Array.isArray(output)) return output.length === 0;
  if (typeof output !== 'object') {
    return !isMeaningfulLeafValue(output);
  }

  const obj = output as Record<string, unknown>;
  for (const [key, value] of Object.entries(obj)) {
    // Convention: leading underscore = runtime/meta (not user data)
    if (key.startsWith('_')) {
      continue;
    }
    if (key === 'inputData') {
      if (value === null || value === undefined) continue;
      if (typeof value === 'string' && value.trim() === '') continue;
      if (Array.isArray(value) && value.length === 0) continue;
      if (typeof value === 'object' && !Array.isArray(value) && Object.keys(value as object).length === 0) {
        continue;
      }
      return false;
    }
    if (isMeaningfulLeafValue(value)) {
      return false;
    }
  }
  return true;
}

/**
 * Keys that may appear alone on trigger/schedule/interval outputs without carrying user narrative
 * (e.g. `{ executed_at }` after schedule). Downstream runtime_ai nodes should treat this like a
 * thin upstream: use workflow intent + config, not full AI mapping on timestamps.
 */
const UPSTREAM_SOLO_NON_NARRATIVE_KEYS = new Set([
  'executed_at',
  'scheduled_at',
  'started_at',
  'finished_at',
  'timestamp',
  'cron',
  'timezone',
  'time_zone',
  'next_run',
  'next_run_at',
  'last_run',
  'last_run_at',
  'interval',
  'interval_ms',
  'interval_seconds',
  'trigger_type',
  'trigger',
  'run_id',
  'execution_id',
  'fire_count',
  'skipped',
  'status',
]);

/**
 * True when upstream is empty OR only contains underscore meta / empty inputData / scheduling-only primitives.
 * Does not match payloads that include any key outside {@link UPSTREAM_SOLO_NON_NARRATIVE_KEYS} (except _* / inputData).
 */
export function isUpstreamNarrativelyThinForRuntimeAi(output: unknown): boolean {
  if (isEffectivelyEmptyUpstreamPayload(output)) return true;
  if (output === null || typeof output !== 'object' || Array.isArray(output)) {
    return false;
  }

  const obj = output as Record<string, unknown>;

  const inputData = obj.inputData;
  if (inputData != null && typeof inputData === 'object' && !Array.isArray(inputData)) {
    if (Object.keys(inputData as object).length > 0) return false;
  }
  if (Array.isArray(inputData) && inputData.length > 0) return false;
  if (typeof inputData === 'string' && inputData.trim().length > 0) return false;

  const keys = Object.keys(obj).filter((k) => !k.startsWith('_') && k !== 'inputData');
  if (keys.length === 0) return true;

  for (const k of keys) {
    if (!UPSTREAM_SOLO_NON_NARRATIVE_KEYS.has(k)) {
      return false;
    }
    const v = obj[k];
    if (v != null && typeof v === 'object') {
      return false;
    }
  }
  return true;
}
