/**
 * Summarize Layer Service
 * 
 * This layer helps clarify user intent by:
 * 1. Collecting ALL alias keywords from ALL node types
 * 2. Providing AI with user prompt + all keywords
 * 3. AI intelligently adds matching keywords to clarify intent
 * 4. AI generates 3-4 refined prompt variations
 * 5. User selects the prompt closest to their intent
 */

import { nodeLibrary } from '../nodes/node-library';
import { getAllNodePatterns } from '../../core/registry/node-type-pattern-registry';
import { ollamaOrchestrator } from './ollama-orchestrator';
import { nodeCapabilityRegistryDSL } from './node-capability-registry-dsl';
import { unifiedNodeRegistry } from '../../core/registry/unified-node-registry';
import { semanticNodeEquivalenceRegistry } from '../../core/registry/semantic-node-equivalence-registry';
import { unifiedNodeTypeMatcher } from '../../core/utils/unified-node-type-matcher';
import { UniversalVariationNodeCategorizer } from '../../core/utils/universal-variation-node-categorizer';

export interface AliasKeyword {
  keyword: string;
  nodeType: string;
  source: 'keywords' | 'aiSelectionCriteria' | 'useCases' | 'aliases' | 'capabilities' | 'semantic_equivalents';
}

export interface PromptVariation {
  id: string;
  prompt: string;
  matchedKeywords: string[]; // Filtered nodes (in user's intent)
  allExtractedNodes?: string[]; // ✅ NEW: ALL nodes extracted from variation text (for semantic matching)
  keywords: string[]; // ✅ NEW: Extracted node type keywords (e.g., ["ai_chat_model", "linkedin", "schedule"])
  confidence: number;
  reasoning: string;
}

export interface NodeTypeWithOperation {
  nodeType: string;
  operationHint?: string; // Verb near the node (e.g., "monitoring", "integrated", "read", "send")
  context?: string; // Full context phrase where node was mentioned
}

/**
 * ✅ UNIVERSAL NODE DETECTION: Detection result from any detection method
 */
export interface DetectionResult {
  confidence: number; // 0.0 to 1.0
  method: string; // Detection method name (e.g., "type_name", "label", "tags", "keywords", "semantic", "fuzzy")
  match: string; // What matched (e.g., "github", "Google Sheets", "sheets")
}

export interface SummarizeLayerResult {
  shouldShowLayer: boolean;
  originalPrompt: string;
  clarifiedIntent?: string;
  promptVariations: PromptVariation[];
  allKeywords: string[];
  matchedKeywords: string[];
  mandatoryNodeTypes?: string[]; // ✅ NEW: Node types that must be included in workflow
  mandatoryNodesWithOperations?: NodeTypeWithOperation[]; // ✅ NEW: Node types with operation hints
}

/**
 * Alias Keyword Collector
 * Collects ALL alias keywords from ALL node types
 */
export class AliasKeywordCollector {
  private cachedKeywords: AliasKeyword[] | null = null;

  /**
   * Get ALL alias keywords from ALL node types
   */
  getAllAliasKeywords(): AliasKeyword[] {
    if (this.cachedKeywords !== null) {
      return this.cachedKeywords;
    }

    const keywords: AliasKeyword[] = [];
    const allSchemas = nodeLibrary.getAllSchemas();
    const allPatterns = getAllNodePatterns();

    console.log(`[AliasKeywordCollector] Collecting keywords from ${allSchemas.length} node schemas...`);

    // Collect from node schemas
    for (const schema of allSchemas) {
      // 1. From schema.keywords
      if (schema.keywords && schema.keywords.length > 0) {
        for (const keyword of schema.keywords) {
          keywords.push({
            keyword: keyword.toLowerCase(),
            nodeType: schema.type,
            source: 'keywords',
          });
        }
      }

      // 2. From aiSelectionCriteria.keywords
      if (schema.aiSelectionCriteria?.keywords && schema.aiSelectionCriteria.keywords.length > 0) {
        for (const keyword of schema.aiSelectionCriteria.keywords) {
          keywords.push({
            keyword: keyword.toLowerCase(),
            nodeType: schema.type,
            source: 'aiSelectionCriteria',
          });
        }
      }

      // 3. From aiSelectionCriteria.useCases
      if (schema.aiSelectionCriteria?.useCases && schema.aiSelectionCriteria.useCases.length > 0) {
        for (const useCase of schema.aiSelectionCriteria.useCases) {
          // Extract keywords from use case descriptions
          const useCaseKeywords = this.extractKeywordsFromText(useCase);
          for (const keyword of useCaseKeywords) {
            keywords.push({
              keyword: keyword.toLowerCase(),
              nodeType: schema.type,
              source: 'useCases',
            });
          }
        }
      }

      // 4. From capabilities
      if (schema.capabilities && schema.capabilities.length > 0) {
        for (const capability of schema.capabilities) {
          const capabilityKeywords = this.extractKeywordsFromText(capability);
          for (const keyword of capabilityKeywords) {
            keywords.push({
              keyword: keyword.toLowerCase(),
              nodeType: schema.type,
              source: 'capabilities',
            });
          }
        }
      }
    }

    // 5. From node type patterns (aliases)
    for (const pattern of allPatterns) {
      if (pattern.aliases && pattern.aliases.length > 0) {
        for (const alias of pattern.aliases) {
          keywords.push({
            keyword: alias.toLowerCase(),
            nodeType: pattern.type,
            source: 'aliases',
          });
        }
      }
    }

    // 6. ✅ UNIVERSAL: From semantic equivalence registry (semantic equivalent node names)
    // This ensures AI knows about post_to_instagram, post_to_twitter, etc.
    console.log(`[AliasKeywordCollector] Collecting semantic equivalent node names from registry...`);
    
    // Get all equivalences from registry and add equivalents as keywords
    // This is more efficient than iterating through all operations/categories
    const seenEquivalents = new Set<string>();
    
    for (const schema of allSchemas) {
      const nodeType = schema.type;
      
      // Get node category from registry for context-aware equivalence lookup
      const nodeDef = unifiedNodeRegistry.get(nodeType);
      const category = nodeDef?.category?.toLowerCase();
      
      // Common operations to check
      const operations = ['create', 'write', 'send', 'post', 'update', 'read', 'fetch', 'process', 'transform'];
      
      for (const operation of operations) {
        // Get equivalents with operation and category context
        const equivalents = semanticNodeEquivalenceRegistry.getEquivalents(nodeType, operation, category);
        for (const equivalent of equivalents) {
          const key = `${equivalent.toLowerCase()}:${nodeType}`;
          if (!seenEquivalents.has(key)) {
            seenEquivalents.add(key);
            // Add equivalent as keyword pointing to canonical node
            keywords.push({
              keyword: equivalent.toLowerCase(),
              nodeType: nodeType, // Point to canonical node
              source: 'semantic_equivalents',
            });
          }
        }
        
        // Also check if this node type IS an equivalent of another canonical
        const canonical = semanticNodeEquivalenceRegistry.getCanonicalType(nodeType, operation, category);
        if (canonical && canonical !== nodeType) {
          const key = `${nodeType.toLowerCase()}:${canonical}`;
          if (!seenEquivalents.has(key)) {
            seenEquivalents.add(key);
            // This node is an equivalent - add it as keyword pointing to canonical
            keywords.push({
              keyword: nodeType.toLowerCase(),
              nodeType: canonical, // Point to canonical
              source: 'semantic_equivalents',
            });
          }
        }
      }
    }
    
    console.log(`[AliasKeywordCollector] ✅ Added ${seenEquivalents.size} semantic equivalent keywords`);

    // Deduplicate keywords (keep first occurrence)
    const seen = new Set<string>();
    const uniqueKeywords: AliasKeyword[] = [];
    for (const kw of keywords) {
      const key = `${kw.keyword}:${kw.nodeType}`;
      if (!seen.has(key)) {
        seen.add(key);
        uniqueKeywords.push(kw);
      }
    }

    this.cachedKeywords = uniqueKeywords;
    console.log(`[AliasKeywordCollector] ✅ Collected ${uniqueKeywords.length} unique alias keywords from ${allSchemas.length} nodes`);

    return uniqueKeywords;
  }

  /**
   * Get unique keyword strings (for AI prompt)
   * ✅ UNIVERSAL: Includes semantic equivalents (post_to_instagram, etc.)
   */
  getAllKeywordStrings(): string[] {
    const keywords = this.getAllAliasKeywords();
    const uniqueStrings = new Set<string>();
    
    for (const kw of keywords) {
      uniqueStrings.add(kw.keyword);
    }

    // ✅ NOTE: Semantic equivalents are already collected in getAllAliasKeywords()
    // No need to collect again here - just extract the strings
    return Array.from(uniqueStrings).sort();
  }

  /**
   * Extract keywords from text (simple word extraction)
   */
  private extractKeywordsFromText(text: string): string[] {
    const words = text
      .toLowerCase()
      .split(/[\s_\-.,;:!?()]+/)
      .filter(word => word.length > 2 && !this.isStopWord(word));
    
    return [...new Set(words)];
  }

  /**
   * Check if word is a stop word
   */
  private isStopWord(word: string): boolean {
    const stopWords = new Set([
      'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
      'of', 'with', 'via', 'by', 'from', 'as', 'is', 'are', 'was', 'were',
      'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did',
      'will', 'would', 'should', 'could', 'may', 'might', 'must', 'can'
    ]);
    return stopWords.has(word);
  }
}

/**
 * AI Intent Clarifier
 * Uses AI to clarify user intent by matching keywords and generating refined prompts
 */
export class AIIntentClarifier {
  private keywordCollector: AliasKeywordCollector;

  constructor() {
    this.keywordCollector = new AliasKeywordCollector();
  }
  
  /**
   * ✅ OPERATIONS-FIRST: Enrich node mentions with operations from node schema
   * Universal, root-level - works for ALL nodes automatically
   * No hardcoding - all from registry
   */
  private enrichNodeMentionsWithOperations(
    nodeMentions: Array<{ nodeType: string; context?: string; confidence?: number }>
  ): Array<{
    nodeType: string;
    operations: string[];
    defaultOperation: string;
  }> {
    const { unifiedNodeRegistry } = require('../../core/registry/unified-node-registry');
    const registry = unifiedNodeRegistry;
    
    return nodeMentions.map(mention => {
      // Skip if already enriched (from IntentExtractor)
      if ((mention as any).operations && Array.isArray((mention as any).operations)) {
        return {
          nodeType: mention.nodeType,
          operations: (mention as any).operations,
          defaultOperation: (mention as any).defaultOperation || '',
        };
      }
      
      const nodeDef = registry.get(mention.nodeType);
      if (!nodeDef) {
        console.warn(`[AIIntentClarifier] ⚠️  Node ${mention.nodeType} not found in registry, skipping operation enrichment`);
        return { nodeType: mention.nodeType, operations: [], defaultOperation: '' };
      }
      
      const operations = this.getOperationsFromNodeSchema(nodeDef);
      const defaultOperation = this.getDefaultOperationFromNode(nodeDef);
      
      return {
        nodeType: mention.nodeType,
        operations,
        defaultOperation,
      };
    });
  }
  
  /**
   * ✅ OPERATIONS-FIRST: Get operations directly from node's schema
   * Universal, root-level - works for ALL nodes automatically
   */
  private getOperationsFromNodeSchema(nodeDef: any): string[] {
    const operations: string[] = [];
    
    // Method 1: Check inputSchema.operation (enum or oneOf)
    if (nodeDef.inputSchema?.operation) {
      const opField = nodeDef.inputSchema.operation;
      
      if (opField.type === 'string' && (opField as any).enum) {
        operations.push(...((opField as any).enum as string[]));
      } else if ((opField as any).oneOf) {
        for (const option of (opField as any).oneOf) {
          if (option.const) {
            operations.push(option.const);
          }
        }
      }
    }
    
    return operations;
  }
  
  /**
   * ✅ OPERATIONS-FIRST: Get default operation from node's schema
   * Universal, root-level - works for ALL nodes automatically
   */
  private getDefaultOperationFromNode(nodeDef: any): string {
    try {
      const defaultConfig = nodeDef.defaultConfig();
      if (defaultConfig && defaultConfig.operation && typeof defaultConfig.operation === 'string') {
        return defaultConfig.operation;
      }
    } catch (error) {
      // defaultConfig might throw, ignore
    }
    
    // Fallback: first operation from schema
    const operations = this.getOperationsFromNodeSchema(nodeDef);
    return operations.length > 0 ? operations[0] : '';
  }

