import { describe, expect, it } from '@jest/globals';
import { normalizeIfElseConfig } from '../../core/utils/if-else-conditions';

describe('if_else normalization parity contract', () => {
  const fixtures: Array<{ name: string; config: Record<string, unknown> }> = [
    {
      name: 'legacy condition string',
      config: { condition: '{{$json.age}} > 18', combineOperation: 'AND' },
    },
    {
      name: 'stringified condition array',
      config: {
        conditions:
          '[{"field":"$json.age","operator":"greater_than","value":18}]',
        combineOperation: 'OR',
      },
    },
    {
      name: 'nested expression JSON payload',
      config: {
        conditions: [
          {
            expression:
              '[{"field":"$json.details_through_a_form_including_age","operator":"greater_than","value":18}]',
          },
        ],
      },
    },
  ];

  it('canonicalizes every fixture to structured conditions array', () => {
    for (const fixture of fixtures) {
      const normalized = normalizeIfElseConfig(fixture.config);
      expect(Array.isArray(normalized.conditions)).toBe(true);
      expect((normalized.conditions as unknown[]).length).toBeGreaterThan(0);
      const first = (normalized.conditions as Array<Record<string, unknown>>)[0];
      expect(typeof first.field).toBe('string');
      expect(typeof first.operator).toBe('string');
      expect(Object.prototype.hasOwnProperty.call(first, 'value')).toBe(true);
    }
  });

  it('normalizes combineOperation to AND/OR only', () => {
    expect(normalizeIfElseConfig({ combineOperation: 'or' }).combineOperation).toBe('OR');
    expect(normalizeIfElseConfig({ combineOperation: 'invalid' }).combineOperation).toBe('AND');
    expect(normalizeIfElseConfig({}).combineOperation).toBe('AND');
  });
});
