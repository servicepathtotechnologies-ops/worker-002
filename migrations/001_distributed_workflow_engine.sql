-- ============================================
-- Distributed Workflow Engine Database Schema
-- Run this in Supabase SQL Editor
-- ============================================

-- 1. ENHANCED EXECUTION TABLE (Core state)
-- Extends existing executions table with distributed workflow fields
DO $$ 
BEGIN
  -- Add workflow_id column if it doesn't exist (as VARCHAR for workflow definitions)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'executions' AND column_name = 'workflow_id'
  ) THEN
    ALTER TABLE public.executions 
    ADD COLUMN workflow_id VARCHAR(255);
  END IF;

  -- Add current_node column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'executions' AND column_name = 'current_node'
  ) THEN
    ALTER TABLE public.executions 
    ADD COLUMN current_node VARCHAR(255);
  END IF;

  -- Add metadata column for distributed workflow metadata
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'executions' AND column_name = 'metadata'
  ) THEN
    ALTER TABLE public.executions 
    ADD COLUMN metadata JSONB DEFAULT '{}'::jsonb;
  END IF;

  -- Add started_at if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'executions' AND column_name = 'started_at'
  ) THEN
    ALTER TABLE public.executions 
    ADD COLUMN started_at TIMESTAMPTZ DEFAULT now();
  END IF;

  -- Add completed_at if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'executions' AND column_name = 'completed_at'
  ) THEN
    ALTER TABLE public.executions 
    ADD COLUMN completed_at TIMESTAMPTZ;
  END IF;

  -- Add updated_at if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'executions' AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE public.executions 
    ADD COLUMN updated_at TIMESTAMPTZ DEFAULT now();
  END IF;
END $$;

-- 2. EXECUTION STEPS TABLE (Each node's state)
-- Enhanced version of existing execution_steps with distributed workflow fields
CREATE TABLE IF NOT EXISTS public.execution_steps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    execution_id UUID NOT NULL REFERENCES public.executions(id) ON DELETE CASCADE,
    node_id VARCHAR(255) NOT NULL,
    node_type VARCHAR(100) NOT NULL,  -- upload, chunk, embed, ollama_inference, etc.
    status VARCHAR(50) NOT NULL DEFAULT 'pending',  -- pending, running, completed, failed, paused
    input_json JSONB,  -- Keep existing column name for compatibility
    output_json JSONB,  -- Keep existing column name for compatibility
    error TEXT,
    sequence INTEGER,  -- Execution order
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now(),
    
    UNIQUE(execution_id, node_id)
);

-- Add new columns to existing execution_steps table if they don't exist
DO $$ 
BEGIN
  -- Add input_refs column (for distributed workflow)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'execution_steps' AND column_name = 'input_refs'
  ) THEN
    ALTER TABLE public.execution_steps 
    ADD COLUMN input_refs JSONB;
  END IF;

  -- Add output_refs column (for distributed workflow)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'execution_steps' AND column_name = 'output_refs'
  ) THEN
    ALTER TABLE public.execution_steps 
    ADD COLUMN output_refs JSONB;
  END IF;

  -- Add result_data column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'execution_steps' AND column_name = 'result_data'
  ) THEN
    ALTER TABLE public.execution_steps 
    ADD COLUMN result_data JSONB;
  END IF;

  -- Add started_at column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'execution_steps' AND column_name = 'started_at'
  ) THEN
    ALTER TABLE public.execution_steps 
    ADD COLUMN started_at TIMESTAMPTZ;
  END IF;

  -- Add retry_count column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'execution_steps' AND column_name = 'retry_count'
  ) THEN
    ALTER TABLE public.execution_steps 
    ADD COLUMN retry_count INTEGER DEFAULT 0;
  END IF;

  -- Add max_retries column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'execution_steps' AND column_name = 'max_retries'
  ) THEN
    ALTER TABLE public.execution_steps 
    ADD COLUMN max_retries INTEGER DEFAULT 3;
  END IF;

  -- Add updated_at column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'execution_steps' AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE public.execution_steps 
    ADD COLUMN updated_at TIMESTAMPTZ DEFAULT now();
  END IF;

  -- Add node_name column if it doesn't exist (from SUPABASE_MIGRATION.sql)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'execution_steps' AND column_name = 'node_name'
  ) THEN
    ALTER TABLE public.execution_steps 
    ADD COLUMN node_name VARCHAR(255);
  END IF;
