jest.mock('../../../../core/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

jest.mock('../../gemini-orchestrator', () => ({
  geminiOrchestrator: {
    processRequest: jest.fn(),
  },
}));

jest.mock('../../../../core/registry/unified-node-registry', () => ({
  unifiedNodeRegistry: {
    get: jest.fn(),
    has: jest.fn(),
    getRequiredCredentials: jest.fn(),
  },
}));

jest.mock('../../../credential-vault', () => ({
  getCredentialVault: jest.fn(),
}));

import { runCapabilityGrouping } from '../capability-grouper-stage';
import { geminiOrchestrator } from '../../gemini-orchestrator';
import { unifiedNodeRegistry } from '../../../../core/registry/unified-node-registry';
import type { UseCaseUnit } from '../capability-types';

const mockProcessRequest = geminiOrchestrator.processRequest as jest.Mock;
const mockRegistryGet = unifiedNodeRegistry.get as jest.Mock;
const mockRegistryHas = unifiedNodeRegistry.has as jest.Mock;
const mockRegistryGetRequiredCredentials = unifiedNodeRegistry.getRequiredCredentials as jest.Mock;

const CATALOG = '["slack","code"]';

function unit(overrides: Partial<UseCaseUnit> = {}): UseCaseUnit {
  return {
    unitId: 'unit-slack',
    label: 'Send Slack notification',
    semanticRole: 'communication',
    description: 'Posts a workflow update to a Slack channel',
    orderIndex: 0,
    ...overrides,
  };
}

function objectContainer(label: string, candidates: string[]) {
  return {
    containerId: 'llm-container-id',
    label,
    candidates,
  };
}

function mockRegistryDefinitions() {
  mockRegistryHas.mockImplementation((nodeType: string) => ['slack', 'code'].includes(nodeType));
  mockRegistryGet.mockImplementation((nodeType: string) => {
    if (nodeType === 'slack') {
      return {
        category: 'output',
        label: 'Slack',
        description: 'Send Slack messages',
      };
    }
    if (nodeType === 'code') {
      return {
        category: 'utility',
        label: 'Code',
        description: 'Run custom JavaScript',
      };
    }
    return undefined;
  });
}

describe('runCapabilityGrouping object responses', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRegistryDefinitions();
    mockRegistryGetRequiredCredentials.mockReturnValue([]);
  });

  it('accepts a raw object response from the LLM and hydrates registry metadata', async () => {
    mockProcessRequest.mockResolvedValue(objectContainer('  Send Slack Message  ', ['slack']));

    const result = await runCapabilityGrouping([unit()], CATALOG, 'user-103', 'corr-103');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.containers).toHaveLength(1);
    expect(result.containers[0].label).toBe('Send Slack Message');
    expect(result.containers[0].containerId).toMatch(/^[0-9a-f-]{36}$/i);
    expect(result.containers[0].containerId).not.toBe('llm-container-id');
    expect(result.containers[0].candidates[0]).toMatchObject({
      nodeType: 'slack',
      label: 'Slack',
      description: 'Send Slack messages',
      credentialRequirements: [],
      hasCredentials: true,
    });
    expect(mockProcessRequest).toHaveBeenCalledTimes(1);
  });

  it('accepts a raw object response on the parse-failure retry', async () => {
    mockProcessRequest
      .mockResolvedValueOnce('not json')
      .mockResolvedValueOnce(objectContainer('Slack Retry', ['slack']));

    const result = await runCapabilityGrouping([unit()], CATALOG, 'user-103');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.containers[0].label).toBe('Slack Retry');
    expect(result.containers[0].candidates.map((candidate) => candidate.nodeType)).toEqual(['slack']);
    expect(mockProcessRequest).toHaveBeenCalledTimes(2);

    const retryPayload = mockProcessRequest.mock.calls[1][1];
    expect(retryPayload.system).toContain('could not be parsed as a JSON object');
    expect(retryPayload.system).toContain('containerId');
    expect(retryPayload.system).toContain('candidates');
  });

  it('accepts a raw object response on the empty-container retry and includes violation context', async () => {
    mockProcessRequest
      .mockResolvedValueOnce(objectContainer('Run Code', ['code']))
      .mockResolvedValueOnce(objectContainer('Slack Retry', ['slack']));

    const result = await runCapabilityGrouping([unit()], CATALOG, 'user-103', 'corr-empty');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.containers[0].label).toBe('Slack Retry');
    expect(result.containers[0].candidates.map((candidate) => candidate.nodeType)).toEqual(['slack']);
    expect(mockProcessRequest).toHaveBeenCalledTimes(2);

    const retryPayload = mockProcessRequest.mock.calls[1][1];
    expect(retryPayload.system).toContain('semanticRole="communication"');
    expect(retryPayload.system).toContain('wrong category');
    expect(retryPayload.system).toContain('The nodes you returned were: [code]');
    expect(retryPayload.system).toContain('communication, output');
  });
});
