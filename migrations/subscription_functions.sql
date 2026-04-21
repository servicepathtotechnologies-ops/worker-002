-- Run this AFTER subscription_tables.sql succeeds

-- Trigger: updated_at
CREATE OR REPLACE FUNCTION public.update_subscription_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$;

CREATE TRIGGER trg_users_updated_at BEFORE UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION public.update_subscription_updated_at();
CREATE TRIGGER trg_plans_updated_at BEFORE UPDATE ON public.subscription_plans FOR EACH ROW EXECUTE FUNCTION public.update_subscription_updated_at();
CREATE TRIGGER trg_subscriptions_updated_at BEFORE UPDATE ON public.subscriptions FOR EACH ROW EXECUTE FUNCTION public.update_subscription_updated_at();
CREATE TRIGGER trg_payments_updated_at BEFORE UPDATE ON public.payments FOR EACH ROW EXECUTE FUNCTION public.update_subscription_updated_at();

-- Trigger: enforce single active subscription
CREATE OR REPLACE FUNCTION public.validate_single_active_subscription()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.status = 'active' THEN
        UPDATE public.subscriptions SET status = 'cancelled', cancelled_at = NOW()
        WHERE user_id = NEW.user_id AND id != NEW.id AND status = 'active';
    END IF;
    RETURN NEW;
END; $$;

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
        UPDATE public.users SET subscription_id = NULL WHERE id = NEW.user_id AND subscription_id = NEW.id;
    END IF;
    RETURN NEW;
END; $$;

CREATE TRIGGER trg_user_subscription_ref
    AFTER INSERT OR UPDATE ON public.subscriptions
    FOR EACH ROW EXECUTE FUNCTION public.update_user_subscription_reference();

-- Trigger: sync new auth users into public.users
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    INSERT INTO public.users (id, email, created_at)
    VALUES (NEW.id, NEW.email, NOW())
    ON CONFLICT (id) DO UPDATE SET email = NEW.email, updated_at = NOW();
    RETURN NEW;
END; $$;

CREATE TRIGGER on_auth_user_created
    AFTER INSERT OR UPDATE ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Function: get_user_subscription_details
CREATE OR REPLACE FUNCTION public.get_user_subscription_details(p_uid UUID)
RETURNS TABLE (
    user_id UUID, subscription_id UUID, plan_id UUID, plan_name VARCHAR(50),
    status VARCHAR(20), workflow_limit INTEGER, workflow_count INTEGER,
    started_at TIMESTAMPTZ, expires_at TIMESTAMPTZ, cancelled_at TIMESTAMPTZ, auto_renew BOOLEAN
) LANGUAGE sql SECURITY DEFINER AS $$
    SELECT u.id, s.id, sp.id, sp.name, s.status, sp.workflow_limit, u.workflow_count,
           s.started_at, s.expires_at, s.cancelled_at, s.auto_renew
    FROM public.users u
    LEFT JOIN public.subscriptions s ON u.subscription_id = s.id
    LEFT JOIN public.subscription_plans sp ON s.plan_id = sp.id
    WHERE u.id = p_uid;
$$;

-- Function: ensure_free_subscription
CREATE OR REPLACE FUNCTION public.ensure_free_subscription(p_uid UUID)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    -- Return existing active subscription if any
    IF EXISTS (SELECT 1 FROM public.subscriptions WHERE user_id = p_uid AND status = 'active') THEN
        RETURN (SELECT id FROM public.subscriptions WHERE user_id = p_uid AND status = 'active' LIMIT 1);
    END IF;

    -- Ensure Free plan exists
    IF NOT EXISTS (SELECT 1 FROM public.subscription_plans WHERE name = 'Free' AND is_active = true) THEN
        RAISE EXCEPTION 'Free plan not found';
    END IF;

    -- Create Free subscription and return its id
    RETURN (
        WITH inserted AS (
            INSERT INTO public.subscriptions (user_id, plan_id, status, started_at)
            SELECT p_uid, id, 'active', NOW()
            FROM public.subscription_plans WHERE name = 'Free' AND is_active = true LIMIT 1
            RETURNING id, plan_id
        ),
        hist AS (
            INSERT INTO public.subscription_history (user_id, subscription_id, action, to_plan_id, notes)
            SELECT p_uid, inserted.id, 'created', inserted.plan_id, 'Auto-created Free subscription'
            FROM inserted
        )
        SELECT id FROM inserted
    );
END; $$;

-- Function: upgrade_subscription
CREATE OR REPLACE FUNCTION public.upgrade_subscription(p_uid UUID, p_plan VARCHAR(50), p_pay UUID DEFAULT NULL)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.subscription_plans WHERE name = p_plan AND is_active = true) THEN
        RAISE EXCEPTION 'Plan % not found', p_plan;
    END IF;

    -- Cancel current active subscription
    UPDATE public.subscriptions SET status = 'cancelled', cancelled_at = NOW()
    WHERE user_id = p_uid AND status = 'active';

    -- Create new subscription and return its id
    RETURN (
        WITH inserted AS (
            INSERT INTO public.subscriptions (user_id, plan_id, status, started_at)
            SELECT p_uid, id, 'active', NOW()
            FROM public.subscription_plans WHERE name = p_plan AND is_active = true LIMIT 1
            RETURNING id, plan_id
        ),
        hist AS (
            INSERT INTO public.subscription_history (user_id, subscription_id, action, to_plan_id, payment_id, notes)
            SELECT p_uid, inserted.id, 'upgraded', inserted.plan_id, p_pay, 'Subscription changed to ' || p_plan
            FROM inserted
        )
        SELECT id FROM inserted
    );
END; $$;

-- Function: check_workflow_limit
CREATE OR REPLACE FUNCTION public.check_workflow_limit(p_uid UUID)
RETURNS TABLE (can_create BOOLEAN, current_count INTEGER, limit_count INTEGER, plan_name VARCHAR(50))
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

-- Function: increment_workflow_count
CREATE OR REPLACE FUNCTION public.increment_workflow_count(p_uid UUID)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM public.users u
        LEFT JOIN public.subscriptions s ON u.subscription_id = s.id AND s.status = 'active'
        LEFT JOIN public.subscription_plans sp ON s.plan_id = sp.id
        WHERE u.id = p_uid AND u.workflow_count < COALESCE(sp.workflow_limit, 2)
    ) THEN
        RETURN FALSE;
    END IF;

    UPDATE public.users
    SET workflow_count = workflow_count + 1, last_workflow_check = NOW()
    WHERE id = p_uid;

    RETURN TRUE;
END; $$;

-- Function: decrement_workflow_count
CREATE OR REPLACE FUNCTION public.decrement_workflow_count(p_uid UUID)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    UPDATE public.users
    SET workflow_count = GREATEST(0, workflow_count - 1), last_workflow_check = NOW()
    WHERE id = p_uid;
    RETURN FOUND;
END; $$;
