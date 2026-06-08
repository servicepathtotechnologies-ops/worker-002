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
}));

jest.mock('../../system-prompt-builder', () => ({
  systemPromptBuilder: {
    build: jest.fn(() => ({ systemPrompt: 'EDGE_REASONING_SYSTEM_PROMPT' })),
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

import { geminiOrchestrator } from '../../gemini-orchestrator';
import { unifiedNodeRegistry } from '../../../../core/registry/unified-node-registry';
import { unifiedGraphOrchestrator } from '../../../../core/orchestration/unified-graph-orchestrator';
import { runEdgeReasoningStage } from '../edge-reasoning-stage';
import { runEdgeReasoningJsonRemote } from '../edge-reasoning-stage-client';
import type { SelectedNode } from '../../system-prompt-builder';

const mockProcessRequest = geminiOrchestrator.processRequest as jest.Mock;
const mockRegistryGet = unifiedNodeRegistry.get as jest.Mock;
const mockInitializeWorkflow = unifiedGraphOrchestrator.initializeWorkflow as jest.Mock;
const mockRunEdgeReasoningJsonRemote = runEdgeReasoningJsonRemote as jest.Mock;

const selectedNodes: SelectedNode[] = [
  { type: 'manual_trigger', role: 'trigger', reason: 'Starts the workflow', nodeId: 'node_manual_trigger_1' },
  { type: 'google_gmail', role: 'terminal', reason: 'Send email', nodeId: 'node_google_gmail_1' },
];

const remoteSuccess = {
  ok: true,
  orderedNodes: ['node_manual_trigger_1', 'node_google_gmail_1'],
  edges: [{ source: 'node_manual_trigger_1', target: 'node_google_gmail_1', type: 'main' }],
  durationMs: 22,
  llmCall: { model: 'gemini-3.5-flash', temperature: 0.1, promptTokens: 5, completionTokens: 12 },
};

function mockRegistryDefinitions() {
  mockRegistryGet.mockImplementation((type: string) => {
    if (type === 'manual_trigger') {
      return { type, label: 'Manual Trigger', category: 'trigger', defaultConfig: () => ({}) };
    }
    if (type === 'google_gmail') {
      return { type, label: 'Gmail', category: 'communication', defaultConfig: () => ({}) };
    }
    return undefined;
  });
}

function mockOrchestratorInit(nodes: unknown[], edges: unknown[]) {
  mockInitializeWorkflow.mockReturnValue({ workflow: { nodes, edges } });
}

describe('runEdgeReasoningStage remote JSON delegation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRegistryDefinitions();
  });

  it('uses ai-generator parsed nodes+edges and builds workflow without calling local Gemini', async () => {
    mockRunEdgeReasoningJsonRemote.mockResolvedValue(remoteSuccess);
    mockOrchestratorInit(
      selectedNodes.map((n) => ({ id: n.nodeId, type: n.type, data: { type: n.type, label: n.type, category: 'action', config: {} } })),
      [],
    );

    const result = await runEdgeReasoningStage(
      selectedNodes,
      '[]',
      'Send email when triggered',
      'remote-success',
      'blueprint',
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.orderedNodeIds).toEqual(remoteSuccess.orderedNodes);
    expect(result.edges).toEqual(remoteSuccess.edges);
    expect(result.llmCall.model).toBe('gemini-3.5-flash');
    expect(result.llmCall.promptTokens).toBe(5);
    expect(result.llmCall.completionTokens).toBe(12);

    expect(mockProcessRequest).not.toHaveBeenCalled();
    expect(mockRunEdgeReasoningJsonRemote).toHaveBeenCalledWith({
      systemPrompt: 'EDGE_REASONING_SYSTEM_PROMPT',
      message: expect.stringContaining('SELECTED_NODES:'),
      correlationId: 'remote-success',
    });
  });

  it('workflow contains the seeded edges from the remote response on success', async () => {
    mockRunEdgeReasoningJsonRemote.mockResolvedValue(remoteSuccess);
    mockOrchestratorInit(
      selectedNodes.map((n) => ({ id: n.nodeId, type: n.type, data: { type: n.type, label: n.type, category: 'action', config: {} } })),
      [],
    );

    const result = await runEdgeReasoningStage(selectedNodes, '[]', 'intent', 'corr-1');

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const edgeSources = result.workflow.edges.map((e: any) => e.source);
    expect(edgeSources).toContain('node_manual_trigger_1');
  });

  it('falls back to local Gemini when ai-generator returns INVALID_LLM_RESPONSE', async () => {
    mockRunEdgeReasoningJsonRemote.mockResolvedValue({
      ok: false,
      code: 'INVALID_LLM_RESPONSE',
      rawResponse: 'not json',
      durationMs: 9,
    });

    const localResponse = {
      orderedNodes: ['node_manual_trigger_1', 'node_google_gmail_1'],
      edges: [{ source: 'node_manual_trigger_1', target: 'node_google_gmail_1', type: 'main' }],
    };
    mockProcessRequest.mockResolvedValue(JSON.stringify(localResponse));
    mockOrchestratorInit(
      selectedNodes.map((n) => ({ id: n.nodeId, type: n.type, data: { type: n.type, label: n.type, category: 'action', config: {} } })),
      [],
    );

    const result = await runEdgeReasoningStage(selectedNodes, '[]', 'intent', 'remote-invalid');

    expect(result.ok).toBe(true);
    expect(mockProcessRequest).toHaveBeenCalledWith(
      'workflow-generation',
      expect.objectContaining({
        system: 'EDGE_REASONING_SYSTEM_PROMPT',
        message: expect.stringContaining('SELECTED_NODES:'),
      }),
      expect.objectContaining({ model: 'gemini-3.5-flash', temperature: 0.1, cache: false }),
    );
  });

  it('propagates CYCLE_DETECTED immediately when remote reports a cycle without calling local Gemini', async () => {
    mockRunEdgeReasoningJsonRemote.mockResolvedValue({
      ok: false,
      code: 'CYCLE_DETECTED',
      rawResponse: 'cyclic graph json',
      durationMs: 14,
    });

    const result = await runEdgeReasoningStage(selectedNodes, '[]', 'intent', 'remote-cycle');

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('CYCLE_DETECTED');
    expect(mockProcessRequest).not.toHaveBeenCalled();
  });

  it('falls back to local Gemini when remote returns null (AI_GENERATOR_URL unset)', async () => {
    mockRunEdgeReasoningJsonRemote.mockResolvedValue(null);

    const localResponse = {
      orderedNodes: ['node_manual_trigger_1', 'node_google_gmail_1'],
      edges: [{ source: 'node_manual_trigger_1', target: 'node_google_gmail_1', type: 'main' }],
    };
    mockProcessRequest.mockResolvedValue(JSON.stringify(localResponse));
    mockOrchestratorInit(
      selectedNodes.map((n) => ({ id: n.nodeId, type: n.type, data: { type: n.type, label: n.type, category: 'action', config: {} } })),
      [],
    );

    const result = await runEdgeReasoningStage(selectedNodes, '[]', 'intent', 'no-url');

    expect(result.ok).toBe(true);
    expect(mockProcessRequest).toHaveBeenCalled();
  });
});
