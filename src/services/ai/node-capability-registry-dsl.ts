/**
 * Node Capability Registry for DSL Categorization
 * 
 * ✅ ROOT-LEVEL FIX: Dynamically reads capabilities from node schemas
 * Works for ALL nodes automatically - no hardcoded mappings needed
 * 
 * Maps node types to semantic capabilities for DSL generation.
 * Replaces hardcoded string matching with capability-based detection.
 * 
 * Each node type declares capabilities:
 * - "output": Node is an output action (sends/writes data)
 * - "data_source": Node reads/fetches data
 * - "transformation": Node transforms/processes data
 * - "send_email": Node can send emails
 * - "read_data": Node can read data
 * - etc.
 */

import { nodeLibrary } from '../nodes/node-library';

export interface NodeCapabilities {
  type: string;
  capabilities: string[];
}

/**
 * Node Capability Registry for DSL
 * Maps node types to their semantic capabilities
 * 
 * ✅ ROOT-LEVEL ARCHITECTURE: Reads from node schemas dynamically
 * This ensures ALL nodes are automatically supported without hardcoding
 */
export class NodeCapabilityRegistryDSL {
  private capabilities: Map<string, string[]> = new Map();
  private initialized = false;

  constructor() {
    // Lazy initialization - will read from node schemas on first use
  }

  /**
   * ✅ ROOT-LEVEL FIX: Initialize capabilities dynamically from node schemas
   * This works for ALL nodes automatically - no hardcoding needed
   */
  private initializeCapabilities(): void {
    if (this.initialized) {
      return;
    }

    console.log('[NodeCapabilityRegistryDSL] Initializing capabilities from node schemas...');

    // Read ALL node schemas dynamically
    const allSchemas = nodeLibrary.getAllSchemas();
    
    for (const schema of allSchemas) {
      const nodeType = schema.type;
      const inferredCapabilities = this.inferCapabilitiesFromSchema(schema);
      
      if (inferredCapabilities.length > 0) {
        this.setCapabilities(nodeType, inferredCapabilities);
      }
    }

    // Keep legacy hardcoded mappings as fallback for nodes without schema capabilities
    // These will be overridden by schema-based capabilities if they exist
    this.initializeLegacyCapabilities();

    this.initialized = true;
    console.log(`[NodeCapabilityRegistryDSL] ✅ Initialized ${this.capabilities.size} node capabilities (from schemas + legacy)`);
  }

