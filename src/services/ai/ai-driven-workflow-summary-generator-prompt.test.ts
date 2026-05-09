/**
 * Unit Tests for AI-Driven Workflow Summary Generator - Prompt Generation
 * 
 * Tests the createBranchAwareAIPrompt() method to validate:
 * - Prompt includes branching instructions when branches detected
 * - Prompt distinguishes OBJECTIVE vs DETAILED_FLOW requirements
 * - Prompt includes CONNECTIONS section instructions
 * - Prompt for linear workflow (no branching instructions)
 * 
 * Requirements Coverage: 1.6, 1.7
 */

import { AIDrivenWorkflowSummaryGenerator } from './ai-driven-workflow-summary-generator';
import type { AIWorkflowSummaryInput, BranchingAnalysis } from './ai-driven-workflow-summary-generator';

describe('AIDrivenWorkflowSummaryGenerator - AI Prompt Generation', () => {
  let generator: AIDrivenWorkflowSummaryGenerator;

  beforeEach(() => {
    generator = new AIDrivenWorkflowSummaryGenerator();
  });

  /**
   * Test: Prompt includes branching instructions when branches detected
   * Requirements: 1.6, 1.7
   */
  describe('Prompt with branching instructions', () => {
    it('should include branching instructions for if_else workflow', () => {
      // Arrange: Create input with if_else branching
      const input: AIWorkflowSummaryInput = {
        userPrompt: 'Check age and send approval or rejection email',
        nodeChain: ['manual_trigger', 'if_else', 'google_gmail', 'slack']
      };

      const nodeContext = 'manual_trigger → if_else → google_gmail → slack';

      const branchingAnalysis: BranchingAnalysis = {
        hasBranching: true,
        branches: [
          {
            nodeId: 'if_else_1',
            nodeType: 'if_else',
            branchType: 'binary',
            cases: [
              { caseKey: 'true', targetNodeId: 'gmail_1', edgeType: 'true' },
              { caseKey: 'false', targetNodeId: 'slack_1', edgeType: 'false' }
            ]
          }
        ],
        mergePoints: []
      };

      // Act: Create AI prompt
      const prompt = (generator as any).createBranchAwareAIPrompt(input, nodeContext, branchingAnalysis);

      // Assert: Verify branching instructions included
      expect(prompt).toContain('IF_ELSE node');
      expect(prompt).toContain('TRUE branch');
      expect(prompt).toContain('FALSE branch');
      expect(prompt).toContain('condition being evaluated');
      expect(prompt).toContain('data flows through each branch');
    });

    it('should include branching instructions for switch workflow', () => {
      // Arrange: Create input with switch branching
      const input: AIWorkflowSummaryInput = {
        userPrompt: 'Route by priority: high, medium, low',
        nodeChain: ['manual_trigger', 'switch', 'slack', 'google_gmail', 'log']
      };

      const nodeContext = 'manual_trigger → switch → slack → google_gmail → log';

      const branchingAnalysis: BranchingAnalysis = {
        hasBranching: true,
        branches: [
          {
            nodeId: 'switch_1',
            nodeType: 'switch',
            branchType: 'multi-case',
            cases: [
              { caseKey: 'case_1', targetNodeId: 'slack_1', edgeType: 'case_1' },
              { caseKey: 'case_2', targetNodeId: 'gmail_1', edgeType: 'case_2' },
              { caseKey: 'case_3', targetNodeId: 'log_1', edgeType: 'case_3' }
            ]
          }
        ],
        mergePoints: []
      };

      // Act: Create AI prompt
      const prompt = (generator as any).createBranchAwareAIPrompt(input, nodeContext, branchingAnalysis);

      // Assert: Verify switch branching instructions included
      expect(prompt).toContain('SWITCH node');
      expect(prompt).toContain('ALL 3 case branches');
      expect(prompt).toContain('case_1, case_2, case_3');
      expect(prompt).toContain('what each case represents');
      expect(prompt).toContain('switch value is determined');
    });

    it('should include merge point instructions when branches reconverge', () => {
      // Arrange: Create input with merge points
      const input: AIWorkflowSummaryInput = {
        userPrompt: 'Branch and merge workflow',
        nodeChain: ['manual_trigger', 'if_else', 'google_gmail', 'slack', 'log']
      };

      const nodeContext = 'manual_trigger → if_else → google_gmail → slack → log';

      const branchingAnalysis: BranchingAnalysis = {
        hasBranching: true,
        branches: [
          {
            nodeId: 'if_else_1',
            nodeType: 'if_else',
            branchType: 'binary',
            cases: [
              { caseKey: 'true', targetNodeId: 'gmail_1', edgeType: 'true' },
              { caseKey: 'false', targetNodeId: 'slack_1', edgeType: 'false' }
            ]
          }
        ],
        mergePoints: ['log_1']
      };

      // Act: Create AI prompt
      const prompt = (generator as any).createBranchAwareAIPrompt(input, nodeContext, branchingAnalysis);

      // Assert: Verify merge point instructions included
      expect(prompt).toContain('MERGE points');
      expect(prompt).toContain('log_1');
      expect(prompt).toContain('branches reconverge');
      expect(prompt).toContain('data from different branches is combined');
      expect(prompt).toContain('unified execution path after merge');
    });

    it('should include instructions for nested branching', () => {
      // Arrange: Create input with nested branching
      const input: AIWorkflowSummaryInput = {
        userPrompt: 'Nested conditional workflow',
        nodeChain: ['manual_trigger', 'if_else', 'if_else', 'http_request']
      };

      const nodeContext = 'manual_trigger → if_else → if_else → http_request';

      const branchingAnalysis: BranchingAnalysis = {
        hasBranching: true,
        branches: [
          {
            nodeId: 'if_else_1',
            nodeType: 'if_else',
            branchType: 'binary',
            cases: [
              { caseKey: 'true', targetNodeId: 'if_else_2', edgeType: 'true' },
              { caseKey: 'false', targetNodeId: 'node_c', edgeType: 'false' }
            ]
          },
          {
            nodeId: 'if_else_2',
            nodeType: 'if_else',
            branchType: 'binary',
            cases: [
              { caseKey: 'true', targetNodeId: 'node_a', edgeType: 'true' },
              { caseKey: 'false', targetNodeId: 'node_b', edgeType: 'false' }
            ]
          }
        ],
        mergePoints: []
      };

      // Act: Create AI prompt
      const prompt = (generator as any).createBranchAwareAIPrompt(input, nodeContext, branchingAnalysis);

      // Assert: Verify instructions for both branching nodes
      expect(prompt).toContain('IF_ELSE node (if_else_1)');
      expect(prompt).toContain('IF_ELSE node (if_else_2)');
      expect(prompt.match(/IF_ELSE node/g)?.length).toBe(2);
    });
  });

  /**
   * Test: Prompt distinguishes OBJECTIVE vs DETAILED_FLOW requirements
   * Requirements: 1.6, 1.7
   */
  describe('OBJECTIVE vs DETAILED_FLOW distinction', () => {
    it('should include clear distinction between OBJECTIVE and DETAILED_FLOW', () => {
      // Arrange: Create simple input
      const input: AIWorkflowSummaryInput = {
        userPrompt: 'Send email notification',
        nodeChain: ['manual_trigger', 'google_gmail']
      };

      const nodeContext = 'manual_trigger → google_gmail';

      const branchingAnalysis: BranchingAnalysis = {
        hasBranching: false,
        branches: [],
        mergePoints: []
      };

      // Act: Create AI prompt
      const prompt = (generator as any).createBranchAwareAIPrompt(input, nodeContext, branchingAnalysis);

      // Assert: Verify OBJECTIVE section requirements
      expect(prompt).toContain('1. OBJECTIVE: High-level business goal and purpose');
      expect(prompt).toContain('MUST be different from DETAILED_FLOW');
      expect(prompt).toContain('Focus on business value and outcomes');
      expect(prompt).toContain('Explain WHY this workflow exists');
      expect(prompt).toContain('Keep it concise (2-3 sentences)');

      // Assert: Verify DETAILED_FLOW section requirements
      expect(prompt).toContain('3. DETAILED_FLOW: Complete step-by-step execution');
      expect(prompt).toContain('MUST be different from OBJECTIVE');
      expect(prompt).toContain('Focus on HOW the workflow executes technically');
      expect(prompt).toContain('Each node\'s purpose and role');
      expect(prompt).toContain('Input data and processing for each step');

      // Assert: Verify critical requirements emphasize distinction
      expect(prompt).toContain('Make OBJECTIVE and DETAILED_FLOW completely different content');
      expect(prompt).toContain('OBJECTIVE = high-level business purpose (WHY)');
      expect(prompt).toContain('DETAILED_FLOW = technical step-by-step execution (HOW)');
    });

    it('should emphasize distinction in critical requirements section', () => {
      // Arrange: Create input
      const input: AIWorkflowSummaryInput = {
        userPrompt: 'Process data workflow',
        nodeChain: ['webhook', 'http_request', 'google_sheets']
      };

      const nodeContext = 'webhook → http_request → google_sheets';

      const branchingAnalysis: BranchingAnalysis = {
        hasBranching: false,
        branches: [],
        mergePoints: []
      };

      // Act: Create AI prompt
      const prompt = (generator as any).createBranchAwareAIPrompt(input, nodeContext, branchingAnalysis);

      // Assert: Verify critical requirements section
      expect(prompt).toContain('CRITICAL REQUIREMENTS:');
      expect(prompt).toContain('Make OBJECTIVE and DETAILED_FLOW completely different content');
      expect(prompt).toContain('OBJECTIVE = high-level business purpose (WHY)');
      expect(prompt).toContain('DETAILED_FLOW = technical step-by-step execution (HOW)');
    });
  });

  /**
   * Test: Prompt includes CONNECTIONS section instructions
   * Requirements: 1.7
   */
  describe('CONNECTIONS section instructions', () => {
    it('should include CONNECTIONS section with edge routing instructions', () => {
      // Arrange: Create input
      const input: AIWorkflowSummaryInput = {
        userPrompt: 'Multi-step workflow',
        nodeChain: ['manual_trigger', 'http_request', 'google_sheets', 'slack']
      };

      const nodeContext = 'manual_trigger → http_request → google_sheets → slack';

      const branchingAnalysis: BranchingAnalysis = {
        hasBranching: false,
        branches: [],
        mergePoints: []
      };

      // Act: Create AI prompt
      const prompt = (generator as any).createBranchAwareAIPrompt(input, nodeContext, branchingAnalysis);

      // Assert: Verify CONNECTIONS section instructions
      expect(prompt).toContain('4. CONNECTIONS: How nodes connect, route data, and work together');
      expect(prompt).toContain('Explain edge routing and data flow');
      expect(prompt).toContain('Describe how data passes from node to node');
      expect(prompt).toContain('Include edge types (main, true, false, case_N)');
      expect(prompt).toContain('Explain merge points where branches reconverge');
      expect(prompt).toContain('Show the complete data flow path');
    });

    it('should include edge type instructions for branching workflows', () => {
      // Arrange: Create input with branching
      const input: AIWorkflowSummaryInput = {
        userPrompt: 'Conditional workflow with branches',
        nodeChain: ['manual_trigger', 'if_else', 'google_gmail', 'slack']
      };

      const nodeContext = 'manual_trigger → if_else → google_gmail → slack';

      const branchingAnalysis: BranchingAnalysis = {
        hasBranching: true,
        branches: [
          {
            nodeId: 'if_else_1',
            nodeType: 'if_else',
            branchType: 'binary',
            cases: [
              { caseKey: 'true', targetNodeId: 'gmail_1', edgeType: 'true' },
              { caseKey: 'false', targetNodeId: 'slack_1', edgeType: 'false' }
            ]
          }
        ],
        mergePoints: []
      };

      // Act: Create AI prompt
      const prompt = (generator as any).createBranchAwareAIPrompt(input, nodeContext, branchingAnalysis);

      // Assert: Verify edge type instructions
      expect(prompt).toContain('Include edge types (main, true, false, case_N)');
      expect(prompt).toContain('data flows through each branch');
    });
  });

  /**
   * Test: Prompt for linear workflow (no branching instructions)
   * Requirements: 1.7
   */
  describe('Linear workflow prompt (no branching)', () => {
    it('should NOT include branching instructions for linear workflow', () => {
      // Arrange: Create linear workflow input
      const input: AIWorkflowSummaryInput = {
        userPrompt: 'Simple linear workflow',
        nodeChain: ['manual_trigger', 'google_sheets', 'google_gmail', 'log']
      };

      const nodeContext = 'manual_trigger → google_sheets → google_gmail → log';

      const branchingAnalysis: BranchingAnalysis = {
        hasBranching: false,
        branches: [],
        mergePoints: []
      };

      // Act: Create AI prompt
      const prompt = (generator as any).createBranchAwareAIPrompt(input, nodeContext, branchingAnalysis);

      // Assert: Verify NO branching instructions
      expect(prompt).not.toContain('IF_ELSE node');
      expect(prompt).not.toContain('SWITCH node');
      expect(prompt).not.toContain('TRUE branch');
      expect(prompt).not.toContain('FALSE branch');
      expect(prompt).not.toContain('case branches');
      expect(prompt).not.toContain('MERGE points');
      expect(prompt).not.toContain('EXPLAIN EACH BRANCH PATH SEPARATELY');
    });

    it('should include standard sections for linear workflow', () => {
      // Arrange: Create linear workflow input
      const input: AIWorkflowSummaryInput = {
        userPrompt: 'Read sheet and send email',
        nodeChain: ['webhook', 'google_sheets', 'google_gmail']
      };

      const nodeContext = 'webhook → google_sheets → google_gmail';

      const branchingAnalysis: BranchingAnalysis = {
        hasBranching: false,
        branches: [],
        mergePoints: []
      };

      // Act: Create AI prompt
      const prompt = (generator as any).createBranchAwareAIPrompt(input, nodeContext, branchingAnalysis);

      // Assert: Verify standard sections included
      expect(prompt).toContain('1. OBJECTIVE:');
      expect(prompt).toContain('2. TRIGGER_DESCRIPTION:');
      expect(prompt).toContain('3. DETAILED_FLOW:');
      expect(prompt).toContain('4. CONNECTIONS:');
      expect(prompt).toContain('CRITICAL REQUIREMENTS:');
    });

    it('should include user prompt and node context for linear workflow', () => {
      // Arrange: Create linear workflow input
      const input: AIWorkflowSummaryInput = {
        userPrompt: 'Fetch data and store in sheets',
        nodeChain: ['schedule', 'http_request', 'google_sheets']
      };

      const nodeContext = 'schedule → http_request → google_sheets';

      const branchingAnalysis: BranchingAnalysis = {
        hasBranching: false,
        branches: [],
        mergePoints: []
      };

      // Act: Create AI prompt
      const prompt = (generator as any).createBranchAwareAIPrompt(input, nodeContext, branchingAnalysis);

      // Assert: Verify user prompt and node context included
      expect(prompt).toContain('USER INTENT:');
      expect(prompt).toContain('Fetch data and store in sheets');
      expect(prompt).toContain('SELECTED NODES (execution order):');
      expect(prompt).toContain('schedule → http_request → google_sheets');
    });
  });

  /**
   * Test: Additional context handling
   */
  describe('Additional context in prompt', () => {
    it('should include use cases when provided', () => {
      // Arrange: Create input with use cases
      const input: AIWorkflowSummaryInput = {
        userPrompt: 'Workflow with use cases',
        nodeChain: ['manual_trigger', 'http_request'],
        useCases: ['Use case 1: API integration', 'Use case 2: Data sync']
      };

      const nodeContext = 'manual_trigger → http_request';

      const branchingAnalysis: BranchingAnalysis = {
        hasBranching: false,
        branches: [],
        mergePoints: []
      };

      // Act: Create AI prompt
      const prompt = (generator as any).createBranchAwareAIPrompt(input, nodeContext, branchingAnalysis);

      // Assert: Verify use cases included
      expect(prompt).toContain('ADDITIONAL CONTEXT:');
      expect(prompt).toContain('Use Cases:');
      expect(prompt).toContain('Use case 1: API integration');
      expect(prompt).toContain('Use case 2: Data sync');
    });

    it('should include requirements when provided', () => {
      // Arrange: Create input with requirements
      const input: AIWorkflowSummaryInput = {
        userPrompt: 'Workflow with requirements',
        nodeChain: ['webhook', 'google_sheets'],
        requirements: ['Requirement 1: Real-time sync', 'Requirement 2: Error handling']
      };

      const nodeContext = 'webhook → google_sheets';

      const branchingAnalysis: BranchingAnalysis = {
        hasBranching: false,
        branches: [],
        mergePoints: []
      };

      // Act: Create AI prompt
      const prompt = (generator as any).createBranchAwareAIPrompt(input, nodeContext, branchingAnalysis);

      // Assert: Verify requirements included
      expect(prompt).toContain('ADDITIONAL CONTEXT:');
      expect(prompt).toContain('Requirements:');
      expect(prompt).toContain('Requirement 1: Real-time sync');
      expect(prompt).toContain('Requirement 2: Error handling');
    });

    it('should include branching logic description when provided', () => {
      // Arrange: Create input with branching logic
      const input: AIWorkflowSummaryInput = {
        userPrompt: 'Workflow with branching',
        nodeChain: ['manual_trigger', 'if_else', 'google_gmail', 'slack'],
        branchingLogic: 'If age > 18, send approval email, else send rejection message'
      };

      const nodeContext = 'manual_trigger → if_else → google_gmail → slack';

      const branchingAnalysis: BranchingAnalysis = {
        hasBranching: true,
        branches: [
          {
            nodeId: 'if_else_1',
            nodeType: 'if_else',
            branchType: 'binary',
            cases: [
              { caseKey: 'true', targetNodeId: 'gmail_1', edgeType: 'true' },
              { caseKey: 'false', targetNodeId: 'slack_1', edgeType: 'false' }
            ]
          }
        ],
        mergePoints: []
      };

      // Act: Create AI prompt
      const prompt = (generator as any).createBranchAwareAIPrompt(input, nodeContext, branchingAnalysis);

      // Assert: Verify branching logic included
      expect(prompt).toContain('ADDITIONAL CONTEXT:');
      expect(prompt).toContain('Branching Logic:');
      expect(prompt).toContain('If age > 18, send approval email, else send rejection message');
    });

    it('should NOT include ADDITIONAL CONTEXT section when no additional context provided', () => {
      // Arrange: Create input without additional context
      const input: AIWorkflowSummaryInput = {
        userPrompt: 'Simple workflow',
        nodeChain: ['manual_trigger', 'log']
      };

      const nodeContext = 'manual_trigger → log';

      const branchingAnalysis: BranchingAnalysis = {
        hasBranching: false,
        branches: [],
        mergePoints: []
      };

      // Act: Create AI prompt
      const prompt = (generator as any).createBranchAwareAIPrompt(input, nodeContext, branchingAnalysis);

      // Assert: Verify no additional context section
      expect(prompt).not.toContain('ADDITIONAL CONTEXT:');
    });
  });

  /**
   * Test: Prompt structure validation
   */
  describe('Prompt structure validation', () => {
    it('should have all required sections in correct order', () => {
      // Arrange: Create input
      const input: AIWorkflowSummaryInput = {
        userPrompt: 'Test workflow',
        nodeChain: ['manual_trigger', 'http_request']
      };

      const nodeContext = 'manual_trigger → http_request';

      const branchingAnalysis: BranchingAnalysis = {
        hasBranching: false,
        branches: [],
        mergePoints: []
      };

      // Act: Create AI prompt
      const prompt = (generator as any).createBranchAwareAIPrompt(input, nodeContext, branchingAnalysis);

      // Assert: Verify section order
      const userIntentIndex = prompt.indexOf('USER INTENT:');
      const selectedNodesIndex = prompt.indexOf('SELECTED NODES (execution order):');
      const taskIndex = prompt.indexOf('TASK: Generate a detailed workflow analysis');
      const objectiveIndex = prompt.indexOf('1. OBJECTIVE:');
      const triggerIndex = prompt.indexOf('2. TRIGGER_DESCRIPTION:');
      const detailedFlowIndex = prompt.indexOf('3. DETAILED_FLOW:');
      const connectionsIndex = prompt.indexOf('4. CONNECTIONS:');
      const criticalIndex = prompt.indexOf('CRITICAL REQUIREMENTS:');

      expect(userIntentIndex).toBeGreaterThan(-1);
      expect(selectedNodesIndex).toBeGreaterThan(userIntentIndex);
      expect(taskIndex).toBeGreaterThan(selectedNodesIndex);
      expect(objectiveIndex).toBeGreaterThan(taskIndex);
      expect(triggerIndex).toBeGreaterThan(objectiveIndex);
      expect(detailedFlowIndex).toBeGreaterThan(triggerIndex);
      expect(connectionsIndex).toBeGreaterThan(detailedFlowIndex);
      expect(criticalIndex).toBeGreaterThan(connectionsIndex);
    });

    it('should be a valid string with no undefined sections', () => {
      // Arrange: Create input
      const input: AIWorkflowSummaryInput = {
        userPrompt: 'Test workflow',
        nodeChain: ['manual_trigger', 'log']
      };

      const nodeContext = 'manual_trigger → log';

      const branchingAnalysis: BranchingAnalysis = {
        hasBranching: false,
        branches: [],
        mergePoints: []
      };

      // Act: Create AI prompt
      const prompt = (generator as any).createBranchAwareAIPrompt(input, nodeContext, branchingAnalysis);

      // Assert: Verify prompt is valid
      expect(typeof prompt).toBe('string');
      expect(prompt.length).toBeGreaterThan(0);
      expect(prompt).not.toContain('undefined');
      expect(prompt).not.toContain('null');
    });
  });
});
