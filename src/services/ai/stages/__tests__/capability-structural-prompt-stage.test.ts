import { runCapabilityStructuralPromptStage } from '../capability-structural-prompt-stage';
import { unifiedNodeRegistry } from '../../../../core/registry/unified-node-registry';
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
const mockGetDefaultConfig = (unifiedNodeRegistry as any).getDefaultConfig as jest.Mock;
const mockGenerateSummary = aiDrivenWorkflowSummaryGenerator.generateSummary as jest.Mock;

function makeInput(nodeTypes: string[], userPrompt = 'automate my tasks'): StructuralPromptGenerationInput {
  return {
    userPrompt,
    orderedSelections: nodeTypes.map((type, i) => ({
      containerId: `container-${i}`,
      useCaseUnit: {
        unitId: `unit-${i}`,
        label: `Unit ${i}`,
        semanticRole: 'trigger' as const,
        description: `desc ${i}`,
        orderIndex: i,
      },
      selectedNodeType: type,
    })),
    nodeCatalog: 'catalog text',
    correlationId: 'corr-123',
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGet.mockReturnValue({ label: 'Test Node', category: 'action', isBranching: false });
  mockGetDefaultConfig.mockReturnValue({});
  mockGenerateSummary.mockResolvedValue({ summary: 'AI-generated structural prompt' });
});

