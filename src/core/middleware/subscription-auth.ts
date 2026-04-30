import { Request, Response, NextFunction } from 'express';
import * as jwt from 'jsonwebtoken';
import { CognitoJwtVerifier } from 'aws-jwt-verify';
import AWS from 'aws-sdk';
import { config } from '../config';
import { queryAsService } from '../database/db-pool';
import { ensureUserRows } from '../database/ensure-user';
import { resolveCanonicalUserId } from '../database/identity-resolver';

// Cognito JWT verifier — verifies access tokens issued by our User Pool
const cognitoVerifier = config.cognitoUserPoolId
  ? CognitoJwtVerifier.create({
      userPoolId: config.cognitoUserPoolId,
      tokenUse: 'access',
      clientId: null,
    })
  : null;

// Cognito admin client for user attribute lookup (email from federated users)
const cognitoAdmin = new AWS.CognitoIdentityServiceProvider({
  region: process.env.AWS_REGION || 'ap-south-1',
});

// Cache email lookups per Cognito sub (5-minute TTL)
const _emailCache = new Map<string, { email: string; expiresAt: number }>();
const EMAIL_CACHE_TTL = 5 * 60_000;

/**
 * Resolves the email for a Cognito user sub.
 * Cognito ACCESS tokens don't always include the email claim (especially for
 * Google/Facebook federated users).  Falls back to:
 *   1. payload.email (direct claim)
 *   2. payload.username if it looks like an email (email/password + GitHub flow)
 *   3. Cognito Admin API lookup by sub → filter by sub attribute
 */
async function resolveEmailFromCognito(sub: string, payload: Record<string, any>): Promise<string> {
  // 1. Direct claim
  const directEmail = (payload.email as string) || '';
  if (directEmail) return directEmail;

  // 2. username looks like an email (email/password login & our GitHub flow)
  const username = (payload.username as string) || (payload['cognito:username'] as string) || '';
  if (username.includes('@')) return username;

  // Check cache before hitting Cognito API
  const cached = _emailCache.get(sub);
  if (cached && Date.now() < cached.expiresAt) return cached.email;

  // 3. Cognito Admin API — list users filtered by sub
  if (!config.cognitoUserPoolId) return '';
  try {
    const result = await cognitoAdmin.listUsers({
      UserPoolId: config.cognitoUserPoolId,
      Filter:     `sub = "${sub}"`,
      Limit:      1,
    }).promise();
    const attrs  = result.Users?.[0]?.Attributes || [];
    const email  = attrs.find((a) => a.Name === 'email')?.Value || '';
    _emailCache.set(sub, { email, expiresAt: Date.now() + EMAIL_CACHE_TTL });
    return email;
  } catch {
    return '';
  }
}

async function verifyCognitoToken(token: string): Promise<{ id: string; email: string; role: string } | null> {
  if (!cognitoVerifier) return null;
  try {
    const payload = await (cognitoVerifier as any).verify(token, { clientId: null });
    const sub   = payload.sub as string;
    const email = await resolveEmailFromCognito(sub, payload as Record<string, any>);
    return {
      id:    sub,
      email,
      role:  ((payload['cognito:groups'] as string[] || [])[0] === 'admin' ? 'admin' : 'user'),
    };
  } catch {
    return null;
  }
}

const _subscriptionCache = new Map<string, { value: any; expiry: number }>();
const _roleDbCache = new Map<string, { value: string | null; expiry: number }>();
const AUTH_CACHE_TTL_MS = 30_000;

// DB calls here use the pool-level circuit breaker in db-pool.ts.
// These wrappers only add caching and graceful fallback to default values.

