export interface WorkflowPlanNode {
  /**
   * Stable identifier for this node within the plan.
   * This will be mapped to a WorkflowNode.id in the orchestrated graph.
   */
  id: string;

  /**
   * Canonical node type as registered in unified-node-registry.
   * Example: "form", "if_else", "google_gmail", "log_output".
   */
  type: string;

  /**
   * Node configuration object.
   * Shape is defined by unified-node-registry inputSchema for this type.
   * The planner/LLM MUST respect that schema; the validator will enforce it.
   */
  config?: Record<string, unknown>;
}

export type WorkflowPlanEdgeType =
  | 'main'
  | 'true'
  | 'false'
  | `case_${number}`;

export interface WorkflowPlanEdge {
  /**
   * Source node id (must reference a WorkflowPlanNode.id).
   */
  source: string;

  /**
   * Target node id (must reference a WorkflowPlanNode.id).
   */
  target: string;

  /**
   * Edge type:
   * - "main"  → default linear flow
   * - "true"/"false" → branches from if_else
   * - "case_N" → branches from switch
   */
  type: WorkflowPlanEdgeType;
}

/**
 * Universal, model-facing workflow representation.
 *
 * The AI planner is responsible for producing this structure in JSON.
 * The backend then:
 * - Validates each node against unified-node-registry schemas.
 * - Validates and normalizes the edge set via unified-graph-orchestrator.
 * - Converts it into the internal Workflow graph type.
 */
export interface WorkflowPlan {
  /**
   * Human-readable description of the workflow (optional, for UI/debug).
   */
  description?: string;

  /**
   * Nodes proposed by the planner/LLM.
   */
  nodes: WorkflowPlanNode[];

  /**
   * Edges proposed by the planner/LLM.
   * Empty is allowed; orchestrator may synthesize edges from execution rules,
   * but well-formed plans SHOULD provide a complete edge set.
   */
  edges: WorkflowPlanEdge[];
}

