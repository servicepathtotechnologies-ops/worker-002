-- ============================================================
-- FINAL SETUP — PART 3: PL/pgSQL FUNCTIONS
-- Paste each function block SEPARATELY in Supabase SQL Editor
-- Run them one at a time
-- ============================================================

-- ── Function 1: ensure_free_subscription ─────────────────────
CREATE OR REPLACE FUNCTION public.ensure_free_subscription(p_uid UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    found_sub_id UUID;
    found_plan_id UUID;
    new_sub_id UUID;
BEGIN
    -- Return existing active subscription if any
    SELECT id INTO found_sub_id
    FROM public.subscriptions
    WHERE user_id = p_uid AND status = 'active'
    LIMIT 1;

    IF found_sub_id IS NOT NULL THEN
        RETURN found_sub_id;
    END IF;

    -- Get Free plan
    SELECT id INTO found_plan_id
    FROM public.subscription_plans
    WHERE name = 'Free' AND is_active = true
    LIMIT 1;

    IF found_plan_id IS NULL THEN
        RAISE EXCEPTION 'Free plan not found in subscription_plans table';
    END IF;

    -- Create Free subscription
    INSERT INTO public.subscriptions (user_id, plan_id, status, started_at)
    VALUES (p_uid, found_plan_id, 'active', NOW())
    RETURNING id INTO new_sub_id;

    -- Log it
    INSERT INTO public.subscription_history (user_id, subscription_id, action, to_plan_id, notes)
    VALUES (p_uid, new_sub_id, 'created', found_plan_id, 'Auto-created Free subscription');

    RETURN new_sub_id;
END;
$$;
