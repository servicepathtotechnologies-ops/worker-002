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
  NodeInputField,
  NodeMigration,
  NodeExecutionContext,
  EffectiveOutputSchema,
  FieldFillMode,
} from '../types/unified-node-contract';
import { nodeLibrary, CANONICAL_NODE_TYPES, isValidCanonicalNodeType } from '../../services/nodes/node-library';
import { applyNodeDefinitionOverrides } from './unified-node-registry-overrides';
import { executeViaLegacyExecutor } from './unified-node-registry-legacy-adapter';
import { resolveEffectiveFieldFillMode } from '../utils/fill-mode-resolver';
import { getBranchOutgoingPortsForNode } from '../utils/branching-node-ports';
import { unifiedNormalizeNodeTypeString } from '../utils/unified-node-type-normalizer';
import {
  inferFieldHelpMetadata,
} from '../utils/field-help-metadata';
import type { FieldHelpCategory } from '../utils/field-help-metadata';
import { classifyFieldOwnership, isCredentialOwnership } from '../utils/field-ownership';

export class UnifiedNodeRegistry implements INodeRegistry {
  private static instance: UnifiedNodeRegistry;
  private definitions: Map<string, UnifiedNodeDefinition> = new Map();
  
  private constructor() {
    console.log('[UnifiedNodeRegistry] 🏗️  Initializing Unified Node Registry...');
    this.initializeFromNodeLibrary();
    console.log(`[UnifiedNodeRegistry] ✅ Initialized with ${this.definitions.size} node definitions`);
    
    // ✅ PRODUCTION-GRADE: Startup integrity check
    // Ensure every canonical type has a UnifiedNodeDefinition
    this.validateIntegrity();
  }
  
