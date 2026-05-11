-- Migration 023: Add confirmed + setup lifecycle columns to workflows table
-- Required by: workflow-confirm.ts, workflow-setup-lifecycle.ts, save-workflow.ts,
--              distributed-execute-workflow.ts

ALTER TABLE public.workflows
  ADD COLUMN IF NOT EXISTS confirmed          BOOLEAN       NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS setup_completed    BOOLEAN       NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS setup_stage        TEXT          NOT NULL DEFAULT 'complete',
  ADD COLUMN IF NOT EXISTS setup_completed_at TIMESTAMPTZ;

-- Backfill: treat all existing workflows as confirmed + setup complete
-- so they remain fully usable without any re-confirmation step.
UPDATE public.workflows
SET
  confirmed          = true,
  setup_completed    = true,
  setup_stage        = 'complete',
  setup_completed_at = COALESCE(updated_at, created_at, NOW())
WHERE confirmed IS DISTINCT FROM true
   OR setup_completed IS DISTINCT FROM true;

-- Index to speed up the visibility query used by the dashboard
CREATE INDEX IF NOT EXISTS idx_workflows_setup_visibility
  ON public.workflows (user_id, setup_completed, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_workflows_confirmed
  ON public.workflows (user_id, confirmed, updated_at DESC);
