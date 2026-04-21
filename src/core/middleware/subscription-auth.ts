import { Request, Response, NextFunction } from 'express';
import { getSupabaseClient } from '../database/supabase-compat';
import * as jwt from 'jsonwebtoken';
import { config } from '../config';

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

// In-memory session store (in production, use Redis or database)
const sessionStore = new Map<string, SessionData>();

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

    // Enhanced token validation with multiple fallback methods
    let user: any = null;
    let tokenPayload: JWTPayload | null = null;
    
    // Method 1: Try JWT verification first (if we have a secret)
    if (config.jwtSecret) {
      try {
        tokenPayload = jwt.verify(token, config.jwtSecret) as JWTPayload;
        user = {
          id: tokenPayload.userId,
          email: tokenPayload.email,
          user_metadata: { role: tokenPayload.role }
        };
      } catch (jwtError: any) {
        console.warn('[Auth] JWT verification failed, falling back to Supabase:', jwtError.message);
      }
    }
    
    // Method 2: Fallback to Supabase auth if JWT fails or not configured
    if (!user) {
      const supabase = getSupabaseClient();
      const { data: { user: supabaseUser }, error } = await supabase.auth.getUser(token);
      
      if (error || !supabaseUser) {
        return res.status(401).json({ 
          error: 'Unauthorized', 
          message: 'Invalid or expired token',
          code: 'INVALID_TOKEN',
          details: error?.message
        });
      }
      
      user = supabaseUser;
    }
    
    // Get user subscription data for enhanced authorization
    const supabase = getSupabaseClient();
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select(`
        id, 
        email, 
        workflow_count,
        subscription_id,
        subscriptions!fk_users_subscription (
          id,
          plan_id,
          status,
          subscription_plans (
            name,
            workflow_limit
          )
        )
      `)
      .eq('id', user.id)
      .single();

    if (userError) {
      console.warn('[Auth] User data lookup failed:', userError);
    }

    // Extract subscription information
    const subscription = userData?.subscriptions as any;
    const subscriptionPlan = subscription?.subscription_plans?.name || 'Free';
    const workflowLimit = subscription?.subscription_plans?.workflow_limit || 2;
    
    // Create session if using JWT
    let sessionId: string | undefined;
    if (tokenPayload?.sessionId) {
      sessionId = tokenPayload.sessionId;
      
      // Update session activity
      const session = sessionStore.get(sessionId);
      if (session) {
        session.lastActivity = new Date();
        session.ipAddress = req.ip || 'unknown';
        session.userAgent = req.get('User-Agent') || 'unknown';
        sessionStore.set(sessionId, session);
        
        req.session = session;
      }
    }
    
    req.user = {
      id: user.id,
      email: user.email || '',
      role: user.user_metadata?.role || 'user',
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

    // Try JWT first, then Supabase
    let user: any = null;
    let tokenPayload: JWTPayload | null = null;
    
    if (config.jwtSecret) {
      try {
        tokenPayload = jwt.verify(token, config.jwtSecret) as JWTPayload;
        user = {
          id: tokenPayload.userId,
          email: tokenPayload.email,
          user_metadata: { role: tokenPayload.role }
        };
      } catch (jwtError) {
        // Silent fallback to Supabase
      }
    }
    
    if (!user) {
      const supabase = getSupabaseClient();
      const { data: { user: supabaseUser }, error } = await supabase.auth.getUser(token);
      
      if (!error && supabaseUser) {
        user = supabaseUser;
      }
    }
    
    if (user) {
      // Get subscription data
      const supabase = getSupabaseClient();
      const { data: userData } = await supabase
        .from('users')
        .select(`
          id, 
          email, 
          workflow_count,
          subscriptions!fk_users_subscription (
            subscription_plans (
              name,
              workflow_limit
            )
          )
        `)
        .eq('id', user.id)
        .single();

      const subscription = userData?.subscriptions as any;
      const subscriptionPlan = subscription?.subscription_plans?.name || 'Free';
      const workflowLimit = subscription?.subscription_plans?.workflow_limit || 2;
      
      req.user = {
        id: user.id,
        email: user.email || '',
        role: user.user_metadata?.role || 'user',
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
    
    const supabase = getSupabaseClient();
    const { data: subscription, error } = await supabase
      .from('subscriptions')
      .select('user_id')
      .eq('id', subscriptionId)
      .single();
    
    if (error || !subscription) {
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
export const createSession = (userId: string, ipAddress: string, userAgent: string): string => {
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
  
  sessionStore.set(sessionId, session);
  
  // Clean up old sessions (keep last 5 per user)
  const userSessions = Array.from(sessionStore.entries())
    .filter(([_, s]) => s.userId === userId)
    .sort((a, b) => b[1].createdAt.getTime() - a[1].createdAt.getTime());
  
  if (userSessions.length > 5) {
    userSessions.slice(5).forEach(([id]) => {
      sessionStore.delete(id);
    });
  }
  
  return sessionId;
};

export const getSession = (sessionId: string): SessionData | null => {
  return sessionStore.get(sessionId) || null;
};

export const invalidateSession = (sessionId: string): boolean => {
  const session = sessionStore.get(sessionId);
  if (session) {
    session.isActive = false;
    sessionStore.set(sessionId, session);
    return true;
  }
  return false;
};

export const invalidateAllUserSessions = (userId: string): number => {
  let count = 0;
  for (const [sessionId, session] of sessionStore.entries()) {
    if (session.userId === userId) {
      session.isActive = false;
      sessionStore.set(sessionId, session);
      count++;
    }
  }
  return count;
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
export const cleanupExpiredSessions = (): number => {
  const now = new Date();
  const maxAge = 24 * 60 * 60 * 1000; // 24 hours
  let cleaned = 0;
  
  for (const [sessionId, session] of sessionStore.entries()) {
    const age = now.getTime() - session.lastActivity.getTime();
    if (age > maxAge || !session.isActive) {
      sessionStore.delete(sessionId);
      cleaned++;
    }
  }
  
  return cleaned;
};