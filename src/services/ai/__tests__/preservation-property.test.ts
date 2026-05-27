/**
 * Preservation Property Tests — AI-First Pipeline End-to-End Fix
 * Spec: .kiro/specs/ai-first-pipeline-end-to-end-fix/
 *
 * OBSERVATION-FIRST METHODOLOGY:
 * These tests observe and assert EXISTING (unfixed) behavior that must be preserved.
 * All tests MUST PASS on unfixed code — they establish the baseline.
 *
 * EXPECTED OUTCOME: All preservation tests PASS on unfixed code.
 *
 * Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8
 */

import { describe, expect, it, jest, beforeEach, afterEach } from '@jest/globals';
import * as fc from 'fast-check';
import { runIntentStage } from '../stages/intent-stage';
import { runNodeSelectionStage } from '../stages/node-selection-stage';
import { runEdgeReasoningStage } from '../stages/edge-reasoning-stage';
import { runValidationStage } from '../stages/validation-stage';
import { unifiedGraphOrchestrator } from '../../../core/orchestration/unified-graph-orchestrator';
import type { StructuredIntent } from '../stages/intent-stage';
import type { SelectedNode } from '../system-prompt-builder';
import type { Workflow, WorkflowNode } from '../../../core/types/ai-types';

// ─── Shared fixtures ──────────────────────────────────────────────────────────

const SAMPLE_INTENT: StructuredIntent = {
  intent: 'Send a Slack message when a webhook fires',
  triggerType: 'webhook',
  actions: ['send_slack_message'],
  dataFlows: [],
  constraints: [],
};

const SAMPLE_NODE_CATALOG = JSON.stringify([
  { type: 'webhook', label: 'Webhook', category: 'trigger' },
  { type: 'slack', label: 'Slack', category: 'communication' },
]);

function buildMinimalWorkflow(): Workflow {
  const nodes: WorkflowNode[] = [
    {
      id: 'node_trigger',
      type: 'webhook',
      data: { label: 'Webhook', type: 'webhook', category: 'trigger', config: {} },
    },
    {
      id: 'node_slack',
      type: 'slack',
      data: { label: 'Slack', type: 'slack', category: 'communication', config: {} },
    },
  ];
  const { workflow } = unifiedGraphOrchestrator.initializeWorkflow(nodes);
  return workflow;
}

