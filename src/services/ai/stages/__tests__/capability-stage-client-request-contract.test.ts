const MOCK_URL = 'http://ai-generator:8080';

jest.mock('../capability-selection-stage', () => ({}));

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
    mod = require('../capability-stage-client');
  });
  return mod as typeof import('../capability-stage-client');
}

function parseRequestBody() {
  const [, init] = (global.fetch as jest.Mock).mock.calls[0];
  return JSON.parse(init.body as string);
}

describe('capability-stage-client request contract', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.AI_GENERATOR_URL = MOCK_URL;
    delete process.env.AI_GENERATOR_SERVICE_KEY;
    global.fetch = makeFetchSuccess({
      ok: true,
      steps: [
        {
          nodeId: 'gmail-send-1',
          type: 'google_gmail',
          capabilityId: 'gmail.send_email',
          reason: 'Sends the summary email',
        },
      ],
      durationMs: 12,
      llmCall: { model: 'gemini-3.5-flash', temperature: 0.1, promptTokens: 10, completionTokens: 20 },
    }) as any;
  });

  afterEach(() => {
    delete process.env.AI_GENERATOR_URL;
    delete process.env.AI_GENERATOR_SERVICE_KEY;
  });

  it('serializes capability-selection prompt fields in the remote request body', async () => {
    const { runCapabilitySelectionJsonRemote } = loadClient();

    await runCapabilitySelectionJsonRemote({
      systemPrompt: 'capability selection system prompt',
      message: 'SELECT_CAPABILITIES:\n{"nodeIds":["gmail-send-1"]}',
      correlationId: 'corr-110',
    });

    const [url, init] = (global.fetch as jest.Mock).mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${MOCK_URL}/generate/capability-selection-json`);
    expect(init.method).toBe('POST');
    expect(parseRequestBody()).toEqual({
      systemPrompt: 'capability selection system prompt',
      message: 'SELECT_CAPABILITIES:\n{"nodeIds":["gmail-send-1"]}',
      correlationId: 'corr-110',
    });
  });

  it('omits optional correlation ID when only the base capability-selection request is provided', async () => {
    const { runCapabilitySelectionJsonRemote } = loadClient();

    await runCapabilitySelectionJsonRemote({
      systemPrompt: 'capability selection system prompt',
      message: 'select capabilities for selected workflow nodes',
    });

    const body = parseRequestBody();
    expect(body).toEqual({
      systemPrompt: 'capability selection system prompt',
      message: 'select capabilities for selected workflow nodes',
    });
    expect(body).not.toHaveProperty('correlationId');
  });

  it('includes the service key header for capability selection remote calls', async () => {
    process.env.AI_GENERATOR_SERVICE_KEY = 'capability-selection-secret';
    const { runCapabilitySelectionJsonRemote } = loadClient();

    await runCapabilitySelectionJsonRemote({
      systemPrompt: 'capability selection system prompt',
      message: 'select capabilities',
    });

    const [, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(init.headers).toMatchObject({
      'Content-Type': 'application/json',
      'x-service-key': 'capability-selection-secret',
    });
  });
});
