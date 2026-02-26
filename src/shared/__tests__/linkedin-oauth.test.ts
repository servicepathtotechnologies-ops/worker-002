import { getLinkedInAccessToken } from '../linkedin-oauth';

describe('getLinkedInAccessToken', () => {
  it('returns null when no token rows exist', async () => {
    const supabase = {
      from: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } }),
      }),
    };

    const token = await getLinkedInAccessToken(supabase, 'user-1');

    expect(token).toBeNull();
  });

  it('returns access token when not expired', async () => {
    const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const supabase = {
      from: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: {
            access_token: 'test-token',
            refresh_token: null,
            expires_at: future,
          },
          error: null,
        }),
      }),
    };

    const token = await getLinkedInAccessToken(supabase, 'user-1');

    expect(token).toBe('test-token');
  });
});

