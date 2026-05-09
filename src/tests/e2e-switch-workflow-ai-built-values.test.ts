/**
 * E2E Test: Switch Workflow with AI-Built Values
 * 
 * Task 9.2: Write E2E test for switch workflow with AI-built values
 * 
 * This test validates the complete workflow generation pipeline for conditional workflows
 * with switch nodes. It verifies:
 * 
 * 1. Workflow generation from user prompt requiring multi-case conditional logic
 * 2. Branching structure with switch node (N cases)
 * 3. AI-built values populated for relevant fields with `_fillMode: 'buildtime_ai_once'`
 * 4. Workflow summary correctly explains all case branches
 * 
 * Requirements Coverage: 1.2, 2.1, 2.2, 2.3
 */

import { describe, it, expect, beforeAll, jest } from '@jest/globals';
import { WorkflowGenerationPipeline } from '../services/ai/pipeline/workflow-generation-pipeline';
import { unifiedNodeRegistry } from '../core/registry/unified-node-registry';
import { unifiedGraphOrchestrator } from '../core/orchestration/unified-graph-orchestrator';
import type { Workflow, WorkflowNode, WorkflowEdge } from '../core/types/ai-types';
import { randomUUID } from 'crypto';

// Mock Gemini orchestrator for deterministic testing
jest.mock('../services/ai/gemini-orchestrator', () => ({
  geminiOrchestrator: {
    processRequest: jest.fn(),
  },
}));

import { geminiOrchestrator } from '../services/ai/gemini-orchestrator';

