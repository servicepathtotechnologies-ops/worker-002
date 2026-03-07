/**
 * NodeTypeNormalizationService
 * 
 * Normalizes and validates node types before workflow generation.
 * 
 * Responsibilities:
 * 1. Map abstract types to real node types (e.g., ai_summary → text_summarizer)
 * 2. Validate all node types exist in NodeLibrary
 * 3. Replace invalid types with valid ones
 * 4. Throw error if types cannot be resolved
 * 
 * This service ensures workflow_builder never receives invalid node types.
 */

import { nodeLibrary } from '../nodes/node-library';
import { resolveNodeType } from '../../core/utils/node-type-resolver-util';
import { StructuredIntent } from './intent-structurer';
import { WorkflowStructure } from './workflow-structure-builder';
import { WorkflowNode, Workflow } from '../../core/types/ai-types';
import { unifiedNormalizeNodeTypeString } from '../../core/utils/unified-node-type-normalizer';
import { capabilityResolver } from './capability-resolver';

/**
 * Comprehensive Profession/Category to node type mappings
 * 
 * Based on real-world use cases from 15+ enterprise workflows:
 * - Sales, CRM, Marketing, Support, E-commerce, Finance, DevOps, Data Management,
 *   Content Generation, Education, Healthcare, Real Estate, Legal, Productivity, etc.
 * 
 * IMPORTANT: Nodes can be HYBRID - belonging to multiple categories
 * Example: 'airtable' is in CRM, Sales, Data Management, Education, Real Estate
 * 
 * Priority order: preferred nodes first, then fallbacks
 */
