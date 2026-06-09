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

jest.mock('../edge-reasoning-stage-client', () => ({
  runEdgeReasoningJsonRemote: jest.fn(),
  runEdgeReasoningStageRemote: jest.fn(),
}));

jest.mock('../../system-prompt-builder', () => ({
  systemPromptBuilder: {
    build: jest.fn((params: any) => ({
      systemPrompt: params.stageContext?.cycleInfo
        ? 'EDGE_REASONING_CYCLE_REPROMPT'
        : 'EDGE_REASONING_SYSTEM_PROMPT',
    })),
  },
}));

jest.mock('../../../../core/orchestration/unified-graph-orchestrator', () => ({
  unifiedGraphOrchestrator: {
    initializeWorkflow: jest.fn(),
  },
}));

jest.mock('../../../../core/registry/unified-node-registry', () => ({
  unifiedNodeRegistry: {
    get: jest.fn(),
    getOutgoingPortsForWorkflowNode: jest.fn(() => ['output']),
  },
}));

jest.mock('../../../../core/utils/branching-node-ports', () => ({
  extractSwitchCasePortNames: jest.fn(() => []),
}));

import { logger } from '../../../../core/logger';
import { unifiedGraphOrchestrator } from '../../../../core/orchestration/unified-graph-orchestrator';
import { unifiedNodeRegistry } from '../../../../core/registry/unified-node-registry';
import { geminiOrchestrator } from '../../gemini-orchestrator';
import type { SelectedNode } from '../../system-prompt-builder';
import { runEdgeReasoningStage } from '../edge-reasoning-stage';
import { runEdgeReasoningJsonRemote, runEdgeReasoningStageRemote } from '../edge-reasoning-stage-client';

const mockLoggerInfo = logger.info as jest.Mock;
const mockLoggerWarn = logger.warn as jest.Mock;
const mockLoggerError = logger.error as jest.Mock;
const mockProcessRequest = geminiOrchestrator.processRequest as jest.Mock;
const mockRegistryGet = unifiedNodeRegistry.get as jest.Mock;
const mockInitializeWorkflow = unifiedGraphOrchestrator.initializeWorkflow as jest.Mock;
const mockRunEdgeReasoningJsonRemote = runEdgeReasoningJsonRemote as jest.Mock;
const mockRunEdgeReasoningStageRemote = runEdgeReasoningStageRemote as jest.Mock;

const selectedNodes: SelectedNode[] = [
  { type: 'manual_trigger', role: 'trigger', reason: 'Starts the workflow', nodeId: 'node_manual_trigger_1' },
  { type: 'google_gmail', role: 'terminal', reason: 'Sends email', nodeId: 'node_google_gmail_1' },
];

const acyclicEdges = [
  { source: 'node_manual_trigger_1', target: 'node_google_gmail_1', type: 'main' },
];

const cyclicEdges = [
  { source: 'node_manual_trigger_1', target: 'node_google_gmail_1', type: 'main' },
  { source: 'node_google_gmail_1', target: 'node_manual_trigger_1', type: 'main' },
];

function makeEdgeJson(edges: Array<{ source: string; target: string; type: string }>) {
  return JSON.stringify({
    orderedNodes: ['node_manual_trigger_1', 'node_google_gmail_1'],
    edges,
  });
}

function mockRegistryDefinitions() {
  mockRegistryGet.mockImplementation((type: string) => {
    if (type === 'manual_trigger') {
      return {
        type,
        label: 'Manual Trigger',
        category: 'trigger',
        isBranching: false,
        defaultConfig: () => ({ triggerMode: 'manual' }),
      };
    }
    if (type === 'google_gmail') {
      return {
        type,
        label: 'Gmail',
        category: 'communication',
        isBranching: false,
        defaultConfig: () => ({ to: '' }),
      };
    }
    return undefined;
  });
}