async function getUserSubscription(userId: string) {
  const hit = _subscriptionCache.get(userId);
  if (hit && Date.now() < hit.expiry) return hit.value;
  try {
    const rows = await queryAsService(
      `SELECT u.id, u.email, u.workflow_count,
              sp.name  AS plan_name,
              (COALESCE(fp.workflow_limit, 2) + COALESCE(u.workflow_quota_bonus, 0))::int AS workflow_limit
       FROM   users u
       LEFT   JOIN subscriptions s  ON s.id = u.subscription_id AND s.status = 'active'
       LEFT   JOIN subscription_plans sp ON sp.id = s.plan_id
       LEFT   JOIN subscription_plans fp ON fp.name = 'Free' AND fp.is_active = true
       WHERE  u.id = $1
       LIMIT  1`,
      [userId]
    );
    const value = rows[0] || null;
    _subscriptionCache.set(userId, { value, expiry: Date.now() + AUTH_CACHE_TTL_MS });
    return value;
  } catch {
    return null;
  }
}

async function getUserRoleFromDb(userId: string): Promise<string | null> {
  const hit = _roleDbCache.get(userId);
  if (hit && Date.now() < hit.expiry) return hit.value;
  try {
    const rows = await queryAsService(
      `SELECT role
       FROM user_roles
       WHERE user_id = $1
       ORDER BY CASE role
         WHEN 'admin' THEN 3
         WHEN 'moderator' THEN 2
         ELSE 1
       END DESC
       LIMIT 1`,
      [userId]
    );
    const value = (rows[0]?.role as string) || null;
    _roleDbCache.set(userId, { value, expiry: Date.now() + AUTH_CACHE_TTL_MS });
    return value;
  } catch {
    return null;
  }
}
import {
  cleanupSessionRecords,
  getSessionRecord,
  invalidateAllSessionsForUser,
  invalidateSessionRecord,
  trimUserSessions,
  upsertSession,
} from './session-repository';

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
    role?: string;
    subscriptionPlan?: string;
    workflowLimit?: number;
    sessionId?: string;
    tokenExp?: number;
  };
  session?: {
    id: string;
    createdAt: Date;
    lastActivity: Date;
    ipAddress: string;
    userAgent: string;
  };
}

export interface JWTPayload {
  userId: string;
  email: string;
  role: 'user' | 'admin';
  subscriptionPlan: string;
  workflowLimit: number;
  sessionId?: string;
  iat: number;
  exp: number;
}

export interface SessionData {
  id: string;
  userId: string;
  createdAt: Date;
  lastActivity: Date;
  ipAddress: string;
  userAgent: string;
  isActive: boolean;
}
const SESSION_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Enhanced JWT authentication middleware with comprehensive error handling
 */
