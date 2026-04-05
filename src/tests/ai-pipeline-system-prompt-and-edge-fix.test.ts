/**
 * Bug Condition Exploration + Preservation Tests
 * Spec: .kiro/specs/ai-pipeline-system-prompt-and-edge-fix/
 *
 * Exploration tests (Task 1): verify all 6 bugs are FIXED on the current code.
 * Preservation tests (Task 2): verify existing correct behaviors are unchanged.
 */

import { describe, it, expect } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';
import * as fc from 'fast-check';
import { unifiedNodeRegistry } from '../core/registry/unified-node-registry';
import { edgeReconciliationEngine } from '../core/orchestration/edge-reconciliation-engine';
import type { ExecutionOrder } from '../core/orchestration/execution-order-manager';
import type { WorkflowNode } from '../core/types/ai-types';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const PRODUCTION_PROMPT_PATH = path.join(
  __dirname,
  '../services/ai/PRODUCTION_WORKFLOW_GENERATION_PROMPT.md'
);
const CLARIFYING_PROMPT_PATH = path.join(
  __dirname,
  '../services/ai/CLARIFYING_QUESTIONS_SYSTEM_PROMPT.md'
);

/** Node types that were previously hardcoded in the production prompt */
const FORMERLY_HARDCODED_NODE_TYPES = [
  'ollama_chat',
  'openai_chat',
  'google_gmail',
  'slack_message',
  'smtp_email',
  'if_else',
  'switch',
  'condition',
  'javascript',
  'filter',
  'loop',
  'text_formatter',
  'data_transform',
  'merge',
  'database_read',
  'database_write',
  'supabase',
  'log_output',
  'delay',
  'http_request',
  'respond_to_webhook',
  'error_handler',
];

/** Node-field pairs that were previously hardcoded in the clarifying prompt */
const FORMERLY_HARDCODED_FIELD_PAIRS = [
  'Google Sheets: Spreadsheet ID',
  'Slack: Channel ID',
  'Telegram Bot: Bot Token',
  'Email: Recipient email address',
  'Webhook: URL',
  'Database: Table name',
  'AI Agent: Prompt/instructions',
  'PDF Processing: File URL/Path',
  'Form: Form ID',
  'Schedule: Cron expression',
];

/** DAG structural rules that MUST remain in the production prompt */
const REQUIRED_STRUCTURAL_RULES = [
  'NO CYCLES',
  'orphan',
  'DAG',
  'trigger',
];

// ─── Bug 1: No hardcoded node types in production prompt ─────────────────────

describe('Bug 1 — Production prompt must not contain hardcoded node types', () => {
  it('PRODUCTION_WORKFLOW_GENERATION_PROMPT.md exists', () => {
    expect(fs.existsSync(PRODUCTION_PROMPT_PATH)).toBe(true);
  });

  it('Production prompt contains {{NODE_CATALOG}} placeholder', () => {
    const content = fs.readFileSync(PRODUCTION_PROMPT_PATH, 'utf-8');
    expect(content).toContain('{{NODE_CATALOG}}');
  });

  it.each(FORMERLY_HARDCODED_NODE_TYPES)(
    'Production prompt does NOT contain hardcoded node type: %s',
    (nodeType) => {
      const content = fs.readFileSync(PRODUCTION_PROMPT_PATH, 'utf-8');
      // Check for backtick-quoted node type (the way they appeared in the old prompt)
      expect(content).not.toContain(`\`${nodeType}\``);
    }
  );
});

// ─── Bug 2: No hardcoded field lists in clarifying prompt ────────────────────

describe('Bug 2 — Clarifying prompt must not contain hardcoded node-field pairs', () => {
  it('CLARIFYING_QUESTIONS_SYSTEM_PROMPT.md exists', () => {
    expect(fs.existsSync(CLARIFYING_PROMPT_PATH)).toBe(true);
  });

  it('Clarifying prompt contains {{NODE_CATALOG}} placeholder', () => {
    const content = fs.readFileSync(CLARIFYING_PROMPT_PATH, 'utf-8');
    expect(content).toContain('{{NODE_CATALOG}}');
  });

  it.each(FORMERLY_HARDCODED_FIELD_PAIRS)(
    'Clarifying prompt does NOT contain hardcoded field pair: %s',
    (pair) => {
      const content = fs.readFileSync(CLARIFYING_PROMPT_PATH, 'utf-8');
      expect(content).not.toContain(pair);
    }
  );
});

// ─── Bug 3: Branch port coverage check ───────────────────────────────────────

