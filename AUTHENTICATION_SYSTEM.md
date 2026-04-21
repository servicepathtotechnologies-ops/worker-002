# Authentication System Documentation

## Overview

The enhanced authentication system provides comprehensive JWT handling, role-based access control, session management, and audit trail functionality for the subscription management system.

## Features

### 1. Enhanced JWT Token Validation
- **Dual Authentication**: Supports both JWT tokens and Supabase auth tokens
- **Comprehensive Error Handling**: Detailed error codes and messages for different failure scenarios
- **Token Expiration Handling**: Automatic detection and handling of expired tokens
- **Subscription Data Integration**: Automatically loads user subscription information during authentication

### 2. Role-Based Access Control (RBAC)
- **Admin Access Control**: `requireAdmin` middleware for admin-only endpoints
- **Multi-Role Support**: `requireRole(['admin', 'moderator'])` for flexible role requirements
- **Subscription-Based Access**: `requireSubscriptionPlan(['Pro', 'Enterprise'])` for feature gating
- **Security Logging**: All access attempts are logged for audit purposes

### 3. Session Management
- **Session Creation**: Automatic session creation with JWT tokens
- **Session Tracking**: Track user sessions with IP address, user agent, and activity timestamps
- **Session Cleanup**: Automatic cleanup of expired sessions
- **Multi-Device Logout**: Support for logging out from all devices

### 4. Audit Trail System
- **Comprehensive Logging**: All authenticated operations are logged with full context
- **Security Event Tracking**: Suspicious activities and security events are tracked
- **Admin Operations**: Special logging for administrative actions
- **Payment Security**: Enhanced logging for payment-related operations

### 5. Token Refresh Capabilities
- **Automatic Refresh**: Tokens can be refreshed when nearing expiration
- **Secure Refresh**: Only valid tokens within 15 minutes of expiry can be refreshed
- **Session Continuity**: Maintains session information across token refreshes

## API Endpoints

### Authentication Management

#### POST /api/auth/refresh-token
Refresh an expiring JWT token.

**Headers:**
```
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "token": "new-jwt-token",
  "expiresIn": 3600,
  "refreshedAt": "2024-01-01T12:00:00.000Z"
}
```

#### GET /api/auth/session
Get current session information.

**Headers:**
```
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "session": {
    "id": "sess_user123_1234567890_abc123",
    "createdAt": "2024-01-01T10:00:00.000Z",
    "lastActivity": "2024-01-01T12:00:00.000Z",
    "ipAddress": "192.168.1.1",
    "userAgent": "Mozilla/5.0...",
    "isActive": true
  },
  "user": {
    "id": "user-123",
    "email": "user@example.com",
    "role": "user",
    "subscriptionPlan": "Pro",
    "workflowLimit": 20,
    "tokenExp": 1704110400
  }
}
```

#### POST /api/auth/logout
Logout from current session.

**Headers:**
```
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "message": "Session invalidated successfully",
  "sessionInvalidated": true
}
```

#### POST /api/auth/logout-all
Logout from all sessions (all devices).

**Headers:**
```
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "message": "All sessions invalidated successfully",
  "sessionsInvalidated": 3
}
```

#### GET /api/auth/validate
Validate current token and get user information.

**Headers:**
```
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "valid": true,
  "user": {
    "id": "user-123",
    "email": "user@example.com",
    "role": "user",
    "subscriptionPlan": "Pro",
    "workflowLimit": 20
  },
  "token": {
    "expiresIn": 1800,
    "isExpiringSoon": false,
    "needsRefresh": false
  }
}
```

### Admin Security Endpoints

#### GET /api/admin/audit-trail
Get audit trail entries (admin only).

**Headers:**
```
Authorization: Bearer <admin-token>
```

**Query Parameters:**
- `limit`: Number of entries to return (default: 100)
- `userId`: Filter by user ID
- `operation`: Filter by operation type
- `startDate`: Filter by start date (ISO string)
- `endDate`: Filter by end date (ISO string)

**Response:**
```json
{
  "success": true,
  "auditTrail": [
    {
      "id": "audit_1234567890_abc123",
      "operation": "subscription-upgrade",
      "userId": "user-123",
      "userEmail": "user@example.com",
      "userRole": "user",
      "method": "POST",
      "path": "/api/subscriptions/upgrade",
      "statusCode": 200,
      "duration": 150,
      "ipAddress": "192.168.1.1",
      "userAgent": "Mozilla/5.0...",
      "timestamp": "2024-01-01T12:00:00.000Z",
      "sessionId": "sess_user123_1234567890_abc123"
    }
  ],
  "count": 1,
  "filters": {
    "limit": 100,
    "userId": null,
    "operation": null,
    "startDate": null,
    "endDate": null
  }
}
```

#### GET /api/admin/security-events
Get security events (admin only).

**Headers:**
```
Authorization: Bearer <admin-token>
```

**Query Parameters:**
- `limit`: Number of events to return (default: 100)

**Response:**
```json
{
  "success": true,
  "securityEvents": [
    {
      "eventType": "auth_failure",
      "userId": "user-123",
      "ipAddress": "192.168.1.1",
      "userAgent": "Mozilla/5.0...",
      "path": "/api/subscriptions/current",
      "method": "GET",
      "details": {
        "message": "Invalid or expired token",
        "statusCode": 401
      },
      "severity": "medium",
      "timestamp": "2024-01-01T12:00:00.000Z"
    }
  ],
  "count": 1
}
```

## Middleware Usage

### Basic Authentication
```typescript
import { authenticateUser } from '../core/middleware/subscription-auth';

app.get('/api/protected-endpoint', 
  asyncHandler(authenticateUser), 
  asyncHandler(handler)
);
```

