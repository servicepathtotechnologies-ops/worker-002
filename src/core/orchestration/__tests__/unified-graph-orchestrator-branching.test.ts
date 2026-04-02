import { describe, expect, it } from '@jest/globals';
import { unifiedGraphOrchestrator } from '../unified-graph-orchestrator';
import type { ExecutionOrder } from '../execution-order-manager';
import type { WorkflowNode } from '../../types/ai-types';

describe('unifiedGraphOrchestrator branch-aware reconciliation', () => {
  it('initializeWorkflow does not add main edge between exclusive if_else outputs (Gmail / Slack)', () => {
    const nodes: WorkflowNode[] = [
      {
        id: 'form_1',
        type: 'form',
        data: { type: 'form', label: 'Form', category: 'trigger', config: {} },
      },
      {
        id: 'if_1',
        type: 'if_else',
        data: { type: 'if_else', label: 'If/Else', category: 'logic', config: { conditions: [] } },
      },
      {
        id: 'gmail_1',
        type: 'google_gmail',
        data: { type: 'google_gmail', label: 'Gmail', category: 'communication', config: {} },
      },
      {
        id: 'slack_1',
        type: 'slack_message',
        data: { type: 'slack_message', label: 'Slack', category: 'communication', config: {} },
      },
    ];

    const explicitOrder: ExecutionOrder = {
      nodeIds: ['form_1', 'if_1', 'gmail_1', 'slack_1'],
      dependencies: new Map(),
      metadata: {
        triggerNodeId: 'form_1',
        terminalNodeIds: ['gmail_1', 'slack_1'],
        branchingNodeIds: ['if_1'],
        mergeNodeIds: [],
      },
    };

    const { workflow, executionOrder } = unifiedGraphOrchestrator.initializeWorkflow(nodes, explicitOrder);
    const cross = workflow.edges.filter(e => e.source === 'gmail_1' && e.target === 'slack_1');
    expect(cross.length).toBe(0);

    const slackIn = workflow.edges.filter(e => e.target === 'slack_1');
    expect(slackIn.length).toBe(1);
    expect(slackIn[0].source).toBe('if_1');

    const validation = unifiedGraphOrchestrator.validateWorkflow(workflow, executionOrder);
    expect(validation.valid).toBe(true);
  });

  it('accepts gmail terminal route when gmail feeds log_output', () => {
    const workflow: any = {
      nodes: [
        { id: 'manual_1', type: 'manual_trigger', data: { type: 'manual_trigger', config: {} } },
        { id: 'sheets_1', type: 'google_sheets', data: { type: 'google_sheets', config: {} } },
        { id: 'gmail_1', type: 'google_gmail', data: { type: 'google_gmail', config: {} } },
        { id: 'log_1', type: 'log_output', data: { type: 'log_output', config: {} } },
      ],
      edges: [
        { id: 'e1', source: 'manual_1', target: 'sheets_1', type: 'main' },
        { id: 'e2', source: 'sheets_1', target: 'gmail_1', type: 'main' },
        { id: 'e3', source: 'gmail_1', target: 'log_1', type: 'main' },
      ],
      metadata: {
        terminalMode: 'gmail_terminal',
      },
    };
    const explicitOrder: ExecutionOrder = {
      nodeIds: ['trigger_1', 'switch_1', 'path_a', 'path_b', 'merge_1', 'gmail_1', 'log_1'],
      dependencies: new Map(),
      metadata: {
        triggerNodeId: 'trigger_1',
        terminalNodeIds: ['log_1'],
        branchingNodeIds: ['switch_1'],
        mergeNodeIds: ['merge_1'],
      },
    };
    const validation = unifiedGraphOrchestrator.validateWorkflow(workflow, explicitOrder);
    expect(validation.errors.some((e) => e.includes('gmail_terminal'))).toBe(false);
  });

  it('rejects gmail terminal mode when gmail is not terminal leaf', () => {
    const workflow: any = {
      nodes: [
        { id: 'manual_1', type: 'manual_trigger', data: { type: 'manual_trigger', config: {} } },
        { id: 'gmail_1', type: 'google_gmail', data: { type: 'google_gmail', config: {} } },
        { id: 'slack_1', type: 'slack_message', data: { type: 'slack_message', config: {} } },
      ],
      edges: [{ id: 'e1', source: 'manual_1', target: 'gmail_1', type: 'main' }, { id: 'e2', source: 'gmail_1', target: 'slack_1', type: 'main' }],
      metadata: { terminalMode: 'gmail_terminal' },
    };
    const explicitOrder: ExecutionOrder = {
      nodeIds: ['trigger_1', 'switch_1', 'path_a', 'path_b', 'merge_1', 'gmail_1', 'log_1'],
      dependencies: new Map(),
      metadata: {
        triggerNodeId: 'trigger_1',
        terminalNodeIds: ['log_1'],
        branchingNodeIds: ['switch_1'],
        mergeNodeIds: ['merge_1'],
      },
    };
    const validation = unifiedGraphOrchestrator.validateWorkflow(workflow, explicitOrder);
    expect(validation.errors.some((e) => e.includes('gmail_terminal'))).toBe(true);
  });

  it('supports switch with per-case Gmail terminals', () => {
    const nodes: WorkflowNode[] = [
      { id: 'trigger_1', type: 'manual_trigger', data: { type: 'manual_trigger', config: {} } } as any,
      {
        id: 'switch_1',
        type: 'switch',
        data: { type: 'switch', config: { cases: [{ value: 'sales' }, { value: 'support' }] } },
      } as any,
      { id: 'gmail_sales', type: 'google_gmail', data: { type: 'google_gmail', config: {} } } as any,
      { id: 'gmail_support', type: 'google_gmail', data: { type: 'google_gmail', config: {} } } as any,
      { id: 'log_sales', type: 'log_output', data: { type: 'log_output', config: {} } } as any,
      { id: 'log_support', type: 'log_output', data: { type: 'log_output', config: {} } } as any,
    ];
    const explicitOrder: ExecutionOrder = {
      nodeIds: ['trigger_1', 'switch_1', 'gmail_sales', 'gmail_support', 'log_sales', 'log_support'],
      dependencies: new Map(),
      metadata: {
        triggerNodeId: 'trigger_1',
        terminalNodeIds: ['log_sales', 'log_support'],
        branchingNodeIds: ['switch_1'],
        mergeNodeIds: [],
      },
    };

    const { workflow, executionOrder } = unifiedGraphOrchestrator.initializeWorkflow(nodes, explicitOrder);
    const validation = unifiedGraphOrchestrator.validateWorkflow(workflow, executionOrder);
    expect(validation.valid).toBe(true);
  });

  it('supports shared Gmail after merge pattern', () => {
    const workflow: any = {
      nodes: [
        { id: 'trigger_1', type: 'manual_trigger', data: { type: 'manual_trigger', config: {} } },
        {
          id: 'switch_1',
          type: 'switch',
          data: { type: 'switch', config: { cases: [{ value: 'a' }, { value: 'b' }] } },
        },
        { id: 'path_a', type: 'javascript', data: { type: 'javascript', config: {} } },
        { id: 'path_b', type: 'javascript', data: { type: 'javascript', config: {} } },
        { id: 'merge_1', type: 'merge', data: { type: 'merge', config: {} } },
        { id: 'gmail_1', type: 'google_gmail', data: { type: 'google_gmail', config: {} } },
        { id: 'log_1', type: 'log_output', data: { type: 'log_output', config: {} } },
      ],
      edges: [
        { id: 'e1', source: 'trigger_1', target: 'switch_1', type: 'main' },
        { id: 'e2', source: 'switch_1', target: 'path_a', type: 'case_1' },
        { id: 'e3', source: 'switch_1', target: 'path_b', type: 'case_2' },
        { id: 'e4', source: 'path_a', target: 'merge_1', type: 'main' },
        { id: 'e5', source: 'path_b', target: 'merge_1', type: 'main' },
        { id: 'e6', source: 'merge_1', target: 'gmail_1', type: 'main' },
        { id: 'e7', source: 'gmail_1', target: 'log_1', type: 'main' },
      ],
    };
    const explicitOrder: ExecutionOrder = {
      nodeIds: ['trigger_1', 'switch_1', 'path_a', 'path_b', 'merge_1', 'gmail_1', 'log_1'],
      dependencies: new Map(),
      metadata: {
        triggerNodeId: 'trigger_1',
        terminalNodeIds: ['log_1'],
        branchingNodeIds: ['switch_1'],
        mergeNodeIds: ['merge_1'],
      },
    };
    const validation = unifiedGraphOrchestrator.validateWorkflow(workflow, explicitOrder);
    expect(validation.errors.some((e) => e.includes('Switch node'))).toBe(false);
    const gmailNodes = workflow.nodes.filter((n: any) => (n.data as any)?.type === 'google_gmail');
    expect(gmailNodes.length).toBe(1);
  });
});
