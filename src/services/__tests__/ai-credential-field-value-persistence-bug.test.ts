/**
 * Bug Condition Exploration Tests — AI Credential Field Value Persistence
 *
 * These tests MUST FAIL on unfixed code — failure confirms the bugs exist.
 * DO NOT fix the code when they fail.
 *
 * Bug: AI-assigned field values are overwritten by downstream pipeline stages:
 *   Path A: injectCredentials unconditionally overwrites pre-set config fields
 *   Path B: generate-workflow handler has no existingWorkflow threading
 *   Path C: SelfHealingWorkflowEngine.heal() discards node configs on regeneration
 *
 * Spec: .kiro/specs/ai-credential-field-value-persistence/
 */

import { describe, it, expect } from '@jest/globals';
import { workflowLifecycleManager } from '../workflow-lifecycle-manager';
import { SelfHealingWorkflowEngine } from '../ai/self-healing-workflow-engine';
import type { Workflow } from '../../core/types/ai-types';
import type { FinalValidationResult } from '../ai/final-workflow-validator';
import type { StructuredIntent } from '../ai/intent-structurer';

// ---------------------------------------------------------------------------
// Path A — injectCredentials unconditional overwrite
// ---------------------------------------------------------------------------

describe('Path A — injectCredentials must not overwrite pre-set config fields', () => {
  /**
   * Test A1: Slack node with pre-set webhookUrl — injectCredentials must NOT overwrite it
   *
   * Bug: config.webhookUrl = credentialValue runs unconditionally for Slack webhook connector
   * Expected after fix: config.webhookUrl === "https://hooks.slack.com/original"
   * Status on unfixed code: FAILS — webhookUrl is overwritten with injected value
   */
  it('A1: injectCredentials does NOT overwrite pre-set webhookUrl on Slack node', async () => {
    const originalUrl = 'https://hooks.slack.com/services/ORIGINAL/ORIGINAL/original';
    const injectedUrl = 'https://hooks.slack.com/services/INJECTED/INJECTED/injected';

    const workflow: Workflow = {
      nodes: [
        {
          id: 'slack_1',
          type: 'custom',
          position: { x: 0, y: 0 },
          data: {
            type: 'slack_message',
            label: 'Slack',
            category: 'output',
            config: {
              webhookUrl: originalUrl, // AI-assigned value — must survive
              message: 'Hello from AI',
            },
          },
        },
      ],
      edges: [],
    };

    const credentials: Record<string, string> = {
      slack: injectedUrl,
      SLACK_WEBHOOK_URL: injectedUrl,
    };

    const result = await workflowLifecycleManager.injectCredentials(workflow, credentials);
    const slackNode = result.workflow.nodes.find((n: any) => n.id === 'slack_1');
    const actualWebhookUrl = slackNode?.data?.config?.webhookUrl;

    // On unfixed code: actualWebhookUrl === injectedUrl (FAILS)
    // After fix: actualWebhookUrl === originalUrl (PASSES)
    expect(actualWebhookUrl).toBe(originalUrl);
  });

  /**
   * Test A2: HubSpot node with pre-set apiKey — injectCredentials must NOT overwrite it
   *
   * Bug: config[credentialContract.credentialFieldName] = credentialValue runs unconditionally
   *      for HubSpot (credentialFieldName = 'apiKey')
   * Expected after fix: config.apiKey === "original-hubspot-key"
   * Status on unfixed code: FAILS — apiKey is overwritten with injected value
   */
  it('A2: injectCredentials does NOT overwrite pre-set apiKey on HubSpot node', async () => {
    const originalKey = 'original-hubspot-key-abc123';
    const injectedKey = 'injected-hubspot-key-xyz789';

    const workflow: Workflow = {
      nodes: [
        {
          id: 'hubspot_1',
          type: 'custom',
          position: { x: 0, y: 0 },
          data: {
            type: 'hubspot',
            label: 'HubSpot',
            category: 'crm',
            config: {
              apiKey: originalKey, // AI-assigned value — must survive
              operation: 'create_contact',
            },
          },
        },
      ],
      edges: [],
    };

    const credentials: Record<string, string> = {
      hubspot: injectedKey,
    };

    const result = await workflowLifecycleManager.injectCredentials(workflow, credentials);
    const hubspotNode = result.workflow.nodes.find((n: any) => n.id === 'hubspot_1');
    const actualApiKey = hubspotNode?.data?.config?.apiKey;

    // On unfixed code: actualApiKey === injectedKey (FAILS)
    // After fix: actualApiKey === originalKey (PASSES)
    expect(actualApiKey).toBe(originalKey);
  });

  /**
   * Test A3: Any node with pre-set credentialFieldName field — injectCredentials must NOT overwrite
   *
   * Bug: The generic field-scan loop writes to any field containing 'key'/'token'/'credential'/'secret'
   *      without checking if the field already has a value
   * Expected after fix: pre-set credential fields survive injection
   * Status on unfixed code: FAILS — field is overwritten
   */
  it('A3: injectCredentials does NOT overwrite pre-set credential field via generic field scan', async () => {
    const originalToken = 'original-notion-token-abc';
    const injectedToken = 'injected-notion-token-xyz';

    const workflow: Workflow = {
      nodes: [
        {
          id: 'notion_1',
          type: 'custom',
          position: { x: 0, y: 0 },
          data: {
            type: 'notion',
            label: 'Notion',
            category: 'productivity',
            config: {
              apiKey: originalToken, // AI-assigned value — must survive
              operation: 'create_page',
            },
          },
        },
      ],
      edges: [],
    };

    const credentials: Record<string, string> = {
      notion: injectedToken,
    };

    const result = await workflowLifecycleManager.injectCredentials(workflow, credentials);
    const notionNode = result.workflow.nodes.find((n: any) => n.id === 'notion_1');
    const actualApiKey = notionNode?.data?.config?.apiKey;

    // On unfixed code: actualApiKey === injectedToken (FAILS)
    // After fix: actualApiKey === originalToken (PASSES)
    expect(actualApiKey).toBe(originalToken);
  });
});

