const MOCK_URL = 'http://ai-generator:8080';

jest.mock('../capability-selection-stage', () => ({}));

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
    mod = require('../capability-stage-client');
  });
  return mod as typeof import('../capability-stage-client');
}

describe('capability-stage-client response contract', () => {
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

  it('returns parsed capability-selection success payloads unchanged', async () => {
    const payload = {
      ok: true,
      steps: [
        {
          nodeId: 'gmail-send-1',
          type: 'google_gmail',
          capabilityId: 'gmail.send_email',
          reason: 'Sends the generated summary email',
        },
      ],
      durationMs: 34,
      llmCall: {
        model: 'gemini-3.5-flash',
        temperature: 0.1,
        promptTokens: 120,
        completionTokens: 45,
      },
    };
    const response = makeFetchSuccess(payload);
    const { runCapabilitySelectionJsonRemote } = loadClient();

    const result = await runCapabilitySelectionJsonRemote({
      systemPrompt: 'capability selection system prompt',
      message: 'select capabilities for selected nodes',
      correlationId: 'corr-122',
    });

    expect(result).toEqual(payload);
    expect(response.json).toHaveBeenCalledTimes(1);
  });

  it('returns parsed INVALID_LLM_RESPONSE payloads unchanged', async () => {
    const payload = {
      ok: false,
      code: 'INVALID_LLM_RESPONSE' as const,
      rawResponse: 'not valid capability json',
      durationMs: 18,
    };
    const response = makeFetchSuccess(payload);
    const { runCapabilitySelectionJsonRemote } = loadClient();

    const result = await runCapabilitySelectionJsonRemote({
      systemPrompt: 'capability selection system prompt',
      message: 'select capabilities for selected nodes',
    });

    expect(result).toEqual(payload);
    expect(response.json).toHaveBeenCalledTimes(1);
  });

  it('returns null and skips JSON parsing when ai-generator responds with non-OK status', async () => {
    const response = makeFetchNotOk(502);
    const { runCapabilitySelectionJsonRemote } = loadClient();

    const result = await runCapabilitySelectionJsonRemote({
      systemPrompt: 'capability selection system prompt',
      message: 'select capabilities for selected nodes',
    });

    expect(result).toBeNull();
    expect(response.json).not.toHaveBeenCalled();
    expect(consoleWarnSpy).toHaveBeenCalledWith('[capability-stage-client] ai-generator returned 502 - falling back to local');
  });
});
