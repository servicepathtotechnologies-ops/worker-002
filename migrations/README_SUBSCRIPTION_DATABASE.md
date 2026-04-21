# Subscription Management System - Database Setup

This directory contains all database migration files for the Subscription Management System. The system provides a comprehensive solution for managing user subscriptions with integrated Razorpay payment processing, workflow limit enforcement, and administrative controls.

## 🗂️ Migration Files

### Core Schema Files
- **`011_subscription_management_schema.sql`** - Main database schema with tables, indexes, and triggers
- **`012_subscription_default_data.sql`** - Default subscription plans and utility functions
- **`013_subscription_performance_indexes.sql`** - Performance optimization indexes and materialized views
- **`014_subscription_constraints_validation.sql`** - Advanced constraints and validation triggers

### Setup and Testing Scripts
- **`../scripts/setup-subscription-database.sql`** - Complete setup script (runs all migrations)
- **`../scripts/test-subscription-database.sql`** - Comprehensive test suite

## 🚀 Quick Setup

### Option 1: Run Complete Setup (Recommended)
```sql
-- Run this single script in Supabase SQL Editor
\i worker/scripts/setup-subscription-database.sql
```

### Option 2: Run Individual Migrations
```sql
-- Run in order:
\i worker/migrations/011_subscription_management_schema.sql
\i worker/migrations/012_subscription_default_data.sql
\i worker/migrations/013_subscription_performance_indexes.sql
\i worker/migrations/014_subscription_constraints_validation.sql
```

### Verify Setup
```sql
-- Run test suite to verify everything works
\i worker/scripts/test-subscription-database.sql
```

## 📊 Database Schema Overview

### Core Tables

#### `subscription_plans`
Defines available subscription tiers with pricing and limits.
```sql
- id (UUID, PK)
- name (VARCHAR) - 'Free', 'Pro', 'Enterprise'
- workflow_limit (INTEGER) - Number of workflows allowed
- price_inr (INTEGER) - Price in paise (₹1 = 100 paise)
- features (JSONB) - Array of feature descriptions
- is_active (BOOLEAN) - Plan availability
```

#### `subscriptions`
Tracks user subscription status and lifecycle.
```sql
- id (UUID, PK)
- user_id (UUID, FK → auth.users)
- plan_id (UUID, FK → subscription_plans)
- status (VARCHAR) - 'active', 'expired', 'cancelled', 'pending'
- started_at, expires_at, cancelled_at (TIMESTAMPTZ)
- auto_renew (BOOLEAN)
```

#### `payments`
Records all payment transactions through Razorpay.
```sql
- id (UUID, PK)
- user_id (UUID, FK → auth.users)
- subscription_id (UUID, FK → subscriptions)
- razorpay_order_id, razorpay_payment_id, razorpay_signature (VARCHAR)
- amount_inr (INTEGER) - Amount in paise
- status (VARCHAR) - 'created', 'attempted', 'paid', 'failed', 'refunded'
- payment_method, failure_reason (TEXT)
```

#### `subscription_history`
Audit trail for all subscription changes.
```sql
- id (UUID, PK)
- user_id (UUID, FK → auth.users)
- subscription_id (UUID, FK → subscriptions)
- action (VARCHAR) - 'created', 'upgraded', 'downgraded', 'cancelled', etc.
- from_plan_id, to_plan_id (UUID, FK → subscription_plans)
- payment_id (UUID, FK → payments)
- admin_user_id (UUID, FK → auth.users) - For admin actions
```

#### `admin_actions`
Tracks all administrative operations for audit purposes.
```sql
- id (UUID, PK)
- admin_user_id (UUID, FK → auth.users)
- target_user_id (UUID, FK → auth.users)
- action (VARCHAR) - Action performed
- details (JSONB) - Additional action details
- ip_address (INET), user_agent (TEXT)
```

### Extended Tables

#### `auth.users` (Extended)
Added subscription-related columns to existing Supabase auth table:
```sql
- subscription_id (UUID, FK → subscriptions) - Current active subscription
- workflow_count (INTEGER) - Current number of workflows
- last_workflow_check (TIMESTAMPTZ) - Last limit check timestamp
```

## 🔧 Utility Functions

### User Subscription Management
- **`ensure_free_subscription(user_id)`** - Ensures user has a Free subscription
- **`get_user_subscription_details(user_id)`** - Returns current subscription info
- **`check_workflow_limit(user_id)`** - Checks if user can create more workflows
- **`increment_workflow_count(user_id)`** - Increments workflow count (with limit check)
- **`decrement_workflow_count(user_id)`** - Decrements workflow count

### Admin Functions
- **`admin_get_users_with_subscriptions(...)`** - Paginated user list with subscription details
- **`get_subscription_analytics()`** - Subscription system analytics
- **`subscription_system_health_check()`** - System integrity validation

### Maintenance Functions
- **`cleanup_expired_subscriptions()`** - Marks expired subscriptions
- **`subscription_maintenance()`** - Routine maintenance tasks
- **`refresh_subscription_analytics()`** - Updates analytics materialized view

## 💰 Default Subscription Plans

The system comes with three pre-configured plans optimized for testing:

| Plan | Workflows | Price | Features |
|------|-----------|-------|----------|
| **Free** | 2 | ₹0 | Basic workflow creation, Community support |
| **Pro** | 20 | ₹1* | Advanced workflows, Priority support, Analytics |
| **Enterprise** | 999 | ₹1* | Unlimited workflows, Dedicated support, Custom integrations |

