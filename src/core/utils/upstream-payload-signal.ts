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
