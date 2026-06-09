import { describe, expect, it } from '@jest/globals';
import {
  buildCredentialWizardView,
  matchCredentialStatusForQuestion,
  type CredentialStatusRow,
} from '../wizard-credential-view';
import type { ComprehensiveNodeQuestion } from '../comprehensive-node-questions-generator';

const baseQuestion = (
  overrides: Partial<ComprehensiveNodeQuestion>,
): ComprehensiveNodeQuestion =>
  ({
    id: 'q_credential',
    text: 'Credential',
    type: 'password',
    nodeId: 'node_1',
    nodeType: 'generic_service',
    nodeLabel: 'Generic Service',
    fieldName: 'apiKey',
    category: 'credential',
    required: true,
    askOrder: 0,
    ...overrides,
  }) as ComprehensiveNodeQuestion;

describe('wizard credential view row contract', () => {
  it('ignores none sentinel credential statuses', () => {
    const question = baseQuestion({
      fieldName: 'apiKey',
      credential: { vaultKey: 'openai' },
    });

    const statuses: CredentialStatusRow[] = [
      {
        nodeId: 'node_1',
        credentialId: 'none',
        displayName: 'No credential required',
        status: 'required_missing',
      },
    ];

    expect(matchCredentialStatusForQuestion(question, statuses)).toBe('not_required');
  });

  it('prefers explicit vault key matches when a node has multiple credential statuses', () => {
    const question = baseQuestion({
      fieldName: 'authType',
      text: 'Slack account',
      credential: { vaultKey: 'slack' },
    });

    const statuses: CredentialStatusRow[] = [
      {
        nodeId: 'node_1',
        credentialId: 'github_token',
        displayName: 'GitHub Token',
        status: 'required_missing',
      },
      {
        nodeId: 'node_1',
        credentialId: 'slack_oauth',
        displayName: 'Slack OAuth',
        status: 'resolved_connected',
      },
    ];

    expect(matchCredentialStatusForQuestion(question, statuses)).toBe('resolved_connected');
  });

  it('builds sorted rows with stable credential display metadata', () => {
    const zapierDescription = 'Zapier API key\nPaste the key from the Zapier developer console.';
    const questions: ComprehensiveNodeQuestion[] = [
      baseQuestion({
        id: 'q_zapier_key',
        nodeId: 'zapier_1',
        nodeType: 'zapier',
        nodeLabel: 'Zapier',
        fieldName: 'apiKey',
        text: '',
        description: zapierDescription,
        askOrder: 2,
        fillModeDefault: 'buildtime_ai_once',
        defaultValue: 'ai-generated-key',
      }),
      baseQuestion({
        id: 'q_airtable_token',
        nodeId: 'airtable_1',
        nodeType: 'airtable',
        nodeLabel: 'Airtable',
        fieldName: 'accessToken',
        text: 'Access token',
        askOrder: 3,
        ownershipUiMode: 'selectable',
        fillModeDefault: 'runtime_ai',
      }),
      baseQuestion({
        id: 'q_airtable_webhook',
        nodeId: 'airtable_1',
        nodeType: 'airtable',
        nodeLabel: 'Airtable',
        fieldName: 'webhookUrl',
        text: 'Webhook URL',
        askOrder: 1,
        ownershipUiMode: 'user_only',
      }),
    ];
    const statuses: CredentialStatusRow[] = [
      {
        nodeId: 'zapier_1',
        credentialId: 'zapier_api_key',
        displayName: 'Zapier API Key',
        status: 'required_missing',
      },
      {
        nodeId: 'airtable_1',
        credentialId: 'airtable_access_token',
        displayName: 'Airtable Access Token',
        status: 'resolved_connected',
      },
      {
        nodeId: 'airtable_1',
        credentialId: 'airtable_webhook',
        displayName: 'Airtable Webhook URL',
        status: 'required_missing',
      },
    ];

    const { rows, groups } = buildCredentialWizardView(questions, statuses);

    expect(rows.map((row) => `${row.nodeLabel}:${row.fieldName}`)).toEqual([
      'Airtable:webhookUrl',
      'Airtable:accessToken',
      'Zapier:apiKey',
    ]);
    expect(groups.map((group) => group.nodeLabel)).toEqual(['Airtable', 'Zapier']);
    expect(groups[0].rows.map((row) => row.fieldName)).toEqual(['webhookUrl', 'accessToken']);

    expect(rows.find((row) => row.fieldName === 'webhookUrl')).toEqual(
      expect.objectContaining({
        kind: 'webhook',
        status: 'required_missing',
        ownershipSummary: 'selectable',
        aiPrefilled: false,
        requiresInput: true,
      }),
    );
    expect(rows.find((row) => row.fieldName === 'accessToken')).toEqual(
      expect.objectContaining({
        kind: 'token',
        status: 'resolved_connected',
        ownershipSummary: 'ai_runtime',
        aiPrefilled: false,
        requiresInput: false,
      }),
    );
    expect(rows.find((row) => row.fieldName === 'apiKey')).toEqual(
      expect.objectContaining({
        displayTitle: 'Zapier API key',
        subtitle: zapierDescription,
        kind: 'api_key',
        aiPrefilled: true,
        requiresInput: true,
      }),
    );
  });
});
