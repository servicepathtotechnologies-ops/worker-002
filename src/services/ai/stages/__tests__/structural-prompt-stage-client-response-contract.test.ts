const MOCK_URL = 'http://ai-generator:8080';

jest.mock('../intent-stage', () => ({}));
jest.mock('../structural-prompt-stage', () => ({}));

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
    mod = require('../structural-prompt-stage-client');
  });
  return mod as typeof import('../structural-prompt-stage-client');
}

function makeIntent() {
  return {
    intent: 'route new leads by priority',
    triggerType: 'webhook' as const,
    actions: ['classify the lead', 'send high priority leads to Slack'],
    dataFlows: [
      { from: 'webhook_trigger', to: 'if_else', dataDescription: 'lead priority' },
    ],
    constraints: [],
    originalPrompt: 'route new leads by priority',
  };
}

describe('structural-prompt-stage-client response contract', () => {
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

  it('returns parsed structural prompt success payloads unchanged', async () => {
    const payload = {
      ok: true,
      structuralPrompt:
        'WORKFLOW: Route leads by priority.\n\nTRIGGER: Webhook - receives lead records.\n\nFLOW:\n1. If/Else - checks lead priority\n  -> Case "high": Slack - posts the lead to sales\n\nCONNECTIONS: Webhook passes priority to If/Else, then high priority leads go to Slack.',
      durationMs: 31,
      llmCall: {
        model: 'gemini-3.5-flash',
        temperature: 0.2,
        promptTokens: 144,
        completionTokens: 62,
      },
    };
    const response = makeFetchSuccess(payload);
    const { runStructuralPromptStageRemote } = loadClient();

    const result = await runStructuralPromptStageRemote(
      makeIntent(),
      'node catalog text',
      'corr-128',
    );

    expect(result).toEqual(payload);
    expect(response.json).toHaveBeenCalledTimes(1);
  });

  it('returns parsed INVALID_LLM_RESPONSE payloads unchanged', async () => {
    const payload = {
      ok: false,
      code: 'INVALID_LLM_RESPONSE' as const,
      rawResponse: 'not valid structural prompt output',
      durationMs: 17,
    };
    const response = makeFetchSuccess(payload);
    const { runStructuralPromptStageRemote } = loadClient();

    const result = await runStructuralPromptStageRemote(
      makeIntent(),
      'node catalog text',
    );

    expect(result).toEqual(payload);
    expect(response.json).toHaveBeenCalledTimes(1);
  });

  it('returns null and skips JSON parsing when ai-generator responds with non-OK status', async () => {
    const response = makeFetchNotOk(502);
    const { runStructuralPromptStageRemote } = loadClient();

    const result = await runStructuralPromptStageRemote(
      makeIntent(),
      'node catalog text',
    );

    expect(result).toBeNull();
    expect(response.json).not.toHaveBeenCalled();
    expect(consoleWarnSpy).toHaveBeenCalledWith('[structural-prompt-stage-client] ai-generator returned 502 - falling back to local');
  });
});
