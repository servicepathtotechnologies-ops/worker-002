/**
 * AI Workflow Editor – Shared Contracts
 *
 * These types are the single source of truth for:
 * - What context the AI editor receives about a workflow
 * - What operations the AI editor is allowed to perform
 * - How diffs and results are represented between backend, LLM, and UI
 *
 * Design goals:
 * - Node-centric: operations describe node intent; edges are derived by the unified graph orchestrator.
 * - Registry-aligned: nodeType values must be canonical types known to unified-node-registry.
 * - Deterministic: no free-form code, only structured JSON operations.
 */

import type { Workflow, WorkflowNode, WorkflowEdge } from './ai-types';

export type AiEditorMode = 'analyze' | 'suggest_edits' | 'apply_edits';

/**
 * High-level intent of a chat turn.
 * This lets the backend choose how much freedom to give the LLM.
 */
export type AiEditorIntent =
  | 'ask_question'
  | 'explain_workflow'
  | 'validate_workflow'
  | 'suggest_improvements'
  | 'edit_structure'
  | 'edit_config'
  | 'refactor_minimal_path';

/**
 * Scope the user is interested in for explanations / edits.
 */
export interface AiEditorScope {
  /** Workflow ID in persistence layer. */
  workflowId: string;
  /** Optional version identifier if versioned storage is enabled. */
  versionId?: string;
  /** Optional focused node ID (e.g. user has selected a node in the canvas). */
  focusedNodeId?: string;
}

/**
 * Minimal shape of a workflow graph the AI editor operates on.
 * This is intentionally aligned with core Workflow types.
 */
export interface AiEditorWorkflowSnapshot {
  workflow: Workflow;
  /** Optional precomputed execution order identifier or metadata. */
  executionOrderId?: string;
}

/**
 * Node-level metadata exposed to AI (registry-derived, read-only).
 * Raw execution logic and credentials are NOT exposed.
 */
export interface AiEditorNodeSchemaSummary {
  type: string;
  label: string;
  category: string;
  description?: string;
  /**
   * Simplified input schema:
   * field name → basic type + whether required.
   * Detailed validation rules remain in registry; AI sees only a safe projection.
   */
  inputs: Array<{
    name: string;
    type: string;
    required: boolean;
    description?: string;
  }>;
  /**
   * Simplified output ports and shapes (field name → type).
   * Used for dataflow reasoning, not for runtime validation.
   */
  outputs: Array<{
    port: string;
    fields?: Record<string, string>;
  }>;
  /**
   * High-level credential requirements without exposing secret values.
   */
  credentials?: Array<{
    provider: string;
    category: string;
    required: boolean;
  }>;
}

export interface AiEditorRegistryContext {
  /** Node types that appear in the current workflow, with their schemas. */
  nodeSchemas: Record<string, AiEditorNodeSchemaSummary>;
}

/**
 * READ-ONLY operations (no graph mutation).
 */
export interface ExplainWorkflowOperation {
  kind: 'explain_workflow';
  scope?: AiEditorScope;
}

export interface ValidateWorkflowOperation {
  kind: 'validate_workflow';
  scope?: AiEditorScope;
}

/**
 * STRUCTURAL + CONFIG EDIT OPERATIONS
 *
 * These are the only operations the LLM is allowed to emit when it is
 * acting as an editor. All structural changes MUST be realized via
 * unified-graph-orchestrator.
 */

export interface AddNodeOperation {
  kind: 'add_node';
  nodeType: string;
  /**
   * Optional human-readable label. The backend may override or normalize.
   */
  label?: string;
  /**
   * Partial config to seed the node with. This will be merged with
   * registry defaultConfig and validated against the registry inputSchema.
   */
  configOverrides?: Record<string, unknown>;
  /**
   * Placement hint – purely semantic; orchestrator decides final wiring.
   */
  positionHint?: {
    /**
     * 'before' | 'after' | 'replace' relative to reference node.
     */
    relation: 'before' | 'after' | 'replace';
    /**
     * Node ID in the current workflow the AI is positioning relative to.
     */
    referenceNodeId: string;
  };
}

