/**
 * Industry Standard Workflow Templates
 * 
 * Deterministic workflow patterns for common industry use cases.
 * These templates are used to expand vague prompts into concrete workflows.
 */

export interface IndustryWorkflowTemplate {
  /**
   * Keywords that trigger this template
   */
  keywords: string[];
  
  /**
   * Workflow goal description
   */
  goal: string;
  
  /**
   * Assumed trigger
   */
  trigger: {
    type: string;
    description: string;
  };
  
  /**
   * Assumed actions (ordered sequence)
   */
  actions: Array<{
    type: string;
    operation: string;
    description: string;
    assumption: string;
  }>;
  
  /**
   * Services used
   */
  services: string[];
  
  /**
   * Assumptions made
   */
  assumptions: Array<{
    assumption: string;
    reasoning: string;
    requires_confirmation: boolean;
  }>;
  
  /**
   * Data flow description
   */
  dataFlow: string;
}

/**
 * Industry Standard Workflow Templates
 * Deterministic mappings from vague prompts to concrete workflows
 */
export const INDUSTRY_WORKFLOW_TEMPLATES: Record<string, IndustryWorkflowTemplate> = {
  // Sales & CRM
  'sales_agent': {
    keywords: ['sales agent', 'sales automation', 'sales workflow', 'sales process'],
    goal: 'Automate sales lead management and follow-up process',
    trigger: {
      type: 'manual_trigger',
      description: 'Manual trigger - user initiates workflow',
    },
    actions: [
      {
        type: 'hubspot',
        operation: 'read',
        description: 'Fetch leads from HubSpot CRM',
        assumption: 'Using HubSpot as CRM system',
      },
      {
        type: 'ai_processing', // Capability tag, will be resolved to ollama/openai/etc.
        operation: 'analyze',
        description: 'Analyze lead data and prioritize',
        assumption: 'AI analysis for lead scoring',
      },
      {
        type: 'google_gmail',
        operation: 'send',
        description: 'Send personalized outreach email',
        assumption: 'Using Gmail for email communication',
      },
      {
        type: 'hubspot',
        operation: 'update',
        description: 'Update lead status in CRM',
        assumption: 'Tracking lead status in CRM',
      },
    ],
    services: ['HubSpot CRM', 'Gmail', 'AI Service'],
    assumptions: [
      {
        assumption: 'Using HubSpot as the CRM system',
        reasoning: 'Industry standard for sales automation workflows',
        requires_confirmation: true,
      },
      {
        assumption: 'Using Gmail for email communication',
        reasoning: 'Common email service for sales outreach',
        requires_confirmation: true,
      },
      {
        assumption: 'AI analysis for lead prioritization',
        reasoning: 'Standard practice for modern sales workflows',
        requires_confirmation: true,
      },
    ],
    dataFlow: 'Leads are fetched from CRM, analyzed by AI, then outreach emails are sent, and lead status is updated back in CRM',
  },
  
  'crm_workflow': {
    keywords: ['crm', 'customer relationship', 'lead management', 'contact management'],
    goal: 'Automate customer relationship management and lead tracking',
    trigger: {
      type: 'form',
      description: 'Form submission - new lead captured',
    },
    actions: [
      {
        type: 'hubspot',
        operation: 'create',
        description: 'Create contact in HubSpot CRM',
        assumption: 'Using HubSpot as CRM system',
      },
      {
        type: 'google_gmail',
        operation: 'send',
        description: 'Send welcome email to new contact',
        assumption: 'Using Gmail for email communication',
      },
      {
        type: 'google_sheets',
        operation: 'write',
        description: 'Log contact in Google Sheets for tracking',
        assumption: 'Using Google Sheets for backup tracking',
      },
    ],
    services: ['HubSpot CRM', 'Gmail', 'Google Sheets'],
    assumptions: [
      {
        assumption: 'Using HubSpot as the CRM system',
        reasoning: 'Industry standard CRM platform',
        requires_confirmation: true,
      },
      {
        assumption: 'Form submission as trigger',
        reasoning: 'Common pattern for lead capture workflows',
        requires_confirmation: true,
      },
      {
        assumption: 'Welcome email automation',
        reasoning: 'Standard practice for new contact onboarding',
        requires_confirmation: true,
      },
    ],
    dataFlow: 'New lead from form → Create in CRM → Send welcome email → Log in spreadsheet',
  },
  
  // Marketing
  'marketing_automation': {
    keywords: ['marketing', 'marketing automation', 'campaign', 'email marketing'],
    goal: 'Automate marketing campaigns and email sequences',
    trigger: {
      type: 'schedule',
      description: 'Schedule trigger - daily campaign execution',
    },
    actions: [
      {
        type: 'google_sheets',
        operation: 'read',
        description: 'Read campaign data from Google Sheets',
        assumption: 'Using Google Sheets for campaign data',
      },
      {
        type: 'ai_processing', // Capability tag, will be resolved to ollama/openai/etc.
        operation: 'generate',
        description: 'Generate personalized email content',
        assumption: 'AI-generated personalized content',
      },
      {
        type: 'google_gmail',
        operation: 'send',
        description: 'Send marketing emails to recipients',
        assumption: 'Using Gmail for email delivery',
      },
      {
        type: 'google_sheets',
        operation: 'write',
        description: 'Log campaign results in spreadsheet',
        assumption: 'Tracking campaign performance',
      },
    ],
    services: ['Google Sheets', 'AI Service', 'Gmail'],
    assumptions: [
      {
        assumption: 'Scheduled daily execution',
        reasoning: 'Standard practice for marketing campaigns',
        requires_confirmation: true,
      },
      {
        assumption: 'AI-generated personalized content',
        reasoning: 'Modern marketing automation uses AI personalization',
        requires_confirmation: true,
      },
    ],
    dataFlow: 'Read campaign data → Generate content → Send emails → Log results',
  },
  
  // Recruitment
  'recruitment_workflow': {
    keywords: ['recruitment', 'hiring', 'recruiting', 'candidate', 'job application'],
    goal: 'Automate recruitment and candidate management process',
    trigger: {
      type: 'form',
      description: 'Form submission - job application received',
    },
    actions: [
      {
        type: 'airtable',
        operation: 'create',
        description: 'Create candidate record in Airtable',
        assumption: 'Using Airtable for candidate tracking',
      },
      {
        type: 'ai_processing', // Capability tag, will be resolved to ollama/openai/etc.
        operation: 'analyze',
        description: 'Analyze resume and candidate qualifications',
        assumption: 'AI resume screening',
      },
      {
        type: 'google_gmail',
        operation: 'send',
        description: 'Send acknowledgment email to candidate',
        assumption: 'Using Gmail for candidate communication',
      },
      {
        type: 'slack_message',
        operation: 'send',
        description: 'Notify hiring team in Slack',
        assumption: 'Using Slack for team notifications',
      },
    ],
    services: ['Airtable', 'AI Service', 'Gmail', 'Slack'],
    assumptions: [
      {
        assumption: 'Using Airtable for candidate tracking',
        reasoning: 'Common tool for recruitment workflows',
        requires_confirmation: true,
      },
      {
        assumption: 'AI resume screening',
        reasoning: 'Standard practice for modern recruitment',
        requires_confirmation: true,
      },
      {
        assumption: 'Slack notifications for hiring team',
        reasoning: 'Common collaboration tool for recruitment',
        requires_confirmation: true,
      },
    ],
    dataFlow: 'Application form → Create candidate record → AI analysis → Send acknowledgment → Notify team',
  },
  
  // Data Processing
  'data_sync': {
    keywords: ['data sync', 'data synchronization', 'sync data', 'data pipeline'],
    goal: 'Synchronize data between systems',
    trigger: {
      type: 'schedule',
      description: 'Schedule trigger - hourly data sync',
    },
    actions: [
      {
        type: 'database_read',
        operation: 'read',
        description: 'Read data from source database',
        assumption: 'Database as source system',
      },
      {
        type: 'ai_processing', // Capability tag, will be resolved to ollama/openai/etc.
        operation: 'transform',
        description: 'Transform and validate data',
        assumption: 'Data transformation required',
      },
      {
        type: 'google_sheets',
        operation: 'write',
        description: 'Write data to Google Sheets',
        assumption: 'Google Sheets as destination',
      },
    ],
    services: ['Database', 'AI Service', 'Google Sheets'],
    assumptions: [
      {
        assumption: 'Scheduled hourly synchronization',
        reasoning: 'Standard practice for data sync workflows',
        requires_confirmation: true,
      },
      {
        assumption: 'Data transformation required',
        reasoning: 'Common need when syncing between different systems',
        requires_confirmation: true,
      },
    ],
    dataFlow: 'Read from database → Transform data → Write to spreadsheet',
  },
  
  // Notification & Alerts
  'notification_system': {
    keywords: ['notification', 'alert', 'notify', 'alert system'],
    goal: 'Send notifications and alerts based on events',
    trigger: {
      type: 'webhook',
      description: 'Webhook trigger - external event received',
    },
    actions: [
      {
        type: 'ai_processing', // Capability tag, will be resolved to ollama/openai/etc.
        operation: 'analyze',
        description: 'Analyze event data',
        assumption: 'Event analysis required',
      },
      {
        type: 'slack_message',
        operation: 'send',
        description: 'Send notification to Slack',
        assumption: 'Using Slack for notifications',
      },
      {
        type: 'google_gmail',
        operation: 'send',
        description: 'Send email alert',
        assumption: 'Email alerts for important events',
      },
    ],
    services: ['AI Service', 'Slack', 'Gmail'],
    assumptions: [
      {
        assumption: 'Webhook as trigger source',
        reasoning: 'Common pattern for event-driven notifications',
        requires_confirmation: true,
      },
      {
        assumption: 'Multi-channel notifications (Slack + Email)',
        reasoning: 'Standard practice for critical alerts',
        requires_confirmation: true,
      },
    ],
    dataFlow: 'Webhook event → Analyze → Send Slack notification → Send email alert',
  },
  
  // Reporting
  'report_generation': {
    keywords: ['report', 'reporting', 'generate report', 'analytics'],
    goal: 'Automate report generation and distribution',
    trigger: {
      type: 'schedule',
      description: 'Schedule trigger - daily report generation',
    },
    actions: [
      {
        type: 'google_sheets',
        operation: 'read',
        description: 'Read data from Google Sheets',
        assumption: 'Using Google Sheets as data source',
      },
      {
        type: 'ai_processing', // Capability tag, will be resolved to ollama/openai/etc.
        operation: 'analyze',
        description: 'Analyze data and generate insights',
        assumption: 'AI-powered analytics',
      },
      {
        type: 'google_doc',
        operation: 'create',
        description: 'Generate report document',
        assumption: 'Using Google Docs for reports',
      },
      {
        type: 'google_gmail',
        operation: 'send',
        description: 'Send report via email',
        assumption: 'Email distribution of reports',
      },
    ],
    services: ['Google Sheets', 'AI Service', 'Google Docs', 'Gmail'],
    assumptions: [
      {
        assumption: 'Scheduled daily report generation',
        reasoning: 'Standard practice for reporting workflows',
        requires_confirmation: true,
      },
      {
        assumption: 'AI-powered analytics and insights',
        reasoning: 'Modern reporting uses AI for analysis',
        requires_confirmation: true,
      },
    ],
    dataFlow: 'Read data → Analyze → Generate report document → Send via email',
  },
};

/**
 * Find matching industry workflow template for a prompt
 */
export function findIndustryTemplate(prompt: string): IndustryWorkflowTemplate | null {
  const promptLower = prompt.toLowerCase();
  
  // Check each template for keyword matches
  for (const [key, template] of Object.entries(INDUSTRY_WORKFLOW_TEMPLATES)) {
    const matches = template.keywords.filter(keyword => 
      promptLower.includes(keyword.toLowerCase())
    );
    
    if (matches.length > 0) {
      console.log(`[IndustryTemplate] Found match: ${key} (matched keywords: ${matches.join(', ')})`);
      return template;
    }
  }
  
  return null;
}

/**
 * Get all available industry templates
 */
export function getAllIndustryTemplates(): IndustryWorkflowTemplate[] {
  return Object.values(INDUSTRY_WORKFLOW_TEMPLATES);
}
