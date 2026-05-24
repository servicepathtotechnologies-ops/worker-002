-- Gemini BYOK wallet support.
-- User API keys are stored in the existing encrypted connections table; this
-- table stores only wallet state and the active connection pointer.

CREATE TABLE IF NOT EXISTS public.user_ai_wallet_settings (
  user_id TEXT NOT NULL,
  provider TEXT NOT NULL DEFAULT 'gemini',
  active_connection_id UUID,
  enabled BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'empty',
  last_validated_at TIMESTAMPTZ,
  last_used_at TIMESTAMPTZ,
  last_error_code TEXT,
  last_error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, provider),
  CONSTRAINT user_ai_wallet_provider_check CHECK (provider = 'gemini'),
  CONSTRAINT user_ai_wallet_status_check CHECK (
    status IN ('empty', 'active', 'invalid', 'quota_exceeded', 'error', 'disabled')
  )
);

CREATE INDEX IF NOT EXISTS idx_user_ai_wallet_settings_connection
  ON public.user_ai_wallet_settings(active_connection_id);

CREATE TABLE IF NOT EXISTS public.ai_wallet_usage_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  provider TEXT NOT NULL DEFAULT 'gemini',
  model TEXT,
  source TEXT,
  prompt_tokens INTEGER NOT NULL DEFAULT 0,
  completion_tokens INTEGER NOT NULL DEFAULT 0,
  total_tokens INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'success',
  error_code TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ai_wallet_usage_provider_check CHECK (provider = 'gemini'),
  CONSTRAINT ai_wallet_usage_status_check CHECK (status IN ('success', 'error'))
);

CREATE INDEX IF NOT EXISTS idx_ai_wallet_usage_events_user_created
  ON public.ai_wallet_usage_events(user_id, created_at DESC);

ALTER TABLE public.workflows
  ADD COLUMN IF NOT EXISTS quota_source TEXT NOT NULL DEFAULT 'subscription';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'workflows_quota_source_check'
      AND conrelid = 'public.workflows'::regclass
  ) THEN
    ALTER TABLE public.workflows
      ADD CONSTRAINT workflows_quota_source_check
      CHECK (quota_source IN ('subscription', 'gemini_wallet'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_workflows_user_quota_source
  ON public.workflows(user_id, quota_source);
