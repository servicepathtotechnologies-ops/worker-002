// Jest setup imports node definitions broadly, so force this test's DB mock
// to bind before user-id-normalizer is required.
jest.resetModules();

const queryAsService = jest.fn();

jest.doMock('../../core/database/db-pool', () => ({
  queryAsService,
}));

const { CredentialUserIdError } = require('../credential-errors') as typeof import('../credential-errors');
const { isUuid, normalizeCredentialUserId } = require('../user-id-normalizer') as typeof import('../user-id-normalizer');

describe('user-id-normalizer', () => {
  beforeEach(() => {
    queryAsService.mockReset();
  });

  it('detects Postgres-compatible UUID-shaped user IDs', () => {
    expect(isUuid('e1031dfa-7031-703e-0004-80c6c3028371')).toBe(true);
    expect(isUuid('E1031DFA-7031-703E-0004-80C6C3028371')).toBe(true);
    expect(isUuid('not-a-uuid')).toBe(false);
    expect(isUuid(null)).toBe(false);
    expect(isUuid(undefined)).toBe(false);
  });

  it('returns UUID user IDs without querying identity tables', async () => {
    const userId = '11111111-1111-1111-1111-111111111111';

    await expect(normalizeCredentialUserId(userId, 'user@example.com')).resolves.toBe(userId);

    expect(queryAsService).not.toHaveBeenCalled();
  });

  it('resolves linked identity IDs to canonical UUID user IDs', async () => {
    const canonicalUserId = '22222222-2222-2222-2222-222222222222';
    queryAsService.mockResolvedValueOnce([{ canonical_user_id: canonicalUserId }]);

    await expect(normalizeCredentialUserId('cognito-sub-123')).resolves.toBe(canonicalUserId);

    expect(queryAsService).toHaveBeenCalledTimes(1);
    expect(queryAsService.mock.calls[0][0]).toContain('FROM identity_links');
    expect(queryAsService.mock.calls[0][1]).toEqual(['cognito-sub-123']);
  });

  it('falls back to profile email lookup when identity link is missing or invalid', async () => {
    const profileUserId = '33333333-3333-3333-3333-333333333333';
    queryAsService
      .mockResolvedValueOnce([{ canonical_user_id: 'legacy-non-uuid' }])
      .mockResolvedValueOnce([{ user_id: profileUserId }]);

    await expect(normalizeCredentialUserId('external-user', 'User@Example.com')).resolves.toBe(profileUserId);

    expect(queryAsService).toHaveBeenCalledTimes(2);
    expect(queryAsService.mock.calls[1][0]).toContain('FROM profiles');
    expect(queryAsService.mock.calls[1][1]).toEqual(['User@Example.com']);
  });

  it('throws a credential user-id error when no canonical UUID can be found', async () => {
    queryAsService.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

    let thrown: unknown;
    try {
      await normalizeCredentialUserId('external-user', 'missing@example.com');
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(CredentialUserIdError);
    expect((thrown as { toJSON: () => unknown }).toJSON()).toMatchObject({
      error: 'CredentialUserIdError',
      provider: 'identity',
      userId: 'external-user',
      resolverStep: 'normalizeUserId',
    });
  });
});
