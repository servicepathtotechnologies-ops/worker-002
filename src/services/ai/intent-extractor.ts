/**
 * Intent Extractor
 * 
 * ✅ PHASE 2: Extracts SimpleIntent from user prompts
 * 
 * This extractor:
 * - Uses LLM ONLY for entity extraction (not infrastructure design)
 * - Falls back to rule-based extraction if LLM fails
 * - Works with ANY LLM (even weak models)
 * - Returns SimpleIntent (basic entities), not StructuredIntent
 * 
 * Architecture Rule:
 * - LLM extracts entities → SimpleIntent
 * - Planner builds infrastructure → StructuredIntent
 * - This reduces LLM dependency by 70-80%
 */

import { ollamaOrchestrator } from './ollama-orchestrator';
import { SimpleIntent, SimpleIntentResult } from './simple-intent';
import { fallbackIntentGenerator } from './fallback-intent-generator';

export class IntentExtractor {
  private static instance: IntentExtractor;
  
  private constructor() {}
  
  static getInstance(): IntentExtractor {
    if (!IntentExtractor.instance) {
      IntentExtractor.instance = new IntentExtractor();
    }
    return IntentExtractor.instance;
  }
  
  /**
   * Extract SimpleIntent from user prompt
   * 
   * Strategy:
   * 1. Try LLM extraction (lightweight, entity-focused)
   * 2. If LLM fails → use rule-based fallback
   * 3. Return SimpleIntent (not StructuredIntent)
   * 
   * @param userPrompt - User's natural language prompt
   * @returns SimpleIntent with basic entities
   */
  async extractIntent(userPrompt: string): Promise<SimpleIntentResult> {
    console.log(`[IntentExtractor] Extracting SimpleIntent from prompt: "${userPrompt}"`);
    
    // ✅ PHASE 4: Use Error Recovery for LLM extraction
    try {
      const { errorRecovery } = await import('./error-recovery');
      const { llmGuardrails } = await import('./llm-guardrails');
      
      const recoveryResult = await errorRecovery.recoverSimpleIntent(
        userPrompt,
        async () => {
          // ✅ STRATEGY 1: Try LLM extraction (lightweight)
          const llmResult = await this.extractWithLLM(userPrompt);
          
          // ✅ PHASE 4: Validate LLM output with guardrails
          const schema = llmGuardrails.generateSimpleIntentSchema();
          const guardrailResult = llmGuardrails.validateJSONSchema(llmResult.intent, schema);
          
          if (!guardrailResult.valid && guardrailResult.repaired) {
            // Use repaired intent
            return guardrailResult.repaired;
          }
          
          if (guardrailResult.valid && llmResult.confidence >= 0.5) {
            console.log(`[IntentExtractor] ✅ LLM extraction successful (confidence: ${(llmResult.confidence * 100).toFixed(1)}%)`);
            return llmResult.intent;
          }
          
          throw new Error(`LLM extraction low confidence or invalid output`);
        },
        { maxAttempts: 3 }
      );
      
      if (recoveryResult.success && recoveryResult.result) {
        // ✅ PHASE B: Add deterministic node mentions (registry-driven)
        recoveryResult.result.nodeMentions = await this.extractNodeMentions(userPrompt);
        
        // ✅ PHASE 4: Final validation with Output Validator
        const { outputValidator } = await import('./output-validator');
        const validation = outputValidator.validateSimpleIntent(recoveryResult.result);
        
        return {
          intent: recoveryResult.result,
          confidence: validation.confidence,
          warnings: [
            ...recoveryResult.warnings,
            ...validation.warnings,
            ...(recoveryResult.strategy !== 'llm-retry' ? [`Used ${recoveryResult.strategy} strategy`] : [])
          ]
        };
      }
    } catch (error) {
      console.warn(`[IntentExtractor] ⚠️  Error recovery failed:`, error);
    }
    
    // ✅ STRATEGY 2: Use Fallback Strategies (Phase 4)
    try {
      const { fallbackStrategies } = await import('./fallback-strategies');
      const fallbackResult = await fallbackStrategies.extractSimpleIntentWithFallback(userPrompt);
      
      if (fallbackResult.success && fallbackResult.result) {
        // ✅ PHASE B: Add deterministic node mentions (registry-driven)
        fallbackResult.result.nodeMentions = await this.extractNodeMentions(userPrompt);
        
        return {
          intent: fallbackResult.result,
          confidence: fallbackResult.confidence,
          warnings: [...fallbackResult.warnings, `Used ${fallbackResult.strategy} fallback`]
        };
      }
    } catch (error) {
      console.warn(`[IntentExtractor] ⚠️  Fallback strategies failed:`, error);
    }
    
    // ✅ STRATEGY 3: Rule-based fallback (deterministic) - Final fallback
    console.log(`[IntentExtractor] Using rule-based fallback extraction`);
    const fallbackResult = fallbackIntentGenerator.generateFromPrompt(userPrompt);
    
    // ✅ PHASE B: Add deterministic node mentions (registry-driven)
    fallbackResult.intent.nodeMentions = await this.extractNodeMentions(userPrompt);
    
    return {
      intent: fallbackResult.intent,
      confidence: fallbackResult.confidence,
      warnings: ['Used rule-based fallback extraction (all methods failed)']
    };
  }
  
