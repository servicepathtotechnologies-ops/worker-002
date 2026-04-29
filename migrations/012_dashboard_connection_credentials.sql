-- Dashboard connection credential storage for RDS-backed worker.
-- Keeps login credentials separate from workflow connector credentials.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS user_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  service TEXT NOT NULL,
  credentials JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, service)
);

ALTER TABLE user_credentials DROP CONSTRAINT IF EXISTS user_credentials_service_check;

CREATE INDEX IF NOT EXISTS idx_user_credentials_user_id ON user_credentials(user_id);
CREATE INDEX IF NOT EXISTS idx_user_credentials_service ON user_credentials(service);

DO $$
BEGIN
  IF to_regclass('public.credential_vault') IS NOT NULL THEN
    WITH ranked AS (
      SELECT
        id,
        ROW_NUMBER() OVER (
          PARTITION BY user_id, key
          ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST, id DESC
        ) AS rn
      FROM public.credential_vault
      WHERE workflow_id IS NULL
    )
    DELETE FROM public.credential_vault cv
    USING ranked
    WHERE cv.id = ranked.id
      AND ranked.rn > 1;

    EXECUTE 'CREATE UNIQUE INDEX IF NOT EXISTS idx_credential_vault_user_key_null_workflow_unique
      ON public.credential_vault(user_id, key)
      WHERE workflow_id IS NULL';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION update_user_credentials_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_user_credentials_updated_at ON user_credentials;
CREATE TRIGGER update_user_credentials_updated_at
  BEFORE UPDATE ON user_credentials
  FOR EACH ROW
  EXECUTE FUNCTION update_user_credentials_updated_at();
