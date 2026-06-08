import {
  getSerializableIntentSnapshot,
  safeJsonStringify,
} from '../safe-json-stringify';

describe('safeJsonStringify', () => {
  it('matches JSON.stringify for normal serializable values', () => {
    const value = {
      message: 'Workflow ready',
      nested: { retries: 2, enabled: true },
    };

    expect(safeJsonStringify(value)).toBe(JSON.stringify(value));
    expect(safeJsonStringify(value, 2)).toBe(JSON.stringify(value, null, 2));
  });

  it('replaces circular references with a readable marker', () => {
    const value: Record<string, any> = { id: 'root' };
    value.self = value;

    expect(JSON.parse(safeJsonStringify(value))).toEqual({
      id: 'root',
      self: '[Circular Reference]',
    });
  });

  it('masks internal metadata on the circular-safe stringify path', () => {
    const value: Record<string, any> = {
      visible: 'kept',
      _aiSpecifiedNodesContext: { nodeIds: ['gmail'] },
      __metadata: { source: 'agent' },
      __internal: { debug: true },
    };
    value.self = value;

    expect(JSON.parse(safeJsonStringify(value))).toEqual({
      visible: 'kept',
      _aiSpecifiedNodesContext: '[Metadata]',
      __metadata: '[Metadata]',
      __internal: '[Metadata]',
      self: '[Circular Reference]',
    });
  });

  it('wraps non-circular stringify errors', () => {
    const result = safeJsonStringify({ count: BigInt(1) });

    expect(result).toMatch(/^\[JSON Stringify Error: .+\]$/);
    expect(result).toContain('BigInt');
  });
});

describe('getSerializableIntentSnapshot', () => {
  it('copies public intent arrays and excludes private metadata', () => {
    const actions = [{ type: 'send_email' }];
    const intent = {
      trigger: 'webhook',
      trigger_config: { path: '/lead' },
      actions,
      dataSources: [{ type: 'crm' }],
      transformations: [{ type: 'map_fields' }],
      conditions: [{ field: 'status', operator: 'equals', value: 'new' }],
      requires_credentials: ['gmail_oauth'],
      _aiSpecifiedNodesContext: { nodeIds: ['gmail'] },
      __metadata: { source: 'agent' },
    };

    const snapshot = getSerializableIntentSnapshot(intent);
    actions.push({ type: 'append_sheet' });

    expect(snapshot).toEqual({
      trigger: 'webhook',
      trigger_config: { path: '/lead' },
      actions: [{ type: 'send_email' }],
      dataSources: [{ type: 'crm' }],
      transformations: [{ type: 'map_fields' }],
      conditions: [{ field: 'status', operator: 'equals', value: 'new' }],
      requires_credentials: ['gmail_oauth'],
    });
    expect(snapshot).not.toHaveProperty('_aiSpecifiedNodesContext');
    expect(snapshot).not.toHaveProperty('__metadata');
  });

  it('defaults missing intent arrays to empty arrays', () => {
    expect(getSerializableIntentSnapshot({ trigger: 'manual' })).toEqual({
      trigger: 'manual',
      trigger_config: undefined,
      actions: [],
      dataSources: [],
      transformations: [],
      conditions: undefined,
      requires_credentials: [],
    });
  });
});
