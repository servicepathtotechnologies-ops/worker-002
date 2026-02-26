/**
 * Intent Auto Expander
 * 
 * Deterministic expansion of vague prompts into industry-standard workflows.
 * 
 * Behavior:
 * - Automatically expands vague prompts using industry templates
 * - Never asks clarification questions
 * - Adds assumptions instead of asking
 * - Produces deterministic expansions (rule-based)
 * 
 * Expanded interpretation includes:
 * - assumed trigger
 * - assumed actions
 * - assumed services
 * - description of workflow goal
 * - list of assumptions made
 * 
 * Return to frontend as:
 * {
 *   "expanded_intent": "...",
 *   "requires_confirmation": true,
 *   "assumptions": [...]
 * }
 * 
 * Workflow generation proceeds only after confirmation.
 */

import { StructuredIntent } from './intent-structurer';
import { findIndustryTemplate, IndustryWorkflowTemplate } from './industry-workflow-templates';
import { nodeLibrary } from '../nodes/node-library';

export interface ExpandedIntent {
  expanded_intent: string;
  requires_confirmation: boolean;
  assumed_trigger?: string;
  assumed_actions?: string[];
  assumed_services?: string[];
  workflow_goal?: string;
  similarity_score?: number;
  assumptions?: Array<{
    assumption: string;
    reasoning: string;
    requires_confirmation: boolean;
  }>;
}

export class IntentAutoExpander {
  /**
   * Check if prompt needs expansion and generate expanded interpretation
   * 
   * ALWAYS expands vague prompts automatically using industry templates.
   * NEVER asks clarification questions - adds assumptions instead.
   */
  async expandIntent(
    userPrompt: string,
    structuredIntent: StructuredIntent,
    similarityScore?: number
  ): Promise<ExpandedIntent | null> {
    console.log(`[IntentAutoExpander] Checking if intent needs expansion...`);

    // ✅ ALWAYS expand vague prompts automatically
    // Check if prompt is vague (low similarity, incomplete, or abstract)
    const isVague = similarityScore !== undefined && similarityScore < 0.9;
    const isIncomplete = !structuredIntent.actions || structuredIntent.actions.length === 0;
    const hasNoTrigger = !structuredIntent.trigger;
    const promptLower = userPrompt.toLowerCase();

    // Check for vague keywords that should trigger expansion
    const vagueKeywords = ['workflow', 'automation', 'process', 'agent', 'system', 'pipeline'];
    const hasVagueKeywords = vagueKeywords.some(keyword => promptLower.includes(keyword));

    // If prompt is vague, incomplete, has no trigger, or contains vague keywords, expand it
    if (isVague || isIncomplete || hasNoTrigger || hasVagueKeywords) {
      console.log(`[IntentAutoExpander] ⚠️  Prompt needs expansion:`);
      console.log(`[IntentAutoExpander]   Low similarity: ${isVague} (score: ${similarityScore})`);
      console.log(`[IntentAutoExpander]   Incomplete: ${isIncomplete}`);
      console.log(`[IntentAutoExpander]   No trigger: ${hasNoTrigger}`);

      // Try to find industry template match
      const industryTemplate = findIndustryTemplate(userPrompt);
      
      if (industryTemplate) {
        console.log(`[IntentAutoExpander] ✅ Found industry template match`);
        return this.expandUsingTemplate(userPrompt, structuredIntent, industryTemplate, similarityScore);
      }

      // Fallback: Generate generic expansion
      console.log(`[IntentAutoExpander] No template match, generating generic expansion`);
      return this.generateGenericExpansion(userPrompt, structuredIntent, similarityScore);
    }

    // No expansion needed
    console.log(`[IntentAutoExpander] ✅ Intent is concrete and complete, no expansion needed`);
    return null;
  }

