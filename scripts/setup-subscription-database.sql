-- ============================================
-- Subscription Management System - Complete Database Setup
-- Run this script in Supabase SQL Editor to set up the entire subscription system
-- ============================================

-- This script runs all subscription-related migrations in the correct order
-- It's safe to run multiple times (idempotent)

DO $$
BEGIN
    RAISE NOTICE '🚀 Starting Subscription Management System Database Setup...';
    RAISE NOTICE '';
END $$;

-- ============================================
-- STEP 1: Create Schema and Tables
-- ============================================

DO $$
BEGIN
    RAISE NOTICE '📋 Step 1: Creating subscription management schema and tables...';
END $$;

-- 1. SUBSCRIPTION PLANS TABLE
CREATE TABLE IF NOT EXISTS public.subscription_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(50) NOT NULL UNIQUE,
    workflow_limit INTEGER NOT NULL,
    price_inr INTEGER NOT NULL,
    features JSONB NOT NULL DEFAULT '[]',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    CONSTRAINT valid_plan_name CHECK (name IN ('Free', 'Pro', 'Enterprise')),
    CONSTRAINT valid_workflow_limit CHECK (workflow_limit > 0),
    CONSTRAINT valid_price CHECK (price_inr >= 0)
);

-- 2. SUBSCRIPTIONS TABLE
CREATE TABLE IF NOT EXISTS public.subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    plan_id UUID NOT NULL REFERENCES public.subscription_plans(id),
    status VARCHAR(20) NOT NULL DEFAULT 'active',
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ,
    cancelled_at TIMESTAMPTZ,
    auto_renew BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    CONSTRAINT valid_status CHECK (status IN ('active', 'expired', 'cancelled', 'pending')),
    CONSTRAINT valid_dates CHECK (expires_at IS NULL OR expires_at > started_at),
    CONSTRAINT valid_cancellation CHECK (cancelled_at IS NULL OR status = 'cancelled')
);

-- 3. PAYMENTS TABLE
CREATE TABLE IF NOT EXISTS public.payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id),
    subscription_id UUID REFERENCES public.subscriptions(id),
    razorpay_order_id VARCHAR(100) NOT NULL,
    razorpay_payment_id VARCHAR(100),
    razorpay_signature VARCHAR(500),
    amount_inr INTEGER NOT NULL,
    currency VARCHAR(3) DEFAULT 'INR',
    status VARCHAR(20) NOT NULL DEFAULT 'created',
    payment_method VARCHAR(50),
    failure_reason TEXT,
    webhook_received_at TIMESTAMPTZ,
    verified_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    CONSTRAINT valid_payment_status CHECK (status IN ('created', 'attempted', 'paid', 'failed', 'refunded')),
    CONSTRAINT valid_amount CHECK (amount_inr > 0),
    CONSTRAINT valid_currency CHECK (currency = 'INR')
);

-- 4. SUBSCRIPTION HISTORY TABLE
CREATE TABLE IF NOT EXISTS public.subscription_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id),
    subscription_id UUID NOT NULL REFERENCES public.subscriptions(id),
    action VARCHAR(50) NOT NULL,
    from_plan_id UUID REFERENCES public.subscription_plans(id),
    to_plan_id UUID REFERENCES public.subscription_plans(id),
    payment_id UUID REFERENCES public.payments(id),
    admin_user_id UUID REFERENCES auth.users(id),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    CONSTRAINT valid_action CHECK (action IN ('created', 'upgraded', 'downgraded', 'cancelled', 'expired', 'renewed', 'admin_modified'))
);

-- 5. ADMIN ACTIONS LOG TABLE
CREATE TABLE IF NOT EXISTS public.admin_actions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_user_id UUID NOT NULL REFERENCES auth.users(id),
    target_user_id UUID REFERENCES auth.users(id),
    action VARCHAR(100) NOT NULL,
    details JSONB DEFAULT '{}',
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    CONSTRAINT valid_action_name CHECK (LENGTH(action) > 0)
);

