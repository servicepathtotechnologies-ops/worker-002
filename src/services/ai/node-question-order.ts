/**
 * Node Question Order System
 * Defines the optimal, user-friendly questioning order for all workflow nodes
 * 
 * This ensures questions are asked in a natural, logical sequence:
 * 1. Credential (if needed)
 * 2. Operation (what to do)
 * 3. Core identifiers (what resource)
 * 4. Essential data (required fields)
 * 5. Optional enhancements
 */

export interface QuestionDefinition {
  id: string;
  field: string;
  prompt: string;
  type: 'string' | 'number' | 'boolean' | 'select' | 'email' | 'json' | 'code' | 'datetime' | 'credential';
  required: boolean;
  askOrder: number;
  dependsOn?: {
    field: string;
    operator: 'equals' | 'in' | 'notEquals' | 'exists' | 'notExists';
    value?: any | any[];
  };
  options?: Array<{ value: string; label?: string }>;
  example?: any;
  placeholder?: string;
  description?: string;
  default?: any;
}

export interface NodeQuestionConfig {
  nodeType: string;
  questions: QuestionDefinition[];
  requiresCredential: boolean;
  credentialProvider?: string;
}

/**
 * Central registry of question order for all nodes
 * Questions are ordered by askOrder (ascending)
 */
