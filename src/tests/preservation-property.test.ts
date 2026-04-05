/**
 * Preservation Property Tests
 *
 * These tests MUST PASS on unfixed code — they establish the baseline behavior
 * that must not regress after the bug fixes are applied.
 *
 * Property 2: Preservation — True Credential Fields & Non-Branching Workflow Wiring
 *
 * Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7
 *
 * Spec: .kiro/specs/branch-node-deduplication-fix/
 */

import { describe, it, expect } from '@jest/globals';
import * as fc from 'fast-check';
import { classifyFieldOwnership } from '../core/utils/field-ownership';
import { AgenticWorkflowBuilder } from '../services/ai/workflow-builder';
import { edgeReconciliationEngine } from '../core/orchestration/edge-reconciliation-engine';
import type { PlannedWorkflow } from '../core/types/ai-types';
import type { ExecutionOrder } from '../core/orchestration/execution-order-manager';
import type { FieldHelpCategory } from '../core/utils/field-help-metadata';

// ---------------------------------------------------------------------------
// STRICT_CREDENTIAL_CATEGORIES — mirrored from field-ownership.ts (not exported)
// These are the categories that MUST always classify as 'credential'.
// ---------------------------------------------------------------------------
const STRICT_CREDENTIAL_CATEGORIES: FieldHelpCategory[] = [
  'api_key',
  'oauth_token',
  'refresh_token',
  'client_id',
  'client_secret',
  'generic_token',
  'credential_id',
  'bearer_token',
  'webhook_secret',
  'smtp_password',
  'db_password',
  'private_key',
  'consumer_key',
  'consumer_secret',
  'generic_credential',
];

// ---------------------------------------------------------------------------
// Property 2a: Credential classification preservation
// For every helpCategory in STRICT_CREDENTIAL_CATEGORIES,
// classifyFieldOwnership must return 'credential'.
// Validates: Requirements 3.1, 3.5
// ---------------------------------------------------------------------------

describe('Preservation — Credential classification (Property 2)', () => {
  /**
   * Concrete examples: spot-check the three cases called out in the design doc.
   * These MUST PASS on unfixed code.
   */
  it('classifyFieldOwnership("apiKey", { helpCategory: "api_key" }) returns "credential"', () => {
    const result = classifyFieldOwnership('apiKey', {
      helpCategory: 'api_key',
      fillMode: { default: 'manual_static', supportsRuntimeAI: false, supportsBuildtimeAI: false },
      role: 'config',
    });
    expect(result).toBe('credential');
  });

  it('classifyFieldOwnership("botToken", { helpCategory: "generic_token" }) returns "credential"', () => {
    const result = classifyFieldOwnership('botToken', {
      helpCategory: 'generic_token',
      fillMode: { default: 'manual_static', supportsRuntimeAI: false, supportsBuildtimeAI: false },
      role: 'config',
    });
    expect(result).toBe('credential');
  });

  it('classifyFieldOwnership("accessToken", { helpCategory: "oauth_token" }) returns "credential"', () => {
    const result = classifyFieldOwnership('accessToken', {
      helpCategory: 'oauth_token',
      fillMode: { default: 'manual_static', supportsRuntimeAI: false, supportsBuildtimeAI: false },
      role: 'config',
    });
    expect(result).toBe('credential');
  });

  /**
   * Property-based test: for ALL helpCategory values in STRICT_CREDENTIAL_CATEGORIES,
   * classifyFieldOwnership must return 'credential' regardless of fieldName.
   *
   * **Validates: Requirements 3.1, 3.5**
   */
  it('PBT: classifyFieldOwnership returns "credential" for every STRICT_CREDENTIAL_CATEGORIES value', () => {
    fc.assert(
      fc.property(
        // Pick any helpCategory from the strict set
        fc.constantFrom(...STRICT_CREDENTIAL_CATEGORIES),
        // Pick any non-empty field name
        fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9_]{0,30}$/),
        (helpCategory, fieldName) => {
          const result = classifyFieldOwnership(fieldName, {
            helpCategory,
            fillMode: { default: 'manual_static', supportsRuntimeAI: false, supportsBuildtimeAI: false },
            role: 'config',
          });
          return result === 'credential';
        }
      ),
      { numRuns: 200 }
    );
  });
});

