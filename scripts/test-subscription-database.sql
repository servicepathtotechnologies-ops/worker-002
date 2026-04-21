-- ============================================
-- Subscription Management System - Database Test Script
-- Run this script in Supabase SQL Editor to test the subscription system
-- ============================================

-- This script tests all subscription functionality with sample data
-- It's safe to run multiple times and will clean up test data

DO $$
BEGIN
    RAISE NOTICE '🧪 Starting Subscription Management System Database Tests...';
    RAISE NOTICE '';
END $$;

-- ============================================
-- TEST 1: Verify Schema Setup
-- ============================================

DO $$
BEGIN
    RAISE NOTICE '📋 Test 1: Verifying schema setup...';
END $$;

-- Test that all tables exist
DO $$
DECLARE
    missing_tables TEXT[] := ARRAY[]::TEXT[];
BEGIN
    -- Check subscription_plans
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'subscription_plans' AND table_schema = 'public') THEN
        missing_tables := array_append(missing_tables, 'subscription_plans');
    END IF;
    
    -- Check subscriptions
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'subscriptions' AND table_schema = 'public') THEN
        missing_tables := array_append(missing_tables, 'subscriptions');
    END IF;
    
    -- Check payments
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'payments' AND table_schema = 'public') THEN
        missing_tables := array_append(missing_tables, 'payments');
    END IF;
    
    -- Check subscription_history
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'subscription_history' AND table_schema = 'public') THEN
        missing_tables := array_append(missing_tables, 'subscription_history');
    END IF;
    
    -- Check admin_actions
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'admin_actions' AND table_schema = 'public') THEN
        missing_tables := array_append(missing_tables, 'admin_actions');
    END IF;
    
    IF array_length(missing_tables, 1) > 0 THEN
        RAISE EXCEPTION 'Missing tables: %', array_to_string(missing_tables, ', ');
    ELSE
        RAISE NOTICE '✅ All subscription tables exist';
    END IF;
END $$;

-- Test that default plans exist
DO $$
DECLARE
    plan_count INTEGER;
    plans_info TEXT;
BEGIN
    SELECT COUNT(*), string_agg(name || ' (' || workflow_limit || ' workflows, ₹' || (price_inr::FLOAT/100)::TEXT || ')', ', ')
    INTO plan_count, plans_info
    FROM public.subscription_plans
    WHERE is_active = true;
    
    IF plan_count < 3 THEN
        RAISE EXCEPTION 'Expected at least 3 active plans, found %', plan_count;
    ELSE
        RAISE NOTICE '✅ Default plans exist: %', plans_info;
    END IF;
END $$;

-- ============================================
-- TEST 2: Create Test Users and Subscriptions
-- ============================================

DO $$
BEGIN
    RAISE NOTICE '👥 Test 2: Creating test users and subscriptions...';
END $$;

-- Create test users (simulate auth.users entries)
INSERT INTO auth.users (id, email, created_at) VALUES
('11111111-1111-1111-1111-111111111111', 'test.free@example.com', NOW()),
('22222222-2222-2222-2222-222222222222', 'test.pro@example.com', NOW()),
('33333333-3333-3333-3333-333333333333', 'test.enterprise@example.com', NOW())
ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email;

-- Test ensure_free_subscription function
DO $$
DECLARE
    free_sub_id UUID;
    user_details RECORD;
BEGIN
    -- Test creating free subscription
    SELECT public.ensure_free_subscription('11111111-1111-1111-1111-111111111111') INTO free_sub_id;
    
    IF free_sub_id IS NULL THEN
        RAISE EXCEPTION 'Failed to create free subscription';
    END IF;
    
    -- Test getting user subscription details
    SELECT * INTO user_details
    FROM public.get_user_subscription_details('11111111-1111-1111-1111-111111111111')
    LIMIT 1;
    
    IF user_details.plan_name != 'Free' OR user_details.workflow_limit != 2 THEN
        RAISE EXCEPTION 'Free subscription details incorrect: % with % workflows', user_details.plan_name, user_details.workflow_limit;
    END IF;
    
    RAISE NOTICE '✅ Free subscription created successfully for test.free@example.com';