  /**
   * ✅ PRODUCTION-GRADE: Validate registry integrity on startup
   * 
   * Ensures every canonical node type has a corresponding UnifiedNodeDefinition
   * If mismatch found → throw error and stop boot
   */
  private validateIntegrity(): void {
    const missingTypes: string[] = [];
    
    for (const canonicalType of CANONICAL_NODE_TYPES) {
      if (!this.definitions.has(canonicalType)) {
        missingTypes.push(canonicalType);
      }
    }
    
    if (missingTypes.length > 0) {
      const error = new Error(
        `[UnifiedNodeRegistry] ❌ Integrity check failed: ` +
        `${missingTypes.length} canonical node type(s) missing from registry: ${missingTypes.slice(0, 5).join(', ')}... ` +
        `This indicates a system initialization failure. All canonical types must have UnifiedNodeDefinitions.`
      );
      console.error(error.message);
      throw error;
    }
    
    console.log(
      `[UnifiedNodeRegistry] ✅ Integrity check passed: All ${CANONICAL_NODE_TYPES.length} canonical types have definitions`
    );
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
    const failedSchemas: string[] = [];
    
    for (const schema of allSchemas) {
      try {
        const baseDefinition = this.convertNodeLibrarySchemaToUnified(schema);
        const overridden = applyNodeDefinitionOverrides(baseDefinition, schema);
        // ✅ Universal fix: overrides can change inputSchema ownership/helpCategory.
        // Credential schema must be derived from the final (post-override) inputSchema,
        // otherwise the UI may ask twice (config + credential) for the same field.
        const definition: UnifiedNodeDefinition = {
          ...overridden,
          credentialSchema: this.extractCredentialSchema(schema, overridden.inputSchema),
        };
        this.register(definition);
      } catch (error: any) {
        console.error(`[UnifiedNodeRegistry] ⚠️  Failed to convert schema for ${schema.type}:`, error?.message || error);
        failedSchemas.push(schema.type);
      }
    }
    
    // ✅ CRITICAL: Verify log_output is registered (common failure point)
    if (!this.definitions.has('log_output')) {
      console.error(`[UnifiedNodeRegistry] ❌ CRITICAL: log_output not registered! Failed schemas: ${failedSchemas.join(', ')}`);
      // Try to register log_output explicitly
      const logOutputSchema = nodeLibrary.getSchema('log_output');
      if (logOutputSchema) {
        try {
          console.log(`[UnifiedNodeRegistry] 🔄 Attempting explicit registration of log_output...`);
          const baseDefinition = this.convertNodeLibrarySchemaToUnified(logOutputSchema);
          const overridden = applyNodeDefinitionOverrides(baseDefinition, logOutputSchema);
          const definition: UnifiedNodeDefinition = {
            ...overridden,
            credentialSchema: this.extractCredentialSchema(logOutputSchema, overridden.inputSchema),
          };
          this.register(definition);
          console.log(`[UnifiedNodeRegistry] ✅ Successfully registered log_output after retry`);
          
          // ✅ VERIFY: Double-check it's actually registered
          if (!this.definitions.has('log_output')) {
            console.error(`[UnifiedNodeRegistry] ❌ CRITICAL: log_output registration succeeded but still not found in registry!`);
          } else {
            console.log(`[UnifiedNodeRegistry] ✅ VERIFIED: log_output is now in registry`);
          }
        } catch (retryError: any) {
          console.error(`[UnifiedNodeRegistry] ❌ Failed to register log_output even after retry:`, retryError?.message || retryError);
          console.error(`[UnifiedNodeRegistry] ❌ Stack trace:`, retryError?.stack);
          
          // ✅ CRITICAL: If log_output fails to register, this is a system integrity issue
          // Log detailed error for debugging
          console.error(`[UnifiedNodeRegistry] ❌ CRITICAL ERROR: log_output is a critical node and MUST be registered.`);
          console.error(`[UnifiedNodeRegistry] ❌ Schema structure:`, JSON.stringify({
            type: logOutputSchema.type,
            hasConfigSchema: !!logOutputSchema.configSchema,
            hasRequired: !!logOutputSchema.configSchema?.required,
            hasOptional: !!logOutputSchema.configSchema?.optional,
          }, null, 2));
        }
      } else {
        console.error(`[UnifiedNodeRegistry] ❌ CRITICAL: log_output schema not found in NodeLibrary!`);
      }
    } else {
      console.log(`[UnifiedNodeRegistry] ✅ log_output is registered (found in definitions)`);
    }
    
    if (failedSchemas.length > 0) {
      console.warn(`[UnifiedNodeRegistry] ⚠️  ${failedSchemas.length} schema(s) failed to convert: ${failedSchemas.join(', ')}`);
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
    
    // Helper to derive universal, registry-driven default fill mode metadata
    const getDefaultFillMode = (fieldName: string, fieldType: string): {
      default: FieldFillMode;
      supportsRuntimeAI?: boolean;
      supportsBuildtimeAI?: boolean;
    } => {
      const normalizedType = (fieldType || 'string').toLowerCase();
      const field = (fieldName || '').toLowerCase();
      // Must align with inferRole title_like / long_body: subject & titles are filled by AI or upstream,
      // not fixed at design time like spreadsheet IDs.
      const isRuntimeSemanticText =
        field.includes('subject') ||
        field.includes('title') ||
        field.includes('heading') ||
        field.includes('prompt') ||
        field.includes('message') ||
        field.includes('body') ||
        field.includes('content') ||
        field.includes('text') ||
        field.includes('summary') ||
        field.includes('description');
      const isStructureSemanticField =
        field === 'fields' ||
        field.includes('condition') ||
        field.includes('case') ||
        field.includes('rule') ||
        field.includes('schema') ||
        field.includes('layout') ||
        field.includes('template') ||
        field.includes('formtitle') ||
        field.includes('formdescription') ||
        field.includes('submitbutton') ||
        field.includes('successmessage') ||
        field.includes('placeholder') ||
        field.includes('label') ||
        field.includes('options');
      const isDeterministicConfig =
        field.includes('id') ||
        field.includes('key') ||
        field.includes('token') ||
        field.includes('secret') ||
        field.includes('credential') ||
        field.includes('sheetname') ||
        field.includes('spreadsheet') ||
        field.includes('range') ||
        field.includes('url') ||
        field.includes('endpoint') ||
        field.includes('method');

      // Structural shape fields are finalized before runtime; runtime_ai must not own schema keys.
      if (isStructureSemanticField) {
        return {
          default: 'buildtime_ai_once',
          supportsRuntimeAI: false,
          supportsBuildtimeAI: true,
        };
      }
      // Text-like fields can support all strategies.
      if (normalizedType === 'string' || normalizedType === 'expression') {
        return {
          default: isRuntimeSemanticText && !isDeterministicConfig ? 'runtime_ai' : 'manual_static',
          supportsRuntimeAI: true,
          supportsBuildtimeAI: true,
        };
      }
      // JSON / object / array fields: can be mapped from upstream at runtime,
      // but build-time AI should not fabricate structures.
      if (normalizedType === 'object' || normalizedType === 'array' || normalizedType === 'json') {
        return {
          default: 'manual_static',
          supportsRuntimeAI: true,
          supportsBuildtimeAI: true,
        };
      }
      // Scalars: generally manual configuration only.
      return {
        default: 'manual_static',
        supportsRuntimeAI: false,
        supportsBuildtimeAI: false,
      };
    };

    const inferRole = (fieldName: string, fieldType: string): 'title_like' | 'long_body' | 'short_summary' | 'raw_json' | 'id' | 'config' | 'prompt' | 'recipient' | 'content' => {
      const f = (fieldName || '').toLowerCase();
      const t = (fieldType || '').toLowerCase();
      if (f.includes('subject') || f.includes('title') || f.includes('heading')) return 'title_like';
      if (f.includes('body') || f.includes('message') || f.includes('content')) return 'long_body';
      if (f.includes('summary')) return 'short_summary';
      if (f.includes('prompt') || f.includes('query')) return 'prompt';
      if (f.includes('recipient') || f === 'to' || f.includes('email')) return 'recipient';
      if (f.endsWith('id') || f.includes('id')) return 'id';
      if (t === 'object' || t === 'array' || t === 'json') return 'raw_json';
      if (t === 'string') return 'content';
      return 'config';
    };

    const inferEssentialForExecution = (required: boolean, fieldName: string): boolean => {
      if (required) return true;
      const f = (fieldName || '').toLowerCase();
      return (
        f.includes('text') ||
        f.includes('subject') ||
        f.includes('body') ||
        f.includes('message') ||
        f.includes('prompt') ||
        f.includes('input')
      );
    };

    /** Maps NodeLibrary optional/required field defs to Properties panel / API `ui` metadata. */
    const libraryFieldUi = (fieldName: string, raw: Record<string, unknown> | undefined): NodeInputField['ui'] | undefined => {
      if (!raw || typeof raw !== 'object') return undefined;
      const fd = raw as Record<string, unknown>;
      const out: NonNullable<NodeInputField['ui']> = {};
      const opts = fd.options;
      if (Array.isArray(opts) && opts.length > 0) {
        out.options = opts as NonNullable<NodeInputField['ui']>['options'];
      }
      const reqIf = fd.requiredIf;
      if (reqIf && typeof reqIf === 'object' && reqIf !== null && 'field' in (reqIf as object)) {
        out.requiredIf = reqIf as NonNullable<NodeInputField['ui']>['requiredIf'];
      }
      const visIf = fd.visibleIf;
      if (visIf && typeof visIf === 'object' && visIf !== null && 'field' in (visIf as object)) {
        out.visibleIf = visIf as NonNullable<NodeInputField['ui']>['visibleIf'];
      }
      if (fieldName.toLowerCase() === 'recipientemails') {
        out.widget = 'multi_email';
      }
      const ctxHints = fd.contextHints;
      if (Array.isArray(ctxHints) && ctxHints.length > 0) {
        out.contextHints = ctxHints as NonNullable<NodeInputField['ui']>['contextHints'];
      }
      return Object.keys(out).length > 0 ? out : undefined;
    };
    
    // Process required fields
    if (schema.configSchema?.required) {
      for (const fieldName of schema.configSchema.required) {
        requiredInputs.push(fieldName);
        const optionalField = schema.configSchema.optional?.[fieldName];
        const type = optionalField?.type || 'string';
        const ui = libraryFieldUi(fieldName, optionalField as Record<string, unknown> | undefined);
        inputSchema[fieldName] = {
          type,
          description: optionalField?.description || `${fieldName} field`,
          required: true,
          default: optionalField?.default,
          examples: optionalField?.examples,
          validation: optionalField?.validation,
          fillMode: (optionalField as any)?.fillMode ?? getDefaultFillMode(fieldName, type),
          role: inferRole(fieldName, type),
          essentialForExecution: inferEssentialForExecution(true, fieldName),
          ...(ui ? { ui } : {}),
        };
      }
    }
    
    // Process optional fields
    if (schema.configSchema?.optional) {
      for (const [fieldName, fieldDef] of Object.entries(schema.configSchema.optional)) {
        if (!inputSchema[fieldName]) {
          const type = (fieldDef as any).type || 'string';
          const ui = libraryFieldUi(fieldName, fieldDef as Record<string, unknown>);
          inputSchema[fieldName] = {
            type,
            description: (fieldDef as any).description || `${fieldName} field`,
            required: false,
            default: (fieldDef as any).default,
            examples: (fieldDef as any).examples,
            validation: (fieldDef as any).validation,
            fillMode: (fieldDef as any).fillMode ?? getDefaultFillMode(fieldName, type),
            role: inferRole(fieldName, type),
            essentialForExecution: inferEssentialForExecution(false, fieldName),
            ...(ui ? { ui } : {}),
          };
        }
      }
    }

    // Registry-wide "how to get it" / credential UX metadata (single inference path)
    for (const fieldName of Object.keys(inputSchema)) {
      const fd = inputSchema[fieldName];
      const meta = inferFieldHelpMetadata(schema.type, fieldName, fd.type);
      fd.helpCategory = meta.helpCategory;
      fd.ownership = classifyFieldOwnership(fieldName, fd);
      if (meta.docsUrl) {
        fd.docsUrl = meta.docsUrl;
      }
      const ex = fd.examples;
      if (!fd.exampleValue && Array.isArray(ex) && ex.length > 0) {
        const first = ex[0];
        if (typeof first === 'string' && first.length > 0 && first.length <= 200) {
          fd.exampleValue = first;
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
    
    // Extract credential schema (merged with helpCategory-driven fields)
    const credentialSchema = this.extractCredentialSchema(schema, inputSchema);
    
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
        const effectiveMode = resolveEffectiveFieldFillMode(fieldName, inputSchema, config);
        if (effectiveMode === 'runtime_ai') {
          continue;
        }
        if (config[fieldName] === undefined || config[fieldName] === null || 
            (typeof config[fieldName] === 'string' && config[fieldName].trim() === '')) {
          errors.push(`Required field '${fieldName}' is missing or empty`);
        }
      }
      
      // ✅ ROOT-LEVEL FIX: Validate field types with conversion
      for (const [fieldName, fieldDef] of Object.entries(inputSchema)) {
        const value = config[fieldName];
        if (value !== undefined && value !== null) {
          // Check type compatibility
          const expectedType = fieldDef.type as any;
          const actualType = getValueType(value);
          
          if (!isTypeCompatible(actualType, expectedType)) {
            // Try to convert
            try {
              const { convertToType } = require('../utils/type-converter');
              const conversion = convertToType(value, expectedType, fieldName);
              if (conversion.success) {
                // Type converted successfully - update config
                config[fieldName] = conversion.value;
                warnings.push(`Field '${fieldName}': Type converted from ${actualType} to ${expectedType}`);
              } else {
                errors.push(`Field '${fieldName}': Type mismatch: ${actualType} cannot be assigned to ${expectedType}`);
              }
            } catch (error: any) {
              errors.push(`Field '${fieldName}': Type mismatch: ${actualType} cannot be assigned to ${expectedType}`);
            }
          }
          
          // Run custom validators
          if (fieldDef.validation) {
            const validationResult = fieldDef.validation(value);
            if (validationResult !== true) {
              errors.push(`Field '${fieldName}': ${validationResult}`);
            }
          }
        }
      }
      
      // Helper functions for type checking
      function getValueType(value: any): string {
        if (value === null) return 'null';
        if (value === undefined) return 'undefined';
        if (Array.isArray(value)) return 'array';
        return typeof value;
      }
      
      function isTypeCompatible(actualType: string, expectedType: string): boolean {
        if (actualType === expectedType) return true;
        if (expectedType === 'string') return true; // String can accept most types
        if (expectedType === 'email' && actualType === 'string') return true;
        if (expectedType === 'datetime' && actualType === 'string') return true;
        if (expectedType === 'number' && actualType === 'string') return true;
        if (expectedType === 'boolean' && (actualType === 'string' || actualType === 'number')) return true;
        if (expectedType === 'array' && actualType === 'object') return true;
        if (expectedType === 'object' && actualType === 'array') return true;
        if (expectedType === 'json' && actualType === 'object') return true;
        return false;
      }
      
      return {
        valid: errors.length === 0,
        errors,
        warnings,
      };
    };
    
    // Create execute function (delegates to legacy execution engine via adapter)
    // Node-specific behavior must be implemented via per-node overrides (see unified-node-registry-overrides.ts)
    const execute = async (context: NodeExecutionContext) => {
      return await executeViaLegacyExecutor({ context, schema });
    };
    
    // ✅ ROOT-LEVEL FIX: Intelligent category mapping for ALL nodes
    // This ensures correct categorization based on schema category, operations, and tags
    const normalizedCategory = this.normalizeNodeCategory(schema);
    
    // ✅ ROOT-LEVEL FIX: Set ports based on node category (applies to ALL nodes universally)
    // This prevents "Invalid handle 'default'" errors by ensuring all nodes have correct port names
    // - Triggers: No incoming ports (they start workflows), outgoingPorts: ['output']
    // - All other nodes: incomingPorts: ['input'], outgoingPorts: ['output']
    // Special nodes (if_else, switch, etc.) will override these in their override files
    const incomingPorts = normalizedCategory === 'trigger' ? [] : ['input'];
    const outgoingPorts = ['output'];
    
    return {
      type: schema.type,
      label: schema.label,
      category: normalizedCategory,
      description: schema.description,
      version: schema.schemaVersion || '1.0.0',
      inputSchema,
      outputSchema,
      credentialSchema,
      requiredInputs,
      defaultConfig,
      validateConfig,
      execute,
      incomingPorts,
      outgoingPorts,
      isBranching: false,
      aiSelectionCriteria: schema.aiSelectionCriteria,
      tags: schema.keywords || [],
    };
  }
  
  /**
   * ✅ ROOT-LEVEL FIX: Normalize node category intelligently
   * 
   * This ensures ALL nodes are correctly categorized based on:
   * 1. Schema category (social, crm, database, etc.)
   * 2. Operations (post, send, create, write → output/communication)
   * 3. Tags (output, send, notify → communication)
   * 4. Node type patterns (linkedin, twitter → communication)
   * 
   * This is a UNIVERSAL fix that applies to ALL nodes automatically.
   */
  private normalizeNodeCategory(schema: any): 'trigger' | 'data' | 'ai' | 'communication' | 'logic' | 'transformation' | 'utility' {
    const originalCategory = (schema.category || '').toLowerCase();
    const nodeType = (schema.type || '').toLowerCase();
    const keywords = (schema.keywords || []).map((k: string) => k.toLowerCase());
    const tags = keywords;
    
    // ✅ STEP 1: Map ALL schema categories to unified categories
    // This is a COMPREHENSIVE mapping covering ALL node types in the system
    const categoryMap: Record<string, 'trigger' | 'data' | 'ai' | 'communication' | 'logic' | 'transformation' | 'utility'> = {
      // Triggers
      'trigger': 'trigger',
      'triggers': 'trigger', // Plural form
      
      // Data sources
      'data': 'data',
      'database': 'data', // Database nodes are data sources
      'file': 'data', // File nodes (read operations) are data sources
      'google': 'data', // Google services (sheets, docs, etc.) are data sources
      'productivity': 'data', // Productivity tools (notion, airtable) are data sources
      
      // AI nodes
      'ai': 'ai',
      
      // Communication/Output nodes
      'communication': 'communication',
      'social': 'communication', // ✅ FIX: Social media nodes are communication (output)
      'output': 'communication', // Output nodes are communication
      'microsoft': 'communication', // Microsoft communication services (outlook, teams)
      
      // Logic/Flow nodes
      'logic': 'logic',
      'flow': 'logic', // Flow control nodes are logic
      'workflow': 'logic', // Workflow nodes are logic
      
      // Transformation nodes
      'transformation': 'transformation',
      
      // Utility nodes
      'utility': 'utility',
      'http_api': 'utility', // HTTP API nodes are utility
      'queue': 'utility', // Queue nodes are utility
      'cache': 'utility', // Cache nodes are utility
      'auth': 'utility', // Auth nodes are utility
      'actions': 'utility', // Action nodes are utility
      
      // CRM nodes (can be data source or output based on operation)
      'crm': 'data', // CRM nodes default to data (output when writing)
      
      // E-commerce nodes (typically data/output)
      'ecommerce': 'data', // E-commerce nodes are data (output when writing)
      
      // DevOps nodes (typically data sources)
      'devops': 'data', // DevOps nodes (github, gitlab, jira) are data sources
    };
    
    // ✅ STEP 1.5: Check node type patterns EARLY (before categoryMap) to catch communication nodes
    // This ensures google_gmail is categorized as 'communication' (output), not 'data' (source)
    const communicationTypes = ['gmail', 'email', 'slack', 'discord', 'telegram', 'teams', 'whatsapp', 'message', 'notify', 'twilio'];
    const isCommunication = communicationTypes.some(comm => nodeType.includes(comm));
    const socialMediaTypes = ['linkedin', 'twitter', 'instagram', 'facebook', 'youtube'];
    const isSocialMedia = socialMediaTypes.some(social => nodeType.includes(social));
    
    // ✅ CRITICAL FIX: Check communication BEFORE categoryMap
    // This ensures google_gmail is categorized as 'communication' (output), not 'data' (source)
    // Check tags first (from schema)
    const hasOutputTags = tags.some((tag: string) => 
      ['output', 'send', 'notify', 'post', 'publish', 'share', 'email', 'message', 'slack', 'discord', 'telegram', 'linkedin', 'twitter', 'instagram', 'facebook', 'social', 'communication'].includes(tag)
    );
    if (isSocialMedia || isCommunication || hasOutputTags || originalCategory === 'social' || originalCategory === 'communication' || originalCategory === 'output' || originalCategory === 'microsoft') {
      return 'communication';
    }
    
    // If category maps directly, use it (BUT skip if it's a communication node - already handled above)
    if (originalCategory && categoryMap[originalCategory]) {
      return categoryMap[originalCategory];
    }
    
    // ✅ STEP 2: Check operations in config schema to determine category
    // Operations like post, send, create, write indicate output/communication
    const configSchema = schema.configSchema;
    let allOperations: string[] = [];
    
    // Try to extract operations from config schema
    if (configSchema?.optional?.operation) {
      const operationField = configSchema.optional.operation as any;
      const operationExamples = operationField?.examples || [];
      const operationDefault = operationField?.default || '';
      allOperations = [
        operationDefault,
        ...(Array.isArray(operationExamples) ? operationExamples : []),
      ].filter(Boolean).map((op: any) => String(op).toLowerCase());
    } else if (configSchema?.required?.includes('operation')) {
      // Operation is required but we don't have examples - check node type for hints
      allOperations = [];
    }
    
    // Output/communication operations
    const outputOperations = ['post', 'send', 'create', 'write', 'update', 'publish', 'share', 'notify', 'email', 'message'];
    const hasOutputOperation = allOperations.some((op: string) => 
      outputOperations.some(outputOp => op.includes(outputOp))
    );
    
    // Read operations indicate data source
    const readOperations = ['read', 'get', 'fetch', 'list', 'retrieve', 'query', 'search'];
    const hasReadOperation = allOperations.some((op: string) => 
      readOperations.some(readOp => op.includes(readOp))
    );
    
    // ✅ STEP 3: Check tags for category hints (hasOutputTags already defined above)
    const hasDataSourceTags = tags.some((tag: string) => 
      ['read', 'fetch', 'get', 'list', 'query', 'data_source', 'input'].includes(tag)
    );
    const hasTransformationTags = tags.some((tag: string) => 
      ['transform', 'process', 'analyze', 'summarize', 'filter', 'sort', 'aggregate'].includes(tag)
    );
    const hasAITags = tags.some((tag: string) => 
      ['ai', 'llm', 'chat', 'agent', 'model', 'gpt', 'claude', 'ollama'].includes(tag)
    );
    const hasLogicTags = tags.some((tag: string) => 
      ['if', 'else', 'switch', 'conditional', 'branch', 'merge', 'loop'].includes(tag)
    );
    
    // ✅ STEP 4: Check node type patterns (COMPREHENSIVE coverage)
    // (isCommunication and isSocialMedia already defined above)
    
    // CRM nodes
    const crmTypes = ['hubspot', 'salesforce', 'zoho', 'pipedrive', 'crm', 'freshdesk', 'intercom', 'mailchimp', 'activecampaign'];
    const isCrm = crmTypes.some(crm => nodeType.includes(crm));
    
    // Database nodes
    const databaseTypes = ['database', 'postgres', 'mysql', 'mongodb', 'supabase', 'sql', 'redis', 'bigquery'];
    const isDatabase = databaseTypes.some(db => nodeType.includes(db));
    
    // AI nodes
    const aiTypes = ['ai_chat_model', 'ai_agent', 'ai_service', 'ollama', 'openai', 'gpt', 'claude', 'gemini', 'text_summarizer', 'sentiment_analyzer', 'chat_model', 'memory', 'tool'];
    const isAI = aiTypes.some(ai => nodeType.includes(ai));
    
    // Logic/Flow nodes
    const logicTypes = ['if_else', 'switch', 'merge', 'try_catch', 'retry', 'parallel', 'loop', 'filter', 'noop', 'split_in_batches', 'stop_and_error'];
    const isLogic = logicTypes.some(logic => nodeType.includes(logic));
    
    // Trigger nodes
    const triggerTypes = ['trigger', 'schedule', 'webhook', 'interval', 'form_trigger', 'chat_trigger', 'error_trigger', 'workflow_trigger'];
    const isTrigger = triggerTypes.some(trig => nodeType.includes(trig));
    
    // Google service nodes
    const googleTypes = ['google_sheets', 'google_doc', 'google_drive', 'google_calendar', 'google_contacts', 'google_tasks', 'google_bigquery'];
    const isGoogle = googleTypes.some(google => nodeType.includes(google));
    
    // File/storage nodes
    const fileTypes = ['file', 's3', 'dropbox', 'onedrive', 'ftp', 'sftp', 'binary_file'];
    const isFile = fileTypes.some(file => nodeType.includes(file));
    
    // HTTP/API nodes
    const httpTypes = ['http_request', 'http_response', 'http_post', 'webhook_response', 'graphql'];
    const isHttp = httpTypes.some(http => nodeType.includes(http));
    
    // Queue/Cache nodes
    const queueCacheTypes = ['queue', 'cache'];
    const isQueueCache = queueCacheTypes.some(qc => nodeType.includes(qc));
    
    // Auth nodes
    const authTypes = ['oauth', 'api_key', 'auth'];
    const isAuth = authTypes.some(auth => nodeType.includes(auth));
    
    // DevOps nodes
    const devopsTypes = ['github', 'gitlab', 'bitbucket', 'jira', 'jenkins'];
    const isDevops = devopsTypes.some(devops => nodeType.includes(devops));
    
    // E-commerce nodes
    const ecommerceTypes = ['shopify', 'woocommerce', 'stripe', 'paypal'];
    const isEcommerce = ecommerceTypes.some(ec => nodeType.includes(ec));
    
    // Productivity nodes
    const productivityTypes = ['notion', 'airtable', 'clickup'];
    const isProductivity = productivityTypes.some(prod => nodeType.includes(prod));
    
    // Data manipulation nodes
    const dataManipulationTypes = ['json_parser', 'merge_data', 'edit_fields', 'math', 'html', 'xml', 'csv', 'rename_keys', 'aggregate', 'sort', 'limit', 'set', 'set_variable', 'text_formatter', 'date_time'];
    const isDataManipulation = dataManipulationTypes.some(dm => nodeType.includes(dm));
    
    // Utility nodes
    const utilityTypes = ['wait', 'delay', 'timeout', 'return', 'execute_workflow', 'code', 'function', 'function_item'];
    const isUtility = utilityTypes.some(util => nodeType.includes(util));
    
    // ✅ STEP 5: Determine category based on ALL factors
    // Priority: Trigger > AI > Logic > Communication/Social > Data Manipulation > CRM/Database/E-commerce > Google/Productivity > File/Storage > HTTP/API > Queue/Cache/Auth > Utility > Transformation > Data
    
    // Trigger nodes (highest priority)
    if (isTrigger || originalCategory === 'trigger' || originalCategory === 'triggers') {
      return 'trigger';
    }
    
    // AI nodes
    if (isAI || hasAITags || originalCategory === 'ai') {
      return 'ai';
    }
    
    // Logic/Flow nodes
    if (isLogic || hasLogicTags || originalCategory === 'logic' || originalCategory === 'flow' || originalCategory === 'workflow') {
      return 'logic';
    }
    
    // Social media and communication nodes are always communication (output)
    // (Already handled above, but keep for completeness)
    if (isSocialMedia || isCommunication || hasOutputTags || originalCategory === 'social' || originalCategory === 'communication' || originalCategory === 'output' || originalCategory === 'microsoft') {
      return 'communication';
    }
    
    // Data manipulation nodes (transformations)
    if (isDataManipulation || hasTransformationTags || originalCategory === 'transformation') {
      return 'transformation';
    }
    
    // CRM nodes: Check operations - if write/create, they're data (output), otherwise data (source)
    if (isCrm || originalCategory === 'crm') {
      // CRM nodes with write operations are outputs (they write to CRM)
      if (hasOutputOperation && !hasReadOperation) {
        return 'data'; // CRM write operations are data outputs
      }
      // Default: CRM can be both read and write, but typically write (output)
      return 'data';
    }
    
    // E-commerce nodes (typically data/output)
    if (isEcommerce || originalCategory === 'ecommerce') {
      // E-commerce nodes with write operations are outputs
      if (hasOutputOperation && !hasReadOperation) {
        return 'data'; // E-commerce write operations are data outputs
      }
      // Default: E-commerce nodes are data sources
      return 'data';
    }
    
    // Database nodes: Check operations
    if (isDatabase || originalCategory === 'database') {
      // Database write operations are outputs
      if (hasOutputOperation && nodeType.includes('write')) {
        return 'data'; // Database write is data output
      }
      // Database read operations are data sources
      if (hasReadOperation && nodeType.includes('read')) {
        return 'data'; // Database read is data source
      }
      // Default: database nodes are data sources
      return 'data';
    }
    
    // Google service nodes (data sources)
    if (isGoogle || originalCategory === 'google') {
      return 'data';
    }
    
    // Productivity nodes (data sources)
    if (isProductivity || originalCategory === 'productivity') {
      return 'data';
    }
    
    // File/storage nodes: Check operations
    if (isFile || originalCategory === 'file') {
      // File write operations are outputs
      if (hasOutputOperation && (nodeType.includes('write') || nodeType.includes('upload'))) {
        return 'data'; // File write is data output
      }
      // File read operations are data sources
      if (hasReadOperation && nodeType.includes('read')) {
        return 'data'; // File read is data source
      }
      // Default: file nodes are data sources
      return 'data';
    }
    
    // HTTP/API nodes (utility)
    if (isHttp || originalCategory === 'http_api') {
      return 'utility';
    }
    
    // Queue/Cache nodes (utility)
    if (isQueueCache || originalCategory === 'queue' || originalCategory === 'cache') {
      return 'utility';
    }
    
    // Auth nodes (utility)
    if (isAuth || originalCategory === 'auth') {
      return 'utility';
    }
    
    // DevOps nodes (data sources)
    if (isDevops || originalCategory === 'devops') {
      return 'data';
    }
    
    // Utility nodes
    if (isUtility || originalCategory === 'utility' || originalCategory === 'actions') {
      return 'utility';
    }
    
    // ✅ STEP 6: Fallback based on operations
    if (hasOutputOperation && !hasReadOperation) {
      // Node only has output operations → communication
      return 'communication';
    }
    
    if (hasReadOperation && !hasOutputOperation) {
      // Node only has read operations → data source
      return 'data';
    }
    
    // ✅ STEP 7: Default fallback
    // If no clear category, default to transformation (safest default)
    return 'transformation';
  }
  
  /**
   * Extract credential schema from NodeLibrary schema + unified inputSchema help metadata
   */
  private extractCredentialSchema(schema: any, inputSchema: NodeInputSchema): NodeCredentialSchema | undefined {
    const requirements: NodeCredentialRequirement[] = [];
    const credentialFieldsSet = new Set<string>();
    const provider = this.inferProviderFromNodeType(schema.type);

    // Credential schema is ownership-driven only.
    for (const [fieldName, fd] of Object.entries(inputSchema)) {
      if (!isCredentialOwnership(fieldName, fd)) continue;
      if (credentialFieldsSet.has(fieldName)) continue;
      credentialFieldsSet.add(fieldName);
      if (provider) {
        const category = this.inferCredentialCategory(fieldName, fd.helpCategory);
        if (category === undefined) continue;
        requirements.push({
          provider,
          category,
          required: schema.configSchema?.required?.includes(fieldName) || false,
          description: fd.description || `${fieldName} credential`,
        });
      }
    }
    
    const credentialFields = Array.from(credentialFieldsSet);
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
  
  private inferCredentialCategory(fieldName: string, helpCategory?: FieldHelpCategory): string | undefined {
    // URL-type categories are config values, not secrets — never treat them as credentials
    const URL_CONFIG_CATEGORIES = new Set<FieldHelpCategory>([
      'webhook_url',
      'base_url',
      'api_endpoint',
      'callback_url',
      'redirect_url',
    ]);
    if (helpCategory && URL_CONFIG_CATEGORIES.has(helpCategory)) {
      return undefined;
    }

    const nameLower = fieldName.toLowerCase();
    if (nameLower.includes('oauth')) return 'oauth';
    if (nameLower.includes('api_key')) return 'api_key';
    if (nameLower.includes('token')) return 'token';
    // NOTE: 'webhook' substring match intentionally removed — it was the Bug 1 root cause.
    // Legitimate webhook secrets are identified by helpCategory='webhook_secret' (in STRICT_CREDENTIAL_CATEGORIES)
    // and are classified as 'credential' ownership before reaching this method.
    return 'credential';
  }
  
  // ============================================
  // INodeRegistry Implementation
  // ============================================
  
  register(definition: UnifiedNodeDefinition): void {
    this.definitions.set(definition.type, definition);
    
    // ✅ STRICT ARCHITECTURE: No alias awareness in registry
    // Alias resolution belongs at input layer, not registry layer
    
    console.log(`[UnifiedNodeRegistry] ✅ Registered: ${definition.type} (v${definition.version})`);
  }
  
  /**
   * ✅ PRODUCTION-GRADE: Deterministic node type lookup
   * 
   * Registry is a lookup table ONLY. No resolution, no fallback, no normalization.
   * 
   * Rules:
   * - Only accepts canonical node types
   - - Returns undefined if node type not found (caller must validate first)
   * - No dynamic alias learning
   * - No fuzzy matching
   * - Deterministic behavior only
   */
  get(nodeType: string): UnifiedNodeDefinition | undefined {
    // ✅ STRICT: Direct lookup only - no resolution, no fallback
    return this.definitions.get(nodeType);
  }
  
  getAllTypes(): string[] {
    return Array.from(this.definitions.keys());
  }
  
  has(nodeType: string): boolean {
    return this.get(nodeType) !== undefined;
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
    // ✅ STRICT ARCHITECTURE: Fail-fast on invalid node types
    // This ensures only canonical node types reach the registry
    if (!isValidCanonicalNodeType(nodeType)) {
      const sampleTypes = CANONICAL_NODE_TYPES.slice(0, 10).join(', ');
      throw new Error(
        `[NodeAuthority] ❌ Invalid node type: "${nodeType}". ` +
        `Only canonical node types from NodeLibrary are allowed. ` +
        `Valid types (sample): ${sampleTypes}... ` +
        `Total valid types: ${CANONICAL_NODE_TYPES.length}. ` +
        `This indicates LLM generated an invalid node type or alias resolution failed.`
      );
    }
    
    const definition = this.get(nodeType);
    if (!definition) {
      // This should NEVER happen if nodeType is canonical
      // If it does, it's an integrity issue (canonical type not registered)
      throw new Error(
        `[NodeAuthority] ❌ Integrity error: Canonical node type '${nodeType}' not found in registry. ` +
        `This indicates a system initialization failure. All canonical types must have UnifiedNodeDefinitions.`
      );
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

  /**
   * Single source for credential preflight: registry schema + minimal provider inference
   * when NodeLibrary has not yet emitted credentialSchema rows for a node.
   */
  getCredentialPreflightDescriptor(nodeType: string): {
    requiresCheck: boolean;
    credentialType: 'OAuth' | 'API_KEY' | 'UNKNOWN';
    requiredScopes: string[];
    lookupKeys: string[];
  } {
    const def = this.get(nodeType);
    const reqs = def?.credentialSchema?.requirements ?? [];
    const scopesFromSchema = reqs.flatMap((r) => r.scopes || []);
    const hasSchemaCreds =
      reqs.length > 0 || (def?.credentialSchema?.credentialFields?.length ?? 0) > 0;

    const provider = this.inferCredentialProviderForPreflight(nodeType);
    const requiresCheck = hasSchemaCreds || provider !== undefined;

    if (!requiresCheck) {
      return {
        requiresCheck: false,
        credentialType: 'UNKNOWN',
        requiredScopes: [],
        lookupKeys: [],
      };
    }

    let requiredScopes = [...scopesFromSchema];
    if (requiredScopes.length === 0) {
      requiredScopes = this.inferDefaultOAuthScopes(nodeType, provider);
    }

    const oauthish =
      reqs.some((r) => (r.category || '').toLowerCase() === 'oauth') ||
      (provider &&
        ['google', 'linkedin', 'twitter', 'facebook', 'instagram'].includes(provider));

    const credentialType: 'OAuth' | 'API_KEY' | 'UNKNOWN' = oauthish ? 'OAuth' : 'API_KEY';

    const lookupKeys = this.buildCredentialLookupKeys(nodeType, provider, def?.credentialSchema?.credentialFields);

    return {
      requiresCheck: true,
      credentialType,
      requiredScopes,
      lookupKeys,
    };
  }

  /** Provider hint for preflight when credentialSchema is empty or incomplete. */
  private inferCredentialProviderForPreflight(nodeType: string): string | undefined {
    const t = nodeType.toLowerCase();
    const fromBase = this.inferProviderFromNodeType(nodeType);
    if (fromBase) return fromBase;
    if (t === 'http_request' || t === 'http_post' || t === 'graphql' || t === 'webhook_response') return 'http';
    if (t === 'email') return 'email';
    if (t.includes('database_') || t === 'postgresql' || t === 'supabase' || t === 'mysql' || t === 'mongodb' || t === 'redis')
      return 'database';
    if (t === 'linkedin' || t === 'twitter' || t === 'instagram' || t === 'facebook') return t.split('_')[0];
    return undefined;
  }

  private inferDefaultOAuthScopes(nodeType: string, provider?: string): string[] {
    const t = nodeType.toLowerCase();
    if (provider === 'google' || t.includes('google')) {
      if (t.includes('gmail')) return ['https://www.googleapis.com/auth/gmail.send'];
      if (t.includes('sheet')) return ['https://www.googleapis.com/auth/spreadsheets'];
      if (t.includes('drive')) return ['https://www.googleapis.com/auth/drive'];
      if (t.includes('calendar')) return ['https://www.googleapis.com/auth/calendar'];
      return [];
    }
    if (t === 'linkedin') return ['r_liteprofile', 'r_emailaddress'];
    return [];
  }

  private buildCredentialLookupKeys(
    nodeType: string,
    provider: string | undefined,
    credentialFields?: string[]
  ): string[] {
    const keys = new Set<string>([nodeType]);
    if (provider) keys.add(provider);
    if (nodeType.includes('google')) {
      keys.add('google');
      keys.add('google_sheets');
      keys.add('google_drive');
      keys.add('gmail');
    }
    if (nodeType === 'slack_message' || nodeType === 'slack_webhook') {
      keys.add('slack');
    }
    if (nodeType === 'openai_gpt' || nodeType === 'chat_model') keys.add('openai');
    if (nodeType === 'anthropic_claude') keys.add('anthropic');
    if (nodeType === 'google_gemini') {
      keys.add('gemini');
      keys.add('google');
    }
    if (credentialFields) {
      for (const f of credentialFields) keys.add(f);
    }
    return [...keys];
  }
  
  getOutputSchema(nodeType: string): NodeOutputSchema | undefined {
    const definition = this.get(nodeType);
    return definition?.outputSchema;
  }
  
  getInputSchema(nodeType: string): NodeInputSchema | undefined {
    const definition = this.get(nodeType);
    return definition?.inputSchema;
  }

  /**
   * Get effective output schema for a node given its config.
   * For form: derives properties from config.fields. For code/javascript: returns dynamic object.
   * Used by intent→config to generate downstream config/code from upstream JSON shape.
   */
  getEffectiveOutputSchema(nodeType: string, config?: Record<string, any>): EffectiveOutputSchema | undefined {
    const def = this.get(nodeType);
    if (!def?.outputSchema?.default) {
      return undefined;
    }
    const port = def.outputSchema.default;
    const baseType = (port.schema?.type as EffectiveOutputSchema['type']) || 'object';
    const baseProperties = port.schema?.properties as Record<string, { type: string }> | undefined;

    // Form / form_trigger: output shape = { [field.name]: field.type } from config.fields
    if (
      (nodeType === 'form' || nodeType === 'form_trigger') &&
      config?.fields &&
      Array.isArray(config.fields)
    ) {
      const properties: Record<string, { type: string; description?: string }> = {};
      for (const f of config.fields) {
        const name = f.name ?? f.key ?? f.id ?? 'field';
        const type = (f.type || 'string') as string;
        properties[name] = { type, description: f.description || f.label };
      }
      return {
        type: 'object',
        properties: Object.keys(properties).length ? properties : undefined,
        dynamic: Object.keys(properties).length === 0,
      };
    }

    // Code / javascript: output is whatever the code returns; schema is dynamic
    if (nodeType === 'javascript' || nodeType === 'code') {
      return { type: 'object', dynamic: true };
    }

    // Static: use registry output schema properties when available
    if (baseProperties && typeof baseProperties === 'object' && Object.keys(baseProperties).length > 0) {
      const properties: Record<string, { type: string; description?: string }> = {};
      for (const [k, v] of Object.entries(baseProperties)) {
        properties[k] = typeof v === 'object' && v !== null && 'type' in v
          ? { type: (v as any).type, description: (v as any).description }
          : { type: typeof v === 'string' ? v : 'string' };
      }
      return { type: baseType, properties };
    }

    return { type: baseType, dynamic: false };
  }
  
  /**
   * ✅ PHASE 1 FIX: Helper method to check if node allows branching
   * Uses registry as single source of truth
   */
  /**
   * Effective outgoing ports for a concrete workflow node (branching: if_else, switch with cases).
   */
  getOutgoingPortsForWorkflowNode(node: {
    type?: string;
    data?: { type?: string; config?: Record<string, any> };
  }): string[] {
    const nodeType = unifiedNormalizeNodeTypeString(node.type || node.data?.type || '');
    const def = this.get(nodeType);
    const raw = (node.data?.config || {}) as Record<string, any>;
    const config = this.migrateConfig(nodeType, raw);
    return getBranchOutgoingPortsForNode(nodeType, config, def?.outgoingPorts || ['output']);
  }

  allowsBranching(nodeType: string): boolean {
    const definition = this.get(nodeType);
    return definition?.isBranching || false;
  }
  
  /**
   * ✅ PHASE 1 FIX: Helper method to check if node is a trigger
   * Uses registry category as single source of truth
   */
  isTrigger(nodeType: string): boolean {
    const definition = this.get(nodeType);
    return definition?.category === 'trigger';
  }
  
  /**
   * ✅ PHASE 1 FIX: Helper method to get node category
   * Uses registry as single source of truth
   */
  getCategory(nodeType: string): string | undefined {
    const definition = this.get(nodeType);
    return definition?.category;
  }
  
  /**
   * ✅ PHASE 1 FIX: Helper method to check if node has specific tag
   * Uses registry tags as single source of truth
   */
  hasTag(nodeType: string, tag: string): boolean {
    const definition = this.get(nodeType);
    const tags = definition?.tags || [];
    return tags.some(t => t.toLowerCase() === tag.toLowerCase());
  }
  
  /**
   * Resolve alias to canonical type
   * Uses node-type-resolver for alias resolution
   */
  resolveAlias(alias: string): string | undefined {
    try {
      const { resolveNodeType } = require('../utils/node-type-resolver-util');
      const resolved = resolveNodeType(alias, false);
      // If resolved type exists in registry, return it
      if (this.has(resolved)) {
        return resolved;
      }
      // If alias itself exists in registry, return it
      if (this.has(alias)) {
        return alias;
      }
      return undefined;
    } catch (error) {
      // If resolver fails, just check if alias exists directly
      return this.has(alias) ? alias : undefined;
    }
  }
  
  /**
   * ✅ UNIVERSAL: Get all nodes with specific workflow-level behavior
   * Used by orchestrators, policies, builders to query registry
   * 
   * @param behavior - The workflow behavior to query for
   * @returns Array of node definitions with the specified behavior
   */
  getNodesWithBehavior(behavior: keyof NonNullable<UnifiedNodeDefinition['workflowBehavior']>): UnifiedNodeDefinition[] {
    const results: UnifiedNodeDefinition[] = [];
    for (const [type, def] of this.definitions) {
      if (def.workflowBehavior?.[behavior] === true) {
        results.push(def);
      }
    }
    return results;
  }
  
  /**
   * ✅ UNIVERSAL: Check if node has specific workflow behavior
   * 
   * @param nodeType - The node type to check
   * @param behavior - The workflow behavior to check for
   * @returns true if node has the specified behavior
   */
  hasWorkflowBehavior(nodeType: string, behavior: keyof NonNullable<UnifiedNodeDefinition['workflowBehavior']>): boolean {
    const def = this.get(nodeType);
    return def?.workflowBehavior?.[behavior] === true;
  }
  
  /**
   * ✅ UNIVERSAL: Get all always-required nodes (for auto-inclusion)
   * These nodes are automatically included in all workflows
   * 
   * @returns Array of node definitions that are always required
   */
  getAlwaysRequiredNodes(): UnifiedNodeDefinition[] {
    return this.getNodesWithBehavior('alwaysRequired');
  }
  
  /**
   * ✅ UNIVERSAL: Get all always-terminal nodes (must be last)
   * These nodes must have no outgoing edges and be the last node
   * 
   * @returns Array of node definitions that must be terminal
   */
  getAlwaysTerminalNodes(): UnifiedNodeDefinition[] {
    return this.getNodesWithBehavior('alwaysTerminal');
  }
  
  /**
   * ✅ UNIVERSAL: Get all exempt-from-removal nodes
   * These nodes cannot be removed by minimal workflow policy
   * 
   * @returns Array of node definitions that are exempt from removal
   */
  getExemptFromRemovalNodes(): UnifiedNodeDefinition[] {
    return this.getNodesWithBehavior('exemptFromRemoval');
  }
}

// Export singleton instance
export const unifiedNodeRegistry = UnifiedNodeRegistry.getInstance();
