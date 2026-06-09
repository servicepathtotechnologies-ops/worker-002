import { runCapabilityStructuralPromptStage } from '../capability-structural-prompt-stage';
import { unifiedNodeRegistry } from '../../../../core/registry/unified-node-registry';
import { logger } from '../../../../core/logger';
import { aiDrivenWorkflowSummaryGenerator } from '../../ai-driven-workflow-summary-generator';
import type { StructuralPromptGenerationInput } from '../capability-types';

jest.mock('../../../../core/registry/unified-node-registry', () => ({
  unifiedNodeRegistry: {
    get: jest.fn(),
    getDefaultConfig: jest.fn(),
  },
}));

jest.mock('../../ai-driven-workflow-summary-generator', () => ({
  aiDrivenWorkflowSummaryGenerator: {
    generateSummary: jest.fn(),
  },
}));

jest.mock('../../gemini-orchestrator', () => ({
  geminiOrchestrator: {},
}));

jest.mock('../../../../core/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
  },
}));

const mockGet = unifiedNodeRegistry.get as jest.Mock;
const mockGetDefaultConfig = unifiedNodeRegistry.getDefaultConfig as jest.Mock;
const mockGenerateSummary = aiDrivenWorkflowSummaryGenerator.generateSummary as jest.Mock;
const mockInfo = logger.info as jest.Mock;
const mockWarn = logger.warn as jest.Mock;

function makeInput(nodeTypes: string[]): StructuralPromptGenerationInput {
  return {
    userPrompt: 'summarize new spreadsheet rows in Slack',
    orderedSelections: nodeTypes.map((type, i) => ({
      containerId: `container-${i}`,
      useCaseUnit: {
        unitId: `unit-${i}`,
        label: `Unit ${i}`,
        semanticRole: i === 0 ? 'trigger' : 'communication',
        description: `Do step ${i}`,
        orderIndex: i,
      },
      selectedNodeType: type,
    })),
    nodeCatalog: 'available capability nodes',
    correlationId: 'corr-121',
  };
}

describe('capability-structural-prompt-stage logging', () => {
  let dateNowSpy: jest.SpyInstance<number, []>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockGet.mockImplementation((type: string) => ({
      label: type === 'google_sheets' ? 'Google Sheets' : 'Slack Message',
      category: type === 'google_sheets' ? 'trigger' : 'action',
      isBranching: false,
    }));
    mockGetDefaultConfig.mockReturnValue({});
    mockGenerateSummary.mockResolvedValue({ summary: '  AI generated workflow summary  ' });
    dateNowSpy = jest.spyOn(Date, 'now')
      .mockReturnValueOnce(1000)
      .mockReturnValueOnce(1042);
  });

  afterEach(() => {
    dateNowSpy.mockRestore();
  });

  it('logs start, LLM success, and end metadata with measured duration', async () => {
    const result = await runCapabilityStructuralPromptStage(
      makeInput(['google_sheets', 'slack_message']),
    );

    expect(result.ok).toBe(true);
    expect(mockInfo).toHaveBeenCalledWith({
      event: 'capability_structural_prompt_start',
      stage: 'capability-structural-prompt-stage',
      correlationId: 'corr-121',
      selectedNodeTypes: ['google_sheets', 'slack_message'],
      nodeCount: 2,
    });
    expect(mockInfo).toHaveBeenCalledWith({
      event: 'capability_structural_prompt_llm_success',
      correlationId: 'corr-121',
      promptLen: 'AI generated workflow summary'.length,
      source: 'ai-driven-generator',
    });
    expect(mockInfo).toHaveBeenCalledWith({
      event: 'capability_structural_prompt_end',
      stage: 'capability-structural-prompt-stage',
      correlationId: 'corr-121',
      selectedNodeTypes: ['google_sheets', 'slack_message'],
      nodeCount: 2,
      edgeCount: 0,
      durationMs: 42,
    });
  });

  it('logs LLM fallback diagnostics and still emits successful end metadata', async () => {
    const err = new Error('summary service unavailable');
    mockGenerateSummary.mockRejectedValue(err);

    const result = await runCapabilityStructuralPromptStage(
      makeInput(['google_sheets', 'slack_message']),
    );

    expect(result.ok).toBe(true);
    expect(mockWarn).toHaveBeenCalledWith({
      event: 'capability_structural_prompt_llm_failed',
      correlationId: 'corr-121',
      error: String(err),
      note: 'Falling back to registry-driven structural prompt',
    });
    expect(mockInfo).toHaveBeenCalledWith({
      event: 'capability_structural_prompt_end',
      stage: 'capability-structural-prompt-stage',
      correlationId: 'corr-121',
      selectedNodeTypes: ['google_sheets', 'slack_message'],
      nodeCount: 2,
      edgeCount: 0,
      durationMs: 42,
    });
  });
});
