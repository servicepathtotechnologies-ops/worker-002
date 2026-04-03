/**
 * Typed stage transcript for senior/junior agent gating (plan: Appendix F).
 * Graph truth remains in unifiedGraphOrchestrator — this is audit metadata only.
 */

export type OrchestratorOpName =
  | 'initializeWorkflow'
  | 'reconcileWorkflow'
  | 'injectNode'
  | 'removeNode'
  | 'removeEdges'
  | 'validateWorkflow';

export interface WorkflowAgentStageEntry {
  stageId: string;
  timestampIso: string;
  /** Orchestrator ops only — no raw workflow.edges mutation */
  juniorProposal?: { op: OrchestratorOpName; context?: Record<string, unknown> };
  validationSummary?: { valid: boolean; errorCount: number; warningCount: number };
  workflowHash?: string;
}

export interface WorkflowAgentTranscript {
  sessionId: string;
  entries: WorkflowAgentStageEntry[];
}

export function createEmptyTranscript(sessionId: string): WorkflowAgentTranscript {
  return { sessionId, entries: [] };
}

export function appendStage(
  transcript: WorkflowAgentTranscript,
  entry: Omit<WorkflowAgentStageEntry, 'timestampIso'> & { timestampIso?: string }
): WorkflowAgentTranscript {
  return {
    ...transcript,
    entries: [
      ...transcript.entries,
      {
        ...entry,
        timestampIso: entry.timestampIso ?? new Date().toISOString(),
      },
    ],
  };
}
