/**
 * Generate 200+ Workflow Training Examples
 * Covers all available node types with diverse patterns
 */

import * as fs from 'fs';
import * as path from 'path';

interface WorkflowExample {
  id: string;
  category: string;
  goal: string;
  phase1: {
    step1: {
      userPrompt: string;
    };
    step3: {
      systemPrompt: string;
      wordCount: number;
      temperature: number;
    };
    step4: {
      requirements: {
        primaryGoal: string;
        platforms?: string[];
        credentialsRequired?: string[];
        complexityLevel: string;
      };
    };
    step5: {
      structure: {
        flowType: string;
        description: string;
      };
      selectedNodes: string[];
      nodeConfigurations: Record<string, any>;
      connections: string[];
    };
  };
  phase2: {
    executionInitialization: {
      executionId: string;
      iterationCount: number;
    };
    executionLoop: Array<{
      iteration: number;
      execution: string;
      stateUpdated: string;
    }>;
    executionFinalization: {
      totalIterations: number;
      goalAchieved: boolean;
    };
  };
}

// Available node types by category
const NODE_TYPES = {
  triggers: ['schedule', 'webhook', 'manual_trigger', 'interval', 'chat_trigger', 'form'],
  social: ['linkedin', 'twitter', 'instagram', 'facebook'],
  notification: ['slack_message', 'discord', 'email', 'google_gmail', 'telegram', 'microsoft_teams'],
  database: ['google_sheets', 'google_doc', 'database_read', 'database_write', 'supabase', 'postgresql'],
  transformation: ['javascript', 'text_formatter', 'set_variable', 'json_parser', 'merge_data'],
  logic: ['if_else', 'switch', 'wait', 'loop', 'filter'],
  ai: ['ai_agent'],
  http: ['http_request', 'respond_to_webhook'],
  output: ['log_output'],
};

