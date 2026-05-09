import type { WorkflowEdge } from '../../types/ai-types';
import {
  SwitchRoutingError,
  type SwitchRouterNode,
  parseCaseHandleIndex,
  orderedSwitchCaseValues,
  resolveWinningSwitchEdgeId,
  resolveWinningSwitchEdgeIdOrThrow,
  shouldSkipForSwitchIncomingEdge,
} from '../switch-branch-router';

describe('switch-branch-router', () => {
  const switchNode = {
    id: 'sw1',
    data: {
      type: 'switch' as const,
      config: {
        cases: [
          { value: 'success', label: 'ok' },
          { value: 'pending', label: 'wait' },
          { value: 'failed', label: 'bad' },
        ],
      },
    },
  };

  const edges: WorkflowEdge[] = [
    {
      id: 'e1',
      source: 'sw1',
      target: 'gmail_a',
      sourceHandle: 'case_1',
      targetHandle: 'input',
    },
    {
      id: 'e2',
      source: 'sw1',
      target: 'slack_b',
      sourceHandle: 'case_2',
      targetHandle: 'input',
    },
    {
      id: 'e3',
      source: 'sw1',
      target: 'gmail_c',
      sourceHandle: 'case_3',
      targetHandle: 'input',
    },
  ];

  it('maps case_N handles to semantic matchedCase (3 branches)', () => {
    expect(resolveWinningSwitchEdgeId({
      switchNode,
      allEdges: edges,
      matchedCase: 'success',
    })).toBe('e1');
    expect(resolveWinningSwitchEdgeId({
      switchNode,
      allEdges: edges,
      matchedCase: 'pending',
    })).toBe('e2');
    expect(resolveWinningSwitchEdgeId({
      switchNode,
      allEdges: edges,
      matchedCase: 'failed',
    })).toBe('e3');
  });

  it('matches branchName before case index', () => {
    const withNames: WorkflowEdge[] = edges.map((e, i) => ({
      ...e,
      branchName: ['success', 'pending', 'failed'][i],
    }));
    expect(resolveWinningSwitchEdgeId({
      switchNode,
      allEdges: withNames,
      matchedCase: 'pending',
    })).toBe('e2');
  });

  it('matches sourceIndex for numeric output', () => {
    const indexed: WorkflowEdge[] = edges.map((e, i) => ({
      ...e,
      sourceIndex: i,
      sourceHandle: `case_${i + 1}`,
    }));
    expect(resolveWinningSwitchEdgeId({
      switchNode,
      allEdges: indexed,
      matchedCase: null,
      expressionValue: 1,
    })).toBe('e2');
  });

  it('uses isDefault when no string/number match', () => {
    const withDef: WorkflowEdge[] = [
      ...edges.slice(0, 2),
      { ...edges[2], isDefault: true },
    ];
    expect(resolveWinningSwitchEdgeId({
      switchNode,
      allEdges: withDef,
      matchedCase: 'unknown',
    })).toBe('e3');
  });

  it('falls back to last edge when no match and no default', () => {
    expect(resolveWinningSwitchEdgeId({
      switchNode,
      allEdges: edges,
      matchedCase: 'other',
    })).toBe('e3');
  });

  it('parseCaseHandleIndex parses case_N (1-based)', () => {
    expect(parseCaseHandleIndex('case_1')).toBe(0);
    expect(parseCaseHandleIndex('CASE_3')).toBe(2);
    expect(parseCaseHandleIndex('main')).toBeNull();
  });

  it('orderedSwitchCaseValues preserves order', () => {
    expect(orderedSwitchCaseValues(switchNode.data.config as Record<string, unknown>)).toEqual([
      'success',
      'pending',
      'failed',
    ]);
  });

  it('shouldSkipForSwitchIncomingEdge skips non-winning branches', () => {
    const w = resolveWinningSwitchEdgeId({
      switchNode,
      allEdges: edges,
      matchedCase: 'success',
    });
    expect(w).toBe('e1');
    expect(shouldSkipForSwitchIncomingEdge(edges[0], switchNode, edges, 'success')).toBe(false);
    expect(shouldSkipForSwitchIncomingEdge(edges[1], switchNode, edges, 'success')).toBe(true);
  });

  it('resolveWinningSwitchEdgeIdOrThrow throws only with zero outgoing edges', () => {
    expect(() =>
      resolveWinningSwitchEdgeIdOrThrow({
        switchNode,
        allEdges: [],
        matchedCase: 'success',
      })
    ).toThrow(SwitchRoutingError);
  });

  it('prefers sourceHandle over type when type is default (mislabeled export)', () => {
    const mislabeled: WorkflowEdge[] = edges.map((e) => ({
      ...e,
      type: 'default' as unknown as string,
    }));
    expect(
      resolveWinningSwitchEdgeId({
        switchNode,
        allEdges: mislabeled,
        matchedCase: 'pending',
      })
    ).toBe('e2');
  });

  it('routes by case index when cases[] is empty but edges use case_N', () => {
    const bare: SwitchRouterNode = {
      id: 'sw2',
      data: { type: 'switch', config: { cases: [] } },
    };
    const bareEdges: WorkflowEdge[] = [
      { id: 'a', source: 'sw2', target: 'n1', sourceHandle: 'case_1', targetHandle: 'input' },
      { id: 'b', source: 'sw2', target: 'n2', sourceHandle: 'case_2', targetHandle: 'input' },
    ];
    expect(
      resolveWinningSwitchEdgeId({
        switchNode: bare,
        allEdges: bareEdges,
        matchedCase: null,
        expressionValue: 0,
      })
    ).toBe('a');
  });

  // ─── React Flow serialization survival tests ──────────────────────────────
  // React Flow overwrites edge.type with its visual type ("smoothstep") and may
  // strip sourceHandle. These tests verify the router still picks the right branch.

  describe('React Flow serialization — branchName at top level (new format)', () => {
    // wireSwitchCaseEdges now stamps branchName: portLabel on every case edge.
    // React Flow preserves custom top-level properties on edges.
    const swNode = {
      id: 'node_176fee7c',
      data: {
        type: 'switch' as const,
        config: {
          cases: [
            { value: 'success', label: 'Payment Success' },
            { value: 'pending', label: 'Payment Pending' },
            { value: 'failed', label: 'Payment Failed' },
          ],
        },
      },
    };

    // IDs are alphabetically: failed < pending < success (mirrors the actual bug scenario)
    const newFormatEdges: WorkflowEdge[] = [
      {
        id: 'node_176fee7c-failed-node_slack_001',
        source: 'node_176fee7c',
        target: 'node_slack_001',
        type: 'smoothstep',          // React Flow visual type overwrote original
        sourceHandle: undefined as any,
        branchName: 'failed',        // ← new: top-level branchName
        data: { branchName: 'failed' },
      } as any,
      {
        id: 'node_176fee7c-pending-node_slack_002',
        source: 'node_176fee7c',
        target: 'node_slack_002',
        type: 'smoothstep',
        sourceHandle: undefined as any,
        branchName: 'pending',
        data: { branchName: 'pending' },
      } as any,
      {
        id: 'node_176fee7c-success-node_ifelse_003',
        source: 'node_176fee7c',
        target: 'node_ifelse_003',
        type: 'smoothstep',
        sourceHandle: undefined as any,
        branchName: 'success',       // ← router should pick this for matchedCase="success"
        data: { branchName: 'success' },
      } as any,
    ];

    it('routes "success" to the if_else node, not the first-alphabetically slack node', () => {
      expect(resolveWinningSwitchEdgeId({
        switchNode: swNode,
        allEdges: newFormatEdges,
        matchedCase: 'success',
      })).toBe('node_176fee7c-success-node_ifelse_003');
    });

    it('routes "failed" to the correct slack node', () => {
      expect(resolveWinningSwitchEdgeId({
        switchNode: swNode,
        allEdges: newFormatEdges,
        matchedCase: 'failed',
      })).toBe('node_176fee7c-failed-node_slack_001');
    });

    it('routes "pending" to the correct slack node', () => {
      expect(resolveWinningSwitchEdgeId({
        switchNode: swNode,
        allEdges: newFormatEdges,
        matchedCase: 'pending',
      })).toBe('node_176fee7c-pending-node_slack_002');
    });
  });

  describe('React Flow serialization — branchName only in data (partially serialized)', () => {
    // If React Flow strips the top-level branchName but preserves data{},
    // the router should still work via edge.data.branchName fallback.
    const swNode = {
      id: 'sw_pay',
      data: {
        type: 'switch' as const,
        config: {
          cases: [
            { value: 'success', label: 'ok' },
            { value: 'failed', label: 'bad' },
          ],
        },
      },
    };

    const dataOnlyEdges: WorkflowEdge[] = [
      {
        id: 'sw_pay-failed-node_a',
        source: 'sw_pay',
        target: 'node_a',
        type: 'smoothstep',
        // no top-level branchName
        data: { branchName: 'failed' },
      } as any,
      {
        id: 'sw_pay-success-node_b',
        source: 'sw_pay',
        target: 'node_b',
        type: 'smoothstep',
        // no top-level branchName
        data: { branchName: 'success' },
      } as any,
    ];

    it('routes "success" via data.branchName even when top-level branchName is absent', () => {
      expect(resolveWinningSwitchEdgeId({
        switchNode: swNode,
        allEdges: dataOnlyEdges,
        matchedCase: 'success',
      })).toBe('sw_pay-success-node_b');
    });

    it('routes "failed" via data.branchName even when top-level branchName is absent', () => {
      expect(resolveWinningSwitchEdgeId({
        switchNode: swNode,
        allEdges: dataOnlyEdges,
        matchedCase: 'failed',
      })).toBe('sw_pay-failed-node_a');
    });
  });

  describe('React Flow serialization — legacy edges (no branchName, ID-substring fallback)', () => {
    // Workflows created before the branchName fix have no branchName anywhere.
    // The router's 1d) ID-substring fallback should still route correctly by
    // finding "-success-" / "-failed-" in the edge IDs generated by wireSwitchCaseEdges.
    const swNode = {
      id: 'node_176fee7c',
      data: {
        type: 'switch' as const,
        config: {
          cases: [
            { value: 'success', label: 'Payment Success' },
            { value: 'pending', label: 'Payment Pending' },
            { value: 'failed', label: 'Payment Failed' },
          ],
        },
      },
    };

    // The exact scenario from logs.txt: payment_status="success" routed to Slack (wrong)
    // These edges have no branchName and type was overwritten to "smoothstep" by React Flow
    const legacyEdges: WorkflowEdge[] = [
      {
        id: 'node_176fee7c-failed-node_slack_aaa',
        source: 'node_176fee7c',
        target: 'node_slack_aaa',
        type: 'smoothstep',   // React Flow visual type
        // no sourceHandle, no branchName
      },
      {
        id: 'node_176fee7c-pending-node_slack_bbb',
        source: 'node_176fee7c',
        target: 'node_slack_bbb',
        type: 'smoothstep',
      },
      {
        id: 'node_176fee7c-success-node_ifelse_ccc',
        source: 'node_176fee7c',
        target: 'node_ifelse_ccc',
        type: 'smoothstep',
      },
    ];

    it('routes "success" to the if_else node (ID-substring fallback)', () => {
      expect(resolveWinningSwitchEdgeId({
        switchNode: swNode,
        allEdges: legacyEdges,
        matchedCase: 'success',
      })).toBe('node_176fee7c-success-node_ifelse_ccc');
    });

    it('routes "failed" correctly even though it sorts first alphabetically', () => {
      expect(resolveWinningSwitchEdgeId({
        switchNode: swNode,
        allEdges: legacyEdges,
        matchedCase: 'failed',
      })).toBe('node_176fee7c-failed-node_slack_aaa');
    });

    it('routes "pending" correctly', () => {
      expect(resolveWinningSwitchEdgeId({
        switchNode: swNode,
        allEdges: legacyEdges,
        matchedCase: 'pending',
      })).toBe('node_176fee7c-pending-node_slack_bbb');
    });

    it('case-insensitive: "SUCCESS" routes the same as "success"', () => {
      expect(resolveWinningSwitchEdgeId({
        switchNode: swNode,
        allEdges: legacyEdges,
        matchedCase: 'SUCCESS',
      })).toBe('node_176fee7c-success-node_ifelse_ccc');
    });
  });

  describe('if_else routing — true/false branches', () => {
    const ifElseNode = {
      id: 'ife1',
      data: {
        type: 'if_else' as const,
        config: {
          cases: [
            { value: 'true', label: 'Condition Met' },
            { value: 'false', label: 'Condition Not Met' },
          ],
        },
      },
    };

    it('routes "true" to the correct branch via branchName', () => {
      const ifEdges: WorkflowEdge[] = [
        {
          id: 'ife1-false-node_x',
          source: 'ife1',
          target: 'node_x',
          type: 'smoothstep',
          branchName: 'false',
          data: { branchName: 'false' },
        } as any,
        {
          id: 'ife1-true-node_y',
          source: 'ife1',
          target: 'node_y',
          type: 'smoothstep',
          branchName: 'true',
          data: { branchName: 'true' },
        } as any,
      ];
      expect(resolveWinningSwitchEdgeId({
        switchNode: ifElseNode,
        allEdges: ifEdges,
        matchedCase: 'true',
      })).toBe('ife1-true-node_y');
    });

    it('routes "false" to the correct branch via ID-substring (legacy)', () => {
      const ifEdgesLegacy: WorkflowEdge[] = [
        {
          id: 'ife1-false-node_x',
          source: 'ife1',
          target: 'node_x',
          type: 'smoothstep',
        },
        {
          id: 'ife1-true-node_y',
          source: 'ife1',
          target: 'node_y',
          type: 'smoothstep',
        },
      ];
      expect(resolveWinningSwitchEdgeId({
        switchNode: ifElseNode,
        allEdges: ifEdgesLegacy,
        matchedCase: 'false',
      })).toBe('ife1-false-node_x');
    });
  });
});