### Admin-Only Endpoints
```typescript
import { authenticateUser, requireAdmin } from '../core/middleware/subscription-auth';

app.get('/api/admin/users', 
  asyncHandler(authenticateUser), 
  asyncHandler(requireAdmin), 
  asyncHandler(handler)
);
```

### Role-Based Access
```typescript
import { authenticateUser, requireRole } from '../core/middleware/subscription-auth';

app.get('/api/moderator/content', 
  asyncHandler(authenticateUser), 
  asyncHandler(requireRole(['admin', 'moderator'])), 
  asyncHandler(handler)
);
```

### Subscription-Based Access
```typescript
import { authenticateUser, requireSubscriptionPlan } from '../core/middleware/subscription-auth';

app.get('/api/premium/features', 
  asyncHandler(authenticateUser), 
  asyncHandler(requireSubscriptionPlan(['Pro', 'Enterprise'])), 
  asyncHandler(handler)
);
```

### Logging and Audit Trail
```typescript
import { subscriptionLogger, paymentLogger, adminLogger } from '../core/middleware/subscription-logging';

// Subscription operations
app.post('/api/subscriptions/upgrade', 
  subscriptionLogger('subscription-upgrade'),
  asyncHandler(authenticateUser), 
  asyncHandler(handler)
);

// Payment operations
app.post('/api/payments/verify', 
  paymentLogger('payment-verification'),
  asyncHandler(authenticateUser), 
  asyncHandler(handler)
);

// Admin operations
app.patch('/api/admin/users/:userId', 
  adminLogger('user-modification'),
  asyncHandler(authenticateUser), 
  asyncHandler(requireAdmin), 
  asyncHandler(handler)
);
```

## Security Features

### 1. Request Logging
All requests are logged with comprehensive information:
- User identification (ID, email, role)
- Request details (method, path, IP, user agent)
- Response information (status code, duration)
- Session information (session ID, subscription plan)

### 2. Security Event Detection
The system automatically detects and logs:
- **Authentication Failures**: Invalid tokens, expired sessions
- **Rate Limit Violations**: Excessive requests from single IP
- **Suspicious Activity**: XSS attempts, injection patterns
- **Payment Fraud**: Invalid signatures, tampering attempts
- **Admin Actions**: All administrative operations

### 3. Input Validation
- **XSS Protection**: Automatic sanitization of script tags and event handlers
- **Injection Prevention**: Input validation and sanitization
- **Rate Limiting**: Configurable rate limits for different endpoint types

### 4. Session Security
- **Session Expiration**: Automatic cleanup of expired sessions
- **IP Tracking**: Session tied to IP address for additional security
- **Device Management**: Track and manage sessions across multiple devices

## Configuration

### Environment Variables
```bash
# JWT Configuration
JWT_SECRET=your-jwt-secret-key
SUPABASE_JWT_SECRET=your-supabase-jwt-secret

# Supabase Configuration
SUPABASE_URL=your-supabase-url
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Development Settings
NODE_ENV=development
DEVELOPMENT_PRICING=true
```

### Rate Limiting Configuration
```typescript
// Subscription endpoints: 10 requests per minute
subscriptionRateLimit(10, 60000)

// Payment endpoints: 5 requests per minute
subscriptionRateLimit(5, 60000)

// Admin endpoints: 3 requests per 5 minutes
subscriptionRateLimit(3, 300000)
```

## Error Codes

### Authentication Errors
- `MISSING_AUTH_HEADER`: No authorization header provided
- `MISSING_TOKEN`: Empty or missing token
- `INVALID_TOKEN`: Token is invalid or expired
- `TOKEN_EXPIRED`: Token has expired
- `MALFORMED_TOKEN`: Token format is invalid
- `TOKEN_NOT_ACTIVE`: Token is not yet valid

### Authorization Errors
- `AUTH_REQUIRED`: Authentication required for this endpoint
- `INSUFFICIENT_PRIVILEGES`: User lacks required admin privileges
- `INSUFFICIENT_ROLE`: User lacks required role
- `SUBSCRIPTION_UPGRADE_REQUIRED`: Feature requires higher subscription plan

### Security Errors
- `RATE_LIMIT_EXCEEDED`: Too many requests from client
- `MISSING_WEBHOOK_SIGNATURE`: Webhook signature missing
- `VALIDATION_SERVICE_ERROR`: Input validation service error

## Best Practices

### 1. Token Management
- Always check token expiration before making requests
- Implement automatic token refresh in frontend applications
- Handle token refresh failures gracefully

### 2. Error Handling
- Use error codes to implement specific error handling logic
- Display user-friendly error messages based on error codes
- Log security events for monitoring and analysis

### 3. Session Management
- Implement logout functionality to invalidate sessions
- Provide "logout all devices" option for security
- Monitor session activity for suspicious behavior

### 4. Security Monitoring
- Regularly review audit trail for suspicious activities
- Monitor security events for potential threats
- Implement alerting for critical security events

## Testing

The authentication system includes comprehensive tests covering:
- Token validation scenarios
- Role-based access control
- Subscription-based access control
- Error handling and edge cases

Run tests with:
```bash
npm test -- auth-middleware.test.ts
```

## Production Considerations

### 1. Database Storage
In production, replace in-memory stores with database storage:
- Session data → Redis or database table
- Audit trail → Dedicated audit database
- Security events → External logging service

### 2. External Monitoring
Integrate with external security monitoring services:
- SIEM systems for security event analysis
- APM tools for performance monitoring
- Alerting systems for critical events

### 3. Compliance
Ensure compliance with relevant standards:
- GDPR for user data protection
- PCI DSS for payment data security
- SOC 2 for service organization controls

This authentication system provides a robust foundation for secure subscription management with comprehensive audit trails and flexible access control.