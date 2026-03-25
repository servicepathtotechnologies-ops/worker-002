import { describe, expect, it } from '@jest/globals';
import { edgeReconciliationEngine } from '../edge-reconciliation-engine';
import { ExecutionOrder } from '../execution-order-manager';

describe('edge reconciliation branching completeness', () => {
  it('adds branch edges for all outgoing branch ports (if_else)', () => {
    const workflow: any = {
      nodes: [
        { id: 'trigger_1', type: 'manual_trigger', data: { type: 'manual_trigger', label: 'Trigger' } },
        { id: 'if_1', type: 'if_else', data: { type: 'if_else', label: 'If/Else' } },
        { id: 'log_true', type: 'log_output', data: { type: 'log_output', label: 'True Log' } },
        { id: 'log_false', type: 'log_output', data: { type: 'log_output', label: 'False Log' } },
      ],
      edges: [
        { id: 'e1', source: 'trigger_1', target: 'if_1', type: 'main' },
      ],
    };

    const executionOrder: ExecutionOrder = {
      nodeIds: ['trigger_1', 'if_1', 'log_true', 'log_false'],
      dependencies: new Map(),
      metadata: {
        triggerNodeId: 'trigger_1',
        terminalNodeIds: ['log_true', 'log_false'],
        branchingNodeIds: ['if_1'],
        mergeNodeIds: [],
      },
    };

    const result = edgeReconciliationEngine.reconcileEdges(workflow, executionOrder);
    const branchEdges = result.workflow.edges.filter((e: any) => e.source === 'if_1');
    expect(branchEdges.length).toBeGreaterThanOrEqual(1);
  });

  it('adds fanout for switch from config case values', () => {
    const workflow: any = {
      nodes: [
        { id: 't', type: 'manual_trigger', data: { type: 'manual_trigger' } },
        {
          id: 'sw',
          type: 'switch',
          data: {
            type: 'switch',
            config: {
              expression: '{{$json.status}}',
              cases: [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }],
            },
          },
        },
        { id: 'la', type: 'log_output', data: { type: 'log_output' } },
        { id: 'lb', type: 'log_output', data: { type: 'log_output' } },
      ],
      edges: [{ id: 'e1', source: 't', target: 'sw', type: 'main' }],
    };

    const executionOrder: ExecutionOrder = {
      nodeIds: ['t', 'sw', 'la', 'lb'],
      dependencies: new Map(),
      metadata: {
        triggerNodeId: 't',
        terminalNodeIds: ['la', 'lb'],
        branchingNodeIds: ['sw'],
        mergeNodeIds: [],
      },
    };

    const result = edgeReconciliationEngine.reconcileEdges(workflow, executionOrder);
    const fromSwitch = result.workflow.edges.filter((e: any) => e.source === 'sw');
    expect(fromSwitch.length).toBeGreaterThanOrEqual(1);
  });

  it('does not duplicate if_else branch edges when true/false already exist', () => {
    const workflow: any = {
      nodes: [
        { id: 'trigger_1', type: 'manual_trigger', data: { type: 'manual_trigger' } },
        { id: 'if_1', type: 'if_else', data: { type: 'if_else', config: { conditions: [{ field: 'x', operator: 'equals', value: '1' }] } } },
        { id: 'log_true', type: 'log_output', data: { type: 'log_output' } },
        { id: 'log_false', type: 'log_output', data: { type: 'log_output' } },
      ],
      edges: [
        { id: 'e1', source: 'trigger_1', target: 'if_1', type: 'main' },
        { id: 'e2', source: 'if_1', target: 'log_true', type: 'true', sourceHandle: 'true' },
        { id: 'e3', source: 'if_1', target: 'log_false', type: 'false', sourceHandle: 'false' },
      ],
    };

    const executionOrder: ExecutionOrder = {
      nodeIds: ['trigger_1', 'if_1', 'log_true', 'log_false'],
      dependencies: new Map(),
      metadata: {
        triggerNodeId: 'trigger_1',
        terminalNodeIds: ['log_true', 'log_false'],
        branchingNodeIds: ['if_1'],
        mergeNodeIds: [],
      },
    };

    const result = edgeReconciliationEngine.reconcileEdges(workflow, executionOrder);
    const addedFromIf = result.workflow.edges.filter((e: any) => e.source === 'if_1');
    expect(addedFromIf.length).toBe(2);
  });

  it('does not duplicate if_else → first downstream when linear chain would collide with true branch', () => {
    const workflow: any = {
      nodes: [
        { id: 'trigger_1', type: 'manual_trigger', data: { type: 'manual_trigger', label: 'Trigger' } },
        { id: 'if_1', type: 'if_else', data: { type: 'if_else', label: 'If/Else' } },
        { id: 'gmail_1', type: 'google_gmail', data: { type: 'google_gmail', label: 'Gmail' } },
        { id: 'log_1', type: 'log_output', data: { type: 'log_output', label: 'Log' } },
      ],
      edges: [{ id: 'e1', source: 'trigger_1', target: 'if_1', type: 'main' }],
    };

    const executionOrder: ExecutionOrder = {
      nodeIds: ['trigger_1', 'if_1', 'gmail_1', 'log_1'],
      dependencies: new Map(),
      metadata: {
        triggerNodeId: 'trigger_1',
        terminalNodeIds: ['gmail_1', 'log_1'],
        branchingNodeIds: ['if_1'],
        mergeNodeIds: [],
      },
    };

    const result = edgeReconciliationEngine.reconcileEdges(workflow, executionOrder);
    const fromIf = result.workflow.edges.filter((e: any) => e.source === 'if_1');
    const ifToGmail = fromIf.filter((e: any) => e.target === 'gmail_1');

    expect(ifToGmail.length).toBe(1);
    expect(ifToGmail[0].type === 'true' || ifToGmail[0].sourceHandle === 'true').toBe(true);

    const ifToLog = fromIf.filter((e: any) => e.target === 'log_1');
    expect(ifToLog.length).toBe(1);
    expect(ifToLog[0].type === 'false' || ifToLog[0].sourceHandle === 'false').toBe(true);

    const logNodes = result.workflow.nodes.filter(
      (n: any) => (n.type || n.data?.type) === 'log_output'
    );
    // No spurious gmail → false-branch log: only one log node (no multi-input split).
    expect(logNodes.length).toBe(1);

    const gmailOut = result.workflow.edges.filter((e: any) => e.source === 'gmail_1');
    expect(gmailOut.length).toBe(0);

    const crossBranch = result.workflow.edges.filter(
      (e: any) => e.source === 'gmail_1' && e.target === 'log_1'
    );
    expect(crossBranch.length).toBe(0);
  });

  it('does not add linear edge between google_gmail and slack_message on different if_else branches', () => {
    const workflow: any = {
      nodes: [
        { id: 'form_1', type: 'form', data: { type: 'form', label: 'Form' } },
        { id: 'if_1', type: 'if_else', data: { type: 'if_else', label: 'If/Else' } },
        { id: 'gmail_1', type: 'google_gmail', data: { type: 'google_gmail', label: 'Gmail' } },
        { id: 'slack_1', type: 'slack_message', data: { type: 'slack_message', label: 'Slack' } },
      ],
      edges: [{ id: 'e1', source: 'form_1', target: 'if_1', type: 'main' }],
    };

    const executionOrder: ExecutionOrder = {
      nodeIds: ['form_1', 'if_1', 'gmail_1', 'slack_1'],
      dependencies: new Map(),
      metadata: {
        triggerNodeId: 'form_1',
        terminalNodeIds: ['gmail_1', 'slack_1'],
        branchingNodeIds: ['if_1'],
        mergeNodeIds: [],
      },
    };

    const result = edgeReconciliationEngine.reconcileEdges(workflow, executionOrder);
    const bad = result.workflow.edges.filter(
      (e: any) => e.source === 'gmail_1' && e.target === 'slack_1'
    );
    expect(bad.length).toBe(0);
    const slackIn = result.workflow.edges.filter((e: any) => e.target === 'slack_1');
    expect(slackIn.length).toBe(1);
    expect(slackIn[0].source).toBe('if_1');
  });

  it('does not add linear edges between different switch case heads', () => {
    const workflow: any = {
      nodes: [
        { id: 't', type: 'manual_trigger', data: { type: 'manual_trigger' } },
        {
          id: 'sw',
          type: 'switch',
          data: {
            type: 'switch',
            config: {
              expression: '{{$json.kind}}',
              cases: [
                { value: 'a', label: 'A' },
                { value: 'b', label: 'B' },
                { value: 'c', label: 'C' },
              ],
            },
          },
        },
        { id: 'la', type: 'log_output', data: { type: 'log_output' } },
        { id: 'lb', type: 'log_output', data: { type: 'log_output' } },
        { id: 'lc', type: 'log_output', data: { type: 'log_output' } },
      ],
      edges: [{ id: 'e1', source: 't', target: 'sw', type: 'main' }],
    };

    const executionOrder: ExecutionOrder = {
      nodeIds: ['t', 'sw', 'la', 'lb', 'lc'],
      dependencies: new Map(),
      metadata: {
        triggerNodeId: 't',
        terminalNodeIds: ['la', 'lb', 'lc'],
        branchingNodeIds: ['sw'],
        mergeNodeIds: [],
      },
    };

    const result = edgeReconciliationEngine.reconcileEdges(workflow, executionOrder);
    expect(result.workflow.edges.some((e: any) => e.source === 'la' && e.target === 'lb')).toBe(false);
    expect(result.workflow.edges.some((e: any) => e.source === 'la' && e.target === 'lc')).toBe(false);
    expect(result.workflow.edges.some((e: any) => e.source === 'lb' && e.target === 'lc')).toBe(false);
  });

  it('keeps a simple linear chain trigger → transform → output', () => {
    const workflow: any = {
      nodes: [
        { id: 'tr', type: 'manual_trigger', data: { type: 'manual_trigger' } },
        { id: 'js', type: 'javascript', data: { type: 'javascript', label: 'Code' } },
        { id: 'lo', type: 'log_output', data: { type: 'log_output' } },
      ],
      edges: [],
    };

    const executionOrder: ExecutionOrder = {
      nodeIds: ['tr', 'js', 'lo'],
      dependencies: new Map(),
      metadata: {
        triggerNodeId: 'tr',
        terminalNodeIds: ['lo'],
        branchingNodeIds: [],
        mergeNodeIds: [],
      },
    };

    const result = edgeReconciliationEngine.reconcileEdges(workflow, executionOrder);
    expect(result.workflow.edges.some((e: any) => e.source === 'tr' && e.target === 'js')).toBe(true);
    expect(result.workflow.edges.some((e: any) => e.source === 'js' && e.target === 'lo')).toBe(true);
  });

  it('routes any switch with N cases without cross-branch chaining', () => {
    const caseValues = ['c1', 'c2', 'c3', 'c4', 'c5'];
    const workflow: any = {
      nodes: [
        { id: 't', type: 'manual_trigger', data: { type: 'manual_trigger' } },
        {
          id: 'sw',
          type: 'switch',
          data: {
            type: 'switch',
            config: {
              expression: '{{$json.kind}}',
              cases: caseValues.map((v) => ({ value: v, label: v.toUpperCase() })),
            },
          },
        },
        ...caseValues.map((v) => ({ id: `n_${v}`, type: 'log_output', data: { type: 'log_output', label: v } })),
      ],
      edges: [{ id: 'e1', source: 't', target: 'sw', type: 'main' }],
    };

    const executionOrder: ExecutionOrder = {
      nodeIds: ['t', 'sw', ...caseValues.map((v) => `n_${v}`)],
      dependencies: new Map(),
      metadata: {
        triggerNodeId: 't',
        terminalNodeIds: caseValues.map((v) => `n_${v}`),
        branchingNodeIds: ['sw'],
        mergeNodeIds: [],
      },
    };

    const result = edgeReconciliationEngine.reconcileEdges(workflow, executionOrder);
    const fromSwitch = result.workflow.edges.filter((e: any) => e.source === 'sw');
    expect(fromSwitch.length).toBeGreaterThanOrEqual(caseValues.length);
    expect(result.workflow.edges.some((e: any) => e.source.startsWith('n_') && e.target.startsWith('n_'))).toBe(false);
  });

  it('allows edges into merge from different branch paths', () => {
    const workflow: any = {
      nodes: [
        { id: 't', type: 'manual_trigger', data: { type: 'manual_trigger' } },
        { id: 'if_1', type: 'if_else', data: { type: 'if_else' } },
        { id: 'a1', type: 'javascript', data: { type: 'javascript' } },
        { id: 'a2', type: 'javascript', data: { type: 'javascript' } },
        { id: 'mg', type: 'merge', data: { type: 'merge' } },
        { id: 'lo', type: 'log_output', data: { type: 'log_output' } },
      ],
      edges: [
        { id: 'e0', source: 't', target: 'if_1', type: 'main' },
        { id: 'e1', source: 'if_1', target: 'a1', type: 'true', sourceHandle: 'true' },
        { id: 'e2', source: 'if_1', target: 'a2', type: 'false', sourceHandle: 'false' },
        { id: 'e3', source: 'a1', target: 'mg', type: 'main' },
        { id: 'e4', source: 'a2', target: 'mg', type: 'main' },
        { id: 'e5', source: 'mg', target: 'lo', type: 'main' },
      ],
    };

    const executionOrder: ExecutionOrder = {
      nodeIds: ['t', 'if_1', 'a1', 'a2', 'mg', 'lo'],
      dependencies: new Map(),
      metadata: {
        triggerNodeId: 't',
        terminalNodeIds: ['lo'],
        branchingNodeIds: ['if_1'],
        mergeNodeIds: ['mg'],
      },
    };

    const result = edgeReconciliationEngine.reconcileEdges(workflow, executionOrder);
    expect(result.workflow.edges.filter((e: any) => e.target === 'mg').length).toBeGreaterThanOrEqual(2);
    expect(result.workflow.edges.some((e: any) => e.source === 'mg' && e.target === 'lo')).toBe(true);
  });
});
