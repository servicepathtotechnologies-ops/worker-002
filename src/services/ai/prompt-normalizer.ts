// PHASE-2: Prompt Normalization Layer
// Auto-rewrites user prompt into structured format: Trigger, Action, Output
// Prevents vague prompts from entering the pipeline

import { ollamaOrchestrator } from './ollama-orchestrator';

export interface NormalizedPrompt {
  originalPrompt: string;
  normalizedPrompt: string;
  trigger: {
    type: string;
    description: string;
    detected: boolean;
  };
  actions: Array<{
    step: number;
    description: string;
    service?: string;
    nodeType?: string;
  }>;
  output: {
    description: string;
    destination?: string;
    format?: string;
  };
  missingIntent: string[];
  confidence: number;
}

/**
 * Prompt Normalizer - PHASE-2 Feature #1
 * 
 * Rule: ❌ Never allow raw prompt directly into the pipeline
 * 
 * Auto-rewrites user prompt into:
 * - Trigger (what starts the workflow)
 * - Actions (what the workflow does)
 * - Output (what the workflow produces)
 * 
 * Detects missing intent early to reduce ambiguity
 */
export class PromptNormalizer {
  /**
   * Normalize user prompt before STEP-1
   * CRITICAL: Implements retry logic with strict JSON enforcement
   */
  async normalizePrompt(userPrompt: string): Promise<NormalizedPrompt> {
    console.log('🔍 [PromptNormalizer] Normalizing prompt:', userPrompt.substring(0, 100));

    // Check if prompt is too vague
    const vaguenessCheck = this.checkVagueness(userPrompt);
    if (vaguenessCheck.isVague) {
      console.warn('⚠️  [PromptNormalizer] Vague prompt detected:', vaguenessCheck.issues);
    }

    // Retry logic with progressively stricter prompts and lower temperature
    const maxRetries = 3;
    let lastError: Error | null = null;
    let rawResponse: string | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const isRetry = attempt > 1;
        const normalizationPrompt = this.buildNormalizationPrompt(userPrompt, vaguenessCheck, isRetry);
        
        // Progressively lower temperature and reduce max_tokens for retries
        const temperature = isRetry ? 0.1 : 0.3; // Lower temperature for retries
        const maxTokens = isRetry ? 1000 : 2000; // Reduce tokens for retries
        
        console.log(`🔄 [PromptNormalizer] Attempt ${attempt}/${maxRetries} (temperature: ${temperature}, max_tokens: ${maxTokens})`);
        
        // CRITICAL: Pass prompt correctly - processRequest expects input as second param, options as third
        // Add system prompt to enforce JSON output
        const response = await ollamaOrchestrator.processRequest('workflow-generation', {
          prompt: normalizationPrompt,
          system: `You are a JSON-only response generator. You MUST respond with ONLY valid JSON. No explanations, no markdown, no code blocks, no prose. Your response must start with { and end with }. If you include any text before or after the JSON, the system will fail.`,
        }, {
          temperature: temperature,
          max_tokens: maxTokens,
        });

        // Extract content from response
        // Response from ollamaManager.generate is { content: string, model: string, usage?: {...} }
        rawResponse = typeof response === 'string' 
          ? response 
          : (response?.content || (typeof response === 'object' && response !== null ? JSON.stringify(response) : String(response)));
        
        // Validate that we have a response
        if (!rawResponse || rawResponse.trim().length === 0) {
          throw new Error(`Empty response from LLM on attempt ${attempt}`);
        }
        
        // Log raw response for debugging (first 200 chars)
        console.log(`📝 [PromptNormalizer] Raw response (attempt ${attempt}):`, rawResponse.substring(0, 200));
        
        // Try to parse the response
        const normalized = this.parseNormalizationResponse(rawResponse, userPrompt, attempt);
        
        // Validate normalization
        const validation = this.validateNormalization(normalized);
        if (!validation.valid) {
          console.warn(`⚠️  [PromptNormalizer] Normalization validation failed (attempt ${attempt}):`, validation.errors);
          if (attempt < maxRetries) {
            lastError = new Error(`Validation failed: ${validation.errors.join(', ')}`);
            continue; // Retry
          }
          // Last attempt failed validation - use fallback
          return this.fallbackNormalization(userPrompt);
        }

        console.log('✅ [PromptNormalizer] Prompt normalized successfully');
        return normalized;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        const errorMessage = lastError.message.toLowerCase();
        const isJsonParseError = errorMessage.includes('json') || errorMessage.includes('unexpected token');
        
        console.error(`❌ [PromptNormalizer] Attempt ${attempt} failed:`, lastError.message);
        if (rawResponse) {
          console.error(`📄 [PromptNormalizer] Raw response that failed:`, rawResponse.substring(0, 500));
        }
        
        if (attempt < maxRetries && isJsonParseError) {
          console.log(`🔄 [PromptNormalizer] JSON parse error detected, retrying with stricter prompt...`);
          // Wait before retry
          await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
          continue;
        }
        
        // Check if error is due to missing Ollama models (reuse errorMessage from above)
        const isModelUnavailable = errorMessage.includes('not found') || 
                                  errorMessage.includes('ollama models not available') ||
                                  errorMessage.includes('404') && errorMessage.includes('model');
        
        if (isModelUnavailable) {
          console.warn('⚠️  [PromptNormalizer] Ollama models not available, using rule-based fallback');
          return this.fallbackNormalization(userPrompt);
        }
        
        // Last attempt or non-JSON error
        if (attempt === maxRetries) {
          console.error('❌ [PromptNormalizer] All attempts failed, using fallback');
          return this.fallbackNormalization(userPrompt);
        }
      }
    }

    // Should never reach here, but just in case
    return this.fallbackNormalization(userPrompt);
  }

  /**
   * Check if prompt is vague
   */
  private checkVagueness(prompt: string): {
    isVague: boolean;
    issues: string[];
    score: number; // 0-1, lower = more vague
  } {
    const issues: string[] = [];
    let score = 1.0;

    const promptLower = prompt.toLowerCase();

    // Check for vague connectors
    const vagueConnectors = ['and', 'connect', 'link', 'with', 'to'];
    const hasVagueConnector = vagueConnectors.some(connector => 
      promptLower.includes(` ${connector} `) && 
      !promptLower.includes('connect to') && 
      !promptLower.includes('link to')
    );
    
    if (hasVagueConnector) {
      issues.push('Vague connector words detected (e.g., "and", "connect")');
      score -= 0.2;
    }

    // Check for missing trigger
    const triggerKeywords = ['when', 'on', 'if', 'trigger', 'schedule', 'webhook', 'receive'];
    const hasTrigger = triggerKeywords.some(keyword => promptLower.includes(keyword));
    if (!hasTrigger) {
      issues.push('No clear trigger specified');
      score -= 0.3;
    }

    // Check for missing actions
    const actionKeywords = ['send', 'create', 'update', 'delete', 'process', 'transform', 'notify'];
    const hasAction = actionKeywords.some(keyword => promptLower.includes(keyword));
    if (!hasAction) {
      issues.push('No clear actions specified');
      score -= 0.3;
    }

    // Check for missing output
    const outputKeywords = ['to', 'into', 'save', 'store', 'output', 'result'];
    const hasOutput = outputKeywords.some(keyword => promptLower.includes(keyword));
    if (!hasOutput && !promptLower.includes('send') && !promptLower.includes('notify')) {
      issues.push('No clear output destination specified');
      score -= 0.2;
    }

    return {
      isVague: score < 0.7,
      issues,
      score: Math.max(0, score),
    };
  }

  /**
   * Build normalization prompt for AI
   * CRITICAL: Enforces strict JSON output with no prose
   */
  private buildNormalizationPrompt(
    userPrompt: string,
    vaguenessCheck: { isVague: boolean; issues: string[]; score: number },
    isRetry: boolean = false
  ): string {
    const strictJsonDirective = isRetry 
      ? `🚨 CRITICAL: You MUST respond with ONLY valid JSON. NO explanations, NO prose, NO markdown, NO code blocks. Your response MUST start with { and end with }. If you include any text before or after the JSON, the system will fail.`
      : `CRITICAL: You MUST respond with ONLY valid JSON. Do NOT include any explanations, markdown formatting, code blocks, or text outside the JSON object. Your response must start with { and end with }.`;

    return `You are a Prompt Normalizer for an autonomous workflow builder.

Your task is to rewrite the user's prompt into a structured JSON format.

${strictJsonDirective}

User Prompt: "${userPrompt}"

${vaguenessCheck.isVague ? `⚠️  VAGUENESS DETECTED: ${vaguenessCheck.issues.join(', ')}\nPlease clarify these aspects in your normalization.` : ''}

Return ONLY this JSON structure (no other text):
{
  "normalizedPrompt": "Clear, structured description of the workflow",
  "trigger": {
    "type": "manual_trigger|webhook|schedule|email|form|etc",
    "description": "What starts this workflow",
    "detected": true
  },
  "actions": [
    {
      "step": 1,
      "description": "First action description",
      "service": "Slack|Gmail|Google Sheets|etc (if applicable)",
      "nodeType": "slack_message|google_gmail|google_sheets_write|etc (if applicable)"
    }
  ],
  "output": {
    "description": "What this workflow produces",
    "destination": "Slack|Email|Database|etc (if applicable)",
    "format": "message|data|notification|etc"
  },
  "missingIntent": ["list of unclear aspects that need clarification"],
  "confidence": 0.0
}

Rules:
- If trigger is unclear, set "detected": false and describe what's missing
- If actions are vague, break them into specific steps
- If output is unclear, infer from context or mark as missing
- Confidence should reflect how clear the normalized prompt is
- Never hallucinate - if something is unclear, mark it in missingIntent
- CRITICAL EMAIL PROVIDER DETECTION:
  * If user mentions "gmail", "google mail", "google email", "gmail them", "send via gmail", "email them using gmail", use nodeType "google_gmail" (NOT "email")
  * Gmail uses OAuth authentication (handled via navbar button) - NO SMTP credentials needed
  * Only use "email" nodeType for generic SMTP email (when Gmail is NOT mentioned)
  * When Gmail is detected, service should be "Gmail" and nodeType should be "google_gmail"
- RESPOND WITH JSON ONLY - NO EXPLANATIONS, NO PROSE, NO MARKDOWN`;
  }

  /**
   * Parse AI normalization response
   * CRITICAL: Robust JSON extraction with multiple fallback strategies
   */
  private parseNormalizationResponse(response: string, originalPrompt: string, attempt: number = 1): NormalizedPrompt {
    try {
      // CRITICAL FIX: Multiple extraction strategies
      let jsonStr = response.trim();
      
      // Strategy 1: Remove BOM if present
      if (jsonStr.charCodeAt(0) === 0xFEFF) {
        jsonStr = jsonStr.slice(1);
      }
      
      // Strategy 2: Extract from markdown code blocks
      if (jsonStr.includes('```json')) {
        const match = jsonStr.match(/```json\s*([\s\S]*?)\s*```/);
        if (match && match[1]) {
          jsonStr = match[1].trim();
        }
      } else if (jsonStr.includes('```')) {
        const match = jsonStr.match(/```\s*([\s\S]*?)\s*```/);
        if (match && match[1]) {
          jsonStr = match[1].trim();
        }
      }
      
      // Strategy 3: Remove prose prefixes (e.g., "Here is the generated system prompt:")
      // Find first { and last }
      const firstBrace = jsonStr.indexOf('{');
      const lastBrace = jsonStr.lastIndexOf('}');
      
      if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        jsonStr = jsonStr.substring(firstBrace, lastBrace + 1);
      } else if (firstBrace !== -1) {
        // Only opening brace found, try to extract from there
        jsonStr = jsonStr.substring(firstBrace);
        // Try to find matching closing brace or extract valid JSON
        const braceCount = (jsonStr.match(/\{/g) || []).length;
        const closeBraceCount = (jsonStr.match(/\}/g) || []).length;
        if (braceCount > closeBraceCount) {
          // Missing closing braces, try to balance or extract what we can
          let balanced = jsonStr;
          for (let i = 0; i < braceCount - closeBraceCount; i++) {
            balanced += '}';
          }
          jsonStr = balanced;
        }
      }
      
      // Strategy 4: Remove common prose prefixes
      const prosePrefixes = [
        /^Here is (the|a) .*?:?\s*/i,
        /^The (generated|normalized|result) .*?:?\s*/i,
        /^Generated .*?:?\s*/i,
        /^Output:?\s*/i,
        /^Response:?\s*/i,
        /^JSON:?\s*/i,
      ];
      
      for (const prefix of prosePrefixes) {
        jsonStr = jsonStr.replace(prefix, '').trim();
      }
      
      // Strategy 5: Validate JSON structure before parsing
      jsonStr = jsonStr.trim();
      if (!jsonStr.startsWith('{')) {
        throw new Error(`Response does not start with {. First 100 chars: ${jsonStr.substring(0, 100)}`);
      }
      if (!jsonStr.endsWith('}')) {
        // Try to find the last complete JSON object
        const lastCompleteBrace = jsonStr.lastIndexOf('}');
        if (lastCompleteBrace > 0) {
          jsonStr = jsonStr.substring(0, lastCompleteBrace + 1);
        }
      }
      
      // Log extracted JSON for debugging
      if (attempt === 1) {
        console.log(`📋 [PromptNormalizer] Extracted JSON (first 200 chars):`, jsonStr.substring(0, 200));
      }

      const parsed = JSON.parse(jsonStr);

      // Validate required fields exist
      if (typeof parsed !== 'object' || parsed === null) {
        throw new Error('Parsed result is not an object');
      }

      return {
        originalPrompt,
        normalizedPrompt: parsed.normalizedPrompt || originalPrompt,
        trigger: parsed.trigger || {
          type: 'manual_trigger',
          description: 'Not specified',
          detected: false,
        },
        actions: Array.isArray(parsed.actions) ? parsed.actions : [],
        output: parsed.output || {
          description: 'Not specified',
        },
        missingIntent: Array.isArray(parsed.missingIntent) ? parsed.missingIntent : [],
        confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.5,
      };
    } catch (error) {
      // Log full error and response for debugging
      console.error(`❌ [PromptNormalizer] Failed to parse normalization response (attempt ${attempt}):`, error instanceof Error ? error.message : String(error));
      console.error(`📄 [PromptNormalizer] Full response that failed:`, response.substring(0, 500));
      
      // Re-throw to trigger retry logic
      throw error;
    }
  }

  /**
   * Validate normalization result
   * RELAXED: Allow workflows even with missing trigger/actions - we can infer from prompt
   */
  private validateNormalization(normalized: NormalizedPrompt): {
    valid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    // RELAXED: Don't require trigger to be detected - default to manual_trigger
    // if (!normalized.trigger.detected) {
    //   errors.push('Trigger not detected');
    // }

    // RELAXED: Don't require actions - we can infer from prompt
    // if (normalized.actions.length === 0) {
    //   errors.push('No actions specified');
    // }

    // Only fail if confidence is extremely low
    if (normalized.confidence < 0.1) {
      errors.push('Confidence too low');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Fallback normalization using rule-based extraction
   */
  private fallbackNormalization(userPrompt: string): NormalizedPrompt {
    const promptLower = userPrompt.toLowerCase();

    // Extract trigger
    let triggerType = 'manual_trigger';
    let triggerDescription = 'Manual trigger';
    // Note: Gmail/email sending is an action, not a trigger (unless explicitly receiving emails)
    if (promptLower.includes('webhook')) {
      triggerType = 'webhook';
      triggerDescription = 'When webhook is called';
    } else if (promptLower.includes('schedule') || promptLower.includes('daily') || promptLower.includes('weekly')) {
      triggerType = 'schedule';
      triggerDescription = 'On schedule';
    }

    // Extract actions
    const actions: Array<{ step: number; description: string; service?: string; nodeType?: string }> = [];
    let step = 1;

    if (promptLower.includes('slack')) {
      actions.push({
        step: step++,
        description: 'Send to Slack',
        service: 'Slack',
        nodeType: 'slack_message',
      });
    }

    // 🚨 CRITICAL: Distinguish Gmail from generic email
    if (promptLower.includes('gmail') || promptLower.includes('google mail') || promptLower.includes('google email')) {
      actions.push({
        step: step++,
        description: 'Send email via Gmail',
        service: 'Gmail',
        nodeType: 'google_gmail', // Use google_gmail node (OAuth, not SMTP)
      });
    } else if (promptLower.includes('email') && !promptLower.includes('gmail')) {
      // Generic email (not Gmail) - use SMTP email node
      actions.push({
        step: step++,
        description: 'Send email via SMTP',
        service: 'Email',
        nodeType: 'email', // Generic email node (SMTP)
      });
    }

    if (promptLower.includes('ai') || promptLower.includes('llm') || promptLower.includes('chat')) {
      actions.push({
        step: step++,
        description: 'Process with AI',
        service: 'AI',
        nodeType: 'ai_agent',
      });
    }

    // Extract output
    let outputDescription = 'Workflow output';
    let outputDestination: string | undefined;
    if (promptLower.includes('slack')) {
      outputDestination = 'Slack';
      outputDescription = 'Notification in Slack';
    } else if (promptLower.includes('gmail') || promptLower.includes('google mail')) {
      outputDestination = 'Gmail';
      outputDescription = 'Email sent via Gmail';
    } else if (promptLower.includes('email') && !promptLower.includes('gmail')) {
      outputDestination = 'Email';
      outputDescription = 'Email sent via SMTP';
    }

    return {
      originalPrompt: userPrompt,
      normalizedPrompt: `${triggerDescription}, ${actions.map(a => a.description).join(', then ')}, ${outputDescription}`,
      trigger: {
        type: triggerType,
        description: triggerDescription,
        detected: true,
      },
      actions,
      output: {
        description: outputDescription,
        destination: outputDestination,
      },
      missingIntent: actions.length === 0 ? ['No clear actions detected'] : [],
      confidence: 0.6,
    };
  }
}

// Export singleton instance
export const promptNormalizer = new PromptNormalizer();
