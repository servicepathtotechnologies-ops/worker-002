/**
 * E2E Test: Attach-Inputs Preserves AI-Built Values
 * 
 * Task 10.1: Write E2E test for attach-inputs preserves AI-built values
 * 
 * This test validates the complete workflow generation and attach-inputs pipeline:
 * 1. Generate workflow with AI-built values (fields with `_fillMode: 'buildtime_ai_once'`)
 * 2. Call attach-inputs endpoint with empty/default values for those AI-built fields
 * 3. Verify that the original AI-built values are preserved (not overwritten by empty values)
 * 4. Verify that `_fillMode` metadata remains `buildtime_ai_once`
 * 
 * **Validates: Requirements 3.1, 3.2, 3.6**
 * 
 * Requirement 3.1: When the Attach_Inputs_Endpoint receives a request with empty or default 
 * values for a field marked `buildtime_ai_once`, the system shall preserve the existing AI-built value
 * 
 * Requirement 3.2: When an AI-built array field contains N items and the incoming request contains 
 * fewer than N items, the system shall preserve the existing AI-built array
 * 
 * Requirement 3.6: The system shall apply the merge guard rules from `attach-inputs-merge-guard.ts` 
 * to prevent accidental overwrites of AI-built values
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import type { Request, Response } from 'express';
import { getDbClient } from '../src/core/database/supabase-compat';
import { unifiedNodeRegistry } from '../src/core/registry/unified-node-registry';
import { geminiOrchestrator } from '../src/services/ai/gemini-orchestrator';

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('../src/core/database/supabase-compat');
jest.mock('../src/core/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));
jest.mock('../src/services/ai/gemini-orchestrator', () => ({
  geminiOrchestrator: {
    processRequest: jest.fn(),
  },
}));
jest.mock('../src/services/ai/credential-discovery-phase', () => ({
  runCredentialDiscoveryPhase: jest.fn(() => Promise.resolve({
    ok: true,
    workflow: { nodes: [], edges: [] },
    requiredCredentials: [],
  })),
}));

// ─── Test Fixtures ────────────────────────────────────────────────────────────

/**
 * Create a minimal workflow with AI-built values for testing.
 * This simulates a workflow that has been generated with AI-populated fields.
 */
function createWorkflowWithAIBuiltValues(workflowId: string) {
  return {
    id: workflowId,
    name: 'Test Workflow with AI-Built Values',
    status: 'active',
    phase: 'configuring_inputs',
    user_id: 'test-user-id',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    nodes: [
      {
        id: 'trigger_1',
        type: 'manual_trigger',
        data: {
          type: 'manual_trigger',
          label: 'Manual Trigger',
          category: 'triggers',
          config: {},
        },
        position: { x: 100, y: 100 },
      },
      {
        id: 'slack_1',
        type: 'slack_message',
        data: {
          type: 'slack_message',
          label: 'Send Slack Message',
          category: 'communication',
          config: {
            // AI-built values with _fillMode metadata
            text: 'Hello team! This is an AI-generated message.',
            channel: '#general',
            _fillMode: {
              text: 'buildtime_ai_once',
              channel: 'buildtime_ai_once',
            },
          },
        },
        position: { x: 300, y: 100 },
      },
      {
        id: 'gmail_1',
        type: 'google_gmail',
        data: {
          type: 'google_gmail',
          label: 'Send Email',
          category: 'communication',
          config: {
            // AI-built values with _fillMode metadata
            operation: 'send',
            subject: 'Project Update',
            body: 'This is an AI-generated email body with project updates.',
            to: ['team@example.com'],
            _fillMode: {
              subject: 'buildtime_ai_once',
              body: 'buildtime_ai_once',
              to: 'buildtime_ai_once',
            },
          },
        },
        position: { x: 500, y: 100 },
      },
    ],
    edges: [
      {
        id: 'e1',
        source: 'trigger_1',
        target: 'slack_1',
        type: 'main',
      },
      {
        id: 'e2',
        source: 'slack_1',
        target: 'gmail_1',
        type: 'main',
      },
    ],
    metadata: {
      originalUserPrompt: 'Send a slack message and then send an email',
      buildManifest: {
        version: 1,
        timestamp: new Date().toISOString(),
        integrityHash: 'test-hash',
      },
    },
  };
}

