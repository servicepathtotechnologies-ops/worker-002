/**
 * NodeTypeResolver - Resolves node type aliases and variations to canonical types
 * 
 * Problem: LLM generates node types like "ai_service" and "gmail" but validator
 * cannot find them due to alias mismatches or case sensitivity issues.
 * 
 * Solution: Provides alias mapping, fuzzy matching, and canonical type resolution.
 * 
 * NOTE: NodeLibrary is injected to avoid circular dependency.
 * Initialize order: NodeLibrary → NodeTypeResolver → setNodeLibrary()
 */

// Forward declaration - NodeLibrary type (avoid circular import)
type NodeLibrary = {
  getSchema(nodeType: string): any | undefined;
  getAllSchemas(): any[];
};

export interface NodeTypeResolution {
  original: string;
  resolved: string;
  method: 'exact' | 'alias' | 'fuzzy' | 'normalized' | 'capability_based' | 'ai_fallback' | 'not_found';
  confidence: number; // 0.0 to 1.0
  warning?: {
    message: string;
    attemptedMethods: string[];
    suggestedFix?: string;
  };
}

/**
 * Alias mapping: maps common aliases/variations to canonical node types
 */
const NODE_TYPE_ALIASES: Record<string, string[]> = {
  // AI Nodes
  'ai_service': ['ai', 'openai', 'llm', 'ai_node', 'ai_processor', 'ai_model', 'ai_chat'],
  'ai_chat_model': ['chat_model', 'ai_chat', 'llm_chat', 'conversation'],
  'ai_agent': ['agent', 'ai_assistant', 'assistant', 'bot'],
  'openai_gpt': ['gpt', 'gpt4', 'gpt3', 'openai', 'chatgpt'],
  'anthropic_claude': ['claude', 'anthropic', 'claude3'],
  'google_gemini': ['gemini', 'google_ai', 'bard'],
  'ollama': ['local_ai', 'local_llm'],
  'text_summarizer': ['summarize', 'summary', 'summarizer', 'ai_summarization', 'ai_summarizer', 'ai_summarize'],
  'sentiment_analyzer': ['sentiment', 'emotion', 'analyzer'],
  
  // Email Nodes - google_gmail is the main node, gmail maps to it
  'google_gmail': ['gmail', 'google_mail', 'email', 'gmail_send', 'send_email', 'mail', 'send via gmail'],
  'email': ['mail', 'send_email', 'email_send'],
  'outlook': ['microsoft_mail', 'outlook_mail'],
  
  // Google Services
  'google_sheets': ['sheets', 'gsheets', 'google_sheet', 'spreadsheet'],
  'google_doc': ['gdoc', 'google_document', 'document'],
  'google_drive': ['drive', 'gdrive', 'google_storage'],
  'google_calendar': ['calendar', 'gcal', 'google_cal'],
  'google_contacts': ['contacts', 'gcontacts', 'google_contact'],
  'google_tasks': ['tasks', 'gtasks', 'google_task'],
  'google_big_query': ['bigquery', 'big_query', 'bq'],
  
  // Database Nodes
  'database_write': ['db_write', 'write_db', 'postgresql', 'postgres'],
  'database_read': ['db_read', 'read_db', 'query_db'],
  'supabase': ['supa', 'supa_db'],
  'mysql': ['my_sql'],
  'mongodb': ['mongo', 'mongo_db'],
  
  // HTTP & API
  'http_request': ['http', 'api', 'request', 'fetch', 'api_call'],
  'http_post': ['post', 'http_post_request'],
  'respond_to_webhook': ['webhook_response', 'response', 'respond'],
  'webhook_response': ['webhook_reply', 'response'],
  'graphql': ['gql', 'graph_ql'],
  
  // Communication
  'slack_message': ['slack', 'slack_send', 'send_slack'],
  'telegram': ['telegram_send', 'send_telegram'],
  'discord': ['discord_send', 'send_discord'],
  'microsoft_teams': ['teams', 'ms_teams', 'send_teams'],
  'whatsapp_cloud': ['whatsapp', 'wa', 'send_whatsapp'],
  'twilio': ['sms', 'twilio_sms', 'send_sms'],
  
  // Social Media
  'linkedin': ['linked_in', 'li'],
  'twitter': ['tweet', 'twitter_post', 'x'],
  'instagram': ['ig', 'insta'],
  'youtube': ['yt', 'youtube_video'],
  'facebook': ['fb', 'facebook_post'],
  
  // CRM
  'salesforce': ['sf', 'sales_force'],
  'hubspot': ['hub_spot'],
  'airtable': ['air_table'],
  'zoho_crm': ['zoho', 'zoho_crm'],
  'pipedrive': ['pipe_drive'],
  
  // File Storage
  'aws_s3': ['s3', 'amazon_s3', 'aws_storage'],
  'dropbox': ['dbx'],
  'onedrive': ['one_drive', 'ms_onedrive'],
  
  // DevOps
  'github': ['git_hub', 'gh'],
  'gitlab': ['git_lab'],
  'bitbucket': ['bit_bucket'],
  
  // E-commerce
  'shopify': ['shop'],
  'woocommerce': ['woo', 'woo_commerce'],
  'stripe': ['stripe_payment'],
  'paypal': ['pay_pal'],
  
  // Logic & Flow
  'if_else': ['if', 'conditional', 'condition'],
  'switch': ['case', 'switch_case'],
  'merge': ['combine', 'join'],
  'filter': ['where', 'filter_data'],
  'loop': ['for', 'foreach', 'iterate'],
  'split_in_batches': ['batch', 'split_batch'],
  
  // Data Manipulation
  'set_variable': ['set', 'variable', 'assign'],
  'javascript': ['js', 'code', 'script'],
  'json_parser': ['json', 'parse_json'],
  'csv': ['csv_parser', 'parse_csv'],
  'html': ['html_parser', 'parse_html'],
  'xml': ['xml_parser', 'parse_xml'],
  
  // Triggers
  'schedule': ['cron', 'scheduled', 'timer'],
  'webhook': ['webhook_trigger', 'http_trigger'],
  'manual_trigger': ['manual', 'on_demand', 'trigger'],
  'interval': ['interval_trigger', 'periodic'],
  'form': ['form_trigger', 'form_submission'],
};

