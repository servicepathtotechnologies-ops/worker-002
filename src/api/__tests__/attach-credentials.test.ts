import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import type { Request, Response } from 'express';
import { createHash } from 'crypto';
import attachCredentialsHandler from '../attach-credentials';
import { getSupabaseClient } from '../../core/database/supabase-compat';

jest.mock('../../core/database/supabase-compat');

describe('attach-credentials idempotency', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let mockSupabase: any;

  beforeEach(() => {
    mockSupabase = {
      from: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn(),
      update: jest.fn().mockReturnThis(),
      auth: {
        getUser: jest.fn(),
      },
    };
    (mockSupabase.auth.getUser as any).mockResolvedValue({ data: { user: null }, error: null });
    (getSupabaseClient as jest.Mock).mockReturnValue(mockSupabase);

    mockRequest = {
      params: { workflowId: 'wf_1' },
      body: { credentials: { apiKey: 'abc' } },
      headers: {},
    };
    mockResponse = {
      status: jest.fn().mockReturnThis() as any,
      json: jest.fn().mockReturnThis() as any,
    } as any;
  });

  it('returns no-op when frozen ready_for_execution payload fingerprint matches', async () => {
    const payloadFingerprint = createHash('sha256')
      .update(JSON.stringify({ apiKey: 'abc' }))
      .digest('hex');

    mockSupabase.single.mockResolvedValueOnce({
      data: {
        id: 'wf_1',
        user_id: null,
        phase: 'ready_for_execution',
        status: 'active',
        metadata: {
          freezeBoundary: { frozen: true },
          attachCredentials: { lastPayloadFingerprint: payloadFingerprint },
        },
      },
      error: null,
    });

    await attachCredentialsHandler(mockRequest as Request, mockResponse as Response);

    expect(mockResponse.status).toHaveBeenCalledWith(200);
    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        phase: 'ready_for_execution',
      })
    );
    expect(mockSupabase.update).not.toHaveBeenCalled();
  });
});

