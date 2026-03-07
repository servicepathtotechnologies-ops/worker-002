/**
 * Intent Structurer
 * 
 * ⚠️ DEPRECATED: This is a LEGACY component kept only as a last-resort fallback.
 * 
 * The new architecture uses:
 * - SimpleIntent extraction (intentExtractor) → Intent-Aware Planner (intentAwarePlanner)
 * 
 * This method will be removed in a future version.
 * 
 * Converts user prompt into deterministic structured intent JSON.
 * This was STEP 1 of the OLD pipeline: Prompt → Structured Intent
 * 
 * Rules:
 * - No natural language allowed in output
 * - Must return pure JSON
 * - If prompt is vague → set "clarification_required": true
 */

import { ollamaOrchestrator } from './ollama-orchestrator';
import { intentClassifier } from './intent-classifier';

export interface StructuredIntent {
  trigger: string;
  trigger_config?: {
    interval?: string;
    schedule?: string;
    cron?: string;
    [key: string]: unknown; // ✅ PHASE 2: Changed from 'any' to 'unknown' for type safety
  };
  actions: Array<{
    type: string;
    operation: string;
    config?: Record<string, unknown>; // ✅ PHASE 2: Changed from 'any' to 'unknown' for type safety
  }>;
  dataSources?: Array<{
    type: string;
    operation: string;
    config?: Record<string, unknown>; // ✅ PHASE 2: Changed from 'any' to 'unknown' for type safety
  }>;
  transformations?: Array<{
    type: string;
    operation: string;
    config?: Record<string, unknown>; // ✅ PHASE 2: Changed from 'any' to 'unknown' for type safety
  }>;
  conditions?: Array<{
    type: 'if_else' | 'switch';
    condition: string;
    true_path?: string[];
    false_path?: string[];
  }>;
  requires_credentials: string[];
}

export class IntentStructurer {
  /**
   * Convert user prompt to structured intent
   */
  async structureIntent(userPrompt: string): Promise<StructuredIntent> {
    console.log(`[IntentStructurer] Structuring intent from prompt: "${userPrompt}"`);

    // Use AI to extract structured intent
    // Note: Vague prompts will be handled by intent_auto_expander in the pipeline
    try {
      const structuredIntent = await this.extractStructuredIntent(userPrompt);

      // ✅ CRITICAL: Normalize ambiguous email destination actions deterministically
      // - If user mentions Gmail (including common typos like "gmali"), prefer google_gmail.
      // - Only keep generic SMTP `email` when SMTP is explicitly mentioned.
      this.normalizeEmailDestinations(structuredIntent, userPrompt);
      
      // ✅ DEFAULT TRIGGER POLICY:
      // If trigger is missing (or effectively unspecified), default to `schedule` for automation-style prompts.
      // Only keep manual_trigger when user explicitly indicates manual/on-demand execution.
      this.applyDefaultTriggerPolicy(structuredIntent, userPrompt);
      
      // Validate structured intent
      const validation = this.validateStructuredIntent(structuredIntent);
      if (!validation.valid) {
        console.warn(`[IntentStructurer] Structured intent validation failed: ${validation.errors.join(', ')}`);
        // Return minimal intent - will be expanded by intent_auto_expander
        return {
          trigger: this.inferBestDefaultTrigger(userPrompt),
          trigger_config: this.inferDefaultTriggerConfig(this.inferBestDefaultTrigger(userPrompt), userPrompt),
          actions: [],
          requires_credentials: [],
        };
      }

      return structuredIntent;
    } catch (error) {
      console.error(`[IntentStructurer] Error structuring intent:`, error);
      // Return minimal intent - will be expanded by intent_auto_expander
      return {
        trigger: this.inferBestDefaultTrigger(userPrompt),
        trigger_config: this.inferDefaultTriggerConfig(this.inferBestDefaultTrigger(userPrompt), userPrompt),
        actions: [],
        requires_credentials: [],
      };
    }
  }