export const NODE_QUESTION_CONFIGS: Record<string, NodeQuestionConfig> = {
  // ============================================
  // TRIGGER NODES
  // ============================================
  
  webhook: {
    nodeType: 'webhook',
    requiresCredential: false,
    questions: [
      {
        id: 'webhook_path',
        field: 'path',
        prompt: 'What URL path should this webhook listen on?',
        type: 'string',
        required: true,
        askOrder: 1,
        example: '/hubspot-contact-created',
        placeholder: '/your-webhook-path',
      },
      {
        id: 'webhook_method',
        field: 'httpMethod',
        prompt: 'Which HTTP method should this webhook accept?',
        type: 'select',
        required: true,
        askOrder: 2,
        options: [
          { value: 'GET', label: 'GET' },
          { value: 'POST', label: 'POST' },
          { value: 'PUT', label: 'PUT' },
          { value: 'DELETE', label: 'DELETE' },
          { value: 'PATCH', label: 'PATCH' },
        ],
        default: 'POST',
      },
      {
        id: 'webhook_responseMode',
        field: 'responseMode',
        prompt: 'How should we respond to the webhook caller?',
        type: 'select',
        required: false,
        askOrder: 3,
        options: [
          { value: 'responseNode', label: 'Use a Respond to Webhook node' },
          { value: 'onReceived', label: 'Respond immediately when received' },
          { value: 'lastNode', label: 'Respond after the last node' },
        ],
        default: 'responseNode',
      },
      {
        id: 'webhook_verify',
        field: 'verifySignature',
        prompt: 'Should we verify webhook signatures?',
        type: 'boolean',
        required: false,
        askOrder: 4,
        default: false,
      },
      {
        id: 'webhook_secret',
        field: 'secretToken',
        prompt: 'What is the secret token for signature verification?',
        type: 'string',
        required: false,
        askOrder: 5,
        dependsOn: {
          field: 'verifySignature',
          operator: 'equals',
          value: true,
        },
      },
    ],
  },

  chat_trigger: {
    nodeType: 'chat_trigger',
    requiresCredential: false,
    questions: [
      {
        id: 'chat_channel',
        field: 'channel',
        prompt: 'Which chat channel or context should trigger this workflow?',
        type: 'string',
        required: false,
        askOrder: 1,
        example: '#support',
        placeholder: '#channel-name or @username',
      },
      {
        id: 'chat_senders',
        field: 'allowedSenders',
        prompt: 'Should we filter by specific senders? (optional)',
        type: 'json',
        required: false,
        askOrder: 2,
        example: ['user1', 'user2'],
      },
    ],
  },

  form: {
    nodeType: 'form',
    requiresCredential: false,
    questions: [
      {
        id: 'form_title',
        field: 'formTitle',
        prompt: 'What is the title of this form?',
        type: 'string',
        required: true,
        askOrder: 1,
        example: 'Contact Form',
      },
      {
        id: 'form_description',
        field: 'formDescription',
        prompt: 'Add a description for users (optional)',
        type: 'string',
        required: false,
        askOrder: 2,
      },
      {
        id: 'form_fields',
        field: 'fields',
        prompt: 'Define the form fields',
        type: 'json',
        required: true,
        askOrder: 3,
        example: {
          fields: [
            { name: 'email', type: 'email', required: true },
            { name: 'name', type: 'string', required: true },
          ],
        },
      },
    ],
  },

  schedule: {
    nodeType: 'schedule',
    requiresCredential: false,
    questions: [
      {
        id: 'schedule_cron',
        field: 'cron',
        prompt: 'How often should this workflow run? (cron expression)',
        type: 'string',
        required: true,
        askOrder: 1,
        example: '0 9 * * *',
        placeholder: '0 9 * * * (Daily at 9 AM)',
        description: 'Examples: "0 9 * * *" (daily at 9 AM), "0 */6 * * *" (every 6 hours)',
      },
      {
        id: 'schedule_timezone',
        field: 'timezone',
        prompt: 'What timezone should we use?',
        type: 'select',
        required: true,
        askOrder: 2,
        options: [
          { value: 'UTC', label: 'UTC' },
          { value: 'America/New_York', label: 'America/New_York' },
          { value: 'Europe/London', label: 'Europe/London' },
          { value: 'Asia/Tokyo', label: 'Asia/Tokyo' },
        ],
        default: 'UTC',
      },
    ],
  },

  // ============================================
  // AI NODES
  // ============================================

  ai_agent: {
    nodeType: 'ai_agent',
    requiresCredential: false,
    questions: [
      {
        id: 'ai_agent_chat_model',
        field: 'chat_model',
        prompt: 'Please provide chat_model for "AI Agent"',
        description: 'Chat model configuration (selecting a model will replace this node with AI API node)',
        type: 'select',
        required: true,
        askOrder: 3,
        options: [
          { value: 'qwen2.5:14b-instruct-q4_K_M', label: 'Qwen 2.5 14B (General Purpose)' },
          { value: 'qwen2.5:7b-instruct-q4_K_M', label: 'Qwen 2.5 7B (Fast)' },
          { value: 'qwen2.5-coder:7b-instruct-q4_K_M', label: 'Qwen 2.5 Coder 7B (Code Generation)' },
        ],
        default: 'qwen2.5:14b-instruct-q4_K_M',
      },
      {
        id: 'ai_agent_user_input',
        field: 'userInput',
        prompt: 'What should the AI agent process?',
        type: 'string',
        required: true,
        askOrder: 1,
        example: 'Analyze the customer data',
        placeholder: 'Describe what the AI should do...',
      },
      {
        id: 'ai_agent_tool',
        field: 'tool',
        prompt: 'Tool/function to use (optional)',
        type: 'string',
        required: false,
        askOrder: 4,
      },
    ],
  },

  ai_chat_model: {
    nodeType: 'ai_chat_model',
    requiresCredential: false,
    questions: [
      {
        id: 'ai_model',
        field: 'model',
        prompt: 'Which model should we use?',
        type: 'select',
        required: false,
        askOrder: 1,
        options: [
          { value: 'qwen2.5:14b-instruct-q4_K_M', label: 'Qwen 2.5 14B (General Purpose)' },
          { value: 'qwen2.5:7b-instruct-q4_K_M', label: 'Qwen 2.5 7B (Fast)' },
          { value: 'qwen2.5-coder:7b-instruct-q4_K_M', label: 'Qwen 2.5 Coder 7B (Code Generation)' },
          { value: 'ctrlchecks-workflow-builder', label: 'CtrlChecks Workflow Builder (Fine-Tuned)' },
        ],
        default: 'qwen2.5:14b-instruct-q4_K_M',
      },
      {
        id: 'ai_prompt',
        field: 'prompt',
        prompt: 'What instruction should we give the AI?',
        type: 'string',
        required: true,
        askOrder: 2,
        example: 'Summarize the contact notes',
        placeholder: 'Describe what the AI should do...',
      },
      {
        id: 'ai_system',
        field: 'systemPrompt',
        prompt: 'System prompt for context (optional)',
        type: 'string',
        required: false,
        askOrder: 3,
        example: 'You are a helpful assistant that analyzes customer data',
      },
      {
        id: 'ai_format',
        field: 'responseFormat',
        prompt: 'Response format (optional)',
        type: 'select',
        required: false,
        askOrder: 4,
        options: [
          { value: 'text', label: 'Text' },
          { value: 'json', label: 'JSON' },
          { value: 'markdown', label: 'Markdown' },
        ],
        default: 'text',
      },
    ],
  },

  chat_model: {
    nodeType: 'chat_model',
    requiresCredential: false,
    questions: [
      {
        id: 'chat_provider',
        field: 'provider',
        prompt: 'Which chat provider should we use?',
        type: 'select',
        required: false,
        askOrder: 1,
        options: [
          { value: 'ollama', label: 'Ollama (local / self-hosted - No API key needed)' },
          { value: 'openai', label: 'OpenAI' },
          { value: 'claude', label: 'Anthropic Claude' },
          { value: 'gemini', label: 'Google Gemini' },
        ],
        default: 'ollama',
        description: 'Ollama runs locally and does not require an API key. Other providers require API keys.',
      },
      {
        id: 'chat_model',
        field: 'model',
        prompt: 'Which model should we use?',
        type: 'select',
        required: true,
        askOrder: 2,
        options: [
          { value: 'qwen2.5:14b-instruct-q4_K_M', label: 'Qwen 2.5 14B (General Purpose)' },
          { value: 'qwen2.5:7b-instruct-q4_K_M', label: 'Qwen 2.5 7B (Fast)' },
          { value: 'qwen2.5-coder:7b-instruct-q4_K_M', label: 'Qwen 2.5 Coder 7B (Code Generation)' },
          { value: 'ctrlchecks-workflow-builder', label: 'CtrlChecks Workflow Builder (Fine-Tuned)' },
        ],
        default: 'qwen2.5:14b-instruct-q4_K_M',
      },
      {
        id: 'chat_api_key',
        field: 'apiKey',
        prompt: 'API Key (required for cloud providers)',
        description: 'API key is only required for OpenAI, Claude, and Gemini. Not needed for Ollama.',
        type: 'string',
        required: false,
        askOrder: 2.5,
        placeholder: 'Enter your API key...',
        dependsOn: {
          field: 'provider',
          operator: 'notEquals',
          value: 'ollama',
        },
      },
      {
        id: 'chat_temperature',
        field: 'temperature',
        prompt: 'Temperature (creativity) 0.0 - 1.0 (optional)',
        type: 'number',
        required: false,
        askOrder: 3,
        default: 0.7,
      },
    ],
  },

  // ============================================
  // HTTP NODES
  // ============================================

  http_request: {
    nodeType: 'http_request',
    requiresCredential: false,
    questions: [
      {
        id: 'http_url',
        field: 'url',
        prompt: 'What URL should we request?',
        type: 'string',
        required: true,
        askOrder: 1,
        example: 'https://api.example.com/v1/users',
        placeholder: 'https://...',
      },
      {
        id: 'http_method',
        field: 'method',
        prompt: 'Which HTTP method should we use?',
        type: 'select',
        required: true,
        askOrder: 2,
        options: [
          { value: 'GET', label: 'GET' },
          { value: 'POST', label: 'POST' },
          { value: 'PUT', label: 'PUT' },
          { value: 'PATCH', label: 'PATCH' },
          { value: 'DELETE', label: 'DELETE' },
        ],
        default: 'GET',
      },
      {
        id: 'http_headers',
        field: 'headers',
        prompt: 'Any headers to send? (optional)',
        type: 'json',
        required: false,
        askOrder: 3,
        example: { 'Content-Type': 'application/json' },
      },
      {
        id: 'http_qs',
        field: 'qs',
        prompt: 'Any query params? (optional)',
        type: 'json',
        required: false,
        askOrder: 4,
        example: { limit: 10 },
      },
      {
        id: 'http_body',
        field: 'body',
        prompt: 'Request body (optional; used for POST/PUT/PATCH)',
        type: 'json',
        required: false,
        askOrder: 5,
      },
      {
        id: 'http_timeout',
        field: 'timeout',
        prompt: 'Timeout in ms (optional)',
        type: 'number',
        required: false,
        askOrder: 6,
        default: 10000,
      },
    ],
  },

  // ============================================
  // LOGIC NODES
  // ============================================

  if_else: {
    nodeType: 'if_else',
    requiresCredential: false,
    questions: [
      {
        id: 'if_conditions',
        field: 'conditions',
        prompt: 'Define the conditions (JSON)',
        type: 'json',
        required: true,
        askOrder: 1,
        example: [
          { field: '$json.email', operator: 'contains', value: '@company.com' },
        ],
      },
      {
        id: 'if_combine',
        field: 'combineOperation',
        prompt: 'How should we combine multiple conditions?',
        type: 'select',
        required: false,
        askOrder: 2,
        options: [
          { value: 'AND', label: 'AND' },
          { value: 'OR', label: 'OR' },
        ],
        default: 'AND',
      },
    ],
  },

  switch: {
    nodeType: 'switch',
    requiresCredential: false,
    questions: [
      {
        id: 'switch_routingType',
        field: 'routingType',
        prompt: 'Routing type?',
        type: 'select',
        required: true,
        askOrder: 1,
        options: [
          { value: 'expression', label: 'Expression' },
          { value: 'string', label: 'String' },
          { value: 'number', label: 'Number' },
        ],
        default: 'expression',
      },
      {
        id: 'switch_rules',
        field: 'rules',
        prompt: 'Define the routing rules (JSON)',
        type: 'json',
        required: true,
        askOrder: 2,
        example: [
          { value: 'success', output: 'main' },
          { value: 'error', output: 'error' },
        ],
      },
    ],
  },

  set_variable: {
    nodeType: 'set_variable',
    requiresCredential: false,
    questions: [
      {
        id: 'set_variable_name',
        field: 'name',
        prompt: 'Variable name?',
        type: 'string',
        required: true,
        askOrder: 1,
        example: 'customerEmail',
      },
      {
        id: 'set_variable_value',
        field: 'value',
        prompt: 'Variable value (supports {{$json.*}} templates)',
        type: 'string',
        required: false,
        askOrder: 2,
        example: '{{$json.email}}',
      },
      {
        id: 'set_variable_keepSource',
        field: 'keepSource',
        prompt: 'Keep original fields?',
        type: 'boolean',
        required: false,
        askOrder: 3,
        default: false,
      },
    ],
  },

  function: {
    nodeType: 'function',
    requiresCredential: false,
    questions: [
      {
        id: 'function_description',
        field: 'description',
        prompt: 'Briefly describe what this function should do',
        type: 'string',
        required: true,
        askOrder: 1,
        example: 'Transform contact data into CRM format',
      },
      {
        id: 'function_code',
        field: 'code',
        prompt: 'Provide custom code (optional)',
        type: 'code',
        required: false,
        askOrder: 2,
      },
      {
        id: 'function_timeout',
        field: 'timeout',
        prompt: 'Timeout in milliseconds (optional)',
        type: 'number',
        required: false,
        askOrder: 3,
        default: 30000,
      },
    ],
  },

  merge: {
    nodeType: 'merge',
    requiresCredential: false,
    questions: [
      {
        id: 'merge_mode',
        field: 'mode',
        prompt: 'How should we merge multiple inputs?',
        type: 'select',
        required: true,
        askOrder: 1,
        options: [
          { value: 'append', label: 'Append' },
          { value: 'join', label: 'Join' },
          { value: 'passThrough', label: 'Pass Through' },
          { value: 'multiples', label: 'Multiples' },
        ],
        default: 'passThrough',
      },
    ],
  },

  wait: {
    nodeType: 'wait',
    requiresCredential: false,
    questions: [
      {
        id: 'wait_duration',
        field: 'duration',
        prompt: 'How long should we wait? (in milliseconds)',
        type: 'number',
        required: true,
        askOrder: 1,
        example: 1000,
      },
      {
        id: 'wait_unit',
        field: 'unit',
        prompt: 'Duration unit (optional)',
        type: 'select',
        required: false,
        askOrder: 2,
        options: [
          { value: 'milliseconds', label: 'Milliseconds' },
          { value: 'seconds', label: 'Seconds' },
          { value: 'minutes', label: 'Minutes' },
          { value: 'hours', label: 'Hours' },
        ],
        default: 'milliseconds',
      },
    ],
  },

  limit: {
    nodeType: 'limit',
    requiresCredential: false,
    questions: [
      {
        id: 'limit_count',
        field: 'limit',
        prompt: 'What is the maximum number of items to process?',
        type: 'number',
        required: true,
        askOrder: 1,
        example: 10,
      },
    ],
  },

  aggregate: {
    nodeType: 'aggregate',
    requiresCredential: false,
    questions: [
      {
        id: 'aggregate_operation',
        field: 'operation',
        prompt: 'What operation should we perform?',
        type: 'select',
        required: true,
        askOrder: 1,
        options: [
          { value: 'sum', label: 'Sum' },
          { value: 'avg', label: 'Average' },
          { value: 'min', label: 'Minimum' },
          { value: 'max', label: 'Maximum' },
          { value: 'count', label: 'Count' },
          { value: 'join', label: 'Join into text' },
        ],
      },
      {
        id: 'aggregate_field',
        field: 'field',
        prompt: 'Which field should we aggregate on?',
        type: 'string',
        required: false,
        askOrder: 2,
        example: 'amount',
      },
      {
        id: 'aggregate_delimiter',
        field: 'delimiter',
        prompt: 'Delimiter for "join" (optional)',
        type: 'string',
        required: false,
        askOrder: 3,
        example: '\\n',
      },
    ],
  },

  sort: {
    nodeType: 'sort',
    requiresCredential: false,
    questions: [
      {
        id: 'sort_field',
        field: 'field',
        prompt: 'Which field should we sort by?',
        type: 'string',
        required: true,
        askOrder: 1,
        example: 'createdAt',
      },
      {
        id: 'sort_direction',
        field: 'direction',
        prompt: 'Sort direction?',
        type: 'select',
        required: false,
        askOrder: 2,
        options: [
          { value: 'asc', label: 'Ascending' },
          { value: 'desc', label: 'Descending' },
        ],
        default: 'asc',
      },
      {
        id: 'sort_type',
        field: 'type',
        prompt: 'Value type? (optional)',
        type: 'select',
        required: false,
        askOrder: 3,
        options: [
          { value: 'auto', label: 'Auto-detect' },
          { value: 'number', label: 'Number' },
          { value: 'string', label: 'String' },
          { value: 'date', label: 'Date' },
        ],
        default: 'auto',
      },
    ],
  },

  code: {
    nodeType: 'code',
    requiresCredential: false,
    questions: [
      {
        id: 'code_language',
        field: 'language',
        prompt: 'What language?',
        type: 'select',
        required: false,
        askOrder: 1,
        options: [
          { value: 'javascript', label: 'JavaScript' },
          { value: 'typescript', label: 'TypeScript' },
        ],
        default: 'javascript',
      },
      {
        id: 'code_snippet',
        field: 'snippet',
        prompt: 'Provide your code snippet',
        type: 'code',
        required: true,
        askOrder: 2,
        example: "return items.filter(i => i.active);",
      },
    ],
  },

  javascript: {
    nodeType: 'javascript',
    requiresCredential: false,
    questions: [
      {
        id: 'javascript_code',
        field: 'code',
        prompt: 'Provide JavaScript code',
        type: 'code',
        required: true,
        askOrder: 1,
        example: 'return { ...$json, processed: true };',
      },
    ],
  },

  function_item: {
    nodeType: 'function_item',
    requiresCredential: false,
    questions: [
      {
        id: 'function_item_description',
        field: 'description',
        prompt: 'What should this function do for each item?',
        type: 'string',
        required: true,
        askOrder: 1,
        example: "Add 'processed' flag to each contact",
      },
      {
        id: 'function_item_code',
        field: 'code',
        prompt: 'Custom code for per-item processing (optional)',
        type: 'code',
        required: false,
        askOrder: 2,
      },
    ],
  },

  noop: {
    nodeType: 'noop',
    requiresCredential: false,
    questions: [],
  },

  // ============================================
  // CRM NODES
  // ============================================

  hubspot: {
    nodeType: 'hubspot',
    requiresCredential: true,
    credentialProvider: 'hubspot',
    questions: [
      {
        id: 'hubspot_credential',
        field: 'credentialId',
        prompt: 'Which HubSpot connection should we use?',
        type: 'credential',
        required: true,
        askOrder: 0,
      },
      {
        id: 'hubspot_resource',
        field: 'resource',
        prompt: 'Which HubSpot object are we working with?',
        type: 'select',
        required: true,
        askOrder: 1,
        options: [
          { value: 'contact', label: 'Contact' },
          { value: 'company', label: 'Company' },
          { value: 'deal', label: 'Deal' },
          { value: 'ticket', label: 'Ticket' },
        ],
      },
      {
        id: 'hubspot_operation',
        field: 'operation',
        prompt: 'What should we do in HubSpot?',
        type: 'select',
        required: true,
        askOrder: 2,
        options: [
          { value: 'get', label: 'Get record' },
          { value: 'getMany', label: 'List records' },
          { value: 'create', label: 'Create record' },
          { value: 'update', label: 'Update record' },
          { value: 'delete', label: 'Delete record' },
          { value: 'search', label: 'Search records' },
        ],
      },
      {
        id: 'hubspot_objectId',
        field: 'id',
        prompt: 'What is the record ID?',
        type: 'string',
        required: false,
        askOrder: 3,
        dependsOn: {
          field: 'operation',
          operator: 'in',
          value: ['get', 'update', 'delete'],
        },
        example: '12345',
      },
      {
        id: 'hubspot_searchQuery',
        field: 'searchQuery',
        prompt: 'What is the search query?',
        type: 'string',
        required: false,
        askOrder: 4,
        dependsOn: {
          field: 'operation',
          operator: 'equals',
          value: 'search',
        },
        example: 'email:test@example.com',
      },
      {
        id: 'hubspot_properties',
        field: 'properties',
        prompt: 'What properties should we set?',
        type: 'json',
        required: false,
        askOrder: 5,
        dependsOn: {
          field: 'operation',
          operator: 'in',
          value: ['create', 'update'],
        },
        example: {
          email: '{{$json.email}}',
          firstname: '{{$json.name}}',
        },
      },
    ],
  },

  zoho_crm: {
    nodeType: 'zoho_crm',
    requiresCredential: true,
    credentialProvider: 'zoho',
    questions: [
      {
        id: 'zoho_credential',
        field: 'credentialId',
        prompt: 'Which Zoho connection should we use?',
        type: 'credential',
        required: true,
        askOrder: 0,
      },
      {
        id: 'zoho_module',
        field: 'resource',
        prompt: 'Which Zoho CRM module are we working with?',
        type: 'select',
        required: true,
        askOrder: 1,
        options: [
          { value: 'Leads', label: 'Leads' },
          { value: 'Contacts', label: 'Contacts' },
          { value: 'Accounts', label: 'Accounts' },
          { value: 'Deals', label: 'Deals' },
        ],
        default: 'Contacts',
      },
      {
        id: 'zoho_operation',
        field: 'operation',
        prompt: 'What operation should we perform?',
        type: 'select',
        required: true,
        askOrder: 2,
        options: [
          { value: 'get', label: 'Get' },
          { value: 'getMany', label: 'List' },
          { value: 'create', label: 'Create' },
          { value: 'update', label: 'Update' },
          { value: 'delete', label: 'Delete' },
          { value: 'search', label: 'Search' },
        ],
      },
      {
        id: 'zoho_recordId',
        field: 'recordId',
        prompt: 'Record ID?',
        type: 'string',
        required: false,
        askOrder: 3,
        dependsOn: {
          field: 'operation',
          operator: 'in',
          value: ['get', 'update', 'delete'],
        },
      },
      {
        id: 'zoho_criteria',
        field: 'criteria',
        prompt: 'Search criteria? (optional)',
        type: 'string',
        required: false,
        askOrder: 4,
        dependsOn: {
          field: 'operation',
          operator: 'equals',
          value: 'search',
        },
        example: '(Email:equals:test@example.com)',
      },
      {
        id: 'zoho_data',
        field: 'data',
        prompt: 'Record data?',
        type: 'json',
        required: false,
        askOrder: 5,
        dependsOn: {
          field: 'operation',
          operator: 'in',
          value: ['create', 'update'],
        },
      },
    ],
  },

  pipedrive: {
    nodeType: 'pipedrive',
    requiresCredential: true,
    credentialProvider: 'pipedrive',
    questions: [
      {
        id: 'pipedrive_credential',
        field: 'credentialId',
        prompt: 'Which Pipedrive connection should we use?',
        type: 'credential',
        required: true,
        askOrder: 0,
      },
      {
        id: 'pipedrive_resource',
        field: 'resource',
        prompt: 'Which Pipedrive object are we working with?',
        type: 'select',
        required: true,
        askOrder: 1,
        options: [
          { value: 'deals', label: 'Deals' },
          { value: 'persons', label: 'Persons' },
          { value: 'organizations', label: 'Organizations' },
          { value: 'activities', label: 'Activities' },
        ],
      },
      {
        id: 'pipedrive_operation',
        field: 'operation',
        prompt: 'What operation should we perform?',
        type: 'select',
        required: true,
        askOrder: 2,
        options: [
          { value: 'get', label: 'Get' },
          { value: 'create', label: 'Create' },
          { value: 'update', label: 'Update' },
          { value: 'delete', label: 'Delete' },
          { value: 'search', label: 'Search' },
        ],
      },
      {
        id: 'pipedrive_id',
        field: 'id',
        prompt: 'Object ID?',
        type: 'string',
        required: false,
        askOrder: 3,
        dependsOn: {
          field: 'operation',
          operator: 'in',
          value: ['get', 'update', 'delete'],
        },
      },
      {
        id: 'pipedrive_data',
        field: 'data',
        prompt: 'Object data?',
        type: 'json',
        required: false,
        askOrder: 4,
        dependsOn: {
          field: 'operation',
          operator: 'in',
          value: ['create', 'update'],
        },
      },
    ],
  },

  notion: {
    nodeType: 'notion',
    requiresCredential: true,
    credentialProvider: 'notion',
    questions: [
      {
        id: 'notion_credential',
        field: 'credentialId',
        prompt: 'Which Notion connection should we use?',
        type: 'credential',
        required: true,
        askOrder: 0,
      },
      {
        id: 'notion_resource',
        field: 'resource',
        prompt: 'Which Notion resource are we working with?',
        type: 'select',
        required: true,
        askOrder: 1,
        options: [
          { value: 'page', label: 'Page' },
          { value: 'database', label: 'Database' },
          { value: 'search', label: 'Search' },
        ],
        default: 'page',
      },
      {
        id: 'notion_operation',
        field: 'operation',
        prompt: 'What operation should we perform?',
        type: 'select',
        required: true,
        askOrder: 2,
        options: [
          { value: 'get', label: 'Get' },
          { value: 'list', label: 'List' },
          { value: 'create', label: 'Create' },
          { value: 'update', label: 'Update' },
          { value: 'delete', label: 'Delete' },
          { value: 'search', label: 'Search' },
        ],
        default: 'get',
      },
      {
        id: 'notion_pageId',
        field: 'pageId',
        prompt: 'Page ID?',
        type: 'string',
        required: false,
        askOrder: 3,
        dependsOn: {
          field: 'resource',
          operator: 'equals',
          value: 'page',
        },
      },
      {
        id: 'notion_databaseId',
        field: 'databaseId',
        prompt: 'Database ID?',
        type: 'string',
        required: false,
        askOrder: 4,
        dependsOn: {
          field: 'resource',
          operator: 'equals',
          value: 'database',
        },
      },
      {
        id: 'notion_content',
        field: 'content',
        prompt: 'Content (properties/body) for create/update (JSON)?',
        type: 'json',
        required: false,
        askOrder: 5,
        dependsOn: {
          field: 'operation',
          operator: 'in',
          value: ['create', 'update'],
        },
      },
      {
        id: 'notion_filter',
        field: 'filter',
        prompt: 'Filter criteria for database query/search? (optional)',
        type: 'json',
        required: false,
        askOrder: 6,
        dependsOn: {
          field: 'operation',
          operator: 'equals',
          value: 'search',
        },
      },
    ],
  },

  airtable: {
    nodeType: 'airtable',
    requiresCredential: true,
    credentialProvider: 'airtable',
    questions: [
      {
        id: 'airtable_credential',
        field: 'credentialId',
        prompt: 'Which Airtable connection should we use?',
        type: 'credential',
        required: true,
        askOrder: 0,
      },
      {
        id: 'airtable_baseId',
        field: 'baseId',
        prompt: 'Which Airtable base ID should we use?',
        type: 'string',
        required: true,
        askOrder: 1,
        example: 'appXXXXXXXXXXXXXX',
      },
      {
        id: 'airtable_table',
        field: 'tableId',
        prompt: 'Which Airtable table ID or name?',
        type: 'string',
        required: true,
        askOrder: 2,
        example: 'tblXXXXXXXXXXXXXX',
      },
      {
        id: 'airtable_operation',
        field: 'operation',
        prompt: 'What operation should we perform?',
        type: 'select',
        required: true,
        askOrder: 3,
        options: [
          { value: 'read', label: 'Read' },
          { value: 'create', label: 'Create' },
          { value: 'update', label: 'Update' },
          { value: 'delete', label: 'Delete' },
        ],
        default: 'read',
      },
      {
        id: 'airtable_recordId',
        field: 'recordId',
        prompt: 'Record ID?',
        type: 'string',
        required: false,
        askOrder: 4,
        dependsOn: {
          field: 'operation',
          operator: 'in',
          value: ['get', 'update', 'delete'],
        },
      },
      {
        id: 'airtable_fields',
        field: 'fields',
        prompt: 'Record fields?',
        type: 'json',
        required: false,
        askOrder: 5,
        dependsOn: {
          field: 'operation',
          operator: 'in',
          value: ['create', 'update'],
        },
        example: {
          Name: '{{$json.name}}',
          Email: '{{$json.email}}',
        },
      },
    ],
  },

  clickup: {
    nodeType: 'clickup',
    requiresCredential: true,
    credentialProvider: 'clickup',
    questions: [
      {
        id: 'clickup_credential',
        field: 'credentialId',
        prompt: 'Which ClickUp connection should we use?',
        type: 'credential',
        required: true,
        askOrder: 0,
      },
      {
        id: 'clickup_listId',
        field: 'listId',
        prompt: 'Which ClickUp list or space should tasks be created in?',
        type: 'string',
        required: true,
        askOrder: 1,
        example: '123456789',
      },
      {
        id: 'clickup_operation',
        field: 'operation',
        prompt: 'What operation should we perform?',
        type: 'select',
        required: true,
        askOrder: 2,
        options: [
          { value: 'createTask', label: 'Create Task' },
          { value: 'updateTask', label: 'Update Task' },
          { value: 'getTask', label: 'Get Task' },
          { value: 'listTasks', label: 'List Tasks' },
        ],
      },
      {
        id: 'clickup_taskId',
        field: 'taskId',
        prompt: 'Task ID?',
        type: 'string',
        required: false,
        askOrder: 3,
        dependsOn: {
          field: 'operation',
          operator: 'in',
          value: ['getTask', 'updateTask'],
        },
      },
      {
        id: 'clickup_taskData',
        field: 'taskData',
        prompt: 'Task data?',
        type: 'json',
        required: false,
        askOrder: 4,
        dependsOn: {
          field: 'operation',
          operator: 'in',
          value: ['createTask', 'updateTask'],
        },
        example: {
          name: '{{$json.title}}',
          description: '{{$json.description}}',
        },
      },
    ],
  },

  // ============================================
  // COMMUNICATION NODES
  // ============================================

  google_gmail: {
    nodeType: 'google_gmail',
    requiresCredential: true,
    credentialProvider: 'google',
    questions: [
      {
        id: 'gmail_credential',
        field: 'credentialId',
        prompt: 'Which Gmail account should we use?',
        type: 'credential',
        required: true,
        askOrder: 0,
      },
      {
        id: 'gmail_operation',
        field: 'operation',
        prompt: 'What should we do with Gmail?',
        type: 'select',
        required: true,
        askOrder: 1,
        options: [
          { value: 'send', label: 'Send email' },
          { value: 'list', label: 'List messages' },
          { value: 'get', label: 'Get message' },
          { value: 'search', label: 'Search messages' },
        ],
        default: 'send',
      },
      {
        id: 'gmail_to',
        field: 'to',
        prompt: 'Who should we send to?',
        type: 'email',
        required: false,
        askOrder: 2,
        dependsOn: {
          field: 'operation',
          operator: 'equals',
          value: 'send',
        },
        example: 'recipient@example.com',
      },
      {
        id: 'gmail_subject',
        field: 'subject',
        prompt: 'What is the subject?',
        type: 'string',
        required: false,
        askOrder: 3,
        dependsOn: {
          field: 'operation',
          operator: 'equals',
          value: 'send',
        },
        example: 'Welcome to our platform',
      },
      {
        id: 'gmail_body',
        field: 'body',
        prompt: 'What is the email body?',
        type: 'string',
        required: false,
        askOrder: 4,
        dependsOn: {
          field: 'operation',
          operator: 'equals',
          value: 'send',
        },
        example: 'Hi {{$json.name}}, welcome aboard!',
      },
      {
        id: 'gmail_messageId',
        field: 'messageId',
        prompt: 'Message ID?',
        type: 'string',
        required: false,
        askOrder: 5,
        dependsOn: {
          field: 'operation',
          operator: 'equals',
          value: 'get',
        },
      },
      {
        id: 'gmail_query',
        field: 'query',
        prompt: 'Search query?',
        type: 'string',
        required: false,
        askOrder: 6,
        dependsOn: {
          field: 'operation',
          operator: 'in',
          value: ['list', 'search'],
        },
        example: 'is:unread',
      },
      {
        id: 'gmail_maxResults',
        field: 'maxResults',
        prompt: 'Maximum results?',
        type: 'number',
        required: false,
        askOrder: 7,
        dependsOn: {
          field: 'operation',
          operator: 'in',
          value: ['list', 'search'],
        },
        default: 10,
      },
    ],
  },

  google_sheets: {
    nodeType: 'google_sheets',
    requiresCredential: true,
    credentialProvider: 'google',
    questions: [
      {
        id: 'sheets_credential',
        field: 'credentialId',
        prompt: 'Which Google account should we use?',
        type: 'credential',
        required: true,
        askOrder: 0,
      },
      {
        id: 'sheets_operation',
        field: 'operation',
        prompt: 'What Google Sheets operation should "Google Sheets" perform?',
        type: 'select',
        required: true,
        askOrder: 1,
        options: [
          { value: 'read', label: 'Read' },
          { value: 'write', label: 'Write' },
          { value: 'append', label: 'Append' },
          { value: 'update', label: 'Update' },
        ],
        default: 'read',
        description: 'Operation type: read, write, append, or update',
      },
      {
        id: 'sheets_spreadsheetId',
        field: 'spreadsheetId',
        prompt: 'What is the Google Sheets spreadsheet ID?',
        type: 'string',
        required: true,
        askOrder: 2,
        example: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms',
        placeholder: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms',
        description: 'The ID from the Google Sheets URL (the long string between /d/ and /edit)',
      },
      {
        id: 'sheets_sheetName',
        field: 'sheetName',
        prompt: 'What is the sheet name (tab)?',
        type: 'string',
        required: false,
        askOrder: 3,
        example: 'Sheet1',
        placeholder: 'Sheet1',
        description: 'Leave empty to use the first sheet',
      },
      {
        id: 'sheets_range',
        field: 'range',
        prompt: 'What is the cell range (e.g., A1:D100)?',
        type: 'string',
        required: false,
        askOrder: 4,
        example: 'A1:D100',
        placeholder: 'A1:D100',
        description: 'Leave empty to read all used cells. For write/update, specify the target range.',
      },
      {
        id: 'sheets_outputFormat',
        field: 'outputFormat',
        prompt: 'What output format should we use?',
        type: 'select',
        required: false,
        askOrder: 5,
        options: [
          { value: 'json', label: 'JSON' },
          { value: 'array', label: 'Array' },
          { value: 'object', label: 'Object' },
        ],
        default: 'json',
        dependsOn: {
          field: 'operation',
          operator: 'equals',
          value: 'read',
        },
        description: 'Output format for read operations',
      },
      {
        id: 'sheets_values',
        field: 'values',
        prompt: 'What data should we write/append?',
        type: 'json',
        required: false,
        askOrder: 6,
        dependsOn: {
          field: 'operation',
          operator: 'in',
          value: ['write', 'append'],
        },
        example: [['Name', 'Email'], ['John Doe', 'john@example.com']],
        description: 'Data to write/append (for write/append operations)',
      },
      {
        id: 'sheets_data',
        field: 'data',
        prompt: 'What data object should we write/append?',
        type: 'json',
        required: false,
        askOrder: 7,
        dependsOn: {
          field: 'operation',
          operator: 'in',
          value: ['write', 'append'],
        },
        example: { name: 'John Doe', email: 'john@example.com' },
        description: 'Data object to write/append (alternative to values array)',
      },
    ],
  },

  slack_message: {
    nodeType: 'slack_message',
    requiresCredential: true,
    credentialProvider: 'slack',
    questions: [
      {
        id: 'slack_webhookUrl',
        field: 'webhookUrl',
        prompt: 'What is the Slack webhook URL?',
        type: 'string',
        required: true,
        askOrder: 0,
        example: 'https://hooks.slack.com/services/...',
      },
      {
        id: 'slack_channel',
        field: 'channel',
        prompt: 'Which Slack channel should we post to?',
        type: 'string',
        required: false,
        askOrder: 1,
        example: '#general',
        placeholder: '#channel-name or @username',
      },
      {
        id: 'slack_message',
        field: 'message',
        prompt: 'What message should we send?',
        type: 'string',
        required: true,
        askOrder: 2,
        example: 'New lead: {{$json.email}}',
      },
      {
        id: 'slack_blocks',
        field: 'blocks',
        prompt: 'Slack blocks JSON (optional)',
        type: 'json',
        required: false,
        askOrder: 3,
      },
      {
        id: 'slack_username',
        field: 'username',
        prompt: 'Bot username (optional)',
        type: 'string',
        required: false,
        askOrder: 4,
      },
      {
        id: 'slack_iconEmoji',
        field: 'iconEmoji',
        prompt: 'Icon emoji (optional)',
        type: 'string',
        required: false,
        askOrder: 5,
        example: ':robot_face:',
      },
    ],
  },

  telegram: {
    nodeType: 'telegram',
    requiresCredential: true,
    credentialProvider: 'telegram',
    questions: [
      {
        id: 'telegram_credential',
        field: 'credentialId',
        prompt: 'Which Telegram bot should we use?',
        type: 'credential',
        required: true,
        askOrder: 0,
      },
      {
        id: 'telegram_chatId',
        field: 'chatId',
        prompt: 'What is the Telegram chat ID or @username?',
        type: 'string',
        required: true,
        askOrder: 1,
        example: '123456789',
        placeholder: '123456789 or @username',
      },
      {
        id: 'telegram_messageType',
        field: 'messageType',
        prompt: 'Message type?',
        type: 'select',
        required: true,
        askOrder: 2,
        options: [
          { value: 'text', label: 'Text' },
          { value: 'photo', label: 'Photo' },
          { value: 'video', label: 'Video' },
          { value: 'document', label: 'Document' },
          { value: 'audio', label: 'Audio' },
          { value: 'animation', label: 'Animation' },
          { value: 'location', label: 'Location' },
          { value: 'poll', label: 'Poll' },
        ],
        default: 'text',
      },
      {
        id: 'telegram_message',
        field: 'message',
        prompt: 'Message text',
        type: 'string',
        required: false,
        askOrder: 3,
        dependsOn: {
          field: 'messageType',
          operator: 'equals',
          value: 'text',
        },
        example: 'Hello! New order received: {{$json.orderId}}',
      },
      {
        id: 'telegram_mediaUrl',
        field: 'mediaUrl',
        prompt: 'Media URL (for photo/video/document/etc.)',
        type: 'string',
        required: false,
        askOrder: 4,
        dependsOn: {
          field: 'messageType',
          operator: 'notEquals',
          value: 'text',
        },
      },
      {
        id: 'telegram_caption',
        field: 'caption',
        prompt: 'Caption (optional)',
        type: 'string',
        required: false,
        askOrder: 5,
      },
    ],
  },

  outlook: {
    nodeType: 'outlook',
    requiresCredential: true,
    credentialProvider: 'microsoft',
    questions: [
      {
        id: 'outlook_credential',
        field: 'credentialId',
        prompt: 'Which Outlook account should we use?',
        type: 'credential',
        required: true,
        askOrder: 0,
      },
      {
        id: 'outlook_operation',
        field: 'operation',
        prompt: 'What should we do?',
        type: 'select',
        required: true,
        askOrder: 1,
        options: [
          { value: 'send', label: 'Send email' },
        ],
        default: 'send',
      },
      {
        id: 'outlook_to',
        field: 'to',
        prompt: 'Who should we send to?',
        type: 'email',
        required: true,
        askOrder: 2,
        example: 'recipient@example.com',
      },
      {
        id: 'outlook_subject',
        field: 'subject',
        prompt: 'What is the subject?',
        type: 'string',
        required: true,
        askOrder: 3,
      },
      {
        id: 'outlook_body',
        field: 'body',
        prompt: 'What is the email body?',
        type: 'string',
        required: true,
        askOrder: 4,
      },
    ],
  },

  google_calendar: {
    nodeType: 'google_calendar',
    requiresCredential: true,
    credentialProvider: 'google',
    questions: [
      {
        id: 'gcal_credential',
        field: 'credentialId',
        prompt: 'Which Google account/calendar connection should we use?',
        type: 'credential',
        required: false,
        askOrder: 0,
      },
      {
        id: 'gcal_resource',
        field: 'resource',
        prompt: 'What Google Calendar resource are we working with?',
        type: 'select',
        required: true,
        askOrder: 1,
        options: [
          { value: 'event', label: 'Event' },
          { value: 'calendar', label: 'Calendar' },
        ],
        default: 'event',
      },
      {
        id: 'gcal_operation',
        field: 'operation',
        prompt: 'What should we do?',
        type: 'select',
        required: true,
        askOrder: 2,
        options: [
          { value: 'list', label: 'List' },
          { value: 'get', label: 'Get' },
          { value: 'create', label: 'Create' },
          { value: 'update', label: 'Update' },
          { value: 'delete', label: 'Delete' },
        ],
        default: 'list',
      },
      {
        id: 'gcal_calendarId',
        field: 'calendarId',
        prompt: 'Which calendar ID?',
        type: 'string',
        required: false,
        askOrder: 3,
        example: 'primary',
        placeholder: 'primary or calendar@group.calendar.google.com',
      },
      {
        id: 'gcal_eventId',
        field: 'eventId',
        prompt: 'Event ID?',
        type: 'string',
        required: false,
        askOrder: 4,
        dependsOn: {
          field: 'operation',
          operator: 'in',
          value: ['update', 'get', 'delete'],
        },
      },
      {
        id: 'gcal_summary',
        field: 'summary',
        prompt: 'Event title?',
        type: 'string',
        required: false,
        askOrder: 5,
        dependsOn: {
          field: 'operation',
          operator: 'in',
          value: ['create', 'update'],
        },
        example: 'Team Meeting',
      },
      {
        id: 'gcal_start',
        field: 'start',
        prompt: 'Start datetime object (JSON, e.g. {"dateTime":"...","timeZone":"..."})',
        type: 'json',
        required: false,
        askOrder: 6,
        dependsOn: {
          field: 'operation',
          operator: 'in',
          value: ['create', 'update'],
        },
        example: { dateTime: '2026-02-16T09:00:00Z', timeZone: 'UTC' },
      },
      {
        id: 'gcal_end',
        field: 'end',
        prompt: 'End datetime object (JSON)',
        type: 'json',
        required: false,
        askOrder: 7,
        dependsOn: {
          field: 'operation',
          operator: 'in',
          value: ['create', 'update'],
        },
        example: { dateTime: '2026-02-16T10:00:00Z', timeZone: 'UTC' },
      },
      {
        id: 'gcal_description',
        field: 'description',
        prompt: 'Event description (optional)',
        type: 'string',
        required: false,
        askOrder: 8,
      },
    ],
  },

  // ============================================
  // SOCIAL / DEV NODES
  // ============================================

  linkedin: {
    nodeType: 'linkedin',
    requiresCredential: true,
    credentialProvider: 'linkedin',
    questions: [
      {
        id: 'linkedin_credential',
        field: 'credentialId',
        prompt: 'Which LinkedIn account should we use?',
        type: 'credential',
        required: true,
        askOrder: 0,
      },
      {
        id: 'linkedin_operation',
        field: 'operation',
        prompt: 'Which LinkedIn operation should we perform?',
        type: 'select',
        required: true,
        askOrder: 1,
        options: [
          { value: 'create_post', label: 'Create Post (Text)' },
          { value: 'create_article', label: 'Create Post (Article)' },
          { value: 'create_post_media', label: 'Create Post (Media)' },
          { value: 'create_company_post', label: 'Create Company Page Post' },
          { value: 'get_posts', label: 'Get Posts' },
          { value: 'get_org_updates', label: 'Get Organization Updates' },
          { value: 'delete_post', label: 'Delete Post' },
          { value: 'get_engagement', label: 'Get Engagement Metrics' },
        ],
        default: 'create_post',
      },
      {
        id: 'linkedin_mediaUrl',
        field: 'mediaUrl',
        prompt: 'Media URL (optional; required for Create Post - Media)',
        type: 'string',
        required: false,
        askOrder: 2,
        placeholder: 'https://cdn.example.com/image-or-video.jpg',
        description: 'Public HTTPS URL to an image/video. If you select Create Post (Media), this is required.',
      },
      {
        id: 'linkedin_text',
        field: 'text',
        prompt: 'What content should we post?',
        type: 'string',
        required: false,
        askOrder: 3,
        example: 'Excited to announce our new feature!',
      },
      {
        id: 'linkedin_visibility',
        field: 'visibility',
        prompt: 'Post visibility?',
        type: 'select',
        required: false,
        askOrder: 4,
        options: [
          { value: 'PUBLIC', label: 'Public' },
          { value: 'CONNECTIONS', label: 'Connections only' },
        ],
        default: 'PUBLIC',
      },
      {
        id: 'linkedin_personUrn',
        field: 'personUrn',
        prompt: 'Person URN (optional, usually auto-detected)',
        type: 'string',
        required: false,
        askOrder: 5,
      },
      {
        id: 'linkedin_media',
        field: 'media',
        prompt: 'Media (images/videos) - optional',
        type: 'json',
        required: false,
        askOrder: 6,
      },
      {
        id: 'linkedin_dryRun',
        field: 'dryRun',
        prompt: 'Dry run (test without posting)?',
        type: 'boolean',
        required: false,
        askOrder: 7,
        default: false,
      },
    ],
  },

  github: {
    nodeType: 'github',
    requiresCredential: true,
    credentialProvider: 'github',
    questions: [
      {
        id: 'github_credential',
        field: 'credentialId',
        prompt: 'Which GitHub account should we use?',
        type: 'credential',
        required: true,
        askOrder: 0,
      },
      {
        id: 'github_operation',
        field: 'operation',
        prompt: 'What should we do?',
        type: 'select',
        required: true,
        askOrder: 1,
        options: [
          { value: 'create_issue', label: 'Create Issue' },
          { value: 'add_issue_comment', label: 'Add Issue Comment' },
          { value: 'create_pr', label: 'Create Pull Request' },
          { value: 'trigger_workflow', label: 'Trigger Workflow' },
          { value: 'list_repos', label: 'List Repositories' },
        ],
        default: 'create_issue',
      },
      {
        id: 'github_owner',
        field: 'owner',
        prompt: 'Repository owner (user/org)?',
        type: 'string',
        required: false,
        askOrder: 2,
        example: 'octocat',
      },
      {
        id: 'github_repo',
        field: 'repo',
        prompt: 'Repository name?',
        type: 'string',
        required: false,
        askOrder: 3,
        example: 'hello-world',
      },
      {
        id: 'github_issueNumber',
        field: 'issueNumber',
        prompt: 'Issue number?',
        type: 'number',
        required: false,
        askOrder: 4,
        dependsOn: {
          field: 'operation',
          operator: 'in',
          value: ['add_issue_comment'],
        },
      },
      {
        id: 'github_title',
        field: 'title',
        prompt: 'Title?',
        type: 'string',
        required: false,
        askOrder: 5,
        dependsOn: {
          field: 'operation',
          operator: 'in',
          value: ['create_issue', 'create_pr'],
        },
        example: 'Bug: Login not working',
      },
      {
        id: 'github_body',
        field: 'body',
        prompt: 'Body/comment?',
        type: 'string',
        required: false,
        askOrder: 6,
        dependsOn: {
          field: 'operation',
          operator: 'in',
          value: ['create_issue', 'create_pr', 'add_issue_comment'],
        },
        example: 'Description of the issue...',
      },
      {
        id: 'github_ref',
        field: 'ref',
        prompt: 'Base branch/ref? (optional)',
        type: 'string',
        required: false,
        askOrder: 7,
        dependsOn: {
          field: 'operation',
          operator: 'equals',
          value: 'create_pr',
        },
        default: 'main',
      },
      {
        id: 'github_branchName',
        field: 'branchName',
        prompt: 'Head branch name? (optional)',
        type: 'string',
        required: false,
        askOrder: 8,
        dependsOn: {
          field: 'operation',
          operator: 'equals',
          value: 'create_pr',
        },
      },
    ],
  },

  whatsapp_cloud: {
    nodeType: 'whatsapp_cloud',
    requiresCredential: true,
    credentialProvider: 'whatsapp',
    questions: [
      {
        id: 'whatsapp_credential',
        field: 'credentialId',
        prompt: 'Which WhatsApp Business account should we use?',
        type: 'credential',
        required: true,
        askOrder: 0,
      },
      {
        id: 'whatsapp_resource',
        field: 'resource',
        prompt: 'WhatsApp resource?',
        type: 'select',
        required: true,
        askOrder: 1,
        options: [
          { value: 'message', label: 'Message' },
        ],
        default: 'message',
      },
      {
        id: 'whatsapp_operation',
        field: 'operation',
        prompt: 'What operation should we perform?',
        type: 'select',
        required: true,
        askOrder: 2,
        options: [
          { value: 'sendText', label: 'Send Text' },
          { value: 'sendMedia', label: 'Send Media' },
          { value: 'sendLocation', label: 'Send Location' },
          { value: 'sendContact', label: 'Send Contact' },
          { value: 'sendReaction', label: 'Send Reaction' },
          { value: 'sendTemplate', label: 'Send Template' },
        ],
        default: 'sendText',
      },
      {
        id: 'whatsapp_phoneNumberId',
        field: 'phoneNumberId',
        prompt: 'WhatsApp phoneNumberId?',
        type: 'string',
        required: true,
        askOrder: 3,
      },
      {
        id: 'whatsapp_to',
        field: 'to',
        prompt: 'What is the recipient phone number? (E.164 format)',
        type: 'string',
        required: true,
        askOrder: 4,
        example: '+1234567890',
        placeholder: '+1234567890',
      },
      {
        id: 'whatsapp_text',
        field: 'text',
        prompt: 'Text to send',
        type: 'string',
        required: false,
        askOrder: 5,
        dependsOn: {
          field: 'operation',
          operator: 'equals',
          value: 'sendText',
        },
        example: 'Hello! Your order {{$json.orderId}} is ready.',
      },
      {
        id: 'whatsapp_mediaUrl',
        field: 'mediaUrl',
        prompt: 'Media URL (for sendMedia)',
        type: 'string',
        required: false,
        askOrder: 6,
        dependsOn: {
          field: 'operation',
          operator: 'equals',
          value: 'sendMedia',
        },
      },
    ],
  },

  instagram: {
    nodeType: 'instagram',
    requiresCredential: true,
    credentialProvider: 'instagram',
    questions: [
      {
        id: 'instagram_credential',
        field: 'credentialId',
        prompt: 'Which Instagram account should we use?',
        type: 'credential',
        required: true,
        askOrder: 0,
      },
      {
        id: 'instagram_resource',
        field: 'resource',
        prompt: 'Instagram resource?',
        type: 'select',
        required: true,
        askOrder: 1,
        options: [
          { value: 'media', label: 'Media' },
        ],
        default: 'media',
      },
      {
        id: 'instagram_operation',
        field: 'operation',
        prompt: 'Instagram operation?',
        type: 'select',
        required: true,
        askOrder: 2,
        options: [
          { value: 'createAndPublish', label: 'Create and Publish' },
          { value: 'create', label: 'Create Container' },
          { value: 'publish', label: 'Publish Container' },
          { value: 'get', label: 'Get Media' },
          { value: 'list', label: 'List Media' },
        ],
        default: 'createAndPublish',
      },
      {
        id: 'instagram_media_url',
        field: 'media_url',
        prompt: 'Media URL (image/video)',
        type: 'string',
        required: false,
        askOrder: 3,
        dependsOn: {
          field: 'operation',
          operator: 'in',
          value: ['create', 'createAndPublish'],
        },
        example: 'https://example.com/image.jpg',
      },
      {
        id: 'instagram_caption',
        field: 'caption',
        prompt: 'Caption (optional)',
        type: 'string',
        required: false,
        askOrder: 4,
        dependsOn: {
          field: 'operation',
          operator: 'in',
          value: ['create', 'createAndPublish'],
        },
      },
    ],
  },

  facebook: {
    nodeType: 'facebook',
    requiresCredential: true,
    credentialProvider: 'facebook',
    questions: [
      {
        id: 'facebook_credential',
        field: 'credentialId',
        prompt: 'Which Facebook page should we use?',
        type: 'credential',
        required: true,
        askOrder: 0,
      },
      {
        id: 'facebook_operation',
        field: 'operation',
        prompt: 'What should we do?',
        type: 'select',
        required: true,
        askOrder: 1,
        options: [
          { value: 'create_post', label: 'Create Post' },
          { value: 'get_profile', label: 'Get Profile' },
        ],
        default: 'create_post',
      },
      {
        id: 'facebook_message',
        field: 'message',
        prompt: 'What content should we post?',
        type: 'string',
        required: true,
        askOrder: 2,
        example: 'Exciting news! Check out our latest update.',
      },
      {
        id: 'facebook_imageUrl',
        field: 'imageUrl',
        prompt: 'Image URL (optional)',
        type: 'string',
        required: false,
        askOrder: 3,
      },
      {
        id: 'facebook_link',
        field: 'link',
        prompt: 'Link (optional)',
        type: 'string',
        required: false,
        askOrder: 4,
      },
    ],
  },

  twitter: {
    nodeType: 'twitter',
    requiresCredential: true,
    credentialProvider: 'twitter',
    questions: [
      {
        id: 'twitter_credential',
        field: 'credentialId',
        prompt: 'Which Twitter/X account should we use?',
        type: 'credential',
        required: true,
        askOrder: 0,
      },
      {
        id: 'twitter_operation',
        field: 'operation',
        prompt: 'What should we do?',
        type: 'select',
        required: true,
        askOrder: 1,
        options: [
          { value: 'create', label: 'Create Tweet' },
          { value: 'delete', label: 'Delete Tweet' },
          { value: 'searchRecent', label: 'Search Recent Tweets' },
        ],
        default: 'create',
      },
      {
        id: 'twitter_text',
        field: 'text',
        prompt: 'What should we tweet? (max 280 characters)',
        type: 'string',
        required: true,
        askOrder: 2,
        dependsOn: {
          field: 'operation',
          operator: 'equals',
          value: 'create',
        },
        example: 'Excited to share our latest feature! 🚀',
      },
      {
        id: 'twitter_tweetId',
        field: 'tweetId',
        prompt: 'Tweet ID?',
        type: 'string',
        required: false,
        askOrder: 3,
        dependsOn: {
          field: 'operation',
          operator: 'in',
          value: ['delete'],
        },
      },
      {
        id: 'twitter_query',
        field: 'query',
        prompt: 'Search query?',
        type: 'string',
        required: false,
        askOrder: 4,
        dependsOn: {
          field: 'operation',
          operator: 'equals',
          value: 'searchRecent',
        },
      },
    ],
  },

  youtube: {
    nodeType: 'youtube',
    requiresCredential: true,
    credentialProvider: 'youtube',
    questions: [
      {
        id: 'youtube_credential',
        field: 'credentialId',
        prompt: 'Which YouTube channel should we use?',
        type: 'credential',
        required: true,
        askOrder: 0,
      },
      {
        id: 'youtube_operation',
        field: 'operation',
        prompt: 'What should we do?',
        type: 'select',
        required: true,
        askOrder: 1,
        options: [
          { value: 'uploadVideo', label: 'Upload Video' },
          { value: 'createPlaylist', label: 'Create Playlist' },
          { value: 'addToPlaylist', label: 'Add to Playlist' },
        ],
        default: 'uploadVideo',
      },
      {
        id: 'youtube_videoUrl',
        field: 'videoUrl',
        prompt: 'Video file URL or path?',
        type: 'string',
        required: false,
        askOrder: 2,
        dependsOn: {
          field: 'operation',
          operator: 'equals',
          value: 'uploadVideo',
        },
      },
      {
        id: 'youtube_title',
        field: 'title',
        prompt: 'Title?',
        type: 'string',
        required: false,
        askOrder: 3,
        dependsOn: {
          field: 'operation',
          operator: 'in',
          value: ['uploadVideo', 'createPlaylist'],
        },
        example: 'How to Use Our Platform',
      },
      {
        id: 'youtube_description',
        field: 'description',
        prompt: 'Description?',
        type: 'string',
        required: false,
        askOrder: 4,
        dependsOn: {
          field: 'operation',
          operator: 'in',
          value: ['uploadVideo', 'createPlaylist'],
        },
      },
      {
        id: 'youtube_playlistId',
        field: 'playlistId',
        prompt: 'Playlist ID?',
        type: 'string',
        required: false,
        askOrder: 5,
        dependsOn: {
          field: 'operation',
          operator: 'equals',
          value: 'addToPlaylist',
        },
      },
      {
        id: 'youtube_videoId',
        field: 'videoId',
        prompt: 'Video ID?',
        type: 'string',
        required: false,
        askOrder: 6,
        dependsOn: {
          field: 'operation',
          operator: 'equals',
          value: 'addToPlaylist',
        },
      },
    ],
  },
};

