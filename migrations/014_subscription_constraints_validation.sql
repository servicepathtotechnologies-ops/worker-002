-- ============================================
-- Subscription Management System Constraints and Validation
-- Run this in Supabase SQL Editor AFTER 013_subscription_performance_indexes.sql
-- ============================================

-- 1. ADVANCED CONSTRAINT VALIDATION

-- Ensure subscription dates are logical
ALTER TABLE public.subscriptions 
ADD CONSTRAINT check_subscription_date_logic 
CHECK (
    (expires_at IS NULL OR expires_at > started_at) AND
    (cancelled_at IS NULL OR cancelled_at >= started_at) AND
    (status != 'cancelled' OR cancelled_at IS NOT NULL)
);

-- Ensure payment amounts are reasonable (between ₹1 and ₹99,999)
ALTER TABLE public.payments 
ADD CONSTRAINT check_payment_amount_range 
CHECK (amount_inr BETWEEN 100 AND 9999900); -- 100 paise (₹1) to 9999900 paise (₹99,999)

-- Ensure plan workflow limits are reasonable
ALTER TABLE public.subscription_plans 
ADD CONSTRAINT check_plan_workflow_limit_range 
CHECK (workflow_limit BETWEEN 1 AND 10000);

-- Ensure user workflow count is non-negative
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'auth' AND table_name = 'users' AND column_name = 'workflow_count'
    ) THEN
        ALTER TABLE auth.users 
        ADD CONSTRAINT check_workflow_count_non_negative 
        CHECK (workflow_count >= 0);
    END IF;
END $$;

-- 2. BUSINESS LOGIC VALIDATION TRIGGERS

-- Trigger to validate payment-subscription relationship
CREATE OR REPLACE FUNCTION public.validate_payment_subscription()
RETURNS TRIGGER AS $$
BEGIN
    -- If payment has subscription_id, ensure user_id matches
    IF NEW.subscription_id IS NOT NULL THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.subscriptions s 
            WHERE s.id = NEW.subscription_id AND s.user_id = NEW.user_id
        ) THEN
            RAISE EXCEPTION 'Payment user_id must match subscription user_id';
        END IF;
    END IF;
    
    -- Ensure paid payments have payment_id and signature
    IF NEW.status = 'paid' THEN
        IF NEW.razorpay_payment_id IS NULL OR NEW.razorpay_signature IS NULL THEN
            RAISE EXCEPTION 'Paid payments must have razorpay_payment_id and razorpay_signature';
        END IF;
        
        -- Set verified_at timestamp
        NEW.verified_at = COALESCE(NEW.verified_at, NOW());
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS validate_payment_subscription_trigger ON public.payments;
CREATE TRIGGER validate_payment_subscription_trigger
    BEFORE INSERT OR UPDATE ON public.payments
    FOR EACH ROW
    EXECUTE FUNCTION public.validate_payment_subscription();

-- Trigger to validate subscription history entries
CREATE OR REPLACE FUNCTION public.validate_subscription_history()
RETURNS TRIGGER AS $$
BEGIN
    -- Ensure from_plan_id and to_plan_id are different for upgrades/downgrades
    IF NEW.action IN ('upgraded', 'downgraded') THEN
        IF NEW.from_plan_id IS NULL OR NEW.to_plan_id IS NULL THEN
            RAISE EXCEPTION 'Upgrade/downgrade actions must have both from_plan_id and to_plan_id';
        END IF;
        
        IF NEW.from_plan_id = NEW.to_plan_id THEN
            RAISE EXCEPTION 'from_plan_id and to_plan_id cannot be the same for upgrades/downgrades';
        END IF;
    END IF;
    
    -- Ensure created action has to_plan_id
    IF NEW.action = 'created' AND NEW.to_plan_id IS NULL THEN
        RAISE EXCEPTION 'Created action must have to_plan_id';
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS validate_subscription_history_trigger ON public.subscription_history;
CREATE TRIGGER validate_subscription_history_trigger
    BEFORE INSERT OR UPDATE ON public.subscription_history
    FOR EACH ROW
    EXECUTE FUNCTION public.validate_subscription_history();

-- 3. AUTOMATIC SUBSCRIPTION HISTORY LOGGING

-- Trigger to automatically log subscription changes
CREATE OR REPLACE FUNCTION public.log_subscription_changes()
RETURNS TRIGGER AS $$
DECLARE
    action_type VARCHAR(50);
    old_plan_id UUID;
    new_plan_id UUID;
