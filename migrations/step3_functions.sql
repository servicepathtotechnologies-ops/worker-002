-- STEP 3: Run this after step2 succeeds.

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
BEGIN
    IF EXISTS(SELECT 1 FROM public.subscriptions WHERE user_id=p_uid AND status='active') THEN
        RETURN (SELECT id FROM public.subscriptions WHERE user_id=p_uid AND status='active' LIMIT 1);
    END IF;
    IF NOT EXISTS(SELECT 1 FROM public.subscription_plans WHERE name='Free' AND is_active=true) THEN
        RAISE EXCEPTION 'Free plan not found';
    END IF;
    RETURN (
        WITH ins AS (
            INSERT INTO public.subscriptions(user_id, plan_id, status, started_at)
            SELECT p_uid, id, 'active', NOW() FROM public.subscription_plans WHERE name='Free' AND is_active=true LIMIT 1
            RETURNING id, plan_id
        ),
        h AS (
            INSERT INTO public.subscription_history(user_id, subscription_id, action, to_plan_id, notes)
            SELECT p_uid, ins.id, 'created', ins.plan_id, 'Auto Free subscription' FROM ins
        )
        SELECT id FROM ins
    );
END; $$;

CREATE OR REPLACE FUNCTION public.upgrade_subscription(p_uid UUID, p_plan VARCHAR(50), p_pay UUID DEFAULT NULL)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM public.subscription_plans WHERE name=p_plan AND is_active=true) THEN
        RAISE EXCEPTION 'Plan % not found', p_plan;
    END IF;
    UPDATE public.subscriptions SET status='cancelled', cancelled_at=NOW()
    WHERE user_id=p_uid AND status='active';
    RETURN (
        WITH ins AS (
            INSERT INTO public.subscriptions(user_id, plan_id, status, started_at)
            SELECT p_uid, id, 'active', NOW() FROM public.subscription_plans WHERE name=p_plan AND is_active=true LIMIT 1
            RETURNING id, plan_id
        ),
        h AS (
            INSERT INTO public.subscription_history(user_id, subscription_id, action, to_plan_id, payment_id, notes)
            SELECT p_uid, ins.id, 'upgraded', ins.plan_id, p_pay, 'Upgraded to '||p_plan FROM ins
        )
        SELECT id FROM ins
    );
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
    LEFT JOIN public.subscriptions s ON u.subscription_id=s.id AND s.status='active'
    LEFT JOIN public.subscription_plans sp ON s.plan_id=sp.id
    WHERE u.id=p_uid;
$$;

CREATE OR REPLACE FUNCTION public.increment_workflow_count(p_uid UUID)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    IF NOT EXISTS(
        SELECT 1 FROM public.users u
        LEFT JOIN public.subscriptions s ON u.subscription_id=s.id AND s.status='active'
        LEFT JOIN public.subscription_plans sp ON s.plan_id=sp.id
        WHERE u.id=p_uid AND u.workflow_count < COALESCE(sp.workflow_limit, 2)
    ) THEN RETURN FALSE; END IF;
    UPDATE public.users SET workflow_count=workflow_count+1, last_workflow_check=NOW() WHERE id=p_uid;
    RETURN TRUE;
END; $$;

CREATE OR REPLACE FUNCTION public.decrement_workflow_count(p_uid UUID)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    UPDATE public.users SET workflow_count=GREATEST(0,workflow_count-1), last_workflow_check=NOW() WHERE id=p_uid;
    RETURN FOUND;
END; $$;
