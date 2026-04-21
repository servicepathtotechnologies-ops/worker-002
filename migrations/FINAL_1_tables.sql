-- ============================================================
-- FINAL SETUP — PART 1: TABLES
-- Paste this in Supabase SQL Editor and run it first
-- ============================================================

-- Drop old triggers first (on auth.users — needs to go before tables)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- Drop all functions
DROP FUNCTION IF EXISTS public.get_user_subscription_details(UUID) CASCADE;
DROP FUNCTION IF EXISTS public.ensure_free_subscription(UUID) CASCADE;
DROP FUNCTION IF EXISTS public.upgrade_subscription(UUID, VARCHAR, UUID) CASCADE;
DROP FUNCTION IF EXISTS public.check_workflow_limit(UUID) CASCADE;
DROP FUNCTION IF EXISTS public.increment_workflow_count(UUID) CASCADE;
DROP FUNCTION IF EXISTS public.decrement_workflow_count(UUID) CASCADE;
DROP FUNCTION IF EXISTS public.update_subscription_updated_at() CASCADE;
DROP FUNCTION IF EXISTS public.validate_single_active_subscription() CASCADE;
DROP FUNCTION IF EXISTS public.update_user_subscription_reference() CASCADE;
DROP FUNCTION IF EXISTS public.handle_new_user() CASCADE;

-- Drop all tables
DROP TABLE IF EXISTS public.admin_actions CASCADE;
DROP TABLE IF EXISTS public.subscription_history CASCADE;
DROP TABLE IF EXISTS public.payments CASCADE;
DROP TABLE IF EXISTS public.subscriptions CASCADE;
DROP TABLE IF EXISTS public.subscription_plans CASCADE;
DROP TABLE IF EXISTS public.users CASCADE;

-- Create tables
CREATE TABLE public.users (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT,
    subscription_id UUID,
    workflow_count INTEGER DEFAULT 0,
    last_workflow_check TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE public.subscription_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(50) NOT NULL UNIQUE CHECK (name IN ('Free','Pro','Enterprise')),
    workflow_limit INTEGER NOT NULL CHECK (workflow_limit > 0),
    price_inr INTEGER NOT NULL CHECK (price_inr >= 0),
    features JSONB NOT NULL DEFAULT '[]',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE public.subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    plan_id UUID NOT NULL REFERENCES public.subscription_plans(id),
    status VARCHAR(20) NOT NULL DEFAULT 'active'
        CHECK (status IN ('active','expired','cancelled','pending')),
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ,
    cancelled_at TIMESTAMPTZ,
    auto_renew BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.users
    ADD CONSTRAINT fk_users_subscription
    FOREIGN KEY (subscription_id) REFERENCES public.subscriptions(id);

CREATE TABLE public.payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id),
    subscription_id UUID REFERENCES public.subscriptions(id),
    razorpay_order_id VARCHAR(100) NOT NULL,
    razorpay_payment_id VARCHAR(100),
    razorpay_signature VARCHAR(500),
    amount_inr INTEGER NOT NULL CHECK (amount_inr > 0),
    currency VARCHAR(3) DEFAULT 'INR' CHECK (currency = 'INR'),
    status VARCHAR(20) NOT NULL DEFAULT 'created'
        CHECK (status IN ('created','attempted','paid','failed','refunded')),
    payment_method VARCHAR(50),
    failure_reason TEXT,
    webhook_received_at TIMESTAMPTZ,
    verified_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE public.subscription_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id),
    subscription_id UUID NOT NULL REFERENCES public.subscriptions(id),
    action VARCHAR(50) NOT NULL
        CHECK (action IN ('created','upgraded','downgraded','cancelled','expired','renewed','admin_modified')),
    from_plan_id UUID REFERENCES public.subscription_plans(id),
    to_plan_id UUID REFERENCES public.subscription_plans(id),
    payment_id UUID REFERENCES public.payments(id),
    admin_user_id UUID REFERENCES public.users(id),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE public.admin_actions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_user_id UUID NOT NULL REFERENCES public.users(id),
    target_user_id UUID REFERENCES public.users(id),
    action VARCHAR(100) NOT NULL CHECK (LENGTH(action) > 0),
    details JSONB DEFAULT '{}',
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_users_sub ON public.users(subscription_id);
CREATE INDEX idx_subs_user ON public.subscriptions(user_id);
CREATE INDEX idx_subs_status ON public.subscriptions(status);
CREATE INDEX idx_pay_user ON public.payments(user_id);
CREATE INDEX idx_pay_order ON public.payments(razorpay_order_id);
CREATE INDEX idx_hist_user ON public.subscription_history(user_id);

-- Insert default plans (₹1 test pricing)
INSERT INTO public.subscription_plans (name, workflow_limit, price_inr, features) VALUES
('Free',       2,   0,   '["2 workflows","Basic support","Community access"]'),
('Pro',        20,  100, '["20 workflows","Priority support","Advanced features","API access"]'),
('Enterprise', 999, 100, '["999 workflows","24/7 support","Custom integrations","Dedicated account manager","SLA guarantee"]');

-- Sync existing auth users into public.users
INSERT INTO public.users (id, email, created_at)
SELECT id, email, created_at FROM auth.users
ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, updated_at = NOW();
