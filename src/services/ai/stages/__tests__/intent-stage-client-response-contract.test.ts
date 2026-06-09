const MOCK_URL = 'http://ai-generator:8080';

jest.mock('../intent-stage', () => ({}));

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
    mod = require('../intent-stage-client');
  });
  return mod as typeof import('../intent-stage-client');
}

describe('intent-stage-client response contract', () => {
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

  it('returns parsed intent success payloads unchanged', async () => {
    const payload = {
      ok: true,
      intent: {
        intent: 'Send a Gmail summary when manually triggered',
        triggerType: 'manual_trigger' as const,
        actions: ['send a Gmail summary'],
        dataFlows: [
          {
            from: 'manual_trigger',
            to: 'google_gmail',
            dataDescription: 'summary content',
          },
        ],
        constraints: ['preserve the original prompt'],
        originalPrompt: 'Send a Gmail summary when manually triggered',
      },
      durationMs: 24,
      llmCall: {
        model: 'gemini-3.5-flash',
        temperature: 0.1,
        promptTokens: 92,
        completionTokens: 41,
      },
    };
    const response = makeFetchSuccess(payload);
    const { runIntentStageRemote } = loadClient();

    const result = await runIntentStageRemote(
      'Send a Gmail summary when manually triggered',
      'node catalog text',
      'corr-127',
    );

    expect(result).toEqual(payload);
    expect(response.json).toHaveBeenCalledTimes(1);
  });

  it('returns parsed INVALID_LLM_RESPONSE payloads unchanged', async () => {
    const payload = {
      ok: false,
      code: 'INVALID_LLM_RESPONSE' as const,
      rawResponse: 'not valid intent json',
      durationMs: 16,
    };
    const response = makeFetchSuccess(payload);
    const { runIntentStageRemote } = loadClient();

    const result = await runIntentStageRemote(
      'Summarize new support tickets',
      'node catalog text',
    );

    expect(result).toEqual(payload);
    expect(response.json).toHaveBeenCalledTimes(1);
  });

  it('returns null and skips JSON parsing when ai-generator responds with non-OK status', async () => {
    const response = makeFetchNotOk(502);
    const { runIntentStageRemote } = loadClient();

    const result = await runIntentStageRemote(
      'Summarize new support tickets',
      'node catalog text',
    );

    expect(result).toBeNull();
    expect(response.json).not.toHaveBeenCalled();
    expect(consoleWarnSpy).toHaveBeenCalledWith('[intent-stage-client] ai-generator returned 502 \u2014 falling back to local');
  });
});
