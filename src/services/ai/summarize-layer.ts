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

export interface AliasKeyword {
  keyword: string;
  nodeType: string;
  source: 'keywords' | 'aiSelectionCriteria' | 'useCases' | 'aliases' | 'capabilities' | 'semantic_equivalents';
}

export interface PromptVariation {
  id: string;
  prompt: string;
  matchedKeywords: string[];
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

    // Step 2: Build AI prompt with user prompt + all keywords (optimized)
    const aiPrompt = this.buildClarificationPrompt(userPrompt, allKeywords);

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
            system: this.getSystemPrompt(),
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
        const result = this.parseAIResponse(aiResponse, userPrompt, allKeywordData);
        
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
            
            // Check for node keywords (indicates meaningful prompt with keywords)
            const nodeKeywords = ['google_sheets', 'google_gmail', 'gmail', 'slack', 'slack_message', 
                                 'manual_trigger', 'webhook', 'ai_chat_model', 'ai_service', 'hubspot', 
                                 'salesforce', 'zoho_crm', 'discord', 'email', 'trigger'];
            const hasNodeKeywords = nodeKeywords.some(keyword => promptLower.includes(keyword));
            
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

    // All retries exhausted - return fallback
    console.error('[AIIntentClarifier] ❌ All attempts failed, using fallback');
    return this.createFallbackResult(userPrompt, allKeywords, lastError);
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
      
      // Check for OR patterns with output nodes
      if (promptLower.match(/\bor\s+(zoho_crm|salesforce|slack_message|google_gmail|gmail|slack|hubspot|pipedrive)/i)) {
        console.warn(`[AIIntentClarifier] ⚠️  Variation contains OR option: ${variation.prompt.substring(0, 100)}`);
        return false;
      }
      
