-- Canonical credential store.
-- Legacy credential tables remain in place for audit/migration history only.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS unified_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  scope_set TEXT NOT NULL,
  access_token TEXT,
  refresh_token TEXT,
  expires_at TIMESTAMPTZ,
  raw_token_blob JSONB,
  source TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT unified_credentials_provider_nonempty CHECK (length(trim(provider)) > 0),
  CONSTRAINT unified_credentials_scope_set_nonempty CHECK (length(trim(scope_set)) > 0),
  CONSTRAINT unified_credentials_user_provider_scope_unique UNIQUE (user_id, provider, scope_set)
);

CREATE INDEX IF NOT EXISTS idx_unified_credentials_user_provider
  ON unified_credentials(user_id, provider)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_unified_credentials_updated
  ON unified_credentials(updated_at DESC);

CREATE OR REPLACE FUNCTION update_unified_credentials_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_unified_credentials_updated_at ON unified_credentials;
CREATE TRIGGER trg_unified_credentials_updated_at
  BEFORE UPDATE ON unified_credentials
  FOR EACH ROW
  EXECUTE FUNCTION update_unified_credentials_updated_at();

ALTER TABLE workflows
  ADD COLUMN IF NOT EXISTS webhook_secret TEXT;

CREATE INDEX IF NOT EXISTS idx_workflows_webhook_secret
  ON workflows(webhook_secret)
  WHERE webhook_secret IS NOT NULL;

