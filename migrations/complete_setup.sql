-- ============================================================
-- COMPLETE SUBSCRIPTION SETUP — Run this entire file at once
-- in Supabase SQL Editor
-- ============================================================

-- STEP 1: DROP EVERYTHING CLEANLY
-- ============================================================
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP TRIGGER IF EXISTS t1 ON public.users;
DROP TRIGGER IF EXISTS t2 ON public.subscription_plans;
DROP TRIGGER IF EXISTS t3 ON public.subscriptions;
DROP TRIGGER IF EXISTS t4 ON public.payments;
DROP TRIGGER IF EXISTS t5 ON public.subscriptions;
DROP TRIGGER IF EXISTS t6 ON public.subscriptions;
DROP TRIGGER IF EXISTS trg_users_updated_at ON public.users;
DROP TRIGGER IF EXISTS trg_plans_updated_at ON public.subscription_plans;
DROP TRIGGER IF EXISTS trg_subscriptions_updated_at ON public.subscriptions;
DROP TRIGGER IF EXISTS trg_payments_updated_at ON public.payments;
DROP TRIGGER IF EXISTS trg_single_active_subscription ON public.subscriptions;
DROP TRIGGER IF EXISTS trg_user_subscription_ref ON public.subscriptions;

DROP FUNCTION IF EXISTS public.get_user_subscription_details CASCADE;
DROP FUNCTION IF EXISTS public.ensure_free_subscription CASCADE;
DROP FUNCTION IF EXISTS public.upgrade_subscription CASCADE;
DROP FUNCTION IF EXISTS public.check_workflow_limit CASCADE;
DROP FUNCTION IF EXISTS public.increment_workflow_count CASCADE;
DROP FUNCTION IF EXISTS public.decrement_workflow_count CASCADE;
DROP FUNCTION IF EXISTS public.update_subscription_updated_at CASCADE;
DROP FUNCTION IF EXISTS public.validate_single_active_subscription CASCADE;
DROP FUNCTION IF EXISTS public.update_user_subscription_reference CASCADE;
DROP FUNCTION IF EXISTS public.handle_new_user CASCADE;

DROP TABLE IF EXISTS public.admin_actions CASCADE;
DROP TABLE IF EXISTS public.subscription_history CASCADE;
DROP TABLE IF EXISTS public.payments CASCADE;
DROP TABLE IF EXISTS public.subscriptions CASCADE;
DROP TABLE IF EXISTS public.subscription_plans CASCADE;
DROP TABLE IF EXISTS public.users CASCADE;

-- STEP 2: CREATE TABLES
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
    status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active','expired','cancelled','pending')),
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
    status VARCHAR(20) NOT NULL DEFAULT 'created' CHECK (status IN ('created','attempted','paid','failed','refunded')),
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
    action VARCHAR(50) NOT NULL CHECK (action IN ('created','upgraded','downgraded','cancelled','expired','renewed','admin_modified')),
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

-- STEP 3: INSERT DEFAULT PLANS (₹1 test pricing)
-- ============================================================
INSERT INTO public.subscription_plans (name, workflow_limit, price_inr, features) VALUES
('Free',       2,   0,   '["2 workflows","Basic support","Community access"]'),
('Pro',        20,  100, '["20 workflows","Priority support","Advanced features","API access"]'),
('Enterprise', 999, 100, '["999 workflows","24/7 support","Custom integrations","Dedicated account manager","SLA guarantee"]');

-- STEP 4: SYNC EXISTING AUTH USERS INTO PUBLIC.USERS
-- ============================================================
INSERT INTO public.users (id, email, created_at)
SELECT id, email, created_at FROM auth.users
ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, updated_at = NOW();

-- STEP 5: TRIGGER FUNCTIONS
-- ============================================================
CREATE OR REPLACE FUNCTION public.update_subscription_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$;

CREATE TRIGGER trg_users_updated_at
    BEFORE UPDATE ON public.users FOR EACH ROW
    EXECUTE FUNCTION public.update_subscription_updated_at();

CREATE TRIGGER trg_plans_updated_at
    BEFORE UPDATE ON public.subscription_plans FOR EACH ROW
    EXECUTE FUNCTION public.update_subscription_updated_at();

CREATE TRIGGER trg_subscriptions_updated_at
    BEFORE UPDATE ON public.subscriptions FOR EACH ROW
    EXECUTE FUNCTION public.update_subscription_updated_at();

CREATE TRIGGER trg_payments_updated_at
    BEFORE UPDATE ON public.payments FOR EACH ROW
    EXECUTE FUNCTION public.update_subscription_updated_at();

CREATE OR REPLACE FUNCTION public.validate_single_active_subscription()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.status = 'active' THEN
        UPDATE public.subscriptions SET status='cancelled', cancelled_at=NOW()
        WHERE user_id=NEW.user_id AND id!=NEW.id AND status='active';
    END IF;
    RETURN NEW;
END; $$;

CREATE TRIGGER trg_single_active_subscription
    BEFORE INSERT OR UPDATE ON public.subscriptions FOR EACH ROW
    EXECUTE FUNCTION public.validate_single_active_subscription();

CREATE OR REPLACE FUNCTION public.update_user_subscription_reference()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.status = 'active' THEN
        UPDATE public.users SET subscription_id=NEW.id WHERE id=NEW.user_id;
    END IF;
    IF NEW.status IN ('cancelled','expired') THEN
        UPDATE public.users SET subscription_id=NULL
        WHERE id=NEW.user_id AND subscription_id=NEW.id;
    END IF;
    RETURN NEW;
END; $$;

