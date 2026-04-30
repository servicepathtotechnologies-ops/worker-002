-- Fix subscription upgrades so validation triggers receive both plan ids.
-- Run after 014_subscription_constraints_validation.sql.

CREATE OR REPLACE FUNCTION public.upgrade_subscription(
    p_uid UUID,
    p_plan VARCHAR(50),
    p_pay UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_new_plan_id UUID;
    v_old_subscription_id UUID;
    v_old_plan_id UUID;
    v_old_plan_name VARCHAR(50);
    v_new_subscription_id UUID;
BEGIN
    SELECT id INTO v_new_plan_id
    FROM public.subscription_plans
    WHERE name = p_plan AND is_active = true
    LIMIT 1;

    IF v_new_plan_id IS NULL THEN
        RAISE EXCEPTION 'Plan % not found', p_plan;
    END IF;

    SELECT s.id, s.plan_id, sp.name
    INTO v_old_subscription_id, v_old_plan_id, v_old_plan_name
    FROM public.subscriptions s
    JOIN public.subscription_plans sp ON sp.id = s.plan_id
    WHERE s.user_id = p_uid AND s.status = 'active'
    ORDER BY s.started_at DESC
    LIMIT 1
    FOR UPDATE OF s;

    IF v_old_plan_id = v_new_plan_id THEN
        RETURN v_old_subscription_id;
    END IF;

    IF v_old_subscription_id IS NOT NULL THEN
        UPDATE public.subscriptions
        SET status = 'cancelled', cancelled_at = NOW(), auto_renew = false
        WHERE id = v_old_subscription_id;
    END IF;

    INSERT INTO public.subscriptions (user_id, plan_id, status, started_at, auto_renew)
    VALUES (p_uid, v_new_plan_id, 'active', NOW(), true)
    RETURNING id INTO v_new_subscription_id;

    INSERT INTO public.subscription_history (
        user_id, subscription_id, action, from_plan_id, to_plan_id, payment_id, notes
    )
    VALUES (
        p_uid,
        v_new_subscription_id,
        CASE WHEN v_old_plan_id IS NULL THEN 'created' ELSE 'upgraded' END,
        v_old_plan_id,
        v_new_plan_id,
        p_pay,
        CASE
            WHEN v_old_plan_name IS NULL THEN 'Subscription created as ' || p_plan
            ELSE 'Subscription changed from ' || v_old_plan_name || ' to ' || p_plan
        END
    );

    IF p_pay IS NOT NULL THEN
        UPDATE public.payments
        SET subscription_id = v_new_subscription_id
        WHERE id = p_pay AND user_id = p_uid;
    END IF;

    RETURN v_new_subscription_id;
END;
$$;

