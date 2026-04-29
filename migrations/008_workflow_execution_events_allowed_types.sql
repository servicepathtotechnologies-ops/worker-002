-- Align workflow_execution_events with the runtime event taxonomy.
-- Older installs created a narrow CHECK constraint, causing successful
-- executions to log noisy failures for newer event types.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'workflow_execution_events'
  ) THEN
    ALTER TABLE public.workflow_execution_events
      DROP CONSTRAINT IF EXISTS workflow_execution_events_event_type_check;

    ALTER TABLE public.workflow_execution_events
      ADD CONSTRAINT workflow_execution_events_event_type_check
      CHECK (
        event_type IN (
          'RUN_STARTED',
          'RUN_FINISHED',
          'RUN_FAILED',
          'RUN_CANCELLED',
          'NODE_STARTED',
          'NODE_FINISHED',
          'NODE_FAILED',
          'NODE_RETRY',
          'NODE_SKIPPED',
          'NODE_SELF_VALIDATION',
          'AUTONOMOUS_REMEDIATION',
          'CONFIG_ATTACHED',
          'HEARTBEAT',
          'LOCK_ACQUIRED',
          'LOCK_RELEASED',
          'RESUME_STARTED',
          'WARNING'
        )
      );
  END IF;
END $$;
