/**
 * Domain Intent Handler
 * 
 * Handles abstract domain keywords in prompts and generates domain-specific
 * clarification questions instead of building workflows.
 * 
 * When prompt contains abstract domain keywords:
 * - recruitment, hiring
 * - sales
 * - crm
 * - marketing
 * - onboarding
 * 
 * Generate clarification questions instead of building workflow.
 */

import { StructuredIntent } from './intent-structurer';

export interface DomainIntentResult {
  isDomainIntent: boolean;
  domain?: string;
  clarificationRequired: boolean;
  clarificationQuestions: string[];
}

export interface DomainDefinition {
  keywords: string[];
  systems: string[];
  triggers: string[];
  actions: string[];
  questions: string[];
}

export class DomainIntentHandler {
  /**
   * Domain definitions with keywords, systems, triggers, and actions
   */
  private readonly domainDefinitions: Map<string, DomainDefinition> = new Map([
    [
      'recruitment',
      {
        keywords: ['recruitment', 'recruiting', 'hiring', 'hr', 'human resources', 'talent acquisition'],
        systems: ['HubSpot', 'Zoho CRM', 'ATS (Applicant Tracking System)', 'LinkedIn', 'custom system'],
        triggers: [
          'New job application submitted',
          'Candidate applies via form',
          'Resume uploaded',
          'Interview scheduled',
          'Manual trigger',
        ],
        actions: [
          'Screen candidates',
          'Send notification emails',
          'Schedule interviews',
          'Update candidate status',
          'Create candidate record',
          'Send rejection/acceptance emails',
        ],
        questions: [
          'Which system should manage candidates? (e.g., HubSpot, Zoho CRM, ATS, LinkedIn, custom)',
          'What triggers the workflow? (e.g., new application, resume upload, interview scheduled)',
          'What actions should occur? (e.g., screen candidates, notify team, schedule interviews, update status)',
          'What information should be extracted from applications? (e.g., name, email, position, resume)',
        ],
      },
    ],
    [
      'sales',
      {
        keywords: ['sales', 'selling', 'revenue', 'pipeline', 'deal', 'opportunity'],
        systems: ['HubSpot', 'Salesforce', 'Zoho CRM', 'Pipedrive', 'custom CRM'],
        triggers: [
          'New lead created',
          'Deal stage changed',
          'Opportunity created',
          'Quote requested',
          'Manual trigger',
        ],
        actions: [
          'Create lead/opportunity',
          'Update deal status',
          'Send quote/proposal',
          'Notify sales team',
          'Schedule follow-up',
          'Update pipeline',
        ],
        questions: [
          'Which CRM system should be used? (e.g., HubSpot, Salesforce, Zoho CRM, Pipedrive)',
          'What triggers the workflow? (e.g., new lead, deal stage change, opportunity created)',
          'What actions should occur? (e.g., create opportunity, send quote, notify team, update pipeline)',
          'What data should be tracked? (e.g., lead source, deal value, stage, owner)',
        ],
      },
    ],
    [
      'crm',
      {
        keywords: ['crm', 'customer relationship management', 'customer management'],
        systems: ['HubSpot', 'Salesforce', 'Zoho CRM', 'Pipedrive', 'Freshdesk', 'custom CRM'],
        triggers: [
          'New contact created',
          'Contact updated',
          'Deal created',
          'Ticket created',
          'Manual trigger',
        ],
        actions: [
          'Create/update contact',
          'Create/update deal',
          'Create ticket',
          'Send email',
          'Sync data',
          'Update status',
        ],
        questions: [
          'Which CRM system should be used? (e.g., HubSpot, Salesforce, Zoho CRM, Pipedrive)',
          'What triggers the workflow? (e.g., new contact, deal created, ticket created)',
          'What actions should occur? (e.g., create contact, update deal, send email, sync data)',
          'What data should be managed? (e.g., contacts, deals, tickets, activities)',
        ],
      },
    ],
    [
      'marketing',
      {
        keywords: ['marketing', 'marketing automation', 'campaign', 'newsletter', 'email marketing'],
        systems: ['Mailchimp', 'HubSpot', 'ActiveCampaign', 'Google Analytics', 'custom platform'],
        triggers: [
          'New subscriber',
          'Campaign launched',
          'Form submitted',
          'Email opened',
          'Manual trigger',
        ],
        actions: [
          'Send newsletter',
          'Segment contacts',
          'Track campaign performance',
          'Send follow-up emails',
          'Update contact tags',
          'Create campaign',
        ],
        questions: [
          'Which marketing platform should be used? (e.g., Mailchimp, HubSpot, ActiveCampaign)',
          'What triggers the workflow? (e.g., new subscriber, campaign launch, form submission)',
          'What actions should occur? (e.g., send newsletter, segment contacts, track performance)',
          'What metrics should be tracked? (e.g., opens, clicks, conversions)',
        ],
      },
    ],
    [
      'onboarding',
      {
        keywords: ['onboarding', 'employee onboarding', 'new hire', 'new employee'],
        systems: ['HRIS', 'Slack', 'Google Workspace', 'custom HR system'],
        triggers: [
          'New employee hired',
          'Onboarding form submitted',
          'Start date reached',
          'Manual trigger',
        ],
        actions: [
          'Send welcome email',
          'Create accounts',
          'Assign tasks',
          'Schedule training',
          'Notify team',
          'Update HR system',
        ],
        questions: [
          'Which system should manage onboarding? (e.g., HRIS, Slack, Google Workspace, custom HR system)',
          'What triggers the workflow? (e.g., new hire, start date, form submission)',
          'What actions should occur? (e.g., send welcome email, create accounts, assign tasks, schedule training)',
          'What information is needed? (e.g., employee name, email, department, start date)',
        ],
      },
    ],
  ]);

