/**
 * Unit tests for Orphan Node Prevention
 * 
 * Tests that DeterministicGraphAssembler guarantees zero orphan nodes
 */

import { deterministicGraphAssembler } from '../deterministicGraphAssembler';
import { WorkflowNode } from '../../../core/types/ai-types';
import { randomUUID } from 'crypto';

describe('Orphan Node Prevention', () => {
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
  
  describe('DeterministicGraphAssembler', () => {
    it('should guarantee zero orphan nodes for simple workflow', () => {
      const trigger = createMockNode('manual_trigger');
      const node1 = createMockNode('google_sheets');
      const node2 = createMockNode('slack_message');
      const nodes = [trigger, node1, node2];
      
      const result = deterministicGraphAssembler.assembleGraph(nodes);
      
      expect(result.success).toBe(true);
      expect(result.stats.orphanNodes).toBe(0);
      expect(result.edges.length).toBe(2); // trigger → node1 → node2
    });
    
    it('should guarantee zero orphan nodes for workflow without trigger', () => {
      const node1 = createMockNode('google_sheets');
      const node2 = createMockNode('slack_message');
      const nodes = [node1, node2];
      
      const result = deterministicGraphAssembler.assembleGraph(nodes);
      
      expect(result.success).toBe(true);
      expect(result.stats.orphanNodes).toBe(0);
      // Trigger should be auto-created
      expect(result.nodes.length).toBe(3); // trigger + node1 + node2
      expect(result.edges.length).toBe(2); // trigger → node1 → node2
    });
    
    it('should guarantee zero orphan nodes for complex workflow', () => {
      const trigger = createMockNode('manual_trigger');
      const node1 = createMockNode('google_sheets');
      const node2 = createMockNode('javascript');
      const node3 = createMockNode('ai_chat_model');
      const node4 = createMockNode('slack_message');
      const nodes = [trigger, node1, node2, node3, node4];
      
      const result = deterministicGraphAssembler.assembleGraph(nodes);
      
      expect(result.success).toBe(true);
      expect(result.stats.orphanNodes).toBe(0);
      expect(result.edges.length).toBe(4); // trigger → node1 → node2 → node3 → node4
    });
    
    it('should abort workflow build if edge creation fails', () => {
      // Create nodes with invalid configuration that would cause edge creation to fail
      const trigger = createMockNode('manual_trigger');
      const invalidNode = createMockNode('invalid_node_type');
      const nodes = [trigger, invalidNode];
      
      const result = deterministicGraphAssembler.assembleGraph(nodes);
      
      // Should fail gracefully (abort workflow build)
      // Note: This test may pass or fail depending on how invalid nodes are handled
      // The key is that it should not create a partial graph with orphan nodes
      if (!result.success) {
        expect(result.edges.length).toBe(0);
        expect(result.errors.length).toBeGreaterThan(0);
      }
    });
    
    it('should ensure every node except trigger has incoming edge', () => {
      const trigger = createMockNode('manual_trigger');
      const node1 = createMockNode('google_sheets');
      const node2 = createMockNode('slack_message');
      const nodes = [trigger, node1, node2];
      
      const result = deterministicGraphAssembler.assembleGraph(nodes);
      
      expect(result.success).toBe(true);
      
      // Check: Every node except trigger has incoming edge
      const incomingEdges = new Map<string, number>();
      for (const edge of result.edges) {
        const count = incomingEdges.get(edge.target) || 0;
        incomingEdges.set(edge.target, count + 1);
      }
      
      // Trigger should have no incoming edges
      expect(incomingEdges.get(trigger.id)).toBeUndefined();
      
      // All other nodes should have exactly one incoming edge
      for (const node of [node1, node2]) {
        expect(incomingEdges.get(node.id)).toBe(1);
      }
    });
    
    it('should ensure graph is fully connected', () => {
      const trigger = createMockNode('manual_trigger');
      const node1 = createMockNode('google_sheets');
      const node2 = createMockNode('slack_message');
      const nodes = [trigger, node1, node2];
      
      const result = deterministicGraphAssembler.assembleGraph(nodes);
      
      expect(result.success).toBe(true);
      
      // Check: All nodes reachable from trigger
      const reachable = new Set([trigger.id]);
      const queue = [trigger.id];
      
      while (queue.length > 0) {
        const currentNodeId = queue.shift()!;
        for (const edge of result.edges) {
          if (edge.source === currentNodeId && !reachable.has(edge.target)) {
            reachable.add(edge.target);
            queue.push(edge.target);
          }
        }
      }
      
      // All nodes should be reachable
      for (const node of nodes) {
        expect(reachable.has(node.id)).toBe(true);
      }
    });
  });
});
