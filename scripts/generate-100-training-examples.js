/**
 * Generate 100 diverse workflow training examples
 * Covers all node types, patterns, and complexity levels
 */

const fs = require('fs');
const path = require('path');

// All available node types
const NODE_TYPES = {
  triggers: ['manual_trigger', 'schedule', 'webhook', 'interval', 'chat_trigger', 'form'],
  http: ['http_request', 'respond_to_webhook'],
  database: ['database_read', 'database_write', 'supabase', 'google_sheets', 'google_doc'],
  transformation: ['set_variable', 'javascript', 'text_formatter', 'date_time', 'merge_data'],
  logic: ['if_else', 'switch'],
  ai: ['ai_agent'],
  output: ['slack_message', 'google_gmail', 'email', 'log_output', 'discord'],
  error: ['error_handler', 'wait'],
};

// Generate 100 diverse examples
function generateTrainingExamples() {
  const examples = [];
  let id = 1;

  // ===== SIMPLE WORKFLOWS (2-3 nodes) =====
  
  // 1-10: Simple Notifications
  const simpleNotifications = [
    { prompt: 'send notification to slack', nodes: ['manual_trigger', 'slack_message'], category: 'Notification' },
    { prompt: 'send message to discord', nodes: ['manual_trigger', 'discord'], category: 'Notification' },
    { prompt: 'send email notification', nodes: ['manual_trigger', 'google_gmail'], category: 'Notification' },
    { prompt: 'notify team in slack when workflow completes', nodes: ['manual_trigger', 'slack_message'], category: 'Notification' },
    { prompt: 'send alert to slack channel', nodes: ['manual_trigger', 'slack_message'], category: 'Notification' },
    { prompt: 'daily slack notification', nodes: ['schedule', 'slack_message'], category: 'Notification' },
    { prompt: 'weekly email report', nodes: ['schedule', 'google_gmail'], category: 'Notification' },
    { prompt: 'send slack message every hour', nodes: ['interval', 'slack_message'], category: 'Notification' },
    { prompt: 'notify via discord webhook', nodes: ['webhook', 'discord'], category: 'Notification' },
    { prompt: 'send email when form submitted', nodes: ['form', 'google_gmail'], category: 'Notification' },
  ];

  // 11-20: Simple Data Operations
  const simpleDataOps = [
    { prompt: 'read data from google sheets', nodes: ['manual_trigger', 'google_sheets'], category: 'Data Sync' },
    { prompt: 'save form data to google sheets', nodes: ['form', 'google_sheets'], category: 'Data Sync' },
    { prompt: 'read from database', nodes: ['manual_trigger', 'database_read'], category: 'Data Sync' },
    { prompt: 'write data to database', nodes: ['manual_trigger', 'database_write'], category: 'Data Sync' },
    { prompt: 'save data to supabase', nodes: ['manual_trigger', 'supabase'], category: 'Data Sync' },
    { prompt: 'read google sheet and display', nodes: ['manual_trigger', 'google_sheets', 'log_output'], category: 'Data Sync' },
    { prompt: 'save webhook data to sheets', nodes: ['webhook', 'google_sheets'], category: 'Data Sync' },
    { prompt: 'create google doc from template', nodes: ['manual_trigger', 'google_doc'], category: 'Data Sync' },
    { prompt: 'append data to google sheets', nodes: ['manual_trigger', 'google_sheets'], category: 'Data Sync' },
    { prompt: 'query database and log results', nodes: ['manual_trigger', 'database_read', 'log_output'], category: 'Data Sync' },
  ];

  // 21-30: Simple HTTP/API
  const simpleHttp = [
    { prompt: 'call api endpoint', nodes: ['manual_trigger', 'http_request'], category: 'API Integration' },
    { prompt: 'make http request and log response', nodes: ['manual_trigger', 'http_request', 'log_output'], category: 'API Integration' },
    { prompt: 'webhook trigger and respond', nodes: ['webhook', 'respond_to_webhook'], category: 'API Integration' },
    { prompt: 'get data from api', nodes: ['manual_trigger', 'http_request'], category: 'API Integration' },
    { prompt: 'post data to external api', nodes: ['manual_trigger', 'http_request'], category: 'API Integration' },
    { prompt: 'webhook receives data and responds', nodes: ['webhook', 'respond_to_webhook'], category: 'API Integration' },
    { prompt: 'call rest api endpoint', nodes: ['manual_trigger', 'http_request'], category: 'API Integration' },
    { prompt: 'fetch data from url', nodes: ['manual_trigger', 'http_request'], category: 'API Integration' },
    { prompt: 'webhook handler that returns json', nodes: ['webhook', 'respond_to_webhook'], category: 'API Integration' },
    { prompt: 'api call with authentication', nodes: ['manual_trigger', 'http_request'], category: 'API Integration' },
  ];

  // ===== MEDIUM COMPLEXITY (3-5 nodes) =====
  
  // 31-40: Data Transformation
  const dataTransform = [
    { prompt: 'read from sheets, format text, send to slack', nodes: ['manual_trigger', 'google_sheets', 'text_formatter', 'slack_message'], category: 'Transformation' },
    { prompt: 'get data, transform with javascript, save to database', nodes: ['manual_trigger', 'database_read', 'javascript', 'database_write'], category: 'Transformation' },
    { prompt: 'read data, extract fields, send email', nodes: ['manual_trigger', 'google_sheets', 'set_variable', 'google_gmail'], category: 'Transformation' },
    { prompt: 'webhook data, format date, save to sheets', nodes: ['webhook', 'date_time', 'text_formatter', 'google_sheets'], category: 'Transformation' },
    { prompt: 'read sheets, merge data, send notification', nodes: ['manual_trigger', 'google_sheets', 'merge_data', 'slack_message'], category: 'Transformation' },
    { prompt: 'form data, transform fields, save to database', nodes: ['form', 'set_variable', 'javascript', 'database_write'], category: 'Transformation' },
    { prompt: 'api response, format text, log output', nodes: ['manual_trigger', 'http_request', 'text_formatter', 'log_output'], category: 'Transformation' },
    { prompt: 'read database, calculate values, update sheets', nodes: ['manual_trigger', 'database_read', 'javascript', 'google_sheets'], category: 'Transformation' },
    { prompt: 'get data, parse json, format message', nodes: ['manual_trigger', 'http_request', 'set_variable', 'text_formatter'], category: 'Transformation' },
    { prompt: 'webhook, extract specific fields, send email', nodes: ['webhook', 'set_variable', 'google_gmail'], category: 'Transformation' },
  ];

  // 41-50: Conditional Logic
  const conditionalLogic = [
    { prompt: 'if condition is true send slack else send email', nodes: ['manual_trigger', 'if_else', 'slack_message', 'google_gmail'], category: 'Conditional' },
    { prompt: 'check data and route to different actions', nodes: ['manual_trigger', 'database_read', 'if_else', 'slack_message', 'google_gmail'], category: 'Conditional' },
    { prompt: 'form submission, if valid save else notify', nodes: ['form', 'if_else', 'google_sheets', 'slack_message'], category: 'Conditional' },
    { prompt: 'read data, check condition, send notification', nodes: ['manual_trigger', 'google_sheets', 'if_else', 'slack_message'], category: 'Conditional' },
    { prompt: 'webhook data, validate, process or error', nodes: ['webhook', 'if_else', 'database_write', 'error_handler'], category: 'Conditional' },
    { prompt: 'api call, check response, save or alert', nodes: ['manual_trigger', 'http_request', 'if_else', 'database_write', 'slack_message'], category: 'Conditional' },
    { prompt: 'schedule task, check condition, execute action', nodes: ['schedule', 'if_else', 'http_request', 'log_output'], category: 'Conditional' },
    { prompt: 'read sheets, filter data, send if matches', nodes: ['manual_trigger', 'google_sheets', 'if_else', 'slack_message'], category: 'Conditional' },
    { prompt: 'form data, validate fields, save or notify error', nodes: ['form', 'if_else', 'google_sheets', 'slack_message'], category: 'Conditional' },
    { prompt: 'check database value, update or create new', nodes: ['manual_trigger', 'database_read', 'if_else', 'database_write'], category: 'Conditional' },
  ];

  // 51-60: Multi-Step Workflows
  const multiStep = [
    { prompt: 'read from sheets, process data, send to slack, save to database', nodes: ['manual_trigger', 'google_sheets', 'javascript', 'slack_message', 'database_write'], category: 'Multi-Step' },
    { prompt: 'form submission, validate, transform, save, notify', nodes: ['form', 'if_else', 'set_variable', 'google_sheets', 'slack_message'], category: 'Multi-Step' },
    { prompt: 'webhook receives data, process, save, respond', nodes: ['webhook', 'javascript', 'database_write', 'respond_to_webhook'], category: 'Multi-Step' },
    { prompt: 'schedule task, read data, format, send email', nodes: ['schedule', 'google_sheets', 'text_formatter', 'google_gmail'], category: 'Multi-Step' },
    { prompt: 'api call, transform response, save to sheets, notify team', nodes: ['manual_trigger', 'http_request', 'javascript', 'google_sheets', 'slack_message'], category: 'Multi-Step' },
    { prompt: 'read database, merge with sheets data, format, send', nodes: ['manual_trigger', 'database_read', 'google_sheets', 'merge_data', 'slack_message'], category: 'Multi-Step' },
    { prompt: 'form data, extract fields, validate, save, email confirmation', nodes: ['form', 'set_variable', 'if_else', 'google_sheets', 'google_gmail'], category: 'Multi-Step' },
    { prompt: 'webhook, parse data, check condition, save or notify', nodes: ['webhook', 'set_variable', 'if_else', 'database_write', 'slack_message'], category: 'Multi-Step' },
    { prompt: 'read sheets, calculate totals, format report, send email', nodes: ['schedule', 'google_sheets', 'javascript', 'text_formatter', 'google_gmail'], category: 'Multi-Step' },
    { prompt: 'api data, transform, validate, save, log result', nodes: ['manual_trigger', 'http_request', 'javascript', 'if_else', 'database_write', 'log_output'], category: 'Multi-Step' },
  ];

  // ===== COMPLEX WORKFLOWS (5+ nodes) =====
  
  // 61-70: AI-Enhanced Workflows
  const aiWorkflows = [
    { prompt: 'chat message, analyze with ai, search knowledge base, respond, save conversation', nodes: ['chat_trigger', 'ai_agent', 'database_read', 'ai_agent', 'database_write'], category: 'AI Agent' },
    { prompt: 'user query, classify intent with ai, route to appropriate action, respond', nodes: ['chat_trigger', 'ai_agent', 'if_else', 'database_read', 'ai_agent'], category: 'AI Agent' },
    { prompt: 'form data, ai analysis, generate response, save, notify', nodes: ['form', 'ai_agent', 'text_formatter', 'google_sheets', 'slack_message'], category: 'AI Agent' },
    { prompt: 'webhook data, ai sentiment analysis, route based on sentiment, notify', nodes: ['webhook', 'ai_agent', 'if_else', 'slack_message', 'google_gmail'], category: 'AI Agent' },
    { prompt: 'read data, ai summary generation, format, send report', nodes: ['schedule', 'google_sheets', 'ai_agent', 'text_formatter', 'google_gmail'], category: 'AI Agent' },
    { prompt: 'user message, ai intent classification, fetch relevant data, generate ai response', nodes: ['chat_trigger', 'ai_agent', 'database_read', 'ai_agent'], category: 'AI Agent' },
    { prompt: 'api data, ai content generation, format, save, notify', nodes: ['manual_trigger', 'http_request', 'ai_agent', 'text_formatter', 'google_sheets', 'slack_message'], category: 'AI Agent' },
    { prompt: 'form submission, ai validation, process, save, ai-generated confirmation', nodes: ['form', 'ai_agent', 'if_else', 'google_sheets', 'ai_agent', 'google_gmail'], category: 'AI Agent' },
    { prompt: 'read documents, ai extraction, transform, save structured data', nodes: ['manual_trigger', 'google_doc', 'ai_agent', 'set_variable', 'database_write'], category: 'AI Agent' },
    { prompt: 'chat conversation, ai understanding, database lookup, ai response, save context', nodes: ['chat_trigger', 'ai_agent', 'database_read', 'ai_agent', 'database_write'], category: 'AI Agent' },
  ];

  // 71-80: Error Handling & Advanced Patterns
  const advancedPatterns = [
    { prompt: 'api call with error handling, retry on failure, notify on success', nodes: ['manual_trigger', 'http_request', 'error_handler', 'if_else', 'slack_message'], category: 'Error Handling' },
    { prompt: 'read database, validate data, handle errors, save or notify', nodes: ['manual_trigger', 'database_read', 'if_else', 'error_handler', 'database_write', 'slack_message'], category: 'Error Handling' },
    { prompt: 'webhook, validate payload, process, handle errors, respond', nodes: ['webhook', 'if_else', 'javascript', 'error_handler', 'respond_to_webhook'], category: 'Error Handling' },
    { prompt: 'form data, validate, process, wait, save, notify', nodes: ['form', 'if_else', 'set_variable', 'wait', 'google_sheets', 'slack_message'], category: 'Error Handling' },
    { prompt: 'api call, check response, handle timeout, retry, save result', nodes: ['manual_trigger', 'http_request', 'error_handler', 'wait', 'database_write'], category: 'Error Handling' },
    { prompt: 'read sheets, process with error handling, format, send or log error', nodes: ['schedule', 'google_sheets', 'javascript', 'error_handler', 'text_formatter', 'slack_message'], category: 'Error Handling' },
    { prompt: 'multiple api calls, merge responses, handle errors, save', nodes: ['manual_trigger', 'http_request', 'http_request', 'merge_data', 'error_handler', 'database_write'], category: 'Error Handling' },
    { prompt: 'webhook, validate, process, catch errors, notify on failure', nodes: ['webhook', 'if_else', 'javascript', 'error_handler', 'slack_message'], category: 'Error Handling' },
    { prompt: 'form submission, validate all fields, process, handle validation errors', nodes: ['form', 'set_variable', 'if_else', 'error_handler', 'google_sheets', 'respond_to_webhook'], category: 'Error Handling' },
    { prompt: 'read database, transform, validate, handle errors, save or alert', nodes: ['manual_trigger', 'database_read', 'javascript', 'if_else', 'error_handler', 'database_write', 'slack_message'], category: 'Error Handling' },
  ];

  // 81-90: Scheduled & Automated
  const scheduled = [
    { prompt: 'daily read sheets, calculate metrics, send email report', nodes: ['schedule', 'google_sheets', 'javascript', 'text_formatter', 'google_gmail'], category: 'Scheduled' },
    { prompt: 'hourly check api, compare data, notify if changed', nodes: ['interval', 'http_request', 'if_else', 'slack_message'], category: 'Scheduled' },
    { prompt: 'weekly database backup, compress, save to sheets', nodes: ['schedule', 'database_read', 'javascript', 'google_sheets'], category: 'Scheduled' },
    { prompt: 'daily aggregate data, format report, send to slack', nodes: ['schedule', 'database_read', 'javascript', 'text_formatter', 'slack_message'], category: 'Scheduled' },
    { prompt: 'every 30 minutes check status, notify if down', nodes: ['interval', 'http_request', 'if_else', 'slack_message'], category: 'Scheduled' },
    { prompt: 'monthly read sheets, generate summary, email report', nodes: ['schedule', 'google_sheets', 'javascript', 'text_formatter', 'google_gmail'], category: 'Scheduled' },
    { prompt: 'daily sync data from api to database', nodes: ['schedule', 'http_request', 'javascript', 'database_write'], category: 'Scheduled' },
    { prompt: 'hourly monitor api endpoint, log status, alert on error', nodes: ['interval', 'http_request', 'error_handler', 'log_output', 'slack_message'], category: 'Scheduled' },
    { prompt: 'weekly read database, aggregate, save to sheets', nodes: ['schedule', 'database_read', 'javascript', 'google_sheets'], category: 'Scheduled' },
    { prompt: 'daily check multiple apis, merge data, save report', nodes: ['schedule', 'http_request', 'http_request', 'merge_data', 'google_sheets'], category: 'Scheduled' },
  ];

  // 91-100: Complex Multi-Service Integration
  const complexIntegration = [
    { prompt: 'form submission, save to sheets, send slack notification, email confirmation, log result', nodes: ['form', 'google_sheets', 'slack_message', 'google_gmail', 'log_output'], category: 'Integration' },
    { prompt: 'webhook receives data, validate, save to database, update sheets, notify team', nodes: ['webhook', 'if_else', 'database_write', 'google_sheets', 'slack_message'], category: 'Integration' },
    { prompt: 'read sheets, call api with data, process response, save to database, notify', nodes: ['manual_trigger', 'google_sheets', 'http_request', 'javascript', 'database_write', 'slack_message'], category: 'Integration' },
    { prompt: 'schedule task, read database, transform, save to sheets, send email, log', nodes: ['schedule', 'database_read', 'javascript', 'google_sheets', 'google_gmail', 'log_output'], category: 'Integration' },
    { prompt: 'form data, validate, save to sheets, create doc, send notifications', nodes: ['form', 'if_else', 'google_sheets', 'google_doc', 'slack_message', 'google_gmail'], category: 'Integration' },
    { prompt: 'api webhook, parse data, check conditions, save to multiple places, notify', nodes: ['webhook', 'set_variable', 'if_else', 'database_write', 'google_sheets', 'slack_message'], category: 'Integration' },
    { prompt: 'read from multiple sources, merge data, transform, save, notify', nodes: ['manual_trigger', 'database_read', 'google_sheets', 'merge_data', 'javascript', 'database_write', 'slack_message'], category: 'Integration' },
    { prompt: 'chat message, ai analysis, database lookup, ai response, save conversation, notify', nodes: ['chat_trigger', 'ai_agent', 'database_read', 'ai_agent', 'database_write', 'slack_message'], category: 'Integration' },
    { prompt: 'form submission, validate all fields, save to sheets and database, send multiple notifications', nodes: ['form', 'set_variable', 'if_else', 'google_sheets', 'database_write', 'slack_message', 'google_gmail'], category: 'Integration' },
    { prompt: 'webhook data, validate, transform, save to database, update sheets, create doc, notify team', nodes: ['webhook', 'if_else', 'javascript', 'database_write', 'google_sheets', 'google_doc', 'slack_message'], category: 'Integration' },
  ];

  // Combine all examples
  const allExamples = [
    ...simpleNotifications,
    ...simpleDataOps,
    ...simpleHttp,
    ...dataTransform,
    ...conditionalLogic,
    ...multiStep,
    ...aiWorkflows,
    ...advancedPatterns,
    ...scheduled,
    ...complexIntegration,
  ];

  // Generate full training examples with structure
  allExamples.forEach((example, index) => {
    const workflow = {
      id: `workflow_${id++}`,
      category: example.category,
      goal: example.prompt,
      phase1: {
        step1: {
          userPrompt: example.prompt,
        },
        step3: {
          systemPrompt: generateSystemPrompt(example.prompt),
          wordCount: generateSystemPrompt(example.prompt).split(' ').length,
          temperature: 0.2,
        },
        step4: {
          requirements: generateRequirements(example.prompt, example.nodes),
        },
        step5: {
          structure: {
            flowType: determineFlowType(example.nodes),
            description: generateFlowDescription(example.nodes),
          },
          selectedNodes: example.nodes,
          nodeConfigurations: generateNodeConfigs(example.nodes),
          connections: generateConnections(example.nodes),
        },
      },
      phase2: {
        executionInitialization: {
          executionId: 'created',
          iterationCount: 0,
        },
        executionLoop: generateExecutionLoop(example.nodes),
        executionFinalization: {
          totalIterations: example.nodes.length,
          goalAchieved: true,
        },
      },
    };
    examples.push(workflow);
  });

  return examples;
}

