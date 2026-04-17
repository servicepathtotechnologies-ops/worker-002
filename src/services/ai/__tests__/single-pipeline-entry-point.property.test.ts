/**
 * Property 19: Single pipeline entry point — no dual paths
 *
 * Feature: intelligent-workflow-generation-pipeline
 * Property 19: generate-workflow.ts invokes WorkflowGenerationPipeline directly —
 *   no feature flag check, no conditional branching, no fallback to AiFirstPipeline.
 *
 * Validates: Requirements 9.1, 9.3, 6.5
 */

import * as fs from 'fs';
import * as path from 'path';
import { Request, Response } from 'express';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeReq(body: Record<string, unknown>): Request {
  return { body } as unknown as Request;
}

function makeRes(): { res: Response; json: jest.Mock; status: jest.Mock } {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const res = { json, status } as unknown as Response;
  return { res, json, status };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Property 19: Single pipeline entry point — no dual paths', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  it('invokes WorkflowGenerationPipeline.run for every generation request', async () => {
    // Feature: intelligent-workflow-generation-pipeline, Property 19: Single pipeline entry point — no dual paths
    const mockRun = jest.fn().mockResolvedValue({
      ok: true,
      workflow: { nodes: [], edges: [] },
      validationIssues: [],
      stageTrace: [],
    });

    class MockWorkflowGenerationPipeline { run = mockRun; }
    jest.doMock('../pipeline/workflow-generation-pipeline', () => ({
      WorkflowGenerationPipeline: MockWorkflowGenerationPipeline,
    }));

    const { default: generateWorkflow } = await import('../../../api/generate-workflow');
    const req = makeReq({ prompt: 'send me an email every morning' });
    const { res, json } = makeRes();

    await generateWorkflow(req, res);

    expect(mockRun).toHaveBeenCalledTimes(1);
    expect(mockRun).toHaveBeenCalledWith(
      expect.objectContaining({ userPrompt: 'send me an email every morning' }),
    );
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });

  it('never references WorkflowPipelineOrchestrator', () => {
    // Feature: ai-first-workflow-generation-pipeline, Property 19: Single pipeline entry point — no dual paths
    const filePath = path.resolve(__dirname, '../../../api/generate-workflow.ts');
    const source = fs.readFileSync(filePath, 'utf-8');

    expect(source).not.toContain('WorkflowPipelineOrchestrator');
    expect(source).not.toContain('workflowPipelineOrchestrator');
    expect(source).not.toContain('ENABLE_AI_FIRST_PIPELINE');
    expect(source).not.toContain('handlePhasedRefine');
  });

  it('never references the old hybrid pipeline orchestrator', () => {
    // Feature: intelligent-workflow-generation-pipeline, Property 19: Single pipeline entry point — no dual paths
    const filePath = path.resolve(__dirname, '../../../api/generate-workflow.ts');
    const source = fs.readFileSync(filePath, 'utf-8');

    // Must import WorkflowGenerationPipeline
    expect(source).toContain('WorkflowGenerationPipeline');
    // Must not have conditional branching on a feature flag
    expect(source).not.toMatch(/if\s*\(.*ENABLE_AI_FIRST/);
    expect(source).not.toMatch(/process\.env\.ENABLE_AI_FIRST/);
    // Must not import AiFirstPipeline directly
    expect(source).not.toContain("from '../services/ai/ai-first-pipeline'");
  });

  it('returns success:true with workflow on successful pipeline run', async () => {
    // Feature: intelligent-workflow-generation-pipeline, Property 19: Single pipeline entry point — no dual paths
    const fakeWorkflow = { nodes: [{ id: 'n1', type: 'manual_trigger' }], edges: [] };
    const mockRun = jest.fn().mockResolvedValue({
      ok: true,
      workflow: fakeWorkflow,
      validationIssues: [],
      stageTrace: [{ stage: 'intent', durationMs: 100 }],
    });

    class MockWorkflowGenerationPipeline { run = mockRun; }
    jest.doMock('../pipeline/workflow-generation-pipeline', () => ({
      WorkflowGenerationPipeline: MockWorkflowGenerationPipeline,
    }));

    const { default: generateWorkflow } = await import('../../../api/generate-workflow');
    const req = makeReq({ prompt: 'notify me on slack when a form is submitted' });
    const { res, json } = makeRes();

    await generateWorkflow(req, res);

    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        workflow: fakeWorkflow,
        validationIssues: [],
      }),
    );
  });

  it('returns 422 with error code when pipeline fails', async () => {
    // Feature: intelligent-workflow-generation-pipeline, Property 19: Single pipeline entry point — no dual paths
    const mockRun = jest.fn().mockResolvedValue({
      ok: false,
      code: 'NO_VALID_NODES',
      message: 'No valid nodes found',
      stageTrace: [],
    });

    class MockWorkflowGenerationPipeline { run = mockRun; }
    jest.doMock('../pipeline/workflow-generation-pipeline', () => ({
      WorkflowGenerationPipeline: MockWorkflowGenerationPipeline,
    }));

    const { default: generateWorkflow } = await import('../../../api/generate-workflow');
    const req = makeReq({ prompt: 'do something' });
    const { res, status } = makeRes();

    await generateWorkflow(req, res);

    expect(status).toHaveBeenCalledWith(422);
  });

  it('returns 400 when prompt is missing', async () => {
    // Feature: intelligent-workflow-generation-pipeline, Property 19: Single pipeline entry point — no dual paths
    class MockWorkflowGenerationPipeline { run = jest.fn(); }
    jest.doMock('../pipeline/workflow-generation-pipeline', () => ({
      WorkflowGenerationPipeline: MockWorkflowGenerationPipeline,
    }));

    const { default: generateWorkflow } = await import('../../../api/generate-workflow');
    const req = makeReq({});
    const { res, status } = makeRes();

    await generateWorkflow(req, res);

    expect(status).toHaveBeenCalledWith(400);
  });
});
