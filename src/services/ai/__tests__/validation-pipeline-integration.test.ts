import { WorkflowValidationPipeline } from '../workflow-validation-pipeline';
import { Workflow } from '../../../core/types/ai-types';

describe('WorkflowValidationPipeline integration', () => {
  test('passes for workflow with custom nodes using node.data.nodeType', () => {
    const workflow: Workflow = {
      id: 'wf_test_custom_node',
      name: 'custom node test',
      nodes: [
        {
          id: 't1',
          type: 'custom', // Frontend uses 'custom' type
          position: { x: 0, y: 0 },
          data: {
            type: 'custom',
            nodeType: 'manual_trigger', // Actual type in nodeType field
            label: 'Manual Trigger',
            category: 'trigger',
            config: {},
          },
        },
        {
          id: 'a1',
          type: 'custom',
          position: { x: 200, y: 0 },
          data: {
            type: 'custom',
            nodeType: 'ollama', // Actual type in nodeType field
            label: 'Ollama',
            category: 'ai',
            config: {},
          },
        },
        {
          id: 's1',
          type: 'custom',
          position: { x: 400, y: 0 },
          data: {
            type: 'custom',
            nodeType: 'airtable', // Actual type in nodeType field
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
          target: 'a1',
          type: 'default',
          sourceHandle: 'output',
          targetHandle: 'input',
        },
        {
          id: 'e2',
          source: 'a1',
          target: 's1',
          type: 'default',
          sourceHandle: 'output',
          targetHandle: 'input',
        },
      ],
    };

    const pipeline = new WorkflowValidationPipeline();
    const result = pipeline.validate(workflow, {
      originalPrompt: 'test workflow',
      structuredIntent: {
        trigger: 'manual',
        actions: ['ollama', 'airtable'],
        dataSources: [],
        transformations: [],
      },
    });

    // Should pass all validation layers
    expect(result.valid).toBe(true);
    expect(result.errors.length).toBe(0);
  });
});
