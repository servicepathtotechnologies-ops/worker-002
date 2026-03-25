import { isEffectivelyEmptyUpstreamPayload } from '../upstream-payload-signal';

describe('isEffectivelyEmptyUpstreamPayload', () => {
  it('returns true for null/undefined/{}', () => {
    expect(isEffectivelyEmptyUpstreamPayload(null)).toBe(true);
    expect(isEffectivelyEmptyUpstreamPayload(undefined)).toBe(true);
    expect(isEffectivelyEmptyUpstreamPayload({})).toBe(true);
  });

  it('treats manual trigger meta-only payload as empty', () => {
    expect(isEffectivelyEmptyUpstreamPayload({ _trigger: 'manual' })).toBe(true);
    expect(isEffectivelyEmptyUpstreamPayload({ _trigger: 'manual', inputData: {} })).toBe(true);
    expect(isEffectivelyEmptyUpstreamPayload({ _trigger: 'manual', inputData: '' })).toBe(true);
  });

  it('returns false when inputData has substance', () => {
    expect(isEffectivelyEmptyUpstreamPayload({ inputData: { q: 'hello' } })).toBe(false);
    expect(isEffectivelyEmptyUpstreamPayload({ inputData: 'hello' })).toBe(false);
  });

  it('returns false for upstream rows/text', () => {
    expect(isEffectivelyEmptyUpstreamPayload({ rows: [{ a: 1 }] })).toBe(false);
    expect(isEffectivelyEmptyUpstreamPayload({ text: 'x' })).toBe(false);
  });
});
