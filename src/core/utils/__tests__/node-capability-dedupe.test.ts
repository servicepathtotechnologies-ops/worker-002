import { describe, expect, it } from '@jest/globals';
import { getNodeCapabilityDedupeKey } from '../node-capability-dedupe';
import { unifiedGraphOrchestrator } from '../../orchestration/unified-graph-orchestrator';
import type { ExecutionOrder } from '../../orchestration/execution-order-manager';
import type { WorkflowNode } from '../../types/ai-types';

describe('getNodeCapabilityDedupeKey', () => {
  it('distinguishes branching if_else from ai_chat_model and ollama', () => {
    expect(getNodeCapabilityDedupeKey('if_else')).toBeNull();
    expect(getNodeCapabilityDedupeKey('switch')).toBeNull();
    expect(getNodeCapabilityDedupeKey('ai_chat_model')).toBe('ai_processing');
    expect(getNodeCapabilityDedupeKey('ollama')).toBe('ai_processing');
  });

  it('does not use the same key for if_else as for generic transformation', () => {
    expect(getNodeCapabilityDedupeKey('if_else')).not.toBe(
      getNodeCapabilityDedupeKey('javascript'),
    );
  });
});

describe('conditional branching fallback graph', () => {
  it('initializes a valid DAG with if_else and two terminals', () => {
    const nodes: WorkflowNode[] = [
      {
        id: 'trigger_1',
        type: 'manual_trigger',
        data: {
          label: 'Manual Trigger',
          type: 'manual_trigger',
          category: 'trigger',
          config: {},
        },
      },
      {
        id: 'if_else_1',
        type: 'if_else',
        data: {
          label: 'Condition',
          type: 'if_else',
          category: 'logic',
          config: {
            conditions: [],
            _fillMode: { conditions: 'runtime_ai' },
          },
        },
      },
      {
        id: 'log_true_1',
        type: 'log_output',
        data: {
          label: 'True',
          type: 'log_output',
          category: 'output',
          config: {},
        },
      },
      {
        id: 'log_false_1',
        type: 'log_output',
        data: {
          label: 'False',
          type: 'log_output',
          category: 'output',
          config: {},
        },
      },
    ];

    const explicitExecutionOrder: ExecutionOrder = {
      nodeIds: ['trigger_1', 'if_else_1', 'log_true_1', 'log_false_1'],
      dependencies: new Map(),
      metadata: {
        triggerNodeId: 'trigger_1',
        terminalNodeIds: ['log_true_1', 'log_false_1'],
        branchingNodeIds: ['if_else_1'],
        mergeNodeIds: [],
      },
    };

    const { workflow, executionOrder } = unifiedGraphOrchestrator.initializeWorkflow(nodes, explicitExecutionOrder);
    const validation = unifiedGraphOrchestrator.validateWorkflow(workflow, executionOrder);
    expect(workflow.edges.some((e) => e.source === 'if_else_1' && (e as { type?: string }).type === 'true')).toBe(
      true,
    );
    expect(workflow.edges.some((e) => e.source === 'if_else_1' && (e as { type?: string }).type === 'false')).toBe(
      true,
    );
    expect(validation.valid).toBe(true);
  });
});
