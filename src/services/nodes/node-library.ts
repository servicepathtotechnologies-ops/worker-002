// Comprehensive Node Library
// Complete schemas, validation, and AI selection criteria for all node types
// Based on the comprehensive guide

import { getNodeOutputSchema, getNodeOutputType } from '../../core/types/node-output-types';

export interface NodeCapability {
  inputType: 'text' | 'array' | 'object' | ('text' | 'array' | 'object')[]; // What data types this node accepts
  outputType: 'text' | 'array' | 'object'; // What data type this node produces
  acceptsArray: boolean; // Can accept array input
  producesArray: boolean; // Produces array output
}

export interface NodeSchema {
  type: string;
  label: string;
  category: string;
  description: string;
  configSchema: ConfigSchema;
  aiSelectionCriteria: AISelectionCriteria;
  commonPatterns: CommonPattern[];
  validationRules: ValidationRule[];
  // PHASE 6: Add output type information
  outputType?: string;
  outputSchema?: any;
  // NodeResolver: Capability-based resolution
  capabilities?: string[]; // e.g., ["email.send", "gmail.send", "google.mail"]
  providers?: string[]; // e.g., ["google", "slack"]
  keywords?: string[]; // Additional keywords for resolution
  // ✅ CRITICAL: Schema versioning for backward compatibility
  schemaVersion?: string; // e.g., "1.0"
  // ✅ Node Capability Registry: Data type capabilities
  nodeCapability?: NodeCapability; // Explicit capability definition
}

export interface ConfigSchema {
  required: string[];
  optional: Record<string, ConfigField>;
}

export interface ConfigField {
  type: 'string' | 'number' | 'boolean' | 'object' | 'array' | 'expression';
  description: string;
  default?: any;
  examples?: any[];
  validation?: (value: any) => boolean | string;
  // UI hint: render as select/radio using stable label/value options
  options?: Array<{ label: string; value: string }>;
  // Generic conditional-required contract (schema-driven)
  requiredIf?: { field: string; equals: any };
}

export interface AISelectionCriteria {
  whenToUse: string[];
  whenNotToUse: string[];
  keywords: string[];
  useCases: string[];
}

export interface CommonPattern {
  name: string;
  description: string;
  config: Record<string, any>;
}

export interface ValidationRule {
  field: string;
  validator: (value: any) => boolean | string;
  errorMessage: string;
}

/**
 * Comprehensive Node Library
 * Provides complete information about all available nodes for AI workflow generation
 */
export class NodeLibrary {
  private schemas: Map<string, NodeSchema> = new Map();

  constructor() {
    console.log('[NodeLibrary] 🚀 Initializing NodeLibrary...');
    this.initializeSchemas();
    
    // ✅ CRITICAL: Verify critical nodes are registered
    // NOTE: Do NOT use resolveNodeType() here - it causes circular dependency
    // Check canonical node types directly (resolver will be initialized later)
    const criticalNodes = [
      // Removed: ai_service is now a capability, not a node type
      'google_gmail', // Canonical type (gmail is NOT a virtual node - it's only a keyword/pattern)
    ];
    const missingNodes: string[] = [];
    
    for (const nodeType of criticalNodes) {
      if (!this.schemas.has(nodeType)) {
        missingNodes.push(nodeType);
      }
    }
    
    if (missingNodes.length > 0) {
      console.error(`[NodeLibrary] ❌ Critical nodes missing: ${missingNodes.join(', ')}`);
    } else {
      console.log(`[NodeLibrary] ✅ All critical nodes registered (${criticalNodes.join(', ')})`);
    }
    
    // Register virtual node types (aliases) after all schemas are initialized
    this.registerVirtualNodeTypes();
    
    // Initialize NodeTypeResolver with this NodeLibrary instance (fix circular dependency)
    this.initializeNodeTypeResolver();
    
    // Initialize Node Capability Registry (pass this instance to avoid circular dependency)
    try {
      const { nodeCapabilityRegistry } = require('./node-capability-registry');
      nodeCapabilityRegistry.setNodeLibrary(this);
      nodeCapabilityRegistry.initialize(this);
    } catch (error) {
      console.warn('[NodeLibrary] Could not initialize Node Capability Registry:', error);
    }
    
    const totalSchemas = this.schemas.size;
    console.log(`[NodeLibrary] ✅ NodeLibrary initialized with ${totalSchemas} node schemas`);
    
    // Log all registered node types for debugging
    this.logAllRegisteredNodes();
  }

  /**
   * Initialize NodeTypeResolver with this NodeLibrary instance
   * Fixes circular dependency by using dependency injection
   */
  private initializeNodeTypeResolver(): void {
    try {
      const { NodeTypeResolver } = require('./node-type-resolver');
      const resolver = NodeTypeResolver.getInstance();
      resolver.setNodeLibrary(this);
      console.log('[NodeLibrary] ✅ NodeTypeResolver initialized with NodeLibrary');
    } catch (error) {
      console.warn('[NodeLibrary] ⚠️  Failed to initialize NodeTypeResolver:', error instanceof Error ? error.message : String(error));
    }
  }
  
  /**
   * Log all registered node types at startup
   */
  private logAllRegisteredNodes(): void {
    const allTypes = Array.from(this.schemas.keys()).sort();
    const nodeTypesString = allTypes.join(', ');
    console.log(`[NodeLibrary] 📋 Registered nodes (${allTypes.length}): ${nodeTypesString}`);
    
    // Also log by category for better organization
    const byCategory = new Map<string, string[]>();
    this.schemas.forEach((schema, type) => {
      const category = schema.category || 'uncategorized';
      if (!byCategory.has(category)) {
        byCategory.set(category, []);
      }
      byCategory.get(category)!.push(type);
    });
    
    console.log(`[NodeLibrary] 📊 Nodes by category:`);
    byCategory.forEach((types, category) => {
      console.log(`[NodeLibrary]   ${category}: ${types.length} nodes (${types.slice(0, 5).join(', ')}${types.length > 5 ? '...' : ''})`);
    });
  }

  /**
   * Get schema for a node type
   * Enhanced with pattern-based search and node type resolution
   * 
   * Search Strategy:
   * 1. Direct lookup (canonical types)
   * 2. Pattern-based search (commonPatterns, keywords, aiSelectionCriteria.keywords)
   * 3. Resolver fallback (aliases → canonical types)
   * 
   * Logs lookup attempts and failures for debugging
   */
  getSchema(nodeType: string): NodeSchema | undefined {
    if (!nodeType || typeof nodeType !== 'string') {
      console.warn(`[NodeLibrary] ⚠️  Invalid node type lookup: ${JSON.stringify(nodeType)}`);
      return undefined;
    }
    
    // ✅ CRITICAL FIX: Skip "custom" type - it's invalid and expected to fail
    // "custom" is only used in final workflow nodes for frontend compatibility
    // It should never be looked up in the library - return undefined silently
    if (nodeType === 'custom') {
      return undefined;
    }
    
    const normalizedQuery = nodeType.toLowerCase().trim();
    
    // Step 1: Try direct lookup first (fast path for canonical types)
    let schema = this.schemas.get(nodeType);
    if (schema) {
      // Only log successful lookups in debug mode to reduce noise
      if (process.env.DEBUG_NODE_LOOKUPS === 'true') {
        console.log(`[NodeLibrary] ✅ Found node type: "${nodeType}"`);
      }
      return schema;
    }
    
    // Step 2: Pattern-based search (search through patterns, keywords, and use cases)
    // This allows searching by operation names like "summarize", "gmail", "sheets"
    schema = this.findSchemaByPattern(normalizedQuery);
    if (schema) {
      console.log(`[NodeLibrary] ✅ Found node type by pattern: "${nodeType}" → "${schema.type}"`);
      return schema;
    }
    
    // Step 3: Try resolver as fallback (only if resolver is initialized)
    // NOTE: This is safe because resolver is initialized AFTER NodeLibrary constructor completes
    try {
      const { resolveNodeType } = require('../../core/utils/node-type-resolver-util');
      const resolvedType = resolveNodeType(nodeType, false);
      
      if (resolvedType !== nodeType) {
        // Try lookup with resolved type
        schema = this.schemas.get(resolvedType);
        if (schema) {
          console.log(`[NodeLibrary] ✅ Resolved "${nodeType}" → "${resolvedType}"`);
          return schema;
        }
      }
    } catch (error) {
      // Resolver not initialized yet - this is okay during NodeLibrary construction
      // Virtual node types should handle most cases
    }
    
    // Step 4: Not found
    // Only log warning if not in debug mode (to reduce noise for expected failures like "custom")
    if (process.env.DEBUG_NODE_LOOKUPS === 'true' || !normalizedQuery.includes('custom')) {
      console.warn(`[NodeLibrary] ❌ Node type not found: "${nodeType}"`);
      console.warn(`[NodeLibrary] 💡 Available node types: ${this.getRegisteredNodeTypes().slice(0, 10).join(', ')}...`);
    }
    return undefined;
  }

  /**
   * Find schema by pattern matching
   * Searches through commonPatterns, keywords, and aiSelectionCriteria.keywords
   * 
   * @param query - Normalized query string (lowercase, trimmed)
   * @returns Matching schema or undefined
   */
  private findSchemaByPattern(query: string): NodeSchema | undefined {
    if (!query || query.length === 0) {
      return undefined;
    }

    // Search through all schemas
    for (const schema of this.schemas.values()) {
      // Check commonPatterns
      if (schema.commonPatterns && schema.commonPatterns.length > 0) {
        for (const pattern of schema.commonPatterns) {
          const patternName = (pattern.name || '').toLowerCase();
          if (patternName === query || patternName.includes(query) || query.includes(patternName)) {
            return schema;
          }
        }
      }

      // Check keywords
      if (schema.keywords && schema.keywords.length > 0) {
        for (const keyword of schema.keywords) {
          const keywordLower = keyword.toLowerCase();
          if (keywordLower === query || keywordLower.includes(query) || query.includes(keywordLower)) {
            return schema;
          }
        }
      }

      // Check aiSelectionCriteria.keywords
      if (schema.aiSelectionCriteria?.keywords && schema.aiSelectionCriteria.keywords.length > 0) {
        for (const keyword of schema.aiSelectionCriteria.keywords) {
          const keywordLower = keyword.toLowerCase();
          if (keywordLower === query || keywordLower.includes(query) || query.includes(keywordLower)) {
            return schema;
          }
        }
      }

      // Check useCases
      if (schema.aiSelectionCriteria?.useCases && schema.aiSelectionCriteria.useCases.length > 0) {
        for (const useCase of schema.aiSelectionCriteria.useCases) {
          const useCaseLower = useCase.toLowerCase();
          if (useCaseLower.includes(query) || query.includes(useCaseLower)) {
            return schema;
          }
        }
      }

      // Check description (fuzzy match)
      const descriptionLower = (schema.description || '').toLowerCase();
      if (descriptionLower.includes(query)) {
        return schema;
      }

      // Check label (fuzzy match)
      const labelLower = (schema.label || '').toLowerCase();
      if (labelLower === query || labelLower.includes(query) || query.includes(labelLower)) {
        return schema;
      }
    }

    return undefined;
  }
  
  /**
   * Get all registered node type names
   * Includes both canonical and virtual node types (aliases)
   * Exposed for debugging and external use
   */
  getRegisteredNodeTypes(): string[] {
    return Array.from(this.schemas.keys()).sort();
  }

  /**
   * Check if a node type is registered (canonical or virtual)
   * 
   * ✅ CRITICAL FIX: "custom" type is always invalid in the library
   * It's only used in final workflow nodes for frontend compatibility
   */
  isNodeTypeRegistered(nodeType: string): boolean {
    // Skip "custom" type - it's invalid and expected to fail
    if (nodeType === 'custom') {
      return false;
    }
    return this.schemas.has(nodeType);
  }

  /**
   * Get canonical type for a virtual node type (alias)
   * Returns the alias itself if it's already canonical
   */
  getCanonicalType(nodeType: string): string {
    // Check if it's a virtual node type
    const aliasMappings: Record<string, string> = {
      'gmail': 'google_gmail',
      'mail': 'email',
      'ai': 'ai_service',
    };
    
    return aliasMappings[nodeType] || nodeType;
  }

  /**
   * Get all schemas
   */
  getAllSchemas(): NodeSchema[] {
    return Array.from(this.schemas.values());
  }

  /**
   * Get nodes by category
   */
  getNodesByCategory(category: string): NodeSchema[] {
    return Array.from(this.schemas.values()).filter(s => s.category === category);
  }

  /**
   * ✅ NODE LIBRARY INITIALIZATION CHECK: Verify all required integrations are registered
   * This ensures that every node type in the allowed list is registered in the library
   */
  verifyIntegrationRegistration(): {
    valid: boolean;
    missing: string[];
    registered: string[];
  } {
    // List of key node types we expect to exist in the Node Library.
    // IMPORTANT: These must match the actual schema `type` values defined below,
    // not just the human-friendly names used in prompts.
    const requiredIntegrations = [
      // Triggers (schema types)
      'webhook',
      'chat_trigger',
      'form',
      'schedule',

      // Logic / Flow (schema types)
      'if_else',        // "if" in prompts
      'switch',
      'set_variable',   // "set" in prompts
      'function',       // ✅ Added: function node
      'function_item',  // ✅ Added: function_item node
      'merge',
      'wait',
      'limit',
      'aggregate',
      'sort',
      'javascript',     // "code" in prompts
      'noop',           // "NoOp" in prompts

      // HTTP / AI (schema types)
      'http_request',
      'chat_model',
      'ai_agent',

      // Integrations (schema types)
      'hubspot',
      'zoho_crm',       // "zoho" in prompts
      'pipedrive',
      'notion',
      'airtable',
      'clickup',
      'google_gmail',   // "gmail" in prompts (gmail is NOT a separate node - it's an alias/keyword for google_gmail)
      // Removed: 'gmail' - NOT a separate node type, only a keyword/alias for google_gmail
      // Removed: ai_service is now a capability, not a node type
      'outlook',        // ✅ Added: outlook node
      'slack_message',  // "slack" in prompts
      'telegram',
      'google_calendar',
      'linkedin',
      'github',
      'google_sheets',
    ];

    const missing: string[] = [];
    const registered: string[] = [];

    for (const integration of requiredIntegrations) {
      const schema = this.getSchema(integration);
      if (schema) {
        registered.push(integration);
      } else {
        missing.push(integration);
      }
    }

    return {
      valid: missing.length === 0,
      missing,
      registered,
    };
  }

