import { ConnectionService } from '../connection-service';

jest.mock('../../core/database/db-pool', () => ({
  queryAsService: jest.fn(),
}));

const { queryAsService } = jest.requireMock('../../core/database/db-pool') as {
  queryAsService: jest.Mock;
};

describe('ConnectionService', () => {
  beforeEach(() => {
    queryAsService.mockReset();
  });

  it('deletes expired connections and excludes them from the returned list', async () => {
    // Call 1: SELECT expired rows — returns one expired connection id
    queryAsService.mockResolvedValueOnce([{ id: 'conn-1' }]);
    // Call 2: deleteConnection — SELECT provider
    queryAsService.mockResolvedValueOnce([{ provider: 'google' }]);
    // Remaining calls: cascade DELETEs + audit + final SELECT — all return empty
    queryAsService.mockResolvedValue([]);

    const result = await new ConnectionService().listConnections('user-1');

    // First query must SELECT expired rows (not UPDATE them)
    const firstQuery: string = queryAsService.mock.calls[0][0];
    expect(firstQuery).not.toContain('SET status');
    expect(firstQuery).toContain("status = 'expired'");
    // The cascade DELETE must have been called
    const deleteCall = queryAsService.mock.calls.find(
      (c: string[]) => c[0].includes('DELETE FROM connections'),
    );
    expect(deleteCall).toBeDefined();
    // Expired connection must NOT appear in the final list
    expect(result).toHaveLength(0);
  });

  it('allows multiple live connections for the same credential type', async () => {
    queryAsService
      .mockResolvedValueOnce([
      {
        id: 'conn-2',
        user_id: 'user-1',
        name: 'Another Google',
        credential_type_id: 'google_oauth2',
        provider: 'google',
        auth_type: 'oauth2',
        status: 'active',
        metadata: {},
        expires_at: null,
        last_tested_at: null,
        last_used_at: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ])
      .mockResolvedValueOnce([]);

    const result = await new ConnectionService().createConnection({
      userId: 'user-1',
      name: 'Another Google',
      credentialTypeId: 'google_oauth2',
      credentials: { accessToken: 'token-2' },
    });

    expect(result.id).toBe('conn-2');
    expect(queryAsService.mock.calls[0][0]).toContain('INSERT INTO connections');
  });

  it('deletes connections and cleans up legacy provider credentials', async () => {
    queryAsService.mockResolvedValue([]);

    await new ConnectionService().deleteConnection('user-1', 'conn-1');

    expect(queryAsService.mock.calls[1][0]).toContain('DELETE FROM connections');
  });

  it('rejects revoked connections during credential lookup', async () => {
    queryAsService.mockResolvedValueOnce([
      {
        id: 'conn-1',
        user_id: 'user-1',
        name: 'Old Google',
        credential_type_id: 'google_oauth2',
        provider: 'google',
        auth_type: 'oauth2',
        encrypted_credentials: '{}',
        status: 'revoked',
        metadata: {},
        expires_at: null,
        revoked_at: new Date().toISOString(),
        replaced_by_connection_id: null,
        external_account_id: null,
        external_account_email: null,
        last_tested_at: null,
        last_used_at: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ]);

    await expect(new ConnectionService().getDecryptedConnection('user-1', 'conn-1')).rejects.toMatchObject({
      statusCode: 410,
      code: 'CONNECTION_REVOKED',
    });
  });
});
