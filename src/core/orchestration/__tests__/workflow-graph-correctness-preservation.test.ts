/**
 * Preservation Tests — Workflow Graph Correctness
 * Feature: workflow-graph-correctness
 *
 * These tests MUST PASS on unfixed code — they capture baseline behavior
 * that must not regress after fixes are applied.
 *
 * Properties tested:
 *   P1  — reconcileWorkflow Idempotence
 *   P2  — ExecutionOrderManager Determinism
 *   P3  — Serialize-Deserialize-Reconcile Round Trip
 *   P7  — No Linear Main Edge from Switch Node
 *   P10 — planSwitchCasesFromPrompt Extracts N Cases
 *   P15 — IntentRouter Produces Deterministic Mapping
 */

import * as fc from 'fast-check';
import { describe, expect, it } from '@jest/globals';
import { unifiedGraphOrchestrator } from '../unified-graph-orchestrator';
import { unifiedNodeRegistry } from '../../registry/unified-node-registry';
import type { WorkflowNode, Workflow } from '../../types/ai-types';
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

function edgeSignature(workflow: Workflow): string {
  return JSON.stringify(
    workflow.edges
      .map(e => ({
        source: e.source,
        target: e.target,
        type: (e as any).type ?? null,
        sourceHandle: (e as any).sourceHandle ?? null,
      }))
      .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))
  );
}

function buildSimpleSwitchWorkflow(n: number): Workflow {
  const cases = Array.from({ length: n }, (_, i) => ({ value: `v${i}`, label: `V${i}` }));
  const nodes: WorkflowNode[] = [
    makeNode('trigger_1', 'form'),
    makeNode('switch_1', 'switch', { cases, expression: '{{$json.status}}' }),
    ...cases.flatMap((_, i) => [
      makeNode(`http_${i}`, 'http_request'),
      makeNode(`log_${i}`, 'log_output'),
    ]),
  ];
  const caseNodeMapping: CaseNodeMapping = {};
  cases.forEach((c, i) => { caseNodeMapping[c.value] = 'http_request'; });
  const result = unifiedGraphOrchestrator.initializeWorkflow(
    nodes, undefined, undefined, { switchNodeId: 'switch_1', caseNodeMapping }
  );
  return result.workflow;
}

// ─── P1: reconcileWorkflow Idempotence ───────────────────────────────────────

// Feature: workflow-graph-correctness, Property 1: reconcileWorkflow Idempotence
describe('P1 — reconcileWorkflow Idempotence', () => {
  it('reconciling a linear workflow twice produces identical edges', () => {
    // Feature: workflow-graph-correctness, Property 1: reconcileWorkflow Idempotence
    const nodes: WorkflowNode[] = [
      makeNode('trigger_1', 'form'),
      makeNode('http_1', 'http_request'),
      makeNode('log_1', 'log_output'),
    ];
    const { workflow } = unifiedGraphOrchestrator.initializeWorkflow(nodes);
    const once = unifiedGraphOrchestrator.reconcileWorkflow(workflow);
    const twice = unifiedGraphOrchestrator.reconcileWorkflow(once.workflow);

    expect(edgeSignature(twice.workflow)).toBe(edgeSignature(once.workflow));
  });

  it('reconciling a switch workflow twice produces identical edges', () => {
    // Feature: workflow-graph-correctness, Property 1: reconcileWorkflow Idempotence
    const workflow = buildSimpleSwitchWorkflow(3);
    const once = unifiedGraphOrchestrator.reconcileWorkflow(workflow);
    const twice = unifiedGraphOrchestrator.reconcileWorkflow(once.workflow);

    expect(edgeSignature(twice.workflow)).toBe(edgeSignature(once.workflow));
  });

  it('property: reconcile(reconcile(w)) edges === reconcile(w) edges for random workflows', () => {
    // Feature: workflow-graph-correctness, Property 1: reconcileWorkflow Idempotence
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 4 }),
        (n) => {
          const workflow = buildSimpleSwitchWorkflow(n);
          const once = unifiedGraphOrchestrator.reconcileWorkflow(workflow);
          const twice = unifiedGraphOrchestrator.reconcileWorkflow(once.workflow);
          expect(edgeSignature(twice.workflow)).toBe(edgeSignature(once.workflow));
        }
      ),
      { numRuns: 30 }
    );
  });
});

// ─── P2: ExecutionOrderManager Determinism ───────────────────────────────────

