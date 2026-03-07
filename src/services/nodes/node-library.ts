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
  // ✅ ROOT-LEVEL: Semantic intent description for AI understanding
  intentDescription?: string; // What this node does semantically (e.g., "AI-powered text summarization using language models")
  intentCategories?: string[]; // Semantic categories (e.g., ["ai_summarization", "text_processing", "nlp"])
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
    
    // ✅ ROOT-LEVEL: Validate all nodes have context
    this.validateAllNodesHaveContext();
    
    // Log all registered node types for debugging
    this.logAllRegisteredNodes();
  }
  
  /**
   * ✅ ROOT-LEVEL: Validate all nodes have complete context
   * 
   * Every node MUST have:
   * - description
   * - aiSelectionCriteria (with useCases, keywords)
   * - capabilities (or keywords)
   * 
   * This is MANDATORY, not optional.
   */
  private validateAllNodesHaveContext(): void {
    const nodesMissingContext: string[] = [];
    
    for (const [nodeType, schema] of this.schemas.entries()) {
      const errors: string[] = [];
      
      // Check description
      if (!schema.description || schema.description.trim().length === 0) {
        errors.push('missing description');
      }
      
      // Check aiSelectionCriteria
      if (!schema.aiSelectionCriteria) {
        errors.push('missing aiSelectionCriteria');
      } else {
        if (!schema.aiSelectionCriteria.useCases || schema.aiSelectionCriteria.useCases.length === 0) {
          errors.push('missing useCases in aiSelectionCriteria');
        }
        if (!schema.aiSelectionCriteria.keywords || schema.aiSelectionCriteria.keywords.length === 0) {
          errors.push('missing keywords in aiSelectionCriteria');
        }
        // ✅ ROOT-LEVEL: Validate intent description exists for AI understanding (warn only, not error)
        if (!schema.aiSelectionCriteria.intentDescription || schema.aiSelectionCriteria.intentDescription.trim().length === 0) {
          console.warn(`[NodeLibrary] ⚠️  Node "${schema.type}" missing intentDescription - should be added for better AI intent understanding`);
        }
        if (!schema.aiSelectionCriteria.intentCategories || schema.aiSelectionCriteria.intentCategories.length === 0) {
          console.warn(`[NodeLibrary] ⚠️  Node "${schema.type}" missing intentCategories - should be added for better AI intent understanding`);
        }
      }
      
      // Check capabilities or keywords (at least one must exist)
      const hasCapabilities = schema.capabilities && schema.capabilities.length > 0;
      const hasKeywords = schema.keywords && schema.keywords.length > 0;
      const hasAISelectionKeywords = schema.aiSelectionCriteria?.keywords && schema.aiSelectionCriteria.keywords.length > 0;
      
      if (!hasCapabilities && !hasKeywords && !hasAISelectionKeywords) {
        errors.push('missing capabilities or keywords');
      }
      
      if (errors.length > 0) {
        nodesMissingContext.push(`${nodeType} (${errors.join(', ')})`);
      }
    }
    
    if (nodesMissingContext.length > 0) {
      const error = new Error(
        `[NodeLibrary] ❌ ROOT-LEVEL ERROR: ${nodesMissingContext.length} node(s) missing required context:\n` +
        nodesMissingContext.slice(0, 10).map(n => `  - ${n}`).join('\n') +
        (nodesMissingContext.length > 10 ? `\n  ... and ${nodesMissingContext.length - 10} more` : '') +
        `\n\nEvery node MUST have complete context. This is a root-level architectural requirement. ` +
        `Context includes: description, aiSelectionCriteria (with useCases and keywords), and capabilities/keywords.`
      );
      console.error(error.message);
      throw error;
    }
    
    console.log(`[NodeLibrary] ✅ All ${this.schemas.size} nodes have complete context`);
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
    
    // ✅ ROOT-LEVEL FIX: Step 0 - Extract base node name from compound names
    // This handles AI-generated compound names like "notion_write_data" → "notion"
    // BEFORE trying any other resolution
    const baseNodeName = this.extractBaseNodeNameFromCompound(nodeType);
    if (baseNodeName !== nodeType) {
      // Try lookup with extracted base name first
      let schema = this.schemas.get(baseNodeName);
      if (schema) {
        if (process.env.DEBUG_NODE_LOOKUPS === 'true') {
          console.log(`[NodeLibrary] ✅ Extracted base name: "${nodeType}" → "${baseNodeName}"`);
        }
        return schema;
      }
      // Also try pattern matching on base name
      schema = this.findSchemaByPattern(baseNodeName.toLowerCase());
      if (schema) {
        if (process.env.DEBUG_NODE_LOOKUPS === 'true') {
          console.log(`[NodeLibrary] ✅ Pattern-matched base name: "${nodeType}" → "${baseNodeName}" → "${schema.type}"`);
        }
        return schema;
      }
    }
    
    // Step 1: Try direct lookup first (fast path for canonical types)
    let schema = this.schemas.get(nodeType);
    if (schema) {
      // Only log successful lookups in debug mode to reduce noise
      if (process.env.DEBUG_NODE_LOOKUPS === 'true') {
        console.log(`[NodeLibrary] ✅ Found node type: "${nodeType}"`);
      }
      return schema;
    }
    
    // Step 2: Try resolver FIRST (aliases like "gmail" → "google_gmail" should resolve to canonical types)
    // NOTE: This is safe because resolver is initialized AFTER NodeLibrary constructor completes
    try {
      const { resolveNodeType } = require('../../core/utils/node-type-resolver-util');
      const resolvedType = resolveNodeType(nodeType, false);
      
      if (resolvedType !== nodeType) {
        // Try lookup with resolved canonical type
        schema = this.schemas.get(resolvedType);
        if (schema) {
          // ✅ FIX: Use exact name matching, not pattern matching
          // Only log if debug is enabled (no pattern matching logs)
          if (process.env.DEBUG_NODE_LOOKUPS === 'true') {
            console.log(`[NodeLibrary] ✅ Resolved alias "${nodeType}" → canonical "${resolvedType}"`);
          }
          return schema;
        }
      }
    } catch (error) {
      // Resolver not initialized yet or alias not found - continue to pattern search
    }
    
    // Step 3: Pattern-based search (ONLY for operation names like "summarize", NOT for node type aliases)
    // ✅ CRITICAL: Skip pattern matching for known aliases - they should ONLY resolve via alias map
    // Check alias map directly to avoid circular dependency
    try {
      const { NODE_TYPE_ALIASES } = require('../nodes/node-type-resolver');
      const aliasMap = new Map<string, string>();
      Object.entries(NODE_TYPE_ALIASES as Record<string, string[]>).forEach(([canonical, aliases]) => {
        (aliases as string[]).forEach((alias: string) => {
          aliasMap.set(alias.toLowerCase(), canonical);
        });
      });
      
      // If this is a known alias, DO NOT use pattern matching
      const normalizedLower = normalizedQuery.toLowerCase();
      if (aliasMap.has(normalizedLower) && aliasMap.get(normalizedLower) !== normalizedLower) {
        // This is an alias - pattern matching should NOT be used
        // Alias resolution should have worked in Step 2 - return undefined
        return undefined;
      }
    } catch (error) {
      // Alias map not available - continue to pattern matching
    }
    
    // Only use pattern matching for operation names, NOT for node type aliases
    schema = this.findSchemaByPattern(normalizedQuery);
    if (schema) {
      // ✅ FIX: Only log pattern matches if debug is enabled (user wants exact name matching, not patterns)
      if (process.env.DEBUG_NODE_LOOKUPS === 'true') {
        console.log(`[NodeLibrary] ✅ Found node type by pattern: "${nodeType}" → "${schema.type}"`);
      }
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
   * ✅ ROOT-LEVEL FIX: Extract base node name from compound names
   * 
   * UNIVERSAL IMPLEMENTATION - Works for ALL nodes using registry
   * 
   * Handles AI-generated compound names like:
   * - "notion_write_data" → "notion"
   * - "google_sheets_read" → "google_sheets"
   * - "slack_send_message" → "slack_message"
   * - "google email" → "google_gmail" (semantic matching)
   * - "ai service" → "ai_service" (semantic matching)
   * 
   * Strategy (in priority order):
   * 1. Direct match (already registered)
   * 2. Semantic matching using registry (labels, tags, keywords)
   * 3. Operation suffix removal
   * 4. Prefix extraction with registry validation
   * 5. Pattern matching with registry validation
   * 
   * This ensures compound names can be resolved to their base node types
   */
  private extractBaseNodeNameFromCompound(compoundName: string): string {
    if (!compoundName || typeof compoundName !== 'string') {
      return compoundName;
    }
    
    const lower = compoundName.toLowerCase().trim();
    
    // ✅ STRATEGY 0: If it's already a registered node type, return as-is
    if (this.schemas.has(compoundName)) {
      return compoundName;
    }
    
    // ✅ STRATEGY 1: Semantic matching using registry (UNIVERSAL - works for ALL nodes)
    // Use unified node registry to find nodes by label, tags, or keywords
    try {
      const { unifiedNodeRegistry } = require('../../core/registry/unified-node-registry');
      const allNodeTypes = unifiedNodeRegistry.getAllTypes();
      
      // Build semantic map from registry (label, tags, keywords → node type)
      const semanticMatches: Array<{ nodeType: string; score: number }> = [];
      
      for (const nodeType of allNodeTypes) {
        const nodeDef = unifiedNodeRegistry.get(nodeType);
        if (!nodeDef) continue;
        
        let score = 0;
        
        // Check label match
        const label = (nodeDef.label || '').toLowerCase();
        if (label && lower.includes(label)) {
          score += 10; // High priority for label matches
        }
        
        // Check tags match
        const tags = (nodeDef.tags || []).map((t: string) => t.toLowerCase());
        for (const tag of tags) {
          if (lower.includes(tag)) {
            score += 5; // Medium priority for tag matches
          }
        }
        
        // Check keywords from schema
        const schema = this.schemas.get(nodeType);
        if (schema) {
          const keywords = (schema.keywords || []).map(k => k.toLowerCase());
          for (const keyword of keywords) {
            if (lower.includes(keyword)) {
              score += 3; // Lower priority for keyword matches
            }
          }
          
          // Check common patterns (use name field for matching)
          const patterns = (schema.commonPatterns || []).map((p: CommonPattern) => p.name.toLowerCase());
          for (const pattern of patterns) {
            if (lower.includes(pattern) || pattern.includes(lower)) {
              score += 4; // Medium-high priority for pattern matches
            }
          }
        }
        
        if (score > 0) {
          semanticMatches.push({ nodeType, score });
        }
      }
      
      // Sort by score (highest first) and return best match
      if (semanticMatches.length > 0) {
        semanticMatches.sort((a, b) => b.score - a.score);
        const bestMatch = semanticMatches[0];
        
        // Only return if score is high enough (avoid false positives)
        if (bestMatch.score >= 5) {
          // Validate the match exists in schemas
          if (this.schemas.has(bestMatch.nodeType)) {
            if (process.env.DEBUG_NODE_LOOKUPS === 'true') {
              console.log(`[NodeLibrary] ✅ Semantic match: "${compoundName}" → "${bestMatch.nodeType}" (score: ${bestMatch.score})`);
            }
            return bestMatch.nodeType;
          }
        }
      }
    } catch (error) {
      // Registry not available - continue to other strategies
    }
    
    // ✅ STRATEGY 2: Operation suffix removal (works for compound names like "notion_write")
    const operationSuffixes = [
      '_write', '_read', '_send', '_create', '_update', '_delete',
      '_post', '_get', '_put', '_patch', '_data', '_operation',
      '_message', '_notification', '_trigger', '_action',
    ];
    
    for (const suffix of operationSuffixes) {
      if (lower.endsWith(suffix)) {
        const baseName = compoundName.slice(0, -suffix.length);
        // ✅ Validate against registry
        if (this.schemas.has(baseName)) {
          return baseName;
        }
        // Also try pattern matching
        const schema = this.findSchemaByPattern(baseName.toLowerCase());
        if (schema && this.schemas.has(schema.type)) {
          return schema.type;
        }
      }
    }
    
    // ✅ STRATEGY 3: Prefix extraction with registry validation (UNIVERSAL)
    // Extract common prefixes and validate against registry
    const words = lower.split(/[\s_]+/);
    
    // Try all combinations of words (up to 3 words)
    for (let i = 1; i <= Math.min(3, words.length); i++) {
      const candidate = words.slice(0, i).join('_');
      
      // Direct match
      if (this.schemas.has(candidate)) {
        return candidate;
      }
      
      // Pattern match
      const schema = this.findSchemaByPattern(candidate);
      if (schema && this.schemas.has(schema.type)) {
        return schema.type;
      }
    }
    
    // ✅ STRATEGY 4: Semantic phrase matching (UNIVERSAL - built from registry)
    // Build phrase map dynamically from registry labels, tags, and keywords
    try {
      const { unifiedNodeRegistry } = require('../../core/registry/unified-node-registry');
      const allNodeTypes = unifiedNodeRegistry.getAllTypes();
      const phraseMap: Record<string, string> = {};
      
      // Build phrase map from registry for ALL nodes
      for (const nodeType of allNodeTypes) {
        const nodeDef = unifiedNodeRegistry.get(nodeType);
        if (!nodeDef) continue;
        
        // Skip if node doesn't exist in schemas
        if (!this.schemas.has(nodeType)) continue;
        
        const label = (nodeDef.label || '').toLowerCase();
        const tags = (nodeDef.tags || []).map((t: string) => t.toLowerCase());
        const schema = this.schemas.get(nodeType);
        const keywords = (schema?.keywords || []).map((k: string) => k.toLowerCase());
        
        // Create phrase variations from label
        if (label) {
          // Add full label as phrase
          phraseMap[label] = nodeType;
          
          // Add label without underscores/spaces (e.g., "google gmail" → "google_gmail")
          const labelWords = label.split(/[\s_]+/);
          if (labelWords.length >= 2) {
            const phrase = labelWords.join(' ');
            phraseMap[phrase] = nodeType;
          }
        }
        
        // Add tags as phrases
        for (const tag of tags) {
          if (tag && tag.length > 2) {
            phraseMap[tag] = nodeType;
          }
        }
        
        // Add keywords as phrases
        for (const keyword of keywords) {
          if (keyword && keyword.length > 2) {
            phraseMap[keyword] = nodeType;
            
            // Create compound phrases with common words
            const keywordWords = keyword.split(/[\s_]+/);
            if (keywordWords.length >= 2) {
              const phrase = keywordWords.join(' ');
              phraseMap[phrase] = nodeType;
            }
          }
        }
        
        // Create provider + service phrases (e.g., "google email" → "google_gmail")
        const typeLower = nodeType.toLowerCase();
        if (typeLower.includes('_')) {
          const parts = typeLower.split('_');
          if (parts.length >= 2) {
            const provider = parts[0];
            const service = parts.slice(1).join(' ');
            
            // Add "provider service" phrase (e.g., "google gmail")
            phraseMap[`${provider} ${service}`] = nodeType;
            
            // Add "provider_service" phrase (e.g., "google_gmail")
            phraseMap[`${provider}_${service}`] = nodeType;
          }
        }
      }
      
      // Check phrase map (prioritize longer phrases first)
      const sortedPhrases = Object.keys(phraseMap).sort((a, b) => b.length - a.length);
      for (const phrase of sortedPhrases) {
        if (lower.includes(phrase)) {
          const nodeType = phraseMap[phrase];
          if (this.schemas.has(nodeType)) {
            if (process.env.DEBUG_NODE_LOOKUPS === 'true') {
              console.log(`[NodeLibrary] ✅ Phrase match: "${compoundName}" → "${nodeType}" (phrase: "${phrase}")`);
            }
            return nodeType;
          }
        }
      }
    } catch (error) {
      // Registry not available - skip phrase matching
    }
    
    // ✅ STRATEGY 5: Try first word as base name (for simple cases)
    const firstWord = words[0];
    if (firstWord && firstWord.length > 2) {
      const schema = this.findSchemaByPattern(firstWord);
      if (schema && this.schemas.has(schema.type)) {
        return schema.type;
      }
    }
    
    // ✅ STRATEGY 6: Try first two words (for compound names like "google_sheets")
    if (words.length >= 2) {
      const twoWords = `${words[0]}_${words[1]}`;
      if (this.schemas.has(twoWords)) {
        return twoWords;
      }
      const schema = this.findSchemaByPattern(twoWords);
      if (schema && this.schemas.has(schema.type)) {
        return schema.type;
      }
    }
    
    // If no extraction worked, return original (will be handled by pattern matching)
    return compoundName;
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
   * ✅ ROOT-LEVEL FIX: Uses pattern matching and compound name extraction
   * This ensures DSL generation never fails for any node type, even compound names
   * 
   * ✅ CRITICAL FIX: "custom" type is always invalid in the library
   * It's only used in final workflow nodes for frontend compatibility
   */
  isNodeTypeRegistered(nodeType: string): boolean {
    // Skip "custom" type - it's invalid and expected to fail
    if (nodeType === 'custom') {
      return false;
    }
    
    // Fast path: Direct registration check
    if (this.schemas.has(nodeType)) {
      return true;
    }
    
    // ✅ ROOT-LEVEL FIX: Use getSchema() which includes pattern matching
    // This ensures compound names like "notion_write_data" can be resolved
    const schema = this.getSchema(nodeType);
    return schema !== undefined;
  }

  /**
   * Get canonical type for a virtual node type (alias)
   * Returns the alias itself if it's already canonical
   */
  getCanonicalType(nodeType: string): string {
    // ✅ PERMANENT: Aliases are NOT handled here - they're resolved by node-type-resolver.ts
    // This method only returns canonical types from the registry
    // Aliases (gmail, mail, ai) should be resolved BEFORE calling this method
    return nodeType;
  }

  /**
   * Get all schemas
   */
  getAllSchemas(): NodeSchema[] {
    return Array.from(this.schemas.values());
  }

  /**
   * Get all canonical node types (excluding aliases/virtual types)
   * This is the SINGLE SOURCE OF TRUTH for valid node types
   * Used for strict validation and LLM enum constraints
   */
  getAllCanonicalTypes(): string[] {
    const allSchemas = this.getAllSchemas();
    const canonicalTypes: string[] = [];
    
    // ✅ PERMANENT: NO aliases in canonical types list
    // Aliases (gmail, mail, ai) are NOT canonical types - they resolve via node-type-resolver.ts
    // Only actual node schemas are included in canonical types
    const aliasTypes = new Set<string>();
    // Removed: mail, ai, gmail - these are NOT canonical types, only aliases
    
    // Return only canonical types (not aliases)
    for (const schema of allSchemas) {
      if (!aliasTypes.has(schema.type)) {
        canonicalTypes.push(schema.type);
      }
    }
    
    return canonicalTypes.sort(); // Sort for deterministic output
  }

  /**
   * Check if a node type is a canonical type (not an alias)
   */
  isCanonicalType(nodeType: string): boolean {
    const canonicalTypes = this.getAllCanonicalTypes();
    return canonicalTypes.includes(nodeType);
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
    this.addSchema(this.createDelaySchema());
    this.addSchema(this.createTimeoutSchema());
    this.addSchema(this.createReturnSchema());
    this.addSchema(this.createExecuteWorkflowSchema());
    this.addSchema(this.createTryCatchSchema());
    this.addSchema(this.createRetrySchema());
    this.addSchema(this.createParallelSchema());
    this.addSchema(this.createQueuePushSchema());
    this.addSchema(this.createQueueConsumeSchema());
    this.addSchema(this.createCacheGetSchema());
    this.addSchema(this.createCacheSetSchema());
    this.addSchema(this.createOAuth2AuthSchema());
    this.addSchema(this.createApiKeyAuthSchema());
    schemaCount += 15;

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
        // ✅ ROOT-LEVEL: Semantic intent description for AI understanding
        intentDescription: 'Time-based workflow trigger that executes workflows automatically on a schedule. Uses cron expressions to define when workflows should run (e.g., daily at 9 AM, every hour, weekly on Monday). Enables automated, recurring task execution without manual intervention.',
        intentCategories: ['time_trigger', 'automation', 'scheduled_execution', 'recurring_tasks'],
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
        // ✅ ROOT-LEVEL: Semantic intent description for AI understanding
        intentDescription: 'HTTP webhook trigger that executes workflows when external systems send HTTP requests. Receives POST/GET/PUT/DELETE requests at a configured URL path and triggers workflow execution in real-time. Used for API callbacks, form submissions, external system integration, and event-driven architectures.',
        intentCategories: ['http_trigger', 'api_trigger', 'event_trigger', 'real_time', 'webhook', 'integration'],
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
        // ✅ ROOT-LEVEL: Semantic intent description for AI understanding
        intentDescription: 'Manual workflow trigger that executes workflows when users manually initiate them. No automatic scheduling or external events required. Used for ad-hoc processing, testing workflows, one-time operations, and user-initiated tasks that require human interaction.',
        intentCategories: ['manual_trigger', 'user_initiated', 'on_demand', 'ad_hoc'],
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
        // ✅ ROOT-LEVEL: Semantic intent description for AI understanding
        intentDescription: 'Interval-based workflow trigger that executes workflows at fixed time intervals (e.g., every 5 minutes, every hour). Simpler than cron-based scheduling, used for polling, regular checks, and simple recurring tasks that need to run at regular intervals.',
        intentCategories: ['interval_trigger', 'time_trigger', 'recurring', 'polling'],
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
        // ✅ ROOT-LEVEL: Semantic intent description for AI understanding
        intentDescription: 'Form submission trigger that executes workflows when users submit web forms. Collects structured data from users through customizable form fields (text, email, textarea, etc.). Used for contact forms, lead capture, surveys, applications, and feedback collection workflows.',
        intentCategories: ['form_trigger', 'data_collection', 'user_input', 'form_submission'],
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
        // ✅ ROOT-LEVEL: Semantic intent description for AI understanding
        intentDescription: 'HTTP request node that makes HTTP requests (GET, POST, PUT, PATCH, DELETE) to external APIs or web services. Fetches data from REST APIs, sends data to external systems, performs web scraping, and integrates with third-party services. Used for API integration, data fetching, webhooks, and external service calls.',
        intentCategories: ['http_request', 'api_integration', 'data_fetching', 'external_service'],
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
        // ✅ ROOT-LEVEL: Semantic intent description for AI understanding
        intentDescription: 'HTTP response node that sends HTTP responses back to webhook callers. Used in webhook-triggered workflows to return status codes, headers, and response body data to the calling system. Essential for building API endpoints, handling form submissions, and responding to webhook events.',
        intentCategories: ['http_response', 'webhook_response', 'api_endpoint'],
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
        // ✅ ROOT-LEVEL: Semantic intent description for AI understanding
        intentDescription: 'PostgreSQL database node that executes SQL queries (SELECT, INSERT, UPDATE, DELETE) on PostgreSQL databases. Performs database operations including data storage, complex queries, batch operations, and data synchronization. Used for persistent data storage, database transactions, and complex SQL operations.',
        intentCategories: ['database', 'postgresql', 'sql', 'data_storage', 'persistent_storage'],
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
        // ✅ ROOT-LEVEL: Semantic intent description for AI understanding
        intentDescription: 'Supabase integration node that interacts with Supabase (PostgreSQL + realtime + storage). Performs database operations (select, insert, update, delete) on Supabase tables, supports realtime subscriptions, and file storage. Used for modern web app backends, realtime data synchronization, and cloud database operations.',
        intentCategories: ['database', 'supabase', 'realtime', 'cloud_database', 'modern_backend'],
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
        // ✅ ROOT-LEVEL: Semantic intent description for AI understanding
        intentDescription: 'Database read node that retrieves data from databases using SQL SELECT queries. Executes read-only database operations to fetch, retrieve, and query data. Used for data retrieval, complex queries, and reading data from persistent storage.',
        intentCategories: ['database', 'data_retrieval', 'read_only', 'sql_query'],
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
        // ✅ ROOT-LEVEL: Semantic intent description for AI understanding
        intentDescription: 'Database write node that executes SQL write operations (INSERT, UPDATE, DELETE) on databases. Performs data modification operations including inserting new records, updating existing records, and deleting records. Used for database write operations, data persistence, and data modification.',
        intentCategories: ['database', 'data_modification', 'write_operation', 'sql_write'],
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
        // ✅ ROOT-LEVEL: Semantic intent description for AI understanding
        intentDescription: 'Google Sheets integration for reading, writing, and managing spreadsheet data. Connects to Google Sheets spreadsheets to extract data (read), store data (write/append), or update existing data. Used for data extraction from spreadsheets, data storage in spreadsheets, and spreadsheet automation workflows.',
        intentCategories: ['data_source', 'data_storage', 'google_workspace', 'spreadsheet', 'data_extraction'],
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
        // ✅ ROOT-LEVEL: Semantic intent description for AI understanding
        intentDescription: 'Google Docs integration node that reads or writes content in Google Docs documents. Extracts text content from documents, writes content to documents, and processes document data. Used for document extraction, document generation, content processing, and Google Workspace document integration.',
        intentCategories: ['google_workspace', 'document_processing', 'content_extraction', 'document_generation'],
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
        intentDescription: 'A data manipulation node that sets or assigns values to variables. Allows storing computed values, default values, or transformed data into named variables that can be referenced later in the workflow. Used for simple data mapping, field assignment, and value storage.',
        intentCategories: ['data_manipulation', 'variable_assignment', 'data_mapping', 'value_storage'],
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
        intentDescription: 'A code execution node that runs custom JavaScript code to perform complex data transformations, calculations, or custom logic. Provides full programmatic control over data processing, allowing for advanced algorithms, data validation, API response parsing, and custom business logic that cannot be achieved with simpler nodes.',
        intentCategories: ['code_execution', 'data_transformation', 'custom_logic', 'programming'],
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
        intentDescription: 'A function execution node that runs custom functions with input parameters. Designed for reusable logic blocks, parameterized data transformations, and modular workflow components. Allows defining functions that can be called with different inputs, making workflows more maintainable and reusable.',
        intentCategories: ['function_execution', 'custom_logic', 'reusable_components', 'modular_workflow'],
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
        intentDescription: 'A function execution node that applies a custom function to each item in an array. Iterates through array elements and executes the specified function for each item, enabling batch processing, item-level transformations, and array-based operations. Useful for processing collections of data with custom logic.',
        intentCategories: ['array_processing', 'iteration', 'batch_processing', 'function_execution'],
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
        intentDescription: 'A date and time manipulation node that parses, formats, calculates, and converts dates and timestamps. Supports various date operations including formatting dates into specific string formats, extracting date components, performing date arithmetic (add/subtract days, hours, etc.), timezone conversions, and generating schedules. Essential for any workflow dealing with temporal data.',
        intentCategories: ['date_time_processing', 'temporal_data', 'data_formatting', 'timezone_conversion'],
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
        intentDescription: 'A text formatting node that creates formatted strings using templates with placeholders. Supports string interpolation, variable substitution, and template-based text generation. Allows creating dynamic messages, emails, notifications, or reports by inserting data values into predefined text templates. Essential for generating human-readable output from structured data.',
        intentCategories: ['text_formatting', 'string_processing', 'template_processing', 'message_generation'],
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
        // ✅ ROOT-LEVEL: Semantic intent description for AI understanding
        intentDescription: 'Conditional branching node that executes different workflow paths based on true/false conditions. Evaluates conditions (equals, greater than, contains, etc.) and routes workflow execution to true or false branches. Used for conditional logic, error handling, data validation, and decision-making in workflows.',
        intentCategories: ['conditional_logic', 'branching', 'decision_making', 'control_flow'],
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
        // ✅ ROOT-LEVEL: Semantic intent description for AI understanding
        intentDescription: 'Multi-path conditional logic node that routes workflow execution based on value matching. Evaluates an expression and routes to different paths based on matching rules (case_1, case_2, etc.). Used for multi-path logic, routing based on status codes, category-based processing, and complex conditional branching.',
        intentCategories: ['conditional_logic', 'routing', 'multi_path', 'switch_logic'],
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
        // ✅ ROOT-LEVEL: Semantic intent description for AI understanding
        intentDescription: 'Merge node that combines multiple branches of data flow into a single output. Merges parallel processing results, aggregates data from multiple sources, and joins related data. Used for combining results from parallel branches, data aggregation from multiple paths, and merging split workflow branches.',
        intentCategories: ['data_merging', 'parallel_processing', 'data_combination', 'branch_convergence'],
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
        // ✅ ROOT-LEVEL: Semantic intent description for AI understanding
        intentDescription: 'Error handler node that manages errors with retry logic and fallback values. Handles workflow errors by retrying failed operations, continuing workflow execution after errors, and providing graceful degradation. Used for API error handling, retry logic, and making workflows more reliable.',
        intentCategories: ['error_handling', 'retry_logic', 'reliability', 'fault_tolerance'],
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
        // ✅ ROOT-LEVEL: Semantic intent description for AI understanding
        intentDescription: 'Wait node that pauses workflow execution for a specified duration. Delays workflow execution between steps, implements rate limiting between API calls, and creates scheduled delays. Used for rate limiting, delays between operations, and polling intervals.',
        intentCategories: ['delay', 'rate_limiting', 'timing_control', 'workflow_pause'],
      },
      commonPatterns: [],
      validationRules: [],
    };
  }

  private createDelaySchema(): NodeSchema {
    return {
      type: 'delay',
      label: 'Delay',
      category: 'utility',
      description: 'Pause the workflow execution for a specified amount of time',
      configSchema: {
        required: ['duration'],
        optional: {
          duration: {
            type: 'number',
            description: 'Time to delay (in milliseconds)',
            examples: [1000, 5000, '{{$json.waitTime}}'],
          },
          unit: {
            type: 'string',
            description: 'Unit of time (milliseconds, seconds, minutes)',
            default: 'milliseconds',
            options: [
              { label: 'Milliseconds', value: 'milliseconds' },
              { label: 'Seconds', value: 'seconds' },
              { label: 'Minutes', value: 'minutes' },
            ],
          },
        },
      },
      aiSelectionCriteria: {
        whenToUse: [
          'Need to add a pause between steps',
          'Simulate human-like delays',
          'Wait for external systems to process',
        ],
        whenNotToUse: [
          'Long delays (>10 minutes) that might timeout',
          'If you need exact timing, consider schedule trigger',
        ],
        keywords: ['wait', 'pause', 'delay', 'sleep', 'throttle'],
        useCases: ['Rate limiting', 'Waiting for webhook', 'Simulating user input'],
        intentDescription: 'Delay node that pauses workflow execution for a specified duration. Adds pauses between steps, simulates human-like delays, and waits for external systems to process requests. Used for rate limiting, waiting for webhook responses, and simulating user input timing.',
        intentCategories: ['delay', 'timing_control', 'rate_limiting', 'workflow_pause'],
      },
      commonPatterns: [
        {
          name: 'wait_2_seconds',
          description: 'Pause for 2 seconds',
          config: { duration: 2000 },
        },
        {
          name: 'wait_1_minute',
          description: 'Pause for 1 minute',
          config: { duration: 1, unit: 'minutes' },
        },
      ],
      validationRules: [
        {
          field: 'duration',
          validator: (value) => typeof value === 'number' && value > 0,
          errorMessage: 'Duration must be a positive number',
        },
      ],
      outputType: 'object',
      outputSchema: {
        success: { type: 'boolean' },
        waitedMs: { type: 'number' },
        originalInput: { type: 'object' },
      },
      schemaVersion: '1.0.0',
      keywords: ['delay', 'wait', 'pause', 'sleep', 'throttle', 'rate limit', 'cooldown'],
      providers: [],
    };
  }

  private createTimeoutSchema(): NodeSchema {
    return {
      type: 'timeout',
      label: 'Timeout',
      category: 'flow',
      description: 'Fails the workflow if execution takes longer than specified time',
      configSchema: {
        required: ['limit'],
        optional: {
          limit: {
            type: 'number',
            description: 'Maximum allowed time (in milliseconds)',
            examples: [5000, 10000, '{{$json.timeout}}'],
          },
        },
      },
      aiSelectionCriteria: {
        whenToUse: [
          'Prevent long-running operations',
          'Ensure external API calls respond quickly',
          'Add SLA enforcement',
        ],
        whenNotToUse: [
          'If you need exact timing, use Delay',
          'For indefinite waits, not suitable',
        ],
        keywords: ['timeout', 'limit', 'deadline', 'abort'],
        useCases: ['API call timeout', 'Database query timeout', 'Step timeout'],
        intentDescription: 'Timeout node that fails workflow execution if it takes longer than the specified time limit. Prevents long-running operations, ensures external API calls respond quickly, and enforces SLA requirements. Used for API call timeouts, database query timeouts, and step-level timeout enforcement.',
        intentCategories: ['timeout', 'execution_control', 'sla_enforcement', 'error_prevention'],
      },
      commonPatterns: [
        {
          name: '5_second_timeout',
          description: 'Timeout after 5 seconds',
          config: { limit: 5000 },
        },
      ],
      validationRules: [
        {
          field: 'limit',
          validator: (value) => typeof value === 'number' && value > 0,
          errorMessage: 'Limit must be a positive number',
        },
      ],
      outputType: 'object',
      outputSchema: {
        success: { type: 'boolean' },
        timedOut: { type: 'boolean' },
        elapsedMs: { type: 'number' },
      },
      schemaVersion: '1.0.0',
      keywords: ['timeout', 'limit', 'deadline', 'abort', 'time limit', 'max time', 'execution time'],
      providers: [],
    };
  }

  private createReturnSchema(): NodeSchema {
    return {
      type: 'return',
      label: 'Return',
      category: 'flow',
      description: 'Stops workflow execution and returns the specified data',
      configSchema: {
        required: [],
        optional: {
          value: {
            type: 'expression',
            description: 'Value to return (can be a template or static value)',
            examples: ['{{$json}}', 'Success', '{ "key": "value" }'],
          },
          includeInput: {
            type: 'boolean',
            description: 'Include the input data in the return value',
            default: false,
          },
        },
      },
      aiSelectionCriteria: {
        whenToUse: [
          'Need to exit early',
          'Return a specific result from a sub-workflow',
          'Conditional termination',
        ],
        whenNotToUse: [
          'If workflow should continue',
          'For logging, use Log node',
        ],
        keywords: ['return', 'exit', 'stop', 'break'],
        useCases: ['Early exit on condition', 'Sub-workflow result'],
        intentDescription: 'Return node that stops workflow execution and returns specified data. Allows early exit from workflows, returning specific results from sub-workflows, and conditional termination. Used for early exit on conditions, sub-workflow result returns, and controlled workflow termination.',
        intentCategories: ['flow_control', 'workflow_termination', 'early_exit', 'result_return'],
      },
      commonPatterns: [
        {
          name: 'return_input',
          description: 'Return the input data',
          config: { includeInput: true },
        },
        {
          name: 'return_static',
          description: 'Return static value',
          config: { value: 'Done' },
        },
      ],
      validationRules: [],
      outputType: 'any',
      outputSchema: {},
      schemaVersion: '1.0.0',
      keywords: ['return', 'exit', 'stop', 'break', 'terminate', 'end workflow', 'early exit'],
      providers: [],
    };
  }

  private createExecuteWorkflowSchema(): NodeSchema {
    return {
      type: 'execute_workflow',
      label: 'Execute Workflow',
      category: 'workflow',
      description: 'Executes another workflow and returns its result',
      configSchema: {
        required: ['workflowId'],
        optional: {
          workflowId: {
            type: 'string',
            description: 'ID of the workflow to execute',
            examples: ['123e4567-e89b-12d3-a456-426614174000', '{{$json.workflowId}}'],
          },
          input: {
            type: 'object',
            description: 'Input data to pass to the sub-workflow',
            examples: ['{{$json}}', '{ "key": "value" }'],
          },
          waitForCompletion: {
            type: 'boolean',
            description: 'Wait for the sub-workflow to finish',
            default: true,
          },
        },
      },
      aiSelectionCriteria: {
        whenToUse: [
          'Need to reuse a workflow',
          'Modularize complex logic',
          'Call a sub-workflow',
        ],
        whenNotToUse: [
          'For simple operations, use built-in nodes',
          'If sub-workflow may run indefinitely',
        ],
        keywords: ['subworkflow', 'execute', 'call', 'invoke'],
        useCases: ['Reusable components', 'Modular design'],
        intentDescription: 'Execute workflow node that runs another workflow as a sub-workflow and returns its result. Enables workflow composition, modularization of complex logic, and reusable workflow components. Used for calling sub-workflows, modularizing complex logic, and creating reusable workflow components.',
        intentCategories: ['workflow_composition', 'modular_workflow', 'sub_workflow', 'workflow_reuse'],
      },
      commonPatterns: [
        {
          name: 'call_other_workflow',
          description: 'Execute workflow with current input',
          config: { workflowId: 'abc-123', input: '{{$json}}' },
        },
      ],
      validationRules: [
        {
          field: 'workflowId',
          validator: (value) => typeof value === 'string' && value.length > 0,
          errorMessage: 'Workflow ID must be a non-empty string',
        },
      ],
      outputType: 'object',
      outputSchema: {
        success: { type: 'boolean' },
        result: { type: 'any' },
        workflowId: { type: 'string' },
      },
      schemaVersion: '1.0.0',
        keywords: ['subworkflow', 'execute', 'call workflow', 'invoke workflow', 'nested workflow', 'workflow call'],
      providers: [],
    };
  }

  private createTryCatchSchema(): NodeSchema {
    return {
      type: 'try_catch',
      label: 'Try/Catch',
      category: 'flow',
      description: 'Executes a branch and catches errors, routing to error handler',
      configSchema: {
        required: [],
        optional: {},
      },
      aiSelectionCriteria: {
        whenToUse: [
          'Handle potential errors gracefully',
          'Provide fallback logic',
          'Log errors without stopping workflow',
        ],
        whenNotToUse: [
          'If no error handling needed',
          'For simple conditionals, use If node',
        ],
        keywords: ['try', 'catch', 'error', 'exception', 'handle'],
        useCases: ['API call error handling', 'Database operation fallback'],
        intentDescription: 'Try/catch node that executes a branch and catches errors, routing execution to an error handler. Handles potential errors gracefully, provides fallback logic, and logs errors without stopping workflow execution. Used for API call error handling, database operation fallbacks, and graceful error recovery.',
        intentCategories: ['error_handling', 'exception_handling', 'error_recovery', 'fault_tolerance'],
      },
      commonPatterns: [
        {
          name: 'basic_try_catch',
          description: 'Try branch and catch errors',
          config: {},
        },
      ],
      validationRules: [],
      outputType: 'object',
      outputSchema: {
        success: { type: 'boolean' },
        error: { type: 'string', optional: true },
      },
      schemaVersion: '1.0.0',
      keywords: ['try', 'catch'],
      providers: [],
    };
  }

  private createRetrySchema(): NodeSchema {
    return {
      type: 'retry',
      label: 'Retry',
      category: 'flow',
      description: 'Retries a branch on failure up to a maximum number of attempts',
      configSchema: {
        required: ['maxAttempts'],
        optional: {
          maxAttempts: {
            type: 'number',
            description: 'Maximum number of retry attempts',
            default: 3,
            examples: [3, 5],
          },
          delayBetween: {
            type: 'number',
            description: 'Delay between retries (in milliseconds)',
            default: 1000,
          },
          backoff: {
            type: 'string',
            description: 'Backoff strategy (none, linear, exponential)',
            default: 'none',
            options: [
              { label: 'None', value: 'none' },
              { label: 'Linear', value: 'linear' },
              { label: 'Exponential', value: 'exponential' },
            ],
          },
        },
      },
      aiSelectionCriteria: {
        whenToUse: [
          'Handle transient failures',
          'Improve reliability of external calls',
          'When operations may fail intermittently',
        ],
        whenNotToUse: [
          'If operation never succeeds on retry',
          'For permanent failures, use try/catch',
        ],
        keywords: ['retry', 'attempt', 'repeat', 'backoff', 'retry on failure', 'retry logic', 'retry mechanism'],
        useCases: ['API retry', 'Database retry on deadlock'],
        intentDescription: 'Retry node that retries a branch on failure up to a maximum number of attempts with configurable delays and backoff strategies. Handles transient failures, improves reliability of external calls, and manages intermittent operation failures. Used for API retries, database retries on deadlocks, and improving workflow reliability.',
        intentCategories: ['retry_logic', 'error_recovery', 'reliability', 'fault_tolerance'],
      },
      commonPatterns: [
        {
          name: 'retry_3_times',
          description: 'Retry up to 3 times with 1 second delay',
          config: { maxAttempts: 3, delayBetween: 1000 },
        },
      ],
      validationRules: [
        {
          field: 'maxAttempts',
          validator: (v) => typeof v === 'number' && v >= 1,
          errorMessage: 'maxAttempts must be at least 1',
        },
      ],
      outputType: 'object',
      outputSchema: {
        success: { type: 'boolean' },
        attempts: { type: 'number' },
        lastError: { type: 'string', optional: true },
      },
      schemaVersion: '1.0.0',
      keywords: ['retry'],
      providers: [],
    };
  }

  private createParallelSchema(): NodeSchema {
    return {
      type: 'parallel',
      label: 'Parallel',
      category: 'flow',
      description: 'Runs multiple branches concurrently and waits for all to complete',
      configSchema: {
        required: [],
        optional: {
          mode: {
            type: 'string',
            description: 'Execution mode (all, race)',
            default: 'all',
            options: [
              { label: 'Wait for all', value: 'all' },
              { label: 'Race (first completes)', value: 'race' },
            ],
          },
        },
      },
      aiSelectionCriteria: {
        whenToUse: [
          'Perform independent tasks simultaneously',
          'Speed up workflow by parallelizing',
          'Fan-out/fan-in pattern',
        ],
        whenNotToUse: [
          'If branches depend on each other',
          'When order matters',
        ],
        keywords: ['parallel', 'concurrent', 'simultaneous', 'fork', 'join', 'run in parallel', 'parallel execution', 'at the same time'],
        useCases: ['Parallel API calls', 'Batch processing'],
        intentDescription: 'Parallel node that runs multiple branches concurrently and waits for all to complete (or first to complete in race mode). Performs independent tasks simultaneously, speeds up workflows by parallelizing operations, and implements fan-out/fan-in patterns. Used for parallel API calls, batch processing, and concurrent task execution.',
        intentCategories: ['parallel_execution', 'concurrency', 'performance_optimization', 'fan_out_fan_in'],
      },
      commonPatterns: [
        {
          name: 'parallel_all',
          description: 'Run all branches and wait',
          config: { mode: 'all' },
        },
      ],
      validationRules: [],
        outputType: 'object',
        outputSchema: {
          success: { type: 'boolean' },
          results: { type: 'array' },
        },
      schemaVersion: '1.0.0',
      keywords: ['parallel'],
      providers: [],
    };
  }

  private createQueuePushSchema(): NodeSchema {
    return {
      type: 'queue_push',
      label: 'Queue Push',
      category: 'queue',
      description: 'Push a message to a queue',
      configSchema: {
        required: ['queueName', 'message'],
        optional: {
          queueName: {
            type: 'string',
            description: 'Name of the queue',
            examples: ['tasks', 'emails', '{{$json.queue}}'],
          },
          message: {
            type: 'object',
            description: 'Message to push (can be any JSON-serializable value)',
            examples: ['{{$json}}', '{ "task": "process" }'],
          },
          options: {
            type: 'object',
            description: 'Additional Bull options (delay, priority, etc.)',
          },
        },
      },
      aiSelectionCriteria: {
        whenToUse: [
          'Offload tasks to background workers',
          'Decouple workflow steps',
          'Implement message queues',
        ],
        whenNotToUse: [
          'For immediate processing, use direct execution',
          'If order is critical, ensure queue preserves order',
        ],
        keywords: ['queue', 'push', 'enqueue', 'bull', 'redis'],
        useCases: ['Background jobs', 'Task distribution'],
        intentDescription: 'Queue push node that adds messages to a message queue for background processing. Offloads tasks to background workers, decouples workflow steps, and implements message queue patterns. Used for background job distribution, task queuing, and asynchronous processing.',
        intentCategories: ['message_queue', 'background_processing', 'task_distribution', 'asynchronous_processing'],
      },
      commonPatterns: [
        {
          name: 'push_json',
          description: 'Push current JSON to queue',
          config: { queueName: 'tasks', message: '{{$json}}' },
        },
      ],
      validationRules: [
        {
          field: 'queueName',
          validator: (v) => typeof v === 'string' && v.length > 0,
          errorMessage: 'Queue name required',
        },
      ],
      outputType: 'object',
      outputSchema: {
        success: { type: 'boolean' },
        jobId: { type: 'string', optional: true },
      },
      schemaVersion: '1.0.0',
      keywords: ['queue', 'push'],
      providers: ['redis', 'bull'],
    };
  }

  private createQueueConsumeSchema(): NodeSchema {
    return {
      type: 'queue_consume',
      label: 'Queue Consume',
      category: 'queue',
      description: 'Consume a message from a queue (waits for next message)',
      configSchema: {
        required: ['queueName'],
        optional: {
          queueName: {
            type: 'string',
            description: 'Name of the queue',
            examples: ['tasks', 'emails'],
          },
          timeout: {
            type: 'number',
            description: 'Maximum wait time in milliseconds (0 = infinite)',
            default: 30000,
          },
          autoAck: {
            type: 'boolean',
            description: 'Automatically acknowledge message after processing',
            default: true,
          },
        },
      },
      aiSelectionCriteria: {
        whenToUse: [
          'Process jobs from a queue',
          'Implement worker pattern',
          'Handle background tasks',
        ],
        whenNotToUse: [
          'For real-time processing, use webhook',
          'If queue is empty and you cannot wait',
        ],
        keywords: ['queue', 'consume', 'pop', 'dequeue', 'worker'],
        useCases: ['Background job processing', 'Task execution'],
        intentDescription: 'Queue consume node that retrieves and processes messages from a message queue. Waits for messages from the queue, implements worker patterns, and handles background task processing. Used for background job processing, task execution from queues, and worker pattern implementation.',
        intentCategories: ['message_queue', 'worker_pattern', 'background_processing', 'task_consumption'],
      },
      commonPatterns: [
        {
          name: 'consume_task',
          description: 'Wait for next task',
          config: { queueName: 'tasks', timeout: 60000 },
        },
      ],
      validationRules: [
        {
          field: 'queueName',
          validator: (v) => typeof v === 'string' && v.length > 0,
          errorMessage: 'Queue name required',
        },
      ],
      outputType: 'object',
      outputSchema: {
        success: { type: 'boolean' },
        message: { type: 'any' },
        jobId: { type: 'string' },
      },
      schemaVersion: '1.0.0',
      keywords: ['queue', 'consume'],
      providers: ['redis', 'bull'],
    };
  }

  private createCacheGetSchema(): NodeSchema {
    return {
      type: 'cache_get',
      label: 'Cache Get',
      category: 'cache',
      description: 'Retrieve a value from cache by key',
      configSchema: {
        required: ['key'],
        optional: {
          key: {
            type: 'string',
            description: 'Cache key',
            examples: ['user:123', '{{$json.userId}}'],
          },
          defaultValue: {
            type: 'object',
            description: 'Value to return if key not found',
          },
        },
      },
      aiSelectionCriteria: {
        whenToUse: [
          'Reduce repeated computations',
          'Store temporary data',
          'Implement caching layer',
        ],
        whenNotToUse: [
          'For persistent storage, use database',
          'If data changes frequently',
        ],
        keywords: ['cache', 'get', 'retrieve', 'redis'],
        useCases: ['Caching API responses', 'Session data'],
        intentDescription: 'Cache get node that retrieves values from a cache by key. Reduces repeated computations, provides fast data access, and implements caching layers. Used for caching API responses, session data retrieval, and performance optimization through caching.',
        intentCategories: ['caching', 'performance_optimization', 'data_retrieval', 'temporary_storage'],
      },
      commonPatterns: [
        {
          name: 'get_user',
          description: 'Get user data from cache',
          config: { key: 'user:{{$json.userId}}' },
        },
      ],
      validationRules: [
        {
          field: 'key',
          validator: (v) => typeof v === 'string' && v.length > 0,
          errorMessage: 'Key must be non-empty string',
        },
      ],
      outputType: 'any',
      outputSchema: {
        success: { type: 'boolean' },
        found: { type: 'boolean' },
        value: { type: 'any' },
      },
      schemaVersion: '1.0.0',
      keywords: ['cache', 'get'],
      providers: ['redis'],
    };
  }

  private createCacheSetSchema(): NodeSchema {
    return {
      type: 'cache_set',
      label: 'Cache Set',
      category: 'cache',
      description: 'Store a value in cache with optional TTL',
      configSchema: {
        required: ['key', 'value'],
        optional: {
          key: {
            type: 'string',
            description: 'Cache key',
            examples: ['user:123', '{{$json.userId}}'],
          },
          value: {
            type: 'object',
            description: 'Value to store (will be JSON stringified)',
            examples: ['{{$json}}', '{ "name": "John" }'],
          },
          ttl: {
            type: 'number',
            description: 'Time-to-live in seconds (0 = no expiration)',
            default: 0,
          },
        },
      },
      aiSelectionCriteria: {
        whenToUse: [
          'Cache expensive computations',
          'Store temporary data',
          'Implement session storage',
        ],
        whenNotToUse: [
          'For permanent storage, use database',
          'If data is sensitive and must be encrypted',
        ],
        keywords: ['cache', 'set', 'store', 'redis'],
        useCases: ['Caching results', 'Session management'],
        intentDescription: 'Cache set node that stores values in a cache with optional time-to-live (TTL). Caches expensive computations, stores temporary data, and implements session storage. Used for caching results, session management, and performance optimization through temporary data storage.',
        intentCategories: ['caching', 'performance_optimization', 'data_storage', 'temporary_storage'],
      },
      commonPatterns: [
        {
          name: 'cache_api_response',
          description: 'Cache API response for 1 hour',
          config: { key: 'api:{{$json.endpoint}}', value: '{{$json.response}}', ttl: 3600 },
        },
      ],
      validationRules: [
        {
          field: 'key',
          validator: (v) => typeof v === 'string' && v.length > 0,
          errorMessage: 'Key must be non-empty string',
        },
      ],
      outputType: 'object',
      outputSchema: {
        success: { type: 'boolean' },
      },
      schemaVersion: '1.0.0',
      keywords: ['cache', 'set'],
      providers: ['redis'],
    };
  }

  private createOAuth2AuthSchema(): NodeSchema {
    return {
      type: 'oauth2_auth',
      label: 'OAuth2 Auth',
      category: 'auth',
      description: 'Handles OAuth2 authentication and provides access tokens',
      configSchema: {
        required: ['provider'],
        optional: {
          provider: {
            type: 'string',
            description: 'OAuth2 provider (google, github, etc.)',
            options: [
              { label: 'Google', value: 'google' },
              { label: 'GitHub', value: 'github' },
              { label: 'Custom', value: 'custom' },
            ],
          },
          authUrl: {
            type: 'string',
            description: 'Authorization URL (for custom provider)',
          },
          tokenUrl: {
            type: 'string',
            description: 'Token URL (for custom provider)',
          },
          clientId: {
            type: 'string',
            description: 'Client ID',
          },
          clientSecret: {
            type: 'string',
            description: 'Client Secret',
          },
          scope: {
            type: 'string',
            description: 'OAuth scopes',
          },
          action: {
            type: 'string',
            description: 'Action: getToken, refresh, or startFlow',
            default: 'getToken',
            options: [
              { label: 'Get Token', value: 'getToken' },
              { label: 'Refresh Token', value: 'refresh' },
              { label: 'Start OAuth Flow', value: 'startFlow' },
            ],
          },
        },
      },
      aiSelectionCriteria: {
        whenToUse: [
          'Need to authenticate with OAuth2 APIs',
          'Managing access tokens',
        ],
        whenNotToUse: [
          'For API keys, use API Key Auth',
          'If you have long-lived tokens',
        ],
        keywords: ['oauth', 'oauth2', 'auth', 'authentication', 'token'],
        useCases: ['Google APIs', 'GitHub API', 'Salesforce'],
        intentDescription: 'OAuth2 authentication node that handles OAuth2 authentication flows and manages access tokens. Authenticates with OAuth2-protected APIs, manages token refresh, and provides access tokens for API calls. Used for Google APIs, GitHub API, Salesforce, and other OAuth2-protected services.',
        intentCategories: ['authentication', 'oauth2', 'token_management', 'api_authentication'],
      },
      commonPatterns: [
        {
          name: 'google_oauth',
          description: 'Get Google access token',
          config: { provider: 'google', action: 'getToken' },
        },
      ],
      validationRules: [],
      outputType: 'object',
      outputSchema: {
        success: { type: 'boolean' },
        accessToken: { type: 'string', optional: true },
        refreshToken: { type: 'string', optional: true },
        expiresIn: { type: 'number', optional: true },
      },
      schemaVersion: '1.0.0',
      keywords: ['oauth', 'auth'],
      providers: ['oauth2'],
    };
  }

  private createApiKeyAuthSchema(): NodeSchema {
    return {
      type: 'api_key_auth',
      label: 'API Key Auth',
      category: 'auth',
      description: 'Provides an API key for authentication',
      configSchema: {
        required: ['apiKeyName'],
        optional: {
          apiKeyName: {
            type: 'string',
            description: 'Name of the stored API key',
            examples: ['openai', 'stripe'],
          },
        },
      },
      aiSelectionCriteria: {
        whenToUse: [
          'Need to authenticate with API key',
          'Simple authentication',
        ],
        whenNotToUse: [
          'For OAuth2, use OAuth2 Auth',
          'If key needs to be rotated frequently',
        ],
        keywords: ['apikey', 'auth', 'key'],
        useCases: ['OpenAI API', 'Stripe API'],
        intentDescription: 'API key authentication node that provides API keys for authenticating with services that use API key-based authentication. Retrieves stored API keys and provides them for API calls. Used for OpenAI API, Stripe API, and other services that use simple API key authentication.',
        intentCategories: ['authentication', 'api_key', 'simple_auth', 'api_authentication'],
      },
      commonPatterns: [
        {
          name: 'get_openai_key',
          description: 'Get OpenAI API key',
          config: { apiKeyName: 'openai' },
        },
      ],
      validationRules: [
        {
          field: 'apiKeyName',
          validator: (v) => typeof v === 'string' && v.length > 0,
          errorMessage: 'API key name required',
        },
      ],
      outputType: 'object',
      outputSchema: {
        success: { type: 'boolean' },
        apiKey: { type: 'string' },
      },
      schemaVersion: '1.0.0',
      keywords: ['apikey'],
      providers: ['apikey'],
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
        // ✅ ROOT-LEVEL: Semantic intent description for AI understanding
        intentDescription: 'Slack message node that sends messages to Slack channels or users via Slack webhooks or API. Sends notifications, alerts, and reports to Slack workspaces. Used for team notifications, alert systems, and Slack-based communication workflows.',
        intentCategories: ['slack', 'communication', 'notification', 'team_collaboration'],
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
      // ✅ WORLD-CLASS: Terminal capability - can serve as workflow output (email workflows)
      capabilities: [
        'email.send',
        'gmail.send',
        'google.mail',
        'email.read',
        'gmail.read',
        'terminal', // Can serve as workflow output
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
        // ✅ ROOT-LEVEL: Semantic intent description for AI understanding
        intentDescription: 'Gmail email integration for sending, reading, and managing emails via Google Gmail API. Uses OAuth authentication to access Gmail accounts. Performs email operations like sending emails to recipients, reading email messages, searching emails, and managing Gmail inbox. Used for email notifications, email automation, and Google Workspace email workflows.',
        intentCategories: ['email', 'communication', 'google_workspace', 'notification', 'gmail'],
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
        // ✅ ROOT-LEVEL: Semantic intent description for AI understanding
        intentDescription: 'Generic email node that sends emails via SMTP (Simple Mail Transfer Protocol). Sends email notifications, reports, and alerts to recipients using SMTP servers. Used for email notifications, automated reports, and alert systems when Gmail/Outlook OAuth is not needed.',
        intentCategories: ['email', 'smtp', 'communication', 'notification'],
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
        // ✅ ROOT-LEVEL: Semantic intent description for AI understanding
        intentDescription: 'Log output node that logs data to console or file for debugging, audit trails, and monitoring. Records workflow execution data, debug information, and audit logs. Used for debugging workflows, creating audit trails, and monitoring workflow execution.',
        intentCategories: ['logging', 'debugging', 'monitoring', 'audit'],
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
        // ✅ ROOT-LEVEL: Semantic intent description for AI understanding
        intentDescription: 'Microsoft Outlook email integration that sends, reads, and manages emails via Outlook API using OAuth authentication. Performs email operations like sending emails, reading messages, searching emails, and managing Outlook inbox. Used for Outlook email automation and Microsoft email integration.',
        intentCategories: ['email', 'outlook', 'microsoft', 'communication', 'oauth'],
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
        // ✅ ROOT-LEVEL: Semantic intent description for AI understanding
        intentDescription: 'Telegram message node that sends messages to Telegram chats using Telegram Bot API. Sends text messages, photos, videos, documents, and other media types to Telegram channels or users. Used for Telegram bot notifications, alerts to Telegram channels, and Telegram-based communication workflows.',
        intentCategories: ['telegram', 'communication', 'bot', 'notification', 'messaging'],
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
        intentDescription: 'Salesforce CRM integration node that works with Salesforce objects (Account, Contact, Lead, Opportunity, etc.) using REST API, SOQL, and SOSL. Performs CRM operations including querying, creating, updating, deleting, and bulk operations on Salesforce records. Used for CRM workflows, syncing data between Salesforce and other systems, and managing Salesforce objects.',
        intentCategories: ['crm', 'salesforce', 'customer_relationship_management', 'data_sync', 'business_automation'],
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
        // ✅ ROOT-LEVEL: Semantic intent description for AI understanding
        intentDescription: 'Autonomous AI agent with memory, tools, and reasoning capabilities. Performs complex AI interactions, conversational AI, chatbot functionality, and AI-powered decision making. Uses chat models with memory and tools to provide intelligent, context-aware responses and actions. Used for chatbots, AI assistants, conversational interfaces, and complex AI workflows.',
        intentCategories: ['ai_agent', 'conversational_ai', 'chatbot', 'ai_reasoning', 'ai_assistant', 'nlp'],
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
        // ✅ ROOT-LEVEL: Semantic intent description for AI understanding
        intentDescription: 'AI-powered text processing using language models. Performs natural language tasks like summarization, analysis, classification, generation, and transformation of text data. Uses LLM (Large Language Model) to understand context and generate intelligent responses.',
        intentCategories: ['ai_summarization', 'ai_analysis', 'ai_generation', 'text_processing', 'nlp', 'llm'],
      },
      commonPatterns: [],
      validationRules: [],
      // ✅ WORLD-CLASS: Terminal capability - can serve as workflow output (chatbot workflows)
      capabilities: ['ai_processing', 'transformation', 'llm', 'summarize', 'analyze', 'terminal'],
      // ✅ CRITICAL: Explicit I/O type contract for type system
      nodeCapability: {
        inputType: ['text', 'array'], // Can accept both text and array
        outputType: 'text', // Produces text output
        acceptsArray: true,
        producesArray: false,
      },
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
        intentDescription: 'Generic AI service node that performs various AI-powered text processing operations including summarization, analysis, extraction, classification, and translation. Provides a unified interface for AI operations with configurable service types and providers. Used for text summarization, data analysis, content extraction, classification, translation, and general AI text processing.',
        intentCategories: ['ai_processing', 'text_processing', 'ai_summarization', 'ai_analysis', 'nlp', 'ai_service'],
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
        intentDescription: 'ClickUp integration node that creates, reads, and manages ClickUp tasks, lists, spaces, and workspaces. Performs project management operations including creating tasks, querying task lists, managing workspaces, and syncing data with ClickUp. Used for project management automation, task creation from form submissions, and syncing CRM events into ClickUp.',
        intentCategories: ['project_management', 'clickup', 'task_management', 'workflow_automation', 'productivity'],
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
        // ✅ ROOT-LEVEL: Semantic intent description for AI understanding
        intentDescription: 'Chat trigger that executes workflows from chat or AI interactions. Receives chat messages from users and triggers workflow execution. Used for chatbot workflows, conversational AI, AI assistants, and chat-based user interactions.',
        intentCategories: ['chat_trigger', 'conversational_ai', 'chatbot', 'user_interaction'],
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
        intentDescription: 'LinkedIn integration node that posts content to LinkedIn, manages LinkedIn profiles and company pages. Creates text posts, media posts, articles, and manages LinkedIn content. Used for professional content sharing, LinkedIn automation, and social media marketing on LinkedIn.',
        intentCategories: ['social_media', 'linkedin', 'content_sharing', 'professional_network', 'social_automation'],
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
        intentDescription: 'Twitter/X integration node that posts tweets, manages Twitter accounts, searches tweets, and interacts with Twitter API. Creates tweets, deletes tweets, searches recent tweets, and manages Twitter content. Used for Twitter automation, tweet sharing, and social media marketing on Twitter/X.',
        intentCategories: ['social_media', 'twitter', 'tweet', 'content_sharing', 'social_automation'],
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
        intentDescription: 'Instagram integration node that posts content to Instagram including images, videos, stories, and manages Instagram media. Creates and publishes Instagram posts, manages media, and interacts with Instagram API. Used for Instagram automation, visual content sharing, and social media marketing on Instagram.',
        intentCategories: ['social_media', 'instagram', 'image_sharing', 'visual_content', 'social_automation'],
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
        intentDescription: 'YouTube integration node that publishes videos or posts to YouTube channels. Uploads videos, updates video metadata, creates YouTube posts, and manages YouTube content. Used for video marketing, YouTube automation, and publishing video content to YouTube channels.',
        intentCategories: ['social_media', 'youtube', 'video_upload', 'content_sharing', 'video_marketing'],
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
        intentDescription: 'HubSpot CRM integration node that performs CRM operations on HubSpot objects including contacts, companies, deals, tickets, products, and other HubSpot entities. Creates, updates, retrieves, searches, and manages HubSpot records. Used for contact management, deal tracking, company management, ticket management, and syncing data with HubSpot.',
        intentCategories: ['crm', 'hubspot', 'customer_relationship_management', 'contact_management', 'deal_tracking'],
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
        intentDescription: 'Airtable integration node that reads, writes, updates, and deletes records in Airtable bases and tables. Performs database-like operations on Airtable records including creating, reading, updating, and deleting records. Used for Airtable record management, data synchronization with Airtable, and database operations in Airtable.',
        intentCategories: ['database', 'airtable', 'data_storage', 'record_management', 'data_sync'],
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
        intentDescription: 'Notion integration node that reads, writes, updates, and deletes pages, databases, and blocks in Notion. Performs operations on Notion content including creating pages, managing databases, searching content, and managing Notion blocks. Used for Notion page management, database operations in Notion, and productivity workflow automation.',
        intentCategories: ['productivity', 'notion', 'content_management', 'database', 'knowledge_management'],
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
        intentDescription: 'Zoho CRM integration node that performs CRM operations on Zoho CRM modules including Leads, Contacts, Accounts, Deals, and related lists. Creates, updates, retrieves, searches, and deletes Zoho CRM records. Used for Zoho CRM record management, data synchronization with Zoho CRM, and CRM workflow automation.',
        intentCategories: ['crm', 'zoho', 'customer_relationship_management', 'record_management', 'data_sync'],
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
        intentDescription: 'Pipedrive CRM integration node that manages deals, persons, organizations, and activities in Pipedrive. Creates, updates, retrieves, searches, and deletes Pipedrive resources. Used for Pipedrive deal management, person and organization management, and CRM workflow automation with Pipedrive.',
        intentCategories: ['crm', 'pipedrive', 'customer_relationship_management', 'deal_management', 'contact_management'],
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
        intentDescription: 'Discord integration node that sends messages to Discord channels or users via Discord Bot API. Sends text messages, notifications, and alerts to Discord channels. Used for Discord notifications, team communication via Discord, and Discord-based workflow automation.',
        intentCategories: ['communication', 'discord', 'notification', 'team_collaboration', 'chat_message'],
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
        intentDescription: 'JSON parser node that parses JSON strings into JavaScript objects and extracts specific fields. Converts JSON string data into structured objects, extracts specific fields from parsed JSON, and prepares JSON data for further processing. Used for JSON parsing, field extraction from JSON, and converting string data to structured objects.',
        intentCategories: ['data_parsing', 'json_processing', 'data_extraction', 'data_transformation'],
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
        intentDescription: 'Merge data node that combines data structures from multiple sources. Merges arrays or objects using different modes (append, join, overwrite) and combines data from parallel branches or multiple sources. Used for data merging, combining results from multiple sources, and integrating data from different paths.',
        intentCategories: ['data_merging', 'data_combination', 'data_integration', 'array_processing'],
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
        intentDescription: 'Edit fields node that edits, renames, or transforms field values in data objects. Modifies field names, transforms field values, and restructures data objects. Used for field editing, data transformation, and restructuring data objects.',
        intentCategories: ['data_transformation', 'field_manipulation', 'data_restructuring', 'field_editing'],
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
        intentDescription: 'Error trigger node that executes workflows when errors occur in other workflows or systems. Triggers error handling workflows, processes error events, and manages error-based automation. Used for error handling workflows, error event processing, and error-based automation.',
        intentCategories: ['error_handling', 'error_trigger', 'fault_tolerance', 'error_processing'],
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
        intentDescription: 'Workflow trigger node that triggers workflows from other workflows. Enables workflow-to-workflow triggering, workflow chaining, and nested workflow execution. Used for workflow chaining, workflow composition, and triggering workflows from other workflows.',
        intentCategories: ['workflow_trigger', 'workflow_chaining', 'workflow_composition', 'nested_workflow'],
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
        // ✅ ROOT-LEVEL: Semantic intent description for AI understanding
        intentDescription: 'Filter node that filters array items based on conditions. Removes array items that do not match specified conditions, keeping only items that satisfy the filter criteria. Used for array filtering, data filtering, and removing items based on conditions.',
        intentCategories: ['data_filtering', 'array_processing', 'conditional_filtering'],
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
        // ✅ ROOT-LEVEL: Semantic intent description for AI understanding
        intentDescription: 'Loop node that iterates over array items with a maximum iterations limit. Processes each item in an array sequentially, executing workflow steps for each item. Used for array iteration, processing multiple items, and batch processing with iteration limits.',
        intentCategories: ['iteration', 'array_processing', 'loop', 'batch_processing'],
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
        intentDescription: 'NoOp (no operation) node that passes data through without performing any operation. Acts as a pass-through node for debugging, workflow structure, or placeholder purposes. Used for pass-through operations, debugging workflows, and maintaining workflow structure.',
        intentCategories: ['utility', 'pass_through', 'debugging', 'placeholder'],
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
        intentDescription: 'Split in batches node that splits arrays into smaller batches for processing. Divides large arrays into smaller chunks to process them in batches, preventing memory issues and enabling batch processing. Used for batch processing, handling large datasets, and processing arrays in manageable chunks.',
        intentCategories: ['batch_processing', 'array_processing', 'data_chunking', 'performance_optimization'],
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
        intentDescription: 'Stop and error node that stops workflow execution with an error message. Terminates workflow execution when errors occur, validation fails, or conditions are not met. Used for error stopping, workflow termination on errors, and error handling in workflows.',
        intentCategories: ['error_handling', 'workflow_termination', 'error_stopping', 'fault_tolerance'],
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
        intentDescription: 'Set variable node that sets workflow variables for use in other nodes. Stores computed values, default values, or transformed data into named variables that can be referenced throughout the workflow. Used for variable setting, storing computed values, and sharing data across workflow nodes.',
        intentCategories: ['variable_assignment', 'data_storage', 'workflow_variables', 'value_storage'],
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
        intentDescription: 'Math node that performs mathematical operations and calculations on numbers. Executes arithmetic operations including addition, subtraction, multiplication, division, and other mathematical functions. Used for mathematical calculations, number operations, and computational tasks in workflows.',
        intentCategories: ['mathematical_operations', 'calculations', 'arithmetic', 'number_processing'],
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
        intentDescription: 'HTML node that parses and manipulates HTML content. Parses HTML strings into structured data, extracts HTML elements, cleans HTML content, and processes HTML documents. Used for HTML parsing, web scraping, and extracting content from HTML documents.',
        intentCategories: ['html_processing', 'web_scraping', 'content_extraction', 'data_parsing'],
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
        intentDescription: 'XML node that parses and manipulates XML content. Parses XML strings into structured data, extracts XML elements, and processes XML documents. Used for XML parsing, extracting data from XML documents, and processing XML-formatted data.',
        intentCategories: ['xml_processing', 'data_parsing', 'content_extraction', 'structured_data'],
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
        intentDescription: 'CSV node that parses and generates CSV (Comma-Separated Values) data. Parses CSV strings into structured arrays/objects, generates CSV strings from data arrays, and handles CSV format conversions. Used for CSV parsing, CSV generation, and working with CSV-formatted data.',
        intentCategories: ['csv_processing', 'data_parsing', 'data_formatting', 'file_processing'],
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
        intentDescription: 'Rename keys node that renames object keys in data objects. Transforms object structure by renaming keys according to specified mappings. Used for key renaming, data structure transformation, and restructuring object keys.',
        intentCategories: ['data_transformation', 'key_manipulation', 'data_restructuring', 'field_renaming'],
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
        whenNotToUse: ['Simple data flow', 'AI-powered summarization or analysis (use ai_chat_model instead)'],
        keywords: ['aggregate', 'sum', 'avg', 'count', 'total', 'join', 'concat', 'concatenate', 'merge'],
        useCases: ['Data aggregation'],
        // ✅ ROOT-LEVEL: Semantic intent description for AI understanding
        intentDescription: 'Mathematical and statistical data aggregation operations. Performs numerical calculations like sum, average, count, min, max on numeric data fields, or joins/concatenates text arrays. Used for data consolidation and mathematical operations, NOT for AI-powered text processing or summarization.',
        intentCategories: ['data_aggregation', 'mathematical_operations', 'statistics', 'data_consolidation'],
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
        intentDescription: 'Sort node that sorts arrays by specified fields in ascending or descending order. Orders array items based on field values, supports numeric, string, and date sorting. Used for array sorting, ordering data, and arranging items in specific sequences.',
        intentCategories: ['array_processing', 'data_sorting', 'data_ordering', 'array_manipulation'],
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
        intentDescription: 'Limit node that limits array size to a specified number of items. Takes only the first N items from an array, preventing processing of large datasets. Used for array limiting, pagination, and controlling data volume in workflows.',
        intentCategories: ['array_processing', 'data_limiting', 'pagination', 'performance_optimization'],
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
        // ✅ ROOT-LEVEL: Semantic intent description for AI understanding
        intentDescription: 'Set node that sets or overrides multiple fields on the current data item. Maps and transforms data by setting field values, overriding existing fields, and creating new fields. Used for field mapping, data transformation, and simple data manipulation.',
        intentCategories: ['data_transformation', 'field_mapping', 'data_manipulation'],
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
        intentDescription: 'OpenAI GPT integration node that performs chat completion using OpenAI GPT models (GPT-4, GPT-3.5-turbo). Sends chat messages to OpenAI API and receives AI-generated responses. Used for OpenAI chat completion, GPT-powered text generation, and OpenAI API integration.',
        intentCategories: ['ai_chat', 'openai', 'gpt', 'text_generation', 'llm'],
      },
      commonPatterns: [],
      validationRules: [],
      capabilities: ['ai.chat', 'openai.completion'],
      providers: ['openai'],
      keywords: ['openai', 'gpt'],
      // ✅ CRITICAL: Explicit I/O type contract for type system
      nodeCapability: {
        inputType: ['text', 'array'], // Can accept both text and array
        outputType: 'text', // Produces text output
        acceptsArray: true,
        producesArray: false,
      },
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
        intentDescription: 'Anthropic Claude integration node that performs chat completion using Anthropic Claude models (Claude-3-Opus, Claude-3-Sonnet). Sends chat messages to Anthropic API and receives AI-generated responses. Used for Claude chat completion, Anthropic-powered text generation, and Claude API integration.',
        intentCategories: ['ai_chat', 'anthropic', 'claude', 'text_generation', 'llm'],
      },
      commonPatterns: [],
      validationRules: [],
      capabilities: ['ai.chat', 'anthropic.completion'],
      providers: ['anthropic'],
      keywords: ['claude', 'anthropic'],
      // ✅ CRITICAL: Explicit I/O type contract for type system
      nodeCapability: {
        inputType: ['text', 'array'], // Can accept both text and array
        outputType: 'text', // Produces text output
        acceptsArray: true,
        producesArray: false,
      },
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
        intentDescription: 'Google Gemini integration node that performs chat completion using Google Gemini models (Gemini Pro, Gemini Pro Vision). Sends prompts to Google Gemini API and receives AI-generated responses. Used for Gemini chat completion, Google AI-powered text generation, and Gemini API integration.',
        intentCategories: ['ai_chat', 'google', 'gemini', 'text_generation', 'llm'],
      },
      commonPatterns: [],
      validationRules: [],
      capabilities: ['ai.chat', 'google.completion'],
      providers: ['google'],
      keywords: ['gemini'],
      // ✅ CRITICAL: Explicit I/O type contract for type system
      nodeCapability: {
        inputType: ['text', 'array'], // Can accept both text and array
        outputType: 'text', // Produces text output
        acceptsArray: true,
        producesArray: false,
      },
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
        intentDescription: 'Ollama integration node that performs chat completion using local Ollama models. Runs AI models locally without requiring cloud API access, providing privacy and cost benefits. Used for local AI chat, on-premises AI processing, and local LLM integration.',
        intentCategories: ['ai_chat', 'ollama', 'local_ai', 'text_generation', 'llm'],
      },
      commonPatterns: [],
      validationRules: [],
      capabilities: ['ai.chat', 'ollama.completion'],
      providers: ['ollama'],
      keywords: ['ollama'],
      // ✅ CRITICAL: Explicit I/O type contract for type system
      nodeCapability: {
        inputType: ['text', 'array'], // Can accept both text and array
        outputType: 'text', // Produces text output
        acceptsArray: true,
        producesArray: false,
      },
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
        intentDescription: 'Text summarizer node that summarizes long text into shorter versions. Condenses lengthy text content into concise summaries while preserving key information. Used for text summarization, content condensation, and creating brief summaries from long documents.',
        intentCategories: ['ai_summarization', 'text_processing', 'content_condensation', 'nlp'],
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
        intentDescription: 'Sentiment analyzer node that analyzes sentiment and emotions in text. Determines whether text expresses positive, negative, or neutral sentiment, and identifies emotional tones. Used for sentiment analysis, emotion detection, and understanding text sentiment in workflows.',
        intentCategories: ['sentiment_analysis', 'emotion_detection', 'text_analysis', 'nlp'],
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
        intentDescription: 'Chat model connector node that provides chat model configuration for AI Agent nodes. Connects AI Agent nodes to specific chat models (Ollama, OpenAI, Claude, Gemini) with configurable parameters. Used for AI Agent connection, chat model configuration, and connecting AI agents to language models.',
        intentCategories: ['ai_connector', 'chat_model', 'ai_agent_support', 'model_configuration'],
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
        intentDescription: 'Memory node that provides memory storage for AI Agent context. Stores conversation history, context, and state for AI agents, enabling context-aware AI interactions. Used for AI memory, context storage, and maintaining conversation state in AI agents.',
        intentCategories: ['ai_memory', 'context_storage', 'ai_agent_support', 'state_management'],
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
        intentDescription: 'Tool connector node that provides external function access for AI Agent nodes. Connects AI agents to external tools and functions, enabling AI agents to perform actions beyond text generation. Used for AI tool connection, external function access, and extending AI agent capabilities.',
        intentCategories: ['ai_tool', 'function_connector', 'ai_agent_support', 'tool_integration'],
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
        intentDescription: 'HTTP POST node that sends POST requests with JSON data to HTTP endpoints. Sends data to external APIs, creates resources via POST, and submits data to web services. Used for HTTP POST requests, API data submission, and sending data to external systems.',
        intentCategories: ['http_post', 'api_integration', 'data_submission', 'http_request'],
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
        intentDescription: 'Webhook response node that sends HTTP responses back to webhook callers. Returns status codes, headers, and response body data to systems that triggered the workflow via webhook. Used for webhook responses, API endpoint responses, and responding to webhook events.',
        intentCategories: ['webhook_response', 'http_response', 'api_endpoint', 'webhook_handling'],
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
        intentDescription: 'GraphQL node that makes GraphQL requests to GraphQL APIs. Executes GraphQL queries and mutations, sends GraphQL requests with variables, and retrieves data from GraphQL endpoints. Used for GraphQL API integration, GraphQL queries, and GraphQL-based data fetching.',
        intentCategories: ['graphql', 'api_integration', 'data_fetching', 'query_language'],
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
        intentDescription: 'Google Drive integration node that performs file operations in Google Drive including uploading, downloading, and listing files. Manages files in Google Drive storage, handles file uploads and downloads, and interacts with Google Drive API. Used for Google Drive file operations, file storage, and Google Workspace file management.',
        intentCategories: ['file_storage', 'google_workspace', 'google_drive', 'file_management'],
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
        intentDescription: 'Google Calendar integration node that creates, reads, updates, and manages calendar events in Google Calendar. Performs calendar operations including creating events, listing events, searching events, and managing calendar data. Used for calendar management, event scheduling, and Google Workspace calendar integration.',
        intentCategories: ['calendar', 'google_workspace', 'event_scheduling', 'calendar_management'],
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
        intentDescription: 'Google Contacts integration node that manages contacts in Google Contacts. Creates, reads, updates, and deletes contacts, manages contact information, and interacts with Google Contacts API. Used for contact management, contact synchronization, and Google Workspace contact integration.',
        intentCategories: ['contact_management', 'google_workspace', 'contact_sync', 'address_book'],
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
        intentDescription: 'Google Tasks integration node that manages tasks in Google Tasks. Creates, reads, updates, and deletes tasks, manages task lists, and interacts with Google Tasks API. Used for task management, task tracking, and Google Workspace task integration.',
        intentCategories: ['task_management', 'google_workspace', 'productivity', 'task_tracking'],
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
        intentDescription: 'Google BigQuery integration node that queries Google BigQuery data warehouse using SQL. Executes SQL queries on BigQuery datasets, performs data warehouse operations, and retrieves large-scale data. Used for BigQuery queries, data warehouse operations, and analyzing large datasets in Google Cloud.',
        intentCategories: ['data_warehouse', 'bigquery', 'google_cloud', 'sql_query', 'analytics'],
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
        intentDescription: 'Slack webhook node that sends messages to Slack channels via Slack incoming webhooks. Sends simple text messages to Slack using webhook URLs. Used for Slack webhook notifications, simple Slack messaging, and Slack-based alerts.',
        intentCategories: ['slack', 'webhook', 'notification', 'communication', 'team_collaboration'],
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
        intentDescription: 'Discord webhook node that sends messages to Discord channels via Discord webhooks. Sends simple text messages to Discord using webhook URLs. Used for Discord webhook notifications, simple Discord messaging, and Discord-based alerts.',
        intentCategories: ['discord', 'webhook', 'notification', 'communication', 'chat_message'],
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
        intentDescription: 'Microsoft Teams integration node that sends messages to Microsoft Teams channels via Teams webhooks. Sends notifications, alerts, and messages to Teams channels. Used for Teams notifications, Microsoft Teams communication, and Teams-based workflow alerts.',
        intentCategories: ['microsoft_teams', 'communication', 'notification', 'team_collaboration', 'microsoft'],
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
        intentDescription: 'WhatsApp Cloud API integration node that sends messages via WhatsApp Cloud API. Sends text messages, media, locations, contacts, and templates to WhatsApp users. Used for WhatsApp messaging, WhatsApp automation, and WhatsApp-based notifications.',
        intentCategories: ['whatsapp', 'messaging', 'communication', 'notification', 'mobile_messaging'],
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
        intentDescription: 'Twilio integration node that sends SMS and voice messages via Twilio API. Sends text messages (SMS) and makes voice calls to phone numbers. Used for SMS messaging, voice calls, and Twilio-based communication workflows.',
        intentCategories: ['twilio', 'sms', 'voice', 'communication', 'mobile_messaging'],
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
        intentDescription: 'Facebook integration node that posts content to Facebook pages. Creates posts on Facebook pages, manages Facebook content, and interacts with Facebook Graph API. Used for Facebook posting, Facebook automation, and social media marketing on Facebook.',
        intentCategories: ['social_media', 'facebook', 'content_sharing', 'social_automation'],
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
        intentDescription: 'MySQL database integration node that executes SQL queries on MySQL databases. Performs database operations including SELECT, INSERT, UPDATE, DELETE queries with parameterized statements. Used for MySQL database operations, data storage, and MySQL-based data management.',
        intentCategories: ['database', 'mysql', 'sql', 'data_storage', 'relational_database'],
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
        intentDescription: 'MongoDB integration node that performs database operations on MongoDB collections. Executes MongoDB operations including find, insert, update, and delete on MongoDB documents. Used for MongoDB operations, NoSQL database management, and document-based data storage.',
        intentCategories: ['database', 'mongodb', 'nosql', 'document_database', 'data_storage'],
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
        intentDescription: 'Redis integration node that performs cache operations on Redis. Executes Redis operations including get, set, and delete on Redis keys. Used for Redis cache operations, temporary data storage, and high-performance caching.',
        intentCategories: ['cache', 'redis', 'temporary_storage', 'performance_optimization', 'key_value_store'],
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
        intentDescription: 'Freshdesk integration node that performs support ticket operations in Freshdesk. Creates, reads, updates, and deletes tickets, contacts, and companies in Freshdesk. Used for support ticket management, customer support automation, and Freshdesk CRM operations.',
        intentCategories: ['crm', 'freshdesk', 'support_ticket', 'customer_support', 'helpdesk'],
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
        intentDescription: 'Intercom integration node that performs messaging operations in Intercom. Sends messages, retrieves conversations, and manages Intercom messaging. Used for Intercom messaging, customer communication via Intercom, and Intercom-based customer support.',
        intentCategories: ['crm', 'intercom', 'messaging', 'customer_communication', 'customer_support'],
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
        intentDescription: 'Mailchimp integration node that performs email marketing operations in Mailchimp. Subscribes and unsubscribes contacts to email lists, sends marketing emails, and manages Mailchimp campaigns. Used for email marketing, newsletter management, and Mailchimp-based email campaigns.',
        intentCategories: ['email_marketing', 'mailchimp', 'newsletter', 'campaign_management', 'email_campaigns'],
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
        intentDescription: 'ActiveCampaign integration node that performs marketing automation operations in ActiveCampaign. Adds, updates, and deletes contacts, manages marketing campaigns, and automates marketing workflows. Used for marketing automation, email marketing campaigns, and ActiveCampaign-based marketing workflows.',
        intentCategories: ['marketing_automation', 'activecampaign', 'email_marketing', 'campaign_management', 'crm'],
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
        intentDescription: 'Read binary file node that reads binary files from the filesystem. Reads binary data from files including images, PDFs, and other binary formats. Used for file reading, binary file processing, and accessing binary file content.',
        intentCategories: ['file_operations', 'binary_file', 'file_reading', 'file_processing'],
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
        intentDescription: 'Write binary file node that writes binary files to the filesystem. Writes binary data to files including images, PDFs, and other binary formats. Used for file writing, binary file creation, and saving binary file content.',
        intentCategories: ['file_operations', 'binary_file', 'file_writing', 'file_processing'],
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
        intentDescription: 'AWS S3 integration node that performs storage operations on Amazon S3. Uploads, downloads, and lists files in S3 buckets, manages cloud storage, and interacts with AWS S3 API. Used for S3 storage, cloud file management, and AWS-based file storage operations.',
        intentCategories: ['file_storage', 'aws', 's3', 'cloud_storage', 'file_management'],
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
        intentDescription: 'Dropbox integration node that performs file operations in Dropbox. Uploads, downloads, and lists files in Dropbox storage, manages cloud files, and interacts with Dropbox API. Used for Dropbox operations, cloud file management, and Dropbox-based file storage.',
        intentCategories: ['file_storage', 'dropbox', 'cloud_storage', 'file_management'],
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
        intentDescription: 'OneDrive integration node that performs file operations in Microsoft OneDrive. Uploads, downloads, and lists files in OneDrive storage, manages cloud files, and interacts with OneDrive API. Used for OneDrive operations, Microsoft cloud file management, and OneDrive-based file storage.',
        intentCategories: ['file_storage', 'onedrive', 'microsoft', 'cloud_storage', 'file_management'],
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
        intentDescription: 'FTP integration node that performs file operations via FTP (File Transfer Protocol). Uploads, downloads, and lists files on FTP servers, manages remote file storage, and interacts with FTP servers. Used for FTP operations, remote file management, and FTP-based file transfers.',
        intentCategories: ['file_storage', 'ftp', 'file_transfer', 'remote_storage'],
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
        intentDescription: 'SFTP integration node that performs file operations via SFTP (Secure File Transfer Protocol). Uploads, downloads, and lists files on SFTP servers with encrypted connections, manages secure remote file storage, and interacts with SFTP servers. Used for SFTP operations, secure remote file management, and encrypted file transfers.',
        intentCategories: ['file_storage', 'sftp', 'secure_file_transfer', 'remote_storage', 'encrypted_transfer'],
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
        intentDescription: 'GitHub integration node that performs repository operations on GitHub. Creates issues, adds comments, creates pull requests, triggers workflows, lists repositories, and manages GitHub resources. Used for GitHub operations, repository management, issue tracking, and GitHub-based DevOps workflows.',
        intentCategories: ['devops', 'github', 'version_control', 'repository_management', 'issue_tracking'],
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
        intentDescription: 'GitLab integration node that performs repository operations on GitLab. Creates, reads, updates, and deletes issues, manages GitLab projects, and interacts with GitLab API. Used for GitLab operations, repository management, issue tracking, and GitLab-based DevOps workflows.',
        intentCategories: ['devops', 'gitlab', 'version_control', 'repository_management', 'issue_tracking'],
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
        intentDescription: 'Bitbucket integration node that performs repository operations on Bitbucket. Creates, reads, updates, and deletes resources, manages Bitbucket repositories, and interacts with Bitbucket API. Used for Bitbucket operations, repository management, and Bitbucket-based DevOps workflows.',
        intentCategories: ['devops', 'bitbucket', 'version_control', 'repository_management'],
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
        intentDescription: 'Jira integration node that performs issue tracking operations in Jira. Creates, reads, updates, and deletes issues, manages Jira projects, and interacts with Jira API. Used for Jira operations, issue tracking, project management, and Jira-based workflow automation.',
        intentCategories: ['devops', 'jira', 'issue_tracking', 'project_management', 'workflow_automation'],
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
        intentDescription: 'Jenkins integration node that performs CI/CD operations in Jenkins. Triggers builds, checks build status, cancels builds, and manages Jenkins jobs. Used for Jenkins operations, CI/CD automation, build management, and Jenkins-based DevOps workflows.',
        intentCategories: ['devops', 'jenkins', 'ci_cd', 'build_automation', 'continuous_integration'],
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
        intentDescription: 'Shopify integration node that performs e-commerce operations in Shopify stores. Creates, reads, updates, and deletes products, orders, customers, and other Shopify resources. Used for Shopify operations, e-commerce automation, store management, and Shopify-based business workflows.',
        intentCategories: ['ecommerce', 'shopify', 'store_management', 'product_management', 'order_management'],
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
        intentDescription: 'WooCommerce integration node that performs e-commerce operations in WooCommerce stores. Creates, reads, updates, and deletes products, orders, customers, and other WooCommerce resources. Used for WooCommerce operations, e-commerce automation, store management, and WooCommerce-based business workflows.',
        intentCategories: ['ecommerce', 'woocommerce', 'store_management', 'product_management', 'order_management'],
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
        intentDescription: 'Stripe integration node that performs payment processing operations via Stripe. Charges customers, processes refunds, creates customers, and manages payment transactions. Used for payment processing, payment automation, transaction management, and Stripe-based payment workflows.',
        intentCategories: ['payment_processing', 'stripe', 'transaction_management', 'ecommerce', 'financial'],
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
        intentDescription: 'PayPal integration node that performs payment processing operations via PayPal. Charges customers, processes refunds, creates payment orders, and manages PayPal transactions. Used for PayPal payment processing, payment automation, transaction management, and PayPal-based payment workflows.',
        intentCategories: ['payment_processing', 'paypal', 'transaction_management', 'ecommerce', 'financial'],
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
   * 
   * ✅ PERMANENT ARCHITECTURE: NO virtual nodes are registered
   * Aliases (gmail, mail, ai) are handled ONLY by node-type-resolver.ts
   * They are NOT separate node types - they resolve to canonical types:
   * - "gmail" → "google_gmail" (via resolver)
   * - "mail" → "email" (via resolver)
   * - "ai" → "ai_service" (via resolver)
   * 
   * This ensures:
   * - Only canonical types exist in the registry
   * - No duplicate nodes can be created
   * - Aliases are resolved at runtime, not stored as separate types
   */
  private registerVirtualNodeTypes(): void {
    console.log('[NodeLibrary] 🔗 Virtual node types: NONE (aliases handled by node-type-resolver.ts)');
    console.log('[NodeLibrary] ✅ Aliases resolve to canonical types: gmail→google_gmail, mail→email, ai→ai_service');
    // ✅ PERMANENT: No virtual nodes registered - aliases are resolved by node-type-resolver.ts only
  }
}

// Export singleton instance
export const nodeLibrary = new NodeLibrary();

/**
 * ✅ PRODUCTION-GRADE: Canonical Node Types Authority
 * 
 * This is the SINGLE SOURCE OF TRUTH for all valid node types.
 * 
 * Rules:
 * - Only canonical types are exported (no aliases)
 * - LLM must select from this enum
 * - Any node type not in this list is INVALID
 * - Registry must only accept types from this list
 */
export const CANONICAL_NODE_TYPES = nodeLibrary.getAllCanonicalTypes() as readonly string[];

/**
 * Type guard for canonical node types
 */
export function isValidCanonicalNodeType(nodeType: string): nodeType is typeof CANONICAL_NODE_TYPES[number] {
  return CANONICAL_NODE_TYPES.includes(nodeType);
}
