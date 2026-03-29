import { pruneProposedPlanChain } from '../plan-chain-prune';

describe('plan-chain-prune', () => {
  it('removes unknown types and consecutive duplicates', () => {
    expect(pruneProposedPlanChain(['manual_trigger', 'manual_trigger', 'linkedin', 'bogus_x'])).toEqual([
      'manual_trigger',
      'linkedin',
    ]);
  });

  it('preserves consecutive log_output for multi-branch terminals', () => {
    expect(
      pruneProposedPlanChain(['form', 'if_else', 'google_gmail', 'log_output', 'slack_message', 'log_output'])
    ).toEqual(['form', 'if_else', 'google_gmail', 'log_output', 'slack_message', 'log_output']);
  });
});
