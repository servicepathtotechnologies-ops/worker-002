const consoleSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

const MOCK_URL = 'http://ai-generator:8080';

function makeFetchSuccess(data: unknown) {
  return jest.fn().mockResolvedValue({ ok: true, status: 200, json: jest.fn().mockResolvedValue(data) });
}

function makeFetchNotOk(status = 500) {
  return jest.fn().mockResolvedValue({ ok: false, status, json: jest.fn() });
}

function makeFetchThrow(err: Error) {
  return jest.fn().mockRejectedValue(err);
}

/** Load a stage-client module in an isolated registry. url=undefined → env var deleted. */
function loadClient<T = any>(relPath: string, url?: string): T {
  let mod: any;
  jest.isolateModules(() => {
    if (url !== undefined) {
      process.env.AI_GENERATOR_URL = url;
    } else {
      delete process.env.AI_GENERATOR_URL;
    }
    mod = require(relPath);
  });
  return mod as T;
}

afterEach(() => {
  delete process.env.AI_GENERATOR_URL;
  delete process.env.AI_GENERATOR_SERVICE_KEY;
});

afterAll(() => {
  consoleSpy.mockRestore();
});

// ─── intent-stage-client ──────────────────────────────────────────────────────

describe('intent-stage-client', () => {
  const PATH = '../intent-stage-client';

  it('returns null when AI_GENERATOR_URL is not set', async () => {
    const { runIntentStageRemote } = loadClient(PATH);
    expect(await runIntentStageRemote('prompt', '[]')).toBeNull();
  });

  it('returns null when HTTP response is not ok', async () => {
    global.fetch = makeFetchNotOk(503) as any;
    const { runIntentStageRemote } = loadClient(PATH, MOCK_URL);
    expect(await runIntentStageRemote('prompt', '[]', 'c1')).toBeNull();
  });

  it('returns null when fetch throws', async () => {
    global.fetch = makeFetchThrow(new Error('network')) as any;
    const { runIntentStageRemote } = loadClient(PATH, MOCK_URL);
    expect(await runIntentStageRemote('prompt', '[]')).toBeNull();
  });

  it('returns parsed JSON on success and hits /generate/intent', async () => {
    const expected = { ok: true, intent: { intent: 'test' } };
    global.fetch = makeFetchSuccess(expected) as any;
    const { runIntentStageRemote } = loadClient(PATH, MOCK_URL);
    const result = await runIntentStageRemote('prompt', '[]', 'corr');
    expect(result).toEqual(expected);
    expect((global.fetch as jest.Mock).mock.calls[0][0]).toBe(`${MOCK_URL}/generate/intent`);
    expect((global.fetch as jest.Mock).mock.calls[0][1]).toMatchObject({ method: 'POST' });
  });
});

// ─── node-selection-stage-client ─────────────────────────────────────────────

describe('node-selection-stage-client', () => {
  const PATH = '../node-selection-stage-client';

  it('returns null when AI_GENERATOR_URL is not set', async () => {
    const { runNodeSelectionJsonRemote } = loadClient(PATH);
    expect(await runNodeSelectionJsonRemote({ systemPrompt: 'sp', message: 'm' })).toBeNull();
  });

  it('returns null when HTTP response is not ok', async () => {
    global.fetch = makeFetchNotOk(500) as any;
    const { runNodeSelectionJsonRemote } = loadClient(PATH, MOCK_URL);
    expect(await runNodeSelectionJsonRemote({ systemPrompt: 'sp', message: 'm' })).toBeNull();
  });

  it('returns parsed JSON on success and hits /generate/node-selection-json', async () => {
    const expected = { ok: true, selectedNodes: [] };
    global.fetch = makeFetchSuccess(expected) as any;
    const { runNodeSelectionJsonRemote } = loadClient(PATH, MOCK_URL);
    const result = await runNodeSelectionJsonRemote({ systemPrompt: 'sp', message: 'm', correlationId: 'c1' });
    expect(result).toEqual(expected);
    expect((global.fetch as jest.Mock).mock.calls[0][0]).toBe(`${MOCK_URL}/generate/node-selection-json`);
  });
});

// ─── capability-stage-client ──────────────────────────────────────────────────