// Generate workflow examples
function generateWorkflowExamples(): WorkflowExample[] {
  const examples: WorkflowExample[] = [];
  let id = 101; // Start from 101 (assuming 100 already exist)

  // ============================================
  // CATEGORY 1: SOCIAL MEDIA POSTING (20 examples)
  // ============================================
  
  // LinkedIn Examples (10)
  examples.push(createExample(id++, 'Social Media', 'post to linkedin daily', {
    trigger: 'schedule',
    nodes: ['schedule', 'linkedin'],
    cron: '0 9 * * *',
    credentials: ['LINKEDIN_ACCESS_TOKEN'],
  }));

  examples.push(createExample(id++, 'Social Media', 'post content to linkedin', {
    trigger: 'manual_trigger',
    nodes: ['manual_trigger', 'linkedin'],
    credentials: ['LINKEDIN_ACCESS_TOKEN'],
  }));

  examples.push(createExample(id++, 'Social Media', 'schedule linkedin posts weekly', {
    trigger: 'schedule',
    nodes: ['schedule', 'linkedin'],
    cron: '0 10 * * 1',
    credentials: ['LINKEDIN_ACCESS_TOKEN'],
  }));

  examples.push(createExample(id++, 'Social Media', 'post to linkedin from google sheets', {
    trigger: 'schedule',
    nodes: ['schedule', 'google_sheets', 'linkedin'],
    credentials: ['GOOGLE_OAUTH', 'LINKEDIN_ACCESS_TOKEN'],
  }));

  examples.push(createExample(id++, 'Social Media', 'post linkedin update daily at 8am', {
    trigger: 'schedule',
    nodes: ['schedule', 'linkedin'],
    cron: '0 8 * * *',
    credentials: ['LINKEDIN_ACCESS_TOKEN'],
  }));

  examples.push(createExample(id++, 'Social Media', 'automatically post to linkedin', {
    trigger: 'schedule',
    nodes: ['schedule', 'linkedin'],
    cron: '0 12 * * *',
    credentials: ['LINKEDIN_ACCESS_TOKEN'],
  }));

  examples.push(createExample(id++, 'Social Media', 'share content on linkedin', {
    trigger: 'manual_trigger',
    nodes: ['manual_trigger', 'linkedin'],
    credentials: ['LINKEDIN_ACCESS_TOKEN'],
  }));

  examples.push(createExample(id++, 'Social Media', 'post linkedin article daily', {
    trigger: 'schedule',
    nodes: ['schedule', 'linkedin'],
    cron: '0 9 * * *',
    credentials: ['LINKEDIN_ACCESS_TOKEN'],
  }));

  examples.push(createExample(id++, 'Social Media', 'linkedin posting workflow', {
    trigger: 'manual_trigger',
    nodes: ['manual_trigger', 'linkedin'],
    credentials: ['LINKEDIN_ACCESS_TOKEN'],
  }));

  examples.push(createExample(id++, 'Social Media', 'daily linkedin post automation', {
    trigger: 'schedule',
    nodes: ['schedule', 'linkedin'],
    cron: '0 10 * * *',
    credentials: ['LINKEDIN_ACCESS_TOKEN'],
  }));

  // Twitter Examples (5)
  examples.push(createExample(id++, 'Social Media', 'post tweet to twitter', {
    trigger: 'manual_trigger',
    nodes: ['manual_trigger', 'twitter'],
    credentials: ['TWITTER_API_KEY', 'TWITTER_API_SECRET'],
  }));

  examples.push(createExample(id++, 'Social Media', 'schedule twitter posts daily', {
    trigger: 'schedule',
    nodes: ['schedule', 'twitter'],
    cron: '0 9 * * *',
    credentials: ['TWITTER_API_KEY', 'TWITTER_API_SECRET'],
  }));

  examples.push(createExample(id++, 'Social Media', 'post to twitter from sheets', {
    trigger: 'schedule',
    nodes: ['schedule', 'google_sheets', 'twitter'],
    credentials: ['GOOGLE_OAUTH', 'TWITTER_API_KEY'],
  }));

  examples.push(createExample(id++, 'Social Media', 'automated twitter posting', {
    trigger: 'schedule',
    nodes: ['schedule', 'twitter'],
    cron: '*/2 * * * *',
    credentials: ['TWITTER_API_KEY'],
  }));

  examples.push(createExample(id++, 'Social Media', 'tweet daily updates', {
    trigger: 'schedule',
    nodes: ['schedule', 'twitter'],
    cron: '0 12 * * *',
    credentials: ['TWITTER_API_KEY'],
  }));

  // Instagram Examples (5)
  examples.push(createExample(id++, 'Social Media', 'post to instagram', {
    trigger: 'manual_trigger',
    nodes: ['manual_trigger', 'instagram'],
    credentials: ['INSTAGRAM_ACCESS_TOKEN'],
  }));

  examples.push(createExample(id++, 'Social Media', 'schedule instagram posts', {
    trigger: 'schedule',
    nodes: ['schedule', 'instagram'],
    cron: '0 10 * * *',
    credentials: ['INSTAGRAM_ACCESS_TOKEN'],
  }));

  examples.push(createExample(id++, 'Social Media', 'daily instagram post', {
    trigger: 'schedule',
    nodes: ['schedule', 'instagram'],
    cron: '0 9 * * *',
    credentials: ['INSTAGRAM_ACCESS_TOKEN'],
  }));

  examples.push(createExample(id++, 'Social Media', 'automated instagram posting', {
    trigger: 'schedule',
    nodes: ['schedule', 'instagram'],
    cron: '0 11 * * *',
    credentials: ['INSTAGRAM_ACCESS_TOKEN'],
  }));

  examples.push(createExample(id++, 'Social Media', 'post image to instagram', {
    trigger: 'manual_trigger',
    nodes: ['manual_trigger', 'instagram'],
    credentials: ['INSTAGRAM_ACCESS_TOKEN'],
  }));

  // ============================================
  // CATEGORY 2: SCHEDULED AUTOMATION (30 examples)
  // ============================================

  // Daily Reports (10)
  examples.push(createExample(id++, 'Automation', 'send daily report to email', {
    trigger: 'schedule',
    nodes: ['schedule', 'email'],
    cron: '0 9 * * *',
    credentials: ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASSWORD'],
  }));

  examples.push(createExample(id++, 'Automation', 'daily email summary', {
    trigger: 'schedule',
    nodes: ['schedule', 'google_gmail'],
    cron: '0 8 * * *',
    credentials: ['GOOGLE_OAUTH'],
  }));

  examples.push(createExample(id++, 'Automation', 'send daily slack report', {
    trigger: 'schedule',
    nodes: ['schedule', 'slack_message'],
    cron: '0 9 * * *',
    credentials: ['SLACK_WEBHOOK_URL'],
  }));

  examples.push(createExample(id++, 'Automation', 'daily notification to discord', {
    trigger: 'schedule',
    nodes: ['schedule', 'discord'],
    cron: '0 10 * * *',
    credentials: ['DISCORD_WEBHOOK_URL'],
  }));

  examples.push(createExample(id++, 'Automation', 'generate daily report from sheets', {
    trigger: 'schedule',
    nodes: ['schedule', 'google_sheets', 'email'],
    cron: '0 9 * * *',
    credentials: ['GOOGLE_OAUTH', 'SMTP_HOST'],
  }));

  examples.push(createExample(id++, 'Automation', 'daily backup to sheets', {
    trigger: 'schedule',
    nodes: ['schedule', 'database_read', 'google_sheets'],
    cron: '0 2 * * *',
    credentials: ['DATABASE_URL', 'GOOGLE_OAUTH'],
  }));

  examples.push(createExample(id++, 'Automation', 'send daily summary email', {
    trigger: 'schedule',
    nodes: ['schedule', 'google_gmail'],
    cron: '0 18 * * *',
    credentials: ['GOOGLE_OAUTH'],
  }));

  examples.push(createExample(id++, 'Automation', 'daily data sync', {
    trigger: 'schedule',
    nodes: ['schedule', 'http_request', 'google_sheets'],
    cron: '0 6 * * *',
    credentials: ['API_KEY', 'GOOGLE_OAUTH'],
  }));

  examples.push(createExample(id++, 'Automation', 'daily reminder to slack', {
    trigger: 'schedule',
    nodes: ['schedule', 'slack_message'],
    cron: '0 9 * * *',
    credentials: ['SLACK_WEBHOOK_URL'],
  }));

  examples.push(createExample(id++, 'Automation', 'send daily metrics report', {
    trigger: 'schedule',
    nodes: ['schedule', 'http_request', 'email'],
    cron: '0 17 * * *',
    credentials: ['API_KEY', 'SMTP_HOST'],
  }));

  // Hourly Tasks (10)
  examples.push(createExample(id++, 'Automation', 'check api status hourly', {
    trigger: 'schedule',
    nodes: ['schedule', 'http_request', 'slack_message'],
    cron: '0 * * * *',
    credentials: ['API_KEY', 'SLACK_WEBHOOK_URL'],
  }));

  examples.push(createExample(id++, 'Automation', 'hourly data sync', {
    trigger: 'schedule',
    nodes: ['schedule', 'database_read', 'database_write'],
    cron: '0 * * * *',
    credentials: ['DATABASE_URL'],
  }));

  examples.push(createExample(id++, 'Automation', 'monitor api every hour', {
    trigger: 'schedule',
    nodes: ['schedule', 'http_request', 'if_else', 'email'],
    cron: '0 * * * *',
    credentials: ['API_KEY', 'SMTP_HOST'],
  }));

  examples.push(createExample(id++, 'Automation', 'hourly backup', {
    trigger: 'schedule',
    nodes: ['schedule', 'google_sheets', 'google_doc'],
    cron: '0 * * * *',
    credentials: ['GOOGLE_OAUTH'],
  }));

  examples.push(createExample(id++, 'Automation', 'check errors hourly', {
    trigger: 'schedule',
    nodes: ['schedule', 'database_read', 'if_else', 'slack_message'],
    cron: '0 * * * *',
    credentials: ['DATABASE_URL', 'SLACK_WEBHOOK_URL'],
  }));

  examples.push(createExample(id++, 'Automation', 'hourly notification', {
    trigger: 'schedule',
    nodes: ['schedule', 'slack_message'],
    cron: '0 * * * *',
    credentials: ['SLACK_WEBHOOK_URL'],
  }));

  examples.push(createExample(id++, 'Automation', 'sync data every hour', {
    trigger: 'schedule',
    nodes: ['schedule', 'http_request', 'google_sheets'],
    cron: '0 * * * *',
    credentials: ['API_KEY', 'GOOGLE_OAUTH'],
  }));

  examples.push(createExample(id++, 'Automation', 'hourly health check', {
    trigger: 'schedule',
    nodes: ['schedule', 'http_request', 'if_else', 'email'],
    cron: '0 * * * *',
    credentials: ['API_KEY', 'SMTP_HOST'],
  }));

  examples.push(createExample(id++, 'Automation', 'process queue hourly', {
    trigger: 'schedule',
    nodes: ['schedule', 'database_read', 'javascript', 'database_write'],
    cron: '0 * * * *',
    credentials: ['DATABASE_URL'],
  }));

  examples.push(createExample(id++, 'Automation', 'hourly report generation', {
    trigger: 'schedule',
    nodes: ['schedule', 'google_sheets', 'text_formatter', 'email'],
    cron: '0 * * * *',
    credentials: ['GOOGLE_OAUTH', 'SMTP_HOST'],
  }));

  // Weekly Tasks (10)
  examples.push(createExample(id++, 'Automation', 'send weekly report', {
    trigger: 'schedule',
    nodes: ['schedule', 'google_sheets', 'email'],
    cron: '0 9 * * 1',
    credentials: ['GOOGLE_OAUTH', 'SMTP_HOST'],
  }));

  examples.push(createExample(id++, 'Automation', 'weekly data backup', {
    trigger: 'schedule',
    nodes: ['schedule', 'database_read', 'google_sheets'],
    cron: '0 2 * * 0',
    credentials: ['DATABASE_URL', 'GOOGLE_OAUTH'],
  }));

  examples.push(createExample(id++, 'Automation', 'weekly summary email', {
    trigger: 'schedule',
    nodes: ['schedule', 'google_sheets', 'google_gmail'],
    cron: '0 10 * * 1',
    credentials: ['GOOGLE_OAUTH'],
  }));

  examples.push(createExample(id++, 'Automation', 'weekly analytics report', {
    trigger: 'schedule',
    nodes: ['schedule', 'http_request', 'javascript', 'email'],
    cron: '0 9 * * 1',
    credentials: ['API_KEY', 'SMTP_HOST'],
  }));

  examples.push(createExample(id++, 'Automation', 'weekly team update', {
    trigger: 'schedule',
    nodes: ['schedule', 'slack_message'],
    cron: '0 9 * * 1',
    credentials: ['SLACK_WEBHOOK_URL'],
  }));

  examples.push(createExample(id++, 'Automation', 'weekly database cleanup', {
    trigger: 'schedule',
    nodes: ['schedule', 'database_read', 'if_else', 'database_write'],
    cron: '0 3 * * 0',
    credentials: ['DATABASE_URL'],
  }));

  examples.push(createExample(id++, 'Automation', 'send weekly newsletter', {
    trigger: 'schedule',
    nodes: ['schedule', 'google_sheets', 'email'],
    cron: '0 10 * * 1',
    credentials: ['GOOGLE_OAUTH', 'SMTP_HOST'],
  }));

  examples.push(createExample(id++, 'Automation', 'weekly performance report', {
    trigger: 'schedule',
    nodes: ['schedule', 'http_request', 'text_formatter', 'slack_message'],
    cron: '0 9 * * 1',
    credentials: ['API_KEY', 'SLACK_WEBHOOK_URL'],
  }));

  examples.push(createExample(id++, 'Automation', 'weekly data export', {
    trigger: 'schedule',
    nodes: ['schedule', 'database_read', 'google_sheets'],
    cron: '0 4 * * 0',
    credentials: ['DATABASE_URL', 'GOOGLE_OAUTH'],
  }));

  examples.push(createExample(id++, 'Automation', 'weekly status update', {
    trigger: 'schedule',
    nodes: ['schedule', 'google_sheets', 'discord'],
    cron: '0 9 * * 1',
    credentials: ['GOOGLE_OAUTH', 'DISCORD_WEBHOOK_URL'],
  }));

  // ============================================
  // CATEGORY 3: FORM PROCESSING (20 examples)
  // ============================================

  examples.push(createExample(id++, 'Form Processing', 'save form data to sheets', {
    trigger: 'form',
    nodes: ['form', 'google_sheets'],
    credentials: ['GOOGLE_OAUTH'],
  }));

  examples.push(createExample(id++, 'Form Processing', 'form submission to email', {
    trigger: 'form',
    nodes: ['form', 'email'],
    credentials: ['SMTP_HOST'],
  }));

  examples.push(createExample(id++, 'Form Processing', 'form to slack notification', {
    trigger: 'form',
    nodes: ['form', 'slack_message'],
    credentials: ['SLACK_WEBHOOK_URL'],
  }));

  examples.push(createExample(id++, 'Form Processing', 'form data to database', {
    trigger: 'form',
    nodes: ['form', 'database_write'],
    credentials: ['DATABASE_URL'],
  }));

  examples.push(createExample(id++, 'Form Processing', 'form submission confirmation email', {
    trigger: 'form',
    nodes: ['form', 'google_gmail'],
    credentials: ['GOOGLE_OAUTH'],
  }));

  examples.push(createExample(id++, 'Form Processing', 'process form and send email', {
    trigger: 'form',
    nodes: ['form', 'javascript', 'email'],
    credentials: ['SMTP_HOST'],
  }));

  examples.push(createExample(id++, 'Form Processing', 'form to sheets and slack', {
    trigger: 'form',
    nodes: ['form', 'google_sheets', 'slack_message'],
    credentials: ['GOOGLE_OAUTH', 'SLACK_WEBHOOK_URL'],
  }));

  examples.push(createExample(id++, 'Form Processing', 'validate form and save', {
    trigger: 'form',
    nodes: ['form', 'if_else', 'database_write'],
    credentials: ['DATABASE_URL'],
  }));

  examples.push(createExample(id++, 'Form Processing', 'form submission workflow', {
    trigger: 'form',
    nodes: ['form', 'google_sheets', 'email'],
    credentials: ['GOOGLE_OAUTH', 'SMTP_HOST'],
  }));

  examples.push(createExample(id++, 'Form Processing', 'contact form to email', {
    trigger: 'form',
    nodes: ['form', 'email'],
    credentials: ['SMTP_HOST'],
  }));

  examples.push(createExample(id++, 'Form Processing', 'form data processing', {
    trigger: 'form',
    nodes: ['form', 'javascript', 'google_sheets'],
    credentials: ['GOOGLE_OAUTH'],
  }));

  examples.push(createExample(id++, 'Form Processing', 'form to multiple destinations', {
    trigger: 'form',
    nodes: ['form', 'google_sheets', 'slack_message', 'email'],
    credentials: ['GOOGLE_OAUTH', 'SLACK_WEBHOOK_URL', 'SMTP_HOST'],
  }));

  examples.push(createExample(id++, 'Form Processing', 'form submission notification', {
    trigger: 'form',
    nodes: ['form', 'discord'],
    credentials: ['DISCORD_WEBHOOK_URL'],
  }));

  examples.push(createExample(id++, 'Form Processing', 'form data transformation', {
    trigger: 'form',
    nodes: ['form', 'text_formatter', 'database_write'],
    credentials: ['DATABASE_URL'],
  }));

  examples.push(createExample(id++, 'Form Processing', 'form to supabase', {
    trigger: 'form',
    nodes: ['form', 'supabase'],
    credentials: ['SUPABASE_URL', 'SUPABASE_KEY'],
  }));

  examples.push(createExample(id++, 'Form Processing', 'form validation workflow', {
    trigger: 'form',
    nodes: ['form', 'if_else', 'email', 'slack_message'],
    credentials: ['SMTP_HOST', 'SLACK_WEBHOOK_URL'],
  }));

  examples.push(createExample(id++, 'Form Processing', 'form submission to gmail', {
    trigger: 'form',
    nodes: ['form', 'google_gmail'],
    credentials: ['GOOGLE_OAUTH'],
  }));

  examples.push(createExample(id++, 'Form Processing', 'form data enrichment', {
    trigger: 'form',
    nodes: ['form', 'http_request', 'google_sheets'],
    credentials: ['API_KEY', 'GOOGLE_OAUTH'],
  }));

  examples.push(createExample(id++, 'Form Processing', 'form to postgresql', {
    trigger: 'form',
    nodes: ['form', 'postgresql'],
    credentials: ['DATABASE_URL'],
  }));

  examples.push(createExample(id++, 'Form Processing', 'form processing with ai', {
    trigger: 'form',
    nodes: ['form', 'ai_agent', 'email'],
    credentials: ['OPENAI_API_KEY', 'SMTP_HOST'],
  }));

  // ============================================
  // CATEGORY 4: WEBHOOK AUTOMATION (20 examples)
  // ============================================

  examples.push(createExample(id++, 'Webhook', 'webhook to sheets', {
    trigger: 'webhook',
    nodes: ['webhook', 'google_sheets'],
    credentials: ['GOOGLE_OAUTH'],
  }));

  examples.push(createExample(id++, 'Webhook', 'webhook to slack', {
    trigger: 'webhook',
    nodes: ['webhook', 'slack_message'],
    credentials: ['SLACK_WEBHOOK_URL'],
  }));

  examples.push(createExample(id++, 'Webhook', 'webhook data processing', {
    trigger: 'webhook',
    nodes: ['webhook', 'javascript', 'database_write'],
    credentials: ['DATABASE_URL'],
  }));

  examples.push(createExample(id++, 'Webhook', 'webhook to email', {
    trigger: 'webhook',
    nodes: ['webhook', 'email'],
    credentials: ['SMTP_HOST'],
  }));

  examples.push(createExample(id++, 'Webhook', 'webhook notification', {
    trigger: 'webhook',
    nodes: ['webhook', 'discord'],
    credentials: ['DISCORD_WEBHOOK_URL'],
  }));

  examples.push(createExample(id++, 'Webhook', 'webhook to database', {
    trigger: 'webhook',
    nodes: ['webhook', 'database_write'],
    credentials: ['DATABASE_URL'],
  }));

  examples.push(createExample(id++, 'Webhook', 'process webhook payload', {
    trigger: 'webhook',
    nodes: ['webhook', 'json_parser', 'google_sheets'],
    credentials: ['GOOGLE_OAUTH'],
  }));

  examples.push(createExample(id++, 'Webhook', 'webhook to multiple channels', {
    trigger: 'webhook',
    nodes: ['webhook', 'slack_message', 'email'],
    credentials: ['SLACK_WEBHOOK_URL', 'SMTP_HOST'],
  }));

  examples.push(createExample(id++, 'Webhook', 'webhook validation', {
    trigger: 'webhook',
    nodes: ['webhook', 'if_else', 'database_write'],
    credentials: ['DATABASE_URL'],
  }));

  examples.push(createExample(id++, 'Webhook', 'webhook to linkedin', {
    trigger: 'webhook',
    nodes: ['webhook', 'linkedin'],
    credentials: ['LINKEDIN_ACCESS_TOKEN'],
  }));

  examples.push(createExample(id++, 'Webhook', 'webhook data transformation', {
    trigger: 'webhook',
    nodes: ['webhook', 'text_formatter', 'email'],
    credentials: ['SMTP_HOST'],
  }));

  examples.push(createExample(id++, 'Webhook', 'webhook to supabase', {
    trigger: 'webhook',
    nodes: ['webhook', 'supabase'],
    credentials: ['SUPABASE_URL', 'SUPABASE_KEY'],
  }));

  examples.push(createExample(id++, 'Webhook', 'webhook processing workflow', {
    trigger: 'webhook',
    nodes: ['webhook', 'javascript', 'slack_message'],
    credentials: ['SLACK_WEBHOOK_URL'],
  }));

  examples.push(createExample(id++, 'Webhook', 'webhook to postgresql', {
    trigger: 'webhook',
    nodes: ['webhook', 'postgresql'],
    credentials: ['DATABASE_URL'],
  }));

  examples.push(createExample(id++, 'Webhook', 'webhook response', {
    trigger: 'webhook',
    nodes: ['webhook', 'respond_to_webhook'],
    credentials: [],
  }));

  examples.push(createExample(id++, 'Webhook', 'webhook with ai processing', {
    trigger: 'webhook',
    nodes: ['webhook', 'ai_agent', 'email'],
    credentials: ['OPENAI_API_KEY', 'SMTP_HOST'],
  }));

  examples.push(createExample(id++, 'Webhook', 'webhook to twitter', {
    trigger: 'webhook',
    nodes: ['webhook', 'twitter'],
    credentials: ['TWITTER_API_KEY'],
  }));

  examples.push(createExample(id++, 'Webhook', 'webhook data sync', {
    trigger: 'webhook',
    nodes: ['webhook', 'database_read', 'google_sheets'],
    credentials: ['DATABASE_URL', 'GOOGLE_OAUTH'],
  }));

  examples.push(createExample(id++, 'Webhook', 'webhook conditional processing', {
    trigger: 'webhook',
    nodes: ['webhook', 'if_else', 'slack_message', 'email'],
    credentials: ['SLACK_WEBHOOK_URL', 'SMTP_HOST'],
  }));

  examples.push(createExample(id++, 'Webhook', 'webhook to multiple databases', {
    trigger: 'webhook',
    nodes: ['webhook', 'database_write', 'supabase'],
    credentials: ['DATABASE_URL', 'SUPABASE_URL'],
  }));

  // ============================================
  // CATEGORY 5: DATA PROCESSING (30 examples)
  // ============================================

  // Data Transformation (10)
  examples.push(createExample(id++, 'Data Processing', 'transform data with javascript', {
    trigger: 'manual_trigger',
    nodes: ['manual_trigger', 'javascript', 'google_sheets'],
    credentials: ['GOOGLE_OAUTH'],
  }));

  examples.push(createExample(id++, 'Data Processing', 'format text data', {
    trigger: 'manual_trigger',
    nodes: ['manual_trigger', 'text_formatter', 'email'],
    credentials: ['SMTP_HOST'],
  }));

  examples.push(createExample(id++, 'Data Processing', 'parse json data', {
    trigger: 'webhook',
    nodes: ['webhook', 'json_parser', 'database_write'],
    credentials: ['DATABASE_URL'],
  }));

  examples.push(createExample(id++, 'Data Processing', 'merge data from multiple sources', {
    trigger: 'schedule',
    nodes: ['schedule', 'google_sheets', 'database_read', 'merge_data', 'google_sheets'],
    cron: '0 9 * * *',
    credentials: ['GOOGLE_OAUTH', 'DATABASE_URL'],
  }));

  examples.push(createExample(id++, 'Data Processing', 'set variables from data', {
    trigger: 'form',
    nodes: ['form', 'set_variable', 'email'],
    credentials: ['SMTP_HOST'],
  }));

  examples.push(createExample(id++, 'Data Processing', 'data transformation pipeline', {
    trigger: 'schedule',
    nodes: ['schedule', 'database_read', 'javascript', 'text_formatter', 'google_sheets'],
    cron: '0 6 * * *',
    credentials: ['DATABASE_URL', 'GOOGLE_OAUTH'],
  }));

  examples.push(createExample(id++, 'Data Processing', 'process and format data', {
    trigger: 'manual_trigger',
    nodes: ['manual_trigger', 'google_sheets', 'text_formatter', 'slack_message'],
    credentials: ['GOOGLE_OAUTH', 'SLACK_WEBHOOK_URL'],
  }));

  examples.push(createExample(id++, 'Data Processing', 'extract and transform json', {
    trigger: 'webhook',
    nodes: ['webhook', 'json_parser', 'set_variable', 'database_write'],
    credentials: ['DATABASE_URL'],
  }));

  examples.push(createExample(id++, 'Data Processing', 'data enrichment workflow', {
    trigger: 'schedule',
    nodes: ['schedule', 'database_read', 'http_request', 'javascript', 'database_write'],
    cron: '0 8 * * *',
    credentials: ['DATABASE_URL', 'API_KEY'],
  }));

  examples.push(createExample(id++, 'Data Processing', 'merge and process data', {
    trigger: 'manual_trigger',
    nodes: ['manual_trigger', 'google_sheets', 'database_read', 'merge_data', 'email'],
    credentials: ['GOOGLE_OAUTH', 'DATABASE_URL', 'SMTP_HOST'],
  }));

  // Conditional Logic (10)
  examples.push(createExample(id++, 'Data Processing', 'conditional data processing', {
    trigger: 'form',
    nodes: ['form', 'if_else', 'email', 'slack_message'],
    credentials: ['SMTP_HOST', 'SLACK_WEBHOOK_URL'],
  }));

  examples.push(createExample(id++, 'Data Processing', 'filter data with conditions', {
    trigger: 'schedule',
    nodes: ['schedule', 'database_read', 'if_else', 'google_sheets'],
    cron: '0 9 * * *',
    credentials: ['DATABASE_URL', 'GOOGLE_OAUTH'],
  }));

  examples.push(createExample(id++, 'Data Processing', 'conditional notification', {
    trigger: 'webhook',
    nodes: ['webhook', 'if_else', 'slack_message', 'email'],
    credentials: ['SLACK_WEBHOOK_URL', 'SMTP_HOST'],
  }));

  examples.push(createExample(id++, 'Data Processing', 'switch case data routing', {
    trigger: 'form',
    nodes: ['form', 'switch', 'email', 'slack_message', 'discord'],
    credentials: ['SMTP_HOST', 'SLACK_WEBHOOK_URL', 'DISCORD_WEBHOOK_URL'],
  }));

  examples.push(createExample(id++, 'Data Processing', 'conditional database write', {
    trigger: 'webhook',
    nodes: ['webhook', 'if_else', 'database_write'],
    credentials: ['DATABASE_URL'],
  }));

  examples.push(createExample(id++, 'Data Processing', 'validate and process', {
    trigger: 'form',
    nodes: ['form', 'if_else', 'google_sheets', 'email'],
    credentials: ['GOOGLE_OAUTH', 'SMTP_HOST'],
  }));

  examples.push(createExample(id++, 'Data Processing', 'conditional data sync', {
    trigger: 'schedule',
    nodes: ['schedule', 'database_read', 'if_else', 'google_sheets'],
    cron: '0 10 * * *',
    credentials: ['DATABASE_URL', 'GOOGLE_OAUTH'],
  }));

  examples.push(createExample(id++, 'Data Processing', 'route data by condition', {
    trigger: 'webhook',
    nodes: ['webhook', 'switch', 'database_write', 'email'],
    credentials: ['DATABASE_URL', 'SMTP_HOST'],
  }));

  examples.push(createExample(id++, 'Data Processing', 'conditional workflow execution', {
    trigger: 'manual_trigger',
    nodes: ['manual_trigger', 'if_else', 'slack_message', 'log_output'],
    credentials: ['SLACK_WEBHOOK_URL'],
  }));

  examples.push(createExample(id++, 'Data Processing', 'filter and process data', {
    trigger: 'schedule',
    nodes: ['schedule', 'database_read', 'if_else', 'javascript', 'google_sheets'],
    cron: '0 8 * * *',
    credentials: ['DATABASE_URL', 'GOOGLE_OAUTH'],
  }));

  // Database Operations (10)
  examples.push(createExample(id++, 'Data Processing', 'read from database', {
    trigger: 'manual_trigger',
    nodes: ['manual_trigger', 'database_read', 'email'],
    credentials: ['DATABASE_URL', 'SMTP_HOST'],
  }));

  examples.push(createExample(id++, 'Data Processing', 'write to database', {
    trigger: 'form',
    nodes: ['form', 'database_write'],
    credentials: ['DATABASE_URL'],
  }));

  examples.push(createExample(id++, 'Data Processing', 'database to sheets sync', {
    trigger: 'schedule',
    nodes: ['schedule', 'database_read', 'google_sheets'],
    cron: '0 9 * * *',
    credentials: ['DATABASE_URL', 'GOOGLE_OAUTH'],
  }));

  examples.push(createExample(id++, 'Data Processing', 'sheets to database sync', {
    trigger: 'schedule',
    nodes: ['schedule', 'google_sheets', 'database_write'],
    cron: '0 10 * * *',
    credentials: ['GOOGLE_OAUTH', 'DATABASE_URL'],
  }));

  examples.push(createExample(id++, 'Data Processing', 'postgresql query and email', {
    trigger: 'schedule',
    nodes: ['schedule', 'postgresql', 'email'],
    cron: '0 9 * * *',
    credentials: ['DATABASE_URL', 'SMTP_HOST'],
  }));

  examples.push(createExample(id++, 'Data Processing', 'supabase data processing', {
    trigger: 'webhook',
    nodes: ['webhook', 'supabase', 'slack_message'],
    credentials: ['SUPABASE_URL', 'SLACK_WEBHOOK_URL'],
  }));

  examples.push(createExample(id++, 'Data Processing', 'database backup to sheets', {
    trigger: 'schedule',
    nodes: ['schedule', 'database_read', 'google_sheets'],
    cron: '0 2 * * *',
    credentials: ['DATABASE_URL', 'GOOGLE_OAUTH'],
  }));

  examples.push(createExample(id++, 'Data Processing', 'database cleanup workflow', {
    trigger: 'schedule',
    nodes: ['schedule', 'database_read', 'if_else', 'database_write'],
    cron: '0 3 * * 0',
    credentials: ['DATABASE_URL'],
  }));

  examples.push(createExample(id++, 'Data Processing', 'sync databases', {
    trigger: 'schedule',
    nodes: ['schedule', 'database_read', 'postgresql'],
    cron: '0 4 * * *',
    credentials: ['DATABASE_URL'],
  }));

  examples.push(createExample(id++, 'Data Processing', 'database to multiple outputs', {
    trigger: 'schedule',
    nodes: ['schedule', 'database_read', 'email', 'slack_message'],
    cron: '0 9 * * *',
    credentials: ['DATABASE_URL', 'SMTP_HOST', 'SLACK_WEBHOOK_URL'],
  }));

  // ============================================
  // CATEGORY 6: AI-POWERED WORKFLOWS (20 examples)
  // ============================================

  examples.push(createExample(id++, 'AI Processing', 'ai chatbot workflow', {
    trigger: 'chat_trigger',
    nodes: ['chat_trigger', 'ai_agent', 'respond_to_webhook'],
    credentials: ['OPENAI_API_KEY'],
  }));

  examples.push(createExample(id++, 'AI Processing', 'ai content generation', {
    trigger: 'manual_trigger',
    nodes: ['manual_trigger', 'ai_agent', 'linkedin'],
    credentials: ['OPENAI_API_KEY', 'LINKEDIN_ACCESS_TOKEN'],
  }));

  examples.push(createExample(id++, 'AI Processing', 'ai email summarization', {
    trigger: 'schedule',
    nodes: ['schedule', 'email', 'ai_agent', 'slack_message'],
    cron: '0 9 * * *',
    credentials: ['SMTP_HOST', 'OPENAI_API_KEY', 'SLACK_WEBHOOK_URL'],
  }));

  examples.push(createExample(id++, 'AI Processing', 'ai data analysis', {
    trigger: 'schedule',
    nodes: ['schedule', 'database_read', 'ai_agent', 'email'],
    cron: '0 10 * * *',
    credentials: ['DATABASE_URL', 'OPENAI_API_KEY', 'SMTP_HOST'],
  }));

  examples.push(createExample(id++, 'AI Processing', 'ai content moderation', {
    trigger: 'form',
    nodes: ['form', 'ai_agent', 'if_else', 'database_write'],
    credentials: ['OPENAI_API_KEY', 'DATABASE_URL'],
  }));

  examples.push(createExample(id++, 'AI Processing', 'ai text classification', {
    trigger: 'webhook',
    nodes: ['webhook', 'ai_agent', 'database_write'],
    credentials: ['OPENAI_API_KEY', 'DATABASE_URL'],
  }));

  examples.push(createExample(id++, 'AI Processing', 'ai generated report', {
    trigger: 'schedule',
    nodes: ['schedule', 'google_sheets', 'ai_agent', 'email'],
    cron: '0 9 * * *',
    credentials: ['GOOGLE_OAUTH', 'OPENAI_API_KEY', 'SMTP_HOST'],
  }));

  examples.push(createExample(id++, 'AI Processing', 'ai content translation', {
    trigger: 'manual_trigger',
    nodes: ['manual_trigger', 'ai_agent', 'google_sheets'],
    credentials: ['OPENAI_API_KEY', 'GOOGLE_OAUTH'],
  }));

  examples.push(createExample(id++, 'AI Processing', 'ai sentiment analysis', {
    trigger: 'webhook',
    nodes: ['webhook', 'ai_agent', 'if_else', 'slack_message'],
    credentials: ['OPENAI_API_KEY', 'SLACK_WEBHOOK_URL'],
  }));

  examples.push(createExample(id++, 'AI Processing', 'ai data extraction', {
    trigger: 'schedule',
    nodes: ['schedule', 'http_request', 'ai_agent', 'database_write'],
    cron: '0 8 * * *',
    credentials: ['API_KEY', 'OPENAI_API_KEY', 'DATABASE_URL'],
  }));

  examples.push(createExample(id++, 'AI Processing', 'ai workflow automation', {
    trigger: 'chat_trigger',
    nodes: ['chat_trigger', 'ai_agent', 'javascript', 'slack_message'],
    credentials: ['OPENAI_API_KEY', 'SLACK_WEBHOOK_URL'],
  }));

  examples.push(createExample(id++, 'AI Processing', 'ai content generation to social', {
    trigger: 'schedule',
    nodes: ['schedule', 'ai_agent', 'linkedin'],
    cron: '0 9 * * *',
    credentials: ['OPENAI_API_KEY', 'LINKEDIN_ACCESS_TOKEN'],
  }));

  examples.push(createExample(id++, 'AI Processing', 'ai email response', {
    trigger: 'email',
    nodes: ['email', 'ai_agent', 'email'],
    credentials: ['SMTP_HOST', 'OPENAI_API_KEY'],
  }));

  examples.push(createExample(id++, 'AI Processing', 'ai data insights', {
    trigger: 'schedule',
    nodes: ['schedule', 'database_read', 'ai_agent', 'text_formatter', 'email'],
    cron: '0 9 * * *',
    credentials: ['DATABASE_URL', 'OPENAI_API_KEY', 'SMTP_HOST'],
  }));

  examples.push(createExample(id++, 'AI Processing', 'ai form processing', {
    trigger: 'form',
    nodes: ['form', 'ai_agent', 'google_sheets'],
    credentials: ['OPENAI_API_KEY', 'GOOGLE_OAUTH'],
  }));

  examples.push(createExample(id++, 'AI Processing', 'ai webhook processing', {
    trigger: 'webhook',
    nodes: ['webhook', 'ai_agent', 'database_write'],
    credentials: ['OPENAI_API_KEY', 'DATABASE_URL'],
  }));

  examples.push(createExample(id++, 'AI Processing', 'ai content creation', {
    trigger: 'manual_trigger',
    nodes: ['manual_trigger', 'ai_agent', 'twitter'],
    credentials: ['OPENAI_API_KEY', 'TWITTER_API_KEY'],
  }));

  examples.push(createExample(id++, 'AI Processing', 'ai data validation', {
    trigger: 'form',
    nodes: ['form', 'ai_agent', 'if_else', 'email'],
    credentials: ['OPENAI_API_KEY', 'SMTP_HOST'],
  }));

  examples.push(createExample(id++, 'AI Processing', 'ai report generation', {
    trigger: 'schedule',
    nodes: ['schedule', 'google_sheets', 'ai_agent', 'google_gmail'],
    cron: '0 9 * * *',
    credentials: ['GOOGLE_OAUTH', 'OPENAI_API_KEY'],
  }));

  examples.push(createExample(id++, 'AI Processing', 'ai multi-channel posting', {
    trigger: 'schedule',
    nodes: ['schedule', 'ai_agent', 'linkedin', 'twitter'],
    cron: '0 10 * * *',
    credentials: ['OPENAI_API_KEY', 'LINKEDIN_ACCESS_TOKEN', 'TWITTER_API_KEY'],
  }));

  // ============================================
  // CATEGORY 7: INTEGRATION WORKFLOWS (30 examples)
  // ============================================

  // Google Services (10)
  examples.push(createExample(id++, 'Integration', 'sheets to gmail', {
    trigger: 'schedule',
    nodes: ['schedule', 'google_sheets', 'google_gmail'],
    cron: '0 9 * * *',
    credentials: ['GOOGLE_OAUTH'],
  }));

  examples.push(createExample(id++, 'Integration', 'gmail to sheets', {
    trigger: 'schedule',
    nodes: ['schedule', 'google_gmail', 'google_sheets'],
    cron: '0 8 * * *',
    credentials: ['GOOGLE_OAUTH'],
  }));

  examples.push(createExample(id++, 'Integration', 'sheets to doc', {
    trigger: 'manual_trigger',
    nodes: ['manual_trigger', 'google_sheets', 'google_doc'],
    credentials: ['GOOGLE_OAUTH'],
  }));

  examples.push(createExample(id++, 'Integration', 'doc to email', {
    trigger: 'schedule',
    nodes: ['schedule', 'google_doc', 'google_gmail'],
    cron: '0 9 * * *',
    credentials: ['GOOGLE_OAUTH'],
  }));

  examples.push(createExample(id++, 'Integration', 'sheets to slack', {
    trigger: 'schedule',
    nodes: ['schedule', 'google_sheets', 'slack_message'],
    cron: '0 9 * * *',
    credentials: ['GOOGLE_OAUTH', 'SLACK_WEBHOOK_URL'],
  }));

  examples.push(createExample(id++, 'Integration', 'gmail to database', {
    trigger: 'schedule',
    nodes: ['schedule', 'google_gmail', 'database_write'],
    cron: '0 10 * * *',
    credentials: ['GOOGLE_OAUTH', 'DATABASE_URL'],
  }));

  examples.push(createExample(id++, 'Integration', 'sheets data processing', {
    trigger: 'schedule',
    nodes: ['schedule', 'google_sheets', 'javascript', 'google_sheets'],
    cron: '0 9 * * *',
    credentials: ['GOOGLE_OAUTH'],
  }));

  examples.push(createExample(id++, 'Integration', 'doc to sheets', {
    trigger: 'manual_trigger',
    nodes: ['manual_trigger', 'google_doc', 'google_sheets'],
    credentials: ['GOOGLE_OAUTH'],
  }));

  examples.push(createExample(id++, 'Integration', 'sheets to multiple channels', {
    trigger: 'schedule',
    nodes: ['schedule', 'google_sheets', 'slack_message', 'email'],
    cron: '0 9 * * *',
    credentials: ['GOOGLE_OAUTH', 'SLACK_WEBHOOK_URL', 'SMTP_HOST'],
  }));

  examples.push(createExample(id++, 'Integration', 'gmail automation', {
    trigger: 'schedule',
    nodes: ['schedule', 'google_gmail', 'if_else', 'slack_message'],
    cron: '0 9 * * *',
    credentials: ['GOOGLE_OAUTH', 'SLACK_WEBHOOK_URL'],
  }));

  // API Integrations (10)
  examples.push(createExample(id++, 'Integration', 'api to sheets', {
    trigger: 'schedule',
    nodes: ['schedule', 'http_request', 'google_sheets'],
    cron: '0 9 * * *',
    credentials: ['API_KEY', 'GOOGLE_OAUTH'],
  }));

  examples.push(createExample(id++, 'Integration', 'api to database', {
    trigger: 'schedule',
    nodes: ['schedule', 'http_request', 'database_write'],
    cron: '0 8 * * *',
    credentials: ['API_KEY', 'DATABASE_URL'],
  }));

  examples.push(createExample(id++, 'Integration', 'api to slack', {
    trigger: 'schedule',
    nodes: ['schedule', 'http_request', 'slack_message'],
    cron: '0 9 * * *',
    credentials: ['API_KEY', 'SLACK_WEBHOOK_URL'],
  }));

  examples.push(createExample(id++, 'Integration', 'api data processing', {
    trigger: 'schedule',
    nodes: ['schedule', 'http_request', 'javascript', 'email'],
    cron: '0 9 * * *',
    credentials: ['API_KEY', 'SMTP_HOST'],
  }));

  examples.push(createExample(id++, 'Integration', 'api monitoring', {
    trigger: 'schedule',
    nodes: ['schedule', 'http_request', 'if_else', 'slack_message', 'email'],
    cron: '*/30 * * * *',
    credentials: ['API_KEY', 'SLACK_WEBHOOK_URL', 'SMTP_HOST'],
  }));

  examples.push(createExample(id++, 'Integration', 'api to multiple outputs', {
    trigger: 'webhook',
    nodes: ['webhook', 'http_request', 'slack_message', 'database_write'],
    credentials: ['API_KEY', 'SLACK_WEBHOOK_URL', 'DATABASE_URL'],
  }));

  examples.push(createExample(id++, 'Integration', 'api data sync', {
    trigger: 'schedule',
    nodes: ['schedule', 'http_request', 'google_sheets', 'database_write'],
    cron: '0 10 * * *',
    credentials: ['API_KEY', 'GOOGLE_OAUTH', 'DATABASE_URL'],
  }));

  examples.push(createExample(id++, 'Integration', 'api to social media', {
    trigger: 'schedule',
    nodes: ['schedule', 'http_request', 'linkedin'],
    cron: '0 9 * * *',
    credentials: ['API_KEY', 'LINKEDIN_ACCESS_TOKEN'],
  }));

  examples.push(createExample(id++, 'Integration', 'api webhook processing', {
    trigger: 'webhook',
    nodes: ['webhook', 'http_request', 'respond_to_webhook'],
    credentials: ['API_KEY'],
  }));

  examples.push(createExample(id++, 'Integration', 'api data enrichment', {
    trigger: 'form',
    nodes: ['form', 'http_request', 'google_sheets'],
    credentials: ['API_KEY', 'GOOGLE_OAUTH'],
  }));

  // Multi-Service (10)
  examples.push(createExample(id++, 'Integration', 'sheets to slack and email', {
    trigger: 'schedule',
    nodes: ['schedule', 'google_sheets', 'slack_message', 'email'],
    cron: '0 9 * * *',
    credentials: ['GOOGLE_OAUTH', 'SLACK_WEBHOOK_URL', 'SMTP_HOST'],
  }));

  examples.push(createExample(id++, 'Integration', 'database to sheets and slack', {
    trigger: 'schedule',
    nodes: ['schedule', 'database_read', 'google_sheets', 'slack_message'],
    cron: '0 9 * * *',
    credentials: ['DATABASE_URL', 'GOOGLE_OAUTH', 'SLACK_WEBHOOK_URL'],
  }));

  examples.push(createExample(id++, 'Integration', 'form to multiple services', {
    trigger: 'form',
    nodes: ['form', 'google_sheets', 'slack_message', 'email'],
    credentials: ['GOOGLE_OAUTH', 'SLACK_WEBHOOK_URL', 'SMTP_HOST'],
  }));

  examples.push(createExample(id++, 'Integration', 'webhook to multiple channels', {
    trigger: 'webhook',
    nodes: ['webhook', 'slack_message', 'discord', 'email'],
    credentials: ['SLACK_WEBHOOK_URL', 'DISCORD_WEBHOOK_URL', 'SMTP_HOST'],
  }));

  examples.push(createExample(id++, 'Integration', 'multi-channel notification', {
    trigger: 'schedule',
    nodes: ['schedule', 'slack_message', 'discord', 'email'],
    cron: '0 9 * * *',
    credentials: ['SLACK_WEBHOOK_URL', 'DISCORD_WEBHOOK_URL', 'SMTP_HOST'],
  }));

  examples.push(createExample(id++, 'Integration', 'data pipeline', {
    trigger: 'schedule',
    nodes: ['schedule', 'database_read', 'javascript', 'google_sheets', 'slack_message'],
    cron: '0 9 * * *',
    credentials: ['DATABASE_URL', 'GOOGLE_OAUTH', 'SLACK_WEBHOOK_URL'],
  }));

  examples.push(createExample(id++, 'Integration', 'complex data workflow', {
    trigger: 'schedule',
    nodes: ['schedule', 'http_request', 'javascript', 'database_write', 'email'],
    cron: '0 10 * * *',
    credentials: ['API_KEY', 'DATABASE_URL', 'SMTP_HOST'],
  }));

  examples.push(createExample(id++, 'Integration', 'multi-step automation', {
    trigger: 'form',
    nodes: ['form', 'if_else', 'google_sheets', 'slack_message', 'email'],
    credentials: ['GOOGLE_OAUTH', 'SLACK_WEBHOOK_URL', 'SMTP_HOST'],
  }));

  examples.push(createExample(id++, 'Integration', 'end-to-end workflow', {
    trigger: 'webhook',
    nodes: ['webhook', 'javascript', 'database_write', 'slack_message', 'email'],
    credentials: ['DATABASE_URL', 'SLACK_WEBHOOK_URL', 'SMTP_HOST'],
  }));

  examples.push(createExample(id++, 'Integration', 'full automation pipeline', {
    trigger: 'schedule',
    nodes: ['schedule', 'database_read', 'http_request', 'javascript', 'google_sheets', 'slack_message'],
    cron: '0 9 * * *',
    credentials: ['DATABASE_URL', 'API_KEY', 'GOOGLE_OAUTH', 'SLACK_WEBHOOK_URL'],
  }));

  // ============================================
  // CATEGORY 8: NOTIFICATION WORKFLOWS (20 examples)
  // ============================================

  examples.push(createExample(id++, 'Notification', 'slack notification on error', {
    trigger: 'webhook',
    nodes: ['webhook', 'if_else', 'slack_message'],
    credentials: ['SLACK_WEBHOOK_URL'],
  }));

  examples.push(createExample(id++, 'Notification', 'email alert on condition', {
    trigger: 'schedule',
    nodes: ['schedule', 'database_read', 'if_else', 'email'],
    cron: '0 * * * *',
    credentials: ['DATABASE_URL', 'SMTP_HOST'],
  }));

  examples.push(createExample(id++, 'Notification', 'discord notification', {
    trigger: 'form',
    nodes: ['form', 'discord'],
    credentials: ['DISCORD_WEBHOOK_URL'],
  }));

  examples.push(createExample(id++, 'Notification', 'multi-channel alert', {
    trigger: 'webhook',
    nodes: ['webhook', 'if_else', 'slack_message', 'email', 'discord'],
    credentials: ['SLACK_WEBHOOK_URL', 'SMTP_HOST', 'DISCORD_WEBHOOK_URL'],
  }));

  examples.push(createExample(id++, 'Notification', 'conditional slack notification', {
    trigger: 'schedule',
    nodes: ['schedule', 'database_read', 'if_else', 'slack_message'],
    cron: '0 9 * * *',
    credentials: ['DATABASE_URL', 'SLACK_WEBHOOK_URL'],
  }));

  examples.push(createExample(id++, 'Notification', 'email notification workflow', {
    trigger: 'schedule',
    nodes: ['schedule', 'google_sheets', 'email'],
    cron: '0 9 * * *',
    credentials: ['GOOGLE_OAUTH', 'SMTP_HOST'],
  }));

  examples.push(createExample(id++, 'Notification', 'slack daily update', {
    trigger: 'schedule',
    nodes: ['schedule', 'slack_message'],
    cron: '0 9 * * *',
    credentials: ['SLACK_WEBHOOK_URL'],
  }));

  examples.push(createExample(id++, 'Notification', 'discord webhook notification', {
    trigger: 'webhook',
    nodes: ['webhook', 'discord'],
    credentials: ['DISCORD_WEBHOOK_URL'],
  }));

  examples.push(createExample(id++, 'Notification', 'email and slack notification', {
    trigger: 'form',
    nodes: ['form', 'email', 'slack_message'],
    credentials: ['SMTP_HOST', 'SLACK_WEBHOOK_URL'],
  }));

  examples.push(createExample(id++, 'Notification', 'conditional notification routing', {
    trigger: 'webhook',
    nodes: ['webhook', 'switch', 'slack_message', 'email', 'discord'],
    credentials: ['SLACK_WEBHOOK_URL', 'SMTP_HOST', 'DISCORD_WEBHOOK_URL'],
  }));

  examples.push(createExample(id++, 'Notification', 'gmail notification', {
    trigger: 'schedule',
    nodes: ['schedule', 'google_gmail'],
    cron: '0 9 * * *',
    credentials: ['GOOGLE_OAUTH'],
  }));

  examples.push(createExample(id++, 'Notification', 'slack error notification', {
    trigger: 'webhook',
    nodes: ['webhook', 'if_else', 'slack_message'],
    credentials: ['SLACK_WEBHOOK_URL'],
  }));

  examples.push(createExample(id++, 'Notification', 'multi-platform notification', {
    trigger: 'schedule',
    nodes: ['schedule', 'slack_message', 'discord', 'email'],
    cron: '0 9 * * *',
    credentials: ['SLACK_WEBHOOK_URL', 'DISCORD_WEBHOOK_URL', 'SMTP_HOST'],
  }));

  examples.push(createExample(id++, 'Notification', 'notification on data change', {
    trigger: 'schedule',
    nodes: ['schedule', 'database_read', 'if_else', 'slack_message'],
    cron: '*/15 * * * *',
    credentials: ['DATABASE_URL', 'SLACK_WEBHOOK_URL'],
  }));

  examples.push(createExample(id++, 'Notification', 'email notification system', {
    trigger: 'form',
    nodes: ['form', 'email'],
    credentials: ['SMTP_HOST'],
  }));

  examples.push(createExample(id++, 'Notification', 'slack status update', {
    trigger: 'schedule',
    nodes: ['schedule', 'http_request', 'slack_message'],
    cron: '0 9 * * *',
    credentials: ['API_KEY', 'SLACK_WEBHOOK_URL'],
  }));

  examples.push(createExample(id++, 'Notification', 'discord daily update', {
    trigger: 'schedule',
    nodes: ['schedule', 'discord'],
    cron: '0 10 * * *',
    credentials: ['DISCORD_WEBHOOK_URL'],
  }));

  examples.push(createExample(id++, 'Notification', 'multi-channel status notification', {
    trigger: 'schedule',
    nodes: ['schedule', 'http_request', 'slack_message', 'email', 'discord'],
    cron: '0 9 * * *',
    credentials: ['API_KEY', 'SLACK_WEBHOOK_URL', 'SMTP_HOST', 'DISCORD_WEBHOOK_URL'],
  }));

  examples.push(createExample(id++, 'Notification', 'conditional email notification', {
    trigger: 'webhook',
    nodes: ['webhook', 'if_else', 'email'],
    credentials: ['SMTP_HOST'],
  }));

  examples.push(createExample(id++, 'Notification', 'notification workflow', {
    trigger: 'manual_trigger',
    nodes: ['manual_trigger', 'slack_message'],
    credentials: ['SLACK_WEBHOOK_URL'],
  }));

  return examples;
}

