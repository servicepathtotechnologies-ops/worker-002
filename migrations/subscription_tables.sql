-- Run this AFTER the cleanup query

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
    name VARCHAR(50) NOT NULL UNIQUE CHECK (name IN ('Free', 'Pro', 'Enterprise')),
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
    status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'expired', 'cancelled', 'pending')),
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
    status VARCHAR(20) NOT NULL DEFAULT 'created' CHECK (status IN ('created', 'attempted', 'paid', 'failed', 'refunded')),
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
    action VARCHAR(50) NOT NULL CHECK (action IN ('created', 'upgraded', 'downgraded', 'cancelled', 'expired', 'renewed', 'admin_modified')),
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

CREATE INDEX idx_users_subscription_id ON public.users(subscription_id);
CREATE INDEX idx_subscriptions_user_id ON public.subscriptions(user_id);
CREATE INDEX idx_subscriptions_status ON public.subscriptions(status);
CREATE INDEX idx_payments_user_id ON public.payments(user_id);
CREATE INDEX idx_payments_razorpay_order_id ON public.payments(razorpay_order_id);
CREATE INDEX idx_subscription_history_user_id ON public.subscription_history(user_id);
CREATE INDEX idx_admin_actions_admin_user_id ON public.admin_actions(admin_user_id);

INSERT INTO public.subscription_plans (name, workflow_limit, price_inr, features, is_active) VALUES
    ('Free',       2,   0,   '["2 workflows", "Basic support", "Community access"]'::jsonb, true),
    ('Pro',        20,  100, '["20 workflows", "Priority support", "Advanced features", "API access"]'::jsonb, true),
    ('Enterprise', 999, 100, '["999 workflows", "24/7 support", "Custom integrations", "Dedicated account manager", "SLA guarantee"]'::jsonb, true);
