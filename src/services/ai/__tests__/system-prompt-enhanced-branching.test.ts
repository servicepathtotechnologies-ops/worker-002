/**
 * Unit Tests: Enhanced System Prompts with Branching Context
 * Feature: workflow-summary-ai-built-values
 * Task: 3.4 - Write unit tests for enhanced system prompts
 * 
 * Tests verify that system prompts include branching context, metadata, and routing information
 * as implemented in tasks 3.1-3.3.
 * 
 * Requirements Coverage: 1.1, 1.2, 1.3, 1.5, 1.7
 */

import { SystemPromptBuilder } from '../system-prompt-builder';
import { buildNodeCatalogText } from '../node-catalog-builder';

describe('Enhanced System Prompts - Branching Context', () => {
  let builder: SystemPromptBuilder;
  let nodeCatalog: string;

  beforeAll(() => {
    builder = new SystemPromptBuilder();
    nodeCatalog = buildNodeCatalogText({ tokenBudget: 8000 });
  });

  describe('Task 3.1: Capability Selection Prompt - Branching Awareness', () => {
    it('should include branching context in capability selection prompt', () => {
      // Requirement 1.1, 1.2: Capability selection must detect branching workflows
      const result = builder.build({
        stage: 'capability_selection',
        nodeCatalog,
        userIntent: 'If priority is high, send via Slack, else send via email',
      });

      const prompt = result.systemPrompt;

      // Verify branching workflow awareness section exists
      expect(prompt).toContain('## BRANCHING WORKFLOW AWARENESS');
      
      // Verify it explains multiple execution paths
      expect(prompt).toMatch(/branches create MULTIPLE EXECUTION PATHS/i);
      
      // Verify it explains branch-specific nodes
      expect(prompt).toMatch(/Each branch path may require DIFFERENT nodes/i);
      
      // Verify examples are provided
      expect(prompt).toContain('if priority is high, send via Slack, else send via email');
      expect(prompt).toContain('route based on status');
    });

    it('should include conditional logic detection instructions', () => {
      // Requirement 1.1: Detect when conditional logic is needed
      const result = builder.build({
        stage: 'capability_selection',
        nodeCatalog,
        userIntent: 'Route based on status: pending, approved, rejected',
      });

      const prompt = result.systemPrompt;

      // Verify conditional logic detection section
      expect(prompt).toContain('## CRITICAL RULE — DETECT CONDITIONAL LOGIC AND BRANCHING');
      
      // Verify keywords are listed
      expect(prompt).toMatch(/Keywords:.*"if".*"else".*"when"/);
      expect(prompt).toMatch(/based on.*depending on.*route by/i);
      
      // Verify operators are listed
      expect(prompt).toContain('Operators: >, <, ≤, ≥, ==, !=');
      
      // Verify if_else vs switch guidance
      expect(prompt).toMatch(/For binary conditions.*use if_else/i);
      expect(prompt).toMatch(/For multi-case conditions.*use switch/i);
    });

    it('should explain branch action step emission', () => {
      // Requirement 1.2: Explain how to emit steps for branching workflows
      const result = builder.build({
        stage: 'capability_selection',
        nodeCatalog,
        userIntent: 'If status is active, notify via Slack and email',
      });

      const prompt = result.systemPrompt;

      // Verify branch action guidance
      expect(prompt).toMatch(/When a branch requires an action, emit a SEPARATE step/i);
      expect(prompt).toMatch(/Linear workflows.*ONE step per action/i);
      expect(prompt).toMatch(/Branching workflows.*ONE step per BRANCH ACTION/i);
    });
  });

  describe('Task 3.2: Node Selection Prompt - Branching Metadata', () => {
    it('should include branching node metadata from catalog', () => {
      // Requirement 1.1, 1.2, 1.3: Node selection must understand branching metadata
      const result = builder.build({
        stage: 'node_selection',
        nodeCatalog,
        userIntent: 'If age > 18, approve, else reject',
      });

      const prompt = result.systemPrompt;

      // Verify branching node metadata section exists
      expect(prompt).toContain('## BRANCHING NODE METADATA (from NODE CATALOG)');
      
      // Verify isBranching flag explanation
      expect(prompt).toMatch(/isBranching: true.*indicates this node creates multiple execution paths/i);
      
      // Verify outgoingPorts explanation
      expect(prompt).toMatch(/outgoingPorts: array of port names/i);
      expect(prompt).toContain('["true", "false"] for if_else');
      expect(prompt).toContain('["case_1", "case_2", ...] for switch');
    });

    it('should explain edge routing for branching nodes', () => {
      // Requirement 1.5, 1.7: Edge routing information must be included
      const result = builder.build({
        stage: 'node_selection',
        nodeCatalog,
        userIntent: 'Route by priority: high, medium, low',
      });

      const prompt = result.systemPrompt;

      // Verify edge routing explanation
      expect(prompt).toMatch(/Edge routing: edges from branching nodes use port names as edge types/i);
      
      // Verify if_else edge types
      expect(prompt).toMatch(/if_else: edges with type "true" and "false"/i);
      
      // Verify switch edge types
      expect(prompt).toMatch(/switch: edges with type matching case values/i);
      expect(prompt).toContain('"high", "medium", "low"');
    });

    it('should require downstream nodes for each branch path', () => {
      // Requirement 1.3: Ensure branches have downstream nodes
      const result = builder.build({
        stage: 'node_selection',
        nodeCatalog,
        userIntent: 'If condition is true, send email, else log',
      });

      const prompt = result.systemPrompt;

      // Verify downstream node requirement
      expect(prompt).toMatch(/ensure downstream nodes exist for EACH branch path/i);
      
      // Verify branch node uniqueness rule
      expect(prompt).toContain('## CRITICAL RULE — BRANCH NODE UNIQUENESS');
      expect(prompt).toMatch(/Each branch MUST have its OWN independent node instance/i);
      expect(prompt).toMatch(/NEVER share a single node across multiple exclusive branches/i);
    });

    it('should explain branch-aware output generation', () => {
      // Requirement 1.2: Branch-specific output nodes
      const result = builder.build({
        stage: 'node_selection',
        nodeCatalog,
        userIntent: 'Switch on status: log if pending, email if approved',
      });

      const prompt = result.systemPrompt;

      // Verify branch-aware output section
      expect(prompt).toContain('## CRITICAL RULE — BRANCH-AWARE OUTPUT GENERATION');
      
      // Verify separate output nodes per branch
      expect(prompt).toMatch(/Generate SEPARATE log_output nodes for each branch/i);
      expect(prompt).toMatch(/Do NOT share a single log_output node across multiple branches/i);
      
      // Verify conditional output generation
      expect(prompt).toMatch(/If only ONE branch mentions logging, only THAT branch gets a log_output/i);
    });
  });

  describe('Task 3.3: Edge Reasoning Prompt - Branch Routing', () => {
    it('should include branch routing rules for if_else nodes', () => {
      // Requirement 1.5, 1.7: Edge reasoning must handle branch routing
      const result = builder.build({
        stage: 'edge_reasoning',
        nodeCatalog,
        userIntent: 'If score > 80, pass, else fail',
        stageContext: {
          selectedNodes: [
            { type: 'manual_trigger', role: 'trigger', reason: 'trigger', nodeId: 'node-1' },
            { type: 'if_else', role: 'logic', reason: 'condition', nodeId: 'node-2' },
            { type: 'log_output', role: 'terminal', reason: 'pass', nodeId: 'node-3' },
            { type: 'log_output', role: 'terminal', reason: 'fail', nodeId: 'node-4' },
          ],
        },
      });

      const prompt = result.systemPrompt;

      // Verify if_else edge rules
      expect(prompt).toMatch(/For if_else: replace the single outgoing edge with TWO edges/i);
      expect(prompt).toMatch(/one type "true", one type "false"/i);
    });

    it('should include branch routing rules for switch nodes', () => {
      // Requirement 1.5, 1.7: Switch node edge routing
      const result = builder.build({
        stage: 'edge_reasoning',
        nodeCatalog,
        userIntent: 'Route by status: pending, approved, rejected',
        stageContext: {
          selectedNodes: [
            { type: 'manual_trigger', role: 'trigger', reason: 'trigger', nodeId: 'node-1' },
            { type: 'switch', role: 'logic', reason: 'routing', nodeId: 'node-2' },
            { type: 'log_output', role: 'terminal', reason: 'pending', nodeId: 'node-3' },
            { type: 'log_output', role: 'terminal', reason: 'approved', nodeId: 'node-4' },
            { type: 'log_output', role: 'terminal', reason: 'rejected', nodeId: 'node-5' },
          ],
        },
      });

      const prompt = result.systemPrompt;

      // Verify switch edge rules
      expect(prompt).toMatch(/For switch with K cases: replace the single outgoing edge with K edges/i);
      
      // Verify actual case value usage (not case_1, case_2)
      expect(prompt).toMatch(/Use the ACTUAL CASE VALUE as the edge type, NOT "case_1"\/"case_2"/i);
      expect(prompt).toContain('switch with cases "high", "medium", "low" → edges with type "high", "medium", "low"');
      
      // Verify different target nodes per case
      expect(prompt).toMatch(/Each case value edge connects the switch node to a DIFFERENT downstream node/i);
      expect(prompt).toMatch(/NEVER reuse the same target node for two different case edges/i);
    });

    it('should explain nested branching edge routing', () => {
      // Requirement 1.4: Nested branching with proper edge labels
      const result = builder.build({
        stage: 'edge_reasoning',
        nodeCatalog,
        userIntent: 'If type is A, route by priority (high/low), else if type is B, log',
        stageContext: {
          selectedNodes: [
            { type: 'manual_trigger', role: 'trigger', reason: 'trigger', nodeId: 'node-1' },
            { type: 'switch', role: 'logic', reason: 'outer', nodeId: 'node-2' },
            { type: 'switch', role: 'logic', reason: 'inner', nodeId: 'node-3' },
            { type: 'log_output', role: 'terminal', reason: 'high', nodeId: 'node-4' },
            { type: 'log_output', role: 'terminal', reason: 'low', nodeId: 'node-5' },
            { type: 'log_output', role: 'terminal', reason: 'B', nodeId: 'node-6' },
          ],
        },
      });

      const prompt = result.systemPrompt;

      // Verify nested branching explanation
      expect(prompt).toMatch(/For NESTED branching/i);
      expect(prompt).toMatch(/the inner branching node's outgoing edges MUST use the inner switch's own case values/i);
      expect(prompt).toMatch(/NOT the outer switch's case values/i);
      
      // Verify nested example is provided
      expect(prompt).toContain('outer_switch → (case "A") → inner_switch');
      expect(prompt).toContain('inner_switch → (case "X") → node_for_AX');
      expect(prompt).toContain('The inner_switch edges use "X" and "Y", NOT "A" or "B"');
    });

    it('should require separate terminal nodes per branch', () => {
      // Requirement 1.2, 1.3: Each branch needs its own terminal
      const result = builder.build({
        stage: 'edge_reasoning',
        nodeCatalog,
        userIntent: 'If valid, log success, else log error',
        stageContext: {
          selectedNodes: [
            { type: 'manual_trigger', role: 'trigger', reason: 'trigger', nodeId: 'node-1' },
            { type: 'if_else', role: 'logic', reason: 'validation', nodeId: 'node-2' },
            { type: 'log_output', role: 'terminal', reason: 'success', nodeId: 'node-3' },
            { type: 'log_output', role: 'terminal', reason: 'error', nodeId: 'node-4' },
          ],
        },
      });

      const prompt = result.systemPrompt;

      // Verify separate terminal requirement
      expect(prompt).toMatch(/For branching terminal logging: each branch MUST connect to its OWN SEPARATE log_output node/i);
      expect(prompt).toMatch(/NEVER share a single log_output across multiple branches/i);
      expect(prompt).toMatch(/If 3 branches each need a log_output, you need 3 separate log_output nodes/i);
    });

    it('should include DAG constraints with branching rules', () => {
      // Requirement 1.1, 1.5: DAG constraints must include branching
      const result = builder.build({
        stage: 'edge_reasoning',
        nodeCatalog,
        userIntent: 'Route by category',
        stageContext: {
          selectedNodes: [
            { type: 'manual_trigger', role: 'trigger', reason: 'trigger', nodeId: 'node-1' },
            { type: 'switch', role: 'logic', reason: 'routing', nodeId: 'node-2' },
          ],
        },
      });

      const prompt = result.systemPrompt;

      // Verify DAG constraints section exists
      expect(prompt).toContain('## HARD CONSTRAINTS');
      expect(prompt).toMatch(/DAG STRUCTURAL CONSTRAINTS/i);
      
      // Verify branching node constraints
      expect(prompt).toMatch(/BRANCHING NODES.*MUST USE LABELED EDGES/i);
      expect(prompt).toMatch(/if_else: exactly two outgoing edges.*"true".*"false"/i);
      expect(prompt).toMatch(/switch: exactly one outgoing edge per case value/i);
    });
  });

  describe('Cross-Stage Consistency', () => {
    it('should maintain consistent branching terminology across all stages', () => {
      // Verify consistent terminology across capability, node selection, and edge reasoning
      const capabilityResult = builder.build({
        stage: 'capability_selection',
        nodeCatalog,
        userIntent: 'If condition, do action',
      });

      const nodeSelectionResult = builder.build({
        stage: 'node_selection',
        nodeCatalog,
        userIntent: 'If condition, do action',
      });

      const edgeReasoningResult = builder.build({
        stage: 'edge_reasoning',
        nodeCatalog,
        userIntent: 'If condition, do action',
        stageContext: {
          selectedNodes: [
            { type: 'manual_trigger', role: 'trigger', reason: 'trigger', nodeId: 'node-1' },
            { type: 'if_else', role: 'logic', reason: 'condition', nodeId: 'node-2' },
          ],
        },
      });

      // All stages should mention branching
      expect(capabilityResult.systemPrompt).toMatch(/branch/i);
      expect(nodeSelectionResult.systemPrompt).toMatch(/branch/i);
      expect(edgeReasoningResult.systemPrompt).toMatch(/branch/i);

      // All stages should mention if_else and switch
      expect(capabilityResult.systemPrompt).toContain('if_else');
      expect(capabilityResult.systemPrompt).toContain('switch');
      expect(nodeSelectionResult.systemPrompt).toContain('if_else');
      expect(nodeSelectionResult.systemPrompt).toContain('switch');
      expect(edgeReasoningResult.systemPrompt).toContain('if_else');
      expect(edgeReasoningResult.systemPrompt).toContain('switch');
    });

    it('should provide consistent edge type terminology', () => {
      // Verify edge types are consistently described
      const nodeSelectionResult = builder.build({
        stage: 'node_selection',
        nodeCatalog,
        userIntent: 'Route by status',
      });

      const edgeReasoningResult = builder.build({
        stage: 'edge_reasoning',
        nodeCatalog,
        userIntent: 'Route by status',
        stageContext: {
          selectedNodes: [
            { type: 'manual_trigger', role: 'trigger', reason: 'trigger', nodeId: 'node-1' },
            { type: 'switch', role: 'logic', reason: 'routing', nodeId: 'node-2' },
          ],
        },
      });

      // Both should mention "true" and "false" for if_else
      expect(nodeSelectionResult.systemPrompt).toMatch(/"true".*"false"/);
      expect(edgeReasoningResult.systemPrompt).toMatch(/"true".*"false"/);

      // Both should mention case values for switch
      expect(nodeSelectionResult.systemPrompt).toMatch(/case values/i);
      expect(edgeReasoningResult.systemPrompt).toMatch(/case values/i);
    });
  });

  describe('Validation and Repair Stages', () => {
    it('should include branching validation in validation stage', () => {
      // Requirement 1.5: Validation must check branching structure
      const result = builder.build({
        stage: 'validation',
        nodeCatalog,
        userIntent: 'If condition, do action',
        stageContext: {
          selectedNodes: [
            { type: 'manual_trigger', role: 'trigger', reason: 'trigger', nodeId: 'node-1' },
            { type: 'if_else', role: 'logic', reason: 'condition', nodeId: 'node-2' },
          ],
          edgeList: [
            { source: 'node-1', target: 'node-2', type: 'main' },
          ],
        },
      });

      const prompt = result.systemPrompt;

      // Verify validation dimensions include structural validity
      expect(prompt).toMatch(/STRUCTURAL VALIDITY/i);
      expect(prompt).toMatch(/Are all edges correctly typed/i);
      
      // Verify it checks for reachability (important for branching)
      expect(prompt).toMatch(/Is every node reachable from the trigger/i);
    });

    it('should include DAG constraints in repair stage', () => {
      // Requirement 1.5: Repair must fix branching issues
      const result = builder.build({
        stage: 'repair',
        nodeCatalog,
        userIntent: 'If condition, do action',
        stageContext: {
          selectedNodes: [
            { type: 'manual_trigger', role: 'trigger', reason: 'trigger', nodeId: 'node-1' },
            { type: 'if_else', role: 'logic', reason: 'condition', nodeId: 'node-2' },
          ],
          edgeList: [
            { source: 'node-1', target: 'node-2', type: 'main' },
          ],
          validationIssues: [
            { severity: 'error', description: 'Missing branch edges' },
          ],
        },
      });

      const prompt = result.systemPrompt;

      // Verify DAG constraints are included
      expect(prompt).toContain('## HARD CONSTRAINTS');
      expect(prompt).toMatch(/DAG STRUCTURAL CONSTRAINTS/i);
      
      // Verify branching rules are included
      expect(prompt).toMatch(/BRANCHING NODES.*MUST USE LABELED EDGES/i);
    });
  });
});