describe('capability-stage-client', () => {
  const PATH = '../capability-stage-client';

  it('returns null when AI_GENERATOR_URL is not set', async () => {
    const { runCapabilitySelectionJsonRemote } = loadClient(PATH);
    expect(await runCapabilitySelectionJsonRemote({ systemPrompt: 'sp', message: 'm' })).toBeNull();
  });

  it('returns null when fetch throws', async () => {
    global.fetch = makeFetchThrow(new Error('timeout')) as any;
    const { runCapabilitySelectionJsonRemote } = loadClient(PATH, MOCK_URL);
    expect(await runCapabilitySelectionJsonRemote({ systemPrompt: 'sp', message: 'm' })).toBeNull();
  });

  it('returns parsed JSON on success and hits /generate/capability-selection-json', async () => {
    const expected = { ok: true, steps: [] };
    global.fetch = makeFetchSuccess(expected) as any;
    const { runCapabilitySelectionJsonRemote } = loadClient(PATH, MOCK_URL);
    const result = await runCapabilitySelectionJsonRemote({ systemPrompt: 'sp', message: 'm' });
    expect(result).toEqual(expected);
    expect((global.fetch as jest.Mock).mock.calls[0][0]).toBe(`${MOCK_URL}/generate/capability-selection-json`);
  });
});

// ─── validation-stage-client ──────────────────────────────────────────────────

describe('validation-stage-client', () => {
  const PATH = '../validation-stage-client';

  it('returns null when AI_GENERATOR_URL is not set', async () => {
    const { runValidationStageRemote } = loadClient(PATH);
    const w = { nodes: [], edges: [] } as any;
    expect(await runValidationStageRemote(w, '[]', 'intent')).toBeNull();
  });

  it('returns parsed JSON on success and hits /generate/validation', async () => {
    const expected = { ok: true, issues: [] };
    global.fetch = makeFetchSuccess(expected) as any;
    const { runValidationStageRemote } = loadClient(PATH, MOCK_URL);
    const w = { nodes: [], edges: [] } as any;
    const result = await runValidationStageRemote(w, '[]', 'intent', [], [], 'c1');
    expect(result).toEqual(expected);
    expect((global.fetch as jest.Mock).mock.calls[0][0]).toBe(`${MOCK_URL}/generate/validation`);
  });
});

// ─── structural-prompt-stage-client ──────────────────────────────────────────

describe('structural-prompt-stage-client', () => {
  const PATH = '../structural-prompt-stage-client';

  it('returns null when AI_GENERATOR_URL is not set', async () => {
    const { runStructuralPromptStageRemote } = loadClient(PATH);
    expect(await runStructuralPromptStageRemote({} as any, '[]')).toBeNull();
  });

  it('returns parsed JSON on success and hits /generate/structural-prompt', async () => {
    const expected = { structuralPrompt: 'blueprint' };
    global.fetch = makeFetchSuccess(expected) as any;
    const { runStructuralPromptStageRemote } = loadClient(PATH, MOCK_URL);
    const result = await runStructuralPromptStageRemote({ intent: 'test' } as any, '[]', 'c1');
    expect(result).toEqual(expected);
    expect((global.fetch as jest.Mock).mock.calls[0][0]).toBe(`${MOCK_URL}/generate/structural-prompt`);
  });
});

// ─── property-population-stage-client ────────────────────────────────────────

describe('property-population-stage-client', () => {
  const PATH = '../property-population-stage-client';

  it('returns null when AI_GENERATOR_URL is not set', async () => {
    const { runPropertyPopulationJsonRemote } = loadClient(PATH);
    expect(await runPropertyPopulationJsonRemote({ purpose: 'property_population', systemPrompt: 'sp', message: 'm' })).toBeNull();
  });

  it('returns null when HTTP response is not ok', async () => {
    global.fetch = makeFetchNotOk(422) as any;
    const { runPropertyPopulationJsonRemote } = loadClient(PATH, MOCK_URL);
    expect(await runPropertyPopulationJsonRemote({ purpose: 'property_population', systemPrompt: 'sp', message: 'm' })).toBeNull();
  });

  it('returns parsed JSON on success and hits /generate/property-population', async () => {
    const expected = { ok: true, values: { field1: 'v1' } };
    global.fetch = makeFetchSuccess(expected) as any;
    const { runPropertyPopulationJsonRemote } = loadClient(PATH, MOCK_URL);
    const result = await runPropertyPopulationJsonRemote({ purpose: 'property_population', systemPrompt: 'sp', message: 'm' });
    expect(result).toEqual(expected);
    expect((global.fetch as jest.Mock).mock.calls[0][0]).toBe(`${MOCK_URL}/generate/property-population`);
  });
});