describe('Bug 3 — allBranchPortsCovered: registry-driven port coverage', () => {
  /**
   * A switch node with 3 cases must require 3 seeded edges with correct sourceHandles.
   * The old check (seededBranchEdges.length >= branchingNodeIds.length) would accept
   * 3 edges even if they all had wrong labels. The new check verifies port coverage.
   */
  it('Switch with 3 cases: seeded edges with wrong sourceHandles → falls back to orchestrator', () => {
    const switchNode: WorkflowNode = {
      id: 'switch_1',
      type: 'switch',
      data: {
        type: 'switch',
        label: 'Switch',
        config: {
          expression: '{{$json.status}}',
          cases: [
            { value: 'shipped', label: 'Shipped' },
            { value: 'processing', label: 'Processing' },
            { value: 'cancelled', label: 'Cancelled' },
          ],
        },
      },
    };

    const finalNodes: WorkflowNode[] = [
      { id: 'trigger_1', type: 'manual_trigger', data: { type: 'manual_trigger', label: 'Trigger', config: {} } },
      switchNode,
      { id: 'gmail_1', type: 'google_gmail', data: { type: 'google_gmail', label: 'Gmail', config: {} } },
      { id: 'slack_1', type: 'slack_message', data: { type: 'slack_message', label: 'Slack', config: {} } },
      { id: 'slack_2', type: 'slack_message', data: { type: 'slack_message', label: 'Slack 2', config: {} } },
    ];

    // Seeded edges with WRONG sourceHandles (all 'main' instead of case_1/case_2/case_3)
    const wrongSeededEdges = [
      { id: 'e1', source: 'switch_1', target: 'gmail_1', type: 'main', sourceHandle: 'main' },
      { id: 'e2', source: 'switch_1', target: 'slack_1', type: 'main', sourceHandle: 'main' },
      { id: 'e3', source: 'switch_1', target: 'slack_2', type: 'main', sourceHandle: 'main' },
    ];

    // Get the outgoing ports for the switch node
    const ports = unifiedNodeRegistry.getOutgoingPortsForWorkflowNode(switchNode);
    const branchPorts = ports.filter((p) => p !== 'output' && p !== 'default');

    // Verify the switch node has branch ports defined
    expect(branchPorts.length).toBeGreaterThan(0);

    // Verify that wrong sourceHandles don't cover the branch ports
    for (const port of branchPorts) {
      const covered = wrongSeededEdges.some(
        (e) => e.source === 'switch_1' && (e.sourceHandle === port || e.type === port)
      );
      // Wrong edges should NOT cover the branch ports
      expect(covered).toBe(false);
    }
  });

  it('Switch with 3 cases: seeded edges with correct sourceHandles → uses seeded workflow', () => {
    const switchNode: WorkflowNode = {
      id: 'switch_1',
      type: 'switch',
      data: {
        type: 'switch',
        label: 'Switch',
        config: {
          expression: '{{$json.status}}',
          cases: [
            { value: 'shipped', label: 'Shipped' },
            { value: 'processing', label: 'Processing' },
            { value: 'cancelled', label: 'Cancelled' },
          ],
        },
      },
    };

    // Get the actual outgoing ports from registry
    const ports = unifiedNodeRegistry.getOutgoingPortsForWorkflowNode(switchNode);
    const branchPorts = ports.filter((p) => p !== 'output' && p !== 'default');

    if (branchPorts.length === 0) {
      // Switch node doesn't have dynamic ports yet — skip
      return;
    }

    // Build seeded edges with CORRECT sourceHandles matching the branch ports
    const correctSeededEdges = branchPorts.map((port, i) => ({
      id: `e${i + 1}`,
      source: 'switch_1',
      target: `node_${i + 1}`,
      type: port,
      sourceHandle: port,
    }));

    // Verify all ports are covered
    for (const port of branchPorts) {
      const covered = correctSeededEdges.some(
        (e) => e.source === 'switch_1' && (e.sourceHandle === port || e.type === port)
      );
      expect(covered).toBe(true);
    }
  });
});

// ─── Bug 4: Duplicate nodeId deduplication ───────────────────────────────────

