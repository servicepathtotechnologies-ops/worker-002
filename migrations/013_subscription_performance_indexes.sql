-- ============================================
-- Subscription Management System Performance Indexes
-- Run this in Supabase SQL Editor AFTER 012_subscription_default_data.sql
-- ============================================

-- 1. COMPOSITE INDEXES FOR COMMON QUERY PATTERNS

-- User subscription lookup (most common query)
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_status_active 
ON public.subscriptions(user_id, status) 
WHERE status = 'active';

-- Payment verification queries
CREATE INDEX IF NOT EXISTS idx_payments_razorpay_status 
ON public.payments(razorpay_order_id, status);

CREATE INDEX IF NOT EXISTS idx_payments_user_status_paid 
ON public.payments(user_id, status) 
WHERE status = 'paid';

-- Subscription history queries for audit
CREATE INDEX IF NOT EXISTS idx_subscription_history_user_action_date 
ON public.subscription_history(user_id, action, created_at DESC);

-- Admin dashboard queries
CREATE INDEX IF NOT EXISTS idx_subscriptions_plan_status 
ON public.subscriptions(plan_id, status);

-- 2. PARTIAL INDEXES FOR PERFORMANCE

-- Active subscriptions only (most queries filter by active status)
CREATE INDEX IF NOT EXISTS idx_subscriptions_active_users 
ON public.subscriptions(user_id, plan_id, started_at) 
WHERE status = 'active';

-- Pending/failed payments for retry logic
CREATE INDEX IF NOT EXISTS idx_payments_pending_retry 
ON public.payments(created_at, razorpay_order_id) 
WHERE status IN ('created', 'failed');

-- Recent subscription changes for analytics
CREATE INDEX IF NOT EXISTS idx_subscription_history_recent 
ON public.subscription_history(created_at DESC, action) 
WHERE created_at >= NOW() - INTERVAL '30 days';

-- 3. COVERING INDEXES FOR READ-HEAVY QUERIES

-- User subscription details (covers most user queries)
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_details 
ON public.subscriptions(user_id, status, plan_id, started_at, expires_at) 
WHERE status = 'active';

-- Payment summary for admin dashboard
CREATE INDEX IF NOT EXISTS idx_payments_admin_summary 
ON public.payments(user_id, status, amount_inr, created_at) 
WHERE status = 'paid';

-- 4. BTREE INDEXES FOR RANGE QUERIES

-- Subscription expiration monitoring
CREATE INDEX IF NOT EXISTS idx_subscriptions_expiration_monitoring 
ON public.subscriptions(expires_at, status) 
WHERE expires_at IS NOT NULL AND status = 'active';

-- Payment date range queries for analytics
CREATE INDEX IF NOT EXISTS idx_payments_date_range 
ON public.payments(created_at, status, amount_inr) 
WHERE status = 'paid';

-- Admin actions audit trail
CREATE INDEX IF NOT EXISTS idx_admin_actions_date_range 
ON public.admin_actions(created_at DESC, admin_user_id, action);

-- 5. GIN INDEXES FOR JSONB QUERIES

-- Subscription plan features search
CREATE INDEX IF NOT EXISTS idx_subscription_plans_features_gin 
ON public.subscription_plans USING GIN (features);

-- Payment metadata search
CREATE INDEX IF NOT EXISTS idx_payments_metadata_gin 
ON public.payments USING GIN ((COALESCE(razorpay_payment_id, '') || ' ' || COALESCE(payment_method, '')));

-- Admin action details search
CREATE INDEX IF NOT EXISTS idx_admin_actions_details_gin 
ON public.admin_actions USING GIN (details);

-- 6. UNIQUE INDEXES FOR DATA INTEGRITY

-- Ensure unique active subscription per user (enforced by trigger but indexed for performance)
CREATE UNIQUE INDEX IF NOT EXISTS idx_subscriptions_unique_active_user 
ON public.subscriptions(user_id) 
WHERE status = 'active';

-- Ensure unique Razorpay order IDs
CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_unique_razorpay_order 
ON public.payments(razorpay_order_id);

-- 7. HASH INDEXES FOR EXACT MATCH QUERIES

-- Plan name lookups (exact match only)
CREATE INDEX IF NOT EXISTS idx_subscription_plans_name_hash 
ON public.subscription_plans USING HASH (name) 
WHERE is_active = true;

-- Payment status lookups
CREATE INDEX IF NOT EXISTS idx_payments_status_hash 
ON public.payments USING HASH (status);