/**
 * Create a workflow with AI-built array field for testing array preservation.
 */
function createWorkflowWithAIBuiltArray(workflowId: string) {
  return {
    id: workflowId,
    name: 'Test Workflow with AI-Built Array',
    status: 'active',
    phase: 'configuring_inputs',
    user_id: 'test-user-id',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    nodes: [
      {
        id: 'trigger_1',
        type: 'manual_trigger',
        data: {
          type: 'manual_trigger',
          label: 'Manual Trigger',
          category: 'triggers',
          config: {},
        },
        position: { x: 100, y: 100 },
      },
      {
        id: 'gmail_1',
        type: 'google_gmail',
        data: {
          type: 'google_gmail',
          label: 'Send Email',
          category: 'communication',
          config: {
            operation: 'send',
            subject: 'Team Notification',
            body: 'AI-generated email body',
            // AI-built array with 3 recipients
            to: ['alice@example.com', 'bob@example.com', 'charlie@example.com'],
            _fillMode: {
              subject: 'buildtime_ai_once',
              body: 'buildtime_ai_once',
              to: 'buildtime_ai_once',
            },
          },
        },
        position: { x: 300, y: 100 },
      },
    ],
    edges: [
      {
        id: 'e1',
        source: 'trigger_1',
        target: 'gmail_1',
        type: 'main',
      },
    ],
    metadata: {
      originalUserPrompt: 'Send email to team',
      buildManifest: {
        version: 1,
        timestamp: new Date().toISOString(),
        integrityHash: 'test-hash',
      },
    },
  };
}

// ─── E2E Tests ────────────────────────────────────────────────────────────────

