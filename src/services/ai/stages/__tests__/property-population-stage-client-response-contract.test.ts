const MOCK_URL = 'http://ai-generator:8080';

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
    mod = require('../property-population-stage-client');
  });
  return mod as typeof import('../property-population-stage-client');
}

describe('property-population-stage-client response contract', () => {
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

  it('returns parsed property-population success payloads unchanged', async () => {
    const payload = {
      ok: true,
      values: {
        subject: 'Follow up with lead',
        body: 'Thanks for your time today.',
      },
      durationMs: 26,
      llmCall: {
        model: 'gemini-3.5-flash',
        temperature: 0.1,
        promptTokens: 118,
        completionTokens: 42,
      },
    };
    const response = makeFetchSuccess(payload);
    const { runPropertyPopulationJsonRemote } = loadClient();

    const result = await runPropertyPopulationJsonRemote({
      purpose: 'property_population',
      systemPrompt: 'property population system prompt',
      message: 'populate node property values',
      correlationId: 'corr-125',
      nodeId: 'gmail_1',
      nodeType: 'gmail',
    });

    expect(result).toEqual(payload);
    expect(response.json).toHaveBeenCalledTimes(1);
  });

  it('returns parsed field-directive success payloads unchanged', async () => {
    const payload = {
      ok: true,
      values: {
        body: { source: 'runtime', expression: '{{summary}}' },
        summary: { source: 'previous_node', nodeId: 'summarizer_1' },
      },
      durationMs: 33,
      llmCall: {
        model: 'gemini-3.5-flash',
        temperature: 0.1,
        promptTokens: 141,
        completionTokens: 57,
      },
    };
    const response = makeFetchSuccess(payload);
    const { runPropertyPopulationJsonRemote } = loadClient();

    const result = await runPropertyPopulationJsonRemote({
      purpose: 'field_directive_generation',
      systemPrompt: 'directive generation system prompt',
      message: 'generate runtime directives',
      allowedKeys: ['body', 'summary'],
    });

    expect(result).toEqual(payload);
    expect(response.json).toHaveBeenCalledTimes(1);
  });

  it('returns parsed INVALID_LLM_RESPONSE payloads unchanged', async () => {
    const payload = {
      ok: false,
      code: 'INVALID_LLM_RESPONSE' as const,
      rawResponse: 'not valid property population json',
      durationMs: 19,
    };
    const response = makeFetchSuccess(payload);
    const { runPropertyPopulationJsonRemote } = loadClient();

    const result = await runPropertyPopulationJsonRemote({
      purpose: 'property_population',
      systemPrompt: 'property population system prompt',
      message: 'populate node property values',
    });

    expect(result).toEqual(payload);
    expect(response.json).toHaveBeenCalledTimes(1);
  });

  it('returns null and skips JSON parsing when ai-generator responds with non-OK status', async () => {
    const response = makeFetchNotOk(504);
    const { runPropertyPopulationJsonRemote } = loadClient();

    const result = await runPropertyPopulationJsonRemote({
      purpose: 'property_population',
      systemPrompt: 'property population system prompt',
      message: 'populate node property values',
    });

    expect(result).toBeNull();
    expect(response.json).not.toHaveBeenCalled();
    expect(consoleWarnSpy).toHaveBeenCalledWith('[property-population-stage-client] ai-generator returned 504 - falling back to local');
  });
});