describe('runEdgeReasoningStage logging', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRegistryDefinitions();
    mockRunEdgeReasoningStageRemote.mockResolvedValue(null);
    mockRunEdgeReasoningJsonRemote.mockResolvedValue(null);
    mockInitializeWorkflow.mockReturnValue({ workflow: { nodes: [], edges: [] } });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('logs start, local LLM call, and end summaries for local edge reasoning', async () => {
    jest.spyOn(Date, 'now').mockReturnValueOnce(1000).mockReturnValueOnce(1044);
    mockProcessRequest.mockResolvedValue(makeEdgeJson(acyclicEdges));

    const result = await runEdgeReasoningStage(
      selectedNodes,
      'CATALOG_TEXT',
      'Send a Gmail message when manually triggered',
      'corr-edge-local',
    );

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('Expected edge reasoning to succeed locally');
    expect(result.durationMs).toBe(44);
    expect(mockLoggerWarn).not.toHaveBeenCalled();
    expect(mockLoggerInfo).toHaveBeenCalledTimes(3);
    expect(mockLoggerInfo).toHaveBeenNthCalledWith(1, {
      event: 'ai_pipeline_stage_start',
      stage: 'edge_reasoning',
      correlationId: 'corr-edge-local',
      inputSummary: 'nodes=2',
    });
    expect(mockLoggerInfo).toHaveBeenNthCalledWith(2, {
      event: 'ai_pipeline_llm_call',
      stage: 'edge_reasoning',
      correlationId: 'corr-edge-local',
      model: 'gemini-3.5-flash',
      temperature: 0.1,
    });
    expect(mockLoggerInfo).toHaveBeenNthCalledWith(3, {
      event: 'ai_pipeline_stage_end',
      stage: 'edge_reasoning',
      correlationId: 'corr-edge-local',
      outputSummary: 'nodes=2, edges=1',
      durationMs: 44,
    });
  });

  it('logs remote fallback warnings before local edge reasoning', async () => {
    jest.spyOn(Date, 'now').mockReturnValueOnce(2000).mockReturnValueOnce(2031);
    mockRunEdgeReasoningStageRemote.mockResolvedValue({
      ok: false,
      code: 'INVALID_LLM_RESPONSE',
      rawResponse: 'stage returned malformed json',
      durationMs: 7,
    });
    mockRunEdgeReasoningJsonRemote.mockResolvedValue({
      ok: false,
      code: 'INVALID_LLM_RESPONSE',
      rawResponse: 'json remote returned malformed json',
      durationMs: 5,
    });
    mockProcessRequest.mockResolvedValue(makeEdgeJson(acyclicEdges));

    const result = await runEdgeReasoningStage(selectedNodes, '[]', 'Send a Gmail message', 'corr-edge-fallback');

    expect(result.ok).toBe(true);
    expect(mockLoggerWarn).toHaveBeenCalledTimes(2);
    expect(mockLoggerWarn).toHaveBeenNthCalledWith(1, expect.objectContaining({
      event: 'ai_pipeline_stage_warn',
      stage: 'edge_reasoning',
      correlationId: 'corr-edge-fallback',
      reason: expect.stringContaining('ai-generator stage returned INVALID_LLM_RESPONSE'),
    }));
    expect(mockLoggerWarn).toHaveBeenNthCalledWith(2, expect.objectContaining({
      event: 'ai_pipeline_stage_warn',
      stage: 'edge_reasoning',
      correlationId: 'corr-edge-fallback',
      reason: expect.stringContaining('ai-generator returned INVALID_LLM_RESPONSE'),
    }));
    expect(mockLoggerInfo).toHaveBeenNthCalledWith(2, {
      event: 'ai_pipeline_llm_call',
      stage: 'edge_reasoning',
      correlationId: 'corr-edge-fallback',
      model: 'gemini-3.5-flash',
      temperature: 0.1,
    });
    expect(mockLoggerInfo).toHaveBeenLastCalledWith({
      event: 'ai_pipeline_stage_end',
      stage: 'edge_reasoning',
      correlationId: 'corr-edge-fallback',
      outputSummary: 'nodes=2, edges=1',
      durationMs: 31,
    });
  });

  it('logs cycle detection warning and terminal error when the reprompt still cycles', async () => {
    const cyclicJson = makeEdgeJson(cyclicEdges);
    jest.spyOn(Date, 'now').mockReturnValueOnce(3000).mockReturnValueOnce(3027);
    mockProcessRequest.mockResolvedValue(cyclicJson);

    const result = await runEdgeReasoningStage(selectedNodes, '[]', 'Send a Gmail message', 'corr-edge-cycle');

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('Expected persistent cycle detection to fail');
    expect(result.code).toBe('CYCLE_DETECTED');
    expect(result.durationMs).toBe(27);
    expect(mockLoggerWarn).toHaveBeenCalledWith({
      event: 'ai_pipeline_cycle_detected',
      stage: 'edge_reasoning',
      correlationId: 'corr-edge-cycle',
      cycleInfo: expect.stringContaining('node_manual_trigger_1'),
    });
    expect(mockLoggerError).toHaveBeenCalledWith({
      event: 'ai_pipeline_stage_error',
      stage: 'edge_reasoning',
      correlationId: 'corr-edge-cycle',
      error: 'CYCLE_DETECTED',
      llmResponse: cyclicJson,
    });
    expect(mockLoggerInfo).not.toHaveBeenCalledWith(expect.objectContaining({
      event: 'ai_pipeline_stage_end',
      stage: 'edge_reasoning',
    }));
    expect(mockInitializeWorkflow).not.toHaveBeenCalled();
  });
});
