/**
 * Node Resolver - Production-Grade Capability-Based Node Resolution
 * 
 * Converts semantic intents into concrete node IDs deterministically.
 * Replaces heuristic LLM guessing with registry-driven planning.
 * 
 * Architecture:
 * - parse_prompt → extract_capabilities → resolve_connectors → resolve_nodes → build_graph
 * - Uses Connector Registry for strict connector isolation
 * - Never allows LLM to invent node IDs
 * - Force-inserts required nodes if intent detected
 * - Fails with structured error if no node supports intent
 */

import { NodeLibrary } from '../nodes/node-library';
import { NodeSchema } from '../nodes/node-library';
import { connectorResolver } from '../connectors/connector-resolver';
import { connectorRegistry } from '../connectors/connector-registry';

export interface NodeCapability {
  capabilities: string[]; // e.g., ["email.send", "gmail.send", "google.mail"]
  providers: string[]; // e.g., ["google"]
  keywords: string[]; // e.g., ["gmail", "google mail", "google email"]
}

export interface SemanticIntent {
  action: string; // e.g., "send", "read", "create"
  resource: string; // e.g., "email", "message", "document"
  provider?: string; // e.g., "google", "slack", "microsoft"
  keywords: string[]; // All keywords from prompt related to this intent
}

export interface NodeResolutionResult {
  nodeId: string; // Concrete node type ID (e.g., "google_gmail")
  confidence: number; // 0-1 match confidence
  reason: string; // Why this node was selected
  required: boolean; // Whether this node is required (cannot be skipped)
}

export interface NodeResolutionError {
  intent: SemanticIntent;
  message: string;
  suggestions: string[]; // Suggested node types that might work
}

/**
 * Node Resolver
 * 
 * Deterministic node resolution based on capabilities, providers, and keywords.
 */
export class NodeResolver {
  private nodeLibrary: NodeLibrary;
  private capabilityIndex: Map<string, Set<string>> = new Map(); // capability -> node types
  private providerIndex: Map<string, Set<string>> = new Map(); // provider -> node types
  private keywordIndex: Map<string, Set<string>> = new Map(); // keyword -> node types

  constructor(nodeLibrary: NodeLibrary) {
    this.nodeLibrary = nodeLibrary;
    this.buildIndices();
  }

  /**
   * Build capability, provider, and keyword indices for fast lookup
   */
  private buildIndices(): void {
    const schemas = this.nodeLibrary.getAllSchemas();

    for (const schema of schemas) {
      const nodeType = schema.type;
      
      // Get capabilities from schema (extended NodeSchema)
      const capabilities = (schema as any).capabilities || [];
      const providers = (schema as any).providers || [];
      const keywords = [
        ...(schema.aiSelectionCriteria?.keywords || []),
        ...((schema as any).keywords || []),
        schema.label.toLowerCase(),
        schema.type.toLowerCase(),
      ];

      // Index by capability
      for (const capability of capabilities) {
        if (!this.capabilityIndex.has(capability)) {
          this.capabilityIndex.set(capability, new Set());
        }
        this.capabilityIndex.get(capability)!.add(nodeType);
      }

      // Index by provider
      for (const provider of providers) {
        if (!this.providerIndex.has(provider)) {
          this.providerIndex.set(provider, new Set());
        }
        this.providerIndex.get(provider)!.add(nodeType);
      }

      // Index by keyword
      for (const keyword of keywords) {
        const normalized = keyword.toLowerCase();
        if (!this.keywordIndex.has(normalized)) {
          this.keywordIndex.set(normalized, new Set());
        }
        this.keywordIndex.get(normalized)!.add(nodeType);
      }
    }
  }