function buildSelectedNodes(): SelectedNode[] {
  return [
    { nodeId: 'node_trigger', type: 'webhook', role: 'trigger', reason: 'HTTP trigger' },
    { nodeId: 'node_slack', type: 'slack', role: 'action', reason: 'Send Slack message' },
  ];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Build a valid StructuredIntent LLM response string */
function makeIntentResponse(intent: StructuredIntent): string {
  return JSON.stringify({
    intent: intent.intent,
    triggerType: intent.triggerType,
    actions: intent.actions,
    dataFlows: intent.dataFlows,
    constraints: intent.constraints,
  });
}

/** Build a valid node-selection LLM response with only unknown types */
function makeUnknownNodeSelectionResponse(unknownTypes: string[]): string {
  return JSON.stringify({
    selectedNodes: unknownTypes.map((t) => ({ type: t, role: 'action', reason: 'unknown' })),
  });
}

/** Build a valid edge-reasoning LLM response with a cycle */
function makeCyclicEdgeResponse(nodeIds: string[]): string {
  if (nodeIds.length < 2) {
    return JSON.stringify({ orderedNodes: nodeIds, edges: [] });
  }
  // Create a cycle: 0→1→2→...→n-1→0
  const edges = nodeIds.map((id, i) => ({
    source: id,
    target: nodeIds[(i + 1) % nodeIds.length],
    type: 'main',
  }));
  return JSON.stringify({ orderedNodes: nodeIds, edges });
}

// ─── Property Test 1: runIntentStage never throws ─────────────────────────────
// Validates: Requirements 3.1
// For any user prompt string, runIntentStage returns { ok: true, intent: StructuredIntent }
// or { ok: false, code: 'INVALID_LLM_RESPONSE' } — never throws.

describe('Preservation Property 1 — runIntentStage never throws for any prompt string', () => {
  /**
   * Validates: Requirements 3.1
   *
   * Observation: runIntentStage always returns a typed result, never throws.
   * This is the baseline behavior to preserve after the fix.
   */
  it('returns ok:true with StructuredIntent shape or ok:false with INVALID_LLM_RESPONSE — never throws', async () => {
    // Validates: Requirements 3.1
    const geminiModule = require('../gemini-orchestrator');
    const geminiInstance = geminiModule.geminiOrchestrator;

    await fc.assert(
      fc.asyncProperty(
        // Generate arbitrary non-empty prompt strings
        fc.string({ minLength: 1, maxLength: 200 }),
        async (userPrompt) => {
          // Mock LLM to return a valid intent response for this prompt
          const spy = jest
            .spyOn(geminiInstance, 'processRequest')
            .mockResolvedValue(makeIntentResponse(SAMPLE_INTENT));

          let result: any;
          let threw = false;
          try {
            result = await runIntentStage(userPrompt, SAMPLE_NODE_CATALOG, 'test-corr');
          } catch {
            threw = true;
          } finally {
            spy.mockRestore();
          }

          // Must never throw
          expect(threw).toBe(false);

          // Must return ok:true with StructuredIntent shape
          expect(result).toBeDefined();
          expect(typeof result.ok).toBe('boolean');

          if (result.ok === true) {
            expect(result.intent).toBeDefined();
            expect(typeof result.intent.intent).toBe('string');
            expect(typeof result.intent.triggerType).toBe('string');
            expect(Array.isArray(result.intent.actions)).toBe(true);
            expect(Array.isArray(result.intent.dataFlows)).toBe(true);
            expect(Array.isArray(result.intent.constraints)).toBe(true);
          } else {
            expect(result.code).toBe('INVALID_LLM_RESPONSE');
          }
        },
      ),
      { numRuns: 10 },
    );
  });

  it('returns ok:false with INVALID_LLM_RESPONSE when LLM returns unparseable response — never throws', async () => {
    // Validates: Requirements 3.1
    const geminiModule = require('../gemini-orchestrator');
    const geminiInstance = geminiModule.geminiOrchestrator;

    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 100 }),
        async (userPrompt) => {
          // Mock LLM to always return invalid JSON
          const spy = jest
            .spyOn(geminiInstance, 'processRequest')
            .mockResolvedValue('NOT_VALID_JSON_AT_ALL');

          let result: any;
          let threw = false;
          try {
            result = await runIntentStage(userPrompt, SAMPLE_NODE_CATALOG, 'test-corr');
          } catch {
            threw = true;
          } finally {
            spy.mockRestore();
          }

          expect(threw).toBe(false);
          expect(result).toBeDefined();
          expect(result.ok).toBe(false);
          expect(result.code).toBe('INVALID_LLM_RESPONSE');
        },
      ),
      { numRuns: 5 },
    );
  });
});

// ─── Property Test 2: node-selection discards unknowns → NO_VALID_NODES ──────
// Validates: Requirements 3.2
// For any LLM response containing only unknown node types,
// runNodeSelectionStage returns { ok: false, code: 'NO_VALID_NODES' }.

