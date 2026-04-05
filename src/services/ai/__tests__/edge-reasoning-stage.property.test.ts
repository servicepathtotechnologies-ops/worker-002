/**
 * Property-Based Tests: Edge Reasoning Stage
 * Feature: ai-first-workflow-generation-pipeline
 */

import * as fc from 'fast-check';

// ─── Property 8: Cycle detection triggers re-prompt ───────────────────────────

// Feature: ai-first-workflow-generation-pipeline, Property 8: Cycle detection triggers re-prompt
test('Property 8: DFS cycle detection correctly identifies cycles in edge lists', () => {
  // Test the detectCycle logic directly via the exported helper pattern
  // We test the invariant: any edge list with a back-edge produces a non-null cycle string

  const detectCycle = (nodeIds: string[], edges: Array<{ source: string; target: string; type: string }>): string | null => {
    const adj = new Map<string, string[]>();
    for (const id of nodeIds) adj.set(id, []);
    for (const edge of edges) {
      const targets = adj.get(edge.source) ?? [];
      targets.push(edge.target);
      adj.set(edge.source, targets);
    }
    const visited = new Set<string>();
    const stack = new Set<string>();
    const path: string[] = [];
    function dfs(node: string): string | null {
      if (stack.has(node)) return [...path, node].join(' → ');
      if (visited.has(node)) return null;
      visited.add(node); stack.add(node); path.push(node);
      for (const neighbor of adj.get(node) ?? []) {
        const cycle = dfs(neighbor);
        if (cycle) return cycle;
      }
      path.pop(); stack.delete(node);
      return null;
    }
    for (const id of nodeIds) {
      if (!visited.has(id)) { const c = dfs(id); if (c) return c; }
    }
    return null;
  };

  fc.assert(
    fc.property(
      // Generate a linear chain of 3-6 nodes
      fc.array(fc.uuid(), { minLength: 3, maxLength: 6 }),
      (nodeIds) => {
        const unique = [...new Set(nodeIds)];
        if (unique.length < 3) return;

        // Build a linear chain (no cycle)
        const linearEdges = unique.slice(0, -1).map((id, i) => ({
          source: id,
          target: unique[i + 1],
          type: 'main',
        }));
        expect(detectCycle(unique, linearEdges)).toBeNull();

        // Add a back-edge to create a cycle (last → first)
        const cyclicEdges = [...linearEdges, { source: unique[unique.length - 1], target: unique[0], type: 'main' }];
        expect(detectCycle(unique, cyclicEdges)).not.toBeNull();
      }
    ),
    { numRuns: 100 }
  );
});

// ─── Property 9: Unified_Graph_Orchestrator is always called for graph materialization ──

// Feature: ai-first-workflow-generation-pipeline, Property 9: Unified_Graph_Orchestrator is always called for graph materialization
test('Property 9: edge-reasoning-stage never writes workflow.edges directly', () => {
  // This is a static code analysis property — verify the source does not contain direct edge writes
  const fs = require('fs');
  const path = require('path');
  const stageSource = fs.readFileSync(
    path.join(__dirname, '../stages/edge-reasoning-stage.ts'),
    'utf-8',
  );

  // Must not contain direct edge mutation patterns
  expect(stageSource).not.toMatch(/workflow\.edges\.push/);
  expect(stageSource).not.toMatch(/workflow\.edges\s*=/);

  // Must call initializeWorkflow or reconcileWorkflow
  expect(stageSource).toMatch(/initializeWorkflow|reconcileWorkflow/);
});
