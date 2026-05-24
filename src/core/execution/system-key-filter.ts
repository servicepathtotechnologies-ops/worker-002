/**
 * System Key Filter
 *
 * Strips internal observability/metadata keys from upstream payloads before
 * they are used as context for AI resolution or key-alias matching.
 * This prevents audit objects and routing config from leaking into downstream
 * nodes as if they were real business data.
 */

/** Keys that are execution-observability / audit metadata, never user business data. */
export const SYSTEM_META_KEYS = new Set<string>([
  'nodeId',
  'nodeType',
  'rollout',
  'kpis',
  'runtimeMarker',
  'runtimeFields',
  'runtimeOwnedFields',
  'runtimeResolvedFields',
  'runtimeResolutionErrors',
  'unresolvedRuntimeFields',
  'resolvedRuntimeFields',
  'schemaValidationFailures',
  'canonicalizationIssues',
  'capturedAt',
  'submitted_at',
  'sources',
  'form',
  'meta',
  'files',
  'fields',
  'fallbackPublishRate',
  'unresolvedRuntimeFieldsRate',
  'strictValidation',
  'contractV2',
  'auditOnly',
]);

/** Keys that are switch/if_else routing internals, not user business data. */
export const ROUTING_INTERNAL_KEYS = new Set<string>([
  'expression',
  'expressionValue',
  'cases',
  'rules',
  'routingType',
  'matchedCase',
  'matchedLabel',
  'condition',
  'condition_result',
  'fallbackApplied',
  'outputFallbackUsed',
  '_switchRecoveredVia',
]);

/**
 * Strip system metadata and `__`-prefixed audit keys from an upstream payload
 * before it is passed to AI resolvers or key-alias matching.
 */
export function stripSystemKeys(obj: unknown): Record<string, unknown> {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return {};
  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    if (k.startsWith('__')) continue;
    if (SYSTEM_META_KEYS.has(k)) continue;
    result[k] = v;
  }
  return result;
}

/**
 * Strip routing-internal keys from a branching node's upstream payload
 * so downstream nodes only see actual business data in `$json`.
 */
export function stripRoutingMeta(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (!ROUTING_INTERNAL_KEYS.has(k)) result[k] = v;
  }
  return result;
}