const PROFESSION_CATEGORY_MAPPINGS: Record<string, string[]> = {
  // ========== CORE BUSINESS CATEGORIES ==========
  
  // CRM - Customer Relationship Management
  'crm': ['airtable', 'hubspot', 'salesforce', 'zoho_crm', 'pipedrive', 'activecampaign', 'mailchimp', 'freshdesk', 'intercom'],
  
  // Sales - Sales processes, lead management, funnel automation
  'sales': ['salesforce', 'hubspot', 'pipedrive', 'zoho_crm', 'airtable', 'google_sheets', 'slack_message', 'email', 'google_gmail', 'google_contacts', 'if_else', 'switch', 'filter'],
  
  // Marketing - Campaigns, content distribution, social media
  'marketing': ['mailchimp', 'activecampaign', 'linkedin', 'instagram', 'facebook', 'twitter', 'youtube', 'openai_gpt', 'anthropic_claude', 'google_gemini', 'text_formatter', 'schedule', 'google_drive'],
  
  // Support - Customer support, ticketing, helpdesk
  'support': ['freshdesk', 'intercom', 'ai_chat_model', 'ai_agent', 'sentiment_analyzer', 'slack_message', 'slack_webhook', 'microsoft_teams', 'email', 'switch', 'if_else', 'webhook'],
  
  // E-commerce - Online stores, orders, inventory
  'ecommerce': ['shopify', 'woocommerce', 'stripe', 'paypal', 'mysql', 'postgresql', 'aggregate', 'split_in_batches', 'loop', 'whatsapp_cloud', 'twilio', 'aws_s3'],
  
  // Finance - Financial operations, payments, accounting
  'finance': ['stripe', 'paypal', 'aggregate', 'filter', 'if_else', 'database_write', 'database_read', 'google_sheets', 'email', 'slack_message'],
  
  // Accounting - Financial reconciliation, bookkeeping
  'accounting': ['stripe', 'paypal', 'aggregate', 'filter', 'if_else', 'stop_and_error', 'error_handler', 'interval', 'database_write', 'google_sheets'],
  
  // ========== TECHNICAL/IT CATEGORIES ==========
  
  // DevOps - CI/CD, monitoring, infrastructure
  'devops': ['github', 'gitlab', 'bitbucket', 'jenkins', 'jira', 'if_else', 'discord', 'telegram', 'log_output', 'webhook', 'error_handler'],
  
  // IT - IT operations, system integration
  'it': ['github', 'gitlab', 'bitbucket', 'jenkins', 'jira', 'webhook', 'http_request', 'graphql', 'database_read', 'database_write', 'error_handler'],
  
  // Integration - System integration, API orchestration
  'integration': ['webhook', 'webhook_response', 'http_request', 'http_post', 'graphql', 'respond_to_webhook', 'switch', 'if_else', 'merge'],
  
  // Monitoring - System monitoring, alerts, logging
  'monitoring': ['log_output', 'slack_message', 'telegram', 'discord', 'discord_webhook', 'email', 'error_handler', 'error_trigger'],
  
  // ========== DATA & ANALYTICS CATEGORIES ==========
  
  // Database - Database operations
  'database': ['database_write', 'database_read', 'postgresql', 'mysql', 'supabase', 'mongodb', 'redis'],
  
  // Data Management - Data processing, migration, transformation
  'data_management': ['database_read', 'database_write', 'postgresql', 'mysql', 'mongodb', 'supabase', 'redis', 'split_in_batches', 'loop', 'json_parser', 'edit_fields', 'rename_keys', 'aggregate', 'airtable', 'notion'],
  
  // Analytics - Data analysis, reporting
  'analytics': ['aggregate', 'sort', 'limit', 'filter', 'google_sheets', 'google_doc', 'google_big_query', 'airtable', 'notion', 'csv', 'database_read'],
  
  // Reporting - Report generation
  'reporting': ['google_sheets', 'google_doc', 'google_big_query', 'airtable', 'notion', 'csv', 'text_formatter', 'interval', 'database_read'],
  
  // ========== CONTENT & DOCUMENT CATEGORIES ==========
  
  // Content Generation - AI content creation
  'content_generation': ['openai_gpt', 'anthropic_claude', 'google_gemini', 'ollama', 'ai_chat_model', 'text_formatter', 'text_summarizer', 'linkedin', 'instagram', 'facebook', 'twitter', 'youtube'],
  
  // Document Management - Document processing, storage
  'document_management': ['read_binary_file', 'write_binary_file', 'dropbox', 'onedrive', 'ftp', 'sftp', 'aws_s3', 'google_drive', 'text_summarizer', 'rename_keys', 'xml', 'html'],
  
  // Legal - Legal document processing
  'legal': ['read_binary_file', 'write_binary_file', 'ollama', 'text_summarizer', 'rename_keys', 'dropbox', 'onedrive', 'xml', 'html', 'database_write'],
  
  // ========== COMMUNICATION CATEGORIES ==========
  
  // Communication - General communication tools
  'communication': ['slack_message', 'slack_webhook', 'google_gmail', 'email', 'outlook', 'telegram', 'discord', 'discord_webhook', 'microsoft_teams', 'whatsapp_cloud', 'twilio'],
  
  // Email - Email operations
  // ✅ CRITICAL: "gmail" is NOT a standalone node type. Always use canonical "google_gmail".
  // Including "gmail" here would cause category resolution to look up a non-existent schema
  // and log noisy "Node type not found: \"gmail\"" warnings in NodeLibrary.
  'email': ['google_gmail', 'email', 'outlook'],
  
  // Social Media - Social platform integration
  'social_media': ['linkedin', 'instagram', 'facebook', 'twitter', 'youtube', 'openai_gpt', 'anthropic_claude', 'google_gemini', 'text_formatter', 'schedule'],
  
  // ========== PRODUCTIVITY CATEGORIES ==========
  
  // Productivity - Productivity tools, task management
  'productivity': ['google_calendar', 'google_tasks', 'google_gmail', 'outlook', 'notion', 'clickup', 'airtable', 'date_time', 'text_formatter', 'schedule'],
  
  // Calendar - Calendar management
  'calendar': ['google_calendar', 'google_tasks', 'date_time', 'schedule', 'google_gmail', 'outlook'],
  
  // ========== AI & AUTOMATION CATEGORIES ==========
  
  // AI - Artificial intelligence operations
  'ai': ['ai_agent', 'ai_chat_model', 'ai_service', 'openai_gpt', 'anthropic_claude', 'google_gemini', 'ollama', 'text_summarizer', 'sentiment_analyzer', 'memory', 'tool'],
  
  // Automation - Workflow automation
  'automation': ['schedule', 'interval', 'webhook', 'if_else', 'switch', 'loop', 'merge', 'function', 'function_item', 'noop'],
  
  // Chatbot - AI chatbot functionality
  'chatbot': ['chat_trigger', 'ai_agent', 'memory', 'tool', 'http_request', 'graphql', 'function', 'function_item', 'merge', 'noop'],
  
  // ========== DOMAIN-SPECIFIC CATEGORIES ==========
  
  // Education - Educational workflows, student management
  'education': ['form', 'database_write', 'supabase', 'ai_service', 'sentiment_analyzer', 'slack_webhook', 'merge', 'google_sheets', 'airtable', 'notion', 'email', 'schedule', 'interval'],
  
  // Healthcare - Healthcare workflows, patient management
  'healthcare': ['form', 'database_write', 'postgresql', 'mysql', 'supabase', 'schedule', 'interval', 'if_else', 'email', 'slack_message', 'twilio', 'whatsapp_cloud', 'date_time'],
  
  // Medical - Medical workflows, prescriptions, appointments
  'medical': ['schedule', 'interval', 'date_time', 'if_else', 'email', 'slack_message', 'twilio', 'whatsapp_cloud', 'database_write', 'postgresql', 'mysql', 'supabase'],
  
  // Real Estate - Real estate workflows, property management
  'real_estate': ['airtable', 'google_sheets', 'notion', 'database_write', 'postgresql', 'mysql', 'email', 'google_gmail', 'slack_message', 'form', 'webhook'],
  
  // SaaS - Software as a Service workflows
  'saas': ['form', 'database_write', 'supabase', 'ai_service', 'sentiment_analyzer', 'slack_webhook', 'merge', 'interval', 'schedule', 'webhook'],
  
  // ========== INFRASTRUCTURE CATEGORIES ==========
  
  // Website - Web-related operations
  'website': ['http_request', 'webhook', 'webhook_response', 'http_post', 'respond_to_webhook', 'graphql'],
  
  // Storage - File and data storage
  'storage': ['aws_s3', 'google_drive', 'dropbox', 'onedrive', 'ftp', 'sftp', 'read_binary_file', 'write_binary_file'],
  
  // Spreadsheet - Spreadsheet operations
  'spreadsheet': ['google_sheets', 'airtable', 'csv'],
  
  // ========== WORKFLOW CONTROL CATEGORIES ==========
  
  // Error Handling - Error management and recovery
  'error_handling': ['error_trigger', 'error_handler', 'wait', 'if_else', 'log_output', 'slack_message', 'telegram', 'discord_webhook'],
  
  // Logic - Conditional logic and flow control
  'logic': ['if_else', 'switch', 'filter', 'merge', 'loop', 'split_in_batches', 'limit', 'sort', 'aggregate'],
  
  // Transformation - Data transformation
  'transformation': ['set_variable', 'javascript', 'json_parser', 'text_formatter', 'edit_fields', 'rename_keys', 'merge_data', 'date_time', 'csv', 'xml', 'html'],
};