  /**
   * Expand intent using industry workflow template
   */
  private expandUsingTemplate(
    userPrompt: string,
    structuredIntent: StructuredIntent,
    template: IndustryWorkflowTemplate,
    similarityScore?: number
  ): ExpandedIntent {
    // Build expanded intent description
    const expandedIntent = this.buildExpandedIntentFromTemplate(template);

    // Extract assumed actions
    const assumedActions = template.actions.map(a => `${a.type}:${a.operation}`);

    // Merge template assumptions with any from structured intent
    const allAssumptions = [...template.assumptions];

    // Add assumptions for any missing fields
    if (!structuredIntent.trigger) {
      allAssumptions.push({
        assumption: `Assumed trigger: ${template.trigger.description}`,
        reasoning: 'No trigger specified in prompt, using industry standard',
        requires_confirmation: true,
      });
    }

    return {
      expanded_intent: expandedIntent,
      requires_confirmation: true,
      assumed_trigger: template.trigger.type,
      assumed_actions: assumedActions,
      assumed_services: template.services,
      workflow_goal: template.goal,
      similarity_score: similarityScore,
      assumptions: allAssumptions,
    };
  }

  /**
   * Generate generic expansion for prompts without template match
   */
  private generateGenericExpansion(
    userPrompt: string,
    structuredIntent: StructuredIntent,
    similarityScore?: number
  ): ExpandedIntent {
    // Infer trigger
    const trigger = structuredIntent.trigger || 'manual_trigger';
    const triggerDescription = this.formatTrigger(trigger);

    // Infer actions from structured intent or add defaults
    const actions = structuredIntent.actions || [];
    const assumedActions: string[] = [];
    const assumptions: Array<{ assumption: string; reasoning: string; requires_confirmation: boolean }> = [];

    if (actions.length === 0) {
      // Add default actions based on prompt keywords
      if (userPrompt.toLowerCase().includes('email') || userPrompt.toLowerCase().includes('send')) {
        assumedActions.push('google_gmail:send');
        assumptions.push({
          assumption: 'Using Gmail for email communication',
          reasoning: 'Gmail is a common email service',
          requires_confirmation: true,
        });
      }
      
      if (userPrompt.toLowerCase().includes('data') || userPrompt.toLowerCase().includes('sheet')) {
        assumedActions.push('google_sheets:read');
        assumptions.push({
          assumption: 'Using Google Sheets for data storage',
          reasoning: 'Google Sheets is commonly used for data workflows',
          requires_confirmation: true,
        });
      }
      
      if (userPrompt.toLowerCase().includes('ai') || userPrompt.toLowerCase().includes('analyze')) {
        // ✅ Use capability tag instead of ai_service node type
        assumedActions.push('ai_processing:analyze');
        assumptions.push({
          assumption: 'Using AI processing capability for analysis',
          reasoning: 'AI analysis is common in modern workflows',
          requires_confirmation: true,
        });
      }
    } else {
      assumedActions.push(...actions.map(a => `${a.type}:${a.operation}`));
    }

    // Extract services
    const services = this.extractServices(structuredIntent);
    if (services.length === 0 && assumedActions.length > 0) {
      assumedActions.forEach(action => {
        const [type] = action.split(':');
        const serviceName = this.formatServiceName(type);
        if (serviceName && !services.includes(serviceName)) {
          services.push(serviceName);
        }
      });
    }

    // Add trigger assumption if missing
    if (!structuredIntent.trigger) {
      assumptions.push({
        assumption: `Assumed trigger: ${triggerDescription}`,
        reasoning: 'No trigger specified, using manual trigger as default',
        requires_confirmation: true,
      });
    }

    // Build expanded intent description
    const goal = this.generateWorkflowGoal(userPrompt, structuredIntent);
    const expandedIntent = this.buildExpandedIntentDescription(
      goal,
      triggerDescription,
      assumedActions,
      services,
      assumptions
    );

    return {
      expanded_intent: expandedIntent,
      requires_confirmation: true,
      assumed_trigger: trigger,
      assumed_actions: assumedActions,
      assumed_services: services,
      workflow_goal: goal,
      similarity_score: similarityScore,
      assumptions: assumptions,
    };
  }

