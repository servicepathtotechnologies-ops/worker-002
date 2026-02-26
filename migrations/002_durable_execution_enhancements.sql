-- ============================================
-- Durable Execution Enhancements
-- Adds missing fields for production-grade execution guarantees
-- Run this in Supabase SQL Editor
-- ============================================

-- 1. CREATE STATUS ENUM IF IT DOESN'T EXIST
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'execution_status') THEN
    CREATE TYPE execution_status AS ENUM ('pending', 'running', 'completed', 'failed', 'paused', 'waiting');
  END IF;
END $$;

-- 2. ENSURE ALL EXECUTION TABLE FIELDS EXIST
DO $$ 
BEGIN
  -- Ensure executions table has all required fields
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'executions' AND column_name = 'status'
  ) THEN
    ALTER TABLE public.executions 
    ADD COLUMN status VARCHAR(50) DEFAULT 'pending';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'executions' AND column_name = 'workflow_id'
  ) THEN
    ALTER TABLE public.executions 
    ADD COLUMN workflow_id VARCHAR(255);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'executions' AND column_name = 'current_node'
  ) THEN
    ALTER TABLE public.executions 
    ADD COLUMN current_node VARCHAR(255);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'executions' AND column_name = 'started_at'
  ) THEN
    ALTER TABLE public.executions 
    ADD COLUMN started_at TIMESTAMPTZ DEFAULT now();
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'executions' AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE public.executions 
    ADD COLUMN updated_at TIMESTAMPTZ DEFAULT now();
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'executions' AND column_name = 'completed_at'
  ) THEN
    ALTER TABLE public.executions 
    ADD COLUMN completed_at TIMESTAMPTZ;
  END IF;
END $$;

-- 3. ENSURE ALL EXECUTION_STEPS TABLE FIELDS EXIST
DO $$ 
BEGIN
  -- Create execution_steps table if it doesn't exist
  CREATE TABLE IF NOT EXISTS public.execution_steps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    execution_id UUID NOT NULL REFERENCES public.executions(id) ON DELETE CASCADE,
    node_id VARCHAR(255) NOT NULL,
    node_type VARCHAR(100) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    input_json JSONB,
    output_json JSONB,
    error TEXT,
    sequence INTEGER,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(execution_id, node_id)
  );

  -- Add missing columns
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'execution_steps' AND column_name = 'input_refs'
  ) THEN
    ALTER TABLE public.execution_steps 
    ADD COLUMN input_refs JSONB;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'execution_steps' AND column_name = 'output_refs'
  ) THEN
    ALTER TABLE public.execution_steps 
    ADD COLUMN output_refs JSONB;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'execution_steps' AND column_name = 'result_data'
  ) THEN
    ALTER TABLE public.execution_steps 
    ADD COLUMN result_data JSONB;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'execution_steps' AND column_name = 'started_at'
  ) THEN
    ALTER TABLE public.execution_steps 
    ADD COLUMN started_at TIMESTAMPTZ;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'execution_steps' AND column_name = 'retry_count'
  ) THEN
    ALTER TABLE public.execution_steps 
    ADD COLUMN retry_count INTEGER DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'execution_steps' AND column_name = 'max_retries'
  ) THEN
    ALTER TABLE public.execution_steps 
    ADD COLUMN max_retries INTEGER DEFAULT 3;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'execution_steps' AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE public.execution_steps 
    ADD COLUMN updated_at TIMESTAMPTZ DEFAULT now();
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'execution_steps' AND column_name = 'node_name'
  ) THEN
    ALTER TABLE public.execution_steps 
    ADD COLUMN node_name VARCHAR(255);
  END IF;
END $$;

-- 4. CREATE INDEXES FOR PERFORMANCE
CREATE INDEX IF NOT EXISTS idx_execution_steps_execution_id 
    ON public.execution_steps(execution_id);

CREATE INDEX IF NOT EXISTS idx_execution_steps_status 
    ON public.execution_steps(status) WHERE status IN ('pending', 'running');

CREATE INDEX IF NOT EXISTS idx_execution_steps_stuck 
    ON public.execution_steps(status, updated_at) WHERE status = 'running';

CREATE INDEX IF NOT EXISTS idx_execution_steps_sequence 
    ON public.execution_steps(execution_id, sequence);

CREATE INDEX IF NOT EXISTS idx_executions_status_updated 
    ON public.executions(status, updated_at) WHERE status = 'running';

-- 5. ADD TRIGGER FOR UPDATED_AT
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_execution_steps_updated_at ON public.execution_steps;
CREATE TRIGGER update_execution_steps_updated_at
    BEFORE UPDATE ON public.execution_steps
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_executions_updated_at ON public.executions;
CREATE TRIGGER update_executions_updated_at
    BEFORE UPDATE ON public.executions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Done! ✅
SELECT 'Durable execution enhancements migration completed successfully!' AS status;
