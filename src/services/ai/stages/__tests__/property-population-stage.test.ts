/**
 * Unit tests for property-population-stage.ts
 *
 * Tasks: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6
 * Requirements: 4.3, 4.5, 6.2, 4.6, 5.1, 2.3
 */

// ─── Mocks (must be declared before imports due to jest.mock hoisting) ────────

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

jest.mock('../property-population-stage-client', () => ({
  runPropertyPopulationJsonRemote: jest.fn(),
}));

jest.mock('../../../../core/registry/unified-node-registry', () => ({
  unifiedNodeRegistry: {
    get: jest.fn(),
    getBuildValueContext: jest.fn(() => ({ upstreamFields: [], targetFields: [] })),
  },
}));

// ─── Imports (after mocks) ────────────────────────────────────────────────────

import { runPropertyPopulationStage } from '../property-population-stage';
import type { AiPipelineOutput } from '../../ai-first-pipeline';
import type { Workflow } from '../../../../core/types/ai-types';
import { logger } from '../../../../core/logger';
import { geminiOrchestrator } from '../../gemini-orchestrator';
import { unifiedNodeRegistry } from '../../../../core/registry/unified-node-registry';
import { runPropertyPopulationJsonRemote } from '../property-population-stage-client';

// ─── Typed mock helpers ───────────────────────────────────────────────────────

const mockLoggerInfo = logger.info as jest.Mock;
const mockLoggerWarn = logger.warn as jest.Mock;
const mockProcessRequest = geminiOrchestrator.processRequest as jest.Mock;
const mockRegistryGet = unifiedNodeRegistry.get as jest.Mock;
const mockRunPropertyPopulationJsonRemote = runPropertyPopulationJsonRemote as jest.Mock;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeWorkflow(overrides?: Partial<Workflow>): Workflow {
  return {
    nodes: [
      {
        id: 'node_1',
        type: 'set_variable',
        data: {
          label: 'Set Variable',
          type: 'set_variable',
          category: 'logic',
          config: {},
        },
      },
    ],
    edges: [{ id: 'edge_1', source: 'trigger_1', target: 'node_1' }],
    ...overrides,
  };
}

// ─── Test Suite ───────────────────────────────────────────────────────────────

