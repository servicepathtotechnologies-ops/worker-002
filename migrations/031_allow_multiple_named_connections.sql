-- Allow production users to keep multiple named active connections per credential type.
-- Credentials remain isolated by user_id; this only removes the old "one live row" rule.

DROP INDEX IF EXISTS public.idx_connections_one_live_per_user_type;

CREATE INDEX IF NOT EXISTS idx_connections_user_type_status_updated
  ON public.connections(user_id, credential_type_id, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_connections_user_provider_status_updated
  ON public.connections(user_id, provider, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_connections_user_id_lookup
  ON public.connections(user_id, id);
