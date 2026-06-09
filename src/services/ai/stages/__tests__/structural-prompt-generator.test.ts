jest.mock('../../../../core/registry/unified-node-registry', () => ({
  unifiedNodeRegistry: {
    get: jest.fn(),
    resolveAlias: jest.fn(),
    isTrigger: jest.fn(),
  },
}));

import {
  StructuralPromptGenerator,
  structuralPromptGenerator,
} from '../structural-prompt-generator';
import { unifiedNodeRegistry } from '../../../../core/registry/unified-node-registry';
import type { StructuralPromptInput } from '../../../../core/types/pipeline-contracts';
import type { StructuredIntent } from '../intent-stage';
import type { SelectedNode } from '../../system-prompt-builder';

const mockGet = unifiedNodeRegistry.get as jest.Mock;
const mockResolveAlias = unifiedNodeRegistry.resolveAlias as jest.Mock;
const mockIsTrigger = unifiedNodeRegistry.isTrigger as jest.Mock;

function nd(label: string, extra: Record<string, unknown> = {}) {
  return { label, isBranching: false, category: 'action', ...extra };
}

const baseIntent: StructuredIntent = {
  intent: 'automate email sending',
  triggerType: 'webhook',
  actions: [],
  dataFlows: [],
  constraints: [],
  originalPrompt: 'automate email sending',
};

function mkInput(
  nodes: SelectedNode[],
  intentOverrides: Partial<StructuredIntent> = {},
): StructuralPromptInput {
  return {
    resolvedNodes: nodes,
    structuredIntent: { ...baseIntent, ...intentOverrides },
    capabilitySelections: {},
  };
}

