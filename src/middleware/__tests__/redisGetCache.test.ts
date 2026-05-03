import { buildCacheKey } from '../redisGetCache';

describe('redisGetCache', () => {
  it('builds stable route-prefixed keys', () => {
    const req = {
      path: '/api/templates',
      params: {},
      query: { limit: '10' },
      body: undefined,
      headers: {},
    } as any;
    expect(buildCacheKey(req)).toMatch(/^\/api\/templates:[a-f0-9]{64}$/);
    expect(buildCacheKey(req)).toBe(buildCacheKey(req));
  });

  it('varies keys by authorization hash to avoid cross-user cache leakage', () => {
    const base = {
      path: '/api/db/workflows',
      params: {},
      query: {},
      body: undefined,
    };
    const first = buildCacheKey({ ...base, headers: { authorization: 'Bearer first' } } as any);
    const second = buildCacheKey({ ...base, headers: { authorization: 'Bearer second' } } as any);
    expect(first).not.toBe(second);
  });
});
