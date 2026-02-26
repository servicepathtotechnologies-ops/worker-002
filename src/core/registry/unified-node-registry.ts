/**
 * UNIFIED NODE REGISTRY
 * 
 * This is the SINGLE SOURCE OF TRUTH for all node definitions.
 * 
 * Architecture Rules:
 * 1. ALL node behavior MUST be defined here
 * 2. Execution engine MUST fetch definitions from here
 * 3. Validators MUST reference schemas from here
 * 4. Workflow builders MUST hydrate defaults from here
 * 5. NO hardcoded node logic allowed elsewhere
 * 
 * This ensures:
 * - Permanent fixes apply to ALL workflows
 * - Infinite scalability (500+ node types)
 * - Backward compatibility via migrations
 * - Type safety and validation
 */

import { 
  UnifiedNodeDefinition, 
  INodeRegistry, 
  NodeCredentialRequirement,
  NodeCredentialSchema,
  NodeOutputSchema,
  NodeInputSchema,
  NodeMigration,
  NodeExecutionContext
} from '../types/unified-node-contract';
import { nodeLibrary } from '../../services/nodes/node-library';
import { normalizeNodeType } from '../utils/node-type-normalizer';

export class UnifiedNodeRegistry implements INodeRegistry {
  private static instance: UnifiedNodeRegistry;
  private definitions: Map<string, UnifiedNodeDefinition> = new Map();
  private aliasMap: Map<string, string> = new Map(); // alias -> canonical type
  
  private constructor() {
    console.log('[UnifiedNodeRegistry] 🏗️  Initializing Unified Node Registry...');
    this.initializeFromNodeLibrary();
    console.log(`[UnifiedNodeRegistry] ✅ Initialized with ${this.definitions.size} node definitions`);
  }
  
  static getInstance(): UnifiedNodeRegistry {
    if (!UnifiedNodeRegistry.instance) {
      UnifiedNodeRegistry.instance = new UnifiedNodeRegistry();
    }
    return UnifiedNodeRegistry.instance;
  }
  
  /**
   * Initialize registry from existing NodeLibrary
   * This bridges the old system to the new unified contract
   */
  private initializeFromNodeLibrary(): void {
    const allSchemas = nodeLibrary.getAllSchemas();
    
    for (const schema of allSchemas) {
      try {
        const definition = this.convertNodeLibrarySchemaToUnified(schema);
        this.register(definition);
      } catch (error) {
        console.error(`[UnifiedNodeRegistry] ⚠️  Failed to convert schema for ${schema.type}:`, error);
      }
    }
  }
  