/**
 * Reverse alias map: maps aliases to canonical types
 */
const ALIAS_TO_CANONICAL: Map<string, string> = new Map();

// Build reverse map
Object.entries(NODE_TYPE_ALIASES).forEach(([canonical, aliases]) => {
  aliases.forEach(alias => {
    ALIAS_TO_CANONICAL.set(alias.toLowerCase(), canonical);
  });
  // Canonical type is also mapped to itself
  ALIAS_TO_CANONICAL.set(canonical.toLowerCase(), canonical);
});

/**
 * Calculate string similarity using Levenshtein distance
 */
function calculateSimilarity(str1: string, str2: string): number {
  const longer = str1.length > str2.length ? str1 : str2;
  const shorter = str1.length > str2.length ? str2 : str1;
  
  if (longer.length === 0) return 1.0;
  
  const distance = levenshteinDistance(longer, shorter);
  return (longer.length - distance) / longer.length;
}

/**
 * Calculate Levenshtein distance between two strings
 */
function levenshteinDistance(str1: string, str2: string): number {
  const matrix: number[][] = [];
  
  for (let i = 0; i <= str2.length; i++) {
    matrix[i] = [i];
  }
  
  for (let j = 0; j <= str1.length; j++) {
    matrix[0][j] = j;
  }
  
  for (let i = 1; i <= str2.length; i++) {
    for (let j = 1; j <= str1.length; j++) {
      if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        );
      }
    }
  }
  
  return matrix[str2.length][str1.length];
}

/**
 * Normalize node type string (lowercase, remove special chars)
 */
function normalizeNodeType(type: string): string {
  return type.toLowerCase().trim().replace(/[_\s-]+/g, '_');
}

/**
 * NodeTypeResolver class
 * Uses dependency injection to avoid circular dependency with NodeLibrary
 */
export class NodeTypeResolver {
  private static instance: NodeTypeResolver;
  private nodeLibrary?: NodeLibrary;
  private resolutionCache: Map<string, NodeTypeResolution> = new Map();
  
  private constructor() {
    // Do not initialize nodeLibrary here - use setNodeLibrary() instead
  }
  
  /**
   * Check if a node type appears to be an AI transformation type
   */
  private isAITransformationType(nodeType: string): boolean {
    const lower = nodeType.toLowerCase();
    const aiTransformationKeywords = [
      'llm', 'ai', 'chat', 'model', 'gpt', 'claude', 'gemini', 'ollama',
      'summarize', 'summarizer', 'analyze', 'analyzer', 'transform', 'transformation'
    ];
    return aiTransformationKeywords.some(keyword => lower.includes(keyword));
  }
  
