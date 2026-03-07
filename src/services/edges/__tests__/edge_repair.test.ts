/**
 * Unit tests for Edge Repair
 */

import { edgeCreationService } from '../edgeCreationService';
import { edgeSanitizer } from '../edgeSanitizer';
import { nodeIdResolver } from '../../../core/utils/nodeIdResolver';
import { WorkflowNode, WorkflowEdge } from '../../../core/types/ai-types';
import { randomUUID } from 'crypto';

describe('Edge Repair', () => {
  beforeEach(() => {
    nodeIdResolver.clear();
  });
  
  const createMockNode = (id: string, type: string): WorkflowNode => ({
    id,
    type,
    data: {
      label: type,
      type,
      category: 'action',
      config: {},
    },
    position: { x: 0, y: 0 },
  });
  
  describe('edgeCreationService', () => {
    it('should create edge with valid node IDs and handles', () => {
      const sourceNode = createMockNode('node-1', 'google_sheets');
      const targetNode = createMockNode('node-2', 'slack_message');
      
      nodeIdResolver.registerNodes([sourceNode, targetNode]);
      
      const result = edgeCreationService.createEdge({
        sourceNodeId: 'node-1',
        targetNodeId: 'node-2',
        sourceHandle: 'output',
        targetHandle: 'input',
        sourceNode,
        targetNode,
        nodes: [sourceNode, targetNode],
      });
      
      expect(result.success).toBe(true);
      expect(result.edge).toBeDefined();
      expect(result.edge?.source).toBe('node-1');
      expect(result.edge?.target).toBe('node-2');
      expect(result.edge?.sourceHandle).toBe('output');
      expect(result.edge?.targetHandle).toBe('input');
    });
    
    it('should repair invalid handles', () => {
      const sourceNode = createMockNode('node-1', 'google_sheets');
      const targetNode = createMockNode('node-2', 'slack_message');
      
      nodeIdResolver.registerNodes([sourceNode, targetNode]);
      
      const result = edgeCreationService.createEdge({
        sourceNodeId: 'node-1',
        targetNodeId: 'node-2',
        sourceHandle: 'data', // Invalid, should normalize to 'output'
        targetHandle: 'message', // Invalid, should normalize to 'input'
        sourceNode,
        targetNode,
        nodes: [sourceNode, targetNode],
        allowRepair: true,
      });
      
      expect(result.success).toBe(true);
      expect(result.edge).toBeDefined();
      expect(result.repairs.length).toBeGreaterThan(0);
      expect(result.edge?.sourceHandle).toBe('output');
      expect(result.edge?.targetHandle).toBe('input');
    });
    
    it('should resolve logical IDs to physical IDs', () => {
      const sourceNode = createMockNode('node-1', 'google_sheets');
      const targetNode = createMockNode('node-2', 'slack_message');
      
      nodeIdResolver.register('step_1', 'node-1', 'google_sheets');
      nodeIdResolver.register('step_2', 'node-2', 'slack_message');
      
      const result = edgeCreationService.createEdge({
        sourceNodeId: 'step_1', // Logical ID
        targetNodeId: 'step_2', // Logical ID
        sourceNode,
        targetNode,
        nodes: [sourceNode, targetNode],
      });
      
      expect(result.success).toBe(true);
      expect(result.edge?.source).toBe('node-1'); // Resolved physical ID
      expect(result.edge?.target).toBe('node-2'); // Resolved physical ID
      expect(result.repairs.some(r => r.type === 'node_id_resolution')).toBe(true);
    });
    
    it('should fail if nodes do not exist', () => {
      const result = edgeCreationService.createEdge({
        sourceNodeId: 'non-existent-1',
        targetNodeId: 'non-existent-2',
        nodes: [],
      });
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });
  });
  
  describe('edgeSanitizer', () => {
    it('should sanitize edges with invalid node IDs', () => {
      const nodes = [
        createMockNode('node-1', 'google_sheets'),
        createMockNode('node-2', 'slack_message'),
      ];
      
      nodeIdResolver.register('step_1', 'node-1', 'google_sheets');
      nodeIdResolver.register('step_2', 'node-2', 'slack_message');
      
      const edges: WorkflowEdge[] = [
        {
          id: randomUUID(),
          source: 'step_1', // Logical ID
          target: 'step_2', // Logical ID
          sourceHandle: 'data',
          targetHandle: 'message',
        },
      ];
      
      const result = edgeSanitizer.sanitize(edges, nodes);
      
      expect(result.edges.length).toBe(1);
      expect(result.edges[0].source).toBe('node-1'); // Resolved
      expect(result.edges[0].target).toBe('node-2'); // Resolved
      expect(result.stats.repaired).toBeGreaterThan(0);
    });
    
    it('should remove edges with unrecoverable node IDs', () => {
      const nodes = [
        createMockNode('node-1', 'google_sheets'),
      ];
      
      const edges: WorkflowEdge[] = [
        {
          id: randomUUID(),
          source: 'node-1',
          target: 'non-existent', // Invalid
          sourceHandle: 'output',
          targetHandle: 'input',
        },
      ];
      
      const result = edgeSanitizer.sanitize(edges, nodes);
      
      expect(result.edges.length).toBe(0);
      expect(result.removed.length).toBe(1);
      expect(result.stats.removed).toBe(1);
    });
    
    it('should repair handles during sanitization', () => {
      const nodes = [
        createMockNode('node-1', 'google_sheets'),
        createMockNode('node-2', 'slack_message'),
      ];
      
      const edges: WorkflowEdge[] = [
        {
          id: randomUUID(),
          source: 'node-1',
          target: 'node-2',
          sourceHandle: 'data', // Invalid
          targetHandle: 'message', // Invalid
        },
      ];
      
      const result = edgeSanitizer.sanitize(edges, nodes);
      
      expect(result.edges.length).toBe(1);
      expect(result.edges[0].sourceHandle).toBe('output'); // Repaired
      expect(result.edges[0].targetHandle).toBe('input'); // Repaired
      expect(result.repaired.length).toBeGreaterThan(0);
    });
  });
});