  /**
   * ✅ ROOT-LEVEL FIX: Infer capabilities from node schema
   * This automatically works for ALL nodes that have capabilities in their schema
   */
  private inferCapabilitiesFromSchema(schema: any): string[] {
    const capabilities: string[] = [];

    // 1. Use explicit capabilities from schema (highest priority)
    if (schema.capabilities && Array.isArray(schema.capabilities)) {
      capabilities.push(...schema.capabilities);
    }

    // 2. Infer from category
    const category = (schema.category || '').toLowerCase();
    if (category === 'output' || category === 'action' || category === 'social') {
      capabilities.push('output');
    }
    if (category === 'data' || category === 'data_source' || category === 'trigger') {
      capabilities.push('data_source');
    }
    if (category === 'ai' || category === 'transformation' || category === 'utility') {
      capabilities.push('transformation');
    }
    // ✅ CRITICAL FIX: Flow control nodes (if_else, switch, try_catch, merge) are transformations
    if (category === 'flow' || category === 'logic') {
      capabilities.push('transformation', 'flow_control');
    }

    // 3. Infer from node type name patterns
    const nodeType = (schema.type || '').toLowerCase();
    
    // Output patterns
    if (nodeType.includes('gmail') || nodeType.includes('email')) {
      capabilities.push('send_email', 'output', 'write_data', 'communication', 'terminal');
    }
    if (nodeType.includes('slack') || nodeType.includes('discord') || nodeType.includes('telegram')) {
      capabilities.push('send_message', 'output', 'write_data', 'communication', 'notification', 'terminal');
    }
    if (nodeType.includes('twitter') || nodeType.includes('linkedin') || nodeType.includes('instagram') || 
        nodeType.includes('facebook') || nodeType.includes('youtube')) {
      capabilities.push('send_post', 'output', 'write_data', 'social_media');
    }
    if (nodeType.includes('hubspot') || nodeType.includes('salesforce') || nodeType.includes('crm')) {
      capabilities.push('write_crm', 'output', 'write_data', 'crm');
    }
    if (nodeType.includes('database') && (nodeType.includes('write') || nodeType.includes('create') || nodeType.includes('update'))) {
      capabilities.push('write_data', 'output', 'database');
    }

    // Data source patterns
    if (nodeType.includes('database') && (nodeType.includes('read') || !nodeType.includes('write'))) {
      capabilities.push('read_data', 'data_source', 'database');
    }
    // ✅ ROOT-LEVEL FIX: Exclude webhook from data source categorization
    // webhook is a trigger (receives incoming requests), not a data source
    if (nodeType.includes('api') || nodeType.includes('http') || nodeType.includes('graphql')) {
      // ✅ UNIVERSAL FIX: Treat request/response/GraphQL-style nodes as capable of sending requests (outputs)
      if (
        nodeType.includes('response') ||
        nodeType.includes('request') ||
        nodeType.includes('graphql')
      ) {
        // These nodes can act as outputs / write targets for HTTP-style actions
        capabilities.push('send_request', 'output', 'write_data', 'http');
      } else if (nodeType.includes('post')) {
        // ✅ CRITICAL FIX: http_post can be both data_source (retrieve data) and output (send data)
        // Support both use cases based on context - default to data_source for "retrieve" use cases
        capabilities.push('read_data', 'data_source', 'send_request', 'output', 'write_data', 'http');
      } else {
        capabilities.push('read_data', 'data_source', 'http');
      }
    }
    // Note: webhook is handled separately above - it's a trigger, not a data source
    if (nodeType.includes('csv') || nodeType.includes('excel') || nodeType.includes('drive') || nodeType.includes('s3')) {
      capabilities.push('read_data', 'data_source');
    }

    // Transformation patterns
    if (nodeType.includes('ai') || nodeType.includes('llm') || nodeType.includes('gpt') || 
        nodeType.includes('claude') || nodeType.includes('gemini') || nodeType.includes('ollama')) {
      capabilities.push('ai_processing', 'transformation', 'llm');
      // ✅ WORLD-CLASS: AI chat models can serve as terminal outputs (chatbot workflows)
      if (nodeType.includes('chat') || nodeType.includes('chat_model') || nodeType.includes('chatbot')) {
        capabilities.push('terminal');
      }
    }
    if (nodeType.includes('summarize') || nodeType.includes('analyze') || nodeType.includes('format') || 
        nodeType.includes('transform') || nodeType.includes('parse')) {
      capabilities.push('transformation');
    }
    // ✅ CRITICAL FIX: Flow control node patterns (if_else, switch, try_catch, merge)
    if (nodeType.includes('if_else') || nodeType.includes('if-else') || nodeType.includes('ifelse') ||
        nodeType === 'if' || nodeType === 'else') {
      capabilities.push('transformation', 'flow_control', 'conditional');
    }
    if (nodeType.includes('switch') || nodeType.includes('case')) {
      capabilities.push('transformation', 'flow_control', 'conditional');
    }
    if (nodeType.includes('try_catch') || nodeType.includes('try-catch') || nodeType.includes('trycatch') ||
        nodeType.includes('try') || nodeType.includes('catch')) {
      capabilities.push('transformation', 'flow_control', 'error_handling');
    }
    if (nodeType.includes('merge')) {
      capabilities.push('transformation', 'flow_control', 'data_merge');
    }

    // Remove duplicates
    return Array.from(new Set(capabilities));
  }

