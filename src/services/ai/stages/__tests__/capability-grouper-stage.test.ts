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

import { runCapabilityGrouping, buildGrouperSystemPromptForTest } from '../capability-grouper-stage';
import { geminiOrchestrator } from '../../gemini-orchestrator';
import { unifiedNodeRegistry } from '../../../../core/registry/unified-node-registry';
import { getCredentialVault } from '../../../credential-vault';
import type { UseCaseUnit } from '../capability-types';

const mockProcessRequest = geminiOrchestrator.processRequest as jest.Mock;
const mockRegistryGet = unifiedNodeRegistry.get as jest.Mock;
const mockRegistryHas = unifiedNodeRegistry.has as jest.Mock;
const mockRegistryGetRequiredCredentials = unifiedNodeRegistry.getRequiredCredentials as jest.Mock;
const mockGetCredentialVault = getCredentialVault as jest.Mock;

const CATALOG = '["slack","google_gmail","webhook_trigger","schedule_trigger"]';

function makeUnit(overrides: Partial<UseCaseUnit> = {}): UseCaseUnit {
  return {
    unitId: 'unit-1',
    label: 'Send a Slack message',
    semanticRole: 'output',
    description: 'Posts a message to a Slack channel',
    orderIndex: 0,
    ...overrides,
  };
}

function containerJson(label: string, candidates: string[], containerId = 'llm-given-id'): string {
  return JSON.stringify({ containerId, label, candidates });
}

describe('buildGrouperSystemPromptForTest', () => {
  it('returns a string that embeds the node catalog', () => {
    const prompt = buildGrouperSystemPromptForTest(CATALOG);
    expect(typeof prompt).toBe('string');
    expect(prompt.length).toBeGreaterThan(200);
    expect(prompt).toContain(CATALOG);
  });

  it('includes the required output field names', () => {
    const prompt = buildGrouperSystemPromptForTest(CATALOG);
    expect(prompt).toContain('containerId');
    expect(prompt).toContain('label');
    expect(prompt).toContain('candidates');
  });
});

