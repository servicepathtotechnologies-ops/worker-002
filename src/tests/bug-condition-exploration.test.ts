/**
 * Bug Condition Exploration Tests
 *
 * These tests MUST FAIL on unfixed code — failure confirms the bugs exist.
 * DO NOT fix the code when they fail.
 *
 * Bug 1: inferCredentialCategory maps webhookUrl → 'webhook' (substring match),
 *        causing URL-type config fields to appear in the credential panel.
 *
 * Bug 2: hydratePlannedWorkflow creates only one node per step type, so when
 *        multiple branches need the same node type, they share a single node.
 *        EdgeReconciliationEngine Step 4 silently skips wiring the second branch
 *        rather than emitting an error.
 *
 * Spec: .kiro/specs/branch-node-deduplication-fix/
 */

import { describe, it, expect } from '@jest/globals';
import { classifyFieldOwnership } from '../core/utils/field-ownership';
import { unifiedNodeRegistry } from '../core/registry/unified-node-registry';
import { AgenticWorkflowBuilder } from '../services/ai/workflow-builder';
import { edgeReconciliationEngine } from '../core/orchestration/edge-reconciliation-engine';
import type { PlannedWorkflow } from '../core/types/ai-types';
import type { ExecutionOrder } from '../core/orchestration/execution-order-manager';

// ---------------------------------------------------------------------------
// Bug 1 — Webhook URL treated as credential
// ---------------------------------------------------------------------------

describe('Bug 1 — Webhook URL credential misclassification', () => {
  /**
   * Test A: classifyFieldOwnership for webhookUrl with helpCategory='webhook_url'
   * EXPECTED: returns 'value'
   * STATUS on unfixed code: PASSES (ownership path is correct per design)
   */
  it('Test A: classifyFieldOwnership returns "value" for webhookUrl with helpCategory=webhook_url', () => {
    const field = {
      helpCategory: 'webhook_url' as const,
      fillMode: { default: 'manual_static' as const, supportsRuntimeAI: true, supportsBuildtimeAI: true },
      role: 'config' as const,
    };
    const result = classifyFieldOwnership('webhookUrl', field);
    expect(result).toBe('value');
  });

  /**
   * Test B: inferCredentialCategory('webhookUrl') should NOT return 'webhook'
   * EXPECTED: result is NOT 'webhook'
   * STATUS on unfixed code: FAILS — substring match on 'webhook' returns 'webhook'
   *
   * We access the private method via (registry as any) to surface the bug directly.
   */
  it('Test B: inferCredentialCategory("webhookUrl") should NOT return "webhook" (Bug 1 — substring match)', () => {
    const registry = unifiedNodeRegistry as any;
    // inferCredentialCategory is a private method — access via any to test the bug
    const result = registry.inferCredentialCategory('webhookUrl');
    // On unfixed code this returns 'webhook' — the test FAILS, confirming the bug
    expect(result).not.toBe('webhook');
  });

  /**
   * Test C: extractCredentialSchema on a mixed schema (webhookUrl + apiKey)
   * EXPECTED: credentialFields contains 'apiKey' but NOT 'webhookUrl'
   * STATUS on unfixed code: depends on whether isCredentialOwnership gates webhookUrl.
   * Since classifyFieldOwnership already returns 'value' for webhook_url helpCategory,
   * this test may PASS on unfixed code — but it documents the expected contract.
   */
  it('Test C: extractCredentialSchema excludes webhookUrl but includes apiKey', () => {
    const mockSchema = { type: 'slack_webhook', configSchema: { required: ['apiKey'] } };

    // Build a minimal inputSchema with both fields
    const inputSchema: Record<string, any> = {
      webhookUrl: {
        type: 'string',
        description: 'Slack Incoming Webhook URL',
        required: false,
        helpCategory: 'webhook_url',
        ownership: 'value',
        fillMode: { default: 'manual_static', supportsRuntimeAI: true, supportsBuildtimeAI: true },
        role: 'config',
      },
      apiKey: {
        type: 'string',
        description: 'API Key',
        required: true,
        helpCategory: 'api_key',
        ownership: 'credential',
        fillMode: { default: 'manual_static', supportsRuntimeAI: false, supportsBuildtimeAI: false },
        role: 'config',
      },
    };

    const registry = unifiedNodeRegistry as any;
    const credSchema = registry.extractCredentialSchema(mockSchema, inputSchema);

    // apiKey must be in credentialFields
    expect(credSchema?.credentialFields).toContain('apiKey');
    // webhookUrl must NOT be in credentialFields
    expect(credSchema?.credentialFields ?? []).not.toContain('webhookUrl');
  });
});

// ---------------------------------------------------------------------------
// Bug 2 — Branch node deduplication
// ---------------------------------------------------------------------------