  /**
   * Normalize ambiguous email destination actions based on the original prompt.
   * Prevents generation bugs like: prompt mentions Gmail but action.type is "email".
   */
  private normalizeEmailDestinations(intent: StructuredIntent, userPrompt: string): void {
    const p = (userPrompt || '').toLowerCase();
    const mentionsGmail =
      p.includes('gmail') ||
      p.includes('google mail') ||
      p.includes('google email') ||
      p.includes('gmali') || // common typo
      /\bgm(?:ai|ia)l\b/i.test(p);
    const mentionsSmtp = p.includes('smtp') || p.includes('mail server') || p.includes('smtp host');

    const normalizeAction = (a: { type: string; operation: string; config?: Record<string, any> }) => {
      const t = (a.type || '').toLowerCase().trim();
      const op = (a.operation || '').toLowerCase().trim();

      // Only normalize send-email style actions
      const isSend = op === 'send' || op.includes('send') || op.includes('notify');
      if (!isSend) return;

      // Explicit Gmail wins
      if (t.includes('gmail') || t.includes('google_gmail') || t.includes('google mail') || t.includes('google_mail')) {
        a.type = 'google_gmail';
        return;
      }

      // Ambiguous "email" should map to Gmail if user mentioned Gmail
      if ((t === 'email' || t === 'mail' || t.includes('email')) && mentionsGmail && !mentionsSmtp) {
        a.type = 'google_gmail';
        return;
      }

      // Explicit SMTP keeps generic email node
      if ((t === 'email' || t.includes('email')) && mentionsSmtp && !mentionsGmail) {
        a.type = 'email';
      }
    };

    (intent.actions || []).forEach(normalizeAction as any);
    (intent.dataSources || []).forEach(normalizeAction as any);
    (intent.transformations || []).forEach(normalizeAction as any);
  }