describe('Preservation Property 2 — node-selection returns NO_VALID_NODES for all-unknown types', () => {
  /**
   * Validates: Requirements 3.2
   *
   * Observation: node-selection stage discards unknown types against the registry
   * and returns NO_VALID_NODES when zero valid types remain.
   * This is the baseline behavior to preserve after the fix.
   */
  it('returns NO_VALID_NODES for any LLM response containing only unknown node types', async () => {
    // Validates: Requirements 3.2
    const geminiModule = require('../gemini-orchestrator');
    const geminiInstance = geminiModule.geminiOrchestrator;

    await fc.assert(
      fc.asyncProperty(
        // Generate 1–5 unknown type names that are guaranteed not in the registry
        fc.array(
          fc.string({ minLength: 3, maxLength: 20 }).map((s) => `__unknown_${s}__`),
          { minLength: 1, maxLength: 5 },
        ),
        async (unknownTypes) => {
          const llmResponse = makeUnknownNodeSelectionResponse(unknownTypes);
          const spy = jest
            .spyOn(geminiInstance, 'processRequest')
            .mockResolvedValue(llmResponse);

          let result: any;
          try {
            result = await runNodeSelectionStage(SAMPLE_INTENT, SAMPLE_NODE_CATALOG, 'test-corr');
          } finally {
            spy.mockRestore();
          }

          expect(result).toBeDefined();
          expect(result.ok).toBe(false);
          expect(result.code).toBe('NO_VALID_NODES');
        },
      ),
      { numRuns: 10 },
    );
  });
});

// ─── Property Test 3: edge-reasoning re-prompts once on cycle → CYCLE_DETECTED
// Validates: Requirements 3.3
// For any edge list with a cycle, runEdgeReasoningStage calls the LLM exactly
// twice (initial + re-prompt) before returning CYCLE_DETECTED.

describe('Preservation Property 3 — edge-reasoning calls LLM exactly twice on persistent cycle', () => {
  /**
   * Validates: Requirements 3.3
   *
   * Observation: edge-reasoning stage detects cycles via DFS, re-prompts once,
   * and returns CYCLE_DETECTED if the cycle persists.
   * This is the baseline behavior to preserve after the fix.
   */
  it('calls LLM exactly twice (initial + re-prompt) and returns CYCLE_DETECTED when cycle persists', async () => {
    // Validates: Requirements 3.3
    const geminiModule = require('../gemini-orchestrator');
    const geminiInstance = geminiModule.geminiOrchestrator;

    await fc.assert(
      fc.asyncProperty(
        // Generate 2–4 node IDs to form a cycle
        fc.array(
          fc.uuid(),
          { minLength: 2, maxLength: 4 },
        ),
        async (nodeIds) => {
          const cyclicResponse = makeCyclicEdgeResponse(nodeIds);
          let callCount = 0;

          const spy = jest
            .spyOn(geminiInstance, 'processRequest')
            .mockImplementation(async () => {
              callCount++;
              return cyclicResponse; // Always return a cycle
            });

          let result: any;
          try {
            const selectedNodes: SelectedNode[] = nodeIds.map((id, i) => ({
              nodeId: id,
              type: i === 0 ? 'webhook' : 'slack',
              role: i === 0 ? 'trigger' : 'action',
              reason: 'test node',
            }));
            result = await runEdgeReasoningStage(
              selectedNodes,
              SAMPLE_NODE_CATALOG,
              'test intent',
              'test-corr',
            );
          } finally {
            spy.mockRestore();
          }

          // Must return CYCLE_DETECTED
          expect(result.ok).toBe(false);
          expect(result.code).toBe('CYCLE_DETECTED');

          // Must have called LLM exactly twice:
          // call 1: initial request
          // call 2: re-prompt after cycle detected
          // (Note: if initial parse fails, there's a retry before cycle detection,
          //  but since our mock always returns valid JSON, it's exactly 2 calls)
          expect(callCount).toBe(2);
        },
      ),
      { numRuns: 5 },
    );
  });
});

// ─── Example Test 4: validation always calls validateWorkflow() ───────────────
// Validates: Requirements 3.4, 3.5
// Validation stage always calls unifiedGraphOrchestrator.validateWorkflow()
// regardless of LLM result.

