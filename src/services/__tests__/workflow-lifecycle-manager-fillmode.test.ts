import { describe, expect, it } from '@jest/globals';
import { WorkflowLifecycleManager } from '../workflow-lifecycle-manager';

describe('workflow lifecycle manager fill-mode-aware missing inputs', () => {
  it('excludes required runtime_ai fields from missing input discovery', () => {
    const manager = new WorkflowLifecycleManager();
    const workflow: any = {
      nodes: [
        {
          id: 'node_text_summarizer_1',
          type: 'custom',
          data: {
            type: 'text_summarizer',
            label: 'Text Summarizer',
            config: {
              text: '',
              _fillMode: {
                text: 'runtime_ai',
              },
            },
          },
        },
      ],
      edges: [],
    };

    const result = manager.discoverNodeInputs(workflow);
    const hasTextInput = result.inputs.some(
      (i) => i.nodeId === 'node_text_summarizer_1' && i.fieldName === 'text'
    );

    expect(hasTextInput).toBe(false);
  });

  it('does not emit structural fields in missing input discovery', () => {
    const manager = new WorkflowLifecycleManager();
    const workflow: any = {
      nodes: [
        {
          id: 'form_1',
          type: 'custom',
          data: {
            type: 'form',
            label: 'Form',
            config: {
              fields: [],
            },
          },
        },
        {
          id: 'if_1',
          type: 'custom',
          data: {
            type: 'if_else',
            label: 'If',
            config: {
              conditions: [],
            },
          },
        },
      ],
      edges: [],
    };

    const result = manager.discoverNodeInputs(workflow);
    const structuralFields = result.inputs.filter((i) => i.fieldName === 'fields' || i.fieldName === 'conditions');
    expect(structuralFields.length).toBe(0);
  });

  it('does not emit fields from inactive operation branches', () => {
    const manager = new WorkflowLifecycleManager();
    const workflow: any = {
      nodes: [
        {
          id: 'gmail_1',
          type: 'custom',
          data: {
            type: 'google_gmail',
            label: 'Gmail',
            config: {
              operation: 'send',
            },
          },
        },
      ],
      edges: [],
    };

    const result = manager.discoverNodeInputs(workflow);
    const fieldNames = result.inputs.map((input) => input.fieldName);

    expect(fieldNames).not.toContain('messageId');
    expect(fieldNames).not.toContain('query');
    expect(fieldNames).not.toContain('from');
  });

  it('does not emit Gmail sheet fallback inputs for manual-recipient send', () => {
    const manager = new WorkflowLifecycleManager();
    const workflow: any = {
      nodes: [
        {
          id: 'gmail_1',
          type: 'custom',
          data: {
            type: 'google_gmail',
            label: 'Gmail',
            config: {
              operation: 'send',
              recipientSource: 'manual_entry',
              subject: '',
              body: '',
            },
          },
        },
      ],
      edges: [],
    };

    const result = manager.discoverNodeInputs(workflow);
    const fieldNames = result.inputs.map((input) => input.fieldName);

    expect(fieldNames).not.toContain('spreadsheetId');
    expect(fieldNames).not.toContain('sheetName');
    expect(fieldNames).not.toContain('range');
  });
});
