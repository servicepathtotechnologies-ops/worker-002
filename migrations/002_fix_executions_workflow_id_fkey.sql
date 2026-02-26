-- ============================================
-- Fix: Remove foreign key constraint on executions.workflow_id
-- This allows executions to reference either workflows or workflow_definitions
-- ============================================

-- Drop the foreign key constraint if it exists
DO $$
BEGIN
  -- Drop the foreign key constraint
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'executions_workflow_id_fkey'
    AND table_name = 'executions'
  ) THEN
    ALTER TABLE public.executions 
    DROP CONSTRAINT executions_workflow_id_fkey;
    
    RAISE NOTICE 'Dropped foreign key constraint: executions_workflow_id_fkey';
  END IF;
  
  -- Make workflow_id nullable (in case it's NOT NULL)
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'executions' 
    AND column_name = 'workflow_id'
    AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE public.executions 
    ALTER COLUMN workflow_id DROP NOT NULL;
    
    RAISE NOTICE 'Made workflow_id nullable';
  END IF;
  
  -- Change workflow_id to TEXT/VARCHAR if it's UUID (to support both UUIDs and names)
  -- But keep it as UUID if it's already the right type
  -- Actually, let's keep it as UUID but remove the constraint so it can reference workflow_definitions
  -- The orchestrator will use the UUID from workflow_definitions.id
  
END $$;

-- Create index for performance (without foreign key constraint)
CREATE INDEX IF NOT EXISTS idx_executions_workflow_id 
    ON public.executions(workflow_id);

-- Done!
SELECT 'Fixed executions.workflow_id foreign key constraint!' AS status;
