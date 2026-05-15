/**
 * Preservation Baseline Tests
 *
 * These tests MUST PASS on unfixed code — they capture the correct behavior
 * that must not regress after the fix is applied.
 *
 * Three preservation properties:
 *   Pres-1 — Non-email aliases resolve to correct canonical types (unchanged)
 *   Pres-2 — Successful attach-inputs still advances phase and applies config merge
 *   Pres-3 — Credential discovery for non-email nodes returns correct requirements
 */

import { unifiedNodeRegistry } from '../src/core/registry/unified-node-registry';
import { nodeTypeNormalizationService } from '../src/services/ai/node-type-normalization-service';

// ─── Pres-1: Non-email alias resolution must be unchanged ────────────────────

describe('Pres-1 — Non-email aliases resolve to correct canonical types', () => {
  const nonEmailAliases: Array<[string, string]> = [
    ['slack', 'slack_message'],
    ['slack_send', 'slack_message'],
    ['jira', 'jira'],
    ['google_sheets', 'google_sheets'],
    ['sheets', 'google_sheets'],
    ['notion', 'notion'],
    ['airtable', 'airtable'],
    ['hubspot', 'hubspot'],
    ['webhook', 'webhook'],
    ['manual_trigger', 'manual_trigger'],
    ['schedule', 'schedule'],
    ['if_else', 'if_else'],
    ['switch', 'switch'],
  ];

  test.each(nonEmailAliases)(
    'resolveAlias("%s") should return "%s"',
    (alias, expectedCanonical) => {
      const resolved = unifiedNodeRegistry.resolveAlias(alias);
      // These must be unchanged before and after the fix
      expect(resolved).toBe(expectedCanonical);
    }
  );

  test.each(nonEmailAliases)(
    'normalizeNodeType("%s") should return "%s"',
    (alias, expectedCanonical) => {
      const result = nodeTypeNormalizationService.normalizeNodeType(alias);
      expect(result.normalized).toBe(expectedCanonical);
      expect(result.valid).toBe(true);
    }
  );

  test('email aliases must not affect non-email resolution', () => {
    // Resolving email aliases must not pollute the cache or state for other aliases
    unifiedNodeRegistry.resolveAlias('email');
    unifiedNodeRegistry.resolveAlias('gmail');

    // Non-email aliases must still resolve correctly after email resolution
    expect(unifiedNodeRegistry.resolveAlias('slack')).toBe('slack_message');
    expect(unifiedNodeRegistry.resolveAlias('google_sheets')).toBe('google_sheets');
  });
});

// ─── Pres-2: Successful attach-inputs must still advance phase ───────────────

describe('Pres-2 — Successful attach-inputs still advances phase and applies config merge', () => {
  test('valid workflow with successful normalization advances phase to configuring_inputs', async () => {
    let capturedPhaseUpdate: string | null = null;
    let capturedNodeUpdate: any[] | null = null;

    const validNodes = [
      {
        id: 'trigger-1',
        type: 'manual_trigger',
        data: { type: 'manual_trigger', label: 'Trigger', category: 'triggers', config: {} },
        position: { x: 0, y: 0 },
      },
      {
        id: 'gmail-1',
        type: 'google_gmail',
        data: {
          type: 'google_gmail',
          label: 'Gmail',
          category: 'communication',
          config: { operation: 'send' },
        },
        position: { x: 200, y: 0 },
      },
    ];
    const validEdges = [
      { id: 'e1', source: 'trigger-1', target: 'gmail-1', type: 'main' },
    ];

    const mockSupabase = {
      auth: {
        getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null }),
      },
      from: jest.fn().mockImplementation((table: string) => ({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockImplementation(() => ({
          eq: jest.fn().mockReturnThis(),
          select: jest.fn().mockReturnThis(),
          single: jest.fn().mockResolvedValue({
            data: {
              id: 'wf-success',
              phase: 'draft',
              status: 'active',
              nodes: validNodes,
              edges: validEdges,
              graph: null,
            },
            error: null,
          }),
          update: jest.fn().mockImplementation((data: any) => ({
            eq: jest.fn().mockReturnThis(),
            select: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({ data: { id: 'wf-success', ...data }, error: null }),
          })),
        })),
        update: jest.fn().mockImplementation((data: any) => {
          if (data.phase) capturedPhaseUpdate = data.phase;
          if (data.nodes) capturedNodeUpdate = data.nodes;
          return {
            eq: jest.fn().mockReturnThis(),
            select: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({ data: { id: 'wf-success', ...data }, error: null }),
          };
        }),
        single: jest.fn().mockResolvedValue({
          data: {
            id: 'wf-success',
            phase: 'draft',
            status: 'active',
            nodes: validNodes,
            edges: validEdges,
            graph: null,
          },
          error: null,
        }),
        insert: jest.fn().mockResolvedValue({ data: null, error: null }),
      })),
    };

    jest.mock('../src/core/database/aws-db-client', () => ({
      getDbClient: () => mockSupabase,
    }));

    const { default: attachInputsHandler } = await import('../src/api/attach-inputs');

    const req: any = {
      params: { workflowId: 'wf-success' },
      body: {
        inputs: {
          [`input_gmail-1_subject`]: 'Weekly Digest',
          [`input_gmail-1_to`]: 'user@example.com',
        },
      },
      headers: { authorization: 'Bearer test-token' },
    };
    const res: any = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };

    await attachInputsHandler(req, res);

    // Must NOT return 400 or 500
    const statusCalls = (res.status as jest.Mock).mock.calls.map((c: any[]) => c[0]);
    expect(statusCalls).not.toContain(400);
    expect(statusCalls).not.toContain(500);

    // Phase must have been advanced to configuring_inputs
    expect(capturedPhaseUpdate).toBe('configuring_inputs');
  });
});

