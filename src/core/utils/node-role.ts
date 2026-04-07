import { unifiedNodeRegistry } from '../registry/unified-node-registry';

export function isTriggerNodeType(nodeType: string): boolean {
  // Delegate to registry — accepts both 'trigger' and 'triggers' category spellings
  return unifiedNodeRegistry.isTrigger(nodeType);
}

export function isInternalNodeType(nodeType: string): boolean {
  const def = unifiedNodeRegistry.get(nodeType);
  return (def?.tags || []).includes('internal');
}

export function isOutputSinkNodeType(nodeType: string): boolean {
  const def = unifiedNodeRegistry.get(nodeType);
  if (!def) return false;
  // Category strings in the wild include communication/output; contract type may lag the catalog.
  const cat = def.category as string | undefined;
  return (
    cat === 'communication' ||
    cat === 'output' ||
    (def.tags || []).includes('sink') ||
    (def.tags || []).includes('output')
  );
}

