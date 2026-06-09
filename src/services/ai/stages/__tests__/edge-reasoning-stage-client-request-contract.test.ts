import type { SelectedNode } from '../../system-prompt-builder';

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
    mod = require('../edge-reasoning-stage-client');
  });
  return mod as typeof import('../edge-reasoning-stage-client');
}

function getRequest(index = 0) {
  return (global.fetch as jest.Mock).mock.calls[index] as [string, RequestInit];
}

function parseRequestBody(index = 0) {
  const [, init] = getRequest(index);
  return JSON.parse(init.body as string);
}

function makeSelectedNodes(): SelectedNode[] {
  return [
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
}

describe('edge-reasoning-stage-client request contract', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.AI_GENERATOR_URL = MOCK_URL;
    delete process.env.AI_GENERATOR_SERVICE_KEY;
    global.fetch = makeFetchSuccess({
      ok: true,
      orderedNodes: ['node_manual_trigger_1', 'node_google_gmail_1'],
      orderedNodeIds: ['node_manual_trigger_1', 'node_google_gmail_1'],
      edges: [{ source: 'node_manual_trigger_1', target: 'node_google_gmail_1', type: 'main' }],
      workflow: { nodes: [], edges: [] },
      durationMs: 12,
      llmCall: { model: 'gemini-3.5-flash', temperature: 0.1, promptTokens: 10, completionTokens: 20 },
    }) as any;
  });

  afterEach(() => {
    delete process.env.AI_GENERATOR_URL;
    delete process.env.AI_GENERATOR_SERVICE_KEY;
  });

  it('serializes JSON-only edge reasoning fields in the remote request body', async () => {
    const { runEdgeReasoningJsonRemote } = loadClient();

    await runEdgeReasoningJsonRemote({
      systemPrompt: 'edge reasoning system prompt',
      message: 'SELECTED_NODES:\n[]\n\nUSER_INTENT:\nSend a summary email',
      correlationId: 'corr-107-json',
    });

    const [url, init] = getRequest();
    expect(url).toBe(`${MOCK_URL}/generate/edge-reasoning-json`);
    expect(init.method).toBe('POST');
    expect(parseRequestBody()).toEqual({
      systemPrompt: 'edge reasoning system prompt',
      message: 'SELECTED_NODES:\n[]\n\nUSER_INTENT:\nSend a summary email',
      correlationId: 'corr-107-json',
    });
  });

  it('serializes full-stage edge reasoning context fields in the remote request body', async () => {
    const selectedNodes = makeSelectedNodes();
    const { runEdgeReasoningStageRemote } = loadClient();

    await runEdgeReasoningStageRemote({
      selectedNodes,
      catalog: 'node catalog text',
      userIntent: 'Send a summary email when the workflow is manually triggered',
      correlationId: 'corr-107-stage',
      structuralPrompt: 'Manual trigger feeds the Gmail action.',
    });

    const [url, init] = getRequest();
    expect(url).toBe(`${MOCK_URL}/generate/edge-reasoning`);
    expect(init.method).toBe('POST');
    expect(parseRequestBody()).toEqual({
      selectedNodes,
      catalog: 'node catalog text',
      userIntent: 'Send a summary email when the workflow is manually triggered',
      correlationId: 'corr-107-stage',
      structuralPrompt: 'Manual trigger feeds the Gmail action.',
    });
  });

  it('omits optional context fields when only the base full-stage request is provided', async () => {
    const selectedNodes = makeSelectedNodes();
    const { runEdgeReasoningStageRemote } = loadClient();

    await runEdgeReasoningStageRemote({
      selectedNodes,
      catalog: 'node catalog text',
      userIntent: 'Connect the selected workflow nodes',
    });

    const body = parseRequestBody();
    expect(body).toEqual({
      selectedNodes,
      catalog: 'node catalog text',
      userIntent: 'Connect the selected workflow nodes',
    });
    expect(body).not.toHaveProperty('correlationId');
    expect(body).not.toHaveProperty('structuralPrompt');
  });

  it('includes the service key header for edge reasoning remote calls', async () => {
    process.env.AI_GENERATOR_SERVICE_KEY = 'edge-secret';
    const { runEdgeReasoningJsonRemote, runEdgeReasoningStageRemote } = loadClient();

    await runEdgeReasoningJsonRemote({
      systemPrompt: 'edge reasoning system prompt',
      message: 'edge reasoning message',
    });
    await runEdgeReasoningStageRemote({
      selectedNodes: makeSelectedNodes(),
      catalog: 'node catalog text',
      userIntent: 'Connect nodes',
    });

    const [, jsonInit] = getRequest(0);
    const [, stageInit] = getRequest(1);
    expect(jsonInit.headers).toMatchObject({
      'Content-Type': 'application/json',
      'x-service-key': 'edge-secret',
    });
    expect(stageInit.headers).toMatchObject({
      'Content-Type': 'application/json',
      'x-service-key': 'edge-secret',
    });
  });
});