  /**
   * Handle domain intent - detect abstract domain keywords and generate clarification questions
   */
  handleDomainIntent(
    userPrompt: string,
    intent?: StructuredIntent
  ): DomainIntentResult {
    console.log(`[DomainIntentHandler] Checking for domain intent in prompt: "${userPrompt}"`);

    const promptLower = userPrompt.toLowerCase().trim();

    // Check each domain definition
    for (const [domain, definition] of this.domainDefinitions.entries()) {
      // Check if prompt contains domain keywords
      const hasDomainKeyword = definition.keywords.some(keyword => 
        promptLower.includes(keyword.toLowerCase())
      );

      if (hasDomainKeyword) {
        // Check if prompt is abstract (lacks specific actions)
        const isAbstract = this.isAbstractDomainPrompt(promptLower, definition, intent);

        if (isAbstract) {
          console.warn(`[DomainIntentHandler] ⚠️  Abstract ${domain} domain prompt detected`);
          console.warn(`[DomainIntentHandler]   Prompt: "${userPrompt}"`);
          console.warn(`[DomainIntentHandler]   Generating ${definition.questions.length} clarification question(s)`);

          return {
            isDomainIntent: true,
            domain,
            clarificationRequired: true,
            clarificationQuestions: definition.questions,
          };
        } else {
          console.log(`[DomainIntentHandler] ✅ ${domain} domain prompt has specific actions, proceeding`);
        }
      }
    }

    // No domain intent detected
    return {
      isDomainIntent: false,
      clarificationRequired: false,
      clarificationQuestions: [],
    };
  }

  /**
   * Check if domain prompt is abstract (lacks specific actions)
   * A prompt is abstract if it only mentions the domain without specific actions
   */
  private isAbstractDomainPrompt(prompt: string, definition: DomainDefinition, intent?: StructuredIntent): boolean {
    // Check if prompt contains specific action keywords
    const hasSpecificAction = definition.actions.some(action => {
      const actionKeywords = action.toLowerCase().split(/\s+/);
      return actionKeywords.some(keyword => 
        keyword.length > 3 && prompt.includes(keyword)
      );
    });

    // Check if prompt contains specific system names
    const hasSpecificSystem = definition.systems.some(system => {
      const systemLower = system.toLowerCase();
      // Check for system name or common variations
      return prompt.includes(systemLower) || 
             prompt.includes(systemLower.replace(/\s+/g, '')) ||
             (systemLower.includes('hubspot') && prompt.includes('hubspot')) ||
             (systemLower.includes('salesforce') && prompt.includes('salesforce')) ||
             (systemLower.includes('zoho') && prompt.includes('zoho'));
    });

    // Check if intent has concrete actions
    const hasConcreteActions = this.hasConcreteActionsInIntent();

    // Prompt is abstract if:
    // - No specific action keywords found
    // - No specific system names found
    // - No concrete actions in intent
    const isAbstract = !hasSpecificAction && !hasSpecificSystem && !hasConcreteActions;

    if (isAbstract) {
      console.log(`[DomainIntentHandler]   Abstract check: hasSpecificAction=${hasSpecificAction}, hasSpecificSystem=${hasSpecificSystem}, hasConcreteActions=${hasConcreteActions}`);
    }

    return isAbstract;
  }

  /**
   * Check if intent has concrete actions (helper for abstract detection)
   * This is a simple check - the full validation is done by IntentCompletenessValidator
   */
  private hasConcreteActionsInIntent(): boolean {
    // This is a placeholder - in practice, we'd check the intent parameter
    // For now, we rely on the prompt analysis
    return false;
  }

  /**
   * Get domain-specific systems for a domain
   */
  getDomainSystems(domain: string): string[] {
    return this.domainDefinitions.get(domain)?.systems || [];
  }

  /**
   * Get domain-specific triggers for a domain
   */
  getDomainTriggers(domain: string): string[] {
    return this.domainDefinitions.get(domain)?.triggers || [];
  }

  /**
   * Get domain-specific actions for a domain
   */
  getDomainActions(domain: string): string[] {
    return this.domainDefinitions.get(domain)?.actions || [];
  }
}

// Export singleton instance
export const domainIntentHandler = new DomainIntentHandler();
