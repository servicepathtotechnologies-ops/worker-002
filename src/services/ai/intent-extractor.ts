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
    
    return {
      intent: fallbackResult.intent,
      confidence: fallbackResult.confidence,
      warnings: ['Used rule-based fallback extraction (all methods failed)']
    };
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
      
      // Validate and normalize
      const intent: SimpleIntent = {
        verbs: parsed.verbs || [],
        sources: parsed.sources || [],
        destinations: parsed.destinations || [],
        trigger: parsed.trigger,
        conditions: parsed.conditions,
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
}

// Export singleton instance
export const intentExtractor = IntentExtractor.getInstance();