  /**
   * Convert NodeLibrary schema to UnifiedNodeDefinition
   * This is a bridge function for backward compatibility
   */
  private convertNodeLibrarySchemaToUnified(schema: any): UnifiedNodeDefinition {
    // Extract input schema from configSchema
    const inputSchema: NodeInputSchema = {};
    const requiredInputs: string[] = [];
    
    // Process required fields
    if (schema.configSchema?.required) {
      for (const fieldName of schema.configSchema.required) {
        requiredInputs.push(fieldName);
        const optionalField = schema.configSchema.optional?.[fieldName];
        inputSchema[fieldName] = {
          type: optionalField?.type || 'string',
          description: optionalField?.description || `${fieldName} field`,
          required: true,
          default: optionalField?.default,
          examples: optionalField?.examples,
          validation: optionalField?.validation,
        };
      }
    }
    
    // Process optional fields
    if (schema.configSchema?.optional) {
      for (const [fieldName, fieldDef] of Object.entries(schema.configSchema.optional)) {
        if (!inputSchema[fieldName]) {
          inputSchema[fieldName] = {
            type: (fieldDef as any).type || 'string',
            description: (fieldDef as any).description || `${fieldName} field`,
            required: false,
            default: (fieldDef as any).default,
            examples: (fieldDef as any).examples,
            validation: (fieldDef as any).validation,
          };
        }
      }
    }
    
    // Extract output schema
    const outputSchema: NodeOutputSchema = {
      default: {
        name: 'default',
        description: 'Default output port',
        schema: {
          type: schema.outputType || 'object',
          properties: schema.outputSchema || {},
        },
      },
    };
    
    // Extract credential schema
    const credentialSchema = this.extractCredentialSchema(schema);
    
    // Create default config factory
    const defaultConfig = () => {
      const config: Record<string, any> = {};
      for (const [fieldName, fieldDef] of Object.entries(inputSchema)) {
        if (fieldDef.default !== undefined) {
          config[fieldName] = fieldDef.default;
        }
      }
      return config;
    };
    
    // Create validation function
    const validateConfig = (config: Record<string, any>) => {
      const errors: string[] = [];
      const warnings: string[] = [];
      
      // Validate required fields
      for (const fieldName of requiredInputs) {
        if (config[fieldName] === undefined || config[fieldName] === null || 
            (typeof config[fieldName] === 'string' && config[fieldName].trim() === '')) {
          errors.push(`Required field '${fieldName}' is missing or empty`);
        }
      }
      
      // Validate field types and run custom validators
      for (const [fieldName, fieldDef] of Object.entries(inputSchema)) {
        const value = config[fieldName];
        if (value !== undefined && fieldDef.validation) {
          const validationResult = fieldDef.validation(value);
          if (validationResult !== true) {
            errors.push(`Field '${fieldName}': ${validationResult}`);
          }
        }
      }
      
      return {
        valid: errors.length === 0,
        errors,
        warnings,
      };
    };
    
    // Create execute function (delegates to legacy execution engine)
    // NOTE: This calls executeNodeLegacy directly to avoid circular dependency
    // executeNodeLegacy bypasses the dynamic executor and goes straight to switch statement
    // 
    // ✅ CORE ARCHITECTURE: Universal template resolution applied BEFORE execution
    // This ensures ALL nodes get template resolution automatically
    const execute = async (context: NodeExecutionContext) => {
      try {
        // Import legacy executor function directly (bypasses dynamic executor to avoid loop)
        const { executeNodeLegacy } = await import('../../api/execute-workflow');
        
        // Create nodeOutputs cache from upstream outputs
        const { LRUNodeOutputsCache } = await import('../../core/cache/lru-node-outputs-cache');
        const nodeOutputs = new LRUNodeOutputsCache(100, false);
        context.upstreamOutputs.forEach((output, nodeId) => {
          nodeOutputs.set(nodeId, output, true);
        });
        
        // ✅ UNIVERSAL TEMPLATE RESOLUTION (CORE ARCHITECTURE FIX)
        // Resolve ALL template expressions in config BEFORE execution
        // This ensures template resolution works for ALL nodes universally
        // This is the SINGLE SOURCE OF TRUTH for template resolution
        const { resolveConfigTemplates } = await import('../utils/universal-template-resolver');
        const resolvedConfig = resolveConfigTemplates(context.config, nodeOutputs);
        
        // ✅ PLACEHOLDER FILTERING (CORE ARCHITECTURE FIX)
        // Filter out placeholder values from config BEFORE execution
        // This ensures placeholder values never appear in output JSON
        const { filterPlaceholderValues } = await import('../utils/placeholder-filter');
        const filteredConfig = filterPlaceholderValues(resolvedConfig);
        
        // ✅ CRITICAL FIX: Merge AI-resolved inputs into config
        // AI Input Resolver generates values (e.g., prompt) and stores them in context.inputs
        // But legacy executors read from config (e.g., config.prompt)
        // So we need to merge context.inputs into config so executors can access them.
        // ✅ CRITICAL: Inputs must NOT override user-provided config.
        // The AI input resolver can "guess" values (sometimes from examples), so it must only
        // act as a fallback when config is missing/empty/placeholder.
        // We filter placeholders/empties from BOTH the base config and resolved config, then merge:
        //   inputs (fallback) < base config < resolved config
        const filteredBaseConfig = filterPlaceholderValues(context.config || {});
        const configWithResolvedInputs = { ...context.inputs, ...filteredBaseConfig, ...filteredConfig };

        // ✅ DEBUG (high-signal): For Google Sheets, log whether inputs tried to override spreadsheetId
        if (context.nodeType === 'google_sheets') {
          const cfgId = (configWithResolvedInputs as any)?.spreadsheetId;
          const inputId = (context.inputs as any)?.spreadsheetId;
          const baseId = (filteredBaseConfig as any)?.spreadsheetId;
          if (inputId && baseId && inputId !== baseId) {
            console.warn('[UnifiedNodeRegistry] ⚠️ google_sheets inputs attempted to override spreadsheetId; config wins', {
              inputsSpreadsheetId: String(inputId).substring(0, 50),
              configSpreadsheetId: String(baseId).substring(0, 50),
              finalSpreadsheetId: String(cfgId).substring(0, 50),
            });
          }
        }
        
        // ✅ DEBUG: Log resolved inputs for Ollama/AI nodes
        if (context.nodeType === 'ollama' || context.nodeType === 'ai_chat_model') {
          console.log('[UnifiedNodeRegistry] ✅ Ollama/AI Chat Model resolved inputs:', {
            nodeId: context.nodeId,
            nodeType: context.nodeType,
            resolvedInputsKeys: Object.keys(context.inputs),
            hasPrompt: 'prompt' in context.inputs,
            promptLength: typeof context.inputs.prompt === 'string' ? context.inputs.prompt.length : 'N/A',
            configPrompt: context.config.prompt,
            mergedConfigHasPrompt: 'prompt' in configWithResolvedInputs,
            mergedConfigPromptLength: typeof configWithResolvedInputs.prompt === 'string' 
              ? configWithResolvedInputs.prompt.length 
              : 'N/A',
          });
        }
        
        // Convert context to format expected by legacy executor
        const node = {
          id: context.nodeId,
          type: context.nodeType,
          data: {
            label: context.nodeType,
            type: context.nodeType,
            category: schema.category,
            config: configWithResolvedInputs, // Use config with resolved inputs merged in
          },
        };
        
        // ✅ UNIVERSAL DATA FORWARDING (CORE ARCHITECTURE FIX)
        // Ensure input data is properly forwarded to execution
        // For If/Else nodes: Forward full input data + condition metadata
        // For Limit nodes: Resolve array field from templates
        let executionInput = context.inputs;
        
        // ✅ CRITICAL FIX: For If/Else nodes, merge ALL upstream outputs into execution input
        // If/Else nodes need the FULL upstream data (e.g., Google Sheets output with items array)
        // NOT just the resolved input fields from resolveInputsWithAI
        // resolveInputsWithAI only resolves fields in the input schema, but If/Else needs everything
        if (context.nodeType === 'if_else' || context.nodeType === 'ifElse') {
          // Merge all upstream outputs into execution input
          // This ensures If/Else nodes receive complete data from upstream nodes
          const mergedInput: Record<string, unknown> = { ...context.inputs };
          
          // Add all upstream outputs to merged input
          context.upstreamOutputs.forEach((output, upstreamNodeId) => {
            if (output && typeof output === 'object' && !Array.isArray(output)) {
              Object.assign(mergedInput, output as Record<string, unknown>);
            }
          });
          
          executionInput = mergedInput;
          
          // ✅ DEBUG: Log merged input for If/Else nodes
          console.log('[UnifiedNodeRegistry] ✅ If/Else merged input:', {
            nodeId: context.nodeId,
            resolvedInputsKeys: Object.keys(context.inputs),
            upstreamNodeIds: Array.from(context.upstreamOutputs.keys()),
            mergedInputKeys: Object.keys(mergedInput),
            hasItems: 'items' in mergedInput,
            itemsLength: Array.isArray(mergedInput.items) ? mergedInput.items.length : 'N/A',
          });
        }
        
        // Special handling for Limit nodes: Resolve array field from config
        if (context.nodeType === 'limit' && resolvedConfig.array) {
          // Array field is already resolved by resolveConfigTemplates
          // Legacy executor will use it correctly
        }
        
        // Call legacy executor directly (bypasses dynamic executor to avoid circular dependency)
        const output = await executeNodeLegacy(
          node as any,
          executionInput,
          nodeOutputs,
          context.supabase,
          context.workflowId,
          context.userId,
          context.currentUserId
        );
        
        // ✅ CLEAN OUTPUT FROM CONFIG VALUES (CORE ARCHITECTURE FIX)
        // Remove config values from output to ensure only actual output data is returned
        // This prevents placeholder values and config fields from appearing in output JSON
        const { cleanOutputFromConfig } = await import('../utils/placeholder-filter');
        const cleanedOutput = cleanOutputFromConfig(output, filteredConfig);
        
        // ✅ UNIVERSAL DATA FORWARDING VERIFICATION
        // For If/Else nodes: Verify that output contains input data
        if ((context.nodeType === 'if_else' || context.nodeType === 'ifElse') && cleanedOutput) {
          const outputObj = cleanedOutput as any;
          // Ensure output contains input data (legacy executor should handle this)
          // If not, merge input data into output
          if (!outputObj.items && executionInput.items) {
            return {
              success: true,
              output: { ...outputObj, ...executionInput },
            };
          }
        }
        
        return {
          success: true,
          output: cleanedOutput,
        };
      } catch (error: any) {
        return {
          success: false,
          error: {
            code: 'EXECUTION_ERROR',
            message: error.message || 'Node execution failed',
            details: error,
          },
        };
      }
    };
    
    return {
      type: schema.type,
      label: schema.label,
      category: schema.category as any,
      description: schema.description,
      version: schema.schemaVersion || '1.0.0',
      inputSchema,
      outputSchema,
      credentialSchema,
      requiredInputs,
      defaultConfig,
      validateConfig,
      execute,
      incomingPorts: ['default'],
      outgoingPorts: ['default'],
      isBranching: false,
      aiSelectionCriteria: schema.aiSelectionCriteria,
      tags: schema.keywords || [],
    };
  }
  
