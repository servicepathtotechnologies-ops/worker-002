import { validateFinalWorkflow } from '../final-workflow-validator';
import { Workflow } from '../../../core/types/ai-types';

describe('FinalWorkflowValidator terminal sink behavior', () => {
  test('allows workflows to terminate at write-capable sinks like airtable (no "not connected to any output")', () => {
    const workflow: Workflow = {
      id: 'wf_test_terminal_sink',
      name: 'terminal sink workflow',
      nodes: [
        {
          id: 't1',
          type: 'manual_trigger',
          position: { x: 0, y: 0 },
          data: { type: 'manual_trigger', label: 'Manual Trigger', category: 'trigger', config: {} },
        },
        {
          id: 'm1',
          type: 'ollama',
          position: { x: 200, y: 0 },
          data: { type: 'ollama', label: 'Ollama', category: 'ai', config: {} },
        },
        {
          id: 's1',
          type: 'airtable',
          position: { x: 400, y: 0 },
          data: {
            type: 'airtable',
            label: 'Airtable',
            category: 'database',
            config: { operation: 'create' },
          },
        },
      ],
      edges: [
        {
          id: 'e1',
          source: 't1',
          target: 'm1',
          type: 'default',
          sourceHandle: 'output',
          targetHandle: 'input',
        },
        {
          id: 'e2',
          source: 'm1',
          target: 's1',
          type: 'default',
          sourceHandle: 'output',
          targetHandle: 'input',
        },
      ],
    };

    const result = validateFinalWorkflow(workflow, 'store to CRM');
    expect(result.valid).toBe(true);
    expect(result.errors.join(' | ')).not.toMatch(/airtable.*not connected to any output/i);
  });
});

