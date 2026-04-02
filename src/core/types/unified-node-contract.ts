/**
 * UNIFIED NODE CONTRACT - Single Source of Truth
 * 
 * This is the PERMANENT CORE ARCHITECTURE for all nodes.
 * Every node in the system MUST conform to this contract.
 * 
 * This contract ensures:
 * - Single source of truth (NodeRegistry)
 * - No hardcoded node logic in execution engine
 * - Automatic validation from schema
 * - Backward compatibility via migrations
 * - Infinite scalability (500+ node types)
 */

import type { FieldHelpCategory } from '../utils/field-help-metadata';

export type FieldFillMode = 'manual_static' | 'runtime_ai' | 'buildtime_ai_once';
export type FieldOwnershipClass = 'structural' | 'value' | 'credential';

export interface NodeInputField {
  type: 'string' | 'number' | 'boolean' | 'array' | 'object' | 'json' | 'expression';
  description: string;
  required: boolean;
  default?: any;
  examples?: any[];
  validation?: (value: any) => boolean | string; // Return true if valid, or error message
  dependsOn?: string[]; // Field dependencies
  /**
   * Universal, registry-driven fill mode metadata.
   * This describes how values for this input are expected to be provided:
   * - manual_static: user (or static config) must provide the value
   * - runtime_ai: value is filled at runtime from upstream JSON + intent
   * - buildtime_ai_once: AI may generate a static value once during configuration.
   *
   * NOTE: This is metadata only; runtime behavior is enforced by dynamic-node-executor.
   */
  fillMode?: {
    /** Default strategy when workflow builders / UI have no explicit choice. */
    default: FieldFillMode;
    /** Whether runtime AI input resolution is allowed for this field. */
    supportsRuntimeAI?: boolean;
    /** Whether build-time AI is allowed to generate a static value once. */
    supportsBuildtimeAI?: boolean;
  };
  /**
   * Semantic role for universal runtime AI behavior and UX grouping.
   * This is metadata only (no node-specific execution branching).
   */
  role?: 'title_like' | 'long_body' | 'short_summary' | 'raw_json' | 'id' | 'config' | 'prompt' | 'recipient' | 'content';
  /** Canonical ownership class used across planner/question/runtime phases. */
  ownership?: FieldOwnershipClass;
  /**
   * When `ownership` is `credential`, controls whether the Field Ownership UI may
   * be unlocked so the user can choose manual vs AI fill modes (via `unlock_<nodeId>_<field>` on attach-inputs).
   * - `locked` (default): treat as vault-like; only manual_static unless explicitly unlocked when unlockable.
   * - `unlockable`: locked until `config._ownershipUnlock[fieldName]` is true.
   */
  credentialTogglePolicy?: 'locked' | 'unlockable';
  /**
   * Whether this field is essential for useful node behavior in the unified
   * full-configuration wizard. Required fields are implicitly essential.
   */
  essentialForExecution?: boolean;
  /**
   * When set, this field mirrors another input field (canonical name on the same node).
   * Dynamic executor copies from the canonical field before strict runtime_ai validation
   * if this field is empty. Use with essentialForExecution: false on the alias to avoid
   * duplicate strict requirements (e.g. Slack `text` vs `message`).
   */
  aliasOf?: string;
  /**
   * Registry-driven category for "how to get this value" UX and credential flows.
   */
  helpCategory?: FieldHelpCategory;
  /** Optional canonical documentation URL for this field (console / vendor docs). */
  docsUrl?: string;
  /** Optional example string shown in guides (non-secret placeholder). */
  exampleValue?: string;
  /**
   * UI hints for schema-driven Properties panel and GET /api/node-definitions.
   * Populated from NodeLibrary field definitions (options, requiredIf); not used for execution.
   */
  ui?: {
    options?: Array<{ label: string; value: string }>;
    requiredIf?: { field: string; equals: unknown };
    /** Visibility only (field optional when shown). Prefer over requiredIf when fields must not be marked required. */
    visibleIf?: { field: string; equals: unknown };
    widget?: 'text' | 'textarea' | 'json' | 'multi_email';
    /** Shown under selects when config value matches whenValue (schema-driven UX). */
    contextHints?: Array<{ whenValue: string; message: string }>;
  };
}

export interface NodeInputSchema {
  [fieldName: string]: NodeInputField;
}

export interface NodeOutputPort {
  name: string; // e.g., 'default', 'true', 'false', 'error'
  description: string;
  schema: {
    type: 'string' | 'number' | 'boolean' | 'array' | 'object';
    properties?: Record<string, any>; // JSON schema properties
  };
}

export interface NodeOutputSchema {
  [portName: string]: NodeOutputPort;
}

