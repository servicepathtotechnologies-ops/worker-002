/**
 * Unit tests for Deterministic Edge Creation
 * 
 * Tests that edges are created deterministically from execution plan
 */

import { executionPlanBuilder } from '../executionPlanBuilder';
import { atomicEdgeCreator } from '../atomicEdgeCreator';
import { WorkflowNode } from '../../../core/types/ai-types';
import { randomUUID } from 'crypto';

describe('Deterministic Edge Creation', () => {
  const createMockNode = (type: string, id?: string): WorkflowNode => ({
    id: id || randomUUID(),
    type,
    data: {
      type,
      label: type,
      category: 'action',
      config: {},
    },
    position: { x: 0, y: 0 },
  });
  
  describe('ExecutionPlanBuilder', () => {
    it('should build execution plan with trigger first', () => {
      const trigger = createMockNode('manual_trigger');
      const node1 = createMockNode('google_sheets');
      const node2 = createMockNode('slack_message');
      const nodes = [node1, trigger, node2]; // Trigger not first
      
      const plan = executionPlanBuilder.buildExecutionPlan(nodes);
      
      expect(plan.isValid).toBe(true);
      expect(plan.orderedNodeIds[0]).toBe(trigger.id);
      expect(plan.triggerNodeId).toBe(trigger.id);
    });
    
    it('should create trigger if none exists', () => {
      const node1 = createMockNode('google_sheets');
      const node2 = createMockNode('slack_message');
      const nodes = [node1, node2];
      
      const plan = executionPlanBuilder.buildExecutionPlan(nodes);
      
      expect(plan.isValid).toBe(true);
      expect(plan.triggerNodeId).toBeTruthy();
      expect(plan.orderedNodeIds[0]).toBe(plan.triggerNodeId);
    });
    
    it('should include all nodes in execution plan', () => {
      const trigger = createMockNode('manual_trigger');
      const node1 = createMockNode('google_sheets');
      const node2 = createMockNode('slack_message');
      const nodes = [trigger, node1, node2];
      
      const plan = executionPlanBuilder.buildExecutionPlan(nodes);
      
      expect(plan.isValid).toBe(true);
      expect(plan.orderedNodeIds.length).toBe(3);
      
      const planNodeIds = new Set(plan.orderedNodeIds);
      for (const node of nodes) {
        expect(planNodeIds.has(node.id)).toBe(true);
      }
    });
  });
  
  describe('AtomicEdgeCreator', () => {
    it('should create edges atomically from execution plan', () => {
      const trigger = createMockNode('manual_trigger');
      const node1 = createMockNode('google_sheets');
      const node2 = createMockNode('slack_message');
      const nodes = [trigger, node1, node2];
      
      const plan = executionPlanBuilder.buildExecutionPlan(nodes);
      const edgeResult = atomicEdgeCreator.createEdgesFromExecutionPlan(plan, nodes);
      
      expect(edgeResult.success).toBe(true);
      expect(edgeResult.edges.length).toBe(2); // trigger → node1 → node2
      expect(edgeResult.stats.created).toBe(2);
      expect(edgeResult.stats.failed).toBe(0);
    });
    
    it('should create edges in correct order', () => {
      const trigger = createMockNode('manual_trigger');
      const node1 = createMockNode('google_sheets');
      const node2 = createMockNode('slack_message');
      const nodes = [trigger, node1, node2];
      
      const plan = executionPlanBuilder.buildExecutionPlan(nodes);
      const edgeResult = atomicEdgeCreator.createEdgesFromExecutionPlan(plan, nodes);
      
      expect(edgeResult.success).toBe(true);
      
      // Check edge order
      expect(edgeResult.edges[0].source).toBe(trigger.id);
      expect(edgeResult.edges[0].target).toBe(node1.id);
      expect(edgeResult.edges[1].source).toBe(node1.id);
      expect(edgeResult.edges[1].target).toBe(node2.id);
    });
    
    it('should validate edges against execution plan', () => {
      const trigger = createMockNode('manual_trigger');
      const node1 = createMockNode('google_sheets');
      const node2 = createMockNode('slack_message');
      const nodes = [trigger, node1, node2];
      
      const plan = executionPlanBuilder.buildExecutionPlan(nodes);
      const edgeResult = atomicEdgeCreator.createEdgesFromExecutionPlan(plan, nodes);
      
      const validation = atomicEdgeCreator.validateEdgesAgainstPlan(edgeResult.edges, plan);
      
      expect(validation.valid).toBe(true);
      expect(validation.errors.length).toBe(0);
    });
    
    it('should detect missing edges', () => {
      const trigger = createMockNode('manual_trigger');
      const node1 = createMockNode('google_sheets');
      const node2 = createMockNode('slack_message');
      const nodes = [trigger, node1, node2];
      
      const plan = executionPlanBuilder.buildExecutionPlan(nodes);
      const edgeResult = atomicEdgeCreator.createEdgesFromExecutionPlan(plan, nodes);
      
      // Remove one edge
      const incompleteEdges = edgeResult.edges.slice(0, 1);
      
      const validation = atomicEdgeCreator.validateEdgesAgainstPlan(incompleteEdges, plan);
      
      expect(validation.valid).toBe(false);
      expect(validation.errors.length).toBeGreaterThan(0);
    });
  });
});