BEGIN
    -- Determine action type
    IF TG_OP = 'INSERT' THEN
        action_type := 'created';
        new_plan_id := NEW.plan_id;
    ELSIF TG_OP = 'UPDATE' THEN
        IF OLD.status != NEW.status THEN
            CASE NEW.status
                WHEN 'cancelled' THEN action_type := 'cancelled';
                WHEN 'expired' THEN action_type := 'expired';
                WHEN 'active' THEN action_type := 'renewed';
                ELSE action_type := 'status_changed';
            END CASE;
        END IF;
        
        IF OLD.plan_id != NEW.plan_id THEN
            action_type := 'upgraded'; -- Could be downgrade, but we'll determine that in application logic
            old_plan_id := OLD.plan_id;
            new_plan_id := NEW.plan_id;
        END IF;
    END IF;
    
    -- Insert history record (only if we have an action)
    IF action_type IS NOT NULL THEN
        INSERT INTO public.subscription_history (
            user_id, subscription_id, action, from_plan_id, to_plan_id, notes
        ) VALUES (
            COALESCE(NEW.user_id, OLD.user_id),
            COALESCE(NEW.id, OLD.id),
            action_type,
            old_plan_id,
            new_plan_id,
            'Auto-logged by system trigger'
        );
    END IF;
    
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS log_subscription_changes_trigger ON public.subscriptions;
CREATE TRIGGER log_subscription_changes_trigger
    AFTER INSERT OR UPDATE ON public.subscriptions
    FOR EACH ROW
    EXECUTE FUNCTION public.log_subscription_changes();

-- 4. WORKFLOW COUNT VALIDATION AND SYNC

-- Trigger to validate workflow count doesn't exceed subscription limit
CREATE OR REPLACE FUNCTION public.validate_workflow_count_limit()
RETURNS TRIGGER AS $$
DECLARE
    user_limit INTEGER;
    current_count INTEGER;
BEGIN
    -- Get user's current subscription limit
    SELECT sp.workflow_limit INTO user_limit
    FROM public.subscriptions s
    JOIN public.subscription_plans sp ON s.plan_id = sp.id
    WHERE s.user_id = NEW.id AND s.status = 'active'
    LIMIT 1;
    
    -- If no active subscription, default to Free plan limit
    IF user_limit IS NULL THEN
        SELECT workflow_limit INTO user_limit
        FROM public.subscription_plans
        WHERE name = 'Free' AND is_active = true;
    END IF;
    
    -- Validate workflow count doesn't exceed limit
    current_count := COALESCE(NEW.workflow_count, 0);
    IF current_count > user_limit THEN
        RAISE EXCEPTION 'Workflow count (%) exceeds subscription limit (%)', current_count, user_limit;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Only create trigger if workflow_count column exists
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'auth' AND table_name = 'users' AND column_name = 'workflow_count'
    ) THEN
        DROP TRIGGER IF EXISTS validate_workflow_count_limit_trigger ON auth.users;
        CREATE TRIGGER validate_workflow_count_limit_trigger
            BEFORE UPDATE ON auth.users
            FOR EACH ROW
            WHEN (OLD.workflow_count IS DISTINCT FROM NEW.workflow_count)
            EXECUTE FUNCTION public.validate_workflow_count_limit();
    END IF;
END $$;

-- 5. PAYMENT WEBHOOK VALIDATION

