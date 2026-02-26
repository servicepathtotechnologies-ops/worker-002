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

  it('does not add gmail messageId when operation is send', () => {
    const workflow: Workflow = {
      nodes: [
        {
          id: 'gmail1',
          type: 'custom',
          position: { x: 0, y: 0 },
          data: {
            type: 'google_gmail',
            label: 'Send Email',
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
    const gmailFields = result.inputs
      .filter(i => i.nodeId === 'gmail1')
      .map(i => i.fieldName);

    expect(gmailFields).toContain('to');
    expect(gmailFields).toContain('subject');
    expect(gmailFields).toContain('body');
    expect(gmailFields).not.toContain('messageId');
  });
}