describe('runPropertyPopulationStage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRunPropertyPopulationJsonRemote.mockResolvedValue(null);
  });

  // ── 8.1: stage emits ai_pipeline_stage_start and ai_pipeline_stage_end ──────
  it('8.1 — emits ai_pipeline_stage_start and ai_pipeline_stage_end log events with correlationId', async () => {
    mockProcessRequest.mockResolvedValue('{}');
    mockRegistryGet.mockReturnValue({
      inputSchema: {},
      defaultConfig: () => ({}),
    });

    const correlationId = 'test-correlation-id-8-1';

    await runPropertyPopulationStage({
      workflow: makeWorkflow(),
      userIntent: 'test intent',
      structuralPrompt: 'test blueprint',
      correlationId,
    });

    const infoCalls = mockLoggerInfo.mock.calls.map((c: unknown[]) => c[0] as Record<string, unknown>);

    const startEvent = infoCalls.find((c) => c.event === 'ai_pipeline_stage_start');
    expect(startEvent).toBeDefined();
    expect(startEvent?.stage).toBe('property_population');
    expect(startEvent?.correlationId).toBe(correlationId);

    const endEvent = infoCalls.find((c) => c.event === 'ai_pipeline_stage_end');
    expect(endEvent).toBeDefined();
    expect(endEvent?.stage).toBe('property_population');
    expect(endEvent?.correlationId).toBe(correlationId);
  });

  // ── 8.2: returns ok: true when all LLM calls fail ───────────────────────────
  it('8.2 — returns { ok: true } and empty propertyPopulationSummary when all LLM calls fail', async () => {
    mockProcessRequest.mockRejectedValue(new Error('LLM down'));
    mockRegistryGet.mockReturnValue({
      inputSchema: {
        values: {
          type: 'array',
          description: 'Values to set',
          fillMode: { default: 'buildtime_ai_once' },
          ownership: 'value',
        },
      },
      defaultConfig: () => ({ values: [] }),
    });

    const result = await runPropertyPopulationStage({
      workflow: makeWorkflow(),
      userIntent: 'set some variables',
      structuralPrompt: 'blueprint',
      correlationId: 'test-correlation-id-8-2',
    });

    expect(result.ok).toBe(true);
    expect(result.propertyPopulationSummary).toEqual({});
  });

  // ── 8.3: stage leaves workflow.edges unchanged ───────────────────────────────
  it('8.3 — does not modify workflow.edges', async () => {
    mockProcessRequest.mockResolvedValue('{}');
    mockRegistryGet.mockReturnValue({
      inputSchema: {},
      defaultConfig: () => ({}),
    });

    const workflow = makeWorkflow();
    const edgesBefore = JSON.parse(JSON.stringify(workflow.edges));

    const result = await runPropertyPopulationStage({
      workflow,
      userIntent: 'test intent',
      structuralPrompt: 'test blueprint',
      correlationId: 'test-correlation-id-8-3',
    });

    expect(result.workflow.edges).toEqual(edgesBefore);
  });

  // ── 8.4: AiPipelineOutput type includes propertyPopulationSummary (compile-time) ──
  it('8.4 — AiPipelineOutput type includes propertyPopulationSummary field (compile-time check)', () => {
    // TypeScript compile-time check: tsc errors here if the field is missing from the type.
    const output: AiPipelineOutput = {
      workflow: { nodes: [], edges: [] },
      validationIssues: [],
      stageTrace: [],
      requiredCredentials: [],
      missingCredentials: [],
      fieldOwnershipMap: {},
      propertyPopulationSummary: { node_1: ['subject', 'body'] },
    };

    expect(output.propertyPopulationSummary).toBeDefined();
    expect(output.propertyPopulationSummary['node_1']).toEqual(['subject', 'body']);
  });

  // ── 8.5: propertyPopulationSummary accurately tracks written fields ──────────
  it('8.5 — propertyPopulationSummary contains exactly the fields written to node.data.config', async () => {
    mockProcessRequest.mockResolvedValue(
      JSON.stringify({ conditions: [{ field: 'status', op: 'eq', value: 'active' }] }),
    );
    mockRegistryGet.mockReturnValue({
      inputSchema: {
        conditions: {
          type: 'array',
          description: 'Conditions',
          fillMode: { default: 'buildtime_ai_once' },
          ownership: 'value',
        },
      },
      defaultConfig: () => ({ conditions: [] }),
    });

    const result = await runPropertyPopulationStage({
      workflow: makeWorkflow(),
      userIntent: 'filter active users',
      structuralPrompt: 'blueprint',
      correlationId: 'test-8-5',
    });

    expect(result.ok).toBe(true);
    expect(result.propertyPopulationSummary['node_1']).toEqual(['conditions']);
  });

  // ── 8.6: credential fields are never written ─────────────────────────────────
  it('8.6 — never writes to fields with ownership === credential', async () => {
    mockProcessRequest.mockResolvedValue(
      JSON.stringify({ apiKey: 'should-not-be-written', conditions: [{ op: 'eq' }] }),
    );
    mockRegistryGet.mockReturnValue({
      inputSchema: {
        apiKey: {
          type: 'string',
          description: 'API key',
          fillMode: { default: 'buildtime_ai_once' },
          ownership: 'credential', // must be blocked
        },
        conditions: {
          type: 'array',
          description: 'Conditions',
          fillMode: { default: 'buildtime_ai_once' },
          ownership: 'value',
        },
      },
      defaultConfig: () => ({ apiKey: '', conditions: [] }),
    });

    const result = await runPropertyPopulationStage({
      workflow: makeWorkflow(),
      userIntent: 'check conditions',
      structuralPrompt: 'blueprint',
      correlationId: 'test-8-6',
    });

    expect(result.ok).toBe(true);
    // apiKey must NOT appear in summary
    const writtenFields = result.propertyPopulationSummary['node_1'] ?? [];
    expect(writtenFields).not.toContain('apiKey');
    // conditions should be written
    expect(writtenFields).toContain('conditions');
    // node config must not have the LLM-supplied apiKey value
    const node = result.workflow.nodes[0];
    expect(node.data.config.apiKey).not.toBe('should-not-be-written');
  });

  it('delegates property-value JSON generation to ai-generator and skips local Gemini on remote success', async () => {
    mockRunPropertyPopulationJsonRemote.mockResolvedValue({
      ok: true,
      values: { conditions: [{ field: '$json.status', operator: 'equals', value: 'active' }] },
      durationMs: 12,
      llmCall: { model: 'gemini-3.5-flash', temperature: 0.1, promptTokens: 1, completionTokens: 1 },
    });
    mockRegistryGet.mockReturnValue({
      inputSchema: {
        conditions: {
          type: 'array',
          description: 'Conditions',
          fillMode: { default: 'buildtime_ai_once' },
          ownership: 'value',
        },
      },
      defaultConfig: () => ({ conditions: [] }),
    });

    const result = await runPropertyPopulationStage({
      workflow: makeWorkflow(),
      userIntent: 'filter active users',
      structuralPrompt: 'blueprint',
      correlationId: 'remote-success',
    });

    expect(result.propertyPopulationSummary.node_1).toEqual(['conditions']);
    expect(result.workflow.nodes[0].data.config.conditions).toEqual([
      { field: '$json.status', operator: 'equals', value: 'active' },
    ]);
    expect(mockProcessRequest).not.toHaveBeenCalled();
    expect(mockRunPropertyPopulationJsonRemote).toHaveBeenCalledWith(
      expect.objectContaining({
        purpose: 'property_population',
        allowedKeys: ['conditions'],
        correlationId: 'remote-success',
        nodeId: 'node_1',
        nodeType: 'set_variable',
      }),
    );
  });

  it('falls back to local Gemini when ai-generator returns an invalid JSON response', async () => {
    mockRunPropertyPopulationJsonRemote.mockResolvedValue({
      ok: false,
      code: 'INVALID_LLM_RESPONSE',
      rawResponse: 'not json',
      durationMs: 9,
    });
    mockProcessRequest.mockResolvedValue(
      JSON.stringify({ conditions: [{ field: '$json.status', operator: 'equals', value: 'active' }] }),
    );
    mockRegistryGet.mockReturnValue({
      inputSchema: {
        conditions: {
          type: 'array',
          description: 'Conditions',
          fillMode: { default: 'buildtime_ai_once' },
          ownership: 'value',
        },
      },
      defaultConfig: () => ({ conditions: [] }),
    });

    const result = await runPropertyPopulationStage({
      workflow: makeWorkflow(),
      userIntent: 'filter active users',
      structuralPrompt: 'blueprint',
      correlationId: 'remote-invalid',
    });

    expect(result.propertyPopulationSummary.node_1).toEqual(['conditions']);
    expect(mockProcessRequest).toHaveBeenCalledWith(
      'property-population',
      expect.objectContaining({ system: expect.any(String), message: expect.any(String) }),
      expect.objectContaining({ model: 'gemini-3.5-flash', temperature: 0.1, cache: false }),
    );
  });
});