// Helper function to create workflow example
function createExample(
  id: number,
  category: string,
  goal: string,
  config: {
    trigger: string;
    nodes: string[];
    cron?: string;
    credentials: string[];
  }
): WorkflowExample {
  const connections: string[] = [];
  for (let i = 0; i < config.nodes.length - 1; i++) {
    connections.push(`${config.nodes[i]} → ${config.nodes[i + 1]}`);
  }

  const nodeConfigurations: Record<string, any> = {};
  if (config.trigger === 'schedule' && config.cron) {
    nodeConfigurations.schedule = { cron: config.cron };
  }

  const complexityLevel = config.nodes.length <= 2 ? 'Simple' : config.nodes.length <= 4 ? 'Medium' : 'Complex';

  return {
    id: `workflow_${id}`,
    category,
    goal,
    phase1: {
      step1: {
        userPrompt: goal,
      },
      step3: {
        systemPrompt: `Automate ${goal} workflow with ${config.nodes.join(' → ')} nodes.`,
        wordCount: 15,
        temperature: 0.2,
      },
      step4: {
        requirements: {
          primaryGoal: goal,
          platforms: config.nodes.filter(n => ['linkedin', 'twitter', 'instagram'].includes(n)),
          credentialsRequired: config.credentials,
          complexityLevel,
        },
      },
      step5: {
        structure: {
          flowType: complexityLevel === 'Simple' ? 'Simple linear flow' : 'Multi-step workflow',
          description: `Trigger: ${config.trigger} → ${config.nodes.slice(1).join(' → ')}`,
        },
        selectedNodes: config.nodes,
        nodeConfigurations,
        connections,
      },
    },
    phase2: {
      executionInitialization: {
        executionId: 'created',
        iterationCount: 0,
      },
      executionLoop: config.nodes.slice(1).map((node, idx) => ({
        iteration: idx + 1,
        execution: `Executing ${node} node`,
        stateUpdated: `State updated after ${node}`,
      })),
      executionFinalization: {
        totalIterations: config.nodes.length,
        goalAchieved: true,
      },
    },
  };
}