  /**
   * Resolve node type by capability matching
   * Maps operations/intents to capabilities, then finds nodes with those capabilities
   * 
   * Example: "summarize" → capability "summarize" → nodes with "summarize" capability
   * 
   * @param nodeTypeOrOperation - Node type or operation name (e.g., "summarize", "ollama_llm")
   * @returns Resolution result if capability match found, null otherwise
   */
  private resolveByCapability(nodeTypeOrOperation: string, debug: boolean = false): NodeTypeResolution | null {
    try {
      const { nodeCapabilityRegistryDSL } = require('../ai/node-capability-registry-dsl');
      const normalized = nodeTypeOrOperation.toLowerCase().trim();
      
      // Map common operations to capabilities
      const operationToCapability: Record<string, string[]> = {
        'summarize': ['summarize', 'transformation', 'ai_processing'],
        'summarise': ['summarize', 'transformation', 'ai_processing'],
        'analyze': ['analyze', 'transformation', 'ai_processing'],
        'analyse': ['analyze', 'transformation', 'ai_processing'],
        'transform': ['transform', 'transformation'],
        'process': ['transform', 'transformation', 'process'],
        'read': ['read_data', 'data_source'],
        'fetch': ['read_data', 'data_source'],
        'get': ['read_data', 'data_source'],
        'send': ['output', 'send_email', 'send_message'],
        'write': ['write_data', 'output'],
        'notify': ['notification', 'output'],
      };
      
      // Get target capabilities for this operation/node type
      let targetCapabilities: string[] = [];
      
      // Check if it's a known operation
      if (operationToCapability[normalized]) {
        targetCapabilities = operationToCapability[normalized];
      } else {
        // Try to infer capability from the name itself
        // e.g., "summarize" → look for "summarize" capability
        targetCapabilities = [normalized, 'transformation', 'ai_processing'];
      }
      
      // Find all registered node types
      const allSchemas = this.nodeLibrary!.getAllSchemas();
      const matchingNodes: Array<{ type: string; matchScore: number }> = [];
      
      for (const schema of allSchemas) {
        const nodeType = schema.type;
        const capabilities = nodeCapabilityRegistryDSL.getCapabilities(nodeType);
        
        if (capabilities && capabilities.length > 0) {
          // Calculate match score based on capability overlap
          let matchScore = 0;
          for (const targetCap of targetCapabilities) {
            const targetCapLower = targetCap.toLowerCase();
            for (const nodeCap of capabilities) {
              const nodeCapLower = nodeCap.toLowerCase();
              // Exact match
              if (nodeCapLower === targetCapLower) {
                matchScore += 2;
              }
              // Substring match
              else if (nodeCapLower.includes(targetCapLower) || targetCapLower.includes(nodeCapLower)) {
                matchScore += 1;
              }
            }
          }
          
          if (matchScore > 0) {
            matchingNodes.push({ type: nodeType, matchScore });
          }
        }
      }
      
      // Sort by match score (highest first) and return best match
      if (matchingNodes.length > 0) {
        matchingNodes.sort((a, b) => b.matchScore - a.matchScore);
        const bestMatch = matchingNodes[0];
        
        // Verify the matched node exists in library
        const schema = this.nodeLibrary!.getSchema(bestMatch.type);
        if (schema) {
          if (debug || process.env.DEBUG_NODE_LOOKUPS === 'true') {
            console.log(`[NodeTypeResolver] ✅ Resolved "${nodeTypeOrOperation}" → "${bestMatch.type}" (via capability matching, score: ${bestMatch.matchScore})`);
          }
          return {
            original: nodeTypeOrOperation,
            resolved: bestMatch.type,
            method: 'capability_based',
            confidence: Math.min(0.95, 0.7 + (bestMatch.matchScore * 0.05)), // Scale confidence by match score
          };
        }
      }
    } catch (error) {
      // Capability registry not available - return null to continue to next step
      if (debug) {
        console.warn(`[NodeTypeResolver] ⚠️  Capability-based resolution failed: ${error}`);
      }
    }
    
    return null;
  }
  
  /**
   * Set the NodeLibrary instance (dependency injection)
   * Must be called after NodeLibrary is initialized
   */
  setNodeLibrary(nodeLibrary: NodeLibrary): void {
    this.nodeLibrary = nodeLibrary;
    console.log('[NodeTypeResolver] ✅ NodeLibrary injected');
  }
  