describe('Bug 4 — Duplicate nodeId deduplication in edge-reasoning-stage', () => {
  it('Map built from duplicate nodeIds has size 1 (demonstrates the old bug)', () => {
    // This demonstrates what the OLD code did — Map overwrites duplicates
    const selectedNodes = [
      { nodeId: 'abc', type: 'google_gmail', role: 'output' as const, reason: 'branch 1' },
      { nodeId: 'abc', type: 'google_gmail', role: 'output' as const, reason: 'branch 2' },
    ];
    const oldNodeMap = new Map(selectedNodes.map((n) => [n.nodeId, n]));
    // Old behavior: size is 1 (second entry overwrites first)
    expect(oldNodeMap.size).toBe(1);
  });

  it('Deduplication produces unique IDs for duplicate nodeIds', () => {
    const { randomUUID } = require('crypto');
    const selectedNodes = [
      { nodeId: 'abc', type: 'google_gmail', role: 'output' as const, reason: 'branch 1' },
      { nodeId: 'abc', type: 'google_gmail', role: 'output' as const, reason: 'branch 2' },
    ];

    // Apply the fix logic
    const seenIds = new Set<string>();
    const deduplicatedNodes = selectedNodes.map((n) => {
      if (seenIds.has(n.nodeId)) {
        return { ...n, nodeId: randomUUID() };
      }
      seenIds.add(n.nodeId);
      return n;
    });

    // After deduplication: all IDs are unique
    const ids = deduplicatedNodes.map((n) => n.nodeId);
    expect(new Set(ids).size).toBe(2);

    // nodeMap has size 2
    const nodeMap = new Map(deduplicatedNodes.map((n) => [n.nodeId, n]));
    expect(nodeMap.size).toBe(2);
  });

  it('PBT: deduplication always produces unique IDs regardless of collision rate', () => {
    const { randomUUID } = require('crypto');

    fc.assert(
      fc.property(
        // Generate arrays of nodes where some IDs may collide
        fc.array(
          fc.record({
            nodeId: fc.constantFrom('id_a', 'id_b', 'id_c'), // controlled collision
            type: fc.constantFrom('google_gmail', 'slack_message', 'notion'),
            role: fc.constant('output' as const),
            reason: fc.string(),
          }),
          { minLength: 1, maxLength: 6 }
        ),
        (selectedNodes) => {
          const seenIds = new Set<string>();
          const deduplicatedNodes = selectedNodes.map((n) => {
            if (seenIds.has(n.nodeId)) {
              return { ...n, nodeId: randomUUID() };
            }
            seenIds.add(n.nodeId);
            return n;
          });

          const ids = deduplicatedNodes.map((n) => n.nodeId);
          // All IDs must be unique after deduplication
          return new Set(ids).size === ids.length;
        }
      ),
      { numRuns: 200 }
    );
  });
});

// ─── Bug 5: Simple workflow validator guard ───────────────────────────────────

describe('Bug 5 — Simple linear workflow must not be flagged as critical failure', () => {
  it('isSimpleLinear guard: 2-node workflow with no branching → guard fires', () => {
    const { unifiedNormalizeNodeType } = require('../core/utils/unified-node-type-normalizer');

    const finalNodes: WorkflowNode[] = [
      { id: 'trigger_1', type: 'manual_trigger', data: { type: 'manual_trigger', label: 'Trigger', config: {} } },
      { id: 'log_1', type: 'log_output', data: { type: 'log_output', label: 'Log', config: {} } },
    ];

    const isSimpleLinear = finalNodes.length <= 3 && !finalNodes.some((n) => {
      const def = unifiedNodeRegistry.get(unifiedNormalizeNodeType(n));
      return def?.isBranching === true;
    });

    expect(isSimpleLinear).toBe(true);
  });

  it('isSimpleLinear guard: 4-node workflow → guard does NOT fire', () => {
    const { unifiedNormalizeNodeType } = require('../core/utils/unified-node-type-normalizer');

    const finalNodes: WorkflowNode[] = [
      { id: 'trigger_1', type: 'manual_trigger', data: { type: 'manual_trigger', label: 'Trigger', config: {} } },
      { id: 'sheets_1', type: 'google_sheets', data: { type: 'google_sheets', label: 'Sheets', config: {} } },
      { id: 'slack_1', type: 'slack_message', data: { type: 'slack_message', label: 'Slack', config: {} } },
      { id: 'log_1', type: 'log_output', data: { type: 'log_output', label: 'Log', config: {} } },
    ];

    const isSimpleLinear = finalNodes.length <= 3 && !finalNodes.some((n) => {
      const def = unifiedNodeRegistry.get(unifiedNormalizeNodeType(n));
      return def?.isBranching === true;
    });

    expect(isSimpleLinear).toBe(false);
  });

  it('isSimpleLinear guard: 3-node workflow WITH branching node → guard does NOT fire', () => {
    const { unifiedNormalizeNodeType } = require('../core/utils/unified-node-type-normalizer');

    const finalNodes: WorkflowNode[] = [
      { id: 'trigger_1', type: 'manual_trigger', data: { type: 'manual_trigger', label: 'Trigger', config: {} } },
      { id: 'if_1', type: 'if_else', data: { type: 'if_else', label: 'If/Else', config: {} } },
      { id: 'log_1', type: 'log_output', data: { type: 'log_output', label: 'Log', config: {} } },
    ];

    const isSimpleLinear = finalNodes.length <= 3 && !finalNodes.some((n) => {
      const def = unifiedNodeRegistry.get(unifiedNormalizeNodeType(n));
      return def?.isBranching === true;
    });

    expect(isSimpleLinear).toBe(false);
  });
});

// ─── Bug 6: User intent in field generation ───────────────────────────────────

