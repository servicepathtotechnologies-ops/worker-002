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
    mod = require('../intent-stage-client');
  });
  return mod as typeof import('../intent-stage-client');
}

function parseRequestBody() {
  const [, init] = (global.fetch as jest.Mock).mock.calls[0];
  return JSON.parse(init.body as string);
}

describe('intent-stage-client request contract', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.AI_GENERATOR_URL = MOCK_URL;
    delete process.env.AI_GENERATOR_SERVICE_KEY;
    global.fetch = makeFetchSuccess({
      ok: true,
      intent: {
        intent: 'Send a Gmail summary when manually triggered',
        triggerType: 'manual_trigger',
        actions: ['send a Gmail summary'],
        dataFlows: [],
        constraints: [],
        originalPrompt: 'Send a Gmail summary when manually triggered',
      },
      durationMs: 12,
      llmCall: { model: 'gemini-3.5-flash', temperature: 0.1, promptTokens: 10, completionTokens: 20 },
    }) as any;
  });

  afterEach(() => {
    delete process.env.AI_GENERATOR_URL;
    delete process.env.AI_GENERATOR_SERVICE_KEY;
  });

  it('serializes intent prompt, catalog, and correlation ID in the remote request body', async () => {
    const { runIntentStageRemote } = loadClient();

    await runIntentStageRemote(
      'Send a Gmail summary when manually triggered',
      'node catalog text',
      'corr-108',
    );

    const [url, init] = (global.fetch as jest.Mock).mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${MOCK_URL}/generate/intent`);
    expect(init.method).toBe('POST');
    expect(parseRequestBody()).toEqual({
      prompt: 'Send a Gmail summary when manually triggered',
      catalog: 'node catalog text',
      correlationId: 'corr-108',
    });
  });

  it('omits optional correlation ID when only the base intent request is provided', async () => {
    const { runIntentStageRemote } = loadClient();

    await runIntentStageRemote('Summarize new support tickets', 'node catalog text');

    const body = parseRequestBody();
    expect(body).toEqual({
      prompt: 'Summarize new support tickets',
      catalog: 'node catalog text',
    });
    expect(body).not.toHaveProperty('correlationId');
  });

  it('includes the service key header for intent remote calls', async () => {
    process.env.AI_GENERATOR_SERVICE_KEY = 'intent-secret';
    const { runIntentStageRemote } = loadClient();

    await runIntentStageRemote('Summarize new support tickets', 'node catalog text');

    const [, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(init.headers).toMatchObject({
      'Content-Type': 'application/json',
      'x-service-key': 'intent-secret',
    });
  });
});
