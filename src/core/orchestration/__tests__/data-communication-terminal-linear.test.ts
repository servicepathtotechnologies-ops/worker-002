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

  it('allows sequential Gmail send, log, then list without blocking execution', () => {
    const wf = {
      nodes: [
        {
          id: 'manual-1',
          type: 'custom',
          position: { x: 0, y: 0 },
          data: { type: 'manual_trigger', label: 'Manual Test', config: {} },
        },
        {
          id: 'send-1',
          type: 'custom',
          position: { x: 200, y: 0 },
          data: { type: 'google_gmail', label: 'Gmail - Send Email', config: { operation: 'send' } },
        },
        {
          id: 'log-1',
          type: 'custom',
          position: { x: 400, y: 0 },
          data: { type: 'log_output', label: 'Log: Send Result', config: {} },
        },
        {
          id: 'list-1',
          type: 'custom',
          position: { x: 600, y: 0 },
          data: { type: 'google_gmail', label: 'Gmail - List Inbox', config: { operation: 'list', query: 'in:inbox' } },
        },
        {
          id: 'log-2',
          type: 'custom',
          position: { x: 800, y: 0 },
          data: { type: 'log_output', label: 'Log: List Result', config: {} },
        },
      ],
      edges: [
        { id: 'e1', source: 'manual-1', target: 'send-1' },
        { id: 'e2', source: 'send-1', target: 'log-1' },
        { id: 'e3', source: 'log-1', target: 'list-1' },
        { id: 'e4', source: 'list-1', target: 'log-2' },
      ],
    };

    const pipe = workflowValidationPipeline.validateWorkflow(wf as any);

    expect(pipe.valid).toBe(true);
    expect(pipe.errors).toHaveLength(0);

    const linearLayer = pipe.layerResults.get('linear-flow');
    expect(linearLayer?.valid).toBe(true);
    expect(linearLayer?.details?.orderViolations || []).toHaveLength(0);
  });
});