// Helper functions
function generateSystemPrompt(userPrompt) {
  const lower = userPrompt.toLowerCase();
  if (lower.includes('notification') || lower.includes('send') || lower.includes('notify')) {
    return 'Send notifications to specified channels based on triggers and conditions.';
  }
  if (lower.includes('save') || lower.includes('store') || lower.includes('write')) {
    return 'Save and store data to specified destinations like databases or spreadsheets.';
  }
  if (lower.includes('read') || lower.includes('get') || lower.includes('fetch')) {
    return 'Read and retrieve data from specified sources like databases or APIs.';
  }
  if (lower.includes('transform') || lower.includes('format') || lower.includes('process')) {
    return 'Transform and process data through various operations and formatting.';
  }
  if (lower.includes('ai') || lower.includes('agent') || lower.includes('analyze')) {
    return 'Use AI agents to analyze, understand, and generate responses from data.';
  }
  return 'Automate workflow processes based on triggers and conditions.';
}

function generateRequirements(prompt, nodes) {
  const platforms = [];
  const credentials = [];
  
  if (nodes.includes('slack_message')) platforms.push('Slack');
  if (nodes.includes('google_gmail') || nodes.includes('email')) platforms.push('Gmail');
  if (nodes.includes('google_sheets')) platforms.push('Google Sheets');
  if (nodes.includes('google_doc')) platforms.push('Google Docs');
  if (nodes.includes('database_read') || nodes.includes('database_write')) platforms.push('Database');
  if (nodes.includes('webhook')) platforms.push('Webhook');
  
  if (nodes.includes('slack_message')) credentials.push('SLACK_WEBHOOK_URL');
  if (nodes.includes('discord')) credentials.push('DISCORD_WEBHOOK_URL');
  if (nodes.includes('google_gmail') || nodes.includes('email')) credentials.push('GMAIL_OAUTH');
  if (nodes.includes('database_read') || nodes.includes('database_write')) credentials.push('DATABASE_CONNECTION_STRING');
  
  return {
    primaryGoal: prompt,
    platforms: platforms.length > 0 ? platforms : undefined,
    credentialsRequired: credentials.length > 0 ? credentials : undefined,
    complexityLevel: nodes.length <= 3 ? 'Simple' : nodes.length <= 5 ? 'Medium' : 'High',
  };
}

