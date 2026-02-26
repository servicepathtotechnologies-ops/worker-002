import { WorkflowNode } from '../../core/types/ai-types';

export type QuestionType = 'string' | 'number' | 'boolean' | 'select' | 'json';

export interface NodeQuestion {
  id: string;
  prompt: string;
  target: string;      // path under node.data.config (we only store the last segment here)
  type: QuestionType;
  required: boolean;
  options?: string[];  // for select
}

// Central registry of input questions per node type (node.data.type)
// Covers all nodes you listed so AI / UI can ask for the right fields and write them into config.
export const NODE_QUESTIONS: Record<string, NodeQuestion[]> = {
  // =======================
  // TRIGGERS
  // =======================
  webhook: [
    {
      id: 'webhook_path',
      prompt: 'What URL path should we expose for this webhook? (e.g. /hubspot-contact-created)',
      target: 'path',
      type: 'string',
      required: true,
    },
  ],
  chat_trigger: [
    {
      id: 'chat_channel',
      prompt: 'Which chat channel or context should trigger this workflow?',
      target: 'channel',
      type: 'string',
      required: false,
    },
  ],
  form: [
    {
      id: 'form_name',
      prompt: 'What is the name of the form (for users)?',
      target: 'name',
      type: 'string',
      required: true,
    },
  ],
  schedule: [
    {
      id: 'cron',
      prompt: 'How often should this run? Provide a cron expression (e.g. 0 9 * * *).',
      target: 'cron',
      type: 'string',
      required: true,
    },
    {
      id: 'timezone',
      prompt: 'What timezone should the schedule use? (e.g. UTC, America/New_York)',
      target: 'timezone',
      type: 'string',
      required: true,
    },
  ],

  // =======================
  // LOGIC / FLOW
  // =======================
  if_else: [
    {
      id: 'if_condition',
      prompt: 'What condition should we check? (e.g. contact.lifecycleStage == \"customer\")',
      target: 'condition',
      type: 'string',
      required: true,
    },
  ],
  switch: [
    {
      id: 'switch_field',
      prompt: 'Which field should we branch on? (e.g. contact.source)',
      target: 'field',
      type: 'string',
      required: true,
    },
  ],
  set: [
    {
      id: 'set_fields',
      prompt: 'Which fields should we set or override? (JSON, e.g. {\"status\":\"new\"})',
      target: 'fields',
      type: 'json',
      required: true,
    },
  ],
  function: [
    {
      id: 'function_description',
      prompt: 'Briefly describe what this function should do with the incoming data.',
      target: 'description',
      type: 'string',
      required: true,
    },
  ],
  merge: [
    {
      id: 'merge_strategy',
      prompt: 'How should we merge multiple inputs? (e.g. concatenate, overwrite, first-non-empty)',
      target: 'strategy',
      type: 'string',
      required: false,
    },
  ],
  wait: [
    {
      id: 'wait_duration',
      prompt: 'How long should we wait? (e.g. 5m, 2h, 1d)',
      target: 'duration',
      type: 'string',
      required: true,
    },
  ],
  limit: [
    {
      id: 'limit_count',
      prompt: 'What is the maximum number of items to process?',
      target: 'count',
      type: 'number',
      required: true,
    },
  ],
  aggregate: [
    {
      id: 'aggregate_field',
      prompt: 'Which field should we aggregate on?',
      target: 'field',
      type: 'string',
      required: true,
    },
  ],
  sort: [
    {
      id: 'sort_field',
      prompt: 'Which field should we sort by?',
      target: 'field',
      type: 'string',
      required: true,
    },
  ],
  code: [
    {
      id: 'code_snippet',
      prompt: 'Provide a short code snippet or describe the transformation you want.',
      target: 'snippet',
      type: 'string',
      required: true,
    },
  ],
  function_item: [
    {
      id: 'function_item_description',
      prompt: 'What should this per-item function do for each element in the list?',
      target: 'description',
      type: 'string',
      required: true,
    },
  ],
  noop: [],

  // =======================
  // HTTP / AI
  // =======================
  ai_chat_model: [
    {
      id: 'ai_prompt',
      prompt: 'What instruction should we give the AI model? (e.g. summarize the contact notes, analyze the customer profile)',
      target: 'prompt',
      type: 'string',
      required: true,
    },
    {
      id: 'ai_model',
      prompt: 'Which Ollama model should we use? (default: qwen2.5:14b-instruct-q4_K_M)',
      target: 'model',
      type: 'select',
      options: ['qwen2.5:14b-instruct-q4_K_M', 'qwen2.5:7b-instruct-q4_K_M', 'qwen2.5-coder:7b-instruct-q4_K_M', 'ctrlchecks-workflow-builder'],
      required: false,
    },
  ],
  ai_agent: [
    {
      id: 'ai_system_prompt',
      prompt: 'What system prompt should guide the AI agent? (e.g. You are an intelligent assistant that analyzes customer data)',
      target: 'systemPrompt',
      type: 'string',
      required: true,
    },
  ],
  http_request: [
    {
      id: 'http_method',
      prompt: 'What HTTP method should we use? (GET, POST, PUT, DELETE, PATCH)',
      target: 'method',
      type: 'select',
      options: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
      required: true,
    },
    {
      id: 'http_url',
      prompt: 'What URL should we call?',
      target: 'url',
      type: 'string',
      required: true,
    },
  ],

  // =======================
  // INTEGRATIONS – CRM / TOOLS
  // =======================
  hubspot: [
    {
      id: 'hubspot_resource',
      prompt: 'Which HubSpot object are we working with? (contact, company, deal, ticket, ...)',
      target: 'resource',
      type: 'select',
      options: ['contact', 'company', 'deal', 'ticket'],
      required: true,
    },
    {
      id: 'hubspot_operation',
      prompt: 'What should we do in HubSpot? (get, create, update, delete, search)',
      target: 'operation',
      type: 'select',
      options: ['get', 'getMany', 'create', 'update', 'delete', 'search'],
      required: true,
    },
  ],
  zoho: [
    {
      id: 'zoho_module',
      prompt: 'Which Zoho module are we working with? (e.g. Leads, Contacts)',
      target: 'module',
      type: 'string',
      required: true,
    },
  ],
  pipedrive: [
    {
      id: 'pipedrive_resource',
      prompt: 'Which Pipedrive object are we working with? (deal, person, organization)',
      target: 'resource',
      type: 'select',
      options: ['deal', 'person', 'organization'],
      required: true,
    },
  ],
  notion: [
    {
      id: 'notion_page_or_db',
      prompt: 'Are we working with a Notion page or database?',
      target: 'targetType',
      type: 'select',
      options: ['page', 'database'],
      required: true,
    },
  ],
  airtable: [
    {
      id: 'airtable_base',
      prompt: 'Which Airtable base ID should we use?',
      target: 'baseId',
      type: 'string',
      required: true,
    },
    {
      id: 'airtable_table',
      prompt: 'Which table name in that base should we use?',
      target: 'table',
      type: 'string',
      required: true,
    },
  ],
  clickup: [
    {
      id: 'clickup_list',
      prompt: 'Which ClickUp list or space should tasks be created in?',
      target: 'listId',
      type: 'string',
      required: true,
    },
  ],

  // =======================
  // INTEGRATIONS – EMAIL / MESSAGING / CALENDAR
  // =======================
  google_gmail: [
    {
      id: 'gmail_to',
      prompt: 'What email address should we send to?',
      target: 'to',
      type: 'string',
      required: true,
    },
    {
      id: 'gmail_subject',
      prompt: 'What subject should the email have?',
      target: 'subject',
      type: 'string',
      required: true,
    },
  ],
  gmail: [
    {
      id: 'gmail_to_alias',
      prompt: 'What email address should we send to?',
      target: 'to',
      type: 'string',
      required: true,
    },
  ],
  slack_message: [
    {
      id: 'slack_channel',
      prompt: 'What Slack channel should we post to? (e.g. #sales)',
      target: 'channel',
      type: 'string',
      required: true,
    },
    {
      id: 'slack_text',
      prompt: 'What message should we send to Slack?',
      target: 'text',
      type: 'string',
      required: true,
    },
  ],
  slack: [
    {
      id: 'slack_channel_alias',
      prompt: 'What Slack channel should we post to? (e.g. #sales)',
      target: 'channel',
      type: 'string',
      required: true,
    },
  ],
  telegram: [
    {
      id: 'telegram_chat_id',
      prompt: 'What is the Telegram chat ID or @username to send messages to?',
      target: 'chatId',
      type: 'string',
      required: true,
    },
  ],
  outlook: [
    {
      id: 'outlook_to',
      prompt: 'What email address should we send Outlook mail to?',
      target: 'to',
      type: 'string',
      required: true,
    },
  ],
  google_calendar: [
    {
      id: 'gcal_summary',
      prompt: 'What should the calendar event title be?',
      target: 'summary',
      type: 'string',
      required: true,
    },
    {
      id: 'gcal_start',
      prompt: 'When should the event start? (ISO timestamp, e.g. 2026-02-16T09:00:00Z)',
      target: 'start',
      type: 'string',
      required: true,
    },
  ],

  // =======================
  // INTEGRATIONS – SOCIAL / DEV
  // =======================
  linkedin: [
    {
      id: 'linkedin_content',
      prompt: 'What content should we post on LinkedIn?',
      target: 'content',
      type: 'string',
      required: true,
    },
  ],
  github: [
    {
      id: 'github_repo',
      prompt: 'Which GitHub repository should we use? (owner/repo)',
      target: 'repository',
      type: 'string',
      required: true,
    },
  ],
};

export function getQuestionsForNode(node: WorkflowNode): NodeQuestion[] {
  const type = (node.data as any)?.type || node.type;
  return NODE_QUESTIONS[type] || [];
}
