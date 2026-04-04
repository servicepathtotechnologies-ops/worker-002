import { unifiedNodeRegistry } from '../../registry/unified-node-registry';
import { validateRegistryContractForNodeType } from '../schema-based-validator';

describe('schema-based-validator registry invariants', () => {
  it('validates registry contracts for all registered node types', () => {
    const allTypes = unifiedNodeRegistry.getAllTypes();
    expect(allTypes.length).toBeGreaterThan(0);

    const failures: string[] = [];
    for (const nodeType of allTypes) {
      const result = validateRegistryContractForNodeType(nodeType);
      if (!result.valid) {
        failures.push(`${nodeType}: ${result.errors.join(' | ')}`);
      }
    }

    expect(failures).toEqual([]);
  });
});

