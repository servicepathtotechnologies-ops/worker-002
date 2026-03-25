import { describe, expect, it } from '@jest/globals';
import { unifiedGraphOrchestrator } from '../unified-graph-orchestrator';
import type { WorkflowNode } from '../../types/ai-types';

describe('validateWorkflow gmail extract_from_sheet hybrid hints', () => {
  it('warns when Gmail send uses extract_from_sheet without upstream google_sheets or inline spreadsheetId', () => {
    const nodes: WorkflowNode[] = [
      {
        id: 'trig_1',
        type: 'manual_trigger',
        data: {
          type: 'manual_trigger',
          label: 'Manual',
          category: 'triggers',
          config: {},
        },
      },
      {
        id: 'gmail_1',
        type: 'google_gmail',
        data: {
          type: 'google_gmail',
          label: 'Gmail',
          category: 'output',
          config: {
            operation: 'send',
            recipientSource: 'extract_from_sheet',
            subject: 'Hello',
            body: 'Body',
          },
        },
      },
    ];

    const { workflow, executionOrder } = unifiedGraphOrchestrator.initializeWorkflow(nodes);
    const validation = unifiedGraphOrchestrator.validateWorkflow(workflow, executionOrder);
    expect(validation.warnings.some((w) => w.includes('extract_from_sheet'))).toBe(true);
  });

  it('does not warn when an upstream google_sheets node precedes Gmail', () => {
    const nodes: WorkflowNode[] = [
      {
        id: 'trig_1',
        type: 'manual_trigger',
        data: {
          type: 'manual_trigger',
          label: 'Manual',
          category: 'triggers',
          config: {},
        },
      },
      {
        id: 'sheets_1',
        type: 'google_sheets',
        data: {
          type: 'google_sheets',
          label: 'Sheets',
          category: 'data',
          config: { spreadsheetId: 'abc', operation: 'read' },
        },
      },
      {
        id: 'gmail_1',
        type: 'google_gmail',
        data: {
          type: 'google_gmail',
          label: 'Gmail',
          category: 'output',
          config: {
            operation: 'send',
            recipientSource: 'extract_from_sheet',
            subject: 'Hello',
            body: 'Body',
          },
        },
      },
    ];

    const { workflow, executionOrder } = unifiedGraphOrchestrator.initializeWorkflow(nodes);
    const validation = unifiedGraphOrchestrator.validateWorkflow(workflow, executionOrder);
    expect(validation.warnings.some((w) => w.includes('extract_from_sheet'))).toBe(false);
  });
});