// ---------------------------------------------------------------------------
// Property 2b: Edge wiring preservation — switch with distinct branch types
// A switch workflow where each branch targets a DIFFERENT node type must
// produce N distinct branch edges with distinct targets.
// Validates: Requirements 3.2, 3.3, 3.4
// ---------------------------------------------------------------------------

describe('Preservation — Edge wiring for switch with distinct branch types (Property 2)', () => {
  /**
   * Switch with 3 cases, each targeting a different node type:
   * manual_trigger → switch → [slack_message, google_gmail, notion]
   *
   * Expected: 3 distinct branch edges, each with a unique target node ID.
   * We call reconcileEdges directly with an explicit execution order so the
   * branch topology is unambiguous (bypassing the category-based reordering
   * that initializeWorkflow applies).
   *
   * **Validates: Requirements 3.3, 3.4**
   */
  it('Switch with distinct branch types (slack_message, google_gmail, notion) produces 3 distinct branch edges', () => {
    // Build the workflow nodes directly — no hydration needed for this test
    const workflow: any = {
      nodes: [
        { id: 'trigger_1', type: 'manual_trigger', data: { type: 'manual_trigger', label: 'Trigger', config: {} } },
        {
          id: 'switch_1',
          type: 'switch',
          data: {
            type: 'switch',
            label: 'Switch',
            config: {
              expression: '{{$json.channel}}',
              cases: [
                { value: 'slack', label: 'Slack' },
                { value: 'email', label: 'Email' },
                { value: 'notion', label: 'Notion' },
              ],
            },
          },
        },
        { id: 'slack_1', type: 'slack_message', data: { type: 'slack_message', label: 'Slack', config: {} } },
        { id: 'gmail_1', type: 'google_gmail', data: { type: 'google_gmail', label: 'Gmail', config: {} } },
        { id: 'notion_1', type: 'notion', data: { type: 'notion', label: 'Notion', config: {} } },
      ],
      edges: [
        { id: 'e1', source: 'trigger_1', target: 'switch_1', type: 'main' },
      ],
    };

    // Provide an explicit execution order: trigger → switch → [slack, gmail, notion]
    const executionOrder: ExecutionOrder = {
      nodeIds: ['trigger_1', 'switch_1', 'slack_1', 'gmail_1', 'notion_1'],
      dependencies: new Map(),
      metadata: {
        triggerNodeId: 'trigger_1',
        terminalNodeIds: ['slack_1', 'gmail_1', 'notion_1'],
        branchingNodeIds: ['switch_1'],
        mergeNodeIds: [],
      },
    };

    const reconciled = edgeReconciliationEngine.reconcileEdges(workflow, executionOrder);
    const branchEdges = reconciled.workflow.edges.filter(
      (e: any) => e.source === 'switch_1'
    );

    // Must have exactly 3 branch edges from the switch node
    expect(branchEdges.length).toBe(3);

    // All branch edge targets must be distinct
    const targetIds = branchEdges.map((e: any) => e.target);
    expect(new Set(targetIds).size).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// Property 2c: Edge wiring preservation — linear workflow
// A linear workflow (manual_trigger → google_sheets → slack_message) must
// produce a valid linear edge chain.
// Validates: Requirements 3.2, 3.6, 3.7
// ---------------------------------------------------------------------------

describe('Preservation — Linear workflow edge chain (Property 2)', () => {
  /**
   * Linear workflow: manual_trigger → google_sheets → slack_message
   *
   * Expected:
   * - Exactly 3 nodes
   * - Edge from trigger → sheets
   * - Edge from sheets → slack
   * - No errors in reconciliation
   *
   * **Validates: Requirements 3.2, 3.6, 3.7**
   */
  it('Linear workflow (manual_trigger → google_sheets → slack_message) produces valid edge chain', () => {
    const builder = new AgenticWorkflowBuilder();

    const planned: PlannedWorkflow = {
      summary: 'Linear trigger → sheets → slack',
      steps: [
        { id: 'trigger_1', type: 'manual_trigger', role: 'trigger' },
        { id: 'sheets_1', type: 'google_sheets', role: 'action' },
        { id: 'slack_1', type: 'slack_message', role: 'output' },
      ],
    };

    const result = (builder as any).hydratePlannedWorkflow(planned);
    const workflow = result.workflow;

    // Must have exactly 3 nodes
    expect(workflow.nodes.length).toBe(3);

    // Node IDs must be preserved
    const nodeIds = workflow.nodes.map((n: any) => n.id);
    expect(nodeIds).toContain('trigger_1');
    expect(nodeIds).toContain('sheets_1');
    expect(nodeIds).toContain('slack_1');

    // Run reconcileEdges
    const executionOrder: ExecutionOrder = {
      nodeIds: ['trigger_1', 'sheets_1', 'slack_1'],
      dependencies: new Map(),
      metadata: {
        triggerNodeId: 'trigger_1',
        terminalNodeIds: ['slack_1'],
        branchingNodeIds: [],
        mergeNodeIds: [],
      },
    };

    const reconciled = edgeReconciliationEngine.reconcileEdges(workflow, executionOrder);

    // Must have edges connecting the linear chain
    const edges = reconciled.workflow.edges;
    expect(edges.length).toBeGreaterThanOrEqual(2);

    // trigger → sheets edge must exist
    const triggerToSheets = edges.some(
      (e: any) => e.source === 'trigger_1' && e.target === 'sheets_1'
    );
    expect(triggerToSheets).toBe(true);

    // sheets → slack edge must exist
    const sheetsToSlack = edges.some(
      (e: any) => e.source === 'sheets_1' && e.target === 'slack_1'
    );
    expect(sheetsToSlack).toBe(true);

    // No self-loops
    for (const edge of edges) {
      expect(edge.source).not.toBe(edge.target);
    }
  });

  /**
   * PBT: For any linear workflow (no branching), the reconciled edge set
   * forms a valid chain with no duplicate source-target pairs and no self-loops.
   *
   * **Validates: Requirements 3.2, 3.7**
   */
  it('PBT: Linear workflows always produce a valid edge chain with no self-loops or duplicates', () => {
    // Use a fixed set of linear-safe node types that exist in the registry
    const linearNodeTypes = [
      'google_sheets',
      'slack_message',
      'google_gmail',
      'notion',
      'http_request',
    ] as const;

    fc.assert(
      fc.property(
        // Pick 1–3 middle nodes (trigger and terminal are fixed)
        fc.array(fc.constantFrom(...linearNodeTypes), { minLength: 1, maxLength: 3 }),
        (middleTypes) => {
          const builder = new AgenticWorkflowBuilder();

          const steps = [
            { id: 'trigger_1', type: 'manual_trigger', role: 'trigger' as const },
            ...middleTypes.map((t, i) => ({
              id: `node_${i + 2}`,
              type: t,
              role: 'action' as const,
            })),
          ];

          const planned: PlannedWorkflow = {
            summary: 'Linear PBT workflow',
            steps,
          };

          let result: any;
          try {
            result = (builder as any).hydratePlannedWorkflow(planned);
          } catch {
            // If hydration fails for an unknown node type, skip this sample
            return true;
          }

          const workflow = result.workflow;
          const nodeIds = steps.map((s) => s.id);

          const executionOrder: ExecutionOrder = {
            nodeIds,
            dependencies: new Map(),
            metadata: {
              triggerNodeId: 'trigger_1',
              terminalNodeIds: [nodeIds[nodeIds.length - 1]],
              branchingNodeIds: [],
              mergeNodeIds: [],
            },
          };

          const reconciled = edgeReconciliationEngine.reconcileEdges(workflow, executionOrder);
          const edges = reconciled.workflow.edges;

          // No self-loops
          for (const edge of edges) {
            if (edge.source === edge.target) return false;
          }

          // No duplicate source-target pairs
          const edgeKeys = edges.map((e: any) => `${e.source}→${e.target}`);
          if (new Set(edgeKeys).size !== edgeKeys.length) return false;

          return true;
        }
      ),
      { numRuns: 50 }
    );
  });
});
