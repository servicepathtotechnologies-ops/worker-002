import { AuthInjectionEngine } from '../execution-auth';
import type { DecryptedConnection } from '../types';

const baseConnection: DecryptedConnection = {
  id: 'conn-1',
  userId: 'user-1',
  name: 'Test Token',
  credentialTypeId: 'bearer_token',
  provider: 'generic',
  authType: 'bearer_token',
  status: 'active',
  metadata: {},
  expiresAt: null,
  lastTestedAt: null,
  lastUsedAt: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  credentials: { token: 'abc123' },
};

describe('AuthInjectionEngine', () => {
  it('injects bearer token credentials into request headers', async () => {
    const marks: string[] = [];
    const engine = new AuthInjectionEngine({
      getDecryptedConnection: jest.fn().mockResolvedValue(baseConnection),
      markUsed: jest.fn().mockImplementation(async (_userId: string, id: string) => {
        marks.push(id);
      }),
    } as any);

    const request = await engine.injectIntoRequest(
      { userId: 'user-1', nodeId: 'n1', nodeType: 'http_request', connectionId: 'conn-1' },
      { method: 'GET', url: 'https://api.example.test/items', headers: { Accept: 'application/json' } },
    );

    expect(request.headers).toMatchObject({
      Accept: 'application/json',
      Authorization: 'Bearer abc123',
    });
    expect(marks).toEqual(['conn-1']);
  });

  it('injects query auth into URL search params', async () => {
    const engine = new AuthInjectionEngine({
      getDecryptedConnection: jest.fn().mockResolvedValue({
        ...baseConnection,
        credentialTypeId: 'query_auth',
        authType: 'query_auth',
        credentials: { queryName: 'api_key', queryValue: 'xyz' },
      }),
      markUsed: jest.fn(),
    } as any);

    const request = await engine.injectIntoRequest(
      { userId: 'user-1', nodeId: 'n1', nodeType: 'http_request', connectionId: 'conn-1' },
      { method: 'GET', url: 'https://api.example.test/items?existing=1' },
    );

    expect(request.url).toBe('https://api.example.test/items?existing=1&api_key=xyz');
  });
});