/**
 * Effective output schema: the JSON shape a node produces at runtime.
 * Used by intent→config to generate downstream node config/code from upstream output.
 * - For static nodes: properties describe the fixed shape (e.g. http_request → status, body).
 * - For dynamic nodes (form, code): properties are derived from config (form fields) or marked dynamic.
 */
export interface EffectiveOutputSchema {
  type: 'object' | 'array' | 'string' | 'number' | 'boolean';
  /** For type 'object': property names and types. Downstream nodes use these to generate code (e.g. $json.number). */
  properties?: Record<string, { type: string; description?: string }>;
  /** For type 'array': item shape when known. */
  itemType?: 'object' | 'string' | 'number' | 'boolean';
  /** True if output shape is defined by node config (e.g. form fields, code return). Caller should use upstream schema + intent. */
  dynamic?: boolean;
}

export interface NodeCredentialRequirement {
  provider: string; // e.g., 'google', 'slack', 'openai'
  category: string; // e.g., 'oauth', 'api_key', 'webhook'
  required: boolean;
  description: string;
  scopes?: string[]; // OAuth scopes if applicable
}

export interface NodeCredentialSchema {
  requirements: NodeCredentialRequirement[];
  // Fields in config that are credentials (for discovery)
  credentialFields?: string[];
}

export interface NodeMigration {
  fromVersion: string;
  toVersion: string;
  migrate: (oldConfig: Record<string, any>) => Record<string, any>;
}

export interface NodeExecutionContext {
  nodeId: string;
  nodeType: string;
  config: Record<string, any>;
  inputs: Record<string, any>; // Resolved input values
  rawInput: unknown; // Raw incoming data payload from upstream (what the node "receives")
  upstreamOutputs: Map<string, any>; // nodeId -> output
  workflowId: string;
  userId?: string;
  currentUserId?: string;
  supabase: any; // Supabase client
  [key: string]: any; // Additional context
}

export interface NodeExecutionResult {
  success: boolean;
  output?: any;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
  metadata?: {
    executionTime?: number;
    retries?: number;
    [key: string]: any;
  };
}

/**
 * UNIFIED NODE DEFINITION CONTRACT
 * 
 * This is the single source of truth for ALL node behavior.
 * Every node type must have a complete definition here.
 */
export interface UnifiedNodeDefinition {
  // ============================================
  // CORE IDENTITY (Immutable)
  // ============================================
  type: string; // Canonical node type (e.g., 'google_sheets', 'ai_chat_model')
  label: string; // Human-readable label
  category: 'trigger' | 'data' | 'ai' | 'communication' | 'logic' | 'transformation' | 'utility';
  description: string;
  icon?: string;
  version: string; // Schema version (e.g., '1.0.0')
  
  // ============================================
  // SCHEMA DEFINITIONS (Single Source of Truth)
  // ============================================
  inputSchema: NodeInputSchema; // ALL possible input fields
  outputSchema: NodeOutputSchema; // ALL possible output ports
  credentialSchema?: NodeCredentialSchema; // Credential requirements
  
  // ============================================
  // VALIDATION & DEFAULTS
  // ============================================
  requiredInputs: string[]; // Subset of inputSchema keys that are required
  defaultConfig: () => Record<string, any>; // Factory function for default config
  
  validateConfig: (config: Record<string, any>) => {
    valid: boolean;
    errors: string[];
    warnings?: string[];
  };
  
  // ============================================
  // EXECUTION CONTRACT
  // ============================================
  /**
   * Execute the node
   * This is the ONLY place node-specific execution logic should exist
   */
  execute: (context: NodeExecutionContext) => Promise<NodeExecutionResult>;
  
  // ============================================
  // EDGE CONNECTIONS
  // ============================================
  incomingPorts: string[]; // Port names for incoming edges (usually ['default'])
  outgoingPorts: string[]; // Port names for outgoing edges (e.g., ['default', 'true', 'false'])
  isBranching: boolean; // true if node can have multiple outgoing edges
  
  // ============================================
  // BACKWARD COMPATIBILITY
  // ============================================
  migrations?: NodeMigration[]; // Migrate old configs to new schema
  aliases?: string[]; // Alternative type names (e.g., 'gmail' -> 'google_gmail')
  
  // ============================================
  // AI GENERATION SUPPORT
  // ============================================
  aiSelectionCriteria?: {
    keywords: string[];
    useCases: string[];
    whenToUse: string[];
    whenNotToUse: string[];
  };
  
  // ============================================
  // METADATA
  // ============================================
  tags?: string[]; // For search/filtering
  deprecated?: boolean; // Mark as deprecated
  replacement?: string; // Suggested replacement node type
  