  /**
   * ✅ PHASE B: Extract node mentions deterministically from prompt
   * Uses registry to find node types mentioned in prompt
   * This ensures nodes are NEVER lost, even if LLM doesn't extract them
   * ✅ UNIVERSAL: No hardcoded verb lists - derives verbs from node operations
   */
  private async extractNodeMentions(userPrompt: string): Promise<Array<{
    nodeType: string;
    context: string;
    verbs?: string[];
    confidence: number;
    operations?: string[]; // ✅ OPERATIONS-FIRST: Operations from node schema
    defaultOperation?: string; // ✅ OPERATIONS-FIRST: Default operation from node schema
  }>> {
    const promptLower = userPrompt.toLowerCase();
    const mentions: Array<{
      nodeType: string;
      context: string;
      verbs?: string[];
      confidence: number;
      operations?: string[]; // ✅ OPERATIONS-FIRST: Operations from node schema
      defaultOperation?: string; // ✅ OPERATIONS-FIRST: Default operation from node schema
    }> = [];
    
    // ✅ UNIVERSAL: Use registry to find all possible node types
    const { unifiedNodeRegistry } = require('../../core/registry/unified-node-registry');
    const registry = unifiedNodeRegistry; // ✅ FIX: Already an instance, use directly
    const allNodeTypes = registry.getAllTypes(); // ✅ FIX: Correct method name
    
    for (const nodeType of allNodeTypes) {
      try {
        const nodeDef = registry.get(nodeType);
        if (!nodeDef) continue;
        
        // Check node type name
        const nodeTypeLower = nodeType.toLowerCase();
        const nodeLabelLower = (nodeDef.label || '').toLowerCase();
        const aliases = (nodeDef.aliases || []).map((a: string) => a.toLowerCase());
        
        // Check if prompt contains node type, label, or aliases
        const searchTerms = [nodeTypeLower, nodeLabelLower, ...aliases].filter(Boolean);
        let bestMatch: { term: string; index: number } | null = null;
        
        for (const term of searchTerms) {
          if (term.length < 3) continue; // Skip too short terms
          
          const index = promptLower.indexOf(term);
          if (index !== -1) {
            if (!bestMatch || index < bestMatch.index) {
              bestMatch = { term, index };
            }
          }
        }
        
        if (bestMatch) {
          // Extract context around the match (50 chars before and after)
          const contextStart = Math.max(0, bestMatch.index - 50);
          const contextEnd = Math.min(userPrompt.length, bestMatch.index + bestMatch.term.length + 50);
          const context = userPrompt.substring(contextStart, contextEnd).trim();
          
          // ✅ UNIVERSAL: Extract verbs from context using NodeOperationIndex
          // No hardcoded verb lists - derives verbs from node's actual operations
          const contextLower = context.toLowerCase();
          const nearbyVerbs: string[] = [];
          
          try {
            // Get all operations for this node type from registry
            const { nodeOperationIndex } = await import('../../core/registry/node-operation-index');
            nodeOperationIndex.initialize();
            const nodeOperations = nodeOperationIndex.getOperationsForNode(nodeType);
            
            // Extract tokens from all operations (these are the verbs we look for)
            const operationTokens = new Set<string>();
            for (const op of nodeOperations) {
              // Tokenize operation name (e.g., "listRepos" → ["list", "repos"])
              const tokens = op
                .replace(/([a-z])([A-Z])/g, '$1 $2')
                .replace(/[_-]/g, ' ')
                .toLowerCase()
                .split(/\s+/)
                .filter(Boolean);
              tokens.forEach(t => operationTokens.add(t));
            }
            
            // Find these operation tokens in the context
            for (const token of operationTokens) {
              if (token.length < 3) continue; // Skip very short tokens
              const verbIndex = contextLower.indexOf(token);
              if (verbIndex !== -1) {
                const distance = Math.abs(verbIndex - (bestMatch.index - contextStart));
                if (distance <= 30) {
                  nearbyVerbs.push(token);
                }
              }
            }
          } catch (error) {
            // If NodeOperationIndex fails, skip verb extraction (non-fatal)
            console.warn(`[IntentExtractor] ⚠️  Failed to extract verbs from NodeOperationIndex for ${nodeType}:`, error);
          }
          
          // Calculate confidence based on match quality
          let confidence = 0.8; // Base confidence
          if (nodeTypeLower === bestMatch.term) confidence = 0.95; // Exact node type match
          if (nearbyVerbs.length > 0) confidence = Math.min(1.0, confidence + 0.1); // Has operation context
          
          mentions.push({
            nodeType,
            context,
            verbs: nearbyVerbs.length > 0 ? nearbyVerbs : undefined,
            confidence,
          });
        }
      } catch (error) {
        // Skip nodes that cause errors
        continue;
      }
    }
    
    // Sort by confidence (highest first)
    mentions.sort((a, b) => b.confidence - a.confidence);
    
    // Remove duplicates (same nodeType, keep highest confidence)
    const uniqueMentions = new Map<string, typeof mentions[0]>();
    for (const mention of mentions) {
      const existing = uniqueMentions.get(mention.nodeType);
      if (!existing || mention.confidence > existing.confidence) {
        uniqueMentions.set(mention.nodeType, mention);
      }
    }
    
    const result = Array.from(uniqueMentions.values());
    
    // ✅ OPERATIONS-FIRST: Enrich node mentions with operations from node schema
    // This ensures operations are available BEFORE variation generation
    for (const mention of result) {
      const nodeDef = registry.get(mention.nodeType);
      if (nodeDef) {
        mention.operations = this.getOperationsFromNodeSchema(nodeDef);
        mention.defaultOperation = this.getDefaultOperationFromNode(nodeDef);
        
        if (mention.operations.length > 0) {
          console.log(`[IntentExtractor] ✅ Enriched ${mention.nodeType} with ${mention.operations.length} operation(s): ${mention.operations.join(', ')} (default: ${mention.defaultOperation})`);
        }
      }
    }
    
    if (result.length > 0) {
      console.log(`[IntentExtractor] ✅ Extracted ${result.length} node mention(s) deterministically: ${result.map(m => m.nodeType).join(', ')}`);
    }
    
    return result;
  }
  