export const authenticateUser = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ 
        error: 'Unauthorized', 
        message: 'Missing or invalid authorization header',
        code: 'MISSING_AUTH_HEADER'
      });
    }
    
    const token = authHeader.replace('Bearer ', '').trim();
    
    if (!token) {
      return res.status(401).json({ 
        error: 'Unauthorized', 
        message: 'Missing authentication token',
        code: 'MISSING_TOKEN'
      });
    }

    let user: any = null;
    let tokenPayload: JWTPayload | null = null;

    // Method 1: Cognito JWT verification (primary)
    const cognitoUser = await verifyCognitoToken(token);
    if (cognitoUser) {
      user = { id: cognitoUser.id, email: cognitoUser.email, user_metadata: { role: cognitoUser.role } };
    }

    // Method 2: Legacy custom JWT (for existing sessions during transition)
    if (!user && config.jwtSecret) {
      try {
        tokenPayload = jwt.verify(token, config.jwtSecret) as JWTPayload;
        user = { id: tokenPayload.userId, email: tokenPayload.email, user_metadata: { role: tokenPayload.role } };
      } catch { /* fall through */ }
    }

    if (!user) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid or expired token',
        code: 'INVALID_TOKEN',
      });
    }

    // Resolve canonical user ID: multiple Cognito subs for the same email
    // (email/password + Google/Facebook/GitHub OAuth) must map to the same DB row.
    const rawSub = user.id;
    user.id = await resolveCanonicalUserId(rawSub, user.email || '').catch(() => rawSub);
    if (user.id !== rawSub) {
      console.log(`[Auth] Identity linked: ${rawSub} → ${user.id} (${user.email})`);
    }

    // Pool-level circuit breaker absorbs connection failures; fall through on error.
    await ensureUserRows(user.id, user.email || '', user.user_metadata?.full_name || user.user_metadata?.name || null).catch(() => {});

    // Get subscription data from RDS (gracefully falls back to defaults when DB is unreachable)
    const userData = await getUserSubscription(user.id);
    const roleFromDb = await getUserRoleFromDb(user.id);
    const subscriptionPlan = userData?.plan_name || 'Free';
    const workflowLimit = userData?.workflow_limit || 2;
    
    // Create session if using JWT
    let sessionId: string | undefined;
    if (tokenPayload?.sessionId) {
      sessionId = tokenPayload.sessionId;
      
      // Update session activity
      const session = await getSessionRecord(sessionId);
      if (session) {
        const updatedSession: SessionData = {
          id: session.id,
          userId: session.userId,
          createdAt: new Date(session.createdAt),
          lastActivity: new Date(),
          ipAddress: req.ip || 'unknown',
          userAgent: req.get('User-Agent') || 'unknown',
          isActive: session.isActive,
        };
        await upsertSession(
          {
            id: updatedSession.id,
            userId: updatedSession.userId,
            createdAt: updatedSession.createdAt.toISOString(),
            lastActivity: updatedSession.lastActivity.toISOString(),
            ipAddress: updatedSession.ipAddress,
            userAgent: updatedSession.userAgent,
            isActive: updatedSession.isActive,
          },
          SESSION_MAX_AGE_MS
        );

        req.session = updatedSession;
      }
    }
    
    req.user = {
      id: user.id,
      email: user.email || '',
      role: roleFromDb || user.user_metadata?.role || 'user',
      subscriptionPlan,
      workflowLimit,
      sessionId,
      tokenExp: tokenPayload?.exp
    };
    
    // Log successful authentication for audit trail
    console.log(`[Auth] User authenticated: ${req.user.email} (${req.user.role}) - ${req.method} ${req.path}`);
    
    next();
  } catch (error: any) {
    console.error('[Auth] Authentication error:', error);
    
    // Enhanced error responses based on error type
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ 
        error: 'Token Expired', 
        message: 'Your session has expired. Please log in again.',
        code: 'TOKEN_EXPIRED'
      });
    } else if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ 
        error: 'Invalid Token', 
        message: 'Authentication token is malformed.',
        code: 'MALFORMED_TOKEN'
      });
    } else if (error.name === 'NotBeforeError') {
      return res.status(401).json({ 
        error: 'Token Not Active', 
        message: 'Authentication token is not yet valid.',
        code: 'TOKEN_NOT_ACTIVE'
      });
    }
    
    return res.status(500).json({ 
      error: 'Internal Server Error', 
      message: 'Authentication service unavailable',
      code: 'AUTH_SERVICE_ERROR'
    });
  }
};

/**
 * Enhanced admin role authorization middleware with comprehensive access control
 */
export const requireAdmin = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  if (!req.user) {
    return res.status(401).json({ 
      error: 'Unauthorized', 
      message: 'Authentication required',
      code: 'AUTH_REQUIRED'
    });
  }
  
  if (req.user.role !== 'admin') {
    // Log unauthorized admin access attempt for security monitoring
    console.warn(`[Security] Unauthorized admin access attempt: ${req.user.email} from ${req.ip} - ${req.method} ${req.path}`);
    
    return res.status(403).json({ 
      error: 'Forbidden', 
      message: 'Admin access required',
      code: 'INSUFFICIENT_PRIVILEGES',
      requiredRole: 'admin',
      currentRole: req.user.role
    });
  }
  
  // Log admin access for audit trail
  console.log(`[Admin] Admin access granted: ${req.user.email} - ${req.method} ${req.path}`);
  
  next();
};

/**
 * Role-based access control middleware
 */
export const requireRole = (allowedRoles: string[]) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ 
        error: 'Unauthorized', 
        message: 'Authentication required',
        code: 'AUTH_REQUIRED'
      });
    }
    
    const userRole = req.user.role || 'user';
    
    if (!allowedRoles.includes(userRole)) {
      console.warn(`[Security] Insufficient role access: ${req.user.email} (${userRole}) attempted ${req.method} ${req.path} - requires: ${allowedRoles.join(', ')}`);
      
      return res.status(403).json({ 
        error: 'Forbidden', 
        message: `Access denied. Required roles: ${allowedRoles.join(', ')}`,
        code: 'INSUFFICIENT_ROLE',
        requiredRoles: allowedRoles,
        currentRole: userRole
      });
    }
    
    next();
  };
};

