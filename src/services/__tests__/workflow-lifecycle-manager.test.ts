import { Workflow } from '../../core/types/ai-types';
import { workflowLifecycleManager } from '../workflow-lifecycle-manager';

describe('WorkflowLifecycleManager.discoverNodeInputs', () => {
  it('discovers spreadsheetId and sheetName for google_sheets nodes', () => {
    const workflow: Workflow = {
      nodes: [
        {
          id: 'sheets1',
          type: 'custom',
          position: { x: 0, y: 0 },
          data: {
            type: 'google_sheets',
            label: 'Read from Sheets',
            category: 'google',
            config: {
              operation: 'read',
            },
          },
        },
      ],
      edges: [],
    };

    const result = workflowLifecycleManager.discoverNodeInputs(workflow);
    const fields = result.inputs
      .filter(i => i.nodeId === 'sheets1')
      .map(i => i.fieldName)
      .sort();

    expect(fields).toContain('spreadsheetId');
    expect(fields).toContain('sheetName');
  });

  it('returns ownership metadata for discovered value fields', () => {
    const workflow: Workflow = {
      nodes: [
        {
          id: 'gmail1',
          type: 'custom',
          position: { x: 0, y: 0 },
          data: {
            type: 'google_gmail',
            label: 'Gmail',
            category: 'google',
            config: {
              operation: 'send',
            },
          },
        },
      ],
      edges: [],
    };

    const result = workflowLifecycleManager.discoverNodeInputs(workflow);
    const sample = result.inputs.find(i => i.nodeId === 'gmail1');
    expect(sample).toBeDefined();
    expect(sample?.ownership).toBe('value');
    expect(sample?.fillModeDefault).toBeDefined();
  });
});

