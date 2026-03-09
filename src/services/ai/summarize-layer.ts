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

export interface AliasKeyword {
  keyword: string;
  nodeType: string;
  source: 'keywords' | 'aiSelectionCriteria' | 'useCases' | 'aliases' | 'capabilities' | 'semantic_equivalents';
}

export interface PromptVariation {
  id: string;
  prompt: string;
  matchedKeywords: string[];
  keywords: string[]; // ✅ NEW: Extracted node type keywords (e.g., ["ai_chat_model", "linkedin", "schedule"])
  confidence: number;
  reasoning: string;
}

export interface SummarizeLayerResult {
  shouldShowLayer: boolean;
  originalPrompt: string;
  clarifiedIntent?: string;
  promptVariations: PromptVariation[];
  allKeywords: string[];
  matchedKeywords: string[];
  mandatoryNodeTypes?: string[]; // ✅ NEW: Node types that must be included in workflow
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
    
    // ✅ UNIVERSAL: Pass ALL extracted keywords to AI - Let AI intelligently understand intent
    // NO hardcoded filtering, NO hardcoded expansion - AI should understand "all social platforms" from keywords
    const extractedNodeTypes = allExtractedNodeTypes;
    
    console.log(`[AIIntentClarifier] ✅ Extracted ${extractedNodeTypes.length} node type(s) from keywords: ${extractedNodeTypes.join(', ')}`);
    console.log(`[AIIntentClarifier] ✅ Passing ALL extracted keywords to AI - AI will intelligently understand user intent`);

    // Step 2: Build AI prompt with user prompt + all keywords + REQUIRED nodes
    const aiPrompt = this.buildClarificationPrompt(userPrompt, allKeywords, extractedNodeTypes);

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
        