describe('StructuralPromptGenerator', () => {
  let gen: StructuralPromptGenerator;

  beforeEach(() => {
    jest.clearAllMocks();
    mockGet.mockReturnValue(undefined);
    mockResolveAlias.mockImplementation((t: string) => t);
    mockIsTrigger.mockReturnValue(false);
    gen = new StructuralPromptGenerator();
  });

  // ── empty / default ────────────────────────────────────────────────────────

  it('returns default prompt when resolvedNodes is empty', () => {
    const result = gen.generate(mkInput([]));
    expect(result.steps).toHaveLength(0);
    expect(result.conditions).toHaveLength(0);
    expect(result.triggerDescription).toBe('Workflow trigger');
    expect(result.terminalAction).toBe('Workflow complete');
  });

  it('uses intent string as text in default prompt', () => {
    const result = gen.generate(mkInput([], { intent: 'my custom intent' }));
    expect(result.text).toBe('my custom intent');
  });

  // ── linear workflow ────────────────────────────────────────────────────────

  describe('linear workflow', () => {
    let nodes: SelectedNode[];

    beforeEach(() => {
      nodes = [
        { type: 'webhook_trigger', role: 'trigger', reason: '', nodeId: 'n1' },
        { type: 'google_gmail', role: 'action', reason: '', nodeId: 'n2' },
        { type: 'google_sheets', role: 'terminal', reason: '', nodeId: 'n3' },
      ];
      mockGet.mockImplementation((t: string) => {
        if (t === 'webhook_trigger') return nd('Webhook Trigger', { category: 'trigger' });
        if (t === 'google_gmail') return nd('Gmail');
        if (t === 'google_sheets') return nd('Google Sheets');
        return undefined;
      });
      mockIsTrigger.mockImplementation((t: string) => t === 'webhook_trigger');
    });

    it('builds correct step count and sequential step numbers', () => {
      const result = gen.generate(mkInput(nodes));
      expect(result.steps).toHaveLength(3);
      expect(result.steps[0].stepNumber).toBe(1);
      expect(result.steps[1].stepNumber).toBe(2);
      expect(result.steps[2].stepNumber).toBe(3);
    });

    it('step nodeType and displayName use registry label', () => {
      const result = gen.generate(mkInput(nodes));
      expect(result.steps[0].nodeType).toBe('webhook_trigger');
      expect(result.steps[0].displayName).toBe('Webhook Trigger');
      expect(result.steps[1].displayName).toBe('Gmail');
      expect(result.steps[2].displayName).toBe('Google Sheets');
    });

    it('triggerDescription uses registry label and formatTriggerType', () => {
      const result = gen.generate(mkInput(nodes, { triggerType: 'webhook' }));
      expect(result.triggerDescription).toBe('Webhook Trigger — triggered via webhook');
    });

    it('terminalAction uses last node label', () => {
      const result = gen.generate(mkInput(nodes));
      expect(result.terminalAction).toBe('Google Sheets completes the workflow');
    });

    it('step description uses action text when action contains node display name', () => {
      const result = gen.generate(mkInput(nodes, {
        actions: ['send an email via gmail to all subscribers'],
      }));
      expect(result.steps[1].description).toBe('send an email via gmail to all subscribers');
    });

    it('step description falls back to role description when no action matches', () => {
      const result = gen.generate(mkInput(nodes, { actions: [] }));
      expect(result.steps[2].description).toContain('completes the workflow');
    });

    it('composed text contains all required section headers', () => {
      const result = gen.generate(mkInput(nodes));
      expect(result.text).toContain('WORKFLOW:');
      expect(result.text).toContain('TRIGGER:');
      expect(result.text).toContain('FLOW:');
      expect(result.text).toContain('CONNECTIONS:');
    });

    it('returns no conditions for linear workflow', () => {
      const result = gen.generate(mkInput(nodes));
      expect(result.conditions).toHaveLength(0);
    });
  });

  // ── deduplication ──────────────────────────────────────────────────────────

  it('deduplicates repeated canonical types in linear workflows', () => {
    const nodes: SelectedNode[] = [
      { type: 'google_gmail', role: 'trigger', reason: '', nodeId: 'n1' },
      { type: 'google_gmail', role: 'action', reason: '', nodeId: 'n2' },
      { type: 'google_sheets', role: 'terminal', reason: '', nodeId: 'n3' },
    ];
    mockGet.mockImplementation((t: string) =>
      t === 'google_gmail' ? nd('Gmail') : t === 'google_sheets' ? nd('Google Sheets') : undefined,
    );
    const result = gen.generate(mkInput(nodes));
    expect(result.steps).toHaveLength(2);
  });

  it('skips deduplication when a branching node is present', () => {
    const nodes: SelectedNode[] = [
      { type: 'webhook_trigger', role: 'trigger', reason: '', nodeId: 'n1' },
      { type: 'if_else', role: 'logic', reason: '', nodeId: 'n2' },
      { type: 'google_gmail', role: 'action', reason: '', nodeId: 'n3' },
      { type: 'google_gmail', role: 'action', reason: '', nodeId: 'n4' },
    ];
    mockGet.mockImplementation((t: string) => {
      if (t === 'webhook_trigger') return nd('Webhook Trigger', { category: 'trigger' });
      if (t === 'if_else') return nd('If/Else', { isBranching: true });
      if (t === 'google_gmail') return nd('Gmail');
      return undefined;
    });
    mockIsTrigger.mockImplementation((t: string) => t === 'webhook_trigger');
    const result = gen.generate(mkInput(nodes));
    expect(result.steps).toHaveLength(4);
  });

  // ── branching workflow ─────────────────────────────────────────────────────

  describe('branching workflow', () => {
    let nodes: SelectedNode[];

    beforeEach(() => {
      nodes = [
        { type: 'webhook_trigger', role: 'trigger', reason: '', nodeId: 'n1' },
        { type: 'if_else', role: 'logic', reason: '', nodeId: 'n2' },
        { type: 'google_gmail', role: 'action', reason: '', nodeId: 'n3' },
        { type: 'slack', role: 'action', reason: '', nodeId: 'n4' },
      ];
      mockGet.mockImplementation((t: string) => {
        if (t === 'webhook_trigger') return nd('Webhook Trigger', { category: 'trigger' });
        if (t === 'if_else') return nd('If/Else', { isBranching: true });
        if (t === 'google_gmail') return nd('Gmail');
        if (t === 'slack') return nd('Slack');
        return undefined;
      });
      mockIsTrigger.mockImplementation((t: string) => t === 'webhook_trigger');
    });

    it('builds one condition for the branching node', () => {
      const result = gen.generate(mkInput(nodes));
      expect(result.conditions).toHaveLength(1);
      expect(result.conditions[0].branchNodeType).toBe('if_else');
    });

    it('condition falls back to default outcome strings when no action/dataFlow matches', () => {
      const result = gen.generate(mkInput(nodes, { actions: [], dataFlows: [] }));
      expect(result.conditions[0].trueOutcome).toBe('condition is met');
      expect(result.conditions[0].falseOutcome).toBe('condition is not met');
    });

    it('condition uses dataFlow descriptions when from field matches branch node', () => {
      const result = gen.generate(mkInput(nodes, {
        dataFlows: [
          { from: 'if_else', to: 'google_gmail', dataDescription: 'priority emails' },
          { from: 'if_else', to: 'slack', dataDescription: 'low-priority messages' },
        ],
      }));
      expect(result.conditions[0].trueOutcome).toBe('priority emails');
      expect(result.conditions[0].falseOutcome).toBe('low-priority messages');
    });

    it('composed text includes branch case labels for downstream nodes', () => {
      const result = gen.generate(mkInput(nodes));
      expect(result.text).toContain('case_1');
      expect(result.text).toContain('case_2');
    });
  });

  // ── formatTriggerType ──────────────────────────────────────────────────────

  it('formatTriggerType maps schedule to on a schedule', () => {
    const nodes: SelectedNode[] = [
      { type: 'cron_trigger', role: 'trigger', reason: '', nodeId: 'n1' },
      { type: 'terminal_node', role: 'terminal', reason: '', nodeId: 'n2' },
    ];
    mockGet.mockImplementation((t: string) =>
      t === 'cron_trigger' ? nd('Cron Trigger', { category: 'trigger' }) : nd('Terminal'),
    );
    const result = gen.generate(mkInput(nodes, { triggerType: 'schedule' }));
    expect(result.triggerDescription).toContain('on a schedule');
  });

  it('formatTriggerType falls back to via <type> for unrecognized trigger type', () => {
    const nodes: SelectedNode[] = [
      { type: 'cron_trigger', role: 'trigger', reason: '', nodeId: 'n1' },
      { type: 'terminal_node', role: 'terminal', reason: '', nodeId: 'n2' },
    ];
    mockGet.mockImplementation((t: string) =>
      t === 'cron_trigger' ? nd('Cron Trigger', { category: 'trigger' }) : nd('Terminal'),
    );
    const result = gen.generate(mkInput(nodes, { triggerType: 'api_push' as any }));
    expect(result.triggerDescription).toContain('via api_push');
  });

  // ── getDisplayName fallback ────────────────────────────────────────────────

  it('getDisplayName humanizes type string when registry has no label', () => {
    const nodes: SelectedNode[] = [
      { type: 'my_custom_node', role: 'trigger', reason: '', nodeId: 'n1' },
      { type: 'terminal_node', role: 'terminal', reason: '', nodeId: 'n2' },
    ];
    // mockGet returns undefined from outer beforeEach
    const result = gen.generate(mkInput(nodes));
    expect(result.steps[0].displayName).toBe('My Custom Node');
  });

  // ── text truncation ────────────────────────────────────────────────────────

  it('enforces MAX_TEXT_LENGTH of 4000 chars on generated text', () => {
    const manyNodes: SelectedNode[] = Array.from({ length: 50 }, (_, i) => ({
      type: `node_type_${i}`,
      role: 'action' as const,
      reason: '',
      nodeId: `n${i}`,
    }));
    mockGet.mockImplementation((t: string) => ({
      label: `Very Verbose Service Name For Automation Purposes Node ${t}`,
      isBranching: false,
      category: 'action',
    }));
    const result = gen.generate(mkInput(manyNodes));
    expect(result.text.length).toBeLessThanOrEqual(4000);
  });

  // ── singleton export ───────────────────────────────────────────────────────

  it('structuralPromptGenerator singleton is an instance of StructuralPromptGenerator', () => {
    expect(structuralPromptGenerator).toBeInstanceOf(StructuralPromptGenerator);
  });
});
