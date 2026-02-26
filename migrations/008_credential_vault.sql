-- ============================================
-- Credential Vault Migration
-- Run this in Supabase SQL Editor
-- ============================================

-- Create credential_vault table
-- Stores encrypted API keys, OAuth tokens, and other credentials
CREATE TABLE IF NOT EXISTS public.credential_vault (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workflow_id UUID REFERENCES public.workflows(id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL CHECK (type IN ('api_key', 'oauth_token', 'oauth_refresh_token', 'basic_auth', 'webhook_secret', 'custom')),
  key VARCHAR(255) NOT NULL,
  encrypted_value TEXT NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at TIMESTAMPTZ,
  
  -- Unique constraint: one credential per user/workflow/key combination
  UNIQUE(user_id, workflow_id, key)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_credential_vault_user_id ON public.credential_vault(user_id);
CREATE INDEX IF NOT EXISTS idx_credential_vault_workflow_id ON public.credential_vault(workflow_id);
CREATE INDEX IF NOT EXISTS idx_credential_vault_key ON public.credential_vault(key);
CREATE INDEX IF NOT EXISTS idx_credential_vault_type ON public.credential_vault(type);
CREATE INDEX IF NOT EXISTS idx_credential_vault_user_key ON public.credential_vault(user_id, key);

-- Create partial index for user-level credentials (workflow_id IS NULL)
CREATE INDEX IF NOT EXISTS idx_credential_vault_user_level ON public.credential_vault(user_id, key) 
  WHERE workflow_id IS NULL;

-- Create GIN index on metadata for JSONB queries
CREATE INDEX IF NOT EXISTS idx_credential_vault_metadata_gin ON public.credential_vault USING GIN (metadata);

-- Add comments
COMMENT ON TABLE public.credential_vault IS 'Secure storage for encrypted API keys, OAuth tokens, and other credentials';
COMMENT ON COLUMN public.credential_vault.encrypted_value IS 'AES-256-GCM encrypted credential value (format: iv:authTag:encrypted)';
COMMENT ON COLUMN public.credential_vault.key IS 'Unique key identifier (e.g., "google_oauth_gmail", "openai_api_key")';
COMMENT ON COLUMN public.credential_vault.metadata IS 'Additional metadata (service, provider, scopes, expires_at, etc.)';
COMMENT ON COLUMN public.credential_vault.workflow_id IS 'Optional: workflow-specific credential (NULL for user-level credentials)';

-- Enable Row Level Security (RLS)
ALTER TABLE public.credential_vault ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (for idempotency)
DROP POLICY IF EXISTS "Users can view own credentials" ON public.credential_vault;
DROP POLICY IF EXISTS "Users can insert own credentials" ON public.credential_vault;
DROP POLICY IF EXISTS "Users can update own credentials" ON public.credential_vault;
DROP POLICY IF EXISTS "Users can delete own credentials" ON public.credential_vault;
DROP POLICY IF EXISTS "Service role can manage credentials" ON public.credential_vault;

-- Policies: Users can only access their own credentials
CREATE POLICY "Users can view own credentials" ON public.credential_vault
  FOR SELECT TO authenticated 
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own credentials" ON public.credential_vault
  FOR INSERT TO authenticated 
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own credentials" ON public.credential_vault
  FOR UPDATE TO authenticated 
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own credentials" ON public.credential_vault
  FOR DELETE TO authenticated 
  USING (auth.uid() = user_id);

-- Service role policy (for worker service)
CREATE POLICY "Service role can manage credentials" ON public.credential_vault
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_credential_vault_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger
CREATE TRIGGER update_credential_vault_updated_at
  BEFORE UPDATE ON public.credential_vault
  FOR EACH ROW
  EXECUTE FUNCTION public.update_credential_vault_updated_at();

-- Optional: Create cleanup function to remove old unused credentials
CREATE OR REPLACE FUNCTION public.cleanup_unused_credentials(days_unused INTEGER DEFAULT 365)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM public.credential_vault
  WHERE last_used_at IS NOT NULL
    AND last_used_at < NOW() - (days_unused || ' days')::INTERVAL;
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

-- Add comment to cleanup function
COMMENT ON FUNCTION public.cleanup_unused_credentials IS 'Removes credentials that have not been used in the specified number of days';

-- Success message
DO $$
BEGIN
  RAISE NOTICE 'Credential vault migration completed successfully!';
  RAISE NOTICE 'Table: credential_vault created';
  RAISE NOTICE 'Indexes: user_id, workflow_id, key, type, user_id+key';
  RAISE NOTICE 'RLS Policies: User access control enabled';
  RAISE NOTICE 'Function: cleanup_unused_credentials() created';
  RAISE NOTICE '';
  RAISE NOTICE '⚠️  IMPORTANT: Set ENCRYPTION_KEY environment variable for production!';
  RAISE NOTICE '   Generate key: node -e "console.log(require(''crypto'').randomBytes(32).toString(''hex''))"';
END $$;
