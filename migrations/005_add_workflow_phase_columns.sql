-- ============================================
-- Add Missing Workflow Phase & State Columns
-- Fixes schema mismatch between backend code and database
-- Run this in Supabase SQL Editor
-- ============================================

-- 1. ADD PHASE COLUMN (synced with status for backward compatibility)
DO $$ 
BEGIN
  -- Add phase column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'workflows' AND column_name = 'phase'
  ) THEN
    ALTER TABLE public.workflows 
    ADD COLUMN phase TEXT DEFAULT 'draft';
    
    -- Sync existing status values to phase
    UPDATE public.workflows 
    SET phase = status::TEXT
    WHERE phase IS NULL OR phase = 'draft';
    
    -- Add comment
    COMMENT ON COLUMN public.workflows.phase IS 'Workflow phase (synced with status for backward compatibility)';
  END IF;
END $$;

-- 2. ADD GRAPH COLUMN (optional - for storing complete graph structure)
-- Note: Backend primarily uses nodes + edges, but some code may reference graph
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'workflows' AND column_name = 'graph'
  ) THEN
    ALTER TABLE public.workflows 
    ADD COLUMN graph JSONB;
    
    -- Populate graph from existing nodes + edges if graph is null
    UPDATE public.workflows 
    SET graph = jsonb_build_object(
      'nodes', COALESCE(nodes, '[]'::jsonb),
      'edges', COALESCE(edges, '[]'::jsonb)
    )
    WHERE graph IS NULL;
    
    COMMENT ON COLUMN public.workflows.graph IS 'Complete workflow graph structure (nodes + edges combined)';
  END IF;
END $$;

-- 3. ADD EXECUTION_STATE COLUMN (for resume/persistence)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'workflows' AND column_name = 'execution_state'
  ) THEN
    ALTER TABLE public.workflows 
    ADD COLUMN execution_state JSONB DEFAULT '{}'::jsonb;
    
    COMMENT ON COLUMN public.workflows.execution_state IS 'Current execution state snapshot (for resume/persistence)';
  END IF;
END $$;

-- 4. ADD LOCKED COLUMN (for distributed locking - if not already added)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'workflows' AND column_name = 'locked'
  ) THEN
    ALTER TABLE public.workflows 
    ADD COLUMN locked BOOLEAN DEFAULT false;
    
    COMMENT ON COLUMN public.workflows.locked IS 'Distributed lock flag (prevents concurrent executions)';
  END IF;
END $$;

-- 5. CREATE TRIGGER TO SYNC PHASE WITH STATUS
-- This ensures phase always matches status when status is updated
CREATE OR REPLACE FUNCTION sync_workflow_phase_with_status()
RETURNS TRIGGER AS $$
BEGIN
  -- If status changed, sync phase to match
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    NEW.phase := NEW.status::TEXT;
  END IF;
  
  -- If phase is explicitly set but status isn't, sync status to phase
  IF NEW.phase IS DISTINCT FROM OLD.phase AND NEW.status::TEXT != NEW.phase THEN
    -- Try to cast phase to workflow_status enum
    BEGIN
      NEW.status := NEW.phase::workflow_status;
    EXCEPTION WHEN OTHERS THEN
      -- If phase value doesn't match enum, keep status as is
      -- This allows phase to have values not in the enum (for backward compatibility)
      NULL;
    END;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop trigger if exists and recreate
DROP TRIGGER IF EXISTS sync_workflow_phase_trigger ON public.workflows;
CREATE TRIGGER sync_workflow_phase_trigger
  BEFORE UPDATE ON public.workflows
  FOR EACH ROW
  EXECUTE FUNCTION sync_workflow_phase_with_status();

-- 6. CREATE INDEX FOR PHASE QUERIES
CREATE INDEX IF NOT EXISTS idx_workflows_phase 
  ON public.workflows(phase) 
  WHERE phase IS NOT NULL;

-- 7. VERIFY SCHEMA
DO $$
DECLARE
  missing_columns TEXT[];
BEGIN
  SELECT array_agg(column_name) INTO missing_columns
  FROM (
    SELECT 'phase' AS column_name
    UNION SELECT 'graph'
    UNION SELECT 'execution_state'
    UNION SELECT 'locked'
  ) AS required
  WHERE NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'workflows' 
    AND column_name = required.column_name
  );
  
  IF array_length(missing_columns, 1) > 0 THEN
    RAISE EXCEPTION 'Migration incomplete. Missing columns: %', array_to_string(missing_columns, ', ');
  ELSE
    RAISE NOTICE '✅ All required columns added successfully!';
  END IF;
END $$;

-- Done! ✅
SELECT 'Workflow phase columns migration completed successfully!' AS status;
