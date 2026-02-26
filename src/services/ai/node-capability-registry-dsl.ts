/**
 * Node Capability Registry for DSL Categorization
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

export interface NodeCapabilities {
  type: string;
  capabilities: string[];
}

/**
 * Node Capability Registry for DSL
 * Maps node types to their semantic capabilities
 */
export class NodeCapabilityRegistryDSL {
  private capabilities: Map<string, string[]> = new Map();

  constructor() {
    this.initializeCapabilities();
  }

  /**
   * Initialize capability mappings
   */
  private initializeCapabilities(): void {
    // Output capabilities (send/write operations)
    this.setCapabilities('google_gmail', ['send_email', 'output', 'communication']);
    this.setCapabilities('gmail', ['send_email', 'output', 'communication']);
    this.setCapabilities('email', ['send_email', 'output', 'communication']);
    this.setCapabilities('slack_message', ['send_message', 'output', 'communication', 'notification']);
    this.setCapabilities('slack', ['send_message', 'output', 'communication', 'notification']);
    this.setCapabilities('discord', ['send_message', 'output', 'communication', 'notification']);
    this.setCapabilities('telegram', ['send_message', 'output', 'communication', 'notification']);
    this.setCapabilities('notification', ['notify', 'output', 'communication']);
    this.setCapabilities('webhook_response', ['send_webhook', 'output', 'http']);
    this.setCapabilities('http_request', ['send_request', 'output', 'http']);
    
    // CRM/Write operations (outputs)
    this.setCapabilities('hubspot', ['write_crm', 'output', 'crm']);
    this.setCapabilities('salesforce', ['write_crm', 'output', 'crm']);
    this.setCapabilities('pipedrive', ['write_crm', 'output', 'crm']);
    this.setCapabilities('zoho_crm', ['write_crm', 'output', 'crm']);
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
    this.setCapabilities('webhook', ['receive_data', 'data_source', 'trigger']);
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
    this.setCapabilities('ai_agent', ['ai_processing', 'transformation', 'llm']);
    this.setCapabilities('ai_service', ['ai_processing', 'transformation', 'llm']);
    this.setCapabilities('ai_chat_model', ['ai_processing', 'transformation', 'llm', 'summarize', 'analyze']);
    this.setCapabilities('javascript', ['transform', 'transformation', 'code']);
    this.setCapabilities('function', ['transform', 'transformation', 'code']);
    this.setCapabilities('text_formatter', ['format', 'transformation']);
    this.setCapabilities('json_parser', ['parse', 'transformation']);
    
    // Social media (outputs)
    this.setCapabilities('twitter', ['send_post', 'output', 'social_media']);
    this.setCapabilities('linkedin', ['send_post', 'output', 'social_media']);
    this.setCapabilities('instagram', ['send_post', 'output', 'social_media']);
    this.setCapabilities('facebook', ['send_post', 'output', 'social_media']);
    this.setCapabilities('youtube', ['send_post', 'output', 'social_media']);
  }

  /**
   * Set capabilities for a node type
   */
  private setCapabilities(nodeType: string, capabilities: string[]): void {
    this.capabilities.set(nodeType.toLowerCase(), capabilities);
  }

  /**
   * Get capabilities for a node type
   */
  getCapabilities(nodeType: string): string[] {
    const normalized = nodeType.toLowerCase();
    return this.capabilities.get(normalized) || [];
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
    return this.hasCapability(nodeType, 'transformation');
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
}

// Export singleton instance
export const nodeCapabilityRegistryDSL = new NodeCapabilityRegistryDSL();
