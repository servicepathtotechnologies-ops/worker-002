-- ============================================
-- Subscription Management System Database Schema (Fixed)
-- Run this in Supabase SQL Editor
-- ============================================

-- 1. CREATE PUBLIC USERS TABLE (instead of modifying auth.users)
-- This table extends auth.users with subscription-related fields
CREATE TABLE IF NOT EXISTS public.users (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT,
    subscription_id UUID, -- Will reference subscriptions table
    workflow_count INTEGER DEFAULT 0,
    last_workflow_check TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for users table
CREATE INDEX IF NOT EXISTS idx_users_subscription_id ON public.users(subscription_id);
CREATE INDEX IF NOT EXISTS idx_users_workflow_count ON public.users(workflow_count);
CREATE INDEX IF NOT EXISTS idx_users_email ON public.users(email);

-- 2. SUBSCRIPTION PLANS TABLE
-- Defines available subscription tiers with pricing and limits
CREATE TABLE IF NOT EXISTS public.subscription_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(50) NOT NULL UNIQUE, -- 'Free', 'Pro', 'Enterprise'
    workflow_limit INTEGER NOT NULL,
    price_inr INTEGER NOT NULL, -- Price in paise (₹1 = 100 paise)
    features JSONB NOT NULL DEFAULT '[]',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    CONSTRAINT valid_plan_name CHECK (name IN ('Free', 'Pro', 'Enterprise')),
    CONSTRAINT valid_workflow_limit CHECK (workflow_limit > 0),
    CONSTRAINT valid_price CHECK (price_inr >= 0)
);

-- Create indexes for subscription_plans
CREATE INDEX IF NOT EXISTS idx_subscription_plans_name ON public.subscription_plans(name);
CREATE INDEX IF NOT EXISTS idx_subscription_plans_active ON public.subscription_plans(is_active) WHERE is_active = true;

-- 3. SUBSCRIPTIONS TABLE
-- Tracks user subscription status and lifecycle
CREATE TABLE IF NOT EXISTS public.subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    plan_id UUID NOT NULL REFERENCES public.subscription_plans(id),
    status VARCHAR(20) NOT NULL DEFAULT 'active', -- 'active', 'expired', 'cancelled', 'pending'
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

-- Now we can add the foreign key reference to users table
ALTER TABLE public.users 
ADD CONSTRAINT fk_users_subscription 
FOREIGN KEY (subscription_id) REFERENCES public.subscriptions(id);

-- Create indexes for subscriptions
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON public.subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON public.subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_subscriptions_expires_at ON public.subscriptions(expires_at);
CREATE INDEX IF NOT EXISTS idx_subscriptions_plan_id ON public.subscriptions(plan_id);

-- 4. PAYMENTS TABLE
-- Records all payment transactions through Razorpay
CREATE TABLE IF NOT EXISTS public.payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id),
    subscription_id UUID REFERENCES public.subscriptions(id),
    razorpay_order_id VARCHAR(100) NOT NULL,
    razorpay_payment_id VARCHAR(100),
    razorpay_signature VARCHAR(500),
    amount_inr INTEGER NOT NULL, -- Amount in paise
    currency VARCHAR(3) DEFAULT 'INR',
    status VARCHAR(20) NOT NULL DEFAULT 'created', -- 'created', 'attempted', 'paid', 'failed', 'refunded'
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

-- Create indexes for payments
CREATE INDEX IF NOT EXISTS idx_payments_user_id ON public.payments(user_id);
CREATE INDEX IF NOT EXISTS idx_payments_subscription_id ON public.payments(subscription_id);
CREATE INDEX IF NOT EXISTS idx_payments_razorpay_order_id ON public.payments(razorpay_order_id);
CREATE INDEX IF NOT EXISTS idx_payments_razorpay_payment_id ON public.payments(razorpay_payment_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON public.payments(status);
CREATE INDEX IF NOT EXISTS idx_payments_created_at ON public.payments(created_at);

-- 5. SUBSCRIPTION HISTORY TABLE
-- Audit trail for all subscription changes
CREATE TABLE IF NOT EXISTS public.subscription_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id),
    subscription_id UUID NOT NULL REFERENCES public.subscriptions(id),
    action VARCHAR(50) NOT NULL, -- 'created', 'upgraded', 'downgraded', 'cancelled', 'expired', 'renewed'
    from_plan_id UUID REFERENCES public.subscription_plans(id),
    to_plan_id UUID REFERENCES public.subscription_plans(id),
    payment_id UUID REFERENCES public.payments(id),
    admin_user_id UUID REFERENCES public.users(id), -- For admin actions
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    CONSTRAINT valid_action CHECK (action IN ('created', 'upgraded', 'downgraded', 'cancelled', 'expired', 'renewed', 'admin_modified'))
);