-- 8. EXPRESSION INDEXES FOR COMPUTED QUERIES

-- User email domain analysis (for admin analytics)
CREATE INDEX IF NOT EXISTS idx_users_email_domain 
ON auth.users(LOWER(SPLIT_PART(email, '@', 2)));

-- Monthly payment aggregation
CREATE INDEX IF NOT EXISTS idx_payments_monthly 
ON public.payments(DATE_TRUNC('month', created_at), status) 
WHERE status = 'paid';

-- 9. ANALYZE TABLES FOR QUERY PLANNER

-- Update table statistics for optimal query planning
ANALYZE public.subscription_plans;
ANALYZE public.subscriptions;
ANALYZE public.payments;
ANALYZE public.subscription_history;
ANALYZE public.admin_actions;

-- 10. CREATE MATERIALIZED VIEW FOR ANALYTICS (OPTIONAL)

-- Subscription analytics materialized view for fast dashboard queries
CREATE MATERIALIZED VIEW IF NOT EXISTS public.subscription_analytics_mv AS
SELECT 
    DATE_TRUNC('day', s.created_at) as date,
    sp.name as plan_name,
    COUNT(*) as new_subscriptions,
    SUM(CASE WHEN s.status = 'active' THEN 1 ELSE 0 END) as active_count,
    SUM(CASE WHEN s.status = 'cancelled' THEN 1 ELSE 0 END) as cancelled_count,
    COALESCE(SUM(p.amount_inr), 0) as revenue
FROM public.subscriptions s
JOIN public.subscription_plans sp ON s.plan_id = sp.id
LEFT JOIN public.payments p ON p.subscription_id = s.id AND p.status = 'paid'
WHERE s.created_at >= NOW() - INTERVAL '90 days'
GROUP BY DATE_TRUNC('day', s.created_at), sp.name
ORDER BY date DESC, sp.name;

-- Create index on materialized view
CREATE INDEX IF NOT EXISTS idx_subscription_analytics_mv_date 
ON public.subscription_analytics_mv(date DESC, plan_name);

-- Create function to refresh analytics materialized view
CREATE OR REPLACE FUNCTION public.refresh_subscription_analytics()
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY public.subscription_analytics_mv;
END;
$$;

-- 11. VACUUM AND REINDEX RECOMMENDATIONS

-- Create maintenance function
CREATE OR REPLACE FUNCTION public.subscription_maintenance()
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
    result TEXT := '';
BEGIN
    -- Vacuum analyze subscription tables
    VACUUM ANALYZE public.subscription_plans;
    VACUUM ANALYZE public.subscriptions;
    VACUUM ANALYZE public.payments;
    VACUUM ANALYZE public.subscription_history;
    VACUUM ANALYZE public.admin_actions;
    
    -- Refresh materialized view
    PERFORM public.refresh_subscription_analytics();
    
    result := 'Subscription system maintenance completed: ' || 
              'Tables vacuumed and analyzed, ' ||
              'Analytics materialized view refreshed';
    
    RETURN result;
END;
$$;

-- Add comments
COMMENT ON FUNCTION public.refresh_subscription_analytics IS 'Refreshes subscription analytics materialized view';
COMMENT ON FUNCTION public.subscription_maintenance IS 'Performs routine maintenance on subscription tables';
COMMENT ON MATERIALIZED VIEW public.subscription_analytics_mv IS 'Pre-computed subscription analytics for dashboard performance';

-- Success message
DO $$
BEGIN
    RAISE NOTICE 'Subscription Management System performance indexes created successfully!';
    RAISE NOTICE '';
    RAISE NOTICE 'Created indexes:';
    RAISE NOTICE '- Composite indexes for common query patterns';
    RAISE NOTICE '- Partial indexes for filtered queries';
    RAISE NOTICE '- Covering indexes for read-heavy operations';
    RAISE NOTICE '- GIN indexes for JSONB search';
    RAISE NOTICE '- Unique indexes for data integrity';
    RAISE NOTICE '- Expression indexes for computed queries';
    RAISE NOTICE '';
    RAISE NOTICE 'Created materialized view: subscription_analytics_mv';
    RAISE NOTICE 'Created maintenance functions:';
    RAISE NOTICE '- refresh_subscription_analytics()';
    RAISE NOTICE '- subscription_maintenance()';
    RAISE NOTICE '';
    RAISE NOTICE 'Recommendation: Run subscription_maintenance() weekly for optimal performance';
END $$;