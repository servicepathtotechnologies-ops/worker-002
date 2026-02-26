/**
 * Workflow Cloner Tests
 * 
 * Tests for workflow cloning and immutability verification.
 */

import { cloneWorkflowDefinition, verifyWorkflowImmutable } from '../workflow-cloner';
import { WorkflowNode, WorkflowEdge } from '../../types/ai-types';

describe('Workflow Cloner Tests', () => {
  const sampleNodes: WorkflowNode[] = [
    {
      id: 'node1',
      type: 'manual_trigger',
      position: { x: 0, y: 0 },
      data: {
        type: 'manual_trigger',
        label: 'Start',
        config: {}
      }
    },
    {
      id: 'node2',
      type: 'javascript',
      position: { x: 100, y: 100 },
      data: {
        type: 'javascript',
        label: 'Process',
        config: {
          code: 'return input.data;'
        }
      }
    }
  ];

  const sampleEdges: WorkflowEdge[] = [
    {
      id: 'edge1',
      source: 'node1',
      target: 'node2',
      sourceHandle: 'default',
      targetHandle: 'default'
    }
  ];

  describe('cloneWorkflowDefinition', () => {
    it('should create a deep clone of nodes and edges', () => {
      const cloned = cloneWorkflowDefinition(sampleNodes, sampleEdges, 'test-workflow');

      // Should have same structure
      expect(cloned.nodes).toHaveLength(sampleNodes.length);
      expect(cloned.edges).toHaveLength(sampleEdges.length);

      // Should be different objects (not same reference)
      expect(cloned.nodes).not.toBe(sampleNodes);
      expect(cloned.edges).not.toBe(sampleEdges);

      // Should have same content
      expect(cloned.nodes[0].id).toBe(sampleNodes[0].id);
      expect(cloned.nodes[0].data.config).toEqual(sampleNodes[0].data.config);
    });

    it('should include metadata', () => {
      const cloned = cloneWorkflowDefinition(sampleNodes, sampleEdges, 'test-workflow');

      expect(cloned.metadata).toBeDefined();
      expect(cloned.metadata.originalWorkflowId).toBe('test-workflow');
      expect(cloned.metadata.clonedAt).toBeDefined();
    });

    it('should create independent copies (mutations on clone do not affect original)', () => {
      const cloned = cloneWorkflowDefinition(sampleNodes, sampleEdges, 'test-workflow');

      // Mutate clone
      if (cloned.nodes[0].data?.config) {
        cloned.nodes[0].data.config.test = 'mutated';
      }

      // Original should be unchanged
      expect(sampleNodes[0].data?.config).not.toHaveProperty('test');
    });

    it('should handle empty workflows', () => {
      const cloned = cloneWorkflowDefinition([], [], 'empty-workflow');

      expect(cloned.nodes).toHaveLength(0);
      expect(cloned.edges).toHaveLength(0);
      expect(cloned.metadata.originalWorkflowId).toBe('empty-workflow');
    });
  });

  describe('verifyWorkflowImmutable', () => {
    it('should detect no mutations when workflows are identical', () => {
      const original = { nodes: sampleNodes, edges: sampleEdges };
      const current = { nodes: sampleNodes, edges: sampleEdges };

      const result = verifyWorkflowImmutable(original, current);

      expect(result.isImmutable).toBe(true);
      expect(result.mutations).toHaveLength(0);
    });

    it('should detect node count changes', () => {
      const original = { nodes: sampleNodes, edges: sampleEdges };
      const current = { nodes: [...sampleNodes, sampleNodes[0]], edges: sampleEdges };

      const result = verifyWorkflowImmutable(original, current);

      expect(result.isImmutable).toBe(false);
      expect(result.mutations.some(m => m.includes('Node count'))).toBe(true);
    });

    it('should detect edge count changes', () => {
      const original = { nodes: sampleNodes, edges: sampleEdges };
      const current = { nodes: sampleNodes, edges: [...sampleEdges, sampleEdges[0]] };

      const result = verifyWorkflowImmutable(original, current);

      expect(result.isImmutable).toBe(false);
      expect(result.mutations.some(m => m.includes('Edge count'))).toBe(true);
    });

    it('should detect node config mutations', () => {
      const original = { nodes: sampleNodes, edges: sampleEdges };
      const mutatedNodes = JSON.parse(JSON.stringify(sampleNodes));
      if (mutatedNodes[0].data?.config) {
        mutatedNodes[0].data.config.newField = 'mutated';
      }
      const current = { nodes: mutatedNodes, edges: sampleEdges };

      const result = verifyWorkflowImmutable(original, current);

      expect(result.isImmutable).toBe(false);
      expect(result.mutations.some(m => m.includes('config was mutated'))).toBe(true);
    });

    it('should detect removed nodes', () => {
      const original = { nodes: sampleNodes, edges: sampleEdges };
      const current = { nodes: [sampleNodes[0]], edges: sampleEdges };

      const result = verifyWorkflowImmutable(original, current);

      expect(result.isImmutable).toBe(false);
      expect(result.mutations.some(m => m.includes('was removed'))).toBe(true);
    });
  });
});
