/**
 * Class-level regression: data → communication → terminal (registry predicates, no prompt strings).
 * Ensures plan-driven linear chains stay connected from trigger through validation pipeline.
 */

import { describe, expect, it } from '@jest/globals';
import { buildWorkflowFromPlanChain } from '../../../services/ai/plan-driven-workflow-builder';
import { unifiedGraphOrchestrator } from '../unified-graph-orchestrator';
import { workflowValidationPipeline } from '../../../services/ai/workflow-validation-pipeline';
import { isTriggerNode } from '../../utils/universal-node-type-checker';

function reachableFromTrigger(workflow: { nodes: { id: string }[]; edges: { source: string; target: string }[] }) {
  const trigger = workflow.nodes.find((n) => isTriggerNode(n as any));
  if (!trigger) return new Set<string>();
  const out = new Map<string, string[]>();
  for (const e of workflow.edges) {
    if (!out.has(e.source)) out.set(e.source, []);
    out.get(e.source)!.push(e.target);
  }
  const visited = new Set<string>([trigger.id]);
  const q = [trigger.id];
  while (q.length) {
    const id = q.shift()!;
    for (const t of out.get(id) || []) {
      if (!visited.has(t)) {
        visited.add(t);
        q.push(t);
      }
    }
  }
  return visited;
}

describe('data → communication → terminal (linear class)', () => {
  const linearChains: string[][] = [
    ['manual_trigger', 'google_sheets', 'google_gmail', 'log_output'],
    ['manual_trigger', 'database_read', 'google_gmail', 'log_output'],
    ['manual_trigger', 'google_sheets', 'text_summarizer', 'google_gmail', 'log_output'],
  ];

  for (const chain of linearChains) {
    it(`passes orchestrator + pipeline + reachability for ${chain.join(' → ')}`, () => {
      const result = buildWorkflowFromPlanChain(chain);
      expect(result.success).toBe(true);
      const wf = result.workflow!;

      const orch = unifiedGraphOrchestrator.validateWorkflow(wf);
      expect(orch.valid).toBe(true);

      const pipe = workflowValidationPipeline.validateWorkflow(wf);
      expect(pipe.valid).toBe(true);

      const visited = reachableFromTrigger(wf);
      for (const n of wf.nodes) {
        expect(visited.has(n.id)).toBe(true);
      }
    });
  }
});
