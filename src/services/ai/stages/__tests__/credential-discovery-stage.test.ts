jest.mock('../../../../core/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

jest.mock('../../credential-discovery-phase', () => ({
  credentialDiscoveryPhase: {
    discoverCredentials: jest.fn(),
  },
}));

import { runCredentialDiscoveryStage } from '../credential-discovery-stage';
import { credentialDiscoveryPhase } from '../../credential-discovery-phase';

const mockDiscoverCredentials = credentialDiscoveryPhase.discoverCredentials as jest.Mock;

function makeWorkflow(nodeCount = 1): any {
  return {
    nodes: Array.from({ length: nodeCount }, (_, i) => ({
      id: `n${i + 1}`,
      type: 'slack',
      data: { label: 'Slack', type: 'slack', category: 'output', config: {} },
    })),
    edges: [],
  };
}

const SAMPLE_CREDENTIAL = {
  provider: 'slack',
  type: 'webhook' as const,
  vaultKey: 'slack',
  displayName: 'Slack Webhook',
  required: true,
  satisfied: false,
  nodeTypes: ['slack'],
  nodeIds: ['n1'],
};

describe('runCredentialDiscoveryStage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns ok:true with populated credential arrays on success', async () => {
    mockDiscoverCredentials.mockResolvedValue({
      requiredCredentials: [SAMPLE_CREDENTIAL],
      missingCredentials: [SAMPLE_CREDENTIAL],
      satisfiedCredentials: [],
      allDiscovered: true,
      errors: [],
      warnings: [],
    });

    const result = await runCredentialDiscoveryStage(makeWorkflow(), 'user-1', 'corr-1');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.requiredCredentials).toHaveLength(1);
    expect(result.missingCredentials).toHaveLength(1);
    expect(result.satisfiedCredentials).toHaveLength(0);
    expect(typeof result.durationMs).toBe('number');
  });

  it('passes the workflow and userId to discoverCredentials', async () => {
    mockDiscoverCredentials.mockResolvedValue({
      requiredCredentials: [],
      missingCredentials: [],
      satisfiedCredentials: [],
      allDiscovered: true,
      errors: [],
      warnings: [],
    });

    const workflow = makeWorkflow(2);
    await runCredentialDiscoveryStage(workflow, 'specific-user-id');

    expect(mockDiscoverCredentials).toHaveBeenCalledWith(workflow, 'specific-user-id');
  });

  it('defaults missingCredentials and satisfiedCredentials to [] when discoverCredentials returns undefined for them', async () => {
    mockDiscoverCredentials.mockResolvedValue({
      requiredCredentials: [],
      missingCredentials: undefined,
      satisfiedCredentials: undefined,
      allDiscovered: true,
      errors: [],
      warnings: [],
    });

    const result = await runCredentialDiscoveryStage(makeWorkflow());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.missingCredentials).toEqual([]);
    expect(result.satisfiedCredentials).toEqual([]);
  });

  it('returns ok:false with CREDENTIAL_DISCOVERY_FAILED when discoverCredentials throws an Error', async () => {
    mockDiscoverCredentials.mockRejectedValue(new Error('DB connection failed'));

    const result = await runCredentialDiscoveryStage(makeWorkflow(), 'user-1');

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('CREDENTIAL_DISCOVERY_FAILED');
    expect(result.errors).toContain('DB connection failed');
    expect(typeof result.durationMs).toBe('number');
  });

  it('captures non-Error thrown values as a string in the errors array', async () => {
    mockDiscoverCredentials.mockRejectedValue('raw string error');

    const result = await runCredentialDiscoveryStage(makeWorkflow());

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0]).toBe('raw string error');
  });
});
