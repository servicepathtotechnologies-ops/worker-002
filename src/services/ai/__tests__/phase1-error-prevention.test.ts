/**
 * Phase 1: Error Prevention Tests
 * 
 * Tests all 5 universal error prevention mechanisms
 */

import { universalHandleResolver } from '../../../core/utils/universal-handle-resolver';
import { universalBranchingValidator } from '../../../core/validation/universal-branching-validator';
import { universalCategoryResolver } from '../../../core/utils/universal-category-resolver';
import { edgeCreationValidator } from '../../../core/validation/edge-creation-validator';
import { executionOrderBuilder } from '../../../core/execution/execution-order-builder';
import { unifiedNodeRegistry } from '../../../core/registry/unified-node-registry';
import { Workflow, WorkflowNode, WorkflowEdge } from '../../../core/types/ai-types';

describe('Phase 1: Error Prevention', () => {
  beforeAll(() => {
    // Ensure registry is initialized
    unifiedNodeRegistry.getAllTypes();
  });
  
  describe('Universal Handle Resolver', () => {
    it('should resolve source handle for if_else node (true/false)', () => {
      const result = universalHandleResolver.resolveSourceHandle('if_else', 'true');
      expect(result.handle).toBe('true');
      expect(result.confidence).toBeGreaterThan(0.8);
    });
    
    it('should resolve source handle for switch node (case-based)', () => {
      const result = universalHandleResolver.resolveSourceHandle('switch', 'case_1');
      expect(result.handle).toBe('case_1');
      expect(result.confidence).toBeGreaterThan(0.8);
    });
    
    it('should use registry to determine valid ports (UNIVERSAL)', () => {
      const allNodeTypes = unifiedNodeRegistry.getAllTypes();
      const branchingNode = allNodeTypes.find(type => {
        const def = unifiedNodeRegistry.get(type);
        return def?.isBranching === true;
      });
      
      if (branchingNode) {
        const def = unifiedNodeRegistry.get(branchingNode);
        const result = universalHandleResolver.resolveSourceHandle(branchingNode);
        expect(def?.outgoingPorts).toContain(result.handle);
      }
    });
  });
  
  describe('Universal Branching Validator', () => {
    it('should allow branching for if_else node', () => {
      const allows = universalBranchingValidator.nodeAllowsBranching('if_else');
      expect(allows).toBe(true);
    });
    
    it('should allow branching for switch node', () => {
      const allows = universalBranchingValidator.nodeAllowsBranching('switch');
      expect(allows).toBe(true);
    });
    
    it('should not allow branching for non-branching nodes', () => {
      const allows = universalBranchingValidator.nodeAllowsBranching('slack_message');
      expect(allows).toBe(false);
    });
    
    it('should use registry to determine branching (UNIVERSAL)', () => {
      const allNodeTypes = unifiedNodeRegistry.getAllTypes();
      for (const nodeType of allNodeTypes) {
        const def = unifiedNodeRegistry.get(nodeType);
        const allows = universalBranchingValidator.nodeAllowsBranching(nodeType);
        
        if (def?.isBranching === true) {
          expect(allows).toBe(true);
        }
      }
    });
  });
  
  describe('Universal Category Resolver', () => {
    it('should resolve category for try_catch (flow category)', () => {
      const category = universalCategoryResolver.getNodeCategory('try_catch');
      expect(category).toBeDefined();
      expect(['transformation', 'flow']).toContain(category);
    });
    
    it('should resolve category using registry (UNIVERSAL)', () => {
      const allNodeTypes = unifiedNodeRegistry.getAllTypes();
      for (const nodeType of allNodeTypes) {
        const category = universalCategoryResolver.getNodeCategory(nodeType);
        expect(category).toBeDefined();
        expect(['dataSource', 'transformation', 'output']).toContain(category);
      }
    });
  });
  
  describe('Edge Creation Validator', () => {
    it('should prevent parallel branches from non-branching nodes', () => {
      const sourceNode: WorkflowNode = {
        id: 'node1',
        type: 'slack_message',
        data: { type: 'slack_message' },
        position: { x: 0, y: 0 },
      };
      
      const targetNode: WorkflowNode = {
        id: 'node2',
        type: 'log_output',
        data: { type: 'log_output' },
        position: { x: 100, y: 0 },
      };
      
      const existingEdges: WorkflowEdge[] = [
        {
          id: 'edge1',
          source: 'node1',
          target: 'node3',
          sourceHandle: 'output',
          targetHandle: 'input',
        },
      ];
      
      const validation = edgeCreationValidator.canCreateEdge(
        sourceNode,
        targetNode,
        existingEdges,
        []
      );
      
      expect(validation.allowed).toBe(false);
      expect(validation.reason).toContain('branching');
    });
    
    it('should allow multiple inputs for merge node', () => {
      const sourceNode: WorkflowNode = {
        id: 'node1',
        type: 'slack_message',
        data: { type: 'slack_message' },
        position: { x: 0, y: 0 },
      };
      
      const mergeNode: WorkflowNode = {
        id: 'merge',
        type: 'merge',
        data: { type: 'merge' },
        position: { x: 100, y: 0 },
      };
      
      const existingEdges: WorkflowEdge[] = [
        {
          id: 'edge1',
          source: 'node2',
          target: 'merge',
          sourceHandle: 'output',
          targetHandle: 'input',
        },
      ];
      
      const validation = edgeCreationValidator.canCreateEdge(
        sourceNode,
        mergeNode,
        existingEdges,
        []
      );
      
      expect(validation.allowed).toBe(true);
    });
  });
  
  describe('Execution Order Builder', () => {
    it('should build correct execution order', () => {
      const nodes: WorkflowNode[] = [
        { id: 'trigger', type: 'manual_trigger', data: { type: 'manual_trigger' }, position: { x: 0, y: 0 } },
        { id: 'source', type: 'google_sheets', data: { type: 'google_sheets' }, position: { x: 100, y: 0 } },
        { id: 'output', type: 'slack_message', data: { type: 'slack_message' }, position: { x: 200, y: 0 } },
      ];
      
      const edges: WorkflowEdge[] = [
        { id: 'e1', source: 'trigger', target: 'source', sourceHandle: 'output', targetHandle: 'input' },
        { id: 'e2', source: 'source', target: 'output', sourceHandle: 'output', targetHandle: 'input' },
      ];
      
      const order = executionOrderBuilder.buildExecutionOrder(nodes, edges);
      
      expect(order).toContain('trigger');
      expect(order).toContain('source');
      expect(order).toContain('output');
      expect(order.indexOf('trigger')).toBeLessThan(order.indexOf('source'));
      expect(order.indexOf('source')).toBeLessThan(order.indexOf('output'));
    });
  });
});
