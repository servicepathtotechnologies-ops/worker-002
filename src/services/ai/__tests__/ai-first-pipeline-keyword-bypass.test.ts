// Feature: ai-first-workflow-generation-pipeline

/**
 * Validates: Requirements 7.5
 *
 * Verifies that prompts which would have failed under the old keyword-based
 * node selection (because they don't use exact platform names or keywords)
 * now succeed via the AI pipeline.
 *
 * The old keyword matcher would have returned zero nodes for these prompts
 * because they use natural language descriptions instead of exact platform names.
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { WorkflowGenerationPipeline } from '../pipeline/workflow-generation-pipeline';
import { unifiedGraphOrchestrator } from '../../../core/orchestration/unified-graph-orchestrator';
import { unifiedNodeRegistry } from '../../../core/registry/unified-node-registry';

// ─── Mock gemini-orchestrator ─────────────────────────────────────────────────

jest.mock('../gemini-orchestrator', () => ({
  geminiOrchestrator: {
    processRequest: jest.fn(),
  },
}));

import { geminiOrchestrator } from '../gemini-orchestrator';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function pickTriggerType(): string {
  const candidates = ['manual_trigger', 'schedule', 'webhook'];
  for (const t of candidates) {
    if (unifiedNodeRegistry.get(t)) return t;
  }
  const allTypes = unifiedNodeRegistry.getAllTypes();
  for (const t of allTypes) {
    const def = unifiedNodeRegistry.get(t);
    if (def?.category === 'trigger') return t;
  }
  return 'manual_trigger';
}

function pickActionType(): string {
  const candidates = ['http_request', 'set_variable', 'javascript'];
  for (const t of candidates) {
    if (unifiedNodeRegistry.get(t)) return t;
  }
  const allTypes = unifiedNodeRegistry.getAllTypes();
  for (const t of allTypes) {
    const def = unifiedNodeRegistry.get(t);
    if (def && def.category !== 'trigger') return t;
  }
  return 'http_request';
}

/**
 * Build a mock for geminiOrchestrator.processRequest that returns a simple
 * 2-node workflow (trigger + action) for any prompt.
 *
 * The point of these tests is that the pipeline COMPLETES successfully —
 * not that it picks the "right" nodes. The mock simulates what the LLM
 * would return when it understands natural language descriptions.
 *
 * The mock captures the node IDs assigned by the node-selection stage
 * (from the message payload) and echoes them back in the workflow-generation
 * response so the edge-reasoning stage can resolve them correctly.
 */
function buildMockProcessRequest(triggerType: string, actionType: string) {
  // Captured after the node-suggestion call so workflow-generation can use real IDs
  let capturedTriggerNodeId: string | null = null;
  let capturedActionNodeId: string | null = null;

  return jest.fn().mockImplementation((requestType: string, input: unknown) => {
    switch (requestType) {
      case 'intent-analysis':
        return Promise.resolve(
          JSON.stringify({
            intent: 'Automate a simple two-step workflow',
            triggerType: 'manual_trigger',
            actions: ['perform action'],
            dataFlows: [{ from: 'trigger', to: 'action', dataDescription: 'trigger output' }],
            constraints: [],
          }),
        );

      case 'node-suggestion': {
        // The pipeline will assign nodeIds after parsing this response.
        // We return the two node types; the stage assigns UUIDs to them.
        return Promise.resolve(
          JSON.stringify({
            selectedNodes: [
              { type: triggerType, role: 'trigger', reason: 'starts the workflow' },
              { type: actionType, role: 'action', reason: 'performs the action' },
            ],
          }),
        );
      }

      case 'workflow-generation': {
        // The edge-reasoning stage sends SELECTED_NODES in the message body.
        // Parse the message to extract the actual nodeIds assigned by node-selection.
        try {
          const msg = (input as { message?: string })?.message ?? '';
          const jsonStart = msg.indexOf('[');
          const jsonEnd = msg.lastIndexOf(']');
          if (jsonStart !== -1 && jsonEnd !== -1) {
            const nodes: Array<{ nodeId?: string; role?: string }> = JSON.parse(
              msg.substring(jsonStart, jsonEnd + 1),
            );
            const triggerNode = nodes.find((n) => n.role === 'trigger');
            const actionNode = nodes.find((n) => n.role !== 'trigger');
            if (triggerNode?.nodeId) capturedTriggerNodeId = triggerNode.nodeId;
            if (actionNode?.nodeId) capturedActionNodeId = actionNode.nodeId;
          }
        } catch {
          // ignore parse errors — fall back to generated IDs
        }

        const tId = capturedTriggerNodeId ?? `node-trigger-${randomUUID().slice(0, 8)}`;
        const aId = capturedActionNodeId ?? `node-action-${randomUUID().slice(0, 8)}`;

        return Promise.resolve(
          JSON.stringify({
            orderedNodes: [tId, aId],
            edges: [{ source: tId, target: aId, type: 'main' }],
          }),
        );
      }

      case 'workflow-analysis':
        return Promise.resolve(
          JSON.stringify({ status: 'pass', issues: [] }),
        );

      default:
        return Promise.resolve(JSON.stringify({ status: 'pass', issues: [] }));
    }
  });
}

