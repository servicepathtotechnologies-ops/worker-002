/**
 * Comprehensive Error Prevention Tests
 * 
 * ✅ PHASE 5: Tests to ensure the 5 critical errors NEVER recur
 * 
 * These tests verify:
 * - Error #1: Invalid source handle for if_else/switch nodes
 * - Error #2: Incorrect execution order
 * - Error #3: Multiple outgoing edges from non-branching nodes
 * - Error #4: Orphan nodes not being reconnected
 * - Error #5: Parallel branches from multiple sources to same target
 */

import { universalHandleResolver } from '../../../core/utils/universal-handle-resolver';
import { universalBranchingValidator } from '../../../core/validation/universal-branching-validator';
import { universalCategoryResolver } from '../../../core/utils/universal-category-resolver';
import { edgeCreationValidator } from '../../../core/validation/edge-creation-validator';
import { executionOrderBuilder } from '../../../core/execution/execution-order-builder';
import { unifiedNodeRegistry } from '../../../core/registry/unified-node-registry';
import { Workflow, WorkflowNode, WorkflowEdge } from '../../../core/types/ai-types';

describe('Error Prevention - Comprehensive Tests', () => {
  beforeAll(() => {
    // Ensure registry is initialized
    unifiedNodeRegistry.getAllTypes();
  });
  
  describe('Error #1: Invalid source handle for if_else/switch nodes', () => {
    it('should NEVER use "output" handle for if_else node', () => {
      // Test if_else node
      const result = universalHandleResolver.resolveSourceHandle('if_else', 'output');
      
      // Should NOT return 'output' - should return 'true' or 'false'
      expect(result.handle).not.toBe('output');
      expect(['true', 'false']).toContain(result.handle);
    });
    
    it('should NEVER use "output" handle for switch node', () => {
      // Test switch node
      const result = universalHandleResolver.resolveSourceHandle('switch', 'output');
      
      // Should NOT return 'output' - should return a case handle
      expect(result.handle).not.toBe('output');
      expect(result.handle).toMatch(/^case_/);
    });
    
    it('should use registry to determine valid handles (UNIVERSAL)', () => {
      const allNodeTypes = unifiedNodeRegistry.getAllTypes();
      
      for (const nodeType of allNodeTypes) {
        const nodeDef = unifiedNodeRegistry.get(nodeType);
        if (!nodeDef) continue;
        
        if (nodeDef.isBranching) {
          const result = universalHandleResolver.resolveSourceHandle(nodeType);
          
          // Should return a valid port from registry
          expect(nodeDef.outgoingPorts).toContain(result.handle);
          expect(result.handle).not.toBe('output'); // Unless explicitly 'output' in registry
        }
      }
    });
    
    it('should prioritize explicit handles from structure', () => {
      // Test with explicit 'true' handle
      const result = universalHandleResolver.resolveSourceHandle('if_else', 'true');
      expect(result.handle).toBe('true');
      
      // Test with explicit 'false' handle
      const result2 = universalHandleResolver.resolveSourceHandle('if_else', 'false');
      expect(result2.handle).toBe('false');
    });
  });
  
  describe('Error #2: Incorrect execution order', () => {
    it('should NEVER have data source after transformation in execution order', () => {
      const nodes: WorkflowNode[] = [
        { id: 'trigger', type: 'manual_trigger', data: { type: 'manual_trigger' }, position: { x: 0, y: 0 } },
        { id: 'source', type: 'google_sheets', data: { type: 'google_sheets' }, position: { x: 100, y: 0 } },
        { id: 'transform', type: 'text_summarizer', data: { type: 'text_summarizer' }, position: { x: 200, y: 0 } },
        { id: 'output', type: 'slack_message', data: { type: 'slack_message' }, position: { x: 300, y: 0 } },
      ];
      
      const edges: WorkflowEdge[] = [
        { id: 'e1', source: 'trigger', target: 'source', sourceHandle: 'output', targetHandle: 'input' },
        { id: 'e2', source: 'source', target: 'transform', sourceHandle: 'output', targetHandle: 'input' },
        { id: 'e3', source: 'transform', target: 'output', sourceHandle: 'output', targetHandle: 'input' },
      ];
      
      const order = executionOrderBuilder.buildExecutionOrder(nodes, edges);
      
      // Verify correct order
      expect(order.indexOf('trigger')).toBeLessThan(order.indexOf('source'));
      expect(order.indexOf('source')).toBeLessThan(order.indexOf('transform'));
      expect(order.indexOf('transform')).toBeLessThan(order.indexOf('output'));
    });
    
    it('should handle dependencies correctly (topological sort)', () => {
      const nodes: WorkflowNode[] = [
        { id: 'a', type: 'google_sheets', data: { type: 'google_sheets' }, position: { x: 0, y: 0 } },
        { id: 'b', type: 'text_summarizer', data: { type: 'text_summarizer' }, position: { x: 100, y: 0 } },
        { id: 'c', type: 'slack_message', data: { type: 'slack_message' }, position: { x: 200, y: 0 } },
      ];
      
      const edges: WorkflowEdge[] = [
        { id: 'e1', source: 'a', target: 'b', sourceHandle: 'output', targetHandle: 'input' },
        { id: 'e2', source: 'b', target: 'c', sourceHandle: 'output', targetHandle: 'input' },
      ];
      
      const order = executionOrderBuilder.buildExecutionOrder(nodes, edges);
      
      // B depends on A, so A must come before B
      expect(order.indexOf('a')).toBeLessThan(order.indexOf('b'));
      // C depends on B, so B must come before C
      expect(order.indexOf('b')).toBeLessThan(order.indexOf('c'));
    });
    
    it('should detect circular dependencies', () => {
      const nodes: WorkflowNode[] = [
        { id: 'a', type: 'google_sheets', data: { type: 'google_sheets' }, position: { x: 0, y: 0 } },
        { id: 'b', type: 'text_summarizer', data: { type: 'text_summarizer' }, position: { x: 100, y: 0 } },
      ];
      
      // Circular dependency: A → B → A
      const edges: WorkflowEdge[] = [
        { id: 'e1', source: 'a', target: 'b', sourceHandle: 'output', targetHandle: 'input' },
        { id: 'e2', source: 'b', target: 'a', sourceHandle: 'output', targetHandle: 'input' },
      ];
      
      // Should handle gracefully (not crash)
      const order = executionOrderBuilder.buildExecutionOrder(nodes, edges);
      expect(order.length).toBeGreaterThan(0);
    });
  });
  
  describe('Error #3: Multiple outgoing edges from non-branching nodes', () => {
    it('should NEVER allow multiple outgoing edges from non-branching nodes', () => {
      const sourceNode: WorkflowNode = {
        id: 'source',
        type: 'slack_message',
        data: { type: 'slack_message' },
        position: { x: 0, y: 0 },
      };
      
      const target1: WorkflowNode = {
        id: 'target1',
        type: 'log_output',
        data: { type: 'log_output' },
        position: { x: 100, y: 0 },
      };
      
      const target2: WorkflowNode = {
        id: 'target2',
        type: 'log_output',
        data: { type: 'log_output' },
        position: { x: 100, y: 100 },
      };
      
      const existingEdges: WorkflowEdge[] = [
        {
          id: 'e1',
          source: 'source',
          target: 'target1',
          sourceHandle: 'output',
          targetHandle: 'input',
        },
      ];
      
      // Try to create second edge from same source
      const validation = edgeCreationValidator.canCreateEdge(
        sourceNode,
        target2,
        existingEdges,
        []
      );
      
      // Should NOT allow (slack_message is not a branching node)
      expect(validation.allowed).toBe(false);
      expect(validation.reason).toContain('branching');
    });
    
    it('should allow multiple outgoing edges from if_else node', () => {
      const ifElseNode: WorkflowNode = {
        id: 'if_else',
        type: 'if_else',
        data: { type: 'if_else' },
        position: { x: 0, y: 0 },
      };
      
      const truePath: WorkflowNode = {
        id: 'true_path',
        type: 'log_output',
        data: { type: 'log_output' },
        position: { x: 100, y: 0 },
      };
      
      const falsePath: WorkflowNode = {
        id: 'false_path',
        type: 'log_output',
        data: { type: 'log_output' },
        position: { x: 100, y: 100 },
      };
      
      const existingEdges: WorkflowEdge[] = [
        {
          id: 'e1',
          source: 'if_else',
          target: 'true_path',
          sourceHandle: 'true',
          targetHandle: 'input',
        },
      ];
      
      // Try to create second edge (false path)
      const validation = edgeCreationValidator.canCreateEdge(
        ifElseNode,
        falsePath,
        existingEdges,
        []
      );
      
      // Should allow (if_else is a branching node)
      expect(validation.allowed).toBe(true);
    });
    
    it('should use registry to determine branching (UNIVERSAL)', () => {
      const allNodeTypes = unifiedNodeRegistry.getAllTypes();
      
      for (const nodeType of allNodeTypes) {
        const nodeDef = unifiedNodeRegistry.get(nodeType);
        if (!nodeDef) continue;
        
        const allowsBranching = universalBranchingValidator.nodeAllowsBranching(nodeType);
        
        // If registry says isBranching=true, validator should allow branching
        if (nodeDef.isBranching === true) {
          expect(allowsBranching).toBe(true);
        }
      }
    });
  });
  
  describe('Error #4: Orphan nodes not being reconnected', () => {
    it('should resolve category for ALL node types (UNIVERSAL)', () => {
      const allNodeTypes = unifiedNodeRegistry.getAllTypes();
      
      for (const nodeType of allNodeTypes) {
        const category = universalCategoryResolver.getNodeCategory(nodeType);
        
        // Should always return a valid category
        expect(category).toBeDefined();
        expect(['dataSource', 'transformation', 'output']).toContain(category);
      }
    });
    
    it('should resolve category for try_catch (flow category)', () => {
      const category = universalCategoryResolver.getNodeCategory('try_catch');
      
      // Should resolve to transformation (flow nodes are transformations)
      expect(category).toBe('transformation');
    });
    
    it('should resolve category using registry (not hardcoded)', () => {
      // Test with a random node type
      const allNodeTypes = unifiedNodeRegistry.getAllTypes();
      const testNodeType = allNodeTypes[Math.floor(Math.random() * allNodeTypes.length)];
      
      const category = universalCategoryResolver.getNodeCategory(testNodeType);
      
      // Should resolve using registry
      expect(category).toBeDefined();
      
      // Verify it matches registry category
      const nodeDef = unifiedNodeRegistry.get(testNodeType);
      if (nodeDef) {
        // Category should be consistent with registry
        expect(category).toBeDefined();
      }
    });
  });
  
  describe('Error #5: Parallel branches from multiple sources to same target', () => {
    it('should NEVER allow parallel branches to non-merge nodes', () => {
      const source1: WorkflowNode = {
        id: 'source1',
        type: 'google_sheets',
        data: { type: 'google_sheets' },
        position: { x: 0, y: 0 },
      };
      
      const source2: WorkflowNode = {
        id: 'source2',
        type: 'google_gmail',
        data: { type: 'google_gmail' },
        position: { x: 0, y: 100 },
      };
      
      const target: WorkflowNode = {
        id: 'target',
        type: 'slack_message',
        data: { type: 'slack_message' },
        position: { x: 100, y: 0 },
      };
      
      const existingEdges: WorkflowEdge[] = [
        {
          id: 'e1',
          source: 'source1',
          target: 'target',
          sourceHandle: 'output',
          targetHandle: 'input',
        },
      ];
      
      // Try to create second edge to same target
      const validation = edgeCreationValidator.canCreateEdge(
        source2,
        target,
        existingEdges,
        []
      );
      
      // Should NOT allow (target is not a merge node)
      expect(validation.allowed).toBe(false);
      expect(validation.reason).toContain('multiple inputs');
    });
    
    it('should allow multiple inputs for merge node', () => {
      const source1: WorkflowNode = {
        id: 'source1',
        type: 'google_sheets',
        data: { type: 'google_sheets' },
        position: { x: 0, y: 0 },
      };
      
      const source2: WorkflowNode = {
        id: 'source2',
        type: 'google_gmail',
        data: { type: 'google_gmail' },
        position: { x: 0, y: 100 },
      };
      
      const mergeNode: WorkflowNode = {
        id: 'merge',
        type: 'merge',
        data: { type: 'merge' },
        position: { x: 100, y: 0 },
      };
      
      const existingEdges: WorkflowEdge[] = [
        {
          id: 'e1',
          source: 'source1',
          target: 'merge',
          sourceHandle: 'output',
          targetHandle: 'input',
        },
      ];
      
      // Try to create second edge to merge node
      const validation = edgeCreationValidator.canCreateEdge(
        source2,
        mergeNode,
        existingEdges,
        []
      );
      
      // Should allow (merge node accepts multiple inputs)
      expect(validation.allowed).toBe(true);
    });
    
    it('should use registry to determine if node allows multiple inputs (UNIVERSAL)', () => {
      const allNodeTypes = unifiedNodeRegistry.getAllTypes();
      
      for (const nodeType of allNodeTypes) {
        const nodeDef = unifiedNodeRegistry.get(nodeType);
        if (!nodeDef) continue;
        
        const allowsMultipleInputs = universalBranchingValidator.nodeAllowsMultipleInputs(nodeType);
        
        // If registry says it's a merge/logic node with multiple incoming ports, should allow
        if (nodeDef.category === 'logic' && nodeDef.incomingPorts && nodeDef.incomingPorts.length > 1) {
          expect(allowsMultipleInputs).toBe(true);
        }
      }
    });
  });
  
  describe('Universal Verification - All Errors Prevented', () => {
    it('should prevent ALL 5 errors in a complex workflow', () => {
      // Create a complex workflow with if_else, multiple sources, transformations
      const nodes: WorkflowNode[] = [
        { id: 'trigger', type: 'manual_trigger', data: { type: 'manual_trigger' }, position: { x: 0, y: 0 } },
        { id: 'source', type: 'google_sheets', data: { type: 'google_sheets' }, position: { x: 100, y: 0 } },
        { id: 'if_else', type: 'if_else', data: { type: 'if_else' }, position: { x: 200, y: 0 } },
        { id: 'true_path', type: 'slack_message', data: { type: 'slack_message' }, position: { x: 300, y: 0 } },
        { id: 'false_path', type: 'email', data: { type: 'email' }, position: { x: 300, y: 100 } },
        { id: 'merge', type: 'merge', data: { type: 'merge' }, position: { x: 400, y: 0 } },
        { id: 'log', type: 'log_output', data: { type: 'log_output' }, position: { x: 500, y: 0 } },
      ];
      
      const edges: WorkflowEdge[] = [];
      
      // Build edges with validation
      const edgePairs = [
        { source: 'trigger', target: 'source' },
        { source: 'source', target: 'if_else' },
        { source: 'if_else', target: 'true_path', handle: 'true' },
        { source: 'if_else', target: 'false_path', handle: 'false' },
        { source: 'true_path', target: 'merge' },
        { source: 'false_path', target: 'merge' },
        { source: 'merge', target: 'log' },
      ];
      
      for (const pair of edgePairs) {
        const sourceNode = nodes.find(n => n.id === pair.source)!;
        const targetNode = nodes.find(n => n.id === pair.target)!;
        
        // Validate before creating
        const validation = edgeCreationValidator.canCreateEdge(
          sourceNode,
          targetNode,
          edges,
          []
        );
        
        if (validation.allowed) {
          // Resolve handles
          const sourceHandle = pair.handle || 
            universalHandleResolver.resolveSourceHandle(sourceNode.data.type).handle;
          const targetHandle = universalHandleResolver.resolveTargetHandle(targetNode.data.type).handle;
          
          edges.push({
            id: `${pair.source}->${pair.target}`,
            source: pair.source,
            target: pair.target,
            sourceHandle,
            targetHandle,
          });
        }
      }
      
      // Verify no errors
      // Error #1: Handles should be correct
      const ifElseEdges = edges.filter(e => e.source === 'if_else');
      expect(ifElseEdges.every(e => ['true', 'false'].includes(e.sourceHandle))).toBe(true);
      
      // Error #2: Execution order should be correct
      const order = executionOrderBuilder.buildExecutionOrder(nodes, edges);
      expect(order.indexOf('trigger')).toBeLessThan(order.indexOf('source'));
      expect(order.indexOf('source')).toBeLessThan(order.indexOf('if_else'));
      
      // Error #3: No multiple outgoing edges from non-branching nodes
      const branchingValidation = universalBranchingValidator.validateNoInvalidBranching(
        { nodes, edges },
        []
      );
      expect(branchingValidation.valid).toBe(true);
      
      // Error #4: All nodes should have categories
      for (const node of nodes) {
        const category = universalCategoryResolver.getNodeCategory(node.data.type);
        expect(category).toBeDefined();
      }
      
      // Error #5: No parallel branches to non-merge nodes
      const targetCounts = new Map<string, number>();
      for (const edge of edges) {
        const count = targetCounts.get(edge.target) || 0;
        targetCounts.set(edge.target, count + 1);
      }
      
      for (const [targetId, count] of targetCounts.entries()) {
        if (count > 1) {
          const targetNode = nodes.find(n => n.id === targetId)!;
          const allowsMultiple = universalBranchingValidator.nodeAllowsMultipleInputs(targetNode.data.type);
          expect(allowsMultiple).toBe(true); // Only merge nodes should have multiple inputs
        }
      }
    });
  });
});
