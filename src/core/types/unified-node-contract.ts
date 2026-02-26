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

export interface NodeInputField {
  type: 'string' | 'number' | 'boolean' | 'array' | 'object' | 'json' | 'expression';
  description: string;
  required: boolean;
  default?: any;
  examples?: any[];
  validation?: (value: any) => boolean | string; // Return true if valid, or error message
  dependsOn?: string[]; // Field dependencies
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
}