/**
 * Abstract type to canonical node type mappings
 * These are common abstract types that need to be mapped to real node types
 */
const ABSTRACT_TYPE_MAPPINGS: Record<string, string> = {
  // AI Summary types
  'ai_summary': 'text_summarizer',
  'ai_summarization': 'text_summarizer',
  'ai_summarize': 'text_summarizer',
  'ai_summarizer': 'text_summarizer',
  
  // Email types - map to google_gmail (gmail is an alias that resolves to google_gmail)
  'ai_email': 'google_gmail',
  'ai_mail': 'google_gmail',
  
  // Spreadsheet types
  'spreadsheet': 'google_sheets',
  'sheet': 'google_sheets',
  'sheets': 'google_sheets',
};

/**
 * Normalization result
 */
export interface NormalizationResult {
  success: boolean;
  normalizedIntent?: StructuredIntent;
  normalizedStructure?: WorkflowStructure;
  normalizedWorkflow?: Workflow;
  errors: string[];
  warnings: string[];
  replacements: Array<{
    original: string;
    normalized: string;
    location: string;
  }>;
}

/**
 * NodeTypeNormalizationService
 */
export class NodeTypeNormalizationService {
  private static instance: NodeTypeNormalizationService;
  
  private constructor() {}
  
  static getInstance(): NodeTypeNormalizationService {
    if (!NodeTypeNormalizationService.instance) {
      NodeTypeNormalizationService.instance = new NodeTypeNormalizationService();
    }
    return NodeTypeNormalizationService.instance;
  }
  
