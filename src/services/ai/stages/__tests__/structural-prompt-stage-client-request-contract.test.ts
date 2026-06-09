import type { StructuredIntent } from '../intent-stage';
import type { StructuralPromptConstraints } from '../structural-prompt-stage';

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
    mod = require('../structural-prompt-stage-client');
  });
  return mod as typeof import('../structural-prompt-stage-client');
}

function makeIntent(overrides: Partial<StructuredIntent> = {}): StructuredIntent {
  return {
    intent: 'route new leads by priority',
    triggerType: 'webhook',
    actions: ['classify the lead', 'send high priority leads to Slack'],
    dataFlows: [
      { from: 'webhook_trigger', to: 'if_else', dataDescription: 'lead priority' },
    ],
    constraints: [],
    originalPrompt: 'route new leads by priority',
    ...overrides,
  };
}

function parseRequestBody() {
  const [, init] = (global.fetch as jest.Mock).mock.calls[0];
  return JSON.parse(init.body as string);
}

describe('structural-prompt-stage-client request contract', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.AI_GENERATOR_URL = MOCK_URL;
    delete process.env.AI_GENERATOR_SERVICE_KEY;
    global.fetch = makeFetchSuccess({
      ok: true,
      structuralPrompt: 'Generated workflow blueprint',
      durationMs: 12,
      llmCall: { model: 'gemini-3.5-flash', temperature: 0.2, promptTokens: 10, completionTokens: 20 },
    }) as any;
  });

  afterEach(() => {
    delete process.env.AI_GENERATOR_URL;
    delete process.env.AI_GENERATOR_SERVICE_KEY;
  });

  it('serializes selected node constraints as selectedCapabilities', async () => {
    const intent = makeIntent();
    const constraints: StructuralPromptConstraints = {
      selectedNodeConstraintsByStep: {
        'step-1': ['webhook_trigger'],
        'step-2': ['if_else', 'slack'],
      },
      selectedNodeConstraintsFlat: ['webhook_trigger', 'if_else', 'slack'],
    };
    const { runStructuralPromptStageRemote } = loadClient();

    await runStructuralPromptStageRemote(intent, 'node catalog text', 'corr-104', constraints);

    expect(parseRequestBody()).toEqual({
      intent,
      catalog: 'node catalog text',
      correlationId: 'corr-104',
      selectedCapabilities: constraints,
    });
  });

  it('omits selectedCapabilities when constraints are not provided', async () => {
    const { runStructuralPromptStageRemote } = loadClient();

    await runStructuralPromptStageRemote(makeIntent(), 'node catalog text', 'corr-no-constraints');

    const body = parseRequestBody();
    expect(body).toMatchObject({
      catalog: 'node catalog text',
      correlationId: 'corr-no-constraints',
    });
    expect(body).not.toHaveProperty('selectedCapabilities');
  });

  it('includes the service key header for structural prompt remote calls', async () => {
    process.env.AI_GENERATOR_SERVICE_KEY = 'struct-secret';
    const { runStructuralPromptStageRemote } = loadClient();

    await runStructuralPromptStageRemote(makeIntent(), 'node catalog text');

    const [, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(init.headers).toMatchObject({
      'Content-Type': 'application/json',
      'x-service-key': 'struct-secret',
    });
  });
});
