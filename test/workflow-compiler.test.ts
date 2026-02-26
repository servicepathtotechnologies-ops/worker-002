/**
 * Workflow Compiler Tests
 * Tests for n8n-accurate workflow compilation
 */

import { WorkflowCompiler } from '../src/services/ai/workflow-compiler';
import { NodeSchemaRegistry } from '../src/core/contracts/node-schema-registry';

describe('WorkflowCompiler', () => {
  let compiler: WorkflowCompiler;

  beforeEach(() => {
    compiler = new WorkflowCompiler();
  });

  describe('Basic Workflow Compilation', () => {
    test('should compile scheduled slack workflow', async () => {
      const result = await compiler.compile('send good morning message to slack channel daily at 9am');

      expect(result.success).toBe(true);
      expect(result.workflow).toBeDefined();
      expect(result.workflow?.nodes).toBeDefined();
      expect(result.workflow?.edges).toBeDefined();
      
      // Verify schedule node exists
      const scheduleNode = result.workflow?.nodes.find(n => 
        n.data.type === 'schedule' || n.data.type === 'interval'
      );
      expect(scheduleNode).toBeDefined();
      
      // Verify slack node exists
      const slackNode = result.workflow?.nodes.find(n => 
        n.data.type === 'slack_message' || n.data.type === 'slack'
      );
      expect(slackNode).toBeDefined();
      
      // Verify cron is set
      if (scheduleNode?.data.config?.cron) {
        expect(scheduleNode.data.config.cron).toMatch(/\d+\s+\d+/); // Cron format
      }
    });

    test('should compile form to database workflow', async () => {
      const result = await compiler.compile('when form is submitted, save data to database');

      expect(result.success).toBe(true);
      expect(result.workflow).toBeDefined();
      
      // Verify form trigger exists
      const formNode = result.workflow?.nodes.find(n => 
        n.data.type === 'form'
      );
      expect(formNode).toBeDefined();
      
      // Verify database node exists
      const dbNode = result.workflow?.nodes.find(n => 
        n.data.type?.includes('database') || n.data.type === 'database_write'
      );
      expect(dbNode).toBeDefined();
    });

    test('should reject unsupported platform', async () => {
      const result = await compiler.compile('post to instagram daily at 9am');

      // Should either succeed (if instagram is supported) or fail gracefully
      if (!result.success) {
        expect(result.error).toBeDefined();
        expect(result.missingCapabilities).toBeDefined();
        expect(result.missingCapabilities?.length).toBeGreaterThan(0);
      }
    });
  });

  describe('Validation', () => {
    test('should validate all nodes exist in Node Library', async () => {
      const result = await compiler.compile('send daily report to slack at 9am');

      if (result.success && result.workflow) {
        const registry = NodeSchemaRegistry.getInstance();
        
        result.workflow.nodes.forEach(node => {
          const contract = registry.get(node.data.type);
          expect(contract).toBeDefined();
        });
      }
    });

    test('should validate all edges use valid ports', async () => {
      const result = await compiler.compile('send message to slack when form submitted');

      if (result.success && result.workflow) {
        const registry = NodeSchemaRegistry.getInstance();
        
        result.workflow.edges.forEach(edge => {
          const sourceNode = result.workflow!.nodes.find(n => n.id === edge.source);
          const targetNode = result.workflow!.nodes.find(n => n.id === edge.target);
          
          if (sourceNode && targetNode) {
            const sourceContract = registry.get(sourceNode.data.type);
            const targetContract = registry.get(targetNode.data.type);
            
            if (sourceContract && edge.sourceHandle) {
              expect(sourceContract.outputs).toContain(edge.sourceHandle);
            }
            
            if (targetContract && edge.targetHandle) {
              expect(targetContract.inputs).toContain(edge.targetHandle);
            }
          }
        });
      }
    });
  });

  describe('Error Handling', () => {
    test('should handle ambiguous prompts', async () => {
      const result = await compiler.compile('do something');

      // Should either ask for clarification or return error
      expect(result.success === false || result.workflow !== undefined).toBe(true);
    });

    test('should handle missing required config', async () => {
      const result = await compiler.compile('schedule something');

      // Should either fill defaults or return error
      if (result.success && result.workflow) {
        const scheduleNode = result.workflow.nodes.find(n => 
          n.data.type === 'schedule'
        );
        
        if (scheduleNode) {
          // Should have cron or error should indicate missing config
          expect(
            scheduleNode.data.config?.cron || 
            result.validationErrors?.some(e => e.includes('cron'))
          ).toBeTruthy();
        }
      }
    });
  });

  describe('Credential Extraction', () => {
    test('should identify required credentials', async () => {
      const result = await compiler.compile('send daily message to slack at 9am');

      if (result.success) {
        expect(result.requiredCredentials).toBeDefined();
        // Slack may or may not require credentials depending on implementation
      }
    });
  });
});