  /**
   * Get all categories that a node belongs to (hybrid node support)
   * 
   * Many nodes belong to multiple categories. For example:
   * - 'airtable' belongs to: CRM, Sales, Data Management, Education, Real Estate
   * - 'email' belongs to: Communication, Sales, Support, Productivity
   * 
   * @param nodeType - The node type to check
   * @returns Array of category names this node belongs to
   */
  getCategoriesForNode(nodeType: string): string[] {
    const categories: string[] = [];
    
    for (const [category, nodeTypes] of Object.entries(PROFESSION_CATEGORY_MAPPINGS)) {
      if (nodeTypes.includes(nodeType)) {
        categories.push(category);
      }
    }
    
    return categories;
  }

  /**
   * Check if a node belongs to a specific category (hybrid node support)
   * 
   * @param nodeType - The node type to check
   * @param category - The category name
   * @returns true if node belongs to the category
   */
  isNodeInCategory(nodeType: string, category: string): boolean {
    const lowerCategory = category.toLowerCase();
    const nodeTypes = PROFESSION_CATEGORY_MAPPINGS[lowerCategory];
    return nodeTypes ? nodeTypes.includes(nodeType) : false;
  }

  /**
   * Get all available categories
   * 
   * @returns Array of all category names
   */
  getAllCategories(): string[] {
    return Object.keys(PROFESSION_CATEGORY_MAPPINGS);
  }

  /**
   * Resolve profession/category name to ALL available node types
   * 
   * When user says "CRM" or "website", this returns ALL available nodes in that category.
   * The caller can then decide which ones to use based on context.
   * 
   * IMPORTANT: Nodes can belong to multiple categories (hybrid nodes).
   * Example: 'airtable' is in CRM, Sales, Data Management, Education, Real Estate
   * 
   * @param category - The profession/category name (e.g., "crm", "website", "sales", "education")
   * @returns Array of available node types, or empty array if none available
   */
  resolveCategoryToNodeTypes(category: string): string[] {
    const lowerCategory = category.toLowerCase();
    const availableNodes: string[] = [];
    
    // Check if it's a known profession/category
    const candidateNodes = PROFESSION_CATEGORY_MAPPINGS[lowerCategory];
    if (candidateNodes && candidateNodes.length > 0) {
      // Find all available nodes from the candidate list
      for (const candidateNode of candidateNodes) {
        const schema = nodeLibrary.getSchema(candidateNode);
        if (schema) {
          availableNodes.push(candidateNode);
        }
      }
    }
    
    // Also try to get nodes by category from node library (dynamic discovery)
    try {
      const nodesByCategory = nodeLibrary.getNodesByCategory(lowerCategory);
      if (nodesByCategory && nodesByCategory.length > 0) {
        for (const node of nodesByCategory) {
          // Avoid duplicates
          if (!availableNodes.includes(node.type)) {
            availableNodes.push(node.type);
          }
        }
      }
    } catch (error) {
      // getNodesByCategory might not exist or might throw, ignore
    }
    
    if (availableNodes.length > 0) {
      console.log(`[NodeTypeNormalization] Resolved category "${category}" → [${availableNodes.join(', ')}] (${availableNodes.length} available)`);
    }
    
    return availableNodes;
  }

