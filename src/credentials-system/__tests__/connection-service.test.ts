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

  it('marks expired active connections before listing', async () => {
    queryAsService
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: 'conn-1',
          user_id: 'user-1',
          name: 'Expired OAuth',
          credential_type_id: 'google_oauth2',
          provider: 'google',
          auth_type: 'oauth2',
          status: 'expired',
          metadata: {},
          expires_at: new Date(Date.now() - 1000).toISOString(),
          last_tested_at: null,
          last_used_at: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ]);

    const result = await new ConnectionService().listConnections('user-1');

    expect(queryAsService.mock.calls[0][0]).toContain("SET status = 'expired'");
    expect(result[0].status).toBe('expired');
  });

  it('rejects duplicate live connections for the same credential type', async () => {
    queryAsService.mockResolvedValueOnce([
      {
        id: 'conn-1',
        user_id: 'user-1',
        name: 'Google OAuth',
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
    ]);

    await expect(new ConnectionService().createConnection({
      userId: 'user-1',
      name: 'Another Google',
      credentialTypeId: 'google_oauth2',
      credentials: {},
    })).rejects.toMatchObject({
      statusCode: 409,
      code: 'CONNECTION_ALREADY_EXISTS',
    });
  });

  it('soft revokes deleted connections', async () => {
    queryAsService.mockResolvedValue([]);

    await new ConnectionService().deleteConnection('user-1', 'conn-1');

    expect(queryAsService.mock.calls[0][0]).toContain("SET status = 'revoked'");
    expect(queryAsService.mock.calls[0][0]).toContain('revoked_at');
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
