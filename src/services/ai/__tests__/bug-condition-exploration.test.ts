/**
 * Bug Condition Exploration Tests — AI-First Pipeline End-to-End Fix
 * Spec: .kiro/specs/ai-first-pipeline-end-to-end-fix/
 *
 * CRITICAL: These tests are EXPECTED TO FAIL on unfixed code.
 * Failure confirms each bug exists. DO NOT fix the source code when these fail.
 *
 * EXPECTED OUTCOME:
 *   Test 1 (Bug 1) — PASSES  (catalog IS in message body — confirms duplication bug)
 *   Tests 2–8      — FAIL    (confirms each respective bug)
 *
 * Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8
 */

import { describe, expect, it, jest, beforeEach } from '@jest/globals';
import { GeminiOrchestrator } from '../gemini-orchestrator';
import { runNodeSelectionStage } from '../stages/node-selection-stage';
import { runEdgeReasoningStage } from '../stages/edge-reasoning-stage';
import { runValidationStage } from '../stages/validation-stage';
import { AiFirstPipeline } from '../ai-first-pipeline';
import { unifiedNodeRegistry } from '../../../core/registry/unified-node-registry';
import { unifiedGraphOrchestrator } from '../../../core/orchestration/unified-graph-orchestrator';
import type { StructuredIntent } from '../stages/intent-stage';
import type { SelectedNode } from '../system-prompt-builder';
import type { Workflow, WorkflowNode } from '../../../core/types/ai-types';

// ─── Shared test fixtures ─────────────────────────────────────────────────────

const SAMPLE_INTENT: StructuredIntent = {
  intent: 'Send a Slack message when a webhook fires',
  triggerType: 'webhook',
  actions: ['send_slack_message'],
  dataFlows: [],
  constraints: [],
};

const SAMPLE_NODE_CATALOG = 'webhook: HTTP trigger\nslack: Send Slack message';

/** Build a minimal 2-node workflow for use in validation/pipeline tests */
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

/** Build minimal SelectedNode list for edge-reasoning / validation tests */
function buildSelectedNodes(): SelectedNode[] {
  return [
    { nodeId: 'node_trigger', type: 'webhook', role: 'trigger', reason: 'HTTP trigger' },
    { nodeId: 'node_slack', type: 'slack', role: 'action', reason: 'Send Slack message' },
  ];
}

// ─── Test 1 (Bug 1): Node catalog duplicated in message body ─────────────────
// Validates: Requirements 1.1
// EXPECTED: PASSES on unfixed code — confirms catalog IS in message body (duplication bug)

describe('Test 1 (Bug 1) — Node catalog duplicated in node-selection message body', () => {
  it('message argument to processRequest contains NODE_CATALOG — confirms duplication bug', async () => {
    // Validates: Requirements 1.1
    // Spy on geminiOrchestrator.processRequest to capture the message argument
    const geminiModule = require('../gemini-orchestrator');
    const orchestratorInstance = geminiModule.geminiOrchestrator;

    const capturedMessages: string[] = [];
    const spy = jest
      .spyOn(orchestratorInstance, 'processRequest')
      .mockImplementation(async (_type: any, input: any, _opts: any) => {
        if (input && typeof input.message === 'string') {
          capturedMessages.push(input.message);
        }
        // Return a valid node-selection response
        return JSON.stringify({
          selectedNodes: [
            { type: 'webhook', role: 'trigger', reason: 'HTTP trigger' },
            { type: 'slack', role: 'action', reason: 'Send Slack message' },
          ],
        });
      });

    try {
      await runNodeSelectionStage(SAMPLE_INTENT, SAMPLE_NODE_CATALOG, 'test-correlation-id');
    } finally {
      spy.mockRestore();
    }

    console.log('[BUG EXPLORATION] Captured message bodies:', capturedMessages);

    // On UNFIXED code: message contains NODE_CATALOG (duplication bug) — test PASSES
    // On FIXED code: message does NOT contain NODE_CATALOG — test will FAIL (expected after fix)
    const firstMessage = capturedMessages[0] ?? '';
    console.log('[BUG EXPLORATION] First message contains NODE_CATALOG:', firstMessage.includes('NODE_CATALOG'));

    expect(firstMessage).toContain('NODE_CATALOG');
  });
});

