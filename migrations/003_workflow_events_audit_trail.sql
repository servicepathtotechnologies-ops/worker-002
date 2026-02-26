-- ============================================
-- Workflow Events Audit Trail
-- Production-grade event logging for workflow lifecycle
-- ============================================

CREATE TABLE IF NOT EXISTS public.workflow_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID NOT NULL REFERENCES public.workflows(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  event_data JSONB DEFAULT '{}'::jsonb,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  -- Indexes for efficient querying
  CONSTRAINT workflow_events_event_type_check CHECK (
    event_type IN (
      'INPUTS_ATTACHED',
      'CREDS_ATTACHED',
      'READY',
      'RUN_STARTED',
      'RUN_FINISHED',
      'RUN_FAILED',
      'PHASE_CHANGED',
      'VALIDATION_FAILED',
      'GRAPH_UPDATED'
    )
  )
);

-- Indexes
CREATE INDEX IF NOT EXISTS workflow_events_workflow_id_idx ON public.workflow_events(workflow_id);
CREATE INDEX IF NOT EXISTS workflow_events_event_type_idx ON public.workflow_events(event_type);
CREATE INDEX IF NOT EXISTS workflow_events_created_at_idx ON public.workflow_events(created_at);
CREATE INDEX IF NOT EXISTS workflow_events_user_id_idx ON public.workflow_events(user_id);

-- Composite index for timeline queries
CREATE INDEX IF NOT EXISTS workflow_events_workflow_timeline_idx ON public.workflow_events(workflow_id, created_at DESC);

COMMENT ON TABLE public.workflow_events IS 'Audit trail for workflow lifecycle events - used for debugging, replay, billing, compliance, and timeline UI';
