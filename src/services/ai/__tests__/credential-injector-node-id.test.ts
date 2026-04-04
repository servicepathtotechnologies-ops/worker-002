import { describe, expect, it } from '@jest/globals';
import { CredentialInjector } from '../credential-injector';
import type { RequiredCredential } from '../credential-detector';

describe('CredentialInjector node_id and slack_message', () => {
  const injector = new CredentialInjector();

  it('matches required credential by node_id', () => {
    const workflow = {
      nodes: [
        {
          id: 'slack-node-42',
          type: 'custom',
          data: { type: 'slack_message', config: {} },
        },
      ],
      edges: [],
    } as any;

    const required: RequiredCredential[] = [
      {
        provider: 'slack',
        node_id: 'slack-node-42',
        node_type: 'slack_message',
        fields: ['url'],
      },
    ];

    const result = injector.injectCredentials(workflow, { slack: { url: 'https://hooks.slack.com/test' } }, required);

    expect(result.success).toBe(true);
    const updated = result.workflow.nodes[0];
    expect(updated.data.config?.credentialId).toBe('slack');
  });

  it('errors when credential map has no data for required provider', () => {
    const workflow = {
      nodes: [
        {
          id: 'slack-node-42',
          type: 'custom',
          data: { type: 'slack_message', config: {} },
        },
      ],
      edges: [],
    } as any;

    const required: RequiredCredential[] = [
      { provider: 'slack', node_id: 'slack-node-42', node_type: 'slack_message', fields: ['url'] },
    ];

    const result = injector.injectCredentials(workflow, {}, required);
    expect(result.success).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('matches by node_type when node_id omitted but type matches', () => {
    const workflow = {
      nodes: [
        {
          id: 'any-id',
          type: 'custom',
          data: { type: 'slack_message', config: {} },
        },
      ],
      edges: [],
    } as any;

    const required: RequiredCredential[] = [{ provider: 'slack', node_type: 'slack_message', fields: ['url'] }];

    const result = injector.injectCredentials(workflow, { slack: { url: 'https://hooks.slack.com/y' } }, required);
    expect(result.success).toBe(true);
  });
});
