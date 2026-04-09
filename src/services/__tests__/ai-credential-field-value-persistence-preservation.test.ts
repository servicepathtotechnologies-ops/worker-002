/**
 * Preservation Property Tests — AI Credential Field Value Persistence
 *
 * These tests MUST PASS on unfixed code — they establish the baseline behavior
 * that must not regress after the bug fixes are applied.
 *
 * Property 2: Preservation
 *   - Empty/undefined fields still receive fallback credential values
 *   - validateAndHealBeforeCredentials does not modify node config values
 *   - SelfHealingWorkflowEngine structural repairs do not touch config values
 *
 * Spec: .kiro/specs/ai-credential-field-value-persistence/
 */

import { describe, it, expect } from '@jest/globals';
import * as fc from 'fast-check';
import { workflowLifecycleManager } from '../workflow-lifecycle-manager';
import type { Workflow } from '../../core/types/ai-types';
import { unifiedGraphOrchestrator } from '../../core/orchestration/unified-graph-orchestrator';

// ---------------------------------------------------------------------------
// Property 2a: Empty/undefined fields still receive fallback credential values
// Validates: Requirements 3.1, 3.2
// ---------------------------------------------------------------------------

describe('Preservation — Empty fields still receive fallback credential values (Property 2)', () => {
  /**
   * Concrete: Slack node with empty webhookUrl — injectCredentials MUST populate it
   * Validates: Requirement 3.2
   */
  it('injectCredentials populates empty webhookUrl from credentials store', async () => {
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
              webhookUrl: '', // empty — should be populated
              message: 'Hello',
            },
          },
        },
      ],
      edges: [],
    };

    const credentials: Record<string, string> = {
      slack: injectedUrl,
    };

    const result = await workflowLifecycleManager.injectCredentials(workflow, credentials);
    const slackNode = result.workflow.nodes.find((n: any) => n.id === 'slack_1');
    const actualWebhookUrl = slackNode?.data?.config?.webhookUrl;

    // Must be populated from credentials store
    expect(actualWebhookUrl).toBe(injectedUrl);
  });

  /**
   * Concrete: HubSpot node with undefined apiKey — injectCredentials MUST populate it
   * Validates: Requirement 3.2
   */
  it('injectCredentials populates undefined apiKey from credentials store', async () => {
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
              // apiKey intentionally absent (undefined)
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

    // Must be populated from credentials store
    expect(actualApiKey).toBe(injectedKey);
  });

  /**
   * Concrete: Notion node with null apiKey — injectCredentials MUST populate it
   * Validates: Requirement 3.2
   */
  it('injectCredentials populates null apiKey from credentials store', async () => {
    const injectedKey = 'injected-notion-token-xyz';

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
              apiKey: null as any, // null — should be populated
              operation: 'create_page',
            },
          },
        },
      ],
      edges: [],
    };

    const credentials: Record<string, string> = {
      notion: injectedKey,
    };

    const result = await workflowLifecycleManager.injectCredentials(workflow, credentials);
    const notionNode = result.workflow.nodes.find((n: any) => n.id === 'notion_1');
    const actualApiKey = notionNode?.data?.config?.apiKey;

    // Must be populated from credentials store
    expect(actualApiKey).toBe(injectedKey);
  });

  /**
   * PBT: For any Slack node where webhookUrl is empty/undefined, injectCredentials
   * must populate it from the credentials store.
   * Validates: Requirement 3.2
   */
  it('PBT: injectCredentials always populates empty webhookUrl for Slack nodes', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate a valid Slack webhook URL
        fc.stringMatching(/^https:\/\/hooks\.slack\.com\/services\/[A-Z0-9]{9}\/[A-Z0-9]{11}\/[a-zA-Z0-9]{24}$/),
        // Generate an empty-ish value for the existing config
        fc.constantFrom('', undefined as any, null as any),
        async (injectedUrl, emptyValue) => {
          const workflow: Workflow = {
            nodes: [
              {
                id: 'slack_pbt',
                type: 'custom',
                position: { x: 0, y: 0 },
                data: {
                  type: 'slack_message',
                  label: 'Slack',
                  category: 'output',
                  config: {
                    webhookUrl: emptyValue,
                    message: 'Test',
                  },
                },
              },
            ],
            edges: [],
          };

          const credentials: Record<string, string> = { slack: injectedUrl };
          const result = await workflowLifecycleManager.injectCredentials(workflow, credentials);
          const node = result.workflow.nodes.find((n: any) => n.id === 'slack_pbt');
          const actual = node?.data?.config?.webhookUrl;

          // Must be populated
          return actual === injectedUrl;
        }
      ),
      { numRuns: 10 }
    );
  });
});