  /**
   * Build expanded intent description from template
   */
  private buildExpandedIntentFromTemplate(template: IndustryWorkflowTemplate): string {
    const parts: string[] = [];

    parts.push(`## Workflow Goal\n${template.goal}\n`);
    parts.push(`## Assumed Trigger\n${template.trigger.description}\n`);
    parts.push(`## Assumed Actions\n`);
    
    template.actions.forEach((action, index) => {
      parts.push(`${index + 1}. ${action.description}`);
      parts.push(`   - Tool: ${this.formatServiceName(action.type)}`);
      parts.push(`   - Assumption: ${action.assumption}`);
      parts.push('');
    });

    parts.push(`## Assumed Services\n${template.services.join(', ')}\n`);
    parts.push(`## Data Flow\n${template.dataFlow}\n`);

    if (template.assumptions.length > 0) {
      parts.push(`## Assumptions Made\n`);
      template.assumptions.forEach((assumption, index) => {
        parts.push(`${index + 1}. **${assumption.assumption}**`);
        parts.push(`   - Reasoning: ${assumption.reasoning}`);
        parts.push('');
      });
    }

    return parts.join('\n');
  }

  /**
   * Build expanded intent description generically
   */
  private buildExpandedIntentDescription(
    goal: string,
    trigger: string,
    actions: string[],
    services: string[],
    assumptions: Array<{ assumption: string; reasoning: string; requires_confirmation: boolean }>
  ): string {
    const parts: string[] = [];

    parts.push(`## Workflow Goal\n${goal}\n`);
    parts.push(`## Assumed Trigger\n${trigger}\n`);
    parts.push(`## Assumed Actions\n`);
    
    actions.forEach((action, index) => {
      const [type, operation] = action.split(':');
      parts.push(`${index + 1}. ${this.formatServiceName(type)} - ${operation}`);
    });

    parts.push(`\n## Assumed Services\n${services.join(', ')}\n`);

    if (assumptions.length > 0) {
      parts.push(`## Assumptions Made\n`);
      assumptions.forEach((assumption, index) => {
        parts.push(`${index + 1}. **${assumption.assumption}**`);
        parts.push(`   - Reasoning: ${assumption.reasoning}`);
        parts.push('');
      });
    }

    return parts.join('\n');
  }


  /**
   * Extract services from structured intent
   */
  private extractServices(intent: StructuredIntent): string[] {
    const services = new Set<string>();

    if (intent.actions && intent.actions.length > 0) {
      intent.actions.forEach(action => {
        // Extract service name from node type (e.g., "google_sheets" → "Google Sheets")
        const serviceName = this.formatServiceName(action.type);
        if (serviceName) {
          services.add(serviceName);
        }
      });
    }

    return Array.from(services);
  }

  /**
   * Format service name from node type
   */
  private formatServiceName(nodeType: string): string {
    // Common mappings
    const mappings: Record<string, string> = {
      'google_sheets': 'Google Sheets',
      'google_gmail': 'Gmail',
      'google_doc': 'Google Docs',
      'slack_message': 'Slack',
      'hubspot': 'HubSpot CRM',
      'airtable': 'Airtable',
      'database_read': 'Database',
      'database_write': 'Database',
      'http_request': 'HTTP API',
      'ai_processing': 'AI Processing',
      'summarization': 'Summarization',
      'classification': 'Classification',
      'if_else': 'Conditional Logic',
      'loop': 'Loop',
      'set_variable': 'Data Extraction',
    };

    // Check exact match first
    if (mappings[nodeType]) {
      return mappings[nodeType];
    }

    // Format node type (e.g., "zoho_crm" → "Zoho CRM")
    return nodeType
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  /**
   * Format trigger name
   */
  private formatTrigger(trigger: string): string {
    const mappings: Record<string, string> = {
      'manual_trigger': 'Manual trigger (user initiates)',
      'schedule': 'Schedule (recurring)',
      'webhook': 'Webhook (HTTP endpoint)',
      'form': 'Form submission',
      'chat_trigger': 'Chat trigger',
      'interval': 'Interval (time-based)',
    };

    return mappings[trigger] || trigger;
  }

  /**
   * Generate workflow goal description
   */
  private generateWorkflowGoal(userPrompt: string, structuredIntent: StructuredIntent): string {
    // Try to infer goal from prompt and structured intent
    if (structuredIntent.actions && structuredIntent.actions.length > 0) {
      const actions = structuredIntent.actions.map(a => `${a.operation} using ${this.formatServiceName(a.type)}`).join(', ');
      return `Automate workflow to ${actions}`;
    }

    // Fallback to user prompt
    return userPrompt;
  }
}

// Export singleton instance
export const intentAutoExpander = new IntentAutoExpander();
