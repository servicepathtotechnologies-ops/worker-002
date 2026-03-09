/**
 * Prompt Understanding Service
 * 
 * Improves understanding of vague prompts by:
 * 1. Inferring typical workflows from context
 * 2. Asking clarification if confidence < 0.8
 * 3. Never guessing tools blindly
 * 4. Never auto-confirming without user approval
 * 
 * Returns:
 * - inferred workflow
 * - confidence score
 * - missing intent fields
 */

import { StructuredIntent } from './intent-structurer';
import { ollamaOrchestrator } from './ollama-orchestrator';
import { nodeLibrary } from '../nodes/node-library';
import { AliasKeywordCollector } from './summarize-layer';

export interface PromptUnderstandingResult {
  inferredIntent: StructuredIntent;
  confidence: number;
  missingFields: string[];
  clarificationQuestions?: string[];
  requiresClarification: boolean;
  reasoning: string;
}

export interface WorkflowInference {
  trigger: string;
  actions: Array<{ type: string; operation: string; description: string }>;
  confidence: number;
  reasoning: string;
}

/**
 * Prompt Understanding Service
 * Infers workflows from vague prompts and determines when clarification is needed
 */
export class PromptUnderstandingService {
  // ✅ FIXED: Updated thresholds
  // - BUILD_ALLOWED: confidence >= 0.6 → allow build (tolerate partial understanding)
  // - BLOCK_BUILD: confidence < 0.5 → block build (too low confidence)
  // - CLARIFICATION: confidence < 0.5 → require clarification
  private readonly BUILD_ALLOWED_THRESHOLD = 0.6; // Allow build if confidence >= 60%
  private readonly BLOCK_BUILD_THRESHOLD = 0.5; // Block build if confidence < 50%
  
  // ✅ NEW: Use existing keyword collector (no duplication)
  private keywordCollector: AliasKeywordCollector;
  
  constructor() {
    this.keywordCollector = new AliasKeywordCollector();
  }
  
  /**
   * Understand vague prompt and infer workflow
   * 
   * @param userPrompt - User's prompt (may be vague)
   * @returns Understanding result with inferred intent, confidence, and missing fields
   */
  async understandPrompt(userPrompt: string): Promise<PromptUnderstandingResult> {
    console.log(`[PromptUnderstandingService] Understanding prompt: "${userPrompt}"`);
    
    // ✅ NEW: Check if prompt is already structured (contains node types)
    // If it's a structured prompt from summarize layer, skip vague analysis
    const isStructuredPrompt = this.isStructuredPrompt(userPrompt);
    if (isStructuredPrompt) {
      console.log(`[PromptUnderstandingService] ✅ Detected structured prompt (contains node types) - skipping vague analysis`);
      return this.handleStructuredPrompt(userPrompt);
    }
    
    // Step 1: Analyze prompt for vagueness
    const vaguenessAnalysis = this.analyzeVagueness(userPrompt);
    
    // Step 2: Infer typical workflow from context
    const workflowInference = await this.inferTypicalWorkflow(userPrompt, vaguenessAnalysis);
    
    // Step 3: Build structured intent from inference
    const inferredIntent = this.buildStructuredIntentFromInference(workflowInference, userPrompt);
    
    // Step 4: Identify missing fields
    const missingFields = this.identifyMissingFields(inferredIntent);
    
    // Step 5: Calculate confidence score
    const confidence = this.calculateConfidence(workflowInference, missingFields);
    
    // Step 6: Determine if clarification is needed
    // ✅ FIXED: Only require clarification if confidence < 50% (too low)
    const requiresClarification = confidence < this.BLOCK_BUILD_THRESHOLD;
    
    // Step 7: Generate clarification questions if needed
    const clarificationQuestions = requiresClarification
      ? this.generateClarificationQuestions(inferredIntent, missingFields, userPrompt)
      : undefined;
    
    const result: PromptUnderstandingResult = {
      inferredIntent,
      confidence,
      missingFields,
      clarificationQuestions,
      requiresClarification,
      reasoning: workflowInference.reasoning,
    };
    
    console.log(`[PromptUnderstandingService] ✅ Understanding complete:`);
    console.log(`  - Confidence: ${(confidence * 100).toFixed(1)}%`);
    console.log(`  - Missing fields: ${missingFields.join(', ') || 'none'}`);
    console.log(`  - Requires clarification: ${requiresClarification}`);
    
    return result;
  }
  