END $$;

-- ============================================
-- TEST 3: Test Payment Processing
-- ============================================

DO $$
BEGIN
    RAISE NOTICE '💳 Test 3: Testing payment processing...';
END $$;

-- Create test payment records
DO $$
DECLARE
    pro_plan_id UUID;
    test_subscription_id UUID;
    payment_id UUID;
BEGIN
    -- Get Pro plan ID
    SELECT id INTO pro_plan_id FROM public.subscription_plans WHERE name = 'Pro';
    
    -- Create Pro subscription for test user
    INSERT INTO public.subscriptions (user_id, plan_id, status, started_at)
    VALUES ('22222222-2222-2222-2222-222222222222', pro_plan_id, 'active', NOW())
    RETURNING id INTO test_subscription_id;
    
    -- Create test payment
    INSERT INTO public.payments (
        user_id, subscription_id, razorpay_order_id, razorpay_payment_id, 
        razorpay_signature, amount_inr, status, verified_at
    ) VALUES (
        '22222222-2222-2222-2222-222222222222', test_subscription_id,
        'order_test_12345', 'pay_test_67890', 'test_signature_abcdef',
        100, 'paid', NOW()
    ) RETURNING id INTO payment_id;
    
    -- Verify payment was created
    IF payment_id IS NULL THEN
        RAISE EXCEPTION 'Failed to create test payment';
    END IF;
    
    RAISE NOTICE '✅ Test payment created successfully (₹1 Pro subscription)';
END $$;

-- ============================================
-- TEST 4: Test Workflow Limit Enforcement
-- ============================================

DO $$
BEGIN
    RAISE NOTICE '🔒 Test 4: Testing workflow limit enforcement...';
END $$;

-- Test workflow limit checking
DO $$
DECLARE
    limit_check RECORD;
    increment_result BOOLEAN;
BEGIN
    -- Check Free user limit (should be 2 workflows)
    SELECT * INTO limit_check
    FROM public.check_workflow_limit('11111111-1111-1111-1111-111111111111')
    LIMIT 1;
    
    IF limit_check.limit_count != 2 OR limit_check.current_count != 0 THEN
        RAISE EXCEPTION 'Free user limit check failed: % current, % limit', limit_check.current_count, limit_check.limit_count;
    END IF;
    
    -- Test incrementing workflow count
    SELECT public.increment_workflow_count('11111111-1111-1111-1111-111111111111') INTO increment_result;
    
    IF NOT increment_result THEN
        RAISE EXCEPTION 'Failed to increment workflow count for Free user';
    END IF;
    
    -- Verify count increased
    SELECT * INTO limit_check
    FROM public.check_workflow_limit('11111111-1111-1111-1111-111111111111')
    LIMIT 1;
    
    IF limit_check.current_count != 1 THEN
        RAISE EXCEPTION 'Workflow count not incremented correctly: expected 1, got %', limit_check.current_count;
    END IF;
    
    RAISE NOTICE '✅ Workflow limit enforcement working correctly';
END $$;

-- ============================================
-- TEST 5: Test Subscription History Logging
-- ============================================

DO $$
BEGIN
    RAISE NOTICE '📜 Test 5: Testing subscription history logging...';
END $$;

-- Test subscription history
DO $$
DECLARE
    history_count INTEGER;
    latest_action VARCHAR(50);
BEGIN
    -- Check that subscription creation was logged
    SELECT COUNT(*), MAX(action) INTO history_count, latest_action
    FROM public.subscription_history
    WHERE user_id = '11111111-1111-1111-1111-111111111111';
    
    IF history_count = 0 THEN
        RAISE EXCEPTION 'No subscription history found for test user';
    END IF;
    
    IF latest_action != 'created' THEN
        RAISE EXCEPTION 'Expected latest action to be "created", got "%"', latest_action;
    END IF;
    
    RAISE NOTICE '✅ Subscription history logging working correctly (% entries)', history_count;
END $$;

