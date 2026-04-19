/**
 * Bug Condition Exploration Tests — Workflow Graph Correctness
 * Feature: workflow-graph-correctness
 *
 * CRITICAL: These tests encode the EXPECTED (correct) behavior.
 * They are expected to FAIL on unfixed code — failure confirms the bugs exist.
 * They will PASS after the fixes are applied.
 *
 * Properties tested:
 *   P4  — Switch Node Gets Exactly N Branch Edges
 *   P6  — TIER 2 Category Priority Ordering
 *   P8  — Log_Output Predecessor Stays Within Its Branch Region
 *   P9  — N Switch Branches Produce N Log_Output Nodes Each with In-Degree 1
 */

import * as fc from 'fast-check';
import { describe, expect, it } from '@jest/globals';
import { unifiedGraphOrchestrator } from '../unified-graph-orchestrator';
import { unifiedNodeRegistry } from '../../registry/unified-node-registry';
import type { WorkflowNode, WorkflowEdge, Workflow } from '../../types/ai-types';
import type { CaseNodeMapping } from '../../types/unified-node-contract';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeNode(id: string, nodeType: string, extraConfig?: Record<string, unknown>): WorkflowNode {
  const def = unifiedNodeRegistry.get(nodeType);
  return {
    id,
    type: 'custom',
    position: { x: 0, y: 0 },
    data: {
      type: nodeType,
      label: nodeType,
      category: def?.category ?? 'utility',
      config: { ...extraConfig },
    },
  };
}

/**
 * Build a switch workflow with N branches.
 * Chain: trigger → switch → [http_request_1 → log_1, http_request_2 → log_2, ...]
 * The switch node has N cases configured.
 */
function buildSwitchWorkflowWithNBranches(n: number): {
  workflow: Workflow;
  switchNodeId: string;
  caseNodeMapping: CaseNodeMapping;
} {
  const cases = Array.from({ length: n }, (_, i) => `case_val_${i + 1}`);
  const switchCases = cases.map((v) => ({ value: v, label: v }));

  const nodes: WorkflowNode[] = [
    makeNode('trigger_1', 'form'),
    makeNode('switch_1', 'switch', { cases: switchCases, expression: '{{$json.status}}' }),
    ...cases.flatMap((_, i) => [
      makeNode(`http_${i + 1}`, 'http_request'),
      makeNode(`log_${i + 1}`, 'log_output'),
    ]),
  ];

  const caseNodeMapping: CaseNodeMapping = {};
  cases.forEach((v, i) => {
    caseNodeMapping[v] = {
      targetNodeType: 'http_request',
      targetNodeId: `http_${i + 1}`,
    };
  });

  const result = unifiedGraphOrchestrator.initializeWorkflow(
    nodes,
    undefined,
    undefined,
    { switchNodeId: 'switch_1', caseNodeMapping }
  );

  return { workflow: result.workflow, switchNodeId: 'switch_1', caseNodeMapping };
}

// ─── P4: Switch Node Gets Exactly N Branch Edges ─────────────────────────────

// Feature: workflow-graph-correctness, Property 4: Switch Node Gets Exactly N Branch Edges
describe('P4 — Switch Node Gets Exactly N Branch Edges', () => {
  it('switch with 3 cases produces exactly 3 outgoing case edges', () => {
    // Feature: workflow-graph-correctness, Property 4: Switch Node Gets Exactly N Branch Edges
    const { workflow, switchNodeId } = buildSwitchWorkflowWithNBranches(3);
    const switchOutEdges = workflow.edges.filter(e => e.source === switchNodeId);
    const caseEdges = switchOutEdges.filter(e =>
      String((e as any).type || (e as any).sourceHandle || '').startsWith('case_')
    );
    console.log('[P4] switch outgoing edges:', switchOutEdges.map(e => ({
      target: e.target,
      type: (e as any).type,
      sourceHandle: (e as any).sourceHandle,
    })));
    expect(caseEdges.length).toBe(3);
  });

  it('property: switch with N cases (2–6) always produces exactly N case edges', () => {
    // Feature: workflow-graph-correctness, Property 4: Switch Node Gets Exactly N Branch Edges
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 6 }),
        (n) => {
          const { workflow, switchNodeId } = buildSwitchWorkflowWithNBranches(n);
          const switchOutEdges = workflow.edges.filter(e => e.source === switchNodeId);
          const caseEdges = switchOutEdges.filter(e =>
            String((e as any).type || (e as any).sourceHandle || '').startsWith('case_')
          );
          expect(caseEdges.length).toBe(n);
        }
      ),
      { numRuns: 50 }
    );
  });

  it('no outgoing edge from switch node has type "main"', () => {
    // Feature: workflow-graph-correctness, Property 4: Switch Node Gets Exactly N Branch Edges
    const { workflow, switchNodeId } = buildSwitchWorkflowWithNBranches(3);
    const mainEdges = workflow.edges.filter(
      e => e.source === switchNodeId && ((e as any).type === 'main' || !(e as any).type)
    );
    expect(mainEdges.length).toBe(0);
  });
});