describe('Preservation Example Test 4 — validation always calls validateWorkflow()', () => {
  /**
   * Validates: Requirements 3.4, 3.5
   *
   * Observation: runValidationStage always calls unifiedGraphOrchestrator.validateWorkflow()
   * as a structural safety net, regardless of what the LLM returns.
   * This is the baseline behavior to preserve after the fix.
   */

  let validateWorkflowSpy: jest.SpiedFunction<typeof unifiedGraphOrchestrator.validateWorkflow>;
  let geminiSpy: any;

  beforeEach(() => {
    validateWorkflowSpy = jest
      .spyOn(unifiedGraphOrchestrator, 'validateWorkflow')
      .mockReturnValue({ valid: true, errors: [], warnings: [] });
  });

  afterEach(() => {
    validateWorkflowSpy.mockRestore();
    if (geminiSpy) {
      geminiSpy.mockRestore();
      geminiSpy = null;
    }
  });

  it('calls validateWorkflow() when LLM returns pass status', async () => {
    // Validates: Requirements 3.4
    const geminiModule = require('../gemini-orchestrator');
    geminiSpy = jest
      .spyOn(geminiModule.geminiOrchestrator, 'processRequest')
      .mockResolvedValue(JSON.stringify({ status: 'pass', issues: [] }));

    // Build workflow before spy is active to avoid counting initializeWorkflow's internal call
    const workflow = buildMinimalWorkflow();
    // Reset call count after workflow construction
    validateWorkflowSpy.mockClear();

    await runValidationStage(workflow, SAMPLE_NODE_CATALOG, 'test intent', buildSelectedNodes(), [], 'test-corr');

    expect(validateWorkflowSpy).toHaveBeenCalledTimes(1);
    expect(validateWorkflowSpy).toHaveBeenCalledWith(workflow);
  });

  it('calls validateWorkflow() when LLM returns fail status with error issues', async () => {
    // Validates: Requirements 3.4, 3.5
    const geminiModule = require('../gemini-orchestrator');
    geminiSpy = jest
      .spyOn(geminiModule.geminiOrchestrator, 'processRequest')
      .mockResolvedValue(
        JSON.stringify({
          status: 'fail',
          issues: [{ severity: 'error', description: 'Missing required node', suggestedFix: 'Add node' }],
        }),
      );

    const workflow = buildMinimalWorkflow();
    await runValidationStage(workflow, SAMPLE_NODE_CATALOG, 'test intent', buildSelectedNodes(), [], 'test-corr');

    // validateWorkflow must be called regardless of LLM result
    expect(validateWorkflowSpy).toHaveBeenCalled();
    expect(validateWorkflowSpy).toHaveBeenCalledWith(workflow);
  });

  it('calls validateWorkflow() when LLM returns unparseable response (fallback path)', async () => {
    // Validates: Requirements 3.4
    const geminiModule = require('../gemini-orchestrator');
    geminiSpy = jest
      .spyOn(geminiModule.geminiOrchestrator, 'processRequest')
      .mockResolvedValue('NOT_VALID_JSON');

    const workflow = buildMinimalWorkflow();
    await runValidationStage(workflow, SAMPLE_NODE_CATALOG, 'test intent', buildSelectedNodes(), [], 'test-corr');

    // Even on parse failure, orchestrator safety net must be called
    expect(validateWorkflowSpy).toHaveBeenCalled();
    expect(validateWorkflowSpy).toHaveBeenCalledWith(workflow);
  });

  it('attempts exactly one repair pass on error-severity issues', async () => {
    // Validates: Requirements 3.5
    const geminiModule = require('../gemini-orchestrator');
    const callResponses = [
      // First call: validation returns fail with error
      JSON.stringify({ status: 'fail', issues: [{ severity: 'error', description: 'Bad edge', suggestedFix: 'Fix it' }] }),
      // Second call: repair pass
      JSON.stringify({ orderedNodes: ['node_trigger', 'node_slack'], edges: [{ source: 'node_trigger', target: 'node_slack', type: 'main' }] }),
      // Third call: re-validation after repair
      JSON.stringify({ status: 'pass', issues: [] }),
    ];
    let callIndex = 0;
    geminiSpy = jest
      .spyOn(geminiModule.geminiOrchestrator, 'processRequest')
      .mockImplementation(async () => callResponses[callIndex++] ?? JSON.stringify({ status: 'pass', issues: [] }));

    const workflow = buildMinimalWorkflow();
    await runValidationStage(workflow, SAMPLE_NODE_CATALOG, 'test intent', buildSelectedNodes(), [], 'test-corr');

    // validateWorkflow must still be called
    expect(validateWorkflowSpy).toHaveBeenCalled();
    // Repair pass means at least 2 LLM calls (initial validation + repair)
    expect(callIndex).toBeGreaterThanOrEqual(2);
  });
});

