# Subscription Management System - Express.js Server Setup

## Overview

This document describes the Express.js server setup with TypeScript configuration for the subscription management system. The server provides comprehensive subscription management with Razorpay payment integration, security middleware, and workflow limit enforcement.

## Architecture

### Core Components

1. **Express.js Server** - Main HTTP server with TypeScript support
2. **Security Middleware** - Comprehensive security headers and input validation
3. **Authentication System** - JWT-based authentication with role-based access control
4. **Payment Integration** - Razorpay payment gateway with signature verification
5. **Subscription Management** - Plan management and user subscription tracking
6. **Workflow Limits** - Subscription-based workflow creation limits
7. **Logging System** - Comprehensive audit logging for all operations

### Technology Stack

- **Runtime**: Node.js with TypeScript
- **Framework**: Express.js 4.18.2
- **Payment Gateway**: Razorpay SDK 2.9.4
- **Database**: PostgreSQL via Supabase
- **Caching**: Redis (optional)
- **Validation**: Zod for input validation
- **Security**: Custom middleware for headers, rate limiting, and input sanitization

## Configuration

### Environment Variables

```bash
# Subscription System Configuration
RAZORPAY_KEY_ID=rzp_test_your_key_id
RAZORPAY_KEY_SECRET=your_razorpay_key_secret
RAZORPAY_WEBHOOK_SECRET=your_razorpay_webhook_secret
SUBSCRIPTION_MODE=development
DEVELOPMENT_PRICING=true

# Database Configuration
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key

# Server Configuration
PORT=3001
NODE_ENV=development
CORS_ORIGIN=http://localhost:5173
```

### TypeScript Configuration

Enhanced TypeScript configuration with:
- Strict type checking
- Decorator support for future ORM integration
- Source maps for debugging
- Declaration files for library usage

## API Endpoints

### Subscription Management

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| GET | `/api/subscriptions/plans` | Get available subscription plans | No |
| GET | `/api/subscriptions/current` | Get current user subscription | Yes |
| POST | `/api/subscriptions/cancel` | Cancel subscription | Yes |
| GET | `/api/subscriptions/history` | Get subscription history | Yes |

### Payment Processing

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| POST | `/api/payments/razorpay/create-order` | Create payment order | Yes |
| POST | `/api/payments/razorpay/verify` | Verify payment signature | Yes |

### Workflow Limits

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| GET | `/api/workflows/limit-check` | Check workflow creation limits | Yes |

## Security Features

### Security Headers

- **Content Security Policy**: Allows Razorpay domains for payment processing
- **X-Frame-Options**: SAMEORIGIN to allow Razorpay iframe embedding
- **X-Content-Type-Options**: nosniff to prevent MIME type sniffing
- **Referrer-Policy**: strict-origin-when-cross-origin
- **HSTS**: Enabled in production for secure transport

### Rate Limiting

- **Payment Operations**: 5-10 requests per minute
- **Subscription Operations**: 3-10 requests per minute
- **IP-based tracking** with automatic cleanup

### Input Validation

- **XSS Prevention**: Sanitizes script tags and JavaScript URLs
- **SQL Injection Protection**: Input sanitization and parameterized queries
- **Request Size Limits**: 50MB limit for file uploads

## Development Features

### Development Pricing

When `DEVELOPMENT_PRICING=true`:
- All paid plans cost ₹1 for testing
- Special headers indicate development mode
- Enhanced logging for debugging

### Logging System

Comprehensive logging for:
- **Subscription Operations**: User actions, plan changes, cancellations
- **Payment Operations**: Order creation, verification, failures
- **Security Events**: Failed authentications, signature tampering attempts
- **Admin Operations**: All administrative actions with audit trail

## Middleware Stack

### Request Flow