// ─── P6: TIER 2 Category Priority Ordering ───────────────────────────────────

// Feature: workflow-graph-correctness, Property 6: TIER 2 Category Priority Ordering
describe('P6 — TIER 2 Category Priority Ordering', () => {
  it('switch (logic) appears before http_request (http_api) in execution order', () => {
    // Feature: workflow-graph-correctness, Property 6: TIER 2 Category Priority Ordering
    const nodes: WorkflowNode[] = [
      makeNode('trigger_1', 'form'),
      makeNode('http_1', 'http_request'),
      makeNode('switch_1', 'switch', { cases: [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }] }),
      makeNode('log_1', 'log_output'),
      makeNode('log_2', 'log_output'),
    ];

    const result = unifiedGraphOrchestrator.initializeWorkflow(nodes);
    const orderedIds = result.executionOrder.nodeIds ?? (result.executionOrder as any).orderedNodeIds ?? [];

    const switchIdx = orderedIds.indexOf('switch_1');
    const httpIdx = orderedIds.indexOf('http_1');

    console.log('[P6] execution order:', orderedIds.map(id => {
      const n = nodes.find(x => x.id === id);
      return `${n?.data?.type}(${id})`;
    }));
    console.log('[P6] switch index:', switchIdx, 'http_request index:', httpIdx);

    expect(switchIdx).toBeGreaterThanOrEqual(0);
    expect(httpIdx).toBeGreaterThanOrEqual(0);
    expect(switchIdx).toBeLessThan(httpIdx);
  });

  it('log_output always appears last in execution order', () => {
    // Feature: workflow-graph-correctness, Property 6: TIER 2 Category Priority Ordering
    const nodes: WorkflowNode[] = [
      makeNode('trigger_1', 'form'),
      makeNode('log_1', 'log_output'),
      makeNode('switch_1', 'switch', { cases: [{ value: 'a', label: 'A' }] }),
      makeNode('http_1', 'http_request'),
    ];

    const result = unifiedGraphOrchestrator.initializeWorkflow(nodes);
    const orderedIds = result.executionOrder.nodeIds ?? (result.executionOrder as any).orderedNodeIds ?? [];
    const lastId = orderedIds[orderedIds.length - 1];
    const lastNode = nodes.find(n => n.id === lastId);
    const lastType = lastNode?.data?.type;

    console.log('[P6] last node in execution order:', lastType);
    expect(lastType).toBe('log_output');
  });

  it('property: for any workflow with logic + http_api nodes, logic always precedes http_api', () => {
    // Feature: workflow-graph-correctness, Property 6: TIER 2 Category Priority Ordering
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 4 }),
        (n) => {
          const nodes: WorkflowNode[] = [
            makeNode('trigger_1', 'form'),
            makeNode('switch_1', 'switch', {
              cases: Array.from({ length: n }, (_, i) => ({ value: `v${i}`, label: `V${i}` })),
            }),
            ...Array.from({ length: n }, (_, i) => makeNode(`http_${i}`, 'http_request')),
            ...Array.from({ length: n }, (_, i) => makeNode(`log_${i}`, 'log_output')),
          ];

          const result = unifiedGraphOrchestrator.initializeWorkflow(nodes);
          const orderedIds = result.executionOrder.nodeIds ?? (result.executionOrder as any).orderedNodeIds ?? [];

          const switchIdx = orderedIds.indexOf('switch_1');
          const httpIndices = Array.from({ length: n }, (_, i) => orderedIds.indexOf(`http_${i}`));
          const logIndices = Array.from({ length: n }, (_, i) => orderedIds.indexOf(`log_${i}`));

          // switch must come before all http_request nodes
          for (const httpIdx of httpIndices) {
            if (httpIdx >= 0) expect(switchIdx).toBeLessThan(httpIdx);
          }
          // all log_output nodes must come after all http_request nodes
          for (const logIdx of logIndices) {
            for (const httpIdx of httpIndices) {
              if (logIdx >= 0 && httpIdx >= 0) expect(httpIdx).toBeLessThan(logIdx);
            }
          }
        }
      ),
      { numRuns: 30 }
    );
  });
});

// ─── P8: Log_Output Predecessor Within Branch Region ─────────────────────────

