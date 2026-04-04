import {
  validateCanonicalChainCompleteness,
  canonicalizePlanChainStrict,
} from '../plan-chain-guards';

describe('plan-chain-guards — switch downstream coverage (R4)', () => {
  it('flags insufficient non-log nodes after switch vs enumerated cases', () => {
    const prompt =
      'Classify support tickets as high, medium, low priority and route to the right channel.';
    const chain = [
      'manual_trigger',
      'form',
      'switch',
      'slack_message',
      'log_output',
    ];
    const { canonical } = canonicalizePlanChainStrict(chain);
    expect(canonical.length).toBeGreaterThan(0);
    const issues = validateCanonicalChainCompleteness(canonical, { userPrompt: prompt });
    const hit = issues.some((i) =>
      String(i.reason).startsWith('switch_downstream_actions_insufficient')
    );
    expect(hit).toBe(true);
  });

  it('allows switch when non-log downstream count meets case count', () => {
    const prompt =
      'Classify support tickets as high, medium, low priority and route to the right channel.';
    const chain = [
      'manual_trigger',
      'form',
      'switch',
      'slack_message',
      'google_gmail',
      'email',
      'log_output',
    ];
    const { canonical } = canonicalizePlanChainStrict(chain);
    const issues = validateCanonicalChainCompleteness(canonical, { userPrompt: prompt });
    const hit = issues.some((i) =>
      String(i.reason).startsWith('switch_downstream_actions_insufficient')
    );
    expect(hit).toBe(false);
  });
});