/**
 * Get question configuration for a node type
 */
export function getQuestionConfig(nodeType: string): NodeQuestionConfig | null {
  return NODE_QUESTION_CONFIGS[nodeType] || null;
}

/**
 * Get ordered questions for a node, filtering by dependencies
 */
export function getOrderedQuestions(
  nodeType: string,
  answeredFields: Record<string, any> = {}
): QuestionDefinition[] {
  const config = getQuestionConfig(nodeType);
  if (!config) return [];

  // Sort by askOrder
  const sorted = [...config.questions].sort((a, b) => a.askOrder - b.askOrder);

  // Filter by dependencies
  return sorted.filter((q) => {
    if (!q.dependsOn) return true;

    const { field, operator, value } = q.dependsOn;
    const fieldValue = answeredFields[field];

    switch (operator) {
      case 'equals':
        return fieldValue === value;
      case 'notEquals':
        return fieldValue !== value;
      case 'in':
        return Array.isArray(value) && value.includes(fieldValue);
      case 'exists':
        return fieldValue !== undefined && fieldValue !== null;
      case 'notExists':
        return fieldValue === undefined || fieldValue === null;
      default:
        return true;
    }
  });
}

/**
 * Get next unanswered question for a node
 */
export function getNextQuestion(
  nodeType: string,
  answeredFields: Record<string, any> = {}
): QuestionDefinition | null {
  const questions = getOrderedQuestions(nodeType, answeredFields);
  
  // Find first unanswered required question
  for (const q of questions) {
    if (q.required) {
      const value = answeredFields[q.field];
      if (value === undefined || value === null || value === '') {
        return q;
      }
    }
  }

  // If all required answered, return first unanswered optional
  for (const q of questions) {
    if (!q.required) {
      const value = answeredFields[q.field];
      if (value === undefined || value === null || value === '') {
        return q;
      }
    }
  }

  return null;
}