export interface RemoveNodeOperation {
  kind: 'remove_node';
  nodeId: string;
}

export interface ReplaceNodeOperation {
  kind: 'replace_node';
  targetNodeId: string;
  newNodeType: string;
  /**
   * Strategy for how to treat existing config on the target node.
   */
  configStrategy?: 'preserve_compatible' | 'use_defaults' | 'merge';
  /**
   * Optional explicit overrides for the new node.
   */
  configOverrides?: Record<string, unknown>;
}

export interface UpdateNodeConfigOperation {
  kind: 'update_node_config';
  nodeId: string;
  /**
   * JSON pointer–style path (e.g. "/prompt" or "/conditions/0/value").
   */
  path: string;
  newValue: unknown;
}

export interface InsertSafetyNodeOperation {
  kind: 'insert_safety_node';
  /**
   * Canonical node type to insert (e.g. ai_guardrail, log_output variant, etc.).
   */
  nodeType: string;
  position: {
    relation: 'before' | 'after';
    referenceNodeId: string;
  };
  configOverrides?: Record<string, unknown>;
}

export interface RefactorLinearizeOperation {
  kind: 'refactor_linearize';
  /**
   * Optional: preserve only nodes that contribute to these outputs.
   */
  focusNodeIds?: string[];
}

export type AiEditorMutationOperation =
  | AddNodeOperation
  | RemoveNodeOperation
  | ReplaceNodeOperation
  | UpdateNodeConfigOperation
  | InsertSafetyNodeOperation
  | RefactorLinearizeOperation;

export type AiEditorOperation =
  | ExplainWorkflowOperation
  | ValidateWorkflowOperation
  | AiEditorMutationOperation;

/**
 * Machine-readable diff for a single edit batch.
 */
export interface WorkflowNodeDiff {
  nodeId: string;
  before?: WorkflowNode;
  after?: WorkflowNode;
}

export interface WorkflowEdgeDiff {
  edgeId: string;
  before?: WorkflowEdge;
  after?: WorkflowEdge;
}

export interface WorkflowMetadataDiff {
  before?: Workflow['metadata'];
  after?: Workflow['metadata'];
}

export interface WorkflowDiff {
  nodes?: WorkflowNodeDiff[];
  edges?: WorkflowEdgeDiff[];
  metadata?: WorkflowMetadataDiff;
}

/**
 * Request from UI → backend AI editor service.
 */
export interface AiEditorRequest {
  mode: AiEditorMode;
  intent: AiEditorIntent;
  scope: AiEditorScope;
  /**
   * Raw user message from the chat UI.
   */
  prompt: string;
  /**
   * Current workflow snapshot (typically the latest draft or active version).
   */
  workflowSnapshot: AiEditorWorkflowSnapshot;
}

/**
 * Result of a single AI editor turn.
 */
export interface AiEditorResponse {
  /**
   * Natural-language explanation or summary for the user.
   */
  message: string;
  /**
   * Operations the AI proposes or has applied.
   * - In suggest_edits mode: these are suggestions only.
   * - In apply_edits mode: these are the operations actually applied.
   */
  operations: AiEditorOperation[];
  /**
   * Optional diff between the previous and new workflow graph.
   */
  diff?: WorkflowDiff;
  /**
   * The resulting workflow snapshot after applying operations.
   * For analyze-only requests this may equal the input snapshot.
   */
  updatedWorkflow?: AiEditorWorkflowSnapshot;
}

/**
 * Minimal contract between backend AI engine and LLM tool-calling layer.
 * This allows us to strongly type the operations we expect the LLM to emit.
 */
export interface AiEditorToolCall {
  name: 'apply_ai_editor_operations';
  arguments: {
    operations: AiEditorOperation[];
  };
}

