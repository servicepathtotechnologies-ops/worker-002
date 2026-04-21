import { Request, Response, NextFunction } from 'express';
import { config } from '../config';
import { AuthenticatedRequest } from './subscription-auth';

/**
 * Security event types for audit logging
 */
export interface SecurityEvent {
  eventType: 'auth_failure' | 'payment_fraud' | 'admin_action' | 'data_access' | 'rate_limit_exceeded' | 'suspicious_activity';
  userId?: string;
  ipAddress: string;
  userAgent: string;
  path: string;
  method: string;
  details: Record<string, any>;
  severity: 'low' | 'medium' | 'high' | 'critical';
  timestamp: Date;
}

// In-memory security event store (in production, use database or external logging service)
const securityEvents: SecurityEvent[] = [];

/**
 * Log security events for audit trail
 */
export const logSecurityEvent = (event: Omit<SecurityEvent, 'timestamp'>) => {
  const securityEvent: SecurityEvent = {
    ...event,
    timestamp: new Date()
  };
  
  securityEvents.push(securityEvent);
  
  // Keep only last 1000 events in memory
  if (securityEvents.length > 1000) {
    securityEvents.shift();
  }
  
  // Log to console based on severity
  const logLevel = event.severity === 'critical' ? 'error' : 
                   event.severity === 'high' ? 'warn' : 'log';
  
  console[logLevel](`[Security] ${event.eventType.toUpperCase()}: ${event.details.message || 'Security event'} - ${event.ipAddress} - ${event.method} ${event.path}`);
  
  // In production, send critical events to external monitoring
  if (event.severity === 'critical' && config.isProduction) {
    // TODO: Integrate with external security monitoring service
    console.error('[CRITICAL SECURITY EVENT]', securityEvent);
  }
};

/**
 * Get security events (admin only)
 */
export const getSecurityEvents = (limit: number = 100): SecurityEvent[] => {
  return securityEvents.slice(-limit).reverse();
};

/**
 * Security headers middleware for subscription management system
 * Implements comprehensive security headers for payment processing
 */
export const securityHeaders = (req: Request, res: Response, next: NextFunction) => {
  // Content Security Policy - Allow Razorpay domains for payment processing
  const csp = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' https://checkout.razorpay.com https://js.razorpay.com",
    "style-src 'self' 'unsafe-inline' https://checkout.razorpay.com",
    "img-src 'self' data: https:",
    "connect-src 'self' https://api.razorpay.com https://checkout.razorpay.com",
    "frame-src 'self' https://api.razorpay.com https://checkout.razorpay.com",
    "font-src 'self' https:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self' https://api.razorpay.com"
  ].join('; ');

  res.setHeader('Content-Security-Policy', csp);
  
  // Security headers for payment processing
  res.setHeader('X-Frame-Options', 'SAMEORIGIN'); // Allow framing for Razorpay
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  
  // HSTS for production
  if (config.isProduction) {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  }
  
  // Permissions Policy for payment features
  res.setHeader('Permissions-Policy', 'payment=self, camera=(), microphone=(), geolocation=()');
  
  next();
};

/**
 * Enhanced rate limiting middleware with security event logging
 */
const rateLimitStore = new Map<string, { count: number; resetTime: number; violations: number }>();

export const subscriptionRateLimit = (maxRequests: number = 10, windowMs: number = 60000) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const clientId = req.ip || 'unknown';
    const now = Date.now();
    
    // Clean up expired entries
    const entries = Array.from(rateLimitStore.entries());
    for (const [key, value] of entries) {
      if (now > value.resetTime) {
        rateLimitStore.delete(key);
      }
    }
    
    const clientData = rateLimitStore.get(clientId);
    
    if (!clientData || now > clientData.resetTime) {
      // New window
      rateLimitStore.set(clientId, { count: 1, resetTime: now + windowMs, violations: 0 });
      next();
    } else if (clientData.count < maxRequests) {
      // Within limit
      clientData.count++;
      next();
    } else {
      // Rate limit exceeded
      clientData.violations++;
      
      // Log security event for rate limiting
      logSecurityEvent({
        eventType: 'rate_limit_exceeded',
        userId: req.user?.id,
        ipAddress: req.ip || 'unknown',
        userAgent: req.get('User-Agent') || 'unknown',
        path: req.path,
        method: req.method,
        details: {
          message: `Rate limit exceeded: ${clientData.count}/${maxRequests} requests`,
          violations: clientData.violations,
          windowMs,
          endpoint: req.path
        },
        severity: clientData.violations > 5 ? 'high' : 'medium'
      });
      
      res.status(429).json({
        error: 'Too many requests',
        message: 'Rate limit exceeded for subscription operations',
        retryAfter: Math.ceil((clientData.resetTime - now) / 1000),
        code: 'RATE_LIMIT_EXCEEDED'
      });
    }
  };
};