-- Create indexes for subscription_history
CREATE INDEX IF NOT EXISTS idx_subscription_history_user_id ON public.subscription_history(user_id);
CREATE INDEX IF NOT EXISTS idx_subscription_history_subscription_id ON public.subscription_history(subscription_id);
CREATE INDEX IF NOT EXISTS idx_subscription_history_action ON public.subscription_history(action);
CREATE INDEX IF NOT EXISTS idx_subscription_history_created_at ON public.subscription_history(created_at);
CREATE INDEX IF NOT EXISTS idx_subscription_history_admin_user_id ON public.subscription_history(admin_user_id);

-- 6. ADMIN ACTIONS LOG TABLE
-- Tracks all administrative operations for audit purposes
CREATE TABLE IF NOT EXISTS public.admin_actions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_user_id UUID NOT NULL REFERENCES public.users(id),
    target_user_id UUID REFERENCES public.users(id),
    action VARCHAR(100) NOT NULL,
    details JSONB DEFAULT '{}',
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    CONSTRAINT valid_action_name CHECK (LENGTH(action) > 0)
);

-- Create indexes for admin_actions
CREATE INDEX IF NOT EXISTS idx_admin_actions_admin_user_id ON public.admin_actions(admin_user_id);
CREATE INDEX IF NOT EXISTS idx_admin_actions_target_user_id ON public.admin_actions(target_user_id);
CREATE INDEX IF NOT EXISTS idx_admin_actions_action ON public.admin_actions(action);
CREATE INDEX IF NOT EXISTS idx_admin_actions_created_at ON public.admin_actions(created_at);

-- 7. CREATE TRIGGERS FOR AUTOMATIC TIMESTAMP UPDATES
-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_subscription_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for updated_at columns
DROP TRIGGER IF EXISTS update_users_updated_at ON public.users;
CREATE TRIGGER update_users_updated_at
    BEFORE UPDATE ON public.users
    FOR EACH ROW
    EXECUTE FUNCTION public.update_subscription_updated_at();

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

-- 8. CREATE VALIDATION TRIGGERS
-- Trigger to ensure only one active subscription per user
CREATE OR REPLACE FUNCTION public.validate_single_active_subscription()
RETURNS TRIGGER AS $$
BEGIN
    -- If inserting/updating to active status, deactivate other subscriptions for the same user
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

-- 9. CREATE USER SUBSCRIPTION REFERENCE UPDATE TRIGGER
-- Automatically update user's subscription_id when subscription changes
CREATE OR REPLACE FUNCTION public.update_user_subscription_reference()
RETURNS TRIGGER AS $$
BEGIN
    -- Update user's subscription_id when subscription becomes active
    IF NEW.status = 'active' THEN
        UPDATE public.users 
        SET subscription_id = NEW.id
        WHERE id = NEW.user_id;
    END IF;
    
    -- Clear user's subscription_id when subscription is cancelled/expired
    IF NEW.status IN ('cancelled', 'expired') THEN
        UPDATE public.users 
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

-- 10. CREATE FUNCTION TO SYNC AUTH USERS TO PUBLIC USERS
-- This function ensures that when a user signs up, they get a record in public.users
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.users (id, email, created_at)
    VALUES (NEW.id, NEW.email, NOW())
    ON CONFLICT (id) DO UPDATE SET
        email = NEW.email,
        updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger on auth.users for new user creation
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT OR UPDATE ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_new_user();

-- Success message
DO $$
BEGIN
    RAISE NOTICE 'Subscription Management System schema migration completed successfully!';
    RAISE NOTICE 'Tables created: users, subscription_plans, subscriptions, payments, subscription_history, admin_actions';
    RAISE NOTICE 'Created public.users table that references auth.users';
    RAISE NOTICE 'Created indexes for optimal query performance';
    RAISE NOTICE 'Added validation triggers and automatic timestamp updates';
    RAISE NOTICE 'Added trigger to sync auth.users with public.users';
    RAISE NOTICE '';
    RAISE NOTICE 'Next step: Run 012_subscription_default_data.sql to insert default plans';
END $$;