// Feature: workflow-graph-correctness, Property 8: Log_Output Predecessor Stays Within Its Branch Region
describe('P8 — Log_Output Predecessor Stays Within Its Branch Region', () => {
  it('each log_output connects from its own branch output node, not from a sibling branch or switch', () => {
    // Feature: workflow-graph-correctness, Property 8: Log_Output Predecessor Stays Within Its Branch Region
    const { workflow } = buildSwitchWorkflowWithNBranches(3);

    // For each log_output, find its incoming edge source
    const logNodes = workflow.nodes.filter(n => n.data?.type === 'log_output');
    console.log('[P8] log_output nodes:', logNodes.map(n => n.id));
    console.log('[P8] all edges:', workflow.edges.map(e => ({
      source: e.source,
      target: e.target,
      type: (e as any).type,
    })));

    for (const logNode of logNodes) {
      const incomingEdges = workflow.edges.filter(e => e.target === logNode.id);
      console.log(`[P8] log(${logNode.id}) incoming:`, incomingEdges.map(e => e.source));

      // Each log_output must have exactly 1 incoming edge
      expect(incomingEdges.length).toBe(1);

      // The source must be an http_request (branch output), not the switch node itself
      const sourceId = incomingEdges[0].source;
      const sourceNode = workflow.nodes.find(n => n.id === sourceId);
      const sourceType = sourceNode?.data?.type;
      console.log(`[P8] log(${logNode.id}) source type: ${sourceType}`);
      expect(sourceType).toBe('http_request');
      expect(sourceType).not.toBe('switch');
      expect(sourceType).not.toBe('form');
    }
  });

  it('property: for N-branch switch workflow, each log_output predecessor is in its own branch region', () => {
    // Feature: workflow-graph-correctness, Property 8: Log_Output Predecessor Stays Within Its Branch Region
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 4 }),
        (n) => {
          const { workflow } = buildSwitchWorkflowWithNBranches(n);
          const logNodes = workflow.nodes.filter(nd => nd.data?.type === 'log_output');

          for (const logNode of logNodes) {
            const incomingEdges = workflow.edges.filter(e => e.target === logNode.id);
            expect(incomingEdges.length).toBe(1);
            const sourceNode = workflow.nodes.find(nd => nd.id === incomingEdges[0].source);
            expect(sourceNode?.data?.type).toBe('http_request');
          }
        }
      ),
      { numRuns: 30 }
    );
  });
});

// ─── P9: N Branches → N Log_Outputs Each with In-Degree 1 ────────────────────

// Feature: workflow-graph-correctness, Property 9: N Switch Branches Produce N Log_Output Nodes Each with In-Degree 1
describe('P9 — N Switch Branches Produce N Log_Output Nodes Each with In-Degree 1', () => {
  it('3-branch switch produces exactly 3 log_output nodes each with in-degree 1', () => {
    // Feature: workflow-graph-correctness, Property 9: N Switch Branches Produce N Log_Output Nodes Each with In-Degree 1
    const { workflow } = buildSwitchWorkflowWithNBranches(3);
    const logNodes = workflow.nodes.filter(n => n.data?.type === 'log_output');

    console.log('[P9] log_output count:', logNodes.length);
    expect(logNodes.length).toBe(3);

    for (const logNode of logNodes) {
      const inDegree = workflow.edges.filter(e => e.target === logNode.id).length;
      console.log(`[P9] log(${logNode.id}) in-degree: ${inDegree}`);
      expect(inDegree).toBe(1);
    }
  });

  it('no duplicate log_output nodes are created by reconciliation', () => {
    // Feature: workflow-graph-correctness, Property 9: N Switch Branches Produce N Log_Output Nodes Each with In-Degree 1
    const { workflow } = buildSwitchWorkflowWithNBranches(3);
    const logNodes = workflow.nodes.filter(n => n.data?.type === 'log_output');

    // Reconcile a second time — should not create more log_output nodes
    const reconciled = unifiedGraphOrchestrator.reconcileWorkflow(workflow);
    const logNodesAfter = reconciled.workflow.nodes.filter(n => n.data?.type === 'log_output');

    console.log('[P9] log_output before reconcile:', logNodes.length, 'after:', logNodesAfter.length);
    expect(logNodesAfter.length).toBe(logNodes.length);
  });

  it('property: N-branch switch always produces exactly N log_output nodes each with in-degree 1', () => {
    // Feature: workflow-graph-correctness, Property 9: N Switch Branches Produce N Log_Output Nodes Each with In-Degree 1
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 4 }),
        (n) => {
          const { workflow } = buildSwitchWorkflowWithNBranches(n);
          const logNodes = workflow.nodes.filter(nd => nd.data?.type === 'log_output');
          expect(logNodes.length).toBe(n);
          for (const logNode of logNodes) {
            const inDegree = workflow.edges.filter(e => e.target === logNode.id).length;
            expect(inDegree).toBe(1);
          }
        }
      ),
      { numRuns: 30 }
    );
  });
});
