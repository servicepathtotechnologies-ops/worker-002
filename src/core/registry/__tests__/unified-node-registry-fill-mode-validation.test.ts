import { describe, expect, it } from '@jest/globals';
import { unifiedNodeRegistry } from '../unified-node-registry';

describe('unified node registry fill-mode-aware validation', () => {
  it('does not fail required runtime_ai field during config-phase validation', () => {
    const result = unifiedNodeRegistry.validateConfig('text_summarizer', {
      text: '',
      _fillMode: {
        text: 'runtime_ai',
      },
    } as any);

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('migrates switch rules to cases and validates expression + cases', () => {
    const migrated = unifiedNodeRegistry.migrateConfig('switch', {
      rules: [{ value: 'active', label: 'Active' }],
      expression: '{{$json.s}}',
    });
    expect(migrated.cases).toEqual([{ value: 'active', label: 'Active' }]);

    const ok = unifiedNodeRegistry.validateConfig('switch', migrated);
    expect(ok.valid).toBe(true);
  });

  it('if_else requires conditions unless runtime_ai', () => {
    const bad = unifiedNodeRegistry.validateConfig('if_else', { conditions: [] } as any);
    expect(bad.valid).toBe(false);

    const deferred = unifiedNodeRegistry.validateConfig('if_else', {
      conditions: [],
      _fillMode: { conditions: 'runtime_ai' },
    } as any);
    expect(deferred.valid).toBe(true);
  });
});
