/**
 * Unified Node Definition Contract
 * 
 * Every node in the system must conform to this interface.
 * This ensures consistency, validation, and deterministic execution.
 */

import { unifiedNodeRegistry } from '../registry/unified-node-registry';
import type { UnifiedNodeDefinition } from './unified-node-contract';

export interface NodeInputSchema {
  [fieldName: string]: {
    type: 'string' | 'number' | 'boolean' | 'array' | 'object' | 'json';
    description: string;
    required: boolean;
    default?: any;
    examples?: any[];
    validation?: (value: any) => boolean | string; // Return true if valid, or error message
    ui?: {
      options?: Array<{ label: string; value: string }>;
      requiredIf?: { field: string; equals: any };
      widget?: 'text' | 'textarea' | 'json' | 'multi_email';
    };
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
  /**
   * Compatibility shim.
   *
   * 🚨 Single Source of Truth: UnifiedNodeRegistry
   * This legacy registry now delegates to `unifiedNodeRegistry` so ALL schemas/defaults/migrations
   * come from one place for existing + future workflows.
   */

  register(_definition: NodeDefinition): void {
    // Legacy no-op: definitions must be registered in UnifiedNodeRegistry (or NodeLibrary feeding it).
    // Kept to avoid breaking old imports that auto-register node definitions.
  }

  private toLegacy(def: UnifiedNodeDefinition): NodeDefinition {
    const inputSchema: NodeInputSchema = {};
    for (const [k, v] of Object.entries(def.inputSchema || {})) {
      inputSchema[k] = {
        type: v.type === 'expression' ? 'string' : (v.type as any),
        description: v.description || '',
        required: !!v.required,
        default: v.default,
        examples: v.examples,
      };
    }

    const outputSchema: NodeOutputSchema = {};
    for (const [port, pdef] of Object.entries(def.outputSchema || {})) {
      outputSchema[port] = {
        type: (pdef.schema?.type as any) || 'object',
        description: pdef.description || '',
      };
    }

    return {
      type: def.type,
      label: def.label,
      category: def.category,
      description: def.description,
      icon: def.icon,
      version: 1,
      inputSchema,
      outputSchema,
      requiredInputs: def.requiredInputs || [],
      outgoingPorts: def.outgoingPorts || ['default'],
      incomingPorts: def.incomingPorts || ['default'],
      isBranching: !!def.isBranching,
      validateInputs: (inputs) => {
        const res = def.validateConfig(inputs || {});
        return { valid: res.valid, errors: res.errors };
      },
      defaultInputs: () => def.defaultConfig(),
      credentialSchema: def.credentialSchema
        ? {
            providers: Array.from(new Set(def.credentialSchema.requirements.map((r) => r.provider))),
            required: def.credentialSchema.requirements.filter((r) => r.required).map((r) => r.category),
          }
        : undefined,
      migrations: undefined,
      run: undefined,
    };
  }

  get(type: string): NodeDefinition | undefined {
    const def = unifiedNodeRegistry.get(type);
    return def ? this.toLegacy(def) : undefined;
  }

  getAll(): NodeDefinition[] {
    return unifiedNodeRegistry.getAllTypes().map((t) => this.get(t)).filter(Boolean) as NodeDefinition[];
  }

  getAllByCategory(): Record<string, NodeDefinition[]> {
    const byCategory: Record<string, NodeDefinition[]> = {};
    for (const def of this.getAll()) {
      if (!byCategory[def.category]) byCategory[def.category] = [];
      byCategory[def.category].push(def);
    }
    return byCategory;
  }

  /**
   * Migrate node inputs to latest version
   */
  migrateInputs(nodeType: string, inputs: Record<string, any>, fromVersion?: number): Record<string, any> {
    // UnifiedNodeRegistry owns migrations (string versioning).
    // fromVersion is ignored here for compatibility; runtime always migrates to latest.
    void fromVersion;
    return unifiedNodeRegistry.migrateConfig(nodeType, inputs || {});
  }

  /**
   * Validate node inputs against schema
   */
  validateNodeInputs(nodeType: string, inputs: Record<string, any>): { valid: boolean; errors: string[] } {
    const res = unifiedNodeRegistry.validateConfig(nodeType, inputs || {});
    return { valid: res.valid, errors: res.errors };
  }

  /**
   * Get default inputs for a node type
   */
  getDefaultInputs(nodeType: string): Record<string, any> {
    return unifiedNodeRegistry.getDefaultConfig(nodeType) || {};
  }
}

// Global registry instance
export const nodeDefinitionRegistry = new NodeDefinitionRegistry();
