/**
 * Unit Tests for Workflow Auto-Repair
 */

import { WorkflowAutoRepair } from '../workflow-auto-repair';
import { Workflow, WorkflowNode, WorkflowEdge } from '../../types/ai-types';

describe('WorkflowAutoRepair', () => {
  let autoRepair: WorkflowAutoRepair;

  beforeEach(() => {
    autoRepair = new WorkflowAutoRepair();
  });

  describe('Schedule Node Cron Fix', () => {
    test('should add cron to schedule node without cron', () => {
      const workflow: Workflow = {
        nodes: [
          {
            id: 'schedule1',
            type: 'custom',
            data: {
              type: 'schedule',
              config: {}
            },
            position: { x: 0, y: 0 }
          }
        ],
        edges: []
      };

      const result = autoRepair.repair(workflow);
      
      expect(result.fixes.length).toBeGreaterThan(0);
      expect(result.fixes.some(f => f.includes('cron'))).toBe(true);
      
      const scheduleNode = result.repairedWorkflow.nodes.find(n => n.id === 'schedule1');
      expect(scheduleNode).toBeDefined();
      const config = scheduleNode?.data?.config || scheduleNode?.data || {};
      expect(config.cron).toBe('0 9 * * *');
    });

    test('should not modify schedule node with existing cron', () => {
      const workflow: Workflow = {
        nodes: [
          {
            id: 'schedule1',
            type: 'custom',
            data: {
              type: 'schedule',
              config: {
                cron: '0 12 * * *'
              }
            },
            position: { x: 0, y: 0 }
          }
        ],
        edges: []
      };

      const result = autoRepair.repair(workflow);
      
      const scheduleNode = result.repairedWorkflow.nodes.find(n => n.id === 'schedule1');
      const config = scheduleNode?.data?.config || scheduleNode?.data || {};
      expect(config.cron).toBe('0 12 * * *'); // Should preserve existing cron
    });
  });

  describe('Orphan Node Fix', () => {
    test('should connect orphan node to trigger', () => {
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
            data: { type: 'slack_message' },
            position: { x: 100, y: 0 }
          }
        ],
        edges: [] // No edges - slack1 is orphaned
      };

      const result = autoRepair.repair(workflow);
      
      expect(result.fixes.some(f => f.includes('orphan'))).toBe(true);
      expect(result.repairedWorkflow.edges.length).toBeGreaterThan(0);
      
      const edge = result.repairedWorkflow.edges.find(e => 
        e.source === 'trigger1' && e.target === 'slack1'
      );
      expect(edge).toBeDefined();
    });

    test('should not connect trigger nodes', () => {
      const workflow: Workflow = {
        nodes: [
          {
            id: 'trigger1',
            type: 'custom',
            data: { type: 'manual_trigger' },
            position: { x: 0, y: 0 }
          },
          {
            id: 'trigger2',
            type: 'custom',
            data: { type: 'schedule' },
            position: { x: 100, y: 0 }
          }
        ],
        edges: []
      };

      const result = autoRepair.repair(workflow);
      
      // Should not create edge between triggers
      const triggerEdge = result.repairedWorkflow.edges.find(e =>
        (e.source === 'trigger1' && e.target === 'trigger2') ||
        (e.source === 'trigger2' && e.target === 'trigger1')
      );
      expect(triggerEdge).toBeUndefined();
    });
  });

  describe('Edge Port Fix', () => {
    test('should fix manual_trigger output port', () => {
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
            data: { type: 'slack_message' },
            position: { x: 100, y: 0 }
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

      const result = autoRepair.repair(workflow);
      
      expect(result.fixes.some(f => f.includes('inputData'))).toBe(true);
      
      const edge = result.repairedWorkflow.edges.find(e => e.id === 'edge1');
      expect(edge?.sourceHandle).toBe('inputData');
    });

    test('should fix slack input port', () => {
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
            data: { type: 'slack_message' },
            position: { x: 100, y: 0 }
          }
        ],
        edges: [
          {
            id: 'edge1',
            source: 'trigger1',
            target: 'slack1',
            sourceHandle: 'inputData',
            targetHandle: 'input' // Wrong port
          }
        ]
      };

      const result = autoRepair.repair(workflow);
      
      expect(result.fixes.some(f => f.includes('text'))).toBe(true);
      
      const edge = result.repairedWorkflow.edges.find(e => e.id === 'edge1');
      expect(edge?.targetHandle).toBe('text');
    });
  });

  describe('Validate and Repair', () => {
    test('should validate and repair workflow with multiple issues', () => {
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
            data: { type: 'slack_message' },
            position: { x: 100, y: 0 }
          }
        ],
        edges: [] // Missing edges
      };

      const result = autoRepair.validateAndRepair(workflow, 3);
      
      expect(result.fixes.length).toBeGreaterThan(0);
      expect(result.repairedWorkflow.nodes.length).toBe(2);
      expect(result.repairedWorkflow.edges.length).toBeGreaterThan(0);
    });

    test('should stop after max attempts', () => {
      const workflow: Workflow = {
        nodes: [
          {
            id: 'invalid1',
            type: 'custom',
            data: { type: 'nonexistent_type' },
            position: { x: 0, y: 0 }
          }
        ],
        edges: []
      };

      const result = autoRepair.validateAndRepair(workflow, 2);
      
      // Should stop after max attempts even if not fully valid
      expect(result.repairedWorkflow).toBeDefined();
    });
  });
});
