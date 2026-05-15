import { LRUNodeOutputsCache } from '../../cache/lru-node-outputs-cache';
import { executeNodeDynamically } from '../dynamic-node-executor';
import { executeLogOutputWithCache } from '../nodes/log-output-executor';

describe('executeLogOutputWithCache', () => {
  it('resolves message from upstream and returns string', () => {
    const cache = new LRUNodeOutputsCache(10, false);
    cache.set('input', { hello: 'world' }, true);
    const out = executeLogOutputWithCache(
      { message: 'Hello {{input.hello}}', level: 'info' },
      { hello: 'world' },
      cache
    );
    expect(out).toContain('world');
  });

  it('keeps $json bound to upstream payload during dynamic node execution', async () => {
    const cache = new LRUNodeOutputsCache(10, false);
    const upstream = {
      count: 10,
      resultSizeEstimate: 201,
      messages: [{ id: 'msg-1', threadId: 'thread-1' }],
    };
    cache.set('gmail-list', upstream, true);

    const out = await executeNodeDynamically({
      node: {
        id: 'log-1',
        type: 'custom',
        position: { x: 0, y: 0 },
        data: {
          type: 'log_output',
          label: 'Log: List Result',
          category: 'output',
          config: {
            level: 'info',
            message: 'Count={{count}} Json={{$json.count}} First={{$json.messages.0.id}}',
          },
        },
      },
      input: upstream,
      nodeOutputs: cache,
      db: {} as any,
      workflowId: 'workflow-1',
    });

    expect(out).toBe('Count=10 Json=10 First=msg-1');
  });

  it('resolves single-object array outputs like root objects', async () => {
    const cache = new LRUNodeOutputsCache(10, false);
    const upstream = [{ updatedRange: 'Test!A4', updatedRows: 1 }];
    cache.set('sheets-append', upstream, true);

    const out = await executeNodeDynamically({
      node: {
        id: 'log-1',
        type: 'custom',
        position: { x: 0, y: 0 },
        data: {
          type: 'log_output',
          label: 'Log: Append Result',
          category: 'output',
          config: {
            level: 'info',
            message: 'Range={{updatedRange}} Rows={{$json.updatedRows}}',
          },
        },
      },
      input: upstream,
      nodeOutputs: cache,
      db: {} as any,
      workflowId: 'workflow-1',
    });

    expect(out).toBe('Range=Test!A4 Rows=1');
  });
});
