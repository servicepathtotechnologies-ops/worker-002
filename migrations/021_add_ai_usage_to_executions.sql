-- Migration 021: Add AI usage tracking columns to executions table
-- Tracks AI calls and token consumption during workflow execution (runtime phase).

ALTER TABLE executions
  ADD COLUMN IF NOT EXISTS ai_calls  INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ai_tokens INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN executions.ai_calls  IS 'Number of LLM API calls made while executing this workflow run';
COMMENT ON COLUMN executions.ai_tokens IS 'Total tokens consumed by LLM calls during this workflow run';
