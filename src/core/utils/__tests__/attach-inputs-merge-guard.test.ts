import { describe, it, expect } from '@jest/globals';
import { shouldPreserveExistingBuildtimeValue, resolveAliasTargetFieldName } from '../attach-inputs-merge-guard';

describe('attach-inputs-merge-guard', () => {
  const schema = {
    fields: {
      type: 'array' as const,
      required: true,
      description: 'x',
      fillMode: { default: 'buildtime_ai_once' as const, supportsBuildtimeAI: true },
    },
  };

  it('preserves richer fields[] when incoming array is shorter under buildtime_ai_once', () => {
    const existing = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    const incoming = [{ id: 'x' }];
    const config = { _fillMode: { fields: 'buildtime_ai_once' } };
    const r = shouldPreserveExistingBuildtimeValue('fields', schema as any, config, existing, incoming);
    expect(r.preserve).toBe(true);
    expect(r.reason).toBe('buildtime_array_shrink_blocked');
  });

  it('does not preserve when mode is manual_static', () => {
    const existing = [{ id: 'a' }, { id: 'b' }];
    const incoming = [{ id: 'x' }];
    const config = { _fillMode: { fields: 'manual_static' } };
    const r = shouldPreserveExistingBuildtimeValue('fields', schema as any, config, existing, incoming);
    expect(r.preserve).toBe(false);
  });

  it('allows edits to cases arrays (structural branch field)', () => {
    const existing = [{ value: 'a' }, { value: 'b' }];
    const incoming = [{ value: 'a' }];
    const config = { _fillMode: { cases: 'buildtime_ai_once' } };
    const r = shouldPreserveExistingBuildtimeValue('cases', {} as any, config, existing, incoming);
    expect(r.preserve).toBe(false);
  });

  it('resolveAliasTargetFieldName reads aliasOf', () => {
    expect(resolveAliasTargetFieldName('text', { aliasOf: 'message' } as any)).toBe('message');
    expect(resolveAliasTargetFieldName('message', {} as any)).toBe(null);
  });
});