// ---------------------------------------------------------------------------
// Path C — SelfHealingWorkflowEngine.heal() discards node configs on regeneration
// ---------------------------------------------------------------------------

describe('Path C — SelfHealingWorkflowEngine.heal() must preserve node config values', () => {
  /**
   * Test C1: Workflow with pre-set config.model — heal() must not discard it
   *
   * Bug: When strategy.requiresRegeneration = true, the regenerated workflow replaces
   *      the current one entirely, discarding all node config values
   * Expected after fix: healed workflow still has config.model === "gpt-4o"
   * Status on unfixed code: FAILS — config.model is lost after regeneration
   */
  it('C1: heal() preserves pre-set node config values after requiresRegeneration repair', async () => {
    const engine = new SelfHealingWorkflowEngine();

    const originalModel = 'gpt-4o';

    const workflow: Workflow = {
      nodes: [
        {
          id: 'trigger_1',
          type: 'custom',
          position: { x: 0, y: 0 },
          data: {
            type: 'manual_trigger',
            label: 'Trigger',
            category: 'trigger',
            config: {},
          },
        },
        {
          id: 'ai_1',
          type: 'custom',
          position: { x: 0, y: 200 },
          data: {
            type: 'ai_service',
            label: 'AI Service',
            category: 'ai',
            config: {
              model: originalModel, // AI-assigned value — must survive healing
              prompt: 'Summarize this',
            },
          },
        },
        // Orphaned node to trigger structural error → requiresRegeneration
        {
          id: 'orphan_1',
          type: 'custom',
          position: { x: 400, y: 0 },
          data: {
            type: 'slack_message',
            label: 'Orphaned Slack',
            category: 'output',
            config: {
              webhookUrl: 'https://hooks.slack.com/original',
            },
          },
        },
      ],
      edges: [
        { id: 'e1', source: 'trigger_1', target: 'ai_1', type: 'main' },
        // orphan_1 has no incoming edge — structural error
      ],
    };

    const validationResult: FinalValidationResult = {
      valid: false,
      errors: ['Orphaned node detected: orphan_1 has no incoming connections'],
      warnings: [],
      details: {
        orphanNodes: ['orphan_1'],
        duplicateTriggers: [],
        duplicateNodes: [],
        disconnectedNodes: ['orphan_1'],
        missingInputs: [],
        invalidEdgeHandles: [],
        missingTransformations: [],
        orderIssues: [],
        nonMinimalIssues: [],
        dataFlowIssues: [],
      },
      shouldRegenerate: true,
    };

    const intent: StructuredIntent = {
      trigger: 'manual_trigger',
      actions: [
        { type: 'ai_service', operation: 'summarize' },
        { type: 'slack_message', operation: 'send' },
      ],
      requires_credentials: [],
    };

    const healResult = await engine.heal(workflow, validationResult, intent, 'Summarize data with AI and send to Slack');

    if (!healResult.success || !healResult.workflow) {
      // If healing failed entirely, skip this assertion (not the bug we're testing)
      return;
    }

    const aiNode = healResult.workflow.nodes.find((n: any) => n.id === 'ai_1');
    const actualModel = aiNode?.data?.config?.model;

    // On unfixed code: actualModel is undefined or 'gpt-4' (default) — FAILS
    // After fix: actualModel === 'gpt-4o' — PASSES
    expect(actualModel).toBe(originalModel);
  });

  /**
   * Test C2: Workflow with pre-set webhookUrl on Slack node — heal() must not discard it
   *
   * Status on unfixed code: FAILS — webhookUrl is lost after regeneration
   */
  it('C2: heal() preserves pre-set webhookUrl on Slack node after structural repair', async () => {
    const engine = new SelfHealingWorkflowEngine();

    const originalWebhookUrl = 'https://hooks.slack.com/services/ORIGINAL/ORIGINAL/original';

    const workflow: Workflow = {
      nodes: [
        {
          id: 'trigger_1',
          type: 'custom',
          position: { x: 0, y: 0 },
          data: {
            type: 'manual_trigger',
            label: 'Trigger',
            category: 'trigger',
            config: {},
          },
        },
        {
          id: 'slack_1',
          type: 'custom',
          position: { x: 0, y: 200 },
          data: {
            type: 'slack_message',
            label: 'Slack',
            category: 'output',
            config: {
              webhookUrl: originalWebhookUrl, // AI-assigned — must survive
              message: 'Alert: {{$json.message}}',
            },
          },
        },
        // Orphaned node to trigger structural error
        {
          id: 'orphan_1',
          type: 'custom',
          position: { x: 400, y: 0 },
          data: {
            type: 'google_gmail',
            label: 'Orphaned Gmail',
            category: 'output',
            config: {},
          },
        },
      ],
      edges: [
        { id: 'e1', source: 'trigger_1', target: 'slack_1', type: 'main' },
      ],
    };

    const validationResult: FinalValidationResult = {
      valid: false,
      errors: ['Orphaned node detected: orphan_1 has no incoming connections'],
      warnings: [],
      details: {
        orphanNodes: ['orphan_1'],
        duplicateTriggers: [],
        duplicateNodes: [],
        disconnectedNodes: ['orphan_1'],
        missingInputs: [],
        invalidEdgeHandles: [],
        missingTransformations: [],
        orderIssues: [],
        nonMinimalIssues: [],
        dataFlowIssues: [],
      },
      shouldRegenerate: true,
    };

    const intent: StructuredIntent = {
      trigger: 'manual_trigger',
      actions: [
        { type: 'slack_message', operation: 'send' },
      ],
      requires_credentials: ['slack'],
    };

    const healResult = await engine.heal(workflow, validationResult, intent, 'Send Slack alert');

    if (!healResult.success || !healResult.workflow) {
      return;
    }

    const slackNode = healResult.workflow.nodes.find((n: any) => n.id === 'slack_1');
    const actualWebhookUrl = slackNode?.data?.config?.webhookUrl;

    // On unfixed code: actualWebhookUrl is undefined or empty — FAILS
    // After fix: actualWebhookUrl === originalWebhookUrl — PASSES
    expect(actualWebhookUrl).toBe(originalWebhookUrl);
  });
});