END $$;

-- Create indexes for execution_steps
CREATE INDEX IF NOT EXISTS idx_execution_steps_execution_id 
    ON public.execution_steps(execution_id);
CREATE INDEX IF NOT EXISTS idx_execution_steps_status_node 
    ON public.execution_steps(status, node_type);
CREATE INDEX IF NOT EXISTS idx_execution_steps_sequence 
    ON public.execution_steps(execution_id, sequence);

-- Create retry index only if retry_count column exists
DO $$ 
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'execution_steps' AND column_name = 'retry_count'
  ) THEN
    CREATE INDEX IF NOT EXISTS idx_execution_steps_retry 
        ON public.execution_steps(retry_count, status);
  END IF;
END $$;

-- 3. WORKFLOW DEFINITIONS TABLE
CREATE TABLE IF NOT EXISTS public.workflow_definitions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    version INTEGER DEFAULT 1,
    definition JSONB NOT NULL,  -- DAG structure: nodes, edges, conditions
    input_schema JSONB,  -- JSON schema for validation
    output_schema JSONB,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    is_active BOOLEAN DEFAULT true,
    
    UNIQUE(name, version)
);

CREATE INDEX IF NOT EXISTS idx_workflow_definitions_name 
    ON public.workflow_definitions(name, version);
CREATE INDEX IF NOT EXISTS idx_workflow_definitions_active 
    ON public.workflow_definitions(is_active) WHERE is_active = true;

-- 4. EXECUTION ARTIFACTS TABLE (Track large files)
CREATE TABLE IF NOT EXISTS public.execution_artifacts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    execution_id UUID NOT NULL REFERENCES public.executions(id) ON DELETE CASCADE,
    step_id UUID REFERENCES public.execution_steps(id) ON DELETE CASCADE,
    artifact_type VARCHAR(100),  -- document, embedding, model, result
    storage_path VARCHAR(1024),  -- S3/MinIO path
    storage_bucket VARCHAR(255),
    storage_key VARCHAR(1024),
    metadata JSONB,
    size_bytes BIGINT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Fix: Remove invalid INDEX syntax (PostgreSQL doesn't support inline INDEX in CREATE TABLE)
-- Create indexes separately
CREATE INDEX IF NOT EXISTS idx_execution_artifacts_execution 
    ON public.execution_artifacts(execution_id, artifact_type);
CREATE INDEX IF NOT EXISTS idx_execution_artifacts_step 
    ON public.execution_artifacts(step_id);

-- 5. Add trigger to update updated_at automatically
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for updated_at
DROP TRIGGER IF EXISTS update_executions_updated_at ON public.executions;
CREATE TRIGGER update_executions_updated_at
    BEFORE UPDATE ON public.executions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_execution_steps_updated_at ON public.execution_steps;
CREATE TRIGGER update_execution_steps_updated_at
    BEFORE UPDATE ON public.execution_steps
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_workflow_definitions_updated_at ON public.workflow_definitions;
CREATE TRIGGER update_workflow_definitions_updated_at
    BEFORE UPDATE ON public.workflow_definitions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- 6. Create indexes for execution queries
CREATE INDEX IF NOT EXISTS idx_executions_status 
    ON public.executions(status) WHERE status IN ('running', 'pending');
CREATE INDEX IF NOT EXISTS idx_executions_workflow_id 
    ON public.executions(workflow_id);
CREATE INDEX IF NOT EXISTS idx_executions_updated_at 
    ON public.executions(updated_at) WHERE status = 'running';

-- Done! ✅
SELECT 'Distributed workflow engine schema migration completed successfully!' AS status;
