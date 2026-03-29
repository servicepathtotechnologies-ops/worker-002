/**
 * Property-Based Tests: Unified Graph Orchestrator
 * Feature: ai-workflow-generation-engine
 */

import * as fc from 'fast-check';
import { unifiedGraphOrchestrator } from '../unified-graph-orchestrator';
import { unifiedNodeRegistry } from '../../registry/unified-node-registry';
import { unifiedNormalizeNodeTypeString } from '../../utils/unified-node-type-normalizer';
import type { WorkflowNode } from '../../types/ai-types';
import type { CaseNodeMapping } from '../../types/unified-node-contract';

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

// ─── Property 15: Switch edges match case count ──────────────────────────────

// Feature: ai-workflow-generation-engine, Property 15: Switch edges match case count
test('Property 15: Switch edges match case count', () => {
  fc.assert(
    fc.property(
      // Generate 2–4 unique case values
      fc.uniqueArray(
        fc.string({ minLength: 2, maxLength: 12 }).filter(s => /^[a-z][a-z_]*$/.test(s)),
        { minLength: 2, maxLength: 4 }
      ),
      (uniqueCases) => {
        if (uniqueCases.length < 2) return;

        // Build downstream nodes — one per case, each with a unique ID
        // We use log_output as the type but give each a unique ID
        const downstreamNodes: WorkflowNode[] = uniqueCases.map((_, i) =>
          makeNode(`downstream-${i}`, 'log_output')
        );

        const allNodes: WorkflowNode[] = [
          makeNode('trigger-1', 'manual_trigger'),
          makeNode('switch-1', 'switch'),
          ...downstreamNodes,
        ];

        // Map each case value to the corresponding downstream node ID
        // The wireSwitchCaseEdges method resolves by nodeType, so we need to
        // ensure each downstream node has a unique type OR we test via node IDs.
        // Since the orchestrator maps by nodeType, use unique types for downstream.
        // For this test, we verify the count by checking the caseNodeMapping size
        // matches the outgoing edges from the switch node.
        const caseNodeMapping: CaseNodeMapping = {};
        uniqueCases.forEach((caseVal, i) => {
          caseNodeMapping[caseVal] = 'log_output'; // all map to log_output type
        });

        const result = unifiedGraphOrchestrator.initializeWorkflow(
          allNodes,
          undefined,
          undefined,
          { switchNodeId: 'switch-1', caseNodeMapping }
        );

        // Count outgoing edges from the switch node
        const switchOutEdges = result.workflow.edges.filter(
          (e) => e.source === 'switch-1'
        );

        // Each case should produce one outgoing edge
        expect(switchOutEdges.length).toBe(uniqueCases.length);
      }
    ),
    { numRuns: 100 }
  );
});

// ─── Property 31: Edge port names match registry outgoingPorts ───────────────

// Feature: ai-workflow-generation-engine, Property 31: Edge port names match registry outgoingPorts
test('Property 31: Edge port names match registry outgoingPorts for branching nodes', () => {
  const allTypes = unifiedNodeRegistry.getAllTypes();
  if (allTypes.length === 0) return;

  // Only test branching nodes that have declared outgoingPorts
  const branchingTypes = allTypes.filter((t) => {
    const def = unifiedNodeRegistry.get(t);
    return def?.isBranching && def.outgoingPorts && def.outgoingPorts.length > 0;
  });

  if (branchingTypes.length === 0) return;

  fc.assert(
    fc.property(
      fc.constantFrom(...branchingTypes),
      (branchingType) => {
        const def = unifiedNodeRegistry.get(branchingType);
        if (!def) return;

        const declaredPorts = new Set(def.outgoingPorts);

        // Build a minimal workflow with this branching node
        const nodes: WorkflowNode[] = [
          makeNode('trigger-1', 'manual_trigger'),
          makeNode('branch-1', branchingType),
          makeNode('output-1', 'log_output'),
        ];

        const result = unifiedGraphOrchestrator.initializeWorkflow(nodes);

        // All edges from the branching node must use declared port names
        const branchEdges = result.workflow.edges.filter((e) => e.source === 'branch-1');
        for (const edge of branchEdges) {
          const portLabel = (edge as any).type || (edge as any).sourceHandle;
          if (portLabel && portLabel !== 'default' && portLabel !== 'main') {
            expect(declaredPorts.has(portLabel)).toBe(true);
          }
        }
      }
    ),
    { numRuns: 100 }
  );
});

// ─── Property 32: alwaysTerminal nodes have out-degree 0 ────────────────────

// Feature: ai-workflow-generation-engine, Property 32: alwaysTerminal nodes have out-degree 0
test('Property 32: alwaysTerminal nodes have out-degree 0', () => {
  const terminalTypes = unifiedNodeRegistry.getAlwaysTerminalNodes().map((n) => n.type);
  if (terminalTypes.length === 0) return;

  fc.assert(
    fc.property(
      fc.constantFrom(...terminalTypes),
      (terminalType) => {
        const nodes: WorkflowNode[] = [
          makeNode('trigger-1', 'manual_trigger'),
          makeNode('terminal-1', terminalType),
        ];

        const result = unifiedGraphOrchestrator.initializeWorkflow(nodes);

        // Ensure terminal nodes are enforced
        const enforced = unifiedGraphOrchestrator.ensureTerminalNodes(result.workflow);

        const outgoingEdges = enforced.workflow.edges.filter(
          (e) => e.source === 'terminal-1'
        );
        expect(outgoingEdges.length).toBe(0);
      }
    ),
    { numRuns: 100 }
  );
});