// ─── edge-reasoning-stage-client ─────────────────────────────────────────────

describe('edge-reasoning-stage-client', () => {
  const PATH = '../edge-reasoning-stage-client';

  it('runEdgeReasoningJsonRemote returns null when AI_GENERATOR_URL is not set', async () => {
    const { runEdgeReasoningJsonRemote } = loadClient(PATH);
    expect(await runEdgeReasoningJsonRemote({ systemPrompt: 'sp', message: 'm' })).toBeNull();
  });

  it('runEdgeReasoningJsonRemote returns parsed JSON on success and hits /generate/edge-reasoning-json', async () => {
    const expected = { ok: true, orderedNodes: ['n1'], edges: [] };
    global.fetch = makeFetchSuccess(expected) as any;
    const { runEdgeReasoningJsonRemote } = loadClient(PATH, MOCK_URL);
    const result = await runEdgeReasoningJsonRemote({ systemPrompt: 'sp', message: 'm', correlationId: 'c1' });
    expect(result).toEqual(expected);
    expect((global.fetch as jest.Mock).mock.calls[0][0]).toBe(`${MOCK_URL}/generate/edge-reasoning-json`);
  });

  it('runEdgeReasoningStageRemote returns null when AI_GENERATOR_URL is not set', async () => {
    const { runEdgeReasoningStageRemote } = loadClient(PATH);
    expect(await runEdgeReasoningStageRemote({ selectedNodes: [], catalog: '[]', userIntent: 'intent' })).toBeNull();
  });

  it('runEdgeReasoningStageRemote returns parsed JSON on success and hits /generate/edge-reasoning', async () => {
    const expected = { ok: true, orderedNodeIds: [], edges: [] };
    global.fetch = makeFetchSuccess(expected) as any;
    const { runEdgeReasoningStageRemote } = loadClient(PATH, MOCK_URL);
    const result = await runEdgeReasoningStageRemote({ selectedNodes: [], catalog: '[]', userIntent: 'intent' });
    expect(result).toEqual(expected);
    expect((global.fetch as jest.Mock).mock.calls[0][0]).toBe(`${MOCK_URL}/generate/edge-reasoning`);
  });
});

// ─── Shared: service key and URL normalization ────────────────────────────────

describe('shared client behavior', () => {
  it('includes x-service-key header when AI_GENERATOR_SERVICE_KEY is set', async () => {
    global.fetch = makeFetchSuccess({ ok: true }) as any;
    let mod: any;
    jest.isolateModules(() => {
      process.env.AI_GENERATOR_URL = MOCK_URL;
      process.env.AI_GENERATOR_SERVICE_KEY = 'my-secret';
      mod = require('../intent-stage-client');
    });
    await mod.runIntentStageRemote('p', '[]');
    const [, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(init.headers).toMatchObject({ 'x-service-key': 'my-secret' });
  });

  it('omits x-service-key header when AI_GENERATOR_SERVICE_KEY is absent', async () => {
    global.fetch = makeFetchSuccess({ ok: true }) as any;
    let mod: any;
    jest.isolateModules(() => {
      process.env.AI_GENERATOR_URL = MOCK_URL;
      delete process.env.AI_GENERATOR_SERVICE_KEY;
      mod = require('../intent-stage-client');
    });
    await mod.runIntentStageRemote('p', '[]');
    const [, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(init.headers).not.toHaveProperty('x-service-key');
  });

  it('strips trailing slash from AI_GENERATOR_URL before building endpoint URL', async () => {
    global.fetch = makeFetchSuccess({ ok: true }) as any;
    let mod: any;
    jest.isolateModules(() => {
      process.env.AI_GENERATOR_URL = 'http://ai-generator:8080/';
      mod = require('../intent-stage-client');
    });
    await mod.runIntentStageRemote('p', '[]');
    const [url] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toBe('http://ai-generator:8080/generate/intent');
  });
});
