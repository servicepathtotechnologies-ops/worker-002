import { describe, expect, it } from '@jest/globals';
import { normalizeUnifiedMissingItems } from '../credential-input-discovery';

describe('normalizeUnifiedMissingItems', () => {
  it('deduplicates and sorts missing credentials and inputs deterministically', () => {
    const normalized = normalizeUnifiedMissingItems({
      credentials: [
        { provider: 'google', type: 'oauth', nodes: ['b', 'a'], fields: [], displayName: 'Google OAuth', vaultKey: 'google' },
        { provider: 'google', type: 'oauth', nodes: ['a', 'b'], fields: [], displayName: 'Google OAuth', vaultKey: 'google' },
        { provider: 'slack', type: 'webhook', nodes: ['n1'], fields: [], displayName: 'Slack Webhook', vaultKey: 'slack_webhook' },
      ],
      inputs: [
        { nodeId: 'n2', nodeType: 'google_gmail', nodeLabel: 'Gmail', fieldName: 'subject', description: 'subject', fieldType: 'string', required: true },
        { nodeId: 'n1', nodeType: 'google_gmail', nodeLabel: 'Gmail', fieldName: 'body', description: 'body', fieldType: 'string', required: true },
        { nodeId: 'n2', nodeType: 'google_gmail', nodeLabel: 'Gmail', fieldName: 'subject', description: 'subject', fieldType: 'string', required: true },
      ],
    });

    expect(normalized.credentials.length).toBe(2);
    expect(normalized.inputs.length).toBe(2);
    expect(normalized.inputs[0].nodeId).toBe('n1');
    expect(normalized.inputs[1].nodeId).toBe('n2');
    expect(normalized.display?.summary.missingCredentialCount).toBe(2);
    expect(normalized.display?.summary.missingInputCount).toBe(2);
  });
});

