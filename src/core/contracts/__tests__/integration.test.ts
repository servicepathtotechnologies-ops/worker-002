/**
 * Integration Tests for Node Schema Registry and Auto-Repair
 * Tests the full workflow from validation to repair
 */

import { NodeSchemaRegistry } from '../node-schema-registry';
import { WorkflowAutoRepair } from '../workflow-auto-repair';
import { normalizeNodeType } from '../../utils/node-type-normalizer';
import { Workflow, WorkflowNode, WorkflowEdge } from '../../types/ai-types';

describe('Integration Tests', () => {
  let registry: NodeSchemaRegistry;
  let autoRepair: WorkflowAutoRepair;

  beforeEach(() => {
    registry = NodeSchemaRegistry.getInstance();
    autoRepair = new WorkflowAutoRepair();
  });

  describe('Full Workflow: Validation + Auto-Repair', () => {
    test('should validate and repair workflow with schedule node missing cron', () => {
      const workflow: Workflow = {
        nodes: [
          {
            id: 'schedule1',
            type: 'custom',
            data: {
              type: 'schedule',
              config: {} // Missing cron
            },
            position: { x: 0, y: 0 }
          },
          {
            id: 'slack1',
            type: 'custom',
            data: {
              type: 'slack_message',
              config: {
                channel: '#general',
                text: 'Hello'
              }
            },
            position: { x: 100, y: 0 }
          }
        ],
        edges: [
          {
            id: 'edge1',
            source: 'schedule1',
            target: 'slack1',
            sourceHandle: 'output',
            targetHandle: 'text'
          }
        ]
      };

      // Step 1: Validate (should fail)
      const scheduleNode = workflow.nodes.find(n => n.id === 'schedule1');
      const validation = registry.validateNode(scheduleNode!);
      expect(validation.valid).toBe(false);

      // Step 2: Auto-repair
      const repairResult = autoRepair.validateAndRepair(workflow, 3);

      // Step 3: Re-validate (should pass)
      const repairedScheduleNode = repairResult.repairedWorkflow.nodes.find(n => n.id === 'schedule1');
      const revalidation = registry.validateNode(repairedScheduleNode!);
      expect(revalidation.valid).toBe(true);

      // Verify cron was added
      const config = repairedScheduleNode?.data?.config || repairedScheduleNode?.data || {};
      expect(config.cron).toBe('0 9 * * *');
    });

    test('should validate and repair workflow with incorrect port names', () => {
      const workflow: Workflow = {
        nodes: [
          {
            id: 'trigger1',
            type: 'custom',
            data: { type: 'manual_trigger' },
            position: { x: 0, y: 0 }
          },
          {
            id: 'slack1',
            type: 'custom',
            data: {
              type: 'slack_message',
              config: {
                channel: '#general',
                text: 'Hello'
              }
            },
            position: { x: 100, y: 0 }
          }
        ],
        edges: [
          {
            id: 'edge1',
            source: 'trigger1',
            target: 'slack1',
            sourceHandle: 'data', // Wrong port
            targetHandle: 'input' // Wrong port
          }
        ]
      };

      // Step 1: Validate edge (should fail)
      const sourceNode = workflow.nodes.find(n => n.id === 'trigger1');
      const targetNode = workflow.nodes.find(n => n.id === 'slack1');
      const edge = workflow.edges[0];
      const edgeValidation = registry.validateEdge(sourceNode!, targetNode!, edge);
      expect(edgeValidation.valid).toBe(false);

      // Step 2: Auto-repair
      const repairResult = autoRepair.validateAndRepair(workflow, 3);

      // Step 3: Re-validate edge (should pass)
      const repairedEdge = repairResult.repairedWorkflow.edges.find(e => e.id === 'edge1');
      const revalidation = registry.validateEdge(sourceNode!, targetNode!, repairedEdge!);
      expect(revalidation.valid).toBe(true);

      // Verify ports were fixed
      expect(repairedEdge?.sourceHandle).toBe('inputData');
      expect(repairedEdge?.targetHandle).toBe('text');
    });

    test('should handle complete workflow with multiple issues', () => {
      const workflow: Workflow = {
        nodes: [
          {
            id: 'schedule1',
            type: 'custom',
            data: {
              type: 'schedule',
              config: {} // Missing cron
            },
            position: { x: 0, y: 0 }
          },
          {
            id: 'slack1',
            type: 'custom',
            data: {
              type: 'slack_message',
              config: {
                channel: '#general'
                // Missing text
              }
            },
            position: { x: 100, y: 0 }
          },
          {
            id: 'orphan1',
            type: 'custom',
            data: { type: 'slack_message' },
            position: { x: 200, y: 0 }
          }
        ],
        edges: [
          {
            id: 'edge1',
            source: 'schedule1',
            target: 'slack1',
            sourceHandle: 'output',
            targetHandle: 'text'
          }
          // orphan1 has no connections
        ]
      };

      // Run full validation and repair
      const result = autoRepair.validateAndRepair(workflow, 3);

      // Should have applied fixes
      expect(result.fixes.length).toBeGreaterThan(0);

      // Schedule should have cron
      const scheduleNode = result.repairedWorkflow.nodes.find(n => n.id === 'schedule1');
      const scheduleConfig = scheduleNode?.data?.config || scheduleNode?.data || {};
      expect(scheduleConfig.cron).toBeDefined();

      // Orphan should be connected
      const orphanEdge = result.repairedWorkflow.edges.find(e => 
        e.target === 'orphan1'
      );
      expect(orphanEdge).toBeDefined();
    });
  });

  describe('Node Type Normalization Integration', () => {
    test('should normalize nodes correctly throughout validation', () => {
      const nodes: WorkflowNode[] = [
        {
          id: 'node1',
          type: 'custom',
          data: { type: 'schedule' },
          position: { x: 0, y: 0 }
        },
        {
          id: 'node2',
          type: 'manual_trigger',
          data: { type: 'manual_trigger' },
          position: { x: 100, y: 0 }
        }
      ];

      nodes.forEach(node => {
        const normalized = normalizeNodeType(node);
        expect(normalized).not.toBe('custom');
        expect(normalized).not.toBe('');

        const schema = registry.get(normalized);
        expect(schema).toBeDefined();
      });
    });
  });
});
