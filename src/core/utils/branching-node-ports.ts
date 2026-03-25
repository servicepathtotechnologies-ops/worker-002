/**
 * Registry-driven outgoing port names for branching nodes whose ports depend on
 * persisted workflow node config (e.g. switch case values).
 * Single place for edge reconciliation and canvas — no mutation of UnifiedNodeDefinition at runtime.
 *
 * **Switch contract:** Edge `type` / `sourceHandle` MUST equal `cases[].value` (string).
 * The Switch `expression` must evaluate (after templates) to exactly one of those values for routing.
 */

import { unifiedNormalizeNodeTypeString } from './unified-node-type-normalizer';

/** Extract switch case values as edge port IDs (matches execute-workflow switch + legacy `rules`). */
export function extractSwitchCasePortNames(config?: Record<string, any>): string[] {
  if (!config) return [];
  try {
    const casesRaw = config.cases ?? config.rules ?? [];
    let cases: Array<{ value?: string }> = [];
    if (typeof casesRaw === 'string') {
      cases = JSON.parse(casesRaw);
    } else if (Array.isArray(casesRaw)) {
      cases = casesRaw;
    }
    return cases
      .map((c: any) => (c?.value != null ? String(c.value) : ''))
      .filter((v: string) => v.length > 0);
  } catch {
    return [];
  }
}

/**
 * Effective outgoing branch ports for a workflow node instance.
 * @param fallbackPorts from UnifiedNodeDefinition.outgoingPorts when config does not specialize ports
 */
export function getBranchOutgoingPortsForNode(
  nodeTypeRaw: string | undefined,
  config: Record<string, any> | undefined,
  fallbackPorts: string[]
): string[] {
  const nodeType = unifiedNormalizeNodeTypeString(nodeTypeRaw || '');
  if (nodeType === 'if_else') {
    return ['true', 'false'];
  }
  if (nodeType === 'switch') {
    const fromConfig = extractSwitchCasePortNames(config);
    if (fromConfig.length > 0) {
      return fromConfig;
    }
    const safeFallback =
      Array.isArray(fallbackPorts) && fallbackPorts.length > 0 ? fallbackPorts : ['output'];
    return safeFallback;
  }
  return fallbackPorts;
}
