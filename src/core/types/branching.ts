/**
 * Core branching metadata types used at planning/summarization time.
 *
 * These types are intentionally planner-level only:
 * - They describe how many branches exist and what each branch means.
 * - They do NOT encode runtime edge wiring or node-specific logic.
 * - Runtime behavior remains driven by unified-node-registry + orchestrators.
 */

export type BranchKind = 'if_else' | 'switch' | 'threshold' | 'match';

export type ConditionExpressionType =
  | 'comparison'
  | 'equality'
  | 'contains'
  | 'regex';

/**
 * Structured condition for a single branch.
 * This mirrors common patterns used by if_else and switch-style nodes.
 */
export interface ConditionExpression {
  /**
   * Condition flavor (equality, comparison, contains, regex).
   */
  type: ConditionExpressionType;

  /**
   * Field reference or expression on the left-hand side.
   * Example: "ball_color", "user.status", "score".
   */
  left?: string;

  /**
   * Operator for comparison-style conditions.
   * Example: "==", "!=", ">", "<", ">=", "<=", "contains".
   */
  operator?: string;

  /**
   * Right-hand side value for comparison-style conditions.
   * Example: 18, "approved", true.
   */
  right?: unknown;

  /**
   * Convenience field for switch-style equality matching.
   * When present, the condition is typically:
   *   left (or discriminator field) === matchValue
   */
  matchValue?: string | number | boolean;
}

/**
 * One logical branch case in a branching construct.
 */
export interface BranchCase {
  /**
   * Stable identifier for this case (planner-level UUID or similar).
   * Used for tracing and diagnostics.
   */
  id: string;

  /**
   * Human-readable label for this branch.
   * Example: "red", "approved", "default".
   */
  label: string;

  /**
   * Structured condition that defines when this branch is taken.
   */
  condition: ConditionExpression;

  /**
   * Canonical node types that this branch should route to.
   * These are registry-backed node type IDs (e.g. "google_gmail", "slack_message").
   * Concrete node IDs are assigned later during workflow construction.
   */
  targetNodeTypes: string[];

  /**
   * Whether this case should be treated as the default branch
   * when no other case matches.
   */
  isDefault?: boolean;
}

/**
 * Planner-level representation of branching behavior for a workflow.
 *
 * This is attached to WorkflowIntentPlan and used for:
 * - Generating structured summaries that match intended branches.
 * - Validating that enough branch targets exist in the proposed node chain.
 *
 * Runtime branching behavior remains derived from:
 * - unified-node-registry (isBranching, outgoingPorts, etc.)
 * - unified graph orchestrators and edge reconciliation.
 */
export interface BranchMetadata {
  /**
   * High-level branching kind (if_else, switch, threshold, match).
   */
  branchKind: BranchKind;

  /**
   * Discriminator field used for branching when known.
   * Example: "ball_color", "status", "score".
   */
  discriminatorField?: string;

  /**
   * Logical branch cases.
   */
  cases: BranchCase[];

  /**
   * Optional default case when no other case matches.
   */
  defaultCase?: BranchCase;

  /**
   * Planner's estimate of how many distinct outcomes the user described.
   * This is advisory and used for validation/diagnostics.
   */
  estimatedBranchCount?: number;

  /**
   * Confidence score (0..1) for how reliable this branching interpretation is.
   */
  confidence?: number;
}

