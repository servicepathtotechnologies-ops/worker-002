-- ============================================
-- Production Hardening: Execution Locking, Event Log, Retry Policy, Resume
-- Run this in Supabase SQL Editor
-- ============================================

-- 1. ADD EXECUTION LOCKING FIELDS
DO $$ 
BEGIN
  -- Add active_execution_id to workflows table (for distributed locking)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'workflows' AND column_name = 'active_execution_id'
  ) THEN
    ALTER TABLE public.workflows 
    ADD COLUMN active_execution_id UUID REFERENCES public.executions(id) ON DELETE SET NULL;
  END IF;

  -- Add lock_acquired_at to executions table
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'executions' AND column_name = 'lock_acquired_at'
  ) THEN
    ALTER TABLE public.executions 
    ADD COLUMN lock_acquired_at TIMESTAMPTZ;
  END IF;

  -- Add last_heartbeat to executions table (for stuck-run detection)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'executions' AND column_name = 'last_heartbeat'
  ) THEN
    ALTER TABLE public.executions 
    ADD COLUMN last_heartbeat TIMESTAMPTZ DEFAULT now();
  END IF;

  -- Add timeout_seconds to executions table
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'executions' AND column_name = 'timeout_seconds'
  ) THEN
    ALTER TABLE public.executions 
    ADD COLUMN timeout_seconds INTEGER DEFAULT 3600; -- 1 hour default
  END IF;
END $$;

-- 2. CREATE WORKFLOW_EXECUTION_EVENTS TABLE (Timeline/Event Log)
CREATE TABLE IF NOT EXISTS public.workflow_execution_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  execution_id UUID NOT NULL REFERENCES public.executions(id) ON DELETE CASCADE,
  workflow_id UUID NOT NULL REFERENCES public.workflows(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  event_data JSONB DEFAULT '{}'::jsonb,
  node_id VARCHAR(255),
  node_name VARCHAR(255),
  sequence INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  CONSTRAINT workflow_execution_events_event_type_check CHECK (
    event_type IN (
      'RUN_STARTED',
      'RUN_FINISHED',
      'RUN_FAILED',
      'RUN_CANCELLED',
      'NODE_STARTED',
      'NODE_FINISHED',
      'NODE_FAILED',
      'NODE_RETRY',
      'NODE_SKIPPED',
      'CONFIG_ATTACHED',
      'HEARTBEAT',
      'LOCK_ACQUIRED',
      'LOCK_RELEASED',
      'RESUME_STARTED'
    )
  )
);

-- Indexes for workflow_execution_events
CREATE INDEX IF NOT EXISTS workflow_execution_events_execution_id_idx 
  ON public.workflow_execution_events(execution_id);
CREATE INDEX IF NOT EXISTS workflow_execution_events_workflow_id_idx 
  ON public.workflow_execution_events(workflow_id);
CREATE INDEX IF NOT EXISTS workflow_execution_events_event_type_idx 
  ON public.workflow_execution_events(event_type);
CREATE INDEX IF NOT EXISTS workflow_execution_events_created_at_idx 
  ON public.workflow_execution_events(created_at);
CREATE INDEX IF NOT EXISTS workflow_execution_events_timeline_idx 
  ON public.workflow_execution_events(execution_id, created_at DESC, sequence);

-- 3. ADD RETRY POLICY FIELDS TO EXECUTION_STEPS
DO $$ 
BEGIN
  -- Add retry_count to execution_steps
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'execution_steps' AND column_name = 'retry_count'
  ) THEN
    ALTER TABLE public.execution_steps 
    ADD COLUMN retry_count INTEGER DEFAULT 0;
  END IF;

  -- Add max_retries to execution_steps
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'execution_steps' AND column_name = 'max_retries'
  ) THEN
    ALTER TABLE public.execution_steps 
    ADD COLUMN max_retries INTEGER DEFAULT 3;
  END IF;

  -- Add backoff_ms to execution_steps (for exponential backoff)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'execution_steps' AND column_name = 'backoff_ms'
  ) THEN
    ALTER TABLE public.execution_steps 
    ADD COLUMN backoff_ms INTEGER DEFAULT 1000; -- 1 second initial
  END IF;

  -- Add next_retry_at to execution_steps
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'execution_steps' AND column_name = 'next_retry_at'
  ) THEN
    ALTER TABLE public.execution_steps 
    ADD COLUMN next_retry_at TIMESTAMPTZ;
  END IF;

  -- Add last_error to execution_steps (for retry context)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'execution_steps' AND column_name = 'last_error'
  ) THEN
    ALTER TABLE public.execution_steps 
    ADD COLUMN last_error TEXT;
  END IF;
END $$;

-- 4. ADD PERSISTENT STATE FIELDS TO EXECUTION_STEPS (for resume)
DO $$ 
BEGIN
  -- Add state_snapshot to execution_steps (JSONB for node-level state)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'execution_steps' AND column_name = 'state_snapshot'
  ) THEN
    ALTER TABLE public.execution_steps 
    ADD COLUMN state_snapshot JSONB DEFAULT '{}'::jsonb;
  END IF;

  -- Add checkpoint_data to execution_steps (for resume)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'execution_steps' AND column_name = 'checkpoint_data'
  ) THEN
    ALTER TABLE public.execution_steps 
    ADD COLUMN checkpoint_data JSONB DEFAULT '{}'::jsonb;
  END IF;
END $$;

-- 5. CREATE INDEX FOR STUCK-RUN DETECTION
CREATE INDEX IF NOT EXISTS idx_executions_stuck_runs 
  ON public.executions(status, last_heartbeat) 
  WHERE status = 'running';

-- 6. CREATE INDEX FOR ACTIVE EXECUTION LOOKUP
CREATE INDEX IF NOT EXISTS idx_workflows_active_execution 
  ON public.workflows(active_execution_id) 
  WHERE active_execution_id IS NOT NULL;

COMMENT ON TABLE public.workflow_execution_events IS 'Timeline/event log for workflow executions - used for debugging, UI timeline, audit, and resume';
COMMENT ON COLUMN public.workflows.active_execution_id IS 'Distributed lock: only one active execution per workflow';
COMMENT ON COLUMN public.executions.lock_acquired_at IS 'When execution lock was acquired (for timeout detection)';
COMMENT ON COLUMN public.executions.last_heartbeat IS 'Last heartbeat timestamp (for stuck-run detection)';
COMMENT ON COLUMN public.execution_steps.retry_count IS 'Current retry attempt number';
COMMENT ON COLUMN public.execution_steps.max_retries IS 'Maximum retry attempts for this node';
COMMENT ON COLUMN public.execution_steps.backoff_ms IS 'Exponential backoff delay in milliseconds';
COMMENT ON COLUMN public.execution_steps.state_snapshot IS 'Node-level execution state snapshot (for resume)';