      // Check for "either" patterns
      if (promptLower.match(/\beither\s+(zoho_crm|salesforce|slack_message|google_gmail|gmail|slack|hubspot|pipedrive)/i)) {
        console.warn(`[AIIntentClarifier] ⚠️  Variation contains "either" option: ${variation.prompt.substring(0, 100)}`);
        return false;
      }
    }
    
    // ✅ CRITICAL FIX: Check for uniqueness (different output nodes OR different triggers)
    const outputNodes = result.promptVariations.map(v => {
      const prompt = v.prompt.toLowerCase();
      if (prompt.includes('zoho_crm')) return 'zoho_crm';
      if (prompt.includes('salesforce')) return 'salesforce';
      if (prompt.includes('slack_message') || (prompt.includes('slack') && !prompt.includes('slack_message'))) return 'slack_message';
      if (prompt.includes('google_gmail') || prompt.includes('gmail')) return 'google_gmail';
      if (prompt.includes('hubspot')) return 'hubspot';
      if (prompt.includes('pipedrive')) return 'pipedrive';
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
   * ✅ PRODUCTION: Create fallback result with multiple variations
   * Ensures users always see multiple options, not just 1
   */
  private createFallbackResult(
    userPrompt: string,
    allKeywords: string[],
    error: Error | null
  ): SummarizeLayerResult {
    // Analyze prompt to determine output nodes
    const promptLower = userPrompt.toLowerCase();
    const hasGmail = promptLower.includes('gmail') || promptLower.includes('email');
    const hasSlack = promptLower.includes('slack');
    const hasSheets = promptLower.includes('sheet') || promptLower.includes('spreadsheet');
    const hasAI = promptLower.includes('ai') || promptLower.includes('analyze') || promptLower.includes('summary');
    
    // Create variations with different triggers and outputs
    const variations: Array<{ id: string; prompt: string; matchedKeywords: string[]; confidence: number; reasoning: string }> = [];
    
    // Variation 1: manual_trigger + original output
    let output1 = hasGmail ? 'google_gmail' : (hasSlack ? 'slack_message' : 'google_gmail');
    let basePrompt1 = userPrompt;
    // ✅ UNIVERSAL FIX: Remove hardcoded Google Sheets injection
    // AI Input Resolver will understand user intent and generate appropriate prompts dynamically
    // No need to inject "Read data from Google Sheets" - let AI understand from context
    if (!basePrompt1.toLowerCase().includes('manual_trigger') && !basePrompt1.toLowerCase().includes('manual trigger')) {
      basePrompt1 = `Create a workflow with manual_trigger. ${basePrompt1}`;
    }
    variations.push({
      id: 'fallback-1',
      prompt: basePrompt1,
      matchedKeywords: ['manual_trigger', hasSheets ? 'google_sheets' : '', output1].filter(Boolean),
      confidence: 0.7,
      reasoning: 'Fallback variation with manual_trigger'
    });
    
    // Variation 2: webhook + original output
    let basePrompt2 = userPrompt;
    // ✅ UNIVERSAL FIX: Remove hardcoded Google Sheets injection
    if (!basePrompt2.toLowerCase().includes('webhook')) {
      basePrompt2 = `Create a webhook-triggered workflow. ${basePrompt2}`;
    }
    variations.push({
      id: 'fallback-2',
      prompt: basePrompt2,
      matchedKeywords: ['webhook', hasSheets ? 'google_sheets' : '', output1].filter(Boolean),
      confidence: 0.7,
      reasoning: 'Fallback variation with webhook trigger'
    });
    
    // Variation 3: manual_trigger + alternative output (slack if gmail, gmail if slack)
    let output3 = hasGmail ? 'slack_message' : 'google_gmail';
    let basePrompt3 = userPrompt.replace(/gmail/gi, 'Slack').replace(/email/gi, 'Slack message');
    // ✅ UNIVERSAL FIX: Remove hardcoded Google Sheets injection
    if (!basePrompt3.toLowerCase().includes('manual_trigger') && !basePrompt3.toLowerCase().includes('manual trigger')) {
      basePrompt3 = `Create a workflow with manual_trigger. ${basePrompt3}`;
    }
    variations.push({
      id: 'fallback-3',
      prompt: basePrompt3,
      matchedKeywords: ['manual_trigger', hasSheets ? 'google_sheets' : '', output3].filter(Boolean),
      confidence: 0.6,
      reasoning: 'Fallback variation with alternative output node'
    });
    
    // Variation 4: webhook + alternative output
    let basePrompt4 = userPrompt.replace(/gmail/gi, 'Slack').replace(/email/gi, 'Slack message');
    // ✅ UNIVERSAL FIX: Remove hardcoded Google Sheets injection
    if (!basePrompt4.toLowerCase().includes('webhook')) {
      basePrompt4 = `Create a webhook-triggered workflow. ${basePrompt4}`;
    }
    variations.push({
      id: 'fallback-4',
      prompt: basePrompt4,
      matchedKeywords: ['webhook', hasSheets ? 'google_sheets' : '', output3].filter(Boolean),
      confidence: 0.6,
      reasoning: 'Fallback variation with webhook and alternative output'
    });
    
    return {
      shouldShowLayer: true, // Show layer even in fallback - users see multiple options
      originalPrompt: userPrompt,
      promptVariations: variations,
      allKeywords: allKeywords,
      matchedKeywords: [],
    };
  }

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
  private buildClarificationPrompt(userPrompt: string, allKeywords: string[]): string {
    // ✅ Analyze prompt structure using registry
    const structure = this.analyzePromptStructure(userPrompt);
    
    // ✅ UNIVERSAL: Smart keyword filtering with semantic equivalence expansion
    // Filter keywords that might be relevant to the user prompt
    // AND automatically include semantic equivalents for matched nodes
    const promptLower = userPrompt.toLowerCase();
    const relevantKeywords = this.filterRelevantKeywordsWithSemanticExpansion(allKeywords, promptLower);
    
    // Use top 300 most relevant keywords (reduces token usage while maintaining accuracy)
    const keywordsToUse = relevantKeywords.length > 0 
      ? relevantKeywords.slice(0, 300)
      : allKeywords.slice(0, 300);

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

    return `User Prompt: "${userPrompt}"

Available Node Keywords (${keywordsToUse.length} most relevant keywords from ${allKeywords.length} total):
${keywordsToUse.join(', ')}

✅ ROOT-LEVEL ARCHITECTURE ANALYSIS:
${workflowStructureGuidance}

DETECTED NODE TYPES:
${structure.crmNodes.length > 0 ? `- CRM nodes: ${structure.crmNodes.join(', ')} (capability: 'crm' or 'write_crm')` : ''}
${structure.notificationNodes.length > 0 ? `- Notification nodes: ${structure.notificationNodes.join(', ')} (capability: 'communication', 'send_email', 'send_message', 'notification')` : ''}
${structure.transformationNodes.length > 0 ? `- Transformation nodes: ${structure.transformationNodes.join(', ')} (capability: 'transformation', 'ai_processing', 'llm')` : ''}
${structure.triggerTypes.length > 0 ? `- Trigger types: ${structure.triggerTypes.join(', ')}` : ''}

🚨 CRITICAL REQUIREMENT - READ CAREFULLY:
You MUST generate EXACTLY 4 (FOUR) UNIQUE, SPECIFIC prompt variations. Each variation MUST:
- Follow the workflow structure detected above (conditional or linear)
${structure.isConditional ? '- For conditional workflows: Specify ONE CRM node (true branch) AND ONE notification node (false branch) in the SAME workflow' : '- For linear workflows: Specify ONE output node per variation'}
- Use DIFFERENT node combinations across variations
- Use DIFFERENT triggers (Variations 1-2: manual_trigger, Variations 3-4: webhook)
- Be 3-4 lines long with specific details
- Be obviously different from other variations

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

EXAMPLE OF GOOD VARIATIONS (User prompt: "score leads, route qualified to zoho_crm or salesforce, notify non-qualified via slack_message or google_gmail"):

Variation 1 (manual_trigger + zoho_crm + slack_message):
"Create a workflow that starts with a manual_trigger node. Use ai_chat_model to analyze and score incoming leads based on specific qualification metrics. Use if_else node to route leads: qualified leads go to zoho_crm node to create or update CRM records, while non-qualified leads trigger slack_message node to send notifications to the sales team channel with lead details and disqualification reasons."

Variation 2 (manual_trigger + salesforce + google_gmail):
"Build a workflow automation beginning with manual_trigger. Process incoming leads through ai_chat_model node configured for lead scoring and qualification analysis. Implement conditional routing with if_else node: route qualified leads to salesforce node to automatically create lead records in the CRM system, and send email notifications via google_gmail node for non-qualified leads to inform the sales team about the lead status and scoring details."

Variation 3 (webhook + zoho_crm + google_gmail):
"Design a webhook-triggered workflow that receives incoming lead data via webhook trigger. Analyze and score leads using ai_chat_model node based on specific qualification metrics. Use if_else node for conditional routing: qualified leads are routed to zoho_crm node to update the CRM system with lead information, while non-qualified leads trigger google_gmail node to send email notifications to the sales team with comprehensive lead details and disqualification reasoning."

Variation 4 (webhook + salesforce + slack_message):
"Create a webhook-based workflow that starts with webhook trigger to receive incoming lead submissions. Process leads through ai_chat_model for intelligent scoring and qualification analysis. Implement if_else node to conditionally route leads: qualified leads are sent to salesforce node to create new lead records in the CRM, and non-qualified leads trigger slack_message node to send Slack notifications to the sales team channel with lead information and scoring breakdown."

EXAMPLE OF BAD VARIATIONS (DO NOT DO THIS):
❌ "use zoho_crm or salesforce" - FORBIDDEN (OR option)
❌ "send via slack_message or google_gmail" - FORBIDDEN (OR option)
❌ All variations using same output node - FORBIDDEN (not unique)
❌ All variations using same trigger - FORBIDDEN (not unique)

🚨 CRITICAL AI NODE RULE:
- ONLY include AI nodes (ai_chat_model, ai_agent, memory_node) if the user EXPLICITLY mentions:
  * "AI", "chatbot", "LLM", "summarize", "analyze", "classify", "generate", "translate"
- DO NOT add AI nodes for simple operations like:
  * "send email" → NO ai_chat_model needed
  * "read sheets and send gmail" → NO ai_chat_model needed
  * "get data and send notification" → NO ai_chat_model needed
- If user says "send email", use google_gmail or email node directly - NO AI processing needed
- If user says "summarize data and send email", THEN include ai_chat_model for summarization
- ✅ CRITICAL: For simple operations (summarize, analyze, classify), use "ai_chat_model" NOT "ai_agent"
- ✅ CRITICAL: Only use "ai_agent" when user explicitly mentions tools, memory, or multi-step reasoning
- ✅ CRITICAL: Examples should use "ai_chat_model" for summarization, NOT "AI agent"

🚨 CRITICAL FORMAT REQUIREMENT - EACH VARIATION MUST BE MEANINGFUL WITH KEYWORDS:
- Each prompt MUST contain at least 2 COMPLETE SENTENCES separated by periods (.)
- Minimum length: 90 characters (can be longer based on user prompt complexity)
- Maximum length: Any length that makes sense for the user prompt
- Each sentence should describe a different aspect:
  * Sentence 1: Describe the trigger and initial setup
  * Sentence 2: Describe the transformation/output step
  * Additional sentences: Optional, add more detail if needed
- MUST include node keywords (google_sheets, google_gmail, slack_message, manual_trigger, webhook, etc.)
- Example of GOOD format (2 sentences, 90+ chars):
  "Create a workflow with manual_trigger that reads data from google_sheets node. Send the data via google_gmail node to a recipient email address."
- Example of BAD format (too short, no keywords):
  "Read sheets and send email." ❌ TOO SHORT, NO KEYWORDS

CRITICAL: Each prompt in the variations array must:
- Be at least 90 characters long (minimum requirement)
- Contain at least 2 complete sentences (separated by periods) - MANDATORY
- Include specific node type keywords (google_sheets, google_gmail, slack_message, manual_trigger, webhook, etc.)
- Mention specific node types (ai_chat_model, if_else, zoho_crm, salesforce, slack_message, google_gmail, manual_trigger, webhook, etc.)
- For conditional workflows: Specify ONE CRM node (for qualified leads) AND ONE notification node (for non-qualified leads)
- For linear workflows: Specify EXACTLY ONE output node (NO "or" or "either")
- Use different node combinations across variations
- Variations 1-2: Use manual_trigger
- Variations 3-4: Use webhook trigger
- Describe the complete workflow flow (trigger → transformation → conditional routing → outputs)
- NOT just copy the user's original prompt
- Clearly explain the IF node routing: qualified leads → CRM, non-qualified leads → notification

OUTPUT FORMAT (STRICT JSON - NO MARKDOWN, NO CODE BLOCKS):
{
  "clarifiedIntent": "Detailed 3-4 line enhanced version of user prompt with specific node types, operations, and data flow",
  "matchedKeywords": ["keyword1", "keyword2", "keyword3"],
  "variations": [
    {
      "prompt": "Create a workflow with manual_trigger that uses google_sheets node to read all data from a specified spreadsheet. Process the retrieved data using ai_chat_model node to generate a comprehensive summary. Send the summary using google_gmail node to a specified email recipient.",
      "matchedKeywords": ["google_sheets", "google_gmail", "ai_chat_model", "manual_trigger"],
      "reasoning": "Specifies exact node types, operations, and complete data flow in 3-4 lines"
    },
    {
      "prompt": "Build an automated workflow starting with manual_trigger. Use google_sheets node with read operation to extract all rows and columns from the source spreadsheet. Apply data transformation and summarization using ai_chat_model node to analyze and condense the information. Deliver the processed summary via google_gmail node by sending it as an email to the designated recipient.",
      "matchedKeywords": ["google_sheets", "google_gmail", "ai_chat_model", "data_transformation"],
      "reasoning": "Emphasizes data processing steps with detailed operations and transformations"
    },
    {
      "prompt": "Design a workflow automation that begins with manual_trigger. Connect to google_sheets node to fetch complete spreadsheet data including all rows. Utilize ai_chat_model node to perform intelligent summarization and analysis of the extracted data. Complete the workflow by using google_gmail node to send the AI-generated summary as an email message to the specified destination.",
      "matchedKeywords": ["google_sheets", "google_gmail", "ai_chat_model", "automation"],
      "reasoning": "Highlights automation and integration aspects with specific service connections"
    },
    {
      "prompt": "Create a comprehensive workflow automation starting with manual_trigger node. Use google_sheets node to read all data from a specified Google Sheets spreadsheet, including headers and all row data. Process the retrieved data through ai_chat_model node configured for summarization to generate a detailed summary of the spreadsheet content. Finally, use google_gmail node to send the summarized content as a formatted email to a specified recipient address, including subject line and body content.",
      "matchedKeywords": ["google_sheets", "google_gmail", "ai_chat_model", "manual_trigger", "summarization"],
      "reasoning": "Comprehensive version with maximum detail including all node configurations and data flow specifics"
    }
  ]
}

🚨 CRITICAL: 
- Respond with ONLY valid JSON. No markdown, no code blocks, no explanations. Start with { and end with }.
- The "variations" array MUST contain exactly 4 items. Do not return fewer variations.
- Each "prompt" field MUST be at least 150 characters and contain 3-4 sentences (NOT 1 sentence, NOT copying user's prompt).
- ✅ ROOT-LEVEL: For conditional workflows with 3+ conditions → MUST use SWITCH node (multiple branches)
- ✅ ROOT-LEVEL: For conditional workflows with 2 conditions → MUST use IF_ELSE node (two branches)
- For conditional workflows: Each prompt MUST specify ${structure.conditionalNodeType === 'switch' ? 'MULTIPLE case branches (one per condition)' : 'ONE CRM node (for qualified) AND ONE notification node (for non-qualified) - both in the same workflow via IF_ELSE node'}.
- For linear workflows: Each prompt MUST specify EXACTLY ONE output node (NO "or" or "either" options).
- Variations 1-2: MUST use manual_trigger
- Variations 3-4: MUST use webhook trigger
- Each variation MUST use DIFFERENT combinations of nodes (different CRM, different notification, different trigger).
- Each prompt MUST specify exact node types (ai_chat_model, if_else, zoho_crm, salesforce, slack_message, google_gmail, manual_trigger, webhook, etc.), operations, and data flow.
- DO NOT copy the user's vague prompt - EXPAND it into detailed, structured descriptions with multiple sentences.
- DO NOT use "or" or "either" - specify specific nodes per variation.
- For conditional workflows: Clearly explain IF node routing (qualified → CRM, non-qualified → notification).
- Remember: JSON strings are single-line, but your prompts should have 3-4 sentences separated by periods.`;
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
  private getSystemPrompt(): string {
    return `You are a workflow automation expert who transforms vague user prompts into detailed, structured prompts for workflow builders.

🚨 CRITICAL REQUIREMENTS:
1. You MUST respond with ONLY valid JSON - no markdown, no code blocks, no explanations
2. Your response must start with { and end with }
3. If you include any text before or after the JSON, the system will fail
4. All string values must be properly escaped and quoted
5. You MUST generate EXACTLY 4 prompt variations in the "variations" array - NOT 1, NOT 2, NOT 3
6. Each prompt variation MUST be approximately 1 sentence (minimum 40 characters, ~10 words) - KEEP IT SIMPLE
7. DO NOT add unnecessary details, notes, or extra explanations - match the user's intent, don't expand it

Your role:
- You are a workflow automation expert who PRESERVES user intent
- Transform vague prompts into clear, simple prompts with essential node keywords (1 sentence, ~40 chars, ~10 words)
- ONLY add node keywords if they are clearly implied by user intent (google_sheets, google_gmail, slack_message, manual_trigger, webhook, etc.)
- DO NOT add nodes that are not mentioned or implied by the user
- Keep prompts concise - one sentence is enough if user intent is clear

CRITICAL RULES:
- PRESERVE user intent - DO NOT add unnecessary nodes or details
- Each variation MUST be approximately 1 sentence (~40 chars, ~10 words) - simple and clear
- If user says "chatbot", don't add "google_sheets" unless user explicitly mentions it
- If user gives 3-4 lines, keep it similar length - don't expand unnecessarily
- If user gives 1 line, keep it 1 sentence - don't add extra notes
- Only include node types that are directly relevant to user's request

You have access to keywords from available node types in the system.
Use these keywords to identify specific nodes and operations that match the user's intent.

OUTPUT: Valid JSON only, starting with { and ending with }.
The "variations" array MUST contain exactly 4 items, each with a 3-4 line detailed prompt.`;
  }

  /**
   * Parse AI response into structured result
   * ✅ PRODUCTION: Robust JSON parsing with multiple fallback strategies
   */
  private parseAIResponse(
    aiResponse: string,
    originalPrompt: string,
    allKeywordData: AliasKeyword[]
  ): SummarizeLayerResult {
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
          variations.push({
            id: `variation-${i + 1}`,
            prompt: variation.prompt || originalPrompt,
            matchedKeywords: variation.matchedKeywords || [],
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
          matchedKeywords: [],
          confidence: 0.5,
          reasoning: 'No variations generated, using original prompt',
        });
      }

      // Extract all matched keywords
      const matchedKeywords = new Set<string>();
      for (const variation of variations) {
        for (const keyword of variation.matchedKeywords) {
          matchedKeywords.add(keyword.toLowerCase());
        }
      }
      if (parsed.matchedKeywords && Array.isArray(parsed.matchedKeywords)) {
        for (const keyword of parsed.matchedKeywords) {
          matchedKeywords.add(keyword.toLowerCase());
        }
      }

      return {
        shouldShowLayer: variations.length > 1, // Show layer if we have multiple variations
        originalPrompt: originalPrompt,
        clarifiedIntent: parsed.clarifiedIntent || originalPrompt,
        promptVariations: variations,
        allKeywords: this.keywordCollector.getAllKeywordStrings(),
        matchedKeywords: Array.from(matchedKeywords),
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
            matchedKeywords: [],
            confidence: 0.5,
            reasoning: 'Error parsing AI response, using original prompt',
          },
        ],
        allKeywords: this.keywordCollector.getAllKeywordStrings(),
        matchedKeywords: [],
      };
    }
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
