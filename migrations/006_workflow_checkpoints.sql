-- ============================================
-- Workflow Checkpoint System Migration
-- Run this in Supabase SQL Editor
-- ============================================

-- Create workflow_checkpoints table
-- Stores execution state for resuming workflows after crashes or failures
CREATE TABLE IF NOT EXISTS public.workflow_checkpoints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  execution_id VARCHAR(255) NOT NULL UNIQUE,
  workflow_id VARCHAR(255) NOT NULL,
  checkpoint_data JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_checkpoints_execution_id ON public.workflow_checkpoints(execution_id);
CREATE INDEX IF NOT EXISTS idx_checkpoints_workflow_id ON public.workflow_checkpoints(workflow_id);
CREATE INDEX IF NOT EXISTS idx_checkpoints_updated_at ON public.workflow_checkpoints(updated_at);

-- Create GIN index on checkpoint_data for JSONB queries
CREATE INDEX IF NOT EXISTS idx_checkpoints_data_gin ON public.workflow_checkpoints USING GIN (checkpoint_data);

-- Add comment
COMMENT ON TABLE public.workflow_checkpoints IS 'Stores workflow execution checkpoints for crash recovery and resume functionality';

-- Enable Row Level Security (RLS) - adjust policies as needed
ALTER TABLE public.workflow_checkpoints ENABLE ROW LEVEL SECURITY;

-- Create policy to allow service role access (for worker service)
CREATE POLICY "Service role can manage checkpoints"
  ON public.workflow_checkpoints
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Optional: Create cleanup function to remove old checkpoints
CREATE OR REPLACE FUNCTION public.cleanup_old_checkpoints(days_to_keep INTEGER DEFAULT 7)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM public.workflow_checkpoints
  WHERE updated_at < NOW() - (days_to_keep || ' days')::INTERVAL
    AND (checkpoint_data->>'status' = 'completed' OR checkpoint_data->>'status' = 'failed');
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

-- Add comment to cleanup function
COMMENT ON FUNCTION public.cleanup_old_checkpoints IS 'Removes old completed or failed checkpoints older than specified days';

-- Success message
DO $$
BEGIN
  RAISE NOTICE 'Workflow checkpoint system migration completed successfully!';
  RAISE NOTICE 'Table: workflow_checkpoints created';
  RAISE NOTICE 'Indexes: execution_id, workflow_id, updated_at, checkpoint_data (GIN)';
  RAISE NOTICE 'Function: cleanup_old_checkpoints() created';
END $$;
