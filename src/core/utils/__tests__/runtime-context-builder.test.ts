import {
  buildNodeRuntimeContext,
  extractNodeInputs,
  extractNodeCredentials,
  BuildContextOptions,
} from '../runtime-context-builder';
import type { WorkflowNode } from '../../types/ai-types';

function makeNode(overrides: Partial<WorkflowNode> = {}): WorkflowNode {
  return {
    id: 'node-1',
    type: 'http_request',
    data: {
      label: 'HTTP Node',
      type: 'http_request',
      category: 'data',
      config: {},
    },
    position: { x: 0, y: 0 },
    ...overrides,
  } as WorkflowNode;
}

function makeOptions(overrides: Partial<BuildContextOptions> = {}): BuildContextOptions {
  return {
    node: makeNode(),
    nodeInputs: { url: 'https://example.com' },
    nodeCredentials: { token: 'abc' },
    secrets: { SECRET_KEY: 'xyz' },
    env: { MY_ENV: 'val' },
    runId: 'run-1',
    workflowId: 'wf-1',
    executionId: 'exec-1',
    userId: 'user-1',
    ...overrides,
  };
}

describe('buildNodeRuntimeContext', () => {
  it('populates all expected top-level fields', () => {
    const ctx = buildNodeRuntimeContext(makeOptions());
    expect(ctx.nodeId).toBe('node-1');
    expect(ctx.nodeType).toBe('http_request');
    expect(ctx.runId).toBe('run-1');
    expect(ctx.workflowId).toBe('wf-1');
    expect(ctx.executionId).toBe('exec-1');
    expect(ctx.userId).toBe('user-1');
    expect(ctx.inputs).toEqual({ url: 'https://example.com' });
    expect(ctx.credentials).toEqual({ token: 'abc' });
    expect(ctx.secrets).toEqual({ SECRET_KEY: 'xyz' });
  });

  it('falls back to node.data.type when node.type is absent', () => {
    const node = makeNode({ type: '' });
    (node.data as any).type = 'gmail';
    const ctx = buildNodeRuntimeContext(makeOptions({ node }));
    expect(ctx.nodeType).toBe('gmail');
  });

  it("falls back to 'custom' when both type sources are absent", () => {
    const node = makeNode({ type: '' });
    (node.data as any).type = '';
    const ctx = buildNodeRuntimeContext(makeOptions({ node }));
    expect(ctx.nodeType).toBe('custom');
  });

  it("uses data.label as nodeLabel, falls back to nodeType when absent", () => {
    const nodeWithLabel = makeNode();
    const ctxWithLabel = buildNodeRuntimeContext(makeOptions({ node: nodeWithLabel }));
    expect(ctxWithLabel.metadata.nodeLabel).toBe('HTTP Node');

    const nodeNoLabel = makeNode();
    delete (nodeNoLabel.data as any).label;
    const ctxNoLabel = buildNodeRuntimeContext(makeOptions({ node: nodeNoLabel }));
    expect(ctxNoLabel.metadata.nodeLabel).toBe('http_request');
  });

  it("defaults nodeCategory to 'general' when absent", () => {
    const node = makeNode();
    delete (node.data as any).category;
    const ctx = buildNodeRuntimeContext(makeOptions({ node }));
    expect(ctx.metadata.nodeCategory).toBe('general');
  });

  it('inputs, credentials, and secrets are defensive copies', () => {
    const nodeInputs = { url: 'https://example.com' };
    const nodeCredentials = { token: 'abc' };
    const secrets = { S: '1' };
    const ctx = buildNodeRuntimeContext(makeOptions({ nodeInputs, nodeCredentials, secrets }));

    ctx.inputs.url = 'CHANGED';
    ctx.credentials.token = 'CHANGED';
    ctx.secrets.S = 'CHANGED';

    expect(nodeInputs.url).toBe('https://example.com');
    expect(nodeCredentials.token).toBe('abc');
    expect(secrets.S).toBe('1');
  });

  it('secrets defaults to empty object when not provided', () => {
    const opts = makeOptions();
    delete (opts as any).secrets;
    const ctx = buildNodeRuntimeContext(opts);
    expect(ctx.secrets).toEqual({});
  });

  it('metadata.timestamp is a valid ISO date string', () => {
    const ctx = buildNodeRuntimeContext(makeOptions());
    expect(() => new Date(ctx.metadata.timestamp)).not.toThrow();
    expect(new Date(ctx.metadata.timestamp).toISOString()).toBe(ctx.metadata.timestamp);
  });
});

describe('extractNodeInputs', () => {
  it('returns regular config fields unchanged', () => {
    const node = makeNode();
    (node.data as any).config = { url: 'https://x.com', method: 'GET', timeout: 5000 };
    expect(extractNodeInputs(node)).toEqual({ url: 'https://x.com', method: 'GET', timeout: 5000 });
  });

  it('skips fields containing credential keywords', () => {
    const node = makeNode();
    (node.data as any).config = {
      url: 'https://x.com',
      oauth_token: 'tok',
      client_id: 'cid',
      client_secret: 'csec',
      access_token: 'at',
      api_key: 'key',
      password: 'pw',
      secret: 'sec',
    };
    const inputs = extractNodeInputs(node);
    expect(inputs).toEqual({ url: 'https://x.com' });
    expect(inputs).not.toHaveProperty('oauth_token');
    expect(inputs).not.toHaveProperty('api_key');
    expect(inputs).not.toHaveProperty('password');
  });

  it('returns empty object for empty config', () => {
    const node = makeNode();
    (node.data as any).config = {};
    expect(extractNodeInputs(node)).toEqual({});
  });
});

describe('extractNodeCredentials', () => {
  it('extracts credential-keyword fields from config', () => {
    const node = makeNode();
    (node.data as any).config = {
      url: 'https://x.com',
      api_key: 'k1',
      access_token: 'at1',
      webhookurl: 'https://hook.com',
    };
    const creds = extractNodeCredentials(node);
    expect(creds).toHaveProperty('api_key', 'k1');
    expect(creds).toHaveProperty('access_token', 'at1');
    expect(creds).toHaveProperty('webhookurl', 'https://hook.com');
    expect(creds).not.toHaveProperty('url');
  });

  it('extracts credential fields from data.input when absent from config', () => {
    const node = makeNode();
    (node.data as any).config = {};
    (node.data as any).input = { apikey: 'from-input' };
    const creds = extractNodeCredentials(node);
    expect(creds).toHaveProperty('apikey', 'from-input');
  });

  it('config takes precedence over data.input for same credential key', () => {
    const node = makeNode();
    (node.data as any).config = { apikey: 'from-config' };
    (node.data as any).input = { apikey: 'from-input' };
    const creds = extractNodeCredentials(node);
    expect(creds.apikey).toBe('from-config');
  });
});