/**
 * Check if all required questions are answered
 */
export function areAllRequiredQuestionsAnswered(
  nodeType: string,
  answeredFields: Record<string, any> = {}
): boolean {
  const config = getQuestionConfig(nodeType);
  if (!config) return true;

  const requiredQuestions = config.questions.filter((q) => q.required);
  
  for (const q of requiredQuestions) {
    // Check dependencies first
    if (q.dependsOn) {
      const { field, operator, value } = q.dependsOn;
      const fieldValue = answeredFields[field];
      let dependencyMet = false;

      switch (operator) {
        case 'equals':
          dependencyMet = fieldValue === value;
          break;
        case 'notEquals':
          dependencyMet = fieldValue !== value;
          break;
        case 'in':
          dependencyMet = Array.isArray(value) && value.includes(fieldValue);
          break;
        case 'exists':
          dependencyMet = fieldValue !== undefined && fieldValue !== null;
          break;
        case 'notExists':
          dependencyMet = fieldValue === undefined || fieldValue === null;
          break;
        default:
          dependencyMet = true;
      }

      if (!dependencyMet) continue; // Skip if dependency not met
    }

    // Check if required field is answered
    const fieldValue = answeredFields[q.field];
    if (fieldValue === undefined || fieldValue === null || fieldValue === '') {
      return false;
    }
  }

  return true;
}
