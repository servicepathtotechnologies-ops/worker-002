import { normalizeLegacyWrappedNodeOutput } from '../legacy-node-output-normalize';

describe('normalizeLegacyWrappedNodeOutput', () => {
  it('unwraps legacy { data, type } shape', () => {
    expect(normalizeLegacyWrappedNodeOutput({ data: { ok: true }, type: 'object' })).toEqual({ ok: true });
  });

  it('returns primitives as-is', () => {
    expect(normalizeLegacyWrappedNodeOutput('x')).toBe('x');
    expect(normalizeLegacyWrappedNodeOutput(42)).toBe(42);
  });
});