  /**
   * Resolve profession/category name to a single node type (backward compatibility)
   * 
   * Returns the first available node from the category.
   * For cases where multiple nodes might be needed, use resolveCategoryToNodeTypes() instead.
   * 
   * @param category - The profession/category name (e.g., "crm", "website")
   * @returns Resolved node type or null if no nodes available
   */
  private resolveCategoryToNodeType(category: string): string | null {
    const availableNodes = this.resolveCategoryToNodeTypes(category);
    return availableNodes.length > 0 ? availableNodes[0] : null;
  }

  /**
   * Analyze context to determine if multiple nodes from a category are needed
   * 
   * Detects patterns like:
   * - "sync between crm systems" → needs multiple CRM nodes
   * - "capture from website and store in crm" → needs website node AND crm node
   * - "both airtable and hubspot" → needs both
   * 
   * @param category - The category name
   * @param context - Context information (user prompt, existing nodes, etc.)
   * @returns true if multiple nodes from this category are likely needed
   */
  shouldUseMultipleNodesFromCategory(
    category: string,
    context?: {
      userPrompt?: string;
      existingNodeTypes?: string[];
      operation?: string;
    }
  ): boolean {
    if (!context) return false;
    
    const lowerCategory = category.toLowerCase();
    const prompt = (context.userPrompt || '').toLowerCase();
    const operation = (context.operation || '').toLowerCase();
    const existingNodes = context.existingNodeTypes || [];
    
    // Pattern 1: Explicit multiple mentions
    const multiplePatterns = [
      /both\s+\w+\s+and\s+\w+/i,
      /multiple\s+\w+/i,
      /several\s+\w+/i,
      /\w+\s+and\s+\w+/i, // "airtable and hubspot"
      /\w+\s+,\s+\w+/i,    // "airtable, hubspot"
    ];
    
    if (multiplePatterns.some(pattern => pattern.test(prompt))) {
      // Check if the pattern mentions nodes from this category
      const availableNodes = this.resolveCategoryToNodeTypes(category);
      const mentionedNodes = availableNodes.filter(nodeType => {
        const nodeName = nodeType.replace(/_/g, ' ');
        return prompt.includes(nodeName) || prompt.includes(nodeType);
      });
      
      if (mentionedNodes.length > 1) {
        return true;
      }
    }
    
    // Pattern 2: Sync/transfer between systems
    const syncPatterns = [
      /sync\s+between/i,
      /transfer\s+between/i,
      /move\s+from\s+\w+\s+to\s+\w+/i,
      /copy\s+from\s+\w+\s+to\s+\w+/i,
    ];
    
    if (syncPatterns.some(pattern => pattern.test(prompt))) {
      // If syncing between systems of the same category, need multiple nodes
      return true;
    }
    
    // Pattern 3: Operation suggests multiple (e.g., "compare", "merge")
    const multiOperationPatterns = [
      /compare/i,
      /merge/i,
      /combine/i,
      /aggregate/i,
    ];
    
    if (multiOperationPatterns.some(pattern => pattern.test(operation))) {
      return true;
    }
    
    // Pattern 4: Already have a node from this category, but context suggests another is needed
    const categoryNodes = this.resolveCategoryToNodeTypes(category);
    const existingCategoryNodes = existingNodes.filter(nodeType => 
      categoryNodes.includes(nodeType)
    );
    
    if (existingCategoryNodes.length > 0) {
      // Check if prompt suggests using another node from same category
      const additionalKeywords = [
        /also\s+use/i,
        /additionally/i,
        /another\s+\w+/i,
        /second\s+\w+/i,
      ];
      
      if (additionalKeywords.some(pattern => pattern.test(prompt))) {
        return true;
      }
    }
    
    return false;
  }

