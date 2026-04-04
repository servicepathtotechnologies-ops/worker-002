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

  it('preserves consecutive duplicate types after if_else (e.g. two AI nodes on two branches)', () => {
    expect(
      pruneProposedPlanChain([
        'manual_trigger',
        'if_else',
        'ai_chat_model',
        'ai_chat_model',
        'log_output',
      ])
    ).toEqual([
        'manual_trigger',
        'if_else',
        'ai_chat_model',
        'ai_chat_model',
        'log_output',
      ]);
  });
});
