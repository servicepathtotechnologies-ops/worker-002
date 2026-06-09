function loadStage() {
  jest.resetModules();
  jest.doMock('../../../../core/logger', () => ({
    logger: {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    },
  }));
  jest.doMock('../../credential-discovery-phase', () => ({
    credentialDiscoveryPhase: {
      discoverCredentials: jest.fn(),
    },
  }));

  const { logger } = require('../../../../core/logger');
  const { credentialDiscoveryPhase } = require('../../credential-discovery-phase');
  const { runCredentialDiscoveryStage } = require('../credential-discovery-stage');

  return {
    mockLoggerInfo: logger.info as jest.Mock,
    mockLoggerError: logger.error as jest.Mock,
    mockDiscoverCredentials: credentialDiscoveryPhase.discoverCredentials as jest.Mock,
    runCredentialDiscoveryStage: runCredentialDiscoveryStage as typeof import('../credential-discovery-stage').runCredentialDiscoveryStage,
  };
}

function makeWorkflow(nodeCount: number): any {
  return {
    nodes: Array.from({ length: nodeCount }, (_, index) => ({
      id: `node_${index + 1}`,
      type: 'slack',
      data: {
        label: 'Slack',
        type: 'slack',
        category: 'output',
        config: {},
      },
    })),
    edges: [],
  };
}

function makeCredential(provider: string, nodeId: string) {
  return {
    provider,
    type: 'webhook' as const,
    vaultKey: provider,
    displayName: `${provider} webhook`,
    required: true,
    satisfied: false,
    nodeTypes: [provider],
    nodeIds: [nodeId],
  };
}

describe('runCredentialDiscoveryStage logging', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('logs start and end summaries for successful discovery', async () => {
    const {
      mockLoggerInfo,
      mockDiscoverCredentials,
      runCredentialDiscoveryStage,
    } = loadStage();
    jest.spyOn(Date, 'now').mockReturnValueOnce(1000).mockReturnValueOnce(1048);
    const slackCredential = makeCredential('slack', 'node_1');
    const gmailCredential = makeCredential('google_gmail', 'node_2');
    mockDiscoverCredentials.mockResolvedValue({
      requiredCredentials: [slackCredential, gmailCredential],
      missingCredentials: [slackCredential],
      satisfiedCredentials: [gmailCredential],
      allDiscovered: false,
      errors: [],
      warnings: [],
    });

    const workflow = makeWorkflow(3);
    const result = await runCredentialDiscoveryStage(workflow, 'user-111', 'corr-111');

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('Expected credential discovery to succeed');
    expect(result.durationMs).toBe(48);
    expect(mockDiscoverCredentials).toHaveBeenCalledWith(workflow, 'user-111');
    expect(mockLoggerInfo).toHaveBeenNthCalledWith(1, {
      event: 'ai_pipeline_stage_start',
      stage: 'credential_discovery',
      correlationId: 'corr-111',
      inputSummary: 'nodes=3',
    });
    expect(mockLoggerInfo).toHaveBeenNthCalledWith(2, {
      event: 'ai_pipeline_stage_end',
      stage: 'credential_discovery',
      correlationId: 'corr-111',
      outputSummary: 'required=2, missing=1',
      durationMs: 48,
    });
  });

  it('logs the stage error details when discovery throws', async () => {
    const {
      mockLoggerInfo,
      mockLoggerError,
      mockDiscoverCredentials,
      runCredentialDiscoveryStage,
    } = loadStage();
    jest.spyOn(Date, 'now').mockReturnValueOnce(2000).mockReturnValueOnce(2023);
    mockDiscoverCredentials.mockRejectedValue(new Error('vault lookup failed'));

    const result = await runCredentialDiscoveryStage(makeWorkflow(1), undefined, 'corr-failure');

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('Expected credential discovery to fail');
    expect(result.durationMs).toBe(23);
    expect(result.errors).toEqual(['vault lookup failed']);
    expect(mockLoggerInfo).toHaveBeenCalledTimes(1);
    expect(mockLoggerInfo).toHaveBeenCalledWith({
      event: 'ai_pipeline_stage_start',
      stage: 'credential_discovery',
      correlationId: 'corr-failure',
      inputSummary: 'nodes=1',
    });
    expect(mockLoggerError).toHaveBeenCalledWith({
      event: 'ai_pipeline_stage_error',
      stage: 'credential_discovery',
      correlationId: 'corr-failure',
      error: 'CREDENTIAL_DISCOVERY_FAILED',
      message: 'vault lookup failed',
    });
  });
});