  /**
   * Normalize a node type string
   * 
   * Strategy:
   * 1. Check if it's a capability (ai_service, ai_processing, etc.) → resolve to real node
   * 2. Check if it's a profession/category (crm, website, etc.) → resolve to available node
   * 3. Check abstract type mappings
   * 4. Use NodeTypeResolver to resolve aliases
   * 5. Validate against NodeLibrary
   * 
   * @param nodeType - The node type to normalize
   * @returns Normalized node type or null if cannot be resolved
   */
  normalizeNodeType(nodeType: string): { normalized: string; valid: boolean; method: string } {
    if (!nodeType || typeof nodeType !== 'string') {
      return { normalized: nodeType || '', valid: false, method: 'invalid_input' };
    }
    
    // ✅ STEP 1: Check if it's a capability (not a node type)
    // ai_service, ai_processing, summarization, etc. are capabilities, not node types
    if (capabilityResolver.isCapability(nodeType)) {
      const resolution = capabilityResolver.resolveCapability(nodeType);
      if (resolution) {
        console.log(`[NodeTypeNormalization] Resolved capability "${nodeType}" → "${resolution.nodeType}" (${resolution.reason})`);
        return { normalized: resolution.nodeType, valid: true, method: 'capability_resolution' };
      } else {
        console.warn(`[NodeTypeNormalization] ⚠️  Could not resolve capability: "${nodeType}"`);
        return { normalized: nodeType, valid: false, method: 'capability_resolution_failed' };
      }
    }
    
    // ✅ STEP 2: Check if it's a profession/category (crm, website, etc.)
    // This handles cases where AI generates abstract category names instead of specific node types
    const categoryResolved = this.resolveCategoryToNodeType(nodeType);
    if (categoryResolved) {
      return { normalized: categoryResolved, valid: true, method: 'category_resolution' };
    }
    
    // Step 3: Check abstract type mappings
    const abstractMapping = ABSTRACT_TYPE_MAPPINGS[nodeType.toLowerCase()];
    if (abstractMapping) {
      // Validate the mapped type exists
      const schema = nodeLibrary.getSchema(abstractMapping);
      if (schema) {
        return { normalized: abstractMapping, valid: true, method: 'abstract_mapping' };
      }
    }
    
    // Step 2: Use NodeTypeResolver to resolve aliases and fuzzy matches
    const resolved = resolveNodeType(nodeType, false);
    
    // Step 3: Validate resolved type exists in NodeLibrary
    const schema = nodeLibrary.getSchema(resolved);
    if (schema) {
      if (resolved === nodeType) {
        return { normalized: resolved, valid: true, method: 'exact_match' };
      } else {
        return { normalized: resolved, valid: true, method: 'resolver' };
      }
    }
    
    // Step 4: Not found - return invalid
    return { normalized: nodeType, valid: false, method: 'not_found' };
  }
  
  /**
   * Normalize StructuredIntent node types
   * 
   * @param intent - The structured intent to normalize
   * @returns Normalization result
   */
  normalizeStructuredIntent(intent: StructuredIntent): NormalizationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    const replacements: Array<{ original: string; normalized: string; location: string }> = [];
    
    // Create a copy to avoid mutating the original
    const normalizedIntent: StructuredIntent = {
      ...intent,
      actions: intent.actions ? [...intent.actions] : [],
    };
    
    // Normalize trigger
    if (normalizedIntent.trigger) {
      const result = this.normalizeNodeType(normalizedIntent.trigger);
      if (!result.valid) {
        errors.push(`Invalid trigger type: "${normalizedIntent.trigger}"`);
      } else if (result.normalized !== normalizedIntent.trigger) {
        replacements.push({
          original: normalizedIntent.trigger,
          normalized: result.normalized,
          location: 'trigger',
        });
        normalizedIntent.trigger = result.normalized;
        warnings.push(`Trigger type "${normalizedIntent.trigger}" normalized to "${result.normalized}" (${result.method})`);
      }
    }
    
    // Normalize action types
    if (normalizedIntent.actions && normalizedIntent.actions.length > 0) {
      for (let i = 0; i < normalizedIntent.actions.length; i++) {
        const action = normalizedIntent.actions[i];
        const result = this.normalizeNodeType(action.type);
        
        if (!result.valid) {
          errors.push(`Invalid action type at index ${i}: "${action.type}"`);
        } else if (result.normalized !== action.type) {
          replacements.push({
            original: action.type,
            normalized: result.normalized,
            location: `actions[${i}].type`,
          });
          action.type = result.normalized;
          warnings.push(`Action type "${action.type}" normalized to "${result.normalized}" (${result.method})`);
        }
      }
    }
    