  // ============================================
  // WORKFLOW-LEVEL BEHAVIORS (Registry-Driven)
  // ============================================
  /**
   * Workflow-level behaviors that apply to ALL workflows
   * These are defined in the registry, not hardcoded in builders
   * 
   * Example: log_output has alwaysRequired: true, alwaysTerminal: true
   * This means it's automatically included in all workflows and must be the last node
   */
  workflowBehavior?: {
    /**
     * Always required in workflows (auto-included even if not in intent)
     * Example: log_output (universal final output)
     */
    alwaysRequired?: boolean;
    
    /**
     * Must be terminal node (no outgoing edges, always last)
     * Example: log_output (must be final node)
     */
    alwaysTerminal?: boolean;
    
    /**
     * Exempt from removal by minimal workflow policy
     * Example: log_output (should never be removed)
     */
    exemptFromRemoval?: boolean;
    
    /**
     * Auto-inject if missing (after workflow building)
     * Example: log_output (inject if not present)
     */
    autoInject?: boolean;
    
    /**
     * Injection priority (lower = higher priority)
     * Example: log_output = 0 (highest priority, inject first)
     */
    injectionPriority?: number;
  };
}

/**
 * Maps switch case values to downstream node types.
 * e.g. { "sales": "slack", "support": "google_gmail", "general": "log_output" }
 * Used by WorkflowIntentPlan and Graph_Orchestrator switch edge wiring.
 */
export interface CaseNodeMapping {
  [caseValue: string]:
    | string
    | {
        targetNodeType?: string;
        targetNodeId?: string;
        slot?: string;
      };
}

/**
 * NODE REGISTRY INTERFACE
 * 
 * Central registry that stores ALL node definitions.
 * This is the ONLY place node behavior is defined.
 */
export interface INodeRegistry {
  /**
   * Register a node definition
   * This is called during system initialization
   */
  register(definition: UnifiedNodeDefinition): void;
  
  /**
   * Get node definition by type
   * Returns undefined if node type doesn't exist
   */
  get(nodeType: string): UnifiedNodeDefinition | undefined;
  
  /**
   * Get all registered node types
   */
  getAllTypes(): string[];
  
  /**
   * Check if node type exists
   */
  has(nodeType: string): boolean;
  
  /**
   * Resolve alias to canonical type
   * e.g., 'gmail' -> 'google_gmail'
   */
  resolveAlias(alias: string): string | undefined;
  
  /**
   * Migrate old config to current schema version
   */
  migrateConfig(nodeType: string, oldConfig: Record<string, any>): Record<string, any>;
  
  /**
   * Validate node config against schema
   */
  validateConfig(nodeType: string, config: Record<string, any>): {
    valid: boolean;
    errors: string[];
    warnings?: string[];
  };
  
  /**
   * Get default config for node type
   */
  getDefaultConfig(nodeType: string): Record<string, any>;
  
  /**
   * Get required credentials for node type
   */
  getRequiredCredentials(nodeType: string): NodeCredentialRequirement[];
  
  /**
   * Get output schema for node type
   */
  getOutputSchema(nodeType: string): NodeOutputSchema | undefined;
  
  /**
   * Get input schema for node type
   */
  getInputSchema(nodeType: string): NodeInputSchema | undefined;
  
  /**
   * Get effective output schema for a node given its config.
   * For form: derives properties from config.fields. For code/javascript: returns dynamic object.
   * Used by intent→config to generate downstream config/code from upstream JSON shape.
   */
  getEffectiveOutputSchema(nodeType: string, config?: Record<string, any>): EffectiveOutputSchema | undefined;

  /**
   * Branching nodes: effective outgoing port names for this workflow node instance
   * (e.g. switch cases from persisted config). Prefer over definition.outgoingPorts alone.
   */
  getOutgoingPortsForWorkflowNode(node: {
    type?: string;
    data?: { type?: string; config?: Record<string, any> };
  }): string[];
  
  /**
   * ✅ UNIVERSAL: Get all nodes with specific workflow-level behavior
   * Used by orchestrators, policies, builders to query registry
   */
  getNodesWithBehavior(behavior: keyof NonNullable<UnifiedNodeDefinition['workflowBehavior']>): UnifiedNodeDefinition[];
  
  /**
   * ✅ UNIVERSAL: Check if node has specific workflow behavior
   */
  hasWorkflowBehavior(nodeType: string, behavior: keyof NonNullable<UnifiedNodeDefinition['workflowBehavior']>): boolean;
  
  /**
   * ✅ UNIVERSAL: Get all always-required nodes (for auto-inclusion)
   */
  getAlwaysRequiredNodes(): UnifiedNodeDefinition[];
  
  /**
   * ✅ UNIVERSAL: Get all always-terminal nodes (must be last)
   */
  getAlwaysTerminalNodes(): UnifiedNodeDefinition[];
  
  /**
   * ✅ UNIVERSAL: Get all exempt-from-removal nodes
   */
  getExemptFromRemovalNodes(): UnifiedNodeDefinition[];
}