/**
 * Enhanced input validation middleware with security event logging
 */
export const validateSubscriptionInput = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  let suspiciousPatterns = 0;
  
  // Sanitize common XSS patterns
  const sanitizeString = (str: string): string => {
    const original = str;
    const sanitized = str
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/javascript:/gi, '')
      .replace(/on\w+\s*=/gi, '');
    
    if (original !== sanitized) {
      suspiciousPatterns++;
    }
    
    return sanitized;
  };
  
  // Recursively sanitize request body
  const sanitizeObject = (obj: any): any => {
    if (typeof obj === 'string') {
      return sanitizeString(obj);
    } else if (Array.isArray(obj)) {
      return obj.map(sanitizeObject);
    } else if (obj && typeof obj === 'object') {
      const sanitized: any = {};
      for (const [key, value] of Object.entries(obj)) {
        sanitized[key] = sanitizeObject(value);
      }
      return sanitized;
    }
    return obj;
  };
  
  if (req.body) {
    req.body = sanitizeObject(req.body);
  }
  
  // Log suspicious activity
  if (suspiciousPatterns > 0) {
    logSecurityEvent({
      eventType: 'suspicious_activity',
      userId: req.user?.id,
      ipAddress: req.ip || 'unknown',
      userAgent: req.get('User-Agent') || 'unknown',
      path: req.path,
      method: req.method,
      details: {
        message: `Suspicious input patterns detected and sanitized`,
        patternsFound: suspiciousPatterns,
        endpoint: req.path
      },
      severity: suspiciousPatterns > 3 ? 'high' : 'medium'
    });
  }
  
  next();
};

/**
 * Enhanced webhook signature validation middleware with security logging
 */
export const validateRazorpayWebhook = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const signature = req.headers['x-razorpay-signature'] as string;
  
  if (!signature) {
    logSecurityEvent({
      eventType: 'payment_fraud',
      userId: undefined,
      ipAddress: req.ip || 'unknown',
      userAgent: req.get('User-Agent') || 'unknown',
      path: req.path,
      method: req.method,
      details: {
        message: 'Webhook received without signature',
        endpoint: req.path
      },
      severity: 'high'
    });
    
    return res.status(400).json({ 
      error: 'Missing webhook signature',
      code: 'MISSING_WEBHOOK_SIGNATURE'
    });
  }
  
  // Signature validation will be done in the webhook handler
  // This middleware just ensures the header is present
  next();
};

/**
 * Request logging middleware for security monitoring
 */
export const requestLogger = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const startTime = Date.now();
  const originalSend = res.send;
  
  // Override res.send to capture response
  res.send = function(body: any) {
    const duration = Date.now() - startTime;
    const statusCode = res.statusCode;
    
    // Log request details for audit trail
    const logData = {
      method: req.method,
      path: req.path,
      statusCode,
      duration,
      userId: req.user?.id || 'anonymous',
      userEmail: req.user?.email || 'unknown',
      userRole: req.user?.role || 'unknown',
      ipAddress: req.ip || 'unknown',
      userAgent: req.get('User-Agent') || 'unknown',
      timestamp: new Date().toISOString(),
    };
    
    // Log failed requests as security events
    if (statusCode >= 400) {
      const severity = statusCode >= 500 ? 'high' : 
                      statusCode === 401 || statusCode === 403 ? 'medium' : 'low';
      
      logSecurityEvent({
        eventType: statusCode === 401 || statusCode === 403 ? 'auth_failure' : 'data_access',
        userId: req.user?.id,
        ipAddress: req.ip || 'unknown',
        userAgent: req.get('User-Agent') || 'unknown',
        path: req.path,
        method: req.method,
        details: {
          message: `Request failed with status ${statusCode}`,
          statusCode,
          duration,
          endpoint: req.path
        },
        severity
      });
    }
    
    // Log successful requests (info level)
    if (statusCode < 400) {
      console.log(`[Request] ${req.method} ${req.path} - ${statusCode} - ${duration}ms - ${req.user?.email || 'anonymous'}`);
    }
    
    // Call original send
    return originalSend.call(this, body);
  };
  
  next();
};

/**
 * Development mode indicator middleware
 */
export const developmentModeHeaders = (req: Request, res: Response, next: NextFunction) => {
  if (config.developmentPricing) {
    res.setHeader('X-Development-Mode', 'true');
    res.setHeader('X-Test-Pricing', 'enabled');
  }
  next();
};