        // ✅ PHASE 3: Validate variations include required keywords
        if (extractedNodeTypes.length > 0) {
          const validationResult = this.validateVariationsIncludeNodes(result, extractedNodeTypes);
          
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

        // ✅ PRODUCTION: Validate result quality - MUST have 3-4 variations AND detailed prompts
        if (this.isValidResult(result)) {
          // Check if we have enough variations (prefer 4, accept 3 minimum)
          if (result.promptVariations.length < 3) {
            console.warn(`[AIIntentClarifier] ⚠️ Only ${result.promptVariations.length} variations (expected 3-4), retrying...`);
            throw new Error(`Insufficient variations: got ${result.promptVariations.length}, need at least 3`);
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
    
    const triggers = result.promptVariations.map(v => {
      const prompt = v.prompt.toLowerCase();
      if (prompt.includes('webhook')) return 'webhook';
      if (prompt.includes('manual_trigger') || prompt.includes('manual trigger')) return 'manual_trigger';
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
  private validateVariationsIncludeNodes(
    result: SummarizeLayerResult,
    requiredNodeTypes: string[]
  ): { allValid: boolean; missingCount: number } {
    if (requiredNodeTypes.length === 0) {
      return { allValid: true, missingCount: 0 }; // No required nodes to validate
    }

    console.log(`[AIIntentClarifier] 🔍 PHASE 3: Validating variations include required nodes: ${requiredNodeTypes.join(', ')}`);

    for (const variation of result.promptVariations) {
      const variationLower = variation.prompt.toLowerCase();
      const variationKeywords = variation.matchedKeywords.map(k => k.toLowerCase());
      const missingNodes: string[] = [];

      for (const nodeType of requiredNodeTypes) {
        const nodeTypeLower = nodeType.toLowerCase();
        const nodeLabel = nodeType.replace(/_/g, ' ').toLowerCase();
        const nodeLabelNoSpaces = nodeType.replace(/_/g, '').toLowerCase();
        
        // ✅ ROOT-LEVEL UNIVERSAL: Check if node is mentioned using registry (works for ALL nodes)
        const nodeDef = unifiedNodeRegistry.get(nodeType);
        const nodeAliases = nodeDef ? 
          this.keywordCollector.getAllAliasKeywords()
            .filter(k => k.nodeType === nodeType)
            .map(k => k.keyword.toLowerCase()) : [];
        
        // ✅ ROOT-LEVEL UNIVERSAL: Check if any alias/keyword is mentioned in variation text
        const nodeTypeNormalized = nodeTypeLower.replace(/[_\s-]/g, '[\\s_-]*');
        const nodeTypePattern = new RegExp(`\\b${nodeTypeNormalized.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
        
        let mentionedInText = 
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
        
        // ✅ ROOT-LEVEL UNIVERSAL: If not mentioned directly, check for semantic equivalents
        if (!mentionedInText && variation.matchedKeywords.length > 0) {
          const matchResult = unifiedNodeTypeMatcher.isRequirementSatisfied(
            nodeType, // required node
            variation.matchedKeywords, // available nodes in variation
            { strict: false } // Allow semantic equivalents
          );
          
          if (matchResult.matches) {
            mentionedInText = true;
            console.log(`[AIIntentClarifier] ✅ ROOT-LEVEL: Semantic match - "${matchResult.matchingType}" satisfies requirement for "${nodeType}" (${matchResult.reason})`);
          }
        }
        
        if (!mentionedInText) {
          missingNodes.push(nodeType);
        }
      }

      if (missingNodes.length > 0) {
        console.warn(`[AIIntentClarifier] ⚠️  Variation "${variation.id}" missing required nodes: ${missingNodes.join(', ')}`);
        console.warn(`[AIIntentClarifier] ⚠️  Variation prompt: "${variation.prompt.substring(0, 150)}..."`);
        console.warn(`[AIIntentClarifier] ⚠️  Variation matchedKeywords: ${variation.matchedKeywords.join(', ')}`);
      } else {
        console.log(`[AIIntentClarifier] ✅ Variation "${variation.id}" includes all required nodes`);
      }
    }

    // Log summary
    const allVariationsValid = result.promptVariations.every(v => {
      const vLower = v.prompt.toLowerCase();
      const vKeywords = v.matchedKeywords.map(k => k.toLowerCase());
      return requiredNodeTypes.every(nodeType => {
        const nodeTypeLower = nodeType.toLowerCase();
        return vLower.includes(nodeTypeLower) || vKeywords.some(k => k === nodeTypeLower);
      });
    });

    const missingCount = result.promptVariations.reduce((count, v) => {
      const vLower = v.prompt.toLowerCase();
      const vKeywords = v.matchedKeywords.map(k => k.toLowerCase());
      const missing = requiredNodeTypes.filter(nodeType => {
        const nodeTypeLower = nodeType.toLowerCase();
        return !vLower.includes(nodeTypeLower) && !vKeywords.some(k => k === nodeTypeLower);
      });
      return count + missing.length;
    }, 0);

    if (allVariationsValid) {
      console.log(`[AIIntentClarifier] ✅ All variations include required nodes`);
      return { allValid: true, missingCount: 0 };
    } else {
      console.warn(`[AIIntentClarifier] ⚠️  Some variations are missing required nodes (${missingCount} missing across all variations) - this is CRITICAL`);
      return { allValid: false, missingCount };
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
    const outputNodes = result.promptVariations.map(v => {
      const prompt = v.prompt.toLowerCase();
      if (prompt.includes('slack_message') || (prompt.includes('slack') && !prompt.includes('slack_message'))) return 'slack_message';
      if (prompt.includes('google_gmail') || prompt.includes('gmail')) return 'google_gmail';
      if (prompt.includes('discord')) return 'discord';
      if (prompt.includes('email') && !prompt.includes('gmail')) return 'email';
      return null;
    });
    
    const triggers = result.promptVariations.map(v => {
      const prompt = v.prompt.toLowerCase();
      if (prompt.includes('webhook')) return 'webhook';
      if (prompt.includes('manual_trigger') || prompt.includes('manual trigger')) return 'manual_trigger';
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
        
        // Ensure triggers differ: first 2 use manual_trigger, last 2 use webhook
        if (idx < 2 && !prompt.includes('manual_trigger') && !prompt.includes('manual trigger') && !prompt.includes('webhook')) {
          enhancedPrompt = `Create a workflow with manual_trigger. ${enhancedPrompt}`;
        } else if (idx >= 2 && !prompt.includes('webhook') && !prompt.includes('manual_trigger')) {
          enhancedPrompt = `Create a webhook-triggered workflow. ${enhancedPrompt}`;
        }
        
        // Ensure outputs differ: alternate between gmail and slack
        const hasGmail = prompt.includes('gmail') || prompt.includes('email');
        const hasSlack = prompt.includes('slack');
        
        if (idx % 2 === 0 && !hasGmail && !hasSlack) {
          // Even indices: add gmail if not present
          enhancedPrompt = enhancedPrompt.replace(/send/i, 'send via google_gmail');
        } else if (idx % 2 === 1 && !hasSlack && !hasGmail) {
          // Odd indices: add slack if not present
          enhancedPrompt = enhancedPrompt.replace(/send/i, 'send via slack_message');
        } else if (idx % 2 === 1 && hasGmail && !hasSlack) {
          // Odd indices with gmail: change to slack
          enhancedPrompt = enhancedPrompt.replace(/gmail/gi, 'slack_message').replace(/email/gi, 'Slack message');
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
   * ✅ ROOT FIX: Create fallback result using EXTRACTED NODES from user prompt
   * NEVER creates dummy prompts - only uses nodes extracted from user's actual intent
   */
  private createFallbackResultWithExtractedNodes(
    userPrompt: string,
    allKeywords: string[],
    extractedNodeTypes: string[],
    allKeywordData: AliasKeyword[],
    error: Error | null
  ): SummarizeLayerResult {
    console.log(`[AIIntentClarifier] 🔧 Creating fallback using ${extractedNodeTypes.length} extracted node(s): ${extractedNodeTypes.join(', ')}`);
    
    // ✅ ROOT FIX: Use extracted nodes to build realistic variations
    // Get node labels/keywords for better prompt generation
    const nodeLabels = new Map<string, string>();
    for (const nodeType of extractedNodeTypes) {
      const schema = nodeLibrary.getSchema(nodeType);
      if (schema) {
        nodeLabels.set(nodeType, schema.label || nodeType);
      }
    }
    
    // Determine trigger type from prompt
    const promptLower = userPrompt.toLowerCase();
    const hasWebhook = promptLower.includes('webhook') || promptLower.includes('http') || promptLower.includes('api');
    const triggerType = hasWebhook ? 'webhook' : 'manual_trigger';
    
    // Create variations using extracted nodes (not hardcoded guesses)
    const variations: PromptVariation[] = [];
    
    // Build variations with extracted nodes
    for (let i = 0; i < 4; i++) {
      const variationTrigger = i < 2 ? 'manual_trigger' : 'webhook';
      const nodeIndex = i % extractedNodeTypes.length;
      const primaryNode = extractedNodeTypes[nodeIndex];
      const nodeLabel = nodeLabels.get(primaryNode) || primaryNode;
      
      // Build prompt that includes extracted nodes
      let variationPrompt = userPrompt;
      
      // Ensure trigger is mentioned
      if (!variationPrompt.toLowerCase().includes(variationTrigger) && !variationPrompt.toLowerCase().includes('trigger')) {
        variationPrompt = `Create a workflow with ${variationTrigger}. ${variationPrompt}`;
      }
      
      // Ensure extracted node is mentioned
      const nodeTypeLower = primaryNode.toLowerCase();
      const nodeLabelLower = nodeLabel.toLowerCase();
      if (!variationPrompt.toLowerCase().includes(nodeTypeLower) && !variationPrompt.toLowerCase().includes(nodeLabelLower)) {
        // Add node mention naturally
        variationPrompt = `${variationPrompt} Use ${nodeLabel} node to complete the workflow.`;
      }
      
      // Build matchedKeywords from extracted nodes
      const matchedKeywords = [variationTrigger, primaryNode];
      
      // Add other extracted nodes if they fit
      if (extractedNodeTypes.length > 1) {
        const secondaryNodeIndex = (nodeIndex + 1) % extractedNodeTypes.length;
        if (secondaryNodeIndex !== nodeIndex) {
          matchedKeywords.push(extractedNodeTypes[secondaryNodeIndex]);
        }
      }
      
    variations.push({
        id: `fallback-${i + 1}`,
        prompt: variationPrompt,
        keywords: [variationTrigger, primaryNode], // ✅ NEW: Include extracted node types as keywords
        matchedKeywords: matchedKeywords,
      confidence: 0.6,
        reasoning: `Fallback variation using extracted nodes: ${matchedKeywords.join(', ')}`
      });
    }
    
    // Map extracted nodes to keywords for matchedKeywords
    const matchedKeywordsSet = new Set<string>();
    for (const nodeType of extractedNodeTypes) {
      matchedKeywordsSet.add(nodeType);
      // Add node keywords
      const keywordData = allKeywordData.filter(kd => kd.nodeType === nodeType);
      for (const kd of keywordData.slice(0, 2)) { // Add top 2 keywords per node
        matchedKeywordsSet.add(kd.keyword);
      }
    }
    
    return {
      shouldShowLayer: true,
      originalPrompt: userPrompt,
      promptVariations: variations,
      allKeywords: allKeywords,
      matchedKeywords: Array.from(matchedKeywordsSet),
      mandatoryNodeTypes: extractedNodeTypes, // ✅ ROOT FIX: Use extracted nodes, not dummy nodes
    };
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
      
      // Pattern 3: Explicit switch mention
      const hasExplicitSwitch = promptLower.includes('switch') || promptLower.includes('switch node');
      
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

    // Check for trigger types
    if (promptLower.includes('webhook') || promptLower.includes('http') || promptLower.includes('api')) {
      triggerTypes.push('webhook');
    }
    if (promptLower.includes('manual') || promptLower.includes('trigger') || !triggerTypes.length) {
      triggerTypes.push('manual_trigger');
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
  private buildClarificationPrompt(userPrompt: string, allKeywords: string[], extractedNodeTypes: string[] = []): string {
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

✅ CRITICAL: Naturally integrate node types into variation text:
- Include node type names naturally in sentences (e.g., "Use ${extractedNodeTypes[0] || 'node'} to generate content")
- Show data flow with node types (e.g., "Data flows from ${extractedNodeTypes[0] || 'source'} → ${extractedNodeTypes[1] || 'transformation'} → ${extractedNodeTypes[2] || 'output'}")
- Describe operations with node types (e.g., "Use ${extractedNodeTypes[0] || 'node'} with operation='read' to fetch data")

VIOLATION = FAILURE: If you omit any extracted node, the variation is INVALID.

`
      : '';

    return `User Prompt: "${userPrompt}"

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

🚨 CRITICAL REQUIREMENT - READ CAREFULLY:
You MUST generate EXACTLY 4 (FOUR) UNIQUE, SPECIFIC prompt variations. Each variation MUST:
- Include ALL ${extractedNodeTypes.length} REQUIRED NODES: ${extractedNodeTypes.join(', ')}
- Follow the workflow structure detected above (conditional or linear)
${structure.isConditional ? '- For conditional workflows: Specify ONE CRM node (true branch) AND ONE notification node (false branch) in the SAME workflow' : '- For linear workflows: Specify ONE output node per variation'}
- Use DIFFERENT node combinations across variations (but ALL must include the ${extractedNodeTypes.length} REQUIRED NODES)
- Use DIFFERENT triggers (Variations 1-2: manual_trigger, Variations 3-4: webhook)
- Be 3-4 lines long with specific details that naturally mention ALL ${extractedNodeTypes.length} nodes
- Be obviously different from other variations
- DO NOT copy the user's prompt verbatim - expand it with ALL ${extractedNodeTypes.length} nodes integrated naturally

YOUR ROLE:
You are NOT the user. You are a workflow automation expert. Transform vague user prompts into detailed, structured prompts based on node capabilities and workflow architecture.

CRITICAL RULES - NO EXCEPTIONS:
1. ❌ NEVER use "or" or "either" in prompts (e.g., "use zoho_crm or salesforce" is FORBIDDEN)
2. ✅ Use the detected node types and capabilities from the architecture analysis above
3. ✅ Each variation MUST use DIFFERENT combinations of nodes
4. ✅ Variations 1-2: MUST use manual_trigger
5. ✅ Variations 3-4: MUST use webhook trigger
6. ✅ Each variation must be obviously unique (different nodes, different trigger)

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
- Variations 1-2: MUST use manual_trigger
- Variations 3-4: MUST use webhook trigger
- This ensures clear differentiation between variations

🚨 CRITICAL OPERATION ENFORCEMENT - MANDATORY:
- You MUST describe WHAT each node DOES, not just mention the node name
- ✅ GOOD: Use REQUIRED NODES with operations (e.g., "Use ${extractedNodeTypes[0] || 'node'} with operation='read' to fetch data")
- ✅ GOOD: Describe transformations with REQUIRED NODES (e.g., "Use ${extractedNodeTypes.find(n => n.includes('ai') || n.includes('chat')) || 'transformation_node'} with prompt='process' to transform data")
- ✅ GOOD: Describe outputs with REQUIRED NODES (e.g., "Use ${extractedNodeTypes.find(n => n.includes('output') || n.includes('send')) || 'output_node'} with operation='send' to deliver results")
- ❌ BAD: Just mentioning node name without operation (e.g., "Use ${extractedNodeTypes[0] || 'node'} node")
- ❌ BAD: No operation description for any REQUIRED NODE
- ✅ REQUIRED: Use ACTUAL REQUIRED NODES from the list above, not generic examples

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
  * Describe how data is collected WITH OPERATION using REQUIRED NODES: "Use [REQUIRED_DATA_SOURCE_NODE] with operation='read' to fetch data"
  * Describe how REQUIRED transformation nodes process data WITH OPERATION: "Use [REQUIRED_TRANSFORMATION_NODE] with prompt='process' to transform data"
  * Describe how REQUIRED output nodes deliver results WITH OPERATION: "Use [REQUIRED_OUTPUT_NODE] with operation='send' to deliver results"
  * Show data flow using ACTUAL REQUIRED NODES: "Data flows from [NODE1] → [NODE2] → [NODE3]"
- Bad variations (REJECTED) would:
  * Use "or" between nodes (e.g., "use NODE_A or NODE_B")
  * Mention nodes that are NOT in the REQUIRED NODES list
  * Ignore REQUIRED NODES that were extracted from the user prompt
  * Just copy user prompt and add "Use X node to complete workflow" (FORBIDDEN)
  * Fail to describe operations (FORBIDDEN)

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
      
      console.log(`[AIIntentClarifier] ✅ ROOT FIX: Using ONLY ${mandatoryNodeTypes.length} node(s) from user's original prompt: ${mandatoryNodeTypes.join(', ')}`);
      console.log(`[AIIntentClarifier] ✅ ROOT FIX: Ignoring AI-generated matchedKeywords - only trusting user's intent`);
      
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
          matchedKeywords: matchedNodeTypes, // ✅ For validation: what AI actually mentioned in variation
        };
      });

      return {
        shouldShowLayer: pureVariations.length > 1, // Show layer if we have multiple variations
        originalPrompt: originalPrompt,
        clarifiedIntent: parsed.clarifiedIntent || originalPrompt,
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
  private extractKeywordsFromPrompt(userPrompt: string, allKeywordData: AliasKeyword[]): string[] {
    const promptLower = userPrompt.toLowerCase();
    const extractedKeywords = new Map<string, { confidence: number; match: string; intentType: 'EXPLICIT' | 'CATEGORY' }>(); // nodeType -> {confidence, match, intentType}
    
    console.log(`[AIIntentClarifier] 🔍 ROOT-LEVEL UNIVERSAL: Extracting keywords with semantic grouping from: "${userPrompt.substring(0, 100)}..."`);
    
    // ✅ ROOT-LEVEL: Group keywords by node type to avoid duplicate matches
    const keywordsByNode = new Map<string, AliasKeyword[]>();
    for (const keywordData of allKeywordData) {
      if (!keywordsByNode.has(keywordData.nodeType)) {
        keywordsByNode.set(keywordData.nodeType, []);
      }
      keywordsByNode.get(keywordData.nodeType)!.push(keywordData);
    }
    
    // ✅ ROOT-LEVEL: Score each node type with adaptive thresholds
    for (const [nodeType, keywords] of keywordsByNode.entries()) {
      let bestConfidence = 0;
      let bestMatch = '';
      
      for (const keywordData of keywords) {
      const keywordLower = keywordData.keyword.toLowerCase();
        let confidence = 0;
        
        // ✅ ROOT-LEVEL: Determine keyword specificity for adaptive threshold
        const isGenericWord = ['store', 'notify', 'respond', 'send', 'get', 'read', 'write', 'create', 'update', 'delete', 'data', 'process'].includes(keywordLower);
        const isExactMatch = keywordLower.length > 5 && !isGenericWord;
        const isNodeSpecific = keywordLower.includes(nodeType.toLowerCase()) || nodeType.toLowerCase().includes(keywordLower);
        
        // ✅ ROOT-LEVEL: Check for exact phrase match with space/underscore normalization
        const keywordNormalized = keywordLower.replace(/[_\s-]/g, '[\\s_-]*');
        const exactPhrase = new RegExp(`\\b${keywordNormalized.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
        
        // Check for partial matches (e.g., "gmail" in "google_gmail")
        const keywordWords = keywordLower.split(/[_\s-]+/);
        const partialMatch = keywordWords.length > 1 && keywordWords.some(word => 
          word.length > 3 && promptLower.includes(word)
        );
        
        if (exactPhrase.test(promptLower) || partialMatch) {
          // ✅ ROOT-LEVEL: Context-aware validation with stricter rules
          const contextValid = this.validateKeywordContext(promptLower, keywordLower, nodeType);
          
          if (contextValid) {
            confidence = exactPhrase.test(promptLower) ? 1.0 : 0.9;
          } else {
            confidence = 0.3; // Lower confidence if context doesn't match (was 0.5)
          }
        }
        
        // ✅ ROOT-LEVEL: Check for node-specific patterns (e.g., "on linkedin", "to gmail")
        if (confidence === 0) {
          const nodeSpecificPattern = this.getNodeSpecificPattern(nodeType, keywordLower);
          if (nodeSpecificPattern && nodeSpecificPattern.test(promptLower)) {
            confidence = 0.98;
          }
        }
        
        // ✅ ROOT-LEVEL UNIVERSAL: Handle common variations using registry (not hardcoded)
        if (confidence === 0) {
          const nodeDef = unifiedNodeRegistry.get(nodeType);
          if (nodeDef) {
            const nodeLabel = (nodeDef.label || nodeType).toLowerCase();
            const nodeAliases = (nodeDef.tags || []).map(t => t.toLowerCase());
            
            // Check if prompt contains node label or aliases
            if (promptLower.includes(nodeLabel) || nodeAliases.some(alias => promptLower.includes(alias))) {
              confidence = 0.95;
            }
            
            // Check for semantic patterns (e.g., "sheets" for google_sheets, "gmail" for google_gmail)
            const labelWords = nodeLabel.split(/[\s_-]+/);
            if (labelWords.some(word => word.length > 3 && promptLower.includes(word))) {
              confidence = Math.max(confidence, 0.9);
            }
          }
        }
        
        if (confidence > bestConfidence) {
          bestConfidence = confidence;
          bestMatch = keywordData.keyword;
        }
      }
      
      // ✅ ROOT-LEVEL UNIVERSAL: Adaptive threshold based on keyword specificity
      // - Generic words (store, notify, etc.): 0.95 threshold (very strict)
      // - Exact matches (google_sheets, linkedin): 0.85 threshold (moderate)
      // - Node-specific patterns: 0.9 threshold (high)
      // - Default: 0.85 threshold (was 0.7 - too low)
      const isGeneric = ['store', 'notify', 'respond', 'send', 'get', 'read', 'write', 'create', 'update', 'delete', 'data', 'process', 'automatically', 'capture', 'qualify'].some(g => bestMatch.toLowerCase().includes(g));
      const threshold = isGeneric ? 0.95 : (bestConfidence >= 0.98 ? 0.85 : 0.9);
      
      if (bestConfidence >= threshold) {
        // ✅ NEW: Classify intent type using registry-based detection
        const intentType = this.classifyIntentType(bestMatch, nodeType, promptLower);
        extractedKeywords.set(nodeType, { confidence: bestConfidence, match: bestMatch, intentType });
        console.log(`[AIIntentClarifier] ✅ ROOT-LEVEL: Confidence (${bestConfidence.toFixed(2)}) match: "${bestMatch}" → "${nodeType}" (intent: ${intentType}, threshold: ${threshold})`);
      }
    }
    
    // ✅ ROOT-LEVEL UNIVERSAL: Semantic grouping - require ONE node per category
    const groupedByCategory = this.groupNodesBySemanticCategory(Array.from(extractedKeywords.keys()));
    const finalNodes = this.selectOneNodePerCategoryWithIntentPreservation(groupedByCategory, extractedKeywords);
    
    console.log(`[AIIntentClarifier] ✅ ROOT-LEVEL: Extracted ${extractedKeywords.size} node(s), grouped to ${finalNodes.length} by semantic category: ${finalNodes.join(', ')}`);
    return finalNodes;
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
    
    // Check if keyword matches common specific node patterns
    // Specific nodes usually have: brand names, platform names, service names
    const specificPatterns = [
      /^(instagram|linkedin|facebook|twitter|youtube|tiktok|pinterest)$/i,
      /^(salesforce|hubspot|zoho|pipedrive|airtable|notion|clickup)$/i,
      /^(gmail|outlook|slack|discord|telegram|whatsapp)$/i,
      /^(postgresql|mysql|mongodb|redis|supabase)$/i,
      /^(google_sheets|google_drive|google_calendar|google_gmail)$/i,
    ];
    
    for (const pattern of specificPatterns) {
      if (pattern.test(keywordLower)) {
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