  /**
   * ✅ CRITICAL: Validate node inputs (configurable fields like to, subject, body)
   * This validates user-provided configuration inputs, NOT credentials
   * 
   * @param nodeType - Node type to validate
   * @param config - Node configuration
   * @returns Validation result
   */
  validateInputs(nodeType: string, config: Record<string, any>): {
    valid: boolean;
    errors: string[];
    warnings: string[];
  } {
    const schema = this.getSchema(nodeType);
    if (!schema) {
      return {
        valid: false,
        errors: [`Node type "${nodeType}" not found in schema registry`],
        warnings: [],
      };
    }

    const errors: string[] = [];
    const warnings: string[] = [];

    // Validate required fields
    const requiredFields = schema.configSchema?.required || [];
    for (const fieldName of requiredFields) {
      // Skip credential fields (handled by validateCredentials)
      if (this.isCredentialField(fieldName, nodeType)) {
        continue;
      }

      const value = config[fieldName];
      if (value === undefined || value === null || value === '') {
        errors.push(`Missing required input field: ${fieldName}`);
      }
    }

    // Validate field types and formats
    const optionalFields = schema.configSchema?.optional || {};
    for (const [fieldName, fieldInfo] of Object.entries(optionalFields)) {
      // Skip credential fields
      if (this.isCredentialField(fieldName, nodeType)) {
        continue;
      }

      const value = config[fieldName];
      if (value !== undefined && value !== null && value !== '') {
        const fieldType = (fieldInfo as any)?.type;
        if (fieldType === 'string' && typeof value !== 'string') {
          errors.push(`Field "${fieldName}" must be a string, got ${typeof value}`);
        } else if (fieldType === 'number' && typeof value !== 'number') {
          errors.push(`Field "${fieldName}" must be a number, got ${typeof value}`);
        } else if (fieldType === 'boolean' && typeof value !== 'boolean') {
          errors.push(`Field "${fieldName}" must be a boolean, got ${typeof value}`);
        }

        // Run validation rules
        const validationRule = schema.validationRules?.find(r => r.field === fieldName);
        if (validationRule) {
          const result = validationRule.validator(value);
          if (result !== true) {
            errors.push(validationRule.errorMessage || `Invalid value for field "${fieldName}"`);
          }
        }
      }
    }

    // Special validation for Gmail: to, subject, body required for send operation
    if (nodeType === 'google_gmail' && config.operation === 'send') {
      if (!config.to || config.to.trim() === '') {
        errors.push('Gmail send operation requires "to" field');
      }
      if (!config.subject || config.subject.trim() === '') {
        errors.push('Gmail send operation requires "subject" field');
      }
      if (!config.body || config.body.trim() === '') {
        errors.push('Gmail send operation requires "body" field');
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * ✅ CRITICAL: Validate node credentials (OAuth tokens, API keys, etc.)
   * This validates credential fields, NOT user configuration inputs
   * 
   * @param nodeType - Node type to validate
   * @param config - Node configuration
   * @returns Validation result
   */
  validateCredentials(nodeType: string, config: Record<string, any>): {
    valid: boolean;
    errors: string[];
    warnings: string[];
  } {
    const schema = this.getSchema(nodeType);
    if (!schema) {
      return {
        valid: false,
        errors: [`Node type "${nodeType}" not found in schema registry`],
        warnings: [],
      };
    }

    const errors: string[] = [];
    const warnings: string[] = [];

    // Check if node requires credentials
    const requiredFields = schema.configSchema?.required || [];
    const optionalFields = schema.configSchema?.optional || {};
    
    // Check for credential fields in required or optional
    const credentialFields: string[] = [];
    for (const fieldName of requiredFields) {
      if (this.isCredentialField(fieldName, nodeType)) {
        credentialFields.push(fieldName);
      }
    }
    for (const fieldName of Object.keys(optionalFields)) {
      if (this.isCredentialField(fieldName, nodeType)) {
        credentialFields.push(fieldName);
      }
    }

    // Validate credential fields are present
    for (const fieldName of credentialFields) {
      const value = config[fieldName];
      if (value === undefined || value === null || value === '') {
        errors.push(`Missing required credential field: ${fieldName}`);
      } else if (typeof value === 'string' && value.trim() === '') {
        errors.push(`Credential field "${fieldName}" cannot be empty`);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Check if a field is a credential field (not a user-configurable input)
   */
  private isCredentialField(fieldName: string, nodeType: string): boolean {
    const fieldNameLower = fieldName.toLowerCase();
    
    // Common credential field patterns
    const credentialPatterns = [
      'oauth',
      'client_id',
      'client_secret',
      'token',
      'secret',
      'api_key',
      'apiKey',
      'access_token',
      'refresh_token',
      'credential',
      'password',
      'username', // For SMTP
      'host', // For SMTP
    ];

    if (credentialPatterns.some(pattern => fieldNameLower.includes(pattern))) {
      return true;
    }

    // Gmail: from is NOT a credential (OAuth handled separately)
    // Gmail: to, subject, body are inputs, NOT credentials
    if (nodeType === 'google_gmail') {
      if (fieldNameLower === 'to' || fieldNameLower === 'subject' || fieldNameLower === 'body') {
        return false; // These are inputs
      }
      if (fieldNameLower === 'from') {
        return false; // This is optional, OAuth account used if not provided
      }
    }

    return false;
  }

  /**
   * Find nodes matching keywords
   */
  findNodesByKeywords(keywords: string[]): NodeSchema[] {
    const lowerKeywords = keywords.map(k => k.toLowerCase());
    return Array.from(this.schemas.values()).filter(schema => {
      return lowerKeywords.some(keyword =>
        schema.aiSelectionCriteria.keywords.some(k => k.toLowerCase().includes(keyword)) ||
        schema.description.toLowerCase().includes(keyword) ||
        schema.label.toLowerCase().includes(keyword)
      );
    });
  }

  /**
   * Initialize all node schemas
   */
  private initializeSchemas(): void {
    console.log('[NodeLibrary] 🔄 Initializing node schemas...');
    let schemaCount = 0;
    
    // Trigger Nodes
    this.addSchema(this.createScheduleTriggerSchema());
    this.addSchema(this.createWebhookTriggerSchema());
    this.addSchema(this.createManualTriggerSchema());
    this.addSchema(this.createIntervalTriggerSchema());
    this.addSchema(this.createChatTriggerSchema());
    this.addSchema(this.createFormTriggerSchema()); // CRITICAL: Add form trigger schema
    schemaCount += 6;

    // HTTP & API Nodes
    this.addSchema(this.createHttpRequestSchema());
    this.addSchema(this.createHttpResponseSchema());
    schemaCount += 2;

    // Database / CRM Nodes
    this.addSchema(this.createPostgreSQLSchema());
    this.addSchema(this.createSupabaseSchema());
    this.addSchema(this.createDatabaseReadSchema());
    this.addSchema(this.createDatabaseWriteSchema());
    this.addSchema(this.createGoogleSheetsSchema());
    this.addSchema(this.createGoogleDocSchema());
    this.addSchema(this.createGoogleGmailSchema()); // ✅ Main Gmail node - handles all Gmail operations
    // ❌ REMOVED: createGmailSchema() - duplicate, use google_gmail instead
    this.addSchema(this.createOutlookSchema()); // ✅ Added: outlook node
    this.addSchema(this.createSalesforceSchema());
    this.addSchema(this.createClickUpSchema());
    schemaCount += 12;

    // Transformation Nodes
    this.addSchema(this.createSetNodeSchema());
    this.addSchema(this.createCodeNodeSchema());
    this.addSchema(this.createFunctionSchema()); // ✅ Added: function node
    this.addSchema(this.createFunctionItemSchema()); // ✅ Added: function_item node
    this.addSchema(this.createDateTimeNodeSchema());
    this.addSchema(this.createTextFormatterSchema());
    schemaCount += 6;

    // Logic Nodes
    this.addSchema(this.createIfElseSchema());
    this.addSchema(this.createSwitchSchema());
    this.addSchema(this.createMergeSchema());
    schemaCount += 3;

    // Error Handling Nodes
    this.addSchema(this.createErrorHandlerSchema());
    this.addSchema(this.createWaitNodeSchema());
    schemaCount += 2;

    // AI Nodes
    this.addSchema(this.createAiAgentSchema());
    this.addSchema(this.createAiChatModelSchema());
    this.addSchema(this.createAiServiceSchema()); // ✅ CRITICAL: ai_service node
    schemaCount += 3;
    
    console.log(`[NodeLibrary] ✅ Registered ${schemaCount} node schemas so far...`);

    // Output Nodes
    this.addSchema(this.createSlackMessageSchema());
    this.addSchema(this.createEmailSchema());
    this.addSchema(this.createLogOutputSchema());
    this.addSchema(this.createTelegramSchema());
    
    // Social Media Nodes
    this.addSchema(this.createLinkedInSchema());
    this.addSchema(this.createTwitterSchema());
    this.addSchema(this.createInstagramSchema());
    this.addSchema(this.createYoutubeSchema());
    
    // Missing CRM Nodes - CRITICAL FIX
    this.addSchema(this.createHubSpotSchema());
    this.addSchema(this.createAirtableSchema());
    this.addSchema(this.createNotionSchema());
    this.addSchema(this.createZohoCrmSchema());
    this.addSchema(this.createPipedriveSchema());
    
    // Missing Communication Nodes
    this.addSchema(this.createDiscordSchema());
    
    // Missing Data Nodes
    this.addSchema(this.createJsonParserSchema());
    this.addSchema(this.createMergeDataSchema());
    this.addSchema(this.createEditFieldsSchema());
    
    // Missing Trigger Nodes
    this.addSchema(this.createErrorTriggerSchema());
    this.addSchema(this.createWorkflowTriggerSchema());
    
    // Missing Logic Nodes
    this.addSchema(this.createFilterSchema());
    this.addSchema(this.createLoopSchema());
    this.addSchema(this.createNoopSchema());
    this.addSchema(this.createSetSchema());
    this.addSchema(this.createSplitInBatchesSchema());
    this.addSchema(this.createStopAndErrorSchema());
    
    // Missing Data Manipulation Nodes
    // Note: set_variable is already registered via createSetNodeSchema() above, so skip createSetVariableSchema()
    this.addSchema(this.createMathSchema());
    this.addSchema(this.createHtmlSchema());
    this.addSchema(this.createXmlSchema());
    this.addSchema(this.createCsvSchema());
    this.addSchema(this.createRenameKeysSchema());
    this.addSchema(this.createAggregateSchema());
    this.addSchema(this.createSortSchema());
    this.addSchema(this.createLimitSchema());
    
    // Missing AI Nodes
    this.addSchema(this.createOpenAiGptSchema());
    this.addSchema(this.createAnthropicClaudeSchema());
    this.addSchema(this.createGoogleGeminiSchema());
    this.addSchema(this.createOllamaSchema());
    this.addSchema(this.createTextSummarizerSchema());
    this.addSchema(this.createSentimentAnalyzerSchema());
    this.addSchema(this.createChatModelSchema());
    this.addSchema(this.createMemorySchema());
    this.addSchema(this.createToolSchema());
    
    // Missing HTTP Nodes
    this.addSchema(this.createHttpPostSchema());
    this.addSchema(this.createWebhookResponseSchema());
    this.addSchema(this.createGraphqlSchema());
    
    // Missing Google Nodes
    this.addSchema(this.createGoogleDriveSchema());
    this.addSchema(this.createGoogleCalendarSchema());
    this.addSchema(this.createGoogleContactsSchema());
    this.addSchema(this.createGoogleTasksSchema());
    this.addSchema(this.createGoogleBigQuerySchema());
    
    // Missing Communication Nodes
    this.addSchema(this.createSlackWebhookSchema());
    this.addSchema(this.createDiscordWebhookSchema());
    this.addSchema(this.createMicrosoftTeamsSchema());
    this.addSchema(this.createWhatsappCloudSchema());
    this.addSchema(this.createTwilioSchema());
    
    // Missing Social Media Nodes
    this.addSchema(this.createFacebookSchema());
    
    // Missing Database Nodes
    this.addSchema(this.createMysqlSchema());
    this.addSchema(this.createMongodbSchema());
    this.addSchema(this.createRedisSchema());
    
    // Missing CRM Nodes
    this.addSchema(this.createFreshdeskSchema());
    this.addSchema(this.createIntercomSchema());
    this.addSchema(this.createMailchimpSchema());
    this.addSchema(this.createActivecampaignSchema());
    
    // Missing File Nodes
    this.addSchema(this.createReadBinaryFileSchema());
    this.addSchema(this.createWriteBinaryFileSchema());
    this.addSchema(this.createAwsS3Schema());
    this.addSchema(this.createDropboxSchema());
    this.addSchema(this.createOnedriveSchema());
    this.addSchema(this.createFtpSchema());
    this.addSchema(this.createSftpSchema());
    
    // Missing DevOps Nodes
    this.addSchema(this.createGithubSchema());
    this.addSchema(this.createGitlabSchema());
    this.addSchema(this.createBitbucketSchema());
    this.addSchema(this.createJiraSchema());
    this.addSchema(this.createJenkinsSchema());
    
    // Missing E-commerce Nodes
    this.addSchema(this.createShopifySchema());
    this.addSchema(this.createWooCommerceSchema());
    this.addSchema(this.createStripeSchema());
    this.addSchema(this.createPaypalSchema());
  }

  private addSchema(schema: NodeSchema): void {
    // ✅ CRITICAL: Set schema version if not provided
    if (!schema.schemaVersion) {
      schema.schemaVersion = '1.0';
    }
    
    // PHASE 6: Automatically add output type information
    if (!schema.outputType) {
      schema.outputType = getNodeOutputType(schema.type);
      schema.outputSchema = getNodeOutputSchema(schema.type);
    }
    
    // Check for duplicate registration
    if (this.schemas.has(schema.type)) {
      console.warn(`[NodeLibrary] ⚠️  Duplicate node type registration: "${schema.type}" (overwriting existing schema)`);
    }
    
    this.schemas.set(schema.type, schema);
    
    // Log registration in debug mode
    if (process.env.DEBUG_NODE_REGISTRATION === 'true') {
      console.log(`[NodeLibrary] 📝 Registered node: "${schema.type}" (${schema.category || 'uncategorized'})`);
    }
  }

  // ============================================
  // TRIGGER NODES
  // ============================================

  private createScheduleTriggerSchema(): NodeSchema {
    return {
      type: 'schedule',
      label: 'Schedule Trigger',
      category: 'triggers',
      description: 'Executes workflow on a time-based schedule using cron expressions',
      configSchema: {
        required: ['cron'],
        optional: {
          cron: {
            type: 'string',
            description: 'Cron expression (e.g., "0 9 * * *" for daily at 9 AM)',
            examples: ['0 9 * * *', '*/30 * * * *', '0 0 * * 1'],
          },
          timezone: {
            type: 'string',
            description: 'Timezone for schedule',
            default: 'UTC',
            examples: ['UTC', 'America/New_York', 'Europe/London'],
          },
        },
      },
      aiSelectionCriteria: {
        whenToUse: [
          'User mentions time-based execution (daily, hourly, weekly)',
          'Regular/repetitive tasks needed',
          'No external event triggers available',
          'Batch processing requirements',
        ],
        whenNotToUse: [
          'Real-time event processing needed',
          'Workflow triggered by external systems',
          'Manual execution only required',
        ],
        keywords: ['schedule', 'daily', 'hourly', 'weekly', 'cron', 'time', 'every'],
        useCases: ['Daily reports', 'Hourly syncs', 'Scheduled maintenance', 'Periodic data processing'],
      },
      commonPatterns: [
        {
          name: 'daily_at_9am',
          description: 'Run daily at 9 AM',
          config: { cron: '0 9 * * *', timezone: 'UTC' },
        },
        {
          name: 'hourly',
          description: 'Run every hour',
          config: { cron: '0 * * * *', timezone: 'UTC' },
        },
        {
          name: 'business_hours',
          description: 'Run during business hours (8 AM - 5 PM, Mon-Fri)',
          config: { cron: '0 8-17 * * 1-5', timezone: 'UTC' },
        },
      ],
      validationRules: [
        {
          field: 'cron',
          validator: (value) => /^[\d\s\*\/\-\,]+$/.test(value),
          errorMessage: 'Invalid cron expression format',
        },
      ],
    };
  }

  private createWebhookTriggerSchema(): NodeSchema {
    return {
      type: 'webhook',
      label: 'Webhook Trigger',
      category: 'triggers',
      description: 'Executes workflow when HTTP request is received',
      configSchema: {
        required: ['path'],
        optional: {
          path: {
            type: 'string',
            description: 'URL path for webhook',
            examples: ['/webhook', '/api/callback', '/form-submit'],
          },
          httpMethod: {
            type: 'string',
            description: 'HTTP method to accept',
            default: 'POST',
            examples: ['GET', 'POST', 'PUT', 'DELETE'],
          },
          responseMode: {
            type: 'string',
            description: 'How to respond to webhook caller',
            default: 'responseNode',
            examples: ['responseNode', 'onReceived', 'lastNode'],
          },
          verifySignature: {
            type: 'boolean',
            description: 'Whether to verify webhook signatures (if supported by the sender)',
            default: false,
            examples: [true, false],
          },
          secretToken: {
            type: 'string',
            description: 'Secret token used for signature verification (if verifySignature is enabled)',
            examples: ['{{ENV.WEBHOOK_SECRET}}'],
          },
        },
      },
      aiSelectionCriteria: {
        whenToUse: [
          'User mentions "when X happens, do Y"',
          'Real-time processing needed',
          'Integration with external services',
          'Event-driven architecture',
        ],
        whenNotToUse: [
          'Scheduled tasks only',
          'No external system can call webhook',
          'Manual execution sufficient',
        ],
        keywords: ['webhook', 'http', 'api', 'callback', 'event', 'trigger', 'when'],
        useCases: ['API callbacks', 'Form submissions', 'External system integration', 'Real-time events'],
      },
      commonPatterns: [
        {
          name: 'slack_command',
          description: 'Handle Slack slash commands',
          config: { path: '/slack/command', httpMethod: 'POST', responseMode: 'onReceived' },
        },
        {
          name: 'github_webhook',
          description: 'Process GitHub events',
          config: { path: '/github/webhook', httpMethod: 'POST', responseMode: 'responseNode' },
        },
      ],
      validationRules: [
        {
          field: 'path',
          validator: (value) => typeof value === 'string' && value.startsWith('/'),
          errorMessage: 'Path must start with /',
        },
      ],
    };
  }

  private createManualTriggerSchema(): NodeSchema {
    return {
      type: 'manual_trigger',
      label: 'Manual Trigger',
      category: 'triggers',
      description: 'Workflow executes when user manually triggers it',
      configSchema: {
        required: [],
        optional: {
          inputData: {
            type: 'object',
            description: 'Optional input data when triggered manually',
          },
        },
      },
      aiSelectionCriteria: {
        whenToUse: [
          'User says "run manually" or "on demand"',
          'No schedule or external trigger needed',
          'Testing purposes',
          'User interaction required',
        ],
        whenNotToUse: [
          'Automated scheduling needed',
          'External event triggers available',
          'Unattended operation required',
        ],
        keywords: ['manual', 'on demand', 'run', 'execute', 'trigger'],
        useCases: ['Ad-hoc processing', 'Testing', 'One-time operations', 'User-initiated tasks'],
      },
      commonPatterns: [],
      validationRules: [],
    };
  }

  private createIntervalTriggerSchema(): NodeSchema {
    return {
      type: 'interval',
      label: 'Interval Trigger',
      category: 'triggers',
      description: 'Trigger workflow at fixed intervals',
      configSchema: {
        required: ['interval', 'unit'],
        optional: {
          interval: {
            type: 'number',
            description: 'Interval value',
            examples: [1, 5, 30, 60],
          },
          unit: {
            type: 'string',
            description: 'Interval unit',
            examples: ['seconds', 'minutes', 'hours'],
          },
        },
      },
      aiSelectionCriteria: {
        whenToUse: [
          'User mentions specific intervals (every 5 minutes, every hour)',
          'More flexible than cron needed',
          'Simple recurring tasks',
        ],
        whenNotToUse: [
          'Complex scheduling needed',
          'Specific times required',
        ],
        keywords: ['interval', 'every', 'repeat', 'periodic'],
        useCases: ['Polling', 'Regular checks', 'Simple recurring tasks'],
      },
      commonPatterns: [
        {
          name: 'every_5_minutes',
          description: 'Run every 5 minutes',
          config: { interval: 5, unit: 'minutes' },
        },
      ],
      validationRules: [],
    };
  }

  private createFormTriggerSchema(): NodeSchema {
    return {
      type: 'form',
      label: 'Form Trigger',
      category: 'triggers',
      description: 'Trigger workflow when user submits a form',
      configSchema: {
        required: ['formTitle', 'fields'],
        optional: {
          formTitle: {
            type: 'string',
            description: 'Title of the form',
            default: 'Form Submission',
            examples: ['Contact Us Form', 'Feedback Form', 'Registration Form'],
          },
          formDescription: {
            type: 'string',
            description: 'Description shown on the form',
            default: '',
          },
          fields: {
            type: 'array',
            description: 'Form fields configuration',
            default: [],
          },
          submitButtonText: {
            type: 'string',
            description: 'Text on submit button',
            default: 'Submit',
          },
          successMessage: {
            type: 'string',
            description: 'Message shown after successful submission',
            default: 'Thank you for your submission!',
          },
          allowMultipleSubmissions: {
            type: 'boolean',
            description: 'Allow same user to submit multiple times',
            default: true,
          },
          requireAuthentication: {
            type: 'boolean',
            description: 'Require user authentication',
            default: false,
          },
          captcha: {
            type: 'boolean',
            description: 'Enable CAPTCHA verification',
            default: false,
          },
        },
      },
      aiSelectionCriteria: {
        whenToUse: [
          'User mentions "form submission" or "contact form"',
          'User wants to collect structured data from users',
          'User mentions "when someone fills out"',
          'Contact forms, surveys, applications',
        ],
        whenNotToUse: [
          'External API calls (use webhook)',
          'Scheduled tasks (use schedule)',
          'Manual execution only (use manual_trigger)',
        ],
        keywords: ['form', 'form submission', 'contact form', 'survey', 'application', 'submission'],
        useCases: ['Contact forms', 'Lead capture', 'Surveys', 'Applications', 'Feedback collection'],
      },
      commonPatterns: [
        {
          name: 'contact_form',
          description: 'Contact form with name, email, message',
          config: {
            formTitle: 'Contact Us',
            fields: [
              { key: 'name', label: 'Name', type: 'text', required: true },
              { key: 'email', label: 'Email', type: 'email', required: true },
              { key: 'message', label: 'Message', type: 'textarea', required: true },
            ],
          },
        },
      ],
      validationRules: [
        {
          field: 'fields',
          validator: (value) => Array.isArray(value) && value.length > 0,
          errorMessage: 'Form must have at least one field',
        },
      ],
      capabilities: ['form.trigger', 'form.collect', 'form.submit'],
      keywords: ['form', 'form submission', 'contact form', 'survey'],
    };
  }

  // ============================================
  // HTTP & API NODES
  // ============================================

  private createHttpRequestSchema(): NodeSchema {
    return {
      type: 'http_request',
      label: 'HTTP Request',
      category: 'http_api',
      description: 'Makes HTTP requests to external APIs or services',
      configSchema: {
        required: ['url'],
        optional: {
          url: {
            type: 'string',
            description: 'Full URL to request',
            examples: ['https://api.example.com/data', '{{$json.apiUrl}}/users'],
          },
          method: {
            type: 'string',
            description: 'HTTP method',
            default: 'GET',
            examples: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
          },
          headers: {
            type: 'object',
            description: 'HTTP headers to send',
            examples: [
              { 'Authorization': 'Bearer {{$credentials.apiKey}}', 'Content-Type': 'application/json' },
            ],
          },
          body: {
            type: 'object',
            description: 'Request body for POST/PUT/PATCH',
          },
          qs: {
            type: 'object',
            description: 'Query string parameters',
          },
          timeout: {
            type: 'number',
            description: 'Request timeout in milliseconds',
            default: 10000,
          },
          retryOnFail: {
            type: 'boolean',
            description: 'Retry on failure',
            default: true,
          },
          maxRetries: {
            type: 'number',
            description: 'Maximum retry attempts',
            default: 3,
          },
        },
      },
      aiSelectionCriteria: {
        whenToUse: [
          'User mentions API integration',
          'Need to fetch data from web services',
          'Sending data to external systems',
          'Web scraping',
        ],
        whenNotToUse: [
          'Database operations (use database nodes)',
          'File operations (use file nodes)',
          'Simple data transformation (use set/code nodes)',
        ],
        keywords: ['api', 'http', 'request', 'fetch', 'call', 'endpoint', 'url'],
        useCases: ['API integration', 'Data fetching', 'Webhooks', 'External service calls'],
      },
      commonPatterns: [
        {
          name: 'rest_api_get',
          description: 'GET request to REST API',
          config: {
            method: 'GET',
            headers: { 'Authorization': 'Bearer {{$credentials.apiToken}}', 'Accept': 'application/json' },
          },
        },
        {
          name: 'rest_api_post',
          description: 'POST request to create resource',
          config: {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: {},
          },
        },
      ],
      validationRules: [
        {
          field: 'url',
          validator: (value) => typeof value === 'string' && (value.startsWith('http') || value.includes('{{')),
          errorMessage: 'URL must be valid or an expression',
        },
      ],
    };
  }

  private createHttpResponseSchema(): NodeSchema {
    return {
      type: 'respond_to_webhook',
      label: 'Respond to Webhook',
      category: 'http_api',
      description: 'Sends HTTP response back to webhook caller',
      configSchema: {
        required: [],
        optional: {
          responseCode: {
            type: 'number',
            description: 'HTTP status code',
            default: 200,
            examples: [200, 201, 400, 404, 500],
          },
          headers: {
            type: 'object',
            description: 'Response headers',
            default: { 'Content-Type': 'application/json' },
          },
          body: {
            type: 'object',
            description: 'Response body data',
          },
        },
      },
      aiSelectionCriteria: {
        whenToUse: [
          'Workflow triggered by webhook',
          'Need to send response back to caller',
          'Building API endpoints',
          'Form submission handling',
        ],
        whenNotToUse: [
          'Not a webhook-triggered workflow',
          'No response needed',
        ],
        keywords: ['response', 'webhook', 'reply', 'return'],
        useCases: ['Webhook responses', 'API endpoints', 'Form submissions'],
      },
      commonPatterns: [
        {
          name: 'success_response',
          description: 'Return success response',
          config: { responseCode: 200, body: { status: 'success', data: '{{$json}}' } },
        },
      ],
      validationRules: [],
    };
  }

  // ============================================
  // DATABASE NODES
  // ============================================

  private createPostgreSQLSchema(): NodeSchema {
    return {
      type: 'postgresql', // PostgreSQL-specific node type
      label: 'PostgreSQL',
      category: 'database',
      description: 'Execute SQL queries on PostgreSQL database',
      configSchema: {
        required: ['query'],
        optional: {
          connectionString: {
            type: 'string',
            description: 'Database connection string (PostgreSQL). If omitted, uses DATABASE_URL from environment.',
            examples: ['postgresql://user:pass@host:5432/dbname'],
          },
          query: {
            type: 'string',
            description: 'SQL query to execute',
            examples: [
              'INSERT INTO users (name, email) VALUES ($1, $2)',
              'UPDATE users SET status = $1 WHERE id = $2',
            ],
          },
          parameters: {
            type: 'array',
            description: 'Query parameters',
          },
        },
      },
      aiSelectionCriteria: {
        whenToUse: [
          'User mentions database operations',
          'Need to store data',
          'Complex queries needed',
          'Transaction management',
        ],
        whenNotToUse: [
          'Simple API calls',
          'File operations',
        ],
        keywords: ['database', 'postgres', 'sql', 'insert', 'update', 'delete', 'query'],
        useCases: ['Data storage', 'Complex queries', 'Batch operations', 'Data synchronization'],
      },
      commonPatterns: [
        {
          name: 'insert_with_timestamp',
          description: 'Insert with created_at timestamp',
          config: {
            query: 'INSERT INTO table (columns, created_at) VALUES ($1, NOW()) RETURNING *',
          },
        },
      ],
      validationRules: [
        {
          field: 'query',
          validator: (value) => typeof value === 'string' && value.length > 0,
          errorMessage: 'Query is required',
        },
      ],
    };
  }

  private createSupabaseSchema(): NodeSchema {
    return {
      type: 'supabase',
      label: 'Supabase',
      category: 'database',
      description: 'Interact with Supabase (PostgreSQL + realtime + storage)',
      configSchema: {
        required: ['table', 'operation'],
        optional: {
          table: {
            type: 'string',
            description: 'Table name',
          },
          operation: {
            type: 'string',
            description: 'Operation type',
            examples: ['select', 'insert', 'update', 'delete'],
          },
          data: {
            type: 'object',
            description: 'Data for insert/update',
          },
          filters: {
            type: 'object',
            description: 'Filter conditions',
          },
        },
      },
      aiSelectionCriteria: {
        whenToUse: [
          'User mentions Supabase',
          'Modern web app backend',
          'Realtime subscriptions needed',
        ],
        whenNotToUse: [
          'Standard PostgreSQL operations',
          'Other database systems',
        ],
        keywords: ['supabase', 'realtime', 'modern'],
        useCases: ['Modern web apps', 'Realtime data', 'File storage'],
      },
      commonPatterns: [
        {
          name: 'select_records',
          description: 'Select records from a table',
          config: { table: 'users', operation: 'select', filters: { status: 'active' } },
        },
        {
          name: 'insert_record',
          description: 'Insert a new record',
          config: { table: 'users', operation: 'insert', data: { name: '{{$json.name}}', email: '{{$json.email}}' } },
        },
        {
          name: 'update_record',
          description: 'Update an existing record',
          config: { table: 'users', operation: 'update', filters: { id: '{{$json.id}}' }, data: { name: '{{$json.name}}' } },
        },
      ],
      validationRules: [],
    };
  }

  private createDatabaseReadSchema(): NodeSchema {
    return {
      type: 'database_read',
      label: 'Database Read',
      category: 'database',
      description: 'Read data from database using SQL queries',
      configSchema: {
        required: ['query'],
        optional: {
          connectionString: {
            type: 'string',
            description: 'Database connection string (PostgreSQL). If omitted, uses DATABASE_URL from environment.',
            examples: ['postgresql://user:pass@host:5432/dbname'],
          },
          query: {
            type: 'string',
            description: 'SELECT query',
            examples: ['SELECT * FROM users WHERE status = $1'],
          },
          parameters: {
            type: 'array',
            description: 'Query parameters',
          },
        },
      },
      aiSelectionCriteria: {
        whenToUse: [
          'Need to retrieve data from database',
          'Complex queries needed',
        ],
        whenNotToUse: [
          'Simple data operations',
        ],
        keywords: ['read', 'select', 'fetch', 'get', 'retrieve'],
        useCases: ['Data retrieval', 'Complex queries'],
      },
      commonPatterns: [],
      validationRules: [],
    };
  }

  private createDatabaseWriteSchema(): NodeSchema {
    // Return a proper database_write schema (for generic database write operations)
    return {
      type: 'database_write',
      label: 'Database Write',
      category: 'database',
      description: 'Execute SQL queries on database (INSERT, UPDATE, DELETE)',
      configSchema: {
        required: ['query'],
        optional: {
          connectionString: {
            type: 'string',
            description: 'Database connection string (PostgreSQL). If omitted, uses DATABASE_URL from environment.',
            examples: ['postgresql://user:pass@host:5432/dbname'],
          },
          query: {
            type: 'string',
            description: 'SQL query to execute',
            examples: [
              'INSERT INTO users (name, email) VALUES ($1, $2)',
              'UPDATE users SET status = $1 WHERE id = $2',
            ],
          },
          parameters: {
            type: 'array',
            description: 'Query parameters',
          },
        },
      },
      aiSelectionCriteria: {
        whenToUse: ['User mentions database write', 'INSERT/UPDATE/DELETE operations'],
        whenNotToUse: ['Read-only operations (use database_read)'],
        keywords: ['database', 'write', 'insert', 'update', 'delete'],
        useCases: ['Database write operations'],
      },
      commonPatterns: [],
      validationRules: [],
    };
  }

  private createGoogleSheetsSchema(): NodeSchema {
    return {
      type: 'google_sheets',
      label: 'Google Sheets',
      category: 'google',
      description: 'Read, write, append, or update data in Google Sheets',
      configSchema: {
        required: ['spreadsheetId', 'operation'],
        optional: {
          operation: {
            type: 'string',
            description: 'Operation type: read, write, append, or update',
            examples: ['read', 'write', 'append', 'update'],
            default: 'read',
          },
          spreadsheetId: {
            type: 'string',
            description: 'Google Sheets spreadsheet ID (from URL: /d/SPREADSHEET_ID/edit)',
            examples: ['1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms'],
          },
          sheetName: {
            type: 'string',
            description: 'Sheet name/tab (leave empty for first sheet)',
            examples: ['Sheet1', 'Data', ''],
          },
          range: {
            type: 'string',
            description: 'Cell range (e.g., A1:D100, leave empty for all used cells)',
            examples: ['A1:D100', 'A1:Z', ''],
          },
          outputFormat: {
            type: 'string',
            description: 'Output format for read operations',
            examples: ['json', 'array', 'object'],
            default: 'json',
          },
          values: {
            type: 'array',
            description: 'Data to write/append (for write/append operations)',
          },
          data: {
            type: 'object',
            description: 'Data object to write/append (alternative to values array)',
          },
        },
      },
      aiSelectionCriteria: {
        whenToUse: [
          'User mentions Google Sheets',
          'Need to read/write spreadsheet data',
          'Data storage in spreadsheets',
          'Integration with Google Workspace',
        ],
        whenNotToUse: [
          'Database operations (use database nodes)',
          'Other spreadsheet services',
        ],
        keywords: ['google sheets', 'spreadsheet', 'sheets', 'sheet', 'google', 'excel', 'gsheet', 'g sheet', 'googlesheet', 'googlesheets', 'read from sheets', 'write to sheets', 'get data from sheets', 'save to sheets'],
        useCases: ['Data extraction', 'Data storage', 'Spreadsheet automation', 'Google Workspace integration'],
      },
      commonPatterns: [
        {
          name: 'read_all_data',
          description: 'Read all data from a sheet',
          config: {
            operation: 'read',
            spreadsheetId: '{{$json.spreadsheetId}}',
            outputFormat: 'json',
          },
        },
        {
          name: 'append_row',
          description: 'Append a new row to sheet',
          config: {
            operation: 'append',
            spreadsheetId: '{{$json.spreadsheetId}}',
            values: [['{{$json.name}}', '{{$json.email}}']],
          },
        },
      ],
      validationRules: [
        {
          field: 'spreadsheetId',
          validator: (value) => typeof value === 'string' && value.length > 0,
          errorMessage: 'Spreadsheet ID is required',
        },
        {
          field: 'operation',
          validator: (value) => ['read', 'write', 'append', 'update'].includes(value),
          errorMessage: 'Operation must be one of: read, write, append, update',
        },
      ],
      nodeCapability: {
        inputType: 'text', // Accepts text for queries/filters
        outputType: 'array', // Produces array of rows
        acceptsArray: false,
        producesArray: true,
      },
    };
  }

  private createGoogleDocSchema(): NodeSchema {
    return {
      type: 'google_doc',
      label: 'Google Docs',
      category: 'google',
      description: 'Read or write content in Google Docs documents',
      configSchema: {
        required: ['documentId', 'operation'],
        optional: {
          operation: {
            type: 'string',
            description: 'Operation type: read or write',
            examples: ['read', 'write'],
            default: 'read',
          },
          documentId: {
            type: 'string',
            description: 'Google Docs document ID (extract from URL: /d/DOCUMENT_ID/edit)',
            examples: ['1a2b3c4d5e6f7g8h9i0j'],
          },
          documentUrl: {
            type: 'string',
            description: 'Full Google Docs URL (alternative to documentId)',
            examples: ['https://docs.google.com/document/d/DOCUMENT_ID/edit'],
          },
          content: {
            type: 'string',
            description: 'Content to write (for write operations)',
            examples: ['{{$json.content}}', 'Hello World'],
          },
          format: {
            type: 'string',
            description: 'Output format for read operations',
            examples: ['text', 'html', 'markdown'],
            default: 'text',
          },
        },
      },
      aiSelectionCriteria: {
        whenToUse: [
          'User mentions Google Docs',
          'Need to read/write document content',
          'Document processing',
          'Integration with Google Workspace documents',
        ],
        whenNotToUse: [
          'Spreadsheet operations (use google_sheets)',
          'Other document services',
        ],
        keywords: ['google docs', 'google doc', 'document', 'docs', 'google', 'read document', 'write document'],
        useCases: ['Document extraction', 'Document generation', 'Content processing', 'Google Workspace integration'],
      },
      commonPatterns: [
        {
          name: 'read_document',
          description: 'Read content from Google Docs',
          config: {
            operation: 'read',
            documentId: '{{$json.documentId}}',
            format: 'text',
          },
        },
        {
          name: 'write_document',
          description: 'Write content to Google Docs',
          config: {
            operation: 'write',
            documentId: '{{$json.documentId}}',
            content: '{{$json.content}}',
          },
        },
      ],
      validationRules: [
        {
          field: 'documentId',
          validator: (value) => typeof value === 'string' && value.length > 0,
          errorMessage: 'Document ID is required (or provide documentUrl)',
        },
        {
          field: 'operation',
          validator: (value) => ['read', 'write'].includes(value),
          errorMessage: 'Operation must be one of: read, write',
        },
      ],
    };
  }

  // ============================================
  // TRANSFORMATION NODES
  // ============================================

  private createSetNodeSchema(): NodeSchema {
    return {
      type: 'set_variable',
      label: 'Set Variable',
      category: 'data',
      description: 'Set a variable with a name and value',
      configSchema: {
        required: ['name'], // ✅ CRITICAL: Match execution code which uses 'name' and 'value'
        optional: {
          name: {
            type: 'string',
            description: 'Variable name (must be a valid identifier)',
            examples: ['myVariable', 'userName', 'totalAmount'],
          },
          value: {
            type: 'string',
            description: 'Variable value (supports template expressions like {{input.field}})',
            examples: ['Hello World', '{{input.name}}', '{{$json.data}}'],
            default: '',
          },
          // Legacy support: also accept 'values' array format
          values: {
            type: 'array',
            description: 'Array of field assignments (legacy format)',
            examples: [
              [{ name: 'fullName', value: '{{$json.firstName}} {{$json.lastName}}' }],
            ],
          },
          keepSource: {
            type: 'boolean',
            description: 'Keep original fields',
            default: false,
          },
        },
      },
      aiSelectionCriteria: {
        whenToUse: [
          'Simple data mapping needed',
          'Adding computed fields',
          'Default value assignment',
          'Data normalization',
        ],
        whenNotToUse: [
          'Complex transformations (use code node)',
          'Conditional logic (use if node)',
        ],
        keywords: ['set', 'map', 'transform', 'add field', 'assign'],
        useCases: ['Data mapping', 'Adding fields', 'Normalization'],
      },
      commonPatterns: [
        {
          name: 'add_timestamps',
          description: 'Add created/updated timestamps',
          config: {
            values: [
              { name: 'createdAt', value: '{{$now}}' },
              { name: 'updatedAt', value: '{{$now}}' },
            ],
          },
        },
      ],
      validationRules: [],
    };
  }

  private createCodeNodeSchema(): NodeSchema {
    return {
      type: 'javascript',
      label: 'JavaScript',
      category: 'data',
      description: 'Execute custom JavaScript code',
      configSchema: {
        required: ['code'],
        optional: {
          code: {
            type: 'string',
            description: 'JavaScript code to execute',
            examples: [
              'return { ...$json, fullName: $json.firstName + " " + $json.lastName };',
            ],
          },
        },
      },
      aiSelectionCriteria: {
        whenToUse: [
          'Complex data transformations',
          'Custom algorithms',
          'API response processing',
          'Data validation',
        ],
        whenNotToUse: [
          'Simple mappings (use set node)',
          'Conditional logic (use if node)',
        ],
        keywords: ['code', 'javascript', 'transform', 'custom', 'complex'],
        useCases: ['Complex transformations', 'Custom logic', 'Data processing'],
      },
      commonPatterns: [],
      validationRules: [
        {
          field: 'code',
          validator: (value) => typeof value === 'string' && value.length > 0,
          errorMessage: 'Code is required',
        },
      ],
    };
  }

  private createFunctionSchema(): NodeSchema {
    return {
      type: 'function',
      label: 'Function',
      category: 'logic',
      description: 'Execute a custom function with input parameters',
      configSchema: {
        required: ['description'],
        optional: {
          description: {
            type: 'string',
            description: 'Description of what this function should do',
            examples: ['Transform contact data', 'Calculate total price'],
          },
          code: {
            type: 'string',
            description: 'Optional JavaScript code for the function',
            examples: ['return { ...$json, processed: true };'],
          },
          timeout: {
            type: 'number',
            description: 'Execution timeout in milliseconds (max 30000)',
            default: 10000,
            examples: [5000, 10000, 30000],
          },
        },
      },
      aiSelectionCriteria: {
        whenToUse: [
          'Custom function logic needed',
          'Data transformation with parameters',
          'Reusable logic blocks',
        ],
        whenNotToUse: [
          'Simple data mapping (use set node)',
          'Complex code (use code/javascript node)',
        ],
        keywords: ['function', 'custom function', 'execute function'],
        useCases: ['Custom logic', 'Function execution', 'Data processing'],
      },
      commonPatterns: [],
      validationRules: [],
    };
  }

  private createFunctionItemSchema(): NodeSchema {
    return {
      type: 'function_item',
      label: 'Function Item',
      category: 'logic',
      description: 'Execute a function for each item in an array',
      configSchema: {
        required: ['description'],
        optional: {
          description: {
            type: 'string',
            description: 'Description of what should be done for each item',
            examples: ['Process each contact', 'Transform each record'],
          },
          items: {
            type: 'array',
            description: 'Array of items to process',
            examples: ['{{$json.items}}', '{{$json.contacts}}'],
          },
        },
      },
      aiSelectionCriteria: {
        whenToUse: [
          'Need to process each item in an array',
          'Apply function to multiple items',
          'Iterate and transform',
        ],
        whenNotToUse: [
          'Single item processing',
          'Simple loops (use loop node)',
        ],
        keywords: ['function item', 'each item', 'per item', 'for each'],
        useCases: ['Array processing', 'Item transformation', 'Batch operations'],
      },
      commonPatterns: [],
      validationRules: [],
    };
  }

  private createDateTimeNodeSchema(): NodeSchema {
    return {
      type: 'date_time',
      label: 'Date/Time',
      category: 'data',
      description: 'Parse, format, and manipulate dates and times',
      configSchema: {
        required: ['operation'],
        optional: {
          operation: {
            type: 'string',
            description: 'Operation type',
            examples: ['format', 'calculate', 'extract', 'parse'],
          },
          dateValue: {
            type: 'string',
            description: 'Input date',
            examples: ['{{$json.timestamp}}', '{{$now}}'],
          },
          format: {
            type: 'string',
            description: 'Output format',
            examples: ['YYYY-MM-DD', 'HH:mm:ss'],
          },
        },
      },
      aiSelectionCriteria: {
        whenToUse: [
          'Date formatting needed',
          'Time zone conversion',
          'Date calculations',
          'Schedule generation',
        ],
        whenNotToUse: [
          'Simple data operations',
        ],
        keywords: ['date', 'time', 'format', 'timestamp', 'schedule'],
        useCases: ['Date formatting', 'Time conversion', 'Calculations'],
      },
      commonPatterns: [],
      validationRules: [],
    };
  }

  private createTextFormatterSchema(): NodeSchema {
    return {
      type: 'text_formatter',
      label: 'Text Formatter',
      category: 'data',
      description: 'Format text strings with templates and placeholders',
      configSchema: {
        required: ['template'],
        optional: {
          template: {
            type: 'string',
            description: 'Text template with placeholders (e.g., "Hello {{name}}")',
            examples: [
              'Hello {{$json.name}}',
              'Order #{{$json.orderId}} - Total: ${{$json.total}}',
              '{{$json.firstName}} {{$json.lastName}}',
            ],
          },
          values: {
            type: 'object',
            description: 'Values to substitute in template (optional if using $json syntax)',
            examples: [{ name: 'John', orderId: '12345' }],
          },
        },
      },
      aiSelectionCriteria: {
        whenToUse: [
          'Formatting text with variables',
          'Creating messages from data',
          'Template-based text generation',
          'String interpolation',
        ],
        whenNotToUse: [
          'Complex transformations (use code node)',
          'Conditional formatting (use if node + text formatter)',
        ],
        keywords: ['format', 'template', 'text', 'string', 'interpolate', 'placeholder'],
        useCases: ['Message formatting', 'Text templates', 'String interpolation', 'Data formatting'],
      },
      commonPatterns: [
        {
          name: 'greeting_message',
          description: 'Format greeting message',
          config: {
            template: 'Hello {{$json.name}}, welcome to {{$json.company}}!',
          },
        },
        {
          name: 'order_summary',
          description: 'Format order summary',
          config: {
            template: 'Order #{{$json.orderId}}\nTotal: ${{$json.total}}\nItems: {{$json.itemCount}}',
          },
        },
      ],
      validationRules: [
        {
          field: 'template',
          validator: (value) => typeof value === 'string' && value.length > 0,
          errorMessage: 'Template is required',
        },
      ],
    };
  }

  // ============================================
  // LOGIC NODES
  // ============================================

  private createIfElseSchema(): NodeSchema {
    return {
      type: 'if_else',
      label: 'If/Else',
      category: 'logic',
      description: 'Conditional branching based on true/false condition',
      configSchema: {
        required: ['conditions'],
        optional: {
          conditions: {
            type: 'array',
            description: 'Conditions to evaluate. Each condition should have: field (string), operator (equals|not_equals|greater_than|less_than|greater_than_or_equal|less_than_or_equal|contains|not_contains), value (string|number|boolean)',
            examples: [
              [{ field: 'input.age', operator: 'greater_than_or_equal', value: 18 }],
              [{ field: '$json.status', operator: 'equals', value: 'active' }],
              // Legacy format still supported:
              [{ leftValue: '{{$json.status}}', operation: 'equals', rightValue: 'error' }],
            ],
          },
          combineOperation: {
            type: 'string',
            description: 'How to combine conditions',
            default: 'AND',
            examples: ['AND', 'OR'],
          },
        },
      },
      aiSelectionCriteria: {
        whenToUse: [
          'User mentions "if X then Y"',
          'Conditional logic needed',
          'Error checking',
          'Data validation branching',
        ],
        whenNotToUse: [
          'Multiple paths (use switch)',
          'Simple data flow',
        ],
        keywords: ['if', 'else', 'condition', 'when', 'check'],
        useCases: ['Conditional logic', 'Error handling', 'Validation'],
      },
      commonPatterns: [],
      validationRules: [],
    };
  }

  private createSwitchSchema(): NodeSchema {
    return {
      type: 'switch',
      label: 'Switch',
      category: 'logic',
      description: 'Multi-path conditional logic based on value matching',
      configSchema: {
        required: ['routingType', 'rules'],
        optional: {
          routingType: {
            type: 'string',
            description: 'Routing type',
            examples: ['expression', 'string', 'number'],
          },
          rules: {
            type: 'array',
            description: 'Routing rules',
          },
        },
      },
      aiSelectionCriteria: {
        whenToUse: [
          'Multiple conditional paths',
          'Route based on status codes',
          'Category-based processing',
        ],
        whenNotToUse: [
          'Simple if/else (use if node)',
        ],
        keywords: ['switch', 'route', 'multiple', 'paths'],
        useCases: ['Multi-path logic', 'Routing', 'Status handling'],
      },
      commonPatterns: [],
      validationRules: [],
    };
  }

  private createMergeSchema(): NodeSchema {
    return {
      type: 'merge',
      label: 'Merge',
      category: 'logic',
      description: 'Merge multiple branches of data',
      configSchema: {
        required: ['mode'],
        optional: {
          mode: {
            type: 'string',
            description: 'Merge mode',
            examples: ['append', 'join', 'passThrough', 'multiples'],
          },
          joinBy: {
            type: 'string',
            description: 'Field to join on (for join mode)',
          },
        },
      },
      aiSelectionCriteria: {
        whenToUse: [
          'Combine parallel processing results',
          'Aggregate data from multiple sources',
          'Join related data',
        ],
        whenNotToUse: [
          'Simple data flow',
        ],
        keywords: ['merge', 'combine', 'join', 'aggregate'],
        useCases: ['Combining results', 'Data aggregation', 'Parallel processing'],
      },
      commonPatterns: [],
      validationRules: [],
    };
  }

  // ============================================
  // ERROR HANDLING NODES
  // ============================================

  private createErrorHandlerSchema(): NodeSchema {
    return {
      type: 'error_handler',
      label: 'Error Handler',
      category: 'logic',
      description: 'Handle errors with retry logic and fallback values',
      configSchema: {
        required: [],
        optional: {
          continueOnFail: {
            type: 'boolean',
            description: 'Continue workflow after error',
            default: false,
          },
          retryOnFail: {
            type: 'boolean',
            description: 'Retry failed node',
            default: true,
          },
          maxRetries: {
            type: 'number',
            description: 'Maximum retry attempts',
            default: 3,
          },
          retryDelay: {
            type: 'number',
            description: 'Delay between retries (ms)',
            default: 5000,
          },
        },
      },
      aiSelectionCriteria: {
        whenToUse: [
          'External API calls present',
          'User mentions "reliable" or "error handling"',
          'Critical workflows',
        ],
        whenNotToUse: [
          'Simple workflows without external calls',
        ],
        keywords: ['error', 'retry', 'handle', 'fail', 'reliable'],
        useCases: ['API error handling', 'Retry logic', 'Graceful degradation'],
      },
      commonPatterns: [
        {
          name: 'api_retry',
          description: 'Retry API calls with exponential backoff',
          config: { retryOnFail: true, maxRetries: 3, retryDelay: 2000 },
        },
      ],
      validationRules: [],
    };
  }

  private createWaitNodeSchema(): NodeSchema {
    return {
      type: 'wait',
      label: 'Wait',
      category: 'logic',
      description: 'Pause workflow execution',
      configSchema: {
        required: ['duration'],
        optional: {
          duration: {
            type: 'number',
            description: 'Wait duration value',
            examples: [1000, 5000, 60000],
          },
          unit: {
            type: 'string',
            description: 'Duration unit',
            default: 'milliseconds',
            examples: ['milliseconds', 'seconds', 'minutes', 'hours'],
          },
        },
      },
      aiSelectionCriteria: {
        whenToUse: [
          'Rate limiting between API calls',
          'Waiting for external events',
          'Scheduled delays',
        ],
        whenNotToUse: [
          'Simple data flow',
        ],
        keywords: ['wait', 'delay', 'rate limit', 'pause'],
        useCases: ['Rate limiting', 'Delays', 'Polling intervals'],
      },
      commonPatterns: [],
      validationRules: [],
    };
  }

  // ============================================
  // OUTPUT NODES
  // ============================================

  private createSlackMessageSchema(): NodeSchema {
    return {
      type: 'slack_message',
      label: 'Slack',
      category: 'output',
      description: 'Send messages to Slack channels or users',
      // NodeResolver: Capability metadata
      capabilities: [
        'message.send',
        'slack.send',
        'notification.send',
      ],
      providers: ['slack'],
      keywords: ['slack', 'slack message', 'slack notification'],
      configSchema: {
        required: ['webhookUrl'],
        optional: {
          webhookUrl: {
            type: 'string',
            description: 'Slack incoming webhook URL',
            examples: ['https://hooks.slack.com/services/...'],
          },
          channel: {
            type: 'string',
            description: 'Slack channel or user ID',
            examples: ['#general', '@username', '{{$json.channel}}'],
          },
          message: {
            type: 'string',
            description: 'Message text to send to Slack',
          },
          blocks: {
            type: 'string',
            description: 'Slack blocks JSON (optional)',
            examples: ['[{"type":"section","text":{"type":"mrkdwn","text":"Hello"}}]'],
          },
          text: {
            type: 'string',
            description: 'Message text (alias for message)',
          },
          username: {
            type: 'string',
            description: 'Bot username',
          },
          iconEmoji: {
            type: 'string',
            description: 'Icon emoji',
          },
        },
      },
      aiSelectionCriteria: {
        whenToUse: [
          'User mentions Slack notifications',
          'Team communication needed',
          'Alert notifications',
        ],
        whenNotToUse: [
          'Other notification channels',
        ],
        keywords: ['slack', 'notification', 'message', 'alert'],
        useCases: ['Team notifications', 'Alerts', 'Reports'],
      },
      commonPatterns: [],
      validationRules: [],
      nodeCapability: {
        inputType: 'text', // Accepts text for email body/subject
        outputType: 'text', // Produces text confirmation
        acceptsArray: false,
        producesArray: false,
      },
    };
  }

  private createGoogleGmailSchema(): NodeSchema {
    return {
      type: 'google_gmail',
      label: 'Gmail',
      category: 'google',
      description: 'Send/receive emails via Gmail API (OAuth)',
      // NodeResolver: Capability metadata
      capabilities: [
        'email.send',
        'gmail.send',
        'google.mail',
        'email.read',
        'gmail.read',
      ],
      providers: ['google'],
      keywords: ['gmail', 'google mail', 'google email', 'gmail them', 'send via gmail', 'mail via gmail'],
      configSchema: {
        // `operation` is a runtime/system field with a default ('send') and should not
        // be surfaced as a missing user input. Treating it as required causes
        // "Missing Inputs: Gmail → operation" errors even when the UI has a default.
        // We therefore keep it optional with a default.
        // Required user inputs for the primary "send" use case.
        // (If operation is changed to list/get/search, these fields may be unused at runtime,
        // but we still want the UI to reliably ask for recipient/subject/body for workflows
        // that send email.)
        // ✅ Recipient strategy is required; actual `to` can be derived at runtime
        // from intent or upstream sheet data, or manually supplied via recipientEmails.
        // ✅ Systematic UI: keep base required minimal; enforce operation-specific requirements via `requiredIf`
        // so the UI shows only what matters for the selected operation.
        // ✅ CORE FIX: recipientSource removed from required — it is a UI hint, NOT an
        // execution prerequisite. The recipient-resolver already handles all resolution
        // strategies (manual, upstream, intent) at runtime. Making it required caused
        // the placeholder filter to strip the empty-string value, which then failed
        // validation and blocked Gmail execution for every AI-generated workflow.
        required: [],
        optional: {
          credentialId: {
            type: 'string',
            description: 'Stored credential reference (optional; OAuth handled via Connections)',
            examples: ['cred_123'],
          },
          operation: {
            type: 'string',
            description: 'Gmail operation type',
            default: 'send',
            examples: ['send', 'list', 'get', 'search'],
            // ✅ CRITICAL: operation is NOT a user-configurable input (set by AI during generation)
            // It's a runtime field, not an input field
          },
          // ✅ CRITICAL: Gmail send node configurable inputs (for attach-inputs endpoint):
          // Recipient selection is now strategy-based:
          // - recipientSource: how recipients are determined
          // - recipientEmails: manual recipients (comma-separated)
          // - to: optional explicit single recipient (advanced / backward compatible)
          // OAuth handled separately via attach-credentials
          recipientSource: {
            type: 'string',
            description: 'How should recipient email(s) be determined?',
            examples: ['manual_entry', 'extract_from_sheet'],
            // UI hint: render as select/radio-style choice
            options: [
              { label: 'Manually enter recipient email(s)', value: 'manual_entry' },
              { label: 'Extract recipient email(s) from Google Sheets output', value: 'extract_from_sheet' },
            ],
          },
          recipientEmails: {
            type: 'string',
            description:
              'Recipient email address(es) for manual entry. Supports comma-separated list (e.g., "a@x.com, b@y.com"). Required if recipientSource is manual_entry.',
            examples: ['john@example.com', 'john@example.com, jane@example.com'],
            // Generic conditional-required contract (handled by input discovery layer)
            requiredIf: { field: 'recipientSource', equals: 'manual_entry' },
          },
          to: {
            type: 'string',
            description: 'Recipient email address (optional). If omitted, the system resolves recipients using recipientSource/intent/upstream data.',
            examples: ['recipient@example.com', '{{$json.email}}'],
            // ✅ This is a configurable input field
          },
          subject: {
            type: 'string',
            description: 'Email subject (required for send operation)',
            examples: ['Hello', '{{$json.subject}}'],
            // ✅ This is a configurable input field
            requiredIf: { field: 'operation', equals: 'send' },
          },
          body: {
            type: 'string',
            description: 'Email body content (required for send operation)',
            examples: ['Email content', '{{$json.message}}'],
            // ✅ This is a configurable input field
            requiredIf: { field: 'operation', equals: 'send' },
          },
          // ✅ CRITICAL: from is NOT a configurable input - OAuth account is used
          from: {
            type: 'string',
            description: 'Sender email address (optional - uses OAuth account if not provided)',
            examples: ['your-email@gmail.com'],
            // ✅ This is a runtime field, NOT a configurable input
            // OAuth credentials handled separately
          },
          // ✅ CRITICAL: messageId, query, maxResults are runtime fields, NOT configurable inputs
          messageId: {
            type: 'string',
            description: 'Gmail message ID (required ONLY for get operation, not for send)',
            examples: ['abc123def456'],
            // ✅ This is a runtime field, NOT a configurable input
            requiredIf: { field: 'operation', equals: 'get' },
          },
          query: {
            type: 'string',
            description: 'Gmail search query (for list/search operations)',
            examples: ['from:example@gmail.com', 'subject:important'],
            // ✅ This is a runtime field, NOT a configurable input
            requiredIf: { field: 'operation', equals: 'search' },
          },
          maxResults: {
            type: 'number',
            description: 'Maximum number of results (for list/search)',
            default: 10,
            // ✅ This is a runtime field, NOT a configurable input
          },
        },
      },
      aiSelectionCriteria: {
        whenToUse: [
          'User mentions Gmail specifically',
          'User says "gmail them" or "send via gmail"',
          'User mentions "email" or "send email" (Gmail context)',
          'Google Workspace email integration needed',
          'OAuth-based email sending required',
          'Email sending, reading, or searching needed',
        ],
        whenNotToUse: [
          'Generic email sending (use email node with SMTP)',
          'Other email providers',
        ],
        keywords: ['gmail', 'google mail', 'google email', 'gmail them', 'send via gmail', 'email via gmail', 'mail via gmail', 'email', 'send email', 'mail'],
        useCases: ['Gmail notifications', 'Google Workspace integration', 'OAuth email sending', 'Email reading', 'Email searching'],
      },
      commonPatterns: [
        {
          name: 'send_email',
          description: 'Send email via Gmail',
          config: {
            operation: 'send',
            to: '{{$json.email}}',
            subject: '{{$json.subject}}',
            body: '{{$json.message}}',
          },
        },
        {
          name: 'list_messages',
          description: 'List Gmail messages',
          config: {
            operation: 'list',
            query: 'is:unread',
            maxResults: 10,
          },
        },
      ],
      validationRules: [
        {
          field: 'operation',
          validator: (value) => ['send', 'list', 'get', 'search'].includes(value),
          errorMessage: 'Operation must be one of: send, list, get, search',
        },
        {
          field: 'to',
          validator: (value: any) => {
            // Note: config is not available in validator signature, but we can check value directly
            // For email nodes, 'to' field should be validated based on the node's operation
            // This is a simplified validation - full validation should check operation in node config
            if (typeof value === 'string' && value.length > 0) {
              return true;
            }
            // Allow empty if operation is not 'send' (will be validated elsewhere)
            return true;
          },
          errorMessage: 'Recipient email (to) is required for send operation',
        },
      ],
      nodeCapability: {
        inputType: 'text', // Accepts text for email body/subject
        outputType: 'text', // Produces text confirmation
        acceptsArray: false,
        producesArray: false,
      },
    };
  }

  // ❌ REMOVED: createGmailSchema() - duplicate of google_gmail
  // Use google_gmail node instead, which supports all Gmail operations (send, list, get, search)
  // The resolver maps 'gmail' → 'google_gmail' automatically

  private createEmailSchema(): NodeSchema {
    return {
      type: 'email',
      label: 'Email',
      category: 'output',
      description: 'Send emails via SMTP',
      // NodeResolver: Capability metadata (generic email, not Gmail)
      capabilities: [
        'email.send',
        'smtp.send',
      ],
      providers: ['smtp'],
      keywords: ['email', 'mail', 'smtp'],
      configSchema: {
        required: ['to', 'subject', 'text'],
        optional: {
          to: {
            type: 'string',
            description: 'Recipient email address',
          },
          subject: {
            type: 'string',
            description: 'Email subject',
          },
          text: {
            type: 'string',
            description: 'Email body (text)',
          },
          html: {
            type: 'string',
            description: 'Email body (HTML)',
          },
        },
      },
      aiSelectionCriteria: {
        whenToUse: [
          'User mentions email notifications',
          'Email communication needed',
        ],
        whenNotToUse: [
          'Other notification channels',
        ],
        keywords: ['email', 'mail', 'send', 'notify'],
        useCases: ['Email notifications', 'Reports', 'Alerts'],
      },
      commonPatterns: [],
      validationRules: [],
    };
  }

  private createLogOutputSchema(): NodeSchema {
    return {
      type: 'log_output',
      label: 'Log Output',
      category: 'output',
      description: 'Log data to console or file',
      configSchema: {
        required: [],
        optional: {
          level: {
            type: 'string',
            description: 'Log level',
            default: 'info',
            examples: ['info', 'warn', 'error', 'debug'],
          },
          message: {
            type: 'string',
            description: 'Log message',
          },
        },
      },
      aiSelectionCriteria: {
        whenToUse: [
          'Debugging needed',
          'Audit logging',
          'Monitoring',
        ],
        whenNotToUse: [
          'Production workflows without logging needs',
        ],
        keywords: ['log', 'debug', 'audit', 'monitor'],
        useCases: ['Debugging', 'Audit trails', 'Monitoring'],
      },
      commonPatterns: [],
      validationRules: [],
    };
  }

  /**
   * Telegram Node Schema
   * Matches frontend nodeTypes.ts `type: 'telegram'`
   */
  private createOutlookSchema(): NodeSchema {
    return {
      type: 'outlook',
      label: 'Outlook',
      category: 'microsoft',
      description: 'Send/receive emails via Microsoft Outlook API (OAuth)',
      capabilities: [
        'email.send',
        'outlook.send',
        'microsoft.mail',
        'email.read',
        'outlook.read',
      ],
      providers: ['microsoft'],
      keywords: ['outlook', 'microsoft outlook', 'outlook email', 'send via outlook'],
      configSchema: {
        required: [],
        optional: {
          operation: {
            type: 'string',
            description: 'Outlook operation type',
            default: 'send',
            examples: ['send', 'list', 'get', 'search'],
          },
          to: {
            type: 'string',
            description: 'Recipient email address (required for send operation)',
            examples: ['recipient@example.com', '{{$json.email}}'],
          },
          subject: {
            type: 'string',
            description: 'Email subject (required for send operation)',
            examples: ['Hello', '{{$json.subject}}'],
          },
          body: {
            type: 'string',
            description: 'Email body content (required for send operation)',
            examples: ['Email content', '{{$json.message}}'],
          },
          from: {
            type: 'string',
            description: 'Sender email address (optional - uses OAuth account if not provided)',
            examples: ['your-email@outlook.com'],
          },
          // Credential fields (for credential discovery and injection)
          accessToken: {
            type: 'string',
            description: 'OAuth2 Access Token for Outlook (if using OAuth authentication)',
            examples: ['your-outlook-oauth-token'],
          },
          credentialId: {
            type: 'string',
            description: 'ID of the stored credential to use',
            examples: ['microsoft_oauth_123'],
          },
          messageId: {
            type: 'string',
            description: 'Outlook message ID (required for get operation)',
            examples: ['abc123def456'],
          },
          query: {
            type: 'string',
            description: 'Outlook search query (for list/search operations)',
            examples: ['from:example@outlook.com', 'subject:important'],
          },
          maxResults: {
            type: 'number',
            description: 'Maximum number of results (for list/search)',
            default: 10,
          },
        },
      },
      aiSelectionCriteria: {
        whenToUse: [
          'User mentions Outlook email',
          'Microsoft email integration needed',
          'Send emails via Outlook',
        ],
        whenNotToUse: [
          'Gmail integration (use google_gmail)',
          'Other email providers',
        ],
        keywords: ['outlook', 'microsoft outlook', 'outlook email'],
        useCases: ['Outlook email sending', 'Microsoft email integration'],
      },
      commonPatterns: [],
      validationRules: [],
    };
  }

  private createTelegramSchema(): NodeSchema {
    return {
      type: 'telegram',
      label: 'Telegram',
      category: 'output',
      description: 'Send messages to Telegram chats using Telegram Bot API',
      configSchema: {
        // Only user-facing config fields that should block execution when missing
        required: ['chatId', 'messageType'],
        optional: {
          // NOTE: botToken is treated as a credential field and should be supplied
          // via credentials/connector, not as a normal config input.
          botToken: {
            type: 'string',
            description: 'Telegram Bot Token (stored as credential, not user input at runtime)',
          },
          credentialId: {
            type: 'string',
            description: 'Stored credential reference for Telegram bot token',
            examples: ['cred_123'],
          },
          chatId: {
            type: 'string',
            description: 'Target chat or channel ID (numeric, can be negative for channels)',
            examples: ['123456789', '-1009876543210', '{{$json.chatId}}'],
          },
          messageType: {
            type: 'string',
            description: 'Telegram message type',
            examples: ['text', 'photo', 'video', 'document', 'audio', 'animation', 'location', 'poll'],
            default: 'text',
          },
          message: {
            type: 'string',
            description: 'Message text (required when messageType is "text")',
          },
          parseMode: {
            type: 'string',
            description: 'Text formatting mode: none, HTML, Markdown, MarkdownV2',
            default: 'HTML',
          },
          disableWebPagePreview: {
            type: 'boolean',
            description: 'Disable automatic link previews',
            default: false,
          },
          mediaUrl: {
            type: 'string',
            description: 'Media URL for photo/video/document/audio/animation message types',
          },
          caption: {
            type: 'string',
            description: 'Caption for media messages',
          },
          replyToMessageId: {
            type: 'number',
            description: 'Message ID to reply to',
          },
          replyMarkup: {
            type: 'object',
            description: 'Reply markup JSON (inline keyboard, reply keyboard, etc.)',
          },
          disableNotification: {
            type: 'boolean',
            description: 'Send message silently without notification',
            default: false,
          },
          protectContent: {
            type: 'boolean',
            description: 'Protect content from being forwarded or saved',
            default: false,
          },
          allowSendingWithoutReply: {
            type: 'boolean',
            description: 'Allow sending even if replied-to message is missing',
            default: false,
          },
        },
      },
      aiSelectionCriteria: {
        whenToUse: [
          'User mentions Telegram notifications',
          'Chat-based notifications in Telegram',
          'Bot-like outbound messages to Telegram',
        ],
        whenNotToUse: [
          'Slack notifications (use slack_message)',
          'Email notifications (use email/google_gmail)',
        ],
        keywords: ['telegram', 'telegram bot', 'telegram message'],
        useCases: ['Alerts to Telegram channel', 'Bot notifications', 'Status updates'],
      },
      commonPatterns: [
        {
          name: 'send_text_message',
          description: 'Send a simple text message to a Telegram chat',
          config: {
            messageType: 'text',
            message: '{{$json.message}}',
          },
        },
      ],
      validationRules: [
        {
          field: 'chatId',
          validator: (value: any) => typeof value === 'string' && value.length > 0,
          errorMessage: 'Telegram chatId is required',
        },
        {
          field: 'messageType',
          validator: (value: any) =>
            ['text', 'photo', 'video', 'document', 'audio', 'animation', 'location', 'poll'].includes(value),
          errorMessage:
            'Telegram messageType must be one of: text, photo, video, document, audio, animation, location, poll',
        },
      ],
      // Capability metadata for connector resolution
      capabilities: ['notification.send', 'telegram.send', 'message.send'],
      providers: ['telegram'],
      keywords: ['telegram', 'telegram message', 'telegram bot'],
    };
  }

  private createSalesforceSchema(): NodeSchema {
    return {
      type: 'salesforce',
      label: 'Salesforce',
      category: 'crm',
      description: 'Work with Salesforce objects (Account, Contact, Lead, Opportunity, etc.) using REST/SOQL/SOSL',
      configSchema: {
        // Only core operation/object fields should be treated as required config inputs.
        // Credentials (accessToken) and instanceUrl are provided via connector/credentials layer.
        required: ['resource', 'operation'],
        optional: {
          // Credential / environment fields (should be treated as credential/runtime, not user prompts):
          instanceUrl: {
            type: 'string',
            description: 'Salesforce instance URL (e.g., https://yourinstance.my.salesforce.com)',
          },
          accessToken: {
            type: 'string',
            description: 'OAuth2 access token for Salesforce (stored as credential)',
          },
          resource: {
            type: 'string',
            description: 'Salesforce object type (sObject), e.g. Account, Contact, Lead',
            examples: ['Account', 'Contact', 'Lead', 'Opportunity', 'Case', 'Campaign', 'Product2'],
          },
          customObject: {
            type: 'string',
            description: 'Custom object API name (ends with __c) when resource is custom',
            examples: ['CustomObject__c', 'Invoice__c'],
          },
          operation: {
            type: 'string',
            description:
              'Salesforce operation: query (SOQL), search (SOSL), get, create, update, delete, upsert, bulk*',
            examples: [
              'query',
              'search',
              'get',
              'create',
              'update',
              'delete',
              'upsert',
              'bulkCreate',
              'bulkUpdate',
              'bulkDelete',
              'bulkUpsert',
            ],
            default: 'query',
          },
          soql: {
            type: 'string',
            description: 'SOQL query (required for query operation)',
            examples: ['SELECT Id, Name, Email FROM Contact LIMIT 10'],
          },
          sosl: {
            type: 'string',
            description: 'SOSL search query (required for search operation)',
            examples: [
              'FIND {test@example.com} IN EMAIL FIELDS RETURNING Contact(Id, Name)',
            ],
          },
          id: {
            type: 'string',
            description: 'Record Id (required for get, update, delete operations)',
            examples: ['003xx000004TmiQAAS'],
          },
          externalIdField: {
            type: 'string',
            description: 'External ID field API name (required for upsert operation)',
            examples: ['CustomId__c'],
          },
          externalIdValue: {
            type: 'string',
            description: 'External ID value (required for upsert operation)',
            examples: ['EXT-12345'],
          },
          fields: {
            type: 'object',
            description: 'Field map for create/update operations',
            examples: [
              { LastName: 'Doe', Email: 'test@example.com' },
            ],
          },
          records: {
            type: 'array',
            description: 'Array of records for bulk operations',
            examples: [
              [
                { LastName: 'Doe', Email: 'test1@example.com' },
                { LastName: 'Smith', Email: 'test2@example.com' },
              ],
            ],
          },
        },
      },
      aiSelectionCriteria: {
        whenToUse: [
          'User mentions Salesforce explicitly',
          'CRM workflows involving Accounts, Contacts, Leads, or Opportunities',
          'Syncing data between Salesforce and other systems',
        ],
        whenNotToUse: [
          'Non-Salesforce CRMs (use HubSpot/Zoho/etc.)',
          'Simple spreadsheets (use Google Sheets)',
        ],
        keywords: ['salesforce', 'sf', 'sobject', 'account', 'contact', 'lead', 'opportunity'], // Removed 'crm' - use sample workflows instead
        useCases: [
          'Create/update Salesforce contacts or leads from form submissions',
          'Query Salesforce data and use it downstream',
          'Sync deals or opportunities from other systems',
        ],
      },
      commonPatterns: [
        {
          name: 'query_contacts',
          description: 'Query contacts from Salesforce using SOQL',
          config: {
            resource: 'Contact',
            operation: 'query',
            soql: 'SELECT Id, Name, Email FROM Contact LIMIT 10',
          },
        },
        {
          name: 'create_contact',
          description: 'Create a new Salesforce Contact from workflow input',
          config: {
            resource: 'Contact',
            operation: 'create',
            fields: {
              LastName: '{{$json.lastName}}',
              Email: '{{$json.email}}',
            },
          },
        },
      ],
      validationRules: [
        {
          field: 'operation',
          validator: (value: any) =>
            [
              'query',
              'search',
              'get',
              'create',
              'update',
              'delete',
              'upsert',
              'bulkCreate',
              'bulkUpdate',
              'bulkDelete',
              'bulkUpsert',
            ].includes(value),
          errorMessage:
            'Salesforce operation must be one of: query, search, get, create, update, delete, upsert, bulkCreate, bulkUpdate, bulkDelete, bulkUpsert',
        },
        {
          field: 'resource',
          validator: (value: any) => typeof value === 'string' && value.length > 0,
          errorMessage: 'Salesforce resource (sObject type) is required',
        },
      ],
      // Capability metadata for connector resolution
      capabilities: ['crm.read', 'crm.write', 'salesforce.crm'],
      providers: ['salesforce'],
      keywords: ['salesforce', 'sf', 'salesforce contact', 'salesforce opportunity'], // Removed 'crm' - use sample workflows instead
    };
  }

  // ============================================
  // AI NODES
  // ============================================

  private createAiAgentSchema(): NodeSchema {
    return {
      type: 'ai_agent',
      label: 'AI Agent',
      category: 'ai',
      description: 'Autonomous AI agent with memory, tools, and reasoning capabilities',
      configSchema: {
        required: ['userInput', 'chat_model'],
        optional: {
          userInput: {
            type: 'string',
            description: 'User input or prompt for the AI agent',
            examples: ['Process this data', '{{inputData}}', 'Answer this question'],
          },
          chat_model: {
            type: 'object',
            description: 'Chat model configuration (must connect Chat Model node)',
          },
          memory: {
            type: 'object',
            description: 'Memory configuration (optional, connect Memory node)',
          },
          tool: {
            type: 'object',
            description: 'Tool configuration (optional, connect Tool node)',
          },
        },
      },
      aiSelectionCriteria: {
        whenToUse: [
          'Chatbot or conversational AI needed',
          'Natural language processing required',
          'AI reasoning or decision making',
          'Content generation with context',
          'Complex AI interactions',
          'AI agent with memory and tools',
        ],
        whenNotToUse: [
          'Simple AI text processing (use ai_service)',
          'Direct AI model calls (use ai_chat_model or ai_service)',
          'Simple data transformation',
          'Basic calculations',
          'No AI capabilities needed',
        ],
        keywords: ['ai agent', 'chatbot', 'chat bot', 'conversational ai', 'ai assistant', 'ai reasoning', 'natural language', 'agent'],
        useCases: ['Chatbots', 'AI assistants', 'Conversational interfaces', 'AI-powered workflows', 'AI agents with memory'],
      },
      commonPatterns: [],
      validationRules: [],
    };
  }

  private createAiChatModelSchema(): NodeSchema {
    return {
      type: 'ai_chat_model',
      label: 'AI Chat Model',
      category: 'ai',
      description: 'Call a chat model directly to generate a response (Ollama by default)',
      configSchema: {
        required: ['prompt'],
        optional: {
          provider: {
            type: 'string',
            description: 'LLM provider (ollama, openai, claude, gemini)',
            default: 'ollama',
            examples: ['ollama', 'openai', 'claude', 'gemini'],
          },
          model: {
            type: 'string',
            description: 'Model name (AWS Production Models)',
            default: 'qwen2.5:14b-instruct-q4_K_M',
            examples: [
              'qwen2.5:14b-instruct-q4_K_M',
              'qwen2.5:7b-instruct-q4_K_M',
              'qwen2.5-coder:7b-instruct-q4_K_M',
              'ctrlchecks-workflow-builder',
            ],
          },
          temperature: {
            type: 'number',
            description: 'Creativity (0.0 - 1.0)',
            default: 0.7,
            examples: [0.2, 0.7, 1.0],
          },
          prompt: {
            type: 'string',
            description: 'User prompt to send to the model',
            examples: ['{{$json.prompt}}', 'Summarize the following text: {{$json.text}}'],
          },
          systemPrompt: {
            type: 'string',
            description: 'System prompt (optional)',
            examples: ['You are a helpful assistant.'],
          },
          responseFormat: {
            type: 'string',
            description: 'Preferred response format',
            default: 'text',
            examples: ['text', 'json', 'markdown'],
          },
        },
      },
      aiSelectionCriteria: {
        whenToUse: [
          'User wants an AI model call',
          'Need to summarize/analyze/generate text directly',
        ],
        whenNotToUse: [
          'AI Agent workflows (use ai_agent + chat_model)',
        ],
        keywords: ['ai', 'chat model', 'llm', 'ollama', 'openai', 'claude', 'gemini'],
        useCases: ['Summarization', 'Classification', 'Text generation'],
      },
      commonPatterns: [],
      validationRules: [],
    };
  }

  private createAiServiceSchema(): NodeSchema {
    return {
      type: 'ai_service',
      label: 'AI Service',
      category: 'ai',
      description: 'Generic AI service for text processing, summarization, and data analysis',
      capabilities: [
        'ai.process',
        'ai.summarize',
        'ai.analyze',
        'text.process',
        'data.analyze',
      ],
      providers: ['ollama', 'openai', 'anthropic', 'google'],
      keywords: ['ai service', 'ai processing', 'ai analysis', 'text processing', 'summarize', 'analyze'],
      configSchema: {
        // ✅ CRITICAL: Required fields for question generation
        // prompt is required (inputData is optional alternative, validated in validationRules)
        required: ['prompt', 'maxTokens'],
        optional: {
          prompt: {
            type: 'string',
            description: 'Prompt or instruction for the AI service (required, or use inputData instead)',
            examples: ['Summarize this text', 'Analyze the following data', '{{$json.prompt}}'],
          },
          inputData: {
            type: 'string',
            description: 'Input data to process (alternative to prompt - either prompt or inputData is required)',
            examples: ['{{$json.data}}', '{{$json.text}}', '{{$json.content}}'],
          },
          serviceType: {
            type: 'string',
            description: 'Type of AI service operation',
            default: 'summarize',
            examples: ['summarize', 'analyze', 'extract', 'classify', 'translate'],
          },
          provider: {
            type: 'string',
            description: 'AI provider (ollama, openai, claude, gemini)',
            default: 'ollama',
            examples: ['ollama', 'openai', 'claude', 'gemini'],
          },
          model: {
            type: 'string',
            description: 'Model name (uses provider default if not specified)',
            default: '', // Will use provider default
            examples: ['qwen2.5:14b-instruct-q4_K_M', 'gpt-4', 'claude-3-opus'],
          },
          temperature: {
            type: 'number',
            description: 'Creativity/randomness (0.0 - 1.0)',
            default: 0.7,
            examples: [0.2, 0.7, 1.0],
          },
          maxTokens: {
            type: 'number',
            description: 'Maximum tokens in response',
            default: 500,
            examples: [500, 1000, 2000],
          },
          outputFormat: {
            type: 'string',
            description: 'Output format',
            default: 'text',
            examples: ['text', 'json', 'markdown'],
          },
        },
      },
      // ✅ CRITICAL: Define input/output types for workflow execution
      outputType: 'text',
      outputSchema: {
        output: {
          type: 'string',
          description: 'AI-generated text response',
        },
        text: {
          type: 'string',
          description: 'AI-generated text (alias for output)',
        },
        response: {
          type: 'string',
          description: 'Complete AI response',
        },
      },
      aiSelectionCriteria: {
        whenToUse: [
          'User needs AI text processing',
          'User mentions "ai", "llm", "openai", "summarize", "analyze"',
          'Summarization or analysis required',
          'Data extraction or classification needed',
          'Generic AI service call',
          'Text processing with AI',
        ],
        whenNotToUse: [
          'Complex AI agent workflows (use ai_agent)',
          'Direct chat model calls (use ai_chat_model)',
          'Simple data transformation (use javascript)',
        ],
        keywords: ['ai service', 'ai processing', 'ai', 'llm', 'openai', 'summarize', 'analyze', 'extract', 'classify', 'ai text', 'ai model'],
        useCases: ['Text summarization', 'Data analysis', 'Content extraction', 'Classification', 'Translation', 'AI text processing'],
      },
      commonPatterns: [
        {
          name: 'summarize_text',
          description: 'Summarize input text',
          config: {
            prompt: 'Summarize the following text',
            inputData: '{{$json.text}}',
            serviceType: 'summarize',
          },
        },
        {
          name: 'analyze_data',
          description: 'Analyze structured data',
          config: {
            prompt: 'Analyze the following data and provide insights',
            inputData: '{{$json.data}}',
            serviceType: 'analyze',
          },
        },
      ],
      validationRules: [
        {
          field: 'prompt',
          validator: (value: any, config?: any) => {
            // Either prompt or inputData must be provided
            if (!value && (!config || !config.inputData)) {
              return 'Either prompt or inputData is required';
            }
            return true;
          },
          errorMessage: 'Either prompt or inputData is required',
        },
        {
          field: 'inputData',
          validator: (value: any, config?: any) => {
            // Either prompt or inputData must be provided
            if (!value && (!config || !config.prompt)) {
              return 'Either prompt or inputData is required';
            }
            return true;
          },
          errorMessage: 'Either prompt or inputData is required',
        },
        {
          field: 'serviceType',
          validator: (value: any) => {
            const validTypes = ['summarize', 'analyze', 'extract', 'classify', 'translate'];
            return !value || validTypes.includes(value);
          },
          errorMessage: 'serviceType must be one of: summarize, analyze, extract, classify, translate',
        },
        {
          field: 'maxTokens',
          validator: (value: any) => {
            if (value === undefined || value === null) {
              return true; // Default will be applied (500)
            }
            if (typeof value !== 'number' || value < 1 || value > 100000) {
              return 'maxTokens must be a number between 1 and 100000';
            }
            return true;
          },
          errorMessage: 'maxTokens must be a number between 1 and 100000',
        },
      ],
    };
  }

  private createClickUpSchema(): NodeSchema {
    return {
      type: 'clickup',
      label: 'ClickUp',
      category: 'actions',
      description: 'Create, read, and manage ClickUp tasks, lists, spaces, and workspaces.',
      configSchema: {
        // Core engine only enforces operation as required; more specific
        // requirements (listId, taskId, etc.) are handled in the ClickUp UI
        // and node-specific runtime executor.
        required: ['operation'],
        optional: {
          apiKey: {
            type: 'string',
            description: 'ClickUp API key (required for authentication)',
            examples: ['pk_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'],
          },
          credentialId: {
            type: 'string',
            description: 'Credential ID reference to stored ClickUp credentials',
            examples: ['cred_123'],
          },
          operation: {
            type: 'string',
            description:
              'High-level ClickUp operation to perform (e.g. create_task, get_tasks_list, get_tasks_space).',
            examples: ['create_task', 'get_tasks_list', 'get_tasks_space'],
          },
          workspaceId: {
            type: 'string',
            description:
              'ClickUp workspace (team) ID. Required for some workspace-scoped operations such as listing tasks across a space or team.',
            examples: ['9012345678'],
          },
          spaceId: {
            type: 'string',
            description:
              'ClickUp space ID. Used when operating on tasks scoped to a space (for example, get_tasks_space).',
            examples: ['9012345678'],
          },
          listId: {
            type: 'string',
            description:
              'ClickUp list ID. Required for list-scoped operations such as create_task or get_tasks_list.',
            examples: ['9012345678'],
          },
          taskId: {
            type: 'string',
            description:
              'ClickUp task ID. Used when updating, deleting, or fetching a single task (or related entities like comments or time tracking).',
            examples: ['abc123'],
          },
          taskName: {
            type: 'string',
            description:
              'Name/title for a task when creating it (maps to ClickUp task name).',
            examples: ['Follow up with customer', 'Prepare weekly report'],
          },
          taskDescription: {
            type: 'string',
            description:
              'Optional detailed markdown description for a task when creating or updating it.',
            examples: ['### Details\n- Action item 1\n- Action item 2'],
          },
        },
      },
      aiSelectionCriteria: {
        whenToUse: [
          'User mentions ClickUp tasks, lists, spaces, or workspaces.',
          'Workflow should create or update tasks in ClickUp.',
          'User wants to sync data into or out of ClickUp.',
        ],
        whenNotToUse: [
          'Project management must happen in a different tool (e.g. Jira, Asana).',
          'No ClickUp workspace or API access is available.',
        ],
        keywords: ['clickup', 'tasks', 'project management', 'workspace', 'space', 'list'],
        useCases: [
          'Create a ClickUp task whenever a form is submitted.',
          'Sync CRM events into ClickUp task lists.',
          'List or filter ClickUp tasks and send notifications.',
        ],
      },
      commonPatterns: [
        {
          name: 'create_task_from_form',
          description: 'Create a ClickUp task from a submitted form or webhook payload.',
          config: {
            operation: 'create_task',
          },
        },
        {
          name: 'list_tasks_in_list',
          description: 'Retrieve tasks from a specific ClickUp list.',
          config: {
            operation: 'get_tasks_list',
          },
        },
        {
          name: 'list_tasks_in_space',
          description: 'Retrieve tasks across a ClickUp space.',
          config: {
            operation: 'get_tasks_space',
          },
        },
      ],
      validationRules: [
        {
          field: 'operation',
          validator: (value) =>
            typeof value === 'string' &&
            ['create_task', 'get_tasks_list', 'get_tasks_space'].includes(value),
          errorMessage:
            'Operation must be one of: create_task, get_tasks_list, get_tasks_space.',
        },
      ],
    };
  }

  private createChatTriggerSchema(): NodeSchema {
    return {
      type: 'chat_trigger',
      label: 'Chat Trigger',
      category: 'triggers',
      description: 'Trigger workflow from chat/AI interactions',
      configSchema: {
        required: [],
        optional: {
          channel: {
            type: 'string',
            description: 'Optional channel/context to filter incoming chat events',
            examples: ['#support', '@username', '{{$json.channel}}'],
          },
          allowedSenders: {
            type: 'array',
            description: 'Optional allowlist of senders/usernames/IDs',
            examples: [['user1', 'user2']],
          },
          message: {
            type: 'string',
            description: 'Incoming chat message',
          },
        },
      },
      aiSelectionCriteria: {
        whenToUse: [
          'Chatbot workflow',
          'Conversational AI',
          'User wants chat-based interaction',
          'AI assistant workflow',
        ],
        whenNotToUse: [
          'Non-chat workflows',
          'API-based triggers',
          'Form submissions',
        ],
        keywords: ['chat', 'chatbot', 'conversation', 'ai chat', 'chat trigger', 'conversational'],
        useCases: ['Chatbots', 'AI assistants', 'Conversational workflows'],
      },
      commonPatterns: [],
      validationRules: [],
    };
  }

  // ============================================
  // SOCIAL MEDIA NODES
  // ============================================

  private createLinkedInSchema(): NodeSchema {
    return {
      type: 'linkedin',
      label: 'LinkedIn',
      category: 'social',
      description: 'Post content to LinkedIn, manage LinkedIn profile and company pages',
      configSchema: {
        // NOTE: We intentionally do NOT require `text` here because media-only
        // posts are allowed when a mediaUrl is provided. Runtime validation in
        // the LinkedIn node ensures that at least text or media is present.
        required: [],
        optional: {
          operation: {
            type: 'string',
            description: 'LinkedIn operation to perform (UI uses create_post, create_post_media, etc.)',
            default: 'create_post',
            examples: [
              'create_post',
              'create_post_media',
              'create_article',
              'get_posts',
              'delete_post',
              '{{$json.operation}}',
            ],
          },
          text: {
            type: 'string',
            description: 'Post content text',
            examples: ['{{$json.text}}', 'Tech update: {{$json.title}}'],
          },
          mediaUrl: {
            type: 'string',
            description: 'Public HTTPS URL to an image or video to attach to the post (required for create_post_media)',
            examples: ['https://cdn.example.com/image.jpg', '{{$json.mediaUrl}}'],
          },
          visibility: {
            type: 'string',
            description: 'Post visibility',
            default: 'PUBLIC',
            examples: ['PUBLIC', 'CONNECTIONS'],
          },
          personUrn: {
            type: 'string',
            description: 'LinkedIn Person URN (without urn:li:person: prefix) for the posting member',
            examples: ['abc123def456', '{{$json.personUrn}}'],
          },
          dryRun: {
            type: 'boolean',
            description: 'If true, validate configuration and return a simulated request without calling LinkedIn',
            default: false,
          },
          richText: {
            type: 'string',
            description: 'Optional rich-text/HTML content stub for future media/rich posts (not yet sent to LinkedIn)',
          },
          media: {
            type: 'object',
            description: 'Optional media configuration stub (images/videos). Reserved for future LinkedIn media support.',
          },
        },
      },
      aiSelectionCriteria: {
        whenToUse: [
          'User mentions LinkedIn posting',
          'Social media automation for LinkedIn',
          'Professional content sharing',
        ],
        whenNotToUse: [
          'Other social media platforms',
        ],
        keywords: ['linkedin', 'linked in', 'linked-in', 'li', 'professional network', 'post to linkedin', 'linkedin post', 'post on linkedin', 'share on linkedin'],
        useCases: ['LinkedIn posts', 'Professional updates', 'Content sharing'],
      },
      commonPatterns: [
        {
          name: 'daily_post',
          description: 'Post daily content to LinkedIn',
          config: { text: '{{$json.content}}', visibility: 'PUBLIC' },
        },
      ],
      validationRules: [
        {
          field: 'visibility',
          validator: (value) => !value || value === 'PUBLIC' || value === 'CONNECTIONS',
          errorMessage: 'LinkedIn visibility must be PUBLIC or CONNECTIONS',
        },
      ],
    };
  }

  private createTwitterSchema(): NodeSchema {
    return {
      type: 'twitter',
      label: 'Twitter/X',
      category: 'social',
      description: 'Post tweets, manage Twitter account',
      configSchema: {
        required: ['resource', 'operation'],
        optional: {
          resource: {
            type: 'string',
            description: 'Twitter resource',
            examples: ['tweet', 'user', 'search'],
            default: 'tweet',
          },
          operation: {
            type: 'string',
            description: 'Twitter operation',
            examples: ['create', 'delete', 'get', 'searchRecent'],
            default: 'create',
          },
          text: {
            type: 'string',
            description: 'Tweet text (max 280 characters)',
            examples: ['{{$json.tweet}}', 'Update: {{$json.message}}'],
          },
          tweetId: {
            type: 'string',
            description: 'Tweet ID (for get/delete/like/etc.)',
          },
          query: {
            type: 'string',
            description: 'Search query (for search operations)',
          },
          // Credential fields (for credential discovery and injection)
          accessToken: {
            type: 'string',
            description: 'OAuth2 Access Token for Twitter (if using OAuth authentication)',
            examples: ['your-twitter-oauth-token'],
          },
          credentialId: {
            type: 'string',
            description: 'ID of the stored credential to use',
            examples: ['twitter_oauth_123'],
          },
        },
      },
      aiSelectionCriteria: {
        whenToUse: [
          'User mentions Twitter/X posting',
          'Social media automation for Twitter',
          'Tweet sharing',
        ],
        whenNotToUse: [
          'Other social media platforms',
        ],
        keywords: ['twitter', 'tweet', 'x.com', 'post to twitter'],
        useCases: ['Twitter posts', 'Tweet sharing', 'Social updates'],
      },
      commonPatterns: [],
      validationRules: [],
    };
  }

  private createInstagramSchema(): NodeSchema {
    return {
      type: 'instagram',
      label: 'Instagram',
      category: 'social',
      description: 'Post content to Instagram',
      configSchema: {
        required: ['resource', 'operation'],
        optional: {
          resource: {
            type: 'string',
            description: 'Instagram resource',
            examples: ['media', 'user', 'comment', 'story', 'insights'],
            default: 'media',
          },
          operation: {
            type: 'string',
            description: 'Instagram operation',
            examples: ['get', 'list', 'create', 'publish', 'createAndPublish'],
            default: 'createAndPublish',
          },
          media_url: {
            type: 'string',
            description: 'Media URL (image/video) for create operations',
            examples: ['https://example.com/image.jpg', '{{$json.mediaUrl}}'],
          },
          caption: {
            type: 'string',
            description: 'Post caption',
            examples: ['{{$json.caption}}', 'Tech update: {{$json.title}}'],
          },
          // Credential fields (for credential discovery and injection)
          accessToken: {
            type: 'string',
            description: 'OAuth2 Access Token for Instagram (if using OAuth authentication)',
            examples: ['your-instagram-oauth-token'],
          },
          credentialId: {
            type: 'string',
            description: 'ID of the stored credential to use',
            examples: ['instagram_oauth_123'],
          },
        },
      },
      aiSelectionCriteria: {
        whenToUse: [
          'User mentions Instagram posting',
          'Social media automation for Instagram',
          'Image sharing',
        ],
        whenNotToUse: [
          'Other social media platforms',
        ],
        keywords: ['instagram', 'insta', 'post to instagram', 'ig'],
        useCases: ['Instagram posts', 'Image sharing', 'Visual content'],
      },
      commonPatterns: [],
      validationRules: [],
    };
  }

  private createYoutubeSchema(): NodeSchema {
    return {
      type: 'youtube',
      label: 'YouTube',
      category: 'social',
      description: 'Publish videos or posts to YouTube channels',
      configSchema: {
        required: ['operation'],
        optional: {
          operation: {
            type: 'string',
            description: 'Operation: upload_video, update_video, create_post',
            examples: ['upload_video', 'update_video', 'create_post'],
            default: 'upload_video',
          },
          videoUrl: {
            type: 'string',
            description: 'URL of the video to upload or reference',
            examples: ['https://example.com/video.mp4'],
          },
          title: {
            type: 'string',
            description: 'Video title',
            examples: ['New product demo'],
          },
          description: {
            type: 'string',
            description: 'Video description or post text',
            examples: ['Check out our latest feature...'],
          },
          channelId: {
            type: 'string',
            description: 'YouTube channel ID (optional if default channel is configured)',
            examples: ['UCxxxxxxxxxxxx'],
          },
          // Credential fields (for credential discovery and injection)
          accessToken: {
            type: 'string',
            description: 'OAuth2 Access Token for YouTube (if using OAuth authentication)',
            examples: ['your-youtube-oauth-token'],
          },
          credentialId: {
            type: 'string',
            description: 'ID of the stored credential to use',
            examples: ['youtube_oauth_123'],
          },
        },
      },
      aiSelectionCriteria: {
        whenToUse: [
          'User mentions YouTube',
          'Publish a video to YouTube',
          'Create a YouTube video or short',
        ],
        whenNotToUse: [
          'Other video platforms (e.g. TikTok, Vimeo)',
        ],
        keywords: ['youtube', 'you tube', 'yt', 'upload to youtube', 'post on youtube', 'youtube video'],
        useCases: ['Publish marketing videos', 'Post YouTube shorts', 'Upload product demos'],
      },
      commonPatterns: [],
      validationRules: [],
      capabilities: ['video.upload', 'video.update', 'youtube.post'],
      providers: ['youtube'],
      keywords: ['youtube', 'you tube', 'yt'],
    };
  }

  // ============================================
  // MISSING CRM NODES - CRITICAL FIXES
  // ============================================

  private createHubSpotSchema(): NodeSchema {
    return {
      type: 'hubspot',
      label: 'HubSpot',
      category: 'crm',
      description: 'HubSpot CRM operations - create, update, retrieve, or search contacts, companies, deals, tickets, and other objects',
      configSchema: {
        required: ['resource', 'operation'],
        optional: {
          resource: {
            type: 'string',
            description: 'HubSpot object type: contact, company, deal, ticket, product, line_item, quote, call, email, meeting, note, task, owner, pipeline',
            examples: ['contact', 'company', 'deal', 'ticket'],
            default: 'contact',
          },
          operation: {
            type: 'string',
            description: 'HubSpot operation: get, getMany, create, update, delete, search, batchCreate, batchUpdate, batchDelete',
            examples: ['get', 'getMany', 'create', 'update', 'delete', 'search'],
            default: 'get',
          },
          apiKey: {
            type: 'string',
            description: 'HubSpot API key or Private App access token (required for authentication)',
            examples: ['HUBSPOT_ACCESS_TOKEN_REPLACE_ME'],
          },
          accessToken: {
            type: 'string',
            description: 'HubSpot OAuth2 access token (alternative to API key)',
            examples: ['your-oauth-access-token'],
          },
          credentialId: {
            type: 'string',
            description: 'Credential ID reference to stored HubSpot credentials',
            examples: ['cred_123'],
          },
          id: {
            type: 'string',
            description: 'Object ID (required for get, update, delete)',
            examples: ['123456789'],
          },
          objectId: {
            type: 'string',
            description: 'Alias for id (legacy field name)',
            examples: ['123456789'],
          },
          properties: {
            type: 'object',
            description: 'Object properties for create/update operations',
            examples: [{ email: 'test@example.com', firstname: 'John', lastname: 'Doe' }],
          },
          searchQuery: {
            type: 'string',
            description: 'Search query (required for search operation)',
            examples: ['email:test@example.com'],
          },
          limit: {
            type: 'number',
            description: 'Number of records to return',
            examples: [10, 100],
            default: 10,
          },
          after: {
            type: 'string',
            description: 'Pagination token for next page',
            examples: ['paging_token'],
          },
        },
      },
      aiSelectionCriteria: {
        whenToUse: [
          'User mentions HubSpot explicitly',
          'CRM workflows involving contacts, companies, deals, or tickets',
          'Syncing data between HubSpot and other systems',
          'When a new contact is added to HubSpot',
        ],
        whenNotToUse: ['Non-HubSpot CRMs (use Salesforce/Zoho/etc.)', 'Simple spreadsheets (use Google Sheets)'],
        keywords: ['hubspot', 'hub spot'], // Removed 'crm' - use sample workflows instead
        useCases: ['Contact management', 'Deal tracking', 'Company management', 'Ticket management'],
      },
      commonPatterns: [],
      validationRules: [],
      capabilities: ['crm.read', 'crm.write', 'crm.search', 'hubspot.contact', 'hubspot.deal'],
      providers: ['hubspot'],
      keywords: ['hubspot', 'hub spot'],
    };
  }

  private createAirtableSchema(): NodeSchema {
    return {
      type: 'airtable',
      label: 'Airtable',
      category: 'database',
      description: 'Read, write, update, or delete records in Airtable bases and tables',
      configSchema: {
        required: ['baseId', 'tableId', 'operation'],
        optional: {
          apiKey: {
            type: 'string',
            description: 'Airtable API key (required for authentication)',
            examples: ['patXXXXXXXXXXXXXX'],
          },
          accessToken: {
            type: 'string',
            description: 'Airtable OAuth access token (alternative to API key)',
            examples: ['your-oauth-access-token'],
          },
          credentialId: {
            type: 'string',
            description: 'Credential ID reference to stored Airtable credentials',
            examples: ['cred_123'],
          },
          baseId: {
            type: 'string',
            description: 'Airtable base ID',
            examples: ['appXXXXXXXXXXXXXX'],
          },
          tableId: {
            type: 'string',
            description: 'Airtable table ID or name',
            examples: ['tblXXXXXXXXXXXXXX', 'Table 1'],
          },
          operation: {
            type: 'string',
            description: 'Operation: read, create, update, delete',
            examples: ['read', 'create', 'update', 'delete'],
            default: 'read',
          },
          recordId: {
            type: 'string',
            description: 'Record ID (required for update/delete)',
            examples: ['recXXXXXXXXXXXXXX'],
          },
          fields: {
            type: 'object',
            description: 'Field values for create/update',
            examples: [{ Name: 'John Doe', Email: 'test@example.com' }],
          },
        },
      },
      aiSelectionCriteria: {
        whenToUse: ['User mentions Airtable', 'Need to read/write Airtable records', 'Database operations in Airtable'],
        whenNotToUse: ['Other database systems', 'Simple spreadsheets (use Google Sheets)'],
        keywords: ['airtable', 'air table'],
        useCases: ['Airtable record management', 'Data sync with Airtable'],
      },
      commonPatterns: [],
      validationRules: [],
      capabilities: ['database.read', 'database.write', 'airtable.record'],
      providers: ['airtable'],
      keywords: ['airtable'],
    };
  }

  private createNotionSchema(): NodeSchema {
    return {
      type: 'notion',
      label: 'Notion',
      category: 'productivity',
      description: 'Read, write, update, or delete pages, databases, and blocks in Notion',
      configSchema: {
        required: ['resource', 'operation'],
        optional: {
          apiKey: {
            type: 'string',
            description: 'Notion API key (required for authentication)',
            examples: ['secret_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'],
          },
          accessToken: {
            type: 'string',
            description: 'Notion OAuth access token (alternative to API key)',
            examples: ['your-oauth-access-token'],
          },
          credentialId: {
            type: 'string',
            description: 'Credential ID reference to stored Notion credentials',
            examples: ['cred_123'],
          },
          resource: {
            type: 'string',
            description: 'Notion resource: page, database, block, user, comment, search',
            examples: ['page', 'database', 'search'],
            default: 'page',
          },
          operation: {
            type: 'string',
            description: 'Notion operation: read, create, update, delete',
            examples: ['read', 'create', 'update', 'delete'],
            default: 'read',
          },
          pageId: {
            type: 'string',
            description: 'Notion page ID',
            examples: ['page-id'],
          },
          databaseId: {
            type: 'string',
            description: 'Notion database ID',
            examples: ['database-id'],
          },
          content: {
            type: 'object',
            description: 'Page or database content',
            examples: [{ title: 'Page Title', content: 'Page content' }],
          },
          filter: {
            type: 'object',
            description: 'Optional filter for database queries/search',
          },
        },
      },
      aiSelectionCriteria: {
        whenToUse: ['User mentions Notion', 'Need to read/write Notion pages or databases'],
        whenNotToUse: ['Other productivity tools', 'Simple notes (use other nodes)'],
        keywords: ['notion'],
        useCases: ['Notion page management', 'Database operations in Notion'],
      },
      commonPatterns: [],
      validationRules: [],
      capabilities: ['notion.read', 'notion.write', 'notion.page'],
      providers: ['notion'],
      keywords: ['notion'],
    };
  }

  private createZohoCrmSchema(): NodeSchema {
    return {
      type: 'zoho_crm',
      label: 'Zoho CRM',
      category: 'crm',
      description: 'Zoho CRM operations - work with modules, records, and related lists',
      configSchema: {
        required: ['resource', 'operation'],
        optional: {
          accessToken: {
            type: 'string',
            description: 'Zoho CRM OAuth access token (required for authentication)',
            examples: ['your-zoho-oauth-access-token'],
          },
          refreshToken: {
            type: 'string',
            description: 'Zoho CRM OAuth refresh token',
            examples: ['your-zoho-refresh-token'],
          },
          credentialId: {
            type: 'string',
            description: 'Credential ID reference to stored Zoho CRM credentials',
            examples: ['cred_123'],
          },
          resource: {
            type: 'string',
            description: 'Zoho CRM module: Leads, Contacts, Accounts, Deals, etc.',
            examples: ['Leads', 'Contacts', 'Accounts', 'Deals'],
            default: 'Contacts',
          },
          operation: {
            type: 'string',
            description: 'Zoho CRM operation: get, create, update, delete, search',
            examples: ['get', 'create', 'update', 'delete', 'search'],
            default: 'get',
          },
          recordId: {
            type: 'string',
            description: 'Record ID (required for get, update, delete)',
            examples: ['123456789'],
          },
          criteria: {
            type: 'string',
            description: 'Search criteria (optional, used for search operation)',
            examples: ['(Email:equals:test@example.com)'],
          },
          data: {
            type: 'object',
            description: 'Record data for create/update',
            examples: [{ First_Name: 'John', Last_Name: 'Doe', Email: 'test@example.com' }],
          },
        },
      },
      aiSelectionCriteria: {
        whenToUse: ['User mentions Zoho CRM', 'CRM workflows with Zoho', 'Syncing data with Zoho CRM'],
        whenNotToUse: ['Other CRMs (use HubSpot/Salesforce/etc.)'],
        keywords: ['zoho'], // Removed 'crm' - use sample workflows instead
        useCases: ['Zoho CRM record management', 'Data sync with Zoho'],
      },
      commonPatterns: [],
      validationRules: [],
      capabilities: ['crm.read', 'crm.write', 'zoho.record'],
      providers: ['zoho'],
      keywords: ['zoho', 'zoho crm'],
    };
  }

  private createPipedriveSchema(): NodeSchema {
    return {
      type: 'pipedrive',
      label: 'Pipedrive',
      category: 'crm',
      description: 'Pipedrive CRM operations - manage deals, persons, organizations, and activities',
      configSchema: {
        required: ['resource', 'operation'],
        optional: {
          apiToken: {
            type: 'string',
            description: 'Pipedrive API token (required for authentication)',
            examples: ['your-pipedrive-api-token'],
          },
          credentialId: {
            type: 'string',
            description: 'Credential ID reference to stored Pipedrive credentials',
            examples: ['cred_123'],
          },
          resource: {
            type: 'string',
            description: 'Pipedrive resource: deals, persons, organizations, activities',
            examples: ['deals', 'persons', 'organizations', 'activities'],
            default: 'deals',
          },
          operation: {
            type: 'string',
            description: 'Pipedrive operation: get, create, update, delete, search',
            examples: ['get', 'create', 'update', 'delete', 'search'],
            default: 'get',
          },
          id: {
            type: 'string',
            description: 'Resource ID (required for get, update, delete)',
            examples: ['123'],
          },
          data: {
            type: 'object',
            description: 'Resource data for create/update',
            examples: [{ title: 'Deal Title', value: 1000 }],
          },
        },
      },
      aiSelectionCriteria: {
        whenToUse: ['User mentions Pipedrive', 'CRM workflows with Pipedrive'],
        whenNotToUse: ['Other CRMs (use HubSpot/Salesforce/etc.)'],
        keywords: ['pipedrive', 'pipe drive'],
        useCases: ['Pipedrive deal management', 'Person/organization management'],
      },
      commonPatterns: [],
      validationRules: [],
      capabilities: ['crm.read', 'crm.write', 'pipedrive.deal'],
      providers: ['pipedrive'],
      keywords: ['pipedrive'],
    };
  }

  private createDiscordSchema(): NodeSchema {
    return {
      type: 'discord',
      label: 'Discord',
      category: 'output',
      description: 'Send messages to Discord channels or users via Discord Bot API',
      configSchema: {
        required: ['channelId', 'message'],
        optional: {
          channelId: {
            type: 'string',
            description: 'Discord channel ID',
            examples: ['123456789012345678'],
          },
          message: {
            type: 'string',
            description: 'Message text to send',
            examples: ['Hello from workflow!'],
          },
          botToken: {
            type: 'string',
            description: 'Discord bot token (stored as credential)',
          },
        },
      },
      aiSelectionCriteria: {
        whenToUse: ['User mentions Discord notifications', 'Send messages to Discord channels'],
        whenNotToUse: ['Slack notifications (use slack_message)', 'Email notifications (use email/google_gmail)'],
        keywords: ['discord', 'discord message'],
        useCases: ['Discord notifications', 'Team communication via Discord'],
      },
      commonPatterns: [],
      validationRules: [],
      capabilities: ['notification.send', 'discord.send', 'message.send'],
      providers: ['discord'],
      keywords: ['discord'],
    };
  }

  private createJsonParserSchema(): NodeSchema {
    return {
      type: 'json_parser',
      label: 'JSON Parser',
      category: 'data',
      description: 'Parse JSON strings into objects and extract specific fields',
      configSchema: {
        required: ['json'],
        optional: {
          json: {
            type: 'string',
            description: 'JSON string to parse',
            examples: ['{{$json.data}}', '{"name": "John", "age": 30}'],
          },
          extractFields: {
            type: 'array',
            description: 'Fields to extract from parsed JSON',
            examples: [['name', 'age', 'email']],
          },
        },
      },
      aiSelectionCriteria: {
        whenToUse: ['Input is JSON string or nested object', 'Need to parse and extract fields from JSON'],
        whenNotToUse: ['Simple data operations', 'Already parsed JSON objects'],
        keywords: ['json', 'parse', 'extract'],
        useCases: ['JSON parsing', 'Field extraction'],
      },
      commonPatterns: [],
      validationRules: [],
    };
  }

  private createMergeDataSchema(): NodeSchema {
    return {
      type: 'merge_data',
      label: 'Merge Data',
      category: 'data',
      description: 'Merge data structures from multiple sources',
      configSchema: {
        required: ['mode'],
        optional: {
          mode: {
            type: 'string',
            description: 'Merge mode: append, join, overwrite',
            examples: ['append', 'join', 'overwrite'],
            default: 'append',
          },
          joinBy: {
            type: 'string',
            description: 'Field to join by (for join mode)',
            examples: ['id', 'email'],
          },
        },
      },
      aiSelectionCriteria: {
        whenToUse: ['Need to combine data from multiple sources', 'Merge arrays or objects'],
        whenNotToUse: ['Simple data flow', 'Single source data'],
        keywords: ['merge', 'combine', 'join'],
        useCases: ['Data merging', 'Combining results'],
      },
      commonPatterns: [],
      validationRules: [],
    };
  }

  private createEditFieldsSchema(): NodeSchema {
    return {
      type: 'edit_fields',
      label: 'Edit Fields',
      category: 'data',
      description: 'Edit, rename, or transform field values in data objects',
      configSchema: {
        required: [],
        optional: {
          fields: {
            type: 'object',
            description: 'Field mappings and transformations',
            examples: [{ oldField: '{{$json.newField}}', rename: { old: 'new' } }],
          },
        },
      },
      aiSelectionCriteria: {
        whenToUse: ['Need to rename or transform fields', 'Edit field values'],
        whenNotToUse: ['Simple data flow', 'No field transformation needed'],
        keywords: ['edit', 'rename', 'transform', 'fields'],
        useCases: ['Field editing', 'Data transformation'],
      },
      commonPatterns: [],
      validationRules: [],
    };
  }

  // ============================================
  // ALL MISSING NODES - COMPLETE FIX
  // ============================================

  // Missing Trigger Nodes
  private createErrorTriggerSchema(): NodeSchema {
    return {
      type: 'error_trigger',
      label: 'Error Trigger',
      category: 'triggers',
      description: 'Trigger workflow when errors occur',
      configSchema: { required: [], optional: {} },
      aiSelectionCriteria: {
        whenToUse: ['Error-based workflow triggers', 'Error handling workflows'],
        whenNotToUse: ['Normal workflow triggers'],
        keywords: ['error trigger', 'error handling'],
        useCases: ['Error workflows'],
      },
      commonPatterns: [],
      validationRules: [],
    };
  }

  private createWorkflowTriggerSchema(): NodeSchema {
    return {
      type: 'workflow_trigger',
      label: 'Workflow Trigger',
      category: 'triggers',
      description: 'Trigger workflow from another workflow',
      configSchema: { required: [], optional: {} },
      aiSelectionCriteria: {
        whenToUse: ['Workflow-to-workflow triggers', 'Chaining workflows'],
        whenNotToUse: ['External triggers'],
        keywords: ['workflow trigger', 'chain workflow'],
        useCases: ['Workflow chaining'],
      },
      commonPatterns: [],
      validationRules: [],
    };
  }

  // Missing Logic Nodes
  private createFilterSchema(): NodeSchema {
    return {
      type: 'filter',
      label: 'Filter',
      category: 'logic',
      description: 'Filter array items by condition',
      configSchema: {
        required: ['condition'],
        optional: {
          condition: {
            type: 'expression',
            description: 'Filter condition',
            examples: ['{{$json.age}} >= 18'],
          },
        },
      },
      aiSelectionCriteria: {
        whenToUse: ['Need to filter array items', 'Remove items based on condition'],
        whenNotToUse: ['Simple data flow'],
        keywords: ['filter', 'remove', 'exclude'],
        useCases: ['Array filtering'],
      },
      commonPatterns: [],
      validationRules: [],
    };
  }

  private createLoopSchema(): NodeSchema {
    return {
      type: 'loop',
      label: 'Loop',
      category: 'logic',
      description: 'Iterate over array items with max iterations limit',
      configSchema: {
        required: ['items'],
        optional: {
          items: {
            type: 'array',
            description: 'Array to iterate over',
            examples: ['{{$json.items}}'],
          },
          maxIterations: {
            type: 'number',
            description: 'Maximum iterations',
            examples: [100],
            default: 100,
          },
        },
      },
      aiSelectionCriteria: {
        whenToUse: ['Need to iterate over array', 'Process multiple items'],
        whenNotToUse: ['Single item processing'],
        keywords: ['loop', 'iterate', 'foreach', 'each'],
        useCases: ['Array iteration'],
      },
      commonPatterns: [],
      validationRules: [],
    };
  }

  private createNoopSchema(): NodeSchema {
    return {
      type: 'noop',
      label: 'NoOp',
      category: 'logic',
      description: 'Pass through node - no operation',
      configSchema: { required: [], optional: {} },
      aiSelectionCriteria: {
        whenToUse: ['Need pass-through node', 'Debugging'],
        whenNotToUse: ['Normal workflows'],
        keywords: ['noop', 'pass through'],
        useCases: ['Pass-through'],
      },
      commonPatterns: [],
      validationRules: [],
    };
  }

  private createSplitInBatchesSchema(): NodeSchema {
    return {
      type: 'split_in_batches',
      label: 'Split In Batches',
      category: 'logic',
      description: 'Split array into batches for processing',
      configSchema: {
        required: ['batchSize'],
        optional: {
          batchSize: {
            type: 'number',
            description: 'Batch size',
            examples: [10, 100],
            default: 10,
          },
        },
      },
      aiSelectionCriteria: {
        whenToUse: ['Need to process large arrays in batches', 'Batch processing'],
        whenNotToUse: ['Small arrays'],
        keywords: ['batch', 'split', 'chunk'],
        useCases: ['Batch processing'],
      },
      commonPatterns: [],
      validationRules: [],
    };
  }

  private createStopAndErrorSchema(): NodeSchema {
    return {
      type: 'stop_and_error',
      label: 'Stop And Error',
      category: 'logic',
      description: 'Stop workflow execution with error message',
      configSchema: {
        required: ['errorMessage'],
        optional: {
          errorMessage: {
            type: 'string',
            description: 'Error message',
            examples: ['Validation failed'],
          },
        },
      },
      aiSelectionCriteria: {
        whenToUse: ['Need to stop workflow with error', 'Error handling'],
        whenNotToUse: ['Normal flow'],
        keywords: ['stop', 'error', 'fail'],
        useCases: ['Error stopping'],
      },
      commonPatterns: [],
      validationRules: [],
    };
  }

  // Missing Data Manipulation Nodes
  private createSetVariableSchema(): NodeSchema {
    return {
      type: 'set_variable',
      label: 'Set Variable',
      category: 'data',
      description: 'Set workflow variables for use in other nodes',
      configSchema: {
        required: ['name'],
        optional: {
          name: {
            type: 'string',
            description: 'Variable name',
            examples: ['myVariable', 'userName'],
          },
          value: {
            type: 'expression',
            description: 'Variable value',
            examples: ['{{$json.name}}', 'defaultValue'],
          },
        },
      },
      aiSelectionCriteria: {
        whenToUse: ['Need to set variables', 'Store computed values'],
        whenNotToUse: ['Simple data flow'],
        keywords: ['set', 'variable', 'store'],
        useCases: ['Variable setting'],
      },
      commonPatterns: [],
      validationRules: [],
    };
  }

  private createMathSchema(): NodeSchema {
    return {
      type: 'math',
      label: 'Math',
      category: 'data',
      description: 'Mathematical operations and calculations',
      configSchema: {
        required: ['operation'],
        optional: {
          operation: {
            type: 'string',
            description: 'Math operation: add, subtract, multiply, divide, etc.',
            examples: ['add', 'subtract', 'multiply', 'divide'],
          },
          a: {
            type: 'number',
            description: 'First number',
            examples: [10, '{{$json.value1}}'],
          },
          b: {
            type: 'number',
            description: 'Second number',
            examples: [5, '{{$json.value2}}'],
          },
        },
      },
      aiSelectionCriteria: {
        whenToUse: ['Need mathematical calculations', 'Number operations'],
        whenNotToUse: ['Simple data flow'],
        keywords: ['math', 'calculate', 'compute', 'add', 'subtract'],
        useCases: ['Mathematical operations'],
      },
      commonPatterns: [],
      validationRules: [],
    };
  }

  private createHtmlSchema(): NodeSchema {
    return {
      type: 'html',
      label: 'HTML',
      category: 'data',
      description: 'Parse and manipulate HTML content',
      configSchema: {
        required: ['html'],
        optional: {
          html: {
            type: 'string',
            description: 'HTML content',
            examples: ['{{$json.html}}', '<div>Content</div>'],
          },
          operation: {
            type: 'string',
            description: 'Operation: parse, extract, clean',
            examples: ['parse', 'extract', 'clean'],
            default: 'parse',
          },
        },
      },
      aiSelectionCriteria: {
        whenToUse: ['Need to parse HTML', 'Extract HTML content'],
        whenNotToUse: ['Simple text'],
        keywords: ['html', 'parse html', 'extract html'],
        useCases: ['HTML parsing'],
      },
      commonPatterns: [],
      validationRules: [],
    };
  }

  private createXmlSchema(): NodeSchema {
    return {
      type: 'xml',
      label: 'XML',
      category: 'data',
      description: 'Parse and manipulate XML content',
      configSchema: {
        required: ['xml'],
        optional: {
          xml: {
            type: 'string',
            description: 'XML content',
            examples: ['{{$json.xml}}', '<root><item>value</item></root>'],
          },
          operation: {
            type: 'string',
            description: 'Operation: parse, extract',
            examples: ['parse', 'extract'],
            default: 'parse',
          },
        },
      },
      aiSelectionCriteria: {
        whenToUse: ['Need to parse XML', 'Extract XML content'],
        whenNotToUse: ['Simple text'],
        keywords: ['xml', 'parse xml'],
        useCases: ['XML parsing'],
      },
      commonPatterns: [],
      validationRules: [],
    };
  }

  private createCsvSchema(): NodeSchema {
    return {
      type: 'csv',
      label: 'CSV',
      category: 'data',
      description: 'Parse and generate CSV data',
      configSchema: {
        required: ['operation'],
        optional: {
          operation: {
            type: 'string',
            description: 'Operation: parse, generate',
            examples: ['parse', 'generate'],
            default: 'parse',
          },
          csv: {
            type: 'string',
            description: 'CSV content (for parse)',
            examples: ['{{$json.csv}}'],
          },
          data: {
            type: 'array',
            description: 'Data array (for generate)',
            examples: ['{{$json.data}}'],
          },
        },
      },
      aiSelectionCriteria: {
        whenToUse: ['Need to parse CSV', 'Generate CSV', 'CSV operations'],
        whenNotToUse: ['Simple data'],
        keywords: ['csv', 'parse csv', 'generate csv'],
        useCases: ['CSV operations'],
      },
      commonPatterns: [],
      validationRules: [],
    };
  }

  private createRenameKeysSchema(): NodeSchema {
    return {
      type: 'rename_keys',
      label: 'Rename Keys',
      category: 'data',
      description: 'Rename object keys',
      configSchema: {
        required: ['mappings'],
        optional: {
          mappings: {
            type: 'object',
            description: 'Key mappings: { oldKey: "newKey" }',
            examples: [{ oldName: 'newName', oldEmail: 'newEmail' }],
          },
        },
      },
      aiSelectionCriteria: {
        whenToUse: ['Need to rename object keys', 'Key transformation'],
        whenNotToUse: ['Simple data flow'],
        keywords: ['rename', 'keys', 'transform keys'],
        useCases: ['Key renaming'],
      },
      commonPatterns: [],
      validationRules: [],
    };
  }

  private createAggregateSchema(): NodeSchema {
    return {
      type: 'aggregate',
      label: 'Aggregate',
      category: 'data',
      description: 'Aggregate data',
      configSchema: {
        required: ['operation'],
        optional: {
          operation: {
            type: 'string',
            description: 'Aggregation operation: sum, avg, count, min, max, join',
            examples: ['sum', 'avg', 'count', 'min', 'max', 'join'],
            default: 'sum',
          },
          field: {
            type: 'string',
            description: 'Field to aggregate',
            examples: ['{{$json.amount}}'],
          },
          delimiter: {
            type: 'string',
            description: 'Delimiter used for join/concat operations',
            examples: ['\\n', ', ', ' | '],
            default: '\n',
          },
          groupBy: {
            type: 'string',
            description: 'Optional group-by field (UI-supported). Note: grouping behavior depends on execution implementation.',
            examples: ['category'],
          },
        },
      },
      aiSelectionCriteria: {
        whenToUse: ['Need to aggregate data', 'Calculate totals', 'Statistics', 'Join arrays into text'],
        whenNotToUse: ['Simple data flow'],
        keywords: ['aggregate', 'sum', 'avg', 'count', 'total', 'join', 'concat', 'concatenate', 'merge'],
        useCases: ['Data aggregation'],
      },
      commonPatterns: [],
      validationRules: [],
    };
  }

  private createSortSchema(): NodeSchema {
    return {
      type: 'sort',
      label: 'Sort',
      category: 'data',
      description: 'Sort arrays',
      configSchema: {
        required: [],
        optional: {
          field: {
            type: 'string',
            description: 'Field to sort by',
            examples: ['name', 'date'],
          },
          direction: {
            type: 'string',
            description: 'Sort direction: asc, desc',
            examples: ['asc', 'desc', 'ascending', 'descending'],
            default: 'asc',
          },
          type: {
            type: 'string',
            description: 'Value type: auto, number, string, date',
            examples: ['auto', 'number', 'string', 'date'],
            default: 'auto',
          },
        },
      },
      aiSelectionCriteria: {
        whenToUse: ['Need to sort arrays', 'Order data'],
        whenNotToUse: ['Simple data flow'],
        keywords: ['sort', 'order', 'arrange'],
        useCases: ['Array sorting'],
      },
      commonPatterns: [],
      validationRules: [],
    };
  }

  private createLimitSchema(): NodeSchema {
    return {
      type: 'limit',
      label: 'Limit',
      category: 'data',
      description: 'Limit array size',
      configSchema: {
        required: ['limit'],
        optional: {
          limit: {
            type: 'number',
            description: 'Maximum items',
            examples: [10, 100],
          },
          array: {
            type: 'array',
            description: 'Array to limit',
            examples: ['{{$json.items}}'],
          },
        },
      },
      aiSelectionCriteria: {
        whenToUse: ['Need to limit array size', 'Take first N items'],
        whenNotToUse: ['Simple data flow'],
        keywords: ['limit', 'take', 'first'],
        useCases: ['Array limiting'],
      },
      commonPatterns: [],
      validationRules: [],
    };
  }

  private createSetSchema(): NodeSchema {
    return {
      type: 'set',
      label: 'Set',
      category: 'data',
      description: 'Set/override multiple fields on the current item',
      configSchema: {
        required: ['fields'],
        optional: {
          fields: {
            type: 'string',
            description: 'JSON object of fields to set (supports template strings)',
            examples: ['{"status":"new","email":"{{$json.email}}"}'],
          },
        },
      },
      aiSelectionCriteria: {
        whenToUse: ['User mentions set fields', 'Need to override fields', 'Simple mapping'],
        whenNotToUse: ['Complex transforms (use javascript)', 'Single variable assignment (use set_variable)'],
        keywords: ['set', 'fields', 'map', 'override'],
        useCases: ['Field mapping'],
      },
      commonPatterns: [],
      validationRules: [],
    };
  }

  // Missing AI Nodes
  private createOpenAiGptSchema(): NodeSchema {
    return {
      type: 'openai_gpt',
      label: 'OpenAI GPT',
      category: 'ai',
      description: 'OpenAI GPT chat completion (GPT-4, GPT-3.5)',
      configSchema: {
        required: ['model', 'messages', 'apiKey'],
        optional: {
          model: {
            type: 'string',
            description: 'Model name',
            examples: ['gpt-4', 'gpt-3.5-turbo'],
          },
          apiKey: {
            type: 'string',
            description: 'OpenAI API key (node-level, required for this node to run)',
            examples: ['sk-...'],
          },
          messages: {
            type: 'array',
            description: 'Chat messages',
            examples: [['{{$json.messages}}']],
          },
        },
      },
      aiSelectionCriteria: {
        whenToUse: ['User mentions OpenAI', 'GPT models', 'OpenAI chat'],
        whenNotToUse: ['Other AI models'],
        keywords: ['openai', 'gpt', 'gpt-4', 'gpt-3.5'],
        useCases: ['OpenAI chat completion'],
      },
      commonPatterns: [],
      validationRules: [],
      capabilities: ['ai.chat', 'openai.completion'],
      providers: ['openai'],
      keywords: ['openai', 'gpt'],
    };
  }

  private createAnthropicClaudeSchema(): NodeSchema {
    return {
      type: 'anthropic_claude',
      label: 'Claude',
      category: 'ai',
      description: 'Anthropic Claude chat completion',
      configSchema: {
        required: ['model', 'messages', 'apiKey'],
        optional: {
          model: {
            type: 'string',
            description: 'Model name',
            examples: ['claude-3-opus', 'claude-3-sonnet'],
          },
          apiKey: {
            type: 'string',
            description: 'Anthropic API key (node-level, required for this node to run)',
            examples: ['anthropic-key-...'],
          },
          messages: {
            type: 'array',
            description: 'Chat messages',
            examples: [['{{$json.messages}}']],
          },
        },
      },
      aiSelectionCriteria: {
        whenToUse: ['User mentions Claude', 'Anthropic models'],
        whenNotToUse: ['Other AI models'],
        keywords: ['claude', 'anthropic'],
        useCases: ['Claude chat completion'],
      },
      commonPatterns: [],
      validationRules: [],
      capabilities: ['ai.chat', 'anthropic.completion'],
      providers: ['anthropic'],
      keywords: ['claude', 'anthropic'],
    };
  }

  private createGoogleGeminiSchema(): NodeSchema {
    return {
      type: 'google_gemini',
      label: 'Gemini',
      category: 'ai',
      description: 'Google Gemini chat completion',
      configSchema: {
        required: ['model', 'prompt', 'apiKey'],
        optional: {
          model: {
            type: 'string',
            description: 'Model name',
            examples: ['gemini-pro', 'gemini-pro-vision'],
          },
          apiKey: {
            type: 'string',
            description: 'Gemini API key (node-level, required for this node to run)',
            examples: ['AIza...'],
          },
          prompt: {
            type: 'string',
            description: 'Prompt text',
            examples: ['{{$json.prompt}}'],
          },
        },
      },
      aiSelectionCriteria: {
        whenToUse: ['User mentions Gemini', 'Google AI models'],
        whenNotToUse: ['Other AI models'],
        keywords: ['gemini', 'google ai'],
        useCases: ['Gemini chat completion'],
      },
      commonPatterns: [],
      validationRules: [],
      capabilities: ['ai.chat', 'google.completion'],
      providers: ['google'],
      keywords: ['gemini'],
    };
  }

  private createOllamaSchema(): NodeSchema {
    return {
      type: 'ollama',
      label: 'Ollama',
      category: 'ai',
      description: 'Local Ollama models for chat completion',
      configSchema: {
        required: ['model', 'prompt'],
        optional: {
          model: {
            type: 'string',
            description: 'Ollama model name (AWS Production Models)',
            examples: [
              'qwen2.5:14b-instruct-q4_K_M',
              'qwen2.5:7b-instruct-q4_K_M',
              'qwen2.5-coder:7b-instruct-q4_K_M',
              'ctrlchecks-workflow-builder',
            ],
          },
          prompt: {
            type: 'string',
            description: 'Prompt text',
            examples: ['{{$json.prompt}}'],
          },
        },
      },
      aiSelectionCriteria: {
        whenToUse: ['User mentions Ollama', 'Local AI models'],
        whenNotToUse: ['Cloud AI models'],
        keywords: ['ollama', 'local ai'],
        useCases: ['Local AI chat'],
      },
      commonPatterns: [],
      validationRules: [],
      capabilities: ['ai.chat', 'ollama.completion'],
      providers: ['ollama'],
      keywords: ['ollama'],
    };
  }

  private createTextSummarizerSchema(): NodeSchema {
    return {
      type: 'text_summarizer',
      label: 'Text Summarizer',
      category: 'ai',
      description: 'Summarize long text into shorter versions',
      configSchema: {
        required: ['text'],
        optional: {
          text: {
            type: 'string',
            description: 'Text to summarize',
            examples: ['{{$json.text}}'],
          },
          maxLength: {
            type: 'number',
            description: 'Maximum summary length',
            examples: [100, 200],
          },
        },
      },
      aiSelectionCriteria: {
        whenToUse: ['User mentions summarize', 'Text summarization'],
        whenNotToUse: ['Simple text'],
        keywords: ['summarize', 'summary', 'condense'],
        useCases: ['Text summarization'],
      },
      commonPatterns: [],
      validationRules: [],
      nodeCapability: {
        inputType: ['text', 'array'], // Can accept both text and array
        outputType: 'text', // Produces text summary
        acceptsArray: true,
        producesArray: false,
      },
    };
  }

  private createSentimentAnalyzerSchema(): NodeSchema {
    return {
      type: 'sentiment_analyzer',
      label: 'Sentiment Analyzer',
      category: 'ai',
      description: 'Analyze sentiment and emotions in text',
      configSchema: {
        required: ['text'],
        optional: {
          text: {
            type: 'string',
            description: 'Text to analyze',
            examples: ['{{$json.text}}'],
          },
        },
      },
      aiSelectionCriteria: {
        whenToUse: ['User mentions sentiment', 'Emotion analysis'],
        whenNotToUse: ['Simple text'],
        keywords: ['sentiment', 'emotion', 'analyze sentiment'],
        useCases: ['Sentiment analysis'],
      },
      commonPatterns: [],
      validationRules: [],
    };
  }

  private createChatModelSchema(): NodeSchema {
    return {
      type: 'chat_model',
      label: 'Chat Model',
      category: 'ai',
      description: 'Chat model connector for AI Agent node',
      configSchema: {
        required: ['model'],
        optional: {
          provider: {
            type: 'string',
            description: 'Provider (ollama, openai, claude, gemini)',
            default: 'ollama',
            examples: ['ollama', 'openai', 'claude', 'gemini'],
          },
          model: {
            type: 'string',
            description: 'Chat model name',
            examples: ['gpt-4', 'claude-3'],
          },
          temperature: {
            type: 'number',
            description: 'Creativity/temperature (0.0 - 1.0)',
            default: 0.7,
            examples: [0.2, 0.7, 1.0],
          },
        },
      },
      aiSelectionCriteria: {
        whenToUse: ['AI Agent needs chat model', 'Chat model connection'],
        whenNotToUse: ['Direct AI usage'],
        keywords: ['chat model', 'model connector'],
        useCases: ['AI Agent connection'],
      },
      commonPatterns: [],
      validationRules: [],
    };
  }

  private createMemorySchema(): NodeSchema {
    return {
      type: 'memory',
      label: 'Memory',
      category: 'ai',
      description: 'Memory storage for AI Agent context',
      configSchema: {
        required: [],
        optional: {
          context: {
            type: 'string',
            description: 'Memory context',
            examples: ['{{$json.context}}'],
          },
        },
      },
      aiSelectionCriteria: {
        whenToUse: ['AI Agent needs memory', 'Context storage'],
        whenNotToUse: ['Stateless AI'],
        keywords: ['memory', 'context', 'store'],
        useCases: ['AI memory'],
      },
      commonPatterns: [],
      validationRules: [],
    };
  }

  private createToolSchema(): NodeSchema {
    return {
      type: 'tool',
      label: 'Tool',
      category: 'ai',
      description: 'Tool connector for AI Agent to use external functions',
      configSchema: {
        required: ['toolName'],
        optional: {
          toolName: {
            type: 'string',
            description: 'Tool name',
            examples: ['http_request', 'database_query'],
          },
        },
      },
      aiSelectionCriteria: {
        whenToUse: ['AI Agent needs tools', 'External function access'],
        whenNotToUse: ['Direct AI usage'],
        keywords: ['tool', 'function', 'connector'],
        useCases: ['AI tool connection'],
      },
      commonPatterns: [],
      validationRules: [],
    };
  }

  // Missing HTTP Nodes
  private createHttpPostSchema(): NodeSchema {
    return {
      type: 'http_post',
      label: 'HTTP POST',
      category: 'http_api',
      description: 'Send POST requests with JSON data',
      configSchema: {
        required: ['url', 'body'],
        optional: {
          url: {
            type: 'string',
            description: 'URL to POST to',
            examples: ['https://api.example.com/data'],
          },
          body: {
            type: 'object',
            description: 'POST body data',
            examples: ['{{$json.data}}'],
          },
          headers: {
            type: 'object',
            description: 'HTTP headers',
            examples: [{ 'Content-Type': 'application/json' }],
          },
        },
      },
      aiSelectionCriteria: {
        whenToUse: ['Need to POST data', 'Send data via HTTP POST'],
        whenNotToUse: ['GET requests (use http_request)'],
        keywords: ['post', 'http post', 'send data'],
        useCases: ['HTTP POST requests'],
      },
      commonPatterns: [],
      validationRules: [],
    };
  }

  private createWebhookResponseSchema(): NodeSchema {
    return {
      type: 'webhook_response',
      label: 'Webhook Response',
      category: 'http_api',
      description: 'Send response to webhook request',
      configSchema: {
        required: ['responseCode'],
        optional: {
          responseCode: {
            type: 'number',
            description: 'HTTP response code',
            examples: [200, 201, 400],
            default: 200,
          },
          body: {
            type: 'object',
            description: 'Response body',
            examples: ['{{$json.result}}'],
          },
        },
      },
      aiSelectionCriteria: {
        whenToUse: ['Webhook needs response', 'Send webhook response'],
        whenNotToUse: ['Not webhook workflow'],
        keywords: ['webhook response', 'respond'],
        useCases: ['Webhook responses'],
      },
      commonPatterns: [],
      validationRules: [],
    };
  }

  private createGraphqlSchema(): NodeSchema {
    return {
      type: 'graphql',
      label: 'GraphQL',
      category: 'http_api',
      description: 'Make GraphQL requests',
      configSchema: {
        required: ['url', 'query'],
        optional: {
          url: {
            type: 'string',
            description: 'GraphQL endpoint URL',
            examples: ['https://api.example.com/graphql'],
          },
          query: {
            type: 'string',
            description: 'GraphQL query',
            examples: ['{ user(id: 1) { name email } }'],
          },
          variables: {
            type: 'object',
            description: 'GraphQL variables',
            examples: [{ id: 1 }],
          },
        },
      },
      aiSelectionCriteria: {
        whenToUse: ['User mentions GraphQL', 'GraphQL API calls'],
        whenNotToUse: ['REST API (use http_request)'],
        keywords: ['graphql', 'gql'],
        useCases: ['GraphQL requests'],
      },
      commonPatterns: [],
      validationRules: [],
    };
  }

  // Missing Google Nodes
  private createGoogleDriveSchema(): NodeSchema {
    return {
      type: 'google_drive',
      label: 'Google Drive',
      category: 'google',
      description: 'Google Drive file operations (upload, download, list)',
      configSchema: {
        required: ['operation'],
        optional: {
          operation: {
            type: 'string',
            description: 'Operation: upload, download, list',
            examples: ['upload', 'download', 'list'],
          },
          fileId: {
            type: 'string',
            description: 'File ID (for download)',
            examples: ['file-id'],
          },
          fileName: {
            type: 'string',
            description: 'File name (for upload)',
            examples: ['document.pdf'],
          },
        },
      },
      aiSelectionCriteria: {
        whenToUse: ['User mentions Google Drive', 'File operations in Drive'],
        whenNotToUse: ['Google Sheets (use google_sheets)', 'Google Docs (use google_doc)'],
        keywords: ['google drive', 'drive', 'file upload'],
        useCases: ['Google Drive operations'],
      },
      commonPatterns: [
        {
          name: 'upload_file',
          description: 'Upload a file to Google Drive',
          config: { operation: 'upload', fileName: '{{$json.fileName}}', fileData: '{{$json.fileData}}' },
        },
        {
          name: 'download_file',
          description: 'Download a file from Google Drive',
          config: { operation: 'download', fileId: '{{$json.fileId}}' },
        },
        {
          name: 'list_files',
          description: 'List files in Google Drive',
          config: { operation: 'list' },
        },
      ],
      validationRules: [],
      capabilities: ['google.drive', 'file.upload', 'file.download'],
      providers: ['google'],
      keywords: ['google drive', 'drive'],
    };
  }

  private createGoogleCalendarSchema(): NodeSchema {
    return {
      type: 'google_calendar',
      label: 'Google Calendar',
      category: 'google',
      description: 'Create, read, update calendar events',
      configSchema: {
        required: ['resource', 'operation'],
        optional: {
          credentialId: {
            type: 'string',
            description: 'Stored credential reference (optional; OAuth handled via Connections)',
            examples: ['cred_123'],
          },
          resource: {
            type: 'string',
            description: 'Resource type (event, calendar, etc.)',
            examples: ['event', 'calendar'],
            default: 'event',
          },
          operation: {
            type: 'string',
            description: 'Operation: list, get, create, update, delete, search',
            examples: ['list', 'get', 'create', 'update', 'delete', 'search'],
            default: 'list',
          },
          calendarId: {
            type: 'string',
            description: 'Calendar ID',
            examples: ['primary'],
          },
          eventId: {
            type: 'string',
            description: 'Event ID (for update/delete)',
            examples: ['event-id'],
          },
          summary: {
            type: 'string',
            description: 'Event summary/title',
          },
          start: {
            type: 'object',
            description: 'Start datetime object (Google Calendar format)',
          },
          end: {
            type: 'object',
            description: 'End datetime object (Google Calendar format)',
          },
          eventData: {
            type: 'object',
            description: 'Full event payload for create/update (optional)',
          },
          description: {
            type: 'string',
            description: 'Event description',
          },
          timeMin: {
            type: 'string',
            description: 'Lower bound for list/search (RFC3339 timestamp)',
          },
          timeMax: {
            type: 'string',
            description: 'Upper bound for list/search (RFC3339 timestamp)',
          },
          maxResults: {
            type: 'number',
            description: 'Max results for list/search',
            default: 250,
          },
          q: {
            type: 'string',
            description: 'Free text search query (for events.list)',
          },
        },
      },
      aiSelectionCriteria: {
        whenToUse: ['User mentions Google Calendar', 'Calendar operations'],
        whenNotToUse: ['Other calendar systems'],
        keywords: ['google calendar', 'calendar', 'event'],
        useCases: ['Calendar management'],
      },
      commonPatterns: [
        {
          name: 'create_event',
          description: 'Create a new calendar event',
          config: { resource: 'event', operation: 'create', summary: '{{$json.title}}', start: { dateTime: '{{$json.startTime}}' }, end: { dateTime: '{{$json.endTime}}' } },
        },
        {
          name: 'list_upcoming_events',
          description: 'List upcoming events from calendar',
          config: { resource: 'event', operation: 'list', calendarId: 'primary', timeMin: '{{$now}}', maxResults: 10 },
        },
        {
          name: 'search_events',
          description: 'Search for events by query',
          config: { resource: 'event', operation: 'search', calendarId: 'primary', q: '{{$json.searchQuery}}' },
        },
      ],
      validationRules: [],
      capabilities: ['google.calendar', 'calendar.event'],
      providers: ['google'],
      keywords: ['google calendar', 'calendar'],
    };
  }

  private createGoogleContactsSchema(): NodeSchema {
    return {
      type: 'google_contacts',
      label: 'Google Contacts',
      category: 'google',
      description: 'Manage Google Contacts',
      configSchema: {
        required: ['operation'],
        optional: {
          operation: {
            type: 'string',
            description: 'Operation: create, read, update, delete',
            examples: ['create', 'read', 'update', 'delete'],
          },
          contactId: {
            type: 'string',
            description: 'Contact ID (for update/delete)',
            examples: ['contact-id'],
          },
        },
      },
      aiSelectionCriteria: {
        whenToUse: ['User mentions Google Contacts', 'Contact management'],
        whenNotToUse: ['Other contact systems'],
        keywords: ['google contacts', 'contacts'],
        useCases: ['Contact management'],
      },
      commonPatterns: [
        {
          name: 'create_contact',
          description: 'Create a new contact',
          config: { operation: 'create', name: '{{$json.name}}', email: '{{$json.email}}', phone: '{{$json.phone}}' },
        },
        {
          name: 'list_contacts',
          description: 'List all contacts',
          config: { operation: 'read' },
        },
        {
          name: 'update_contact',
          description: 'Update an existing contact',
          config: { operation: 'update', contactId: '{{$json.contactId}}', name: '{{$json.name}}' },
        },
      ],
      validationRules: [],
      capabilities: ['google.contacts', 'contact.manage'],
      providers: ['google'],
      keywords: ['google contacts', 'contacts'],
    };
  }

  private createGoogleTasksSchema(): NodeSchema {
    return {
      type: 'google_tasks',
      label: 'Google Tasks',
      category: 'google',
      description: 'Manage Google Tasks',
      configSchema: {
        required: ['operation'],
        optional: {
          operation: {
            type: 'string',
            description: 'Operation: create, read, update, delete',
            examples: ['create', 'read', 'update', 'delete'],
          },
          taskId: {
            type: 'string',
            description: 'Task ID (for update/delete)',
            examples: ['task-id'],
          },
        },
      },
      aiSelectionCriteria: {
        whenToUse: ['User mentions Google Tasks', 'Task management'],
        whenNotToUse: ['Other task systems'],
        keywords: ['google tasks', 'tasks'],
        useCases: ['Task management'],
      },
      commonPatterns: [
        {
          name: 'create_task',
          description: 'Create a new task',
          config: { operation: 'create', title: '{{$json.title}}', notes: '{{$json.description}}' },
        },
        {
          name: 'list_tasks',
          description: 'List all tasks',
          config: { operation: 'read' },
        },
        {
          name: 'complete_task',
          description: 'Mark a task as completed',
          config: { operation: 'update', taskId: '{{$json.taskId}}', status: 'completed' },
        },
      ],
      validationRules: [],
      capabilities: ['google.tasks', 'task.manage'],
      providers: ['google'],
      keywords: ['google tasks', 'tasks'],
    };
  }

  private createGoogleBigQuerySchema(): NodeSchema {
    return {
      type: 'google_bigquery',
      label: 'Google BigQuery',
      category: 'google',
      description: 'Query Google BigQuery data warehouse',
      configSchema: {
        required: ['query'],
        optional: {
          query: {
            type: 'string',
            description: 'SQL query',
            examples: ['SELECT * FROM dataset.table LIMIT 10'],
          },
          projectId: {
            type: 'string',
            description: 'Project ID',
            examples: ['my-project'],
          },
        },
      },
      aiSelectionCriteria: {
        whenToUse: ['User mentions BigQuery', 'Data warehouse queries'],
        whenNotToUse: ['Other databases'],
        keywords: ['bigquery', 'big query', 'data warehouse'],
        useCases: ['BigQuery queries'],
      },
      commonPatterns: [
        {
          name: 'query_data',
          description: 'Query data from BigQuery',
          config: { query: 'SELECT * FROM `project.dataset.table` LIMIT 100', projectId: '{{$json.projectId}}' },
        },
        {
          name: 'aggregate_query',
          description: 'Run an aggregation query',
          config: { query: 'SELECT COUNT(*) as total FROM `project.dataset.table`', projectId: '{{$json.projectId}}' },
        },
      ],
      validationRules: [],
      capabilities: ['google.bigquery', 'database.query'],
      providers: ['google'],
      keywords: ['bigquery'],
    };
  }

  // Missing Communication Nodes
  private createSlackWebhookSchema(): NodeSchema {
    return {
      type: 'slack_webhook',
      label: 'Slack Webhook',
      category: 'output',
      description: 'Send messages via Slack webhook',
      configSchema: {
        required: ['webhookUrl', 'message'],
        optional: {
          webhookUrl: {
            type: 'string',
            description: 'Slack webhook URL',
            examples: ['https://hooks.slack.com/services/...'],
          },
          message: {
            type: 'string',
            description: 'Message text',
            examples: ['{{$json.message}}'],
          },
        },
      },
      aiSelectionCriteria: {
        whenToUse: ['Slack webhook notifications', 'Simple Slack messages'],
        whenNotToUse: ['Complex Slack operations (use slack_message)'],
        keywords: ['slack webhook', 'slack notification'],
        useCases: ['Slack webhook messages'],
      },
      commonPatterns: [],
      validationRules: [],
      capabilities: ['notification.send', 'slack.send'],
      providers: ['slack'],
      keywords: ['slack webhook'],
    };
  }

  private createDiscordWebhookSchema(): NodeSchema {
    return {
      type: 'discord_webhook',
      label: 'Discord Webhook',
      category: 'output',
      description: 'Send messages via Discord webhook',
      configSchema: {
        required: ['webhookUrl', 'message'],
        optional: {
          webhookUrl: {
            type: 'string',
            description: 'Discord webhook URL',
            examples: ['https://discord.com/api/webhooks/...'],
          },
          message: {
            type: 'string',
            description: 'Message text',
            examples: ['{{$json.message}}'],
          },
        },
      },
      aiSelectionCriteria: {
        whenToUse: ['Discord webhook notifications', 'Simple Discord messages'],
        whenNotToUse: ['Complex Discord operations (use discord)'],
        keywords: ['discord webhook'],
        useCases: ['Discord webhook messages'],
      },
      commonPatterns: [],
      validationRules: [],
      capabilities: ['notification.send', 'discord.send'],
      providers: ['discord'],
      keywords: ['discord webhook'],
    };
  }

  private createMicrosoftTeamsSchema(): NodeSchema {
    return {
      type: 'microsoft_teams',
      label: 'Microsoft Teams',
      category: 'output',
      description: 'Send messages to Microsoft Teams',
      configSchema: {
        required: ['webhookUrl', 'message'],
        optional: {
          webhookUrl: {
            type: 'string',
            description: 'Teams webhook URL',
            examples: ['https://outlook.office.com/webhook/...'],
          },
          message: {
            type: 'string',
            description: 'Message text',
            examples: ['{{$json.message}}'],
          },
        },
      },
      aiSelectionCriteria: {
        whenToUse: ['User mentions Microsoft Teams', 'Teams notifications'],
        whenNotToUse: ['Other communication platforms'],
        keywords: ['teams', 'microsoft teams'],
        useCases: ['Teams notifications'],
      },
      commonPatterns: [],
      validationRules: [],
      capabilities: ['notification.send', 'teams.send'],
      providers: ['microsoft'],
      keywords: ['teams', 'microsoft teams'],
    };
  }

  private createWhatsappCloudSchema(): NodeSchema {
    return {
      type: 'whatsapp_cloud',
      label: 'WhatsApp Cloud',
      category: 'output',
      description: 'Send messages via WhatsApp Cloud API',
      configSchema: {
        required: ['resource', 'operation', 'phoneNumberId', 'to'],
        optional: {
          resource: {
            type: 'string',
            description: 'WhatsApp resource',
            examples: ['message', 'media', 'template'],
            default: 'message',
          },
          operation: {
            type: 'string',
            description: 'WhatsApp operation',
            examples: ['sendText', 'sendMedia', 'sendLocation', 'sendContact', 'sendReaction', 'sendTemplate'],
            default: 'sendText',
          },
          phoneNumberId: {
            type: 'string',
            description: 'WhatsApp Phone Number ID (required for message operations)',
          },
          to: {
            type: 'string',
            description: 'Recipient phone number',
            examples: ['+1234567890'],
          },
          text: {
            type: 'string',
            description: 'Text content (for sendText)',
            examples: ['{{$json.message}}'],
          },
          message: {
            type: 'string',
            description: 'Alias for text (legacy)',
          },
          mediaUrl: {
            type: 'string',
            description: 'Media URL (for sendMedia)',
          },
          // Credential fields (for credential discovery and injection)
          apiKey: {
            type: 'string',
            description: 'WhatsApp Cloud API Token (required for authentication)',
            examples: ['your-whatsapp-api-token'],
          },
          credentialId: {
            type: 'string',
            description: 'ID of the stored credential to use',
            examples: ['whatsapp_api_123'],
          },
        },
      },
      aiSelectionCriteria: {
        whenToUse: ['User mentions WhatsApp', 'WhatsApp messaging'],
        whenNotToUse: ['Other messaging platforms'],
        keywords: ['whatsapp', 'whats app'],
        useCases: ['WhatsApp messaging'],
      },
      commonPatterns: [],
      validationRules: [],
      capabilities: ['notification.send', 'whatsapp.send'],
      providers: ['whatsapp'],
      keywords: ['whatsapp'],
    };
  }

  private createTwilioSchema(): NodeSchema {
    return {
      type: 'twilio',
      label: 'Twilio',
      category: 'output',
      description: 'Send SMS/Voice via Twilio',
      configSchema: {
        required: ['to', 'message'],
        optional: {
          to: {
            type: 'string',
            description: 'Recipient phone number',
            examples: ['+1234567890'],
          },
          message: {
            type: 'string',
            description: 'SMS message text',
            examples: ['{{$json.message}}'],
          },
          from: {
            type: 'string',
            description: 'Sender phone number',
            examples: ['+1234567890'],
          },
          accountSid: {
            type: 'string',
            description: 'Twilio Account SID (optional if stored in Twilio vault credential JSON)',
            examples: ['ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'],
          },
          authToken: {
            type: 'string',
            description: 'Twilio Auth Token (optional if provided via vault)',
          },
        },
      },
      aiSelectionCriteria: {
        whenToUse: ['User mentions Twilio', 'SMS/Voice messaging'],
        whenNotToUse: ['Other messaging platforms'],
        keywords: ['twilio', 'sms', 'voice'],
        useCases: ['SMS/Voice messaging'],
      },
      commonPatterns: [],
      validationRules: [],
      capabilities: ['notification.send', 'twilio.sms', 'twilio.voice'],
      providers: ['twilio'],
      keywords: ['twilio'],
    };
  }

  // Missing Social Media Nodes
  private createFacebookSchema(): NodeSchema {
    return {
      type: 'facebook',
      label: 'Facebook',
      category: 'social',
      description: 'Post content to Facebook pages',
      configSchema: {
        required: ['message'],
        optional: {
          message: {
            type: 'string',
            description: 'Post message',
            examples: ['{{$json.message}}'],
          },
          pageId: {
            type: 'string',
            description: 'Facebook page ID',
            examples: ['page-id'],
          },
          // Credential fields (for credential discovery and injection)
          accessToken: {
            type: 'string',
            description: 'OAuth2 Access Token for Facebook (if using OAuth authentication)',
            examples: ['your-facebook-oauth-token'],
          },
          credentialId: {
            type: 'string',
            description: 'ID of the stored credential to use',
            examples: ['facebook_oauth_123'],
          },
        },
      },
      aiSelectionCriteria: {
        whenToUse: ['User mentions Facebook posting', 'Facebook automation'],
        whenNotToUse: ['Other social media platforms'],
        keywords: ['facebook', 'fb'],
        useCases: ['Facebook posting'],
      },
      commonPatterns: [],
      validationRules: [],
      capabilities: ['social.post', 'facebook.post'],
      providers: ['facebook'],
      keywords: ['facebook'],
    };
  }

  // Missing Database Nodes
  private createMysqlSchema(): NodeSchema {
    return {
      type: 'mysql',
      label: 'MySQL',
      category: 'database',
      description: 'MySQL database operations',
      configSchema: {
        required: ['query'],
        optional: {
          query: {
            type: 'string',
            description: 'SQL query',
            examples: ['SELECT * FROM users WHERE id = ?'],
          },
          parameters: {
            type: 'array',
            description: 'Query parameters',
            examples: [[1, 'value']],
          },
        },
      },
      aiSelectionCriteria: {
        whenToUse: ['User mentions MySQL', 'MySQL database operations'],
        whenNotToUse: ['Other databases'],
        keywords: ['mysql', 'my sql'],
        useCases: ['MySQL operations'],
      },
      commonPatterns: [
        {
          name: 'select_query',
          description: 'Execute a SELECT query',
          config: { query: 'SELECT * FROM users WHERE id = ?', parameters: ['{{$json.userId}}'] },
        },
        {
          name: 'insert_record',
          description: 'Insert a new record',
          config: { query: 'INSERT INTO users (name, email) VALUES (?, ?)', parameters: ['{{$json.name}}', '{{$json.email}}'] },
        },
        {
          name: 'update_record',
          description: 'Update an existing record',
          config: { query: 'UPDATE users SET name = ? WHERE id = ?', parameters: ['{{$json.name}}', '{{$json.userId}}'] },
        },
      ],
      validationRules: [],
      capabilities: ['database.read', 'database.write'],
      providers: ['mysql'],
      keywords: ['mysql'],
    };
  }

  private createMongodbSchema(): NodeSchema {
    return {
      type: 'mongodb',
      label: 'MongoDB',
      category: 'database',
      description: 'MongoDB database operations',
      configSchema: {
        required: ['operation', 'collection'],
        optional: {
          operation: {
            type: 'string',
            description: 'Operation: find, insert, update, delete',
            examples: ['find', 'insert', 'update', 'delete'],
          },
          collection: {
            type: 'string',
            description: 'Collection name',
            examples: ['users', 'products'],
          },
          query: {
            type: 'object',
            description: 'MongoDB query',
            examples: [{ name: 'John' }],
          },
        },
      },
      aiSelectionCriteria: {
        whenToUse: ['User mentions MongoDB', 'MongoDB operations'],
        whenNotToUse: ['SQL databases'],
        keywords: ['mongodb', 'mongo'],
        useCases: ['MongoDB operations'],
      },
      commonPatterns: [
        {
          name: 'find_documents',
          description: 'Find documents in a collection',
          config: { operation: 'find', collection: 'users', query: { status: 'active' } },
        },
        {
          name: 'insert_document',
          description: 'Insert a new document',
          config: { operation: 'insert', collection: 'users', document: { name: '{{$json.name}}', email: '{{$json.email}}' } },
        },
        {
          name: 'update_document',
          description: 'Update an existing document',
          config: { operation: 'update', collection: 'users', query: { _id: '{{$json.userId}}' }, update: { $set: { name: '{{$json.name}}' } } },
        },
      ],
      validationRules: [],
      capabilities: ['database.read', 'database.write'],
      providers: ['mongodb'],
      keywords: ['mongodb', 'mongo'],
    };
  }

  private createRedisSchema(): NodeSchema {
    return {
      type: 'redis',
      label: 'Redis',
      category: 'database',
      description: 'Redis cache operations',
      configSchema: {
        required: ['operation', 'key'],
        optional: {
          operation: {
            type: 'string',
            description: 'Operation: get, set, delete',
            examples: ['get', 'set', 'delete'],
          },
          key: {
            type: 'string',
            description: 'Redis key',
            examples: ['user:123'],
          },
          value: {
            type: 'string',
            description: 'Value (for set)',
            examples: ['{{$json.value}}'],
          },
        },
      },
      aiSelectionCriteria: {
        whenToUse: ['User mentions Redis', 'Cache operations'],
        whenNotToUse: ['Persistent databases'],
        keywords: ['redis', 'cache'],
        useCases: ['Redis cache operations'],
      },
      commonPatterns: [
        {
          name: 'get_value',
          description: 'Get a value from Redis cache',
          config: { operation: 'get', key: '{{$json.key}}' },
        },
        {
          name: 'set_value',
          description: 'Set a value in Redis cache',
          config: { operation: 'set', key: '{{$json.key}}', value: '{{$json.value}}' },
        },
        {
          name: 'delete_key',
          description: 'Delete a key from Redis',
          config: { operation: 'delete', key: '{{$json.key}}' },
        },
      ],
      validationRules: [],
      capabilities: ['cache.read', 'cache.write'],
      providers: ['redis'],
      keywords: ['redis'],
    };
  }

  // Missing CRM Nodes
  private createFreshdeskSchema(): NodeSchema {
    return {
      type: 'freshdesk',
      label: 'Freshdesk',
      category: 'crm',
      description: 'Freshdesk support operations',
      configSchema: {
        required: ['resource', 'operation'],
        optional: {
          domain: {
            type: 'string',
            description: 'Freshdesk domain (e.g., yourcompany.freshdesk.com)',
            examples: ['mycompany.freshdesk.com'],
          },
          apiKey: {
            type: 'string',
            description: 'Freshdesk API key (optional if stored in vault under key "freshdesk")',
          },
          resource: {
            type: 'string',
            description: 'Resource: ticket, contact, company',
            examples: ['ticket', 'contact', 'company'],
            default: 'ticket',
          },
          operation: {
            type: 'string',
            description: 'Operation: get, create, update, delete',
            examples: ['get', 'create', 'update', 'delete'],
          },
          id: {
            type: 'string',
            description: 'Resource ID (e.g., ticket ID for get/update/delete)',
            examples: ['12345'],
          },
          subject: {
            type: 'string',
            description: 'Ticket subject (create)',
          },
          descriptionText: {
            type: 'string',
            description: 'Ticket description (create)',
          },
          email: {
            type: 'string',
            description: 'Requester email (create)',
          },
          priority: {
            type: 'number',
            description: 'Priority (1=Low,2=Medium,3=High,4=Urgent)',
          },
          status: {
            type: 'number',
            description: 'Status (2=Open,3=Pending,4=Resolved,5=Closed)',
          },
          data: {
            type: 'object',
            description: 'Payload for create/update',
          },
        },
      },
      aiSelectionCriteria: {
        whenToUse: ['User mentions Freshdesk', 'Support ticket operations'],
        whenNotToUse: ['Other CRMs'],
        keywords: ['freshdesk', 'fresh desk'],
        useCases: ['Support ticket management'],
      },
      commonPatterns: [],
      validationRules: [],
      capabilities: ['crm.read', 'crm.write', 'freshdesk.ticket'],
      providers: ['freshdesk'],
      keywords: ['freshdesk'],
    };
  }

  private createIntercomSchema(): NodeSchema {
    return {
      type: 'intercom',
      label: 'Intercom',
      category: 'crm',
      description: 'Intercom messaging operations',
      configSchema: {
        required: ['operation'],
        optional: {
          operation: {
            type: 'string',
            description: 'Operation: send, get, list',
            examples: ['send', 'get', 'list'],
          },
          conversationId: {
            type: 'string',
            description: 'Conversation ID',
            examples: ['conv-id'],
          },
        },
      },
      aiSelectionCriteria: {
        whenToUse: ['User mentions Intercom', 'Intercom messaging'],
        whenNotToUse: ['Other messaging platforms'],
        keywords: ['intercom'],
        useCases: ['Intercom messaging'],
      },
      commonPatterns: [],
      validationRules: [],
      capabilities: ['messaging.send', 'intercom.message'],
      providers: ['intercom'],
      keywords: ['intercom'],
    };
  }

  private createMailchimpSchema(): NodeSchema {
    return {
      type: 'mailchimp',
      label: 'Mailchimp',
      category: 'crm',
      description: 'Mailchimp email marketing operations',
      configSchema: {
        required: ['operation'],
        optional: {
          operation: {
            type: 'string',
            description: 'Operation: subscribe, unsubscribe, send',
            examples: ['subscribe', 'unsubscribe', 'send'],
          },
          listId: {
            type: 'string',
            description: 'Mailchimp list ID',
            examples: ['list-id'],
          },
          email: {
            type: 'string',
            description: 'Email address',
            examples: ['{{$json.email}}'],
          },
        },
      },
      aiSelectionCriteria: {
        whenToUse: ['User mentions Mailchimp', 'Email marketing'],
        whenNotToUse: ['Other email platforms'],
        keywords: ['mailchimp', 'email marketing'],
        useCases: ['Email marketing'],
      },
      commonPatterns: [],
      validationRules: [],
      capabilities: ['email.marketing', 'mailchimp.subscribe'],
      providers: ['mailchimp'],
      keywords: ['mailchimp'],
    };
  }

  private createActivecampaignSchema(): NodeSchema {
    return {
      type: 'activecampaign',
      label: 'ActiveCampaign',
      category: 'crm',
      description: 'ActiveCampaign marketing automation',
      configSchema: {
        required: ['operation'],
        optional: {
          operation: {
            type: 'string',
            description: 'Operation: add, update, delete',
            examples: ['add', 'update', 'delete'],
          },
          contactId: {
            type: 'string',
            description: 'Contact ID',
            examples: ['contact-id'],
          },
        },
      },
      aiSelectionCriteria: {
        whenToUse: ['User mentions ActiveCampaign', 'Marketing automation'],
        whenNotToUse: ['Other marketing platforms'],
        keywords: ['activecampaign', 'active campaign'],
        useCases: ['Marketing automation'],
      },
      commonPatterns: [],
      validationRules: [],
      capabilities: ['marketing.automation', 'activecampaign.contact'],
      providers: ['activecampaign'],
      keywords: ['activecampaign'],
    };
  }

  // Missing File Nodes
  private createReadBinaryFileSchema(): NodeSchema {
    return {
      type: 'read_binary_file',
      label: 'Read Binary File',
      category: 'file',
      description: 'Read binary files',
      configSchema: {
        required: ['filePath'],
        optional: {
          filePath: {
            type: 'string',
            description: 'File path',
            examples: ['/path/to/file.pdf'],
          },
        },
      },
      aiSelectionCriteria: {
        whenToUse: ['Need to read binary files', 'File reading'],
        whenNotToUse: ['Text files'],
        keywords: ['read file', 'binary file'],
        useCases: ['File reading'],
      },
      commonPatterns: [],
      validationRules: [],
    };
  }

  private createWriteBinaryFileSchema(): NodeSchema {
    return {
      type: 'write_binary_file',
      label: 'Write Binary File',
      category: 'file',
      description: 'Write binary files',
      configSchema: {
        required: ['filePath', 'data'],
        optional: {
          filePath: {
            type: 'string',
            description: 'File path',
            examples: ['/path/to/file.pdf'],
          },
          data: {
            type: 'string',
            description: 'Binary data (base64)',
            examples: ['{{$json.data}}'],
          },
        },
      },
      aiSelectionCriteria: {
        whenToUse: ['Need to write binary files', 'File writing'],
        whenNotToUse: ['Text files'],
        keywords: ['write file', 'binary file'],
        useCases: ['File writing'],
      },
      commonPatterns: [],
      validationRules: [],
    };
  }

  private createAwsS3Schema(): NodeSchema {
    return {
      type: 'aws_s3',
      label: 'AWS S3',
      category: 'file',
      description: 'AWS S3 storage operations',
      configSchema: {
        required: ['operation', 'bucket'],
        optional: {
          region: {
            type: 'string',
            description: 'AWS region (default: us-east-1)',
            examples: ['us-east-1', 'eu-west-1', 'ap-south-1'],
            default: 'us-east-1',
          },
          accessKeyId: {
            type: 'string',
            description: 'AWS access key id (optional if using env/IAM role)',
            examples: ['AKIA...'],
          },
          secretAccessKey: {
            type: 'string',
            description: 'AWS secret access key (optional if using env/IAM role)',
          },
          sessionToken: {
            type: 'string',
            description: 'AWS session token (optional)',
          },
          operation: {
            type: 'string',
            description: 'Operation: upload, download, list',
            examples: ['upload', 'download', 'list'],
          },
          bucket: {
            type: 'string',
            description: 'S3 bucket name',
            examples: ['my-bucket'],
          },
          key: {
            type: 'string',
            description: 'Object key',
            examples: ['path/to/file.pdf'],
          },
          prefix: {
            type: 'string',
            description: 'Prefix for list operation',
            examples: ['folder/', ''],
          },
          dataBase64: {
            type: 'string',
            description: 'Base64 payload for upload (alternative to data)',
            examples: ['{{$json.dataBase64}}'],
          },
          data: {
            type: 'string',
            description: 'Base64 payload for upload',
            examples: ['{{$json.data}}'],
          },
        },
      },
      aiSelectionCriteria: {
        whenToUse: ['User mentions AWS S3', 'S3 storage operations'],
        whenNotToUse: ['Other storage systems'],
        keywords: ['s3', 'aws s3', 'amazon s3'],
        useCases: ['S3 storage'],
      },
      commonPatterns: [],
      validationRules: [],
      capabilities: ['storage.upload', 'storage.download', 's3.file'],
      providers: ['aws'],
      keywords: ['s3', 'aws s3'],
    };
  }

  private createDropboxSchema(): NodeSchema {
    return {
      type: 'dropbox',
      label: 'Dropbox',
      category: 'file',
      description: 'Dropbox file operations',
      configSchema: {
        required: ['operation'],
        optional: {
          operation: {
            type: 'string',
            description: 'Operation: upload, download, list',
            examples: ['upload', 'download', 'list'],
          },
          path: {
            type: 'string',
            description: 'File path',
            examples: ['/path/to/file.pdf'],
          },
          dataBase64: {
            type: 'string',
            description: 'Base64 payload for upload (alternative to data)',
            examples: ['{{$json.dataBase64}}'],
          },
          data: {
            type: 'string',
            description: 'Base64 payload for upload',
            examples: ['{{$json.data}}'],
          },
          recursive: {
            type: 'boolean',
            description: 'List recursively (list operation)',
            default: false,
          },
        },
      },
      aiSelectionCriteria: {
        whenToUse: ['User mentions Dropbox', 'Dropbox file operations'],
        whenNotToUse: ['Other storage systems'],
        keywords: ['dropbox'],
        useCases: ['Dropbox operations'],
      },
      commonPatterns: [],
      validationRules: [],
      capabilities: ['storage.upload', 'storage.download', 'dropbox.file'],
      providers: ['dropbox'],
      keywords: ['dropbox'],
    };
  }

  private createOnedriveSchema(): NodeSchema {
    return {
      type: 'onedrive',
      label: 'OneDrive',
      category: 'file',
      description: 'OneDrive file operations',
      configSchema: {
        required: ['operation'],
        optional: {
          operation: {
            type: 'string',
            description: 'Operation: upload, download, list',
            examples: ['upload', 'download', 'list'],
          },
          path: {
            type: 'string',
            description: 'File path',
            examples: ['/path/to/file.pdf'],
          },
          dataBase64: {
            type: 'string',
            description: 'Base64 payload for upload (alternative to data)',
            examples: ['{{$json.dataBase64}}'],
          },
          data: {
            type: 'string',
            description: 'Base64 payload for upload',
            examples: ['{{$json.data}}'],
          },
        },
      },
      aiSelectionCriteria: {
        whenToUse: ['User mentions OneDrive', 'OneDrive file operations'],
        whenNotToUse: ['Other storage systems'],
        keywords: ['onedrive', 'one drive'],
        useCases: ['OneDrive operations'],
      },
      commonPatterns: [],
      validationRules: [],
      capabilities: ['storage.upload', 'storage.download', 'onedrive.file'],
      providers: ['microsoft'],
      keywords: ['onedrive'],
    };
  }

  private createFtpSchema(): NodeSchema {
    return {
      type: 'ftp',
      label: 'FTP',
      category: 'file',
      description: 'FTP file operations',
      configSchema: {
        required: ['operation', 'host'],
        optional: {
          operation: {
            type: 'string',
            description: 'Operation: upload, download, list',
            examples: ['upload', 'download', 'list'],
          },
          host: {
            type: 'string',
            description: 'FTP host',
            examples: ['ftp.example.com'],
          },
          path: {
            type: 'string',
            description: 'File path',
            examples: ['/path/to/file.pdf'],
          },
        },
      },
      aiSelectionCriteria: {
        whenToUse: ['User mentions FTP', 'FTP file operations'],
        whenNotToUse: ['Other storage systems'],
        keywords: ['ftp'],
        useCases: ['FTP operations'],
      },
      commonPatterns: [],
      validationRules: [],
      capabilities: ['storage.upload', 'storage.download', 'ftp.file'],
      providers: ['ftp'],
      keywords: ['ftp'],
    };
  }

  private createSftpSchema(): NodeSchema {
    return {
      type: 'sftp',
      label: 'SFTP',
      category: 'file',
      description: 'SFTP file operations',
      configSchema: {
        required: ['operation', 'host'],
        optional: {
          operation: {
            type: 'string',
            description: 'Operation: upload, download, list',
            examples: ['upload', 'download', 'list'],
          },
          host: {
            type: 'string',
            description: 'SFTP host',
            examples: ['sftp.example.com'],
          },
          path: {
            type: 'string',
            description: 'File path',
            examples: ['/path/to/file.pdf'],
          },
        },
      },
      aiSelectionCriteria: {
        whenToUse: ['User mentions SFTP', 'SFTP file operations'],
        whenNotToUse: ['Other storage systems'],
        keywords: ['sftp', 'secure ftp'],
        useCases: ['SFTP operations'],
      },
      commonPatterns: [],
      validationRules: [],
      capabilities: ['storage.upload', 'storage.download', 'sftp.file'],
      providers: ['sftp'],
      keywords: ['sftp'],
    };
  }

  // Missing DevOps Nodes
  private createGithubSchema(): NodeSchema {
    return {
      type: 'github',
      label: 'GitHub',
      category: 'devops',
      description: 'GitHub repository operations',
      configSchema: {
        required: ['operation'],
        optional: {
          operation: {
            type: 'string',
            description: 'GitHub operation (legacy/dispatcher): create_issue, add_issue_comment, create_pr, trigger_workflow, list_repos, get_user, etc.',
            examples: ['create_issue', 'add_issue_comment', 'create_pr', 'trigger_workflow', 'list_repos'],
            default: 'create_issue',
          },
          owner: {
            type: 'string',
            description: 'Repository owner (user/org)',
            examples: ['octocat'],
          },
          repo: {
            type: 'string',
            description: 'Repository name',
            examples: ['hello-world'],
          },
          title: {
            type: 'string',
            description: 'Issue/PR title',
          },
          body: {
            type: 'string',
            description: 'Issue/PR body or comment text',
          },
          issueNumber: {
            type: 'number',
            description: 'Issue number (for comments/updates)',
          },
          comment: {
            type: 'string',
            description: 'Issue comment text (for add_issue_comment)',
          },
          labels: {
            type: 'array',
            description: 'Issue labels (array of strings)',
          },
          ref: {
            type: 'string',
            description: 'Base branch/ref (for PR/workflow)',
            examples: ['main'],
          },
          branchName: {
            type: 'string',
            description: 'Head branch name (for PR)',
          },
          workflowId: {
            type: 'string',
            description: 'Workflow ID or filename (for trigger_workflow)',
          },
          // Credential fields (for credential discovery and injection)
          accessToken: {
            type: 'string',
            description: 'OAuth2 Access Token for GitHub (if using OAuth authentication)',
            examples: ['your-github-oauth-token'],
          },
          apiKey: {
            type: 'string',
            description: 'GitHub Personal Access Token (alternative to OAuth)',
            examples: ['ghp_xxxxxxxxxxxxxxxxxxxx'],
          },
          credentialId: {
            type: 'string',
            description: 'ID of the stored credential to use',
            examples: ['github_oauth_123'],
          },
        },
      },
      aiSelectionCriteria: {
        whenToUse: ['User mentions GitHub', 'GitHub operations'],
        whenNotToUse: ['Other git platforms'],
        keywords: ['github', 'git hub'],
        useCases: ['GitHub operations'],
      },
      commonPatterns: [
        {
          name: 'create_issue',
          description: 'Create a new GitHub issue',
          config: { operation: 'create_issue', owner: '{{$json.owner}}', repo: '{{$json.repo}}', title: '{{$json.title}}', body: '{{$json.body}}' },
        },
        {
          name: 'list_issues',
          description: 'List issues from a repository',
          config: { operation: 'list_issues', owner: '{{$json.owner}}', repo: '{{$json.repo}}' },
        },
        {
          name: 'create_pull_request',
          description: 'Create a pull request',
          config: { operation: 'create_pull_request', owner: '{{$json.owner}}', repo: '{{$json.repo}}', title: '{{$json.title}}', body: '{{$json.body}}', head: '{{$json.branch}}', base: 'main' },
        },
      ],
      validationRules: [],
      capabilities: ['git.manage', 'github.repo'],
      providers: ['github'],
      keywords: ['github'],
    };
  }

  private createGitlabSchema(): NodeSchema {
    return {
      type: 'gitlab',
      label: 'GitLab',
      category: 'devops',
      description: 'GitLab repository operations',
      configSchema: {
        required: ['operation'],
        optional: {
          baseUrl: {
            type: 'string',
            description: 'GitLab API base URL (default: https://gitlab.com/api/v4)',
            examples: ['https://gitlab.com/api/v4', 'https://gitlab.mycompany.com/api/v4'],
            default: 'https://gitlab.com/api/v4',
          },
          operation: {
            type: 'string',
            description: 'Operation: create, read, update, delete',
            examples: ['create', 'read', 'update', 'delete'],
          },
          repo: {
            type: 'string',
            description: 'Repository name',
            examples: ['owner/repo'],
          },
          projectId: {
            type: 'string',
            description: 'Project ID or URL-encoded path (e.g., group%2Fproject)',
            examples: ['123', 'mygroup%2Fmyproj'],
          },
          issueIid: {
            type: 'string',
            description: 'Issue IID (project-scoped issue number)',
            examples: ['1'],
          },
          title: {
            type: 'string',
            description: 'Issue title (create)',
          },
          descriptionText: {
            type: 'string',
            description: 'Issue description (create)',
          },
        },
      },
      aiSelectionCriteria: {
        whenToUse: ['User mentions GitLab', 'GitLab operations'],
        whenNotToUse: ['Other git platforms'],
        keywords: ['gitlab', 'git lab'],
        useCases: ['GitLab operations'],
      },
      commonPatterns: [],
      validationRules: [],
      capabilities: ['git.manage', 'gitlab.repo'],
      providers: ['gitlab'],
      keywords: ['gitlab'],
    };
  }

  private createBitbucketSchema(): NodeSchema {
    return {
      type: 'bitbucket',
      label: 'Bitbucket',
      category: 'devops',
      description: 'Bitbucket repository operations',
      configSchema: {
        required: ['operation'],
        optional: {
          operation: {
            type: 'string',
            description: 'Operation: create, read, update, delete',
            examples: ['create', 'read', 'update', 'delete'],
          },
          repo: {
            type: 'string',
            description: 'Repository name',
            examples: ['owner/repo'],
          },
        },
      },
      aiSelectionCriteria: {
        whenToUse: ['User mentions Bitbucket', 'Bitbucket operations'],
        whenNotToUse: ['Other git platforms'],
        keywords: ['bitbucket', 'bit bucket'],
        useCases: ['Bitbucket operations'],
      },
      commonPatterns: [],
      validationRules: [],
      capabilities: ['git.manage', 'bitbucket.repo'],
      providers: ['bitbucket'],
      keywords: ['bitbucket'],
    };
  }

  private createJiraSchema(): NodeSchema {
    return {
      type: 'jira',
      label: 'Jira',
      category: 'devops',
      description: 'Jira issue tracking operations',
      configSchema: {
        required: ['operation'],
        optional: {
          baseUrl: {
            type: 'string',
            description: 'Jira base URL (e.g., https://your-domain.atlassian.net)',
            examples: ['https://mycompany.atlassian.net'],
          },
          email: {
            type: 'string',
            description: 'Jira account email (for basic auth with API token)',
            examples: ['user@company.com'],
          },
          apiToken: {
            type: 'string',
            description: 'Jira API token (optional if stored in vault under key "jira")',
          },
          operation: {
            type: 'string',
            description: 'Operation: create, read, update, delete',
            examples: ['create', 'read', 'update', 'delete'],
          },
          issueKey: {
            type: 'string',
            description: 'Issue key (for read/update/delete)',
            examples: ['PROJ-123'],
          },
          projectKey: {
            type: 'string',
            description: 'Project key (create)',
            examples: ['PROJ'],
          },
          summary: {
            type: 'string',
            description: 'Issue summary/title (create)',
          },
          descriptionText: {
            type: 'string',
            description: 'Issue description (create/update)',
          },
          issueType: {
            type: 'string',
            description: 'Issue type (default: Task)',
            examples: ['Task', 'Bug', 'Story'],
            default: 'Task',
          },
        },
      },
      aiSelectionCriteria: {
        whenToUse: ['User mentions Jira', 'Issue tracking'],
        whenNotToUse: ['Other issue trackers'],
        keywords: ['jira', 'issue tracking'],
        useCases: ['Jira operations'],
      },
      commonPatterns: [],
      validationRules: [],
      capabilities: ['issue.manage', 'jira.issue'],
      providers: ['jira'],
      keywords: ['jira'],
    };
  }

  private createJenkinsSchema(): NodeSchema {
    return {
      type: 'jenkins',
      label: 'Jenkins',
      category: 'devops',
      description: 'Jenkins CI/CD operations',
      configSchema: {
        required: ['operation'],
        optional: {
          operation: {
            type: 'string',
            description: 'Operation: build, status, cancel',
            examples: ['build', 'status', 'cancel'],
          },
          jobName: {
            type: 'string',
            description: 'Jenkins job name',
            examples: ['my-job'],
          },
        },
      },
      aiSelectionCriteria: {
        whenToUse: ['User mentions Jenkins', 'CI/CD operations'],
        whenNotToUse: ['Other CI/CD platforms'],
        keywords: ['jenkins', 'ci/cd'],
        useCases: ['Jenkins operations'],
      },
      commonPatterns: [],
      validationRules: [],
      capabilities: ['ci.build', 'jenkins.job'],
      providers: ['jenkins'],
      keywords: ['jenkins'],
    };
  }

  // Missing E-commerce Nodes
  private createShopifySchema(): NodeSchema {
    return {
      type: 'shopify',
      label: 'Shopify',
      category: 'ecommerce',
      description: 'Shopify store operations',
      configSchema: {
        required: ['resource', 'operation'],
        optional: {
          shopDomain: {
            type: 'string',
            description: 'Shopify shop domain (e.g., your-store.myshopify.com)',
            examples: ['my-store.myshopify.com'],
          },
          apiKey: {
            type: 'string',
            description: 'Shopify Admin API access token (optional if stored in vault under key "shopify")',
            examples: ['shpat_...'],
          },
          resource: {
            type: 'string',
            description: 'Resource: product, order, customer',
            examples: ['product', 'order', 'customer'],
            default: 'product',
          },
          operation: {
            type: 'string',
            description: 'Operation: get, create, update, delete',
            examples: ['get', 'create', 'update', 'delete'],
          },
          id: {
            type: 'string',
            description: 'Resource ID (for get/update/delete). Alias for productId/orderId/customerId.',
            examples: ['1234567890'],
          },
          productId: {
            type: 'string',
            description: 'Product ID',
            examples: ['1234567890'],
          },
          orderId: {
            type: 'string',
            description: 'Order ID',
            examples: ['1234567890'],
          },
          customerId: {
            type: 'string',
            description: 'Customer ID',
            examples: ['1234567890'],
          },
          data: {
            type: 'object',
            description: 'Payload for create/update (resource wrapper is added automatically)',
            examples: [{ title: 'New product' }],
          },
          limit: {
            type: 'number',
            description: 'List limit (for list operation)',
            default: 50,
          },
        },
      },
      aiSelectionCriteria: {
        whenToUse: ['User mentions Shopify', 'Shopify store operations'],
        whenNotToUse: ['Other e-commerce platforms'],
        keywords: ['shopify'],
        useCases: ['Shopify operations'],
      },
      commonPatterns: [
        {
          name: 'get_product',
          description: 'Get a product from Shopify',
          config: { resource: 'product', operation: 'get', productId: '{{$json.productId}}' },
        },
        {
          name: 'create_order',
          description: 'Create a new order',
          config: { resource: 'order', operation: 'create', orderData: { line_items: '{{$json.items}}' } },
        },
        {
          name: 'list_customers',
          description: 'List customers',
          config: { resource: 'customer', operation: 'get' },
        },
      ],
      validationRules: [],
      capabilities: ['ecommerce.manage', 'shopify.product'],
      providers: ['shopify'],
      keywords: ['shopify'],
    };
  }

  private createWooCommerceSchema(): NodeSchema {
    return {
      type: 'woocommerce',
      label: 'WooCommerce',
      category: 'ecommerce',
      description: 'WooCommerce store operations',
      configSchema: {
        required: ['resource', 'operation'],
        optional: {
          storeUrl: {
            type: 'string',
            description: 'WooCommerce store base URL (e.g., https://example.com)',
            examples: ['https://example.com'],
          },
          apiKey: {
            type: 'string',
            description: 'WooCommerce consumer key (optional if stored in vault under key "woocommerce")',
            examples: ['ck_...'],
          },
          apiSecret: {
            type: 'string',
            description: 'WooCommerce consumer secret (optional if stored in vault under key "woocommerce")',
            examples: ['cs_...'],
          },
          resource: {
            type: 'string',
            description: 'Resource: product, order, customer',
            examples: ['product', 'order', 'customer'],
            default: 'product',
          },
          operation: {
            type: 'string',
            description: 'Operation: get, create, update, delete',
            examples: ['get', 'create', 'update', 'delete'],
          },
          id: {
            type: 'string',
            description: 'Resource ID (for get/update/delete)',
            examples: ['123'],
          },
          data: {
            type: 'object',
            description: 'Payload for create/update',
          },
          perPage: {
            type: 'number',
            description: 'List page size',
            default: 50,
          },
        },
      },
      aiSelectionCriteria: {
        whenToUse: ['User mentions WooCommerce', 'WooCommerce operations'],
        whenNotToUse: ['Other e-commerce platforms'],
        keywords: ['woocommerce', 'woo commerce'],
        useCases: ['WooCommerce operations'],
      },
      commonPatterns: [
        {
          name: 'get_product',
          description: 'Get a product from WooCommerce',
          config: { resource: 'product', operation: 'get', productId: '{{$json.productId}}' },
        },
        {
          name: 'create_order',
          description: 'Create a new order',
          config: { resource: 'order', operation: 'create', orderData: { line_items: '{{$json.items}}' } },
        },
        {
          name: 'list_orders',
          description: 'List orders',
          config: { resource: 'order', operation: 'get' },
        },
      ],
      validationRules: [],
      capabilities: ['ecommerce.manage', 'woocommerce.product'],
      providers: ['woocommerce'],
      keywords: ['woocommerce'],
    };
  }

  private createStripeSchema(): NodeSchema {
    return {
      type: 'stripe',
      label: 'Stripe',
      category: 'ecommerce',
      description: 'Stripe payment processing',
      configSchema: {
        required: ['operation'],
        optional: {
          apiKey: {
            type: 'string',
            description: 'Stripe secret key (optional if stored in vault under key "stripe")',
            examples: ['sk_live_...'],
          },
          operation: {
            type: 'string',
            description: 'Operation: charge, refund, createCustomer',
            examples: ['charge', 'refund', 'createCustomer'],
          },
          amount: {
            type: 'number',
            description: 'Payment amount (in cents)',
            examples: [1000, 5000],
          },
          currency: {
            type: 'string',
            description: 'Currency (default: usd)',
            examples: ['usd', 'eur', 'inr'],
            default: 'usd',
          },
          description: {
            type: 'string',
            description: 'Description for the charge/payment',
          },
          source: {
            type: 'string',
            description: 'Legacy charge source token (for /v1/charges)',
            examples: ['tok_visa'],
          },
          paymentMethodId: {
            type: 'string',
            description: 'Payment method ID (for PaymentIntents)',
            examples: ['pm_...'],
          },
          customerId: {
            type: 'string',
            description: 'Stripe customer ID',
            examples: ['cus_...'],
          },
          email: {
            type: 'string',
            description: 'Customer email (for createCustomer)',
          },
          name: {
            type: 'string',
            description: 'Customer name (for createCustomer)',
          },
          chargeId: {
            type: 'string',
            description: 'Charge ID (for refund)',
            examples: ['ch_...'],
          },
          paymentIntentId: {
            type: 'string',
            description: 'PaymentIntent ID (for refund)',
            examples: ['pi_...'],
          },
        },
      },
      aiSelectionCriteria: {
        whenToUse: ['User mentions Stripe', 'Payment processing'],
        whenNotToUse: ['Other payment platforms'],
        keywords: ['stripe', 'payment'],
        useCases: ['Payment processing'],
      },
      commonPatterns: [
        {
          name: 'charge_customer',
          description: 'Charge a customer for a payment',
          config: { operation: 'charge', amount: '{{$json.amount}}', currency: 'usd', source: '{{$json.token}}' },
        },
        {
          name: 'create_customer',
          description: 'Create a new Stripe customer',
          config: { operation: 'createCustomer', email: '{{$json.email}}', name: '{{$json.name}}' },
        },
        {
          name: 'process_refund',
          description: 'Refund a payment',
          config: { operation: 'refund', chargeId: '{{$json.chargeId}}', amount: '{{$json.amount}}' },
        },
      ],
      validationRules: [],
      capabilities: ['payment.process', 'stripe.charge'],
      providers: ['stripe'],
      keywords: ['stripe'],
    };
  }

  private createPaypalSchema(): NodeSchema {
    return {
      type: 'paypal',
      label: 'PayPal',
      category: 'ecommerce',
      description: 'PayPal payment processing',
      configSchema: {
        required: ['operation'],
        optional: {
          accessToken: {
            type: 'string',
            description: 'PayPal access token (optional if stored in vault under key "paypal")',
          },
          environment: {
            type: 'string',
            description: 'PayPal environment',
            examples: ['sandbox', 'live'],
            default: 'live',
          },
          operation: {
            type: 'string',
            description: 'Operation: charge, refund',
            examples: ['charge', 'refund'],
          },
          amount: {
            type: 'number',
            description: 'Payment amount',
            examples: [10.00, 50.00],
          },
          currency: {
            type: 'string',
            description: 'Currency (default: USD)',
            examples: ['USD', 'EUR', 'INR'],
            default: 'USD',
          },
          description: {
            type: 'string',
            description: 'Description for the payment/order',
          },
          paymentId: {
            type: 'string',
            description: 'PayPal capture ID (for refund)',
            examples: ['3C12345678901234A'],
          },
          autoCapture: {
            type: 'boolean',
            description: 'If true, capture immediately after creating order',
            default: true,
          },
        },
      },
      aiSelectionCriteria: {
        whenToUse: ['User mentions PayPal', 'PayPal payments'],
        whenNotToUse: ['Other payment platforms'],
        keywords: ['paypal', 'pay pal'],
        useCases: ['PayPal payments'],
      },
      commonPatterns: [
        {
          name: 'process_payment',
          description: 'Process a PayPal payment',
          config: { operation: 'charge', amount: '{{$json.amount}}', currency: 'USD', description: '{{$json.description}}' },
        },
        {
          name: 'refund_payment',
          description: 'Refund a PayPal payment',
          config: { operation: 'refund', paymentId: '{{$json.paymentId}}', amount: '{{$json.amount}}' },
        },
      ],
      validationRules: [],
      capabilities: ['payment.process', 'paypal.charge'],
      providers: ['paypal'],
      keywords: ['paypal'],
    };
  }

  /**
   * Register virtual node types (aliases)
   * These aliases point to canonical node types and are treated as valid node types
   */
  private registerVirtualNodeTypes(): void {
    console.log('[NodeLibrary] 🔗 Registering virtual node types (aliases)...');
    
    // Define alias mappings: alias → canonical type
    // NOTE: "gmail" is NOT registered as a virtual node - it's only a keyword/pattern in google_gmail schema
    // The node-type-resolver.ts handles "gmail" → "google_gmail" resolution via alias mapping
    const aliasMappings: Array<{ alias: string; canonical: string }> = [
      // Removed: { alias: 'gmail', canonical: 'google_gmail' } - NOT a separate node type, only a keyword
      { alias: 'mail', canonical: 'email' },
      { alias: 'ai', canonical: 'ai_service' },
    ];
    
    let registeredCount = 0;
    
    for (const { alias, canonical } of aliasMappings) {
      // Get the canonical schema
      const canonicalSchema = this.schemas.get(canonical);
      
      if (!canonicalSchema) {
        console.warn(`[NodeLibrary] ⚠️  Cannot register alias "${alias}" → "${canonical}": canonical type not found`);
        continue;
      }
      
      // Create virtual schema that points to canonical schema
      const virtualSchema: NodeSchema = {
        ...canonicalSchema,
        type: alias, // Override type to be the alias
        // Mark as virtual/alias in description
        description: `${canonicalSchema.description} (alias: ${canonical})`,
      };
      
      // Register the alias as a valid node type
      this.schemas.set(alias, virtualSchema);
      registeredCount++;
      
      console.log(`[NodeLibrary] ✅ Registered virtual node type: "${alias}" → "${canonical}"`);
    }
    
    console.log(`[NodeLibrary] ✅ Registered ${registeredCount} virtual node type(s) (aliases)`);
  }
}

// Export singleton instance
export const nodeLibrary = new NodeLibrary();