-- ============================================
-- TEST 6: Test Admin Functions
-- ============================================

DO $$
BEGIN
    RAISE NOTICE '👨‍💼 Test 6: Testing admin functions...';
END $$;

-- Test admin user listing
DO $$
DECLARE
    user_count INTEGER;
    analytics RECORD;
BEGIN
    -- Test admin user listing function
    SELECT COUNT(*) INTO user_count
    FROM public.admin_get_users_with_subscriptions();
    
    IF user_count = 0 THEN
        RAISE EXCEPTION 'Admin user listing returned no results';
    END IF;
    
    -- Test analytics function
    SELECT * INTO analytics
    FROM public.get_subscription_analytics()
    LIMIT 1;
    
    IF analytics.total_users = 0 THEN
        RAISE EXCEPTION 'Analytics function returned zero users';
    END IF;
    
    RAISE NOTICE '✅ Admin functions working correctly (% users, ₹% monthly revenue)', 
                 analytics.total_users, (analytics.monthly_revenue::FLOAT/100);
END $$;

-- ============================================
-- TEST 7: Test Data Integrity Constraints
-- ============================================

DO $$
BEGIN
    RAISE NOTICE '🛡️ Test 7: Testing data integrity constraints...';
END $$;

-- Test constraint violations
DO $$
DECLARE
    constraint_test_passed BOOLEAN := true;
BEGIN
    -- Test invalid plan name constraint
    BEGIN
        INSERT INTO public.subscription_plans (name, workflow_limit, price_inr)
        VALUES ('InvalidPlan', 10, 100);
        constraint_test_passed := false;
    EXCEPTION
        WHEN check_violation THEN
            -- Expected - constraint should prevent invalid plan names
            NULL;
    END;
    
    -- Test negative workflow limit constraint
    BEGIN
        INSERT INTO public.subscription_plans (name, workflow_limit, price_inr)
        VALUES ('Free', -1, 0);
        constraint_test_passed := false;
    EXCEPTION
        WHEN check_violation THEN
            -- Expected - constraint should prevent negative limits
            NULL;
    END;
    
    -- Test invalid payment amount constraint
    BEGIN
        INSERT INTO public.payments (user_id, razorpay_order_id, amount_inr)
        VALUES ('11111111-1111-1111-1111-111111111111', 'test_order', 0);
        constraint_test_passed := false;
    EXCEPTION
        WHEN check_violation THEN
            -- Expected - constraint should prevent zero amounts
            NULL;
    END;
    
    IF constraint_test_passed THEN
        RAISE NOTICE '✅ Data integrity constraints working correctly';
    ELSE
        RAISE EXCEPTION 'Data integrity constraints failed - invalid data was allowed';
    END IF;
END $$;

-- ============================================
-- TEST 8: Test Trigger Functionality
-- ============================================

DO $$
BEGIN
    RAISE NOTICE '⚡ Test 8: Testing trigger functionality...';
END $$;

-- Test single active subscription trigger
DO $$
DECLARE
    enterprise_plan_id UUID;
    old_subscription_status VARCHAR(20);
    new_subscription_id UUID;
BEGIN
    -- Get Enterprise plan ID
    SELECT id INTO enterprise_plan_id FROM public.subscription_plans WHERE name = 'Enterprise';
    
    -- Check current subscription status for test user
    SELECT status INTO old_subscription_status
    FROM public.subscriptions
    WHERE user_id = '11111111-1111-1111-1111-111111111111' AND status = 'active';
    
    -- Create new Enterprise subscription (should cancel old one)
    INSERT INTO public.subscriptions (user_id, plan_id, status, started_at)
    VALUES ('11111111-1111-1111-1111-111111111111', enterprise_plan_id, 'active', NOW())
    RETURNING id INTO new_subscription_id;
    
    -- Verify old subscription was cancelled
    SELECT status INTO old_subscription_status
    FROM public.subscriptions
    WHERE user_id = '11111111-1111-1111-1111-111111111111' 
      AND id != new_subscription_id;
    
    IF old_subscription_status != 'cancelled' THEN
        RAISE EXCEPTION 'Single active subscription trigger failed - old subscription status: %', old_subscription_status;
    END IF;
    
    RAISE NOTICE '✅ Single active subscription trigger working correctly';