// ---------------------------------------------------------------------------
// Property 2b: validateAndHealBeforeCredentials does not modify node config values
// Validates: Requirements 2.5, 3.3
// ---------------------------------------------------------------------------

describe('Preservation — validateAndHealBeforeCredentials does not modify node config values (Property 2)', () => {
  /**
   * Concrete: Workflow with a missing edge (structural error) — reconcileWorkflow
   * must fix the edge but leave all node.data.config values unchanged.
   * Validates: Requirement 3.3
   */
  it('reconcileWorkflow fixes structural issues without touching node config values', () => {
    const originalWebhookUrl = 'https://hooks.slack.com/services/ORIGINAL/ORIGINAL/original';
    const originalMessage = 'AI-assigned message content';

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
              webhookUrl: originalWebhookUrl,
              message: originalMessage,
            },
          },
        },
      ],
      edges: [], // Missing edge — structural error
    };

    // Snapshot config values before reconcile
    const configsBefore = workflow.nodes.map((n) => ({
      id: n.id,
      config: { ...(n.data?.config || {}) },
    }));

    const repaired = unifiedGraphOrchestrator.reconcileWorkflow(workflow);

    // Snapshot config values after reconcile
    const configsAfter = repaired.workflow.nodes.map((n) => ({
      id: n.id,
      config: { ...(n.data?.config || {}) },
    }));

    // Every config field must be identical before and after
    for (const before of configsBefore) {
      const after = configsAfter.find((c) => c.id === before.id);
      expect(after).toBeDefined();
      for (const [field, value] of Object.entries(before.config)) {
        expect(after!.config[field]).toBe(value);
      }
    }

    // Slack node's webhookUrl must be unchanged
    const slackAfter = repaired.workflow.nodes.find((n: any) => n.id === 'slack_1');
    expect(slackAfter?.data?.config?.webhookUrl).toBe(originalWebhookUrl);
    expect(slackAfter?.data?.config?.message).toBe(originalMessage);
  });

  /**
   * PBT: For any workflow with arbitrary non-empty config values, reconcileWorkflow
   * must not modify any node.data.config field values.
   * Validates: Requirement 3.3
   */
  it('PBT: reconcileWorkflow never modifies pre-existing non-empty node config values', () => {
    fc.assert(
      fc.property(
        // Generate 1–3 non-empty string config values
        fc.array(
          fc.record({
            field: fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9]{2,15}$/),
            value: fc.string({ minLength: 1, maxLength: 50 }),
          }),
          { minLength: 1, maxLength: 3 }
        ),
        (configEntries) => {
          const config: Record<string, string> = {};
          for (const { field, value } of configEntries) {
            config[field] = value;
          }

          const workflow: Workflow = {
            nodes: [
              {
                id: 'trigger_1',
                type: 'custom',
                position: { x: 0, y: 0 },
                data: { type: 'manual_trigger', label: 'Trigger', category: 'trigger', config: {} },
              },
              {
                id: 'node_1',
                type: 'custom',
                position: { x: 0, y: 200 },
                data: { type: 'slack_message', label: 'Slack', category: 'output', config },
              },
            ],
            edges: [],
          };

          const repaired = unifiedGraphOrchestrator.reconcileWorkflow(workflow);
          const nodeAfter = repaired.workflow.nodes.find((n: any) => n.id === 'node_1');

          // Every config field must be identical after reconcile
          for (const { field, value } of configEntries) {
            if (nodeAfter?.data?.config?.[field] !== value) return false;
          }
          return true;
        }
      ),
      { numRuns: 50 }
    );
  });
});
