import { populateRequiredFields } from '../required-field-populator';
import { unifiedNodeRegistry } from '../../../core/registry/unified-node-registry';
import type { WorkflowNode } from '../../../core/types/ai-types';

function makeNode(id: string, type: string, config: Record<string, any> = {}): WorkflowNode {
  return {
    id,
    type,
    data: {
      type,
      label: type,
      category: unifiedNodeRegistry.getCategory(type) || 'transformation',
      config,
    },
    position: { x: 0, y: 0 },
  };
}

describe('Required Field Populator - runtime inputs stay empty', () => {
  it('leaves unified inputSchema required fields empty (no build-time values)', async () => {
    const nodeType = 'google_gmail';
    const node = makeNode('gmail_1', nodeType, {});

    const unifiedDef = unifiedNodeRegistry.get(nodeType as any);
    const runtimeKeys = new Set(Object.keys(unifiedDef?.inputSchema || {}));

    const result = await populateRequiredFields(node, null, [node], 0);

    // Only assert keys that the underlying node schema marks as required.
    // Those are the ones populateRequiredFields would otherwise fill at build time.
    for (const key of Object.keys(result.populated)) {
      if (runtimeKeys.has(key)) {
        expect(result.populated[key]).toBe('');
      }
    }
  });
});

