import { Request, Response, NextFunction } from 'express';
import { AuthenticatedRequest } from './subscription-auth';
import { logSecurityEvent } from './security';

/**
 * Audit trail data structure
 */
export interface AuditTrailEntry {
  id: string;
  operation: string;
  userId: string;
  userEmail: string;
  userRole: string;
  targetUserId?: string;
  resourceId?: string;
  resourceType?: string;
  method: string;
  path: string;
  statusCode: number;
  duration: number;
  ipAddress: string;
  userAgent: string;
  requestBody?: any;
  responseBody?: any;
  timestamp: Date;
  sessionId?: string;
}

// In-memory audit trail store (in production, use database)
const auditTrail: AuditTrailEntry[] = [];

/**
 * Create audit trail entry
 */
const createAuditEntry = (
  operation: string,
  req: AuthenticatedRequest,
  res: Response,
  duration: number,
  additionalData?: Partial<AuditTrailEntry>
): AuditTrailEntry => {
  return {
    id: `audit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    operation,
    userId: req.user?.id || 'anonymous',
    userEmail: req.user?.email || 'unknown',
    userRole: req.user?.role || 'unknown',
    method: req.method,
    path: req.path,
    statusCode: res.statusCode,
    duration,
    ipAddress: req.ip || 'unknown',
    userAgent: req.get('User-Agent') || 'unknown',
    timestamp: new Date(),
    sessionId: req.user?.sessionId,
    ...additionalData
  };
};

/**
 * Store audit trail entry
 */
const storeAuditEntry = (entry: AuditTrailEntry) => {
  auditTrail.push(entry);
  
  // Keep only last 5000 entries in memory
  if (auditTrail.length > 5000) {
    auditTrail.shift();
  }
  
  // In production, store in database
  // TODO: Implement database storage for audit trail
};

/**
 * Get audit trail entries (admin only)
 */
export const getAuditTrail = (
  limit: number = 100,
  userId?: string,
  operation?: string,
  startDate?: Date,
  endDate?: Date
): AuditTrailEntry[] => {
  let filtered = auditTrail;
  
  if (userId) {
    filtered = filtered.filter(entry => entry.userId === userId || entry.targetUserId === userId);
  }
  
  if (operation) {
    filtered = filtered.filter(entry => entry.operation === operation);
  }
  
  if (startDate) {
    filtered = filtered.filter(entry => entry.timestamp >= startDate);
  }
  
  if (endDate) {
    filtered = filtered.filter(entry => entry.timestamp <= endDate);
  }
  
  return filtered.slice(-limit).reverse();
};

/**
 * Enhanced subscription operation logging middleware with comprehensive audit trail
 */
export const subscriptionLogger = (operation: string) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const startTime = Date.now();
    const originalSend = res.send;
    
    // Capture request body for audit (sanitized)
    const sanitizedRequestBody = req.body ? {
      ...req.body,
      // Remove sensitive fields
      razorpay_signature: req.body.razorpay_signature ? '[REDACTED]' : undefined,
      password: req.body.password ? '[REDACTED]' : undefined,
      token: req.body.token ? '[REDACTED]' : undefined
    } : undefined;
    
    // Override res.send to capture response
    res.send = function(body: any) {
      const duration = Date.now() - startTime;
      const statusCode = res.statusCode;
      
      // Parse response body for audit (sanitized)
      let sanitizedResponseBody;
      try {
        const parsedBody = typeof body === 'string' ? JSON.parse(body) : body;
        sanitizedResponseBody = {
          ...parsedBody,
          // Remove sensitive fields from response
          token: parsedBody?.token ? '[REDACTED]' : undefined,
          keyId: parsedBody?.keyId ? '[REDACTED]' : undefined,
          order: parsedBody?.order ? {
            ...parsedBody.order,
            id: parsedBody.order.id ? '[REDACTED]' : undefined
          } : undefined
        };
      } catch (e) {
        sanitizedResponseBody = { message: 'Response body could not be parsed' };
      }
      
      // Create comprehensive audit entry
      const auditEntry = createAuditEntry(operation, req, res, duration, {
        resourceType: 'subscription',
        resourceId: req.params?.subscriptionId || req.body?.subscriptionId,
        targetUserId: req.params?.userId || req.body?.userId,
        requestBody: sanitizedRequestBody,
        responseBody: statusCode < 400 ? sanitizedResponseBody : { error: sanitizedResponseBody?.error || 'Unknown error' }
      });
      
      storeAuditEntry(auditEntry);
      
      // Log subscription operations with enhanced details
      const logData = {
        operation,
        userId: req.user?.id || 'anonymous',
        userEmail: req.user?.email || 'unknown',
        userRole: req.user?.role || 'unknown',
        method: req.method,
        path: req.path,
        statusCode,
        duration,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        timestamp: new Date().toISOString(),
        sessionId: req.user?.sessionId,
        subscriptionPlan: req.user?.subscriptionPlan,
        auditId: auditEntry.id
      };
      
      if (statusCode >= 400) {
        console.error(`[Subscription] ${operation} failed:`, logData);
        
        // Log as security event for failed operations
        logSecurityEvent({
          eventType: 'data_access',
          userId: req.user?.id,
          ipAddress: req.ip || 'unknown',
          userAgent: req.get('User-Agent') || 'unknown',
          path: req.path,
          method: req.method,
          details: {
            message: `Subscription operation failed: ${operation}`,
            operation,
            statusCode,
            auditId: auditEntry.id
          },
          severity: statusCode >= 500 ? 'high' : 'medium'
        });
      } else {
        console.log(`[Subscription] ${operation} success:`, logData);
      }
      
      // Call original send
      return originalSend.call(this, body);
    };
    
    next();
  };
};

/**
 * Enhanced payment operation logging middleware with fraud detection
 */
export const paymentLogger = (operation: string) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const startTime = Date.now();
    const originalSend = res.send;
    
    // Capture payment-specific data for fraud detection
    const paymentData = {
      planId: req.body?.planId,
      amount: req.body?.amount,
      hasOrderId: !!(req.body?.razorpay_order_id),
      hasPaymentId: !!(req.body?.razorpay_payment_id),
      hasSignature: !!(req.body?.razorpay_signature),
      userAgent: req.get('User-Agent'),
      ipAddress: req.ip
    };
    
    // Override res.send to capture response
    res.send = function(body: any) {
      const duration = Date.now() - startTime;
      const statusCode = res.statusCode;
      
      // Create comprehensive audit entry for payments
      const auditEntry = createAuditEntry(operation, req, res, duration, {
        resourceType: 'payment',
        resourceId: req.body?.razorpay_order_id || req.body?.razorpay_payment_id,
        requestBody: {
          planId: paymentData.planId,
          hasOrderId: paymentData.hasOrderId,
          hasPaymentId: paymentData.hasPaymentId,
          hasSignature: paymentData.hasSignature
        },
        responseBody: statusCode < 400 ? { success: true } : { error: 'Payment failed' }
      });
      
      storeAuditEntry(auditEntry);
      
      // Enhanced logging for payment operations
      const logData = {
        operation,
        userId: req.user?.id || 'anonymous',
        userEmail: req.user?.email || 'unknown',
        userRole: req.user?.role || 'unknown',
        method: req.method,
        path: req.path,
        statusCode,
        duration,
        ip: req.ip,
        timestamp: new Date().toISOString(),
        sessionId: req.user?.sessionId,
        auditId: auditEntry.id,
        // Payment-specific fields (sanitized) — includes userAgent from paymentData
        ...paymentData
      };
      
      if (statusCode >= 400) {
        console.error(`[Payment] ${operation} failed:`, logData);
        
        // Enhanced security logging for payment failures
        if (statusCode === 400 && req.body?.razorpay_signature) {
          logSecurityEvent({
            eventType: 'payment_fraud',
            userId: req.user?.id,
            ipAddress: req.ip || 'unknown',
            userAgent: req.get('User-Agent') || 'unknown',
            path: req.path,
            method: req.method,
            details: {
              message: 'Potential payment signature tampering attempt',
              operation,
              planId: paymentData.planId,
              auditId: auditEntry.id
            },
            severity: 'critical'
          });
        }
        
        // Log other payment failures
        logSecurityEvent({
          eventType: 'payment_fraud',
          userId: req.user?.id,
          ipAddress: req.ip || 'unknown',
          userAgent: req.get('User-Agent') || 'unknown',
          path: req.path,
          method: req.method,
          details: {
            message: `Payment operation failed: ${operation}`,
            operation,
            statusCode,
            auditId: auditEntry.id
          },
          severity: statusCode >= 500 ? 'high' : 'medium'
        });
      } else {
        console.log(`[Payment] ${operation} success:`, logData);
      }
      
      // Call original send
      return originalSend.call(this, body);
    };
    
    next();
  };
};

/**
 * Enhanced admin operation logging middleware with comprehensive audit trail
 */
export const adminLogger = (operation: string) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const startTime = Date.now();
    const originalSend = res.send;
    
    // Capture admin operation details
    const adminOperationData = {
      targetUserId: req.params?.userId || req.body?.userId,
      targetEmail: req.body?.email,
      operationType: operation,
      changes: req.body?.changes || req.body
    };
    
    // Override res.send to capture response
    res.send = function(body: any) {
      const duration = Date.now() - startTime;
      const statusCode = res.statusCode;
      
      // Create comprehensive audit entry for admin operations
      const auditEntry = createAuditEntry(operation, req, res, duration, {
        resourceType: 'admin_operation',
        resourceId: adminOperationData.targetUserId,
        targetUserId: adminOperationData.targetUserId,
        requestBody: {
          operation,
          targetUserId: adminOperationData.targetUserId,
          targetEmail: adminOperationData.targetEmail,
          changes: adminOperationData.changes
        },
        responseBody: statusCode < 400 ? { success: true } : { error: 'Admin operation failed' }
      });
      
      storeAuditEntry(auditEntry);
      
      // Enhanced logging for admin operations
      const logData = {
        operation,
        adminUserId: req.user?.id || 'unknown',
        adminEmail: req.user?.email || 'unknown',
        adminRole: req.user?.role || 'unknown',
        targetUserId: adminOperationData.targetUserId || 'unknown',
        targetEmail: adminOperationData.targetEmail || 'unknown',
        method: req.method,
        path: req.path,
        statusCode,
        duration,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        timestamp: new Date().toISOString(),
        sessionId: req.user?.sessionId,
        auditId: auditEntry.id
      };
      
      // Always log admin operations for audit trail
      if (statusCode >= 400) {
        console.error(`[Admin] ${operation} failed:`, logData);
      } else {
        console.warn(`[Admin] ${operation} executed:`, logData); // Use warn level for visibility
      }
      
      // Log all admin operations as security events
      logSecurityEvent({
        eventType: 'admin_action',
        userId: req.user?.id,
        ipAddress: req.ip || 'unknown',
        userAgent: req.get('User-Agent') || 'unknown',
        path: req.path,
        method: req.method,
        details: {
          message: `Admin operation: ${operation}`,
          operation,
          targetUserId: adminOperationData.targetUserId,
          statusCode,
          auditId: auditEntry.id
        },
        severity: statusCode >= 400 ? 'high' : 'medium'
      });
      
      // Call original send
      return originalSend.call(this, body);
    };
    
    next();
  };
};