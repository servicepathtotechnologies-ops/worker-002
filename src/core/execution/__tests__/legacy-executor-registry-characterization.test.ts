/**
 * Characterization: every registered node exposes execute(); sample types used on hot paths.
 * Incremental legacy thinning (Phase D) keeps behavior here while implementation moves out of execute-workflow.ts.
 */

import { unifiedNodeRegistry } from '../../registry/unified-node-registry';

describe('legacy executor / registry characterization', () => {
  it('registry lists types and each has a callable execute', () => {
    const types = unifiedNodeRegistry.getAllTypes();
    expect(types.length).toBeGreaterThan(10);
    for (const t of types) {
      const def = unifiedNodeRegistry.get(t);
      expect(def).toBeDefined();
      expect(typeof def!.execute).toBe('function');
    }
  });

  it('hot-path node types remain registered with schemas', () => {
    for (const t of ['manual_trigger', 'switch', 'if_else', 'log_output', 'google_gmail']) {
      const def = unifiedNodeRegistry.get(t);
      expect(def?.execute).toBeDefined();
      expect(def?.inputSchema).toBeDefined();
    }
  });
});
