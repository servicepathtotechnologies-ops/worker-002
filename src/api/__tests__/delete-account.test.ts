/**
 * Property-based tests for DELETE /api/user/account endpoint
 *
 * Feature: ui-ux-and-auth-improvements
 * Property 1: Delete endpoint only deletes the authenticated user's own account
 * Validates: Requirements 1.4
 *
 * Property 2: Delete endpoint removes both auth record and profile data
 * Validates: Requirements 1.5
 */

import * as fc from 'fast-check';
import { Request, Response } from 'express';
import deleteAccountHandler from '../delete-account';

// Mock the aws-db-client module
const mockGetUser = jest.fn();
const mockDeleteUser = jest.fn();

jest.mock('../../core/database/aws-db-client', () => ({
  getDbClient: () => ({
    auth: {
      getUser: mockGetUser,
      admin: {
        deleteUser: mockDeleteUser,
      },
    },
  }),
}));

describe('deleteAccountHandler', () => {
  const createRes = () => {
    const res: Partial<Response> = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    return res as Response;
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  /**
   * Property 1: Delete endpoint only deletes the authenticated user's own account
   *
   * For any random userId, the handler must call admin.deleteUser with exactly
   * that userId — never a different one.
   *
   * Validates: Requirements 1.4
   */
  it('Property 1: deleteUser is called with exactly the authenticated user\'s own id', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.string({ minLength: 10, maxLength: 64 }),
        async (userId, token) => {
          jest.clearAllMocks();

          mockGetUser.mockResolvedValue({
            data: { user: { id: userId } },
            error: null,
          });
          mockDeleteUser.mockResolvedValue({ error: null });

          const req = {
            headers: { authorization: `Bearer ${token}` },
          } as Request;
          const res = createRes();

          await deleteAccountHandler(req, res);

          // deleteUser must have been called exactly once with the token's own userId
          expect(mockDeleteUser).toHaveBeenCalledTimes(1);
          expect(mockDeleteUser).toHaveBeenCalledWith(userId);

          // Confirm success response
          expect(res.json).toHaveBeenCalledWith({ success: true });
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 1 (negative): deleteUser is never called with a different userId
   *
   * For any pair of distinct userIds, the handler must only call deleteUser
   * with the authenticated user's id, never the other one.
   *
   * Validates: Requirements 1.4
   */
  it('Property 1 (negative): deleteUser is never called with a different userId', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.uuid(),
        fc.string({ minLength: 10, maxLength: 64 }),
        async (authenticatedUserId, otherUserId, token) => {
          fc.pre(authenticatedUserId !== otherUserId);

          jest.clearAllMocks();

          mockGetUser.mockResolvedValue({
            data: { user: { id: authenticatedUserId } },
            error: null,
          });
          mockDeleteUser.mockResolvedValue({ error: null });

          const req = {
            headers: { authorization: `Bearer ${token}` },
          } as Request;
          const res = createRes();

          await deleteAccountHandler(req, res);

          // Must NOT be called with the other user's id
          expect(mockDeleteUser).not.toHaveBeenCalledWith(otherUserId);
          // Must be called with the authenticated user's id only
          expect(mockDeleteUser).toHaveBeenCalledWith(authenticatedUserId);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Missing Authorization header returns 401 and never calls deleteUser
   */
  it('returns 401 and does not call deleteUser when Authorization header is missing', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          headers: fc.constant({}),
        }),
        async (reqPartial) => {
          jest.clearAllMocks();

          const req = reqPartial as Request;
          const res = createRes();

          await deleteAccountHandler(req, res);

          expect(res.status).toHaveBeenCalledWith(401);
          expect(mockDeleteUser).not.toHaveBeenCalled();
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * Invalid/expired token (getUser returns error) returns 401 and never calls deleteUser
   */
  it('returns 401 and does not call deleteUser when token is invalid', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 64 }),
        async (token) => {
          jest.clearAllMocks();

          mockGetUser.mockResolvedValue({
            data: { user: null },
            error: { message: 'Invalid token' },
          });

          const req = {
            headers: { authorization: `Bearer ${token}` },
          } as Request;
          const res = createRes();

          await deleteAccountHandler(req, res);

          expect(res.status).toHaveBeenCalledWith(401);
          expect(mockDeleteUser).not.toHaveBeenCalled();
        }
      ),
      { numRuns: 100 }
    );
  });
});

/**
 * Feature: ui-ux-and-auth-improvements
 * Property 2: Delete endpoint removes both auth record and profile data
 *
 * The handler delegates profile deletion to DB cascade mechanism via
 * admin.deleteUser. This property verifies the handler correctly invokes that
 * mechanism — calling deleteUser with the correct userId — which triggers the
 * cascade that removes both the auth record and all associated profile data.
 *
 * Validates: Requirements 1.5
 */
describe('Property 2: Delete endpoint removes both auth record and profile data', () => {
  const createRes = () => {
    const res: Partial<Response> = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    return res as Response;
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  /**
   * For any random userId, after a successful delete call:
   * - deleteUser is called with the correct userId (triggers cascade deletion of auth + profile)
   * - the response is { success: true }
   */
  it('Property 2: deleteUser is called with the correct userId and returns { success: true }', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.string({ minLength: 10, maxLength: 64 }),
        async (userId, token) => {
          jest.clearAllMocks();

          mockGetUser.mockResolvedValue({
            data: { user: { id: userId } },
            error: null,
          });
          mockDeleteUser.mockResolvedValue({ error: null });

          const req = {
            headers: { authorization: `Bearer ${token}` },
          } as Request;
          const res = createRes();

          await deleteAccountHandler(req, res);

          // The cascade mechanism (auth record + profile data removal) is triggered
          // by calling admin.deleteUser with the correct userId exactly once.
          expect(mockDeleteUser).toHaveBeenCalledTimes(1);
          expect(mockDeleteUser).toHaveBeenCalledWith(userId);

          // Successful deletion returns { success: true }
          expect(res.json).toHaveBeenCalledWith({ success: true });
          expect(res.status).not.toHaveBeenCalledWith(500);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * When deleteUser fails (DB error), the handler returns 500 and does NOT
   * report success — ensuring partial deletion is never silently swallowed.
   */
  it('Property 2 (negative): returns 500 and does not report success when deleteUser fails', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.string({ minLength: 10, maxLength: 64 }),
        fc.string({ minLength: 1, maxLength: 128 }),
        async (userId, token, errorMessage) => {
          jest.clearAllMocks();

          mockGetUser.mockResolvedValue({
            data: { user: { id: userId } },
            error: null,
          });
          mockDeleteUser.mockResolvedValue({ error: { message: errorMessage } });

          const req = {
            headers: { authorization: `Bearer ${token}` },
          } as Request;
          const res = createRes();

          await deleteAccountHandler(req, res);

          // Must not report success when deletion failed
          expect(res.json).not.toHaveBeenCalledWith({ success: true });
          expect(res.status).toHaveBeenCalledWith(500);
        }
      ),
      { numRuns: 100 }
    );
  });
});