// ─── Test 2 (Bug 2): Dead _hydratedConfig property — node.data.config not populated ─
// Validates: Requirements 1.2
// EXPECTED: FAILS on unfixed code — confirms defaults stored in _hydratedConfig, not node.data.config

describe('Test 2 (Bug 2) — Hydration block stores defaults in _hydratedConfig, not node.data.config', () => {
  it('node.data.config is populated with registry defaults after hydration — FAILS on unfixed code', () => {
    // Validates: Requirements 1.2
    // Replicate the hydration block from ai-first-pipeline.ts directly
    const selectedNodes: SelectedNode[] = [
      { nodeId: 'node_webhook', type: 'webhook', role: 'trigger', reason: 'HTTP trigger' },
    ];

    // This is the EXACT hydration block from ai-first-pipeline.ts (the buggy code):
    const hydratedNodes = selectedNodes.map((node) => {
      const def = unifiedNodeRegistry.get(node.type);
      const defaults = def?.defaultConfig ? def.defaultConfig() : {};
      return { ...node, _hydratedConfig: defaults } as SelectedNode & { _hydratedConfig: Record<string, any> };
    });

    const hydratedNode = hydratedNodes[0];
    const def = unifiedNodeRegistry.get('webhook');
    const expectedDefaults = def?.defaultConfig ? def.defaultConfig() : {};

    console.log('[BUG EXPLORATION] hydratedNode._hydratedConfig:', (hydratedNode as any)._hydratedConfig);
    console.log('[BUG EXPLORATION] hydratedNode has data.config:', 'data' in hydratedNode);
    console.log('[BUG EXPLORATION] expectedDefaults keys:', Object.keys(expectedDefaults));

    // EXPECTED (correct) behavior: node.data.config should contain registry defaults
    // On UNFIXED code: SelectedNode has no data.config — only _hydratedConfig — this FAILS
    const dataConfig = (hydratedNode as any).data?.config;
    console.log('[BUG EXPLORATION] data.config:', dataConfig);

    // Assert that data.config is populated with defaults (will FAIL on unfixed code)
    expect(dataConfig).toBeDefined();
    if (Object.keys(expectedDefaults).length > 0) {
      expect(Object.keys(dataConfig ?? {})).toEqual(
        expect.arrayContaining(Object.keys(expectedDefaults))
      );
    }
  });
});

// ─── Test 3 (Bug 3): initializeWorkflow called without initialExecutionOrder ─
// Validates: Requirements 1.3
// EXPECTED: FAILS on unfixed code — confirms second argument is undefined

