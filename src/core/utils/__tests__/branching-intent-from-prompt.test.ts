import { describe, expect, it } from '@jest/globals';
import { detectBranchingIntentFromPrompt } from '../branching-intent-from-prompt';

describe('detectBranchingIntentFromPrompt', () => {
  it('detects explicit if-then conditional phrasing', () => {
    expect(
      detectBranchingIntentFromPrompt('if payment then send a receipt email')
    ).toBe(true);
  });

  it('detects comparison-style threshold branching', () => {
    expect(
      detectBranchingIntentFromPrompt('route the lead when score >= 80 to sales')
    ).toBe(true);
  });

  it('detects check-if prompts as branching when they are not extraction requests', () => {
    expect(
      detectBranchingIntentFromPrompt('check if the invoice is overdue before sending a reminder')
    ).toBe(true);
  });

  it('does not treat trigger-style when receive prompts as branching', () => {
    expect(
      detectBranchingIntentFromPrompt('when I receive a webhook request create a support ticket')
    ).toBe(false);
  });

  it('does not treat data extraction prompts as branching', () => {
    expect(
      detectBranchingIntentFromPrompt('extract the customer email from the payload and save it')
    ).toBe(false);
  });

  it('does not treat linear then prompts as branching', () => {
    expect(
      detectBranchingIntentFromPrompt('get the invoice details then send a confirmation email')
    ).toBe(false);
  });
});