  /**
   * Extract credential schema from NodeLibrary schema
   */
  private extractCredentialSchema(schema: any): NodeCredentialSchema | undefined {
    const requirements: NodeCredentialRequirement[] = [];
    const credentialFields: string[] = [];
    
    // Check configSchema for credential fields
    if (schema.configSchema?.optional) {
      for (const [fieldName, fieldDef] of Object.entries(schema.configSchema.optional)) {
        const field = fieldDef as any;
        if (fieldName.toLowerCase().includes('credential') || 
            fieldName.toLowerCase().includes('api_key') ||
            fieldName.toLowerCase().includes('token')) {
          credentialFields.push(fieldName);
          
          // Infer provider from node type
          const provider = this.inferProviderFromNodeType(schema.type);
          if (provider) {
            requirements.push({
              provider,
              category: this.inferCredentialCategory(fieldName),
              required: schema.configSchema.required?.includes(fieldName) || false,
              description: field.description || `${fieldName} credential`,
            });
          }
        }
      }
    }
    
    if (requirements.length === 0 && credentialFields.length === 0) {
      return undefined;
    }
    
    return {
      requirements,
      credentialFields,
    };
  }
  
  private inferProviderFromNodeType(nodeType: string): string | undefined {
    const typeLower = nodeType.toLowerCase();
    if (typeLower.includes('google')) return 'google';
    if (typeLower.includes('slack')) return 'slack';
    if (typeLower.includes('discord')) return 'discord';
    if (typeLower.includes('openai') || typeLower.includes('gpt')) return 'openai';
    if (typeLower.includes('anthropic') || typeLower.includes('claude')) return 'anthropic';
    if (typeLower.includes('notion')) return 'notion';
    if (typeLower.includes('airtable')) return 'airtable';
    return undefined;
  }
  
