-- ============================================
-- Fix Phase/Status Sync Trigger
-- Allows phase to have execution-specific values (ready_for_execution, etc.)
-- while status remains lifecycle values (draft, active, paused, archived)
-- ============================================

-- Update the trigger function to only sync phase to status if phase wasn't explicitly set
-- This allows phase to have values like 'ready_for_execution' that don't match status enum
CREATE OR REPLACE FUNCTION sync_workflow_phase_with_status()
RETURNS TRIGGER AS $$
BEGIN
  -- ✅ CRITICAL: Only sync phase to status if phase wasn't explicitly set to a different value
  -- If both status and phase are being updated in the same statement, and phase is set to 
  -- a value different from status, it means phase is being set to an execution phase 
  -- (like 'ready_for_execution'), so preserve it
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    -- Only sync phase to status if phase is NULL or if phase equals the new status
    -- If phase is explicitly set to something different from status, keep it
    IF NEW.phase IS NULL OR NEW.phase = NEW.status::TEXT THEN
      NEW.phase := NEW.status::TEXT;
    END IF;
    -- Otherwise, keep the explicitly set phase value (like 'ready_for_execution')
  END IF;
  
  -- If phase is explicitly set but status isn't, try to sync status to phase (only if phase matches enum)
  IF NEW.phase IS DISTINCT FROM OLD.phase AND NEW.status::TEXT != NEW.phase THEN
    -- Try to cast phase to workflow_status enum
    BEGIN
      NEW.status := NEW.phase::workflow_status;
    EXCEPTION WHEN OTHERS THEN
      -- If phase value doesn't match enum (like 'ready_for_execution'), keep status as is
      -- This allows phase to have values not in the enum (for backward compatibility)
      NULL;
    END;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger is already created, just the function is updated
-- Verify the trigger exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger 
    WHERE tgname = 'sync_workflow_phase_trigger'
  ) THEN
    -- Recreate trigger if it doesn't exist
    CREATE TRIGGER sync_workflow_phase_trigger
      BEFORE UPDATE ON public.workflows
      FOR EACH ROW
      EXECUTE FUNCTION sync_workflow_phase_with_status();
  END IF;
END $$;

-- Done! ✅
SELECT 'Phase/status sync trigger updated successfully!' AS status;
