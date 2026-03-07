import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { Request, Response } from 'express';
import generateWorkflowHandler from '../generate-workflow';
import { workflowLifecycleManager } from '../../services/workflow-lifecycle-manager';
import { getReferenceBuilder, getMemoryManager } from '../../memory';
import { Workflow, WorkflowNode, WorkflowEdge } from '../../core/types/ai-types';

jest.mock('../../services/workflow-lifecycle-manager', () => ({
  workflowLifecycleManager: {
    generateWorkflowGraph: jest.fn(),
  },
}));

jest.mock('../../memory', () => ({
  getReferenceBuilder: jest.fn(),
  getMemoryManager: jest.fn(),
}));

describe('GenerateWorkflow + FixAgent integration (if_else normalization)', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;

  beforeEach(() => {
    jest.clearAllMocks();

    // Minimal broken workflow containing an if_else node with legacy condition
    const ifElseNode: WorkflowNode = {
      id: 'if1',
      type: 'custom',
      position: { x: 0, y: 0 },
      data: {
        label: 'If Else',
        type: 'if_else',
        category: 'logic',
        config: {
          // Legacy single-string condition (what FixAgent should normalize)
          condition: '$json.count > 0',
        },
      },
    };

    const workflow: Workflow = {
      nodes: [ifElseNode],
      edges: [] as WorkflowEdge[],
      metadata: {},
    };

    // Stub lifecycle manager to return our synthetic workflow
    (workflowLifecycleManager.generateWorkflowGraph as jest.Mock).mockResolvedValue({
      workflow,
      requiredCredentials: {
        requiredCredentials: [],
        missingCredentials: [],
        satisfiedCredentials: [],
        warnings: [],
      },
      requiredInputs: { inputs: [] },
      validation: {
        valid: true,
        errors: [],
        warnings: [],
        fixesApplied: [],
      },
      documentation: 'Test workflow',
      suggestions: [],
      estimatedComplexity: 'simple',
    });

    // Memory system mocks
    (getReferenceBuilder as jest.Mock).mockReturnValue({
      buildContext: jest.fn().mockResolvedValue({ similarPatterns: [] }),
    });

    (getMemoryManager as jest.Mock).mockReturnValue({
      storeWorkflow: jest.fn().mockResolvedValue('mem-1'),
    });

    mockRequest = {
      body: {
        prompt: 'test if_else auto-fix',
      },
      headers: {},
    };

    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
  });

  it('normalizes broken if_else condition via FixAgent and exposes fixAudit', async () => {
    await generateWorkflowHandler(mockRequest as Request, mockResponse as Response);

    expect(mockResponse.json).toHaveBeenCalledTimes(1);
    const payload = (mockResponse.json as jest.Mock).mock.calls[0][0];

    const nodes: WorkflowNode[] = payload.workflow.nodes;
    const ifNode = nodes.find((n) => n.id === 'if1')!;
    const cfg = ifNode.data.config as any;

    // Verify FixAgent normalized the condition into conditions array with wrapped expression
    expect(Array.isArray(cfg.conditions)).toBe(true);
    expect(cfg.conditions.length).toBeGreaterThan(0);
    expect(cfg.conditions[0].expression).toBe('{{$json.count > 0}}');

    // Verify fixAudit contains an if_else_normalization entry
    expect(Array.isArray(payload.fixAudit)).toBe(true);
    expect(
      payload.fixAudit.some(
        (entry: any) =>
          entry.rule === 'if_else_normalization' &&
          entry.nodeId === 'if1' &&
          entry.applied === true,
      ),
    ).toBe(true);

    // Confidence should be a valid number in [0,1]
    expect(typeof payload.fixConfidence).toBe('number');
    expect(payload.fixConfidence).toBeGreaterThanOrEqual(0);
    expect(payload.fixConfidence).toBeLessThanOrEqual(1);
  });
});

