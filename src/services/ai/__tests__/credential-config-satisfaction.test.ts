import { isCredentialSatisfiedByNodeConfig, isValidWebhookUrlInConfig } from '../credential-config-satisfaction';
import type { WorkflowNode } from '../../../core/types/ai-types';

describe('credential-config-satisfaction', () => {
  it('isValidWebhookUrlInConfig rejects templates', () => {
    expect(isValidWebhookUrlInConfig('{{$json.url}}')).toBe(false);
    expect(isValidWebhookUrlInConfig('https://hooks.slack.com/services/x')).toBe(true);
  });

  it('isCredentialSatisfiedByNodeConfig webhook uses credentialFieldName', () => {
    const node: WorkflowNode = {
      id: 'n1',
      type: 'slack_message',
      position: { x: 0, y: 0 },
      data: {
        type: 'slack_message',
        label: 'x',
        category: 'utility',
        config: { webhookUrl: 'https://hooks.slack.com/services/a/b/c' },
      },
    };
    expect(
      isCredentialSatisfiedByNodeConfig(node, {
        provider: 'slack',
        type: 'webhook',
        credentialFieldName: 'webhookUrl',
      })
    ).toBe(true);
  });

  it('isCredentialSatisfiedByNodeConfig oauth uses credentialId', () => {
    const node: WorkflowNode = {
      id: 'n1',
      type: 'google_sheets',
      position: { x: 0, y: 0 },
      data: {
        type: 'google_sheets',
        label: 'x',
        category: 'google',
        config: { credentialId: 'google_oauth_sheets' },
      },
    };
    expect(
      isCredentialSatisfiedByNodeConfig(node, {
        provider: 'google',
        type: 'oauth',
      })
    ).toBe(true);
  });
});