  private inferCredentialCategory(fieldName: string): string {
    const nameLower = fieldName.toLowerCase();
    if (nameLower.includes('oauth')) return 'oauth';
    if (nameLower.includes('api_key')) return 'api_key';
    if (nameLower.includes('token')) return 'token';
    if (nameLower.includes('webhook')) return 'webhook';
    return 'credential';
  }
  
  // ============================================
  // INodeRegistry Implementation
  // ============================================
  
  register(definition: UnifiedNodeDefinition): void {
    this.definitions.set(definition.type, definition);
    
    // Register aliases
    if (definition.aliases) {
      for (const alias of definition.aliases) {
        this.aliasMap.set(alias.toLowerCase(), definition.type);
      }
    }
    
    console.log(`[UnifiedNodeRegistry] ✅ Registered: ${definition.type} (v${definition.version})`);
  }
  
  get(nodeType: string): UnifiedNodeDefinition | undefined {
    // Try direct lookup
    let definition = this.definitions.get(nodeType);
    if (definition) return definition;
    
    // Try normalized lookup
    const normalized = normalizeNodeType({ type: nodeType, data: { type: nodeType } } as any);
    definition = this.definitions.get(normalized);
    if (definition) return definition;
    
    // Try alias lookup
    const canonicalType = this.resolveAlias(nodeType);
    if (canonicalType) {
      return this.definitions.get(canonicalType);
    }
    
    return undefined;
  }
  
