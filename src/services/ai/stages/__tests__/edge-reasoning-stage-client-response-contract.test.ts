const MOCK_URL = 'http://ai-generator:8080';

jest.mock('../edge-reasoning-stage', () => ({}));
jest.mock('../../system-prompt-builder', () => ({}));

const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

function makeFetchSuccess(data: unknown) {
  const response = {
    ok: true,
    status: 200,
    json: jest.fn().mockResolvedValue(data),
  };
  global.fetch = jest.fn().mockResolvedValue(response) as any;
  return response;
}

function makeFetchNotOk(status: number) {
  const response = {
    ok: false,
    status,
    json: jest.fn(),
  };
  global.fetch = jest.fn().mockResolvedValue(response) as any;
  return response;
}

function loadClient() {
  let mod: any;
  jest.isolateModules(() => {
    mod = require('../edge-reasoning-stage-client');
  });
  return mod as typeof import('../edge-reasoning-stage-client');
}

describe('edge-reasoning-stage-client response contract', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.AI_GENERATOR_URL = MOCK_URL;
    delete process.env.AI_GENERATOR_SERVICE_KEY;
  });

  afterEach(() => {
    delete process.env.AI_GENERATOR_URL;
    delete process.env.AI_GENERATOR_SERVICE_KEY;
    delete (global as any).fetch;
  });

  afterAll(() => {
    consoleWarnSpy.mockRestore();
  });

  it('returns parsed JSON-only success payloads unchanged', async () => {
    const payload = {
      ok: true,
      orderedNodes: ['node_manual_trigger_1', 'node_google_gmail_1'],
      edges: [{ source: 'node_manual_trigger_1', target: 'node_google_gmail_1', type: 'main' }],
      durationMs: 31,
      llmCall: {
        model: 'gemini-3.5-flash',
        temperature: 0.1,
        promptTokens: 110,
        completionTokens: 52,
      },
    };
    const response = makeFetchSuccess(payload);
    const { runEdgeReasoningJsonRemote } = loadClient();

    const result = await runEdgeReasoningJsonRemote({
      systemPrompt: 'edge reasoning system prompt',
      message: 'connect the selected nodes',
      correlationId: 'corr-123-json',
    });

    expect(result).toEqual(payload);
    expect(response.json).toHaveBeenCalledTimes(1);
  });

  it('returns parsed JSON-only CYCLE_DETECTED payloads unchanged', async () => {
    const payload = {
      ok: false,
      code: 'CYCLE_DETECTED' as const,
      rawResponse: '{"edges":[{"source":"a","target":"b"},{"source":"b","target":"a"}]}',
      durationMs: 24,
    };
    const response = makeFetchSuccess(payload);
    const { runEdgeReasoningJsonRemote } = loadClient();

    const result = await runEdgeReasoningJsonRemote({
      systemPrompt: 'edge reasoning system prompt',
      message: 'connect the selected nodes',
    });

    expect(result).toEqual(payload);
    expect(response.json).toHaveBeenCalledTimes(1);
  });

  it('returns parsed full-stage success payloads unchanged', async () => {
    const payload = {
      ok: true,
      workflow: {
        nodes: [{ id: 'node_manual_trigger_1', type: 'manual_trigger', data: { config: {} } }],
        edges: [{ id: 'edge-1', source: 'node_manual_trigger_1', target: 'node_google_gmail_1' }],
      },
      orderedNodeIds: ['node_manual_trigger_1', 'node_google_gmail_1'],
      edges: [{ source: 'node_manual_trigger_1', target: 'node_google_gmail_1', type: 'main' }],
      durationMs: 45,
      llmCall: {
        model: 'gemini-3.5-flash',
        temperature: 0.1,
        promptTokens: 145,
        completionTokens: 61,
      },
    };
    const response = makeFetchSuccess(payload);
    const { runEdgeReasoningStageRemote } = loadClient();

    const result = await runEdgeReasoningStageRemote({
      selectedNodes: [
        {
          type: 'manual_trigger',
          role: 'trigger',
          reason: 'Starts the workflow',
          nodeId: 'node_manual_trigger_1',
        },
      ],
      catalog: 'node catalog text',
      userIntent: 'Send an email after a manual trigger',
      correlationId: 'corr-123-stage',
    });

    expect(result).toEqual(payload);
    expect(response.json).toHaveBeenCalledTimes(1);
  });

  it('returns parsed full-stage INVALID_LLM_RESPONSE payloads unchanged', async () => {
    const payload = {
      ok: false,
      code: 'INVALID_LLM_RESPONSE' as const,
      rawResponse: 'not valid edge reasoning json',
      durationMs: 19,
    };
    const response = makeFetchSuccess(payload);
    const { runEdgeReasoningStageRemote } = loadClient();

    const result = await runEdgeReasoningStageRemote({
      selectedNodes: [],
      catalog: 'node catalog text',
      userIntent: 'Connect selected workflow nodes',
    });

    expect(result).toEqual(payload);
    expect(response.json).toHaveBeenCalledTimes(1);
  });

  it('returns null and skips JSON parsing when JSON-only ai-generator responds with non-OK status', async () => {
    const response = makeFetchNotOk(503);
    const { runEdgeReasoningJsonRemote } = loadClient();

    const result = await runEdgeReasoningJsonRemote({
      systemPrompt: 'edge reasoning system prompt',
      message: 'connect the selected nodes',
    });

    expect(result).toBeNull();
    expect(response.json).not.toHaveBeenCalled();
    expect(consoleWarnSpy).toHaveBeenCalledWith('[edge-reasoning-stage-client] ai-generator returned 503 - falling back to local');
  });

  it('returns null and skips JSON parsing when full-stage ai-generator responds with non-OK status', async () => {
    const response = makeFetchNotOk(502);
    const { runEdgeReasoningStageRemote } = loadClient();

    const result = await runEdgeReasoningStageRemote({
      selectedNodes: [],
      catalog: 'node catalog text',
      userIntent: 'Connect selected workflow nodes',
    });

    expect(result).toBeNull();
    expect(response.json).not.toHaveBeenCalled();
    expect(consoleWarnSpy).toHaveBeenCalledWith('[edge-reasoning-stage-client] ai-generator /edge-reasoning returned 502 - falling back');
  });
});