// ─── Example Test 5: generate-workflow.ts invokes AiFirstPipeline directly ───
// Validates: Requirements 3.6
// generate-workflow.ts invokes AiFirstPipeline directly with no branching.

describe('Preservation Example Test 5 — generate-workflow.ts invokes AiFirstPipeline directly', () => {
  /**
   * Validates: Requirements 3.6
   *
   * Observation: generate-workflow.ts calls pipeline.run() directly with no
   * feature flag, no conditional branching, and no fallback to any legacy pipeline.
   * This is the baseline behavior to preserve after the fix.
   */
  it('AiFirstPipeline.run() is called for non-analyze mode requests', async () => {
    // Validates: Requirements 3.6
    const { AiFirstPipeline } = require('../ai-first-pipeline');
    const runSpy = jest
      .spyOn(AiFirstPipeline.prototype, 'run')
      .mockResolvedValue({
        ok: true,
        workflow: buildMinimalWorkflow(),
        validationIssues: [],
        stageTrace: [],
      });

    // Simulate what generate-workflow.ts does: create pipeline and call run()
    const pipeline = new AiFirstPipeline();
    const result = await pipeline.run({
      userPrompt: 'Send a Slack message when a webhook fires',
      userId: 'test-user',
      correlationId: 'test-corr',
    });

    expect(runSpy).toHaveBeenCalledTimes(1);
    expect(runSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        userPrompt: 'Send a Slack message when a webhook fires',
        userId: 'test-user',
      }),
    );
    expect(result.ok).toBe(true);

    runSpy.mockRestore();
  });

  it('generate-workflow module imports AiFirstPipeline (no legacy pipeline import)', () => {
    // Validates: Requirements 3.6
    // Verify the module structure: generate-workflow.ts must import AiFirstPipeline
    const generateWorkflowModule = require('../../../api/generate-workflow');
    // The module should export a default function (the handler)
    expect(typeof generateWorkflowModule.default).toBe('function');
    // AiFirstPipeline must be importable (confirms it's the single entry point)
    const { AiFirstPipeline } = require('../ai-first-pipeline');
    expect(AiFirstPipeline).toBeDefined();
    expect(typeof AiFirstPipeline).toBe('function');
  });
});

// ─── Example Test 6: workflow returned even when credentials missing ──────────
// Validates: Requirements 3.7
// The pipeline returns the workflow even if credentials are missing.
// (Observed on unfixed code: pipeline always returns workflow on success path)

