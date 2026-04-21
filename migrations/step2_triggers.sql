-- STEP 2: Run this after step1 succeeds.

CREATE OR REPLACE FUNCTION public.update_subscription_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$;

CREATE TRIGGER t1 BEFORE UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION public.update_subscription_updated_at();
CREATE TRIGGER t2 BEFORE UPDATE ON public.subscription_plans FOR EACH ROW EXECUTE FUNCTION public.update_subscription_updated_at();
CREATE TRIGGER t3 BEFORE UPDATE ON public.subscriptions FOR EACH ROW EXECUTE FUNCTION public.update_subscription_updated_at();
CREATE TRIGGER t4 BEFORE UPDATE ON public.payments FOR EACH ROW EXECUTE FUNCTION public.update_subscription_updated_at();

CREATE OR REPLACE FUNCTION public.validate_single_active_subscription()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.status = 'active' THEN
        UPDATE public.subscriptions SET status='cancelled', cancelled_at=NOW()
        WHERE user_id=NEW.user_id AND id!=NEW.id AND status='active';
    END IF;
    RETURN NEW;
END; $$;

CREATE TRIGGER t5 BEFORE INSERT OR UPDATE ON public.subscriptions
    FOR EACH ROW EXECUTE FUNCTION public.validate_single_active_subscription();

CREATE OR REPLACE FUNCTION public.update_user_subscription_reference()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.status = 'active' THEN
        UPDATE public.users SET subscription_id=NEW.id WHERE id=NEW.user_id;
    END IF;
    IF NEW.status IN ('cancelled','expired') THEN
        UPDATE public.users SET subscription_id=NULL WHERE id=NEW.user_id AND subscription_id=NEW.id;
    END IF;
    RETURN NEW;
END; $$;

CREATE TRIGGER t6 AFTER INSERT OR UPDATE ON public.subscriptions
    FOR EACH ROW EXECUTE FUNCTION public.update_user_subscription_reference();

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    INSERT INTO public.users(id, email, created_at)
    VALUES(NEW.id, NEW.email, NOW())
    ON CONFLICT(id) DO UPDATE SET email=NEW.email, updated_at=NOW();
    RETURN NEW;
END; $$;

CREATE TRIGGER on_auth_user_created AFTER INSERT OR UPDATE ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
