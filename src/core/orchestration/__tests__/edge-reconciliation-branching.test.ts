import { describe, expect, it } from '@jest/globals';
import { edgeReconciliationEngine } from '../edge-reconciliation-engine';
import { ExecutionOrder } from '../execution-order-manager';

describe('edge reconciliation branching completeness', () => {
  it('linear sheets → gmail → log connects log to gmail (not sheets) and does not remove gmail', () => {
    const workflow: any = {
      nodes: [
        { id: 't', type: 'manual_trigger', data: { type: 'manual_trigger' } },
        { id: 's', type: 'google_sheets', data: { type: 'google_sheets' } },
        { id: 'g', type: 'google_gmail', data: { type: 'google_gmail' } },
        { id: 'l', type: 'log_output', data: { type: 'log_output' } },
      ],
      edges: [],
    };

    const executionOrder: ExecutionOrder = {
      nodeIds: ['t', 's', 'g', 'l'],
      dependencies: new Map(),
      metadata: {
        triggerNodeId: 't',
        terminalNodeIds: ['l'],
        branchingNodeIds: [],
        mergeNodeIds: [],
      },
    };

    const result = edgeReconciliationEngine.reconcileEdges(workflow, executionOrder);
    const nodeTypes = result.workflow.nodes.map((n: any) => n.type || n.data?.type);
    expect(nodeTypes).toContain('google_gmail');

    const incomingLog = result.workflow.edges.filter((e: any) => e.target === 'l');
    expect(incomingLog.some((e: any) => e.source === 'g')).toBe(true);
    expect(incomingLog.some((e: any) => e.source === 's')).toBe(false);
  });

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

  it('validateEdges keeps branch and output→log edges when flat execution order misorders nodes (save regression)', () => {
    const workflow: any = {
      nodes: [
        { id: 't', type: 'manual_trigger', data: { type: 'manual_trigger' } },
        { id: 'gmail', type: 'google_gmail', data: { type: 'google_gmail' } },
        { id: 'slack', type: 'slack_message', data: { type: 'slack_message' } },
        { id: 'if_1', type: 'if_else', data: { type: 'if_else', config: { conditions: [{ field: 'x', operator: 'equals', value: '1' }] } } },
        { id: 'log1', type: 'log_output', data: { type: 'log_output' } },
        { id: 'log2', type: 'log_output', data: { type: 'log_output' } },
      ],
      edges: [
        { id: 'e1', source: 't', target: 'if_1', type: 'main' },
        { id: 'e2', source: 'if_1', target: 'gmail', type: 'true', sourceHandle: 'true' },
        { id: 'e3', source: 'if_1', target: 'slack', type: 'false', sourceHandle: 'false' },
        { id: 'e4', source: 'gmail', target: 'log1', type: 'main' },
        { id: 'e5', source: 'slack', target: 'log2', type: 'main' },
      ],
    };

    // Mimics buildOrderFromCategories when communication nodes appear before logic in `nodes` array.
    const misordered: ExecutionOrder = {
      nodeIds: ['t', 'gmail', 'slack', 'if_1', 'log1', 'log2'],
      dependencies: new Map(),
      metadata: {
        triggerNodeId: 't',
        terminalNodeIds: ['log1', 'log2'],
        branchingNodeIds: ['if_1'],
        mergeNodeIds: [],
      },
    };

    const v = edgeReconciliationEngine.validateEdges(workflow, misordered);
    expect(v.edgesToRemove.length).toBe(0);
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

  it('is idempotent for if_else with per-branch log terminals', () => {
    const workflow: any = {
      nodes: [
        { id: 'form_1', type: 'form', data: { type: 'form' } },
        { id: 'if_1', type: 'if_else', data: { type: 'if_else' } },
        { id: 'gmail_1', type: 'google_gmail', data: { type: 'google_gmail' } },
        { id: 'slack_1', type: 'slack_message', data: { type: 'slack_message' } },
        { id: 'log_1', type: 'log_output', data: { type: 'log_output' } },
        { id: 'log_2', type: 'log_output', data: { type: 'log_output' } },
      ],
      edges: [{ id: 'e0', source: 'form_1', target: 'if_1', type: 'main' }],
    };

    const executionOrder: ExecutionOrder = {
      nodeIds: ['form_1', 'if_1', 'gmail_1', 'slack_1', 'log_1', 'log_2'],
      dependencies: new Map(),
      metadata: {
        triggerNodeId: 'form_1',
        terminalNodeIds: ['log_1', 'log_2'],
        branchingNodeIds: ['if_1'],
        mergeNodeIds: [],
      },
    };

    const first = edgeReconciliationEngine.reconcileEdges(workflow, executionOrder);
    const second = edgeReconciliationEngine.reconcileEdges(first.workflow as any, executionOrder);

    const signature = (edges: any[]) =>
      edges
        .map((e) => `${e.source}->${e.target}:${String(e.type || '')}:${String(e.sourceHandle || '')}:${String(e.targetHandle || '')}`)
        .sort();

    expect(signature(second.workflow.edges)).toEqual(signature(first.workflow.edges));
    expect(second.workflow.nodes.length).toBe(first.workflow.nodes.length);
    expect(second.warnings.some((w) => String(w).toLowerCase().includes('duplicate'))).toBe(false);
  });

  it('does not produce duplicate-edge terminal wiring warnings for existing branch terminal edges', () => {
    const workflow: any = {
      nodes: [
        { id: 'form_1', type: 'form', data: { type: 'form' } },
        { id: 'if_1', type: 'if_else', data: { type: 'if_else' } },
        { id: 'gmail_1', type: 'google_gmail', data: { type: 'google_gmail' } },
        { id: 'slack_1', type: 'slack_message', data: { type: 'slack_message' } },
        { id: 'log_1', type: 'log_output', data: { type: 'log_output' } },
        { id: 'log_2', type: 'log_output', data: { type: 'log_output' } },
      ],
      edges: [
        { id: 'e0', source: 'form_1', target: 'if_1', type: 'main' },
        { id: 'e1', source: 'if_1', target: 'gmail_1', type: 'true', sourceHandle: 'true' },
        { id: 'e2', source: 'if_1', target: 'slack_1', type: 'false', sourceHandle: 'false' },
        { id: 'e3', source: 'gmail_1', target: 'log_1', type: 'main' },
        { id: 'e4', source: 'slack_1', target: 'log_2', type: 'main' },
      ],
    };

    const executionOrder: ExecutionOrder = {
      nodeIds: ['form_1', 'if_1', 'gmail_1', 'slack_1', 'log_1', 'log_2'],
      dependencies: new Map(),
      metadata: {
        triggerNodeId: 'form_1',
        terminalNodeIds: ['log_1', 'log_2'],
        branchingNodeIds: ['if_1'],
        mergeNodeIds: [],
      },
    };

    const result = edgeReconciliationEngine.reconcileEdges(workflow, executionOrder);
    const warningText = result.warnings.join(' | ').toLowerCase();

    expect(warningText.includes('duplicate edge')).toBe(false);
    expect(warningText.includes('could not create edge')).toBe(false);
    expect(result.workflow.edges.some((e: any) => e.source === 'gmail_1' && e.target === 'log_1')).toBe(true);
    expect(result.workflow.edges.some((e: any) => e.source === 'slack_1' && e.target === 'log_2')).toBe(true);
  });

  it('does not orphan branch terminals when switch reuses output types', () => {
    const workflow: any = {
      nodes: [
        { id: 'form_1', type: 'form', data: { type: 'form' } },
        {
          id: 'sw_1',
          type: 'switch',
          data: {
            type: 'switch',
            config: {
              expression: '{{$json.status}}',
              cases: [{ value: 'success' }, { value: 'pending' }, { value: 'failed' }],
            },
          },
        },
        { id: 'gmail_1', type: 'google_gmail', data: { type: 'google_gmail' } },
        { id: 'slack_1', type: 'slack_message', data: { type: 'slack_message' } },
        { id: 'gmail_2', type: 'google_gmail', data: { type: 'google_gmail' } },
        { id: 'log_1', type: 'log_output', data: { type: 'log_output' } },
        { id: 'log_2', type: 'log_output', data: { type: 'log_output' } },
      ],
      edges: [
        { id: 'e0', source: 'form_1', target: 'sw_1', type: 'main' },
        { id: 'e1', source: 'sw_1', target: 'gmail_1', type: 'case_1', sourceHandle: 'case_1' },
        { id: 'e2', source: 'sw_1', target: 'slack_1', type: 'case_2', sourceHandle: 'case_2' },
        { id: 'e3', source: 'sw_1', target: 'gmail_2', type: 'case_3', sourceHandle: 'case_3' },
      ],
    };

    const executionOrder: ExecutionOrder = {
      nodeIds: ['form_1', 'sw_1', 'gmail_1', 'slack_1', 'gmail_2', 'log_1', 'log_2'],
      dependencies: new Map(),
      metadata: {
        triggerNodeId: 'form_1',
        terminalNodeIds: ['log_1', 'log_2'],
        branchingNodeIds: ['sw_1'],
        mergeNodeIds: [],
      },
    };

    const result = edgeReconciliationEngine.reconcileEdges(workflow, executionOrder);
    const logs = result.workflow.nodes.filter((n: any) => (n.type || n.data?.type) === 'log_output');
    const orphanLogs = logs.filter(
      (n: any) => !result.workflow.edges.some((e: any) => e.target === n.id)
    );

    expect(orphanLogs.length).toBe(0);
    expect(
      result.warnings.some((w: string) =>
        w.toLowerCase().includes('non-branching node already has outgoing edge')
      )
    ).toBe(false);
  });

  it('does not orphan branch terminals for if_else when both branches reuse output type', () => {
    const workflow: any = {
      nodes: [
        { id: 'form_1', type: 'form', data: { type: 'form' } },
        { id: 'if_1', type: 'if_else', data: { type: 'if_else' } },
        { id: 'slack_true', type: 'slack_message', data: { type: 'slack_message' } },
        { id: 'slack_false', type: 'slack_message', data: { type: 'slack_message' } },
        { id: 'log_1', type: 'log_output', data: { type: 'log_output' } },
        { id: 'log_2', type: 'log_output', data: { type: 'log_output' } },
      ],
      edges: [
        { id: 'e0', source: 'form_1', target: 'if_1', type: 'main' },
        { id: 'e1', source: 'if_1', target: 'slack_true', type: 'true', sourceHandle: 'true' },
        { id: 'e2', source: 'if_1', target: 'slack_false', type: 'false', sourceHandle: 'false' },
      ],
    };
    const executionOrder: ExecutionOrder = {
      nodeIds: ['form_1', 'if_1', 'slack_true', 'slack_false', 'log_1', 'log_2'],
      dependencies: new Map(),
      metadata: {
        triggerNodeId: 'form_1',
        terminalNodeIds: ['log_1', 'log_2'],
        branchingNodeIds: ['if_1'],
        mergeNodeIds: [],
      },
    };

    const result = edgeReconciliationEngine.reconcileEdges(workflow, executionOrder);
    const logIncoming = result.workflow.nodes
      .filter((n: any) => (n.type || n.data?.type) === 'log_output')
      .map((n: any) => result.workflow.edges.filter((e: any) => e.target === n.id).length);

    expect(logIncoming.every((count: number) => count >= 1)).toBe(true);
    expect(
      result.warnings.some((w: string) =>
        w.toLowerCase().includes('non-branching node already has outgoing edge')
      )
    ).toBe(false);
  });

  it('heals stale incoming terminal edge without orphaning branch terminals', () => {
    const workflow: any = {
      nodes: [
        { id: 'form_1', type: 'form', data: { type: 'form' } },
        { id: 'sw_1', type: 'switch', data: { type: 'switch' } },
        { id: 'gmail_1', type: 'google_gmail', data: { type: 'google_gmail' } },
        { id: 'slack_1', type: 'slack_message', data: { type: 'slack_message' } },
        { id: 'slack_2', type: 'slack_message', data: { type: 'slack_message' } },
        { id: 'log_1', type: 'log_output', data: { type: 'log_output' } },
        { id: 'log_2', type: 'log_output', data: { type: 'log_output' } },
      ],
      edges: [
        { id: 'e0', source: 'form_1', target: 'sw_1', type: 'main' },
        { id: 'e1', source: 'sw_1', target: 'gmail_1', type: 'case_1', sourceHandle: 'case_1' },
        { id: 'e2', source: 'sw_1', target: 'slack_1', type: 'case_2', sourceHandle: 'case_2' },
        { id: 'e3', source: 'sw_1', target: 'slack_2', type: 'case_3', sourceHandle: 'case_3' },
        // stale wrong incoming: log_2 points to gmail instead of slack_2
        { id: 'e4', source: 'gmail_1', target: 'log_2', type: 'main' },
      ],
    };
    const executionOrder: ExecutionOrder = {
      nodeIds: ['form_1', 'sw_1', 'gmail_1', 'slack_1', 'slack_2', 'log_1', 'log_2'],
      dependencies: new Map(),
      metadata: {
        triggerNodeId: 'form_1',
        terminalNodeIds: ['log_1', 'log_2'],
        branchingNodeIds: ['sw_1'],
        mergeNodeIds: [],
      },
    };

    const result = edgeReconciliationEngine.reconcileEdges(workflow, executionOrder);
    const logNodes = result.workflow.nodes.filter(
      (n: any) => (n.type || n.data?.type) === 'log_output'
    );
    const incomingCounts = logNodes.map(
      (n: any) => result.workflow.edges.filter((e: any) => e.target === n.id).length
    );
    expect(incomingCounts.every((count: number) => count >= 1)).toBe(true);
    expect(
      result.warnings.some((w: string) =>
        w.toLowerCase().includes('non-branching node already has outgoing edge')
      )
    ).toBe(false);
  });

  it('repairs orphaned single log_output in branching workflow', () => {
    const workflow: any = {
      nodes: [
        { id: 'form_1', type: 'form', data: { type: 'form' } },
        { id: 'sw_1', type: 'switch', data: { type: 'switch' } },
        { id: 'gmail_1', type: 'google_gmail', data: { type: 'google_gmail' } },
        { id: 'slack_1', type: 'slack_message', data: { type: 'slack_message' } },
        { id: 'log_1', type: 'log_output', data: { type: 'log_output' } },
      ],
      edges: [
        { id: 'e0', source: 'form_1', target: 'sw_1', type: 'main' },
        { id: 'e1', source: 'sw_1', target: 'gmail_1', type: 'case_1', sourceHandle: 'case_1' },
        { id: 'e2', source: 'sw_1', target: 'slack_1', type: 'case_2', sourceHandle: 'case_2' },
      ],
    };
    const executionOrder: ExecutionOrder = {
      nodeIds: ['form_1', 'sw_1', 'gmail_1', 'slack_1', 'log_1'],
      dependencies: new Map(),
      metadata: {
        triggerNodeId: 'form_1',
        terminalNodeIds: ['log_1'],
        branchingNodeIds: ['sw_1'],
        mergeNodeIds: [],
      },
    };

    const result = edgeReconciliationEngine.reconcileEdges(workflow, executionOrder);
    const incomingToLog = result.workflow.edges.filter((e: any) => e.target === 'log_1');
    expect(incomingToLog.length).toBe(1);
    expect(result.workflow.nodes.some((n: any) => n.id === 'log_1')).toBe(true);
  });

  it('does not orphan terminals for switch with five cases and repeated output types', () => {
    const workflow: any = {
      nodes: [
        { id: 'form_1', type: 'form', data: { type: 'form' } },
        {
          id: 'sw_1',
          type: 'switch',
          data: {
            type: 'switch',
            config: {
              expression: '{{$json.status}}',
              cases: [{ value: 's1' }, { value: 's2' }, { value: 's3' }, { value: 's4' }, { value: 's5' }],
            },
          },
        },
        { id: 'gmail_1', type: 'google_gmail', data: { type: 'google_gmail' } },
        { id: 'slack_1', type: 'slack_message', data: { type: 'slack_message' } },
        { id: 'slack_2', type: 'slack_message', data: { type: 'slack_message' } },
        { id: 'gmail_2', type: 'google_gmail', data: { type: 'google_gmail' } },
        { id: 'slack_3', type: 'slack_message', data: { type: 'slack_message' } },
        { id: 'log_1', type: 'log_output', data: { type: 'log_output' } },
        { id: 'log_2', type: 'log_output', data: { type: 'log_output' } },
        { id: 'log_3', type: 'log_output', data: { type: 'log_output' } },
      ],
      edges: [
        { id: 'e0', source: 'form_1', target: 'sw_1', type: 'main' },
        { id: 'e1', source: 'sw_1', target: 'gmail_1', type: 'case_1', sourceHandle: 'case_1' },
        { id: 'e2', source: 'sw_1', target: 'slack_1', type: 'case_2', sourceHandle: 'case_2' },
        { id: 'e3', source: 'sw_1', target: 'slack_2', type: 'case_3', sourceHandle: 'case_3' },
        { id: 'e4', source: 'sw_1', target: 'gmail_2', type: 'case_4', sourceHandle: 'case_4' },
        { id: 'e5', source: 'sw_1', target: 'slack_3', type: 'case_5', sourceHandle: 'case_5' },
      ],
    };
    const executionOrder: ExecutionOrder = {
      nodeIds: ['form_1', 'sw_1', 'gmail_1', 'slack_1', 'slack_2', 'gmail_2', 'slack_3', 'log_1', 'log_2', 'log_3'],
      dependencies: new Map(),
      metadata: {
        triggerNodeId: 'form_1',
        terminalNodeIds: ['log_1', 'log_2', 'log_3'],
        branchingNodeIds: ['sw_1'],
        mergeNodeIds: [],
      },
    };

    const result = edgeReconciliationEngine.reconcileEdges(workflow, executionOrder);
    const logs = result.workflow.nodes.filter((n: any) => (n.type || n.data?.type) === 'log_output');
    const orphanLogs = logs.filter((n: any) => !result.workflow.edges.some((e: any) => e.target === n.id));

    expect(orphanLogs.length).toBe(0);
    expect(
      result.warnings.some((w: string) =>
        w.toLowerCase().includes('non-branching node already has outgoing edge')
      )
    ).toBe(false);
  });

  it('keeps branch lineage valid with loop node on one if_else path (non-cyclic)', () => {
    const workflow: any = {
      nodes: [
        { id: 'form_1', type: 'form', data: { type: 'form' } },
        { id: 'if_1', type: 'if_else', data: { type: 'if_else' } },
        { id: 'loop_1', type: 'loop', data: { type: 'loop' } },
        { id: 'gmail_true', type: 'google_gmail', data: { type: 'google_gmail' } },
        { id: 'gmail_false', type: 'google_gmail', data: { type: 'google_gmail' } },
        { id: 'log_1', type: 'log_output', data: { type: 'log_output' } },
        { id: 'log_2', type: 'log_output', data: { type: 'log_output' } },
      ],
      edges: [
        { id: 'e0', source: 'form_1', target: 'if_1', type: 'main' },
        { id: 'e1', source: 'if_1', target: 'loop_1', type: 'true', sourceHandle: 'true' },
        { id: 'e2', source: 'loop_1', target: 'gmail_true', type: 'main' },
        { id: 'e3', source: 'if_1', target: 'gmail_false', type: 'false', sourceHandle: 'false' },
      ],
    };
    const executionOrder: ExecutionOrder = {
      nodeIds: ['form_1', 'if_1', 'loop_1', 'gmail_true', 'gmail_false', 'log_1', 'log_2'],
      dependencies: new Map(),
      metadata: {
        triggerNodeId: 'form_1',
        terminalNodeIds: ['log_1', 'log_2'],
        branchingNodeIds: ['if_1'],
        mergeNodeIds: [],
      },
    };

    const result = edgeReconciliationEngine.reconcileEdges(workflow, executionOrder);
    const logIncoming = result.workflow.nodes
      .filter((n: any) => (n.type || n.data?.type) === 'log_output')
      .map((n: any) => result.workflow.edges.filter((e: any) => e.target === n.id).length);

    expect(logIncoming.every((count: number) => count >= 1)).toBe(true);
    expect(
      result.warnings.some((w: string) =>
        w.toLowerCase().includes('non-branching node already has outgoing edge')
      )
    ).toBe(false);
  });

  it('keeps linear form -> google_gmail -> log_output connected from sparse edges', () => {
    const workflow: any = {
      nodes: [
        { id: 'form_1', type: 'form', data: { type: 'form' } },
        { id: 'gmail_1', type: 'google_gmail', data: { type: 'google_gmail' } },
        { id: 'log_1', type: 'log_output', data: { type: 'log_output' } },
      ],
      edges: [],
    };
    const executionOrder: ExecutionOrder = {
      nodeIds: ['form_1', 'gmail_1', 'log_1'],
      dependencies: new Map(),
      metadata: {
        triggerNodeId: 'form_1',
        terminalNodeIds: ['log_1'],
        branchingNodeIds: [],
        mergeNodeIds: [],
      },
    };

    const result = edgeReconciliationEngine.reconcileEdges(workflow, executionOrder);
    expect(result.workflow.nodes.some((n: any) => n.id === 'gmail_1')).toBe(true);
    expect(result.workflow.edges.some((e: any) => e.source === 'form_1' && e.target === 'gmail_1')).toBe(true);
    expect(result.workflow.edges.some((e: any) => e.source === 'gmail_1' && e.target === 'log_1')).toBe(true);
    expect(
      result.warnings.some((w: string) => w.toLowerCase().includes('orphaned node'))
    ).toBe(false);
  });

  it('splits shared branch fan-in log_output into one terminal per branch as fallback', () => {
    const workflow: any = {
      nodes: [
        { id: 'form_1', type: 'form', data: { type: 'form' } },
        { id: 'if_1', type: 'if_else', data: { type: 'if_else' } },
        { id: 'gmail_1', type: 'google_gmail', data: { type: 'google_gmail' } },
        { id: 'slack_1', type: 'slack_message', data: { type: 'slack_message' } },
        { id: 'log_1', type: 'log_output', data: { type: 'log_output' } },
      ],
      edges: [
        { id: 'e0', source: 'form_1', target: 'if_1', type: 'main' },
        { id: 'e1', source: 'if_1', target: 'gmail_1', type: 'true', sourceHandle: 'true' },
        { id: 'e2', source: 'if_1', target: 'slack_1', type: 'false', sourceHandle: 'false' },
        { id: 'e3', source: 'gmail_1', target: 'log_1', type: 'main' },
        { id: 'e4', source: 'slack_1', target: 'log_1', type: 'main' },
      ],
    };
    const executionOrder: ExecutionOrder = {
      nodeIds: ['form_1', 'if_1', 'gmail_1', 'slack_1', 'log_1'],
      dependencies: new Map(),
      metadata: {
        triggerNodeId: 'form_1',
        terminalNodeIds: ['log_1'],
        branchingNodeIds: ['if_1'],
        mergeNodeIds: [],
      },
    };

    const result = edgeReconciliationEngine.reconcileEdges(workflow, executionOrder);
    const logNodes = result.workflow.nodes.filter((n: any) => (n.type || n.data?.type) === 'log_output');
    expect(logNodes.length).toBeGreaterThanOrEqual(1);
    for (const log of logNodes) {
      const incoming = result.workflow.edges.filter((e: any) => e.target === log.id);
      expect(incoming.length).toBeLessThanOrEqual(1);
    }
  });

  it('preserves case edges from branching nodes as legitimate predecessors (primary fix validation)', () => {
    const workflow: any = {
      nodes: [
        { id: 'form_1', type: 'form', data: { type: 'form' } },
        { id: 'switch_1', type: 'switch', data: { type: 'switch' } },
        { id: 'log_1', type: 'log_output', data: { type: 'log_output' } },
      ],
      edges: [
        { id: 'e0', source: 'form_1', target: 'switch_1', type: 'main' },
        // Direct case edge from switch to log_output (this should be preserved)
        { id: 'e1', source: 'switch_1', target: 'log_1', type: 'case_1', sourceHandle: 'case_1' },
      ],
    };
    const executionOrder: ExecutionOrder = {
      nodeIds: ['form_1', 'switch_1', 'log_1'],
      dependencies: new Map(),
      metadata: {
        triggerNodeId: 'form_1',
        terminalNodeIds: ['log_1'],
        branchingNodeIds: ['switch_1'],
        mergeNodeIds: [],
      },
    };

    const result = edgeReconciliationEngine.reconcileEdges(workflow, executionOrder);
    
    // The case edge should be preserved (not removed as stale)
    const caseEdge = result.workflow.edges.find((e: any) => 
      e.source === 'switch_1' && e.target === 'log_1' && e.type === 'case_1'
    );
    expect(caseEdge).toBeDefined();
    expect(caseEdge?.id).toBe('e1'); // Original edge should be preserved
    
    // log_output should have exactly one incoming edge (the case edge)
    const logIncoming = result.workflow.edges.filter((e: any) => e.target === 'log_1');
    expect(logIncoming.length).toBe(1);
    expect(logIncoming[0].source).toBe('switch_1');
    expect(logIncoming[0].type).toBe('case_1');
    
    // No warnings about stale edges should be generated
    const staleWarnings = result.warnings.filter((w: string) => 
      w.toLowerCase().includes('stale') || w.toLowerCase().includes('rewiring')
    );
    expect(staleWarnings.length).toBe(0);
  });

  it('preserves if_else true/false edges to log_output as legitimate predecessors', () => {
    const workflow: any = {
      nodes: [
        { id: 'form_1', type: 'form', data: { type: 'form' } },
        { id: 'if_1', type: 'if_else', data: { type: 'if_else' } },
        { id: 'log_true', type: 'log_output', data: { type: 'log_output' } },
        { id: 'log_false', type: 'log_output', data: { type: 'log_output' } },
      ],
      edges: [
        { id: 'e0', source: 'form_1', target: 'if_1', type: 'main' },
        // Direct branch edges from if_else to log_output nodes (these should be preserved)
        { id: 'e1', source: 'if_1', target: 'log_true', type: 'true', sourceHandle: 'true' },
        { id: 'e2', source: 'if_1', target: 'log_false', type: 'false', sourceHandle: 'false' },
      ],
    };
    const executionOrder: ExecutionOrder = {
      nodeIds: ['form_1', 'if_1', 'log_true', 'log_false'],
      dependencies: new Map(),
      metadata: {
        triggerNodeId: 'form_1',
        terminalNodeIds: ['log_true', 'log_false'],
        branchingNodeIds: ['if_1'],
        mergeNodeIds: [],
      },
    };

    const result = edgeReconciliationEngine.reconcileEdges(workflow, executionOrder);
    
    // Both branch edges should be preserved
    const trueEdge = result.workflow.edges.find((e: any) => 
      e.source === 'if_1' && e.target === 'log_true' && e.type === 'true'
    );
    const falseEdge = result.workflow.edges.find((e: any) => 
      e.source === 'if_1' && e.target === 'log_false' && e.type === 'false'
    );
    
    expect(trueEdge).toBeDefined();
    expect(falseEdge).toBeDefined();
    expect(trueEdge?.id).toBe('e1'); // Original edges should be preserved
    expect(falseEdge?.id).toBe('e2');
    
    // Each log_output should have exactly one incoming edge
    const logTrueIncoming = result.workflow.edges.filter((e: any) => e.target === 'log_true');
    const logFalseIncoming = result.workflow.edges.filter((e: any) => e.target === 'log_false');
    
    expect(logTrueIncoming.length).toBe(1);
    expect(logFalseIncoming.length).toBe(1);
    
    // No warnings about stale edges should be generated
    const staleWarnings = result.warnings.filter((w: string) => 
      w.toLowerCase().includes('stale') || w.toLowerCase().includes('rewiring')
    );
    expect(staleWarnings.length).toBe(0);
  });
});
