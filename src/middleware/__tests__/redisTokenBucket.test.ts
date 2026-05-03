import { clientIp } from '../redisTokenBucket';

describe('redisTokenBucket', () => {
  it('prefers the first forwarded IP behind a proxy', () => {
    const req = {
      headers: { 'x-forwarded-for': '203.0.113.10, 10.0.0.2' },
      ip: '127.0.0.1',
      socket: {},
    } as any;
    expect(clientIp(req)).toBe('203.0.113.10');
  });

  it('falls back to Express request IP', () => {
    const req = { headers: {}, ip: '127.0.0.1', socket: {} } as any;
    expect(clientIp(req)).toBe('127.0.0.1');
  });
});