describe('E2E: Attach-Inputs Preserves AI-Built Values', () => {
  let mockSupabase: any;
  let attachInputsHandler: any;

  beforeEach(async () => {
    jest.clearAllMocks();

    // Mock Supabase client
    mockSupabase = {
      from: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn(),
      update: jest.fn().mockReturnThis(),
      auth: {
        getUser: jest.fn(() => Promise.resolve({
          data: { user: { id: 'test-user-id' } },
          error: null,
        })),
      },
    };

    (getDbClient as any).mockReturnValue(mockSupabase);

    // Import handler after mocks are set up
    const module = await import('../src/api/attach-inputs');
    attachInputsHandler = module.default;
  });

  /**
   * Test 1: Preserve AI-built string values when incoming values are empty
   * 
   * **Validates: Requirement 3.1**
   * 
   * Scenario:
   * 1. Workflow has AI-built values: text="Hello team!", channel="#general"
   * 2. User submits attach-inputs with empty values: text="", channel=""
   * 3. System preserves original AI-built values
   * 4. _fillMode remains "buildtime_ai_once"
   */
  it('preserves AI-built string values when incoming values are empty', async () => {
    const workflowId = 'test-workflow-1';
    const workflow = createWorkflowWithAIBuiltValues(workflowId);

    // Mock DB to return workflow with AI-built values
    mockSupabase.single.mockResolvedValueOnce({
      data: workflow,
      error: null,
    });

    // Mock DB update to capture the saved workflow
    let savedWorkflow: any = null;
    mockSupabase.update.mockImplementation((data: any) => {
      savedWorkflow = data;
      return mockSupabase;
    });
    mockSupabase.eq.mockResolvedValue({ data: null, error: null });

    // Create request with empty values for AI-built fields
    const req = {
      params: { workflowId },
      headers: { authorization: 'Bearer test-token' },
      body: {
        workflowId,
        inputs: {
          // Empty values for AI-built fields (should be preserved)
          'input_slack_1_text': '',
          'input_slack_1_channel': '',
          'input_gmail_1_subject': '',
          'input_gmail_1_body': '',
        },
      },
    } as unknown as Request;

    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    } as unknown as Response;

    // Call attach-inputs handler
    await attachInputsHandler(req, res);

    // Verify response is successful
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalled();

    // Verify workflow was saved
    expect(mockSupabase.update).toHaveBeenCalled();
    expect(savedWorkflow).toBeTruthy();

    // Extract saved nodes from the workflow
    const savedNodes = savedWorkflow.nodes || [];
    const slackNode = savedNodes.find((n: any) => n.id === 'slack_1');
    const gmailNode = savedNodes.find((n: any) => n.id === 'gmail_1');

    // Verify AI-built values are preserved (not overwritten by empty values)
    expect(slackNode).toBeTruthy();
    expect(slackNode.data.config.text).toBe('Hello team! This is an AI-generated message.');
    expect(slackNode.data.config.channel).toBe('#general');

    expect(gmailNode).toBeTruthy();
    expect(gmailNode.data.config.subject).toBe('Project Update');
    expect(gmailNode.data.config.body).toBe('This is an AI-generated email body with project updates.');

    // Verify _fillMode metadata is preserved
    expect(slackNode.data.config._fillMode.text).toBe('buildtime_ai_once');
    expect(slackNode.data.config._fillMode.channel).toBe('buildtime_ai_once');
    expect(gmailNode.data.config._fillMode.subject).toBe('buildtime_ai_once');
    expect(gmailNode.data.config._fillMode.body).toBe('buildtime_ai_once');
  });

  /**
   * Test 2: Preserve AI-built array when incoming array is smaller
   * 
   * **Validates: Requirement 3.2**
   * 
   * Scenario:
   * 1. Workflow has AI-built array: to=["alice@example.com", "bob@example.com", "charlie@example.com"]
   * 2. User submits attach-inputs with smaller array: to=["alice@example.com"]
   * 3. System preserves original AI-built array (3 items)
   * 4. _fillMode remains "buildtime_ai_once"
   */
  it('preserves AI-built array when incoming array is smaller', async () => {
    const workflowId = 'test-workflow-2';
    const workflow = createWorkflowWithAIBuiltArray(workflowId);

    // Mock DB to return workflow with AI-built array
    mockSupabase.single.mockResolvedValueOnce({
      data: workflow,
      error: null,
    });

    // Mock DB update to capture the saved workflow
    let savedWorkflow: any = null;
    mockSupabase.update.mockImplementation((data: any) => {
      savedWorkflow = data;
      return mockSupabase;
    });
    mockSupabase.eq.mockResolvedValue({ data: null, error: null });

    // Create request with smaller array (1 item instead of 3)
    const req = {
      params: { workflowId },
      headers: { authorization: 'Bearer test-token' },
      body: {
        workflowId,
        inputs: {
          // Smaller array (should be rejected, original preserved)
          'input_gmail_1_to': ['alice@example.com'],
        },
      },
    } as unknown as Request;

    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    } as unknown as Response;

    // Call attach-inputs handler
    await attachInputsHandler(req, res);

    // Verify response is successful
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalled();

    // Verify workflow was saved
    expect(mockSupabase.update).toHaveBeenCalled();
    expect(savedWorkflow).toBeTruthy();

    // Extract saved nodes from the workflow
    const savedNodes = savedWorkflow.nodes || [];
    const gmailNode = savedNodes.find((n: any) => n.id === 'gmail_1');

    // Verify AI-built array is preserved (not shrunk to 1 item)
    expect(gmailNode).toBeTruthy();
    expect(gmailNode.data.config.to).toEqual([
      'alice@example.com',
      'bob@example.com',
      'charlie@example.com',
    ]);

    // Verify _fillMode metadata is preserved
    expect(gmailNode.data.config._fillMode.to).toBe('buildtime_ai_once');
  });

  /**
   * Test 3: Allow user override when explicitly switching to manual_static
   * 
   * **Validates: Requirement 3.4 (implicit)**
   * 
   * Scenario:
   * 1. Workflow has AI-built value: text="Hello team!"
   * 2. User explicitly switches to manual_static and provides new value
   * 3. System accepts the new value and updates _fillMode to "manual_static"
   */
  it('allows user override when explicitly switching to manual_static', async () => {
    const workflowId = 'test-workflow-3';
    const workflow = createWorkflowWithAIBuiltValues(workflowId);

    // Mock DB to return workflow with AI-built values
    mockSupabase.single.mockResolvedValueOnce({
      data: workflow,
      error: null,
    });

    // Mock DB update to capture the saved workflow
    let savedWorkflow: any = null;
    mockSupabase.update.mockImplementation((data: any) => {
      savedWorkflow = data;
      return mockSupabase;
    });
    mockSupabase.eq.mockResolvedValue({ data: null, error: null });

    // Create request with explicit mode switch and new value
    const req = {
      params: { workflowId },
      headers: { authorization: 'Bearer test-token' },
      body: {
        workflowId,
        inputs: {
          // Explicit mode switch to manual_static
          'mode_slack_1_text': 'manual_static',
          // New value (should be accepted)
          'input_slack_1_text': 'User-provided custom message',
        },
      },
    } as unknown as Request;

    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    } as unknown as Response;

    // Call attach-inputs handler
    await attachInputsHandler(req, res);

    // Verify response is successful
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalled();

    // Verify workflow was saved
    expect(mockSupabase.update).toHaveBeenCalled();
    expect(savedWorkflow).toBeTruthy();

    // Extract saved nodes from the workflow
    const savedNodes = savedWorkflow.nodes || [];
    const slackNode = savedNodes.find((n: any) => n.id === 'slack_1');

    // Verify new value is accepted (user override)
    expect(slackNode).toBeTruthy();
    expect(slackNode.data.config.text).toBe('User-provided custom message');

    // Verify _fillMode is updated to manual_static
    expect(slackNode.data.config._fillMode.text).toBe('manual_static');
  });

  /**
   * Test 4: Preserve AI-built values across multiple attach-inputs calls (idempotency)
   * 
   * **Validates: Requirement 3.1, 3.6**
   * 
   * Scenario:
   * 1. Workflow has AI-built values
   * 2. User submits attach-inputs with empty values (first call)
   * 3. User submits attach-inputs with empty values again (second call)
   * 4. System preserves AI-built values in both calls
   */
  it('preserves AI-built values across multiple attach-inputs calls (idempotency)', async () => {
    const workflowId = 'test-workflow-4';
    const workflow = createWorkflowWithAIBuiltValues(workflowId);

    // Mock DB to return workflow with AI-built values (first call)
    mockSupabase.single.mockResolvedValueOnce({
      data: workflow,
      error: null,
    });

    // Mock DB update to capture the saved workflow (first call)
    let savedWorkflowFirstCall: any = null;
    mockSupabase.update.mockImplementationOnce((data: any) => {
      savedWorkflowFirstCall = data;
      return mockSupabase;
    });
    mockSupabase.eq.mockResolvedValueOnce({ data: null, error: null });

    // First attach-inputs call with empty values
    const req1 = {
      params: { workflowId },
      headers: { authorization: 'Bearer test-token' },
      body: {
        workflowId,
        inputs: {
          'input_slack_1_text': '',
          'input_slack_1_channel': '',
        },
      },
    } as unknown as Request;

    const res1 = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    } as unknown as Response;

    // Call attach-inputs handler (first call)
    await attachInputsHandler(req1, res1);

    // Verify first call succeeded
    expect(res1.status).toHaveBeenCalledWith(200);
    expect(savedWorkflowFirstCall).toBeTruthy();

    // Extract saved nodes from first call
    const savedNodesFirstCall = savedWorkflowFirstCall.nodes || [];
    const slackNodeFirstCall = savedNodesFirstCall.find((n: any) => n.id === 'slack_1');

    // Verify AI-built values preserved in first call
    expect(slackNodeFirstCall.data.config.text).toBe('Hello team! This is an AI-generated message.');
    expect(slackNodeFirstCall.data.config.channel).toBe('#general');
    expect(slackNodeFirstCall.data.config._fillMode.text).toBe('buildtime_ai_once');

    // Mock DB to return workflow with preserved values (second call)
    const workflowAfterFirstCall = {
      ...workflow,
      nodes: savedNodesFirstCall,
    };
    mockSupabase.single.mockResolvedValueOnce({
      data: workflowAfterFirstCall,
      error: null,
    });

    // Mock DB update to capture the saved workflow (second call)
    let savedWorkflowSecondCall: any = null;
    mockSupabase.update.mockImplementationOnce((data: any) => {
      savedWorkflowSecondCall = data;
      return mockSupabase;
    });
    mockSupabase.eq.mockResolvedValueOnce({ data: null, error: null });

    // Second attach-inputs call with empty values
    const req2 = {
      params: { workflowId },
      headers: { authorization: 'Bearer test-token' },
      body: {
        workflowId,
        inputs: {
          'input_slack_1_text': '',
          'input_slack_1_channel': '',
        },
      },
    } as unknown as Request;

    const res2 = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    } as unknown as Response;

    // Call attach-inputs handler (second call)
    await attachInputsHandler(req2, res2);

    // Verify second call succeeded
    expect(res2.status).toHaveBeenCalledWith(200);
    expect(savedWorkflowSecondCall).toBeTruthy();

    // Extract saved nodes from second call
    const savedNodesSecondCall = savedWorkflowSecondCall.nodes || [];
    const slackNodeSecondCall = savedNodesSecondCall.find((n: any) => n.id === 'slack_1');

    // Verify AI-built values still preserved in second call (idempotency)
    expect(slackNodeSecondCall.data.config.text).toBe('Hello team! This is an AI-generated message.');
    expect(slackNodeSecondCall.data.config.channel).toBe('#general');
    expect(slackNodeSecondCall.data.config._fillMode.text).toBe('buildtime_ai_once');
    expect(slackNodeSecondCall.data.config._fillMode.channel).toBe('buildtime_ai_once');
  });

  /**
   * Test 5: Merge guard prevents accidental overwrites
   * 
   * **Validates: Requirement 3.6**
   * 
   * Scenario:
   * 1. Workflow has AI-built values
   * 2. User submits attach-inputs with various empty/default values
   * 3. System applies merge guard rules to prevent overwrites
   * 4. Only non-empty, meaningful values are accepted
   */
  it('merge guard prevents accidental overwrites of AI-built values', async () => {
    const workflowId = 'test-workflow-5';
    const workflow = createWorkflowWithAIBuiltValues(workflowId);

    // Mock DB to return workflow with AI-built values
    mockSupabase.single.mockResolvedValueOnce({
      data: workflow,
      error: null,
    });

    // Mock DB update to capture the saved workflow
    let savedWorkflow: any = null;
    mockSupabase.update.mockImplementation((data: any) => {
      savedWorkflow = data;
      return mockSupabase;
    });
    mockSupabase.eq.mockResolvedValue({ data: null, error: null });

    // Create request with various empty/default values (all should be rejected)
    const req = {
      params: { workflowId },
      headers: { authorization: 'Bearer test-token' },
      body: {
        workflowId,
        inputs: {
          // Various empty/default values (should all be rejected by merge guard)
          'input_slack_1_text': '',
          'input_slack_1_channel': null,
          'input_gmail_1_subject': undefined,
          'input_gmail_1_body': '   ', // Whitespace only
          'input_gmail_1_to': [], // Empty array
        },
      },
    } as unknown as Request;

    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    } as unknown as Response;

    // Call attach-inputs handler
    await attachInputsHandler(req, res);

    // Verify response is successful
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalled();

    // Verify workflow was saved
    expect(mockSupabase.update).toHaveBeenCalled();
    expect(savedWorkflow).toBeTruthy();

    // Extract saved nodes from the workflow
    const savedNodes = savedWorkflow.nodes || [];
    const slackNode = savedNodes.find((n: any) => n.id === 'slack_1');
    const gmailNode = savedNodes.find((n: any) => n.id === 'gmail_1');

    // Verify ALL AI-built values are preserved (merge guard blocked all empty values)
    expect(slackNode.data.config.text).toBe('Hello team! This is an AI-generated message.');
    expect(slackNode.data.config.channel).toBe('#general');
    expect(gmailNode.data.config.subject).toBe('Project Update');
    expect(gmailNode.data.config.body).toBe('This is an AI-generated email body with project updates.');
    expect(gmailNode.data.config.to).toEqual(['team@example.com']);

    // Verify _fillMode metadata is preserved for all fields
    expect(slackNode.data.config._fillMode.text).toBe('buildtime_ai_once');
    expect(slackNode.data.config._fillMode.channel).toBe('buildtime_ai_once');
    expect(gmailNode.data.config._fillMode.subject).toBe('buildtime_ai_once');
    expect(gmailNode.data.config._fillMode.body).toBe('buildtime_ai_once');
    expect(gmailNode.data.config._fillMode.to).toBe('buildtime_ai_once');
  });
});
