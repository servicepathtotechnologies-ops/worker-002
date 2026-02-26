-- ============================================
-- Fix: Add missing columns to execution_steps table
-- This ensures all required columns exist even if table was created before migration
-- ============================================

DO $$ 
BEGIN
  -- Add created_at column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'execution_steps' AND column_name = 'created_at'
  ) THEN
    ALTER TABLE public.execution_steps 
    ADD COLUMN created_at TIMESTAMPTZ DEFAULT now();
    
    RAISE NOTICE 'Added created_at column to execution_steps';
  END IF;

  -- Add updated_at column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'execution_steps' AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE public.execution_steps 
    ADD COLUMN updated_at TIMESTAMPTZ DEFAULT now();
    
    RAISE NOTICE 'Added updated_at column to execution_steps';
  END IF;

  -- Add node_name column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'execution_steps' AND column_name = 'node_name'
  ) THEN
    ALTER TABLE public.execution_steps 
    ADD COLUMN node_name VARCHAR(255);
    
    RAISE NOTICE 'Added node_name column to execution_steps';
  END IF;

  -- Add input_refs column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'execution_steps' AND column_name = 'input_refs'
  ) THEN
    ALTER TABLE public.execution_steps 
    ADD COLUMN input_refs JSONB;
    
    RAISE NOTICE 'Added input_refs column to execution_steps';
  END IF;

  -- Add output_refs column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'execution_steps' AND column_name = 'output_refs'
  ) THEN
    ALTER TABLE public.execution_steps 
    ADD COLUMN output_refs JSONB;
    
    RAISE NOTICE 'Added output_refs column to execution_steps';
  END IF;

  -- Add result_data column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'execution_steps' AND column_name = 'result_data'
  ) THEN
    ALTER TABLE public.execution_steps 
    ADD COLUMN result_data JSONB;
    
    RAISE NOTICE 'Added result_data column to execution_steps';
  END IF;

  -- Add started_at column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'execution_steps' AND column_name = 'started_at'
  ) THEN
    ALTER TABLE public.execution_steps 
    ADD COLUMN started_at TIMESTAMPTZ;
    
    RAISE NOTICE 'Added started_at column to execution_steps';
  END IF;

  -- Add retry_count column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'execution_steps' AND column_name = 'retry_count'
  ) THEN
    ALTER TABLE public.execution_steps 
    ADD COLUMN retry_count INTEGER DEFAULT 0;
    
    RAISE NOTICE 'Added retry_count column to execution_steps';
  END IF;

  -- Add max_retries column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'execution_steps' AND column_name = 'max_retries'
  ) THEN
    ALTER TABLE public.execution_steps 
    ADD COLUMN max_retries INTEGER DEFAULT 3;
    
    RAISE NOTICE 'Added max_retries column to execution_steps';
  END IF;

END $$;

-- Done!
SELECT 'Added all missing columns to execution_steps table!' AS status;
