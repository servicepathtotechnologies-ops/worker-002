-- Migration 0006: Add missing columns to execution_steps
-- The ExecutionConsole UI queries for `error`, `started_at`, and `completed_at`.
-- Migration 0005 created the table with `last_error`, `created_at`, and `updated_at` instead.
-- This migration adds the three expected columns. All are optional and nullable.

ALTER TABLE execution_steps
  ADD COLUMN IF NOT EXISTS error TEXT,
  ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

-- Backfill from existing columns for any rows already present
UPDATE execution_steps
SET
  error       = COALESCE(error, last_error),
  started_at  = COALESCE(started_at, created_at),
  completed_at = COALESCE(completed_at, updated_at)
WHERE error IS NULL OR started_at IS NULL OR completed_at IS NULL;
