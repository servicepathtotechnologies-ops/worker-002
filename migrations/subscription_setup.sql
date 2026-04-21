-- ============================================================
-- PART 1: DROP OLD FUNCTIONS (run this block first)
-- ============================================================

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

-- ============================================================
-- PART 2: DROP OLD TABLES
-- ============================================================

DROP TABLE IF EXISTS public.admin_actions CASCADE;
DROP TABLE IF EXISTS public.subscription_history CASCADE;
DROP TABLE IF EXISTS public.payments CASCADE;
DROP TABLE IF EXISTS public.subscriptions CASCADE;
DROP TABLE IF EXISTS public.subscription_plans CASCADE;
DROP TABLE IF EXISTS public.users CASCADE;

-- ============================================================
-- PART 3: CREATE TABLES
-- ============================================================

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
    name VARCHAR(50) NOT NULL UNIQUE,
    workflow_limit INTEGER NOT NULL CHECK (workflow_limit > 0),
    price_inr INTEGER NOT NULL CHECK (price_inr >= 0),
    features JSONB NOT NULL DEFAULT '[]',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT valid_plan_name CHECK (name IN ('Free', 'Pro', 'Enterprise'))
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

-- Indexes
CREATE INDEX idx_users_subscription_id ON public.users(subscription_id);
CREATE INDEX idx_users_workflow_count ON public.users(workflow_count);
CREATE INDEX idx_subscription_plans_name ON public.subscription_plans(name);
CREATE INDEX idx_subscriptions_user_id ON public.subscriptions(user_id);
CREATE INDEX idx_subscriptions_status ON public.subscriptions(status);
CREATE INDEX idx_payments_user_id ON public.payments(user_id);
CREATE INDEX idx_payments_razorpay_order_id ON public.payments(razorpay_order_id);
CREATE INDEX idx_subscription_history_user_id ON public.subscription_history(user_id);
CREATE INDEX idx_admin_actions_admin_user_id ON public.admin_actions(admin_user_id);

-- ============================================================
-- PART 4: INSERT DEFAULT PLANS
-- ============================================================

INSERT INTO public.subscription_plans (name, workflow_limit, price_inr, features, is_active)
VALUES
    ('Free',       2,   0,   '["2 workflows", "Basic support", "Community access"]'::jsonb,                                                                  true),
    ('Pro',        20,  100, '["20 workflows", "Priority support", "Advanced features", "API access"]'::jsonb,                                               true),
    ('Enterprise', 999, 100, '["999 workflows", "24/7 support", "Custom integrations", "Dedicated account manager", "SLA guarantee"]'::jsonb,                true);

-- ============================================================
-- PART 5: TRIGGER FUNCTIONS
-- ============================================================

CREATE OR REPLACE FUNCTION public.update_subscription_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_users_updated_at
    BEFORE UPDATE ON public.users
    FOR EACH ROW EXECUTE FUNCTION public.update_subscription_updated_at();

CREATE TRIGGER trg_plans_updated_at
    BEFORE UPDATE ON public.subscription_plans
    FOR EACH ROW EXECUTE FUNCTION public.update_subscription_updated_at();

CREATE TRIGGER trg_subscriptions_updated_at
    BEFORE UPDATE ON public.subscriptions
    FOR EACH ROW EXECUTE FUNCTION public.update_subscription_updated_at();

CREATE TRIGGER trg_payments_updated_at
    BEFORE UPDATE ON public.payments
    FOR EACH ROW EXECUTE FUNCTION public.update_subscription_updated_at();

CREATE OR REPLACE FUNCTION public.validate_single_active_subscription()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.status = 'active' THEN
        UPDATE public.subscriptions
        SET status = 'cancelled', cancelled_at = NOW()
        WHERE user_id = NEW.user_id AND id != NEW.id AND status = 'active';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_single_active_subscription
    BEFORE INSERT OR UPDATE ON public.subscriptions
    FOR EACH ROW EXECUTE FUNCTION public.validate_single_active_subscription();

CREATE OR REPLACE FUNCTION public.update_user_subscription_reference()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.status = 'active' THEN
        UPDATE public.users SET subscription_id = NEW.id WHERE id = NEW.user_id;
    END IF;
    IF NEW.status IN ('cancelled', 'expired') THEN
        UPDATE public.users SET subscription_id = NULL
        WHERE id = NEW.user_id AND subscription_id = NEW.id;
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_user_subscription_ref
    AFTER INSERT OR UPDATE ON public.subscriptions
    FOR EACH ROW EXECUTE FUNCTION public.update_user_subscription_reference();

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    INSERT INTO public.users (id, email, created_at)
    VALUES (NEW.id, NEW.email, NOW())
    ON CONFLICT (id) DO UPDATE SET email = NEW.email, updated_at = NOW();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT OR UPDATE ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- PART 6: UTILITY FUNCTIONS
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_user_subscription_details(p_user_id UUID)
RETURNS TABLE (
    user_id         UUID,
    subscription_id UUID,
    plan_id         UUID,
    plan_name       VARCHAR(50),
    status          VARCHAR(20),
    workflow_limit  INTEGER,
    workflow_count  INTEGER,
    started_at      TIMESTAMPTZ,
    expires_at      TIMESTAMPTZ,
    cancelled_at    TIMESTAMPTZ,
    auto_renew      BOOLEAN
) LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    RETURN QUERY
    SELECT u.id, s.id, sp.id, sp.name, s.status,
           sp.workflow_limit, u.workflow_count,
           s.started_at, s.expires_at, s.cancelled_at, s.auto_renew
    FROM public.users u
    LEFT JOIN public.subscriptions s ON u.subscription_id = s.id
    LEFT JOIN public.subscription_plans sp ON s.plan_id = sp.id
    WHERE u.id = p_user_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.ensure_free_subscription(p_user_id UUID)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    pid UUID;
    sid UUID;
