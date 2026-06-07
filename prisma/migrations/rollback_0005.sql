-- Rollback for migration 0005_execution_async_fields.sql
-- Run this ONLY if you need to undo migration 0005.
-- WARNING: This drops data. Take a snapshot before running.

DROP TABLE IF EXISTS execution_steps;

ALTER TABLE executions
  DROP COLUMN IF EXISTS user_id,
  DROP COLUMN IF EXISTS trigger,
  DROP COLUMN IF EXISTS input,
  DROP COLUMN IF EXISTS output,
  DROP COLUMN IF EXISTS logs,
  DROP COLUMN IF EXISTS last_heartbeat,
  DROP COLUMN IF EXISTS timeout_seconds,
  DROP COLUMN IF EXISTS current_node,
  DROP COLUMN IF EXISTS duration_ms,
  DROP COLUMN IF EXISTS error,
  DROP COLUMN IF EXISTS last_error,
  DROP COLUMN IF EXISTS error_code,
  DROP COLUMN IF EXISTS queued_at,
  DROP COLUMN IF EXISTS progress;

DROP INDEX IF EXISTS idx_executions_user_id;
DROP INDEX IF EXISTS idx_executions_queued_at;
DROP INDEX IF EXISTS idx_executions_current_node;
