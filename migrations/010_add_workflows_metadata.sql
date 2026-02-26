-- ============================================
-- Add Missing Columns to Workflows Table
-- Run this in Supabase SQL Editor
-- ============================================
-- Adds: settings, graph, and metadata columns
-- Ensures backward compatibility with default values

DO $$ 
DECLARE
  columns_added TEXT[] := ARRAY[]::TEXT[];
BEGIN
  -- Add settings column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'workflows' 
    AND column_name = 'settings'
  ) THEN
    ALTER TABLE public.workflows 
    ADD COLUMN settings JSONB DEFAULT '{}'::jsonb;
    
    -- Set default value for existing rows
    UPDATE public.workflows 
    SET settings = '{}'::jsonb
    WHERE settings IS NULL;
    
    COMMENT ON COLUMN public.workflows.settings IS 'Workflow settings (JSONB) for storing workflow configuration';
    columns_added := array_append(columns_added, 'settings');
    RAISE NOTICE '✅ Added settings column to workflows table';
  ELSE
    RAISE NOTICE '⚠️  settings column already exists in workflows table';
  END IF;

  -- Add graph column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'workflows' 
    AND column_name = 'graph'
  ) THEN
    ALTER TABLE public.workflows 
    ADD COLUMN graph JSONB DEFAULT '{}'::jsonb;
    
    -- Populate graph from existing nodes + edges if graph is null
    UPDATE public.workflows 
    SET graph = jsonb_build_object(
      'nodes', COALESCE(nodes, '[]'::jsonb),
      'edges', COALESCE(edges, '[]'::jsonb)
    )
    WHERE graph IS NULL OR graph = '{}'::jsonb;
    
    COMMENT ON COLUMN public.workflows.graph IS 'Complete workflow graph structure (nodes + edges combined)';
    columns_added := array_append(columns_added, 'graph');
    RAISE NOTICE '✅ Added graph column to workflows table';
  ELSE
    RAISE NOTICE '⚠️  graph column already exists in workflows table';
  END IF;

  -- Add metadata column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'workflows' 
    AND column_name = 'metadata'
  ) THEN
    ALTER TABLE public.workflows 
    ADD COLUMN metadata JSONB DEFAULT '{}'::jsonb;
    
    -- Set default value for existing rows
    UPDATE public.workflows 
    SET metadata = '{}'::jsonb
    WHERE metadata IS NULL;
    
    COMMENT ON COLUMN public.workflows.metadata IS 'Workflow metadata (JSONB) for storing additional workflow information';
    columns_added := array_append(columns_added, 'metadata');
    RAISE NOTICE '✅ Added metadata column to workflows table';
  ELSE
    RAISE NOTICE '⚠️  metadata column already exists in workflows table';
  END IF;

  IF array_length(columns_added, 1) > 0 THEN
    RAISE NOTICE '✅ Added columns: %', array_to_string(columns_added, ', ');
  END IF;
END $$;

-- Create GIN indexes for JSONB queries (if they don't exist)
CREATE INDEX IF NOT EXISTS idx_workflows_settings_gin 
  ON public.workflows USING GIN (settings)
  WHERE settings IS NOT NULL AND settings != '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_workflows_graph_gin 
  ON public.workflows USING GIN (graph)
  WHERE graph IS NOT NULL AND graph != '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_workflows_metadata_gin 
  ON public.workflows USING GIN (metadata)
  WHERE metadata IS NOT NULL AND metadata != '{}'::jsonb;

-- Verify all columns were added
DO $$
DECLARE
  missing_columns TEXT[] := ARRAY[]::TEXT[];
  required_columns TEXT[] := ARRAY['settings', 'graph', 'metadata'];
  col TEXT;
BEGIN
  FOREACH col IN ARRAY required_columns
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name = 'workflows' 
      AND column_name = col
    ) THEN
      missing_columns := array_append(missing_columns, col);
    END IF;
  END LOOP;
  
  IF array_length(missing_columns, 1) > 0 THEN
    RAISE EXCEPTION '❌ Migration incomplete. Missing columns: %', array_to_string(missing_columns, ', ');
  ELSE
    RAISE NOTICE '✅ Migration completed successfully!';
    RAISE NOTICE '   Columns: workflows.settings, workflows.graph, workflows.metadata (all JSONB, default: {})';
    RAISE NOTICE '   Indexes: idx_workflows_settings_gin, idx_workflows_graph_gin, idx_workflows_metadata_gin (GIN)';
  END IF;
END $$;

-- Success message
SELECT 'Workflows schema migration completed successfully! Added: settings, graph, metadata' AS status;