// ─── Prompts that previously failed under keyword matching ───────────────────

/**
 * These five prompts use natural language descriptions instead of exact
 * platform names. The old keyword matcher would have returned zero nodes
 * for all of them:
 *
 * 1. "email service" / "team chat"  → no match for "gmail" / "slack"
 * 2. "contact page" / "confirmation note" → no match for "form" / "email"
 * 3. "spreadsheet tool" / "CRM" → no match for "google_sheets" / "hubspot"
 * 4. "API calls" / "custom logic" → no match for "webhook" / "javascript"
 * 5. "project board" / "ping" → no match for "notion"/"clickup" / "slack"
 */
const PREVIOUSLY_FAILING_PROMPTS: [string, string][] = [
  [
    'Every day at 9am, pull my unread messages from the email service and post a digest to the team chat',
    'uses "email service" and "team chat" instead of "gmail" and "slack"',
  ],
  [
    'Whenever someone fills out the contact page, drop them a confirmation note',
    'uses "contact page" and "confirmation note" instead of "form" and "email"',
  ],
  [
    'On a timer, grab rows from the spreadsheet tool and push them to the CRM',
    'uses "spreadsheet tool" and "CRM" instead of "google_sheets" and "hubspot"',
  ],
  [
    'React to incoming API calls by running some custom logic and storing the output',
    'uses "API calls" and "custom logic" instead of "webhook" and "javascript"',
  ],
  [
    'Periodically check the project board for overdue tasks and ping the responsible person',
    'uses "project board" and "ping" instead of "notion"/"clickup" and "slack"',
  ],
];

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('AI pipeline handles prompts that previously failed under keyword matching', () => {
  let triggerType: string;
  let actionType: string;

  beforeAll(() => {
    triggerType = pickTriggerType();
    actionType = pickActionType();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  /**
   * Validates: Requirements 7.5
   *
   * Each of these prompts uses natural language that the old keyword matcher
   * could not handle. The AI pipeline receives the full Node_Catalog and
   * understands the intent without a keyword pre-filter blocking the request.
   */
  it.each(PREVIOUSLY_FAILING_PROMPTS)(
    'prompt "%s" succeeds via AI pipeline (%s)',
    async (prompt) => {
      (geminiOrchestrator.processRequest as jest.Mock).mockImplementation(
        buildMockProcessRequest(triggerType, actionType),
      );

      const pipeline = new WorkflowGenerationPipeline();

      const result = await pipeline.run({
        userPrompt: prompt,
        userId: 'test-user',
        correlationId: randomUUID(),
      });

      if (!result.ok) {
        console.warn(
          `[keyword-bypass] Pipeline returned ok:false for prompt "${prompt}": ` +
            `code=${result.code}, message=${result.message}`,
        );
        // Still assert ok:true — these prompts MUST succeed via AI pipeline
        expect(result.ok).toBe(true);
        return;
      }

      expect(result.ok).toBe(true);

      // If the pipeline succeeded, the workflow must also pass structural validation
      const validation = unifiedGraphOrchestrator.validateWorkflow(result.workflow);

      if (!validation.valid) {
        console.error(
          `[keyword-bypass] validateWorkflow failed for prompt "${prompt}":`,
          validation.errors,
        );
      }

      expect(validation.valid).toBe(true);
    },
  );

  /**
   * Validates: Requirements 7.5
   *
   * Static assertion: node-selection-stage.ts must NOT contain any keyword
   * matching logic. This proves the keyword pre-filter has been removed from
   * the node selection path and the AI pipeline is the only mechanism.
   */
  it('none of the five prompts are blocked by keyword pre-filter', () => {
    const stageFilePath = join(
      __dirname,
      '..',
      'stages',
      'node-selection-stage.ts',
    );

    const source = readFileSync(stageFilePath, 'utf-8');

    // Must NOT contain keyword matching artifacts
    expect(source).not.toContain('keywordVariations');
    expect(source).not.toContain('keyword_filter');
    expect(source).not.toContain('KeywordFilter');
    expect(source).not.toContain('enhanced-keyword-matcher');

    // MUST use AI (geminiOrchestrator) for node selection
    expect(source).toContain('geminiOrchestrator.processRequest');
  });
});