  /**
   * Check if NodeLibrary is initialized
   */
  private ensureNodeLibrary(): void {
    if (!this.nodeLibrary) {
      throw new Error(
        'NodeTypeResolver: NodeLibrary not initialized. ' +
        'Call setNodeLibrary() after NodeLibrary is created.'
      );
    }
  }
  
  static getInstance(): NodeTypeResolver {
    if (!NodeTypeResolver.instance) {
      NodeTypeResolver.instance = new NodeTypeResolver();
    }
    return NodeTypeResolver.instance;
  }
  
  /**
   * Resolve node type to canonical type (cached, capability-first).
   *
   * This method ensures that each nodeType string is resolved at most once:
   * results are cached in-memory and reused on subsequent calls.
   */
  resolve(nodeType: string, debug: boolean = false): NodeTypeResolution | null {
    return this.resolveNodeTypeOnce(nodeType, debug);
  }

  /**
   * Resolve node type to canonical type exactly once per original string.
   * 
   * Enhanced resolution strategy (capability-first):
   * 1. Try cached result (if present, return immediately)
   * 2. Try exact match (case-insensitive)
   * 3. Try capability-based lookup (PREFERRED over string heuristics)
   * 4. Try alias match
   * 5. Try fuzzy match (similarity > 0.8)
   * 6. Try normalization (normalizeNodeType)
   * 7. Fallback to ai_chat_model for AI transformations
   * 8. Return structured warning if not found (do not throw)
   * 
   * @param nodeType - The node type or operation to resolve
   * @param debug - Whether to log debug information (default: false)
   */
  resolveNodeTypeOnce(nodeType: string, debug: boolean = false): NodeTypeResolution | null {
    // Ensure NodeLibrary is initialized
    this.ensureNodeLibrary();
    
    if (!nodeType || typeof nodeType !== 'string') {
      return null;
    }
    
    const original = nodeType;

    // Step 0: Check cache first
    const cached = this.resolutionCache.get(original);
    if (cached) {
      return cached;
    }

    const normalized = normalizeNodeType(nodeType);
    const attemptedMethods: string[] = [];
    
    // Step 1: Try exact match (case-insensitive)
    attemptedMethods.push('exact_match');
    const exactMatch = this.nodeLibrary!.getSchema(nodeType);
    if (exactMatch) {
      const resolution: NodeTypeResolution = {
        original,
        resolved: nodeType,
        method: 'exact',
        confidence: 1.0,
      };
      this.resolutionCache.set(original, resolution);
      return resolution;
    }
    
    // Step 2: Try capability-based resolution (PREFERRED over string matching)
    // This maps operations like "summarize" to nodes with matching capabilities
    attemptedMethods.push('capability_based');
    const capabilityResolution = this.resolveByCapability(nodeType, debug);
    if (capabilityResolution && capabilityResolution.method === 'capability_based') {
      this.resolutionCache.set(original, capabilityResolution);
      return capabilityResolution;
    }
    
    // Step 3: Try alias match
    attemptedMethods.push('alias_match');
    const aliasMatch = ALIAS_TO_CANONICAL.get(normalized);
    if (aliasMatch) {
      const schema = this.nodeLibrary!.getSchema(aliasMatch);
      if (schema) {
        if (debug || process.env.DEBUG_NODE_LOOKUPS === 'true') {
          console.log(`[NodeTypeResolver] ✅ Resolved node type "${original}" → "${aliasMatch}" (via alias)`);
        }
        const resolution: NodeTypeResolution = {
          original,
          resolved: aliasMatch,
          method: 'alias',
          confidence: 0.95,
        };
        this.resolutionCache.set(original, resolution);
        return resolution;
      }
    }
    
    // Step 4: Try fuzzy match against all registered node types
    attemptedMethods.push('fuzzy_match');
    const allSchemas = this.nodeLibrary!.getAllSchemas();
    let bestMatch: { type: string; similarity: number } | null = null;
    
    for (const schema of allSchemas) {
      const similarity = calculateSimilarity(normalized, normalizeNodeType(schema.type));
      if (similarity > 0.8 && (!bestMatch || similarity > bestMatch.similarity)) {
        bestMatch = { type: schema.type, similarity };
      }
    }
    
    if (bestMatch && bestMatch.similarity > 0.8) {
      if (debug || process.env.DEBUG_NODE_LOOKUPS === 'true') {
        console.log(`[NodeTypeResolver] ✅ Resolved node type "${original}" → "${bestMatch.type}" (via fuzzy match, similarity: ${(bestMatch.similarity * 100).toFixed(1)}%)`);
      }
      const resolution: NodeTypeResolution = {
        original,
        resolved: bestMatch.type,
        method: 'fuzzy',
        confidence: bestMatch.similarity,
      };
      this.resolutionCache.set(original, resolution);
      return resolution;
    }
    
    // Step 5: Try normalization (using normalizeNodeType from node-type-normalizer)
    attemptedMethods.push('normalization');
    try {
      const { normalizeNodeType: normalize } = require('../ai/node-type-normalizer');
      const normalizedType = normalize(nodeType);
      
        if (normalizedType && normalizedType !== nodeType) {
          const normalizedSchema = this.nodeLibrary!.getSchema(normalizedType);
          if (normalizedSchema) {
            if (debug || process.env.DEBUG_NODE_LOOKUPS === 'true') {
              console.log(`[NodeTypeResolver] ✅ Resolved node type "${original}" → "${normalizedType}" (via normalization)`);
            }
            const resolution: NodeTypeResolution = {
              original,
              resolved: normalizedType,
              method: 'normalized',
              confidence: 0.9,
            };
            this.resolutionCache.set(original, resolution);
            return resolution;
          }
        }
    } catch (error) {
      // Normalizer not available - continue to next step
      if (debug) {
        console.warn(`[NodeTypeResolver] ⚠️  Normalization failed: ${error}`);
      }
    }
    
    // Step 6: Fallback to ai_chat_model for AI transformations
    attemptedMethods.push('ai_fallback');
    if (this.isAITransformationType(nodeType)) {
      const aiChatModelSchema = this.nodeLibrary!.getSchema('ai_chat_model');
      if (aiChatModelSchema) {
        if (debug || process.env.DEBUG_NODE_LOOKUPS === 'true') {
          console.log(`[NodeTypeResolver] ⚠️  Resolved AI transformation type "${original}" → "ai_chat_model" (fallback)`);
        }
        const resolution: NodeTypeResolution = {
          original,
          resolved: 'ai_chat_model',
          method: 'ai_fallback',
          confidence: 0.7,
          warning: {
            message: `Node type "${original}" not found, using AI fallback "ai_chat_model"`,
            attemptedMethods,
            suggestedFix: `Consider registering "${original}" in NodeLibrary or adding it to alias mappings`,
          },
        };
        this.resolutionCache.set(original, resolution);
        return resolution;
      }
    }
    
    // Step 7: Not found - return structured warning (do not throw)
    if (debug || process.env.DEBUG_NODE_LOOKUPS === 'true') {
      console.warn(`[NodeTypeResolver] ❌ Could not resolve node type "${original}" after ${attemptedMethods.length} attempts`);
    }
    
    const resolution: NodeTypeResolution = {
      original,
      resolved: original, // Return original as fallback
      method: 'not_found',
      confidence: 0.0,
      warning: {
        message: `Node type "${original}" could not be resolved to any registered type`,
        attemptedMethods,
        suggestedFix: `Register "${original}" in NodeLibrary, add alias mapping, or use a supported node type`,
      },
    };
    this.resolutionCache.set(original, resolution);
    return resolution;
  }
  
  /**
   * Check if a node type exists (after resolution)
   */
  exists(nodeType: string): boolean {
    this.ensureNodeLibrary();
    const resolution = this.resolve(nodeType);
    if (!resolution) return false;
    
    if (resolution.method === 'not_found') return false;
    
    return this.nodeLibrary!.getSchema(resolution.resolved) !== undefined;
  }
  
  /**
   * Get canonical type for a node type (returns original if not found)
   */
  getCanonicalType(nodeType: string): string {
    const resolution = this.resolve(nodeType);
    return resolution?.resolved || nodeType;
  }
  
  /**
   * Get all aliases for a canonical node type
   */
  getAliases(canonicalType: string): string[] {
    return NODE_TYPE_ALIASES[canonicalType] || [];
  }
  
  /**
   * Get all canonical node types
   */
  getAllCanonicalTypes(): string[] {
    return Object.keys(NODE_TYPE_ALIASES);
  }
}

// Export singleton instance
export const nodeTypeResolver = NodeTypeResolver.getInstance();