  /**
   * ✅ UNIVERSAL ROOT FIX: Extract semantic intents from prompt using universal keyword index
   * 
   * Replaces hardcoded patterns (Gmail, Slack, Email, Google Sheets) with universal
   * keyword-based detection that works for ALL nodes in the registry.
   * 
   * @param prompt - The prompt to extract intents from
   * @param contextPrompt - Optional context prompt (e.g., original prompt) for disambiguation
   */
  extractIntents(prompt: string, contextPrompt?: string): SemanticIntent[] {
    const intents: SemanticIntent[] = [];
    const promptLower = prompt.toLowerCase();
    const contextLower = (contextPrompt || '').toLowerCase();
    
    console.log(`[NodeResolver] 🔍 UNIVERSAL: Extracting intents from prompt using keyword index (${this.keywordIndex.size} keywords)`);
    
    // ✅ UNIVERSAL: Use keyword index to detect ALL node types mentioned in prompt
    const detectedNodes = new Map<string, {
      nodeType: string;
      keyword: string;
      position: number;
    }>();
    
    // Scan prompt for all keywords in the index
    for (const [keyword, nodeTypes] of this.keywordIndex) {
      // Use word boundary matching for better accuracy
      const keywordPattern = new RegExp(`\\b${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
      const match = keywordPattern.exec(promptLower);
      
      if (match) {
        const position = match.index;
        for (const nodeType of nodeTypes) {
          // Only add if node type is registered
          if (this.nodeLibrary.isNodeTypeRegistered(nodeType)) {
            const existing = detectedNodes.get(nodeType);
            // Keep the earliest match (most likely the primary mention)
            if (!existing || position < existing.position) {
              detectedNodes.set(nodeType, {
                nodeType,
                keyword,
                position,
              });
            }
          }
        }
      }
    }
    
    console.log(`[NodeResolver] ✅ UNIVERSAL: Detected ${detectedNodes.size} node type(s) from prompt: ${Array.from(detectedNodes.keys()).join(', ')}`);
    
    // ✅ UNIVERSAL: For each detected node, create intent with operation, resource, and provider
    for (const [nodeType, detection] of detectedNodes) {
      const schema = this.nodeLibrary.getSchema(nodeType);
      if (!schema) continue;
      
      // ✅ UNIVERSAL: Detect operation from verbs in prompt context around the keyword
      const operation = this.detectOperationFromPrompt(prompt, detection.keyword, detection.position, schema);
      
      // ✅ UNIVERSAL: Infer resource from node type and schema
      const resource = this.inferResourceFromNodeType(nodeType, schema);
      
      // ✅ UNIVERSAL: Infer provider from node type and schema
      const provider = this.inferProviderFromNodeType(nodeType, schema, promptLower, contextLower);
      
      // Extract keywords related to this node
      const keywords = this.extractKeywordsForNode(promptLower, detection.keyword, nodeType, schema);
      
      // ✅ CONTEXT-AWARE: Special handling for generic "email" → "google_gmail" mapping
      // If keyword is "email" but context mentions Gmail or Google services, prefer google_gmail
      if (detection.keyword === 'email' && nodeType !== 'google_gmail') {
        const contextMentionsGmail = contextLower.includes('gmail') || 
                                     contextLower.includes('google mail') || 
                                     contextLower.includes('google email');
        const contextMentionsGoogleServices = contextLower.includes('google sheet') || 
                                             contextLower.includes('google spreadsheet') ||
                                             contextLower.includes('google');
        const contextMentionsSmtp = contextLower.includes('smtp') || 
                                   contextLower.includes('mail server') || 
                                   contextLower.includes('smtp host');
        
        // If context suggests Gmail, check if google_gmail is also detected
        if ((contextMentionsGmail || (contextMentionsGoogleServices && !contextMentionsSmtp)) && 
            this.nodeLibrary.isNodeTypeRegistered('google_gmail')) {
          // Prefer google_gmail over generic email
          const gmailDetected = Array.from(detectedNodes.keys()).includes('google_gmail');
          if (!gmailDetected) {
            // Add google_gmail intent instead
            intents.push({
              action: operation || 'send',
              resource: 'email',
              provider: 'google',
              keywords: [...keywords, 'gmail', 'google mail'],
            });
            console.log(`[NodeResolver] ✅ Context-aware mapping: Generic "email" → google_gmail (context suggests Gmail)`);
            continue; // Skip generic email intent
          }
        }
      }
      
      intents.push({
        action: operation,
        resource,
        provider,
        keywords,
      });
      
      console.log(`[NodeResolver] ✅ Created intent: { action: '${operation}', resource: '${resource}', provider: '${provider || 'none'}', nodeType: '${nodeType}' }`);
    }
    
    console.log(`[NodeResolver] ✅ UNIVERSAL: Extracted ${intents.length} intent(s) from prompt`);
    return intents;
  }
  
  /**
   * ✅ UNIVERSAL: Detect operation from verbs in prompt context
   * 
   * Analyzes the sentence containing the keyword to detect operation verbs.
   * Works for ALL nodes, not just hardcoded ones.
   */
  private detectOperationFromPrompt(
    prompt: string,
    keyword: string,
    keywordPosition: number,
    schema: NodeSchema
  ): string {
    const promptLower = prompt.toLowerCase();
    
    // Extract sentence containing the keyword
    const sentences = prompt.split(/[.!?]\s+/);
    let relevantSentence = '';
    let sentenceStart = 0;
    
    for (const sentence of sentences) {
      const sentenceEnd = sentenceStart + sentence.length;
      if (keywordPosition >= sentenceStart && keywordPosition <= sentenceEnd) {
        relevantSentence = sentence.toLowerCase();
        break;
      }
      sentenceStart = sentenceEnd + 2; // +2 for ". " or "? " or "! "
    }
    
    // If no sentence found, use full prompt
    if (!relevantSentence) {
      relevantSentence = promptLower;
    }
    
    // ✅ UNIVERSAL: Operation verb patterns (works for all nodes)
    const operationPatterns: Array<{ pattern: RegExp; operation: string }> = [
      // Read operations
      { pattern: /\b(read|fetch|get|retrieve|pull|load|collect|query|extract|obtain|grab|pick)\b/i, operation: 'read' },
      // Create operations
      { pattern: /\b(create|add|insert|make|generate|build|establish|set up|initialize)\b/i, operation: 'create' },
      // Update operations
      { pattern: /\b(update|modify|edit|change|alter|adjust|revise|amend)\b/i, operation: 'update' },
      // Delete operations
      { pattern: /\b(delete|remove|erase|clear|drop|destroy|eliminate)\b/i, operation: 'delete' },
      // Send/Write operations
      { pattern: /\b(send|deliver|output|write|save|post|notify|publish|share|upload|submit|export|push|append|store)\b/i, operation: 'send' },
      // Process/Transform operations
      { pattern: /\b(process|transform|summarize|summarise|analyze|analyse|classify|generate|translate|format|parse|filter|map|reduce|aggregate|merge|split|convert|compute|calculate|refine|enhance)\b/i, operation: 'process' },
    ];
    
    // Check for operation verbs in the sentence
    for (const { pattern, operation } of operationPatterns) {
      if (pattern.test(relevantSentence)) {
        // Verify operation exists in schema (if schema has operations)
        const schemaOperations = this.getOperationsFromSchema(schema);
        if (schemaOperations.length === 0 || schemaOperations.includes(operation)) {
          console.log(`[NodeResolver] ✅ Detected operation '${operation}' from verb in sentence: "${relevantSentence.substring(0, 100)}"`);
          return operation;
        }
      }
    }
    
    // ✅ FALLBACK: Infer operation from node category if no verb detected
    const category = (schema.category || '').toLowerCase();
    if (category === 'data' || category === 'database') {
      return 'read'; // Data sources typically read
    } else if (category === 'communication' || category === 'output') {
      return 'send'; // Output nodes typically send
    } else if (category === 'transformation' || category === 'ai') {
      return 'process'; // Transformations typically process
    }
    
    // Default: no specific operation
    return 'execute';
  }
  
  /**
   * ✅ UNIVERSAL: Get operations from schema (if available)
   */
  private getOperationsFromSchema(schema: NodeSchema): string[] {
    try {
      const configSchema = (schema as any).configSchema;
      if (configSchema?.optional?.operation) {
        const operationField = configSchema.optional.operation;
        if (operationField.type === 'string' && operationField.enum) {
          return operationField.enum;
        }
      }
    } catch {
      // Schema doesn't have operations
    }
    return [];
  }
  
  /**
   * ✅ UNIVERSAL: Infer resource from node type and schema
   */
  private inferResourceFromNodeType(nodeType: string, schema: NodeSchema): string {
    const nodeTypeLower = nodeType.toLowerCase();
    const label = (schema.label || '').toLowerCase();
    const category = (schema.category || '').toLowerCase();
    
    // Common resource mappings (universal patterns)
    if (nodeTypeLower.includes('email') || nodeTypeLower.includes('gmail') || label.includes('email')) {
      return 'email';
    }
    if (nodeTypeLower.includes('message') || nodeTypeLower.includes('slack') || label.includes('message')) {
      return 'message';
    }
    if (nodeTypeLower.includes('sheet') || nodeTypeLower.includes('spreadsheet') || label.includes('sheet')) {
      return 'spreadsheet';
    }
    if (nodeTypeLower.includes('crm') || nodeTypeLower.includes('contact') || nodeTypeLower.includes('lead')) {
      return 'record';
    }
    if (nodeTypeLower.includes('database') || nodeTypeLower.includes('db') || category === 'database') {
      return 'data';
    }
    if (category === 'data') {
      return 'data';
    }
    if (category === 'communication' || category === 'output') {
      return 'output';
    }
    
    // Default: use node type as resource
    return nodeTypeLower.replace(/[_\s]+/g, '_');
  }
  
  /**
   * ✅ UNIVERSAL: Infer provider from node type, schema, and context
   */
  private inferProviderFromNodeType(
    nodeType: string,
    schema: NodeSchema,
    promptLower: string,
    contextLower: string
  ): string | undefined {
    const nodeTypeLower = nodeType.toLowerCase();
    const label = (schema.label || '').toLowerCase();
    
    // Extract provider from node type (e.g., "google_gmail" → "google")
    if (nodeTypeLower.includes('google')) return 'google';
    if (nodeTypeLower.includes('microsoft') || nodeTypeLower.includes('ms_')) return 'microsoft';
    if (nodeTypeLower.includes('salesforce') || nodeTypeLower.includes('sf_')) return 'salesforce';
    if (nodeTypeLower.includes('slack')) return 'slack';
    if (nodeTypeLower.includes('hubspot')) return 'hubspot';
    if (nodeTypeLower.includes('zoho')) return 'zoho';
    if (nodeTypeLower.includes('airtable')) return 'airtable';
    
    // Extract provider from label (e.g., "Google Sheets" → "google")
    if (label.includes('google')) return 'google';
    if (label.includes('microsoft')) return 'microsoft';
    if (label.includes('salesforce')) return 'salesforce';
    if (label.includes('slack')) return 'slack';
    if (label.includes('hubspot')) return 'hubspot';
    if (label.includes('zoho')) return 'zoho';
    if (label.includes('airtable')) return 'airtable';
    
    // Check schema providers if available
    const providers = (schema as any).providers || [];
    if (providers.length > 0) {
      return providers[0];
    }
    
    // No provider detected
    return undefined;
  }
  
  /**
   * ✅ UNIVERSAL: Extract keywords related to a node from prompt
   */
  private extractKeywordsForNode(
    promptLower: string,
    matchedKeyword: string,
    nodeType: string,
    schema: NodeSchema
  ): string[] {
    const keywords: string[] = [matchedKeyword];
    
    // Add node type variations
    const nodeTypeLower = nodeType.toLowerCase();
    if (promptLower.includes(nodeTypeLower)) {
      keywords.push(nodeTypeLower);
    }
    
    // Add label if mentioned
    const label = (schema.label || '').toLowerCase();
    if (label && promptLower.includes(label)) {
      keywords.push(label);
    }
    
    // Add schema keywords if mentioned
    const schemaKeywords = schema.keywords || [];
    for (const keyword of schemaKeywords) {
      const keywordLower = keyword.toLowerCase();
      if (promptLower.includes(keywordLower)) {
        keywords.push(keywordLower);
      }
    }
    
    return [...new Set(keywords)]; // Remove duplicates
  }

  /**
   * Resolve semantic intent to concrete node ID
   * Enhanced with pattern matching from modern workflow examples
   */
  resolveIntent(intent: SemanticIntent): {
    success: boolean;
    result?: NodeResolutionResult;
    error?: NodeResolutionError;
  } {
    // Step 1: Try pattern matching from modern examples (highest priority for real-world scenarios)
    try {
      const { workflowTrainingService } = require('./workflow-training-service');
      const modernExamples = workflowTrainingService.getModernExamples(5, `${intent.action} ${intent.resource}`);
      
      for (const example of modernExamples) {
        const selectedNodes = example.phase1.step5?.selectedNodes || [];
        
        // Check if any selected node matches the intent
        for (const nodeType of selectedNodes) {
          const schema = this.nodeLibrary.getSchema(nodeType);
          if (schema && this.nodeMatchesIntent(nodeType, intent, schema)) {
            console.log(`[NodeResolver] ✅ Pattern match from modern example: "${example.goal}" → ${nodeType}`);
            return {
              success: true,
              result: {
                nodeId: nodeType,
                confidence: 0.95, // High confidence from real-world example
                reason: `Matched pattern from modern example: "${example.goal}"`,
                required: true,
              },
            };
          }
        }
      }
    } catch (error) {
      // Modern examples not available, continue with standard matching
      console.log('[NodeResolver] Modern examples not available, using standard matching');
    }
    
    // Step 2: Try capability-based matching
    const capabilityMatch = this.matchByCapability(intent);
    if (capabilityMatch) {
      return { success: true, result: capabilityMatch };
    }

    // Step 3: Try provider + resource matching
    const providerMatch = this.matchByProvider(intent);
    if (providerMatch) {
      return { success: true, result: providerMatch };
    }

    // Step 4: Try keyword matching
    const keywordMatch = this.matchByKeywords(intent);
    if (keywordMatch) {
      return { success: true, result: keywordMatch };
    }

    // No match found
    return {
      success: false,
      error: {
        intent,
        message: `No node found for intent: ${intent.action} ${intent.resource}${intent.provider ? ` via ${intent.provider}` : ''}`,
        suggestions: this.getSuggestions(intent),
      },
    };
  }
  
  /**
   * Check if a node matches the intent based on schema capabilities
   */
  private nodeMatchesIntent(nodeType: string, intent: SemanticIntent, schema: NodeSchema): boolean {
    const nodeLabel = (schema.label || nodeType).toLowerCase();
    const nodeCategory = (schema.category || '').toLowerCase();
    const intentAction = intent.action.toLowerCase();
    const intentResource = intent.resource.toLowerCase();
    
    // Check if node label/category contains intent keywords
    if (nodeLabel.includes(intentAction) || nodeLabel.includes(intentResource)) {
      return true;
    }
    
    // Check if node category matches intent resource
    if (intentResource && nodeCategory.includes(intentResource)) {
      return true;
    }
    
    // Check capability keywords
    const capabilityKeywords = schema.keywords || [];
    const intentKeywords = [...intent.keywords, intentAction, intentResource];
    
    return intentKeywords.some(keyword => 
      capabilityKeywords.some((capKeyword: string) => 
        capKeyword.toLowerCase().includes(keyword.toLowerCase())
      )
    );
  }

  /**
   * Match intent by capability
   */
  private matchByCapability(intent: SemanticIntent): NodeResolutionResult | null {
    const capability = `${intent.resource}.${intent.action}`;
    const providerCapability = intent.provider ? `${intent.provider}.${intent.resource}.${intent.action}` : null;

    // Try provider-specific capability first
    if (providerCapability) {
      const nodes = this.capabilityIndex.get(providerCapability);
      if (nodes && nodes.size > 0) {
        const nodeType = Array.from(nodes)[0]; // Take first match
        return {
          nodeId: nodeType,
          confidence: 0.95,
          reason: `Matched capability: ${providerCapability}`,
          required: true,
        };
      }
    }

    // Try generic capability
    const nodes = this.capabilityIndex.get(capability);
    if (nodes && nodes.size > 0) {
      // If provider specified, prefer nodes with that provider
      if (intent.provider) {
        const providerNodes = Array.from(nodes).filter(nodeType => {
          const schema = this.nodeLibrary.getSchema(nodeType);
          const providers = (schema as any).providers || [];
          return providers.includes(intent.provider);
        });

        if (providerNodes.length > 0) {
          return {
            nodeId: providerNodes[0],
            confidence: 0.85,
            reason: `Matched capability: ${capability} with provider: ${intent.provider}`,
            required: true,
          };
        }
      }

      // Fallback to first match
      return {
        nodeId: Array.from(nodes)[0],
        confidence: 0.75,
        reason: `Matched capability: ${capability}`,
        required: false,
      };
    }

    return null;
  }

  /**
   * Match intent by provider
   */
  private matchByProvider(intent: SemanticIntent): NodeResolutionResult | null {
    if (!intent.provider) {
      return null;
    }

    const nodes = this.providerIndex.get(intent.provider.toLowerCase());
    if (!nodes || nodes.size === 0) {
      return null;
    }

    // Filter by resource type if possible
    const matchingNodes = Array.from(nodes).filter(nodeType => {
      const schema = this.nodeLibrary.getSchema(nodeType);
      if (!schema) return false;

      // Check if node handles this resource type
      const capabilities = (schema as any).capabilities || [];
      const resourceMatch = capabilities.some((cap: string) => 
        cap.includes(intent.resource) || cap.includes(intent.action)
      );

      return resourceMatch || schema.category === intent.resource;
    });

    if (matchingNodes.length > 0) {
      return {
        nodeId: matchingNodes[0],
        confidence: 0.80,
        reason: `Matched provider: ${intent.provider} for ${intent.resource}`,
        required: true,
      };
    }

    return null;
  }

  /**
   * Match intent by keywords
   */
  private matchByKeywords(intent: SemanticIntent): NodeResolutionResult | null {
    let bestMatch: { nodeType: string; score: number } | null = null;

    for (const keyword of intent.keywords) {
      const normalized = keyword.toLowerCase();
      const nodes = this.keywordIndex.get(normalized);

      if (nodes && nodes.size > 0) {
        for (const nodeType of nodes) {
          const schema = this.nodeLibrary.getSchema(nodeType);
          if (!schema) continue;

          // Calculate match score
          let score = 0.5; // Base score for keyword match

          // Boost if provider matches
          if (intent.provider) {
            const providers = (schema as any).providers || [];
            if (providers.includes(intent.provider)) {
              score += 0.3;
            }
          }

          // Boost if capability matches
          const capabilities = (schema as any).capabilities || [];
          if (capabilities.some((cap: string) => cap.includes(intent.resource) || cap.includes(intent.action))) {
            score += 0.2;
          }

          if (!bestMatch || score > bestMatch.score) {
            bestMatch = { nodeType, score };
          }
        }
      }
    }

    if (bestMatch) {
      return {
        nodeId: bestMatch.nodeType,
        confidence: Math.min(bestMatch.score, 1.0),
        reason: `Matched keywords: ${intent.keywords.join(', ')}`,
        required: bestMatch.score > 0.7, // High confidence = required
      };
    }

    return null;
  }

  /**
   * Get suggestions for failed resolution
   */
  private getSuggestions(intent: SemanticIntent): string[] {
    const suggestions: string[] = [];

    // Suggest nodes by resource type
    const schemas = this.nodeLibrary.getAllSchemas();
    for (const schema of schemas) {
      const capabilities = (schema as any).capabilities || [];
      if (capabilities.some((cap: string) => cap.includes(intent.resource))) {
        suggestions.push(schema.type);
      }
    }

    return suggestions.slice(0, 5); // Limit to 5 suggestions
  }

  /**
   * Assert Gmail integrity - moved from CredentialResolver
   * 
   * This is now part of node resolution, not credential resolution.
   */
  assertGmailIntegrity(prompt: string, resolvedNodes: string[]): void {
    const promptLower = prompt.toLowerCase();
    const mentionsGmail = this.mentionsGmail(promptLower);

    if (!mentionsGmail) {
      return; // No Gmail mentioned, skip check
    }

    // Check if google_gmail node was resolved
    const hasGmailNode = resolvedNodes.includes('google_gmail');

    if (!hasGmailNode) {
      // Check if generic email node exists (this is a downgrade!)
      const hasEmailNode = resolvedNodes.includes('email');

      if (hasEmailNode) {
        throw new Error(
          `🚨 CRITICAL: Prompt mentions Gmail but node resolver selected generic email node (SMTP). ` +
          `Gmail must use google_gmail node with OAuth, not SMTP. ` +
          `This indicates a node resolution failure.`
        );
      } else {
        throw new Error(
          `🚨 CRITICAL: Prompt mentions Gmail but node resolver did not select google_gmail node. ` +
          `Node resolution must select google_gmail when Gmail is mentioned.`
        );
      }
    }

    console.log('[NodeResolver] ✅ Gmail integrity check passed');
  }

  /**
   * Resolve all intents from prompt to node IDs
   *
   * NOTE: This method now includes basic intent-level reasoning to avoid
   * over-creating Gmail nodes when Gmail is only the origin of data that
   * already lives in Google Sheets (e.g. "Gmail in sheet"). In those cases,
   * Gmail is treated as "mentioned only" and no google_gmail node is required.
   * 
   * @param prompt - The prompt to resolve
   * @param contextPrompt - Optional context prompt (e.g., original prompt) for disambiguation
   */
  resolvePrompt(prompt: string, contextPrompt?: string): {
    success: boolean;
    nodeIds: string[];
    errors: NodeResolutionError[];
    warnings: string[];
  } {
    const promptLower = prompt.toLowerCase();
    const gmailMentionedOnly = this.isGmailMentionedOnly(promptLower);

    // ✅ CRITICAL FIX: Pass contextPrompt to extractIntents for context-aware mapping
    console.log(`[NodeResolver] 🔍 Resolving prompt: "${prompt.substring(0, 100)}..."`);
    if (contextPrompt) {
      console.log(`[NodeResolver] 🔍 With context: "${contextPrompt.substring(0, 100)}..."`);
    }
    
    const intents = this.extractIntents(prompt, contextPrompt);
    console.log(`[NodeResolver] ✅ Extracted ${intents.length} intent(s) from prompt`);
    
    const nodeIds: string[] = [];
    const errors: NodeResolutionError[] = [];
    const warnings: string[] = [];

    for (const intent of intents) {
      console.log(`[NodeResolver] 🔍 Resolving intent: { action: '${intent.action}', resource: '${intent.resource}', provider: '${intent.provider || 'none'}' }`);
      const resolution = this.resolveIntent(intent);

      if (resolution.success && resolution.result) {
        const resolvedNodeId = resolution.result.nodeId;
        console.log(`[NodeResolver] ✅ Resolved intent → ${resolvedNodeId} (confidence: ${resolution.result.confidence})`);
        
        if (!nodeIds.includes(resolvedNodeId)) {
          nodeIds.push(resolvedNodeId);
          console.log(`[NodeResolver] ✅ Added node to result: ${resolvedNodeId}`);
        } else {
          console.log(`[NodeResolver] ⚠️  Node already in result: ${resolvedNodeId} (skipping duplicate)`);
        }

        if (resolution.result.confidence < 0.7) {
          warnings.push(`Low confidence match for ${intent.action} ${intent.resource}: ${resolvedNodeId} (${resolution.result.confidence})`);
        }
      } else if (resolution.error) {
        console.log(`[NodeResolver] ❌ Failed to resolve intent: ${resolution.error.message}`);
        errors.push(resolution.error);
      }
    }
    
    console.log(`[NodeResolver] ✅ Final resolved nodes (${nodeIds.length}): ${nodeIds.join(', ')}`);

    // Assert Gmail integrity
    // If Gmail is only mentioned as an origin of data that already lives in
    // Google Sheets (e.g. "Gmail in sheet"), skip integrity enforcement.
    try {
      if (!gmailMentionedOnly) {
        this.assertGmailIntegrity(prompt, nodeIds);
      } else {
        console.log('[NodeResolver] Skipping Gmail integrity check (Gmail mentioned only as origin in Sheets).');
      }
    } catch (error: any) {
      errors.push({
        intent: { action: 'send', resource: 'email', provider: 'google', keywords: [] },
        message: error.message,
        suggestions: ['google_gmail'],
      });
    }

    return {
      success: errors.length === 0,
      nodeIds,
      errors,
      warnings,
    };
  }

  // Intent detection helpers
  private mentionsGmail(prompt: string): boolean {
    return prompt.includes('gmail') || 
           prompt.includes('google mail') || 
           prompt.includes('google email');
  }

  /**
   * Detect when Gmail is only mentioned as the historical origin of data that
   * already lives in Google Sheets, e.g. "Gmail in sheet", "Gmail emails in
   * Google Sheets", "Gmail stored in a sheet". In these cases we should NOT
   * require a google_gmail node; Sheets is the true data source.
   */
  private isGmailMentionedOnly(prompt: string): boolean {
    const hasGmail = this.mentionsGmail(prompt);
    const hasSheets = this.mentionsGoogleSheets(prompt);

    if (!hasGmail || !hasSheets) {
      return false;
    }

    // Look for Gmail and Sheets appearing close together with contextual
    // words that imply "already in sheet" rather than "connect to Gmail".
    const gmailSheetsPattern1 = /gmail[^.]{0,60}(sheet|sheets|spreadsheet)/i;
    const gmailSheetsPattern2 = /(sheet|sheets|spreadsheet)[^.]{0,60}gmail/i;

    const contextualWords = /(in|inside|already in|stored in|saved in|listed in)/i;

    const windowMatch =
      gmailSheetsPattern1.exec(prompt) || gmailSheetsPattern2.exec(prompt);

    if (!windowMatch) {
      return false;
    }

    // If within the matched window we see contextual words like "in"/"stored in",
    // treat Gmail as mentioned_only.
    const windowText = windowMatch[0];
    return contextualWords.test(windowText);
  }

  private mentionsSlack(prompt: string): boolean {
    return prompt.includes('slack');
  }

  private mentionsEmail(prompt: string): boolean {
    return prompt.includes('email') || prompt.includes('mail');
  }

  private mentionsGoogleSheets(prompt: string): boolean {
    return prompt.includes('google sheet') || 
           prompt.includes('google spreadsheet') ||
           prompt.includes('sheets');
  }

  private mentionsSmtp(prompt: string): boolean {
    return prompt.includes('smtp') || 
           prompt.includes('mail server') || 
           prompt.includes('smtp host');
  }

  private extractGmailKeywords(prompt: string): string[] {
    const keywords: string[] = [];
    if (prompt.includes('gmail')) keywords.push('gmail');
    if (prompt.includes('google mail')) keywords.push('google mail');
    if (prompt.includes('google email')) keywords.push('google email');
    return keywords;
  }

  private extractSlackKeywords(prompt: string): string[] {
    const keywords: string[] = [];
    if (prompt.includes('slack')) keywords.push('slack');
    return keywords;
  }

  private extractEmailKeywords(prompt: string): string[] {
    const keywords: string[] = [];
    if (prompt.includes('email')) keywords.push('email');
    if (prompt.includes('mail')) keywords.push('mail');
    return keywords;
  }

  private extractGoogleSheetsKeywords(prompt: string): string[] {
    const keywords: string[] = [];
    if (prompt.includes('google sheet')) keywords.push('google sheet');
    if (prompt.includes('google spreadsheet')) keywords.push('google spreadsheet');
    if (prompt.includes('sheets')) keywords.push('sheets');
    return keywords;
  }
}
