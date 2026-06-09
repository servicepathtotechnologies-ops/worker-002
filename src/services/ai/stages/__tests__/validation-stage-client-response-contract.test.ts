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
    mod = require('../validation-stage-client');
  });
  return mod as typeof import('../validation-stage-client');
}

function makeWorkflow() {
  return {
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
    ],
    edges: [],
  };
}

describe('validation-stage-client response contract', () => {
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

  it('returns parsed validation success payloads unchanged', async () => {
    const payload = {
      ok: true,
      status: 'fail' as const,
      issues: [
        {
          severity: 'warning' as const,
          description: 'Gmail node is missing a subject template',
          suggestedFix: 'Populate the subject field from the lead summary',
        },
      ],
      durationMs: 29,
      llmCall: {
        model: 'gemini-3.5-flash',
        temperature: 0.1,
        promptTokens: 132,
        completionTokens: 48,
      },
    };
    const response = makeFetchSuccess(payload);
    const { runValidationStageRemote } = loadClient();

    const result = await runValidationStageRemote(
      makeWorkflow() as any,
      'node catalog text',
      'Send a Gmail summary when manually triggered',
      undefined,
      undefined,
      'corr-126',
    );

    expect(result).toEqual(payload);
    expect(response.json).toHaveBeenCalledTimes(1);
  });

  it('returns parsed INVALID_LLM_RESPONSE payloads unchanged', async () => {
    const payload = {
      ok: false,
      code: 'INVALID_LLM_RESPONSE' as const,
      rawResponse: 'not valid validation json',
      durationMs: 18,
    };
    const response = makeFetchSuccess(payload);
    const { runValidationStageRemote } = loadClient();

    const result = await runValidationStageRemote(
      makeWorkflow() as any,
      'node catalog text',
      'Validate the workflow',
    );

    expect(result).toEqual(payload);
    expect(response.json).toHaveBeenCalledTimes(1);
  });

  it('returns null and skips JSON parsing when ai-generator responds with non-OK status', async () => {
    const response = makeFetchNotOk(503);
    const { runValidationStageRemote } = loadClient();

    const result = await runValidationStageRemote(
      makeWorkflow() as any,
      'node catalog text',
      'Validate the workflow',
    );

    expect(result).toBeNull();
    expect(response.json).not.toHaveBeenCalled();
    expect(consoleWarnSpy).toHaveBeenCalledWith('[validation-stage-client] ai-generator returned 503 - falling back to local');
  });
});
