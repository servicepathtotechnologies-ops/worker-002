-- Ensure optional Prisma-backed memory archive tables exist.
-- The workflow executor treats this archive as non-critical, but missing
-- tables create noisy logs after otherwise successful runs.

CREATE TABLE IF NOT EXISTS public.memory_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID NOT NULL,
  status VARCHAR(50) NOT NULL,
  input_data JSONB,
  result_data JSONB,
  started_at TIMESTAMP NOT NULL,
  finished_at TIMESTAMP,
  execution_time INTEGER,
  error_message TEXT,
  context JSONB DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS public.memory_node_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  execution_id UUID NOT NULL REFERENCES public.memory_executions(id) ON DELETE CASCADE,
  node_id VARCHAR(100) NOT NULL,
  node_type VARCHAR(100) NOT NULL,
  input_data JSONB,
  output_data JSONB,
  status VARCHAR(50) NOT NULL,
  error TEXT,
  duration INTEGER,
  sequence INTEGER NOT NULL,
  metadata JSONB
);

DO $$
DECLARE
  constraint_name TEXT;
BEGIN
  SELECT tc.constraint_name INTO constraint_name
  FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage kcu
    ON tc.constraint_name = kcu.constraint_name
   AND tc.table_schema = kcu.table_schema
  WHERE tc.table_schema = 'public'
    AND tc.table_name = 'memory_executions'
    AND tc.constraint_type = 'FOREIGN KEY'
    AND kcu.column_name = 'workflow_id'
  LIMIT 1;

  IF constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.memory_executions DROP CONSTRAINT IF EXISTS %I', constraint_name);
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'workflows'
  ) THEN
    ALTER TABLE public.memory_executions
      ADD CONSTRAINT memory_executions_workflow_id_fkey
      FOREIGN KEY (workflow_id)
      REFERENCES public.workflows(id)
      ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_memory_executions_workflow_id ON public.memory_executions(workflow_id);
CREATE INDEX IF NOT EXISTS idx_memory_executions_status ON public.memory_executions(status);
CREATE INDEX IF NOT EXISTS idx_memory_executions_started_at ON public.memory_executions(started_at);
CREATE INDEX IF NOT EXISTS idx_memory_node_executions_execution_id ON public.memory_node_executions(execution_id);
CREATE INDEX IF NOT EXISTS idx_memory_node_executions_node_id ON public.memory_node_executions(node_id);
CREATE INDEX IF NOT EXISTS idx_memory_node_executions_sequence ON public.memory_node_executions(sequence);