  /**
   * Analyze prompt for vagueness indicators
   */
  private analyzeVagueness(prompt: string): {
    isVague: boolean;
    indicators: string[];
    wordCount: number;
  } {
    const wordCount = prompt.split(/\s+/).filter(w => w.length > 0).length;
    const indicators: string[] = [];
    
    // Vague indicators
    const vaguePatterns = [
      /^(sales|marketing|customer|support|agent|workflow|automation)$/i,
      /^(create|build|make|do|help|assist)/i,
      /^(something|anything|whatever)/i,
    ];
    
    let isVague = false;
    for (const pattern of vaguePatterns) {
      if (pattern.test(prompt.trim())) {
        isVague = true;
        indicators.push('Single word or generic term');
        break;
      }
    }
    
    // Low word count is often vague
    if (wordCount <= 3) {
      isVague = true;
      indicators.push(`Low word count: ${wordCount}`);
    }
    
    // Missing action verbs
    const actionVerbs = ['get', 'fetch', 'read', 'write', 'send', 'create', 'update', 'delete', 'analyze', 'summarize'];
    const hasActionVerb = actionVerbs.some(verb => prompt.toLowerCase().includes(verb));
    if (!hasActionVerb && wordCount > 0) {
      isVague = true;
      indicators.push('Missing action verb');
    }
    
    // Missing data sources
    const dataSources = ['sheets', 'database', 'api', 'email', 'slack', 'gmail'];
    const hasDataSource = dataSources.some(source => prompt.toLowerCase().includes(source));
    if (!hasDataSource && wordCount > 0) {
      isVague = true;
      indicators.push('Missing data source');
    }
    
    return {
      isVague,
      indicators,
      wordCount,
    };
  }
  
