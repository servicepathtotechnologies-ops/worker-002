-- ============================================
-- Subscription Default Data + DB Functions
-- Run AFTER 011_subscription_management_schema.sql
-- ============================================

-- Insert default plans (₹1 test pricing)
INSERT INTO public.subscription_plans (name, workflow_limit, price_inr, features, is_active)
VALUES
    ('Free',       2,   0,   '["2 workflows", "Basic support", "Community access"]',                                                                    true),
    ('Pro',        20,  100, '["20 workflows", "Priority support", "Advanced features", "API access"]',                                                 true),
    ('Enterprise', 999, 100, '["999 workflows", "24/7 support", "Custom integrations", "Dedicated account manager", "SLA guarantee"]',                  true)
ON CONFLICT (name) DO UPDATE SET
    workflow_limit = EXCLUDED.workflow_limit,
    price_inr      = EXCLUDED.price_inr,
    features       = EXCLUDED.features,
    is_active      = EXCLUDED.is_active,
    updated_at     = NOW();

-- ── FUNCTION: get_user_subscription_details ──────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_user_subscription_details(target_user_id UUID)
RETURNS TABLE (
    user_id        UUID,
    subscription_id UUID,
    plan_id        UUID,
    plan_name      VARCHAR(50),
    status         VARCHAR(20),
    workflow_limit INTEGER,
    workflow_count INTEGER,
    started_at     TIMESTAMPTZ,
    expires_at     TIMESTAMPTZ,
    cancelled_at   TIMESTAMPTZ,
    auto_renew     BOOLEAN
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        u.id                          AS user_id,
        s.id                          AS subscription_id,
        sp.id                         AS plan_id,
        sp.name                       AS plan_name,
        s.status,
        sp.workflow_limit,
        u.workflow_count,
        s.started_at,
        s.expires_at,
        s.cancelled_at,
        s.auto_renew
    FROM public.users u
    LEFT JOIN public.subscriptions s
           ON u.subscription_id = s.id
    LEFT JOIN public.subscription_plans sp
           ON s.plan_id = sp.id
    WHERE u.id = target_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── FUNCTION: ensure_free_subscription ───────────────────────────────────────
CREATE OR REPLACE FUNCTION public.ensure_free_subscription(target_user_id UUID)
RETURNS UUID AS $$
DECLARE
    v_free_plan_id        UUID;
    v_new_subscription_id UUID;
BEGIN
    SELECT id INTO v_free_plan_id
    FROM public.subscription_plans
    WHERE name = 'Free' AND is_active = true;

    IF v_free_plan_id IS NULL THEN
        RAISE EXCEPTION 'Free plan not found';
    END IF;

    -- Return existing active subscription if present
    SELECT s.id INTO v_new_subscription_id
    FROM public.subscriptions s
    WHERE s.user_id = target_user_id AND s.status = 'active';

    IF v_new_subscription_id IS NOT NULL THEN
        RETURN v_new_subscription_id;
    END IF;

    -- Create new Free subscription
    INSERT INTO public.subscriptions (user_id, plan_id, status, started_at)
    VALUES (target_user_id, v_free_plan_id, 'active', NOW())
    RETURNING id INTO v_new_subscription_id;

    INSERT INTO public.subscription_history (user_id, subscription_id, action, to_plan_id, notes)
    VALUES (target_user_id, v_new_subscription_id, 'created', v_free_plan_id, 'Auto-created Free subscription');

    RETURN v_new_subscription_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── FUNCTION: upgrade_subscription ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.upgrade_subscription(
    target_user_id UUID,
    new_plan_name  VARCHAR(50),
    payment_id     UUID DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
    v_new_plan_id         UUID;
    v_old_subscription_id UUID;
    v_new_subscription_id UUID;
    v_old_plan_id         UUID;
BEGIN
    SELECT id INTO v_new_plan_id
    FROM public.subscription_plans
    WHERE name = new_plan_name AND is_active = true;

    IF v_new_plan_id IS NULL THEN
        RAISE EXCEPTION 'Plan % not found', new_plan_name;
    END IF;

    SELECT s.id, s.plan_id INTO v_old_subscription_id, v_old_plan_id
    FROM public.subscriptions s
    WHERE s.user_id = target_user_id AND s.status = 'active';

    IF v_old_subscription_id IS NOT NULL THEN
        UPDATE public.subscriptions
        SET status = 'cancelled', cancelled_at = NOW()
        WHERE id = v_old_subscription_id;
    END IF;

    INSERT INTO public.subscriptions (user_id, plan_id, status, started_at)
    VALUES (target_user_id, v_new_plan_id, 'active', NOW())
    RETURNING id INTO v_new_subscription_id;

    INSERT INTO public.subscription_history (
        user_id, subscription_id, action,
        from_plan_id, to_plan_id, payment_id, notes
    ) VALUES (
        target_user_id, v_new_subscription_id,
        CASE WHEN v_old_plan_id IS NULL THEN 'created' ELSE 'upgraded' END,
        v_old_plan_id, v_new_plan_id, payment_id,
        'Subscription upgraded to ' || new_plan_name
    );

    RETURN v_new_subscription_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── FUNCTION: check_workflow_limit ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.check_workflow_limit(target_user_id UUID)
RETURNS TABLE (
    can_create   BOOLEAN,
    current_count INTEGER,
    limit_count  INTEGER,
    plan_name    VARCHAR(50)
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        (u.workflow_count < sp.workflow_limit) AS can_create,
        u.workflow_count                        AS current_count,
        sp.workflow_limit                       AS limit_count,
        sp.name                                 AS plan_name
    FROM public.users u
    LEFT JOIN public.subscriptions s
           ON u.subscription_id = s.id AND s.status = 'active'
    LEFT JOIN public.subscription_plans sp
           ON s.plan_id = sp.id
    WHERE u.id = target_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── FUNCTION: increment_workflow_count ───────────────────────────────────────
CREATE OR REPLACE FUNCTION public.increment_workflow_count(target_user_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
    v_current_count INTEGER;
    v_limit_count   INTEGER;
BEGIN
    SELECT u.workflow_count, sp.workflow_limit
    INTO v_current_count, v_limit_count
    FROM public.users u
    LEFT JOIN public.subscriptions s
           ON u.subscription_id = s.id AND s.status = 'active'
    LEFT JOIN public.subscription_plans sp
           ON s.plan_id = sp.id
    WHERE u.id = target_user_id;

    IF v_current_count IS NULL OR v_limit_count IS NULL THEN
        RETURN FALSE;
    END IF;

    IF v_current_count >= v_limit_count THEN
        RETURN FALSE;
    END IF;

    UPDATE public.users
    SET workflow_count = workflow_count + 1,
        last_workflow_check = NOW()
    WHERE id = target_user_id;

    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── FUNCTION: decrement_workflow_count ───────────────────────────────────────
CREATE OR REPLACE FUNCTION public.decrement_workflow_count(target_user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    UPDATE public.users
    SET workflow_count = GREATEST(0, workflow_count - 1),
        last_workflow_check = NOW()
    WHERE id = target_user_id;

    RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
