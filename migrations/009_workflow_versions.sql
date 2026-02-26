-- ============================================
-- Workflow Versioning Migration
-- Run this in Supabase SQL Editor
-- ============================================

-- Create workflow_versions table
-- Stores version history for workflows to enable rollback and change tracking
CREATE TABLE IF NOT EXISTS public.workflow_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID NOT NULL REFERENCES public.workflows(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  changes JSONB DEFAULT '{}'::jsonb,
  definition_snapshot JSONB NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  
  -- Unique constraint: one version number per workflow
  UNIQUE(workflow_id, version)
);

-- Add missing columns if table already exists (for idempotency)
DO $$
BEGIN
  -- Add changes column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'workflow_versions' 
    AND column_name = 'changes'
  ) THEN
    ALTER TABLE public.workflow_versions 
    ADD COLUMN changes JSONB DEFAULT '{}'::jsonb;
  END IF;

  -- Add definition_snapshot column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'workflow_versions' 
    AND column_name = 'definition_snapshot'
  ) THEN
    ALTER TABLE public.workflow_versions 
    ADD COLUMN definition_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb;
  END IF;

  -- Add metadata column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'workflow_versions' 
    AND column_name = 'metadata'
  ) THEN
    ALTER TABLE public.workflow_versions 
    ADD COLUMN metadata JSONB DEFAULT '{}'::jsonb;
  END IF;

  -- Add created_by column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'workflow_versions' 
    AND column_name = 'created_by'
  ) THEN
    ALTER TABLE public.workflow_versions 
    ADD COLUMN created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_workflow_versions_workflow_id ON public.workflow_versions(workflow_id);
CREATE INDEX IF NOT EXISTS idx_workflow_versions_version ON public.workflow_versions(workflow_id, version DESC);
CREATE INDEX IF NOT EXISTS idx_workflow_versions_created_at ON public.workflow_versions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_workflow_versions_created_by ON public.workflow_versions(created_by);

-- Create GIN indexes for JSONB queries
CREATE INDEX IF NOT EXISTS idx_workflow_versions_changes_gin ON public.workflow_versions USING GIN (changes);
CREATE INDEX IF NOT EXISTS idx_workflow_versions_snapshot_gin ON public.workflow_versions USING GIN (definition_snapshot);
CREATE INDEX IF NOT EXISTS idx_workflow_versions_metadata_gin ON public.workflow_versions USING GIN (metadata);

-- Add comments
COMMENT ON TABLE public.workflow_versions IS 'Version history for workflows - enables rollback and change tracking';
COMMENT ON COLUMN public.workflow_versions.version IS 'Version number (increments on each update)';
COMMENT ON COLUMN public.workflow_versions.changes IS 'JSONB object describing what changed in this version';
COMMENT ON COLUMN public.workflow_versions.definition_snapshot IS 'Complete workflow definition snapshot (nodes, edges, config, etc.)';
COMMENT ON COLUMN public.workflow_versions.metadata IS 'Additional metadata (description, tags, breaking changes, etc.)';

-- Enable Row Level Security (RLS)
ALTER TABLE public.workflow_versions ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (for idempotency)
DROP POLICY IF EXISTS "Users can view workflow versions" ON public.workflow_versions;
DROP POLICY IF EXISTS "Users can create workflow versions" ON public.workflow_versions;
DROP POLICY IF EXISTS "Service role can manage workflow versions" ON public.workflow_versions;

-- Policy: Users can view versions of workflows they own
CREATE POLICY "Users can view workflow versions" ON public.workflow_versions
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.workflows
      WHERE workflows.id = workflow_versions.workflow_id
      AND workflows.user_id = auth.uid()
    )
  );

-- Policy: Users can create versions for workflows they own
CREATE POLICY "Users can create workflow versions" ON public.workflow_versions
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.workflows
      WHERE workflows.id = workflow_versions.workflow_id
      AND workflows.user_id = auth.uid()
    )
  );

-- Service role policy (for worker service)
CREATE POLICY "Service role can manage workflow versions" ON public.workflow_versions
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- Create function to get latest version number for a workflow
CREATE OR REPLACE FUNCTION public.get_workflow_latest_version(p_workflow_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  latest_version INTEGER;
BEGIN
  SELECT COALESCE(MAX(version), 0) INTO latest_version
  FROM public.workflow_versions
  WHERE workflow_id = p_workflow_id;
  
  RETURN latest_version;
END;
$$;

-- Add comment to function
COMMENT ON FUNCTION public.get_workflow_latest_version IS 'Returns the latest version number for a workflow';

-- Create function to get version count for a workflow
CREATE OR REPLACE FUNCTION public.get_workflow_version_count(p_workflow_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  version_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO version_count
  FROM public.workflow_versions
  WHERE workflow_id = p_workflow_id;
  
  RETURN version_count;
END;
$$;

-- Add comment to function
COMMENT ON FUNCTION public.get_workflow_version_count IS 'Returns the total number of versions for a workflow';

-- Success message
DO $$
BEGIN
  RAISE NOTICE 'Workflow versioning migration completed successfully!';
  RAISE NOTICE 'Table: workflow_versions created';
  RAISE NOTICE 'Indexes: workflow_id, version, created_at, created_by';
  RAISE NOTICE 'Functions: get_workflow_latest_version(), get_workflow_version_count()';
  RAISE NOTICE 'RLS Policies: User access control enabled';
END $$;
