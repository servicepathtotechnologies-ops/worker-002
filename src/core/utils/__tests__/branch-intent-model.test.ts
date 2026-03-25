import { describe, expect, it } from '@jest/globals';
import { expectedBranchTargetCount, extractBranchIntentSignals } from '../branch-intent-model';

describe('branch-intent-model', () => {
  it('detects explicit two-outcome branching intent', () => {
    const signals = extractBranchIntentSignals(
      'If age > 18 send Gmail, otherwise send Slack message'
    );
    expect(signals.hasBranchingIntent).toBe(true);
    expect(expectedBranchTargetCount(signals)).toBeGreaterThanOrEqual(2);
  });

  it('keeps non-branching prompt at minimal target count', () => {
    const signals = extractBranchIntentSignals('Collect name and send a confirmation email.');
    expect(signals.hasBranchingIntent).toBe(false);
    expect(expectedBranchTargetCount(signals)).toBe(1);
  });
});
