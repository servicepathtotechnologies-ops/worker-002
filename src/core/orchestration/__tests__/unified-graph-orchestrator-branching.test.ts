import { describe, expect, it } from '@jest/globals';
import { unifiedGraphOrchestrator } from '../unified-graph-orchestrator';
import type { ExecutionOrder } from '../execution-order-manager';
import type { WorkflowNode } from '../../types/ai-types';

describe('unifiedGraphOrchestrator branch-aware reconciliation', () => {
  it('initializeWorkflow does not add main edge between exclusive if_else outputs (Gmail / Slack)', () => {
    const nodes: WorkflowNode[] = [
      {
        id: 'form_1',
        type: 'form',
        data: { type: 'form', label: 'Form', category: 'trigger', config: {} },
      },
      {
        id: 'if_1',
        type: 'if_else',
        data: { type: 'if_else', label: 'If/Else', category: 'logic', config: { conditions: [] } },
      },
      {
        id: 'gmail_1',
        type: 'google_gmail',
        data: { type: 'google_gmail', label: 'Gmail', category: 'communication', config: {} },
      },
      {
        id: 'slack_1',
        type: 'slack_message',
        data: { type: 'slack_message', label: 'Slack', category: 'communication', config: {} },
      },
    ];

    const explicitOrder: ExecutionOrder = {
      nodeIds: ['form_1', 'if_1', 'gmail_1', 'slack_1'],
      dependencies: new Map(),
      metadata: {
        triggerNodeId: 'form_1',
        terminalNodeIds: ['gmail_1', 'slack_1'],
        branchingNodeIds: ['if_1'],
        mergeNodeIds: [],
      },
    };

    const { workflow, executionOrder } = unifiedGraphOrchestrator.initializeWorkflow(nodes, explicitOrder);
    const cross = workflow.edges.filter(e => e.source === 'gmail_1' && e.target === 'slack_1');
    expect(cross.length).toBe(0);

    const slackIn = workflow.edges.filter(e => e.target === 'slack_1');
    expect(slackIn.length).toBe(1);
    expect(slackIn[0].source).toBe('if_1');

    const validation = unifiedGraphOrchestrator.validateWorkflow(workflow, executionOrder);
    expect(validation.valid).toBe(true);
  });
});
