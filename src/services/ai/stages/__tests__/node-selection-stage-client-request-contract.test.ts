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
    mod = require('../node-selection-stage-client');
  });
  return mod as typeof import('../node-selection-stage-client');
}

function parseRequestBody() {
  const [, init] = (global.fetch as jest.Mock).mock.calls[0];
  return JSON.parse(init.body as string);
}

describe('node-selection-stage-client request contract', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.AI_GENERATOR_URL = MOCK_URL;
    delete process.env.AI_GENERATOR_SERVICE_KEY;
    global.fetch = makeFetchSuccess({
      ok: true,
      selectedNodes: [
        { type: 'manual_trigger', role: 'trigger', reason: 'Starts the workflow' },
        { type: 'google_gmail', role: 'terminal', reason: 'Sends the summary email' },
      ],
      durationMs: 12,
      llmCall: { model: 'gemini-3.5-flash', temperature: 0.1, promptTokens: 10, completionTokens: 20 },
    }) as any;
  });

  afterEach(() => {
    delete process.env.AI_GENERATOR_URL;
    delete process.env.AI_GENERATOR_SERVICE_KEY;
  });

  it('serializes node-selection prompt fields in the remote request body', async () => {
    const { runNodeSelectionJsonRemote } = loadClient();

    await runNodeSelectionJsonRemote({
      systemPrompt: 'node selection system prompt',
      message: 'STRUCTURED_INTENT:\n{"intent":"Send a Gmail summary"}',
      correlationId: 'corr-109',
    });

    const [url, init] = (global.fetch as jest.Mock).mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${MOCK_URL}/generate/node-selection-json`);
    expect(init.method).toBe('POST');
    expect(parseRequestBody()).toEqual({
      systemPrompt: 'node selection system prompt',
      message: 'STRUCTURED_INTENT:\n{"intent":"Send a Gmail summary"}',
      correlationId: 'corr-109',
    });
  });

  it('omits optional correlation ID when only the base node-selection request is provided', async () => {
    const { runNodeSelectionJsonRemote } = loadClient();

    await runNodeSelectionJsonRemote({
      systemPrompt: 'node selection system prompt',
      message: 'STRUCTURED_INTENT:\n{"intent":"Send a Gmail summary"}',
    });

    const body = parseRequestBody();
    expect(body).toEqual({
      systemPrompt: 'node selection system prompt',
      message: 'STRUCTURED_INTENT:\n{"intent":"Send a Gmail summary"}',
    });
    expect(body).not.toHaveProperty('correlationId');
  });

  it('includes the service key header for node selection remote calls', async () => {
    process.env.AI_GENERATOR_SERVICE_KEY = 'node-selection-secret';
    const { runNodeSelectionJsonRemote } = loadClient();

    await runNodeSelectionJsonRemote({
      systemPrompt: 'node selection system prompt',
      message: 'select workflow nodes',
    });

    const [, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(init.headers).toMatchObject({
      'Content-Type': 'application/json',
      'x-service-key': 'node-selection-secret',
    });
  });
});
