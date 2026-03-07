/**
 * Simple Intent Structure
 * 
 * ✅ PHASE 2: Reduces LLM dependency by extracting only basic entities
 * 
 * This is a SIMPLIFIED intent structure that focuses on:
 * - Basic entities (what, where, when, how)
 * - NOT full workflow structures
 * - NOT node types (that's the planner's job)
 * - NOT execution order (that's the planner's job)
 * 
 * Architecture Rule:
 * - LLM only extracts entities, not infrastructure
 * - Planner builds StructuredIntent from SimpleIntent
 * - This makes the system work with ANY LLM (even weak models)
 */

export interface SimpleIntent {
  /**
   * What the user wants to do (verbs/actions)
   * Examples: "send", "read", "create", "update", "notify"
   */
  verbs: string[];
  
  /**
   * Where data comes from (sources)
   * Examples: "Gmail", "Google Sheets", "HubSpot", "database"
   */
  sources: string[];
  
  /**
   * Where data goes to (destinations)
   * Examples: "Slack", "Google Drive", "email", "CRM"
   */
  destinations: string[];
  
  /**
   * When the workflow should run (trigger)
   * Examples: "schedule", "manual", "webhook", "when email arrives"
   */
  trigger?: {
    type: 'schedule' | 'manual' | 'webhook' | 'event' | 'form' | 'chat';
    description?: string; // Natural language description if type is 'event'
  };
  
  /**
   * Conditions/Logic mentioned
   * Examples: "if", "when", "unless", "if value > 10"
   */
  conditions?: Array<{
    description: string; // Natural language condition
    type?: 'if' | 'switch' | 'loop';
  }>;
  
  /**
   * Transformations mentioned
   * Examples: "summarize", "filter", "format", "analyze"
   */
  transformations?: string[];
  
  /**
   * Data types mentioned
   * Examples: "email", "contact", "file", "array", "object"
   */
  dataTypes?: string[];
  
  /**
   * Credentials/providers mentioned
   * Examples: "Gmail", "Slack", "HubSpot", "Google"
   */
  providers?: string[];
  
  /**
   * Additional context from prompt
   */
  context?: {
    urgency?: 'low' | 'medium' | 'high';
    frequency?: 'once' | 'recurring' | 'continuous';
    complexity?: 'simple' | 'moderate' | 'complex';
    notes?: string; // Any other relevant information
  };
}

/**
 * SimpleIntent extraction result
 */
export interface SimpleIntentResult {
  intent: SimpleIntent;
  confidence: number; // 0-1, how confident we are in the extraction
  errors?: string[];
  warnings?: string[];
}