-- 6. EXTEND AUTH.USERS TABLE
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'auth' AND table_name = 'users' AND column_name = 'subscription_id'
  ) THEN
    ALTER TABLE auth.users ADD COLUMN subscription_id UUID REFERENCES public.subscriptions(id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'auth' AND table_name = 'users' AND column_name = 'workflow_count'
  ) THEN
    ALTER TABLE auth.users ADD COLUMN workflow_count INTEGER DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'auth' AND table_name = 'users' AND column_name = 'last_workflow_check'
  ) THEN
    ALTER TABLE auth.users ADD COLUMN last_workflow_check TIMESTAMPTZ DEFAULT NOW();
  END IF;
END $$;

-- ============================================
-- STEP 2: Create Indexes
-- ============================================

DO $$
BEGIN
    RAISE NOTICE '🔍 Step 2: Creating performance indexes...';
END $$;

-- Basic indexes
CREATE INDEX IF NOT EXISTS idx_subscription_plans_name ON public.subscription_plans(name);
CREATE INDEX IF NOT EXISTS idx_subscription_plans_active ON public.subscription_plans(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON public.subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON public.subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_subscriptions_plan_id ON public.subscriptions(plan_id);
CREATE INDEX IF NOT EXISTS idx_payments_user_id ON public.payments(user_id);
CREATE INDEX IF NOT EXISTS idx_payments_razorpay_order_id ON public.payments(razorpay_order_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON public.payments(status);
CREATE INDEX IF NOT EXISTS idx_subscription_history_user_id ON public.subscription_history(user_id);
CREATE INDEX IF NOT EXISTS idx_admin_actions_admin_user_id ON public.admin_actions(admin_user_id);
CREATE INDEX IF NOT EXISTS idx_users_subscription_id ON auth.users(subscription_id);

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_status_active ON public.subscriptions(user_id, status) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_payments_razorpay_status ON public.payments(razorpay_order_id, status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_subscriptions_unique_active_user ON public.subscriptions(user_id) WHERE status = 'active';
CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_unique_razorpay_order ON public.payments(razorpay_order_id);

-- ============================================
-- STEP 3: Create Functions and Triggers
-- ============================================

DO $$
BEGIN
    RAISE NOTICE '⚙️ Step 3: Creating functions and triggers...';
END $$;

-- Update timestamp function
CREATE OR REPLACE FUNCTION public.update_subscription_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers
DROP TRIGGER IF EXISTS update_subscription_plans_updated_at ON public.subscription_plans;
CREATE TRIGGER update_subscription_plans_updated_at
    BEFORE UPDATE ON public.subscription_plans
    FOR EACH ROW
    EXECUTE FUNCTION public.update_subscription_updated_at();

DROP TRIGGER IF EXISTS update_subscriptions_updated_at ON public.subscriptions;
CREATE TRIGGER update_subscriptions_updated_at
    BEFORE UPDATE ON public.subscriptions
    FOR EACH ROW
    EXECUTE FUNCTION public.update_subscription_updated_at();

DROP TRIGGER IF EXISTS update_payments_updated_at ON public.payments;
CREATE TRIGGER update_payments_updated_at
    BEFORE UPDATE ON public.payments
    FOR EACH ROW
    EXECUTE FUNCTION public.update_subscription_updated_at();

-- Single active subscription validation
CREATE OR REPLACE FUNCTION public.validate_single_active_subscription()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status = 'active' THEN
        UPDATE public.subscriptions 
        SET status = 'cancelled', cancelled_at = NOW()
        WHERE user_id = NEW.user_id 
          AND id != NEW.id 
          AND status = 'active';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS validate_single_active_subscription_trigger ON public.subscriptions;
CREATE TRIGGER validate_single_active_subscription_trigger
    BEFORE INSERT OR UPDATE ON public.subscriptions
    FOR EACH ROW
    EXECUTE FUNCTION public.validate_single_active_subscription();

-- Update user subscription reference
CREATE OR REPLACE FUNCTION public.update_user_subscription_reference()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status = 'active' THEN
        UPDATE auth.users 
        SET subscription_id = NEW.id
        WHERE id = NEW.user_id;
    END IF;
    
    IF NEW.status IN ('cancelled', 'expired') THEN
        UPDATE auth.users 
        SET subscription_id = NULL
        WHERE id = NEW.user_id AND subscription_id = NEW.id;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_user_subscription_reference_trigger ON public.subscriptions;
CREATE TRIGGER update_user_subscription_reference_trigger
    AFTER INSERT OR UPDATE ON public.subscriptions
    FOR EACH ROW
    EXECUTE FUNCTION public.update_user_subscription_reference();

-- ============================================
-- STEP 4: Insert Default Data
-- ============================================

DO $$
BEGIN
    RAISE NOTICE '📦 Step 4: Inserting default subscription plans...';
END $$;

INSERT INTO public.subscription_plans (name, workflow_limit, price_inr, features) VALUES
('Free', 2, 0, '[
    "Basic workflow creation",
    "Community support",
    "2 active workflows",
    "Standard execution speed"
]'),
('Pro', 20, 100, '[
    "Advanced workflow creation",
    "Priority support",
    "20 active workflows",
    "Analytics dashboard",
    "Faster execution",
    "Email notifications"
]'),
('Enterprise', 999, 100, '[
    "Unlimited workflows",
    "Dedicated support",
    "999 active workflows",
    "Custom integrations",
    "Premium execution speed",
    "Advanced analytics",
    "White-label options",
    "SLA guarantee"
]')
ON CONFLICT (name) DO UPDATE SET
    workflow_limit = EXCLUDED.workflow_limit,
    price_inr = EXCLUDED.price_inr,
    features = EXCLUDED.features,
    updated_at = NOW();

-- ============================================
-- STEP 5: Create Utility Functions
-- ============================================

DO $$
BEGIN
    RAISE NOTICE '🛠️ Step 5: Creating utility functions...';
END $$;

-- Ensure free subscription function
CREATE OR REPLACE FUNCTION public.ensure_free_subscription(target_user_id UUID)
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
    free_plan_id UUID;
    subscription_id UUID;
BEGIN
    SELECT id INTO free_plan_id 
    FROM public.subscription_plans 
    WHERE name = 'Free' AND is_active = true;
    
    IF free_plan_id IS NULL THEN
        RAISE EXCEPTION 'Free plan not found';
    END IF;
    
    SELECT id INTO subscription_id
    FROM public.subscriptions
    WHERE user_id = target_user_id AND status = 'active';
    
    IF subscription_id IS NULL THEN
        INSERT INTO public.subscriptions (user_id, plan_id, status, started_at)
        VALUES (target_user_id, free_plan_id, 'active', NOW())
        RETURNING id INTO subscription_id;
        
        INSERT INTO public.subscription_history (
            user_id, subscription_id, action, to_plan_id, notes
        ) VALUES (
            target_user_id, subscription_id, 'created', free_plan_id, 'Auto-created Free subscription'
        );
    END IF;
    
    RETURN subscription_id;
END;
$$;

-- Get user subscription details function
CREATE OR REPLACE FUNCTION public.get_user_subscription_details(target_user_id UUID)
RETURNS TABLE (
    subscription_id UUID,
    plan_name VARCHAR(50),
    workflow_limit INTEGER,
    workflow_count INTEGER,
    status VARCHAR(20),
    started_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        s.id as subscription_id,
        sp.name as plan_name,
        sp.workflow_limit,
        COALESCE(u.workflow_count, 0) as workflow_count,
        s.status,
        s.started_at,
        s.expires_at
    FROM public.subscriptions s
    JOIN public.subscription_plans sp ON s.plan_id = sp.id
    LEFT JOIN auth.users u ON s.user_id = u.id
    WHERE s.user_id = target_user_id 
      AND s.status = 'active'
    ORDER BY s.created_at DESC
    LIMIT 1;
    
    IF NOT FOUND THEN
        PERFORM public.ensure_free_subscription(target_user_id);
        
        RETURN QUERY
        SELECT 
            s.id as subscription_id,
            sp.name as plan_name,
            sp.workflow_limit,
            COALESCE(u.workflow_count, 0) as workflow_count,
            s.status,
            s.started_at,
            s.expires_at
        FROM public.subscriptions s
        JOIN public.subscription_plans sp ON s.plan_id = sp.id
        LEFT JOIN auth.users u ON s.user_id = u.id
        WHERE s.user_id = target_user_id 
          AND s.status = 'active'
        ORDER BY s.created_at DESC
        LIMIT 1;
    END IF;
END;
$$;

-- Check workflow limit function
CREATE OR REPLACE FUNCTION public.check_workflow_limit(target_user_id UUID)
RETURNS TABLE (
    can_create BOOLEAN,
    current_count INTEGER,
    limit_count INTEGER,
    plan_name VARCHAR(50)
)
LANGUAGE plpgsql
AS $$
DECLARE
    user_details RECORD;
BEGIN
    SELECT * INTO user_details
    FROM public.get_user_subscription_details(target_user_id)
    LIMIT 1;
    
    RETURN QUERY
    SELECT 
        (user_details.workflow_count < user_details.workflow_limit) as can_create,
        user_details.workflow_count as current_count,
        user_details.workflow_limit as limit_count,
        user_details.plan_name
    WHERE user_details.subscription_id IS NOT NULL;
END;
$$;

-- ============================================
-- STEP 6: Final Validation
-- ============================================

DO $$
BEGIN
    RAISE NOTICE '✅ Step 6: Running final validation...';
END $$;

-- Validate that all tables exist
DO $$
DECLARE
    table_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO table_count
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name IN ('subscription_plans', 'subscriptions', 'payments', 'subscription_history', 'admin_actions');
    
    IF table_count != 5 THEN
        RAISE EXCEPTION 'Not all subscription tables were created successfully';
    END IF;
END $$;

-- Validate that default plans exist
DO $$
DECLARE
    plan_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO plan_count
    FROM public.subscription_plans
    WHERE name IN ('Free', 'Pro', 'Enterprise') AND is_active = true;
    
    IF plan_count != 3 THEN
        RAISE EXCEPTION 'Default subscription plans were not created successfully';
    END IF;
END $$;

-- ============================================
-- COMPLETION MESSAGE
-- ============================================

DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '🎉 Subscription Management System Database Setup Complete!';
    RAISE NOTICE '';
    RAISE NOTICE '✅ Created Tables:';
    RAISE NOTICE '   - subscription_plans (Free, Pro, Enterprise)';
    RAISE NOTICE '   - subscriptions (user subscription tracking)';
    RAISE NOTICE '   - payments (Razorpay payment records)';
    RAISE NOTICE '   - subscription_history (audit trail)';
    RAISE NOTICE '   - admin_actions (admin operation logs)';
    RAISE NOTICE '   - Extended auth.users with subscription fields';
    RAISE NOTICE '';
    RAISE NOTICE '✅ Created Indexes:';
    RAISE NOTICE '   - Performance indexes for common queries';
    RAISE NOTICE '   - Unique constraints for data integrity';
    RAISE NOTICE '   - Composite indexes for complex queries';
    RAISE NOTICE '';
    RAISE NOTICE '✅ Created Functions:';
    RAISE NOTICE '   - ensure_free_subscription(user_id)';
    RAISE NOTICE '   - get_user_subscription_details(user_id)';
    RAISE NOTICE '   - check_workflow_limit(user_id)';
    RAISE NOTICE '';
    RAISE NOTICE '✅ Default Plans (₹1 testing pricing):';
    RAISE NOTICE '   - Free: 2 workflows, ₹0';
    RAISE NOTICE '   - Pro: 20 workflows, ₹1';
    RAISE NOTICE '   - Enterprise: 999 workflows, ₹1';
    RAISE NOTICE '';
    RAISE NOTICE '🚀 Ready for API integration!';
    RAISE NOTICE '';
    RAISE NOTICE '📝 Next Steps:';
    RAISE NOTICE '   1. Set up Razorpay API keys in environment variables';
    RAISE NOTICE '   2. Implement backend API endpoints';
    RAISE NOTICE '   3. Create frontend subscription page';
    RAISE NOTICE '   4. Test payment flow with ₹1 transactions';
END $$;