describe('runCapabilityStructuralPromptStage — AI success path', () => {
  it('returns ok:true with selectedNodeTypes from orderedSelections', async () => {
    const input = makeInput(['schedule_trigger', 'send_email']);
    const result = await runCapabilityStructuralPromptStage(input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.selectedNodeTypes).toEqual(['schedule_trigger', 'send_email']);
  });

  it('edgeCount is always 0 (preview-only workflow)', async () => {
    const input = makeInput(['schedule_trigger', 'send_email']);
    const result = await runCapabilityStructuralPromptStage(input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.edgeCount).toBe(0);
  });

  it('nodeCount equals orderedSelections length', async () => {
    const input = makeInput(['a', 'b', 'c']);
    const result = await runCapabilityStructuralPromptStage(input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.nodeCount).toBe(3);
    expect(result.workflow.nodes).toHaveLength(3);
  });

  it('hydrates node with label and category from registry', async () => {
    mockGet.mockReturnValue({ label: 'Gmail Trigger', category: 'trigger', isBranching: false });
    mockGetDefaultConfig.mockReturnValue({ poll: true });
    const input = makeInput(['gmail_trigger']);
    const result = await runCapabilityStructuralPromptStage(input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const node = result.workflow.nodes[0];
    expect(node.type).toBe('gmail_trigger');
    expect(node.data.label).toBe('Gmail Trigger');
    expect(node.data.category).toBe('trigger');
    expect(node.data.config).toEqual({ poll: true });
  });

  it('falls back to nodeType as label when registry.get returns undefined', async () => {
    mockGet.mockReturnValue(undefined);
    mockGetDefaultConfig.mockReturnValue({});
    const input = makeInput(['unknown_node']);
    const result = await runCapabilityStructuralPromptStage(input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.workflow.nodes[0].data.label).toBe('unknown_node');
    expect(result.workflow.nodes[0].data.category).toBe('utility');
  });

  it('structuralPrompt uses generateSummary().summary when AI succeeds', async () => {
    mockGenerateSummary.mockResolvedValue({ summary: 'Beautiful workflow description' });
    const input = makeInput(['schedule_trigger', 'slack_message']);
    const result = await runCapabilityStructuralPromptStage(input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.structuralPrompt).toBe('Beautiful workflow description');
  });

  it('llmCall.model is gemini-3.5-flash', async () => {
    const input = makeInput(['schedule_trigger']);
    const result = await runCapabilityStructuralPromptStage(input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.llmCall.model).toBe('gemini-3.5-flash');
  });

  it('handles empty orderedSelections: 0 nodeCount and edgeCount', async () => {
    const input = makeInput([]);
    const result = await runCapabilityStructuralPromptStage(input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.nodeCount).toBe(0);
    expect(result.edgeCount).toBe(0);
    expect(result.workflow.nodes).toHaveLength(0);
  });

  it('durationMs is a non-negative number', async () => {
    const input = makeInput(['schedule_trigger']);
    const result = await runCapabilityStructuralPromptStage(input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });
});

describe('runCapabilityStructuralPromptStage — registry fallback (generateSummary fails)', () => {
  beforeEach(() => {
    mockGenerateSummary.mockRejectedValue(new Error('LLM unavailable'));
  });

  it('still returns ok:true when generateSummary throws', async () => {
    const input = makeInput(['schedule_trigger', 'send_email']);
    const result = await runCapabilityStructuralPromptStage(input);
    expect(result.ok).toBe(true);
  });

  it('fallback prompt with no nodes contains "(no nodes selected)"', async () => {
    const input = makeInput([], 'my prompt');
    const result = await runCapabilityStructuralPromptStage(input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.structuralPrompt).toContain('(no nodes selected)');
  });

  it('fallback prompt includes WORKFLOW, TRIGGER, FLOW, CONNECTIONS sections', async () => {
    const input = makeInput(['schedule_trigger', 'send_email'], 'send daily report');
    const result = await runCapabilityStructuralPromptStage(input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.structuralPrompt).toContain('WORKFLOW');
    expect(result.structuralPrompt).toContain('TRIGGER');
    expect(result.structuralPrompt).toContain('FLOW');
    expect(result.structuralPrompt).toContain('CONNECTIONS');
  });

  it('linear workflow CONNECTIONS shows sequential chain', async () => {
    mockGet.mockImplementation((type: string) => ({
      label: type === 'schedule_trigger' ? 'Schedule Trigger' : 'Send Email',
      category: 'action',
      isBranching: false,
    }));
    const input = makeInput(['schedule_trigger', 'send_email'], 'send report');
    const result = await runCapabilityStructuralPromptStage(input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.structuralPrompt).toContain('Data flows sequentially');
    expect(result.structuralPrompt).toContain('Schedule Trigger → Send Email');
  });

  it('branching workflow FLOW contains "→ Case" for downstream nodes', async () => {
    mockGet.mockImplementation((type: string) => {
      if (type === 'schedule_trigger') return { label: 'Schedule Trigger', category: 'trigger', isBranching: false };
      if (type === 'if_else') return { label: 'If/Else', category: 'logic', isBranching: true };
      return { label: type, category: 'action', isBranching: false };
    });
    const input = makeInput(
      ['schedule_trigger', 'if_else', 'send_email', 'slack_message'],
      'route conditionally',
    );
    const result = await runCapabilityStructuralPromptStage(input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.structuralPrompt).toContain('→ Case 1:');
    expect(result.structuralPrompt).toContain('→ Case 2:');
  });

  it('branching workflow CONNECTIONS mentions branch label, not "sequentially"', async () => {
    mockGet.mockImplementation((type: string) => {
      if (type === 'if_else') return { label: 'If/Else', category: 'logic', isBranching: true };
      return { label: type === 'schedule_trigger' ? 'Schedule Trigger' : type, category: 'action', isBranching: false };
    });
    const input = makeInput(['schedule_trigger', 'if_else', 'send_email'], 'route');
    const result = await runCapabilityStructuralPromptStage(input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.structuralPrompt).toContain('CONNECTIONS:');
    expect(result.structuralPrompt).toContain('If/Else');
    expect(result.structuralPrompt).not.toContain('Data flows sequentially');
  });

  it('TRIGGER section contains trigger node label', async () => {
    mockGet.mockImplementation((type: string) => ({
      label: type === 'webhook_trigger' ? 'Webhook Trigger' : 'Process Data',
      category: 'action',
      isBranching: false,
    }));
    const input = makeInput(['webhook_trigger', 'process_data'], 'handle webhooks');
    const result = await runCapabilityStructuralPromptStage(input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.structuralPrompt).toContain('TRIGGER: Webhook Trigger');
  });

  it('WORKFLOW section contains userPrompt text', async () => {
    const input = makeInput(['some_node'], 'send a daily summary email');
    const result = await runCapabilityStructuralPromptStage(input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.structuralPrompt).toContain('send a daily summary email');
  });
});
