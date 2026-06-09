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

jest.mock('../validation-stage-client', () => ({
  runValidationStageRemote: jest.fn(),
}));

jest.mock('../../system-prompt-builder', () => ({
  systemPromptBuilder: {
    build: jest.fn(() => ({ systemPrompt: 'VALIDATION_SYSTEM_PROMPT' })),
  },
}));

jest.mock('../../../../core/orchestration/unified-graph-orchestrator', () => ({
  unifiedGraphOrchestrator: {
    validateWorkflow: jest.fn(),
  },
}));

jest.mock('../../../../core/utils/node-field-intelligence', () => ({
  validateWorkflowNodeIntelligence: jest.fn(() => []),
}));

import { unifiedGraphOrchestrator } from '../../../../core/orchestration/unified-graph-orchestrator';
import { validateWorkflowNodeIntelligence } from '../../../../core/utils/node-field-intelligence';
import { geminiOrchestrator } from '../../gemini-orchestrator';
import { systemPromptBuilder } from '../../system-prompt-builder';
import { runValidationStage } from '../validation-stage';
import { runValidationStageRemote } from '../validation-stage-client';

const mockProcessRequest = geminiOrchestrator.processRequest as jest.Mock;
const mockBuildPrompt = systemPromptBuilder.build as jest.Mock;
const mockValidateWorkflow = unifiedGraphOrchestrator.validateWorkflow as jest.Mock;
const mockValidateWorkflowNodeIntelligence = validateWorkflowNodeIntelligence as jest.Mock;
const mockRunValidationStageRemote = runValidationStageRemote as jest.Mock;

const minimalWorkflow = {
  nodes: [
    {
      id: 'node_manual_trigger_1',
      type: 'manual_trigger',
      data: { label: 'Trigger', type: 'manual_trigger', category: 'trigger', config: {} },
    },
    {
      id: 'node_google_gmail_1',
      type: 'google_gmail',
      data: { label: 'Gmail', type: 'google_gmail', category: 'communication', config: {} },
    },
  ],
  edges: [{ id: 'edge_1', source: 'node_manual_trigger_1', target: 'node_google_gmail_1', type: 'main' }],
};

const selectedNodes = [
  {
    type: 'manual_trigger',
    role: 'trigger' as const,
    reason: 'Start manually',
    nodeId: 'node_manual_trigger_1',
  },
  {
    type: 'google_gmail',
    role: 'terminal' as const,
    reason: 'Send the Gmail message',
    nodeId: 'node_google_gmail_1',
  },
];

const proposedEdges = [
  {
    source: 'node_manual_trigger_1',
    target: 'node_google_gmail_1',
    type: 'main',
  },
];

function makeValidationJson(status: 'pass' | 'fail', issues: Array<Record<string, unknown>>) {
  return JSON.stringify({ status, issues });
}