describe('Test 3 (Bug 3) — Edge reasoning ignores LLM orderedNodes (initializeWorkflow missing 2nd arg)', () => {
  it('initializeWorkflow is called with a non-undefined second argument — FAILS on unfixed code', async () => {
    // Validates: Requirements 1.3
    const orchestratorModule = require('../../../core/orchestration/unified-graph-orchestrator');
    const orchestratorInstance = orchestratorModule.unifiedGraphOrchestrator;

    let capturedSecondArg: any = 'NOT_CALLED';
    const spy = jest
      .spyOn(orchestratorInstance, 'initializeWorkflow')
      .mockImplementation((nodes: any, initialExecutionOrder: any, ...rest: any[]) => {
        capturedSecondArg = initialExecutionOrder;
        // Call through to real implementation
        spy.mockRestore();
        return orchestratorInstance.initializeWorkflow(nodes, initialExecutionOrder, ...rest);
      });

    // Mock geminiOrchestrator to return a valid edge-reasoning response
    const geminiModule = require('../gemini-orchestrator');
    const geminiInstance = geminiModule.geminiOrchestrator;
    const geminiSpy = jest
      .spyOn(geminiInstance, 'processRequest')
      .mockResolvedValue(
        JSON.stringify({
          orderedNodes: ['node_trigger', 'node_slack'],
          edges: [{ source: 'node_trigger', target: 'node_slack', type: 'main' }],
        })
      );

    try {
      await runEdgeReasoningStage(
        buildSelectedNodes(),
        SAMPLE_NODE_CATALOG,
        SAMPLE_INTENT.intent,
        'test-correlation-id'
      );
    } finally {
      geminiSpy.mockRestore();
      try { spy.mockRestore(); } catch { /* already restored */ }
    }

    console.log('[BUG EXPLORATION] initializeWorkflow second argument:', capturedSecondArg);
    console.log('[BUG EXPLORATION] second arg is undefined:', capturedSecondArg === undefined);

    // EXPECTED (correct) behavior: second argument should be an ExecutionOrder object (not undefined)
    // On UNFIXED code: capturedSecondArg === undefined — this FAILS
    expect(capturedSecondArg).not.toBeUndefined();
  });
});

// ─── Test 4 (Bug 4): Validation sends summary string instead of actual graph JSON ─
// Validates: Requirements 1.4
// EXPECTED: FAILS on unfixed code — confirms message is a summary string, not graph JSON

describe('Test 4 (Bug 4) — Validation stage sends summary string instead of actual graph JSON', () => {
  it('message argument to processRequest contains "nodes":[ — FAILS on unfixed code', async () => {
    // Validates: Requirements 1.4
    const geminiModule = require('../gemini-orchestrator');
    const geminiInstance = geminiModule.geminiOrchestrator;

    const capturedMessages: string[] = [];
    const spy = jest
      .spyOn(geminiInstance, 'processRequest')
      .mockImplementation(async (_type: any, input: any, _opts: any) => {
        if (input && typeof input.message === 'string') {
          capturedMessages.push(input.message);
        }
        return JSON.stringify({ status: 'pass', issues: [] });
      });

    const workflow = buildMinimalWorkflow();

    try {
      await runValidationStage(
        workflow,
        SAMPLE_NODE_CATALOG,
        SAMPLE_INTENT.intent,
        buildSelectedNodes(),
        [],
        'test-correlation-id'
      );
    } finally {
      spy.mockRestore();
    }

    console.log('[BUG EXPLORATION] Captured validation messages:', capturedMessages);
    const firstMessage = capturedMessages[0] ?? '';
    console.log('[BUG EXPLORATION] First message contains "nodes":[:', firstMessage.includes('"nodes":['));
    console.log('[BUG EXPLORATION] First message (first 300 chars):', firstMessage.substring(0, 300));

    // EXPECTED (correct) behavior: message contains serialized nodes and edges arrays
    // On UNFIXED code: message is "nodes=N, edges=M, node_types=..." — this FAILS
    expect(firstMessage).toContain('"nodes":[');
  });
});

// ─── Test 5 (Bug 5): Structural prompt stage absent from pipeline ─────────────
// Validates: Requirements 1.5
// EXPECTED: FAILS on unfixed code — confirms no structural_prompt entry in stageTrace

