jest.mock('../credential-discovery-phase', () => ({
  CredentialDiscoveryPhase: jest.fn(),
}));

jest.mock('../../workflow-lifecycle-manager', () => ({
  workflowLifecycleManager: {
    discoverNodeInputs: jest.fn(),
  },
}));

jest.mock('../../../core/database/aws-db-client', () => ({
  getDbClient: jest.fn(),
}));

import { getUnifiedMissingItems } from '../credential-input-discovery';
import { CredentialDiscoveryPhase } from '../credential-discovery-phase';
import { workflowLifecycleManager } from '../../workflow-lifecycle-manager';
import { getDbClient } from '../../../core/database/aws-db-client';

const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

function mockWorkflowRow(workflow: any) {
  (getDbClient as jest.Mock).mockReturnValue({
    from: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          single: jest.fn().mockResolvedValue({
            data: {
              id: 'wf-129',
              name: 'Field Ownership Workflow',
              nodes: workflow.nodes,
              edges: workflow.edges,
              created_at: '2026-06-09T00:00:00.000Z',
              updated_at: '2026-06-09T00:00:00.000Z',
            },
            error: null,
          }),
        }),
      }),
    }),
  });
}

describe('credential input discovery field ownership contract', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterAll(() => {
    consoleLogSpy.mockRestore();
  });

  it('returns missing credentials and only value-owned inputs that are still unresolved', async () => {
    const workflow = {
      nodes: [
        {
          id: 'sheet-1',
          type: 'custom',
          position: { x: 0, y: 0 },
          data: {
            type: 'google_sheets',
            label: 'Append Lead',
            category: 'google',
            config: {
              range: 'A1:D10',
            },
          },
        },
      ],
      edges: [],
    };

    const missingCredential = {
      provider: 'sendgrid',
      type: 'api_key' as const,
      vaultKey: 'sendgrid',
      displayName: 'SendGrid API Key',
      required: true,
      satisfied: false,
      nodeTypes: ['sendgrid_email'],
      nodeIds: ['email-1'],
    };

    const satisfiedCredential = {
      provider: 'google',
      type: 'oauth' as const,
      vaultKey: 'google',
      displayName: 'Google OAuth',
      required: true,
      satisfied: true,
      nodeTypes: ['google_sheets'],
      nodeIds: ['sheet-1'],
    };

    mockWorkflowRow(workflow);
    (CredentialDiscoveryPhase as jest.Mock).mockImplementation(() => ({
      discoverCredentials: jest.fn().mockResolvedValue({
        requiredCredentials: [missingCredential, satisfiedCredential],
        missingCredentials: [missingCredential],
        satisfiedCredentials: [satisfiedCredential],
        allDiscovered: true,
        errors: [],
        warnings: [],
      }),
    }));
    (workflowLifecycleManager.discoverNodeInputs as jest.Mock).mockReturnValue({
      inputs: [
        {
          nodeId: 'sheet-1',
          nodeType: 'google_sheets',
          nodeLabel: 'Append Lead',
          fieldName: 'spreadsheetId',
          description: 'Google Sheet file ID',
          fieldType: 'string',
          inputType: 'text',
          required: true,
          ownership: 'value',
          fillModeDefault: 'manual_static',
          supportsRuntimeAI: false,
          supportsBuildtimeAI: false,
        },
        {
          nodeId: 'sheet-1',
          nodeType: 'google_sheets',
          nodeLabel: 'Append Lead',
          fieldName: 'operation',
          description: 'Selected operation',
          fieldType: 'string',
          inputType: 'select',
          required: true,
          ownership: 'structural',
        },
        {
          nodeId: 'sheet-1',
          nodeType: 'google_sheets',
          nodeLabel: 'Append Lead',
          fieldName: 'credentialId',
          description: 'OAuth connection',
          fieldType: 'string',
          inputType: 'password',
          required: true,
          ownership: 'credential',
        },
        {
          nodeId: 'sheet-1',
          nodeType: 'google_sheets',
          nodeLabel: 'Append Lead',
          fieldName: 'range',
          description: 'Cell range',
          fieldType: 'string',
          inputType: 'text',
          required: true,
          ownership: 'value',
        },
      ],
    });

    const result = await getUnifiedMissingItems('wf-129', 'user-129');

    expect(result.credentials).toEqual([
      expect.objectContaining({
        provider: 'sendgrid',
        type: 'api_key',
        nodes: ['email-1'],
        displayName: 'SendGrid API Key',
        vaultKey: 'sendgrid',
        inputType: 'password',
        placeholder: 'Enter SendGrid API Key credentials',
      }),
    ]);
    expect(result.inputs).toEqual([
      expect.objectContaining({
        nodeId: 'sheet-1',
        fieldName: 'spreadsheetId',
        ownership: 'value',
        fillModeDefault: 'manual_static',
      }),
    ]);
    expect(result.display?.summary).toEqual({
      missingCredentialCount: 1,
      missingInputCount: 1,
    });
    expect(workflowLifecycleManager.discoverNodeInputs).toHaveBeenCalledWith(
      expect.objectContaining({ nodes: workflow.nodes, edges: workflow.edges }),
    );
  });
});
