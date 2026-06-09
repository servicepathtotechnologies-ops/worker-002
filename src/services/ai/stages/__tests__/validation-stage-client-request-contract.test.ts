const MOCK_URL = 'http://ai-generator:8080';

function makeFetchSuccess(data: unknown) {
  return jest.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: jest.fn().mockResolvedValue(data),
  });
}

function loadClient() {
  let mod: any;
  jest.isolateModules(() => {
    mod = require('../validation-stage-client');
  });
  return mod as typeof import('../validation-stage-client');
}

function parseRequestBody() {
  const [, init] = (global.fetch as jest.Mock).mock.calls[0];
  return JSON.parse(init.body as string);
}

function makeWorkflow() {
  return {
    id: 'workflow_ignored_by_client',
    nodes: [
      {
        id: 'node_manual_trigger_1',
        type: 'manual_trigger',
        data: {
          label: 'Manual Trigger',
          type: 'manual_trigger',
          category: 'trigger',
          config: {},
        },
      },
      {
        id: 'node_google_gmail_1',
        type: 'google_gmail',
        data: {
          label: 'Gmail',
          type: 'google_gmail',
          category: 'communication',
          config: { to: 'ops@example.com' },
        },
      },
    ],
    edges: [
      {
        id: 'edge_manual_to_gmail',
        source: 'node_manual_trigger_1',
        target: 'node_google_gmail_1',
        type: 'main',
      },
    ],
  };
}

describe('validation-stage-client request contract', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.AI_GENERATOR_URL = MOCK_URL;
    delete process.env.AI_GENERATOR_SERVICE_KEY;
    global.fetch = makeFetchSuccess({
      ok: true,
      status: 'pass',
      issues: [],
      durationMs: 12,
      llmCall: { model: 'gemini-3.5-flash', temperature: 0.1, promptTokens: 10, completionTokens: 20 },
    }) as any;
  });

  afterEach(() => {
    delete process.env.AI_GENERATOR_URL;
    delete process.env.AI_GENERATOR_SERVICE_KEY;
  });

  it('serializes workflow and validation context fields in the remote request body', async () => {
    const workflow = makeWorkflow();
    const selectedNodes = [
      {
        type: 'manual_trigger',
        role: 'trigger',
        reason: 'Starts the workflow',
        nodeId: 'node_manual_trigger_1',
      },
      {
        type: 'google_gmail',
        role: 'terminal',
        reason: 'Sends the summary email',
        nodeId: 'node_google_gmail_1',
      },
    ];
    const proposedEdges = [
      {
        source: 'node_manual_trigger_1',
        target: 'node_google_gmail_1',
        type: 'main',
      },
    ];
    const { runValidationStageRemote } = loadClient();

    await runValidationStageRemote(
      workflow as any,
      'node catalog text',
      'Send a summary email when the workflow is manually triggered',
      selectedNodes as any,
      proposedEdges as any,
      'corr-106',
      'Manual trigger feeds the Gmail action.',
    );

    expect(parseRequestBody()).toEqual({
      intent: 'Send a summary email when the workflow is manually triggered',
      catalog: 'node catalog text',
      correlationId: 'corr-106',
      workflow: {
        nodes: workflow.nodes,
        edges: workflow.edges,
      },
      selectedNodes,
      proposedEdges,
      structuralPrompt: 'Manual trigger feeds the Gmail action.',
    });
  });

  it('omits optional context fields when only the base validation request is provided', async () => {
    const workflow = makeWorkflow();
    const { runValidationStageRemote } = loadClient();

    await runValidationStageRemote(workflow as any, 'node catalog text', 'Validate the workflow');

    const body = parseRequestBody();
    expect(body).toEqual({
      intent: 'Validate the workflow',
      catalog: 'node catalog text',
      workflow: {
        nodes: workflow.nodes,
        edges: workflow.edges,
      },
    });
    expect(body).not.toHaveProperty('selectedNodes');
    expect(body).not.toHaveProperty('proposedEdges');
    expect(body).not.toHaveProperty('correlationId');
    expect(body).not.toHaveProperty('structuralPrompt');
  });

  it('includes the service key header for validation remote calls', async () => {
    process.env.AI_GENERATOR_SERVICE_KEY = 'validation-secret';
    const { runValidationStageRemote } = loadClient();

    await runValidationStageRemote(makeWorkflow() as any, 'node catalog text', 'Validate the workflow');

    const [, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(init.headers).toMatchObject({
      'Content-Type': 'application/json',
      'x-service-key': 'validation-secret',
    });
  });
});