describe('runValidationStage local Gemini behavior', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRunValidationStageRemote.mockResolvedValue(null);
    mockValidateWorkflow.mockReturnValue({ valid: true, errors: [] });
    mockValidateWorkflowNodeIntelligence.mockReturnValue([]);
  });

  it('uses local Gemini when remote is unavailable and parses fenced warning JSON', async () => {
    const llmWarning = {
      severity: 'warning',
      description: 'Gmail subject is generic',
      suggestedFix: 'Set a workflow-specific subject',
    };
    mockValidateWorkflowNodeIntelligence.mockReturnValue([
      {
        severity: 'error',
        nodeType: 'google_gmail',
        nodeLabel: 'Gmail',
        fieldName: 'to',
        reason: 'Missing recipient',
        suggestedValue: 'ops@example.com',
      },
    ]);
    mockProcessRequest.mockResolvedValue([
      '```json',
      makeValidationJson('pass', [llmWarning]),
      '```',
    ].join('\n'));

    const result = await runValidationStage(
      minimalWorkflow,
      'CATALOG_TEXT',
      'Send a Gmail message when manually triggered',
      selectedNodes,
      proposedEdges,
      'local-fenced',
      'workflow blueprint',
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.validationIssues).toEqual([
      llmWarning,
      {
        severity: 'warning',
        description: 'Gmail.to: Missing recipient',
        suggestedFix: 'Use suggested value "ops@example.com" or provide an explicit value.',
      },
    ]);
    expect(mockRunValidationStageRemote).toHaveBeenCalledWith(
      minimalWorkflow,
      'CATALOG_TEXT',
      'Send a Gmail message when manually triggered',
      selectedNodes,
      proposedEdges,
      'local-fenced',
      'workflow blueprint',
    );
    expect(mockBuildPrompt).toHaveBeenCalledWith({
      stage: 'validation',
      nodeCatalog: 'CATALOG_TEXT',
      userIntent: 'Send a Gmail message when manually triggered',
      stageContext: { selectedNodes, edgeList: proposedEdges },
    });
    expect(mockProcessRequest).toHaveBeenCalledWith(
      'workflow-analysis',
      expect.objectContaining({
        system: 'VALIDATION_SYSTEM_PROMPT',
        message: expect.stringContaining('WORKFLOW_BLUEPRINT:\nworkflow blueprint'),
      }),
      expect.objectContaining({ model: 'gemini-3.5-flash', temperature: 0.1, cache: false }),
    );
    expect(mockValidateWorkflow).toHaveBeenCalledWith(minimalWorkflow);
  });

  it('retries once with a JSON-only reminder after an invalid local response', async () => {
    const retryJson = makeValidationJson('pass', []);
    mockProcessRequest
      .mockResolvedValueOnce('not-json')
      .mockResolvedValueOnce(retryJson);

    const result = await runValidationStage(
      minimalWorkflow,
      '[]',
      'Send a Gmail message when manually triggered',
      undefined,
      undefined,
      'local-retry',
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.validationIssues).toEqual([]);
    expect(result.llmCall.completionTokens).toBe(Math.ceil(retryJson.length / 4));
    expect(mockProcessRequest).toHaveBeenCalledTimes(2);
    expect(mockProcessRequest).toHaveBeenNthCalledWith(
      2,
      'workflow-analysis',
      expect.objectContaining({
        system: expect.stringContaining('CRITICAL: Return ONLY valid JSON'),
      }),
      expect.objectContaining({ model: 'gemini-3.5-flash', temperature: 0.1, cache: false }),
    );
  });

  it('uses the orchestrator safety net when the local provider throws', async () => {
    mockProcessRequest.mockRejectedValue(new Error('provider unavailable'));

    const result = await runValidationStage(
      minimalWorkflow,
      '[]',
      'Send a Gmail message when manually triggered',
      undefined,
      undefined,
      'local-provider-failure',
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.validationIssues).toEqual([]);
    expect(result.llmCall).toEqual({
      model: 'gemini-3.5-flash',
      temperature: 0.1,
      promptTokens: 0,
      completionTokens: 0,
    });
    expect(mockValidateWorkflow).toHaveBeenCalledWith(minimalWorkflow);
  });

  it('returns orchestrator validation errors when invalid local responses meet an invalid graph', async () => {
    mockProcessRequest
      .mockResolvedValueOnce('not-json')
      .mockResolvedValueOnce('still-not-json');
    mockValidateWorkflow.mockReturnValue({ valid: false, errors: ['Missing edge from trigger to action'] });

    const result = await runValidationStage(
      minimalWorkflow,
      '[]',
      'Send a Gmail message when manually triggered',
      undefined,
      undefined,
      'local-invalid-graph',
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('ORCHESTRATOR_VALIDATION_FAILED');
    expect(result.workflow).toBe(minimalWorkflow);
    expect(result.validationIssues).toEqual([
      {
        severity: 'error',
        description: 'Missing edge from trigger to action',
        suggestedFix: 'Fix structural graph issue via UnifiedGraphOrchestrator',
      },
    ]);
    expect(mockProcessRequest).toHaveBeenCalledTimes(2);
    expect(mockValidateWorkflow).toHaveBeenCalledWith(minimalWorkflow);
  });

  it('runs one repair pass and revalidates error-severity issues', async () => {
    const initialError = {
      severity: 'error',
      description: 'Gmail is disconnected',
      suggestedFix: 'Connect trigger to Gmail',
    };
    const initialWarning = {
      severity: 'warning',
      description: 'Gmail label is generic',
      suggestedFix: 'Rename the node',
    };
    const repairedEdges = [
      { source: 'node_manual_trigger_1', target: 'node_google_gmail_1', type: 'main' },
    ];
    const revalidatedWarning = {
      severity: 'warning',
      description: 'Gmail subject is generic',
      suggestedFix: 'Set a workflow-specific subject',
    };
    mockProcessRequest
      .mockResolvedValueOnce(makeValidationJson('fail', [initialError, initialWarning]))
      .mockResolvedValueOnce(JSON.stringify({ nodes: minimalWorkflow.nodes, edges: repairedEdges }))
      .mockResolvedValueOnce(makeValidationJson('pass', [revalidatedWarning]));

    const result = await runValidationStage(
      minimalWorkflow,
      'CATALOG_TEXT',
      'Send a Gmail message when manually triggered',
      selectedNodes,
      proposedEdges,
      'local-repair',
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.validationIssues).toEqual([revalidatedWarning]);
    expect(mockProcessRequest).toHaveBeenCalledTimes(3);
    expect(mockProcessRequest).toHaveBeenNthCalledWith(
      2,
      'workflow-analysis',
      expect.objectContaining({
        system: 'VALIDATION_SYSTEM_PROMPT',
        message: 'USER_INTENT:\nSend a Gmail message when manually triggered',
      }),
      expect.objectContaining({ model: 'gemini-3.5-flash', temperature: 0.1, cache: false }),
    );
    expect(mockBuildPrompt).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        stage: 'repair',
        stageContext: expect.objectContaining({
          selectedNodes,
          edgeList: proposedEdges,
          validationIssues: [initialError],
        }),
      }),
    );
    expect(mockBuildPrompt).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        stage: 'validation',
        stageContext: expect.objectContaining({
          selectedNodes,
          edgeList: repairedEdges,
        }),
      }),
    );
    expect(mockValidateWorkflow).toHaveBeenCalledWith(minimalWorkflow);
  });
});