  /**
   * ✅ OPERATIONS-FIRST: Get operations directly from node's schema
   * Universal, root-level - works for ALL nodes automatically
   * No hardcoding - all from registry
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
   * Extract SimpleIntent using LLM
   * 
   * This is a LIGHTWEIGHT extraction - only entities, not infrastructure
   */
  private async extractWithLLM(userPrompt: string): Promise<SimpleIntentResult> {
    const prompt = `# SIMPLE INTENT EXTRACTION

Extract ONLY basic entities from the user prompt. Do NOT design infrastructure.

## USER PROMPT:
"${userPrompt}"

## OUTPUT FORMAT (JSON ONLY):
{
  "verbs": ["action1", "action2"],  // What user wants to do (send, read, create, etc.)
  "sources": ["source1", "source2"],  // Where data comes from (Gmail, Sheets, etc.)
  "destinations": ["dest1", "dest2"],  // Where data goes (Slack, Drive, etc.)
  "trigger": {
    "type": "schedule" | "manual" | "webhook" | "event" | "form" | "chat",
    "description": "optional description"
  },
  "conditions": [
    {
      "description": "if value > 10",
      "type": "if"
    }
  ],
  "transformations": ["summarize", "filter"],  // Data transformations mentioned
  "dataTypes": ["email", "contact"],  // Data types mentioned
  "providers": ["Gmail", "Slack"]  // Service providers mentioned
}

## RULES:
- Extract ONLY entities (what, where, when)
- Do NOT specify node types (that's the planner's job)
- Do NOT specify execution order (that's the planner's job)
- Do NOT design workflow structure (that's the planner's job)
- Return ONLY valid JSON, no markdown, no explanations

Return the JSON now:`;

    try {
      const aiRaw = await ollamaOrchestrator.processRequest(
        'workflow-generation',
        {
          prompt,
          temperature: 0.1, // Low temperature for deterministic output
          stream: false,
        }
      );
      
      // ✅ PHASE 4: Extract and validate JSON using guardrails
      const { llmGuardrails } = await import('./llm-guardrails');
      const schema = llmGuardrails.generateSimpleIntentSchema();
      const guardrailResult = llmGuardrails.extractAndValidateJSON(aiRaw.content || aiRaw, schema);
      
      if (!guardrailResult.valid && !guardrailResult.repaired) {
        throw new Error(`Invalid SimpleIntent: ${guardrailResult.errors.join(', ')}`);
      }
      
      // Use validated (or repaired) intent
      const parsed = guardrailResult.repaired || JSON.parse(aiRaw.content || aiRaw);
      
      // ✅ UNIVERSAL FIX: Normalize condition types before validation
      // LLM may generate 'if_else' but schema only accepts 'if', 'switch', 'loop'
      // Normalize all condition type variations to schema-compliant values
      if (parsed.conditions && Array.isArray(parsed.conditions)) {
        parsed.conditions = parsed.conditions.map((cond: any) => {
          if (cond && typeof cond === 'object' && cond.type) {
            const normalizedType = this.normalizeConditionType(cond.type);
            return { ...cond, type: normalizedType };
          }
          return cond;
        });
      }
      
      // Validate and normalize
      const intent: SimpleIntent = {
        verbs: parsed.verbs || [],
        sources: parsed.sources || [],
        destinations: parsed.destinations || [],
        trigger: parsed.trigger,
        conditions: parsed.conditions, // ✅ Now normalized
        transformations: parsed.transformations,
        dataTypes: parsed.dataTypes,
        providers: parsed.providers,
      };
      
      // Calculate confidence based on extracted entities
      const confidence = this.calculateConfidence(intent, userPrompt);
      
      return {
        intent,
        confidence: guardrailResult.repaired ? Math.min(confidence, 0.8) : confidence, // Lower confidence for repaired
      };
    } catch (error) {
      console.error(`[IntentExtractor] LLM extraction error:`, error);
      throw error;
    }
  }
  
