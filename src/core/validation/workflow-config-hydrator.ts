/**
 * After graph build / materialize, ensure required inputs that have registry defaults
 * are never persisted as empty objects/strings (e.g. ai_agent.chat_model === {}).
 */

import type { Workflow } from '../types/ai-types';
import { unifiedNodeRegistry } from '../registry/unified-node-registry';
import { unifiedNormalizeNodeType } from '../utils/unified-node-type-normalizer';
import { isEmptyConfigValue } from './registry-field-contract';

export function hydrateRequiredConfigFromRegistryDefaults(workflow: Workflow): Workflow {
  let anyChanged = false;
  const nodes = (workflow.nodes || []).map((node) => {
    const nodeType = unifiedNormalizeNodeType(node);
    const def = unifiedNodeRegistry.get(nodeType);
    if (!def) return node;

    const defaults = def.defaultConfig() as Record<string, unknown>;
    const config = { ...(node.data?.config || {}) } as Record<string, unknown>;
    let changed = false;

    const tryFill = (fieldName: string) => {
      const fillModeMap = (config?._fillMode || {}) as Record<string, unknown>;
      const mode = fillModeMap[fieldName];
      // Runtime-owned values are expected to resolve during execution and should not
      // be default-hydrated at build/save time.
      if (mode === 'runtime_ai') return;
      if (!isEmptyConfigValue(config[fieldName])) return;
      const d = defaults[fieldName];
      if (!isEmptyConfigValue(d)) {
        config[fieldName] =
          typeof d === 'object' && d !== null && !Array.isArray(d)
            ? { ...(d as Record<string, unknown>) }
            : d;
        changed = true;
        return;
      }
      const fieldSchema = def.inputSchema?.[fieldName] as { default?: unknown } | undefined;
      const fdDefault = fieldSchema?.default;
      if (!isEmptyConfigValue(fdDefault)) {
        config[fieldName] =
          typeof fdDefault === 'object' && fdDefault !== null && !Array.isArray(fdDefault)
            ? { ...(fdDefault as Record<string, unknown>) }
            : fdDefault;
        changed = true;
      }
    };

    for (const fieldName of def.requiredInputs || []) {
      tryFill(fieldName);
    }

    if (!changed) return node;
    anyChanged = true;
    return {
      ...node,
      data: {
        ...(node.data || {}),
        config,
      },
    };
  });

  return anyChanged ? { ...workflow, nodes } : workflow;
}