1. **Security Headers** - Apply security policies
2. **Development Mode Headers** - Add development indicators
3. **Input Validation** - Sanitize and validate input
4. **Rate Limiting** - Enforce request limits
5. **Authentication** - Verify JWT tokens
6. **Authorization** - Check user permissions
7. **Logging** - Log operation details
8. **Business Logic** - Execute endpoint logic

### Authentication Middleware

- **authenticateUser**: Requires valid JWT token
- **requireAdmin**: Requires admin role
- **optionalAuth**: Optional authentication for public endpoints
- **validateSubscriptionOwnership**: Ensures user owns subscription

## Error Handling

### Error Categories

1. **Authentication Errors** (401)
   - Missing or invalid tokens
   - Expired sessions

2. **Authorization Errors** (403)
   - Insufficient permissions
   - Subscription ownership violations

3. **Validation Errors** (400)
   - Invalid input data
   - Missing required fields

4. **Payment Errors** (400/502)
   - Invalid signatures
   - Razorpay API failures

5. **Rate Limit Errors** (429)
   - Too many requests
   - Retry-after headers

6. **Server Errors** (500)
   - Database connection issues
   - Internal service failures

## Subscription Plans

### Plan Configuration

```typescript
const PLAN_PRICING = {
  free: {
    workflowLimit: 2,
    price: 0,
    developmentPrice: 0,
    features: ['Basic workflow creation', 'Community support']
  },
  pro: {
    workflowLimit: 20,
    price: 199900, // ₹1999 in paise
    developmentPrice: 100, // ₹1 for testing
    features: ['Advanced workflows', 'Priority support', 'Analytics']
  },
  enterprise: {
    workflowLimit: 999,
    price: 499900, // ₹4999 in paise
    developmentPrice: 100, // ₹1 for testing
    features: ['Unlimited workflows', 'Dedicated support', 'Custom integrations']
  }
};
```

## Workflow Limit Enforcement

### Limit Checking

- **Real-time Validation**: Check limits before workflow creation
- **Graceful Degradation**: Safe defaults on service errors
- **Upgrade Prompts**: Contextual upgrade suggestions

### Implementation

```typescript
// Check if user can create workflows
const limitResult = await checkWorkflowLimit(userId);

if (!limitResult.canCreate) {
  // Return upgrade prompt
  return res.status(403).json({
    limitExceeded: true,
    upgradePrompt: limitResult.upgradePrompt
  });
}
```

## Next Steps

1. **Database Schema Setup** (Task 1) - Create subscription tables
2. **Subscription Service Implementation** (Task 3) - Core business logic
3. **Payment Processing Enhancement** (Task 4) - Webhook handling
4. **Frontend Integration** (Task 8) - React components
5. **Admin Dashboard** (Task 10) - Administrative interface

## Testing

### Development Testing

1. Start the server: `npm run dev`
2. Test endpoints with development pricing (₹1)
3. Use Razorpay test credentials
4. Monitor logs for debugging

### API Testing

```bash
# Get subscription plans
curl http://localhost:3001/api/subscriptions/plans

# Check workflow limits (requires auth)
curl -H "Authorization: Bearer <token>" \
     http://localhost:3001/api/workflows/limit-check

# Create payment order (requires auth)
curl -X POST \
     -H "Authorization: Bearer <token>" \
     -H "Content-Type: application/json" \
     -d '{"planId":"pro"}' \
     http://localhost:3001/api/payments/razorpay/create-order
```

## Monitoring

### Health Check

The server provides a comprehensive health check at `/health`:

```json
{
  "status": "healthy",
  "backend": "running",
  "ai": "gemini",
  "subscriptionSystem": {
    "razorpayConfigured": true,
    "developmentMode": true,
    "availablePlans": ["free", "pro", "enterprise"]
  },
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

### Metrics

- Request counts and response times
- Error rates by endpoint
- Payment success/failure rates
- Subscription conversion metrics

This setup provides a robust foundation for the subscription management system with comprehensive security, logging, and error handling capabilities.