describe('Bug 2 — Branch node deduplication', () => {
  /**
   * Test D: PlannedWorkflow with switch + 2 slack_message steps → 2 distinct Slack node IDs
   * EXPECTED: 2 distinct nodes of type 'slack_message'
   * STATUS on unfixed code: FAILS if hydratePlannedWorkflow collapses same-type steps
   *
   * Note: hydratePlannedWorkflow is private; we access it via (builder as any).
   * The PlannedWorkflow already has 2 distinct step entries — the bug is that
   * the engine may assign the same ID or collapse them. We verify distinct IDs.
   */
  it('Test D: hydratePlannedWorkflow produces 2 distinct Slack node IDs for 2 slack_message steps', () => {
    const builder = new AgenticWorkflowBuilder();

    const planned: PlannedWorkflow = {
      summary: 'Switch with 2 Slack branches',
      steps: [
        { id: 'trigger_1', type: 'manual_trigger', role: 'trigger' },
        { id: 'switch_1', type: 'switch', role: 'logic', config: {
          expression: '{{$json.channel}}',
          cases: [{ value: 'general', label: 'General' }, { value: 'alerts', label: 'Alerts' }],
        }},
        { id: 'slack_case_1', type: 'slack_message', role: 'output' },
        { id: 'slack_case_2', type: 'slack_message', role: 'output' },
      ],
    };

    const result = (builder as any).hydratePlannedWorkflow(planned);
    const slackNodes = result.workflow.nodes.filter(
      (n: any) => (n.type || n.data?.type) === 'slack_message'
    );

    // Must have exactly 2 Slack nodes
    expect(slackNodes.length).toBe(2);

    // Both must have distinct IDs
    const ids = slackNodes.map((n: any) => n.id);
    expect(new Set(ids).size).toBe(2);
  });

  /**
   * Test E: PlannedWorkflow with switch + 3 slack_message steps → 3 distinct Slack node IDs
   * EXPECTED: 3 distinct nodes of type 'slack_message'
   * STATUS on unfixed code: FAILS if hydratePlannedWorkflow collapses same-type steps
   */
  it('Test E: hydratePlannedWorkflow produces 3 distinct Slack node IDs for 3 slack_message steps', () => {
    const builder = new AgenticWorkflowBuilder();

    const planned: PlannedWorkflow = {
      summary: 'Switch with 3 Slack branches',
      steps: [
        { id: 'trigger_1', type: 'manual_trigger', role: 'trigger' },
        { id: 'switch_1', type: 'switch', role: 'logic', config: {
          expression: '{{$json.priority}}',
          cases: [
            { value: 'low', label: 'Low' },
            { value: 'medium', label: 'Medium' },
            { value: 'high', label: 'High' },
          ],
        }},
        { id: 'slack_case_1', type: 'slack_message', role: 'output' },
        { id: 'slack_case_2', type: 'slack_message', role: 'output' },
        { id: 'slack_case_3', type: 'slack_message', role: 'output' },
      ],
    };

    const result = (builder as any).hydratePlannedWorkflow(planned);
    const slackNodes = result.workflow.nodes.filter(
      (n: any) => (n.type || n.data?.type) === 'slack_message'
    );

    // Must have exactly 3 Slack nodes
    expect(slackNodes.length).toBe(3);

    // All must have distinct IDs
    const ids = slackNodes.map((n: any) => n.id);
    expect(new Set(ids).size).toBe(3);
  });

  /**
   * Test F: Switch node with only 1 downstream Slack node → reconcileEdges errors[]
   *         should contain a shared-target violation message.
   * EXPECTED: errors[] contains a message about shared branch targets
   * STATUS on unfixed code: FAILS — Step 4 silently skips case_2 with no error emitted
   */
  it('Test F: reconcileEdges emits shared-target violation error when switch has 1 Slack node for 2 branches', () => {
    // Build a workflow with a switch node (2 cases) but only 1 downstream Slack node
    const workflow: any = {
      nodes: [
        { id: 'trigger_1', type: 'manual_trigger', data: { type: 'manual_trigger', label: 'Trigger' } },
        {
          id: 'switch_1',
          type: 'switch',
          data: {
            type: 'switch',
            label: 'Switch',
            config: {
              expression: '{{$json.channel}}',
              cases: [
                { value: 'general', label: 'General' },
                { value: 'alerts', label: 'Alerts' },
              ],
            },
          },
        },
        // Only ONE Slack node — both case_1 and case_2 would need to target it
        { id: 'slack_1', type: 'slack_message', data: { type: 'slack_message', label: 'Slack' } },
      ],
      edges: [
        { id: 'e1', source: 'trigger_1', target: 'switch_1', type: 'main' },
      ],
    };

    const executionOrder: ExecutionOrder = {
      nodeIds: ['trigger_1', 'switch_1', 'slack_1'],
      dependencies: new Map(),
      metadata: {
        triggerNodeId: 'trigger_1',
        terminalNodeIds: ['slack_1'],
        branchingNodeIds: ['switch_1'],
        mergeNodeIds: [],
      },
    };

    const result = edgeReconciliationEngine.reconcileEdges(workflow, executionOrder);

    // On unfixed code: errors[] is empty — Step 4 silently skips case_2.
    // After fix: errors[] must contain a shared-target or branch-exhaustion message.
    const errorText = result.errors.join(' ').toLowerCase();
    const hasSharedTargetError =
      errorText.includes('shared') ||
      errorText.includes('distinct') ||
      errorText.includes('branch') ||
      errorText.includes('target') ||
      errorText.includes('too few') ||
      errorText.includes('no distinct');

    // This assertion FAILS on unfixed code (errors[] is empty)
    expect(hasSharedTargetError).toBe(true);
  });
});
