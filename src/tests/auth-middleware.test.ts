import { Request, Response } from 'express';
import { authenticateUser, requireAdmin, requireRole, requireSubscriptionPlan, AuthenticatedRequest } from '../core/middleware/subscription-auth';

// Mock Supabase client
jest.mock('../core/database/supabase-compat', () => ({
  getDbClient: () => ({
    auth: {
      getUser: jest.fn()
    },
    from: jest.fn(() => ({
      select: jest.fn(() => ({
        eq: jest.fn(() => ({
          single: jest.fn()
        }))
      }))
    }))
  })
}));

// Mock config
jest.mock('../core/config', () => ({
  config: {
    jwtSecret: 'test-secret',
    isProduction: false
  }
}));

describe('Authentication Middleware', () => {
  let mockReq: Partial<AuthenticatedRequest>;
  let mockRes: Partial<Response>;
  let mockNext: jest.Mock;

  beforeEach(() => {
    mockReq = {
      headers: {},
      ip: '127.0.0.1',
      get: jest.fn(),
      method: 'GET',
      path: '/test'
    };
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };
    mockNext = jest.fn();
  });

  describe('authenticateUser', () => {
    it('should return 401 when no authorization header is provided', async () => {
      await authenticateUser(mockReq as AuthenticatedRequest, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Unauthorized',
        message: 'Missing or invalid authorization header',
        code: 'MISSING_AUTH_HEADER'
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should return 401 when authorization header is malformed', async () => {
      mockReq.headers!.authorization = 'InvalidHeader';

      await authenticateUser(mockReq as AuthenticatedRequest, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Unauthorized',
        message: 'Missing or invalid authorization header',
        code: 'MISSING_AUTH_HEADER'
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should return 401 when token is empty', async () => {
      mockReq.headers!.authorization = 'Bearer ';

      await authenticateUser(mockReq as AuthenticatedRequest, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Unauthorized',
        message: 'Missing authentication token',
        code: 'MISSING_TOKEN'
      });
      expect(mockNext).not.toHaveBeenCalled();
    });
  });

  describe('requireAdmin', () => {
    it('should return 401 when no user is authenticated', () => {
      requireAdmin(mockReq as AuthenticatedRequest, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Unauthorized',
        message: 'Authentication required',
        code: 'AUTH_REQUIRED'
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should return 403 when user is not admin', () => {
      mockReq.user = {
        id: 'user-123',
        email: 'user@example.com',
        role: 'user'
      };

      requireAdmin(mockReq as AuthenticatedRequest, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(403);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Forbidden',
        message: 'Admin access required',
        code: 'INSUFFICIENT_PRIVILEGES',
        requiredRole: 'admin',
        currentRole: 'user'
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should call next when user is admin', () => {
      mockReq.user = {
        id: 'admin-123',
        email: 'admin@example.com',
        role: 'admin'
      };

      requireAdmin(mockReq as AuthenticatedRequest, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockRes.status).not.toHaveBeenCalled();
    });
  });

  describe('requireRole', () => {
    it('should allow access when user has required role', () => {
      mockReq.user = {
        id: 'user-123',
        email: 'user@example.com',
        role: 'admin'
      };

      const middleware = requireRole(['admin', 'moderator']);
      middleware(mockReq as AuthenticatedRequest, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockRes.status).not.toHaveBeenCalled();
    });

    it('should deny access when user lacks required role', () => {
      mockReq.user = {
        id: 'user-123',
        email: 'user@example.com',
        role: 'user'
      };

      const middleware = requireRole(['admin', 'moderator']);
      middleware(mockReq as AuthenticatedRequest, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(403);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Forbidden',
        message: 'Access denied. Required roles: admin, moderator',
        code: 'INSUFFICIENT_ROLE',
        requiredRoles: ['admin', 'moderator'],
        currentRole: 'user'
      });
      expect(mockNext).not.toHaveBeenCalled();
    });
  });

  describe('requireSubscriptionPlan', () => {
    it('should allow access when user has required subscription plan', () => {
      mockReq.user = {
        id: 'user-123',
        email: 'user@example.com',
        role: 'user',
        subscriptionPlan: 'Pro'
      };

      const middleware = requireSubscriptionPlan(['Pro', 'Enterprise']);
      middleware(mockReq as AuthenticatedRequest, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockRes.status).not.toHaveBeenCalled();
    });

    it('should deny access when user lacks required subscription plan', () => {
      mockReq.user = {
        id: 'user-123',
        email: 'user@example.com',
        role: 'user',
        subscriptionPlan: 'Free'
      };

      const middleware = requireSubscriptionPlan(['Pro', 'Enterprise']);
      middleware(mockReq as AuthenticatedRequest, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(403);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Subscription Upgrade Required',
        message: 'This feature requires a Pro or Enterprise subscription',
        code: 'SUBSCRIPTION_UPGRADE_REQUIRED',
        requiredPlans: ['Pro', 'Enterprise'],
        currentPlan: 'Free',
        upgradeUrl: '/subscriptions'
      });
      expect(mockNext).not.toHaveBeenCalled();
    });
  });
});