/**
 * Unit Tests for AI-Driven Workflow Summary Generator - Branching Analysis
 * 
 * Tests the analyzeBranchingStructure() method with various workflow structures:
 * - if_else node (2 branches)
 * - switch node (N cases)
 * - merge point detection with multiple incoming edges
 * - linear workflow (no branching)
 * - nested branching structures
 * 
 * Requirements Coverage: 1.1, 1.2, 1.3, 1.4
 */

import { AIDrivenWorkflowSummaryGenerator } from './ai-driven-workflow-summary-generator';
import type { Workflow, WorkflowNode, WorkflowEdge } from '../../core/types/ai-types';
import { unifiedNodeRegistry } from '../../core/registry/unified-node-registry';

describe('AIDrivenWorkflowSummaryGenerator - analyzeBranchingStructure', () => {
  let generator: AIDrivenWorkflowSummaryGenerator;

  beforeEach(() => {
    generator = new AIDrivenWorkflowSummaryGenerator();
  });

  /**
   * Test: if_else node (2 branches)
   * Requirements: 1.1, 1.2
   */
  describe('if_else node with 2 branches', () => {
    it('should detect if_else branching with true and false branches', () => {
      // Arrange: Create workflow with if_else node
      const workflow: Workflow = {
        nodes: [
          {
            id: 'trigger_1',
            type: 'manual_trigger',
            data: {
              label: 'Manual Trigger',
              type: 'manual_trigger',
              category: 'trigger',
              config: {}
            }
          },
          {
            id: 'if_else_1',
            type: 'if_else',
            data: {
              label: 'Check Condition',
              type: 'if_else',
              category: 'logic',
              config: {
                condition: '{{$json.age}} > 18'
              }
            }
          },
          {
            id: 'gmail_1',
            type: 'google_gmail',
            data: {
              label: 'Send Approval Email',
              type: 'google_gmail',
              category: 'communication',
              config: {}
            }
          },
          {
            id: 'slack_1',
            type: 'slack',
            data: {
              label: 'Send Rejection Message',
              type: 'slack',
              category: 'communication',
              config: {}
            }
          }
        ],
        edges: [
          {
            id: 'e1',
            source: 'trigger_1',
            target: 'if_else_1',
            type: 'main'
          },
          {
            id: 'e2',
            source: 'if_else_1',
            target: 'gmail_1',
            type: 'true',
            branchName: 'true'
          },
          {
            id: 'e3',
            source: 'if_else_1',
            target: 'slack_1',
            type: 'false',
            branchName: 'false'
          }
        ]
      };

      // Act: Analyze branching structure
      const analysis = (generator as any).analyzeBranchingStructure(workflow, workflow.edges);

      // Assert: Verify branching detected
      expect(analysis.hasBranching).toBe(true);
      expect(analysis.branches).toHaveLength(1);
      
      const branch = analysis.branches[0];
      expect(branch.nodeId).toBe('if_else_1');
      expect(branch.nodeType).toBe('if_else');
      expect(branch.branchType).toBe('binary');
      expect(branch.cases).toHaveLength(2);
      
      // Verify true branch
      const trueBranch = branch.cases.find((c: any) => c.caseKey === 'true');
      expect(trueBranch).toBeDefined();
      expect(trueBranch?.targetNodeId).toBe('gmail_1');
      expect(trueBranch?.edgeType).toBe('true');
      
      // Verify false branch
      const falseBranch = branch.cases.find((c: any) => c.caseKey === 'false');
      expect(falseBranch).toBeDefined();
      expect(falseBranch?.targetNodeId).toBe('slack_1');
      expect(falseBranch?.edgeType).toBe('false');
    });
  });

  /**
   * Test: switch node (N cases)
   * Requirements: 1.2
   */
  describe('switch node with N cases', () => {
    it('should detect switch branching with multiple cases', () => {
      // Arrange: Create workflow with switch node (3 cases)
      const workflow: Workflow = {
        nodes: [
          {
            id: 'trigger_1',
            type: 'manual_trigger',
            data: {
              label: 'Manual Trigger',
              type: 'manual_trigger',
              category: 'trigger',
              config: {}
            }
          },
          {
            id: 'switch_1',
            type: 'switch',
            data: {
              label: 'Route by Priority',
              type: 'switch',
              category: 'logic',
              config: {
                cases: [
                  { value: 'high', label: 'High Priority' },
                  { value: 'medium', label: 'Medium Priority' },
                  { value: 'low', label: 'Low Priority' }
                ]
              }
            }
          },
          {
            id: 'slack_1',
            type: 'slack',
            data: {
              label: 'Alert Team',
              type: 'slack',
              category: 'communication',
              config: {}
            }
          },
          {
            id: 'gmail_1',
            type: 'google_gmail',
            data: {
              label: 'Send Email',
              type: 'google_gmail',
              category: 'communication',
              config: {}
            }
          },
          {
            id: 'log_1',
            type: 'log',
            data: {
              label: 'Log Event',
              type: 'log',
              category: 'utility',
              config: {}
            }
          }
        ],
        edges: [
          {
            id: 'e1',
            source: 'trigger_1',
            target: 'switch_1',
            type: 'main'
          },
          {
            id: 'e2',
            source: 'switch_1',
            target: 'slack_1',
            type: 'case_1',
            branchName: 'case_1'
          },
          {
            id: 'e3',
            source: 'switch_1',
            target: 'gmail_1',
            type: 'case_2',
            branchName: 'case_2'
          },
          {
            id: 'e4',
            source: 'switch_1',
            target: 'log_1',
            type: 'case_3',
            branchName: 'case_3'
          }
        ]
      };

      // Act: Analyze branching structure
      const analysis = (generator as any).analyzeBranchingStructure(workflow, workflow.edges);

      // Assert: Verify switch branching detected
      expect(analysis.hasBranching).toBe(true);
      expect(analysis.branches).toHaveLength(1);
      
      const branch = analysis.branches[0];
      expect(branch.nodeId).toBe('switch_1');
      expect(branch.nodeType).toBe('switch');
      expect(branch.branchType).toBe('multi-case');
      expect(branch.cases).toHaveLength(3);
      
      // Verify all cases
      expect(branch.cases[0].caseKey).toBe('case_1');
      expect(branch.cases[0].targetNodeId).toBe('slack_1');
      expect(branch.cases[1].caseKey).toBe('case_2');
      expect(branch.cases[1].targetNodeId).toBe('gmail_1');
      expect(branch.cases[2].caseKey).toBe('case_3');
      expect(branch.cases[2].targetNodeId).toBe('log_1');
    });
  });

  /**
   * Test: merge point detection with multiple incoming edges
   * Requirements: 1.3
   */
  describe('merge point detection', () => {
    it('should detect merge points where branches reconverge', () => {
      // Arrange: Create workflow with if_else that merges
      const workflow: Workflow = {
        nodes: [
          {
            id: 'trigger_1',
            type: 'manual_trigger',
            data: {
              label: 'Manual Trigger',
              type: 'manual_trigger',
              category: 'trigger',
              config: {}
            }
          },
          {
            id: 'if_else_1',
            type: 'if_else',
            data: {
              label: 'Check Condition',
              type: 'if_else',
              category: 'logic',
              config: {}
            }
          },
          {
            id: 'gmail_1',
            type: 'google_gmail',
            data: {
              label: 'Send Email (True)',
              type: 'google_gmail',
              category: 'communication',
              config: {}
            }
          },
          {
            id: 'slack_1',
            type: 'slack',
            data: {
              label: 'Send Message (False)',
              type: 'slack',
              category: 'communication',
              config: {}
            }
          },
          {
            id: 'log_1',
            type: 'log',
            data: {
              label: 'Log Result (Merge Point)',
              type: 'log',
              category: 'utility',
              config: {}
            }
          }
        ],
        edges: [
          {
            id: 'e1',
            source: 'trigger_1',
            target: 'if_else_1',
            type: 'main'
          },
          {
            id: 'e2',
            source: 'if_else_1',
            target: 'gmail_1',
            type: 'true'
          },
          {
            id: 'e3',
            source: 'if_else_1',
            target: 'slack_1',
            type: 'false'
          },
          {
            id: 'e4',
            source: 'gmail_1',
            target: 'log_1',
            type: 'main'
          },
          {
            id: 'e5',
            source: 'slack_1',
            target: 'log_1',
            type: 'main'
          }
        ]
      };

      // Act: Analyze branching structure
      const analysis = (generator as any).analyzeBranchingStructure(workflow, workflow.edges);

      // Assert: Verify merge point detected
      expect(analysis.hasBranching).toBe(true);
      expect(analysis.mergePoints).toHaveLength(1);
      expect(analysis.mergePoints[0]).toBe('log_1');
    });

    it('should detect multiple merge points in complex workflows', () => {
      // Arrange: Create workflow with multiple merge points
      const workflow: Workflow = {
        nodes: [
          {
            id: 'trigger_1',
            type: 'manual_trigger',
            data: {
              label: 'Manual Trigger',
              type: 'manual_trigger',
              category: 'trigger',
              config: {}
            }
          },
          {
            id: 'if_else_1',
            type: 'if_else',
            data: {
              label: 'First Branch',
              type: 'if_else',
              category: 'logic',
              config: {}
            }
          },
          {
            id: 'node_a',
            type: 'http_request',
            data: {
              label: 'Node A',
              type: 'http_request',
              category: 'action',
              config: {}
            }
          },
          {
            id: 'node_b',
            type: 'http_request',
            data: {
              label: 'Node B',
              type: 'http_request',
              category: 'action',
              config: {}
            }
          },
          {
            id: 'merge_1',
            type: 'merge',
            data: {
              label: 'First Merge',
              type: 'merge',
              category: 'logic',
              config: {}
            }
          },
          {
            id: 'if_else_2',
            type: 'if_else',
            data: {
              label: 'Second Branch',
              type: 'if_else',
              category: 'logic',
              config: {}
            }
          },
          {
            id: 'node_c',
            type: 'http_request',
            data: {
              label: 'Node C',
              type: 'http_request',
              category: 'action',
              config: {}
            }
          },
          {
            id: 'node_d',
            type: 'http_request',
            data: {
              label: 'Node D',
              type: 'http_request',
              category: 'action',
              config: {}
            }
          },
          {
            id: 'merge_2',
            type: 'merge',
            data: {
              label: 'Second Merge',
              type: 'merge',
              category: 'logic',
              config: {}
            }
          }
        ],
        edges: [
          { id: 'e1', source: 'trigger_1', target: 'if_else_1', type: 'main' },
          { id: 'e2', source: 'if_else_1', target: 'node_a', type: 'true' },
          { id: 'e3', source: 'if_else_1', target: 'node_b', type: 'false' },
          { id: 'e4', source: 'node_a', target: 'merge_1', type: 'main' },
          { id: 'e5', source: 'node_b', target: 'merge_1', type: 'main' },
          { id: 'e6', source: 'merge_1', target: 'if_else_2', type: 'main' },
          { id: 'e7', source: 'if_else_2', target: 'node_c', type: 'true' },
          { id: 'e8', source: 'if_else_2', target: 'node_d', type: 'false' },
          { id: 'e9', source: 'node_c', target: 'merge_2', type: 'main' },
          { id: 'e10', source: 'node_d', target: 'merge_2', type: 'main' }
        ]
      };

      // Act: Analyze branching structure
      const analysis = (generator as any).analyzeBranchingStructure(workflow, workflow.edges);

      // Assert: Verify both merge points detected
      expect(analysis.mergePoints).toHaveLength(2);
      expect(analysis.mergePoints).toContain('merge_1');
      expect(analysis.mergePoints).toContain('merge_2');
    });
  });

  /**
   * Test: linear workflow (no branching)
   * Requirements: 1.1
   */
  describe('linear workflow without branching', () => {
    it('should return no branching for linear workflows', () => {
      // Arrange: Create simple linear workflow
      const workflow: Workflow = {
        nodes: [
          {
            id: 'trigger_1',
            type: 'manual_trigger',
            data: {
              label: 'Manual Trigger',
              type: 'manual_trigger',
              category: 'trigger',
              config: {}
            }
          },
          {
            id: 'sheets_1',
            type: 'google_sheets',
            data: {
              label: 'Read Sheet',
              type: 'google_sheets',
              category: 'data_source',
              config: {}
            }
          },
          {
            id: 'gmail_1',
            type: 'google_gmail',
            data: {
              label: 'Send Email',
              type: 'google_gmail',
              category: 'communication',
              config: {}
            }
          },
          {
            id: 'log_1',
            type: 'log',
            data: {
              label: 'Log Result',
              type: 'log',
              category: 'utility',
              config: {}
            }
          }
        ],
        edges: [
          {
            id: 'e1',
            source: 'trigger_1',
            target: 'sheets_1',
            type: 'main'
          },
          {
            id: 'e2',
            source: 'sheets_1',
            target: 'gmail_1',
            type: 'main'
          },
          {
            id: 'e3',
            source: 'gmail_1',
            target: 'log_1',
            type: 'main'
          }
        ]
      };

      // Act: Analyze branching structure
      const analysis = (generator as any).analyzeBranchingStructure(workflow, workflow.edges);

      // Assert: Verify no branching detected
      expect(analysis.hasBranching).toBe(false);
      expect(analysis.branches).toHaveLength(0);
      expect(analysis.mergePoints).toHaveLength(0);
    });
  });

  /**
   * Test: nested branching structures
   * Requirements: 1.4
   */
  describe('nested branching structures', () => {
    it('should detect nested if_else nodes', () => {
      // Arrange: Create workflow with nested if_else
      const workflow: Workflow = {
        nodes: [
          {
            id: 'trigger_1',
            type: 'manual_trigger',
            data: {
              label: 'Manual Trigger',
              type: 'manual_trigger',
              category: 'trigger',
              config: {}
            }
          },
          {
            id: 'if_else_1',
            type: 'if_else',
            data: {
              label: 'First Condition',
              type: 'if_else',
              category: 'logic',
              config: {}
            }
          },
          {
            id: 'if_else_2',
            type: 'if_else',
            data: {
              label: 'Nested Condition (True Branch)',
              type: 'if_else',
              category: 'logic',
              config: {}
            }
          },
          {
            id: 'node_a',
            type: 'http_request',
            data: {
              label: 'Node A',
              type: 'http_request',
              category: 'action',
              config: {}
            }
          },
          {
            id: 'node_b',
            type: 'http_request',
            data: {
              label: 'Node B',
              type: 'http_request',
              category: 'action',
              config: {}
            }
          },
          {
            id: 'node_c',
            type: 'http_request',
            data: {
              label: 'Node C',
              type: 'http_request',
              category: 'action',
              config: {}
            }
          }
        ],
        edges: [
          { id: 'e1', source: 'trigger_1', target: 'if_else_1', type: 'main' },
          { id: 'e2', source: 'if_else_1', target: 'if_else_2', type: 'true' },
          { id: 'e3', source: 'if_else_1', target: 'node_c', type: 'false' },
          { id: 'e4', source: 'if_else_2', target: 'node_a', type: 'true' },
          { id: 'e5', source: 'if_else_2', target: 'node_b', type: 'false' }
        ]
      };

      // Act: Analyze branching structure
      const analysis = (generator as any).analyzeBranchingStructure(workflow, workflow.edges);

      // Assert: Verify both branching nodes detected
      expect(analysis.hasBranching).toBe(true);
      expect(analysis.branches).toHaveLength(2);
      
      // Verify first if_else
      const firstBranch = analysis.branches.find((b: any) => b.nodeId === 'if_else_1');
      expect(firstBranch).toBeDefined();
      expect(firstBranch?.branchType).toBe('binary');
      expect(firstBranch?.cases).toHaveLength(2);
      
      // Verify nested if_else
      const nestedBranch = analysis.branches.find((b: any) => b.nodeId === 'if_else_2');
      expect(nestedBranch).toBeDefined();
      expect(nestedBranch?.branchType).toBe('binary');
      expect(nestedBranch?.cases).toHaveLength(2);
    });

    it('should detect switch inside if_else branch', () => {
      // Arrange: Create workflow with switch nested in if_else
      const workflow: Workflow = {
        nodes: [
          {
            id: 'trigger_1',
            type: 'manual_trigger',
            data: {
              label: 'Manual Trigger',
              type: 'manual_trigger',
              category: 'trigger',
              config: {}
            }
          },
          {
            id: 'if_else_1',
            type: 'if_else',
            data: {
              label: 'Check User Type',
              type: 'if_else',
              category: 'logic',
              config: {}
            }
          },
          {
            id: 'switch_1',
            type: 'switch',
            data: {
              label: 'Route by Priority',
              type: 'switch',
              category: 'logic',
              config: {}
            }
          },
          {
            id: 'node_a',
            type: 'http_request',
            data: {
              label: 'High Priority',
              type: 'http_request',
              category: 'action',
              config: {}
            }
          },
          {
            id: 'node_b',
            type: 'http_request',
            data: {
              label: 'Low Priority',
              type: 'http_request',
              category: 'action',
              config: {}
            }
          },
          {
            id: 'node_c',
            type: 'http_request',
            data: {
              label: 'Guest User',
              type: 'http_request',
              category: 'action',
              config: {}
            }
          }
        ],
        edges: [
          { id: 'e1', source: 'trigger_1', target: 'if_else_1', type: 'main' },
          { id: 'e2', source: 'if_else_1', target: 'switch_1', type: 'true' },
          { id: 'e3', source: 'if_else_1', target: 'node_c', type: 'false' },
          { id: 'e4', source: 'switch_1', target: 'node_a', type: 'case_1' },
          { id: 'e5', source: 'switch_1', target: 'node_b', type: 'case_2' }
        ]
      };

      // Act: Analyze branching structure
      const analysis = (generator as any).analyzeBranchingStructure(workflow, workflow.edges);

      // Assert: Verify both branching nodes detected
      expect(analysis.hasBranching).toBe(true);
      expect(analysis.branches).toHaveLength(2);
      
      // Verify if_else
      const ifElseBranch = analysis.branches.find((b: any) => b.nodeType === 'if_else');
      expect(ifElseBranch).toBeDefined();
      expect(ifElseBranch?.branchType).toBe('binary');
      
      // Verify switch
      const switchBranch = analysis.branches.find((b: any) => b.nodeType === 'switch');
      expect(switchBranch).toBeDefined();
      expect(switchBranch?.branchType).toBe('multi-case');
      expect(switchBranch?.cases).toHaveLength(2);
    });
  });

  /**
   * Test: edge cases
   */
  describe('edge cases', () => {
    it('should return empty analysis when workflow is undefined', () => {
      // Act: Analyze with undefined workflow
      const analysis = (generator as any).analyzeBranchingStructure(undefined, []);

      // Assert: Verify empty analysis
      expect(analysis.hasBranching).toBe(false);
      expect(analysis.branches).toHaveLength(0);
      expect(analysis.mergePoints).toHaveLength(0);
    });

    it('should return empty analysis when edges are undefined', () => {
      // Arrange: Create workflow without edges
      const workflow: Workflow = {
        nodes: [
          {
            id: 'trigger_1',
            type: 'manual_trigger',
            data: {
              label: 'Manual Trigger',
              type: 'manual_trigger',
              category: 'trigger',
              config: {}
            }
          }
        ],
        edges: []
      };

      // Act: Analyze with undefined edges
      const analysis = (generator as any).analyzeBranchingStructure(workflow, undefined);

      // Assert: Verify empty analysis
      expect(analysis.hasBranching).toBe(false);
      expect(analysis.branches).toHaveLength(0);
      expect(analysis.mergePoints).toHaveLength(0);
    });

    it('should handle branching node with no outgoing edges', () => {
      // Arrange: Create workflow with if_else but no outgoing edges
      const workflow: Workflow = {
        nodes: [
          {
            id: 'trigger_1',
            type: 'manual_trigger',
            data: {
              label: 'Manual Trigger',
              type: 'manual_trigger',
              category: 'trigger',
              config: {}
            }
          },
          {
            id: 'if_else_1',
            type: 'if_else',
            data: {
              label: 'Check Condition',
              type: 'if_else',
              category: 'logic',
              config: {}
            }
          }
        ],
        edges: [
          {
            id: 'e1',
            source: 'trigger_1',
            target: 'if_else_1',
            type: 'main'
          }
        ]
      };

      // Act: Analyze branching structure
      const analysis = (generator as any).analyzeBranchingStructure(workflow, workflow.edges);

      // Assert: Verify branching detected but with empty cases
      expect(analysis.hasBranching).toBe(true);
      expect(analysis.branches).toHaveLength(1);
      expect(analysis.branches[0].cases).toHaveLength(0);
    });
  });
});