describe('runCapabilityGrouping', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default: no credentials required — simplest path through hydration
    mockRegistryGetRequiredCredentials.mockReturnValue([]);
  });

  // ─── Happy path ───────────────────────────────────────────────────────────────

  it('returns ok:true with one container on valid single-unit success', async () => {
    mockRegistryHas.mockReturnValue(true);
    mockRegistryGet.mockReturnValue({ category: 'output', label: 'Slack', description: 'Send Slack messages' });
    mockProcessRequest.mockResolvedValue(containerJson('Send Slack Message', ['slack'], 'llm-uuid-99'));

    const unit = makeUnit();
    const result = await runCapabilityGrouping([unit], CATALOG, 'user-1', 'corr-1');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.containers).toHaveLength(1);
    expect(result.containers[0].label).toBe('Send Slack Message');
    expect(result.containers[0].useCaseUnit).toBe(unit);
    expect(result.containers[0].candidates).toHaveLength(1);
    expect(result.containers[0].candidates[0].nodeType).toBe('slack');
    expect(result.containers[0].candidates[0].label).toBe('Slack');
    expect(result.containers[0].candidates[0].hasCredentials).toBe(true);
    expect(typeof result.durationMs).toBe('number');
    expect(mockProcessRequest).toHaveBeenCalledTimes(1);
  });

  it('always generates a fresh UUID for containerId — never trusts the LLM value', async () => {
    mockRegistryHas.mockReturnValue(true);
    mockRegistryGet.mockReturnValue({ category: 'output', label: 'Slack', description: '' });
    mockProcessRequest.mockResolvedValue(containerJson('Label', ['slack'], 'llm-static-id'));

    const result = await runCapabilityGrouping([makeUnit()], CATALOG, 'user-1');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.containers[0].containerId).toMatch(/^[0-9a-f-]{36}$/i);
    expect(result.containers[0].containerId).not.toBe('llm-static-id');
  });

  it('processes two units in order and returns two containers', async () => {
    mockRegistryHas.mockReturnValue(true);
    mockRegistryGet.mockImplementation((type: string) => {
      if (type === 'webhook_trigger') return { category: 'trigger', label: 'Webhook Trigger', description: '' };
      if (type === 'slack') return { category: 'output', label: 'Slack', description: '' };
      return null;
    });
    mockProcessRequest
      .mockResolvedValueOnce(containerJson('Trigger', ['webhook_trigger']))
      .mockResolvedValueOnce(containerJson('Notify', ['slack']));

    const units: UseCaseUnit[] = [
      makeUnit({ unitId: 'u1', label: 'Trigger', semanticRole: 'trigger', orderIndex: 0 }),
      makeUnit({ unitId: 'u2', label: 'Notify', semanticRole: 'output', orderIndex: 1 }),
    ];

    const result = await runCapabilityGrouping(units, CATALOG, 'user-1');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.containers).toHaveLength(2);
    expect(result.containers[0].useCaseUnit).toBe(units[0]);
    expect(result.containers[1].useCaseUnit).toBe(units[1]);
    expect(mockProcessRequest).toHaveBeenCalledTimes(2);
  });

  it('falls back to unit.label when the LLM returns an empty label', async () => {
    mockRegistryHas.mockReturnValue(true);
    mockRegistryGet.mockReturnValue({ category: 'output', label: 'Slack', description: '' });
    mockProcessRequest.mockResolvedValue(
      JSON.stringify({ containerId: 'x', label: '', candidates: ['slack'] }),
    );

    const unit = makeUnit({ label: 'My Fallback Label' });
    const result = await runCapabilityGrouping([unit], CATALOG, 'user-1');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.containers[0].label).toBe('My Fallback Label');
  });

  // ─── LLM failures ────────────────────────────────────────────────────────────

  it('returns LLM_CALL_FAILED when processRequest throws on first call', async () => {
    mockProcessRequest.mockRejectedValue(new Error('Connection refused'));

    const result = await runCapabilityGrouping([makeUnit()], CATALOG, 'user-1');

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('LLM_CALL_FAILED');
    expect(result.message).toContain('Connection refused');
    expect(mockProcessRequest).toHaveBeenCalledTimes(1);
  });

  it('retries and succeeds when first LLM response is unparseable JSON', async () => {
    mockRegistryHas.mockReturnValue(true);
    mockRegistryGet.mockReturnValue({ category: 'output', label: 'Slack', description: '' });
    mockProcessRequest
      .mockResolvedValueOnce('not valid json at all')
      .mockResolvedValueOnce(containerJson('Notify', ['slack']));

    const result = await runCapabilityGrouping([makeUnit()], CATALOG, 'user-1');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.containers[0].label).toBe('Notify');
    expect(mockProcessRequest).toHaveBeenCalledTimes(2);
  });

  it('returns INVALID_LLM_RESPONSE when both parse attempts produce unparseable JSON', async () => {
    mockProcessRequest.mockResolvedValue('definitely not json');

    const result = await runCapabilityGrouping([makeUnit()], CATALOG, 'user-1');

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('INVALID_LLM_RESPONSE');
    expect(mockProcessRequest).toHaveBeenCalledTimes(2);
  });

  it('returns LLM_CALL_FAILED when the parse-failure retry call throws', async () => {
    mockProcessRequest
      .mockResolvedValueOnce('bad json')
      .mockRejectedValueOnce(new Error('Retry network error'));

    const result = await runCapabilityGrouping([makeUnit()], CATALOG, 'user-1');

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('LLM_CALL_FAILED');
    expect(mockProcessRequest).toHaveBeenCalledTimes(2);
  });

  // ─── Candidate validation / semantic-role filter ──────────────────────────────

  it('retries with violation context when all candidates fail registry.has(), succeeds on retry', async () => {
    // First bad_node call: has() returns false → empty → triggers retry
    // Retry slack call: has() returns true
    mockRegistryHas
      .mockReturnValueOnce(false)
      .mockReturnValue(true);
    mockRegistryGet.mockReturnValue({ category: 'output', label: 'Slack', description: '' });

    mockProcessRequest
      .mockResolvedValueOnce(containerJson('First', ['bad_node']))
      .mockResolvedValueOnce(containerJson('Second', ['slack']));

    const result = await runCapabilityGrouping([makeUnit()], CATALOG, 'user-1');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.containers[0].candidates[0].nodeType).toBe('slack');
    expect(mockProcessRequest).toHaveBeenCalledTimes(2);
  });

  it('retries when all candidates are filtered by semanticRole category mismatch, succeeds on retry', async () => {
    mockRegistryHas.mockReturnValue(true);
    mockRegistryGet.mockImplementation((type: string) => {
      // wrong_node has 'output' category — not allowed for 'trigger' role
      if (type === 'wrong_node') return { category: 'output', label: 'Wrong', description: '' };
      // webhook_trigger has 'trigger' category — allowed for 'trigger' role
      if (type === 'webhook_trigger') return { category: 'trigger', label: 'Webhook', description: '' };
      return null;
    });

    mockProcessRequest
      .mockResolvedValueOnce(containerJson('Attempt1', ['wrong_node']))
      .mockResolvedValueOnce(containerJson('Attempt2', ['webhook_trigger']));

    const unit = makeUnit({ unitId: 'u1', label: 'Trigger step', semanticRole: 'trigger' });
    const result = await runCapabilityGrouping([unit], CATALOG, 'user-1');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.containers[0].candidates[0].nodeType).toBe('webhook_trigger');
    expect(mockProcessRequest).toHaveBeenCalledTimes(2);
  });

  it('returns EMPTY_CONTAINER when candidates are empty after the retry as well', async () => {
    mockRegistryHas.mockReturnValue(false); // all candidates always fail registry check

    mockProcessRequest
      .mockResolvedValueOnce(containerJson('Attempt1', ['bad_1']))
      .mockResolvedValueOnce(containerJson('Attempt2', ['bad_2']));

    const unit = makeUnit({ unitId: 'u1' });
    const result = await runCapabilityGrouping([unit], CATALOG, 'user-1');

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('EMPTY_CONTAINER');
    expect(result.failedUnitId).toBe('u1');
    expect(mockProcessRequest).toHaveBeenCalledTimes(2);
  });

  it('returns LLM_CALL_FAILED when the empty-container retry call throws', async () => {
    mockRegistryHas.mockReturnValue(false);

    mockProcessRequest
      .mockResolvedValueOnce(containerJson('Attempt1', ['bad']))
      .mockRejectedValueOnce(new Error('Empty-container retry failed'));

    const result = await runCapabilityGrouping([makeUnit()], CATALOG, 'user-1');

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('LLM_CALL_FAILED');
    expect(mockProcessRequest).toHaveBeenCalledTimes(2);
  });

  // ─── Credential hydration ─────────────────────────────────────────────────────

  it('sets hasCredentials:true when the node requires no credentials', async () => {
    mockRegistryHas.mockReturnValue(true);
    mockRegistryGet.mockReturnValue({ category: 'output', label: 'Slack', description: '' });
    mockRegistryGetRequiredCredentials.mockReturnValue([]);
    mockProcessRequest.mockResolvedValue(containerJson('Notify', ['slack']));

    const result = await runCapabilityGrouping([makeUnit()], CATALOG, 'user-1');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.containers[0].candidates[0].hasCredentials).toBe(true);
  });

  it('sets hasCredentials:true when vault.exists returns true for a required credential', async () => {
    mockRegistryHas.mockReturnValue(true);
    mockRegistryGet.mockReturnValue({ category: 'output', label: 'Gmail', description: '' });
    mockRegistryGetRequiredCredentials.mockReturnValue([{ category: 'google', provider: 'google' }]);
    const mockVault = { exists: jest.fn().mockResolvedValue(true) };
    mockGetCredentialVault.mockReturnValue(mockVault);
    mockProcessRequest.mockResolvedValue(containerJson('Email', ['google_gmail']));

    const result = await runCapabilityGrouping([makeUnit()], CATALOG, 'user-1');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.containers[0].candidates[0].hasCredentials).toBe(true);
  });

  it('sets hasCredentials:false when vault.exists returns false', async () => {
    mockRegistryHas.mockReturnValue(true);
    mockRegistryGet.mockReturnValue({ category: 'output', label: 'Gmail', description: '' });
    mockRegistryGetRequiredCredentials.mockReturnValue([{ category: 'google', provider: 'google' }]);
    const mockVault = { exists: jest.fn().mockResolvedValue(false) };
    mockGetCredentialVault.mockReturnValue(mockVault);
    mockProcessRequest.mockResolvedValue(containerJson('Email', ['google_gmail']));

    const result = await runCapabilityGrouping([makeUnit()], CATALOG, 'user-1');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.containers[0].candidates[0].hasCredentials).toBe(false);
  });

  // ─── Error propagation ────────────────────────────────────────────────────────

  it('propagates first unit error immediately without processing remaining units', async () => {
    mockProcessRequest
      .mockRejectedValueOnce(new Error('Unit 1 LLM failed'))
      .mockResolvedValue(containerJson('Second', ['slack']));

    const units: UseCaseUnit[] = [
      makeUnit({ unitId: 'u1', label: 'Trigger', semanticRole: 'trigger', orderIndex: 0 }),
      makeUnit({ unitId: 'u2', label: 'Notify', semanticRole: 'output', orderIndex: 1 }),
    ];

    const result = await runCapabilityGrouping(units, CATALOG, 'user-1');

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('LLM_CALL_FAILED');
    expect(result.failedUnitId).toBe('u1');
    expect(mockProcessRequest).toHaveBeenCalledTimes(1);
  });
});
