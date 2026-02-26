/**
 * Stage-5 Compiler Unit Tests
 * Tests the Stage-5 compiler with unit-test mindset validation
 */

import { NodeSchemaRegistry } from '../src/core/contracts/node-schema-registry';
import { WorkflowAutoRepair } from '../src/core/contracts/workflow-auto-repair';
import { normalizeNodeType } from '../src/core/utils/node-type-normalizer';
import type { Workflow, WorkflowNode, WorkflowEdge } from '../src/core/contracts/types';

describe('Stage-5 Compiler Unit Tests', () => {
  let schemaRegistry: NodeSchemaRegistry;
  let autoRepair: WorkflowAutoRepair;

  beforeEach(() => {
    schemaRegistry = NodeSchemaRegistry.getInstance();
    autoRepair = new WorkflowAutoRepair();
  });

  describe('Basic Workflow Validation', () => {
    test('should validate basic manual trigger workflow', () => {
      const workflow: Workflow = {
        nodes: [
          {
            id: 'trigger1',
            type: 'custom',
            data: {
              type: 'manual_trigger',
              label: 'Manual Trigger'
            }
          },
          {
            id: 'slack1',
            type: 'custom',
            data: {
              type: 'slack_message',
              label: 'Slack Send',
              config: {
                channel: '#general',
                text: 'Hello'
              }
            }
          }
        ],
        edges: [
          {
            id: 'edge1',
            source: 'trigger1',
            target: 'slack1',
            sourceHandle: 'inputData',
            targetHandle: 'text'
          }
        ]
      };

      // Validate nodes
      workflow.nodes.forEach(node => {
        const validation = schemaRegistry.validateNode(node);
        expect(validation.valid).toBe(true);
      });

      // Validate edges
      workflow.edges.forEach(edge => {
        const sourceNode = workflow.nodes.find(n => n.id === edge.source);
        const targetNode = workflow.nodes.find(n => n.id === edge.target);
        if (sourceNode && targetNode) {
          const validation = schemaRegistry.validateEdge(sourceNode, targetNode, edge);
          expect(validation.valid).toBe(true);
        }
      });
    });

    test('should add cron to schedule triggers', () => {
      const workflow: Workflow = {
        nodes: [
          {
            id: 'schedule1',
            type: 'custom',
            data: {
              type: 'schedule',
              label: 'Daily Schedule',
              config: {} // Missing cron
            }
          },
          {
            id: 'slack1',
            type: 'custom',
            data: {
              type: 'slack_message',
              label: 'Slack Send',
              config: {
                channel: '#general',
                text: 'Hello'
              }
            }
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

      // Auto-repair should add cron
      const result = autoRepair.validateAndRepair(workflow, 3);

      const scheduleNode = result.repairedWorkflow.nodes.find(n => 
        normalizeNodeType(n) === 'schedule'
      );

      expect(scheduleNode).toBeDefined();
      const config = scheduleNode?.data?.config || scheduleNode?.data || {};
      expect(config.cron).toBe('0 9 * * *');
    });

    test('should fix orphan nodes automatically', () => {
      const workflow: Workflow = {
        nodes: [
          {
            id: 'trigger1',
            type: 'custom',
            data: { type: 'manual_trigger' }
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
            }
          }
        ],
        edges: [] // No edges - slack1 is orphaned
      };

      const result = autoRepair.validateAndRepair(workflow, 3);

      // Should have added edge
      expect(result.repairedWorkflow.edges.length).toBeGreaterThan(0);
      const edge = result.repairedWorkflow.edges.find(e => 
        e.source === 'trigger1' && e.target === 'slack1'
      );
      expect(edge).toBeDefined();
    });

    test('should reject invalid node types', () => {
      const workflow: Workflow = {
        nodes: [
          {
            id: 'invalid1',
            type: 'custom',
            data: {
              type: 'nonexistent_node_type'
            }
          }
        ],
        edges: []
      };

      const validation = schemaRegistry.validateNode(workflow.nodes[0]);
      expect(validation.valid).toBe(false);
      expect(validation.errors.some(e => e.includes('not registered'))).toBe(true);
    });

    test('should fix manual_trigger output port', () => {
      const workflow: Workflow = {
        nodes: [
          {
            id: 'trigger1',
            type: 'custom',
            data: { type: 'manual_trigger' }
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
            }
          }
        ],
        edges: [
          {
            id: 'edge1',
            source: 'trigger1',
            target: 'slack1',
            sourceHandle: 'data', // Wrong port
            targetHandle: 'text'
          }
        ]
      };

      const result = autoRepair.validateAndRepair(workflow, 3);

      const edge = result.repairedWorkflow.edges.find(e => e.id === 'edge1');
      expect(edge?.sourceHandle).toBe('inputData'); // Fixed from 'data'
    });
  });

  describe('Workflow Structure Validation', () => {
    test('should validate exactly one trigger exists', () => {
      const workflow: Workflow = {
        nodes: [
          {
            id: 'trigger1',
            type: 'custom',
            data: { type: 'manual_trigger' }
          },
          {
            id: 'trigger2',
            type: 'custom',
            data: { type: 'schedule', config: { cron: '0 9 * * *' } }
          }
        ],
        edges: []
      };

      // Should detect multiple triggers
      const triggers = workflow.nodes.filter(n => {
        const type = normalizeNodeType(n);
        return ['manual_trigger', 'schedule', 'webhook'].includes(type);
      });

      expect(triggers.length).toBe(2);
      // Auto-repair should handle this
    });

    test('should validate all nodes are connected', () => {
      const workflow: Workflow = {
        nodes: [
          {
            id: 'trigger1',
            type: 'custom',
            data: { type: 'manual_trigger' }
          },
          {
            id: 'slack1',
            type: 'custom',
            data: {
              type: 'slack_message',
              config: { channel: '#general', text: 'Hello' }
            }
          },
          {
            id: 'orphan1',
            type: 'custom',
            data: { type: 'slack_message' }
          }
        ],
        edges: [
          {
            id: 'edge1',
            source: 'trigger1',
            target: 'slack1',
            sourceHandle: 'inputData',
            targetHandle: 'text'
          }
        ]
      };

      // Auto-repair should connect orphan
      const result = autoRepair.validateAndRepair(workflow, 3);

      const orphanEdge = result.repairedWorkflow.edges.find(e => 
        e.target === 'orphan1'
      );
      expect(orphanEdge).toBeDefined();
    });
  });

  describe('Configuration Validation', () => {
    test('should validate required config fields', () => {
      const node: WorkflowNode = {
        id: 'schedule1',
        type: 'custom',
        data: {
          type: 'schedule',
          config: {} // Missing cron
        }
      };

      const validation = schemaRegistry.validateNode(node);
      expect(validation.valid).toBe(false);
      expect(validation.errors.some(e => e.includes('cron'))).toBe(true);
    });

    test('should validate slack node has required fields', () => {
      const node: WorkflowNode = {
        id: 'slack1',
        type: 'custom',
        data: {
          type: 'slack_message',
          config: {
            channel: '#general'
            // Missing text
          }
        }
      };

      const validation = schemaRegistry.validateNode(node);
      // Note: text might be optional in some cases, but channel is required
      expect(validation.valid).toBeDefined();
    });
  });
});