  /**
   * Infer typical workflow from vague prompt using LLM
   */
  private async inferTypicalWorkflow(
    prompt: string,
    vaguenessAnalysis: { isVague: boolean; indicators: string[]; wordCount: number }
  ): Promise<WorkflowInference> {
    console.log(`[PromptUnderstandingService] Inferring typical workflow from vague prompt...`);
    
    // Get available node types for context
    const availableNodes = this.getAvailableNodeTypes();
    
    const systemPrompt = `You are a workflow inference engine. Your task is to infer a typical workflow from a vague user prompt.

Rules:
1. NEVER guess tools blindly - only infer workflows that make logical sense
2. Use common patterns and best practices
3. Infer typical workflows based on the prompt context
4. If the prompt is too vague, infer a minimal, safe workflow
5. Always include a trigger (default to manual_trigger if unclear)

Available node types (use only these):
${availableNodes.map((node, idx) => `  ${idx + 1}. ${node}`).join('\n')}

User prompt: "${prompt}"

Analyze the prompt and infer a typical workflow. Return ONLY valid JSON:
{
  "trigger": "manual_trigger | schedule | webhook",
  "actions": [
    { "type": "google_sheets", "operation": "read", "description": "..." },
    { "type": "text_summarizer", "operation": "summarize", "description": "..." }
  ],
  "confidence": 0.0-1.0,
  "reasoning": "Brief explanation of why this workflow was inferred"
}

CRITICAL: 
- Use ONLY node types from the available list
- Do NOT invent new node types
- If unsure, use minimal workflow (trigger + one safe action)
- Confidence should reflect certainty (lower for vague prompts)`;

    try {
      // Use processRequest with prompt object (system + user prompt)
      const response = await ollamaOrchestrator.processRequest(
        'workflow-generation',
        {
          prompt: prompt,
          system: systemPrompt,
        },
        {
          temperature: 0.3, // Lower temperature for more deterministic inference
          max_tokens: 500,
        }
      );
      
      // Parse JSON response (handle both string and object responses)
      const responseText = typeof response === 'string' ? response : (response?.content || JSON.stringify(response));
      
      // ✅ ROOT-LEVEL FIX: Multiple JSON parsing strategies with fallbacks
      let inference: WorkflowInference | null = null;
      
      // Strategy 1: Try to find and parse complete JSON object
      try {
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          inference = JSON.parse(jsonMatch[0]);
          console.log(`[PromptUnderstandingService] ✅ Parsed JSON using strategy 1 (complete match)`);
        }
      } catch (e) {
        console.warn(`[PromptUnderstandingService] ⚠️  Strategy 1 failed: ${e instanceof Error ? e.message : 'Unknown error'}`);
      }
      
      // Strategy 2: Try to extract and fix common JSON errors (unclosed braces, trailing commas)
      if (!inference) {
        try {
          // Try to fix common JSON errors
          let fixedJson = responseText;
          
          // Remove markdown code fences if present
          fixedJson = fixedJson.replace(/```json\s*/g, '').replace(/```\s*/g, '');
          
          // Find JSON object boundaries
          const firstBrace = fixedJson.indexOf('{');
          const lastBrace = fixedJson.lastIndexOf('}');
          
          if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
            let jsonCandidate = fixedJson.substring(firstBrace, lastBrace + 1);
            
            // Try to fix trailing commas before closing braces/brackets
            jsonCandidate = jsonCandidate.replace(/,(\s*[}\]])/g, '$1');
            
            // Try to fix unclosed strings (basic heuristic)
            const openQuotes = (jsonCandidate.match(/"/g) || []).length;
            if (openQuotes % 2 !== 0) {
              // Odd number of quotes - try to close the last string
              const lastQuote = jsonCandidate.lastIndexOf('"');
              if (lastQuote > 0 && jsonCandidate[lastQuote - 1] !== '\\') {
                // Find the property name before this quote
                const beforeQuote = jsonCandidate.substring(0, lastQuote);
                const colonIndex = beforeQuote.lastIndexOf(':');
                if (colonIndex !== -1) {
                  // Add closing quote and continue
                  jsonCandidate = jsonCandidate.substring(0, lastQuote + 1) + '"' + jsonCandidate.substring(lastQuote + 1);
                }
              }
            }
            
            inference = JSON.parse(jsonCandidate);
            console.log(`[PromptUnderstandingService] ✅ Parsed JSON using strategy 2 (fixed common errors)`);
          }
        } catch (e) {
          console.warn(`[PromptUnderstandingService] ⚠️  Strategy 2 failed: ${e instanceof Error ? e.message : 'Unknown error'}`);
        }
      }
      
      // Strategy 3: Try to extract partial JSON and build minimal inference
      if (!inference) {
        try {
          // Extract trigger if mentioned
          const triggerMatch = responseText.match(/"trigger"\s*:\s*"([^"]+)"/i) || 
                               responseText.match(/trigger[:\s]+(\w+)/i);
          const trigger = triggerMatch ? triggerMatch[1] : 'manual_trigger';
          
          // Extract actions array (even if partial)
          const actionsMatch = responseText.match(/"actions"\s*:\s*\[([^\]]*)\]/i);
          const actions: Array<{ type: string; operation: string; description: string }> = [];
          
          if (actionsMatch) {
            // Try to extract action objects
            const actionsText = actionsMatch[1];
            const actionMatches = actionsText.matchAll(/\{"type"\s*:\s*"([^"]+)"/gi);
            for (const match of actionMatches) {
              actions.push({
                type: match[1],
                operation: 'read',
                description: `Action using ${match[1]}`,
              });
            }
          }
          
          // Extract confidence if mentioned
          const confidenceMatch = responseText.match(/"confidence"\s*:\s*([0-9.]+)/i);
          const confidence = confidenceMatch ? parseFloat(confidenceMatch[1]) : 0.4;
          
          inference = {
            trigger,
            actions,
            confidence: Math.max(0.2, Math.min(1.0, confidence)),
            reasoning: 'Partially inferred from LLM response (JSON parse failed, extracted partial data)',
          };
          