describe('Test 5 (Bug 5) — Structural prompt stage is absent from pipeline stageTrace', () => {
  it('stageTrace contains an entry with stage: "structural_prompt" — FAILS on unfixed code', async () => {
    // Validates: Requirements 1.5
    const geminiModule = require('../gemini-orchestrator');
    const geminiInstance = geminiModule.geminiOrchestrator;

    // Mock all LLM calls to return valid responses for each stage
    const spy = jest
      .spyOn(geminiInstance, 'processRequest')
      .mockImplementation(async (type: any, _input: any, _opts: any) => {
        if (type === 'intent-analysis' || type === 'node-suggestion') {
          return JSON.stringify({
            intent: 'Send a Slack message when a webhook fires',
            triggerType: 'webhook',
            actions: ['send_slack_message'],
            dataFlow: [],
            constraints: [],
            selectedNodes: [
              { type: 'webhook', role: 'trigger', reason: 'HTTP trigger' },
              { type: 'slack', role: 'action', reason: 'Send Slack message' },
            ],
          });
        }
        if (type === 'workflow-generation') {
          return JSON.stringify({
            orderedNodes: ['node_1', 'node_2'],
            edges: [{ source: 'node_1', target: 'node_2', type: 'main' }],
            structuralPrompt: 'A webhook triggers a Slack notification.',
          });
        }
        if (type === 'workflow-analysis') {
          return JSON.stringify({ status: 'pass', issues: [] });
        }
        return JSON.stringify({});
      });

    let result: any;
    try {
      const pipeline = new AiFirstPipeline();
      result = await pipeline.run({
        userPrompt: 'Send a Slack message when a webhook fires',
        userId: 'test-user-id',
        correlationId: 'test-correlation-id',
      });
    } finally {
      spy.mockRestore();
    }

    console.log('[BUG EXPLORATION] Pipeline result ok:', result?.ok);
    const stageTrace = result?.stageTrace ?? result?.ok === false ? result?.stageTrace : [];
    console.log('[BUG EXPLORATION] stageTrace stages:', stageTrace?.map((s: any) => s.stage));

    const hasStructuralPromptStage = stageTrace?.some((s: any) => s.stage === 'structural_prompt');
    console.log('[BUG EXPLORATION] Has structural_prompt stage:', hasStructuralPromptStage);

    // EXPECTED (correct) behavior: stageTrace contains a structural_prompt entry
    // On UNFIXED code: no such entry exists — this FAILS
    expect(hasStructuralPromptStage).toBe(true);
  });
});

// ─── Test 6 (Bug 6): Credential discovery never called ───────────────────────
// Validates: Requirements 1.6
// EXPECTED: FAILS on unfixed code — confirms result.requiredCredentials is undefined

describe('Test 6 (Bug 6) — Credential discovery is never called; result.requiredCredentials is undefined', () => {
  it('result.requiredCredentials is not undefined — FAILS on unfixed code', async () => {
    // Validates: Requirements 1.6
    const geminiModule = require('../gemini-orchestrator');
    const geminiInstance = geminiModule.geminiOrchestrator;

    const spy = jest
      .spyOn(geminiInstance, 'processRequest')
      .mockImplementation(async (type: any, _input: any, _opts: any) => {
        if (type === 'node-suggestion') {
          return JSON.stringify({
            selectedNodes: [
              { type: 'webhook', role: 'trigger', reason: 'HTTP trigger' },
              { type: 'slack', role: 'action', reason: 'Send Slack message' },
            ],
          });
        }
        if (type === 'workflow-generation') {
          return JSON.stringify({
            orderedNodes: ['node_1', 'node_2'],
            edges: [{ source: 'node_1', target: 'node_2', type: 'main' }],
          });
        }
        if (type === 'workflow-analysis') {
          return JSON.stringify({ status: 'pass', issues: [] });
        }
        return JSON.stringify({
          intent: 'Send a Slack message when a webhook fires',
          triggerType: 'webhook',
          actions: ['send_slack_message'],
          dataFlow: [],
          constraints: [],
        });
      });

    let result: any;
    try {
      const pipeline = new AiFirstPipeline();
      result = await pipeline.run({
        userPrompt: 'Send a Slack message when a webhook fires',
        userId: 'test-user-id',
        correlationId: 'test-correlation-id',
      });
    } finally {
      spy.mockRestore();
    }

    console.log('[BUG EXPLORATION] result.ok:', result?.ok);
    console.log('[BUG EXPLORATION] result.requiredCredentials:', result?.requiredCredentials);
    console.log('[BUG EXPLORATION] requiredCredentials is undefined:', result?.requiredCredentials === undefined);

    // EXPECTED (correct) behavior: requiredCredentials is an array (may be empty)
    // On UNFIXED code: requiredCredentials is undefined — this FAILS
    expect(result?.requiredCredentials).not.toBeUndefined();
  });
});

