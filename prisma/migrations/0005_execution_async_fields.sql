-- Migration 0005: Execution Async Fields
-- Adds columns required for async queue execution, per-node progress tracking,
-- and the execution_steps table used by the retry system.
-- All ALTER TABLE statements use IF NOT EXISTS so this migration is safe to re-run.

-- ============================================================
-- PART 1: Add missing columns to the executions table
-- These were added ad-hoc in the Supabase era but never versioned.
-- ============================================================

ALTER TABLE executions
  ADD COLUMN IF NOT EXISTS user_id TEXT,
  ADD COLUMN IF NOT EXISTS trigger VARCHAR(50) DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS input JSONB,
  ADD COLUMN IF NOT EXISTS output JSONB,
  ADD COLUMN IF NOT EXISTS logs JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS last_heartbeat TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS timeout_seconds INTEGER DEFAULT 3600,
  ADD COLUMN IF NOT EXISTS current_node VARCHAR(255),
  ADD COLUMN IF NOT EXISTS duration_ms INTEGER,
  ADD COLUMN IF NOT EXISTS error TEXT,
  ADD COLUMN IF NOT EXISTS last_error TEXT,
  ADD COLUMN IF NOT EXISTS error_code VARCHAR(128),
  -- NEW: async queue tracking
  ADD COLUMN IF NOT EXISTS queued_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS progress INTEGER DEFAULT 0;

-- Indexes for async query patterns
CREATE INDEX IF NOT EXISTS idx_executions_user_id ON executions(user_id);
CREATE INDEX IF NOT EXISTS idx_executions_queued_at ON executions(queued_at);
CREATE INDEX IF NOT EXISTS idx_executions_current_node ON executions(current_node) WHERE current_node IS NOT NULL;

-- ============================================================
-- PART 2: Create execution_steps table (retry tracking per node)
-- Used by execute-workflow.ts retry-policy to record per-node retries.
-- ============================================================

CREATE TABLE IF NOT EXISTS execution_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  execution_id UUID NOT NULL REFERENCES executions(id) ON DELETE CASCADE,
  node_id VARCHAR(100) NOT NULL,
  node_name VARCHAR(255),
  node_type VARCHAR(100),
  input_json JSONB,
  output_json JSONB,
  status VARCHAR(50) NOT NULL DEFAULT 'pending',
  sequence INTEGER NOT NULL DEFAULT 0,
  state_snapshot JSONB,
  retry_count INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  next_retry_at TIMESTAMPTZ,
  backoff_ms INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (execution_id, node_id)
);

CREATE INDEX IF NOT EXISTS idx_execution_steps_execution_id ON execution_steps(execution_id);
CREATE INDEX IF NOT EXISTS idx_execution_steps_node_id ON execution_steps(node_id);
CREATE INDEX IF NOT EXISTS idx_execution_steps_status ON execution_steps(status);

-- ============================================================
-- ROLLBACK (keep as comment; run manually if needed)
-- ============================================================
-- ALTER TABLE executions
--   DROP COLUMN IF EXISTS user_id,
--   DROP COLUMN IF EXISTS trigger,
--   DROP COLUMN IF EXISTS input,
--   DROP COLUMN IF EXISTS output,
--   DROP COLUMN IF EXISTS logs,
--   DROP COLUMN IF EXISTS last_heartbeat,
--   DROP COLUMN IF EXISTS timeout_seconds,
--   DROP COLUMN IF EXISTS current_node,
--   DROP COLUMN IF EXISTS duration_ms,
--   DROP COLUMN IF EXISTS error,
--   DROP COLUMN IF EXISTS last_error,
--   DROP COLUMN IF EXISTS error_code,
--   DROP COLUMN IF EXISTS queued_at,
--   DROP COLUMN IF EXISTS progress;
-- DROP TABLE IF EXISTS execution_steps;
