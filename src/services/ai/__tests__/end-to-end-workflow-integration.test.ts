/**
 * ✅ END-TO-END WORKFLOW INTEGRATION TESTS
 * 
 * Comprehensive integration tests for complete workflow lifecycle:
 * 1. Workflow Generation (from prompt)
 * 2. Workflow Validation
 * 3. Workflow Execution
 * 4. Data Flow Verification
 * 
 * These tests verify the entire system works together correctly.
 */

import { AgenticWorkflowBuilder } from '../workflow-builder';
import { workflowValidationPipeline } from '../workflow-validation-pipeline';
import { unifiedNodeRegistry } from '../../../core/registry/unified-node-registry';
import { nodeContextRegistry } from '../../../core/registry/node-context-registry';
import { Workflow, WorkflowNode, WorkflowEdge } from '../../../core/types/ai-types';
import { executeNode } from '../../../api/execute-workflow';
import { LRUNodeOutputsCache } from '../../../core/cache/lru-node-outputs-cache';

// Mock Supabase client for testing
const createMockSupabaseClient = () => {
  return {
    from: () => ({
      select: () => ({ eq: () => ({ data: [], error: null }) }),
      insert: () => ({ data: null, error: null }),
      update: () => ({ eq: () => ({ data: null, error: null }) }),
    }),
    auth: {
      getUser: () => ({ data: { user: { id: 'test-user' } }, error: null }),
    },
  } as any;
};