// Feature: workflow-graph-correctness, Property 2: ExecutionOrderManager Determinism
describe('P2 — ExecutionOrderManager Determinism', () => {
  it('initializeWorkflow called twice with same nodes produces same execution order', () => {
    // Feature: workflow-graph-correctness, Property 2: ExecutionOrderManager Determinism
    const nodes: WorkflowNode[] = [
      makeNode('trigger_1', 'form'),
      makeNode('switch_1', 'switch', { cases: [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }] }),
      makeNode('http_1', 'http_request'),
      makeNode('http_2', 'http_request'),
      makeNode('log_1', 'log_output'),
      makeNode('log_2', 'log_output'),
    ];

    const r1 = unifiedGraphOrchestrator.initializeWorkflow(nodes);
    const r2 = unifiedGraphOrchestrator.initializeWorkflow(nodes);

    const order1 = r1.executionOrder.nodeIds ?? (r1.executionOrder as any).orderedNodeIds ?? [];
    const order2 = r2.executionOrder.nodeIds ?? (r2.executionOrder as any).orderedNodeIds ?? [];

    expect(order1).toEqual(order2);
  });

  it('property: execution order is identical across multiple calls for same node set', () => {
    // Feature: workflow-graph-correctness, Property 2: ExecutionOrderManager Determinism
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 3 }),
        (n) => {
          const nodes: WorkflowNode[] = [
            makeNode('trigger_1', 'form'),
            makeNode('switch_1', 'switch'),
            ...Array.from({ length: n }, (_, i) => makeNode(`http_${i}`, 'http_request')),
            ...Array.from({ length: n }, (_, i) => makeNode(`log_${i}`, 'log_output')),
          ];
          const r1 = unifiedGraphOrchestrator.initializeWorkflow(nodes);
          const r2 = unifiedGraphOrchestrator.initializeWorkflow(nodes);
          const o1 = r1.executionOrder.nodeIds ?? (r1.executionOrder as any).orderedNodeIds ?? [];
          const o2 = r2.executionOrder.nodeIds ?? (r2.executionOrder as any).orderedNodeIds ?? [];
          expect(o1).toEqual(o2);
        }
      ),
      { numRuns: 30 }
    );
  });
});

// ─── P3: Serialize-Deserialize-Reconcile Round Trip ──────────────────────────

// Feature: workflow-graph-correctness, Property 3: Serialize-Deserialize-Reconcile Round Trip
describe('P3 — Serialize-Deserialize-Reconcile Round Trip', () => {
  it('linear workflow: serialize → deserialize → reconcile produces same edges', () => {
    // Feature: workflow-graph-correctness, Property 3: Serialize-Deserialize-Reconcile Round Trip
    const nodes: WorkflowNode[] = [
      makeNode('trigger_1', 'form'),
      makeNode('http_1', 'http_request'),
      makeNode('log_1', 'log_output'),
    ];
    const { workflow } = unifiedGraphOrchestrator.initializeWorkflow(nodes);
    const serialized = JSON.parse(JSON.stringify(workflow));
    const reconciled = unifiedGraphOrchestrator.reconcileWorkflow(serialized);

    expect(edgeSignature(reconciled.workflow)).toBe(edgeSignature(workflow));
  });

  it('property: round-trip preserves edge structure for linear workflows (no switch)', () => {
    // Feature: workflow-graph-correctness, Property 3: Serialize-Deserialize-Reconcile Round Trip
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 3 }),
        (n) => {
          const nodes: WorkflowNode[] = [
            makeNode('trigger_1', 'form'),
            ...Array.from({ length: n }, (_, i) => makeNode(`http_${i}`, 'http_request')),
            makeNode('log_1', 'log_output'),
          ];
          const { workflow } = unifiedGraphOrchestrator.initializeWorkflow(nodes);
          const serialized = JSON.parse(JSON.stringify(workflow));
          const reconciled = unifiedGraphOrchestrator.reconcileWorkflow(serialized);
          expect(edgeSignature(reconciled.workflow)).toBe(edgeSignature(workflow));
        }
      ),
      { numRuns: 20 }
    );
  });
});

// ─── P7: No Linear Main Edge from Switch Node ────────────────────────────────

// Feature: workflow-graph-correctness, Property 7: No Linear Main Edge from Switch Node
describe('P7 — No Linear Main Edge from Switch Node', () => {
  it('switch node has no outgoing "main" edges after initialization', () => {
    // Feature: workflow-graph-correctness, Property 7: No Linear Main Edge from Switch Node
    const workflow = buildSimpleSwitchWorkflow(3);
    const mainEdges = workflow.edges.filter(
      e => e.source === 'switch_1' && ((e as any).type === 'main' || !(e as any).type)
    );
    expect(mainEdges.length).toBe(0);
  });

  it('property: switch node never has main edges for any N', () => {
    // Feature: workflow-graph-correctness, Property 7: No Linear Main Edge from Switch Node
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 4 }),
        (n) => {
          const workflow = buildSimpleSwitchWorkflow(n);
          const mainEdges = workflow.edges.filter(
            e => e.source === 'switch_1' && ((e as any).type === 'main' || !(e as any).type)
          );
          expect(mainEdges.length).toBe(0);
        }
      ),
      { numRuns: 30 }
    );
  });
});

// ─── P10: planSwitchCasesFromPrompt Extracts N Cases ─────────────────────────