function determineFlowType(nodes) {
  if (nodes.includes('if_else') || nodes.includes('switch')) return 'Conditional branching';
  if (nodes.includes('ai_agent')) return 'AI-enhanced workflow';
  if (nodes.length <= 3) return 'Simple linear flow';
  return 'Multi-step sequential flow';
}

function generateFlowDescription(nodes) {
  const descriptions = nodes.map((node, idx) => {
    if (idx === 0) return `Trigger: ${node}`;
    return `Step ${idx}: ${node}`;
  });
  return descriptions.join(' → ');
}

function generateNodeConfigs(nodes) {
  const configs = {};
  nodes.forEach(node => {
    if (node === 'slack_message') {
      configs[node] = { webhookUrl: '{{SLACK_WEBHOOK_URL}}', channel: '#general', message: 'Notification message' };
    } else if (node === 'google_sheets') {
      configs[node] = { spreadsheetId: '{{SPREADSHEET_ID}}', range: 'A1:Z100' };
    } else if (node === 'google_gmail') {
      configs[node] = { to: '{{EMAIL_TO}}', subject: 'Notification', body: 'Email content' };
    } else if (node === 'http_request') {
      configs[node] = { url: '{{API_URL}}', method: 'GET' };
    } else if (node === 'if_else') {
      configs[node] = { condition: '{{condition}}' };
    } else if (node === 'database_read') {
      configs[node] = { query: 'SELECT * FROM table' };
    } else if (node === 'database_write') {
      configs[node] = { table: 'table_name', data: '{{data}}' };
    } else {
      configs[node] = {};
    }
  });
  return configs;
}

function generateConnections(nodes) {
  const connections = [];
  for (let i = 0; i < nodes.length - 1; i++) {
    const source = i === 0 ? 'trigger' : nodes[i];
    const target = nodes[i + 1];
    connections.push(`${source} → ${target}`);
  }
  return connections;
}

function generateExecutionLoop(nodes) {
  return nodes.slice(1).map((node, idx) => ({
    iteration: idx + 1,
    execution: `Executing ${node} node`,
    stateUpdated: `State updated after ${node}`,
  }));
}

// Generate and save
const examples = generateTrainingExamples();
const dataset = {
  version: '2.0',
  description: 'Comprehensive AI Workflow Agent Training Dataset - 100 diverse workflow examples covering all node types and patterns',
  totalWorkflows: examples.length,
  workflows: examples,
};

const outputPath = path.join(__dirname, '../data/workflow_training_dataset_100.json');
fs.writeFileSync(outputPath, JSON.stringify(dataset, null, 2), 'utf-8');
console.log(`✅ Generated ${examples.length} training examples`);
console.log(`✅ Saved to: ${outputPath}`);
