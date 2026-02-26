-- ============================================
-- Workflow Execution Logs Migration
-- Run this in Supabase SQL Editor
-- ============================================

-- Create workflow_execution_logs table
-- Stores structured logs for workflow execution tracing
CREATE TABLE IF NOT EXISTS public.workflow_execution_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id VARCHAR(255) NOT NULL,
  execution_id VARCHAR(255) NOT NULL,
  correlation_id VARCHAR(255) NOT NULL,
  node_id VARCHAR(255),
  node_name VARCHAR(255),
  event VARCHAR(100) NOT NULL,
  level VARCHAR(20) NOT NULL DEFAULT 'info',
  timestamp TIMESTAMPTZ NOT NULL DEFAULT now(),
  duration_ms INTEGER,
  input_data JSONB,
  output_data JSONB,
  error_data JSONB,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_logs_execution_id ON public.workflow_execution_logs(execution_id);
CREATE INDEX IF NOT EXISTS idx_logs_workflow_id ON public.workflow_execution_logs(workflow_id);
CREATE INDEX IF NOT EXISTS idx_logs_correlation_id ON public.workflow_execution_logs(correlation_id);
CREATE INDEX IF NOT EXISTS idx_logs_node_id ON public.workflow_execution_logs(node_id);
CREATE INDEX IF NOT EXISTS idx_logs_event ON public.workflow_execution_logs(event);
CREATE INDEX IF NOT EXISTS idx_logs_level ON public.workflow_execution_logs(level);
CREATE INDEX IF NOT EXISTS idx_logs_timestamp ON public.workflow_execution_logs(timestamp);

-- Create composite index for common queries
CREATE INDEX IF NOT EXISTS idx_logs_execution_event ON public.workflow_execution_logs(execution_id, event);
CREATE INDEX IF NOT EXISTS idx_logs_workflow_timestamp ON public.workflow_execution_logs(workflow_id, timestamp DESC);

-- Create GIN indexes for JSONB queries
CREATE INDEX IF NOT EXISTS idx_logs_input_data_gin ON public.workflow_execution_logs USING GIN (input_data);
CREATE INDEX IF NOT EXISTS idx_logs_output_data_gin ON public.workflow_execution_logs USING GIN (output_data);
CREATE INDEX IF NOT EXISTS idx_logs_metadata_gin ON public.workflow_execution_logs USING GIN (metadata);

-- Add comments
COMMENT ON TABLE public.workflow_execution_logs IS 'Structured logs for workflow execution tracing and debugging';
COMMENT ON COLUMN public.workflow_execution_logs.correlation_id IS 'Correlation ID for tracing all logs related to a single execution';
COMMENT ON COLUMN public.workflow_execution_logs.event IS 'Event type: workflow:started, workflow:completed, node:started, node:completed, etc.';
COMMENT ON COLUMN public.workflow_execution_logs.level IS 'Log level: debug, info, warn, error';

-- Enable Row Level Security (RLS) - adjust policies as needed
ALTER TABLE public.workflow_execution_logs ENABLE ROW LEVEL SECURITY;

-- Create policy to allow service role access (for worker service)
CREATE POLICY "Service role can manage logs"
  ON public.workflow_execution_logs
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Optional: Create cleanup function to remove old logs
CREATE OR REPLACE FUNCTION public.cleanup_old_workflow_logs(days_to_keep INTEGER DEFAULT 30)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM public.workflow_execution_logs
  WHERE created_at < NOW() - (days_to_keep || ' days')::INTERVAL;
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

-- Add comment to cleanup function
COMMENT ON FUNCTION public.cleanup_old_workflow_logs IS 'Removes workflow execution logs older than specified days';

-- Success message
DO $$
BEGIN
  RAISE NOTICE 'Workflow execution logs migration completed successfully!';
  RAISE NOTICE 'Table: workflow_execution_logs created';
  RAISE NOTICE 'Indexes: execution_id, workflow_id, correlation_id, node_id, event, level, timestamp';
  RAISE NOTICE 'Function: cleanup_old_workflow_logs() created';
END $$;