// Main execution
function main() {
  console.log('🚀 Generating 200+ workflow training examples...');
  
  const examples = generateWorkflowExamples();
  console.log(`✅ Generated ${examples.length} examples`);

  // Read existing dataset
  const datasetPath = path.join(__dirname, '../data/workflow_training_dataset_100.json');
  const existingData = JSON.parse(fs.readFileSync(datasetPath, 'utf-8'));
  
  // Merge new examples
  existingData.workflows.push(...examples);
  existingData.totalWorkflows = existingData.workflows.length;
  existingData.description = `Comprehensive AI Workflow Agent Training Dataset - ${existingData.totalWorkflows} diverse workflow examples covering all node types and patterns`;

  // Write updated dataset
  const outputPath = path.join(__dirname, '../data/workflow_training_dataset_300.json');
  fs.writeFileSync(outputPath, JSON.stringify(existingData, null, 2), 'utf-8');
  
  console.log(`✅ Saved ${existingData.totalWorkflows} workflows to ${outputPath}`);
  console.log(`📊 Categories:`);
  const categories = new Map<string, number>();
  examples.forEach(ex => {
    categories.set(ex.category, (categories.get(ex.category) || 0) + 1);
  });
  categories.forEach((count, cat) => {
    console.log(`   - ${cat}: ${count} examples`);
  });
}

if (require.main === module) {
  main();
}

export { generateWorkflowExamples, createExample };
