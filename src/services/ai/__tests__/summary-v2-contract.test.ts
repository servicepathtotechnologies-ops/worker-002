import { describe, expect, it } from '@jest/globals';
import { compileSummaryV2FromWorkflow } from '../summary-v2-compiler';
import { validateSummaryV2 } from '../../../core/validation/summary-v2-validator';
import type { Workflow } from '../../../core/types/ai-types';

describe('summaryV2 compiler and contract', () => {
  it('compiles nested branching workflow with branch paths and valid contract', () => {
    const workflow: Workflow = {
      nodes: [
        { id: 'n1', type: 'manual_trigger', data: { label: 'Manual Trigger', type: 'manual_trigger', category: 'trigger', config: {} } },
        { id: 'n2', type: 'switch', data: { label: 'Switch', type: 'switch', category: 'logic', config: { cases: [{ value: 'success' }, { value: 'failed' }] } } },
        { id: 'n3', type: 'if_else', data: { label: 'If Else', type: 'if_else', category: 'logic', config: {} } },
        { id: 'n4', type: 'google_gmail', data: { label: 'Gmail', type: 'google_gmail', category: 'output', config: {} } },
        { id: 'n5', type: 'slack_message', data: { label: 'Slack', type: 'slack_message', category: 'output', config: {} } },
        { id: 'n6', type: 'log_output', data: { label: 'Log', type: 'log_output', category: 'output', config: {} } },
      ],
      edges: [
        { id: 'e1', source: 'n1', target: 'n2' },
        { id: 'e2', source: 'n2', target: 'n3', branchName: 'success' },
        { id: 'e3', source: 'n2', target: 'n5', branchName: 'failed' },
        { id: 'e4', source: 'n3', target: 'n4', sourceHandle: 'true' },
        { id: 'e5', source: 'n3', target: 'n6', sourceHandle: 'false' },
      ],
    };

    const summaryV2 = compileSummaryV2FromWorkflow(workflow, 'route payment outcomes');
    const validation = validateSummaryV2(summaryV2);

    expect(validation.valid).toBe(true);
    expect(summaryV2.graphOverview.hasBranching).toBe(true);
    expect(summaryV2.branches.length).toBeGreaterThan(0);
    expect(summaryV2.pathOutcomes.length).toBeGreaterThan(1);
  });
});

