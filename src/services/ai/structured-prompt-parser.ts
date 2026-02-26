/**
 * ✅ CRITICAL: Structured Prompt Parser
 * Parses structured workflow specifications from users
 * Supports both free-form text and structured form data
 */

export interface StructuredWorkflowSpec {
  workflowName?: string;
  trigger: {
    type: 'schedule' | 'webhook' | 'form' | 'manual_trigger' | 'interval' | 'email_received' | 'record_created' | 'record_updated' | 'other';
    details?: {
      object?: string;
      event?: string;
      filter?: string;
      schedule?: string; // For schedule type
      path?: string; // For webhook type
      [key: string]: any;
    };
  };
  conditions?: Array<{
    description: string;
    field?: string;
    operator?: string;
    value?: any;
    logicalOperator?: 'AND' | 'OR';
  }>;
  actions: Array<{
    stepNumber: number;
    actionType: string;
    details: Record<string, any>;
    placement?: 'before' | 'after' | 'parallel';
    dependsOn?: number[]; // Step numbers this depends on
  }>;
  customNodes?: Array<{
    name: string;
    inputs: string[];
    outputs: string[];
    placement: string; // e.g., "after step 2"
  }>;
  connections?: {
    parallelBranches?: boolean;
    loops?: boolean;
    conditionalBranches?: boolean;
  };
  credentials?: string[];
  desiredOutcome?: string;
  additionalNotes?: string;
}

export class StructuredPromptParser {
  /**
   * Parse structured prompt from user input
   * Handles both JSON form data and natural language
   */
  static parse(input: string | StructuredWorkflowSpec): StructuredWorkflowSpec | null {
    // If already structured, return as-is
    if (typeof input === 'object' && input !== null && 'trigger' in input) {
      return input as StructuredWorkflowSpec;
    }

    // Try to parse as JSON
    if (typeof input === 'string') {
      try {
        const parsed = JSON.parse(input);
        if (parsed.trigger) {
          return parsed as StructuredWorkflowSpec;
        }
      } catch (e) {
        // Not JSON, continue with NLP parsing
      }
    }

    // TODO: Implement NLP parsing for free-form text
    // For now, return null to indicate unstructured input
    return null;
  }

  /**
   * Extract actions from natural language prompt
   */
  static extractActions(prompt: string): Array<{ actionType: string; details: Record<string, any> }> {
    const actions: Array<{ actionType: string; details: Record<string, any> }> = [];
    
    // Common action patterns
    const actionPatterns = [
      { pattern: /send\s+(?:an?\s+)?email/i, type: 'send_email' },
      { pattern: /create\s+(?:a\s+)?(?:record|task|lead|contact|opportunity)/i, type: 'create_record' },
      { pattern: /update\s+(?:a\s+)?(?:record|task|lead|contact)/i, type: 'update_record' },
      { pattern: /notify\s+(?:user|team|manager)/i, type: 'notify' },
      { pattern: /assign\s+to/i, type: 'assign' },
      { pattern: /schedule\s+(?:a\s+)?(?:meeting|call|appointment)/i, type: 'schedule' },
      { pattern: /generate\s+(?:a\s+)?(?:document|pdf|quote|contract)/i, type: 'generate_document' },
      { pattern: /call\s+(?:api|webhook)/i, type: 'call_api' },
      { pattern: /add\s+to\s+(?:queue|list)/i, type: 'add_to_queue' },
      { pattern: /delay|wait/i, type: 'delay' },
    ];

    actionPatterns.forEach(({ pattern, type }) => {
      if (pattern.test(prompt)) {
        actions.push({ actionType: type, details: {} });
      }
    });

    return actions;
  }

  /**
   * Extract trigger from natural language prompt
   */
  static extractTrigger(prompt: string): { type: string; details?: Record<string, any> } {
    const lowerPrompt = prompt.toLowerCase();

    // Schedule patterns
    if (/\b(?:every|daily|weekly|monthly|hourly|schedule|cron)\b/i.test(prompt)) {
      return { type: 'schedule', details: {} };
    }

    // Webhook patterns
    if (/\b(?:webhook|api\s+call|http\s+endpoint|when\s+\w+\s+happens)\b/i.test(prompt)) {
      return { type: 'webhook', details: {} };
    }

    // Form patterns
    if (/\b(?:form\s+submission|submit\s+form|contact\s+form|application\s+form)\b/i.test(prompt)) {
      return { type: 'form', details: {} };
    }

    // Record created patterns
    if (/\b(?:new\s+\w+\s+(?:created|added)|when\s+a\s+new\s+\w+)\b/i.test(prompt)) {
      return { type: 'record_created', details: {} };
    }

    // Record updated patterns
    if (/\b(?:record\s+updated|\w+\s+updated|when\s+\w+\s+is\s+updated)\b/i.test(prompt)) {
      return { type: 'record_updated', details: {} };
    }

    // Email received patterns
    if (/\b(?:email\s+received|new\s+email|when\s+email\s+arrives)\b/i.test(prompt)) {
      return { type: 'email_received', details: {} };
    }

    // Default to manual trigger
    return { type: 'manual_trigger', details: {} };
  }

  /**
   * Extract conditions from natural language prompt
   */
  static extractConditions(prompt: string): Array<{ description: string }> {
    const conditions: Array<{ description: string }> = [];
    
    // Pattern: "if X then Y" or "when X" or "only if X"
    const conditionPatterns = [
      /\bif\s+([^,\.]+?)(?:\s+then|\s+do|\s+send|,|\.)/gi,
      /\bwhen\s+([^,\.]+?)(?:\s+then|\s+do|,|\.)/gi,
      /\bonly\s+if\s+([^,\.]+?)(?:\s+then|,|\.)/gi,
      /\b(?:check|verify|validate)\s+if\s+([^,\.]+?)(?:\s+then|,|\.)/gi,
    ];

    conditionPatterns.forEach(pattern => {
      let match;
      while ((match = pattern.exec(prompt)) !== null) {
        conditions.push({ description: match[1].trim() });
      }
    });

    return conditions;
  }
}
