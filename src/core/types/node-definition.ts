/**
 * Unified Node Definition Contract
 * 
 * Every node in the system must conform to this interface.
 * This ensures consistency, validation, and deterministic execution.
 */

export interface NodeInputSchema {
  [fieldName: string]: {
    type: 'string' | 'number' | 'boolean' | 'array' | 'object' | 'json';
    description: string;
    required: boolean;
    default?: any;
    examples?: any[];
    validation?: (value: any) => boolean | string; // Return true if valid, or error message
  };
}

export interface NodeOutputSchema {
  [portName: string]: {
    type: 'string' | 'number' | 'boolean' | 'array' | 'object' | 'json';
    description: string;
  };
}

export interface NodeMigration {
  version: number;
  migrate: (oldInputs: Record<string, any>) => Record<string, any>;
}

export interface NodeDefinition {
  // Core identity
  type: string;
  label: string;
  category: string;
  description: string;
  icon?: string;
  version?: number; // Node definition version for migrations

  // Schema definitions
  inputSchema: NodeInputSchema;
  outputSchema: NodeOutputSchema;
  requiredInputs: string[]; // Subset of inputSchema keys
  outgoingPorts: string[]; // Port names for edges (e.g., ['true', 'false'] for If/Else)
  incomingPorts: string[]; // Port names for incoming edges (usually ['default'])
  isBranching: boolean; // true if node can have multiple outgoing edges

  // Validation
  validateInputs: (inputs: Record<string, any>) => { valid: boolean; errors: string[] };
  defaultInputs: () => Record<string, any>;

  // Credential requirements (framework-level; do NOT store secrets in workflow config)
  credentialSchema?: {
    // High-level providers needed (e.g., ['google', 'slack'])
    providers?: string[];
    // Config fields that are credentials (API keys, tokens) when applicable
    required?: string[];
    optional?: string[];
  };

  // Migrations (for backward compatibility)
  migrations?: NodeMigration[];

  // Execution (optional - for nodes that need custom execution logic)
  run?: (context: NodeExecutionContext) => Promise<any>;
}

export interface NodeExecutionContext {
  inputs: Record<string, any>;
  previousOutputs: Record<string, any>;
  workflowId: string;
  nodeId: string;
  userId?: string;
  currentUserId?: string;
  // Runtime-only fields (execution engine supplies these)
  input?: any;
  nodeOutputs?: Record<string, any>;
  supabase?: any;
}

/**
 * Node Definition Registry
 * 
 * Central registry for all node definitions.
 * Backend is the source of truth.
 */
export class NodeDefinitionRegistry {
  private definitions: Map<string, NodeDefinition> = new Map();

  register(definition: NodeDefinition): void {
    if (this.definitions.has(definition.type)) {
      console.warn(`[NodeRegistry] Overwriting existing definition for type: ${definition.type}`);
    }
    this.definitions.set(definition.type, definition);
  }

  get(type: string): NodeDefinition | undefined {
    return this.definitions.get(type);
  }

  getAll(): NodeDefinition[] {
    return Array.from(this.definitions.values());
  }

  getAllByCategory(): Record<string, NodeDefinition[]> {
    const byCategory: Record<string, NodeDefinition[]> = {};
    for (const def of this.definitions.values()) {
      if (!byCategory[def.category]) {
        byCategory[def.category] = [];
      }
      byCategory[def.category].push(def);
    }
    return byCategory;
  }

  /**
   * Migrate node inputs to latest version
   */
  migrateInputs(nodeType: string, inputs: Record<string, any>, fromVersion?: number): Record<string, any> {
    const definition = this.get(nodeType);
    if (!definition || !definition.migrations || definition.migrations.length === 0) {
      return inputs; // No migrations needed
    }

    let currentInputs = inputs;
    const startVersion = fromVersion || 1;
    
    // Apply migrations in order
    for (const migration of definition.migrations) {
      if (migration.version > startVersion) {
        try {
          currentInputs = migration.migrate(currentInputs);
        } catch (error) {
          console.error(`[NodeRegistry] Migration ${migration.version} failed for ${nodeType}:`, error);
          // Continue with previous version
        }
      }
    }

    return currentInputs;
  }

  /**
   * Validate node inputs against schema
   */
  validateNodeInputs(nodeType: string, inputs: Record<string, any>): { valid: boolean; errors: string[] } {
    const definition = this.get(nodeType);
    if (!definition) {
      return { valid: false, errors: [`Unknown node type: ${nodeType}`] };
    }

    return definition.validateInputs(inputs);
  }

  /**
   * Get default inputs for a node type
   */
  getDefaultInputs(nodeType: string): Record<string, any> {
    const definition = this.get(nodeType);
    if (!definition) {
      return {};
    }
    return definition.defaultInputs();
  }
}

// Global registry instance
export const nodeDefinitionRegistry = new NodeDefinitionRegistry();
