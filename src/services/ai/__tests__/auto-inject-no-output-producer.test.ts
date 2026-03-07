import { productionWorkflowBuilder } from '../production-workflow-builder';
import { Workflow } from '../../../core/types/ai-types';

describe('ProductionWorkflowBuilder auto-injection', () => {
  test('does not create output→producer edges when injecting http_request', async () => {
    // Create a workflow that already has an output node (google_gmail)
    const workflow: Workflow = {
      id: 'wf_test_auto_inject',
      name: 'auto inject test',
      nodes: [
        {
          id: 't1',
          type: 'manual_trigger',
          position: { x: 0, y: 0 },
          data: { type: 'manual_trigger', label: 'Manual Trigger', category: 'trigger', config: {} },
        },
        {
          id: 'o1',
          type: 'google_gmail',
          position: { x: 200, y: 0 },
          data: { type: 'google_gmail', label: 'Gmail', category: 'output', config: {} },
        },
      ],
      edges: [
        {
          id: 'e1',
          source: 't1',
          target: 'o1',
          type: 'default',
          sourceHandle: 'output',
          targetHandle: 'input',
        },
      ],
    };

    // Attempt to inject http_request (a producer/data_source)
    // Note: This test verifies the internal injectMissingNodes logic indirectly
    // by checking that the final workflow doesn't have output→producer edges
    const missingNodes = ['http_request'];
    const mockDSL = { dataSources: [], transformations: [], outputs: [] };
    const mockIntent = {
      trigger: 'manual',
      actions: ['google_gmail'],
      dataSources: ['http_request'],
      transformations: [],
    };
    const result = productionWorkflowBuilder['injectMissingNodes'](
      workflow,
      missingNodes,
      mockDSL as any,
      mockIntent as any,
      'test prompt'
    );

    expect(result.success).toBe(true);
    expect(result.workflow).toBeDefined();

    // Find the injected http_request node
    const httpRequestNode = result.workflow!.nodes.find(n => n.type === 'http_request');
    expect(httpRequestNode).toBeDefined();

    // Verify no edge exists from google_gmail (output) → http_request (producer)
    const outputToProducerEdge = result.workflow!.edges.find(
      e => e.source === 'o1' && e.target === httpRequestNode!.id
    );
    expect(outputToProducerEdge).toBeUndefined();

    // Verify http_request is connected to trigger (upstream), not output (downstream)
    const triggerToProducerEdge = result.workflow!.edges.find(
      e => e.source === 't1' && e.target === httpRequestNode!.id
    );
    expect(triggerToProducerEdge).toBeDefined();
  });
});