/**
 * Subscription plan-based access control middleware
 */
export const requireSubscriptionPlan = (allowedPlans: string[]) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ 
        error: 'Unauthorized', 
        message: 'Authentication required',
        code: 'AUTH_REQUIRED'
      });
    }
    
    const userPlan = req.user.subscriptionPlan || 'Free';
    
    if (!allowedPlans.includes(userPlan)) {
      return res.status(403).json({ 
        error: 'Subscription Upgrade Required', 
        message: `This feature requires a ${allowedPlans.join(' or ')} subscription`,
        code: 'SUBSCRIPTION_UPGRADE_REQUIRED',
        requiredPlans: allowedPlans,
        currentPlan: userPlan,
        upgradeUrl: '/subscriptions'
      });
    }
    
    next();
  };
};

/**
 * Enhanced optional authentication middleware with session tracking
 */
export const optionalAuth = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next(); // Continue without user
    }
    
    const token = authHeader.replace('Bearer ', '').trim();
    
    if (!token) {
      return next(); // Continue without user
    }

    // Try Cognito first, then legacy JWT
    let user: any = null;
    let tokenPayload: JWTPayload | null = null;

    const cognitoUser = await verifyCognitoToken(token);
    if (cognitoUser) {
      user = { id: cognitoUser.id, email: cognitoUser.email, user_metadata: { role: cognitoUser.role } };
    }

    if (!user && config.jwtSecret) {
      try {
        tokenPayload = jwt.verify(token, config.jwtSecret) as JWTPayload;
        user = {
          id: tokenPayload.userId,
          email: tokenPayload.email,
          user_metadata: { role: tokenPayload.role }
        };
      } catch { /* ignore */ }
    }

    if (user) {
      // Resolve canonical user ID for multi-provider auth
      const rawSubOpt = user.id;
      user.id = await resolveCanonicalUserId(rawSubOpt, user.email || '').catch(() => rawSubOpt);

      const userData = await getUserSubscription(user.id);
      const subscriptionPlan = userData?.plan_name || 'Free';
      const workflowLimit = userData?.workflow_limit || 2;

      const roleFromDb = await getUserRoleFromDb(user.id);
      req.user = {
        id: user.id,
        email: user.email || '',
        role: roleFromDb || user.user_metadata?.role || 'user',
        subscriptionPlan,
        workflowLimit,
        sessionId: tokenPayload?.sessionId,
        tokenExp: tokenPayload?.exp
      };
    }

    next();
  } catch (error) {
    console.error('[Auth] Optional authentication error:', error);
    next(); // Continue without user on error
  }
};

/**
 * Enhanced subscription ownership validation middleware
 */
export const validateSubscriptionOwnership = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      return res.status(401).json({ 
        error: 'Unauthorized', 
        message: 'Authentication required',
        code: 'AUTH_REQUIRED'
      });
    }
    
    const subscriptionId = req.params.subscriptionId || req.body.subscriptionId;
    
    if (!subscriptionId) {
      return res.status(400).json({ 
        error: 'Bad Request', 
        message: 'Subscription ID required',
        code: 'MISSING_SUBSCRIPTION_ID'
      });
    }
    
    const rows = await queryAsService(
      `SELECT user_id FROM subscriptions WHERE id = $1 LIMIT 1`,
      [subscriptionId]
    );
    const subscription = rows[0] || null;

    if (!subscription) {
      return res.status(404).json({ 
        error: 'Not Found', 
        message: 'Subscription not found',
        code: 'SUBSCRIPTION_NOT_FOUND'
      });
    }
    
    if (subscription.user_id !== req.user.id && req.user.role !== 'admin') {
      console.warn(`[Security] Unauthorized subscription access: ${req.user.email} attempted to access subscription ${subscriptionId}`);
      
      return res.status(403).json({ 
        error: 'Forbidden', 
        message: 'Access denied to this subscription',
        code: 'SUBSCRIPTION_ACCESS_DENIED'
      });
    }
    
    next();
  } catch (error) {
    console.error('[Auth] Subscription ownership validation error:', error);
    return res.status(500).json({ 
      error: 'Internal Server Error', 
      message: 'Validation service unavailable',
      code: 'VALIDATION_SERVICE_ERROR'
    });
  }
};

