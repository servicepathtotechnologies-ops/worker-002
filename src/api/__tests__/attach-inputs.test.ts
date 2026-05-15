/**
 * Attach Inputs API Tests
 * 
 * Tests normalization and validation behavior in attach-inputs endpoint.
 * Ensures duplicate triggers are removed, invalid edges cleaned, and
 * only critical failures block saving.
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { Request, Response } from 'express';
import attachInputsHandler, {
  collectEffectiveFillModesForWizard,
  collectOwnershipUnlockFlagsForWizard,
  mergeOwnershipUnlockInputsForNode,
  normalizeSwitchCasesInput,
} from '../attach-inputs';
import { getDbClient } from '../../core/database/aws-db-client';

const mkNode = (
  id: string,
  type: string,
  label?: string,
  category: string = 'utility',
  config: Record<string, unknown> = {}
) => ({
  id,
  type,
  data: {
    type,
    label: label || type,
    category,
    config,
  },
});

// Mock dependencies
jest.mock('../../core/database/aws-db-client');
jest.mock('../../core/utils/workflow-cloner');
// These tests validate normalization/validation behavior, so use real implementations.
jest.mock('../../core/validation/workflow-save-validator', () => jest.requireActual('../../core/validation/workflow-save-validator'));
jest.mock('../../core/utils/workflow-graph-normalizer', () => jest.requireActual('../../core/utils/workflow-graph-normalizer'));
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

    (getDbClient as jest.Mock).mockReturnValue(mockSupabase);

    mockRequest = {
      body: {},
      params: { workflowId: 'test-workflow-id' },
    };

    mockResponse = {
      status: (jest.fn().mockReturnThis() as any),
      json: (jest.fn().mockReturnThis() as any),
    } as any;
  });

  describe('Normalization Behavior', () => {
    it('should remove duplicate trigger nodes during normalization', async () => {
      const { normalizeWorkflowForSave } = await import('../../core/validation/workflow-save-validator');
      
      const nodes = [
        mkNode('trigger1', 'manual_trigger', 'Trigger 1', 'triggers'),
        mkNode('trigger2', 'manual_trigger', 'Trigger 2', 'triggers'),
        mkNode('trigger3', 'manual_trigger', 'Trigger 3', 'triggers'),
        mkNode('node1', 'log_output', 'Log', 'output'),
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
        mkNode('trigger1', 'manual_trigger', 'Trigger', 'triggers'),
        mkNode('node1', 'log_output', 'Log', 'output'),
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
        mkNode('trigger1', 'manual_trigger', 'Trigger', 'triggers'),
        mkNode('node1', 'log_output', 'Log', 'output'),
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
        mkNode('node1', 'log_output', 'Log 1', 'output'),
        mkNode('node1', 'log_output', 'Log 2', 'output'), // Duplicate ID
        mkNode('node2', 'log_output', 'Log 3', 'output'),
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
        mkNode('trigger1', 'manual_trigger', 'Trigger 1', 'triggers'),
        mkNode('trigger2', 'manual_trigger', 'Trigger 2', 'triggers'),
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
        mkNode('trigger1', 'manual_trigger', 'Trigger 1', 'triggers'),
        mkNode('trigger2', 'manual_trigger', 'Trigger 2', 'triggers'),
        mkNode('node1', 'log_output', 'Log', 'output'),
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
        mkNode('trigger1', 'manual_trigger', 'Trigger 1', 'triggers'),
        mkNode('trigger2', 'manual_trigger', 'Trigger 2', 'triggers'),
        mkNode('node1', 'log_output', 'Log', 'output'),
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

  describe('ownership unlock (credentialTogglePolicy)', () => {
    it('mergeOwnershipUnlockInputsForNode sets _ownershipUnlock for unlockable credential field', () => {
      const config: Record<string, any> = {};
      const valid = new Set(['webhookUrl', 'message', 'channel']);
      const updated = mergeOwnershipUnlockInputsForNode(
        { unlock_n1_webhookUrl: 'true' },
        { id: 'n1' },
        'slack_message',
        config,
        valid
      );
      expect(updated).toBe(true);
      expect(config._ownershipUnlock?.webhookUrl).toBe(true);
    });

    it('mergeOwnershipUnlockInputsForNode clears flag when unlock value is false', () => {
      const config: Record<string, any> = { _ownershipUnlock: { webhookUrl: true } };
      const valid = new Set(['webhookUrl', 'message']);
      const updated = mergeOwnershipUnlockInputsForNode(
        { unlock_n1_webhookUrl: 'false' },
        { id: 'n1' },
        'slack_message',
        config,
        valid
      );
      expect(updated).toBe(true);
      expect(config._ownershipUnlock?.webhookUrl).toBeUndefined();
    });

    it('collectOwnershipUnlockFlagsForWizard builds unlock_* keys from node configs', () => {
      const nodes = [
        mkNode('a', 'slack_message', 'S', 'communication', {
          _ownershipUnlock: { webhookUrl: true },
        }),
      ];
      expect(collectOwnershipUnlockFlagsForWizard(nodes as any)).toEqual({
        unlock_a_webhookUrl: 'true',
      });
    });
  });

  describe('effective fill-mode diagnostics', () => {
    it('collects mode_<nodeId>_<fieldName> keys for valid fill modes only', () => {
      const nodes = [
        mkNode('n1', 'slack_message', 'Slack', 'communication', {
          _fillMode: {
            message: 'runtime_ai',
            webhookUrl: 'manual_static',
            invalidField: 'bogus_mode',
          },
        }),
        mkNode('n2', 'if_else', 'If', 'logic', {
          _fillMode: {
            conditions: 'buildtime_ai_once',
          },
        }),
      ];

      const modes = collectEffectiveFillModesForWizard(nodes as any[]);
      expect(modes).toEqual({
        mode_n1_message: 'runtime_ai',
        mode_n1_webhookUrl: 'manual_static',
        mode_n2_conditions: 'buildtime_ai_once',
      });
    });
  });

  describe('field-plane keys and graph validation', () => {
    it('initializeWorkflow + validateWorkflow succeeds for minimal trigger + slack chain', async () => {
      const { unifiedGraphOrchestrator } = await import('../../core/orchestration/unified-graph-orchestrator');
      const nodes = [
        mkNode('t', 'manual_trigger', 'T', 'triggers', {}),
        mkNode(
          'n1',
          'slack_message',
          'S',
          'communication',
          {
            message: 'hello',
            _fillMode: { message: 'manual_static', webhookUrl: 'manual_static' },
          }
        ),
      ];
      const init = unifiedGraphOrchestrator.initializeWorkflow(nodes as any);
      const validation = unifiedGraphOrchestrator.validateWorkflow(init.workflow, init.executionOrder);
      expect(validation.valid).toBe(true);
    });
  });

  describe('switch cases normalization', () => {
    it('accepts JSON string arrays and deduplicates empty/duplicate values', () => {
      const normalized = normalizeSwitchCasesInput(
        JSON.stringify([
          { value: 'red', label: 'Red' },
          { value: 'red', label: 'Red duplicate' },
          { value: 'blue' },
          '',
        ])
      );

      expect(normalized.valid).toBe(true);
      expect(normalized.value).toEqual([
        { value: 'red', label: 'Red' },
        { value: 'blue' },
      ]);
    });

    it('rejects malformed scalar values', () => {
      expect(normalizeSwitchCasesInput('/')).toEqual({ value: [], valid: false });
      expect(normalizeSwitchCasesInput('')).toEqual({ value: [], valid: false });
      expect(normalizeSwitchCasesInput({ foo: 'bar' })).toEqual({ value: [], valid: false });
    });
  });
});