describe('E2E: Switch Workflow with AI-Built Values', () => {
  let pipeline: WorkflowGenerationPipeline;

  beforeAll(() => {
    pipeline = new WorkflowGenerationPipeline();
  });

  /**
   * Test: Generate workflow with switch node from user prompt
   * 
   * Validates:
   * - Requirement 1.2: Workflow summary explains all N case branches
   * - Requirement 2.1: AI populates field values based on user intent
   * - Requirement 2.2: AI-built values stored with _fillMode: 'buildtime_ai_once'
   * - Requirement 2.3: Fields with fillMode.default: 'buildtime_ai_once' are populated
   */
  it('should generate switch workflow with AI-built values and explain all branches', async () => {
    // Arrange: User prompt requiring multi-case conditional logic
    const userPrompt = 'Based on priority (low, medium, high), send different notification types: high priority sends Slack, medium sends email, low sends log message';
    const workflowId = randomUUID();
    const userId = 'test-user';

    // Mock LLM responses for each pipeline stage
    const mockLLMResponses = setupMockLLMResponses();
    (geminiOrchestrator.processRequest as jest.Mock).mockImplementation(mockLLMResponses);

    // Act: Generate workflow through complete pipeline
    const result = await pipeline.run({
      userPrompt,
      userId,
    });

    // Assert: Workflow generated successfully
    expect(result).toBeDefined();
    expect(result.ok).toBe(true);
    
    // Type guard: ensure we have a successful result with workflow
    if (!result.ok) {
      throw new Error(`Pipeline failed`);
    }
    
    if ('needsCapabilitySelection' in result) {
      throw new Error(`Pipeline needs capability selection`);
    }

    expect(result.workflow).toBeDefined();
    expect(result.workflow.nodes).toBeDefined();
    expect(result.workflow.edges).toBeDefined();

    const workflow = result.workflow;

    // ─── Verify Branching Structure (N cases) ────────────────────────────────

    // Find switch node
    const switchNode = workflow.nodes.find(
      (n: WorkflowNode) => n.data?.type === 'switch'
    );
    expect(switchNode).toBeDefined();
    expect(switchNode?.data?.type).toBe('switch');

    // Verify switch node has N outgoing edges (3 cases: high, medium, low)
    const switchOutgoingEdges = workflow.edges.filter(
      (e: WorkflowEdge) => e.source === switchNode?.id
    );
    expect(switchOutgoingEdges.length).toBeGreaterThanOrEqual(3);

    // Verify each case has a unique target
    const caseTargets = new Set(switchOutgoingEdges.map((e: WorkflowEdge) => e.target));
    expect(caseTargets.size).toBe(switchOutgoingEdges.length);

    // Verify edge types/branch names for switch cases
    const branchNames = switchOutgoingEdges.map(
      (e: WorkflowEdge) => e.branchName || e.type
    );
    expect(branchNames.length).toBeGreaterThanOrEqual(3);

    // Verify switch node is registered as branching node
    const switchDef = unifiedNodeRegistry.get('switch');
    expect(switchDef).toBeDefined();
    expect(switchDef?.isBranching).toBe(true);

    // ─── Verify AI-Built Values Populated ────────────────────────────────────

    // Find notification nodes (Slack, Email, Log)
    const slackNode = workflow.nodes.find(
      (n: WorkflowNode) => n.data?.type === 'slack_message'
    );
    const emailNode = workflow.nodes.find(
      (n: WorkflowNode) => n.data?.type === 'google_gmail' || n.data?.type === 'email'
    );
    const logNode = workflow.nodes.find(
      (n: WorkflowNode) => n.data?.type === 'log_output'
    );

    // At least one notification node should exist
    const notificationNodes = [slackNode, emailNode, logNode].filter(Boolean);
    expect(notificationNodes.length).toBeGreaterThan(0);

    // Verify AI-built values for each notification node
    for (const node of notificationNodes) {
      if (!node) continue;

      const config = node.data?.config;
      expect(config).toBeDefined();

      // Verify _fillMode metadata exists
      expect(config._fillMode).toBeDefined();
      expect(typeof config._fillMode).toBe('object');

      // Check for AI-built values in relevant fields
      const nodeDef = unifiedNodeRegistry.get(node.data.type);
      expect(nodeDef).toBeDefined();

      if (nodeDef?.inputSchema) {
        // Find fields with fillMode.default: 'buildtime_ai_once'
        const aiBuiltFields = Object.entries(nodeDef.inputSchema).filter(
          ([fieldName, schema]: [string, any]) =>
            schema?.fillMode?.default === 'buildtime_ai_once'
        );

        // Verify AI-built fields have _fillMode set
        for (const [fieldName] of aiBuiltFields) {
          if (config[fieldName] !== undefined && config[fieldName] !== '') {
            // Field has a value, should have _fillMode
            expect(config._fillMode[fieldName]).toBe('buildtime_ai_once');
          }
        }
      }
    }

    // Verify switch node has AI-built cases configuration
    if (switchNode) {
      const switchConfig = switchNode.data?.config;
      expect(switchConfig).toBeDefined();

      // Switch node should have cases array
      expect(switchConfig.cases).toBeDefined();
      expect(Array.isArray(switchConfig.cases)).toBe(true);
      expect(switchConfig.cases.length).toBeGreaterThanOrEqual(3);

      // Verify cases contain expected values (high, medium, low)
      const caseValues = switchConfig.cases.map((c: any) => c.value || c);
      expect(caseValues).toContain('high');
      expect(caseValues).toContain('medium');
      expect(caseValues).toContain('low');

      // Verify _fillMode for cases field
      if (switchConfig._fillMode) {
        expect(switchConfig._fillMode.cases).toBeDefined();
      }
    }

    // ─── Verify Workflow Summary Explains All Branches ───────────────────────

    // Check if workflow has summary metadata
    const summary = workflow.metadata?.summaryV2 || workflow.metadata?.summary;
    expect(summary).toBeDefined();

    if (workflow.metadata?.summaryV2) {
      // Verify WorkflowSummaryV2 structure
      const summaryV2 = workflow.metadata.summaryV2;

      // Verify graph overview indicates branching
      expect(summaryV2.graphOverview).toBeDefined();
      expect(summaryV2.graphOverview.hasBranching).toBe(true);

      // Verify branches array contains switch node information
      expect(summaryV2.branches).toBeDefined();
      expect(Array.isArray(summaryV2.branches)).toBe(true);

      const switchBranch = summaryV2.branches.find(
        (b: any) => b.branchNodeId === switchNode?.id
      );
      expect(switchBranch).toBeDefined();

      // Verify all cases are documented
      expect(switchBranch.cases).toBeDefined();
      expect(switchBranch.cases.length).toBeGreaterThanOrEqual(3);

      // Verify each case has target node information
      for (const caseInfo of switchBranch.cases) {
        expect(caseInfo.caseKey).toBeDefined();
        expect(caseInfo.targetNodeId).toBeDefined();
        expect(caseInfo.targetNodeType).toBeDefined();
      }

      // Verify path outcomes explain all branches
      expect(summaryV2.pathOutcomes).toBeDefined();
      expect(Array.isArray(summaryV2.pathOutcomes)).toBe(true);
      expect(summaryV2.pathOutcomes.length).toBeGreaterThanOrEqual(3);
    }

    // ─── Verify Graph Structure Validity ─────────────────────────────────────

    // Validate workflow structure using unified graph orchestrator
    const validation = unifiedGraphOrchestrator.validateWorkflow(workflow);
    expect(validation.valid).toBe(true);
    expect(validation.errors).toHaveLength(0);

    // Verify no cycles
    expect(validation.errors.some((e: string) => e.toLowerCase().includes('cycle'))).toBe(
      false
    );

    // Verify all nodes reachable from trigger
    const triggerNode = workflow.nodes.find(
      (n: WorkflowNode) =>
        n.data?.type === 'manual_trigger' ||
        n.data?.type === 'webhook' ||
        n.data?.type === 'schedule'
    );
    expect(triggerNode).toBeDefined();

    // Verify no orphan nodes
    const orphanNodes = workflow.nodes.filter((node: WorkflowNode) => {
      if (node.id === triggerNode?.id) return false; // Trigger doesn't need incoming edge
      const hasIncomingEdge = workflow.edges.some(
        (e: WorkflowEdge) => e.target === node.id
      );
      return !hasIncomingEdge;
    });
    expect(orphanNodes.length).toBe(0);

    // ─── Verify Edge Routing for Switch Cases ────────────────────────────────

    // Each switch outgoing edge should have proper routing metadata
    for (const edge of switchOutgoingEdges) {
      // Edge should have type or branchName indicating the case
      expect(edge.type || edge.branchName).toBeDefined();

      // Target node should exist
      const targetNode = workflow.nodes.find((n: WorkflowNode) => n.id === edge.target);
      expect(targetNode).toBeDefined();
    }

    // ─── Verify AI-Built Values Preservation ─────────────────────────────────

    // Verify that AI-built values are non-empty for populated fields
    for (const node of notificationNodes) {
      if (!node) continue;

      const config = node.data?.config;
      const fillMode = config._fillMode;

      if (fillMode) {
        for (const [fieldName, mode] of Object.entries(fillMode)) {
          if (mode === 'buildtime_ai_once') {
            // Field should have a non-empty value
            const value = config[fieldName];
            expect(value).toBeDefined();
            expect(value).not.toBe('');
            expect(value).not.toBe(null);
          }
        }
      }
    }
  }, 60000); // 60 second timeout for E2E test with LLM calls

  /**
   * Test: Verify switch node degree rules
   * 
   * Validates that switch node follows strict degree rules:
   * - In-degree: exactly 1
   * - Out-degree: N (2 or more)
   */
  it('should enforce switch node degree rules', async () => {
    const userPrompt = 'Route tasks by status: pending→process, approved→execute, rejected→archive';
    const userId = 'test-user';

    const mockLLMResponses = setupMockLLMResponses();
    (geminiOrchestrator.processRequest as jest.Mock).mockImplementation(mockLLMResponses);

    const result = await pipeline.run({
      userPrompt,
      userId,
    });

    if (!result.ok) {
      throw new Error(`Pipeline failed`);
    }
    
    if ('needsCapabilitySelection' in result) {
      throw new Error(`Pipeline needs capability selection`);
    }

    const workflow = result.workflow;
    const switchNode = workflow.nodes.find((n: WorkflowNode) => n.data?.type === 'switch');

    if (switchNode) {
      // Verify in-degree: exactly 1
      const incomingEdges = workflow.edges.filter(
        (e: WorkflowEdge) => e.target === switchNode.id
      );
      expect(incomingEdges.length).toBe(1);

      // Verify out-degree: N (at least 2)
      const outgoingEdges = workflow.edges.filter(
        (e: WorkflowEdge) => e.source === switchNode.id
      );
      expect(outgoingEdges.length).toBeGreaterThanOrEqual(2);

      // Verify each outgoing edge has unique target
      const targets = outgoingEdges.map((e: WorkflowEdge) => e.target);
      const uniqueTargets = new Set(targets);
      expect(uniqueTargets.size).toBe(targets.length);
    }
  }, 60000);

  /**
   * Test: Verify AI-built values for switch cases field
   * 
   * Validates that switch node cases are populated by AI with proper metadata
   */
  it('should populate switch cases as AI-built values', async () => {
    const userPrompt = 'Based on customer tier (bronze, silver, gold, platinum), assign different support levels';
    const userId = 'test-user';

    const mockLLMResponses = setupMockLLMResponses();
    (geminiOrchestrator.processRequest as jest.Mock).mockImplementation(mockLLMResponses);

    const result = await pipeline.run({
      userPrompt,
      userId,
    });

    if (!result.ok) {
      throw new Error(`Pipeline failed`);
    }
    
    if ('needsCapabilitySelection' in result) {
      throw new Error(`Pipeline needs capability selection`);
    }

    const workflow = result.workflow;
    const switchNode = workflow.nodes.find((n: WorkflowNode) => n.data?.type === 'switch');

    expect(switchNode).toBeDefined();

    if (switchNode) {
      const config = switchNode.data?.config;

      // Verify cases array exists and is populated
      expect(config.cases).toBeDefined();
      expect(Array.isArray(config.cases)).toBe(true);
      expect(config.cases.length).toBeGreaterThanOrEqual(4); // bronze, silver, gold, platinum

      // Verify cases contain expected tier values
      const caseValues = config.cases.map((c: any) => c.value || c);
      expect(caseValues).toContain('bronze');
      expect(caseValues).toContain('silver');
      expect(caseValues).toContain('gold');
      expect(caseValues).toContain('platinum');

      // Verify _fillMode metadata for cases
      if (config._fillMode) {
        // Cases field should be marked as AI-built if populated by AI
        expect(config._fillMode.cases).toBeDefined();
      }
    }
  }, 60000);
});

