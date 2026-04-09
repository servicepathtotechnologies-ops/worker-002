/**
 * Workflow Build Manifest V1 — single source of truth for staged AI workflow generation.
 * Persisted on workflow.metadata.buildManifest; used for attach-inputs alignment and audits.
 *
 * Intent shape mirrors StructuredIntent from intent-stage (no runtime import — avoids core↔services cycles).
 */

/** Manifest schema version; bump when breaking persisted shape. */
export const WORKFLOW_BUILD_MANIFEST_VERSION = 1 as const;

export type WorkflowBuildManifestVersion = typeof WORKFLOW_BUILD_MANIFEST_VERSION;

export type BranchingMode = 'linear' | 'branching';

export type ManifestTriggerType =
  | 'schedule'
  | 'webhook'
  | 'form'
  | 'chat_trigger'
  | 'manual_trigger';

/** Same fields as StructuredIntent for persistence round-trips. */
export interface ManifestStructuredIntent {
  intent: string;
  triggerType: ManifestTriggerType;
  actions: string[];
  dataFlows: Array<{ from: string; to: string; dataDescription: string }>;
  constraints: string[];
}

export type ManifestNodeRole = 'trigger' | 'action' | 'logic' | 'terminal';

export interface AuthorizedNodeEntry {
  registryType: string;
  nodeId: string;
  role: ManifestNodeRole;
  /** From node selection stage (audit). */
  reason?: string;
}

/** nodeId → fieldName → fill mode string (serialized snapshot). */
export type ManifestFieldOwnershipSnapshot = Record<string, Record<string, string>>;

export type GraphSpecV1 =
  | {
      kind: 'deterministic_plan_chain';
      /** Canonical plan tokens or plain types in execution order. */
      planChain: string[];
    }
  | {
      kind: 'llm_seeded';
      /** True when edges came from edge-reasoning LLM + orchestrator. */
      edgeProposalStored: true;
      orderedNodeIds: string[];
    };

export interface HydrationSpecV1 {
  /** Node ids that received build-time AI property population. */
  populatedNodeIds: string[];
  /** Field keys per node that were set (best-effort summary). */
  populatedFieldsByNodeId?: Record<string, string[]>;
}

export interface CredentialDiscoverySpecV1 {
  requiredCredentialKeys: string[];
}

export interface WorkflowBuildManifestV1 {
  version: WorkflowBuildManifestVersion;
  correlationId: string;
  createdAt: string;
  /** User prompt as submitted for this build. */
  userPrompt: string;
  intent: ManifestStructuredIntent;
  /** Full structural blueprint (same family as structuralBlueprintSummary; may be large). */
  structuralBlueprint: string;
  authorizedNodes: AuthorizedNodeEntry[];
  branchingSpec: { mode: BranchingMode };
  graphSpec: GraphSpecV1;
  hydrationSpec?: HydrationSpecV1;
  credentialDiscovery?: CredentialDiscoverySpecV1;
  /** Registry-derived field ownership snapshot at build time (optional). */
  fieldOwnershipSnapshot?: ManifestFieldOwnershipSnapshot;
  integrity: {
    /** SHA-256 hex of canonical JSON of all fields except integrity (stable key order). */
    contentHash: string;
  };
}