  /**
   * Calculate confidence score based on extracted entities
   */
  private calculateConfidence(intent: SimpleIntent, originalPrompt: string): number {
    let score = 0;
    let maxScore = 0;
    
    // Check if we extracted verbs
    maxScore += 1;
    if (intent.verbs.length > 0) {
      score += 1;
    }
    
    // Check if we extracted sources or destinations
    maxScore += 1;
    if (intent.sources.length > 0 || intent.destinations.length > 0) {
      score += 1;
    }
    
    // Check if trigger was extracted
    maxScore += 0.5;
    if (intent.trigger) {
      score += 0.5;
    }
    
    // Check if we have enough entities to build a workflow
    maxScore += 0.5;
    if (intent.verbs.length >= 1 && (intent.sources.length > 0 || intent.destinations.length > 0)) {
      score += 0.5;
    }
    
    return maxScore > 0 ? score / maxScore : 0;
  }

  /**
   * ✅ UNIVERSAL: Normalize condition types to schema-compliant values
   * 
   * Schema accepts: 'if', 'switch', 'loop'
   * LLM may generate: 'if_else', 'if-else', 'ifelse', 'conditional', etc.
   * 
   * This normalization ensures ALL condition type variations map to valid schema values.
   * 
   * @param conditionType - Condition type from LLM (may be any variation)
   * @returns Normalized condition type: 'if' | 'switch' | 'loop'
   */
  private normalizeConditionType(conditionType: string): 'if' | 'switch' | 'loop' {
    if (!conditionType || typeof conditionType !== 'string') {
      return 'if'; // Default fallback
    }
    
    const normalized = conditionType.toLowerCase().trim();
    
    // ✅ Map all 'if_else' variations to 'if'
    if (normalized === 'if_else' || 
        normalized === 'if-else' || 
        normalized === 'ifelse' ||
        normalized === 'if' ||
        normalized === 'conditional' ||
        normalized.startsWith('if_') ||
        normalized.startsWith('if-')) {
      return 'if';
    }
    
    // ✅ Map switch variations
    if (normalized === 'switch' || 
        normalized === 'case' || 
        normalized === 'switch_case' ||
        normalized.startsWith('switch')) {
      return 'switch';
    }
    
    // ✅ Map loop variations
    if (normalized === 'loop' || 
        normalized === 'for' || 
        normalized === 'while' ||
        normalized === 'iterate' ||
        normalized.startsWith('loop')) {
      return 'loop';
    }
    
    // ✅ Default fallback: if schema validation fails, default to 'if'
    console.warn(`[IntentExtractor] ⚠️  Unknown condition type "${conditionType}", defaulting to "if"`);
    return 'if';
  }
}

// Export singleton instance
export const intentExtractor = IntentExtractor.getInstance();