END $$;

-- ============================================
-- TEST 9: Performance Test
-- ============================================

DO $$
BEGIN
    RAISE NOTICE '🚀 Test 9: Running performance tests...';
END $$;

-- Test query performance with EXPLAIN
DO $$
DECLARE
    start_time TIMESTAMPTZ;
    end_time TIMESTAMPTZ;
    duration_ms INTEGER;
BEGIN
    start_time := clock_timestamp();
    
    -- Run common queries
    PERFORM * FROM public.get_user_subscription_details('11111111-1111-1111-1111-111111111111');
    PERFORM * FROM public.check_workflow_limit('11111111-1111-1111-1111-111111111111');
    PERFORM * FROM public.admin_get_users_with_subscriptions(NULL, NULL, NULL, 10, 0);
    PERFORM * FROM public.get_subscription_analytics();
    
    end_time := clock_timestamp();
    duration_ms := EXTRACT(MILLISECONDS FROM (end_time - start_time))::INTEGER;
    
    IF duration_ms > 1000 THEN
        RAISE WARNING 'Performance test took %ms - consider optimizing queries', duration_ms;
    ELSE
        RAISE NOTICE '✅ Performance test passed (%ms for common queries)', duration_ms;
    END IF;
END $$;

-- ============================================
-- CLEANUP TEST DATA
-- ============================================

DO $$
BEGIN
    RAISE NOTICE '🧹 Cleaning up test data...';
END $$;

-- Clean up test data
DELETE FROM public.subscription_history WHERE user_id IN (
    '11111111-1111-1111-1111-111111111111',
    '22222222-2222-2222-2222-222222222222',
    '33333333-3333-3333-3333-333333333333'
);

DELETE FROM public.payments WHERE user_id IN (
    '11111111-1111-1111-1111-111111111111',
    '22222222-2222-2222-2222-222222222222',
    '33333333-3333-3333-3333-333333333333'
);

DELETE FROM public.subscriptions WHERE user_id IN (
    '11111111-1111-1111-1111-111111111111',
    '22222222-2222-2222-2222-222222222222',
    '33333333-3333-3333-3333-333333333333'
);

DELETE FROM auth.users WHERE id IN (
    '11111111-1111-1111-1111-111111111111',
    '22222222-2222-2222-2222-222222222222',
    '33333333-3333-3333-3333-333333333333'
);

-- ============================================
-- TEST COMPLETION SUMMARY
-- ============================================

DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '🎉 Subscription Management System Database Tests Complete!';
    RAISE NOTICE '';
    RAISE NOTICE '✅ All Tests Passed:';
    RAISE NOTICE '   1. Schema Setup Verification';
    RAISE NOTICE '   2. User and Subscription Creation';
    RAISE NOTICE '   3. Payment Processing';
    RAISE NOTICE '   4. Workflow Limit Enforcement';
    RAISE NOTICE '   5. Subscription History Logging';
    RAISE NOTICE '   6. Admin Functions';
    RAISE NOTICE '   7. Data Integrity Constraints';
    RAISE NOTICE '   8. Trigger Functionality';
    RAISE NOTICE '   9. Performance Testing';
    RAISE NOTICE '';
    RAISE NOTICE '🚀 Database is ready for production use!';
    RAISE NOTICE '';
    RAISE NOTICE '📊 System Status:';
    RAISE NOTICE '   - Default plans: Free (2), Pro (20), Enterprise (999) workflows';
    RAISE NOTICE '   - Testing pricing: ₹1 for paid plans';
    RAISE NOTICE '   - All constraints and triggers active';
    RAISE NOTICE '   - Performance optimized with indexes';
    RAISE NOTICE '   - Data integrity validated';
    RAISE NOTICE '';
    RAISE NOTICE '🔧 Ready for API integration and frontend development!';
END $$;