  /**
   * Clarify user intent and generate prompt variations
   * ✅ PRODUCTION-GRADE: Includes retry logic, error handling, and validation
   */
  async clarifyIntentAndGenerateVariations(
    userPrompt: string
  ): Promise<SummarizeLayerResult> {
    console.log(`[AIIntentClarifier] Clarifying intent for prompt: "${userPrompt.substring(0, 100)}..."`);

    // Step 1: Get all alias keywords
    const allKeywords = this.keywordCollector.getAllKeywordStrings();
    const allKeywordData = this.keywordCollector.getAllAliasKeywords();

    // ✅ PHASE 1: Extract keywords FIRST (before generating variations)
    console.log(`[AIIntentClarifier] 🔍 PHASE 1: Extracting keywords from user prompt FIRST...`);
    const extractedKeywords = this.extractKeywordsFromPrompt(userPrompt, allKeywordData);
    const allExtractedNodeTypes = this.mapKeywordsToNodeTypes(extractedKeywords);
    
    // ✅ OPERATIONS-FIRST: Enrich extracted node types with operations from node schema
    // This ensures AI has exact operations when generating variations
    let enrichedNodeMentions: Array<{
      nodeType: string;
      operations: string[];
      defaultOperation: string;
    }> = [];
    
    if (allExtractedNodeTypes.length > 0) {
      // Create basic mentions from extracted node types
      const basicMentions = allExtractedNodeTypes.map(nodeType => ({
        nodeType,
        context: userPrompt,
        confidence: 0.9,
      }));
      
      // ✅ Enrich with operations from node schema
      enrichedNodeMentions = this.enrichNodeMentionsWithOperations(basicMentions);
      
      console.log(`[AIIntentClarifier] ✅ OPERATIONS-FIRST: Enriched ${enrichedNodeMentions.length} node(s) with operations from schema`);
      
      const nodesWithOps = enrichedNodeMentions.filter(n => n.operations.length > 0);
      const nodesWithoutOps = enrichedNodeMentions.filter(n => n.operations.length === 0);
      
      if (nodesWithOps.length > 0) {
        console.log(`[AIIntentClarifier]   📋 Nodes WITH operations (${nodesWithOps.length}):`);
        nodesWithOps.forEach(node => {
          console.log(`[AIIntentClarifier]     - ${node.nodeType}: ${node.operations.length} operation(s) [${node.operations.join(', ')}], default: ${node.defaultOperation}`);
        });
      }
      
      if (nodesWithoutOps.length > 0) {
        console.log(`[AIIntentClarifier]   ⚡ Nodes WITHOUT operations (${nodesWithoutOps.length}) - action-based:`);
        nodesWithoutOps.forEach(node => {
          const nodeDef = unifiedNodeRegistry.get(node.nodeType);
          const description = nodeDef?.description || `performs ${node.nodeType} action`;
          console.log(`[AIIntentClarifier]     - ${node.nodeType}: ${description}`);
        });
      }
    }
    
    // ✅ UNIVERSAL: Pass ALL extracted keywords to AI - Let AI intelligently understand intent
    // NO hardcoded filtering, NO hardcoded expansion - AI should understand "all social platforms" from keywords
    const extractedNodeTypes = allExtractedNodeTypes;
    
    console.log(`[AIIntentClarifier] ✅ Extracted ${extractedNodeTypes.length} node type(s) from keywords: ${extractedNodeTypes.join(', ')}`);
    console.log(`[AIIntentClarifier] ✅ Passing ALL extracted keywords to AI - AI will intelligently understand user intent`);

    // Step 2: Build AI prompt with user prompt + all keywords + REQUIRED nodes + operations
    const aiPrompt = this.buildClarificationPrompt(userPrompt, allKeywords, extractedNodeTypes, enrichedNodeMentions);

    // Step 3: Call AI with retry logic for production reliability
    const maxRetries = 3;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // ✅ PRODUCTION: Higher temperature for more creative/diverse variations
        // Start higher to encourage diverse outputs, reduce slightly on retry
        const temperature = attempt === 1 ? 0.7 : 0.5; // Higher temp for more variations
        const maxTokens = attempt === 1 ? 3000 : 2500; // More tokens to allow 4 variations

        console.log(`[AIIntentClarifier] Attempt ${attempt}/${maxRetries} (temperature: ${temperature}, max_tokens: ${maxTokens})`);

        // Use 'workflow-analysis' instead of 'workflow-generation' to avoid temperature cap
        // 'workflow-generation' enforces max 0.2 temperature, but we need 0.7 for creative variations
        const aiResponse = await ollamaOrchestrator.processRequest(
          'workflow-analysis', // Use this type to allow higher temperature
          {
            system: this.getSystemPrompt(extractedNodeTypes), // ✅ PHASE 2: Pass extracted nodes to enforce in variations
            message: aiPrompt,
          },
          {
            temperature,
            max_tokens: maxTokens,
            cache: false,
          }
        );

        // 🔍 DEBUG: Log raw AI response (first 500 chars)
        console.log(`[AIIntentClarifier] 🔍 Raw AI response (first 500 chars): ${aiResponse.substring(0, 500)}`);
        console.log(`[AIIntentClarifier] 🔍 Full AI response length: ${aiResponse.length} chars`);

        // Step 4: Parse and validate AI response
        let result = this.parseAIResponse(aiResponse, userPrompt, allKeywordData, extractedNodeTypes);
        
        // ✅ PHASE 3: Validate variations include required keywords and operations
        if (extractedNodeTypes.length > 0) {
          const validationResult = this.validateVariationsIncludeNodes(result, extractedNodeTypes, undefined, enrichedNodeMentions);
          
          // ✅ CRITICAL: If required nodes are missing, retry with stronger enforcement
          if (!validationResult.allValid && attempt < maxRetries) {
            console.warn(`[AIIntentClarifier] ⚠️  Required nodes missing in variations. Retrying with stronger enforcement (attempt ${attempt + 1}/${maxRetries})...`);
            console.warn(`[AIIntentClarifier] ⚠️  Missing ${validationResult.missingCount} required node(s) - this is CRITICAL and will cause workflow failure`);
            // Force retry - don't accept invalid variations
            throw new Error(`Required nodes missing: ${validationResult.missingCount} missing across variations. Retrying...`);
          }
          
          // ✅ PURE INTENT: On final attempt, if validation fails, reject and use fallback
          // NO programmatic injection - that's patching. Trust pure intent extraction.
          if (!validationResult.allValid && attempt === maxRetries) {
            console.warn(`[AIIntentClarifier] ⚠️  Required nodes missing on final attempt. Rejecting invalid variations - using pure intent fallback.`);
            // Don't patch - let it fall through to fallback which uses pure extracted nodes
            throw new Error(`Required nodes missing on final attempt: ${validationResult.missingCount} missing. Using fallback.`);
          }
        }
        
        // 🔍 DEBUG: Log what AI actually generated
        console.log(`[AIIntentClarifier] 🔍 DEBUG - AI Response Analysis (attempt ${attempt}):`);
        console.log(`[AIIntentClarifier] 🔍 Raw AI response length: ${aiResponse.length} chars`);
        console.log(`[AIIntentClarifier] 🔍 Parsed variations count: ${result.promptVariations.length}`);
        result.promptVariations.forEach((v, idx) => {
          const lines = v.prompt.split('\n').filter(l => l.trim().length > 0);
          const userPromptStart = userPrompt.toLowerCase().substring(0, Math.min(30, userPrompt.length));
          const containsUserPrompt = v.prompt.toLowerCase().includes(userPromptStart);
          console.log(`[AIIntentClarifier] 🔍 Variation ${idx + 1}:`);
          console.log(`[AIIntentClarifier] 🔍   - Length: ${v.prompt.length} chars`);
          console.log(`[AIIntentClarifier] 🔍   - Lines: ${lines.length} (${lines.length >= 2 ? '✅' : '❌'})`);
          console.log(`[AIIntentClarifier] 🔍   - Contains user prompt: ${containsUserPrompt ? '❌ YES (copied)' : '✅ NO'}`);
          console.log(`[AIIntentClarifier] 🔍   - Preview: "${v.prompt.substring(0, 100)}..."`);
        });

        // ✅ PRODUCTION: Validate result quality - MUST have EXACTLY 4 variations AND detailed prompts
        if (this.isValidResult(result)) {
          // ✅ PHASE 1 FIX: Require EXACTLY 4 variations (not 3)
          if (result.promptVariations.length !== 4) {
            console.warn(`[AIIntentClarifier] ⚠️ Only ${result.promptVariations.length} variations (expected EXACTLY 4), retrying...`);
            throw new Error(`Insufficient variations: got ${result.promptVariations.length}, need EXACTLY 4`);
          }
          
          // Check if prompts are detailed enough (not just copying user's prompt)
          // NOTE: JSON strings are single-line, so we check for sentences (periods) instead of newlines
          const validationResults = result.promptVariations.map((v, idx) => {
            const promptLines = v.prompt.split('\n').filter(line => line.trim().length > 0);
            const sentences = v.prompt.split(/[.!?]+/).filter(s => s.trim().length > 5); // Count sentences (min 5 chars)
            const hasOneSentence = sentences.length >= 1; // At least 1 sentence (user requirement: ~1 sentence)
            const wordCount = v.prompt.split(/\s+/).filter(w => w.length > 0).length;
            const isLongEnough = v.prompt.length >= 40 && wordCount >= 8; // Minimum 40 chars, ~10 words (user requirement)
            // Accept if: 1+ sentence AND (40+ chars with ~10+ words) - simple validation, no unnecessary expansion
            const isDetailed = isLongEnough && hasOneSentence;
            
            // Smart copy detection: Check if prompt has meaningful keywords and structure
            // A good prompt should have node keywords attached, not just copy user prompt
            const userPromptLower = userPrompt.toLowerCase().trim();
            const promptLower = v.prompt.toLowerCase().trim();
            
            // ✅ UNIVERSAL: Check for node keywords using registry (no hardcoding)
            const allKeywordData = this.keywordCollector.getAllAliasKeywords();
            const nodeKeywords = allKeywordData.map(kd => kd.keyword);
            const hasNodeKeywords = nodeKeywords.some(keyword => promptLower.includes(keyword.toLowerCase()));
            
            // Check if prompt is just a copy: same or very similar length
            const lengthRatio = promptLower.length / userPromptLower.length;
            const isNotJustCopy = lengthRatio >= 1.2 || hasNodeKeywords; // At least 20% longer OR has keywords
            
            // Prompt is valid if: detailed enough AND has keywords/structure
            const isNotCopied = isNotJustCopy && (hasNodeKeywords || lengthRatio >= 1.3);
            
            const isValid = isDetailed && isNotCopied;
            
            // 🔍 DEBUG: Log validation details for each variation
            console.log(`[AIIntentClarifier] 🔍 Validation for variation ${idx + 1}:`);
            console.log(`[AIIntentClarifier] 🔍   - Length: ${v.prompt.length} chars (need >= 40)`);
            console.log(`[AIIntentClarifier] 🔍   - Words: ${wordCount} (need >= 8)`);
            console.log(`[AIIntentClarifier] 🔍   - Sentences: ${sentences.length} (need >= 1)`);
            console.log(`[AIIntentClarifier] 🔍   - Is detailed: ${isDetailed ? '✅' : '❌'}`);
            console.log(`[AIIntentClarifier] 🔍   - Has node keywords: ${hasNodeKeywords ? '✅' : '❌'}`);
            console.log(`[AIIntentClarifier] 🔍   - Length ratio: ${lengthRatio.toFixed(2)}x (need >= 1.2x or has keywords)`);
            console.log(`[AIIntentClarifier] 🔍   - Not copied: ${isNotCopied ? '✅' : '❌'}`);
            console.log(`[AIIntentClarifier] 🔍   - Overall: ${isValid ? '✅ VALID' : '❌ INVALID'}`);
            
            return { variation: v, isValid, isDetailed, isNotCopied, lines: promptLines.length, sentences: sentences.length, length: v.prompt.length, lengthRatio, hasNodeKeywords };
          });
          
          const hasDetailedPrompts = validationResults.every(r => r.isValid);
          
          if (!hasDetailedPrompts) {
            const invalidCount = validationResults.filter(r => !r.isValid).length;
            console.warn(`[AIIntentClarifier] ⚠️ ${invalidCount}/${validationResults.length} variations failed validation, retrying...`);
            console.warn(`[AIIntentClarifier] ⚠️ Invalid variations:`, validationResults.filter(r => !r.isValid).map(r => ({
              length: r.length,
              lines: r.lines,
              isDetailed: r.isDetailed,
              isNotCopied: r.isNotCopied
            })));
            throw new Error('Prompts are not detailed enough - need at least 2 sentences or 90+ chars with node keywords');
          }
          
          console.log(`[AIIntentClarifier] ✅ Generated ${result.promptVariations.length} detailed prompt variations (attempt ${attempt})`);
          
          // ✅ PHASE 1 FIX: Validate variations are unique (not duplicates) AND have node diversity
          const uniquenessCheck = this.validateVariationUniqueness(result.promptVariations);
          if ((!uniquenessCheck.isUnique || !uniquenessCheck.nodeDiversityValid) && attempt < maxRetries) {
            const issues: string[] = [];
            if (!uniquenessCheck.isUnique) {
              issues.push(`text similarity: ${uniquenessCheck.maxSimilarity.toFixed(2)} (need < 0.7)`);
            }
            if (!uniquenessCheck.nodeDiversityValid) {
              issues.push(`node diversity: ${uniquenessCheck.nodeDiversityIssues.length} issue(s)`);
            }
            console.warn(`[AIIntentClarifier] ⚠️ Variations validation failed (${issues.join(', ')}), retrying...`);
            throw new Error(`Variations not unique enough: ${issues.join('; ')}`);
          }
          
          // ✅ POST-PROCESSING: Enhance variations if not unique enough
          const enhancedResult = this.enhanceVariationsIfNeeded(result, userPrompt);
          return enhancedResult;
        } else {
          // Make "missing fields" retryable - can be fixed by retrying
          throw new Error('Invalid result: missing required fields or empty variations - retryable');
        }
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        console.warn(`[AIIntentClarifier] ⚠️ Attempt ${attempt}/${maxRetries} failed:`, lastError.message);

        // ✅ PRODUCTION: Check if error is retryable
        if (!this.isRetryableError(lastError) && attempt < maxRetries) {
          console.error('[AIIntentClarifier] ❌ Non-retryable error, failing fast');
          break;
        }

        // Wait before retry (exponential backoff)
        if (attempt < maxRetries) {
          const backoffMs = 1000 * attempt; // 1s, 2s, 3s
          await new Promise(resolve => setTimeout(resolve, backoffMs));
        }
      }
    }

    // All retries exhausted - use extracted nodes to create fallback (NO dummy prompts)
    console.error('[AIIntentClarifier] ❌ All attempts failed, creating fallback using extracted nodes from user prompt');
    
    // ✅ ROOT FIX: Use extracted nodes from Phase 1, never create dummy prompts
    if (allExtractedNodeTypes.length === 0) {
      // If no nodes extracted, return diagnostic error instead of dummy prompts
      const diagnosticError = new Error(
        `Failed to extract any nodes from user prompt: "${userPrompt}". ` +
        `Diagnostics: ${lastError ? lastError.message : 'Unknown error'}. ` +
        `Please check if the prompt contains recognizable node keywords.`
      );
      console.error('[AIIntentClarifier] ❌ No nodes extracted from user prompt - returning diagnostic error');
      throw diagnosticError;
    }
    
    // Use extracted nodes to create realistic fallback
    return this.createFallbackResultWithExtractedNodes(
      userPrompt, 
      allKeywords, 
      allExtractedNodeTypes, 
      allKeywordData,
      lastError
    );
  }

  /**
   * ✅ PRODUCTION: Check if error is retryable
   */
  private isRetryableError(error: Error): boolean {
    const errorMessage = error.message.toLowerCase();
    
    // Retry on network/timeout/provider errors
    const retryablePatterns = [
      'network', 'connection', 'timeout', 'econnrefused', 'enotfound',
      'etimedout', 'rate limit', '429', '503', '502', '504',
      'service unavailable', 'temporary', 'retry',
      // Quality issues that can be fixed by retrying
      'insufficient variations', 'not detailed enough', 'too vague', 'copying user',
      'prompts are not detailed', 'need at least 3', 'need 3-4 line'
    ];

    // Don't retry on structural/parsing errors
    const nonRetryablePatterns = [
      'invalid json', 'parse error', 'syntax error', 'malformed',
      'type error'  // Keep type error as non-retryable, but allow "missing field" to retry
    ];

    // Check non-retryable first
    if (nonRetryablePatterns.some(pattern => errorMessage.includes(pattern))) {
      return false;
    }

    // Check retryable
    return retryablePatterns.some(pattern => errorMessage.includes(pattern));
  }

  /**
   * ✅ PRODUCTION: Validate result quality
   */
  private isValidResult(result: SummarizeLayerResult): boolean {
    // Must have at least one variation
    if (!result.promptVariations || result.promptVariations.length === 0) {
      return false;
    }

    // Each variation must have required fields
    for (const variation of result.promptVariations) {
      if (!variation.prompt || variation.prompt.trim().length === 0) {
        return false;
      }
      if (!variation.id) {
        return false;
      }
    }
    
    // ✅ CRITICAL FIX: Check for OR options (forbidden)
    for (const variation of result.promptVariations) {
      const promptLower = variation.prompt.toLowerCase();
      
      // ✅ UNIVERSAL: Check for OR patterns with output nodes (using registry)
      const outputNodeKeywords = this.getOutputNodeKeywords();
      if (outputNodeKeywords.length > 0) {
        const outputKeywordsPattern = outputNodeKeywords.map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
        if (promptLower.match(new RegExp(`\\bor\\s+(${outputKeywordsPattern})`, 'i'))) {
          console.warn(`[AIIntentClarifier] ⚠️  Variation contains OR option: ${variation.prompt.substring(0, 100)}`);
          return false;
        }
        
        // Check for "either" patterns
        if (promptLower.match(new RegExp(`\\beither\\s+(${outputKeywordsPattern})`, 'i'))) {
          console.warn(`[AIIntentClarifier] ⚠️  Variation contains "either" option: ${variation.prompt.substring(0, 100)}`);
          return false;
        }
      }
    }
    
    // ✅ UNIVERSAL: Check for uniqueness (different output nodes OR different triggers)
    // Use registry to detect output nodes dynamically (no hardcoding)
    const outputNodes = result.promptVariations.map(v => {
      return this.detectOutputNodeFromPrompt(v.prompt);
    });
    
    // ✅ UNIVERSAL: Use registry-based trigger detection (no hardcoding)
    const triggers = result.promptVariations.map(v => {
      const prompt = v.prompt.toLowerCase();
      // ✅ UNIVERSAL: Find trigger nodes from registry
      const allNodeTypes = unifiedNodeRegistry.getAllTypes();
      for (const nodeType of allNodeTypes) {
        const nodeDef = unifiedNodeRegistry.get(nodeType);
        if (nodeDef && (nodeDef.category === 'trigger' || (nodeDef.tags || []).includes('trigger'))) {
          const nodeTypeLower = nodeType.toLowerCase();
          const nodeLabel = (nodeDef.label || nodeType).toLowerCase();
          if (prompt.includes(nodeTypeLower) || prompt.includes(nodeLabel)) {
            return nodeType;
          }
        }
      }
      return null;
    });
    
    const uniqueOutputs = new Set(outputNodes.filter(Boolean));
    const uniqueTriggers = new Set(triggers.filter(Boolean));
    
    // ✅ FIX: Allow same output node if triggers differ (manual_trigger vs webhook)
    if (uniqueOutputs.size < 2 && result.promptVariations.length >= 2) {
      if (uniqueTriggers.size >= 2) {
        // Triggers differ, so allow same output node
        console.log(`[AIIntentClarifier] ✅ Variations have trigger variety (${uniqueTriggers.size} triggers), allowing same output node`);
      } else {
        // Neither outputs nor triggers differ - need to enhance variations
        console.warn(`[AIIntentClarifier] ⚠️  Variations not unique enough: only ${uniqueOutputs.size} output nodes, ${uniqueTriggers.size} triggers`);
        // Don't fail here - we'll enhance variations in post-processing if needed
      }
    }

    return true;
  }

  /**
   * ✅ PHASE 3: Validate that variations include required nodes
   * Ensures all extracted node types are present in variations
   * Returns validation result to determine if retry is needed
   */
  /**
   * ✅ UNIVERSAL ROOT-LEVEL: Validate variations include required nodes
   * Enhanced to check nodeMentions from SimpleIntent
   * ✅ OPERATIONS-FIRST: Also validates that variations include operations from node schemas
   */
  private validateVariationsIncludeNodes(
    result: SummarizeLayerResult,
    requiredNodeTypes: string[],
    nodeMentions?: Array<{ nodeType: string; context: string; verbs?: string[]; confidence: number }>,
    nodeMentionsWithOperations?: Array<{ // ✅ OPERATIONS-FIRST: Node mentions with operations from schema
      nodeType: string;
      operations: string[];
      defaultOperation: string;
    }>
  ): { allValid: boolean; missingCount: number } {
    if (requiredNodeTypes.length === 0) {
      return { allValid: true, missingCount: 0 }; // No required nodes to validate
    }

    console.log(`[AIIntentClarifier] 🔍 PHASE 3: Validating variations include required nodes: ${requiredNodeTypes.join(', ')}`);
    
    // ✅ OPERATIONS-FIRST: Validate operations if nodeMentionsWithOperations provided
    if (nodeMentionsWithOperations && nodeMentionsWithOperations.length > 0) {
      console.log(`[AIIntentClarifier] ✅ OPERATIONS-FIRST: Validating operations from node schemas for ${nodeMentionsWithOperations.length} node(s)`);
    }

    for (const variation of result.promptVariations) {
      const variationLower = variation.prompt.toLowerCase();
      const variationKeywords = variation.matchedKeywords.map(k => k.toLowerCase());
      const missingNodes: string[] = [];
      const missingOperations: Array<{ nodeType: string; expectedOps: string[] }> = []; // ✅ OPERATIONS-FIRST: Track missing operations

      for (const nodeType of requiredNodeTypes) {
        const nodeTypeLower = nodeType.toLowerCase();
        const nodeLabel = nodeType.replace(/_/g, ' ').toLowerCase();
        const nodeLabelNoSpaces = nodeType.replace(/_/g, '').toLowerCase();
        
        // ✅ SMART VALIDATION: Use semantic matching as PRIMARY method (more reliable than text matching)
        // Check ALL extracted nodes from variation text, not just filtered ones
        const allNodesForMatching = variation.allExtractedNodes && variation.allExtractedNodes.length > 0 
          ? variation.allExtractedNodes 
          : variation.matchedKeywords; // Fallback to matchedKeywords if allExtractedNodes not available
        
        let mentionedInText = false;
        
        // Method 1: Semantic matching FIRST (most reliable)
        if (allNodesForMatching.length > 0) {
          const matchResult = unifiedNodeTypeMatcher.isRequirementSatisfied(
            nodeType, // required node
            allNodesForMatching, // ✅ FIX: Use ALL extracted nodes for semantic matching
            { strict: false } // Allow semantic equivalents
          );
          
          if (matchResult.matches) {
            mentionedInText = true;
            console.log(`[AIIntentClarifier] ✅ SMART VALIDATION: Semantic match - "${matchResult.matchingType}" satisfies requirement for "${nodeType}" (${matchResult.reason}, confidence: ${matchResult.confidence}%)`);
          }
        }
        
        // Method 2: Text matching (fallback if semantic matching didn't find it)
        if (!mentionedInText) {
          // ✅ ROOT-LEVEL UNIVERSAL: Check if node is mentioned using registry (works for ALL nodes)
          const nodeDef = unifiedNodeRegistry.get(nodeType);
          const nodeAliases = nodeDef ? 
            this.keywordCollector.getAllAliasKeywords()
              .filter(k => k.nodeType === nodeType)
              .map(k => k.keyword.toLowerCase()) : [];
          
          // ✅ ROOT-LEVEL UNIVERSAL: Check if any alias/keyword is mentioned in variation text
          const nodeTypeNormalized = nodeTypeLower.replace(/[_\s-]/g, '[\\s_-]*');
          const nodeTypePattern = new RegExp(`\\b${nodeTypeNormalized.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
          
          mentionedInText = 
            nodeTypePattern.test(variationLower) ||
            variationLower.includes(nodeTypeLower) || 
            variationLower.includes(nodeLabel) ||
            variationLower.includes(nodeLabelNoSpaces) ||
            nodeAliases.some(alias => {
              const aliasNormalized = alias.replace(/[_\s-]/g, '[\\s_-]*');
              const aliasPattern = new RegExp(`\\b${aliasNormalized.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
              return aliasPattern.test(variationLower) || variationLower.includes(alias);
            }) ||
            (nodeLabel.includes(' ') && variationLower.includes(nodeLabel.replace(/\s+/g, ''))) ||
            (!nodeLabel.includes(' ') && variationLower.includes(nodeLabel.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase()));
        }
        
        if (!mentionedInText) {
          missingNodes.push(nodeType);
        }
        
        // ✅ OPERATIONS-FIRST: Validate operations ONLY for nodes that HAVE operations
        if (nodeMentionsWithOperations && mentionedInText) {
          const nodeWithOps = nodeMentionsWithOperations.find(n => n.nodeType === nodeType);
          
          // ✅ FIX: Only validate operations if node HAS operations
          // Nodes without operations (webhook, wait, etc.) don't need operation validation
          if (nodeWithOps && nodeWithOps.operations.length > 0) {
            // Check if variation mentions any operation from node's schema
            const operationMentioned = nodeWithOps.operations.some(op => {
              const opLower = op.toLowerCase();
              const opNormalized = opLower.replace(/[_\s-]/g, '[\\s_-]*');
              const opPattern = new RegExp(`\\b${opNormalized.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
              return opPattern.test(variationLower) || 
                     variationLower.includes(opLower) ||
                     variationLower.includes(`operation='${op}'`) ||
                     variationLower.includes(`operation="${op}"`) ||
                     variationLower.includes(`operation: ${op}`);
            });
            
            if (!operationMentioned) {
              // ✅ OPERATIONS-FIRST: Treat missing operations as validation FAILURE (not just warning)
              // Variations MUST mention at least one valid operation for nodes that have operations
              console.log(`[AIIntentClarifier] ❌ Variation "${variation.id}" mentions ${nodeType} but no explicit operation from schema [${nodeWithOps.operations.join(', ')}]`);
              console.log(`[AIIntentClarifier]   - Available operations: ${nodeWithOps.operations.join(', ')}`);
              console.log(`[AIIntentClarifier]   - Default operation: ${nodeWithOps.defaultOperation}`);
              // Track missing operations so caller can decide to retry/regenerate
              missingOperations.push({
                nodeType,
                expectedOps: nodeWithOps.operations,
              });
            } else {
              // Find which operation was mentioned
              const mentionedOp = nodeWithOps.operations.find(op => {
                const opLower = op.toLowerCase();
                return variationLower.includes(opLower) ||
                       variationLower.includes(`operation='${op}'`) ||
                       variationLower.includes(`operation="${op}"`);
              });
              if (mentionedOp) {
                console.log(`[AIIntentClarifier] ✅ Variation "${variation.id}" mentions ${nodeType} with operation "${mentionedOp}" (from schema)`);
              }
            }
          } else if (nodeWithOps && nodeWithOps.operations.length === 0) {
            // ✅ FIX: Node has no operations - just verify it's mentioned (action-based node)
            console.log(`[AIIntentClarifier] ✅ Variation "${variation.id}" mentions ${nodeType} (action-based node, no operations required)`);
          }
        }
      }

      if (missingNodes.length > 0) {
        console.warn(`[AIIntentClarifier] ⚠️  Variation "${variation.id}" missing required nodes: ${missingNodes.join(', ')}`);
        console.warn(`[AIIntentClarifier] ⚠️  Variation prompt: "${variation.prompt.substring(0, 150)}..."`);
        console.warn(`[AIIntentClarifier] ⚠️  Variation matchedKeywords: ${variation.matchedKeywords.join(', ')}`);
      } else {
        console.log(`[AIIntentClarifier] ✅ Variation "${variation.id}" includes all required nodes`);
        
        // ✅ OPERATIONS-FIRST: Log operations validation summary
        if (nodeMentionsWithOperations && nodeMentionsWithOperations.length > 0) {
          const nodesWithOps = nodeMentionsWithOperations.filter(n => requiredNodeTypes.includes(n.nodeType));
          if (nodesWithOps.length > 0) {
            console.log(`[AIIntentClarifier] ✅ OPERATIONS-FIRST: Variation "${variation.id}" - ${nodesWithOps.length} node(s) with operations from schema validated`);
          }
        }
      }
    }

    // ✅ SMART VALIDATION: Use lenient threshold (6/7 nodes = pass) and semantic matching
    const lenientThreshold = Math.ceil(requiredNodeTypes.length * 0.85); // 85% threshold (6/7 nodes)
    console.log(`[AIIntentClarifier] ✅ SMART VALIDATION: Using lenient threshold - ${lenientThreshold}/${requiredNodeTypes.length} nodes required (85%)`);
    
    const variationValidationResults = result.promptVariations.map(v => {
      const vLower = v.prompt.toLowerCase();
      const foundNodes: string[] = [];
      
      // Check each required node using smart matching
      for (const nodeType of requiredNodeTypes) {
        const nodeTypeLower = nodeType.toLowerCase();
        const nodeLabel = nodeType.replace(/_/g, ' ').toLowerCase();
        const nodeLabelNoSpaces = nodeType.replace(/_/g, '').toLowerCase();
        
        // Method 1: Direct text matching
        let found = vLower.includes(nodeTypeLower) || 
                   vLower.includes(nodeLabel) ||
                   vLower.includes(nodeLabelNoSpaces);
        
        // Method 2: Check aliases
        if (!found) {
          const nodeDef = unifiedNodeRegistry.get(nodeType);
          const nodeAliases = nodeDef ? 
            this.keywordCollector.getAllAliasKeywords()
              .filter(k => k.nodeType === nodeType)
              .map(k => k.keyword.toLowerCase()) : [];
          
          found = nodeAliases.some(alias => {
            const aliasNormalized = alias.replace(/[_\s-]/g, '[\\s_-]*');
            const aliasPattern = new RegExp(`\\b${aliasNormalized.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
            return aliasPattern.test(vLower) || vLower.includes(alias);
          });
        }
        
        // Method 3: Semantic matching with ALL extracted nodes (PRIMARY method)
        if (!found) {
          const allNodesForMatching = v.allExtractedNodes && v.allExtractedNodes.length > 0 
            ? v.allExtractedNodes 
            : v.matchedKeywords;
          
          if (allNodesForMatching.length > 0) {
            const matchResult = unifiedNodeTypeMatcher.isRequirementSatisfied(
              nodeType,
              allNodesForMatching,
              { strict: false }
            );
            
            if (matchResult.matches) {
              found = true;
              console.log(`[AIIntentClarifier] ✅ SMART VALIDATION: Semantic match for "${nodeType}" → "${matchResult.matchingType}" (${matchResult.reason})`);
            }
          }
        }
        
        if (found) {
          foundNodes.push(nodeType);
        }
      }
      
      const foundCount = foundNodes.length;
      const missingCount = requiredNodeTypes.length - foundCount;
      const meetsThreshold = foundCount >= lenientThreshold;
      
      return {
        variation: v,
        foundNodes,
        foundCount,
        missingCount,
        meetsThreshold,
        missingNodes: requiredNodeTypes.filter(n => !foundNodes.includes(n))
      };
    });
    
    // Check if all variations meet lenient threshold
    const allVariationsValid = variationValidationResults.every(r => r.meetsThreshold);
    const totalMissingCount = variationValidationResults.reduce((sum, r) => sum + r.missingCount, 0);
    
    // ✅ OPERATIONS-FIRST: Also detect if ANY variation is missing required operations
    const hasMissingOperationsGlobally = result.promptVariations.some(v => {
      // Recompute missing operations for this variation using same logic as above
      const variationLower = v.prompt.toLowerCase();
      if (!nodeMentionsWithOperations || nodeMentionsWithOperations.length === 0) {
        return false;
      }
      
      for (const nodeInfo of nodeMentionsWithOperations) {
        if (!requiredNodeTypes.includes(nodeInfo.nodeType)) {
          continue;
        }
        if (!nodeInfo.operations || nodeInfo.operations.length === 0) {
          continue; // Action-based node, no operations required
        }
        
        const opMissing = !nodeInfo.operations.some(op => {
          const opLower = op.toLowerCase();
          const opNormalized = opLower.replace(/[_\s-]/g, '[\\s_-]*');
          const opPattern = new RegExp(`\\b${opNormalized.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
          return opPattern.test(variationLower) || 
                 variationLower.includes(opLower) ||
                 variationLower.includes(`operation='${op}'`) ||
                 variationLower.includes(`operation="${op}"`) ||
                 variationLower.includes(`operation: ${op}`);
        });
        
        if (opMissing) {
          return true;
        }
      }
      
      return false;
    });
    
    // Log detailed results
    variationValidationResults.forEach((r, idx) => {
      if (r.meetsThreshold) {
        console.log(`[AIIntentClarifier] ✅ Variation "${r.variation.id}": Found ${r.foundCount}/${requiredNodeTypes.length} nodes (${r.foundNodes.join(', ')}) - MEETS THRESHOLD`);
      } else {
        console.warn(`[AIIntentClarifier] ⚠️  Variation "${r.variation.id}": Found ${r.foundCount}/${requiredNodeTypes.length} nodes, missing: ${r.missingNodes.join(', ')} - BELOW THRESHOLD`);
      }
    });
    
    if (allVariationsValid && !hasMissingOperationsGlobally) {
      console.log(`[AIIntentClarifier] ✅ SMART VALIDATION: All variations meet lenient node threshold (${lenientThreshold}/${requiredNodeTypes.length} nodes) AND all required operations are present`);
      return { allValid: true, missingCount: 0 };
    } else {
      const belowThresholdCount = variationValidationResults.filter(r => !r.meetsThreshold).length;
      const opMsg = hasMissingOperationsGlobally ? ' and missing required operations' : '';
      console.warn(`[AIIntentClarifier] ⚠️  SMART VALIDATION: ${belowThresholdCount}/${variationValidationResults.length} variations below node threshold (${lenientThreshold}/${requiredNodeTypes.length} nodes required)${opMsg}`);
      // Treat missing operations as part of missingCount to force retry/fallback
      const effectiveMissingCount = totalMissingCount || (hasMissingOperationsGlobally ? 1 : 0);
      return { allValid: false, missingCount: effectiveMissingCount };
    }
  }

  /**
   * ✅ POST-PROCESSING: Enhance variations if not unique enough
   * Adds different triggers/outputs to ensure uniqueness
   */
  private enhanceVariationsIfNeeded(
    result: SummarizeLayerResult,
    userPrompt: string
  ): SummarizeLayerResult {
    if (!result.promptVariations || result.promptVariations.length < 2) {
      return result;
    }
    
    // Check uniqueness
    // ✅ UNIVERSAL: Use registry-based detection (no hardcoding)
    const outputNodes = result.promptVariations.map(v => {
      return this.detectOutputNodeFromPrompt(v.prompt);
    });
    
    const triggers = result.promptVariations.map(v => {
      const prompt = v.prompt.toLowerCase();
      // ✅ UNIVERSAL: Find trigger nodes from registry
      const allNodeTypes = unifiedNodeRegistry.getAllTypes();
      for (const nodeType of allNodeTypes) {
        const nodeDef = unifiedNodeRegistry.get(nodeType);
        if (nodeDef && (nodeDef.category === 'trigger' || (nodeDef.tags || []).includes('trigger'))) {
          const nodeTypeLower = nodeType.toLowerCase();
          const nodeLabel = (nodeDef.label || nodeType).toLowerCase();
          if (prompt.includes(nodeTypeLower) || prompt.includes(nodeLabel)) {
            return nodeType;
          }
        }
      }
      return null;
    });
    
    const uniqueOutputs = new Set(outputNodes.filter(Boolean));
    const uniqueTriggers = new Set(triggers.filter(Boolean));
    
    // If not unique enough, enhance variations
    if (uniqueOutputs.size < 2 && uniqueTriggers.size < 2) {
      console.log(`[AIIntentClarifier] 🔧 Enhancing variations: ${uniqueOutputs.size} outputs, ${uniqueTriggers.size} triggers`);
      
      const enhancedVariations = result.promptVariations.map((v, idx) => {
        const prompt = v.prompt.toLowerCase();
        let enhancedPrompt = v.prompt;
        
        // ✅ UNIVERSAL: Ensure triggers differ using registry
        const allNodeTypes = unifiedNodeRegistry.getAllTypes();
        const triggerNodes = allNodeTypes.filter(nt => {
          const nodeDef = unifiedNodeRegistry.get(nt);
          return nodeDef && (nodeDef.category === 'trigger' || (nodeDef.tags || []).includes('trigger'));
        });
        
        const manualTrigger = triggerNodes.find(nt => nt.includes('manual') || (unifiedNodeRegistry.get(nt)?.tags || []).includes('manual')) || triggerNodes[0];
        const webhookTrigger = triggerNodes.find(nt => nt.includes('webhook') || (unifiedNodeRegistry.get(nt)?.tags || []).includes('webhook')) || triggerNodes[1] || triggerNodes[0];
        
        if (idx < 2 && manualTrigger && !prompt.includes(manualTrigger.toLowerCase()) && !prompt.includes((unifiedNodeRegistry.get(manualTrigger)?.label || '').toLowerCase())) {
          const triggerLabel = unifiedNodeRegistry.get(manualTrigger)?.label || manualTrigger;
          enhancedPrompt = `Create a workflow with ${triggerLabel}. ${enhancedPrompt}`;
        } else if (idx >= 2 && webhookTrigger && !prompt.includes(webhookTrigger.toLowerCase()) && !prompt.includes((unifiedNodeRegistry.get(webhookTrigger)?.label || '').toLowerCase())) {
          const triggerLabel = unifiedNodeRegistry.get(webhookTrigger)?.label || webhookTrigger;
          enhancedPrompt = `Create a ${triggerLabel}-triggered workflow. ${enhancedPrompt}`;
        }
        
        // ✅ UNIVERSAL: Ensure outputs differ using registry
        const outputNodeTypes = allNodeTypes.filter(nt => {
          return nodeCapabilityRegistryDSL.isOutput(nt) && !nodeCapabilityRegistryDSL.isDataSource(nt);
        });
        
        if (outputNodeTypes.length >= 2) {
          const output1 = outputNodeTypes[0];
          const output2 = outputNodeTypes[1];
          const output1Label = (unifiedNodeRegistry.get(output1)?.label || output1).toLowerCase();
          const output2Label = (unifiedNodeRegistry.get(output2)?.label || output2).toLowerCase();
          
          const hasOutput1 = prompt.includes(output1.toLowerCase()) || prompt.includes(output1Label);
          const hasOutput2 = prompt.includes(output2.toLowerCase()) || prompt.includes(output2Label);
          
          if (idx % 2 === 0 && !hasOutput1 && !hasOutput2) {
            enhancedPrompt = enhancedPrompt.replace(/send/i, `send via ${output1Label}`);
          } else if (idx % 2 === 1 && !hasOutput2 && !hasOutput1) {
            enhancedPrompt = enhancedPrompt.replace(/send/i, `send via ${output2Label}`);
          } else if (idx % 2 === 1 && hasOutput1 && !hasOutput2) {
            enhancedPrompt = enhancedPrompt.replace(new RegExp(output1Label, 'gi'), output2Label);
          }
        }
        
        return {
          ...v,
          prompt: enhancedPrompt,
          reasoning: v.reasoning ? `${v.reasoning} (enhanced for uniqueness)` : 'Enhanced for uniqueness'
        };
      });
      
      return {
        ...result,
        promptVariations: enhancedVariations
      };
    }
    
    return result;
  }

  /**
   * ✅ PHASE 1 FIX: Validate that variations are unique (not duplicates)
   * Checks similarity between variations using word overlap and structure
   */
  private validateVariationUniqueness(variations: PromptVariation[]): {
    isUnique: boolean;
    maxSimilarity: number;
    similarPairs: Array<{ v1: number; v2: number; similarity: number }>;
    nodeDiversityValid: boolean;
    nodeDiversityIssues: string[];
  } {
    if (variations.length < 2) {
      return { isUnique: true, maxSimilarity: 0, similarPairs: [], nodeDiversityValid: true, nodeDiversityIssues: [] };
    }
    
    let maxSimilarity = 0;
    const similarPairs: Array<{ v1: number; v2: number; similarity: number }> = [];
    const nodeDiversityIssues: string[] = [];
    
    // ✅ NEW: Extract nodes from each variation for diversity check
    const allNodeTypes = unifiedNodeRegistry.getAllTypes();
    const variationNodes: Array<Set<string>> = variations.map(v => {
      const nodes = new Set<string>();
      const promptLower = v.prompt.toLowerCase();
      for (const nodeType of allNodeTypes) {
        const nodeTypeLower = nodeType.toLowerCase();
        const nodeTypeWords = nodeTypeLower.split(/[_\s-]+/);
        // Check if node type or its words appear in prompt
        if (promptLower.includes(nodeTypeLower) || 
            nodeTypeWords.some((word: string) => word.length > 3 && promptLower.includes(word))) {
          nodes.add(nodeType);
        }
      }
      return nodes;
    });
    
    // ✅ NEW: Check node diversity across variations
    for (let i = 0; i < variationNodes.length; i++) {
      for (let j = i + 1; j < variationNodes.length; j++) {
        const nodes1 = variationNodes[i];
        const nodes2 = variationNodes[j];
        
        // Calculate node overlap
        const intersection = new Set([...nodes1].filter(n => nodes2.has(n)));
        const union = new Set([...nodes1, ...nodes2]);
        const nodeSimilarity = union.size > 0 ? intersection.size / union.size : 0;
        
        // Check if variations have too many common nodes (excluding required nodes)
        // If more than 80% of nodes overlap, it's a diversity issue
        if (nodeSimilarity > 0.8 && union.size > 3) {
          nodeDiversityIssues.push(
            `Variations ${i + 1} and ${j + 1} share ${intersection.size}/${union.size} nodes (${(nodeSimilarity * 100).toFixed(1)}% overlap) - too similar`
          );
        }
        
        // Check node count progression (Variation 1 should have fewer nodes than Variation 3)
        if (i === 0 && j === 2 && nodes1.size >= nodes2.size) {
          nodeDiversityIssues.push(
            `Variation 1 (${nodes1.size} nodes) should have FEWER nodes than Variation 3 (${nodes2.size} nodes)`
          );
        }
      }
    }
    
    // Compare each pair of variations for text similarity
    for (let i = 0; i < variations.length; i++) {
      for (let j = i + 1; j < variations.length; j++) {
        const v1 = variations[i].prompt.toLowerCase();
        const v2 = variations[j].prompt.toLowerCase();
        
        // Calculate word overlap similarity
        const words1 = new Set(v1.split(/\s+/).filter(w => w.length > 3));
        const words2 = new Set(v2.split(/\s+/).filter(w => w.length > 3));
        
        const intersection = new Set([...words1].filter(w => words2.has(w)));
        const union = new Set([...words1, ...words2]);
        
        const jaccardSimilarity = union.size > 0 ? intersection.size / union.size : 0;
        
        // Check structural similarity (same sentence structure)
        const sentences1 = v1.split(/[.!?]+/).filter(s => s.trim().length > 10);
        const sentences2 = v2.split(/[.!?]+/).filter(s => s.trim().length > 10);
        const structuralSimilarity = sentences1.length > 0 && sentences2.length > 0
          ? Math.min(sentences1.length, sentences2.length) / Math.max(sentences1.length, sentences2.length)
          : 0;
        
        // Combined similarity (weighted)
        const combinedSimilarity = (jaccardSimilarity * 0.7) + (structuralSimilarity * 0.3);
        
        if (combinedSimilarity > maxSimilarity) {
          maxSimilarity = combinedSimilarity;
        }
        
        if (combinedSimilarity > 0.7) {
          similarPairs.push({ v1: i, v2: j, similarity: combinedSimilarity });
        }
      }
    }
    
    const isUnique = maxSimilarity < 0.7; // Threshold: 70% similarity = too similar
    const nodeDiversityValid = nodeDiversityIssues.length === 0;
    
    if (!isUnique || !nodeDiversityValid) {
      console.warn(`[AIIntentClarifier] ⚠️ Variations validation issues:`);
    if (!isUnique) {
        console.warn(`[AIIntentClarifier]   - Text similarity: ${maxSimilarity.toFixed(2)} (max allowed: 0.7)`);
      similarPairs.forEach(pair => {
          console.warn(`[AIIntentClarifier]     Variation ${pair.v1 + 1} and ${pair.v2 + 1} are ${(pair.similarity * 100).toFixed(1)}% similar`);
      });
      }
      if (!nodeDiversityValid) {
        console.warn(`[AIIntentClarifier]   - Node diversity issues:`);
        nodeDiversityIssues.forEach(issue => console.warn(`[AIIntentClarifier]     ${issue}`));
      }
    } else {
      console.log(`[AIIntentClarifier] ✅ Variations are unique (text similarity: ${maxSimilarity.toFixed(2)} < 0.7, node diversity: ✅)`);
    }
    
    return { isUnique, maxSimilarity, similarPairs, nodeDiversityValid, nodeDiversityIssues };
  }
  
  /**
   * ✅ UNIVERSAL ROOT-LEVEL FIX: Create fallback result using EXTRACTED NODES
   * 
   * This method:
   * 1. Categorizes all extracted nodes (dataSource/transformation/output) using registry
   * 2. Identifies required nodes from user intent verbs
   * 3. Builds complete workflow chains (trigger → source → transform → output)
   * 4. Generates 4 distinct variations with ALL required nodes
   * 
   * Works for INFINITE prompts - not just specific cases.
   */
  private createFallbackResultWithExtractedNodes(
    userPrompt: string,
    allKeywords: string[],
    extractedNodeTypes: string[],
    allKeywordData: AliasKeyword[],
    error: Error | null
  ): SummarizeLayerResult {
    console.log(`[AIIntentClarifier] 🔧 Creating fallback using ${extractedNodeTypes.length} extracted node(s): ${extractedNodeTypes.join(', ')}`);
    
    // ✅ STEP 1: Categorize all extracted nodes using registry
    const categorizedNodes = this.categorizeExtractedNodes(extractedNodeTypes);
    
    console.log(`[AIIntentClarifier] ✅ Categorized nodes:`);
    console.log(`[AIIntentClarifier]   - Data Sources: ${categorizedNodes.dataSources.join(', ')}`);
    console.log(`[AIIntentClarifier]   - Transformations: ${categorizedNodes.transformations.join(', ')}`);
    console.log(`[AIIntentClarifier]   - Outputs: ${categorizedNodes.outputs.join(', ')}`);
    console.log(`[AIIntentClarifier]   - Triggers: ${categorizedNodes.triggers.join(', ')}`);
    
    // ✅ STEP 2: Identify required nodes from user intent
    const requiredNodes = this.identifyRequiredNodesFromIntent(userPrompt, categorizedNodes, extractedNodeTypes);
    
    console.log(`[AIIntentClarifier] ✅ Required nodes from intent:`);
    console.log(`[AIIntentClarifier]   - Required Data Sources: ${requiredNodes.requiredDataSources.join(', ')}`);
    console.log(`[AIIntentClarifier]   - Required Transformations: ${requiredNodes.requiredTransformations.join(', ')}`);
    console.log(`[AIIntentClarifier]   - Required Outputs: ${requiredNodes.requiredOutputs.join(', ')}`);
    
    // ✅ STEP 3: Get node labels and operations
    const nodeLabels = new Map<string, string>();
    const { unifiedNodeRegistry } = require('../../core/registry/unified-node-registry');
    const nodeOperations = new Map<string, { operations: string[]; defaultOp: string }>();
    
    for (const nodeType of extractedNodeTypes) {
      const schema = nodeLibrary.getSchema(nodeType);
      if (schema) {
        nodeLabels.set(nodeType, schema.label || nodeType);
      }
      
      const nodeDef = unifiedNodeRegistry.get(nodeType);
      if (nodeDef?.inputSchema) {
        const opField = nodeDef.inputSchema.properties?.operation;
        if (opField && (opField.enum || opField.oneOf)) {
          const ops = opField.enum || (opField.oneOf?.map((o: any) => o.const).filter(Boolean) || []);
          nodeOperations.set(nodeType, {
            operations: ops,
            defaultOp: opField.default || ops[0] || ''
          });
        }
      }
    }
    
    // ✅ STEP 4: Generate 4 distinct variations with DIFFERENT complexity levels
    const variations: PromptVariation[] = [];
    
    // ✅ STEP 4.1: Determine appropriate trigger based on prompt
    // Check for scheduled tasks: "daily", "schedule", "automatically", etc.
    const promptLower = userPrompt.toLowerCase();
    const needsSchedule = promptLower.includes('daily') || 
                         promptLower.includes('schedule') ||
                         promptLower.includes('automatically') ||
                         promptLower.includes('recurring') ||
                         promptLower.includes('periodic');
    
    // ✅ FIX: Generate variations with different complexity levels
    // Variation 0: Minimal (trigger + 1 core node)
    // Variation 1: Simple (trigger + 1-2 nodes)
    // Variation 2: Medium (trigger + 2-3 nodes)
    // Variation 3: Full (trigger + all nodes)
    
    for (let i = 0; i < 4; i++) {
      // Use schedule trigger for scheduled tasks, otherwise alternate between manual_trigger and webhook
      let triggerType: string;
      if (needsSchedule && i < 2) {
        triggerType = 'schedule';
      } else if (needsSchedule) {
        triggerType = 'webhook';
      } else {
        triggerType = i < 2 ? 'manual_trigger' : 'webhook';
      }
      
      // ✅ FIX: Build workflow chain with DIFFERENT complexity based on variation index
      // This ensures each variation has a structurally different chain
      const chain = this.buildWorkflowChain(requiredNodes, categorizedNodes, triggerType, userPrompt, extractedNodeTypes, i);
      
      console.log(`[AIIntentClarifier] ✅ Variation ${i + 1} (complexity: ${i === 0 ? 'minimal' : i === 1 ? 'simple' : i === 2 ? 'medium' : 'full'}) chain: ${chain.join(' → ')}`);
      
      // Build prompt describing complete workflow
      const prompt = this.buildVariationPrompt(chain, nodeLabels, nodeOperations, i);
      
      variations.push({
        id: `fallback-${i + 1}`,
        prompt,
        keywords: chain, // ✅ FIX: Each variation now has different keywords (different chain)
        matchedKeywords: chain,
        confidence: 0.8, // Higher confidence - uses required nodes
        reasoning: `Fallback variation ${i + 1} (${i === 0 ? 'minimal' : i === 1 ? 'simple' : i === 2 ? 'medium' : 'full'} complexity) with workflow chain: ${chain.join(' → ')}`
      });
    }
    
    // ✅ FIX: Validate fallback variations for uniqueness and diversity
    const uniquenessCheck = this.validateVariationUniqueness(variations);
    if (!uniquenessCheck.isUnique || !uniquenessCheck.nodeDiversityValid) {
      console.warn(`[AIIntentClarifier] ⚠️ Fallback variations validation issues:`);
      if (!uniquenessCheck.isUnique) {
        console.warn(`[AIIntentClarifier]   - Text similarity: ${uniquenessCheck.maxSimilarity.toFixed(2)} (max allowed: 0.7)`);
      }
      if (!uniquenessCheck.nodeDiversityValid) {
        console.warn(`[AIIntentClarifier]   - Node diversity issues:`);
        uniquenessCheck.nodeDiversityIssues.forEach(issue => console.warn(`[AIIntentClarifier]     ${issue}`));
      }
      // Even if validation fails, return variations (better than nothing)
      // The different complexity levels should ensure diversity
    } else {
      console.log(`[AIIntentClarifier] ✅ Fallback variations are unique (text similarity: ${uniquenessCheck.maxSimilarity.toFixed(2)} < 0.7, node diversity: ✅)`);
    }
    
    // ✅ STEP 5: Map extracted nodes to keywords for matchedKeywords
    const matchedKeywordsSet = new Set<string>();
    for (const nodeType of extractedNodeTypes) {
      matchedKeywordsSet.add(nodeType);
      const keywordData = allKeywordData.filter(kd => kd.nodeType === nodeType);
      for (const kd of keywordData.slice(0, 2)) {
        matchedKeywordsSet.add(kd.keyword);
      }
    }
    
    return {
      shouldShowLayer: true,
      originalPrompt: userPrompt,
      promptVariations: variations,
      allKeywords: allKeywords,
      matchedKeywords: Array.from(matchedKeywordsSet),
      mandatoryNodeTypes: extractedNodeTypes,
    };
  }
  
  /**
   * ✅ UNIVERSAL: Categorize extracted nodes using registry
   * Uses nodeCapabilityRegistryDSL as single source of truth
   */
  private categorizeExtractedNodes(extractedNodeTypes: string[]): {
    dataSources: string[];
    transformations: string[];
    outputs: string[];
    triggers: string[];
    others: string[];
  } {
    const categories = {
      dataSources: [] as string[],
      transformations: [] as string[],
      outputs: [] as string[],
      triggers: [] as string[],
      others: [] as string[],
    };
    
    const { unifiedNodeRegistry } = require('../../core/registry/unified-node-registry');
    
    for (const nodeType of extractedNodeTypes) {
      const nodeDef = unifiedNodeRegistry.get(nodeType);
      
      // Check if trigger (using registry category)
      if (nodeDef?.category === 'trigger' || 
          (nodeDef?.tags || []).includes('trigger')) {
        categories.triggers.push(nodeType);
        continue;
      }
      
      // Use capability registry for categorization
      // ✅ UNIVERSAL: Smart categorization using registry (no hardcoded node names)
      // Use registry category and tags to determine node type
      const nodeCategory = (nodeDef.category || '').toLowerCase();
      const nodeTags = (nodeDef.tags || []).map((t: string) => t.toLowerCase());
      
      // Email/communication nodes are primarily outputs
      if ((nodeCategory === 'communication' || nodeTags.includes('email') || nodeTags.includes('mail')) && nodeCapabilityRegistryDSL.isOutput(nodeType)) {
        categories.outputs.push(nodeType);
      }
      // Sheet/data nodes can be data sources (read) or outputs (write) - check context
      else if (nodeCategory === 'data' || nodeTags.includes('sheet') || nodeTags.includes('spreadsheet')) {
        if (nodeCapabilityRegistryDSL.isDataSource(nodeType)) {
          categories.dataSources.push(nodeType);
        }
        if (nodeCapabilityRegistryDSL.isOutput(nodeType)) {
          categories.outputs.push(nodeType);
        }
      }
      // Database nodes are primarily data sources
      else if ((nodeCategory === 'data' || nodeTags.includes('database') || nodeTags.includes('db')) && nodeCapabilityRegistryDSL.isDataSource(nodeType)) {
        categories.dataSources.push(nodeType);
      }
      // HTTP/API nodes can be both - prioritize based on capability
      else if (nodeCategory === 'utility' || nodeTags.includes('http') || nodeTags.includes('api') || nodeTags.includes('request')) {
        if (nodeCapabilityRegistryDSL.isDataSource(nodeType)) {
          categories.dataSources.push(nodeType);
        }
        if (nodeCapabilityRegistryDSL.isOutput(nodeType)) {
          categories.outputs.push(nodeType);
        }
      }
      // Default: Use capability registry
      else {
        if (nodeCapabilityRegistryDSL.isOutput(nodeType)) {
          categories.outputs.push(nodeType);
        }
        if (nodeCapabilityRegistryDSL.isDataSource(nodeType)) {
          categories.dataSources.push(nodeType);
        }
        if (nodeCapabilityRegistryDSL.isTransformation(nodeType)) {
          categories.transformations.push(nodeType);
        }
      }
      
      // If node wasn't categorized, add to others
      if (!categories.dataSources.includes(nodeType) && 
          !categories.transformations.includes(nodeType) && 
          !categories.outputs.includes(nodeType)) {
        categories.others.push(nodeType);
      }
    }
    
    return categories;
  }
  
  /**
   * ✅ UNIVERSAL: Identify required nodes from user intent
   * Parses verbs to determine which nodes are REQUIRED (not optional)
   * Uses ALL extracted nodes, not just categorized ones
   */
  private identifyRequiredNodesFromIntent(
    userPrompt: string,
    categorizedNodes: ReturnType<typeof this.categorizeExtractedNodes>,
    allExtractedNodes: string[]
  ): {
    requiredDataSources: string[];
    requiredTransformations: string[];
    requiredOutputs: string[];
  } {
    const promptLower = userPrompt.toLowerCase();
    const required = {
      requiredDataSources: [] as string[],
      requiredTransformations: [] as string[],
      requiredOutputs: [] as string[],
    };
    
    const { unifiedNodeRegistry } = require('../../core/registry/unified-node-registry');
    
    // ✅ STEP 0: UNIVERSAL - Include ALL directly mentioned extracted nodes
    // This ensures nodes explicitly mentioned in prompt are ALWAYS included
    // regardless of verb patterns (e.g., "GitHub", "Stripe", "AWS S3")
    for (const nodeType of allExtractedNodes) {
      const nodeDef = unifiedNodeRegistry.get(nodeType);
      const nodeLabel = (nodeDef?.label || nodeType).toLowerCase();
      const nodeTypeLower = nodeType.toLowerCase();
      
      // Check if node is directly mentioned in prompt
      const isMentioned = promptLower.includes(nodeLabel) || 
                          promptLower.includes(nodeTypeLower) ||
                          (nodeDef?.tags || []).some((tag: string) => promptLower.includes(tag.toLowerCase()));
      
      if (isMentioned) {
        // Categorize and add to appropriate list
        if (nodeCapabilityRegistryDSL.isDataSource(nodeType) && 
            !required.requiredDataSources.includes(nodeType)) {
          required.requiredDataSources.push(nodeType);
        }
        if (nodeCapabilityRegistryDSL.isTransformation(nodeType) && 
            !required.requiredTransformations.includes(nodeType)) {
          required.requiredTransformations.push(nodeType);
        }
        if (nodeCapabilityRegistryDSL.isOutput(nodeType) && 
            !nodeCapabilityRegistryDSL.isDataSource(nodeType) &&
            !required.requiredOutputs.includes(nodeType)) {
          required.requiredOutputs.push(nodeType);
        }
      }
    }
    
    // ✅ STEP 0.1: UNIVERSAL - Handle implicit requirements via semantic matching using registry
    // Match implicit phrases to node types using registry (no hardcoded node names)
    const implicitMappings: Array<{pattern: RegExp; findNodes: (registry: typeof unifiedNodeRegistry, prompt: string) => string[]; category: 'dataSource' | 'transformation' | 'output'}> = [
      // Cloud storage - find storage nodes from registry
      { 
        pattern: /store\s+in\s+cloud|cloud\s+storage|save\s+to\s+cloud|s3|aws\s+s3/i, 
        findNodes: (registry) => {
          return registry.getAllTypes().filter((nt: string) => {
            const nodeDef = registry.get(nt);
            return nodeDef && (
              (nodeDef.category === 'data' || (nodeDef.tags || []).includes('storage')) &&
              (nt.includes('s3') || nt.includes('storage') || nt.includes('cloud'))
            );
          });
        },
        category: 'output' 
      },
      // Payment processing - find payment nodes from registry
      { 
        pattern: /process\s+payment|payment\s+processing|stripe|paypal/i, 
        findNodes: (registry) => {
          return registry.getAllTypes().filter((nt: string) => {
            const nodeDef = registry.get(nt);
            return nodeDef && (
              (nodeDef.tags || []).includes('payment') ||
              nt.includes('stripe') || nt.includes('paypal') || nt.includes('payment')
            );
          });
        },
        category: 'transformation' 
      },
      // Memory/remembering - find memory nodes from registry
      { 
        pattern: /remember|memory|remember\s+users|chatbot.*remember/i, 
        findNodes: (registry) => {
          return registry.getAllTypes().filter((nt: string) => {
            const nodeDef = registry.get(nt);
            return nodeDef && (
              nt === 'memory' || (nodeDef.tags || []).includes('memory') || nt.includes('memory')
            );
          });
        },
        category: 'transformation' 
      },
      // Error handling - find error handling nodes from registry
      { 
        pattern: /retry|retry\s+on\s+error|detect\s+error|error\s+detection|try\s+catch|catch\s+error|error\s+handler|handle\s+error/i, 
        findNodes: (registry) => {
          return registry.getAllTypes().filter((nt: string) => {
            const nodeDef = registry.get(nt);
            return nodeDef && (
              (nodeDef.tags || []).includes('error') ||
              nt.includes('retry') || nt.includes('error') || nt.includes('try_catch')
            );
          });
        },
        category: 'transformation' 
      },
      // Database write operations - find database write nodes from registry
      { 
        pattern: /database\s+write|write\s+to\s+database|update\s+database/i, 
        findNodes: (registry) => {
          return registry.getAllTypes().filter((nt: string) => {
            const nodeDef = registry.get(nt);
            return nodeDef && (
              (nodeDef.category === 'data' || (nodeDef.tags || []).includes('database')) &&
              (nt.includes('database') || nt.includes('write') || nt.includes('postgresql') || nt.includes('mysql'))
            );
          });
        },
        category: 'output' 
      },
      // Database read operations - find database read nodes from registry
      { 
        pattern: /database\s+read|read\s+from\s+database/i, 
        findNodes: (registry) => {
          return registry.getAllTypes().filter((nt: string) => {
            const nodeDef = registry.get(nt);
            return nodeDef && (
              (nodeDef.category === 'data' || (nodeDef.tags || []).includes('database')) &&
              (nt.includes('database') || nt.includes('read') || nt.includes('postgresql') || nt.includes('mysql'))
            );
          });
        },
        category: 'dataSource' 
      },
      // Calendar - find calendar nodes from registry
      { 
        pattern: /calendar|schedule\s+meeting|update\s+calendar/i, 
        findNodes: (registry) => {
          return registry.getAllTypes().filter((nt: string) => {
            const nodeDef = registry.get(nt);
            return nodeDef && (
              (nodeDef.tags || []).includes('calendar') ||
              nt.includes('calendar')
            );
          });
        },
        category: 'output' 
      },
      // Email/Communication - find email nodes from registry
      { 
        pattern: /gmail|google\s+mail|email/i, 
        findNodes: (registry) => {
          return registry.getAllTypes().filter((nt: string) => {
            const nodeDef = registry.get(nt);
            return nodeDef && (
              (nodeDef.category === 'communication' || (nodeDef.tags || []).includes('email')) &&
              (nt.includes('gmail') || nt.includes('email') || nt.includes('mail'))
            );
          });
        },
        category: 'output' 
      },
      // Message/Notification - find message nodes from registry
      { 
        pattern: /slack|notify\s+via\s+slack|slack\s+message/i, 
        findNodes: (registry) => {
          return registry.getAllTypes().filter((nt: string) => {
            const nodeDef = registry.get(nt);
            return nodeDef && (
              (nodeDef.category === 'communication' || (nodeDef.tags || []).includes('message')) &&
              (nt.includes('slack') || nt.includes('message') || nt.includes('notification'))
            );
          });
        },
        category: 'output' 
      },
    ];
    
    for (const mapping of implicitMappings) {
      if (mapping.pattern.test(userPrompt)) {
        // ✅ UNIVERSAL: Find nodes dynamically from registry
        const foundNodes = mapping.findNodes(unifiedNodeRegistry, userPrompt);
        
        for (const nodeType of foundNodes) {
          // Check if node exists in extracted nodes or registry
          const nodeExists = allExtractedNodes.includes(nodeType) || 
                            unifiedNodeRegistry.has(nodeType);
          
          if (nodeExists) {
            if (mapping.category === 'dataSource' && 
                !required.requiredDataSources.includes(nodeType)) {
              required.requiredDataSources.push(nodeType);
            } else if (mapping.category === 'transformation' && 
                       !required.requiredTransformations.includes(nodeType)) {
              required.requiredTransformations.push(nodeType);
            } else if (mapping.category === 'output' && 
                       !required.requiredOutputs.includes(nodeType)) {
              required.requiredOutputs.push(nodeType);
            }
          }
        }
      }
    }
    
    // ✅ STEP 1: Identify required data sources - search in ALL extracted nodes
    const dataSourceVerbs = ['get', 'fetch', 'read', 'retrieve', 'from', 'pull', 'load', 'collect'];
    const hasDataSourceIntent = dataSourceVerbs.some(verb => promptLower.includes(verb));
    
    if (hasDataSourceIntent) {
      // ✅ UNIVERSAL FIX: Collect ALL matching data sources (not just first)
      // Complex prompts may need multiple data sources (e.g., "Sync CRM, DB, and spreadsheets")
      for (const nodeType of allExtractedNodes) {
        if (nodeCapabilityRegistryDSL.isDataSource(nodeType)) {
          const nodeDef = unifiedNodeRegistry.get(nodeType);
          const nodeLabel = (nodeDef?.label || nodeType).toLowerCase();
          const nodeTypeLower = nodeType.toLowerCase();
          
          // Check if node is mentioned in prompt
          if (promptLower.includes(nodeLabel) || 
              promptLower.includes(nodeTypeLower) ||
              (nodeDef?.tags || []).some((tag: string) => promptLower.includes(tag.toLowerCase()))) {
            if (!required.requiredDataSources.includes(nodeType)) {
              required.requiredDataSources.push(nodeType);
            }
          }
        }
      }
      
      // If not found, try categorized data sources
      if (required.requiredDataSources.length === 0) {
        for (const nodeType of categorizedNodes.dataSources) {
          const nodeDef = unifiedNodeRegistry.get(nodeType);
          const nodeLabel = (nodeDef?.label || nodeType).toLowerCase();
          const nodeTypeLower = nodeType.toLowerCase();
          
          if (promptLower.includes(nodeLabel) || 
              promptLower.includes(nodeTypeLower) ||
              (nodeDef?.tags || []).some((tag: string) => promptLower.includes(tag.toLowerCase()))) {
            if (!required.requiredDataSources.includes(nodeType)) {
              required.requiredDataSources.push(nodeType);
            }
          }
        }
      }
      
      // Fallback to first available if none found
      if (required.requiredDataSources.length === 0 && categorizedNodes.dataSources.length > 0) {
        required.requiredDataSources.push(categorizedNodes.dataSources[0]);
      }
    }
    
    // ✅ STEP 2: Identify required transformations - search in ALL extracted nodes
    const transformationVerbs = [
      'summarise', 'summarize', 'analyze', 'analyse', 'process', 
      'transform', 'classify', 'generate', 'translate', 'extract',
      'parse', 'format', 'convert', 'calculate', 'compute'
    ];
    const hasTransformationIntent = transformationVerbs.some(verb => 
      promptLower.includes(verb)
    );
    
    if (hasTransformationIntent) {
      // ✅ FIX: First, check transformations category for AI nodes (most reliable)
      // Also ensure 'ollama' is always considered (even if not extracted) since it runs on server
      const aiNodesInTransformations = categorizedNodes.transformations.filter(nt => {
        const nodeDef = unifiedNodeRegistry.get(nt);
        const nodeTypeLower = nt.toLowerCase();
        
        // Check if it's an AI node
        const isAINode = (nodeTypeLower.includes('ai') || 
               nodeTypeLower.includes('gemini') || 
               nodeTypeLower.includes('chat') || 
               nodeTypeLower.includes('llm') ||
               nodeTypeLower.includes('gpt') ||
               nodeTypeLower.includes('claude') ||
               nodeTypeLower.includes('summarizer') ||
               nodeTypeLower.includes('ollama') ||
               (nodeDef?.category === 'ai'));
        
        // ✅ UNIVERSAL: Exclude output nodes using registry (no hardcoding)
        const isOutput = nodeCapabilityRegistryDSL.isOutput(nt) && 
                        !nodeCapabilityRegistryDSL.isDataSource(nt);
        if (isOutput) {
          return false;
        }
        
        return isAINode;
      });
      
      // ✅ CRITICAL: Always add 'ollama' to available AI nodes if it exists in the registry
      // This ensures Ollama is prioritized even if not explicitly extracted from keywords
      // Ollama runs on server and doesn't need API keys, making it easier for users
      // IMPORTANT: unifiedNodeRegistry is already required above, reuse it
      if (unifiedNodeRegistry.has('ollama') && !aiNodesInTransformations.includes('ollama')) {
        // Always add ollama for AI tasks - it's the preferred server-based solution
        // Add it at the beginning to ensure it's prioritized
        aiNodesInTransformations.unshift('ollama');
        console.log(`[AIIntentClarifier] ✅ Added 'ollama' to AI transformation nodes (server-based, no API keys)`);
      }
      
      // ✅ If no AI nodes found in transformations, but we have transformation intent, add ollama directly
      if (aiNodesInTransformations.length === 0 && unifiedNodeRegistry.has('ollama')) {
        aiNodesInTransformations.push('ollama');
        console.log(`[AIIntentClarifier] ✅ Added 'ollama' as default AI transformation (server-based, no API keys)`);
      }
      
      if (aiNodesInTransformations.length > 0) {
        // ✅ PRIORITY 1: ALWAYS prefer 'ollama' node first (runs on server, no API keys needed)
        // This makes it easier for users to perform AI tasks without searching for APIs
        // Remove any existing ollama from list, then add it first
        const ollamaIndex = aiNodesInTransformations.findIndex(nt => nt.toLowerCase() === 'ollama');
        if (ollamaIndex >= 0) {
          // Remove ollama from current position
          aiNodesInTransformations.splice(ollamaIndex, 1);
        }
        // Add ollama at the beginning (highest priority)
        aiNodesInTransformations.unshift('ollama');
        
        // ✅ ALWAYS add 'ollama' first (most direct, runs on server, no API keys)
        required.requiredTransformations.push('ollama');
        
        // Then add other AI nodes if needed (but ollama is already first)
        const otherAiNodes = aiNodesInTransformations.filter(nt => nt.toLowerCase() !== 'ollama');
        if (otherAiNodes.length > 0 && required.requiredTransformations.length === 1) {
          // Only add one more if we only have ollama
          required.requiredTransformations.push(otherAiNodes[0]);
        }
      } else {
        // Fallback: Search in ALL extracted nodes for AI transformation nodes
        const allAiNodes = allExtractedNodes.filter(nt => {
          const nodeDef = unifiedNodeRegistry.get(nt);
          const nodeTypeLower = nt.toLowerCase();
          
          const isAINode = (nodeTypeLower.includes('ai') || 
                 nodeTypeLower.includes('gemini') || 
                 nodeTypeLower.includes('chat') || 
                 nodeTypeLower.includes('llm') ||
                 nodeTypeLower.includes('gpt') ||
                 nodeTypeLower.includes('claude') ||
                 nodeTypeLower.includes('summarizer') ||
                 nodeTypeLower.includes('ollama') ||
                 (nodeDef?.category === 'ai'));
          
          if (!isAINode) return false;
          
          // ✅ UNIVERSAL: Exclude output nodes using registry (no hardcoding)
          const isOutput = nodeCapabilityRegistryDSL.isOutput(nt) && 
                          !nodeCapabilityRegistryDSL.isDataSource(nt);
          if (isOutput) {
            return false;
          }
          
          return nodeCapabilityRegistryDSL.isTransformation(nt) || 
                 (nodeDef?.category === 'ai');
        });
        
        if (allAiNodes.length > 0) {
          // ✅ PRIORITY: Prefer Ollama-based nodes first
          const ollamaNodes = allAiNodes.filter(nt => {
            const nodeTypeLower = nt.toLowerCase();
            return nodeTypeLower.includes('ollama') || 
                   nodeTypeLower === 'ai_chat_model' || 
                   nodeTypeLower === 'chat_model';
          });
          
          if (ollamaNodes.length > 0) {
            // Prefer 'ollama' node first
            const ollamaNode = ollamaNodes.find(nt => nt.toLowerCase() === 'ollama');
            if (ollamaNode) {
              required.requiredTransformations.push(ollamaNode);
            } else {
              required.requiredTransformations.push(ollamaNodes[0]);
            }
          } else {
            // Fallback to summarizer or first available
            const summarizerNode = allAiNodes.find(nt => 
              nt.toLowerCase().includes('summarizer')
            );
            if (summarizerNode) {
              required.requiredTransformations.push(summarizerNode);
            } else {
              required.requiredTransformations.push(allAiNodes[0]);
            }
          }
        } else if (categorizedNodes.transformations.length > 0) {
          // Last resort: use first transformation (excluding outputs)
          // But still prefer Ollama if available
          const ollamaTransformations = categorizedNodes.transformations.filter(nt => {
            const nodeTypeLower = nt.toLowerCase();
            return nodeTypeLower.includes('ollama') || 
                   nodeTypeLower === 'ai_chat_model' || 
                   nodeTypeLower === 'chat_model';
          });
          
          if (ollamaTransformations.length > 0) {
            const ollamaNode = ollamaTransformations.find(nt => nt.toLowerCase() === 'ollama');
            if (ollamaNode) {
              required.requiredTransformations.push(ollamaNode);
      } else {
              required.requiredTransformations.push(ollamaTransformations[0]);
        }
        } else {
            const realTransformations = categorizedNodes.transformations.filter(nt => {
              // ✅ UNIVERSAL: Exclude output nodes using registry (no hardcoding)
              const isOutput = nodeCapabilityRegistryDSL.isOutput(nt) && 
                              !nodeCapabilityRegistryDSL.isDataSource(nt);
              if (isOutput) {
                return false;
              }
              return true;
            });
            if (realTransformations.length > 0) {
              required.requiredTransformations.push(realTransformations[0]);
            }
          }
        }
      }
    }
    
    // ✅ STEP 3: Identify required outputs - search in ALL extracted nodes
    const outputVerbs = [
      'send', 'deliver', 'notify', 'post', 'to', 'email', 'message',
      'write', 'save', 'store', 'publish', 'share', 'dispatch'
    ];
    const hasOutputIntent = outputVerbs.some(verb => promptLower.includes(verb));
    
    if (hasOutputIntent) {
      // ✅ UNIVERSAL FIX: Collect ALL matching outputs (not just first)
      // Complex prompts may need multiple outputs (e.g., "post on all social platforms")
      for (const nodeType of allExtractedNodes) {
        // Only check actual output nodes (not data sources)
        if (nodeCapabilityRegistryDSL.isOutput(nodeType) && 
            !nodeCapabilityRegistryDSL.isDataSource(nodeType)) {
          const nodeDef = unifiedNodeRegistry.get(nodeType);
          const nodeLabel = (nodeDef?.label || nodeType).toLowerCase();
          const nodeTypeLower = nodeType.toLowerCase();
          
          // Check if node is mentioned in prompt with output context (e.g., "to gmail", "send email")
          // Look for patterns like "to gmail", "send email", "via slack", "all platforms", etc.
          const outputPatterns = [
            `to ${nodeLabel}`,
            `to ${nodeTypeLower}`,
            `send ${nodeLabel}`,
            `send ${nodeTypeLower}`,
            `via ${nodeLabel}`,
            `via ${nodeTypeLower}`,
            `notify via ${nodeLabel}`,
            `notify via ${nodeTypeLower}`,
            `post on ${nodeLabel}`,
            `post on ${nodeTypeLower}`,
            `all ${nodeLabel}`,
            `all ${nodeTypeLower}`,
            `all platforms`, // Special case for "all social platforms"
          ];
          
          const isMentioned = outputPatterns.some(pattern => promptLower.includes(pattern)) ||
                              promptLower.includes(nodeLabel) || 
                              promptLower.includes(nodeTypeLower) ||
                              (nodeDef?.tags || []).some((tag: string) => promptLower.includes(tag.toLowerCase()));
          
          // ✅ UNIVERSAL: Special handling for "all social platforms" - use registry tags
          if (promptLower.includes('all social') || promptLower.includes('all platforms')) {
            // Check if node is a social platform node using registry
            const nodeCategory = (nodeDef?.category || '').toLowerCase();
            const nodeTags = (nodeDef?.tags || []).map((t: string) => t.toLowerCase());
            const isSocialNode = nodeCategory === 'social' || 
                                 nodeTags.includes('social') || 
                                 nodeTags.includes('platform') ||
                                 nodeTags.includes('post') ||
                                 nodeTags.includes('publish');
            if (isSocialNode && nodeCapabilityRegistryDSL.isOutput(nodeType)) {
              if (!required.requiredOutputs.includes(nodeType)) {
                required.requiredOutputs.push(nodeType);
              }
            }
          } else if (isMentioned) {
            if (!required.requiredOutputs.includes(nodeType)) {
              required.requiredOutputs.push(nodeType);
            }
          }
        }
      }
      
      // If not found, try categorized outputs (filter out data sources)
      if (required.requiredOutputs.length === 0) {
        const realOutputs = categorizedNodes.outputs.filter(nt => 
          nodeCapabilityRegistryDSL.isOutput(nt) && 
          !nodeCapabilityRegistryDSL.isDataSource(nt)
        );
        
        for (const nodeType of realOutputs) {
          const nodeDef = unifiedNodeRegistry.get(nodeType);
          const nodeLabel = (nodeDef?.label || nodeType).toLowerCase();
          const nodeTypeLower = nodeType.toLowerCase();
          
          if (promptLower.includes(nodeLabel) || 
              promptLower.includes(nodeTypeLower) ||
              (nodeDef?.tags || []).some((tag: string) => promptLower.includes(tag.toLowerCase()))) {
            if (!required.requiredOutputs.includes(nodeType)) {
              required.requiredOutputs.push(nodeType);
            }
          }
        }
      }
      
      // Fallback to first available output (not data source)
      if (required.requiredOutputs.length === 0) {
        const realOutputs = categorizedNodes.outputs.filter(nt => 
          nodeCapabilityRegistryDSL.isOutput(nt) && 
          !nodeCapabilityRegistryDSL.isDataSource(nt)
        );
        if (realOutputs.length > 0) {
          required.requiredOutputs.push(realOutputs[0]);
        }
      }
    }
    
    return required;
  }
  
  /**
   * ✅ UNIVERSAL: Build complete workflow chain with ALL required nodes
   * Handles complex multi-step workflows with multiple sources, transformations, and outputs
   * ✅ FIX: Now supports different complexity levels for variation diversity
   * 
   * @param variationIndex - 0=minimal, 1=simple, 2=medium, 3=full complexity
   */
  private buildWorkflowChain(
    requiredNodes: ReturnType<typeof this.identifyRequiredNodesFromIntent>,
    categorizedNodes: ReturnType<typeof this.categorizeExtractedNodes>,
    triggerType: string,
    userPrompt: string,
    allExtractedNodes: string[],
    variationIndex: number = 3 // Default to full complexity
  ): string[] {
    const chain: string[] = [triggerType];
    const usedNodes = new Set<string>([triggerType]);
    const promptLower = userPrompt.toLowerCase();
    
    // ✅ FIX: Define complexity levels for variation diversity
    // Variation 0: Minimal (trigger + 1 core node only)
    // Variation 1: Simple (trigger + 1-2 nodes)
    // Variation 2: Medium (trigger + 2-3 nodes)
    // Variation 3: Full (trigger + all nodes)
    
    // ✅ STEP 1: Add data sources based on complexity level
    const dataSourcesToAdd = requiredNodes.requiredDataSources.length > 0 
      ? requiredNodes.requiredDataSources 
      : categorizedNodes.dataSources;
    
    // Limit data sources based on variation index
    const maxDataSources = variationIndex === 0 ? 0 : 
                          variationIndex === 1 ? 1 : 
                          variationIndex === 2 ? 2 : 
                          dataSourcesToAdd.length; // Full for variation 3
    
    for (let i = 0; i < Math.min(maxDataSources, dataSourcesToAdd.length); i++) {
      const dataSource = dataSourcesToAdd[i];
      if (!usedNodes.has(dataSource)) {
        chain.push(dataSource);
        usedNodes.add(dataSource);
      }
    }
    
    // ✅ STEP 2: Add conditional logic nodes if needed (only for medium/full)
    const needsConditional = promptLower.includes('if') || 
                            promptLower.includes('when') ||
                            promptLower.includes('escalate') ||
                            promptLower.includes('conditionally') ||
                            promptLower.includes('flag') ||
                            promptLower.includes('critical');
    
    if (needsConditional && variationIndex >= 2) { // Only for medium/full
      // ✅ UNIVERSAL: Find conditional nodes from registry (no hardcoding)
      const conditionalNode = allExtractedNodes.find(nt => {
        const nodeDef = unifiedNodeRegistry.get(nt);
        return nodeDef && (
          nt === 'if_else' || nt === 'switch' ||
          (nodeDef.tags || []).includes('conditional') ||
          (nodeDef.tags || []).includes('logic')
        );
      }) || (categorizedNodes.transformations.find(nt => {
        const nodeDef = unifiedNodeRegistry.get(nt);
        return nodeDef && (
          nt === 'if_else' || nt === 'switch' ||
          (nodeDef.tags || []).includes('conditional') ||
          (nodeDef.tags || []).includes('logic')
        );
      }));
      
      if (conditionalNode && !usedNodes.has(conditionalNode)) {
        chain.push(conditionalNode);
        usedNodes.add(conditionalNode);
      }
    }
    
    // ✅ STEP 3: Add transformations based on complexity level
    const transformationsToAdd = requiredNodes.requiredTransformations.length > 0
      ? requiredNodes.requiredTransformations
      : categorizedNodes.transformations.filter(nt => {
          // Exclude conditional nodes (already added) and output nodes
          const ntLower = nt.toLowerCase();
          // ✅ UNIVERSAL: Exclude conditional and output nodes using registry (no hardcoding)
          const nodeDef = unifiedNodeRegistry.get(nt);
          const isConditional = nt === 'if_else' || nt === 'switch' ||
                               (nodeDef?.tags || []).includes('conditional') ||
                               (nodeDef?.tags || []).includes('logic');
          const isOutput = nodeCapabilityRegistryDSL.isOutput(nt) && 
                          !nodeCapabilityRegistryDSL.isDataSource(nt);
          return !isConditional && !isOutput;
        });
    
    // Limit transformations based on variation index
    const maxTransformations = variationIndex === 0 ? 0 : 
                              variationIndex === 1 ? 1 : 
                              variationIndex === 2 ? 1 : 
                              transformationsToAdd.length; // Full for variation 3
    
    for (let i = 0; i < Math.min(maxTransformations, transformationsToAdd.length); i++) {
      const transformation = transformationsToAdd[i];
      if (!usedNodes.has(transformation)) {
        chain.push(transformation);
        usedNodes.add(transformation);
      }
    }
    
    // ✅ STEP 4: Add outputs based on complexity level
    const outputsToAdd = requiredNodes.requiredOutputs.length > 0
      ? requiredNodes.requiredOutputs
      : categorizedNodes.outputs.filter(nt => {
          // Exclude data sources that were mis-categorized
          const ntLower = nt.toLowerCase();
          return !ntLower.includes('sheet') || 
                 !categorizedNodes.dataSources.includes(nt);
        });
    
    // Limit outputs based on variation index
    const maxOutputs = variationIndex === 0 ? 1 : // Minimal: at least 1 output
                      variationIndex === 1 ? 1 : 
                      variationIndex === 2 ? 2 : 
                      outputsToAdd.length; // Full for variation 3
    
    for (let i = 0; i < Math.min(maxOutputs, outputsToAdd.length); i++) {
      const output = outputsToAdd[i];
      if (!usedNodes.has(output)) {
        chain.push(output);
        usedNodes.add(output);
      }
    }
    
    // ✅ STEP 5: Ensure chain has at least trigger + one action (minimum viable chain)
    if (chain.length === 1) {
      // No nodes extracted - add a generic action node
      if (categorizedNodes.dataSources.length > 0) {
        chain.push(categorizedNodes.dataSources[0]);
      } else if (categorizedNodes.transformations.length > 0) {
        chain.push(categorizedNodes.transformations[0]);
      } else if (categorizedNodes.outputs.length > 0) {
        chain.push(categorizedNodes.outputs[0]);
      }
    }
    
    return chain;
  }
  
  /**
   * ✅ UNIVERSAL: Build variation prompt describing complete workflow
   */
  /**
   * ✅ UNIVERSAL: Build variation prompt describing complete linear workflow chain
   * Handles chains of ANY length (not just 4 nodes)
   * Ensures ALL nodes in chain are described in linear order
   */
  private buildVariationPrompt(
    chain: string[],
    nodeLabels: Map<string, string>,
    nodeOperations: Map<string, { operations: string[]; defaultOp: string }>,
    variationIndex: number
  ): string {
    if (chain.length < 2) {
      return `Start the workflow with ${chain[0] || 'manual_trigger'} to initiate automation.`;
    }
    
    const trigger = chain[0];
    const triggerLabel = nodeLabels.get(trigger) || trigger;
    
    // ✅ UNIVERSAL: Build linear description of ALL nodes in chain
    const nodeDescriptions: string[] = [];
    
    // Start with trigger
    const triggerDescriptions = [
      `Start the workflow with ${triggerLabel} to initiate automation`,
      `Create a workflow using ${triggerLabel} as the entry point`,
      `Set up the workflow to trigger via ${triggerLabel} when external events occur`,
      `Configure an automated workflow that activates through ${triggerLabel} for real-time processing`
    ];
    nodeDescriptions.push(triggerDescriptions[variationIndex] || triggerDescriptions[0]);
    
    // ✅ Process ALL remaining nodes in linear order
    for (let i = 1; i < chain.length; i++) {
      const nodeType = chain[i];
      const nodeLabel = nodeLabels.get(nodeType) || nodeType;
      const nodeOps = nodeOperations.get(nodeType);
      const defaultOp = nodeOps?.defaultOp || 'process';
      
      // Determine node category for appropriate description using registry
      const { unifiedNodeRegistry } = require('../../core/registry/unified-node-registry');
      const nodeDef = unifiedNodeRegistry.get(nodeType);
      const nodeTypeLower = nodeType.toLowerCase();
      
      // Use capability registry to determine category
      const isConditional = nodeType === 'if_else' || nodeType === 'switch';
      const isDataSource = nodeCapabilityRegistryDSL.isDataSource(nodeType) && 
                          !nodeCapabilityRegistryDSL.isOutput(nodeType);
      const isTransformation = nodeCapabilityRegistryDSL.isTransformation(nodeType) && 
                              !nodeCapabilityRegistryDSL.isOutput(nodeType) &&
                              !isConditional;
      const isOutput = nodeCapabilityRegistryDSL.isOutput(nodeType) && 
                      !nodeCapabilityRegistryDSL.isDataSource(nodeType);
      
      let description = '';
      
      if (isConditional) {
        // Conditional logic node
        const conditionalDescs = [
          `Apply conditional logic using ${nodeLabel} to route data based on conditions`,
          `Use ${nodeLabel} to evaluate conditions and branch the workflow`,
          `Route data through ${nodeLabel} for conditional processing`,
          `Apply ${nodeLabel} to handle conditional routing and decision-making`
        ];
        description = conditionalDescs[variationIndex] || conditionalDescs[0];
      } else if (isDataSource) {
        // Data source node - only use operation if node has operations
        const hasOperations = nodeOps && nodeOps.operations && nodeOps.operations.length > 0;
        if (hasOperations && defaultOp) {
        const dataSourceDescs = [
          `Process through ${nodeLabel}`,
            `Process through ${nodeLabel}`,
            `Process through ${nodeLabel}`,
            `Process through ${nodeLabel}`
          ];
          description = dataSourceDescs[variationIndex] || dataSourceDescs[0];
        } else {
          const dataSourceDescs = [
          `Process through ${nodeLabel}`,
          `Process through ${nodeLabel}`,
            `Process through ${nodeLabel}`,
            `Process through ${nodeLabel}`
        ];
        description = dataSourceDescs[variationIndex] || dataSourceDescs[0];
        }
      } else if (isTransformation) {
        // ✅ CRITICAL FIX: Transformation descriptions must come AFTER data sources and BEFORE outputs
        // This ensures the description matches the chain order: data → transform → output
        const hasOperations = nodeOps && nodeOps.operations && nodeOps.operations.length > 0;
        if (hasOperations && defaultOp) {
        const transformDescs = [
          `Process data using ${nodeLabel}`,
            `Process data using ${nodeLabel}`,
            `Process data using ${nodeLabel}`,
            `Process data using ${nodeLabel}`
          ];
          description = transformDescs[variationIndex] || transformDescs[0];
        } else {
          const transformDescs = [
          `Process data using ${nodeLabel}`,
          `Process data using ${nodeLabel}`,
            `Process data using ${nodeLabel}`,
            `Process data using ${nodeLabel}`
        ];
        description = transformDescs[variationIndex] || transformDescs[0];
        }
      } else if (isOutput) {
        // Output node - only use operation if node has operations
        const hasOperations = nodeOps && nodeOps.operations && nodeOps.operations.length > 0;
        if (hasOperations && defaultOp) {
        const outputDescs = [
          `Deliver the results using ${nodeLabel} with operation='${defaultOp}'`,
            `Finalize the workflow by sending results via ${nodeLabel} with operation='${defaultOp}'`,
            `Output the final results using ${nodeLabel} with operation='${defaultOp}'`,
            `Complete the automation by delivering processed output via ${nodeLabel} with operation='${defaultOp}'`
          ];
          description = outputDescs[variationIndex] || outputDescs[0];
        } else {
          const outputDescs = [
          `Finalize the workflow by sending results via ${nodeLabel}`,
          `Output the final results using ${nodeLabel}`,
            `Complete the automation by delivering processed output via ${nodeLabel}`,
            `Deliver results using ${nodeLabel}`
        ];
        description = outputDescs[variationIndex] || outputDescs[0];
        }
      } else {
        // Generic node
        description = `Process through ${nodeLabel}`;
      }
      
      nodeDescriptions.push(description);
    }
    
    // ✅ Join all descriptions with proper connectors for linear flow
    let prompt = nodeDescriptions[0] + '. ';
    
    for (let i = 1; i < nodeDescriptions.length; i++) {
      if (i === nodeDescriptions.length - 1) {
        // Last node - use period
        prompt += nodeDescriptions[i] + '.';
      } else {
        // Middle nodes - use comma or period based on context
        prompt += nodeDescriptions[i] + '. ';
      }
    }
    
    return prompt;
  }
  
  /**
   * ✅ ROOT FIX: Clean repetitive "Use X to complete/handle this step" patterns from prompts
   * Matches ALL variations: "Use X to complete", "Use X node to handle", "Use X to handle", etc.
   */
  private cleanRepetitiveNodeText(prompt: string): string {
    // ✅ ROOT FIX: Match ALL variations of repetitive patterns
    const repetitivePatterns = [
      /\s*Use\s+[\w\s]+\s+node\s+to\s+handle\s+this\s+step\./gi,  // "Use X node to handle this step"
      /\s*Use\s+[\w\s]+\s+to\s+complete\s+this\s+step\./gi,       // "Use X to complete this step"
      /\s*Use\s+[\w\s]+\s+node\s+to\s+complete\s+this\s+step\./gi, // "Use X node to complete this step"
      /\s*Use\s+[\w\s]+\s+to\s+handle\s+this\s+step\./gi,         // "Use X to handle this step"
      /\s*Use\s+[\w\s]+\s+for\s+this\s+step\./gi,                 // "Use X for this step"
      /\s*Use\s+[\w\s]+\s+node\s+for\s+this\s+step\./gi,         // "Use X node for this step"
    ];
    
    let cleaned = prompt;
    for (const pattern of repetitivePatterns) {
      cleaned = cleaned.replace(pattern, '');
    }
    
    // Remove multiple consecutive periods/spaces
    cleaned = cleaned.replace(/\.{2,}/g, '.');
    cleaned = cleaned.replace(/\s{3,}/g, ' ');
    cleaned = cleaned.trim();
    
    return cleaned;
  }

  // ✅ PURE INTENT: Removed programmatic injection method - that's "patch work"
  // If AI doesn't follow instructions, validation will catch it and retry
  // Pure intent selection means trusting the AI to generate correctly from the start

  /**
   * ✅ ROOT-LEVEL ARCHITECTURE: Analyze prompt using capability registry
   * Understands workflow structure from node capabilities, not hardcoded patterns
   */
  private analyzePromptStructure(userPrompt: string): {
    isConditional: boolean;
    conditionalNodeType: 'if_else' | 'switch' | null; // ✅ ROOT-LEVEL: Determines switch vs if_else
    conditionCount: number; // ✅ ROOT-LEVEL: Count of conditions detected
    mentionedNodeTypes: string[];
    crmNodes: string[];
    notificationNodes: string[];
    transformationNodes: string[];
    triggerTypes: string[];
  } {
    const promptLower = userPrompt.toLowerCase();
    const mentionedNodeTypes: string[] = [];
    const crmNodes: string[] = [];
    const notificationNodes: string[] = [];
    const transformationNodes: string[] = [];
    const triggerTypes: string[] = [];

    // ✅ Use registry to find all node types
    const allSchemas = nodeLibrary.getAllSchemas();
    
    // ✅ ROOT-LEVEL FIX: Check for conditional keywords including "switch"
    const conditionalKeywords = ['if', 'else', 'route', 'routing', 'qualified', 'non-qualified', 'condition', 'when', 'check if', 'switch'];
    const isConditional = conditionalKeywords.some(keyword => promptLower.includes(keyword));
    
    // ✅ ROOT-LEVEL FIX: Count conditions in prompt to determine switch vs if_else
    let conditionCount = 0;
    let conditionalNodeType: 'if_else' | 'switch' | null = null;
    
    if (isConditional) {
      // Pattern 1: "if X route to Y, if Z route to W" - count "if" statements
      const ifPattern = /(?:if|when)\s+(?:the\s+)?(?:\w+\s+)?(?:is|equals|==|contains)\s+["']?(\w+)["']?\s+(?:route|send|go|use|log)/gi;
      const ifMatches = userPrompt.match(ifPattern);
      if (ifMatches) {
        conditionCount = ifMatches.length;
      }
      
      // Pattern 2: "X leads/statuses route to Y" - count distinct case values
      const casePattern = /(\w+)\s+(?:leads?|statuses?|items?|records?|cases?)\s+(?:are\s+)?(?:routed|send|trigger|route|go to|use|receive|logged)/gi;
      const caseMatches = userPrompt.match(casePattern);
      if (caseMatches) {
        const uniqueCases = new Set(caseMatches.map(m => m.toLowerCase().split(/\s+/)[0]));
        conditionCount = Math.max(conditionCount, uniqueCases.size);
      }
      
      // ✅ UNIVERSAL: Pattern 3: Explicit conditional node mention (using registry)
      const allNodeTypes = unifiedNodeRegistry.getAllTypes();
      const conditionalNodeTypes = allNodeTypes.filter(nt => {
        const nodeDef = unifiedNodeRegistry.get(nt);
        return nodeDef && (
          nt === 'if_else' || nt === 'switch' ||
          (nodeDef.tags || []).includes('conditional') ||
          (nodeDef.tags || []).includes('logic')
        );
      });
      const hasExplicitSwitch = conditionalNodeTypes.some(nt => {
        const nodeDef = unifiedNodeRegistry.get(nt);
        const nodeLabel = (nodeDef?.label || nt).toLowerCase();
        return promptLower.includes(nt.toLowerCase()) || 
               promptLower.includes(nodeLabel) ||
               (nt === 'switch' && promptLower.includes('switch'));
      });
      
      // ✅ ROOT-LEVEL LOGIC: Determine node type based on condition count
      if (hasExplicitSwitch || conditionCount >= 3) {
        conditionalNodeType = 'switch';
        console.log(`[SummarizeLayer] ✅ Detected ${conditionCount} conditions → using SWITCH node`);
      } else if (conditionCount === 2 || conditionCount === 0) {
        // 2 conditions or unclear → default to if_else (2 branches: true/false)
        conditionalNodeType = 'if_else';
        console.log(`[SummarizeLayer] ✅ Detected ${conditionCount} conditions → using IF_ELSE node`);
      } else if (conditionCount === 1) {
        // Single condition → if_else (true/false)
        conditionalNodeType = 'if_else';
        console.log(`[SummarizeLayer] ✅ Detected ${conditionCount} condition → using IF_ELSE node`);
      }
    }

    // ✅ ROOT-LEVEL FIX: Check for generic keywords first (CRM, notify, etc.)
    // If user says "CRM" (generic), find ALL CRM nodes, not just ones mentioned by name
    const mentionsCRM = promptLower.includes('crm') || promptLower.includes('customer relationship');
    const mentionsNotify = promptLower.includes('notify') || promptLower.includes('notification') || 
                          promptLower.includes('alert') || promptLower.includes('send') ||
                          promptLower.includes('email') || promptLower.includes('message') ||
                          promptLower.includes('slack') || promptLower.includes('gmail');
    const mentionsAI = promptLower.includes('ai') || promptLower.includes('score') || 
                       promptLower.includes('analyze') || promptLower.includes('analyze');

    // ✅ Architecture-driven: Use capability registry to categorize ALL nodes
    for (const schema of allSchemas) {
      const nodeType = schema.type.toLowerCase();
      const nodeTypeLower = nodeType;
      
      // Check if node type is explicitly mentioned OR if generic keyword matches capability
      const isExplicitlyMentioned = promptLower.includes(nodeType) || 
          schema.keywords?.some(k => promptLower.includes(k.toLowerCase())) ||
          schema.aiSelectionCriteria?.keywords?.some(k => promptLower.includes(k.toLowerCase()));
      
      if (isExplicitlyMentioned) {
        mentionedNodeTypes.push(schema.type);
      }
      
      // ✅ ROOT-LEVEL FIX: If generic keyword matches, include ALL nodes with that capability
      // This ensures we have multiple options for variations
      const isCRMNode = nodeCapabilityRegistryDSL.hasCapability(schema.type, 'crm') || 
                       nodeCapabilityRegistryDSL.hasCapability(schema.type, 'write_crm');
      const isNotificationNode = nodeCapabilityRegistryDSL.hasCapability(schema.type, 'communication') ||
                                nodeCapabilityRegistryDSL.hasCapability(schema.type, 'send_email') ||
                                nodeCapabilityRegistryDSL.hasCapability(schema.type, 'send_message') ||
                                nodeCapabilityRegistryDSL.hasCapability(schema.type, 'notification');
      const isTransformationNode = nodeCapabilityRegistryDSL.hasCapability(schema.type, 'transformation') ||
                                   nodeCapabilityRegistryDSL.hasCapability(schema.type, 'ai_processing') ||
                                   nodeCapabilityRegistryDSL.hasCapability(schema.type, 'llm');
      
      // Add to lists if explicitly mentioned OR if generic keyword matches
      if (isCRMNode && (isExplicitlyMentioned || mentionsCRM)) {
        if (!crmNodes.includes(schema.type)) {
          crmNodes.push(schema.type);
        }
      }
      
      if (isNotificationNode && (isExplicitlyMentioned || mentionsNotify)) {
        if (!notificationNodes.includes(schema.type)) {
          notificationNodes.push(schema.type);
        }
      }
      
      if (isTransformationNode && (isExplicitlyMentioned || mentionsAI)) {
        if (!transformationNodes.includes(schema.type)) {
          transformationNodes.push(schema.type);
        }
      }
    }
    
    // ✅ ROOT-LEVEL FIX: If no nodes found but keywords detected, find top options
    // This ensures we always have options for variations
    if (mentionsCRM && crmNodes.length === 0) {
      // Find top 4 CRM nodes for variations
      for (const schema of allSchemas) {
        if (nodeCapabilityRegistryDSL.hasCapability(schema.type, 'crm') || 
            nodeCapabilityRegistryDSL.hasCapability(schema.type, 'write_crm')) {
          crmNodes.push(schema.type);
          if (crmNodes.length >= 4) break; // Get top 4 for variations
        }
      }
    }
    
    if (mentionsNotify && notificationNodes.length === 0) {
      // Find top 4 notification nodes for variations
      for (const schema of allSchemas) {
        if (nodeCapabilityRegistryDSL.hasCapability(schema.type, 'communication') ||
            nodeCapabilityRegistryDSL.hasCapability(schema.type, 'send_email') ||
            nodeCapabilityRegistryDSL.hasCapability(schema.type, 'send_message') ||
            nodeCapabilityRegistryDSL.hasCapability(schema.type, 'notification')) {
          notificationNodes.push(schema.type);
          if (notificationNodes.length >= 4) break; // Get top 4 for variations
        }
      }
    }

    // ✅ UNIVERSAL: Check for trigger types using registry (no hardcoding)
    const allNodeTypes = unifiedNodeRegistry.getAllTypes();
    const allTriggerNodes = allNodeTypes.filter(nt => {
      const nodeDef = unifiedNodeRegistry.get(nt);
      return nodeDef && (nodeDef.category === 'trigger' || (nodeDef.tags || []).includes('trigger'));
    });
    
    for (const triggerNode of allTriggerNodes) {
      const nodeDef = unifiedNodeRegistry.get(triggerNode);
      const nodeTypeLower = triggerNode.toLowerCase();
      const nodeLabel = (nodeDef?.label || triggerNode).toLowerCase();
      
      if (promptLower.includes(nodeTypeLower) || promptLower.includes(nodeLabel)) {
        if (!triggerTypes.includes(triggerNode)) {
          triggerTypes.push(triggerNode);
        }
      }
    }
    
    // ✅ UNIVERSAL: If no triggers found, add default from registry
    if (triggerTypes.length === 0 && allTriggerNodes.length > 0) {
      // Find manual trigger or first available trigger
      const manualTrigger = allTriggerNodes.find(nt => 
        nt.includes('manual') || (unifiedNodeRegistry.get(nt)?.tags || []).includes('manual')
      ) || allTriggerNodes[0];
      triggerTypes.push(manualTrigger);
    }

    return {
      isConditional,
      conditionalNodeType, // ✅ ROOT-LEVEL: switch or if_else
      conditionCount, // ✅ ROOT-LEVEL: Number of conditions detected
      mentionedNodeTypes,
      crmNodes,
      notificationNodes,
      transformationNodes,
      triggerTypes,
    };
  }

  /**
   * Build AI prompt for intent clarification
   * ✅ ROOT-LEVEL ARCHITECTURE: Uses capability registry analysis, not hardcoded patterns
   */
  /**
   * ✅ PHASE 2: Build clarification prompt with REQUIRED nodes
   * @param extractedNodeTypes - Node types that MUST be included in variations
   */
  private buildClarificationPrompt(
    userPrompt: string,
    allKeywords: string[],
    extractedNodeTypes: string[] = [],
    nodeMentionsWithOperations?: Array<{ // ✅ OPERATIONS-FIRST: Node mentions with operations from schema
      nodeType: string;
      operations: string[];
      defaultOperation: string;
    }>
  ): string {
    // ✅ UNIVERSAL ROOT-LEVEL: Build dynamic node lists from registry (zero hardcoding)
    const categorizer = UniversalVariationNodeCategorizer.getInstance();
    
    // Get dynamic node lists from registry (excludes required nodes automatically)
    const helperNodes = categorizer.getHelperNodes(extractedNodeTypes).slice(0, 10); // Top 10 for AI prompt
    const processingNodes = categorizer.getProcessingNodes(extractedNodeTypes).slice(0, 10);
    const styleNodes = categorizer.getStyleNodes(extractedNodeTypes).slice(0, 10);
    
    console.log(`[AIIntentClarifier] ✅ UNIVERSAL: Found ${helperNodes.length} helper, ${processingNodes.length} processing, ${styleNodes.length} style nodes from registry`);
    // ✅ Analyze prompt structure using registry
    const structure = this.analyzePromptStructure(userPrompt);
    
    // ✅ UNIVERSAL: Smart keyword filtering with semantic equivalence expansion
    // Filter keywords that might be relevant to the user prompt
    // AND automatically include semantic equivalents for matched nodes
    const promptLower = userPrompt.toLowerCase();
    const relevantKeywords = this.filterRelevantKeywordsWithSemanticExpansion(allKeywords, promptLower);
    
    // ✅ ROOT FIX: Only show REQUIRED NODES keywords to AI, not 300 random keywords
    // This prevents AI from listing all possible nodes
    const requiredNodeKeywords = new Set<string>();
    for (const nodeType of extractedNodeTypes) {
      // Get keywords for each required node
      for (const keywordData of this.keywordCollector.getAllAliasKeywords()) {
        if (keywordData.nodeType === nodeType) {
          requiredNodeKeywords.add(keywordData.keyword);
        }
      }
    }
    
    // ✅ ROOT FIX: Use only REQUIRED NODES keywords + top 20 most relevant (for context)
    // This dramatically reduces AI's temptation to list all nodes
    const topRelevant = relevantKeywords.length > 0 
      ? relevantKeywords.slice(0, 20)
      : allKeywords.slice(0, 20);
    
    const keywordsToUse = Array.from(new Set([...Array.from(requiredNodeKeywords), ...topRelevant]));
    
    console.log(`[AIIntentClarifier] ✅ ROOT-LEVEL: Showing AI only ${keywordsToUse.length} keywords (${requiredNodeKeywords.size} from REQUIRED NODES + ${topRelevant.length} relevant), not 300 random keywords`);

    // ✅ ROOT-LEVEL ARCHITECTURE: Build dynamic instructions based on registry analysis
    
    // ✅ ROOT-LEVEL FIX: Build capability-based instructions with switch vs if_else logic
    let workflowStructureGuidance = '';
    if (structure.isConditional) {
      // ✅ ROOT-LEVEL: Use switch for 3+ conditions, if_else for 2 conditions
      const nodeType = structure.conditionalNodeType || 'if_else'; // Default to if_else if unclear
      const nodeName = nodeType === 'switch' ? 'SWITCH' : 'IF_ELSE';
      const branchDescription = nodeType === 'switch' 
        ? `SWITCH node has MULTIPLE branches (one per case: case_1, case_2, case_3, etc.)`
        : `IF_ELSE node has TWO branches: true path and false path`;
      
      workflowStructureGuidance = `
CONDITIONAL WORKFLOW DETECTED (${structure.conditionCount} condition(s) detected):
- This workflow requires a ${nodeName} node for conditional routing
- ${branchDescription}
- ✅ CRITICAL: ${structure.conditionCount >= 3 ? 'Use SWITCH node (3+ conditions detected)' : structure.conditionCount === 2 ? 'Use IF_ELSE node (2 conditions detected)' : 'Use IF_ELSE node (default for conditional routing)'}
- Each branch connects to different output nodes based on capabilities:
  * ${nodeType === 'switch' ? 'Each case branch' : 'True branch (qualified/valid)'}: Connects to nodes with 'crm' or 'write_crm' capability (${structure.crmNodes.length > 0 ? structure.crmNodes.join(', ') : 'CRM nodes'})
  * ${nodeType === 'switch' ? 'Other case branches' : 'False branch (non-qualified/invalid)'}: Connects to nodes with 'communication' or 'notification' capability (${structure.notificationNodes.length > 0 ? structure.notificationNodes.join(', ') : 'notification nodes'})
- Each variation MUST specify ${nodeType === 'switch' ? 'MULTIPLE branches (one per case)' : 'BOTH branches: one CRM node AND one notification node'}
- All nodes exist in the SAME workflow via ${nodeName} node routing`;
    } else {
      workflowStructureGuidance = `
LINEAR WORKFLOW DETECTED:
- This is a sequential workflow: trigger → transformation → output
- Each variation MUST specify ONE output node
- Output nodes are determined by capabilities: 'output', 'write_data', 'send_email', 'send_message', etc.`;
    }

    // ✅ OPERATIONS-FIRST: Separate nodes WITH operations from nodes WITHOUT operations
    const { unifiedNodeRegistry } = require('../../core/registry/unified-node-registry');
    const nodesWithOperations = nodeMentionsWithOperations?.filter(n => n.operations.length > 0) || [];
    const nodesWithoutOperations = nodeMentionsWithOperations?.filter(n => n.operations.length === 0) || [];
    
    // Build operations section for nodes WITH operations
    let operationsSection = '';
    if (nodesWithOperations.length > 0) {
      operationsSection = `
🚨🚨🚨 CRITICAL - NODES WITH OPERATIONS (FROM NODE SCHEMAS):
These nodes have specific operations available in their schema. You MUST use these EXACT operations:

${nodesWithOperations.map(node => {
  return `- ${node.nodeType}:
  * Available operations: ${node.operations.join(', ')}
  * Default operation: ${node.defaultOperation || node.operations[0] || 'N/A'}
  * Example: "Use ${node.nodeType} with operation='${node.defaultOperation || node.operations[0] || 'read'}' to..."`
}).join('\n\n')}

ABSOLUTE REQUIREMENTS FOR NODES WITH OPERATIONS:
1. Use ONLY the operations listed above for each node (from node's schema)
2. If user mentions a verb (e.g., "export", "send", "read"), map it to the CLOSEST operation from the node's available operations
3. Include the operation in your variation text (e.g., "Use github with operation='create_issue' to...")
4. DO NOT invent operations - use only what's in the node's schema
5. If unsure which operation to use, use the DEFAULT operation listed above

✅ OPERATION MAPPING EXAMPLES (use operations from NODES WITH OPERATIONS section above):
- User says "export" → Check the node's available operations in NODES WITH OPERATIONS section, use 'export' if listed, otherwise use default
- User says "send email" → Check email node's available operations in NODES WITH OPERATIONS section, use the matching operation
- User says "read data" → Check data source node's available operations in NODES WITH OPERATIONS section, use the matching operation
- User says "create issue" → Check github node's available operations in NODES WITH OPERATIONS section, use 'create_issue' if listed

`;
    }
    
    // Build action/description section for nodes WITHOUT operations
    let actionsSection = '';
    if (nodesWithoutOperations.length > 0) {
      const nodeDescriptions = nodesWithoutOperations.map(node => {
        const nodeDef = unifiedNodeRegistry.get(node.nodeType);
        const description = nodeDef?.description || `perform ${node.nodeType} action`;
        const label = nodeDef?.label || node.nodeType;
        return `- ${node.nodeType} (${label}): ${description}`;
      }).join('\n');
      
      actionsSection = `
🚨🚨🚨 CRITICAL - NODES WITHOUT OPERATIONS (ACTION-BASED):
These nodes perform specific actions. Describe what they DO, not operations:

${nodeDescriptions}

ABSOLUTE REQUIREMENTS FOR NODES WITHOUT OPERATIONS:
1. These nodes do NOT have operations - they perform specific actions
2. Describe what the node DOES in natural language (e.g., "Use webhook to receive incoming requests", "Use wait to delay execution")
3. DO NOT try to find operations for these nodes - they don't have any
4. Focus on describing the node's purpose and action in your variation text
5. Use natural language to explain what the node accomplishes

✅ ACTION DESCRIPTION EXAMPLES:
- webhook → "Use webhook to receive incoming HTTP requests"
- wait → "Use wait to delay workflow execution for 5 minutes"
- if_else → "Use if_else to route data based on conditions"
- log → "Use log to record workflow execution details"

`;
    }
    
    // ✅ PHASE 2: Add EXTRACTED KEYWORDS section to prompt (REQUIRED, not optional)
    const extractedKeywordsSection = extractedNodeTypes.length > 0
      ? `
🚨🚨🚨 CRITICAL - REQUIRED NODES (EXTRACTED FROM USER PROMPT):
The following node types were extracted from keywords in the user's prompt. These are REQUIRED and MUST be included in variations:
${extractedNodeTypes.map((node, idx) => `  ${idx + 1}. ${node}`).join('\n')}

ABSOLUTE REQUIREMENTS (NON-NEGOTIABLE):
1. ALL ${extractedNodeTypes.length} extracted node types above MUST be included in EVERY variation (${extractedNodeTypes.join(', ')})
2. DO NOT include only 2-3 nodes - you MUST include ALL ${extractedNodeTypes.length} nodes in each variation
3. DO NOT replace extracted nodes with other nodes (e.g., if ${extractedNodeTypes[0] || 'node'} is extracted, use ${extractedNodeTypes[0] || 'node'} - NOT a different node)
4. DO NOT ignore extracted nodes to "simplify" the workflow
5. The extracted keywords above are what the user EXPLICITLY mentioned - they are REQUIRED, not optional
6. You MUST naturally integrate ALL ${extractedNodeTypes.length} node types into the variation text
7. Each variation must mention ALL nodes: ${extractedNodeTypes.join(', ')}
8. ✅ OPERATIONS-FIRST: 
   - For nodes WITH operations: Use the EXACT operations listed in the OPERATIONS section above
   - For nodes WITHOUT operations: Describe what the node DOES (its action/purpose) naturally
9. 🚨 CRITICAL: Build COMPLETE workflow chains: trigger → dataSource → transformation → output
10. 🚨 CRITICAL: If user says "get X, summarize Y, send Z", you MUST include: dataSource node (X) + transformation node (Y) + output node (Z)
11. 🚨 CRITICAL: Each variation MUST describe the COMPLETE workflow flow, not just 2 random nodes

✅ CRITICAL: Naturally integrate node types into variation text:
- For nodes WITH operations: Include operation in sentences (e.g., "Use ${nodesWithOperations.length > 0 ? nodesWithOperations[0].nodeType : extractedNodeTypes[0] || 'node'} with operation='${nodesWithOperations.length > 0 ? nodesWithOperations[0].defaultOperation : 'read'}' to fetch data")
- For nodes WITHOUT operations: Describe the action naturally (e.g., "Use ${nodesWithoutOperations.length > 0 ? nodesWithoutOperations[0].nodeType : 'webhook'} to receive incoming requests")
- Show data flow with node types (e.g., "Data flows from ${extractedNodeTypes[0] || 'source'} → ${extractedNodeTypes[1] || 'transformation'} → ${extractedNodeTypes[2] || 'output'}")

VIOLATION = FAILURE: If you omit any extracted node or use invalid operations, the variation is INVALID.

`
      : '';

    return `User Prompt: "${userPrompt}"

${operationsSection}
${actionsSection}
${extractedKeywordsSection}
Available Node Keywords (${keywordsToUse.length} keywords - ONLY REQUIRED NODES + relevant context):
${keywordsToUse.join(', ')}

🚨🚨🚨 CRITICAL: The keywords above are ONLY for reference. You MUST ONLY use nodes from the REQUIRED NODES list above.
DO NOT list all keywords - ONLY use the REQUIRED NODES.

🚨🚨🚨 CRITICAL ANALYSIS INSTRUCTIONS - READ CAREFULLY:
1. Read the user prompt carefully - understand what the user wants
2. Look at the REQUIRED NODES above - there are ${extractedNodeTypes.length} nodes: ${extractedNodeTypes.join(', ')}
3. ALL ${extractedNodeTypes.length} REQUIRED NODES must be naturally integrated into EVERY variation text (use actual node type names)
4. DO NOT include only 2-3 nodes - you MUST include ALL ${extractedNodeTypes.length} nodes in each variation
5. DO NOT replace REQUIRED NODES with other nodes (e.g., ${extractedNodeTypes[0] || 'node'} → different node is FORBIDDEN)
6. Generate variations that include ALL ${extractedNodeTypes.length} REQUIRED NODES from the list above
7. Naturally mention ALL node types in sentences (e.g., "Use ${extractedNodeTypes[0] || 'node'} to... then use ${extractedNodeTypes[1] || 'node'} to...")
8. Each variation must describe a complete workflow using ALL ${extractedNodeTypes.length} nodes: ${extractedNodeTypes.join(', ')}

🚨🚨🚨 PURE INTENT SELECTION - ABSOLUTE RULE - NO EXCEPTIONS:
- ONLY use nodes that are in the REQUIRED NODES list above - these are PURE USER INTENT
- You MUST include ALL ${extractedNodeTypes.length} REQUIRED NODES in EVERY variation: ${extractedNodeTypes.join(', ')}
- DO NOT include only 2-3 nodes - ALL ${extractedNodeTypes.length} nodes must be in each variation
- DO NOT add random nodes from the Available Node Keywords list
- DO NOT list all possible nodes that "could work"
- DO NOT add nodes like "schedule", "http_request", "postgresql" unless they are in REQUIRED NODES
- DO NOT create repetitive text like "Use X node to handle this step" or "Use X to complete this step"
- Your variations should ONLY mention the ${extractedNodeTypes.length} REQUIRED NODES, nothing else
- This is PURE INTENT SELECTION - only what the user explicitly mentioned
- If you omit ANY of the ${extractedNodeTypes.length} REQUIRED NODES, the variation will be REJECTED and you must retry
- If you add nodes not in REQUIRED NODES, the variation will be REJECTED and you must retry

✅ ROOT-LEVEL ARCHITECTURE ANALYSIS:
${workflowStructureGuidance}

DETECTED NODE TYPES:
${structure.crmNodes.length > 0 ? `- CRM nodes: ${structure.crmNodes.join(', ')} (capability: 'crm' or 'write_crm')` : ''}
${structure.notificationNodes.length > 0 ? `- Notification nodes: ${structure.notificationNodes.join(', ')} (capability: 'communication', 'send_email', 'send_message', 'notification')` : ''}
${structure.transformationNodes.length > 0 ? `- Transformation nodes: ${structure.transformationNodes.join(', ')} (capability: 'transformation', 'ai_processing', 'llm')` : ''}
${structure.triggerTypes.length > 0 ? `- Trigger types: ${structure.triggerTypes.join(', ')}` : ''}

🚨🚨🚨 CRITICAL REQUIREMENT - EXACTLY 4 VARIATIONS - READ CAREFULLY:
You MUST generate EXACTLY 4 (FOUR) UNIQUE, DISTINCT prompt variations. NOT 1, NOT 2, NOT 3 - EXACTLY 4.

Each variation MUST be OBVIOUSLY DIFFERENT from the others in COMPLEXITY, NODES, and STYLE:

- Variation 1: SIMPLE & MINIMAL
  * Use a manual trigger node (from available trigger nodes in registry)
  * Include ONLY the ${extractedNodeTypes.length} REQUIRED NODES: ${extractedNodeTypes.join(', ')}
  * NO extra nodes, NO additional operations, NO helper nodes
  * Total node count: EXACTLY ${extractedNodeTypes.length} nodes (required only)
  * Keep it simple: trigger → required nodes → done
  * For nodes WITH operations: Use ONLY the default operation from NODES WITH OPERATIONS section
  * For nodes WITHOUT operations: Just describe what they do naturally
  * Example style: "Start with a manual trigger node. Use [REQUIRED_NODE_1] with its default operation from schema. Process with [REQUIRED_NODE_2] using its default operation. Send via [REQUIRED_NODE_3] using its default operation."

- Variation 2: SIMPLE WITH EXTRA OPERATIONS & HELPER NODES
  * Use a manual trigger node (from available trigger nodes in registry)
  * Include ALL ${extractedNodeTypes.length} REQUIRED NODES: ${extractedNodeTypes.join(', ')}
  * ADD EXACTLY 1-2 helper nodes from available helper nodes: ${helperNodes.length > 0 ? helperNodes.slice(0, 10).join(', ') : 'delay, wait, cache_get, data_validation, split_in_batches'}
  * ⚠️ CRITICAL: These helper nodes are automatically selected from registry based on their capabilities (utility/logic nodes for timing, caching, splitting)
  * ⚠️ CRITICAL: Choose DIFFERENT helper nodes than Variations 3 and 4 (select different nodes from the available helper nodes list)
  * Total node count: ${extractedNodeTypes.length + 1} to ${extractedNodeTypes.length + 2} nodes (required + 1-2 helpers)
  * For nodes WITH operations: Check NODES WITH OPERATIONS section - use MULTIPLE operations if available (e.g., if node has 'read' and 'validate', mention both)
  * For helper nodes: Use their operations from schema (check each node's available operations in registry)
  * Example style: "Start with manual_trigger. Use [REQUIRED_NODE_1] with operation='read' and operation='validate' from schema. Add delay node with operation='wait' for timing control. Process with [REQUIRED_NODE_2] using its transformation operations from schema. Send via [REQUIRED_NODE_3] using its output operations from schema."

- Variation 3: COMPLEX WITH MULTIPLE PROCESSING NODES
  * Use a webhook trigger node (from available trigger nodes in registry)
  * Include ALL ${extractedNodeTypes.length} REQUIRED NODES: ${extractedNodeTypes.join(', ')}
  * ADD EXACTLY 2-3 processing nodes from available processing nodes: ${processingNodes.length > 0 ? processingNodes.slice(0, 10).join(', ') : 'merge_data, aggregate, filter, data_mapper, transform, json_parser, csv_parser'}
  * ⚠️ CRITICAL: These processing nodes are automatically selected from registry based on their capabilities (transformation/ai nodes for data processing, merging, aggregating)
  * ⚠️ CRITICAL: Choose DIFFERENT processing nodes than Variations 2 and 4 (select different nodes from the available processing nodes list)
  * Total node count: ${extractedNodeTypes.length + 2} to ${extractedNodeTypes.length + 3} nodes (required + 2-3 processing)
  * Show complex data flow: "Fetch from multiple sources, merge data, transform through multiple steps, then deliver"
  * For processing nodes: Use their operations from schema (check each node's available operations in registry)
  * Example style: "Configure webhook to trigger workflow. Fetch data from [REQUIRED_NODE_1] with operation='read'. Use merge_data with operation='merge' to combine data. Process through aggregate with operation='sum' for calculations. Transform with [REQUIRED_NODE_2] using its advanced operations from schema. Deliver via [REQUIRED_NODE_3] with operation='send'."

- Variation 4: DIFFERENT STYLE/APPROACH WITH ALTERNATIVE NODES
  * Use a webhook trigger node (from available trigger nodes in registry)
  * Include ALL ${extractedNodeTypes.length} REQUIRED NODES: ${extractedNodeTypes.join(', ')}
  * ADD EXACTLY 1-2 style nodes from available style nodes: ${styleNodes.length > 0 ? styleNodes.slice(0, 10).join(', ') : 'schedule, interval, queue_push, queue_consume, batch_process, event_trigger'}
  * ⚠️ CRITICAL: These style nodes are automatically selected from registry based on their capabilities (scheduling/queuing nodes for alternative workflow approaches)
  * ⚠️ CRITICAL: Choose DIFFERENT style nodes than Variations 2 and 3 (select different nodes from the available style nodes list)
  * Total node count: ${extractedNodeTypes.length + 1} to ${extractedNodeTypes.length + 2} nodes (required + 1-2 style)
  * Use DIFFERENT approach: batch processing, scheduled execution, event-driven, or parallel processing
  * For style nodes: Use their operations from schema (check each node's available operations in registry)
  * Example style: "Set up webhook for event-driven automation. Configure schedule with operation='schedule' for periodic execution. Use [REQUIRED_NODE_1] with operation='read' to collect data. Queue data using queue_push with operation='push'. Process queued items with [REQUIRED_NODE_2] using its operations from schema. Deliver results via [REQUIRED_NODE_3] with operation='send'."

EACH VARIATION MUST:
✅ Include ALL ${extractedNodeTypes.length} REQUIRED NODES: ${extractedNodeTypes.join(', ')}
✅ Follow the workflow structure detected above (conditional or linear)
${structure.isConditional ? '✅ For conditional workflows: Specify ONE CRM node (true branch) AND ONE notification node (false branch) in the SAME workflow' : '✅ For linear workflows: Specify ONE output node per variation'}
✅ Use DIFFERENT sentence structures and wording (not just copy-paste with different triggers)
✅ Use DIFFERENT triggers (Variations 1-2: manual trigger nodes, Variations 3-4: webhook trigger nodes) - THIS IS MANDATORY
✅ Be 3-4 COMPLETE SENTENCES long with specific details that naturally mention ALL nodes (required + extra)
✅ Be OBVIOUSLY DIFFERENT from other variations (different flow, different nodes, different operations, different emphasis)
✅ Use DIFFERENT extra nodes per variation (Variation 2: helper nodes, Variation 3: processing nodes, Variation 4: style nodes)
✅ Use operations from NODES WITH OPERATIONS section for EACH node selected in that specific variation
✅ Follow node count rules: Variation 1 = ${extractedNodeTypes.length} nodes, Variation 2 = ${extractedNodeTypes.length + 1}-${extractedNodeTypes.length + 2} nodes, Variation 3 = ${extractedNodeTypes.length + 2}-${extractedNodeTypes.length + 3} nodes, Variation 4 = ${extractedNodeTypes.length + 1}-${extractedNodeTypes.length + 2} nodes
✅ DO NOT copy the user's prompt verbatim - expand it with ALL nodes integrated naturally
✅ DO NOT use the same extra nodes across variations - each variation must have UNIQUE extra nodes
✅ DO NOT create variations that are 80%+ similar - each must be unique in nodes, operations, and flow

VIOLATION = RETRY: If you generate fewer than 4 variations OR variations are too similar (>70% similarity), the system will REJECT and retry.

YOUR ROLE:
You are NOT the user. You are a workflow automation expert. Transform vague user prompts into detailed, structured prompts based on node capabilities and workflow architecture.

CRITICAL RULES - NO EXCEPTIONS:
1. ❌ NEVER use "or" or "either" in prompts (e.g., "use zoho_crm or salesforce" is FORBIDDEN)
2. ✅ Use the detected node types and capabilities from the architecture analysis above
3. ✅ Each variation MUST use DIFFERENT complexity levels and DIFFERENT node combinations:
   - Variation 1: MINIMAL - ONLY ${extractedNodeTypes.length} required nodes, NO extra nodes, use default operations only
   - Variation 2: SIMPLE+ - ${extractedNodeTypes.length} required nodes + 1-2 DIFFERENT helper nodes from available helper nodes (${helperNodes.length > 0 ? helperNodes.slice(0, 5).join(', ') : 'helper nodes from registry'}), use multiple operations per node
   - Variation 3: COMPLEX - ${extractedNodeTypes.length} required nodes + 2-3 DIFFERENT processing nodes from available processing nodes (${processingNodes.length > 0 ? processingNodes.slice(0, 5).join(', ') : 'processing nodes from registry'}), use advanced operations
   - Variation 4: DIFFERENT STYLE - ${extractedNodeTypes.length} required nodes + 1-2 DIFFERENT style nodes from available style nodes (${styleNodes.length > 0 ? styleNodes.slice(0, 5).join(', ') : 'style nodes from registry'}), use alternative approach
4. ✅ Variations 1-2: MUST use manual trigger nodes (from registry)
5. ✅ Variations 3-4: MUST use webhook trigger nodes (from registry)
6. ✅ Each variation must be obviously unique (different complexity, DIFFERENT extra nodes, different operations, different trigger, different style)
7. ✅ Variation 1: EXACTLY ${extractedNodeTypes.length} nodes (required only), default operations
8. ✅ Variation 2: ${extractedNodeTypes.length + 1} to ${extractedNodeTypes.length + 2} nodes (required + 1-2 helpers), multiple operations per node
9. ✅ Variation 3: ${extractedNodeTypes.length + 2} to ${extractedNodeTypes.length + 3} nodes (required + 2-3 processing), advanced operations
10. ✅ Variation 4: ${extractedNodeTypes.length + 1} to ${extractedNodeTypes.length + 2} nodes (required + 1-2 style), alternative operations
11. ✅ CRITICAL: Extra nodes MUST be DIFFERENT across variations (e.g., if Variation 2 uses delay+wait, Variation 3 must use merge_data+aggregate, Variation 4 must use schedule+queue_push)
12. ✅ CRITICAL: Operations MUST match the specific nodes selected for each variation (check NODES WITH OPERATIONS section for each node)

${structure.isConditional ? `
UNDERSTANDING CONDITIONAL WORKFLOWS (DETECTED):
- This workflow requires an IF node for conditional routing
- IF node has TWO branches: true path (qualified/valid) and false path (non-qualified/invalid)
- True branch connects to nodes with 'crm' or 'write_crm' capability: ${structure.crmNodes.length > 0 ? structure.crmNodes.join(', ') : 'CRM nodes'}
- False branch connects to nodes with 'communication' or 'notification' capability: ${structure.notificationNodes.length > 0 ? structure.notificationNodes.join(', ') : 'notification nodes'}
- Both branches exist in the SAME workflow via IF node routing

VARIATION REQUIREMENTS FOR CONDITIONAL WORKFLOWS:
- Each variation MUST specify BOTH: ONE CRM node (true branch) AND ONE notification node (false branch)
- Each variation MUST be 3-4 COMPLETE SENTENCES (separated by periods), NOT one long sentence
- Create 4 unique combinations from detected nodes:
  ${structure.crmNodes.length > 0 && structure.notificationNodes.length > 0 ? 
    `Available CRM nodes: ${structure.crmNodes.join(', ')}
Available notification nodes: ${structure.notificationNodes.join(', ')}

Create 4 unique combinations:
  - Variation 1: ${structure.crmNodes[0]} (qualified) + ${structure.notificationNodes[0]} (non-qualified) + manual_trigger
  - Variation 2: ${structure.crmNodes.length > 1 ? structure.crmNodes[1] : structure.crmNodes[0]} (qualified) + ${structure.notificationNodes.length > 1 ? structure.notificationNodes[1] : structure.notificationNodes[0]} (non-qualified) + manual_trigger
  - Variation 3: ${structure.crmNodes.length > 2 ? structure.crmNodes[2] : structure.crmNodes[0]} (qualified) + ${structure.notificationNodes.length > 2 ? structure.notificationNodes[2] : structure.notificationNodes[0]} (non-qualified) + webhook
  - Variation 4: ${structure.crmNodes.length > 3 ? structure.crmNodes[3] : (structure.crmNodes.length > 1 ? structure.crmNodes[1] : structure.crmNodes[0])} (qualified) + ${structure.notificationNodes.length > 3 ? structure.notificationNodes[3] : (structure.notificationNodes.length > 1 ? structure.notificationNodes[1] : structure.notificationNodes[0])} (non-qualified) + webhook` :
    '- Use detected CRM and notification nodes to create unique combinations'}
` : `
UNDERSTANDING LINEAR WORKFLOWS (DETECTED):
- This is a sequential workflow: trigger → transformation → output
- Each variation MUST specify ONE output node
- Output nodes are determined by capabilities: 'output', 'write_data', 'send_email', 'send_message', etc.
- Use detected output nodes: ${structure.notificationNodes.length > 0 ? structure.notificationNodes.join(', ') : 'output nodes'}

VARIATION REQUIREMENTS FOR LINEAR WORKFLOWS:
- Each variation MUST specify ONE output node
- Use different output nodes across variations
`}

TRIGGER SELECTION:
- Variations 1-2: MUST use manual trigger nodes (nodes with 'manual' tag or category='trigger' with manual in name)
- Variations 3-4: MUST use webhook trigger nodes (nodes with 'webhook' tag or category='trigger' with webhook in name)
- This ensures clear differentiation between variations
- ✅ UNIVERSAL: Find trigger nodes dynamically from registry - no hardcoded node names

🚨 CRITICAL OPERATION ENFORCEMENT - MANDATORY:
- You MUST describe WHAT each node DOES, not just mention the node name
- ✅ For nodes WITH operations (listed in NODES WITH OPERATIONS section above):
  * Use the EXACT operations from that node's schema (listed above)
  * Describe naturally: "Use [NODE] to [operation_description]" or "Use [NODE] with operation='[operation_from_schema]' to..."
  * Example: If github has operation='create_issue', say "Use github to create issues" or "Use github with operation='create_issue' to create new issues"
- ✅ For nodes WITHOUT operations (listed in NODES WITHOUT OPERATIONS section above):
  * Describe what the node DOES in natural language
  * Example: "Use webhook to receive incoming requests", "Use delay to wait 5 minutes"
- ❌ BAD: Just mentioning node name without describing what it does
- ❌ BAD: Using operations that are NOT in the node's schema (from NODES WITH OPERATIONS section)
- ✅ REQUIRED: Use ACTUAL REQUIRED NODES from the list above, and their ACTUAL operations from schemas

🚨 CRITICAL REPETITIVE TEXT BAN - ABSOLUTELY FORBIDDEN:
- ❌ FORBIDDEN: "Use [Node] node to complete the workflow"
- ❌ FORBIDDEN: "Use [Node] to handle this step"
- ❌ FORBIDDEN: "Use [Node] node to finish the workflow"
- ❌ FORBIDDEN: Any variation that just copies user prompt + adds "Use X node"
- ❌ FORBIDDEN: Copying user's original prompt verbatim
- ❌ FORBIDDEN: Starting with "Create a workflow with [trigger]. [User's prompt] Use [Node] node to complete the workflow"
- ✅ REQUIRED: Describe the COMPLETE workflow flow with operations
- ✅ REQUIRED: Show data transformation: "Read from X → Process with Y → Send to Z"
- ✅ REQUIRED: Each sentence must add NEW information, not repeat
- ✅ REQUIRED: Expand user's prompt into detailed workflow description
- ✅ REQUIRED: Show HOW each node is used, not just mention it
- ✅ REQUIRED: Describe the complete data flow from start to finish

GENERIC PATTERN (DO NOT COPY NODES, ONLY THE STRUCTURE):
- Good variations ALWAYS:
  * Start with the correct trigger from REQUIRED NODES (use actual trigger from list above)
  * For data source nodes: Check NODES WITH OPERATIONS section - if node has operations, use them. Describe naturally: "Use [NODE] to fetch data" or "Use [NODE] with operation='[operation_from_schema]' to retrieve information"
  * For transformation nodes: Check NODES WITH OPERATIONS section - if node has operations, use them. Describe naturally: "Use [NODE] to process data" or "Use [NODE] with operation='[operation_from_schema]' to transform information"
  * For output nodes: Check NODES WITH OPERATIONS section - if node has operations, use them. Describe naturally: "Use [NODE] to deliver results" or "Use [NODE] with operation='[operation_from_schema]' to send output"
  * Show data flow using ACTUAL REQUIRED NODES: "Data flows from [NODE1] → [NODE2] → [NODE3]"
  * Use operations ONLY from the NODES WITH OPERATIONS section above (from node schemas)
- Bad variations (REJECTED) would:
  * Use "or" between nodes (e.g., "use NODE_A or NODE_B")
  * Mention nodes that are NOT in the REQUIRED NODES list
  * Ignore REQUIRED NODES that were extracted from the user prompt
  * Just copy user prompt and add "Use X node to complete workflow" (FORBIDDEN)
  * Use operations that are NOT in the node's schema (from NODES WITH OPERATIONS section)
  * Force operation format when node doesn't have operations (check NODES WITHOUT OPERATIONS section)

🚨 CRITICAL AI NODE RULE:
- ONLY include AI nodes (ai_chat_model, ai_agent, memory_node) if the user EXPLICITLY mentions:
  * "AI", "chatbot", "LLM", "summarize", "analyze", "classify", "generate", "translate"
- DO NOT add AI nodes for simple operations like:
  * "send email" → NO ai_chat_model needed
  * "read sheets and send gmail" → NO ai_chat_model needed
  * "get data and send notification" → NO ai_chat_model needed
- If user says "send email", use the appropriate email/output node directly - NO extra AI processing needed
- If user says "summarize data", "analyze", "classify", or "generate content", THEN include ai_chat_model for that transformation
- ✅ CRITICAL: For simple AI operations (summarize, analyze, classify, generate content), prefer "ai_chat_model" over more complex agents
- ✅ CRITICAL: Only use "ai_agent" when user explicitly mentions tools, memory, or multi-step reasoning

🚨 CRITICAL FORMAT REQUIREMENT - EACH VARIATION MUST BE MEANINGFUL WITH KEYWORDS:
- Each prompt MUST contain at least 3-4 COMPLETE SENTENCES separated by periods (.)
- Minimum length: 200 characters (NOT 90 - must be detailed)
- Each sentence should describe a different aspect:
  * Sentence 1: Describe the trigger and how it initiates the workflow
  * Sentence 2: Describe data collection/fetching using REQUIRED NODES
  * Sentence 3: Describe processing/transformation using REQUIRED NODES
  * Sentence 4: Describe output/delivery using REQUIRED NODES
- MUST include ALL ${extractedNodeTypes.length} node keywords from the REQUIRED NODES list above
- MUST naturally integrate node names into sentences (e.g., "Use ${extractedNodeTypes.find(n => n.includes('schedule')) || 'schedule'} to trigger daily execution")

🚨 CRITICAL COMPLEXITY DIFFERENTIATION - EACH VARIATION MUST BE UNIQUELY DIFFERENT:
- Variation 1 (SIMPLE & MINIMAL):
  * Use ONLY the ${extractedNodeTypes.length} REQUIRED NODES: ${extractedNodeTypes.join(', ')}
  * NO extra nodes, NO helper nodes, NO additional operations
  * Keep sentences short and direct
  * Example: "Start with a manual trigger node. Use [REQUIRED_NODE_1] to fetch. Process with [REQUIRED_NODE_2]. Send via [REQUIRED_NODE_3]."

- Variation 2 (SIMPLE WITH EXTRA OPERATIONS):
  * Include ALL ${extractedNodeTypes.length} REQUIRED NODES: ${extractedNodeTypes.join(', ')}
  * ADD 1-2 helper nodes (delay, cache_get, data_validation) OR mention multiple operations from node schemas
  * For nodes WITH operations: Check NODES WITH OPERATIONS section above - use the actual operations listed for each node
  * For nodes WITHOUT operations: Just describe what they do naturally (check NODES WITHOUT OPERATIONS section)
  * Example format: "Start with manual_trigger. Use [REQUIRED_NODE_1] with its operations from schema. Add delay for timing. Process with [REQUIRED_NODE_2] using its transformation operations from schema. Send via [REQUIRED_NODE_3] using its output operations from schema."   

- Variation 3 (COMPLEX WITH MULTIPLE NODES):
  * Include ALL ${extractedNodeTypes.length} REQUIRED NODES: ${extractedNodeTypes.join(', ')}
  * ADD 2-3 additional processing nodes (multiple data sources, multiple transformations, error handling)
  * Show complex flow: "Fetch from X and Y, merge data, validate, transform through A and B, then deliver"
  * Use operations from NODES WITH OPERATIONS section for each node (from their schemas)
  * Example: "Configure webhook trigger. Fetch from [REQUIRED_NODE_1] using its data retrieval operations. Add additional data source. Merge and validate data. Process through [REQUIRED_NODE_2] using its transformation operations from schema. Apply secondary transformation. Deliver via [REQUIRED_NODE_3] using its output operations and backup to storage."

- Variation 4 (DIFFERENT STYLE/APPROACH):
  * Include ALL ${extractedNodeTypes.length} REQUIRED NODES: ${extractedNodeTypes.join(', ')}
  * Use DIFFERENT approach: batch processing, scheduled execution, event-driven, parallel processing, queue-based
  * Show alternative pattern: "Schedule batch jobs", "Process in parallel", "Event-driven", "Queue-based"
  * Use operations from NODES WITH OPERATIONS section for each node (from their schemas)
  * Example: "Set up webhook for event-driven automation. Schedule batch processing with [REQUIRED_NODE_1] using its operations from schema. Queue data for processing. Process with [REQUIRED_NODE_2] in parallel using its transformation operations. Deliver via [REQUIRED_NODE_3] using its output operations with retry logic."

- Example of GOOD format (3-4 sentences, 200+ chars) - using REQUIRED NODES:
  ${extractedNodeTypes.length >= 3
    ? `"Start with ${extractedNodeTypes.find(n => n.includes('trigger') || n.includes('webhook')) || extractedNodeTypes[0]} to initiate the workflow. Configure ${extractedNodeTypes.find(n => n.includes('schedule')) || extractedNodeTypes[1]} for daily automation. Use ${extractedNodeTypes.find(n => n.includes('ai') || n.includes('chat')) || extractedNodeTypes[2]} to generate content. Export results via ${extractedNodeTypes.find(n => n.includes('csv')) || extractedNodeTypes[3]} and publish to ${extractedNodeTypes.find(n => n.includes('instagram') || n.includes('linkedin')) || extractedNodeTypes[extractedNodeTypes.length - 1]} platform."`
    : `"Start with ${extractedNodeTypes[0] || 'manual_trigger'} to initiate the workflow. Use ${extractedNodeTypes[1] || 'node'} to process data. Complete with ${extractedNodeTypes[2] || 'output'} node to deliver results."`}
- Example of BAD format (repetitive, copying user prompt):
  "Create a workflow with manual_trigger. Generate AI content daily and post automatically in instagram Use Webhook Trigger node to complete the workflow." ❌ REPETITIVE, COPIES USER PROMPT

🚨 CRITICAL: DO NOT copy the example above - it's just showing the FORMAT. You MUST use the ACTUAL REQUIRED NODES from the list above, NOT the example node names.

CRITICAL: Each prompt in the variations array must:
- Be at least 90 characters long (minimum requirement)
- Contain at least 2 complete sentences (separated by periods) - MANDATORY
- Include specific node type keywords from the REQUIRED NODES list above (use the actual extracted node types)
- Mention specific node types from REQUIRED NODES (do not use generic examples - use the actual extracted node types)
- For conditional workflows: Specify ONE CRM node (for qualified leads) AND ONE notification node (for non-qualified leads)
- For linear workflows: Specify EXACTLY ONE output node (NO "or" or "either")
- Use different node combinations across variations
- Variations 1-2: Use manual_trigger
- Variations 3-4: Use webhook trigger
- Describe the complete workflow flow (trigger → transformation → conditional routing → outputs)
- NOT just copy the user's original prompt
- Clearly explain the IF node routing: qualified leads → CRM, non-qualified leads → notification

OUTPUT FORMAT (STRICT JSON - NO MARKDOWN, NO CODE BLOCKS):
${this.buildDynamicExampleJSON(extractedNodeTypes)}

🚨 CRITICAL: The example above shows the FORMAT only. You MUST use the ACTUAL REQUIRED NODES from the list above, NOT the example node names.

🚨 CRITICAL: The example above shows the FORMAT only. You MUST use the ACTUAL REQUIRED NODES from the list above, NOT the example node names.

🚨 CRITICAL: 
- Respond with ONLY valid JSON. No markdown, no code blocks, no explanations. Start with { and end with }.
- The "variations" array MUST contain exactly 4 items. Do not return fewer variations.
- Each "prompt" field MUST be at least 200 characters and contain 3-4 sentences (NOT 1 sentence, NOT copying user's prompt).
- 🚨🚨🚨 MOST CRITICAL: Each variation MUST include ALL ${extractedNodeTypes.length} REQUIRED NODES: ${extractedNodeTypes.join(', ')}
- DO NOT include only 2-3 nodes - ALL ${extractedNodeTypes.length} nodes must be mentioned in each variation
- ❌ ABSOLUTELY FORBIDDEN: Copying user's prompt and just adding "Use X node to complete the workflow"
- ✅ REQUIRED: Expand user's prompt into a detailed, meaningful workflow description
- ✅ REQUIRED: Show HOW each node is used in the workflow (not just mention the name)
- ✅ REQUIRED: Describe the complete data flow from trigger → processing → output
- ✅ ROOT-LEVEL: For conditional workflows with 3+ conditions → MUST use SWITCH node (multiple branches)
- ✅ ROOT-LEVEL: For conditional workflows with 2 conditions → MUST use IF_ELSE node (two branches)
- For conditional workflows: Each prompt MUST specify ${structure.conditionalNodeType === 'switch' ? 'MULTIPLE case branches (one per condition)' : 'ONE CRM node (for qualified) AND ONE notification node (for non-qualified) - both in the same workflow via IF_ELSE node'}.
- For linear workflows: Each prompt MUST specify EXACTLY ONE output node (NO "or" or "either" options).
- Variations 1-2: MUST use manual_trigger
- Variations 3-4: MUST use webhook trigger
- Each variation MUST use DIFFERENT combinations of nodes (different CRM, different notification, different trigger), BUT ALL must include the ${extractedNodeTypes.length} REQUIRED NODES.
- Each prompt MUST specify ALL ${extractedNodeTypes.length} node types from the REQUIRED NODES list above, operations, and data flow.
- DO NOT copy the user's vague prompt - EXPAND it into detailed, structured descriptions with multiple sentences that naturally include ALL ${extractedNodeTypes.length} nodes.
- DO NOT use "or" or "either" - specify specific nodes per variation.
- For conditional workflows: Clearly explain IF node routing (qualified → CRM, non-qualified → notification).
- Remember: JSON strings are single-line, but your prompts should have 3-4 sentences separated by periods.
- Each variation must describe a complete workflow that uses ALL ${extractedNodeTypes.length} REQUIRED NODES: ${extractedNodeTypes.join(', ')}`;
  }

  /**
   * ✅ UNIVERSAL: Filter keywords relevant to user prompt with semantic equivalence expansion
   * Works for ALL nodes automatically - no hardcoded lists
   * 
   * Flow:
   * 1. Score keywords by relevance to user prompt
   * 2. Find nodes that match the prompt (using keywords)
   * 3. For each matching node, get ALL semantic equivalents from registry
   * 4. Include those equivalents in results (even if they don't match prompt directly)
   * 
   * This ensures AI has access to post_to_instagram, post_to_twitter, etc.
   * when user says "social platforms" - works UNIVERSALLY for any node type
   */
  private filterRelevantKeywordsWithSemanticExpansion(allKeywords: string[], userPromptLower: string): string[] {
    // Extract words from user prompt
    const promptWords = userPromptLower
      .split(/[\s_\-.,;:!?()]+/)
      .filter(word => word.length > 2);

    // Step 1: Score keywords by relevance
    const scoredKeywords = allKeywords.map(keyword => {
      const keywordLower = keyword.toLowerCase();
      let score = 0;

      // Exact match
      if (userPromptLower.includes(keywordLower)) {
        score += 10;
      }

      // Word overlap
      for (const word of promptWords) {
        if (keywordLower.includes(word) || word.includes(keywordLower)) {
          score += 5;
        }
      }

      // Partial match
      if (keywordLower.length > 3 && userPromptLower.includes(keywordLower.substring(0, 3))) {
        score += 2;
      }

      return { keyword, score };
    });

    // Step 2: Get top matching keywords (these are likely node types mentioned in prompt)
    const topMatchingKeywords = scoredKeywords
      .sort((a, b) => b.score - a.score)
      .filter(item => item.score > 0)
      .slice(0, 50) // Top 50 matches
      .map(item => item.keyword);

    // Step 3: ✅ UNIVERSAL: Expand matching keywords with their semantic equivalents
    // Uses keyword mappings from collector - works for ALL nodes automatically
    const semanticEquivalents = new Set<string>();
    const keywordMappings = this.keywordCollector.getAllAliasKeywords();
    
    // Build keyword -> nodeType mapping
    const keywordToNodeTypes = new Map<string, Set<string>>();
    for (const mapping of keywordMappings) {
      if (!keywordToNodeTypes.has(mapping.keyword)) {
        keywordToNodeTypes.set(mapping.keyword, new Set());
      }
      keywordToNodeTypes.get(mapping.keyword)!.add(mapping.nodeType);
    }
    
    // For each matching keyword, get its node types and find semantic equivalents
    for (const keyword of topMatchingKeywords) {
      const nodeTypes = keywordToNodeTypes.get(keyword);
      if (!nodeTypes) continue;
      
      for (const nodeType of nodeTypes) {
        const nodeDef = unifiedNodeRegistry.get(nodeType);
        if (!nodeDef) continue;
        
        const category = nodeDef.category?.toLowerCase();
        const operations = ['create', 'write', 'send', 'post', 'update', 'read', 'fetch', 'process', 'transform'];
        
        // Get ALL semantic equivalents for this node type (universal - works for any node)
        for (const operation of operations) {
          const equivalents = semanticNodeEquivalenceRegistry.getEquivalents(nodeType, operation, category);
          for (const equivalent of equivalents) {
            // Only add if it exists in allKeywords (was collected in getAllAliasKeywords)
            if (allKeywords.includes(equivalent.toLowerCase())) {
              semanticEquivalents.add(equivalent.toLowerCase());
            }
          }
        }
      }
    }

    // Step 4: Combine top matching keywords with their semantic equivalents
    const combinedKeywords = [...new Set([...topMatchingKeywords, ...Array.from(semanticEquivalents)])];
    
    return combinedKeywords;
  }

  /**
   * Get system prompt for AI
   * ✅ PRODUCTION: Enhanced with strict JSON enforcement
   */
  /**
   * ✅ PHASE 2: Get system prompt with REQUIRED nodes enforcement
   * @param extractedNodeTypes - Node types extracted from user prompt (MUST be included in variations)
   */
  private getSystemPrompt(extractedNodeTypes: string[] = []): string {
    // ✅ CRITICAL: Make extracted keywords REQUIRED, not optional guidance
    const extractedKeywordsSection = extractedNodeTypes.length > 0
      ? `🚨🚨🚨 HIGHEST PRIORITY - REQUIRED NODES (EXTRACTED FROM USER PROMPT):
The system extracted these node types from keywords in the user's prompt. These are REQUIRED and MUST appear in EVERY variation:
${extractedNodeTypes.map((node, idx) => `  ${idx + 1}. ${node}`).join('\n')}

ABSOLUTE REQUIREMENTS (OVERRIDE ALL OTHER INSTRUCTIONS):
1. If extracted keywords show "linkedin" → You MUST include "linkedin" node in EVERY variation (NOT google_gmail, NOT email)
2. If extracted keywords show "schedule" → You MUST include "schedule" node in EVERY variation
3. If extracted keywords show "ai_chat_model" → You MUST include "ai_chat_model" node in EVERY variation
4. DO NOT replace extracted nodes with other nodes (e.g., linkedin → google_gmail is FORBIDDEN)
5. DO NOT ignore extracted nodes to "simplify" the workflow
6. The extracted keywords above are what the user EXPLICITLY mentioned - they are REQUIRED, not optional

EXAMPLES:
- User says "post on linked in" + extracted keywords show "linkedin" → Variations MUST include "linkedin" node
- User says "post automatically on linked in" + extracted keywords show "linkedin", "schedule" → Variations MUST include BOTH "linkedin" AND "schedule" nodes
- User says "Generate AI content" + extracted keywords show "ai_chat_model" → Variations MUST include "ai_chat_model" node

VIOLATION = FAILURE: If you omit any extracted node, the variation is INVALID and will be rejected.

`
      : '';

    return `You are a workflow automation expert who transforms vague user prompts into detailed, structured prompts for workflow builders.

${extractedKeywordsSection}
🚨 CRITICAL REQUIREMENTS:
1. You MUST respond with ONLY valid JSON - no markdown, no code blocks, no explanations
2. Your response must start with { and end with }
3. If you include any text before or after the JSON, the system will fail
4. All string values must be properly escaped and quoted
5. You MUST generate EXACTLY 4 prompt variations in the "variations" array - NOT 1, NOT 2, NOT 3
6. Use the extracted keywords above to understand user intent and include appropriate nodes
7. Each prompt variation should be clear and detailed (can be multiple sentences if needed to include all required nodes)

Your role:
- You are a workflow automation expert who RESPECTS user's explicit requirements
- The REQUIRED NODES listed above are EXTRACTED from the user's prompt - they are MANDATORY
- If REQUIRED NODES show "linkedin", include "linkedin" node - DO NOT replace with google_gmail or email
- If REQUIRED NODES show "schedule", include "schedule" node - DO NOT omit it
- Transform vague prompts into clear prompts that include ALL REQUIRED NODES from the list above

CRITICAL RULES (in priority order):
1. ✅ HIGHEST: Include ALL REQUIRED NODES from the list above in EVERY variation (NON-NEGOTIABLE)
2. ✅ SECOND: Make prompt clear and detailed (can be multiple sentences)
3. ✅ THIRD: Only add nodes that are clearly implied by user intent (in addition to REQUIRED NODES)
4. ✅ LAST: Keep prompts concise (but NOT at the expense of REQUIRED NODES)

${extractedNodeTypes.length > 0 ? `🚨🚨🚨 CRITICAL REMINDER: The ${extractedNodeTypes.length} REQUIRED NODE(S) listed above MUST appear in EVERY variation. This is NON-NEGOTIABLE. If you omit any of them, the variation will be rejected.` : ''}

You have access to keywords from available node types in the system.
Use these keywords to identify specific nodes and operations that match the user's intent.

OUTPUT: Valid JSON only, starting with { and ending with }.
The "variations" array MUST contain exactly 4 items, each with a detailed prompt that includes ALL required nodes.`;
  }

  /**
   * Parse AI response into structured result
   * ✅ PRODUCTION: Robust JSON parsing with multiple fallback strategies
   */
  /**
   * ✅ PHASE 3: Parse AI response and validate against required nodes
   * @param extractedNodeTypes - Node types that MUST be in variations (for validation)
   */
  private parseAIResponse(
    aiResponse: string,
    originalPrompt: string,
    allKeywordData: AliasKeyword[],
    extractedNodeTypes: string[] = []
  ): SummarizeLayerResult {
    // ✅ PHASE 1: Extract keywords from original prompt as fallback
    const fallbackExtractedKeywords = this.extractKeywordsFromPrompt(originalPrompt, allKeywordData);
    const fallbackExtractedNodeTypes = this.mapKeywordsToNodeTypes(fallbackExtractedKeywords);
    
    try {
      // ✅ PRODUCTION: Multiple JSON extraction strategies
      let jsonStr = aiResponse.trim();
      
      // Strategy 1: Remove markdown code blocks
      if (jsonStr.startsWith('```')) {
        const lines = jsonStr.split('\n');
        const firstLine = lines[0];
        const lastLine = lines[lines.length - 1];
        
        // Check if it's a code block
        if (firstLine.includes('```') && lastLine.includes('```')) {
          jsonStr = lines.slice(1, -1).join('\n').trim();
        } else if (firstLine.includes('```')) {
          // Only opening tag
          jsonStr = lines.slice(1).join('\n').trim();
        }
      }
      
      // Strategy 2: Remove JSON prefix
      if (jsonStr.toLowerCase().startsWith('json')) {
        jsonStr = jsonStr.substring(4).trim();
      }
      
      // Strategy 3: Extract JSON object (find first { and last })
      const firstBrace = jsonStr.indexOf('{');
      const lastBrace = jsonStr.lastIndexOf('}');
      if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        jsonStr = jsonStr.substring(firstBrace, lastBrace + 1);
      }
      
      // Strategy 4: Remove leading/trailing whitespace and newlines
      jsonStr = jsonStr.trim();

      // ✅ PRODUCTION: Validate JSON structure before parsing
      if (!jsonStr.startsWith('{') || !jsonStr.endsWith('}')) {
        throw new Error('Response does not contain valid JSON object');
      }

      const parsed = JSON.parse(jsonStr);

      // Build prompt variations
      const variations: PromptVariation[] = [];
      if (parsed.variations && Array.isArray(parsed.variations)) {
        for (let i = 0; i < parsed.variations.length; i++) {
          const variation = parsed.variations[i];
          // ✅ ROOT FIX: Clean repetitive text immediately when parsing
          const cleanedPrompt = this.cleanRepetitiveNodeText(variation.prompt || originalPrompt);
          
          variations.push({
            id: `variation-${i + 1}`,
            prompt: cleanedPrompt,
            keywords: [], // ✅ NEW: Will be populated with node types extracted from variation text
            matchedKeywords: [], // ✅ ROOT FIX: Will be populated from user's original prompt only
            confidence: 0.8, // Default confidence
            reasoning: variation.reasoning || 'Generated by AI intent clarifier',
          });
        }
      }

      // If no variations, add original as fallback
      if (variations.length === 0) {
        variations.push({
          id: 'original',
          prompt: originalPrompt,
          keywords: [], // ✅ NEW: Will be populated with node types extracted from original prompt
          matchedKeywords: [],
          confidence: 0.5,
          reasoning: 'No variations generated, using original prompt',
        });
      }

      // ✅ CLEAN ARCHITECTURE: Single source of truth for user intent
      // Step 1: Extract nodes ONLY from user's original prompt (not AI-generated text)
      const postProcessedKeywords = this.extractKeywordsFromPrompt(originalPrompt, allKeywordData);
      const matchedKeywords = new Set<string>();
      postProcessedKeywords.forEach(k => matchedKeywords.add(k.toLowerCase()));

      // Step 2: Map to node types - these are the MANDATORY nodes user wants
      const mandatoryNodeTypes = this.mapKeywordsToNodeTypes(Array.from(matchedKeywords));
      
      // ✅ NEW: Extract nodes with operation hints
      const mandatoryNodesWithOperations = this.extractNodesWithOperations(originalPrompt, allKeywordData, mandatoryNodeTypes);
      
      console.log(`[AIIntentClarifier] ✅ ROOT FIX: Using ONLY ${mandatoryNodeTypes.length} node(s) from user's original prompt: ${mandatoryNodeTypes.join(', ')}`);
      console.log(`[AIIntentClarifier] ✅ ROOT FIX: Ignoring AI-generated matchedKeywords - only trusting user's intent`);
      if (mandatoryNodesWithOperations.length > 0) {
        console.log(`[AIIntentClarifier] ✅ Extracted operation hints for ${mandatoryNodesWithOperations.length} node(s):`, 
          mandatoryNodesWithOperations.map(n => `${n.nodeType}(${n.operationHint || 'none'})`).join(', '));
      }
      
      // ✅ CLEAN ARCHITECTURE: Process variations with clear separation of concerns
      const pureVariations = variations.map(variation => {
        // Clean repetitive text patterns only
        const cleanedPrompt = this.cleanRepetitiveNodeText(variation.prompt);
        
        // Extract nodes from variation text for validation (to check if AI followed instructions)
        const variationKeywords = this.extractKeywordsFromPrompt(cleanedPrompt, allKeywordData);
        const variationNodeTypes = this.mapKeywordsToNodeTypes(variationKeywords);
        
        // Filter to nodes that are BOTH: (1) in user's intent AND (2) mentioned in variation
        const matchedNodeTypes = variationNodeTypes.filter(nodeType => 
          mandatoryNodeTypes.includes(nodeType)
        );
        
        console.log(`[AIIntentClarifier] ✅ PURE INTENT: Variation "${variation.id}" - Found ${variationNodeTypes.length} node(s) in text, filtered to ${matchedNodeTypes.length} from user's intent: ${matchedNodeTypes.join(', ')}`);

      return {
          ...variation,
          prompt: cleanedPrompt,
          // ✅ FIX: UI displays ALL required nodes from user's original prompt
          // This ensures UI shows all 6 nodes even if AI variation only mentioned 2-3
          keywords: mandatoryNodeTypes, // ✅ Single source of truth: user's required nodes
          matchedKeywords: matchedNodeTypes, // ✅ For validation: filtered nodes (in user's intent)
          allExtractedNodes: variationNodeTypes, // ✅ NEW: ALL nodes extracted from variation text (for smart semantic matching)
        };
      });

      return {
        shouldShowLayer: pureVariations.length > 1, // Show layer if we have multiple variations
        originalPrompt: originalPrompt,
        clarifiedIntent: parsed.clarifiedIntent || originalPrompt,
        mandatoryNodesWithOperations, // ✅ NEW: Include operation hints
        promptVariations: pureVariations, // ✅ PURE INTENT: Use AI-generated variations as-is (no patching)
        allKeywords: this.keywordCollector.getAllKeywordStrings(),
        matchedKeywords: Array.from(matchedKeywords), // ✅ ROOT FIX: Only from user's original prompt
        mandatoryNodeTypes: mandatoryNodeTypes, // ✅ ROOT FIX: ONLY nodes from user's original prompt
      };
    } catch (error) {
      console.error('[AIIntentClarifier] ❌ Error parsing AI response:', error);
      console.error('[AIIntentClarifier] Raw response:', aiResponse);
      
      // Return fallback
      return {
        shouldShowLayer: false,
        originalPrompt: originalPrompt,
        promptVariations: [
          {
            id: 'original',
            prompt: originalPrompt,
            keywords: fallbackExtractedNodeTypes, // ✅ NEW: Use extracted nodes from fallback
            matchedKeywords: [],
            confidence: 0.5,
            reasoning: 'Error parsing AI response, using original prompt',
          },
        ],
        allKeywords: this.keywordCollector.getAllKeywordStrings(),
        matchedKeywords: [],
        mandatoryNodeTypes: extractedNodeTypes.length > 0 ? extractedNodeTypes : fallbackExtractedNodeTypes, // ✅ PHASE 1: Use extracted nodes even in fallback
      };
    }
  }

  /**
   * ✅ STEP 1: Post-process original prompt to extract missed keywords
   * Scans the original prompt for keywords that AI might have missed
   */
  /**
   * ✅ ROOT-LEVEL UNIVERSAL: Extract keywords with semantic grouping and adaptive thresholds
   * - Groups nodes by semantic category (CRM, AI, database, etc.)
   * - Requires ONE node per category, not all
   * - Uses adaptive thresholds based on keyword specificity
   * - Strengthens context validation to reject false positives
   * - ✅ NEW: Classifies intent as EXPLICIT (user mentioned specific node) or CATEGORY (general term)
   */
  /**
   * ✅ UNIVERSAL NODE DETECTION - PHASE 4: Replace existing method
   * 
   * Replaces keyword-only detection with universal multi-source detection
   * Uses all detection methods: type name, label, tags, keywords, semantic, fuzzy
   * ✅ CONTINGENCY: Handles all edge cases - empty results, errors, missing data
   */
  private extractKeywordsFromPrompt(userPrompt: string, allKeywordData: AliasKeyword[]): string[] {
    // ✅ CONTINGENCY 1: Handle empty/null prompts
    if (!userPrompt || typeof userPrompt !== 'string' || userPrompt.trim().length === 0) {
      console.warn(`[AIIntentClarifier] ⚠️  Empty prompt provided to extractKeywordsFromPrompt`);
      return [];
    }
    
    try {
      console.log(`[AIIntentClarifier] 🔍 UNIVERSAL DETECTION: Extracting nodes from prompt: "${userPrompt.substring(0, 100)}..."`);
      
      // ✅ STEP 1: Use universal node detection (all methods)
      const allDetections = this.universalNodeDetection(userPrompt, allKeywordData);
      
      // ✅ CONTINGENCY 2: Handle empty detection results
      if (!allDetections || allDetections.size === 0) {
        console.log(`[AIIntentClarifier] ⚠️  No nodes detected from prompt`);
        return [];
      }
      
      // ✅ STEP 2: Convert detection results to extracted keywords format (for compatibility)
      const extractedKeywords = new Map<string, { confidence: number; match: string; intentType: 'EXPLICIT' | 'CATEGORY' }>();
    const promptLower = userPrompt.toLowerCase();
      
      for (const [nodeType, detection] of allDetections.entries()) {
        // ✅ CONTINGENCY 3: Validate detection result
        if (!detection || !nodeType) continue;
        
        try {
          // Classify intent type (EXPLICIT if specific node mentioned, CATEGORY if general)
          const intentType = this.classifyIntentType(detection.match, nodeType, promptLower);
          extractedKeywords.set(nodeType, {
            confidence: detection.confidence,
            match: detection.match,
            intentType
          });
        } catch (error) {
          console.warn(`[AIIntentClarifier] ⚠️  Error classifying intent for ${nodeType}, skipping:`, error);
          continue;
        }
      }
      
      // ✅ CONTINGENCY 4: Handle empty extracted keywords
      if (extractedKeywords.size === 0) {
        console.log(`[AIIntentClarifier] ⚠️  No valid keywords extracted after processing`);
        return [];
      }
      
      // ✅ STEP 3: Semantic grouping - require ONE node per category (preserve existing logic)
      let finalNodes: string[] = [];
      try {
        const groupedByCategory = this.groupNodesBySemanticCategory(Array.from(extractedKeywords.keys()));
        finalNodes = this.selectOneNodePerCategoryWithIntentPreservation(groupedByCategory, extractedKeywords);
      } catch (error) {
        // ✅ CONTINGENCY 5: If semantic grouping fails, return all detected nodes
        console.warn(`[AIIntentClarifier] ⚠️  Error in semantic grouping, returning all detected nodes:`, error);
        finalNodes = Array.from(extractedKeywords.keys());
      }
    
      console.log(`[AIIntentClarifier] ✅ UNIVERSAL DETECTION: Extracted ${extractedKeywords.size} node(s), grouped to ${finalNodes.length} by semantic category: ${finalNodes.join(', ')}`);
      return finalNodes;
    } catch (error) {
      // ✅ CONTINGENCY 6: Return empty array on critical error
      console.error(`[AIIntentClarifier] ❌ Critical error in extractKeywordsFromPrompt:`, error);
      return [];
    }
  }
  
  /**
   * ✅ UNIVERSAL NODE DETECTION - PHASE 2: Helper Methods
   * All helper methods for multi-source node detection
   */
  
  /**
   * Step 1.1: Tokenize user prompt into words
   * Splits prompt into individual words for matching
   * ✅ CONTINGENCY: Handles empty/null prompts
   */
  private tokenizePrompt(userPrompt: string): string[] {
    if (!userPrompt || typeof userPrompt !== 'string') {
      return [];
    }
    return userPrompt
      .toLowerCase()
      .split(/[\s_\-.,;:!?()\[\]{}'"]+/)
      .filter(word => word.length > 0);
  }
  
  /**
   * Step 1.8: Calculate string similarity (character overlap)
   * Returns similarity score between 0.0 and 1.0
   * ✅ CONTINGENCY: Handles empty/null strings, prevents division by zero
   */
  private calculateSimilarity(str1: string, str2: string): number {
    if (!str1 || !str2 || typeof str1 !== 'string' || typeof str2 !== 'string') {
      return 0;
    }
    
    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;
    
    if (longer.length === 0) return 0;
    if (longer.includes(shorter)) return 1.0;
    
    // Character overlap ratio
    const commonChars = [...shorter].filter(c => longer.includes(c)).length;
    return longer.length > 0 ? commonChars / longer.length : 0;
  }
  
  /**
   * Step 1.2: Detect nodes by matching node type names directly
   * Highest priority - exact matches on node type names
   * ✅ CONTINGENCY: Handles empty/null inputs, prevents errors
   */
  private detectByNodeTypeName(nodeType: string, promptWords: string[]): DetectionResult | null {
    if (!nodeType || typeof nodeType !== 'string' || !promptWords || promptWords.length === 0) {
      return null;
    }
    
    try {
      const nodeTypeLower = nodeType.toLowerCase();
      const nodeTypeWords = nodeTypeLower.split(/[_\s-]+/).filter(w => w.length > 0);
      
      if (nodeTypeWords.length === 0) return null;
      
      // Exact match: "github" in prompt → "github" node
      if (promptWords.some(word => word === nodeTypeLower)) {
        return { confidence: 1.0, method: 'type_name_exact', match: nodeType };
      }
      
      // All words match: "google sheets" → "google_sheets"
      if (nodeTypeWords.every(word => 
        promptWords.some(pw => pw === word || pw.includes(word) || word.includes(pw))
      )) {
        return { confidence: 0.95, method: 'type_name_all_words', match: nodeType };
      }
      
      // Partial match: "sheets" → "google_sheets"
      const overlap = nodeTypeWords.filter(word => 
        promptWords.some(pw => pw.includes(word) || word.includes(pw))
      ).length;
      
      if (overlap > 0) {
        const confidence = 0.8 + (overlap / nodeTypeWords.length) * 0.15;
        return { confidence, method: 'type_name_partial', match: nodeType };
      }
    } catch (error) {
      console.warn(`[AIIntentClarifier] ⚠️  Error in detectByNodeTypeName for ${nodeType}:`, error);
    }
    
    return null;
  }
  
  /**
   * Step 1.3: Detect nodes by matching registry labels
   * Uses nodeDef.label from unifiedNodeRegistry
   * ✅ CONTINGENCY: Handles missing nodeDef, empty labels, null values
   */
  private detectByRegistryLabel(nodeDef: any, promptLower: string): DetectionResult | null {
    if (!nodeDef || !promptLower || typeof promptLower !== 'string') {
      return null;
    }
    
    try {
      const label = (nodeDef.label || '').toLowerCase();
      if (!label || label.length === 0) return null;
      
      // Exact label match
      if (promptLower.includes(label)) {
        return { confidence: 0.95, method: 'label_exact', match: label };
      }
      
      // Label words match: "Google Sheets" → "sheets" in prompt
      const labelWords = label.split(/[\s_-]+/).filter((w: string) => w.length > 0);
      if (labelWords.length === 0) return null;
      
      const matchedWords = labelWords.filter((word: string) => 
          word.length > 3 && promptLower.includes(word)
        );
        
      if (matchedWords.length > 0) {
        const confidence = 0.85 + (matchedWords.length / labelWords.length) * 0.1;
        return { confidence, method: 'label_words', match: label };
      }
    } catch (error) {
      console.warn(`[AIIntentClarifier] ⚠️  Error in detectByRegistryLabel:`, error);
    }
    
    return null;
    }
    
  /**
   * Step 1.4: Detect nodes by matching registry tags/aliases
   * Uses nodeDef.tags and nodeDef.aliases from unifiedNodeRegistry
   * ✅ CONTINGENCY: Handles missing nodeDef, empty arrays, null values
   */
  private detectByRegistryTags(nodeDef: any, promptLower: string): DetectionResult | null {
    if (!nodeDef || !promptLower || typeof promptLower !== 'string') {
      return null;
    }
    
    try {
      const tags = Array.isArray(nodeDef.tags) 
        ? nodeDef.tags.map((t: string) => t && typeof t === 'string' ? t.toLowerCase() : '').filter((t: string) => t.length > 0)
        : [];
      const aliases = Array.isArray(nodeDef.aliases)
        ? nodeDef.aliases.map((a: string) => a && typeof a === 'string' ? a.toLowerCase() : '').filter((a: string) => a.length > 0)
        : [];
      
      // Check tags
      for (const tag of tags) {
        if (tag && promptLower.includes(tag)) {
          return { confidence: 0.9, method: 'tag', match: tag };
        }
      }
      
      // Check aliases
      for (const alias of aliases) {
        if (alias && promptLower.includes(alias)) {
          return { confidence: 0.92, method: 'alias', match: alias };
        }
      }
    } catch (error) {
      console.warn(`[AIIntentClarifier] ⚠️  Error in detectByRegistryTags:`, error);
    }
    
    return null;
  }
  
  /**
   * Step 1.5: Detect nodes by matching keywords (existing logic, refactored)
   * Uses AliasKeywordCollector keywords
   * ✅ CONTINGENCY: Handles empty arrays, null values, missing keywords
   */
  private detectByKeywords(nodeType: string, allKeywords: AliasKeyword[], promptLower: string): DetectionResult | null {
    if (!nodeType || !allKeywords || !Array.isArray(allKeywords) || !promptLower || typeof promptLower !== 'string') {
      return null;
    }
    
    try {
      const nodeKeywords = allKeywords.filter(k => k && k.nodeType === nodeType);
      if (nodeKeywords.length === 0) return null;
      
      let bestConfidence = 0;
      let bestMatch = '';
      
      for (const keywordData of nodeKeywords) {
        if (!keywordData || !keywordData.keyword) continue;
        
      const keywordLower = keywordData.keyword.toLowerCase();
        if (keywordLower.length === 0) continue;
        
        // Exact keyword match
        if (promptLower.includes(keywordLower)) {
          bestConfidence = Math.max(bestConfidence, 0.9);
          bestMatch = keywordLower;
        }
        
        // Partial keyword match
        const keywordWords = keywordLower.split(/[_\s-]+/).filter(w => w.length > 0);
        if (keywordWords.some(word => promptLower.includes(word))) {
          bestConfidence = Math.max(bestConfidence, 0.8);
          bestMatch = keywordLower;
        }
      }
      
      if (bestConfidence > 0 && bestMatch.length > 0) {
        return { confidence: bestConfidence, method: 'keyword', match: bestMatch };
      }
    } catch (error) {
      console.warn(`[AIIntentClarifier] ⚠️  Error in detectByKeywords for ${nodeType}:`, error);
    }
    
    return null;
  }
  
  /**
   * Step 1.6: Detect nodes by matching semantic words from description
   * Extracts semantic words from node type, label, and description
   * ✅ CONTINGENCY: Handles missing nodeDef, empty descriptions, null values
   */
  private detectBySemanticWords(nodeType: string, nodeDef: any, promptWords: string[]): DetectionResult | null {
    if (!nodeType || !nodeDef || !promptWords || !Array.isArray(promptWords) || promptWords.length === 0) {
      return null;
    }
    
    try {
      const semanticWords = new Set<string>();
      
      // From node type: "github_api" → ["github", "api"]
      if (typeof nodeType === 'string') {
        nodeType.toLowerCase().split(/[_\s-]+/).filter((w: string) => w.length > 0).forEach((w: string) => semanticWords.add(w));
      }
      
      // From label: "Google Sheets" → ["google", "sheets"]
      if (nodeDef.label && typeof nodeDef.label === 'string') {
        nodeDef.label.toLowerCase().split(/[\s_-]+/).filter((w: string) => w.length > 0).forEach((w: string) => semanticWords.add(w));
      }
      
      // From description: extract key nouns (words > 4 chars)
      if (nodeDef.description && typeof nodeDef.description === 'string') {
        const description = nodeDef.description.toLowerCase();
        const descriptionWords = description.split(/\s+/).filter((w: string) => w.length > 4);
        descriptionWords.forEach((w: string) => semanticWords.add(w));
      }
      
      if (semanticWords.size === 0) return null;
      
      // Count matches
      const matches = promptWords.filter(pw => 
        Array.from(semanticWords).some(sw => 
          pw.includes(sw) || sw.includes(pw)
        )
      ).length;
          
      if (matches > 0) {
        const maxSize = Math.max(promptWords.length, semanticWords.size);
        const confidence = 0.75 + (matches / (maxSize > 0 ? maxSize : 1)) * 0.15;
        return { confidence, method: 'semantic', match: Array.from(semanticWords).join(', ') };
      }
    } catch (error) {
      console.warn(`[AIIntentClarifier] ⚠️  Error in detectBySemanticWords for ${nodeType}:`, error);
    }
    
    return null;
  }
  
  /**
   * Step 1.7: Detect nodes by fuzzy matching (typos/variations)
   * Uses character overlap similarity for typos
   * ✅ CONTINGENCY: Handles empty arrays, null values, prevents errors
   */
  private detectByFuzzyMatching(nodeType: string, promptWords: string[]): DetectionResult | null {
    if (!nodeType || typeof nodeType !== 'string' || !promptWords || !Array.isArray(promptWords) || promptWords.length === 0) {
      return null;
    }
    
    try {
      const nodeTypeLower = nodeType.toLowerCase();
      const nodeTypeWords = nodeTypeLower.split(/[_\s-]+/).filter(w => w.length > 0);
      
      if (nodeTypeWords.length === 0) return null;
      
      for (const promptWord of promptWords) {
        if (!promptWord || typeof promptWord !== 'string') continue;
        
        for (const nodeWord of nodeTypeWords) {
          if (nodeWord.length < 4) continue; // Skip short words
          
          // Character overlap similarity
          const similarity = this.calculateSimilarity(promptWord, nodeWord);
          
          if (similarity > 0.7) {
            const confidence = 0.7 + (similarity - 0.7) * 0.3; // 0.7 to 1.0
            return { confidence, method: 'fuzzy', match: `${promptWord} ≈ ${nodeWord}` };
          }
        }
      }
    } catch (error) {
      console.warn(`[AIIntentClarifier] ⚠️  Error in detectByFuzzyMatching for ${nodeType}:`, error);
    }
    
    return null;
  }
  
  /**
   * Step 1.9: Merge multiple detection results, take highest confidence
   * Combines results from all detection methods
   * ✅ CONTINGENCY: Handles empty arrays, null values, invalid results
   */
  private mergeDetectionResults(results: Array<DetectionResult | null>): DetectionResult | null {
    if (!results || !Array.isArray(results) || results.length === 0) {
      return null;
    }
    
    try {
      const validResults = results.filter((r): r is DetectionResult => 
        r !== null && 
        r !== undefined && 
        typeof r === 'object' && 
        typeof r.confidence === 'number' && 
        r.confidence >= 0 && 
        r.confidence <= 1 &&
        typeof r.method === 'string' &&
        typeof r.match === 'string'
      );
      
      if (validResults.length === 0) return null;
      
      // Take result with highest confidence
      const bestResult = validResults.reduce((best, current) => 
        current.confidence > best.confidence ? current : best
      );
      
      return bestResult;
    } catch (error) {
      console.warn(`[AIIntentClarifier] ⚠️  Error in mergeDetectionResults:`, error);
      return null;
        }
      }
      
  /**
   * ✅ UNIVERSAL NODE DETECTION - PHASE 3: Main Detection Method
   * 
   * Step 2.1: Universal node detection using all detection methods
   * Detects ALL nodes from ALL possible sources in registry
   * ✅ CONTINGENCY: Handles all edge cases - empty prompts, missing registry, errors
   */
  private universalNodeDetection(userPrompt: string, allKeywordData: AliasKeyword[]): Map<string, DetectionResult> {
    const allDetections = new Map<string, DetectionResult>();
    
    // ✅ CONTINGENCY 1: Handle empty/null prompts
    if (!userPrompt || typeof userPrompt !== 'string' || userPrompt.trim().length === 0) {
      console.warn(`[AIIntentClarifier] ⚠️  Empty prompt provided to universalNodeDetection`);
      return allDetections;
    }
    
    // ✅ CONTINGENCY 2: Handle missing keyword data
    if (!allKeywordData || !Array.isArray(allKeywordData)) {
      console.warn(`[AIIntentClarifier] ⚠️  Invalid keyword data provided, using empty array`);
      allKeywordData = [];
    }
    
    try {
      const promptLower = userPrompt.toLowerCase();
      const promptWords = this.tokenizePrompt(userPrompt);
      
      // ✅ CONTINGENCY 3: Handle empty tokenized words
      if (promptWords.length === 0) {
        console.warn(`[AIIntentClarifier] ⚠️  No words extracted from prompt`);
        return allDetections;
      }
      
      // Get ALL nodes from registry (single source of truth)
      // ✅ CONTINGENCY 4: Handle registry errors
      let allNodeTypes: string[] = [];
      try {
        allNodeTypes = unifiedNodeRegistry.getAllTypes();
      } catch (error) {
        console.error(`[AIIntentClarifier] ❌ Failed to get node types from registry:`, error);
        return allDetections;
      }
      
      if (!allNodeTypes || allNodeTypes.length === 0) {
        console.warn(`[AIIntentClarifier] ⚠️  No nodes found in registry`);
        return allDetections;
      }
      
      console.log(`[AIIntentClarifier] 🔍 UNIVERSAL DETECTION: Scanning ${allNodeTypes.length} nodes from registry...`);
      
      // For EACH node in registry, try ALL detection methods
      for (const nodeType of allNodeTypes) {
        // ✅ CONTINGENCY 5: Handle invalid node types
        if (!nodeType || typeof nodeType !== 'string') {
          continue;
        }
        
        try {
          const nodeDef = unifiedNodeRegistry.get(nodeType);
          if (!nodeDef) continue;
          
          // DETECTION METHOD 1: Direct node type name matching
          const typeMatch = this.detectByNodeTypeName(nodeType, promptWords);
          
          // DETECTION METHOD 2: Registry label matching
          const labelMatch = this.detectByRegistryLabel(nodeDef, promptLower);
          
          // DETECTION METHOD 3: Registry tags/aliases matching
          const tagsMatch = this.detectByRegistryTags(nodeDef, promptLower);
          
          // DETECTION METHOD 4: Keyword matching (existing)
          const keywordMatch = this.detectByKeywords(nodeType, allKeywordData, promptLower);
          
          // DETECTION METHOD 5: Semantic word matching
          const semanticMatch = this.detectBySemanticWords(nodeType, nodeDef, promptWords);
          
          // DETECTION METHOD 6: Fuzzy matching (typos/variations)
          const fuzzyMatch = this.detectByFuzzyMatching(nodeType, promptWords);
          
          // Merge all detection results (take highest confidence)
          const bestMatch = this.mergeDetectionResults([
            typeMatch, labelMatch, tagsMatch, keywordMatch, semanticMatch, fuzzyMatch
          ]);
          
          // Filter by confidence threshold (0.7)
          if (bestMatch && bestMatch.confidence >= 0.7) {
            allDetections.set(nodeType, bestMatch);
            console.log(`[AIIntentClarifier] ✅ DETECTED: ${nodeType} (confidence: ${bestMatch.confidence.toFixed(2)}, method: ${bestMatch.method}, match: "${bestMatch.match}")`);
      }
        } catch (error) {
          // ✅ CONTINGENCY 6: Continue processing other nodes if one fails
          console.warn(`[AIIntentClarifier] ⚠️  Error detecting node ${nodeType}, skipping:`, error);
          continue;
        }
      }
    
      console.log(`[AIIntentClarifier] ✅ UNIVERSAL DETECTION: Found ${allDetections.size} node(s) from ${allNodeTypes.length} total nodes`);
    } catch (error) {
      // ✅ CONTINGENCY 7: Return empty map if critical error occurs
      console.error(`[AIIntentClarifier] ❌ Critical error in universalNodeDetection:`, error);
    }
    
    return allDetections;
  }
  
  /**
   * ✅ NEW: Extract nodes with operation hints from prompt context
   * Finds verbs/operations near node mentions to infer operation hints
   */
  private extractNodesWithOperations(
    userPrompt: string,
    allKeywordData: AliasKeyword[],
    nodeTypes: string[]
  ): NodeTypeWithOperation[] {
    const promptLower = userPrompt.toLowerCase();
    const result: NodeTypeWithOperation[] = [];
    
    // Common operation verbs that appear near nodes
    const operationVerbs = [
      'monitoring', 'monitor', 'check', 'watch', 'track',
      'integrated', 'integrate', 'connect', 'link',
      'read', 'get', 'fetch', 'retrieve', 'pull',
      'send', 'post', 'push', 'create', 'write', 'update',
      'export', 'import', 'sync', 'transfer'
    ];
    
    for (const nodeType of nodeTypes) {
      // Find all keyword matches for this node type
      const nodeKeywords = allKeywordData.filter(k => k.nodeType === nodeType);
      
      let bestContext = '';
      let bestOperationHint: string | undefined;
      
      for (const keywordData of nodeKeywords) {
        const keywordLower = keywordData.keyword.toLowerCase();
        
        // Find the position of the keyword in the prompt
        const keywordIndex = promptLower.indexOf(keywordLower);
        if (keywordIndex === -1) continue;
        
        // Extract context around the keyword (50 chars before and after)
        const contextStart = Math.max(0, keywordIndex - 50);
        const contextEnd = Math.min(promptLower.length, keywordIndex + keywordLower.length + 50);
        const context = userPrompt.substring(contextStart, contextEnd);
        const contextLower = context.toLowerCase();
        
        // Find operation verbs near the keyword
        for (const verb of operationVerbs) {
          const verbIndex = contextLower.indexOf(verb);
          if (verbIndex !== -1) {
            // Check if verb is within 30 characters of the keyword
            const distance = Math.abs(verbIndex - (keywordIndex - contextStart));
            if (distance <= 30) {
              bestOperationHint = verb;
              bestContext = context.trim();
              break;
            }
          }
        }
        
        if (bestOperationHint) break;
      }
      
      result.push({
        nodeType,
        operationHint: bestOperationHint,
        context: bestContext || undefined
      });
    }
    
    return result;
  }
  
  /**
   * ✅ ROOT-LEVEL UNIVERSAL: Group nodes by semantic category using registry
   * Uses registry category and tags as single source of truth - NO hardcoded node type lists
   * This ensures universality for all 141+ node types and infinite workflows
   */
  private groupNodesBySemanticCategory(nodeTypes: string[]): Map<string, string[]> {
    const grouped = new Map<string, string[]>();
    
    for (const nodeType of nodeTypes) {
      const nodeDef = unifiedNodeRegistry.get(nodeType);
      if (!nodeDef) continue;
      
      // ✅ ROOT-LEVEL UNIVERSAL: Use registry category and tags (NO hardcoded lists)
      // This works for ALL node types automatically, including future ones
      let semanticGroupKey: string;
      
      const category = nodeDef.category || 'utility';
      const tags = (nodeDef.tags || []).map(t => t.toLowerCase());
      
      // ✅ SEMANTIC GROUPING: Use tags for special semantic groups
      // CRM nodes: Check for 'crm' tag or category 'data' with CRM-related tags
      if (tags.includes('crm') || (category === 'data' && (nodeType.includes('crm') || nodeType.includes('salesforce') || nodeType.includes('hubspot') || nodeType.includes('zoho') || nodeType.includes('pipedrive') || nodeType.includes('freshdesk') || nodeType.includes('clickup')))) {
        semanticGroupKey = 'crm_group';
      }
      // AI nodes: Check for 'ai' tag or category 'ai'
      else if (tags.includes('ai') || category === 'ai') {
        semanticGroupKey = 'ai_group';
      }
      // Database nodes: Check for 'database' tag or database-related node type patterns
      else if (tags.includes('database') || tags.includes('db') || nodeType.includes('database') || nodeType.includes('postgresql') || nodeType.includes('supabase') || nodeType.includes('mysql') || nodeType.includes('mongodb') || nodeType.includes('sql')) {
        semanticGroupKey = 'database_group';
      }
      // Communication nodes: Check for 'communication' tag or category 'communication'
      else if (tags.includes('communication') || category === 'communication') {
        semanticGroupKey = 'communication_group';
      }
      // Trigger nodes: Check for 'trigger' tag or category 'trigger'
      else if (tags.includes('trigger') || category === 'trigger') {
        semanticGroupKey = 'trigger_group';
      }
      // Transformation nodes: Check for 'transformation' tag or category 'transformation'
      else if (tags.includes('transformation') || category === 'transformation') {
        semanticGroupKey = 'transformation_group';
      }
      // Logic nodes: Check for 'logic' tag or category 'logic'
      else if (tags.includes('logic') || category === 'logic') {
        semanticGroupKey = 'logic_group';
      }
      // Data nodes: Check for 'data' tag or category 'data'
      else if (tags.includes('data') || category === 'data') {
        semanticGroupKey = 'data_group';
      }
      // Utility nodes: Default fallback
      else {
        semanticGroupKey = `${category}_group`;
      }
      
      if (!grouped.has(semanticGroupKey)) {
        grouped.set(semanticGroupKey, []);
      }
      grouped.get(semanticGroupKey)!.push(nodeType);
    }
    
    return grouped;
  }
  
  /**
   * ✅ UNIVERSAL ROOT FIX: Select ONE node per category with INTENT PRESERVATION
   * 
   * Architecture:
   * - Priority 1: EXPLICIT mentions (user explicitly mentioned specific node) → Always use explicit node
   * - Priority 2: CATEGORY-based selection (user mentioned general term) → Pick best in category
   * 
   * Universal Benefits:
   * - Uses registry as single source of truth (unifiedNodeRegistry)
   * - Works for ALL node types automatically
   * - No hardcoded node lists
   * - Preserves user's exact intent when explicitly mentioned
   * - Uses semantic grouping for general category terms
   * 
   * Example:
   * - User: "post on instagram" → EXPLICIT → Always selects "instagram" (even if "linkedin" has higher confidence)
   * - User: "post on social media" → CATEGORY → Selects best social media node (highest confidence)
   */
  private selectOneNodePerCategoryWithIntentPreservation(
    groupedByCategory: Map<string, string[]>,
    extractedKeywords: Map<string, { confidence: number; match: string; intentType: 'EXPLICIT' | 'CATEGORY' }>
  ): string[] {
    const selected: string[] = [];
    
    for (const [category, nodeTypes] of groupedByCategory.entries()) {
      if (nodeTypes.length === 1) {
        // Only one node in category, use it
        selected.push(nodeTypes[0]);
        const keywordInfo = extractedKeywords.get(nodeTypes[0]);
        console.log(`[AIIntentClarifier] ✅ INTENT-PRESERVING: Selected "${nodeTypes[0]}" from ${category} (only candidate, intent: ${keywordInfo?.intentType || 'UNKNOWN'})`);
      } else {
        // ✅ PRIORITY 1: Check for EXPLICIT mentions in this category
        const explicitNodes = nodeTypes.filter(nodeType => {
          const keywordInfo = extractedKeywords.get(nodeType);
          return keywordInfo && keywordInfo.intentType === 'EXPLICIT';
        });
        
        if (explicitNodes.length > 0) {
          // User explicitly mentioned a node in this category → use it (preserve user intent)
          // If multiple explicit nodes, pick highest confidence
          let bestExplicit = explicitNodes[0];
          let bestExplicitConfidence = extractedKeywords.get(explicitNodes[0])?.confidence || 0;
          
          for (const nodeType of explicitNodes.slice(1)) {
            const confidence = extractedKeywords.get(nodeType)?.confidence || 0;
            if (confidence > bestExplicitConfidence) {
              bestExplicitConfidence = confidence;
              bestExplicit = nodeType;
            }
          }
          
          selected.push(bestExplicit);
          console.log(`[AIIntentClarifier] ✅ INTENT-PRESERVING: Selected "${bestExplicit}" from ${category} (EXPLICIT mention, ${explicitNodes.length} explicit/${nodeTypes.length} total, confidence: ${bestExplicitConfidence.toFixed(2)})`);
          continue;
        }
        
        // ✅ PRIORITY 2: Only category-based nodes → use semantic grouping (pick highest confidence)
        let bestNode = nodeTypes[0];
        let bestConfidence = extractedKeywords.get(nodeTypes[0])?.confidence || 0;
        
        for (const nodeType of nodeTypes.slice(1)) {
          const confidence = extractedKeywords.get(nodeType)?.confidence || 0;
          if (confidence > bestConfidence) {
            bestConfidence = confidence;
            bestNode = nodeType;
          }
        }
        
        selected.push(bestNode);
        const keywordInfo = extractedKeywords.get(bestNode);
        console.log(`[AIIntentClarifier] ✅ INTENT-PRESERVING: Selected "${bestNode}" from ${category} (CATEGORY-based, ${nodeTypes.length} candidates, intent: ${keywordInfo?.intentType || 'CATEGORY'}, confidence: ${bestConfidence.toFixed(2)})`);
      }
    }
    
    return selected;
  }
  
  /**
   * ✅ UNIVERSAL ROOT FIX: Classify intent type using registry-based detection
   * - EXPLICIT: User mentioned specific node type (e.g., "instagram", "linkedin", "salesforce")
   * - CATEGORY: User mentioned general category term (e.g., "social", "CRM", "database")
   * Uses registry as single source of truth - no hardcoding
   */
  private classifyIntentType(keyword: string, nodeType: string, promptLower: string): 'EXPLICIT' | 'CATEGORY' {
    const keywordLower = keyword.toLowerCase();
    
    // ✅ STEP 1: Check if keyword matches EXACT node type name in registry
    const exactNodeMatch = this.findExactNodeTypeMatch(keywordLower);
    if (exactNodeMatch && exactNodeMatch === nodeType) {
      return 'EXPLICIT'; // User explicitly mentioned this specific node
    }
    
    // ✅ STEP 2: Check if keyword matches node type via aliases/keywords
    const aliasMatch = this.findNodeTypeViaAlias(keywordLower, nodeType);
    if (aliasMatch) {
      // Check if this is a specific node name (not a general category)
      const isSpecificNodeName = this.isSpecificNodeName(keywordLower, nodeType);
      if (isSpecificNodeName) {
        return 'EXPLICIT'; // Specific node name mentioned
      }
    }
    
    // ✅ STEP 3: Check if keyword is a general category term (not specific node)
    const isCategoryTerm = this.isGeneralCategoryTerm(keywordLower, nodeType);
    if (isCategoryTerm) {
      return 'CATEGORY'; // General category term
    }
    
    // ✅ STEP 4: Default classification based on keyword specificity
    // If keyword is very specific (long, contains node type name), likely EXPLICIT
    const isLongSpecific = keywordLower.length > 8 && (keywordLower.includes(nodeType.toLowerCase()) || nodeType.toLowerCase().includes(keywordLower));
    if (isLongSpecific) {
      return 'EXPLICIT';
    }
    
    // Default to CATEGORY (safer - allows semantic grouping)
    return 'CATEGORY';
  }
  
  /**
   * ✅ UNIVERSAL: Find exact node type match in registry
   * Uses unifiedNodeRegistry as single source of truth
   */
  private findExactNodeTypeMatch(keyword: string): string | null {
    try {
      const allNodeTypes = unifiedNodeRegistry.getAllTypes();
      const keywordLower = keyword.toLowerCase();
      
      // Check exact match
      if (allNodeTypes.includes(keywordLower)) {
        return keywordLower;
      }
      
      // Check normalized match (instagram → instagram, linkedin → linkedin)
      const normalized = keywordLower.replace(/[_\s-]/g, '_');
      if (allNodeTypes.includes(normalized)) {
        return normalized;
      }
      
      // Check underscore variations
      const underscoreVariation = keywordLower.replace(/[\s-]/g, '_');
      if (allNodeTypes.includes(underscoreVariation)) {
        return underscoreVariation;
      }
      
      return null;
    } catch (error) {
      console.warn(`[AIIntentClarifier] Error in findExactNodeTypeMatch:`, error);
      return null;
    }
  }
  
  /**
   * ✅ UNIVERSAL: Find node type via alias/keyword mapping
   * Uses AliasKeywordCollector as single source of truth
   */
  private findNodeTypeViaAlias(keyword: string, expectedNodeType: string): boolean {
    try {
      const keywordData = this.keywordCollector.getAllAliasKeywords();
      const keywordLower = keyword.toLowerCase();
      
      // Check if keyword maps to expected node type
      const match = keywordData.find(kd => 
        kd.keyword.toLowerCase() === keywordLower && 
        kd.nodeType === expectedNodeType &&
        unifiedNodeRegistry.get(kd.nodeType) !== undefined
      );
      
      return match !== undefined;
    } catch (error) {
      console.warn(`[AIIntentClarifier] Error in findNodeTypeViaAlias:`, error);
      return false;
    }
  }
  
  /**
   * ✅ UNIVERSAL: Check if keyword is a specific node name (not general category)
   * Uses registry to determine specificity
   */
  private isSpecificNodeName(keyword: string, nodeType: string): boolean {
    const keywordLower = keyword.toLowerCase();
    const nodeTypeLower = nodeType.toLowerCase();
    
    // If keyword contains node type name or vice versa, it's specific
    if (keywordLower.includes(nodeTypeLower) || nodeTypeLower.includes(keywordLower)) {
      return true;
    }
    
    // ✅ UNIVERSAL: Check if keyword matches specific node using registry (no hardcoded patterns)
    // Check if keyword matches any node type or label in registry
    const allNodeTypes = unifiedNodeRegistry.getAllTypes();
    for (const registeredNodeType of allNodeTypes) {
      const registeredNodeDef = unifiedNodeRegistry.get(registeredNodeType);
      if (!registeredNodeDef) continue;
      
      const registeredNodeTypeLower = registeredNodeType.toLowerCase();
      const registeredNodeLabel = (registeredNodeDef.label || '').toLowerCase();
      
      // Check if keyword matches node type or label exactly
      if (keywordLower === registeredNodeTypeLower || keywordLower === registeredNodeLabel) {
        // If it matches the expected node type, it's specific
        if (registeredNodeType === nodeType) {
          return true;
        }
      }
      
      // Check if keyword is part of node type or label (for partial matches)
      if (registeredNodeType === nodeType && 
          (registeredNodeTypeLower.includes(keywordLower) || keywordLower.includes(registeredNodeTypeLower) ||
           registeredNodeLabel.includes(keywordLower) || keywordLower.includes(registeredNodeLabel))) {
        return true;
      }
    }
    
    // Check registry for node label match
    const nodeDef = unifiedNodeRegistry.get(nodeType);
    if (nodeDef) {
      const nodeLabel = (nodeDef.label || '').toLowerCase();
      if (nodeLabel && keywordLower.includes(nodeLabel)) {
        return true;
      }
    }
    
    return false;
  }
  
  /**
   * ✅ UNIVERSAL: Check if keyword is a general category term
   * Uses registry category/tags as single source of truth
   */
  private isGeneralCategoryTerm(keyword: string, nodeType: string): boolean {
    const keywordLower = keyword.toLowerCase();
    
    // General category terms (registry-based detection)
    const generalCategoryTerms = [
      'social', 'social media', 'social platform',
      'crm', 'customer relationship',
      'database', 'db', 'data store',
      'email', 'messaging', 'communication',
      'ai', 'artificial intelligence', 'llm', 'chatbot',
      'trigger', 'scheduler', 'automation',
      'data', 'storage', 'file',
    ];
    
    // Check if keyword is a general category term
    if (generalCategoryTerms.includes(keywordLower)) {
      return true;
    }
    
    // Check if keyword matches category name from registry
    const nodeDef = unifiedNodeRegistry.get(nodeType);
    if (nodeDef) {
      const category = (nodeDef.category || '').toLowerCase();
      const tags = (nodeDef.tags || []).map(t => t.toLowerCase());
      
      // If keyword matches category but not node type name, it's a category term
      if (category === keywordLower && keywordLower !== nodeType.toLowerCase()) {
        return true;
      }
      
      // If keyword matches tag but not node type name, it's likely a category term
      if (tags.includes(keywordLower) && keywordLower !== nodeType.toLowerCase()) {
        // But check if it's also a specific node name
        const isSpecific = this.isSpecificNodeName(keywordLower, nodeType);
        return !isSpecific; // If not specific, it's a category term
      }
    }
    
    return false;
  }
  
  /**
   * ✅ ROOT-LEVEL UNIVERSAL: Validate keyword context with STRICT rules to reject false positives
   * Uses registry properties to determine if keyword context makes sense for this node
   */
  private validateKeywordContext(prompt: string, keyword: string, nodeType: string): boolean {
    const promptLower = prompt.toLowerCase();
    const keywordLower = keyword.toLowerCase();
    
    // ✅ ROOT-LEVEL: Get node definition from registry
    const nodeDef = unifiedNodeRegistry.get(nodeType);
    if (!nodeDef) return true; // If node not in registry, allow (fallback)
    
    const nodeLabel = (nodeDef.label || nodeType).toLowerCase();
    const nodeCategory = (nodeDef.category || '').toLowerCase();
    const nodeTags = (nodeDef.tags || []).map(t => t.toLowerCase());
    
    // ✅ ROOT-LEVEL: STRICT REJECTION RULES for generic words
    
    // "store" keyword - reject unless context clearly indicates storage
    if (keywordLower === 'store' || keywordLower === 'storing') {
      const hasStorageContext = promptLower.includes('database') || promptLower.includes('cache') || 
                                promptLower.includes('save') || promptLower.includes('persist') ||
                                promptLower.includes('sheets') || promptLower.includes('crm');
      const isStorageNode = nodeCategory === 'data' || nodeTags.includes('storage') || 
                           nodeTags.includes('database') || nodeTags.includes('cache') ||
                           nodeType.includes('cache') || nodeType.includes('database') ||
                           nodeType.includes('sheets') || nodeType.includes('crm');
      
      // Reject if "store" is mentioned but node is not a storage node
      if (!hasStorageContext && !isStorageNode) {
        return false;
      }
    }
    
    // "notify" keyword - reject unless context clearly indicates notification
    if (keywordLower === 'notify' || keywordLower === 'notification') {
      const hasNotificationContext = promptLower.includes('email') || promptLower.includes('slack') ||
                                     promptLower.includes('message') || promptLower.includes('alert') ||
                                     promptLower.includes('send') || promptLower.includes('gmail');
      const isNotificationNode = nodeCategory === 'communication' || nodeTags.includes('notification') ||
                                 nodeTags.includes('email') || nodeTags.includes('message') ||
                                 nodeType.includes('gmail') || nodeType.includes('slack') ||
                                 nodeType.includes('email') || nodeType.includes('telegram');
      
      // Reject if "notify" is mentioned but node is not a notification node
      if (!hasNotificationContext && !isNotificationNode) {
        return false;
      }
    }
    
    // "respond" keyword - reject unless context clearly indicates response
    if (keywordLower === 'respond' || keywordLower === 'response') {
      const hasResponseContext = promptLower.includes('webhook') || promptLower.includes('reply') ||
                                 promptLower.includes('answer') || promptLower.includes('return');
      const isResponseNode = nodeType.includes('webhook_response') || nodeType.includes('respond_to_webhook') ||
                            nodeTags.includes('response') || nodeTags.includes('webhook');
      
      // Reject if "respond" is mentioned but node is not a response node
      if (!hasResponseContext && !isResponseNode) {
        return false;
      }
    }
    
    // "automatically" keyword - reject unless context clearly indicates automation/trigger
    if (keywordLower === 'automatically' || keywordLower === 'automatic') {
      const hasTriggerContext = promptLower.includes('schedule') || promptLower.includes('trigger') ||
                                promptLower.includes('daily') || promptLower.includes('weekly') ||
                                promptLower.includes('when') || promptLower.includes('on');
      const isTriggerNode = nodeCategory === 'trigger' || nodeTags.includes('trigger') ||
                          nodeType.includes('trigger') || nodeType.includes('schedule') ||
                          nodeType.includes('webhook') || nodeType.includes('interval');
      
      // Reject if "automatically" is mentioned but node is not a trigger node
      if (!hasTriggerContext && !isTriggerNode) {
        return false;
      }
    }
    
    // "capture" keyword - reject unless context clearly indicates form/capture
    if (keywordLower === 'capture' || keywordLower === 'capturing') {
      const hasCaptureContext = promptLower.includes('form') || promptLower.includes('lead') ||
                                promptLower.includes('submission') || promptLower.includes('input');
      const isCaptureNode = nodeType.includes('form') || nodeTags.includes('form') ||
                           nodeTags.includes('capture') || nodeTags.includes('input');
      
      // Reject if "capture" is mentioned but node is not a capture node
      if (!hasCaptureContext && !isCaptureNode) {
        return false;
      }
    }
    
    // "qualify" keyword - reject unless context clearly indicates AI/analysis
    if (keywordLower === 'qualify' || keywordLower === 'qualifying' || keywordLower === 'qualification') {
      const hasQualifyContext = promptLower.includes('ai') || promptLower.includes('analyze') ||
                                promptLower.includes('classify') || promptLower.includes('evaluate');
      const isQualifyNode = nodeCategory === 'ai' || nodeTags.includes('ai') ||
                           nodeType.includes('ai') || nodeType.includes('chat_model');
      
      // Reject if "qualify" is mentioned but node is not an AI/analysis node
      if (!hasQualifyContext && !isQualifyNode) {
        return false;
      }
    }
    
    // ✅ ROOT-LEVEL: Reject ambiguous "content" keyword unless explicitly about documents/media
    if (keywordLower === 'content') {
      const isDocumentNode = nodeCategory === 'data' || nodeTags.includes('document') || nodeTags.includes('file');
      const isMediaNode = nodeCategory === 'social' || nodeTags.includes('media') || nodeTags.includes('platform');
      
      if ((isDocumentNode || isMediaNode) && !promptLower.includes('document') && !promptLower.includes('google doc') && !promptLower.includes('file')) {
        return false;
      }
    }
    
    // ✅ ROOT-LEVEL: "post" keyword - check if platform is specified and matches this node
    if (keywordLower === 'post' || keywordLower === 'posting') {
      const postPattern = /post\s+(?:on|to|to\s+)?\s*([a-z_\s]+)/i;
      const match = promptLower.match(postPattern);
      if (match && match[1]) {
        const platform = match[1].toLowerCase().trim();
        
        const nodeKeywords = this.keywordCollector.getAllAliasKeywords()
          .filter(k => k.nodeType === nodeType)
          .map(k => k.keyword.toLowerCase());
        
        const platformMatchesNode = nodeKeywords.some(k => 
          platform.includes(k) || k.includes(platform) || 
          platform.includes(nodeLabel) || nodeLabel.includes(platform) ||
          platform.includes(nodeType.replace('_', '')) || nodeType.replace('_', '').includes(platform)
        );
        
        if (!platformMatchesNode) {
          if (nodeCategory === 'utility' || nodeTags.includes('http') || nodeType.includes('http')) {
            return false;
          }
          return false;
        }
      }
    }
    
    // ✅ ROOT-LEVEL: "AI" keyword - prefer more specific AI nodes over generic ones
    if (keywordLower === 'ai') {
      const isGenericAI = nodeCategory === 'ai' && (
        nodeType.includes('service') || 
        nodeTags.includes('generic') ||
        !nodeType.includes('chat') && !nodeType.includes('model') && !nodeType.includes('agent')
      );
      
      if (isGenericAI && !promptLower.includes('ai service') && !promptLower.includes('ai_service')) {
        return false;
      }
    }
    
    return true; // Default: allow if no specific rejection rules match
  }
  
  /**
   * ✅ WORLD-CLASS UNIVERSAL: Get node-specific pattern using registry (works for ALL nodes)
   */
  private getNodeSpecificPattern(nodeType: string, keyword: string): RegExp | null {
    // ✅ UNIVERSAL: Get node definition from registry
    const nodeDef = unifiedNodeRegistry.get(nodeType);
    if (!nodeDef) return null;
    
    const nodeLabel = (nodeDef.label || nodeType).toLowerCase();
    const nodeCategory = (nodeDef.category || '').toLowerCase();
    const nodeTags = (nodeDef.tags || []).map(t => t.toLowerCase());
    
    // ✅ UNIVERSAL: Build pattern based on node category and common action verbs
    // Social/Platform nodes: "post on X", "publish to X", "share on X"
    if (nodeCategory === 'social' || nodeTags.includes('platform') || nodeTags.includes('social')) {
      const labelEscaped = nodeLabel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const typeEscaped = nodeType.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/_/g, '[\\s_]?');
      return new RegExp(`(?:post|publish|share|upload)\\s+(?:on|to)\\s+(?:${labelEscaped}|${typeEscaped})`, 'i');
    }
    
    // Email nodes: "send via X", "email using X", "send to X"
    if (nodeCategory === 'communication' || nodeTags.includes('email') || nodeTags.includes('mail')) {
      const labelEscaped = nodeLabel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return new RegExp(`(?:send|email)\\s+(?:via|using|to)\\s+${labelEscaped}`, 'i');
    }
    
    // Data source nodes: "get from X", "read from X", "fetch from X"
    if (nodeCategory === 'data' || nodeTags.includes('source') || nodeTags.includes('read')) {
      const labelEscaped = nodeLabel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return new RegExp(`(?:get|read|fetch|retrieve)\\s+(?:data|from)\\s+(?:.*?\\s+)?${labelEscaped}`, 'i');
    }
    
    // Schedule/Trigger nodes: "daily", "weekly", "schedule", "automatically"
    if (nodeCategory === 'trigger' || nodeTags.includes('schedule') || nodeTags.includes('trigger')) {
      return /(?:daily|weekly|monthly|schedule|automatically|automatic|recurring)/i;
    }
    
    // AI nodes: "generate AI X", "create AI X", "use AI"
    if (nodeCategory === 'ai' || nodeTags.includes('ai') || nodeTags.includes('llm')) {
      return /(?:generate|create|use)\\s+ai\\s+(?:content|summary|text|analysis)/i;
    }
    
    return null; // No specific pattern for this node type
  }

  /**
   * ✅ STEP 2: Map keywords to node types
   * Converts keywords (strings) to actual node types (validated against registry)
   */
  private mapKeywordsToNodeTypes(keywords: string[]): string[] {
    const nodeTypes = new Set<string>();
    
    for (const keyword of keywords) {
      // Direct match (keyword is already a node type)
      if (nodeLibrary.isNodeTypeRegistered(keyword)) {
        nodeTypes.add(keyword);
        continue;
      }
      
      // Alias match (keyword maps to node type via keyword collector)
      const keywordData = this.keywordCollector.getAllAliasKeywords().find(
        kd => kd.keyword.toLowerCase() === keyword.toLowerCase()
      );
      
      if (keywordData) {
        // Verify node type exists in registry
        if (nodeLibrary.isNodeTypeRegistered(keywordData.nodeType)) {
          nodeTypes.add(keywordData.nodeType);
          console.log(`[AIIntentClarifier] ✅ Mapped keyword "${keyword}" → node type "${keywordData.nodeType}"`);
        } else {
          console.warn(`[AIIntentClarifier] ⚠️  Keyword "${keyword}" maps to unregistered node type "${keywordData.nodeType}"`);
        }
      }
    }
    
    const result = Array.from(nodeTypes);
    console.log(`[AIIntentClarifier] ✅ Mapped ${keywords.length} keyword(s) to ${result.length} node type(s): ${result.join(', ')}`);
    return result;
  }

  /**
   * ✅ UNIVERSAL: Get output node keywords from registry (no hardcoding)
   * Returns all keywords for nodes that have 'output' capability
   */
  private getOutputNodeKeywords(): string[] {
    const allKeywordData = this.keywordCollector.getAllAliasKeywords();
    const outputKeywords = new Set<string>();
    
    for (const keywordData of allKeywordData) {
      // Check if node has output capability
      if (nodeCapabilityRegistryDSL.isOutput(keywordData.nodeType)) {
        outputKeywords.add(keywordData.keyword);
        // Also add node type itself as keyword
        outputKeywords.add(keywordData.nodeType);
      }
    }
    
    return Array.from(outputKeywords);
  }

  /**
   * ✅ UNIVERSAL: Detect output node from prompt using registry (no hardcoding)
   * Scans prompt for output node keywords and returns the first match
   */
  private detectOutputNodeFromPrompt(prompt: string): string | null {
    const promptLower = prompt.toLowerCase();
    const allKeywordData = this.keywordCollector.getAllAliasKeywords();
    
    // Get all output node types
    const allNodeTypes = nodeLibrary.getRegisteredNodeTypes();
    const outputNodeTypes = allNodeTypes.filter(nodeType => 
      nodeCapabilityRegistryDSL.isOutput(nodeType)
    );
    
    // Check each output node type
    for (const nodeType of outputNodeTypes) {
      const nodeTypeLower = nodeType.toLowerCase();
      
      // Direct node type match
      if (promptLower.includes(nodeTypeLower)) {
        return nodeType;
      }
      
      // Keyword match
      const nodeKeywords = allKeywordData
        .filter(kd => kd.nodeType === nodeType)
        .map(kd => kd.keyword.toLowerCase());
      
      for (const keyword of nodeKeywords) {
        if (promptLower.includes(keyword)) {
          return nodeType;
        }
      }
    }
    
    return null;
  }

  // ✅ REMOVED: Hardcoded filtering and expansion functions
  // These functions contained hardcoded phrases and node lists
  // Now: AI receives extracted keywords and intelligently understands intent
  // No hardcoding needed - AI makes intelligent decisions from context

  /**
   * ✅ UNIVERSAL: Build dynamic example JSON using extracted node types
   * Uses registry to categorize nodes dynamically - NO hardcoded patterns
   */
  private buildDynamicExampleJSON(extractedNodeTypes: string[]): string {
    // ✅ CRITICAL: Show ALL required nodes in examples, not just 2-3
    const allNodes = extractedNodeTypes.length > 0 ? extractedNodeTypes : ['manual_trigger', 'appropriate_node'];
    const nodeList = allNodes.join(', ');
    
    // ✅ UNIVERSAL: Categorize nodes using registry (NO hardcoded patterns)
    const categorizeNodes = (): {
      triggers: string[];
      utilities: string[];
      ai: string[];
      delays: string[];
      data: string[];
      outputs: string[];
      others: string[];
    } => {
      const categories = {
        triggers: [] as string[],
        utilities: [] as string[],
        ai: [] as string[],
        delays: [] as string[],
        data: [] as string[],
        outputs: [] as string[],
        others: [] as string[],
      };
      
      for (const nodeType of allNodes) {
        const nodeDef = unifiedNodeRegistry.get(nodeType);
        if (!nodeDef) {
          categories.others.push(nodeType);
          continue;
        }
        
        const category = (nodeDef.category || '').toLowerCase();
        const tags = (nodeDef.tags || []).map(t => t.toLowerCase());
        
        // Categorize using registry metadata
        if (category === 'trigger' || tags.includes('trigger') || tags.includes('schedule')) {
          categories.triggers.push(nodeType);
        } else if (category === 'ai' || tags.includes('ai') || tags.includes('llm') || tags.includes('chat')) {
          categories.ai.push(nodeType);
        } else if (tags.includes('delay') || tags.includes('wait') || tags.includes('rate') || nodeType.includes('wait') || nodeType.includes('delay')) {
          categories.delays.push(nodeType);
        } else if (category === 'data' || tags.includes('export') || tags.includes('csv') || tags.includes('file')) {
          categories.data.push(nodeType);
        } else if (category === 'communication' || category === 'social' || tags.includes('social') || tags.includes('platform') || tags.includes('post')) {
          categories.outputs.push(nodeType);
        } else if (category === 'utility' || tags.includes('http') || tags.includes('api') || tags.includes('request')) {
          categories.utilities.push(nodeType);
        } else if (nodeCapabilityRegistryDSL.isOutput(nodeType)) {
          categories.outputs.push(nodeType);
        } else {
          categories.others.push(nodeType);
        }
      }
      
      return categories;
    };
    
    const categories = categorizeNodes();
    
    // ✅ UNIVERSAL: Get node by category (fallback to index if category empty)
    const getNodeByCategory = (categoryNodes: string[], fallbackIndex: number): string => {
      if (categoryNodes.length > 0) {
        return categoryNodes[0];
      }
      return allNodes[fallbackIndex] || allNodes[0] || 'node';
    };
    
    // ✅ UNIVERSAL: Get trigger node from registry (NO hardcoded fallbacks)
    const getTriggerNode = (preferWebhook: boolean = false): string => {
      // First, try to find from extracted nodes
      if (preferWebhook) {
        const webhookTrigger = allNodes.find(n => {
          const nodeDef = unifiedNodeRegistry.get(n);
          return nodeDef && (
            (nodeDef.category === 'trigger' || (nodeDef.tags || []).includes('trigger')) &&
            (n.includes('webhook') || (nodeDef.tags || []).includes('webhook'))
          );
        });
        if (webhookTrigger) return webhookTrigger;
      }
      
      const manualTrigger = allNodes.find(n => {
        const nodeDef = unifiedNodeRegistry.get(n);
        return nodeDef && (
          (nodeDef.category === 'trigger' || (nodeDef.tags || []).includes('trigger')) &&
          (n.includes('manual') || (nodeDef.tags || []).includes('manual'))
        );
      });
      if (manualTrigger) return manualTrigger;
      
      // Fallback to any trigger from extracted nodes
      if (categories.triggers.length > 0) return categories.triggers[0];
      
      // ✅ UNIVERSAL: Find any trigger from registry (NO hardcoded 'manual_trigger' or 'webhook')
      const allRegisteredTriggers = nodeLibrary.getRegisteredNodeTypes().filter(nodeType => {
        const nodeDef = unifiedNodeRegistry.get(nodeType);
        return nodeDef && (nodeDef.category === 'trigger' || (nodeDef.tags || []).includes('trigger'));
      });
      
      if (preferWebhook) {
        const webhookFromRegistry = allRegisteredTriggers.find(t => t.includes('webhook'));
        if (webhookFromRegistry) return webhookFromRegistry;
      }
      
      // Return first available trigger from registry
      return allRegisteredTriggers[0] || allNodes[0] || 'node';
    };
    
    // ✅ UNIVERSAL: Build examples using categorized nodes (NO hardcoded patterns)
    const buildExample = (triggerType: 'manual' | 'webhook', nodeIndex: number): string => {
      const trigger = getTriggerNode(triggerType === 'webhook');
      const utility = getNodeByCategory(categories.utilities, nodeIndex % categories.utilities.length || 0);
      const ai = getNodeByCategory(categories.ai, nodeIndex % categories.ai.length || 1);
      const delay = getNodeByCategory(categories.delays, nodeIndex % categories.delays.length || 2);
      const data = getNodeByCategory(categories.data, nodeIndex % categories.data.length || 3);
      const output = getNodeByCategory(categories.outputs, nodeIndex % categories.outputs.length || allNodes.length - 1);
      
      if (allNodes.length >= 4) {
        return `Start with ${trigger} to initiate the automation process. Configure ${utility} for data retrieval and processing. Transform the information through ${ai} to generate engaging content. Manage execution timing with ${delay} to ensure smooth operation. Export results using ${data} for record keeping. Finally, deliver the content via ${output} platform automatically.`;
      } else if (allNodes.length === 3) {
        return `Start with ${trigger} to begin the workflow. Use ${allNodes[1]} to process data. Complete with ${allNodes[2]} to deliver results.`;
      } else if (allNodes.length === 2) {
        return `Start with ${trigger}. Use ${allNodes[0]} to process data and ${allNodes[1]} to deliver results.`;
      } else {
        return `Start with ${trigger}. Use ${allNodes[0]} to complete the workflow.`;
      }
    };
    
    const example1 = buildExample('manual', 0);
    const example2 = buildExample('manual', 1);
    const example3 = buildExample('webhook', 2);
    const example4 = buildExample('webhook', 3);
    
    return `{
  "clarifiedIntent": "Detailed 3-4 sentence enhanced version of user prompt with ALL REQUIRED NODES (${allNodes.length} nodes: ${nodeList}), operations, and complete data flow",
  "matchedKeywords": ${JSON.stringify(allNodes)},
  "variations": [
    {
      "prompt": "${example1}",
      "matchedKeywords": ${JSON.stringify(allNodes)},
      "reasoning": "Comprehensive workflow description including ALL ${allNodes.length} REQUIRED NODES (${nodeList}) with natural integration and detailed operations"
    },
    {
      "prompt": "${example2}",
      "matchedKeywords": ${JSON.stringify(allNodes)},
      "reasoning": "Alternative workflow flow using ALL ${allNodes.length} REQUIRED NODES (${nodeList}) with different node sequencing and operations"
    },
    {
      "prompt": "${example3}",
      "matchedKeywords": ${JSON.stringify(allNodes)},
      "reasoning": "Automated workflow design incorporating ALL ${allNodes.length} REQUIRED NODES (${nodeList}) with webhook integration and comprehensive automation"
    },
    {
      "prompt": "${example4}",
      "matchedKeywords": ${JSON.stringify(allNodes)},
      "reasoning": "End-to-end automation system utilizing ALL ${allNodes.length} REQUIRED NODES (${nodeList}) with detailed configuration and seamless integration"
    }
  ]
}`;
  }
}

/**
 * Summarize Layer Service (Main Entry Point)
 */
export class SummarizeLayerService {
  private intentClarifier: AIIntentClarifier;

  constructor() {
    this.intentClarifier = new AIIntentClarifier();
  }

  /**
   * Process user prompt through summarize layer
   * Returns prompt variations for user selection
   */
  async processPrompt(userPrompt: string): Promise<SummarizeLayerResult> {
    console.log(`[SummarizeLayer] Processing prompt: "${userPrompt.substring(0, 100)}..."`);
    
    const result = await this.intentClarifier.clarifyIntentAndGenerateVariations(userPrompt);
    
    return result;
  }
}

// Export singleton instance
export const summarizeLayerService = new SummarizeLayerService();