CREATE TRIGGER trg_user_subscription_ref
    AFTER INSERT OR UPDATE ON public.subscriptions FOR EACH ROW
    EXECUTE FUNCTION public.update_user_subscription_reference();

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    INSERT INTO public.users(id, email, created_at)
    VALUES(NEW.id, NEW.email, NOW())
    ON CONFLICT(id) DO UPDATE SET email=NEW.email, updated_at=NOW();
    RETURN NEW;
END; $$;

CREATE TRIGGER on_auth_user_created
    AFTER INSERT OR UPDATE ON auth.users FOR EACH ROW
    EXECUTE FUNCTION public.handle_new_user();

-- STEP 6: UTILITY FUNCTIONS (no CTEs with DML — plain plpgsql)
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_user_subscription_details(p_uid UUID)
RETURNS TABLE(
    user_id UUID, subscription_id UUID, plan_id UUID, plan_name VARCHAR(50),
    status VARCHAR(20), workflow_limit INTEGER, workflow_count INTEGER,
    started_at TIMESTAMPTZ, expires_at TIMESTAMPTZ, cancelled_at TIMESTAMPTZ, auto_renew BOOLEAN
) LANGUAGE sql SECURITY DEFINER AS $$
    SELECT u.id, s.id, sp.id, sp.name, s.status,
           sp.workflow_limit, u.workflow_count,
           s.started_at, s.expires_at, s.cancelled_at, s.auto_renew
    FROM public.users u
    LEFT JOIN public.subscriptions s ON u.subscription_id = s.id
    LEFT JOIN public.subscription_plans sp ON s.plan_id = sp.id
    WHERE u.id = p_uid;
$$;

CREATE OR REPLACE FUNCTION public.ensure_free_subscription(p_uid UUID)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_plan_id UUID;
    v_sub_id  UUID;
BEGIN
    SELECT id INTO v_sub_id FROM public.subscriptions
    WHERE user_id = p_uid AND status = 'active' LIMIT 1;
    IF v_sub_id IS NOT NULL THEN RETURN v_sub_id; END IF;

    SELECT id INTO v_plan_id FROM public.subscription_plans
    WHERE name = 'Free' AND is_active = true LIMIT 1;
    IF v_plan_id IS NULL THEN RAISE EXCEPTION 'Free plan not found'; END IF;

    INSERT INTO public.subscriptions (user_id, plan_id, status, started_at)
    VALUES (p_uid, v_plan_id, 'active', NOW()) RETURNING id INTO v_sub_id;

    INSERT INTO public.subscription_history (user_id, subscription_id, action, to_plan_id, notes)
    VALUES (p_uid, v_sub_id, 'created', v_plan_id, 'Auto-created Free subscription');

    RETURN v_sub_id;
END; $$;

CREATE OR REPLACE FUNCTION public.upgrade_subscription(p_uid UUID, p_plan VARCHAR(50), p_pay UUID DEFAULT NULL)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_new_plan_id UUID;
    v_new_sub_id  UUID;
BEGIN
    SELECT id INTO v_new_plan_id FROM public.subscription_plans
    WHERE name = p_plan AND is_active = true LIMIT 1;
    IF v_new_plan_id IS NULL THEN RAISE EXCEPTION 'Plan % not found', p_plan; END IF;

    UPDATE public.subscriptions SET status = 'cancelled', cancelled_at = NOW()
    WHERE user_id = p_uid AND status = 'active';

    INSERT INTO public.subscriptions (user_id, plan_id, status, started_at)
    VALUES (p_uid, v_new_plan_id, 'active', NOW()) RETURNING id INTO v_new_sub_id;

    INSERT INTO public.subscription_history (user_id, subscription_id, action, to_plan_id, payment_id, notes)
    VALUES (p_uid, v_new_sub_id, 'upgraded', v_new_plan_id, p_pay, 'Subscription changed to ' || p_plan);

    RETURN v_new_sub_id;
END; $$;

CREATE OR REPLACE FUNCTION public.check_workflow_limit(p_uid UUID)
RETURNS TABLE(can_create BOOLEAN, current_count INTEGER, limit_count INTEGER, plan_name VARCHAR(50))
LANGUAGE sql SECURITY DEFINER AS $$
    SELECT
        (u.workflow_count < COALESCE(sp.workflow_limit, 2)),
        u.workflow_count,
        COALESCE(sp.workflow_limit, 2),
        COALESCE(sp.name, 'Free')
    FROM public.users u
    LEFT JOIN public.subscriptions s ON u.subscription_id = s.id AND s.status = 'active'
    LEFT JOIN public.subscription_plans sp ON s.plan_id = sp.id
    WHERE u.id = p_uid;
$$;

CREATE OR REPLACE FUNCTION public.increment_workflow_count(p_uid UUID)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_count INTEGER;
    v_limit INTEGER;
BEGIN
    SELECT u.workflow_count, COALESCE(sp.workflow_limit, 2)
    INTO v_count, v_limit
    FROM public.users u
    LEFT JOIN public.subscriptions s ON u.subscription_id = s.id AND s.status = 'active'
    LEFT JOIN public.subscription_plans sp ON s.plan_id = sp.id
    WHERE u.id = p_uid;

    IF v_count IS NULL THEN RETURN FALSE; END IF;
    IF v_count >= v_limit THEN RETURN FALSE; END IF;

    UPDATE public.users SET workflow_count = workflow_count + 1, last_workflow_check = NOW()
    WHERE id = p_uid;
    RETURN TRUE;
END; $$;

CREATE OR REPLACE FUNCTION public.decrement_workflow_count(p_uid UUID)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    UPDATE public.users
    SET workflow_count = GREATEST(0, workflow_count - 1), last_workflow_check = NOW()
    WHERE id = p_uid;
    RETURN FOUND;
END; $$;
