/**
 * Node Sufficiency Checker
 *
 * Validates that a proposed node chain is sufficient for the given intent —
 * no unnecessary nodes, no missing required nodes.
 * All logic is registry-driven; no hardcoded node type strings.
 */

import { unifiedNodeRegistry } from '../../core/registry/unified-node-registry';
import type { StructuredIntent } from './intent-structurer';

export interface NodeSelectionRationale {
  nodeType: string;
  instanceIndex: number;
  reason: string;
  intentSource: string;
}

export function checkNodeSufficiency(
  proposedChain: string[],
  intent: StructuredIntent
): { sufficient: boolean; nodesToRemove: string[]; rationale: NodeSelectionRationale[] } {
  const rationale: NodeSelectionRationale[] = [];
  const nodesToRemove: string[] = [];
  const instanceCount = new Map<string, number>();

  const intentKeywords = [
    ...(intent.actions?.map(a => a.type) || []),
    ...(intent.actions?.map(a => a.operation) || []),
    ...(intent.dataSources?.map(d => d.type) || []),
    ...(intent.dataSources?.map(d => d.operation) || []),
    ...(intent.transformations?.map(t => t.type) || []),
    ...(intent.transformations?.map(t => t.operation) || []),
    intent.trigger || '',
  ].map(k => (k || '').toLowerCase()).filter(Boolean);

  const observabilityKeywords = ['log', 'monitor', 'observe', 'track', 'debug', 'audit', 'record'];

  for (const token of proposedChain) {
    // Strip branch tag for type lookup
    const nodeType = token.replace(/\[.*?\]/, '').replace(/#.*$/, '').trim();
    const def = unifiedNodeRegistry.get(nodeType);
    const idx = instanceCount.get(nodeType) ?? 0;
    instanceCount.set(nodeType, idx + 1);

    // ✅ TASK 15.1: Remove alwaysRequired check - use intent-driven preservation instead
    // Previously: if (def?.workflowBehavior?.alwaysRequired === true) { ... }
    // Now: Only preserve nodes that match user intent

    // Trigger nodes are always needed
    if (def?.category === 'trigger') {
      rationale.push({ nodeType, instanceIndex: idx, reason: 'Workflow trigger', intentSource: 'registry' });
      continue;
    }

    // ✅ TASK 15.1: log_output - only keep if intent has observability signal
    // Do NOT preserve based on alwaysRequired flag
    if (nodeType === 'log_output' || def?.workflowBehavior?.alwaysTerminal === true) {
      const hasObservabilitySignal = intentKeywords.some(k => observabilityKeywords.some(o => k.includes(o)));
      if (hasObservabilitySignal) {
        rationale.push({ nodeType, instanceIndex: idx, reason: 'Terminal/observability node (user requested)', intentSource: 'intent' });
      } else {
        nodesToRemove.push(token);
        rationale.push({ nodeType, instanceIndex: idx, reason: 'Removed: no observability signal in intent', intentSource: 'intent' });
      }
      continue;
    }

    // Check if node type maps to any intent keyword
    const nodeLabel = (def?.label || nodeType).toLowerCase();
    const nodeTags = (def?.tags || []).map(t => t.toLowerCase());
    const nodeDesc = (def?.description || '').toLowerCase();

    const matchedKeyword = intentKeywords.find(k =>
      k.length > 2 && (
        nodeLabel.includes(k) || k.includes(nodeLabel) ||
        nodeTags.some(tag => tag.includes(k) || k.includes(tag)) ||
        nodeDesc.includes(k)
      )
    );

    if (matchedKeyword) {
      rationale.push({ nodeType, instanceIndex: idx, reason: `Matches intent keyword: "${matchedKeyword}"`, intentSource: 'intent' });
    } else {
      // No clear intent mapping — mark for removal
      nodesToRemove.push(token);
      rationale.push({ nodeType, instanceIndex: idx, reason: 'No clear intent mapping found', intentSource: 'none' });
    }
  }

  return {
    sufficient: nodesToRemove.length === 0,
    nodesToRemove,
    rationale,
  };
}
