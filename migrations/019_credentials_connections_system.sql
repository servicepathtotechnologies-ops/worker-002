-- ============================================
-- Credentials and Connections System
-- n8n-style reusable encrypted connections, OAuth state, node/credential registry metadata
-- ============================================

CREATE TABLE IF NOT EXISTS public.credential_types (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  display_name TEXT NOT NULL,
  auth_type TEXT NOT NULL CHECK (auth_type IN ('oauth2', 'api_key', 'bearer_token', 'basic_auth', 'custom_header', 'query_auth')),
  schema JSONB NOT NULL DEFAULT '{}'::jsonb,
  form_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  validation_rules JSONB NOT NULL DEFAULT '{}'::jsonb,
  test_request JSONB,
  injection_rules JSONB NOT NULL DEFAULT '[]'::jsonb,
  refresh_rules JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.node_definitions (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  provider TEXT,
  category TEXT NOT NULL,
  resources JSONB NOT NULL DEFAULT '[]'::jsonb,
  input_fields JSONB NOT NULL DEFAULT '[]'::jsonb,
  output_schema JSONB NOT NULL DEFAULT '{}'::jsonb,
  credential_requirements JSONB NOT NULL DEFAULT '[]'::jsonb,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.node_operations (
  id TEXT PRIMARY KEY,
  node_definition_id TEXT NOT NULL REFERENCES public.node_definitions(id) ON DELETE CASCADE,
  resource TEXT NOT NULL,
  operation TEXT NOT NULL,
  display_name TEXT NOT NULL,
  method TEXT,
  path TEXT,
  input_fields JSONB NOT NULL DEFAULT '[]'::jsonb,
  output_schema JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(node_definition_id, resource, operation)
);

CREATE TABLE IF NOT EXISTS public.connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  credential_type_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  auth_type TEXT NOT NULL CHECK (auth_type IN ('oauth2', 'api_key', 'bearer_token', 'basic_auth', 'custom_header', 'query_auth')),
  encrypted_credentials TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'expired', 'error', 'revoked')),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  expires_at TIMESTAMPTZ,
  last_tested_at TIMESTAMPTZ,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_connections_user_provider ON public.connections(user_id, provider);
CREATE INDEX IF NOT EXISTS idx_connections_user_type ON public.connections(user_id, credential_type_id);
CREATE INDEX IF NOT EXISTS idx_connections_status_expires ON public.connections(status, expires_at);

CREATE TABLE IF NOT EXISTS public.oauth_states (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  credential_type_id TEXT NOT NULL,
  connection_id UUID,
  state_hash TEXT NOT NULL UNIQUE,
  code_verifier TEXT,
  redirect_uri TEXT NOT NULL,
  scopes JSONB NOT NULL DEFAULT '[]'::jsonb,
  return_to TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_oauth_states_expiry ON public.oauth_states(expires_at) WHERE consumed_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_oauth_states_user_provider ON public.oauth_states(user_id, provider);

CREATE TABLE IF NOT EXISTS public.workflow_execution_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id VARCHAR(255) NOT NULL,
  execution_id VARCHAR(255) NOT NULL,
  correlation_id VARCHAR(255) NOT NULL,
  node_id VARCHAR(255),
  node_name VARCHAR(255),
  event VARCHAR(100) NOT NULL,
  level VARCHAR(20) NOT NULL DEFAULT 'info',
  timestamp TIMESTAMPTZ NOT NULL DEFAULT now(),
  duration_ms INTEGER,
  input_data JSONB,
  output_data JSONB,
  error_data JSONB,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_credentials_audit_event ON public.workflow_execution_logs(event)
  WHERE workflow_id = 'credentials';

COMMENT ON TABLE public.connections IS 'Reusable encrypted user connections for workflow nodes';
COMMENT ON COLUMN public.connections.encrypted_credentials IS 'AES-256-GCM encrypted credential JSON payload';
COMMENT ON TABLE public.oauth_states IS 'Short-lived OAuth state and PKCE verifier storage';
