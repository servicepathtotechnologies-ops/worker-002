import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { Request, Response } from 'express';
import workflowFieldOwnershipCatalogHandler from '../workflow-field-ownership-catalog';
import { getSupabaseClient } from '../../core/database/supabase-compat';

jest.mock('../../core/database/supabase-compat');

describe('workflow-field-ownership-catalog', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let mockSupabase: any;

  beforeEach(() => {
    mockSupabase = {
      from: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn(),
    };
    (getSupabaseClient as jest.Mock).mockReturnValue(mockSupabase);
    mockRequest = { params: { workflowId: 'wf_1' } };
    mockResponse = {
      status: (jest.fn().mockReturnThis() as any),
      json: (jest.fn().mockReturnThis() as any),
    } as any;
  });

  it('filters credential-like fields out of ownership catalog', async () => {
    mockSupabase.single.mockResolvedValue({
      data: {
        id: 'wf_1',
        nodes: [
          {
            id: 'n1',
            type: 'google_gmail',
            data: {
              type: 'google_gmail',
              label: 'Gmail',
              category: 'communication',
              config: {},
            },
          },
        ],
        edges: [],
      },
      error: null,
    });

    await workflowFieldOwnershipCatalogHandler(mockRequest as Request, mockResponse as Response);
    const payload = (mockResponse.json as jest.Mock).mock.calls[0][0] as any;

    expect(payload.success).toBe(true);
    expect(Array.isArray(payload.ownershipFields)).toBe(true);
    expect(payload.ownershipFields.every((f: any) => !String(f.fieldName).toLowerCase().includes('credential'))).toBe(true);
  });
});