/**
 * Session management functions
 */
export const createSession = async (userId: string, ipAddress: string, userAgent: string): Promise<string> => {
  const sessionId = `sess_${userId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  const session: SessionData = {
    id: sessionId,
    userId,
    createdAt: new Date(),
    lastActivity: new Date(),
    ipAddress,
    userAgent,
    isActive: true
  };
  
  await upsertSession(
    {
      id: session.id,
      userId: session.userId,
      createdAt: session.createdAt.toISOString(),
      lastActivity: session.lastActivity.toISOString(),
      ipAddress: session.ipAddress,
      userAgent: session.userAgent,
      isActive: session.isActive,
    },
    SESSION_MAX_AGE_MS
  );
  await trimUserSessions(userId, 5, SESSION_MAX_AGE_MS);
  
  return sessionId;
};

export const getSession = async (sessionId: string): Promise<SessionData | null> => {
  const record = await getSessionRecord(sessionId);
  if (!record) return null;
  return {
    id: record.id,
    userId: record.userId,
    createdAt: new Date(record.createdAt),
    lastActivity: new Date(record.lastActivity),
    ipAddress: record.ipAddress,
    userAgent: record.userAgent,
    isActive: record.isActive,
  };
};

export const invalidateSession = async (sessionId: string): Promise<boolean> => {
  return invalidateSessionRecord(sessionId, SESSION_MAX_AGE_MS);
};

export const invalidateAllUserSessions = async (userId: string): Promise<number> => {
  return invalidateAllSessionsForUser(userId, SESSION_MAX_AGE_MS);
};

/**
 * Token refresh middleware
 */
export const refreshToken = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user || !req.user.tokenExp) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Valid token required for refresh',
        code: 'INVALID_REFRESH_REQUEST'
      });
    }
    
    const now = Math.floor(Date.now() / 1000);
    const timeUntilExpiry = req.user.tokenExp - now;
    
    // Only refresh if token expires within 15 minutes
    if (timeUntilExpiry > 900) {
      return res.status(400).json({
        error: 'Token Refresh Not Required',
        message: 'Token is still valid for more than 15 minutes',
        code: 'REFRESH_NOT_REQUIRED',
        expiresIn: timeUntilExpiry
      });
    }
    
    // Generate new token (if JWT is configured)
    if (config.jwtSecret) {
      const newPayload: JWTPayload = {
        userId: req.user.id,
        email: req.user.email,
        role: req.user.role as 'user' | 'admin',
        subscriptionPlan: req.user.subscriptionPlan || 'Free',
        workflowLimit: req.user.workflowLimit || 2,
        sessionId: req.user.sessionId,
        iat: now,
        exp: now + 3600 // 1 hour
      };
      
      const newToken = jwt.sign(newPayload, config.jwtSecret);
      
      return res.json({
        success: true,
        token: newToken,
        expiresIn: 3600,
        refreshedAt: new Date().toISOString()
      });
    }
    
    // If no JWT secret, return error
    return res.status(501).json({
      error: 'Token Refresh Unavailable',
      message: 'JWT refresh is not configured',
      code: 'REFRESH_NOT_CONFIGURED'
    });
    
  } catch (error: any) {
    console.error('[Auth] Token refresh error:', error);
    return res.status(500).json({
      error: 'Token Refresh Failed',
      message: 'Unable to refresh token',
      code: 'REFRESH_ERROR'
    });
  }
};

/**
 * Session cleanup middleware (run periodically)
 */
export const cleanupExpiredSessions = async (): Promise<number> => {
  return cleanupSessionRecords(SESSION_MAX_AGE_MS);
};