  /**
   * Extract structured intent using AI
   */
  private async extractStructuredIntent(userPrompt: string): Promise<StructuredIntent> {
    const prompt = `# STRUCTURED INTENT EXTRACTION

Convert the user prompt into a deterministic JSON structure.

## USER PROMPT:
"${userPrompt}"

## OUTPUT FORMAT (JSON ONLY, NO MARKDOWN, NO EXPLANATIONS):
{
  "trigger": "manual_trigger" | "schedule" | "webhook" | "form" | "chat_trigger",
  "trigger_config": {
    "interval": "hourly" | "daily" | "weekly" | "monthly" (if schedule),
    "schedule": "cron expression" (if schedule),
    "cron": "0 * * * *" (if schedule)
  },
  "actions": [
    {
      "type": "node_type" (e.g., "hubspot", "zoho_crm", "google_sheets", "slack_message"),
      "operation": "create" | "read" | "update" | "delete" | "send" | "get",
      "config": {} (optional, node-specific config)
    }
  ],
  "conditions": [
    {
      "type": "if_else",
      "condition": "field > value",
      "true_path": ["action_type_1", "action_type_2"],
      "false_path": ["action_type_3"]
    }
  ],
  "requires_credentials": ["provider_name"] (e.g., ["hubspot", "zoho_crm", "slack"])
}

## RULES:
- trigger: Must be one of the valid trigger types
- actions: Array of action objects with type and operation
- conditions: Only include if conditional logic is mentioned
- requires_credentials: List all providers that need credentials
- NO natural language in output
- NO explanations or markdown
- Return ONLY valid JSON

Return the JSON now:`;

    // Use central Ollama orchestrator with the workflow-generation capability
    const aiRaw = await ollamaOrchestrator.processRequest(
      'workflow-generation',
      {
        prompt,
        temperature: 0.1, // Low temperature for deterministic output
        stream: false,
      }
    );

    // Parse JSON response
    try {
      const responseText =
        typeof aiRaw === 'string'
          ? aiRaw
          : (aiRaw as any)?.response ?? String(aiRaw);

      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }
      
      const structuredIntent = JSON.parse(jsonMatch[0]) as StructuredIntent;
      
      // Normalize trigger type
      structuredIntent.trigger = this.normalizeTriggerType(structuredIntent.trigger);
      
      // Extract credentials from actions, dataSources, and transformations
      structuredIntent.requires_credentials = this.extractCredentials(
        structuredIntent.actions,
        structuredIntent.dataSources,
        structuredIntent.transformations
      );
      
      return structuredIntent;
    } catch (error) {
      console.error(`[IntentStructurer] Failed to parse structured intent:`, error);
      throw error;
    }
  }

  /**
   * Normalize trigger type to valid values
   */
  private normalizeTriggerType(trigger: string): string {
    const triggerLower = trigger.toLowerCase();
    
    if (triggerLower.includes('schedule') || triggerLower.includes('cron') || triggerLower.includes('daily') || triggerLower.includes('hourly')) {
      return 'schedule';
    }
    if (triggerLower.includes('webhook') || triggerLower.includes('http') || triggerLower.includes('api')) {
      return 'webhook';
    }
    if (triggerLower.includes('form') || triggerLower.includes('submit')) {
      return 'form';
    }
    if (triggerLower.includes('chat') || triggerLower.includes('bot')) {
      return 'chat_trigger';
    }
    
    return 'manual_trigger';
  }

  /**
   * Infer best default trigger when user didn't specify one.
   * Enterprise default: schedule for automation workflows.
   */
  private inferBestDefaultTrigger(userPrompt: string): string {
    const p = (userPrompt || '').toLowerCase();
    if (p.includes('webhook') || p.includes('api call') || p.includes('http request')) return 'webhook';
    if (p.includes('form') || p.includes('submitted') || p.includes('submission')) return 'form';
    if (p.includes('chat') || p.includes('bot')) return 'chat_trigger';
    if (p.includes('manual') || p.includes('on demand') || p.includes('run now')) return 'manual_trigger';
    // Default for vague automation prompts
    return 'schedule';
  }

  /**
   * Infer schedule config defaults.
   */
  private inferDefaultTriggerConfig(trigger: string, userPrompt: string): StructuredIntent['trigger_config'] | undefined {
    if (trigger !== 'schedule') return undefined;
    const p = (userPrompt || '').toLowerCase();
    const interval =
      p.includes('hourly') ? 'hourly' :
      p.includes('weekly') ? 'weekly' :
      p.includes('monthly') ? 'monthly' :
      'daily';
    // Keep cron simple and stable; user can override in UI
    const cron =
      interval === 'hourly' ? '0 * * * *' :
      interval === 'weekly' ? '0 9 * * 1' :
      interval === 'monthly' ? '0 9 1 * *' :
      '0 9 * * *';
    return { interval, cron, timezone: 'UTC' };
  }

  /**
   * Apply default-trigger policy after AI extraction.
   */
  private applyDefaultTriggerPolicy(intent: StructuredIntent, userPrompt: string): void {
    const p = (userPrompt || '').toLowerCase();

    // If AI didn't return a trigger, set default
    if (!intent.trigger) {
      intent.trigger = this.inferBestDefaultTrigger(userPrompt);
      intent.trigger_config = this.inferDefaultTriggerConfig(intent.trigger, userPrompt);
      console.log(`[IntentStructurer] ✅ Injected default trigger: ${intent.trigger}`);
      return;
    }

    // If AI returned manual_trigger, treat it as "unspecified" unless user explicitly asked for manual/on-demand.
    const explicitlyManual = p.includes('manual') || p.includes('on demand') || p.includes('run now') || p.includes('click a button');
    // CRITICAL FIX: Check for webhook patterns including "when a webhook receives"
    const explicitlyWebhook = p.includes('webhook') || p.includes('http request') || p.includes('api call') || 
                             /when\s+(a\s+)?webhook\s+(receives|gets|triggers?)/i.test(p);
    const explicitlyForm = p.includes('form') || p.includes('submitted') || p.includes('submission');
    const explicitlyChat = p.includes('chat') || p.includes('bot');
    const explicitlySchedule = p.includes('schedule') || p.includes('cron') || p.includes('daily') || p.includes('hourly') || p.includes('weekly') || p.includes('monthly');

    if (explicitlyWebhook) {
      intent.trigger = 'webhook';
      intent.trigger_config = intent.trigger_config || {};
      return;
    }
    if (explicitlyForm) {
      intent.trigger = 'form';
      intent.trigger_config = intent.trigger_config || {};
      return;
    }
    if (explicitlyChat) {
      intent.trigger = 'chat_trigger';
      intent.trigger_config = intent.trigger_config || {};
      return;
    }
    if (explicitlySchedule || (!explicitlyManual && intent.trigger === 'manual_trigger')) {
      intent.trigger = 'schedule';
      intent.trigger_config = { ...(intent.trigger_config || {}), ...(this.inferDefaultTriggerConfig('schedule', userPrompt) || {}) };
      return;
    }
  }

  /**
   * Extract required credentials from actions, dataSources, and transformations
   * ✅ UPDATED: Now checks all fields to preserve planner output
   */
  private extractCredentials(
    actions: StructuredIntent['actions'],
    dataSources?: StructuredIntent['dataSources'],
    transformations?: StructuredIntent['transformations']
  ): string[] {
    const credentials = new Set<string>();
    
    // Map action types to credential providers
    const credentialMap: Record<string, string> = {
      'hubspot': 'hubspot',
      'zoho_crm': 'zoho_crm',
      'salesforce': 'salesforce',
      'pipedrive': 'pipedrive',
      'google_sheets': 'google_sheets',
      'google_gmail': 'google_gmail',
      'google_calendar': 'google_calendar',
      'slack_message': 'slack',
      'discord': 'discord',
      'telegram': 'telegram',
      'email': 'email',
      'airtable': 'airtable',
      'notion': 'notion',
      'clickup': 'clickup',
    };

    // Extract from actions
    actions.forEach(action => {
      const provider = credentialMap[action.type];
      if (provider) {
        credentials.add(provider);
      }
    });

    // Extract from dataSources (if present)
    if (dataSources) {
      dataSources.forEach(ds => {
        const provider = credentialMap[ds.type];
        if (provider) {
          credentials.add(provider);
        }
      });
    }

    // Extract from transformations (if present - usually don't need credentials, but check anyway)
    if (transformations) {
      transformations.forEach(tf => {
        const provider = credentialMap[tf.type];
        if (provider) {
          credentials.add(provider);
        }
      });
    }

    return Array.from(credentials);
  }


  /**
   * Validate structured intent
   */
  private validateStructuredIntent(intent: StructuredIntent): {
    valid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    // Validate trigger
    const validTriggers = ['manual_trigger', 'schedule', 'webhook', 'form', 'chat_trigger'];
    if (!validTriggers.includes(intent.trigger)) {
      errors.push(`Invalid trigger type: ${intent.trigger}`);
    }

    // Validate actions
    if (!Array.isArray(intent.actions)) {
      errors.push('Actions must be an array');
    } else {
      intent.actions.forEach((action, index) => {
        if (!action.type) {
          errors.push(`Action ${index}: missing type`);
        }
        if (!action.operation) {
          errors.push(`Action ${index}: missing operation`);
        }
      });
    }

    // Validate conditions if present
    if (intent.conditions && Array.isArray(intent.conditions)) {
      intent.conditions.forEach((condition, index) => {
        if (!condition.type || !['if_else', 'switch'].includes(condition.type)) {
          errors.push(`Condition ${index}: invalid type`);
        }
        if (!condition.condition) {
          errors.push(`Condition ${index}: missing condition`);
        }
      });
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }
}

export const intentStructurer = new IntentStructurer();