BEGIN
    SELECT id INTO pid FROM public.subscription_plans
    WHERE name = 'Free' AND is_active = true LIMIT 1;

    IF pid IS NULL THEN
        RAISE EXCEPTION 'Free plan not found';
    END IF;

    SELECT id INTO sid FROM public.subscriptions
    WHERE user_id = p_user_id AND status = 'active' LIMIT 1;

    IF sid IS NOT NULL THEN
        RETURN sid;
    END IF;

    INSERT INTO public.subscriptions (user_id, plan_id, status, started_at)
    VALUES (p_user_id, pid, 'active', NOW()) RETURNING id INTO sid;

    INSERT INTO public.subscription_history (user_id, subscription_id, action, to_plan_id, notes)
    VALUES (p_user_id, sid, 'created', pid, 'Auto-created Free subscription');

    RETURN sid;
END;
$$;

CREATE OR REPLACE FUNCTION public.upgrade_subscription(
    p_user_id     UUID,
    p_plan_name   VARCHAR(50),
    p_payment_id  UUID DEFAULT NULL
)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    new_pid UUID;
    old_sid UUID;
    new_sid UUID;
    old_pid UUID;
BEGIN
    SELECT id INTO new_pid FROM public.subscription_plans
    WHERE name = p_plan_name AND is_active = true LIMIT 1;

    IF new_pid IS NULL THEN
        RAISE EXCEPTION 'Plan % not found', p_plan_name;
    END IF;

    SELECT id, plan_id INTO old_sid, old_pid FROM public.subscriptions
    WHERE user_id = p_user_id AND status = 'active' LIMIT 1;

    IF old_sid IS NOT NULL THEN
        UPDATE public.subscriptions SET status = 'cancelled', cancelled_at = NOW()
        WHERE id = old_sid;
    END IF;

    INSERT INTO public.subscriptions (user_id, plan_id, status, started_at)
    VALUES (p_user_id, new_pid, 'active', NOW()) RETURNING id INTO new_sid;

    INSERT INTO public.subscription_history (
        user_id, subscription_id, action, from_plan_id, to_plan_id, payment_id, notes
    ) VALUES (
        p_user_id, new_sid,
        CASE WHEN old_pid IS NULL THEN 'created' ELSE 'upgraded' END,
        old_pid, new_pid, p_payment_id,
        'Subscription changed to ' || p_plan_name
    );

    RETURN new_sid;
END;
$$;

CREATE OR REPLACE FUNCTION public.check_workflow_limit(p_user_id UUID)
RETURNS TABLE (
    can_create    BOOLEAN,
    current_count INTEGER,
    limit_count   INTEGER,
    plan_name     VARCHAR(50)
) LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    RETURN QUERY
    SELECT
        (u.workflow_count < sp.workflow_limit),
        u.workflow_count,
        sp.workflow_limit,
        sp.name
    FROM public.users u
    LEFT JOIN public.subscriptions s ON u.subscription_id = s.id AND s.status = 'active'
    LEFT JOIN public.subscription_plans sp ON s.plan_id = sp.id
    WHERE u.id = p_user_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.increment_workflow_count(p_user_id UUID)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    cnt INTEGER;
    lim INTEGER;
BEGIN
    SELECT u.workflow_count, sp.workflow_limit INTO cnt, lim
    FROM public.users u
    LEFT JOIN public.subscriptions s ON u.subscription_id = s.id AND s.status = 'active'
    LEFT JOIN public.subscription_plans sp ON s.plan_id = sp.id
    WHERE u.id = p_user_id;

    IF cnt IS NULL OR lim IS NULL THEN RETURN FALSE; END IF;
    IF cnt >= lim THEN RETURN FALSE; END IF;

    UPDATE public.users
    SET workflow_count = workflow_count + 1, last_workflow_check = NOW()
    WHERE id = p_user_id;

    RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.decrement_workflow_count(p_user_id UUID)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    UPDATE public.users
    SET workflow_count = GREATEST(0, workflow_count - 1), last_workflow_check = NOW()
    WHERE id = p_user_id;
    RETURN FOUND;
END;
$$;
