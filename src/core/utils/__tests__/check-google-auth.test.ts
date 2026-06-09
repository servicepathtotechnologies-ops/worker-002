import { requireAuthenticatedUser, requireGoogleAuth } from '../check-google-auth';
import { getDbClient } from '../../database/aws-db-client';
import { resolveCanonicalUserId } from '../../database/identity-resolver';

jest.mock('../../database/aws-db-client', () => ({
  getDbClient: jest.fn(),
}));

jest.mock('../../database/identity-resolver', () => ({
  resolveCanonicalUserId: jest.fn(),
}));

jest.mock('../error-codes', () => ({
  ErrorCode: {
    UNAUTHORIZED: 'UNAUTHORIZED',
    GOOGLE_AUTH_REQUIRED: 'GOOGLE_AUTH_REQUIRED',
  },
  createError: jest.fn((code: string, msg: string) => {
    const err = new Error(msg) as Error & { code: string };
    err.code = code;
    return err;
  }),
}));

const getDbClientMock = getDbClient as jest.Mock;
const resolveCanonicalUserIdMock = resolveCanonicalUserId as jest.Mock;

function makeReq(authHeader?: string): any {
  return { headers: { authorization: authHeader } };
}

function makeDb(getUserResult: any, googleResult?: any) {
  const maybeSingle = jest.fn().mockResolvedValue(
    googleResult ?? { data: null, error: null }
  );
  const eq = jest.fn().mockReturnValue({ maybeSingle });
  const select = jest.fn().mockReturnValue({ eq });
  const from = jest.fn().mockReturnValue({ select });
  return {
    auth: { getUser: jest.fn().mockResolvedValue(getUserResult) },
    from,
  };
}

describe('requireAuthenticatedUser', () => {
  beforeEach(() => jest.clearAllMocks());

  it('throws UNAUTHORIZED when no Authorization header is present', async () => {
    getDbClientMock.mockReturnValue(makeDb({ data: { user: null }, error: null }));
    await expect(requireAuthenticatedUser(makeReq())).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('throws UNAUTHORIZED when header does not start with "Bearer "', async () => {
    getDbClientMock.mockReturnValue(makeDb({ data: { user: null }, error: null }));
    await expect(requireAuthenticatedUser(makeReq('Basic abc123'))).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('throws UNAUTHORIZED when token is empty after "Bearer "', async () => {
    getDbClientMock.mockReturnValue(makeDb({ data: { user: null }, error: null }));
    await expect(requireAuthenticatedUser(makeReq('Bearer '))).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('throws UNAUTHORIZED when db.auth.getUser returns an error', async () => {
    getDbClientMock.mockReturnValue(
      makeDb({ data: { user: null }, error: new Error('token expired') })
    );
    await expect(requireAuthenticatedUser(makeReq('Bearer abc'))).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('throws UNAUTHORIZED when db.auth.getUser returns null user', async () => {
    getDbClientMock.mockReturnValue(
      makeDb({ data: { user: null }, error: null })
    );
    await expect(requireAuthenticatedUser(makeReq('Bearer abc'))).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('returns canonical ID when token and user are valid', async () => {
    getDbClientMock.mockReturnValue(
      makeDb({ data: { user: { id: 'user-1', email: 'a@b.com' } }, error: null })
    );
    resolveCanonicalUserIdMock.mockResolvedValue('canonical-99');
    const result = await requireAuthenticatedUser(makeReq('Bearer tok'));
    expect(result).toBe('canonical-99');
    expect(resolveCanonicalUserIdMock).toHaveBeenCalledWith('user-1', 'a@b.com');
  });

  it('passes empty string for email when user object has no email field', async () => {
    getDbClientMock.mockReturnValue(
      makeDb({ data: { user: { id: 'user-2' } }, error: null })
    );
    resolveCanonicalUserIdMock.mockResolvedValue('canonical-99');
    await requireAuthenticatedUser(makeReq('Bearer tok'));
    expect(resolveCanonicalUserIdMock).toHaveBeenCalledWith('user-2', '');
  });

  it('falls back to original userId when resolveCanonicalUserId rejects', async () => {
    getDbClientMock.mockReturnValue(
      makeDb({ data: { user: { id: 'user-3', email: 'x@y.com' } }, error: null })
    );
    resolveCanonicalUserIdMock.mockRejectedValue(new Error('db unreachable'));
    const result = await requireAuthenticatedUser(makeReq('Bearer tok'));
    expect(result).toBe('user-3');
  });
});

describe('requireGoogleAuth', () => {
  beforeEach(() => jest.clearAllMocks());

  it('propagates UNAUTHORIZED when user is not authenticated', async () => {
    getDbClientMock.mockReturnValue(makeDb({ data: { user: null }, error: null }));
    await expect(requireGoogleAuth(makeReq())).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('throws GOOGLE_AUTH_REQUIRED when google_oauth_tokens query returns an error', async () => {
    getDbClientMock.mockReturnValue(
      makeDb(
        { data: { user: { id: 'u1', email: 'a@b.com' } }, error: null },
        { data: null, error: new Error('query failed') }
      )
    );
    resolveCanonicalUserIdMock.mockResolvedValue('u1');
    await expect(requireGoogleAuth(makeReq('Bearer tok'))).rejects.toMatchObject({
      code: 'GOOGLE_AUTH_REQUIRED',
    });
  });

  it('throws GOOGLE_AUTH_REQUIRED when no google token row exists', async () => {
    getDbClientMock.mockReturnValue(
      makeDb(
        { data: { user: { id: 'u1', email: 'a@b.com' } }, error: null },
        { data: null, error: null }
      )
    );
    resolveCanonicalUserIdMock.mockResolvedValue('u1');
    await expect(requireGoogleAuth(makeReq('Bearer tok'))).rejects.toMatchObject({
      code: 'GOOGLE_AUTH_REQUIRED',
    });
  });

  it('returns userId when google token exists with a future expires_at', async () => {
    const future = new Date(Date.now() + 3_600_000).toISOString();
    getDbClientMock.mockReturnValue(
      makeDb(
        { data: { user: { id: 'u1', email: 'a@b.com' } }, error: null },
        { data: { id: 'tok-1', expires_at: future }, error: null }
      )
    );
    resolveCanonicalUserIdMock.mockResolvedValue('u1');
    const result = await requireGoogleAuth(makeReq('Bearer tok'));
    expect(result).toBe('u1');
  });

  it('throws GOOGLE_AUTH_REQUIRED when google token is expired', async () => {
    const past = new Date(Date.now() - 3_600_000).toISOString();
    getDbClientMock.mockReturnValue(
      makeDb(
        { data: { user: { id: 'u1', email: 'a@b.com' } }, error: null },
        { data: { id: 'tok-1', expires_at: past }, error: null }
      )
    );
    resolveCanonicalUserIdMock.mockResolvedValue('u1');
    await expect(requireGoogleAuth(makeReq('Bearer tok'))).rejects.toMatchObject({
      code: 'GOOGLE_AUTH_REQUIRED',
    });
  });

  it('returns userId when google token has null expires_at (treated as not expired)', async () => {
    getDbClientMock.mockReturnValue(
      makeDb(
        { data: { user: { id: 'u1', email: 'a@b.com' } }, error: null },
        { data: { id: 'tok-1', expires_at: null }, error: null }
      )
    );
    resolveCanonicalUserIdMock.mockResolvedValue('u1');
    const result = await requireGoogleAuth(makeReq('Bearer tok'));
    expect(result).toBe('u1');
  });
});