          console.log(`[PromptUnderstandingService] ✅ Parsed JSON using strategy 3 (partial extraction)`);
        } catch (e) {
          console.warn(`[PromptUnderstandingService] ⚠️  Strategy 3 failed: ${e instanceof Error ? e.message : 'Unknown error'}`);
        }
      }
      
      // If all strategies failed, throw error to trigger fallback
      if (!inference) {
        throw new Error('All JSON parsing strategies failed');
      }
      
      // Validate inference
      this.validateInference(inference, availableNodes);
      
      console.log(`[PromptUnderstandingService] ✅ Workflow inferred: ${inference.actions.length} actions, confidence: ${(inference.confidence * 100).toFixed(1)}%`);
      
      return inference;
    } catch (error) {
      console.error(`[PromptUnderstandingService] ❌ Failed to infer workflow: ${error instanceof Error ? error.message : 'Unknown error'}`);
      
      // ✅ ROOT-LEVEL FIX: Better fallback - infer from prompt keywords instead of returning empty
      // Extract basic intent from prompt keywords
      const promptLower = prompt.toLowerCase();
      const inferredActions: Array<{ type: string; operation: string; description: string }> = [];
      
      // Keyword-based inference
      if (promptLower.includes('webhook') || promptLower.includes('http')) {
        inferredActions.push({ type: 'webhook', operation: 'receive', description: 'Receive webhook data' });
      }
      if (promptLower.includes('gmail') || promptLower.includes('email')) {
        inferredActions.push({ type: 'google_gmail', operation: 'read', description: 'Read emails' });
      }
      if (promptLower.includes('slack')) {
        inferredActions.push({ type: 'slack_message', operation: 'send', description: 'Send Slack message' });
      }
      if (promptLower.includes('sheets') || promptLower.includes('spreadsheet')) {
        inferredActions.push({ type: 'google_sheets', operation: 'read', description: 'Read from Google Sheets' });
      }
      if (promptLower.includes('hubspot') || promptLower.includes('crm')) {
        inferredActions.push({ type: 'hubspot', operation: 'create_contact', description: 'Create contact in HubSpot' });
      }
      if (promptLower.includes('ai') || promptLower.includes('gpt') || promptLower.includes('openai')) {
        inferredActions.push({ type: 'ai_chat_model', operation: 'chat', description: 'AI analysis' });
      }
      
      // Infer trigger
      let inferredTrigger = 'manual_trigger';
      if (promptLower.includes('webhook')) inferredTrigger = 'webhook';
      else if (promptLower.includes('schedule') || promptLower.includes('daily') || promptLower.includes('hourly')) inferredTrigger = 'schedule';
      else if (promptLower.includes('form')) inferredTrigger = 'form';
      
      return {
        trigger: inferredTrigger,
        actions: inferredActions,
        confidence: inferredActions.length > 0 ? 0.5 : 0.3, // Higher confidence if we inferred actions
        reasoning: `Failed to parse LLM JSON response, but inferred basic workflow from prompt keywords (${inferredActions.length} actions found)`,
      };
    }
  }
  
  /**
   * Build structured intent from workflow inference
   * ✅ FIXED: Automatically default to manual_trigger if trigger missing
   */
  private buildStructuredIntentFromInference(
    inference: WorkflowInference,
    originalPrompt: string
  ): StructuredIntent {
    // ✅ DEFAULT TRIGGER POLICY:
    // Default to schedule for automation prompts unless user explicitly asked for webhook/chat/form/manual.
    const trigger = inference.trigger || this.inferDefaultTrigger(originalPrompt);
    
    if (!inference.trigger) {
      console.log(`[PromptUnderstandingService] ⚠️  No trigger specified, defaulting to ${trigger}`);
    }
    
    return {
      trigger,
      trigger_config: trigger === 'schedule' ? this.inferDefaultScheduleConfig(originalPrompt) : undefined,
      actions: inference.actions.map(action => ({
        type: action.type,
        operation: action.operation || 'read',
        config: action.description ? { description: action.description } : undefined,
      })),
      conditions: [],
      requires_credentials: [],
    };
  }

  private inferDefaultTrigger(prompt: string): StructuredIntent['trigger'] {
    const p = (prompt || '').toLowerCase();
    if (p.includes('webhook') || p.includes('http request') || p.includes('api call')) return 'webhook';
    if (p.includes('form') || p.includes('submitted') || p.includes('submission')) return 'form';
    if (p.includes('chat') || p.includes('bot')) return 'chat_trigger';
    if (p.includes('manual') || p.includes('on demand') || p.includes('run now') || p.includes('click a button')) return 'manual_trigger';
    return 'schedule';
  }

  private inferDefaultScheduleConfig(prompt: string): StructuredIntent['trigger_config'] {
    const p = (prompt || '').toLowerCase();
    const interval =
      p.includes('hourly') ? 'hourly' :
      p.includes('weekly') ? 'weekly' :
      p.includes('monthly') ? 'monthly' :
      'daily';
    const cron =
      interval === 'hourly' ? '0 * * * *' :
      interval === 'weekly' ? '0 9 * * 1' :
      interval === 'monthly' ? '0 9 1 * *' :
      '0 9 * * *';
    return { interval, cron, timezone: 'UTC' };
  }
  
  /**
   * Identify missing fields in structured intent
   * ✅ FIXED: Don't mark trigger as missing - manual_trigger is automatically injected as default
   */
  private identifyMissingFields(intent: StructuredIntent): string[] {
    const missing: string[] = [];
    
    // ✅ FIXED: Never mark trigger as missing - manual_trigger is automatically injected as default
    // If trigger is missing, it will be defaulted to manual_trigger, so it's not a missing field
    // Do not add 'trigger_type' to missing fields
    
    // Check for missing actions
    if (!intent.actions || intent.actions.length === 0) {
      missing.push('actions');
    }
    
    // Check for missing data sources
    const hasDataSource = intent.actions?.some(action => 
      action.type.includes('sheets') || 
      action.type.includes('database') || 
      action.type.includes('api')
    );
    if (!hasDataSource && intent.actions && intent.actions.length > 0) {
      missing.push('data_source');
    }
    
    // Check for missing output actions
    const hasOutput = intent.actions?.some(action =>
      action.type.includes('gmail') ||
      action.type.includes('email') ||
      action.type.includes('slack') ||
      action.type.includes('notification')
    );
    if (!hasOutput && intent.actions && intent.actions.length > 0) {
      missing.push('output_action');
    }
    
    return missing;
  }
  
  /**
   * Calculate confidence score
   */
  private calculateConfidence(
    inference: WorkflowInference,
    missingFields: string[]
  ): number {
    // Start with inference confidence
    let confidence = inference.confidence;
    
    // Reduce confidence for missing fields
    const fieldPenalty = missingFields.length * 0.15;
    confidence = Math.max(0, confidence - fieldPenalty);
    
    // Reduce confidence if no actions inferred
    if (inference.actions.length === 0) {
      confidence = Math.max(0, confidence - 0.3);
    }
    
    // Reduce confidence if only trigger inferred
    if (inference.actions.length === 0 && inference.trigger === 'manual_trigger') {
      confidence = Math.max(0, confidence - 0.2);
    }
    
    return Math.min(1.0, Math.max(0.0, confidence));
  }
  
  /**
   * Generate clarification questions
   */
  private generateClarificationQuestions(
    intent: StructuredIntent,
    missingFields: string[],
    originalPrompt: string
  ): string[] {
    const questions: string[] = [];
    
    // Generate questions based on missing fields
    if (missingFields.includes('actions')) {
      questions.push('What actions should this workflow perform? (e.g., read data, send email, analyze)');
    }
    
    if (missingFields.includes('data_source')) {
      questions.push('Where should the workflow get data from? (e.g., Google Sheets, database, API)');
    }
    
    if (missingFields.includes('output_action')) {
      questions.push('What should the workflow do with the results? (e.g., send email, post to Slack, save to database)');
    }
    
    if (missingFields.includes('trigger_type')) {
      questions.push('When should this workflow run? (e.g., manually, on schedule, when webhook is called)');
    }
    
    // Add context-specific questions
    if (originalPrompt.toLowerCase().includes('sales') || originalPrompt.toLowerCase().includes('agent')) {
      questions.push('What specific sales tasks should be automated? (e.g., lead follow-up, report generation, data sync)');
    }
    
    if (originalPrompt.toLowerCase().includes('marketing')) {
      questions.push('What marketing activities should be automated? (e.g., campaign tracking, email sending, analytics)');
    }
    
    // If no specific questions, add generic one
    if (questions.length === 0) {
      questions.push('Can you provide more details about what this workflow should do?');
    }
    
    return questions;
  }
  
  /**
   * Get available node types for context
   */
  private getAvailableNodeTypes(): string[] {
    const allSchemas = nodeLibrary.getAllSchemas();
    return allSchemas.map(schema => schema.type).slice(0, 50); // Limit to first 50 for prompt size
  }
  
  /**
   * Validate inference result
   */
  private validateInference(inference: WorkflowInference, availableNodes: string[]): void {
    // Validate trigger
    const validTriggers = ['manual_trigger', 'schedule', 'webhook', 'form', 'chat_trigger'];
    if (!validTriggers.includes(inference.trigger)) {
      console.warn(`[PromptUnderstandingService] ⚠️  Invalid trigger: ${inference.trigger}, defaulting to manual_trigger`);
      inference.trigger = 'manual_trigger';
    }
    
    // Validate actions
    inference.actions = inference.actions.filter(action => {
      const isValid = availableNodes.includes(action.type);
      if (!isValid) {
        console.warn(`[PromptUnderstandingService] ⚠️  Invalid node type: ${action.type}, removing from inference`);
      }
      return isValid;
    });
    
    // Validate confidence
    if (inference.confidence < 0 || inference.confidence > 1) {
      console.warn(`[PromptUnderstandingService] ⚠️  Invalid confidence: ${inference.confidence}, clamping to [0, 1]`);
      inference.confidence = Math.max(0, Math.min(1, inference.confidence));
    }
  }

  /**
   * ✅ NEW: Check if prompt is already structured (contains node type keywords)
   * Uses existing AliasKeywordCollector to detect node types (no hardcoded patterns)
   */
  private isStructuredPrompt(prompt: string): boolean {
    const promptLower = prompt.toLowerCase();
    
    // ✅ USE EXISTING INFRASTRUCTURE: Check against all keywords from registry
    const allKeywordData = this.keywordCollector.getAllAliasKeywords();
    
    // Check if prompt contains any node type keywords
    for (const keywordData of allKeywordData) {
      const keywordLower = keywordData.keyword.toLowerCase();
      const keywordPattern = new RegExp(`\\b${keywordLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
      if (keywordPattern.test(promptLower)) {
        console.log(`[PromptUnderstandingService] ✅ Detected structured prompt via keyword: "${keywordData.keyword}" → "${keywordData.nodeType}"`);
        return true;
      }
    }
    
    // Also check for direct node type mentions
    const allNodeTypes = nodeLibrary.getRegisteredNodeTypes();
    for (const nodeType of allNodeTypes) {
      if (promptLower.includes(nodeType.toLowerCase())) {
        console.log(`[PromptUnderstandingService] ✅ Detected structured prompt via direct node type: "${nodeType}"`);
        return true;
      }
    }
    
    // Check for "node" keyword which indicates structured prompt
    const hasNodeKeyword = promptLower.includes(' node') || promptLower.includes('node ');
    if (hasNodeKeyword) {
      console.log(`[PromptUnderstandingService] ✅ Detected structured prompt via "node" keyword`);
      return true;
    }
    
    return false;
  }

  /**
   * ✅ NEW: Handle structured prompts (from summarize layer)
   * Uses existing AliasKeywordCollector to extract node types (no hardcoded mappings)
   */
  private handleStructuredPrompt(prompt: string): PromptUnderstandingResult {
    console.log(`[PromptUnderstandingService] Handling structured prompt with high confidence`);
    
    // ✅ USE EXISTING INFRASTRUCTURE: Extract node types using AliasKeywordCollector
    const allKeywordData = this.keywordCollector.getAllAliasKeywords();
    const promptLower = prompt.toLowerCase();
    const extractedNodeTypes = new Set<string>();
    
    // Scan all keyword data for matches in prompt (same logic as summarize-layer)
    for (const keywordData of allKeywordData) {
      const keywordLower = keywordData.keyword.toLowerCase();
      
      // Check if keyword is mentioned in prompt (exact match or word boundary)
      const keywordPattern = new RegExp(`\\b${keywordLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
      if (keywordPattern.test(promptLower)) {
        // Verify node type exists in registry
        if (nodeLibrary.isNodeTypeRegistered(keywordData.nodeType)) {
          extractedNodeTypes.add(keywordData.nodeType);
          console.log(`[PromptUnderstandingService] ✅ Found keyword "${keywordData.keyword}" → node type "${keywordData.nodeType}"`);
        }
      }
    }
    
    // Also check for direct node type mentions (e.g., "google_sheets node")
    const allNodeTypes = nodeLibrary.getRegisteredNodeTypes();
    for (const nodeType of allNodeTypes) {
      const nodeTypeLower = nodeType.toLowerCase();
      if (promptLower.includes(nodeTypeLower)) {
        extractedNodeTypes.add(nodeType);
        console.log(`[PromptUnderstandingService] ✅ Found direct node type mention: "${nodeType}"`);
      }
    }
    
    // Extract trigger
    let trigger: StructuredIntent['trigger'] = 'manual_trigger';
    if (promptLower.includes('webhook')) trigger = 'webhook';
    else if (promptLower.includes('schedule') || promptLower.includes('daily') || promptLower.includes('hourly')) trigger = 'schedule';
    else if (promptLower.includes('form')) trigger = 'form';
    else if (promptLower.includes('chat')) trigger = 'chat_trigger';
    
    // Build actions from extracted node types
    const extractedActions = Array.from(extractedNodeTypes).map(nodeType => {
      // Determine operation based on context
      let operation = 'read';
      const nodeTypeLower = nodeType.toLowerCase();
      
      if (promptLower.includes(`use ${nodeTypeLower}`) || promptLower.includes(`${nodeTypeLower} to`)) {
        operation = promptLower.includes('send') || promptLower.includes('post') || promptLower.includes('notify') ? 'send' : 'read';
      } else if (promptLower.includes('send') || promptLower.includes('post') || promptLower.includes('notify')) {
        operation = 'send';
      }
      
      return {
        type: nodeType,
        operation,
        description: `Action using ${nodeType}`,
      };
    });
    
    // Build structured intent
    const inferredIntent: StructuredIntent = {
      trigger,
      trigger_config: trigger === 'schedule' ? this.inferDefaultScheduleConfig(prompt) : undefined,
      actions: extractedActions.map(action => ({
        type: action.type,
        operation: action.operation,
        config: { description: action.description },
      })),
      conditions: [],
      requires_credentials: [],
    };
    
    // Structured prompts get high confidence (0.8+) since they already contain node types
    const confidence = extractedActions.length > 0 ? 0.85 : 0.7;
    
    console.log(`[PromptUnderstandingService] ✅ Extracted ${extractedActions.length} node type(s) from structured prompt: ${Array.from(extractedNodeTypes).join(', ')}`);
    
    return {
      inferredIntent,
      confidence,
      missingFields: [],
      requiresClarification: false,
      reasoning: `Structured prompt detected - contains ${extractedActions.length} node type(s), high confidence`,
    };
  }
}

// Export singleton instance
export const promptUnderstandingService = new PromptUnderstandingService();

// Export convenience function
export async function understandPrompt(userPrompt: string): Promise<PromptUnderstandingResult> {
  return promptUnderstandingService.understandPrompt(userPrompt);
}
