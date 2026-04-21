-- ============================================================
-- FINAL SETUP — PART 2: TRIGGERS + FUNCTIONS
-- Paste this in a NEW Supabase SQL Editor query AFTER Part 1 succeeds
-- ============================================================

-- Trigger: auto-update updated_at
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

-- Trigger: enforce one active subscription per user
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

-- Trigger: keep users.subscription_id in sync
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

-- Trigger: auto-create public.users row when auth user signs up
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    INSERT INTO public.users (id, email, created_at)
    VALUES (NEW.id, NEW.email, NOW())
    ON CONFLICT (id) DO UPDATE SET email = NEW.email, updated_at = NOW();
    RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
    AFTER INSERT OR UPDATE ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Function: get_user_subscription_details (pure SQL — no variables)
CREATE OR REPLACE FUNCTION public.get_user_subscription_details(p_uid UUID)
RETURNS TABLE(
    user_id UUID, subscription_id UUID, plan_id UUID, plan_name VARCHAR(50),
    status VARCHAR(20), workflow_limit INTEGER, workflow_count INTEGER,
    started_at TIMESTAMPTZ, expires_at TIMESTAMPTZ, cancelled_at TIMESTAMPTZ, auto_renew BOOLEAN
)
LANGUAGE sql SECURITY DEFINER AS $$
    SELECT
        u.id,
        s.id,
        sp.id,
        sp.name,
        s.status,
        sp.workflow_limit,
        u.workflow_count,
        s.started_at,
        s.expires_at,
        s.cancelled_at,
        s.auto_renew
    FROM public.users u
    LEFT JOIN public.subscriptions s ON u.subscription_id = s.id
    LEFT JOIN public.subscription_plans sp ON s.plan_id = sp.id
    WHERE u.id = p_uid;
$$;

-- Function: check_workflow_limit (pure SQL — no variables)
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
