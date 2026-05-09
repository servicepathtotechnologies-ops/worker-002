/**
 * Test: Workflow Summary Generation with Branching Support
 * 
 * Tests the enhanced AI-driven workflow summary generator with branching structure analysis.
 * Verifies that the generator correctly:
 * 1. Analyzes branching structures (if_else, switch nodes)
 * 2. Identifies merge points
 * 3. Generates branch-aware AI prompts
 * 4. Validates OBJECTIVE vs DETAILED_FLOW distinction
 * 5. Includes edge routing information in summaries
 */

import { describe, it, expect, beforeAll } from '@jest/globals';
import { AIDrivenWorkflowSummaryGenerator } from '../services/ai/ai-driven-workflow-summary-generator';
import type { Workflow, WorkflowEdge, WorkflowNode } from '../core/types/ai-types';
import { unifiedNodeRegistry } from '../core/registry/unified-node-registry';

describe('Workflow Summary Generation with Branching Support', () => {
  let generator: AIDrivenWorkflowSummaryGenerator;

  beforeAll(() => {
    generator = new AIDrivenWorkflowSummaryGenerator();
  });

  // Helper function to create a properly formatted workflow node
  const createNode = (id: string, type: string, x: number, y: number): WorkflowNode => ({
    id,
    type,
    position: { x, y },
    data: {
      label: type,
      type,
      category: 'test',
      config: {}
    }
  });

  describe('Branching Structure Analysis', () => {
    it('should identify if_else branching node with 2 branches', () => {
      const workflow: Workflow = {
        nodes: [
          createNode('trigger-1', 'manual_trigger', 0, 0),
          createNode('if-1', 'if_else', 100, 0),
          createNode('action-true', 'log_output', 200, -50),
          createNode('action-false', 'log_output', 200, 50)
        ],
        edges: []
      };

      const edges: WorkflowEdge[] = [
        { id: 'e1', source: 'trigger-1', target: 'if-1', type: 'main' },
        { id: 'e2', source: 'if-1', target: 'action-true', type: 'true' },
        { id: 'e3', source: 'if-1', target: 'action-false', type: 'false' }
      ];

      // Access private method via type assertion for testing
      const analysis = (generator as any).analyzeBranchingStructure(workflow, edges);

      expect(analysis.hasBranching).toBe(true);
      expect(analysis.branches).toHaveLength(1);
      expect(analysis.branches[0].nodeId).toBe('if-1');
      expect(analysis.branches[0].nodeType).toBe('if_else');
      expect(analysis.branches[0].branchType).toBe('binary');
      expect(analysis.branches[0].cases).toHaveLength(2);
      
      const caseKeys: string[] = analysis.branches[0].cases.map((c: { caseKey: string }) => c.caseKey);
      expect(caseKeys).toContain('true');
      expect(caseKeys).toContain('false');
    });

    it('should identify switch branching node with N cases', () => {
      const workflow: Workflow = {
        nodes: [
          createNode('trigger-1', 'manual_trigger', 0, 0),
          createNode('switch-1', 'switch', 100, 0),
          createNode('action-high', 'log_output', 200, -100),
          createNode('action-medium', 'log_output', 200, 0),
          createNode('action-low', 'log_output', 200, 100)
        ],
        edges: []
      };

      const edges: WorkflowEdge[] = [
        { id: 'e1', source: 'trigger-1', target: 'switch-1', type: 'main' },
        { id: 'e2', source: 'switch-1', target: 'action-high', type: 'high', branchName: 'high' },
        { id: 'e3', source: 'switch-1', target: 'action-medium', type: 'medium', branchName: 'medium' },
        { id: 'e4', source: 'switch-1', target: 'action-low', type: 'low', branchName: 'low' }
      ];

      const analysis = (generator as any).analyzeBranchingStructure(workflow, edges);

      expect(analysis.hasBranching).toBe(true);
      expect(analysis.branches).toHaveLength(1);
      expect(analysis.branches[0].nodeId).toBe('switch-1');
      expect(analysis.branches[0].nodeType).toBe('switch');
      expect(analysis.branches[0].branchType).toBe('multi-case');
      expect(analysis.branches[0].cases).toHaveLength(3);
      
      const caseKeys: string[] = analysis.branches[0].cases.map((c: { caseKey: string }) => c.caseKey);
      expect(caseKeys).toContain('high');
      expect(caseKeys).toContain('medium');
      expect(caseKeys).toContain('low');
    });

    it('should identify merge points where branches reconverge', () => {
      const workflow: Workflow = {
        nodes: [
          createNode('trigger-1', 'manual_trigger', 0, 0),
          createNode('if-1', 'if_else', 100, 0),
          createNode('action-true', 'http_request', 200, -50),
          createNode('action-false', 'http_request', 200, 50),
          createNode('merge-1', 'merge', 300, 0),
          createNode('log-1', 'log_output', 400, 0)
        ],
        edges: []
      };

      const edges: WorkflowEdge[] = [
        { id: 'e1', source: 'trigger-1', target: 'if-1', type: 'main' },
        { id: 'e2', source: 'if-1', target: 'action-true', type: 'true' },
        { id: 'e3', source: 'if-1', target: 'action-false', type: 'false' },
        { id: 'e4', source: 'action-true', target: 'merge-1', type: 'main' },
        { id: 'e5', source: 'action-false', target: 'merge-1', type: 'main' },
        { id: 'e6', source: 'merge-1', target: 'log-1', type: 'main' }
      ];

      const analysis = (generator as any).analyzeBranchingStructure(workflow, edges);

      expect(analysis.hasBranching).toBe(true);
      expect(analysis.mergePoints).toHaveLength(1);
      expect(analysis.mergePoints[0]).toBe('merge-1');
    });

    it('should return no branching for linear workflow', () => {
      const workflow: Workflow = {
        nodes: [
          createNode('trigger-1', 'manual_trigger', 0, 0),
          createNode('action-1', 'http_request', 100, 0),
          createNode('log-1', 'log_output', 200, 0)
        ],
        edges: []
      };

      const edges: WorkflowEdge[] = [
        { id: 'e1', source: 'trigger-1', target: 'action-1', type: 'main' },
        { id: 'e2', source: 'action-1', target: 'log-1', type: 'main' }
      ];

      const analysis = (generator as any).analyzeBranchingStructure(workflow, edges);

      expect(analysis.hasBranching).toBe(false);
      expect(analysis.branches).toHaveLength(0);
      expect(analysis.mergePoints).toHaveLength(0);
    });
  });

  describe('Node Context with Branching', () => {
    it('should build enhanced node context with branching metadata', () => {
      const nodeChain = ['manual_trigger', 'if_else', 'google_gmail', 'slack_message'];
      const branchingAnalysis = {
        hasBranching: true,
        branches: [
          {
            nodeId: 'if-1',
            nodeType: 'if_else',
            branchType: 'binary' as const,
            cases: [
              { caseKey: 'true', targetNodeId: 'gmail-1', edgeType: 'true' },
              { caseKey: 'false', targetNodeId: 'slack-1', edgeType: 'false' }
            ]
          }
        ],
        mergePoints: []
      };

      const context = (generator as any).buildNodeContextWithBranching(nodeChain, branchingAnalysis);

      expect(context).toContain('manual_trigger');
      expect(context).toContain('if_else');
      expect(context).toContain('BRANCHING STRUCTURE');
      expect(context).toContain('binary branching');
      expect(context).toContain('true →');
      expect(context).toContain('false →');
    });

    it('should build simple context for linear workflow', () => {
      const nodeChain = ['manual_trigger', 'http_request', 'log_output'];
      const branchingAnalysis = {
        hasBranching: false,
        branches: [],
        mergePoints: []
      };

      const context = (generator as any).buildNodeContextWithBranching(nodeChain, branchingAnalysis);

      expect(context).toContain('manual_trigger');
      expect(context).toContain('http_request');
      expect(context).toContain('log_output');
      expect(context).not.toContain('BRANCHING STRUCTURE');
    });
  });

  describe('Branch-Aware AI Prompt Generation', () => {
    it('should include branching instructions for if_else workflow', () => {
      const input = {
        userPrompt: 'Send email if priority is high, otherwise send Slack message',
        nodeChain: ['manual_trigger', 'if_else', 'google_gmail', 'slack_message']
      };

      const nodeContext = 'manual_trigger → if_else → google_gmail → slack_message';
      const branchingAnalysis = {
        hasBranching: true,
        branches: [
          {
            nodeId: 'if-1',
            nodeType: 'if_else',
            branchType: 'binary' as const,
            cases: [
              { caseKey: 'true', targetNodeId: 'gmail-1', edgeType: 'true' },
              { caseKey: 'false', targetNodeId: 'slack-1', edgeType: 'false' }
            ]
          }
        ],
        mergePoints: []
      };

      const prompt = (generator as any).createBranchAwareAIPrompt(input, nodeContext, branchingAnalysis);

      expect(prompt).toContain('OBJECTIVE');
      expect(prompt).toContain('TRIGGER_DESCRIPTION');
      expect(prompt).toContain('DETAILED_FLOW');
      expect(prompt).toContain('CONNECTIONS');
      expect(prompt).toContain('For IF_ELSE node');
      expect(prompt).toContain('TRUE branch path');
      expect(prompt).toContain('FALSE branch path');
      expect(prompt).toContain('EXPLAIN EACH BRANCH PATH SEPARATELY');
    });

    it('should include branching instructions for switch workflow', () => {
      const input = {
        userPrompt: 'Route based on priority: high→Slack, medium→Email, low→Log',
        nodeChain: ['manual_trigger', 'switch', 'slack_message', 'google_gmail', 'log_output']
      };

      const nodeContext = 'manual_trigger → switch → slack_message → google_gmail → log_output';
      const branchingAnalysis = {
        hasBranching: true,
        branches: [
          {
            nodeId: 'switch-1',
            nodeType: 'switch',
            branchType: 'multi-case' as const,
            cases: [
              { caseKey: 'high', targetNodeId: 'slack-1', edgeType: 'high' },
              { caseKey: 'medium', targetNodeId: 'gmail-1', edgeType: 'medium' },
              { caseKey: 'low', targetNodeId: 'log-1', edgeType: 'low' }
            ]
          }
        ],
        mergePoints: []
      };

      const prompt = (generator as any).createBranchAwareAIPrompt(input, nodeContext, branchingAnalysis);

      expect(prompt).toContain('For SWITCH node');
      expect(prompt).toContain('Explain ALL 3 case branches');
      expect(prompt).toContain('high, medium, low');
    });

    it('should not include branching instructions for linear workflow', () => {
      const input = {
        userPrompt: 'Fetch data and log it',
        nodeChain: ['manual_trigger', 'http_request', 'log_output']
      };

      const nodeContext = 'manual_trigger → http_request → log_output';
      const branchingAnalysis = {
        hasBranching: false,
        branches: [],
        mergePoints: []
      };

      const prompt = (generator as any).createBranchAwareAIPrompt(input, nodeContext, branchingAnalysis);

      expect(prompt).toContain('OBJECTIVE');
      expect(prompt).toContain('DETAILED_FLOW');
      expect(prompt).not.toContain('For IF_ELSE node');
      expect(prompt).not.toContain('For SWITCH node');
      expect(prompt).not.toContain('EXPLAIN EACH BRANCH PATH SEPARATELY');
    });
  });

  describe('Registry Integration', () => {
    it('should correctly identify if_else as branching node from registry', () => {
      const ifElseDef = unifiedNodeRegistry.get('if_else');
      
      expect(ifElseDef).toBeDefined();
      expect(ifElseDef?.isBranching).toBe(true);
      expect(ifElseDef?.outgoingPorts).toContain('true');
      expect(ifElseDef?.outgoingPorts).toContain('false');
    });

    it('should correctly identify switch as branching node from registry', () => {
      const switchDef = unifiedNodeRegistry.get('switch');
      
      expect(switchDef).toBeDefined();
      expect(switchDef?.isBranching).toBe(true);
    });

    it('should correctly identify non-branching nodes from registry', () => {
      const httpDef = unifiedNodeRegistry.get('http_request');
      const logDef = unifiedNodeRegistry.get('log_output');
      
      expect(httpDef?.isBranching).toBe(false);
      expect(logDef?.isBranching).toBe(false);
    });
  });

  describe('Summary Format Validation', () => {
    it('should validate that OBJECTIVE and DETAILED_FLOW are distinct', () => {
      const mockResponse = `
OBJECTIVE: This workflow sends notifications based on priority.

TRIGGER_DESCRIPTION: Triggered manually by user.

DETAILED_FLOW: This workflow sends notifications based on priority.

CONNECTIONS: Nodes connect sequentially.
      `;

      const branchingAnalysis = { hasBranching: false, branches: [], mergePoints: [] };
      
      // Mock console.warn to capture warning
      const originalWarn = console.warn;
      let warningCalled = false;
      console.warn = (message: string) => {
        if (message.includes('OBJECTIVE and DETAILED_FLOW are too similar')) {
          warningCalled = true;
        }
      };

      (generator as any).formatAIResponseWithBranches(mockResponse, branchingAnalysis);

      expect(warningCalled).toBe(true);
      
      // Restore console.warn
      console.warn = originalWarn;
    });

    it('should validate that CONNECTIONS includes edge information for branching workflows', () => {
      const mockResponse = `
OBJECTIVE: Route messages based on priority.

TRIGGER_DESCRIPTION: Triggered manually.

DETAILED_FLOW: The workflow evaluates priority and routes accordingly.

CONNECTIONS: Nodes are connected.
      `;

      const branchingAnalysis = {
        hasBranching: true,
        branches: [
          {
            nodeId: 'if-1',
            nodeType: 'if_else',
            branchType: 'binary' as const,
            cases: []
          }
        ],
        mergePoints: []
      };
      
      const originalWarn = console.warn;
      let warningCalled = false;
      console.warn = (message: string) => {
        if (message.includes('CONNECTIONS section missing edge routing information')) {
          warningCalled = true;
        }
      };

      (generator as any).formatAIResponseWithBranches(mockResponse, branchingAnalysis);

      expect(warningCalled).toBe(true);
      
      console.warn = originalWarn;
    });
  });
});