*₹1 pricing is for development/testing. Update `price_inr` values for production.

## 🔒 Security Features

### Row Level Security (RLS)
- Users can only access their own subscription data
- Admin users have elevated permissions
- Service role has full access for backend operations

### Data Validation
- Constraint checks on all critical fields
- Trigger-based validation for business logic
- Automatic audit logging for all changes

### Payment Security
- No sensitive payment data stored locally
- Only Razorpay order IDs and payment IDs stored
- Webhook signature validation (implement in application)

## 📈 Performance Optimizations

### Indexes
- **Composite indexes** for common query patterns
- **Partial indexes** for filtered queries (active subscriptions only)
- **Unique indexes** for data integrity
- **GIN indexes** for JSONB search operations

### Materialized Views
- **`subscription_analytics_mv`** - Pre-computed analytics for dashboard performance

### Query Optimization
- Covering indexes for read-heavy operations
- Expression indexes for computed queries
- Optimized for common subscription lookup patterns

## 🔄 Triggers and Automation

### Automatic Triggers
- **Single Active Subscription** - Ensures only one active subscription per user
- **User Reference Updates** - Keeps `auth.users.subscription_id` in sync
- **Subscription History Logging** - Automatically logs all subscription changes
- **Timestamp Updates** - Maintains `updated_at` fields
- **Workflow Count Validation** - Prevents exceeding subscription limits

### Business Logic Triggers
- **Payment Validation** - Ensures payment-subscription relationship integrity
- **Subscription History Validation** - Validates history entry data
- **Constraint Enforcement** - Validates business rules at database level

## 🧪 Testing

### Test Coverage
The test suite (`test-subscription-database.sql`) validates:
- ✅ Schema setup and table creation
- ✅ Default data insertion
- ✅ User subscription creation and management
- ✅ Payment processing simulation
- ✅ Workflow limit enforcement
- ✅ Subscription history logging
- ✅ Admin functions
- ✅ Data integrity constraints
- ✅ Trigger functionality
- ✅ Performance benchmarks

### Running Tests
```sql
-- Run complete test suite
\i worker/scripts/test-subscription-database.sql
```

## 🚀 Production Deployment

### Pre-deployment Checklist
1. **Update Pricing** - Change `price_inr` values from ₹1 to production prices
2. **Environment Variables** - Set up Razorpay API keys and webhook secrets
3. **Backup Strategy** - Configure automated backups for subscription data
4. **Monitoring** - Set up alerts for payment failures and subscription issues
5. **Rate Limiting** - Configure API rate limits for subscription endpoints

### Production Configuration
```sql
-- Update pricing for production
UPDATE public.subscription_plans 
SET price_inr = CASE 
    WHEN name = 'Pro' THEN 99900      -- ₹999
    WHEN name = 'Enterprise' THEN 199900  -- ₹1999
    ELSE price_inr 
END
WHERE name IN ('Pro', 'Enterprise');
```

### Maintenance Schedule
- **Daily**: Run `cleanup_expired_subscriptions()`
- **Weekly**: Run `subscription_maintenance()`
- **Monthly**: Review subscription analytics and system health

## 📚 API Integration

### Required Environment Variables
```env
# Razorpay Configuration
RAZORPAY_KEY_ID=rzp_test_...
RAZORPAY_KEY_SECRET=...
RAZORPAY_WEBHOOK_SECRET=...

# Database Configuration
DATABASE_URL=postgresql://...
```

### Common Query Patterns
```sql
-- Get user subscription details
SELECT * FROM public.get_user_subscription_details('user-uuid');

-- Check if user can create workflow
SELECT * FROM public.check_workflow_limit('user-uuid');

-- Create payment record
INSERT INTO public.payments (user_id, razorpay_order_id, amount_inr, status)
VALUES ('user-uuid', 'order_123', 100, 'created');

-- Upgrade user subscription
SELECT public.upgrade_subscription('user-uuid', 'Pro', 'payment-uuid');
```

## 🆘 Troubleshooting

### Common Issues

#### "Free plan not found" Error
```sql
-- Verify Free plan exists
SELECT * FROM public.subscription_plans WHERE name = 'Free' AND is_active = true;

-- Recreate if missing
INSERT INTO public.subscription_plans (name, workflow_limit, price_inr, features)
VALUES ('Free', 2, 0, '["Basic workflow creation", "Community support"]');
```

#### Multiple Active Subscriptions
```sql
-- Check for multiple active subscriptions
SELECT user_id, COUNT(*) 
FROM public.subscriptions 
WHERE status = 'active' 
GROUP BY user_id 
HAVING COUNT(*) > 1;

-- Fix by running the trigger manually
SELECT public.validate_single_active_subscription();
```

#### Performance Issues
```sql
-- Run maintenance
SELECT public.subscription_maintenance();

-- Check query performance
EXPLAIN ANALYZE SELECT * FROM public.get_user_subscription_details('user-uuid');
```

### Health Check
```sql
-- Run system health check
SELECT * FROM public.subscription_system_health_check();
```

## 📞 Support

For issues with the subscription database setup:
1. Check the test results from `test-subscription-database.sql`
2. Review the health check output
3. Verify all environment variables are set correctly
4. Check Supabase logs for constraint violations or trigger errors

## 🔄 Updates and Migrations

When updating the subscription system:
1. Create new migration files following the naming convention
2. Update this README with new features
3. Add tests to the test suite
4. Update the complete setup script if needed

---

**Last Updated**: January 2025  
**Version**: 1.0.0  
**Compatibility**: PostgreSQL 13+, Supabase