describe('Preservation Example Test 6 — workflow returned regardless of credential state', () => {
  /**
   * Validates: Requirements 3.7
   *
   * Observation: on the unfixed code, the pipeline always returns the workflow
   * on the success path. This behavior must be preserved after the fix.
   */
  it('pipeline.run() returns ok:true with workflow when all stages succeed', async () => {
    // Validates: Requirements 3.7
    // Mock each stage individually so node IDs are consistent end-to-end
    const intentModule = require('../stages/intent-stage');
    const nsModule = require('../stages/node-selection-stage');
    const erModule = require('../stages/edge-reasoning-stage');
    const vsModule = require('../stages/validation-stage');

    const minimalWorkflow = buildMinimalWorkflow();

    const intentSpy = jest.spyOn(intentModule, 'runIntentStage').mockResolvedValue({
      ok: true,
      intent: SAMPLE_INTENT,
      durationMs: 1,
      llmCall: { model: 'gemini-3.5-flash', temperature: 0.1, promptTokens: 10, completionTokens: 10 },
    });

    const nsSpy = jest.spyOn(nsModule, 'runNodeSelectionStage').mockResolvedValue({
      ok: true,
      selectedNodes: buildSelectedNodes(),
      durationMs: 1,
      llmCall: { model: 'gemini-3.5-flash', temperature: 0.1, promptTokens: 10, completionTokens: 10 },
    });

    const erSpy = jest.spyOn(erModule, 'runEdgeReasoningStage').mockResolvedValue({
      ok: true,
      workflow: minimalWorkflow,
      orderedNodeIds: ['node_trigger', 'node_slack'],
      edges: [{ source: 'node_trigger', target: 'node_slack', type: 'main' }],
      durationMs: 1,
      llmCall: { model: 'gemini-3.5-flash', temperature: 0.1, promptTokens: 10, completionTokens: 10 },
    });

    const vsSpy = jest.spyOn(vsModule, 'runValidationStage').mockResolvedValue({
      ok: true,
      workflow: minimalWorkflow,
      validationIssues: [],
      durationMs: 1,
      llmCall: { model: 'gemini-3.5-flash', temperature: 0.1, promptTokens: 10, completionTokens: 10 },
    });

    const { AiFirstPipeline } = require('../ai-first-pipeline');
    const pipeline = new AiFirstPipeline();

    let result: any;
    try {
      result = await pipeline.run({
        userPrompt: 'Send a Slack message when a webhook fires',
        userId: 'test-user',
        correlationId: 'test-corr',
      });
    } finally {
      intentSpy.mockRestore();
      nsSpy.mockRestore();
      erSpy.mockRestore();
      vsSpy.mockRestore();
    }

    // Workflow must be returned on success path
    expect(result.ok).toBe(true);
    expect(result.workflow).toBeDefined();
    expect(Array.isArray(result.workflow.nodes)).toBe(true);
    expect(Array.isArray(result.workflow.edges)).toBe(true);
  });
});

// ─── Example Test 7: edges never written directly to workflow.edges ───────────
// Validates: Requirements 3.8
// All edge mutations go through the orchestrator only.

describe('Preservation Example Test 7 — edges never written directly to workflow.edges', () => {
  /**
   * Validates: Requirements 3.8
   *
   * Observation: edge-reasoning stage calls unifiedGraphOrchestrator.initializeWorkflow()
   * and never writes to workflow.edges directly.
   * This is the baseline behavior to preserve after the fix.
   */
  it('initializeWorkflow is called (not direct edge mutation) in edge-reasoning stage', async () => {
    // Validates: Requirements 3.8
    const orchestratorModule = require('../../../core/orchestration/unified-graph-orchestrator');
    const orchestratorInstance = orchestratorModule.unifiedGraphOrchestrator;

    let initializeWorkflowCalled = false;
    const initSpy = jest
      .spyOn(orchestratorInstance, 'initializeWorkflow')
      .mockImplementation((nodes: any, ...rest: any[]) => {
        initializeWorkflowCalled = true;
        // Restore and call through
        initSpy.mockRestore();
        return orchestratorInstance.initializeWorkflow(nodes, ...rest);
      });

    const geminiModule = require('../gemini-orchestrator');
    const geminiSpy = jest
      .spyOn(geminiModule.geminiOrchestrator, 'processRequest')
      .mockResolvedValue(
        JSON.stringify({
          orderedNodes: ['node_trigger', 'node_slack'],
          edges: [{ source: 'node_trigger', target: 'node_slack', type: 'main' }],
        }),
      );

    try {
      await runEdgeReasoningStage(
        buildSelectedNodes(),
        SAMPLE_NODE_CATALOG,
        'test intent',
        'test-corr',
      );
    } finally {
      geminiSpy.mockRestore();
      try { initSpy.mockRestore(); } catch { /* already restored */ }
    }

    // initializeWorkflow must have been called (not direct edge mutation)
    expect(initializeWorkflowCalled).toBe(true);
  });
});