// ─── Test 7 (Bug 7): Field ownership map never extracted ─────────────────────
// Validates: Requirements 1.7
// EXPECTED: FAILS on unfixed code — confirms result.fieldOwnershipMap is undefined

describe('Test 7 (Bug 7) — Field ownership map is never extracted; result.fieldOwnershipMap is undefined', () => {
  it('result.fieldOwnershipMap is not undefined — FAILS on unfixed code', async () => {
    // Validates: Requirements 1.7
    const geminiModule = require('../gemini-orchestrator');
    const geminiInstance = geminiModule.geminiOrchestrator;

    const spy = jest
      .spyOn(geminiInstance, 'processRequest')
      .mockImplementation(async (type: any, _input: any, _opts: any) => {
        if (type === 'node-suggestion') {
          return JSON.stringify({
            selectedNodes: [
              { type: 'webhook', role: 'trigger', reason: 'HTTP trigger' },
              { type: 'slack', role: 'action', reason: 'Send Slack message' },
            ],
          });
        }
        if (type === 'workflow-generation') {
          return JSON.stringify({
            orderedNodes: ['node_1', 'node_2'],
            edges: [{ source: 'node_1', target: 'node_2', type: 'main' }],
          });
        }
        if (type === 'workflow-analysis') {
          return JSON.stringify({ status: 'pass', issues: [] });
        }
        return JSON.stringify({
          intent: 'Send a Slack message when a webhook fires',
          triggerType: 'webhook',
          actions: ['send_slack_message'],
          dataFlow: [],
          constraints: [],
        });
      });

    let result: any;
    try {
      const pipeline = new AiFirstPipeline();
      result = await pipeline.run({
        userPrompt: 'Send a Slack message when a webhook fires',
        userId: 'test-user-id',
        correlationId: 'test-correlation-id',
      });
    } finally {
      spy.mockRestore();
    }

    console.log('[BUG EXPLORATION] result.ok:', result?.ok);
    console.log('[BUG EXPLORATION] result.fieldOwnershipMap:', result?.fieldOwnershipMap);
    console.log('[BUG EXPLORATION] fieldOwnershipMap is undefined:', result?.fieldOwnershipMap === undefined);

    // EXPECTED (correct) behavior: fieldOwnershipMap is a Record object
    // On UNFIXED code: fieldOwnershipMap is undefined — this FAILS
    expect(result?.fieldOwnershipMap).not.toBeUndefined();
  });
});

// ─── Test 8 (Bug 8): gemini-orchestrator maxTokens capped at 4000 ─────────────
// Validates: Requirements 1.8
// EXPECTED: FAILS on unfixed code — confirms getDefaultMaxTokens returns 4000

describe('Test 8 (Bug 8) — gemini-orchestrator maxTokens is 4000 for workflow-generation (too small)', () => {
  it('getDefaultMaxTokens("workflow-generation") returns >= 16000 — FAILS on unfixed code', () => {
    // Validates: Requirements 1.8
    // Access the private method via bracket notation (reflection)
    const orchestrator = new GeminiOrchestrator();
    const maxTokens = (orchestrator as any).getDefaultMaxTokens('workflow-generation');

    console.log('[BUG EXPLORATION] getDefaultMaxTokens("workflow-generation"):', maxTokens);
    console.log('[BUG EXPLORATION] Is 4000 (bug value):', maxTokens === 4000);
    console.log('[BUG EXPLORATION] Is >= 16000 (correct value):', maxTokens >= 16000);

    // EXPECTED (correct) behavior: maxTokens >= 16000
    // On UNFIXED code: maxTokens === 4000 — this FAILS
    expect(maxTokens).toBeGreaterThanOrEqual(16000);
  });
});