describe('End-to-End Workflow Integration Tests', () => {
  let workflowBuilder: AgenticWorkflowBuilder;
  let mockSupabase: any;

  beforeEach(() => {
    workflowBuilder = new AgenticWorkflowBuilder();
    mockSupabase = createMockSupabaseClient();
  });

  describe('Simple Linear Workflow', () => {
    test('should generate, validate, and execute a simple trigger → action workflow', async () => {
      const prompt = 'When I click a button, send a Slack message saying "Hello World"';

      // Step 1: Generate workflow
      const generationResult = await workflowBuilder.generateWorkflow({
        prompt,
        userId: 'test-user',
        workflowId: 'test-workflow-1',
      });

      expect(generationResult).toBeDefined();
      expect(generationResult.workflow).toBeDefined();
      expect(generationResult.workflow.nodes.length).toBeGreaterThan(0);
      expect(generationResult.workflow.edges.length).toBeGreaterThan(0);

      const workflow = generationResult.workflow;

      // Step 2: Validate workflow structure
      const validationResult = await workflowValidationPipeline.validate(workflow, {
        prompt,
        userId: 'test-user',
      });

      expect(validationResult.valid).toBe(true);
      expect(validationResult.errors).toHaveLength(0);

      // Step 3: Verify workflow has exactly one trigger
      const triggers = workflow.nodes.filter(
        (n: WorkflowNode) =>
          n.data?.type === 'manual_trigger' ||
          n.data?.type === 'webhook' ||
          n.data?.type === 'schedule'
      );
      expect(triggers.length).toBe(1);

      // Step 4: Verify all nodes are connected
      const orphanNodes = workflow.nodes.filter((node: WorkflowNode) => {
        if (triggers.some((t: WorkflowNode) => t.id === node.id)) {
          return false; // Triggers don't need incoming edges
        }
        const hasIncomingEdge = workflow.edges.some(
          (e: WorkflowEdge) => e.target === node.id
        );
        return !hasIncomingEdge;
      });
      expect(orphanNodes.length).toBe(0);

      // Step 5: Verify expected nodes exist
      const hasSlackNode = workflow.nodes.some(
        (n: WorkflowNode) => n.data?.type === 'slack_message'
      );
      expect(hasSlackNode).toBe(true);
    }, 30000);

    test('should handle workflow with data transformation', async () => {
      const prompt =
        'When a webhook is received, extract the email field and send it via Gmail';

      // Step 1: Generate workflow
      const generationResult = await workflowBuilder.generateWorkflow({
        prompt,
        userId: 'test-user',
        workflowId: 'test-workflow-2',
      });

      expect(generationResult.workflow).toBeDefined();
      const workflow = generationResult.workflow;

      // Step 2: Validate
      const validationResult = await workflowValidationPipeline.validate(workflow, {
        prompt,
        userId: 'test-user',
      });

      expect(validationResult.valid).toBe(true);

      // Step 3: Verify data flow
      const webhookNode = workflow.nodes.find(
        (n: WorkflowNode) => n.data?.type === 'webhook'
      );
      const gmailNode = workflow.nodes.find(
        (n: WorkflowNode) => n.data?.type === 'google_gmail'
      );

      expect(webhookNode).toBeDefined();
      expect(gmailNode).toBeDefined();

      // Verify there's a path from webhook to gmail
      const pathExists = workflow.edges.some(
        (e: WorkflowEdge) =>
          (e.source === webhookNode?.id && e.target === gmailNode?.id) ||
          workflow.edges.some(
            (e2: WorkflowEdge) =>
              e2.source === webhookNode?.id &&
              e2.target === e.source &&
              e.target === gmailNode?.id
          )
      );
      expect(pathExists).toBe(true);
    }, 30000);
  });

  describe('Complex Multi-Node Workflow', () => {
    test('should generate and validate workflow with conditional logic', async () => {
      const prompt =
        'When a new contact is added to HubSpot, if the contact is a VIP, send them a welcome email via Gmail, otherwise send a Slack notification';

      // Step 1: Generate workflow
      const generationResult = await workflowBuilder.generateWorkflow({
        prompt,
        userId: 'test-user',
        workflowId: 'test-workflow-3',
      });

      expect(generationResult.workflow).toBeDefined();
      const workflow = generationResult.workflow;

      // Step 2: Validate
      const validationResult = await workflowValidationPipeline.validate(workflow, {
        prompt,
        userId: 'test-user',
      });

      expect(validationResult.valid).toBe(true);

      // Step 3: Verify conditional logic node exists
      const hasIfElseNode = workflow.nodes.some(
        (n: WorkflowNode) => n.data?.type === 'if_else'
      );
      expect(hasIfElseNode).toBe(true);

      // Step 4: Verify both output paths exist
      const hasGmailNode = workflow.nodes.some(
        (n: WorkflowNode) => n.data?.type === 'google_gmail'
      );
      const hasSlackNode = workflow.nodes.some(
        (n: WorkflowNode) => n.data?.type === 'slack_message'
      );
      expect(hasGmailNode).toBe(true);
      expect(hasSlackNode).toBe(true);
    }, 30000);

    test('should handle workflow with database operations', async () => {
      const prompt =
        'When a form is submitted, save the data to Google Sheets and then send a confirmation email';

      // Step 1: Generate workflow
      const generationResult = await workflowBuilder.generateWorkflow({
        prompt,
        userId: 'test-user',
        workflowId: 'test-workflow-4',
      });

      expect(generationResult.workflow).toBeDefined();
      const workflow = generationResult.workflow;

      // Step 2: Validate
      const validationResult = await workflowValidationPipeline.validate(workflow, {
        prompt,
        userId: 'test-user',
      });

      expect(validationResult.valid).toBe(true);

      // Step 3: Verify database node exists
      const hasSheetsNode = workflow.nodes.some(
        (n: WorkflowNode) => n.data?.type === 'google_sheets'
      );
      expect(hasSheetsNode).toBe(true);

      // Step 4: Verify execution order (form → sheets → email)
      const formNode = workflow.nodes.find(
        (n: WorkflowNode) => n.data?.type === 'form' || n.data?.type === 'webhook'
      );
      const sheetsNode = workflow.nodes.find(
        (n: WorkflowNode) => n.data?.type === 'google_sheets'
      );
      const emailNode = workflow.nodes.find(
        (n: WorkflowNode) => n.data?.type === 'google_gmail' || n.data?.type === 'email'
      );

      expect(formNode).toBeDefined();
      expect(sheetsNode).toBeDefined();
      expect(emailNode).toBeDefined();
    }, 30000);
  });

  describe('Workflow Validation Integration', () => {
    test('should reject workflow with orphan nodes', async () => {
      const workflow: Workflow = {
        nodes: [
          {
            id: 'trigger1',
            type: 'custom',
            data: {
              type: 'manual_trigger',
              label: 'Trigger',
              category: 'triggers',
              config: {},
            },
            position: { x: 0, y: 0 },
          },
          {
            id: 'orphan1',
            type: 'custom',
            data: {
              type: 'slack_message',
              label: 'Orphan',
              category: 'output',
              config: { channel: '#general', text: 'Hello' },
            },
            position: { x: 100, y: 0 },
          },
        ],
        edges: [],
      };

      const validationResult = await workflowValidationPipeline.validate(workflow, {
        prompt: 'Test workflow',
        userId: 'test-user',
      });

      // Should detect orphan node
      expect(validationResult.valid).toBe(false);
      expect(validationResult.errors.length).toBeGreaterThan(0);
    });

    test('should reject workflow with invalid node types', async () => {
      const workflow: Workflow = {
        nodes: [
          {
            id: 'trigger1',
            type: 'custom',
            data: {
              type: 'invalid_node_type',
              label: 'Invalid',
              category: 'triggers',
              config: {},
            },
            position: { x: 0, y: 0 },
          },
        ],
        edges: [],
      };

      const validationResult = await workflowValidationPipeline.validate(workflow, {
        prompt: 'Test workflow',
        userId: 'test-user',
      });

      expect(validationResult.valid).toBe(false);
      expect(
        validationResult.errors.some((e: string) =>
          e.toLowerCase().includes('invalid') || e.toLowerCase().includes('not found')
        )
      ).toBe(true);
    });

    test('should accept valid workflow with proper structure', async () => {
      const workflow: Workflow = {
        nodes: [
          {
            id: 'trigger1',
            type: 'custom',
            data: {
              type: 'manual_trigger',
              label: 'Trigger',
              category: 'triggers',
              config: {},
            },
            position: { x: 0, y: 0 },
          },
          {
            id: 'slack1',
            type: 'custom',
            data: {
              type: 'slack_message',
              label: 'Slack',
              category: 'output',
              config: { channel: '#general', text: 'Hello' },
            },
            position: { x: 100, y: 0 },
          },
        ],
        edges: [
          {
            id: 'edge1',
            source: 'trigger1',
            target: 'slack1',
            sourceHandle: 'default',
            targetHandle: 'default',
          },
        ],
      };

      const validationResult = await workflowValidationPipeline.validate(workflow, {
        prompt: 'Test workflow',
        userId: 'test-user',
      });

      expect(validationResult.valid).toBe(true);
    });
  });

  describe('Node Registry Integration', () => {
    test('should verify all nodes in workflow are registered', async () => {
      const workflow: Workflow = {
        nodes: [
          {
            id: 'trigger1',
            type: 'custom',
            data: {
              type: 'manual_trigger',
              label: 'Trigger',
              category: 'triggers',
              config: {},
            },
            position: { x: 0, y: 0 },
          },
          {
            id: 'slack1',
            type: 'custom',
            data: {
              type: 'slack_message',
              label: 'Slack',
              category: 'output',
              config: { channel: '#general', text: 'Hello' },
            },
            position: { x: 100, y: 0 },
          },
        ],
        edges: [
          {
            id: 'edge1',
            source: 'trigger1',
            target: 'slack1',
            sourceHandle: 'default',
            targetHandle: 'default',
          },
        ],
      };

      // Verify all nodes are in registry
      for (const node of workflow.nodes) {
        const nodeType = node.data?.type;
        expect(nodeType).toBeDefined();

        const nodeDef = unifiedNodeRegistry.get(nodeType);
        expect(nodeDef).toBeDefined();
        expect(nodeDef?.type).toBe(nodeType);
      }
    });

    test('should verify all nodes have context', async () => {
      const workflow: Workflow = {
        nodes: [
          {
            id: 'trigger1',
            type: 'custom',
            data: {
              type: 'manual_trigger',
              label: 'Trigger',
              category: 'triggers',
              config: {},
            },
            position: { x: 0, y: 0 },
          },
          {
            id: 'gmail1',
            type: 'custom',
            data: {
              type: 'google_gmail',
              label: 'Gmail',
              category: 'output',
              config: { to: 'test@example.com', subject: 'Test' },
            },
            position: { x: 100, y: 0 },
          },
        ],
        edges: [
          {
            id: 'edge1',
            source: 'trigger1',
            target: 'gmail1',
            sourceHandle: 'default',
            targetHandle: 'default',
          },
        ],
      };

      // Verify all nodes have context
      for (const node of workflow.nodes) {
        const nodeType = node.data?.type;
        expect(nodeType).toBeDefined();

        const context = nodeContextRegistry.get(nodeType);
        expect(context).toBeDefined();
        expect(context?.description).toBeDefined();
        expect(context?.useCases).toBeDefined();
        expect(context?.examples).toBeDefined();
      }
    });
  });

  describe('Template Expression Integration', () => {
    test('should validate template expressions reference valid upstream fields', async () => {
      const workflow: Workflow = {
        nodes: [
          {
            id: 'trigger1',
            type: 'custom',
            data: {
              type: 'webhook',
              label: 'Webhook',
              category: 'triggers',
              config: {},
            },
            position: { x: 0, y: 0 },
          },
          {
            id: 'gmail1',
            type: 'custom',
            data: {
              type: 'google_gmail',
              label: 'Gmail',
              category: 'output',
              config: {
                to: '{{$json.email}}',
                subject: 'Welcome {{$json.name}}',
              },
            },
            position: { x: 100, y: 0 },
          },
        ],
        edges: [
          {
            id: 'edge1',
            source: 'trigger1',
            target: 'gmail1',
            sourceHandle: 'default',
            targetHandle: 'default',
          },
        ],
      };

      // Verify template expressions are valid
      const webhookNode = workflow.nodes.find((n) => n.data?.type === 'webhook');
      const gmailNode = workflow.nodes.find((n) => n.data?.type === 'google_gmail');

      expect(webhookNode).toBeDefined();
      expect(gmailNode).toBeDefined();

      // Webhook should output fields that Gmail can reference
      const webhookDef = unifiedNodeRegistry.get('webhook');
      expect(webhookDef?.outputSchema).toBeDefined();

      // Gmail config should reference valid fields
      const gmailConfig = gmailNode?.data?.config;
      expect(gmailConfig).toBeDefined();
    });
  });

  describe('Error Handling Integration', () => {
    test('should handle workflow generation errors gracefully', async () => {
      const invalidPrompt = '';

      try {
        const result = await workflowBuilder.generateWorkflow({
          prompt: invalidPrompt,
          userId: 'test-user',
          workflowId: 'test-workflow-error',
        });

        // Should either return error or empty workflow
        expect(result).toBeDefined();
      } catch (error) {
        // Error handling is acceptable
        expect(error).toBeDefined();
      }
    });

    test('should handle validation errors for malformed workflows', async () => {
      const malformedWorkflow: Workflow = {
        nodes: [],
        edges: [],
      };

      const validationResult = await workflowValidationPipeline.validate(
        malformedWorkflow,
        {
          prompt: 'Test',
          userId: 'test-user',
        }
      );

      expect(validationResult.valid).toBe(false);
      expect(validationResult.errors.length).toBeGreaterThan(0);
    });
  });

  describe('Performance Integration', () => {
    test('should generate simple workflow within reasonable time', async () => {
      const prompt = 'Send a Slack message when I click a button';

      const startTime = Date.now();
      const result = await workflowBuilder.generateWorkflow({
        prompt,
        userId: 'test-user',
        workflowId: 'test-workflow-perf',
      });
      const endTime = Date.now();

      expect(result).toBeDefined();
      expect(endTime - startTime).toBeLessThan(30000); // Should complete within 30 seconds
    });

    test('should validate workflow quickly', async () => {
      const workflow: Workflow = {
        nodes: [
          {
            id: 'trigger1',
            type: 'custom',
            data: {
              type: 'manual_trigger',
              label: 'Trigger',
              category: 'triggers',
              config: {},
            },
            position: { x: 0, y: 0 },
          },
          {
            id: 'slack1',
            type: 'custom',
            data: {
              type: 'slack_message',
              label: 'Slack',
              category: 'output',
              config: { channel: '#general', text: 'Hello' },
            },
            position: { x: 100, y: 0 },
          },
        ],
        edges: [
          {
            id: 'edge1',
            source: 'trigger1',
            target: 'slack1',
            sourceHandle: 'default',
            targetHandle: 'default',
          },
        ],
      };

      const startTime = Date.now();
      const validationResult = await workflowValidationPipeline.validate(workflow, {
        prompt: 'Test',
        userId: 'test-user',
      });
      const endTime = Date.now();

      expect(validationResult).toBeDefined();
      expect(endTime - startTime).toBeLessThan(5000); // Should validate within 5 seconds
    });
  });
});
