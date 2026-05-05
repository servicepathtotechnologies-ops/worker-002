-- Migration 022: execution dashboard and polling performance indexes
-- Keeps workflow run lists, execution detail lookups, and role checks off slow scans.

CREATE INDEX IF NOT EXISTS idx_executions_user_workflow_started_desc
  ON public.executions(user_id, workflow_id, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_executions_user_workflow_id
  ON public.executions(user_id, workflow_id, id);

ALTER TABLE public.executions
  ADD COLUMN IF NOT EXISTS ai_usage JSONB;

CREATE INDEX IF NOT EXISTS idx_executions_user_workflow_started_id_desc
  ON public.executions(user_id, workflow_id, started_at DESC, id);

CREATE INDEX IF NOT EXISTS idx_execution_steps_execution_sequence
  ON public.execution_steps(execution_id, sequence);

CREATE INDEX IF NOT EXISTS idx_execution_steps_execution_status_sequence
  ON public.execution_steps(execution_id, status, sequence);

CREATE INDEX IF NOT EXISTS idx_user_roles_user_id
  ON public.user_roles(user_id);

CREATE INDEX IF NOT EXISTS idx_workflows_user_updated_desc
  ON public.workflows(user_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_workflows_user_id
  ON public.workflows(user_id, id);

DO $$
BEGIN
  IF to_regclass('public.identity_links') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_identity_links_linked_user_id
      ON public.identity_links(linked_user_id);
  END IF;

  IF to_regclass('public.google_oauth_tokens') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_google_oauth_tokens_user_id
      ON public.google_oauth_tokens(user_id);
  END IF;

  IF to_regclass('public.linkedin_oauth_tokens') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_linkedin_oauth_tokens_user_id
      ON public.linkedin_oauth_tokens(user_id);
  END IF;

  IF to_regclass('public.connections') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_connections_user_updated_desc
      ON public.connections(user_id, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_connections_user_status_expires
      ON public.connections(user_id, status, expires_at);
  END IF;
END $$;
