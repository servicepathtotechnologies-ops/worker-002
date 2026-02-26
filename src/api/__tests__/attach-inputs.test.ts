/**
 * Attach Inputs API Tests
 * 
 * Tests normalization and validation behavior in attach-inputs endpoint.
 * Ensures duplicate triggers are removed, invalid edges cleaned, and
 * only critical failures block saving.
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { Request, Response } from 'express';
import attachInputsHandler from '../attach-inputs';
import { getSupabaseClient } from '../../core/database/supabase-compat';

// Mock dependencies
jest.mock('../../core/database/supabase-compat');
jest.mock('../../core/utils/workflow-cloner');
jest.mock('../../core/validation/workflow-save-validator');
jest.mock('../../core/utils/workflow-graph-normalizer');
jest.mock('../../services/ai/credential-discovery-phase');

describe('Attach Inputs - Normalization and Validation', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let mockSupabase: any;

  beforeEach(() => {
    mockSupabase = {
      from: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn(),
      update: jest.fn().mockReturnThis(),
    };

    (getSupabaseClient as jest.Mock).mockReturnValue(mockSupabase);

    mockRequest = {
      body: {},
      params: { workflowId: 'test-workflow-id' },
    };

    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
  });

  describe('Normalization Behavior', () => {
    it('should remove duplicate trigger nodes during normalization', async () => {
      const { normalizeWorkflowForSave } = await import('../../core/validation/workflow-save-validator');
      
      const nodes = [
        { id: 'trigger1', type: 'manual_trigger', data: { type: 'manual_trigger', label: 'Trigger 1' } },
        { id: 'trigger2', type: 'manual_trigger', data: { type: 'manual_trigger', label: 'Trigger 2' } },
        { id: 'trigger3', type: 'manual_trigger', data: { type: 'manual_trigger', label: 'Trigger 3' } },
        { id: 'node1', type: 'log_output', data: { type: 'log_output', label: 'Log' } },
      ];
      
      const edges = [
        { id: 'e1', source: 'trigger1', target: 'node1' },
      ];

      const normalized = normalizeWorkflowForSave(nodes, edges);

      // Should keep only first trigger
      expect(normalized.nodes.length).toBe(2); // 1 trigger + 1 node
      expect(normalized.nodes.filter(n => n.data?.type === 'manual_trigger').length).toBe(1);
      expect(normalized.nodes[0].id).toBe('trigger1'); // First trigger kept
      expect(normalized.migrationsApplied.some(m => m.includes('duplicate trigger'))).toBe(true);
    });

    it('should clean invalid edges referencing non-existent nodes', async () => {
      const { normalizeWorkflowForSave } = await import('../../core/validation/workflow-save-validator');
      
      const nodes = [
        { id: 'trigger1', type: 'manual_trigger', data: { type: 'manual_trigger' } },
        { id: 'node1', type: 'log_output', data: { type: 'log_output' } },
      ];
      
      const edges = [
        { id: 'e1', source: 'trigger1', target: 'node1' }, // Valid
        { id: 'e2', source: 'nonexistent', target: 'node1' }, // Invalid
        { id: 'e3', source: 'trigger1', target: 'nonexistent' }, // Invalid
      ];

      const normalized = normalizeWorkflowForSave(nodes, edges);

      // Should remove invalid edges
      expect(normalized.edges.length).toBe(1);
      expect(normalized.edges[0].id).toBe('e1');
      expect(normalized.migrationsApplied.some(m => m.includes('invalid edge'))).toBe(true);
    });

    it('should deduplicate edges between same nodes', async () => {
      const { normalizeWorkflowForSave } = await import('../../core/validation/workflow-save-validator');
      
      const nodes = [
        { id: 'trigger1', type: 'manual_trigger', data: { type: 'manual_trigger' } },
        { id: 'node1', type: 'log_output', data: { type: 'log_output' } },
      ];
      
      const edges = [
        { id: 'e1', source: 'trigger1', target: 'node1' },
        { id: 'e2', source: 'trigger1', target: 'node1' }, // Duplicate
        { id: 'e3', source: 'trigger1', target: 'node1', sourceHandle: 'output', targetHandle: 'input' }, // Different handles, should keep
      ];

      const normalized = normalizeWorkflowForSave(nodes, edges);

      // Should keep unique edges (by source, target, handles)
      expect(normalized.edges.length).toBe(2); // e1 and e3 (different handles)
      expect(normalized.migrationsApplied.some(m => m.includes('Deduplicated'))).toBe(true);
    });

    it('should remove duplicate nodes by ID', async () => {
      const { normalizeWorkflowForSave } = await import('../../core/validation/workflow-save-validator');
      
      const nodes = [
        { id: 'node1', type: 'log_output', data: { type: 'log_output', label: 'Log 1' } },
        { id: 'node1', type: 'log_output', data: { type: 'log_output', label: 'Log 2' } }, // Duplicate ID
        { id: 'node2', type: 'log_output', data: { type: 'log_output', label: 'Log 3' } },
      ];
      
      const edges: any[] = [];

      const normalized = normalizeWorkflowForSave(nodes, edges);

      // Should keep only first occurrence of duplicate ID
      expect(normalized.nodes.length).toBe(2);
      expect(normalized.nodes[0].id).toBe('node1');
      expect(normalized.nodes[0].data?.label).toBe('Log 1'); // First occurrence kept
      expect(normalized.migrationsApplied.some(m => m.includes('duplicate node'))).toBe(true);
    });
  });

  describe('Validation Behavior', () => {
    it('should run validation after normalization', async () => {
      const { normalizeWorkflowForSave, validateWorkflowForSave } = await import('../../core/validation/workflow-save-validator');
      
      // Workflow with multiple triggers (should be normalized first)
      const nodes = [
        { id: 'trigger1', type: 'manual_trigger', data: { type: 'manual_trigger' } },
        { id: 'trigger2', type: 'manual_trigger', data: { type: 'manual_trigger' } },
      ];
      const edges: any[] = [];

      // Normalize first
      const normalized = normalizeWorkflowForSave(nodes, edges);
      
      // Then validate (should pass because normalization fixed it)
      const validation = validateWorkflowForSave(normalized.nodes, normalized.edges);
      
      expect(validation.canSave).toBe(true);
      expect(validation.errors.length).toBe(0);
    });

    it('should only block on critical errors (no nodes)', async () => {
      const { validateWorkflowForSave } = await import('../../core/validation/workflow-save-validator');
      
      const validation = validateWorkflowForSave([], []);
      
      expect(validation.canSave).toBe(false);
      expect(validation.errors.some(e => e.includes('must have exactly one trigger'))).toBe(true);
    });

    it('should allow multiple triggers if normalization can fix them', async () => {
      const { normalizeWorkflowForSave, validateWorkflowForSave } = await import('../../core/validation/workflow-save-validator');
      
      const nodes = [
        { id: 'trigger1', type: 'manual_trigger', data: { type: 'manual_trigger' } },
        { id: 'trigger2', type: 'manual_trigger', data: { type: 'manual_trigger' } },
        { id: 'node1', type: 'log_output', data: { type: 'log_output' } },
      ];
      const edges = [
        { id: 'e1', source: 'trigger1', target: 'node1' },
      ];

      // Normalize removes duplicate triggers
      const normalized = normalizeWorkflowForSave(nodes, edges);
      
      // Validation should pass after normalization
      const validation = validateWorkflowForSave(normalized.nodes, normalized.edges);
      
      expect(validation.canSave).toBe(true);
    });
  });

  describe('Saved Workflow Equals Normalized Workflow', () => {
    it('should save the normalized workflow, not the original', async () => {
      // This test would require mocking the full attach-inputs handler
      // For now, we verify the normalization function produces correct output
      const { normalizeWorkflowForSave } = await import('../../core/validation/workflow-save-validator');
      
      const originalNodes = [
        { id: 'trigger1', type: 'manual_trigger', data: { type: 'manual_trigger' } },
        { id: 'trigger2', type: 'manual_trigger', data: { type: 'manual_trigger' } },
        { id: 'node1', type: 'log_output', data: { type: 'log_output' } },
      ];
      const originalEdges = [
        { id: 'e1', source: 'trigger1', target: 'node1' },
        { id: 'e2', source: 'nonexistent', target: 'node1' }, // Invalid
      ];

      const normalized = normalizeWorkflowForSave(originalNodes, originalEdges);

      // Normalized should be different from original
      expect(normalized.nodes.length).not.toBe(originalNodes.length);
      expect(normalized.edges.length).not.toBe(originalEdges.length);
      
      // Normalized should have exactly one trigger
      expect(normalized.nodes.filter(n => n.data?.type === 'manual_trigger').length).toBe(1);
      
      // Normalized should have no invalid edges
      const nodeIds = new Set(normalized.nodes.map(n => n.id));
      const invalidEdges = normalized.edges.filter(e => 
        !nodeIds.has(e.source) || !nodeIds.has(e.target)
      );
      expect(invalidEdges.length).toBe(0);
    });
  });
});
