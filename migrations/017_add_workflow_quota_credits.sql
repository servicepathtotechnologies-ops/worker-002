-- Additive workflow quota model.
-- Free is the base allowance; every successful paid purchase adds that plan's
-- workflow_limit as extra credits.

ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS workflow_quota_bonus INTEGER NOT NULL DEFAULT 0;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'check_workflow_quota_bonus_non_negative'
          AND conrelid = 'public.users'::regclass
    ) THEN
        ALTER TABLE public.users
        ADD CONSTRAINT check_workflow_quota_bonus_non_negative
        CHECK (workflow_quota_bonus >= 0);
    END IF;
END $$;

WITH paid_payment_plans AS (
    SELECT DISTINCT ON (p.id)
        p.id,
        p.user_id,
        COALESCE(sh.to_plan_id, s.plan_id) AS plan_id
    FROM public.payments p
    LEFT JOIN public.subscription_history sh ON sh.payment_id = p.id
    LEFT JOIN public.subscriptions s ON s.id = p.subscription_id
    WHERE p.status = 'paid'
    ORDER BY p.id, sh.created_at DESC NULLS LAST
),
paid_plan_credits AS (
    SELECT
        ppp.user_id,
        SUM(sp.workflow_limit)::int AS purchased_credits
    FROM paid_payment_plans ppp
    JOIN public.subscription_plans sp ON sp.id = ppp.plan_id
    WHERE sp.name <> 'Free'
    GROUP BY ppp.user_id
)
UPDATE public.users u
SET workflow_quota_bonus = COALESCE(paid_plan_credits.purchased_credits, 0),
    updated_at = NOW()
FROM paid_plan_credits
WHERE u.id = paid_plan_credits.user_id;

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
        COALESCE(sp.name, 'Free'),
        COALESCE(s.status, 'active'),
        COALESCE(free_plan.workflow_limit, 2) + COALESCE(u.workflow_quota_bonus, 0),
        COALESCE(w.workflow_count, 0)::int,
        COALESCE(s.started_at, u.created_at),
        s.expires_at,
        s.cancelled_at,
        COALESCE(s.auto_renew, false)
    FROM public.users u
    LEFT JOIN public.subscriptions s ON u.subscription_id = s.id AND s.status = 'active'
    LEFT JOIN public.subscription_plans sp ON s.plan_id = sp.id
    LEFT JOIN public.subscription_plans free_plan ON free_plan.name = 'Free' AND free_plan.is_active = true
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
        (COALESCE(w.workflow_count, 0) < (COALESCE(free_plan.workflow_limit, 2) + COALESCE(u.workflow_quota_bonus, 0))),
        COALESCE(w.workflow_count, 0)::int,
        COALESCE(free_plan.workflow_limit, 2) + COALESCE(u.workflow_quota_bonus, 0),
        COALESCE(sp.name, 'Free')
    FROM public.users u
    LEFT JOIN public.subscriptions s ON u.subscription_id = s.id AND s.status = 'active'
    LEFT JOIN public.subscription_plans sp ON s.plan_id = sp.id
    LEFT JOIN public.subscription_plans free_plan ON free_plan.name = 'Free' AND free_plan.is_active = true
    LEFT JOIN (
        SELECT user_id, COUNT(*)::int AS workflow_count
        FROM public.workflows
        GROUP BY user_id
    ) w ON w.user_id = u.id
    WHERE u.id = p_uid;
$$;
