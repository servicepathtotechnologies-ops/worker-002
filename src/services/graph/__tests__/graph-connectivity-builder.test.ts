/**
 * Unit tests for Graph Connectivity Builder
 * Tests deterministic edge creation, trigger anchoring, and orphan node attachment
 */

import { GraphConnectivityBuilder } from '../graph-connectivity-builder';
import { WorkflowNode, WorkflowEdge } from '../../../core/types/ai-types';
import { StructuredIntent } from '../../ai/intent-structurer';
import { randomUUID } from 'crypto';

describe('GraphConnectivityBuilder', () => {
  let builder: GraphConnectivityBuilder;
  
  beforeEach(() => {
    builder = new GraphConnectivityBuilder();
  });
  
  const createMockNode = (type: string, id?: string): WorkflowNode => ({
    id: id || randomUUID(),
    type: type,
    data: {
      label: type,
      type: type,
      category: type.includes('trigger') ? 'trigger' : 'action',
      config: {},
    },
    position: { x: 0, y: 0 },
  });
  
  describe('buildExecutionPlan', () => {
    it('should build execution plan with trigger first', () => {
      const trigger = createMockNode('manual_trigger');
      const node1 = createMockNode('google_sheets');
      const node2 = createMockNode('slack_message');
      const nodes = [node1, trigger, node2]; // Trigger not first
      
      const intent: StructuredIntent = {
        trigger: 'manual_trigger',
        actions: [
          { type: 'google_sheets', operation: 'read' },
          { type: 'slack_message', operation: 'send' },
        ],
        requires_credentials: [],
      };
      
      const plan = builder.buildExecutionPlan(intent, nodes);
      
      expect(plan.triggerNodeId).toBe(trigger.id);
      expect(plan.nodeIds[0]).toBe(trigger.id); // Trigger first
      expect(plan.nodeIds.length).toBe(3);
    });
    
    it('should create trigger if missing', () => {
      const node1 = createMockNode('google_sheets');
      const nodes = [node1];
      
      const intent: StructuredIntent = {
        trigger: 'manual_trigger',
        actions: [{ type: 'google_sheets', operation: 'read' }],
        requires_credentials: [],
      };
      
      const plan = builder.buildExecutionPlan(intent, nodes);
      
      expect(plan.triggerNodeId).toBeDefined();
      expect(plan.nodeIds[0]).toBe(plan.triggerNodeId); // Trigger first
      expect(nodes.length).toBe(2); // Trigger added to array
    });
    
    it('should order nodes: trigger → dataSources → transformations → actions', () => {
      const trigger = createMockNode('manual_trigger');
      const dataSource = createMockNode('google_sheets');
      const transformation = createMockNode('javascript');
      const action = createMockNode('slack_message');
      const nodes = [trigger, action, dataSource, transformation];
      
      const intent: StructuredIntent = {
        trigger: 'manual_trigger',
        dataSources: [{ type: 'google_sheets', operation: 'read' }],
        transformations: [{ type: 'javascript', operation: 'transform' }],
        actions: [{ type: 'slack_message', operation: 'send' }],
        requires_credentials: [],
      };
      
      const plan = builder.buildExecutionPlan(intent, nodes);
      
      const triggerIndex = plan.nodeIds.indexOf(trigger.id);
      const dataSourceIndex = plan.nodeIds.indexOf(dataSource.id);
      const transformationIndex = plan.nodeIds.indexOf(transformation.id);
      const actionIndex = plan.nodeIds.indexOf(action.id);
      
      expect(triggerIndex).toBe(0); // Trigger first
      expect(dataSourceIndex).toBeLessThan(transformationIndex);
      expect(transformationIndex).toBeLessThan(actionIndex);
    });
  });
  
  describe('buildEdgesFromPlan', () => {
    it('should create edges: plan[i] → plan[i+1]', () => {
      const trigger = createMockNode('manual_trigger');
      const node1 = createMockNode('google_sheets');
      const node2 = createMockNode('slack_message');
      
      const plan = {
        nodeIds: [trigger.id, node1.id, node2.id],
        nodeTypes: ['manual_trigger', 'google_sheets', 'slack_message'],
        triggerNodeId: trigger.id,
      };
      
      const edges = builder.buildEdgesFromPlan(plan);
      
      expect(edges.length).toBe(2);
      expect(edges[0].source).toBe(trigger.id);
      expect(edges[0].target).toBe(node1.id);
      expect(edges[1].source).toBe(node1.id);
      expect(edges[1].target).toBe(node2.id);
    });
    
    it('should create no edges for single node', () => {
      const trigger = createMockNode('manual_trigger');
      
      const plan = {
        nodeIds: [trigger.id],
        nodeTypes: ['manual_trigger'],
        triggerNodeId: trigger.id,
      };
      
      const edges = builder.buildEdgesFromPlan(plan);
      
      expect(edges.length).toBe(0);
    });
  });
  
  describe('attachOrphanNodes', () => {
    it('should attach orphan nodes to last reachable node', () => {
      const trigger = createMockNode('manual_trigger');
      const node1 = createMockNode('google_sheets');
      const orphan = createMockNode('slack_message');
      const nodes = [trigger, node1, orphan];
      
      const edges: WorkflowEdge[] = [
        { id: randomUUID(), source: trigger.id, target: node1.id },
      ];
      
      const newEdges = builder.attachOrphanNodes(nodes, edges, trigger.id);
      
      expect(newEdges.length).toBe(2);
      const orphanEdge = newEdges.find(e => e.target === orphan.id);
      expect(orphanEdge).toBeDefined();
      expect(orphanEdge?.source).toBe(node1.id); // Attached to last reachable
    });
    
    it('should not modify edges if no orphans', () => {
      const trigger = createMockNode('manual_trigger');
      const node1 = createMockNode('google_sheets');
      const nodes = [trigger, node1];
      
      const edges: WorkflowEdge[] = [
        { id: randomUUID(), source: trigger.id, target: node1.id },
      ];
      
      const newEdges = builder.attachOrphanNodes(nodes, edges, trigger.id);
      
      expect(newEdges.length).toBe(1);
      expect(newEdges[0]).toEqual(edges[0]);
    });
  });
  
  describe('validateGraphIntegrity', () => {
    it('should pass for valid connected graph', () => {
      const trigger = createMockNode('manual_trigger');
      const node1 = createMockNode('google_sheets');
      const nodes = [trigger, node1];
      
      const edges: WorkflowEdge[] = [
        { id: randomUUID(), source: trigger.id, target: node1.id },
      ];
      
      const result = builder.validateGraphIntegrity(nodes, edges, trigger.id);
      
      expect(result.valid).toBe(true);
      expect(result.errors.length).toBe(0);
      expect(result.details.reachableNodes).toBe(2);
    });
    
    it('should fail for orphan nodes', () => {
      const trigger = createMockNode('manual_trigger');
      const node1 = createMockNode('google_sheets');
      const orphan = createMockNode('slack_message');
      const nodes = [trigger, node1, orphan];
      
      const edges: WorkflowEdge[] = [
        { id: randomUUID(), source: trigger.id, target: node1.id },
      ];
      
      const result = builder.validateGraphIntegrity(nodes, edges, trigger.id);
      
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('not reachable from trigger');
    });
    
    it('should fail for multiple triggers', () => {
      const trigger1 = createMockNode('manual_trigger');
      const trigger2 = createMockNode('schedule');
      const nodes = [trigger1, trigger2];
      
      const edges: WorkflowEdge[] = [];
      
      const result = builder.validateGraphIntegrity(nodes, edges, trigger1.id);
      
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('Multiple trigger'))).toBe(true);
    });
    
    it('should fail for no trigger', () => {
      const node1 = createMockNode('google_sheets');
      const nodes = [node1];
      
      const edges: WorkflowEdge[] = [];
      
      const result = builder.validateGraphIntegrity(nodes, edges, 'non-existent-trigger');
      
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('No trigger'))).toBe(true);
    });
  });
  
  describe('end-to-end workflow', () => {
    it('should build complete connected graph from intent', () => {
      const node1 = createMockNode('google_sheets');
      const node2 = createMockNode('slack_message');
      const nodes = [node1, node2];
      
      const intent: StructuredIntent = {
        trigger: 'manual_trigger',
        actions: [
          { type: 'google_sheets', operation: 'read' },
          { type: 'slack_message', operation: 'send' },
        ],
        requires_credentials: [],
      };
      
      // Build execution plan
      const plan = builder.buildExecutionPlan(intent, nodes);
      
      // Build edges
      const edges = builder.buildEdgesFromPlan(plan);
      
      // Attach orphans (should be none)
      const finalEdges = builder.attachOrphanNodes(nodes, edges, plan.triggerNodeId);
      
      // Validate integrity
      const integrity = builder.validateGraphIntegrity(nodes, finalEdges, plan.triggerNodeId);
      
      expect(integrity.valid).toBe(true);
      expect(finalEdges.length).toBeGreaterThan(0);
      expect(integrity.details.reachableNodes).toBe(nodes.length);
    });
  });
});
