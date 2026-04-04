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
});
