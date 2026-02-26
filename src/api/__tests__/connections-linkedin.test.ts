import { Request, Response } from 'express';
import {
  linkedinStatusHandler,
  linkedinTestHandler,
  linkedinRefreshNowHandler,
  linkedinDisconnectHandler,
} from '../connections-linkedin';

// Minimal mocks for Supabase client and fetch
jest.mock('../../core/database/supabase-compat', () => ({
  getSupabaseClient: () => ({
    auth: {
      getUser: jest.fn().mockResolvedValue({ data: { user: null }, error: null }),
    },
    from: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
      single: jest.fn().mockResolvedValue({ data: null, error: null }),
      delete: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(),
    }),
  }),
}));

describe('LinkedIn connections API', () => {
  const createRes = () => {
    const res: Partial<Response> = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    return res as Response;
  };

  it('linkedinStatusHandler returns 401 when unauthenticated', async () => {
    const req = { headers: {} } as Request;
    const res = createRes();

    await linkedinStatusHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('linkedinTestHandler returns 401 when unauthenticated', async () => {
    const req = { headers: {} } as Request;
    const res = createRes();

    await linkedinTestHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('linkedinRefreshNowHandler returns 401 when unauthenticated', async () => {
    const req = { headers: {} } as Request;
    const res = createRes();

    await linkedinRefreshNowHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('linkedinDisconnectHandler returns 401 when unauthenticated', async () => {
    const req = { headers: {} } as Request;
    const res = createRes();

    await linkedinDisconnectHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
  });
});