  getAllTypes(): string[] {
    return Array.from(this.definitions.keys());
  }
  
  has(nodeType: string): boolean {
    return this.get(nodeType) !== undefined;
  }
  
  resolveAlias(alias: string): string | undefined {
    return this.aliasMap.get(alias.toLowerCase());
  }
  
  migrateConfig(nodeType: string, oldConfig: Record<string, any>): Record<string, any> {
    const definition = this.get(nodeType);
    if (!definition || !definition.migrations) {
      return oldConfig;
    }
    
    let migratedConfig = { ...oldConfig };
    
    // Apply migrations in order
    for (const migration of definition.migrations) {
      try {
        migratedConfig = migration.migrate(migratedConfig);
      } catch (error) {
        console.warn(`[UnifiedNodeRegistry] Migration failed for ${nodeType}:`, error);
      }
    }
    
    return migratedConfig;
  }
  
  validateConfig(nodeType: string, config: Record<string, any>): {
    valid: boolean;
    errors: string[];
    warnings?: string[];
  } {
    const definition = this.get(nodeType);
    if (!definition) {
      return {
        valid: false,
        errors: [`Node type '${nodeType}' not found in registry`],
      };
    }
    
    // Migrate config first
    const migratedConfig = this.migrateConfig(nodeType, config);
    
    // Validate using node's validateConfig
    return definition.validateConfig(migratedConfig);
  }
  
  getDefaultConfig(nodeType: string): Record<string, any> {
    const definition = this.get(nodeType);
    if (!definition) {
      return {};
    }
    
    return definition.defaultConfig();
  }
  
  getRequiredCredentials(nodeType: string): NodeCredentialRequirement[] {
    const definition = this.get(nodeType);
    if (!definition || !definition.credentialSchema) {
      return [];
    }
    
    return definition.credentialSchema.requirements.filter(req => req.required);
  }
  
  getOutputSchema(nodeType: string): NodeOutputSchema | undefined {
    const definition = this.get(nodeType);
    return definition?.outputSchema;
  }
  
  getInputSchema(nodeType: string): NodeInputSchema | undefined {
    const definition = this.get(nodeType);
    return definition?.inputSchema;
  }
}

// Export singleton instance
export const unifiedNodeRegistry = UnifiedNodeRegistry.getInstance();
