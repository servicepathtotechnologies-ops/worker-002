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
});
