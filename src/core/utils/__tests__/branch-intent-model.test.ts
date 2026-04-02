import { describe, expect, it } from '@jest/globals';
import { expectedBranchTargetCount, extractBranchIntentSignals } from '../branch-intent-model';

describe('branch-intent-model', () => {
  it('detects explicit two-outcome branching intent', () => {
    const signals = extractBranchIntentSignals(
      'If age > 18 send Gmail, otherwise send Slack message'
    );
    expect(signals.hasBranchingIntent).toBe(true);
    expect(signals.branchType === 'if_else' || signals.branchType === null).toBe(true);
    expect(expectedBranchTargetCount(signals)).toBeGreaterThanOrEqual(2);
  });

  it('keeps non-branching prompt at minimal target count', () => {
    const signals = extractBranchIntentSignals('Collect name and send a confirmation email.');
    expect(signals.hasBranchingIntent).toBe(false);
    expect(expectedBranchTargetCount(signals)).toBe(1);
  });

  it('does not infer branching from temporal "when" in linear prompt', () => {
    const signals = extractBranchIntentSignals(
      'When I submit a form with name and email, send a welcome email, then write a log entry.'
    );
    expect(signals.hasBranchingIntent).toBe(false);
    expect(expectedBranchTargetCount(signals)).toBe(1);
  });

  it('does not infer branching from temporal lead-ins without alternatives', () => {
    const signals = extractBranchIntentSignals(
      'After a user signs up, create a CRM contact and send a welcome email.'
    );
    expect(signals.hasBranchingIntent).toBe(false);
    expect(expectedBranchTargetCount(signals)).toBe(1);
  });

  it('does not infer branching from single outcome words without branch structure', () => {
    const signals = extractBranchIntentSignals(
      'Mark the onboarding as success and send a completion email.'
    );
    expect(signals.hasBranchingIntent).toBe(false);
    expect(expectedBranchTargetCount(signals)).toBe(1);
  });

  it('detects multi-case switch-style branching intent from color example', () => {
    const signals = extractBranchIntentSignals(
      'Use a switch to evaluate the ball color: if red, send Slack; if blue, send Gmail; if green, logout.'
    );
    expect(signals.hasBranchingIntent).toBe(true);
    expect(signals.branchType).toBe('switch');
    expect(signals.estimatedBranchCount).toBeGreaterThanOrEqual(3);
    expect(expectedBranchTargetCount(signals)).toBeGreaterThanOrEqual(3);
    // Outcome descriptors should include the color tokens.
    expect(signals.outcomeDescriptors).toEqual(
      expect.arrayContaining(['red', 'blue', 'green'])
    );
  });

  it('detects branching from two explicit if clauses without else keyword', () => {
    const signals = extractBranchIntentSignals(
      'If age > 18 send Gmail confirmation. If age ≤ 18 send Gmail notification.'
    );
    expect(signals.hasBranchingIntent).toBe(true);
    expect(signals.branchType === 'if_else' || signals.branchType === 'switch').toBe(true);
    expect(expectedBranchTargetCount(signals)).toBeGreaterThanOrEqual(2);
  });
});