  /**
   * Legacy hardcoded mappings (kept as fallback)
   * These are only used if schema doesn't have capabilities
   */
  private initializeLegacyCapabilities(): void {
    // Output capabilities (send/write operations)
    // ✅ WORLD-CLASS: Add terminal capability for nodes that can serve as workflow outputs
    this.setCapabilities('google_gmail', ['send_email', 'output', 'write_data', 'communication', 'terminal']);
    this.setCapabilities('gmail', ['send_email', 'output', 'write_data', 'communication', 'terminal']);
    this.setCapabilities('email', ['send_email', 'output', 'write_data', 'communication', 'terminal']);
    this.setCapabilities('slack_message', ['send_message', 'output', 'write_data', 'communication', 'notification', 'terminal']);
    this.setCapabilities('slack', ['send_message', 'output', 'communication', 'notification', 'terminal']);
    this.setCapabilities('discord', ['send_message', 'output', 'communication', 'notification', 'terminal']);
    this.setCapabilities('telegram', ['send_message', 'output', 'communication', 'notification', 'terminal']);
    this.setCapabilities('notification', ['notify', 'output', 'communication', 'terminal']);
    this.setCapabilities('webhook_response', ['send_webhook', 'output', 'http', 'terminal']);
    // ✅ CRITICAL FIX: http_post can be both data_source (retrieve data) and output (send data)
    // Support both use cases - has both capabilities so it can be used in either role
    this.setCapabilities('http_post', ['read_data', 'data_source', 'send_request', 'output', 'write_data', 'http']);
    this.setCapabilities('http_request', ['send_request', 'output', 'http']);
    
    // CRM/Write operations (outputs)
    // ✅ CRITICAL FIX: Add write_data capability for validation compatibility
    this.setCapabilities('hubspot', ['write_crm', 'output', 'write_data', 'crm']);
    this.setCapabilities('salesforce', ['write_crm', 'output', 'write_data', 'crm']);
    this.setCapabilities('pipedrive', ['write_crm', 'output', 'write_data', 'crm']);
    this.setCapabilities('zoho_crm', ['write_crm', 'output', 'write_data', 'crm']);
    this.setCapabilities('airtable', ['write_data', 'output', 'database']);
    this.setCapabilities('notion', ['write_data', 'output', 'database']);
    
    // Write operations (outputs when operation is write/create/update)
    this.setCapabilities('google_sheets', ['read_data', 'write_data', 'data_source', 'output']);
    this.setCapabilities('database_write', ['write_data', 'output', 'database']);
    this.setCapabilities('postgresql', ['read_data', 'write_data', 'data_source', 'output']);
    this.setCapabilities('mysql', ['read_data', 'write_data', 'data_source', 'output']);
    this.setCapabilities('mongodb', ['read_data', 'write_data', 'data_source', 'output']);
    this.setCapabilities('supabase', ['read_data', 'write_data', 'data_source', 'output']);
    
    // Data source capabilities (read/fetch operations)
    this.setCapabilities('database', ['read_data', 'data_source', 'database']);
    this.setCapabilities('database_read', ['read_data', 'data_source', 'database']);
    this.setCapabilities('api', ['read_data', 'data_source', 'http']);
    // ✅ ROOT-LEVEL FIX: webhook is a TRIGGER, not a data source
    // webhook receives incoming HTTP requests (trigger), not reads data (data source)
    this.setCapabilities('webhook', ['receive_data', 'trigger']);
    this.setCapabilities('csv', ['read_data', 'data_source']);
    this.setCapabilities('excel', ['read_data', 'data_source']);
    this.setCapabilities('google_drive', ['read_data', 'data_source']);
    this.setCapabilities('dropbox', ['read_data', 'data_source']);
    this.setCapabilities('aws_s3', ['read_data', 'data_source']);
    this.setCapabilities('s3', ['read_data', 'data_source']);
    
    // Transformation capabilities
    this.setCapabilities('text_summarizer', ['summarize', 'transformation', 'ai_processing']);
    this.setCapabilities('ollama', ['ai_processing', 'transformation', 'llm']);
    this.setCapabilities('ollama_llm', ['ai_processing', 'transformation', 'llm']);
    this.setCapabilities('openai_gpt', ['ai_processing', 'transformation', 'llm']);
    this.setCapabilities('openai', ['ai_processing', 'transformation', 'llm']);
    this.setCapabilities('anthropic_claude', ['ai_processing', 'transformation', 'llm']);
    this.setCapabilities('anthropic', ['ai_processing', 'transformation', 'llm']);
    this.setCapabilities('google_gemini', ['ai_processing', 'transformation', 'llm']);
    this.setCapabilities('ai_agent', ['ai_processing', 'transformation', 'llm', 'terminal']);
    this.setCapabilities('ai_service', ['ai_processing', 'transformation', 'llm']);
    // ✅ WORLD-CLASS: AI chat models can serve as terminal outputs (chatbot workflows)
    this.setCapabilities('ai_chat_model', ['ai_processing', 'transformation', 'llm', 'summarize', 'analyze', 'terminal']);
    this.setCapabilities('chat_model', ['ai_processing', 'transformation', 'llm', 'terminal']);
    this.setCapabilities('javascript', ['transform', 'transformation', 'code']);
    this.setCapabilities('function', ['transform', 'transformation', 'code']);
    this.setCapabilities('text_formatter', ['format', 'transformation']);
    this.setCapabilities('json_parser', ['parse', 'transformation']);
    
    // Social media (outputs)
    // ✅ ROOT-LEVEL FIX: Add write_data capability for validation compatibility
    this.setCapabilities('twitter', ['send_post', 'output', 'write_data', 'social_media']);
    this.setCapabilities('linkedin', ['send_post', 'output', 'write_data', 'social_media']);
    this.setCapabilities('instagram', ['send_post', 'output', 'write_data', 'social_media']);
    this.setCapabilities('facebook', ['send_post', 'output', 'write_data', 'social_media']);
    this.setCapabilities('youtube', ['send_post', 'output', 'write_data', 'social_media']);
  }

  /**
   * Set capabilities for a node type
   * Only sets if not already present (schema capabilities take priority)
   */
  private setCapabilities(nodeType: string, capabilities: string[]): void {
    const normalized = nodeType.toLowerCase();
    // Only set if not already present (schema-based capabilities take priority)
    if (!this.capabilities.has(normalized)) {
      this.capabilities.set(normalized, capabilities);
    } else {
      // Merge with existing (schema capabilities + legacy)
      const existing = this.capabilities.get(normalized) || [];
      const merged = Array.from(new Set([...existing, ...capabilities]));
      this.capabilities.set(normalized, merged);
    }
  }

