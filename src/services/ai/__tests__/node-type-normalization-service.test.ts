/**
 * NodeTypeNormalizationService Tests
 * 
 * Tests for node type normalization and validation
 */

import { nodeTypeNormalizationService } from '../node-type-normalization-service';
import { StructuredIntent } from '../intent-structurer';
import { WorkflowStructure } from '../workflow-structure-builder';
import { Workflow, WorkflowNode } from '../../../core/types/ai-types';
import { nodeLibrary } from '../../nodes/node-library';

describe('NodeTypeNormalizationService', () => {
  describe('normalizeNodeType', () => {
    it('should map ai_summary to text_summarizer', () => {
      const result = nodeTypeNormalizationService.normalizeNodeType('ai_summary');
      expect(result.valid).toBe(true);
      expect(result.normalized).toBe('text_summarizer');
      expect(result.method).toBe('abstract_mapping');
    });

    it('should map ai_summarization to text_summarizer', () => {
      const result = nodeTypeNormalizationService.normalizeNodeType('ai_summarization');
      expect(result.valid).toBe(true);
      expect(result.normalized).toBe('text_summarizer');
      expect(result.method).toBe('abstract_mapping');
    });

    it('should map ai_email to google_gmail', () => {
      const result = nodeTypeNormalizationService.normalizeNodeType('ai_email');
      expect(result.valid).toBe(true);
      expect(result.normalized).toBe('google_gmail');
      expect(result.method).toBe('abstract_mapping');
    });

    it('should map spreadsheet to google_sheets', () => {
      const result = nodeTypeNormalizationService.normalizeNodeType('spreadsheet');
      expect(result.valid).toBe(true);
      expect(result.normalized).toBe('google_sheets');
      expect(result.method).toBe('abstract_mapping');
    });

    it('should validate existing node types', () => {
      const result = nodeTypeNormalizationService.normalizeNodeType('text_summarizer');
      expect(result.valid).toBe(true);
      expect(result.normalized).toBe('text_summarizer');
    });

    it('should reject invalid node types', () => {
      const result = nodeTypeNormalizationService.normalizeNodeType('invalid_node_type_xyz');
      expect(result.valid).toBe(false);
    });

    it('should handle empty string', () => {
      const result = nodeTypeNormalizationService.normalizeNodeType('');
      expect(result.valid).toBe(false);
    });
  });

  describe('normalizeStructuredIntent', () => {
    it('should normalize abstract types in trigger', () => {
      const intent: StructuredIntent = {
        trigger: 'ai_summary',
        actions: [],
      };

      const result = nodeTypeNormalizationService.normalizeStructuredIntent(intent);
      
      expect(result.success).toBe(true);
      expect(result.normalizedIntent).toBeDefined();
      expect(result.normalizedIntent!.trigger).toBe('text_summarizer');
      expect(result.replacements.length).toBeGreaterThan(0);
      expect(result.replacements[0].original).toBe('ai_summary');
      expect(result.replacements[0].normalized).toBe('text_summarizer');
    });

    it('should normalize abstract types in actions', () => {
      const intent: StructuredIntent = {
        trigger: 'webhook',
        actions: [
          { type: 'ai_summarization', operation: 'summarize', description: 'Summarize text' },
          { type: 'spreadsheet', operation: 'read', description: 'Read spreadsheet' },
        ],
      };

      const result = nodeTypeNormalizationService.normalizeStructuredIntent(intent);
      
      expect(result.success).toBe(true);
      expect(result.normalizedIntent).toBeDefined();
      expect(result.normalizedIntent!.actions[0].type).toBe('text_summarizer');
      expect(result.normalizedIntent!.actions[1].type).toBe('google_sheets');
      expect(result.replacements.length).toBe(2);
    });

    it('should reject intent with invalid node types', () => {
      const intent: StructuredIntent = {
        trigger: 'webhook',
        actions: [
          { type: 'invalid_node_type_xyz', operation: 'read', description: 'Invalid node' },
        ],
      };

      const result = nodeTypeNormalizationService.normalizeStructuredIntent(intent);
      
      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.normalizedIntent).toBeUndefined();
    });

    it('should handle valid intent without changes', () => {
      const intent: StructuredIntent = {
        trigger: 'webhook',
        actions: [
          { type: 'text_summarizer', operation: 'summarize', description: 'Summarize text' },
          { type: 'google_sheets', operation: 'read', description: 'Read spreadsheet' },
        ],
      };

      const result = nodeTypeNormalizationService.normalizeStructuredIntent(intent);
      
      expect(result.success).toBe(true);
      expect(result.normalizedIntent).toBeDefined();
      expect(result.replacements.length).toBe(0);
    });
  });

  describe('normalizeWorkflowStructure', () => {
    it('should normalize abstract types in structure nodes', () => {
      const structure: WorkflowStructure = {
        trigger: 'webhook',
        nodes: [
          { id: 'node1', type: 'ai_summary' },
          { id: 'node2', type: 'spreadsheet' },
        ],
        connections: [],
      };

      const result = nodeTypeNormalizationService.normalizeWorkflowStructure(structure);
      
      expect(result.success).toBe(true);
      expect(result.normalizedStructure).toBeDefined();
      expect(result.normalizedStructure!.nodes[0].type).toBe('text_summarizer');
      expect(result.normalizedStructure!.nodes[1].type).toBe('google_sheets');
    });

    it('should reject structure with invalid node types', () => {
      const structure: WorkflowStructure = {
        trigger: 'webhook',
        nodes: [
          { id: 'node1', type: 'invalid_node_type_xyz' },
        ],
        connections: [],
      };

      const result = nodeTypeNormalizationService.normalizeWorkflowStructure(structure);
      
      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe('normalizeWorkflow', () => {
    it('should normalize abstract types in workflow nodes', () => {
      const workflow: Workflow = {
        nodes: [
          {
            id: 'node1',
            type: 'custom',
            position: { x: 0, y: 0 },
            data: { type: 'ai_email', label: 'Send Email' },
          },
          {
            id: 'node2',
            type: 'custom',
            position: { x: 0, y: 0 },
            data: { type: 'spreadsheet', label: 'Read Sheet' },
          },
        ],
        edges: [],
      };

      const result = nodeTypeNormalizationService.normalizeWorkflow(workflow);
      
      expect(result.success).toBe(true);
      expect(result.normalizedWorkflow).toBeDefined();
      expect(result.normalizedWorkflow!.nodes[0].data.type).toBe('google_gmail');
      expect(result.normalizedWorkflow!.nodes[1].data.type).toBe('google_sheets');
    });

    it('should reject workflow with invalid node types', () => {
      const workflow: Workflow = {
        nodes: [
          {
            id: 'node1',
            type: 'custom',
            position: { x: 0, y: 0 },
            data: { type: 'invalid_node_type_xyz', label: 'Invalid' },
          },
        ],
        edges: [],
      };

      const result = nodeTypeNormalizationService.normalizeWorkflow(workflow);
      
      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe('validateAndNormalizeIntent', () => {
    it('should throw error for invalid node types', () => {
      const intent: StructuredIntent = {
        trigger: 'webhook',
        actions: [
          { type: 'invalid_node_type_xyz', operation: 'read', description: 'Invalid' },
        ],
      };

      expect(() => {
        nodeTypeNormalizationService.validateAndNormalizeIntent(intent);
      }).toThrow();
    });

    it('should return normalized intent for valid types', () => {
      const intent: StructuredIntent = {
        trigger: 'webhook',
        actions: [
          { type: 'ai_summary', operation: 'summarize', description: 'Summarize' },
        ],
      };

      const normalized = nodeTypeNormalizationService.validateAndNormalizeIntent(intent);
      
      expect(normalized.trigger).toBe('webhook');
      expect(normalized.actions[0].type).toBe('text_summarizer');
    });
  });

  describe('validateAndNormalizeStructure', () => {
    it('should throw error for invalid node types', () => {
      const structure: WorkflowStructure = {
        trigger: 'webhook',
        nodes: [
          { id: 'node1', type: 'invalid_node_type_xyz' },
        ],
        connections: [],
      };

      expect(() => {
        nodeTypeNormalizationService.validateAndNormalizeStructure(structure);
      }).toThrow();
    });

    it('should return normalized structure for valid types', () => {
      const structure: WorkflowStructure = {
        trigger: 'webhook',
        nodes: [
          { id: 'node1', type: 'ai_summarization' },
        ],
        connections: [],
      };

      const normalized = nodeTypeNormalizationService.validateAndNormalizeStructure(structure);
      
      expect(normalized.nodes[0].type).toBe('text_summarizer');
    });
  });

  describe('validateAndNormalizeWorkflow', () => {
    it('should throw error for invalid node types', () => {
      const workflow: Workflow = {
        nodes: [
          {
            id: 'node1',
            type: 'custom',
            position: { x: 0, y: 0 },
            data: { type: 'invalid_node_type_xyz', label: 'Invalid' },
          },
        ],
        edges: [],
      };

      expect(() => {
        nodeTypeNormalizationService.validateAndNormalizeWorkflow(workflow);
      }).toThrow();
    });

    it('should return normalized workflow for valid types', () => {
      const workflow: Workflow = {
        nodes: [
          {
            id: 'node1',
            type: 'custom',
            position: { x: 0, y: 0 },
            data: { type: 'ai_email', label: 'Send Email' },
          },
        ],
        edges: [],
      };

      const normalized = nodeTypeNormalizationService.validateAndNormalizeWorkflow(workflow);
      
      expect(normalized.nodes[0].data.type).toBe('google_gmail');
    });
  });

  describe('integration with NodeLibrary', () => {
    it('should only return types that exist in NodeLibrary', () => {
      // Get all valid node types from NodeLibrary
      const allSchemas = nodeLibrary.getAllSchemas();
      const validTypes = allSchemas.map(s => s.type);
      
      // Test that normalized types are in the valid list
      const testCases = [
        'ai_summary',
        'ai_summarization',
        'ai_email',
        'spreadsheet',
        'text_summarizer',
        'google_gmail',
        'google_sheets',
      ];
      
      testCases.forEach(nodeType => {
        const result = nodeTypeNormalizationService.normalizeNodeType(nodeType);
        if (result.valid) {
          expect(validTypes).toContain(result.normalized);
        }
      });
    });
  });
});