// Feature: workflow-graph-correctness, Property 10: planSwitchCasesFromPrompt Extracts Exactly the Specified Cases
describe('P10 — planSwitchCasesFromPrompt Extracts N Cases', () => {
  it('extracts 3 cases from "route orders by status: shipped, processing, cancelled"', () => {
    // Feature: workflow-graph-correctness, Property 10: planSwitchCasesFromPrompt Extracts Exactly the Specified Cases
    const { planSwitchCasesFromPrompt } = require('../../../services/ai/switch-case-plan');
    const result = planSwitchCasesFromPrompt(
      'route orders by status: shipped, processing, cancelled',
      undefined
    );
    console.log('[P10] cases:', result.cases.map((c: any) => c.value));
    expect(result.cases.length).toBe(3);
    const values = result.cases.map((c: any) => c.value);
    expect(values).toContain('shipped');
    expect(values).toContain('processing');
    expect(values).toContain('cancelled');
  });

  it('extracts 2 cases from "route messages as sales or support"', () => {
    // Feature: workflow-graph-correctness, Property 10: planSwitchCasesFromPrompt Extracts Exactly the Specified Cases
    const { planSwitchCasesFromPrompt } = require('../../../services/ai/switch-case-plan');
    const result = planSwitchCasesFromPrompt('route messages as sales or support', undefined);
    console.log('[P10] cases:', result.cases.map((c: any) => c.value));
    expect(result.cases.length).toBe(2);
  });

  it('property: N explicitly enumerated case values always produce cases.length === N', () => {
    // Feature: workflow-graph-correctness, Property 10: planSwitchCasesFromPrompt Extracts Exactly the Specified Cases
    const { planSwitchCasesFromPrompt } = require('../../../services/ai/switch-case-plan');
    const testCases = [
      { prompt: 'route by status: shipped, processing, cancelled', n: 3 },
      { prompt: 'classify as admin, editor, viewer', n: 3 },
      { prompt: 'route messages as sales or support', n: 2 },
      { prompt: 'bucket into new, active, closed, archived', n: 4 },
    ];
    for (const { prompt, n } of testCases) {
      const result = planSwitchCasesFromPrompt(prompt, undefined);
      console.log(`[P10] "${prompt}" → ${result.cases.length} cases`);
      expect(result.cases.length).toBe(n);
    }
  });
});

// ─── P15: IntentRouter Produces Deterministic Mapping ────────────────────────

// Feature: workflow-graph-correctness, Property 15: IntentRouter Produces Deterministic Mapping
describe('P15 — IntentRouter Produces Deterministic Mapping', () => {
  it('routing the same upstream output to the same target schema produces the same result', async () => {
    // Feature: workflow-graph-correctness, Property 15: IntentRouter Produces Deterministic Mapping
    const { IntentDrivenJsonRouter } = await import('../../intent-driven-json-router');
    const router = new IntentDrivenJsonRouter();

    const upstreamOutput = { status: 'shipped', orderId: '123', trackingUrl: 'https://track.example.com' };
    const targetSchema = {
      subject: { type: 'string' as const, description: 'Email subject', required: false },
      body: { type: 'string' as const, description: 'Email body', required: false },
    };

    const context = {
      previousOutput: upstreamOutput,
      targetNodeInputSchema: targetSchema as any,
      userIntent: 'send tracking details via Gmail',
      sourceNodeType: 'form',
      targetNodeType: 'google_gmail',
      sourceNodeId: 'form_1',
      targetNodeId: 'gmail_1',
    };

    const result1 = await router.route(context);
    const result2 = await router.route(context);

    console.log('[P15] result1 method:', result1.method, 'confidence:', result1.confidence);
    console.log('[P15] result2 method:', result2.method, 'confidence:', result2.confidence);

    // Same inputs must produce same routing method and confidence
    expect(result1.method).toBe(result2.method);
    expect(result1.confidence).toBe(result2.confidence);
  });

  it('property: routing result is identical regardless of upstream key iteration order', async () => {
    // Feature: workflow-graph-correctness, Property 15: IntentRouter Produces Deterministic Mapping
    const { IntentDrivenJsonRouter } = await import('../../intent-driven-json-router');
    const router = new IntentDrivenJsonRouter();

    // Fixed upstream output — same keys, same values, different insertion order
    const upstreamA = { status: 'shipped', orderId: '123', trackingUrl: 'https://track.example.com' };
    const upstreamB = { trackingUrl: 'https://track.example.com', orderId: '123', status: 'shipped' };

    const targetSchema = {
      subject: { type: 'string' as const, description: 'Email subject', required: false },
      body: { type: 'string' as const, description: 'Email body', required: false },
    };

    const baseContext = {
      targetNodeInputSchema: targetSchema as any,
      userIntent: 'send tracking details via Gmail',
      sourceNodeType: 'form',
      targetNodeType: 'google_gmail',
      sourceNodeId: 'form_1',
      targetNodeId: 'gmail_1',
    };

    const r1 = await router.route({ ...baseContext, previousOutput: upstreamA });
    const r2 = await router.route({ ...baseContext, previousOutput: upstreamB });

    console.log('[P15] r1 method:', r1.method, 'r2 method:', r2.method);
    // Same logical content → same routing method
    expect(r1.method).toBe(r2.method);
  });
});
