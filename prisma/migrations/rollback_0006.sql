-- Rollback for migration 0006_execution_steps_columns.sql
ALTER TABLE execution_steps
  DROP COLUMN IF EXISTS error,
  DROP COLUMN IF EXISTS started_at,
  DROP COLUMN IF EXISTS completed_at;