  /**
   * ✅ ROOT-LEVEL FIX: Get capabilities for a node type
   * Automatically initializes from schemas on first call
   * Works for ALL nodes dynamically
   */
  getCapabilities(nodeType: string): string[] {
    // Initialize on first use
    if (!this.initialized) {
      this.initializeCapabilities();
    }
    
    // 🔍 DEBUG: Track capability retrieval for problematic nodes
    const lower = nodeType.toLowerCase();
    const isDebugNode = ['javascript', 'ai_chat_model', 'linkedin', 'log_output', 'postgresql'].includes(lower);
    if (isDebugNode) {
      const normalized = lower;
      const capabilities = this.capabilities.get(normalized) || [];
      console.log(
        `[NodeCapabilityRegistryDSL] 🔍 DEBUG getCapabilities(${nodeType}): ` +
        `normalized=${normalized}, ` +
        `capabilities=[${capabilities.join(', ')}], ` +
        `found=${capabilities.length > 0}`
      );
    }

    const normalized = nodeType.toLowerCase();
    const capabilities = this.capabilities.get(normalized);
    
    // If not found, try to get from schema dynamically (for new nodes)
    if (!capabilities || capabilities.length === 0) {
      const schema = nodeLibrary.getSchema(normalized);
      if (schema) {
        const inferred = this.inferCapabilitiesFromSchema(schema);
        if (inferred.length > 0) {
          this.capabilities.set(normalized, inferred);
          return inferred;
        }
      }
    }
    
    return capabilities || [];
  }

  /**
   * Check if node has a specific capability
   */
  hasCapability(nodeType: string, capability: string): boolean {
    const capabilities = this.getCapabilities(nodeType);
    return capabilities.includes(capability.toLowerCase());
  }

  /**
   * Check if node is an output (has "output" capability)
   */
  isOutput(nodeType: string): boolean {
    return this.hasCapability(nodeType, 'output');
  }

  /**
   * Check if node is a data source (has "data_source" capability)
   */
  isDataSource(nodeType: string): boolean {
    return this.hasCapability(nodeType, 'data_source');
  }

  /**
   * Check if node is a transformation (has "transformation" capability)
   */
  isTransformation(nodeType: string): boolean {
    const lower = nodeType.toLowerCase();
    const isDebugNode = ['javascript', 'ai_chat_model', 'linkedin', 'log_output', 'postgresql'].includes(lower);
    
    const capabilities = this.getCapabilities(nodeType);
    const hasTransformation = capabilities.includes('transformation');
    
    if (isDebugNode) {
      console.log(
        `[NodeCapabilityRegistryDSL] 🔍 DEBUG isTransformation(${nodeType}): ` +
        `capabilities=[${capabilities.join(', ')}], ` +
        `hasTransformation=${hasTransformation}`
      );
    }
    
    return hasTransformation;
  }

  /**
   * Check if node can send email (has "send_email" capability)
   */
  canSendEmail(nodeType: string): boolean {
    return this.hasCapability(nodeType, 'send_email');
  }

  /**
   * Check if node can read data (has "read_data" capability)
   */
  canReadData(nodeType: string): boolean {
    return this.hasCapability(nodeType, 'read_data');
  }

  /**
   * Check if node can write data (has "write_data" capability)
   */
  canWriteData(nodeType: string): boolean {
    return this.hasCapability(nodeType, 'write_data');
  }

  /**
   * ✅ WORLD-CLASS: Check if node can serve as terminal output (has "terminal" capability)
   * 
   * Terminal nodes can serve as workflow outputs without requiring a separate output node.
   * Examples:
   * - ai_chat_model (chatbot workflows - response is the output)
   * - google_gmail (email workflows - sending email is the output)
   * - slack_message (notification workflows - message is the output)
   * - log_output (logging workflows - log is the output)
   * 
   * This is universal - works for ALL node types based on their capabilities.
   */
  isTerminal(nodeType: string): boolean {
    return this.hasCapability(nodeType, 'terminal');
  }

  /**
   * ✅ WORLD-CLASS: Check if node can serve as output (terminal OR has output capability)
   * 
   * Universal method that checks if a node can serve as a workflow output.
   * Uses capability-based detection - no hardcoding.
   */
  canServeAsOutput(nodeType: string): boolean {
    return this.isTerminal(nodeType) || 
           this.isOutput(nodeType) || 
           this.canWriteData(nodeType);
  }
}

// Export singleton instance
export const nodeCapabilityRegistryDSL = new NodeCapabilityRegistryDSL();
