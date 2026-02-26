/**
 * Workflow Template Resolver
 * Matches workflow intent to predefined immutable templates
 * Stage 3.5 of the 8-step pipeline
 */

import type { WorkflowIntent } from './workflow-intent-parser';

export interface WorkflowTemplate {
  id: string;
  name: string;
  description: string;
  requiredNodes: string[];
  structure: string;
  validation: {
    triggers: string[];
    actions: string[];
    cronRequired?: boolean;
  };
  matcher: (intent: WorkflowIntent) => number;
}

export interface TemplateMatch {
  success: boolean;
  template?: WorkflowTemplate;
  confidence?: number;
  error?: string;
  suggestions?: string[];
}

/**
 * Workflow Template Resolver
 * Matches intent to immutable workflow templates
 */
export class WorkflowTemplateResolver {
  private templates: WorkflowTemplate[];

  constructor() {
    this.templates = this.initializeTemplates();
  }

  /**
   * Resolve template for intent
   * Must match ONE template exactly
   */
  resolveTemplate(intent: WorkflowIntent): TemplateMatch {
    const scores: Array<{ template: WorkflowTemplate; score: number }> = [];

    // Score each template
    for (const template of this.templates) {
      const score = template.matcher(intent);
      if (score > 0) {
        scores.push({ template, score });
      }
    }

    if (scores.length === 0) {
      return {
        success: false,
        error: 'No matching template found for intent',
        suggestions: [
          'Specify a clear trigger type (schedule, manual, webhook, form)',
          'Specify a clear action type (send, post, save, etc.)',
          'Use one of the supported patterns'
        ]
      };
    }

    // Sort by score descending
    scores.sort((a, b) => b.score - a.score);

    // Check for exact match (score >= 0.8)
    const topMatch = scores[0];
    if (topMatch.score >= 0.8) {
      return {
        success: true,
        template: topMatch.template,
        confidence: topMatch.score
      };
    }

    // Check for ambiguous matches
    if (scores.length > 1 && topMatch.score - scores[1].score < 0.15) {
      return {
        success: false,
        error: 'Multiple templates match. Please clarify your intent.',
        suggestions: [
          `Template 1: ${topMatch.template.name} (confidence: ${(topMatch.score * 100).toFixed(0)}%)`,
          `Template 2: ${scores[1].template.name} (confidence: ${(scores[1].score * 100).toFixed(0)}%)`
        ]
      };
    }

    // Low confidence match
    return {
      success: false,
      error: `Template match confidence too low (${(topMatch.score * 100).toFixed(0)}%). Please provide more specific requirements.`,
      suggestions: [
        `Closest match: ${topMatch.template.name}`,
        'Specify trigger type, action type, and platform more clearly'
      ]
    };
  }

  /**
   * Get all available templates
   */
  getAvailableTemplates(): WorkflowTemplate[] {
    return this.templates;
  }

  /**
   * Initialize workflow templates
   * These are immutable blueprints
   */
  private initializeTemplates(): WorkflowTemplate[] {
    return [
      {
        id: 'scheduled_notification',
        name: 'SCHEDULED_NOTIFICATION',
        description: 'Schedule → Notification',
        requiredNodes: ['schedule', 'slack_message|email'],
        structure: 'trigger → action',
        validation: {
          triggers: ['schedule'],
          actions: ['slack_message', 'email'],
          cronRequired: true
        },
        matcher: (intent) => {
          let score = 0;
          if (intent.trigger === 'schedule') score += 0.5;
          if (intent.action === 'send' || intent.action === 'post') score += 0.3;
          if (intent.platform === 'slack_message' || intent.platform === 'email') score += 0.2;
          if (intent.schedule) score += 0.1;
          return score;
        }
      },
      {
        id: 'manual_trigger_workflow',
        name: 'MANUAL_TRIGGER_WORKFLOW',
        description: 'Manual Trigger → Action',
        requiredNodes: ['manual_trigger', '*'],
        structure: 'manual_trigger → action',
        validation: {
          triggers: ['manual_trigger'],
          actions: ['*'],
          cronRequired: false
        },
        matcher: (intent) => {
          let score = 0;
          if (intent.trigger === 'manual_trigger') score += 0.6;
          if (intent.action) score += 0.3;
          if (!intent.schedule) score += 0.1; // Manual should not have schedule
          return score;
        }
      },
      {
        id: 'form_submission',
        name: 'FORM_SUBMISSION',
        description: 'Form → Database + Notification',
        requiredNodes: ['form', 'database_write', 'slack_message|email'],
        structure: 'form → database_write → slack_message/email',
        validation: {
          triggers: ['form'],
          actions: ['database_write', 'slack_message', 'email'],
          cronRequired: false
        },
        matcher: (intent) => {
          let score = 0;
          if (intent.trigger === 'form') score += 0.5;
          if (intent.action === 'write' || intent.action === 'save') score += 0.3;
          if (intent.platform?.includes('database') || intent.platform?.includes('supabase')) score += 0.2;
          return score;
        }
      },
      {
        id: 'webhook_processing',
        name: 'WEBHOOK_PROCESSING',
        description: 'Webhook → Process → Action',
        requiredNodes: ['webhook', '*', '*'],
        structure: 'webhook → process → action',
        validation: {
          triggers: ['webhook'],
          actions: ['*'],
          cronRequired: false
        },
        matcher: (intent) => {
          let score = 0;
          if (intent.trigger === 'webhook') score += 0.5;
          if (intent.action === 'read' || intent.action === 'fetch' || intent.action === 'process') score += 0.3;
          if (intent.data_format === 'json') score += 0.2;
          return score;
        }
      },
      {
        id: 'ai_agent_chatbot',
        name: 'AI_AGENT_CHATBOT',
        description: 'Chat Trigger → AI Agent → Response',
        requiredNodes: ['chat_trigger', 'ai_agent', 'chat_model', 'memory'],
        structure: 'trigger → ai_agent → response_tool',
        validation: {
          triggers: ['chat_trigger', 'manual_trigger', 'form'],
          actions: ['ai_agent'],
          cronRequired: false
        },
        matcher: (intent) => {
          let score = 0;
          if (intent.content_type === 'text' || intent.action === 'chat') score += 0.3;
          if (intent.platform === 'slack_message' || intent.platform === 'discord') score += 0.3;
          if (intent.trigger === 'chat_trigger' || intent.trigger === 'form') score += 0.4;
          return score;
        }
      },
      {
        id: 'data_sync_pipeline',
        name: 'DATA_SYNC_PIPELINE',
        description: 'Schedule → Sync Data',
        requiredNodes: ['schedule', '*', '*'],
        structure: 'schedule → source → destination',
        validation: {
          triggers: ['schedule'],
          actions: ['*'],
          cronRequired: true
        },
        matcher: (intent) => {
          let score = 0;
          if (intent.trigger === 'schedule') score += 0.3;
          if (intent.action === 'sync' || intent.action === 'synchronize') score += 0.4;
          if (intent.platform?.includes('sheets') || intent.platform?.includes('database')) score += 0.3;
          return score;
        }
      }
    ];
  }
}