-- Function to validate Razorpay webhook signature (placeholder - implement in application)
CREATE OR REPLACE FUNCTION public.validate_razorpay_webhook(
    payload TEXT,
    signature TEXT,
    webhook_secret TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
BEGIN
    -- This is a placeholder function
    -- In production, implement proper HMAC-SHA256 signature validation
    -- For now, just check that required parameters are present
    RETURN (
        payload IS NOT NULL AND LENGTH(payload) > 0 AND
        signature IS NOT NULL AND LENGTH(signature) > 0 AND
        webhook_secret IS NOT NULL AND LENGTH(webhook_secret) > 0
    );
END;
$$;

-- 6. DATA CLEANUP AND MAINTENANCE TRIGGERS

-- Function to clean up expired subscriptions
CREATE OR REPLACE FUNCTION public.cleanup_expired_subscriptions()
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
    expired_count INTEGER := 0;
BEGIN
    -- Mark expired subscriptions
    UPDATE public.subscriptions 
    SET status = 'expired'
    WHERE status = 'active' 
      AND expires_at IS NOT NULL 
      AND expires_at < NOW();
    
    GET DIAGNOSTICS expired_count = ROW_COUNT;
    
    -- Log cleanup action
    IF expired_count > 0 THEN
        INSERT INTO public.admin_actions (
            admin_user_id, action, details
        ) VALUES (
            '00000000-0000-0000-0000-000000000000'::UUID, -- System user
            'cleanup_expired_subscriptions',
            jsonb_build_object('expired_count', expired_count, 'timestamp', NOW())
        );
    END IF;
    
    RETURN expired_count;
END;
$$;

-- 7. REFERENTIAL INTEGRITY ENHANCEMENTS

-- Ensure subscription history references valid subscriptions
ALTER TABLE public.subscription_history 
ADD CONSTRAINT fk_subscription_history_subscription 
FOREIGN KEY (subscription_id) REFERENCES public.subscriptions(id) ON DELETE CASCADE;

-- Ensure subscription history references valid plans
ALTER TABLE public.subscription_history 
ADD CONSTRAINT fk_subscription_history_from_plan 
FOREIGN KEY (from_plan_id) REFERENCES public.subscription_plans(id) ON DELETE SET NULL;

ALTER TABLE public.subscription_history 
ADD CONSTRAINT fk_subscription_history_to_plan 
FOREIGN KEY (to_plan_id) REFERENCES public.subscription_plans(id) ON DELETE SET NULL;

-- Ensure payments reference valid subscriptions (optional)
ALTER TABLE public.payments 
ADD CONSTRAINT fk_payments_subscription 
FOREIGN KEY (subscription_id) REFERENCES public.subscriptions(id) ON DELETE SET NULL;

-- 8. SECURITY CONSTRAINTS

-- Ensure admin actions have valid admin users
ALTER TABLE public.admin_actions 
ADD CONSTRAINT check_admin_user_exists 
CHECK (admin_user_id IS NOT NULL);

-- Ensure subscription plans have valid names
ALTER TABLE public.subscription_plans 
ADD CONSTRAINT check_plan_name_format 
CHECK (name ~ '^[A-Za-z][A-Za-z0-9_]*$' AND LENGTH(name) BETWEEN 2 AND 50);

-- 9. PERFORMANCE VALIDATION

-- Function to check subscription system health
CREATE OR REPLACE FUNCTION public.subscription_system_health_check()
RETURNS TABLE (
    check_name TEXT,
    status TEXT,
    details TEXT
)
LANGUAGE plpgsql
AS $$
BEGIN
    -- Check for users without subscriptions
    RETURN QUERY
    SELECT 
        'users_without_subscriptions'::TEXT,
        CASE WHEN COUNT(*) = 0 THEN 'OK' ELSE 'WARNING' END,
        'Users without active subscriptions: ' || COUNT(*)::TEXT
    FROM auth.users u
    LEFT JOIN public.subscriptions s ON u.id = s.user_id AND s.status = 'active'
    WHERE s.id IS NULL;
    
    -- Check for orphaned payments
    RETURN QUERY
    SELECT 
        'orphaned_payments'::TEXT,
        CASE WHEN COUNT(*) = 0 THEN 'OK' ELSE 'WARNING' END,
        'Payments without valid subscriptions: ' || COUNT(*)::TEXT
    FROM public.payments p
    LEFT JOIN public.subscriptions s ON p.subscription_id = s.id
    WHERE p.subscription_id IS NOT NULL AND s.id IS NULL;
    
    -- Check for inactive plans being used
    RETURN QUERY
    SELECT 
        'inactive_plans_in_use'::TEXT,
        CASE WHEN COUNT(*) = 0 THEN 'OK' ELSE 'ERROR' END,
        'Active subscriptions using inactive plans: ' || COUNT(*)::TEXT
    FROM public.subscriptions s
    JOIN public.subscription_plans sp ON s.plan_id = sp.id
    WHERE s.status = 'active' AND sp.is_active = false;
END;
$$;

-- Add comments
COMMENT ON FUNCTION public.validate_payment_subscription IS 'Validates payment-subscription relationship and payment status';
COMMENT ON FUNCTION public.validate_subscription_history IS 'Validates subscription history entry data integrity';
COMMENT ON FUNCTION public.log_subscription_changes IS 'Automatically logs subscription changes to history table';
COMMENT ON FUNCTION public.validate_workflow_count_limit IS 'Validates user workflow count against subscription limits';
COMMENT ON FUNCTION public.validate_razorpay_webhook IS 'Validates Razorpay webhook signatures (implement in application)';
COMMENT ON FUNCTION public.cleanup_expired_subscriptions IS 'Marks expired subscriptions and logs cleanup actions';
COMMENT ON FUNCTION public.subscription_system_health_check IS 'Performs health checks on subscription system integrity';

-- Success message
DO $$
BEGIN
    RAISE NOTICE 'Subscription Management System constraints and validation completed successfully!';
    RAISE NOTICE '';
    RAISE NOTICE 'Added constraints:';
    RAISE NOTICE '- Subscription date logic validation';
    RAISE NOTICE '- Payment amount range validation (₹1 to ₹99,999)';
    RAISE NOTICE '- Plan workflow limit validation (1 to 10,000)';
    RAISE NOTICE '- User workflow count non-negative validation';
    RAISE NOTICE '';
    RAISE NOTICE 'Created validation triggers:';
    RAISE NOTICE '- Payment-subscription relationship validation';
    RAISE NOTICE '- Subscription history entry validation';
    RAISE NOTICE '- Automatic subscription change logging';
    RAISE NOTICE '- Workflow count limit validation';
    RAISE NOTICE '';
    RAISE NOTICE 'Created maintenance functions:';
    RAISE NOTICE '- cleanup_expired_subscriptions()';
    RAISE NOTICE '- subscription_system_health_check()';
    RAISE NOTICE '';
    RAISE NOTICE 'Enhanced referential integrity with proper foreign key constraints';
END $$;