/**
 * Setup mock LLM responses for workflow generation pipeline
 * 
 * Returns a mock implementation that provides deterministic responses
 * for each pipeline stage
 */
function setupMockLLMResponses() {
  let callCount = 0;

  return async (params: any) => {
    callCount++;

    // Stage 1: Intent Analysis
    if (params.systemPrompt?.includes('intent') || callCount === 1) {
      return JSON.stringify({
        capabilities: ['conditional_routing', 'notifications'],
        triggerType: 'manual_trigger',
        dataFlow: 'priority-based routing to different notification channels',
      });
    }

    // Stage 2: Node Selection
    if (params.systemPrompt?.includes('node selection') || callCount === 2) {
      return JSON.stringify({
        nodes: [
          { type: 'manual_trigger', reason: 'User initiates workflow' },
          { type: 'switch', reason: 'Route based on priority level' },
          { type: 'slack_message', reason: 'High priority notification' },
          { type: 'google_gmail', reason: 'Medium priority notification' },
          { type: 'log_output', reason: 'Low priority notification' },
        ],
      });
    }

    // Stage 3: Edge Reasoning
    if (params.systemPrompt?.includes('edge') || callCount === 3) {
      return JSON.stringify({
        edges: [
          { from: 'manual_trigger', to: 'switch', type: 'main' },
          { from: 'switch', to: 'slack_message', type: 'high', branchName: 'high' },
          { from: 'switch', to: 'google_gmail', type: 'medium', branchName: 'medium' },
          { from: 'switch', to: 'log_output', type: 'low', branchName: 'low' },
        ],
      });
    }

    // Stage 4: Property Population
    if (params.systemPrompt?.includes('property') || callCount === 4) {
      return JSON.stringify({
        switch: {
          cases: [
            { value: 'high', label: 'High Priority' },
            { value: 'medium', label: 'Medium Priority' },
            { value: 'low', label: 'Low Priority' },
          ],
          expression: '{{$json.priority}}',
        },
        slack_message: {
          channel: '#urgent',
          text: 'High priority alert: {{$json.message}}',
        },
        google_gmail: {
          to: '{{$json.email}}',
          subject: 'Medium Priority Notification',
          body: 'This is a medium priority notification.',
        },
        log_output: {
          message: 'Low priority: {{$json.message}}',
        },
      });
    }

    // Stage 5: Workflow Summary
    if (params.systemPrompt?.includes('summary') || callCount === 5) {
      return `
OBJECTIVE: Route notifications based on priority level to appropriate channels.

TRIGGER_DESCRIPTION: Workflow is triggered manually by the user.

DETAILED_FLOW: 
1. Manual trigger initiates the workflow
2. Switch node evaluates the priority field
3. HIGH priority: Routes to Slack for immediate notification
4. MEDIUM priority: Routes to Gmail for email notification
5. LOW priority: Routes to log output for record keeping

CONNECTIONS:
- Trigger connects to switch node via main edge
- Switch node has 3 outgoing edges:
  * high branch → Slack message node
  * medium branch → Gmail node
  * low branch → Log output node
- Each branch handles a specific priority level
- Data flows from trigger through switch to the appropriate notification channel
      `;
    }

    // Default fallback
    return JSON.stringify({ success: true });
  };
}
