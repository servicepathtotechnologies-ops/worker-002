-- Make subscription usage derive from the actual workflows table.
-- This repairs stale public.users.workflow_count values and keeps DB RPCs aligned
-- with the backend service implementation.

UPDATE public.users u
SET workflow_count = COALESCE(w.count, 0),
    last_workflow_check = NOW(),
    updated_at = NOW()
FROM (
    SELECT u2.id, COUNT(w.id)::int AS count
    FROM public.users u2
    LEFT JOIN public.workflows w ON w.user_id = u2.id
    GROUP BY u2.id
) w
WHERE u.id = w.id;

CREATE OR REPLACE FUNCTION public.get_user_subscription_details(p_uid UUID)
RETURNS TABLE (
    user_id UUID,
    subscription_id UUID,
    plan_id UUID,
    plan_name VARCHAR(50),
    status VARCHAR(20),
    workflow_limit INTEGER,
    workflow_count INTEGER,
    started_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    cancelled_at TIMESTAMPTZ,
    auto_renew BOOLEAN
)
LANGUAGE sql
SECURITY DEFINER
AS $$
    SELECT
        u.id,
        s.id,
        sp.id,
        sp.name,
        s.status,
        COALESCE(sp.workflow_limit, 2),
        COALESCE(w.workflow_count, 0)::int,
        s.started_at,
        s.expires_at,
        s.cancelled_at,
        s.auto_renew
    FROM public.users u
    LEFT JOIN public.subscriptions s ON u.subscription_id = s.id
    LEFT JOIN public.subscription_plans sp ON s.plan_id = sp.id
    LEFT JOIN (
        SELECT user_id, COUNT(*)::int AS workflow_count
        FROM public.workflows
        GROUP BY user_id
    ) w ON w.user_id = u.id
    WHERE u.id = p_uid;
$$;

CREATE OR REPLACE FUNCTION public.check_workflow_limit(p_uid UUID)
RETURNS TABLE (
    can_create BOOLEAN,
    current_count INTEGER,
    limit_count INTEGER,
    plan_name VARCHAR(50)
)
LANGUAGE sql
SECURITY DEFINER
AS $$
    SELECT
        (COALESCE(w.workflow_count, 0) < COALESCE(sp.workflow_limit, 2)),
        COALESCE(w.workflow_count, 0)::int,
        COALESCE(sp.workflow_limit, 2),
        COALESCE(sp.name, 'Free')
    FROM public.users u
    LEFT JOIN public.subscriptions s ON u.subscription_id = s.id AND s.status = 'active'
    LEFT JOIN public.subscription_plans sp ON s.plan_id = sp.id
    LEFT JOIN (
        SELECT user_id, COUNT(*)::int AS workflow_count
        FROM public.workflows
        GROUP BY user_id
    ) w ON w.user_id = u.id
    WHERE u.id = p_uid;
$$;

CREATE OR REPLACE FUNCTION public.increment_workflow_count(p_uid UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    actual_count INTEGER;
BEGIN
    SELECT COUNT(*)::int INTO actual_count
    FROM public.workflows
    WHERE user_id = p_uid;

    UPDATE public.users
    SET workflow_count = actual_count,
        last_workflow_check = NOW(),
        updated_at = NOW()
    WHERE id = p_uid;

    RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.decrement_workflow_count(p_uid UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    actual_count INTEGER;
BEGIN
    SELECT COUNT(*)::int INTO actual_count
    FROM public.workflows
    WHERE user_id = p_uid;

    UPDATE public.users
    SET workflow_count = actual_count,
        last_workflow_check = NOW(),
        updated_at = NOW()
    WHERE id = p_uid;

    RETURN FOUND;
END;
$$;