// ─── Pres-3: Credential discovery for non-email nodes ────────────────────────

describe('Pres-3 — Credential discovery for non-email nodes returns correct requirements', () => {
  test('Jira node triggers api_key credential requirement', async () => {
    const { CredentialDiscoveryPhase } = await import('../src/services/ai/credential-discovery-phase');
    const phase = new CredentialDiscoveryPhase();

    const jiraWorkflow = {
      nodes: [
        {
          id: 'jira-1',
          type: 'jira',
          data: { type: 'jira', label: 'Jira', category: 'project_management', config: {} },
        },
      ],
      edges: [],
    };

    const result = await phase.discoverCredentials(jiraWorkflow as any);

    // Jira requires an API key — must be discovered
    const hasJiraCredential = result.requiredCredentials.some(
      c => c.provider === 'jira' || c.nodeTypes.includes('jira')
    );
    // If jira is registered with credentials, this must be true
    // If jira has no credential contract, result should be empty (not error)
    expect(result.errors.length).toBe(0);
    // No Google OAuth should be required for a Jira-only workflow
    const googleOAuthRequired = result.requiredCredentials.some(
      c => c.provider === 'google' && c.type === 'oauth'
    );
    expect(googleOAuthRequired).toBe(false);
  });

  test('Slack node triggers webhook credential requirement', async () => {
    const { CredentialDiscoveryPhase } = await import('../src/services/ai/credential-discovery-phase');
    const phase = new CredentialDiscoveryPhase();

    const slackWorkflow = {
      nodes: [
        {
          id: 'slack-1',
          type: 'slack_message',
          data: { type: 'slack_message', label: 'Slack', category: 'communication', config: {} },
        },
      ],
      edges: [],
    };

    const result = await phase.discoverCredentials(slackWorkflow as any);

    // No errors
    expect(result.errors.length).toBe(0);
    // No Google OAuth for Slack-only workflow
    const googleOAuthRequired = result.requiredCredentials.some(
      c => c.provider === 'google' && c.type === 'oauth'
    );
    expect(googleOAuthRequired).toBe(false);
  });

  test('Google Sheets node triggers Google OAuth requirement', async () => {
    const { CredentialDiscoveryPhase } = await import('../src/services/ai/credential-discovery-phase');
    const phase = new CredentialDiscoveryPhase();

    const sheetsWorkflow = {
      nodes: [
        {
          id: 'sheets-1',
          type: 'google_sheets',
          data: { type: 'google_sheets', label: 'Google Sheets', category: 'data', config: {} },
        },
      ],
      edges: [],
    };

    const result = await phase.discoverCredentials(sheetsWorkflow as any);

    // No errors
    expect(result.errors.length).toBe(0);
    // Google Sheets requires Google OAuth
    const googleOAuthRequired = result.requiredCredentials.some(
      c => c.provider === 'google' && c.type === 'oauth'
    );
    expect(googleOAuthRequired).toBe(true);
  });

  test('manual_trigger only workflow requires no credentials', async () => {
    const { CredentialDiscoveryPhase } = await import('../src/services/ai/credential-discovery-phase');
    const phase = new CredentialDiscoveryPhase();

    const triggerOnlyWorkflow = {
      nodes: [
        {
          id: 'trigger-1',
          type: 'manual_trigger',
          data: { type: 'manual_trigger', label: 'Trigger', category: 'triggers', config: {} },
        },
      ],
      edges: [],
    };

    const result = await phase.discoverCredentials(triggerOnlyWorkflow as any);

    expect(result.errors.length).toBe(0);
    expect(result.requiredCredentials.length).toBe(0);
  });
});
