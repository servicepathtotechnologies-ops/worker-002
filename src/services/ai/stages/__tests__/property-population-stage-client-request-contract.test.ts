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
    mod = require('../property-population-stage-client');
  });
  return mod as typeof import('../property-population-stage-client');
}

function parseRequestBody() {
  const [, init] = (global.fetch as jest.Mock).mock.calls[0];
  return JSON.parse(init.body as string);
}

describe('property-population-stage-client request contract', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.AI_GENERATOR_URL = MOCK_URL;
    delete process.env.AI_GENERATOR_SERVICE_KEY;
    global.fetch = makeFetchSuccess({
      ok: true,
      values: { subject: 'Follow up with lead' },
      durationMs: 12,
      llmCall: { model: 'gemini-3.5-flash', temperature: 0.1, promptTokens: 10, completionTokens: 20 },
    }) as any;
  });

  afterEach(() => {
    delete process.env.AI_GENERATOR_URL;
    delete process.env.AI_GENERATOR_SERVICE_KEY;
  });

  it('serializes directive-generation context fields in the remote request body', async () => {
    const { runPropertyPopulationJsonRemote } = loadClient();

    await runPropertyPopulationJsonRemote({
      purpose: 'field_directive_generation',
      systemPrompt: 'system prompt',
      message: 'generate runtime directives',
      allowedKeys: ['body', 'summary'],
      correlationId: 'corr-105',
      nodeId: 'gmail_1',
      nodeType: 'gmail',
    });

    expect(parseRequestBody()).toEqual({
      purpose: 'field_directive_generation',
      systemPrompt: 'system prompt',
      message: 'generate runtime directives',
      allowedKeys: ['body', 'summary'],
      correlationId: 'corr-105',
      nodeId: 'gmail_1',
      nodeType: 'gmail',
    });
  });

  it('omits optional context fields when only the base property request is provided', async () => {
    const { runPropertyPopulationJsonRemote } = loadClient();

    await runPropertyPopulationJsonRemote({
      purpose: 'property_population',
      systemPrompt: 'system prompt',
      message: 'populate configured values',
    });

    const body = parseRequestBody();
    expect(body).toEqual({
      purpose: 'property_population',
      systemPrompt: 'system prompt',
      message: 'populate configured values',
    });
    expect(body).not.toHaveProperty('allowedKeys');
    expect(body).not.toHaveProperty('correlationId');
    expect(body).not.toHaveProperty('nodeId');
    expect(body).not.toHaveProperty('nodeType');
  });

  it('includes the service key header for property population remote calls', async () => {
    process.env.AI_GENERATOR_SERVICE_KEY = 'property-secret';
    const { runPropertyPopulationJsonRemote } = loadClient();

    await runPropertyPopulationJsonRemote({
      purpose: 'property_population',
      systemPrompt: 'system prompt',
      message: 'populate values',
    });

    const [, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(init.headers).toMatchObject({
      'Content-Type': 'application/json',
      'x-service-key': 'property-secret',
    });
  });
});
