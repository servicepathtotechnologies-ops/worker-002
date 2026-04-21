-- ── Function 2: upgrade_subscription ─────────────────────────
CREATE OR REPLACE FUNCTION public.upgrade_subscription(p_uid UUID, p_plan VARCHAR(50), p_pay UUID DEFAULT NULL)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    found_plan_id UUID;
    new_sub_id UUID;
BEGIN
    SELECT id INTO found_plan_id
    FROM public.subscription_plans
    WHERE name = p_plan AND is_active = true
    LIMIT 1;

    IF found_plan_id IS NULL THEN
        RAISE EXCEPTION 'Plan % not found', p_plan;
    END IF;

    -- Cancel existing active subscription
    UPDATE public.subscriptions
    SET status = 'cancelled', cancelled_at = NOW()
    WHERE user_id = p_uid AND status = 'active';

    -- Create new subscription
    INSERT INTO public.subscriptions (user_id, plan_id, status, started_at)
    VALUES (p_uid, found_plan_id, 'active', NOW())
    RETURNING id INTO new_sub_id;

    -- Log it
    INSERT INTO public.subscription_history (user_id, subscription_id, action, to_plan_id, payment_id, notes)
    VALUES (p_uid, new_sub_id, 'upgraded', found_plan_id, p_pay, 'Subscription changed to ' || p_plan);

    RETURN new_sub_id;
END;
$$;

-- ── Function 3: increment_workflow_count ─────────────────────
CREATE OR REPLACE FUNCTION public.increment_workflow_count(p_uid UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    current_wf_count INTEGER;
    current_wf_limit INTEGER;
BEGIN
    SELECT u.workflow_count, COALESCE(sp.workflow_limit, 2)
    INTO current_wf_count, current_wf_limit
    FROM public.users u
    LEFT JOIN public.subscriptions s ON u.subscription_id = s.id AND s.status = 'active'
    LEFT JOIN public.subscription_plans sp ON s.plan_id = sp.id
    WHERE u.id = p_uid;

    IF current_wf_count IS NULL THEN
        RETURN FALSE;
    END IF;

    IF current_wf_count >= current_wf_limit THEN
        RETURN FALSE;
    END IF;

    UPDATE public.users
    SET workflow_count = workflow_count + 1, last_workflow_check = NOW()
    WHERE id = p_uid;

    RETURN TRUE;
END;
$$;

-- ── Function 4: decrement_workflow_count ─────────────────────
CREATE OR REPLACE FUNCTION public.decrement_workflow_count(p_uid UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    UPDATE public.users
    SET workflow_count = GREATEST(0, workflow_count - 1),
        last_workflow_check = NOW()
    WHERE id = p_uid;

    RETURN FOUND;
END;
$$;
