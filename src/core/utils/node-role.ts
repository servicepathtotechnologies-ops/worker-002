import { unifiedNodeRegistry } from '../registry/unified-node-registry';

export function isTriggerNodeType(nodeType: string): boolean {
  const def = unifiedNodeRegistry.get(nodeType);
  return def?.category === 'trigger' || nodeType.includes('trigger');
}

export function isInternalNodeType(nodeType: string): boolean {
  const def = unifiedNodeRegistry.get(nodeType);
  return (def?.tags || []).includes('internal');
}

export function isOutputSinkNodeType(nodeType: string): boolean {
  const def = unifiedNodeRegistry.get(nodeType);
  return def?.category === 'communication' || (def?.tags || []).includes('sink') || (def?.tags || []).includes('output');
}

