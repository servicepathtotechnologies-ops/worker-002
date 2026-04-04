import { LRUNodeOutputsCache } from '../../cache/lru-node-outputs-cache';
import { executeLogOutputWithCache } from '../nodes/log-output-executor';

describe('executeLogOutputWithCache', () => {
  it('resolves message from upstream and returns string', () => {
    const cache = new LRUNodeOutputsCache(10, false);
    cache.set('input', { hello: 'world' }, true);
    const out = executeLogOutputWithCache(
      { message: 'Hello {{input.hello}}', level: 'info' },
      {},
      cache
    );
    expect(out).toContain('world');
  });
});
