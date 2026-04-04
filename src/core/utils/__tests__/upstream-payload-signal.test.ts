import {
  isEffectivelyEmptyUpstreamPayload,
  isUpstreamNarrativelyThinForRuntimeAi,
} from '../upstream-payload-signal';

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

describe('isUpstreamNarrativelyThinForRuntimeAi', () => {
  it('treats schedule-like outputs as thin', () => {
    expect(isUpstreamNarrativelyThinForRuntimeAi({ executed_at: '2026-04-03T09:00:00.000Z' })).toBe(true);
    expect(isUpstreamNarrativelyThinForRuntimeAi({ executed_at: '2026-01-01Z', cron: '0 9 * * *', timezone: 'UTC' })).toBe(
      true
    );
  });

  it('is true when effectively empty', () => {
    expect(isUpstreamNarrativelyThinForRuntimeAi({ _trigger: 'manual' })).toBe(true);
    expect(isUpstreamNarrativelyThinForRuntimeAi({})).toBe(true);
  });

  it('is false when a narrative key is present', () => {
    expect(isUpstreamNarrativelyThinForRuntimeAi({ executed_at: 'x', text: 'hello' })).toBe(false);
    expect(isUpstreamNarrativelyThinForRuntimeAi({ body: 'x' })).toBe(false);
    expect(isUpstreamNarrativelyThinForRuntimeAi({ rows: [{ a: 1 }] })).toBe(false);
  });

  it('is false when inputData has substance', () => {
    expect(isUpstreamNarrativelyThinForRuntimeAi({ executed_at: 'x', inputData: { q: 'a' } })).toBe(false);
  });

  it('is false for non-object', () => {
    expect(isUpstreamNarrativelyThinForRuntimeAi('hello')).toBe(false);
    expect(isUpstreamNarrativelyThinForRuntimeAi([1])).toBe(false);
  });
});
