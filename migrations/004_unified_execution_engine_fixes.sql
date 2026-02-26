-- Migration: Unified Execution Engine Fixes
-- Fixes database schema issues for unified execution engine
-- Date: 2024

-- 1. Ensure result_data column exists in executions table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'executions' AND column_name = 'result_data'
  ) THEN
    ALTER TABLE executions ADD COLUMN result_data JSONB;
    RAISE NOTICE 'Added result_data column to executions table';
  ELSE
    RAISE NOTICE 'result_data column already exists in executions table';
  END IF;
END $$;

-- 2. Ensure result_data column exists in execution_steps table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'execution_steps' AND column_name = 'result_data'
  ) THEN
    ALTER TABLE execution_steps ADD COLUMN result_data JSONB;
    RAISE NOTICE 'Added result_data column to execution_steps table';
  ELSE
    RAISE NOTICE 'result_data column already exists in execution_steps table';
  END IF;
END $$;

-- 3. Fix memory_executions.workflow_id foreign key constraint
-- First, check if the constraint exists and references correct table
DO $$
DECLARE
  constraint_exists BOOLEAN;
  constraint_name TEXT;
BEGIN
  -- Check if memory_executions table exists
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_name = 'memory_executions'
  ) THEN
    -- Check for existing foreign key constraint
    SELECT EXISTS (
      SELECT 1 FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu 
        ON tc.constraint_name = kcu.constraint_name
      WHERE tc.table_name = 'memory_executions'
        AND tc.constraint_type = 'FOREIGN KEY'
        AND kcu.column_name = 'workflow_id'
    ) INTO constraint_exists;

    IF constraint_exists THEN
      -- Find constraint name
      SELECT tc.constraint_name INTO constraint_name
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu 
        ON tc.constraint_name = kcu.constraint_name
      WHERE tc.table_name = 'memory_executions'
        AND tc.constraint_type = 'FOREIGN KEY'
        AND kcu.column_name = 'workflow_id'
      LIMIT 1;

      -- Drop existing constraint
      EXECUTE format('ALTER TABLE memory_executions DROP CONSTRAINT IF EXISTS %I', constraint_name);
      RAISE NOTICE 'Dropped existing foreign key constraint on memory_executions.workflow_id';
    END IF;

    -- Check if workflows table exists (for FK reference)
    IF EXISTS (
      SELECT 1 FROM information_schema.tables 
      WHERE table_name = 'workflows'
    ) THEN
      -- Add foreign key constraint if workflows table exists
      ALTER TABLE memory_executions 
      ADD CONSTRAINT memory_executions_workflow_id_fkey 
      FOREIGN KEY (workflow_id) 
      REFERENCES workflows(id) 
      ON DELETE CASCADE;
      RAISE NOTICE 'Added foreign key constraint on memory_executions.workflow_id';
    ELSE
      RAISE NOTICE 'workflows table does not exist - skipping FK constraint';
    END IF;
  ELSE
    RAISE NOTICE 'memory_executions table does not exist - skipping FK constraint';
  END IF;
END $$;

-- 4. Add schema_version column to workflows table for migration tracking
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'workflows' AND column_name = 'schema_version'
  ) THEN
    ALTER TABLE workflows ADD COLUMN schema_version INTEGER DEFAULT 1;
    RAISE NOTICE 'Added schema_version column to workflows table';
  ELSE
    RAISE NOTICE 'schema_version column already exists in workflows table';
  END IF;
END $$;

-- 5. Create index on schema_version for faster queries
CREATE INDEX IF NOT EXISTS idx_workflows_schema_version ON workflows(schema_version);

-- 6. Create index on result_data for JSONB queries (if needed)
CREATE INDEX IF NOT EXISTS idx_executions_result_data ON executions USING GIN (result_data);
CREATE INDEX IF NOT EXISTS idx_execution_steps_result_data ON execution_steps USING GIN (result_data);

SELECT 'Unified execution engine database fixes applied successfully!' AS status;
