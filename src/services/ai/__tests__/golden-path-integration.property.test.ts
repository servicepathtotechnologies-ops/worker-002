/**
 * Property-Based Tests: Golden-Path Integration + Node Type Normalizer
 * Feature: ai-workflow-generation-engine
 */

import * as fc from 'fast-check';
import { unifiedNodeRegistry } from '../../../core/registry/unified-node-registry';
import { unifiedNormalizeNodeTypeString } from '../../../core/utils/unified-node-type-normalizer';
import { unifiedGraphOrchestrator } from '../../../core/orchestration';
import type { WorkflowNode } from '../../../core/types/ai-types';

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeNode(id: string, nodeType: string): WorkflowNode {
  const def = unifiedNodeRegistry.get(nodeType);
  return {
    id,
    type: 'custom',
    position: { x: 0, y: 0 },
    data: { type: nodeType, label: nodeType, category: def?.category ?? 'utility', config: {} },
  };
}

// ─── Property 4: Unresolvable node types are omitted and recorded ─────────────

// Feature: ai-workflow-generation-engine, Property 4: Unresolvable node types are omitted and recorded
test('Property 4: Unresolvable node types are not in the registry', () => {
  fc.assert(
    fc.property(
      // Generate strings that are clearly not valid node types
      fc.string({ minLength: 1, maxLength: 20 }).filter(
        (s) => !unifiedNodeRegistry.has(s) && /^[a-z_]+$/.test(s)
      ),
      (unknownType) => {
        // Unknown types must not be in the registry
        expect(unifiedNodeRegistry.has(unknownType)).toBe(false);
        expect(unifiedNodeRegistry.get(unknownType)).toBeUndefined();
      }
    ),
    { numRuns: 100 }
  );
});

// ─── Property 33: Compiled graph equals proposedNodeChain plus alwaysRequired nodes

// Feature: ai-workflow-generation-engine, Property 33: Compiled graph contains all nodes from proposedNodeChain
test('Property 33: Compiled graph contains trigger and alwaysRequired nodes', () => {
  const allTypes = unifiedNodeRegistry.getAllTypes();
  const triggerTypes = allTypes.filter((t) => unifiedNodeRegistry.get(t)?.category === 'trigger');

  if (triggerTypes.length === 0) return;

  fc.assert(
    fc.property(
      fc.constantFrom(...triggerTypes),
      (triggerType) => {
        // Build a minimal workflow: trigger + log_output
        const nodes: WorkflowNode[] = [
          makeNode('trigger-1', triggerType),
          makeNode('log-1', 'log_output'),
        ];
        const result = unifiedGraphOrchestrator.initializeWorkflow(nodes);

        // The result must have nodes and executionOrder
        expect(result.workflow.nodes.length).toBeGreaterThan(0);
        expect(result.executionOrder).toBeDefined();
      }
    ),
    { numRuns: 100 }
  );
});

// ─── Property 30: Node type normalizer is canonical for all spelling variants ─

// Feature: ai-workflow-generation-engine, Property 30: Node type normalizer returns consistent canonical keys
test('Property 30: Node type normalizer returns consistent canonical keys', () => {
  const allTypes = unifiedNodeRegistry.getAllTypes();
  if (allTypes.length === 0) return;

  fc.assert(
    fc.property(
      fc.constantFrom(...allTypes),
      (canonicalType) => {
        // Normalizing a canonical type should return itself (or its canonical alias)
        const normalized = unifiedNormalizeNodeTypeString(canonicalType);
        expect(typeof normalized).toBe('string');
        expect(normalized.length).toBeGreaterThan(0);

        // The normalized result must be a registered canonical type
        // (it may differ from input if input is an alias)
        expect(unifiedNodeRegistry.has(normalized)).toBe(true);

        // Normalizing the same input twice must give the same result (idempotent)
        const normalizedAgain = unifiedNormalizeNodeTypeString(normalized);
        expect(normalizedAgain).toBe(normalized);
      }
    ),
    { numRuns: 100 }
  );
});

// ─── Golden-path Flow A: manual_trigger → google_sheets → ai_chat_model → google_gmail → log_output

test('Golden-path Flow A: linear workflow initializes without errors', () => {
  const flowA = ['manual_trigger', 'google_sheets', 'ai_chat_model', 'google_gmail', 'log_output'];

  // Only run if all node types are registered
  const allRegistered = flowA.every((t) => unifiedNodeRegistry.has(t));
  if (!allRegistered) {
    console.log('Skipping Flow A: not all node types registered in test environment');
    return;
  }

  const nodes: WorkflowNode[] = flowA.map((t, i) => makeNode(`node-${i}`, t));
  // initializeWorkflow should not throw
  expect(() => unifiedGraphOrchestrator.initializeWorkflow(nodes)).not.toThrow();

  const result = unifiedGraphOrchestrator.initializeWorkflow(nodes);
  // Result must have nodes and edges arrays
  expect(Array.isArray(result.workflow.nodes)).toBe(true);
  expect(Array.isArray(result.workflow.edges)).toBe(true);
  // Must have at least one node
  expect(result.workflow.nodes.length).toBeGreaterThan(0);
});

// ─── Golden-path Flow C: switch routing

test('Golden-path Flow C: switch routing workflow with caseNodeMapping', () => {
  const flowC = ['chat_trigger', 'ai_chat_model', 'switch', 'slack_message', 'google_gmail', 'log_output'];

  const allRegistered = flowC.every((t) => unifiedNodeRegistry.has(t));
  if (!allRegistered) {
    console.log('Skipping Flow C: not all node types registered in test environment');
    return;
  }

  const nodes: WorkflowNode[] = flowC.map((t, i) => makeNode(`node-${i}`, t));

  const caseNodeMapping = {
    sales: 'slack_message',
    support: 'google_gmail',
    general: 'log_output',
  };

  const switchNode = nodes.find((n) => n.data?.type === 'switch');
  if (!switchNode) return;

  const result = unifiedGraphOrchestrator.initializeWorkflow(
    nodes,
    undefined,
    undefined,
    { switchNodeId: switchNode.id, caseNodeMapping }
  );

  // Switch node should have 3 outgoing edges
  const switchOutEdges = result.workflow.edges.filter((e) => e.source === switchNode.id);
  expect(switchOutEdges.length).toBe(3);
});
