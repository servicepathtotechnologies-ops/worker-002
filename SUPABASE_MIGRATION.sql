-- ============================================
-- Supabase Migration for Enterprise State Architecture
-- Run this in Supabase SQL Editor
-- ============================================

-- Step 1: Add columns to executions table (if they don't exist)
DO $$ 
BEGIN
  -- Add current_node column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'executions' AND column_name = 'current_node'
  ) THEN
    ALTER TABLE public.executions 
    ADD COLUMN current_node VARCHAR(100);
  END IF;

  -- Add step_outputs column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'executions' AND column_name = 'step_outputs'
  ) THEN
    ALTER TABLE public.executions 
    ADD COLUMN step_outputs JSONB DEFAULT '{}'::jsonb;
  END IF;

  -- Add updated_at column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'executions' AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE public.executions 
    ADD COLUMN updated_at TIMESTAMPTZ DEFAULT now();
  END IF;
END $$;

-- Step 2: Create execution_steps table (for checkpoint persistence)
CREATE TABLE IF NOT EXISTS public.execution_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  execution_id UUID NOT NULL REFERENCES public.executions(id) ON DELETE CASCADE,
  node_id VARCHAR(100) NOT NULL,
  node_name VARCHAR(255),
  node_type VARCHAR(100),
  input_json JSONB,
  output_json JSONB, -- Can be data or object storage reference
  status VARCHAR(50) NOT NULL DEFAULT 'pending',
  error TEXT,
  sequence INTEGER NOT NULL,
  completed_at TIMESTAMPTZ DEFAULT now(),
  
  UNIQUE(execution_id, node_id)
);

-- Step 3: Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_execution_steps_execution_id 
  ON public.execution_steps(execution_id);

CREATE INDEX IF NOT EXISTS idx_execution_steps_node_id 
  ON public.execution_steps(node_id);

CREATE INDEX IF NOT EXISTS idx_execution_steps_sequence 
  ON public.execution_steps(execution_id, sequence);

CREATE INDEX IF NOT EXISTS idx_execution_steps_status 
  ON public.execution_steps(execution_id, status);

-- Step 4: Create index for resume queries
CREATE INDEX IF NOT EXISTS idx_executions_status_current_node 
  ON public.executions(status, current_node) 
  WHERE status = 'running';

-- Step 5: Add trigger to update updated_at automatically
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger if it doesn't exist
DROP TRIGGER IF EXISTS update_executions_updated_at ON public.executions;
CREATE TRIGGER update_executions_updated_at
    BEFORE UPDATE ON public.executions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Step 6: Grant permissions (adjust based on your RLS policies)
-- ALTER TABLE public.execution_steps ENABLE ROW LEVEL SECURITY;

-- Step 7: Ensure executions table has error_message column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'executions' AND column_name = 'error_message'
  ) THEN
    ALTER TABLE public.executions
    ADD COLUMN error_message TEXT;
  END IF;
END $$;

-- Step 8: Ensure workflow_execution_events.event_type allows WARNING
DO $$
BEGIN
  -- Drop existing check constraint if it exists
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'workflow_execution_events_event_type_check'
      AND conrelid = 'public.workflow_execution_events'::regclass
  ) THEN
    ALTER TABLE public.workflow_execution_events
    DROP CONSTRAINT workflow_execution_events_event_type_check;
  END IF;

  -- Re-create constraint including WARNING as a valid value
  ALTER TABLE public.workflow_execution_events
  ADD CONSTRAINT workflow_execution_events_event_type_check
  CHECK (
    event_type IN (
      'LOCK_ACQUIRED',
      'RUN_STARTED',
      'NODE_STARTED',
      'NODE_COMPLETED',
      'RUN_COMPLETED',
      'RUN_FAILED',
      'WARNING'
    )
  );
END $$;

-- Done! ✅
SELECT 'Migration completed successfully!' AS status;
