const MOCK_URL = 'http://ai-generator:8080';

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
    mod = require('../node-selection-stage-client');
  });
  return mod as typeof import('../node-selection-stage-client');
}

describe('node-selection-stage-client response contract', () => {
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

  it('returns parsed node-selection success payloads unchanged', async () => {
    const payload = {
      ok: true,
      selectedNodes: [
        { type: 'manual_trigger', role: 'trigger', reason: 'Starts the workflow' },
        { type: 'google_gmail', role: 'terminal', reason: 'Sends the summary email' },
      ],
      durationMs: 28,
      llmCall: {
        model: 'gemini-3.5-flash',
        temperature: 0.1,
        promptTokens: 104,
        completionTokens: 33,
      },
    };
    const response = makeFetchSuccess(payload);
    const { runNodeSelectionJsonRemote } = loadClient();

    const result = await runNodeSelectionJsonRemote({
      systemPrompt: 'node selection system prompt',
      message: 'select workflow nodes for the intent',
      correlationId: 'corr-124',
    });

    expect(result).toEqual(payload);
    expect(response.json).toHaveBeenCalledTimes(1);
  });

  it('returns parsed INVALID_LLM_RESPONSE payloads unchanged', async () => {
    const payload = {
      ok: false,
      code: 'INVALID_LLM_RESPONSE' as const,
      rawResponse: 'not valid node selection json',
      durationMs: 17,
    };
    const response = makeFetchSuccess(payload);
    const { runNodeSelectionJsonRemote } = loadClient();

    const result = await runNodeSelectionJsonRemote({
      systemPrompt: 'node selection system prompt',
      message: 'select workflow nodes for the intent',
    });

    expect(result).toEqual(payload);
    expect(response.json).toHaveBeenCalledTimes(1);
  });

  it('returns null and skips JSON parsing when ai-generator responds with non-OK status', async () => {
    const response = makeFetchNotOk(504);
    const { runNodeSelectionJsonRemote } = loadClient();

    const result = await runNodeSelectionJsonRemote({
      systemPrompt: 'node selection system prompt',
      message: 'select workflow nodes for the intent',
    });

    expect(result).toBeNull();
    expect(response.json).not.toHaveBeenCalled();
    expect(consoleWarnSpy).toHaveBeenCalledWith('[node-selection-stage-client] ai-generator returned 504 - falling back to local');
  });
});