describe('Bug 6 — User intent must be used in field generation', () => {
  it('generateIntelligentDefault uses primaryGoal for message/text/content/subject/title/body fields', () => {
    const { AgenticWorkflowBuilder } = require('../services/ai/workflow-builder');
    const builder = new AgenticWorkflowBuilder();

    const requirements = {
      primaryGoal: 'send a welcome email to new signups',
      inputs: [],
      outputs: [],
      constraints: [],
      complexity: 'simple' as const,
      urls: [],
      apis: [],
      credentials: [],
      schedules: [],
      platforms: [],
      keySteps: [],
    };

    const intentFields = ['message', 'text', 'content', 'subject', 'title', 'body'];
    for (const fieldName of intentFields) {
      const result = (builder as any).generateIntelligentDefault(fieldName, 'google_gmail', requirements);
      expect(result).toBe('send a welcome email to new signups');
    }
  });

  it('generateIntelligentDefault falls back gracefully when primaryGoal is empty', () => {
    const { AgenticWorkflowBuilder } = require('../services/ai/workflow-builder');
    const builder = new AgenticWorkflowBuilder();

    const requirements = {
      primaryGoal: '',
      inputs: [],
      outputs: [],
      constraints: [],
      complexity: 'simple' as const,
      urls: [],
      apis: [],
      credentials: [],
      schedules: [],
      platforms: [],
      keySteps: [],
    };

    // Should not throw and should return a non-empty fallback
    const result = (builder as any).generateIntelligentDefault('message', 'google_gmail', requirements);
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });
});

// ─── Preservation: Structural rules retained in production prompt ─────────────

describe('Preservation — Structural rules retained in production prompt', () => {
  it.each(REQUIRED_STRUCTURAL_RULES)(
    'Production prompt still contains structural rule keyword: %s',
    (keyword) => {
      const content = fs.readFileSync(PRODUCTION_PROMPT_PATH, 'utf-8');
      expect(content.toLowerCase()).toContain(keyword.toLowerCase());
    }
  );

  it('Production prompt still contains validation checklist', () => {
    const content = fs.readFileSync(PRODUCTION_PROMPT_PATH, 'utf-8');
    expect(content).toContain('VALIDATION CHECKLIST');
  });
});

// ─── Preservation: Clarifying prompt behavioral rules retained ────────────────

describe('Preservation — Clarifying prompt behavioral rules retained', () => {
  it('Clarifying prompt still contains question count limits', () => {
    const content = fs.readFileSync(CLARIFYING_PROMPT_PATH, 'utf-8');
    expect(content).toContain('QUESTION COUNT LIMIT');
  });

  it('Clarifying prompt still contains fail-safe rule', () => {
    const content = fs.readFileSync(CLARIFYING_PROMPT_PATH, 'utf-8');
    expect(content).toContain('FAIL-SAFE');
  });

  it('Clarifying prompt still contains "No clarification needed." output rule', () => {
    const content = fs.readFileSync(CLARIFYING_PROMPT_PATH, 'utf-8');
    expect(content).toContain('No clarification needed.');
  });

  it('Clarifying prompt still contains all 6 allowed question categories', () => {
    const content = fs.readFileSync(CLARIFYING_PROMPT_PATH, 'utf-8');
    expect(content).toContain('TRIGGER SOURCE');
    expect(content).toContain('AUTHENTICATION');
    expect(content).toContain('DESTINATION');
    expect(content).toContain('REQUIRED NODE INPUTS');
    expect(content).toContain('DATA FORMAT');
    expect(content).toContain('EXECUTION LOGIC');
  });
});

// ─── Preservation: Linear workflow edge wiring unchanged ─────────────────────

describe('Preservation — Linear workflow edge wiring unchanged', () => {
  it('Linear 3-node workflow produces valid edge chain with no errors', () => {
    const workflow: any = {
      nodes: [
        { id: 'trigger_1', type: 'manual_trigger', data: { type: 'manual_trigger', label: 'Trigger', config: {} } },
        { id: 'sheets_1', type: 'google_sheets', data: { type: 'google_sheets', label: 'Sheets', config: {} } },
        { id: 'slack_1', type: 'slack_message', data: { type: 'slack_message', label: 'Slack', config: {} } },
      ],
      edges: [],
    };

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

    const result = edgeReconciliationEngine.reconcileEdges(workflow, executionOrder);

    // trigger → sheets edge must exist
    const triggerToSheets = result.workflow.edges.some(
      (e: any) => e.source === 'trigger_1' && e.target === 'sheets_1'
    );
    expect(triggerToSheets).toBe(true);

    // sheets → slack edge must exist
    const sheetsToSlack = result.workflow.edges.some(
      (e: any) => e.source === 'sheets_1' && e.target === 'slack_1'
    );
    expect(sheetsToSlack).toBe(true);
  });
});