    return {
      success: errors.length === 0,
      normalizedIntent: errors.length === 0 ? normalizedIntent : undefined,
      errors,
      warnings,
      replacements,
    };
  }
  
  /**
   * Normalize WorkflowStructure node types
   * 
   * @param structure - The workflow structure to normalize
   * @returns Normalization result
   */
  normalizeWorkflowStructure(structure: WorkflowStructure): NormalizationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    const replacements: Array<{ original: string; normalized: string; location: string }> = [];
    
    // Create a copy to avoid mutating the original
    const normalizedStructure: WorkflowStructure = {
      ...structure,
      nodes: structure.nodes ? [...structure.nodes] : [],
      connections: structure.connections ? [...structure.connections] : [],
    };
    
    // Normalize node types in structure
    if (normalizedStructure.nodes && normalizedStructure.nodes.length > 0) {
      for (let i = 0; i < normalizedStructure.nodes.length; i++) {
        const node = normalizedStructure.nodes[i];
        const nodeType = typeof node === 'string' ? node : node.type || '';
        
        if (!nodeType) {
          errors.push(`Node at index ${i} has no type`);
          continue;
        }
        
        const result = this.normalizeNodeType(nodeType);
        
        if (!result.valid) {
          errors.push(`Invalid node type at index ${i}: "${nodeType}"`);
        } else if (result.normalized !== nodeType) {
          replacements.push({
            original: nodeType,
            normalized: result.normalized,
            location: `nodes[${i}].type`,
          });
          
          if (typeof node === 'string') {
            // If node is a string, keep it as a string (just the type)
            normalizedStructure.nodes[i] = result.normalized as any;
          } else {
            // If node is an object, update its type property
            (normalizedStructure.nodes[i] as any).type = result.normalized;
          }
          
          warnings.push(`Node type "${nodeType}" normalized to "${result.normalized}" (${result.method})`);
        }
      }
    }
    
    return {
      success: errors.length === 0,
      normalizedStructure: errors.length === 0 ? normalizedStructure : undefined,
      errors,
      warnings,
      replacements,
    };
  }
  
  /**
   * Normalize Workflow node types
   * 
   * @param workflow - The workflow to normalize
   * @returns Normalization result
   */
  normalizeWorkflow(workflow: Workflow): NormalizationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    const replacements: Array<{ original: string; normalized: string; location: string }> = [];
    
    // Create a copy to avoid mutating the original
    const normalizedWorkflow: Workflow = {
      ...workflow,
      nodes: workflow.nodes ? [...workflow.nodes] : [],
      edges: workflow.edges ? [...workflow.edges] : [],
    };
    
    // Normalize node types in workflow
    if (normalizedWorkflow.nodes && normalizedWorkflow.nodes.length > 0) {
      for (let i = 0; i < normalizedWorkflow.nodes.length; i++) {
        const node = normalizedWorkflow.nodes[i];
        const nodeType = unifiedNormalizeNodeTypeString(node.type || node.data?.type || '');
        
        if (!nodeType || nodeType === 'custom') {
          // Try to get from data.type
          const dataType = node.data?.type;
          if (!dataType) {
            errors.push(`Node ${node.id} has no valid type`);
            continue;
          }
        }
        
        // Get the actual type to normalize
        const actualType = nodeType || node.data?.type || '';
        
        if (!actualType) {
          errors.push(`Node ${node.id} has no type`);
          continue;
        }
        
        const result = this.normalizeNodeType(actualType);
        
        if (!result.valid) {
          errors.push(`Invalid node type for node ${node.id}: "${actualType}"`);
        } else if (result.normalized !== actualType) {
          replacements.push({
            original: actualType,
            normalized: result.normalized,
            location: `nodes[${i}].data.type`,
          });
          
          // Update node data.type
          if (!node.data) {
            // Create minimal data structure with required properties
            node.data = {
              type: result.normalized,
              label: result.normalized,
              category: 'utility',
              config: {},
            };
          } else {
            node.data.type = result.normalized;
            // Ensure required properties exist
            if (!node.data.label) {
              node.data.label = result.normalized;
            }
            if (!node.data.category) {
              node.data.category = 'utility';
            }
            if (!node.data.config) {
              node.data.config = {};
            }
          }
          
          warnings.push(`Node ${node.id} type "${actualType}" normalized to "${result.normalized}" (${result.method})`);
        }
      }
    }
    
    return {
      success: errors.length === 0,
      normalizedWorkflow: errors.length === 0 ? normalizedWorkflow : undefined,
      errors,
      warnings,
      replacements,
    };
  }
  
  /**
   * Validate and normalize node types in a StructuredIntent
   * Throws error if any types cannot be resolved
   * 
   * @param intent - The structured intent to validate and normalize
   * @returns Normalized structured intent
   * @throws Error if any node types cannot be resolved
   */
  validateAndNormalizeIntent(intent: StructuredIntent): StructuredIntent {
    const result = this.normalizeStructuredIntent(intent);
    
    if (!result.success) {
      const errorMessage = `Node type validation failed:\n${result.errors.join('\n')}\n\nUnresolved node types cannot be used in workflow generation.`;
      console.error(`[NodeTypeNormalizationService] ❌ ${errorMessage}`);
      throw new Error(errorMessage);
    }
    
    if (result.warnings.length > 0) {
      console.log(`[NodeTypeNormalizationService] ⚠️  Normalizations applied:\n${result.warnings.join('\n')}`);
    }
    
    if (result.replacements.length > 0) {
      console.log(`[NodeTypeNormalizationService] ✅ Applied ${result.replacements.length} node type replacements`);
    }
    
    return result.normalizedIntent!;
  }
  
  /**
   * Validate and normalize node types in a WorkflowStructure
   * Throws error if any types cannot be resolved
   * 
   * @param structure - The workflow structure to validate and normalize
   * @returns Normalized workflow structure
   * @throws Error if any node types cannot be resolved
   */
  validateAndNormalizeStructure(structure: WorkflowStructure): WorkflowStructure {
    const result = this.normalizeWorkflowStructure(structure);
    
    if (!result.success) {
      const errorMessage = `Node type validation failed:\n${result.errors.join('\n')}\n\nUnresolved node types cannot be used in workflow generation.`;
      console.error(`[NodeTypeNormalizationService] ❌ ${errorMessage}`);
      throw new Error(errorMessage);
    }
    
    if (result.warnings.length > 0) {
      console.log(`[NodeTypeNormalizationService] ⚠️  Normalizations applied:\n${result.warnings.join('\n')}`);
    }
    
    if (result.replacements.length > 0) {
      console.log(`[NodeTypeNormalizationService] ✅ Applied ${result.replacements.length} node type replacements`);
    }
    
    return result.normalizedStructure!;
  }
  
  /**
   * Validate and normalize node types in a Workflow
   * Throws error if any types cannot be resolved
   * 
   * @param workflow - The workflow to validate and normalize
   * @returns Normalized workflow
   * @throws Error if any node types cannot be resolved
   */
  validateAndNormalizeWorkflow(workflow: Workflow): Workflow {
    const result = this.normalizeWorkflow(workflow);
    
    if (!result.success) {
      const errorMessage = `Node type validation failed:\n${result.errors.join('\n')}\n\nUnresolved node types cannot be used in workflow generation.`;
      console.error(`[NodeTypeNormalizationService] ❌ ${errorMessage}`);
      throw new Error(errorMessage);
    }
    
    if (result.warnings.length > 0) {
      console.log(`[NodeTypeNormalizationService] ⚠️  Normalizations applied:\n${result.warnings.join('\n')}`);
    }
    
    if (result.replacements.length > 0) {
      console.log(`[NodeTypeNormalizationService] ✅ Applied ${result.replacements.length} node type replacements`);
    }
    
    return result.normalizedWorkflow!;
  }
}

// Export singleton instance
export const nodeTypeNormalizationService = NodeTypeNormalizationService.getInstance();
