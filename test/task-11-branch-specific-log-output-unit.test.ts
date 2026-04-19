/**
 * Unit tests for Task 11: Branch-specific log_output generation
 * 
 * These tests verify that:
 * 1. expandBranchSteps preserves branch metadata
 * 2. detectBranchingNodesAndOutputs correctly identifies branching nodes
 * 3. generateBranchSpecificLogOutputs creates separate log_output nodes per branch
 */

import { AgenticWorkflowBuilder } from '../src/services/ai/workflow-builder';
import type { PlannedStep } from '../src/core/types/workflow-plan';

describe('Task 11: Branch-specific log_output generation', () => {
  let workflowBuilder: AgenticWorkflowBuilder;

  beforeEach(() => {
    workflowBuilder = new AgenticWorkflowBuilder();
  });

  describe('expandBranchSteps - Branch metadata preservation', () => {
    it('should preserve branch metadata when expanding switch branches', () => {
      const steps: PlannedStep[] = [
        {
          id: 'trigger_1',
          type: 'manual_trigger',
          role: 'trigger',
          config: {},
        },
        {
          id: 'switch_1',
          type: 'switch',
          role: 'branch',
          config: {
            cases: ['admin', 'editor', 'viewer'],
          },
        },
        {
          id: 'action_1',
          type: 'log_output',
          role: 'output',
          config: {},
        },
      ];

      // Access private method via type assertion
      const expandedSteps = (workflowBuilder as any).expandBranchSteps(steps);

      // Should have trigger + switch + 3 expanded steps (one per case)
      expect(expandedSteps.length).toBe(5);

      // Check that expanded steps have branch metadata
      const expandedActions = expandedSteps.slice(2); // Skip trigger and switch
      expect(expandedActions.length).toBe(3);

      // First expanded step should have metadata for first case
      expect(expandedActions[0].config?.metadata?.branchCase).toBeDefined();
      expect(expandedActions[0].config?.metadata?.branchParent).toBe('switch_1');

      // All expanded steps should have unique branch cases
      const branchCases = expandedActions.map((s: PlannedStep) => s.config?.metadata?.branchCase);
      expect(new Set(branchCases).size).toBe(3); // All unique
    });

    it('should preserve branch metadata when expanding if_else branches', () => {
      const steps: PlannedStep[] = [
        {
          id: 'trigger_1',
          type: 'manual_trigger',
          role: 'trigger',
          config: {},
        },
        {
          id: 'if_else_1',
          type: 'if_else',
          role: 'branch',
          config: {},
        },
        {
          id: 'action_1',
          type: 'log_output',
          role: 'output',
          config: {},
        },
      ];

      const expandedSteps = (workflowBuilder as any).expandBranchSteps(steps);

      // Should have trigger + if_else + 2 expanded steps (true/false)
      expect(expandedSteps.length).toBe(4);

      const expandedActions = expandedSteps.slice(2);
      expect(expandedActions.length).toBe(2);

      // Check branch cases are 'true' and 'false'
      const branchCases = expandedActions.map((s: PlannedStep) => s.config?.metadata?.branchCase);
      expect(branchCases).toContain('true');
      expect(branchCases).toContain('false');
    });
  });

  describe('detectBranchingNodesAndOutputs', () => {
    it('should detect switch nodes and analyze branch outputs', () => {
      const steps: PlannedStep[] = [
        {
          id: 'trigger_1',
          type: 'manual_trigger',
          role: 'trigger',
          config: {},
        },
        {
          id: 'switch_1',
          type: 'switch',
          role: 'branch',
          config: {
            cases: ['case_1', 'case_2'],
          },
        },
        {
          id: 'gmail_1',
          type: 'google_gmail',
          role: 'output',
          config: {
            metadata: {
              branchCase: 'case_1',
              branchParent: 'switch_1',
            },
          },
        },
        {
          id: 'log_1',
          type: 'log_output',
          role: 'output',
          config: {
            metadata: {
              branchCase: 'case_2',
              branchParent: 'switch_1',
            },
          },
        },
      ];

      const analysis = (workflowBuilder as any).detectBranchingNodesAndOutputs(steps);

      expect(analysis.branchingNodes.length).toBe(1);
      expect(analysis.branchingNodes[0].type).toBe('switch');
      expect(analysis.branchingNodes[0].branches.size).toBe(2);

      // case_1 should have other output (gmail), not log_output
      const case1Info = analysis.branchingNodes[0].branches.get('case_1');
      expect(case1Info?.hasOtherOutput).toBe(true);
      expect(case1Info?.needsLogOutput).toBe(false);

      // case_2 should have log_output
      const case2Info = analysis.branchingNodes[0].branches.get('case_2');
      expect(case2Info?.needsLogOutput).toBe(true);
      expect(case2Info?.hasOtherOutput).toBe(false);
    });

    it('should detect if_else nodes', () => {
      const steps: PlannedStep[] = [
        {
          id: 'trigger_1',
          type: 'manual_trigger',
          role: 'trigger',
          config: {},
        },
        {
          id: 'if_else_1',
          type: 'if_else',
          role: 'branch',
          config: {},
        },
      ];

      const analysis = (workflowBuilder as any).detectBranchingNodesAndOutputs(steps);

      expect(analysis.branchingNodes.length).toBe(1);
      expect(analysis.branchingNodes[0].type).toBe('if_else');
    });
  });

  describe('generateBranchSpecificLogOutputs', () => {
    it('should generate log_output for branches without any output', () => {
      const existingNodes: any[] = [
        {
          id: 'trigger_1',
          type: 'manual_trigger',
          data: { type: 'manual_trigger', category: 'trigger', config: {} },
        },
        {
          id: 'switch_1',
          type: 'switch',
          data: { type: 'switch', category: 'logic', config: {} },
        },
      ];

      const branchingAnalysis = {
        branchingNodes: [
          {
            index: 1,
            step: { id: 'switch_1', type: 'switch' as const, role: 'branch', config: {} },
            type: 'switch' as const,
            branches: new Map([
              ['case_1', { needsLogOutput: false, hasOtherOutput: false }],
              ['case_2', { needsLogOutput: false, hasOtherOutput: false }],
            ]),
          },
        ],
      };

      const workflowSummary = 'Switch on user role, perform actions';

      const additionalNodes = (workflowBuilder as any).generateBranchSpecificLogOutputs(
        existingNodes,
        branchingAnalysis,
        workflowSummary
      );

      // Should generate 2 log_output nodes (one per branch)
      expect(additionalNodes.length).toBe(2);
      expect(additionalNodes[0].type).toBe('log_output');
      expect(additionalNodes[1].type).toBe('log_output');

      // Check metadata
      expect(additionalNodes[0].data.metadata.branchCase).toBeDefined();
      expect(additionalNodes[0].data.metadata.branchParent).toBe('switch_1');
      expect(additionalNodes[1].data.metadata.branchCase).toBeDefined();
      expect(additionalNodes[1].data.metadata.branchParent).toBe('switch_1');

      // Branch cases should be different
      expect(additionalNodes[0].data.metadata.branchCase).not.toBe(
        additionalNodes[1].data.metadata.branchCase
      );
    });

    it('should NOT generate log_output for branches that already have other outputs', () => {
      const existingNodes: any[] = [
        {
          id: 'trigger_1',
          type: 'manual_trigger',
          data: { type: 'manual_trigger', category: 'trigger', config: {} },
        },
        {
          id: 'switch_1',
          type: 'switch',
          data: { type: 'switch', category: 'logic', config: {} },
        },
      ];

      const branchingAnalysis = {
        branchingNodes: [
          {
            index: 1,
            step: { id: 'switch_1', type: 'switch' as const, role: 'branch', config: {} },
            type: 'switch' as const,
            branches: new Map([
              ['case_1', { needsLogOutput: false, hasOtherOutput: true }], // Has gmail
              ['case_2', { needsLogOutput: false, hasOtherOutput: true }], // Has slack
            ]),
          },
        ],
      };

      const workflowSummary = 'Switch on user role, send notifications';

      const additionalNodes = (workflowBuilder as any).generateBranchSpecificLogOutputs(
        existingNodes,
        branchingAnalysis,
        workflowSummary
      );

      // Should NOT generate any log_output nodes
      expect(additionalNodes.length).toBe(0);
    });

    it('should generate log_output only when user intent includes logging keywords', () => {
      const existingNodes: any[] = [
        {
          id: 'trigger_1',
          type: 'manual_trigger',
          data: { type: 'manual_trigger', category: 'trigger', config: {} },
        },
        {
          id: 'switch_1',
          type: 'switch',
          data: { type: 'switch', category: 'logic', config: {} },
        },
      ];

      const branchingAnalysis = {
        branchingNodes: [
          {
            index: 1,
            step: { id: 'switch_1', type: 'switch' as const, role: 'branch', config: {} },
            type: 'switch' as const,
            branches: new Map([
              ['case_1', { needsLogOutput: true, hasOtherOutput: false }],
            ]),
          },
        ],
      };

      // Test with logging keywords
      const workflowSummaryWithLogging = 'Switch on user role, log the action';
      const additionalNodesWithLogging = (workflowBuilder as any).generateBranchSpecificLogOutputs(
        existingNodes,
        branchingAnalysis,
        workflowSummaryWithLogging
      );
      expect(additionalNodesWithLogging.length).toBe(1);

      // Test without logging keywords
      const workflowSummaryWithoutLogging = 'Switch on user role, perform action';
      const additionalNodesWithoutLogging = (workflowBuilder as any).generateBranchSpecificLogOutputs(
        existingNodes,
        branchingAnalysis,
        workflowSummaryWithoutLogging
      );
      expect(additionalNodesWithoutLogging.length).toBe(0);
    });
  });
});
