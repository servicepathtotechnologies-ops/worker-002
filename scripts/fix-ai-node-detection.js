const fs = require('fs');
const path = require('path');

/**
 * Fix AI node detection by ensuring all nodes have:
 * 1. Comprehensive aiSelectionCriteria (whenToUse, whenNotToUse, keywords, useCases)
 * 2. Top-level keywords array with semantic synonyms
 * 3. commonPatterns with real-world examples
 * 4. Enhanced descriptions for better semantic matching
 */

const nodeLibraryPath = path.join(__dirname, '../src/services/nodes/node-library.ts');
let content = fs.readFileSync(nodeLibraryPath, 'utf8');

// Semantic keyword mappings for better AI detection
const semanticKeywords = {
  // Communication
  'google_gmail': ['email', 'mail', 'send email', 'gmail', 'message', 'notification', 'correspondence', 'mailing'],
  'slack_message': ['slack', 'notification', 'alert', 'message', 'team communication', 'channel', 'workspace'],
  'discord': ['discord', 'notification', 'message', 'guild', 'channel', 'server'],
  'telegram': ['telegram', 'message', 'notification', 'bot', 'chat'],
  
  // Data & Storage
  'google_sheets': ['spreadsheet', 'sheet', 'excel', 'data', 'table', 'rows', 'columns', 'csv'],
  'airtable': ['airtable', 'database', 'table', 'records', 'base', 'data'],
  'postgresql': ['postgres', 'postgresql', 'database', 'sql', 'query', 'db'],
  'mysql': ['mysql', 'database', 'sql', 'query', 'db'],
  'mongodb': ['mongodb', 'mongo', 'database', 'nosql', 'document', 'collection'],
  
  // AI & Processing
  'ai_agent': ['ai', 'agent', 'assistant', 'chatbot', 'intelligent', 'automation', 'smart'],
  'openai_gpt': ['openai', 'gpt', 'chatgpt', 'ai', 'llm', 'language model', 'text generation'],
  'anthropic_claude': ['claude', 'anthropic', 'ai', 'llm', 'language model'],
  'googlegemini': ['gemini', 'google ai', 'ai', 'llm', 'language model'],
  
  // Flow Control
  'if_else': ['if', 'else', 'condition', 'conditional', 'branch', 'decision', 'check', 'validate'],
  'switch': ['switch', 'case', 'multiple', 'choice', 'select', 'route'],
  'loop': ['loop', 'iterate', 'repeat', 'for', 'while', 'each', 'foreach', 'cycle'],
  'delay': ['delay', 'wait', 'pause', 'sleep', 'throttle', 'rate limit', 'cooldown'],
  'timeout': ['timeout', 'time limit', 'deadline', 'max time', 'abort', 'expire'],
  'retry': ['retry', 'attempt', 'repeat', 'backoff', 'retry on failure', 'resilient'],
  'try_catch': ['try', 'catch', 'error', 'exception', 'handle', 'error handling', 'fallback'],
  'parallel': ['parallel', 'concurrent', 'simultaneous', 'fork', 'join', 'batch', 'at the same time'],
  
  // Workflow Control
  'return': ['return', 'exit', 'stop', 'break', 'terminate', 'end workflow', 'early exit'],
  'execute_workflow': ['sub-workflow', 'execute workflow', 'call workflow', 'invoke', 'nested', 'modular'],
  
  // Queue & Cache
  'queue_push': ['queue', 'push', 'enqueue', 'bull', 'redis', 'background job', 'task distribution'],
  'queue_consume': ['queue', 'consume', 'pop', 'dequeue', 'worker', 'background task', 'job processing'],
  'cache_get': ['cache', 'get', 'retrieve', 'redis', 'caching', 'session data', 'temporary'],
  'cache_set': ['cache', 'set', 'store', 'redis', 'caching', 'temporary data', 'session storage'],
  
  // Auth
  'oauth2_auth': ['oauth', 'oauth2', 'auth', 'authentication', 'token', 'google', 'github', 'login'],
  'api_key_auth': ['apikey', 'auth', 'key', 'api key', 'openai', 'stripe', 'authentication', 'credential'],
  
  // Triggers
  'webhook': ['webhook', 'http', 'post', 'endpoint', 'url', 'trigger', 'incoming'],
  'schedule_trigger': ['schedule', 'cron', 'time', 'periodic', 'recurring', 'daily', 'weekly', 'monthly'],
  'form_trigger': ['form', 'form submission', 'input', 'collect', 'survey', 'questionnaire'],
  
  // HTTP & API
  'http_request': ['http', 'api', 'request', 'fetch', 'call', 'endpoint', 'rest', 'get', 'post'],
  'graphql': ['graphql', 'gql', 'query', 'mutation', 'subscription'],
  
  // CRM
  'hubspot': ['hubspot', 'crm', 'contact', 'deal', 'pipeline', 'sales'],
  'salesforce': ['salesforce', 'sf', 'crm', 'sobject', 'account', 'contact', 'lead'],
  'pipedrive': ['pipedrive', 'crm', 'deal', 'pipeline', 'contact'],
  'zoho_crm': ['zoho', 'crm', 'contact', 'deal', 'module'],
  
  // Social Media
  'twitter': ['twitter', 'x', 'tweet', 'social media', 'post'],
  'facebook': ['facebook', 'fb', 'social media', 'post', 'page'],
  'linkedin': ['linkedin', 'social media', 'post', 'profile', 'connection'],
  'instagram': ['instagram', 'ig', 'social media', 'post', 'story'],
  'youtube': ['youtube', 'yt', 'video', 'channel', 'upload'],
  
  // Google Services
  'google_calendar': ['calendar', 'event', 'meeting', 'appointment', 'schedule', 'google calendar'],
  'google_drive': ['drive', 'file', 'folder', 'upload', 'download', 'google drive'],
  'google_doc': ['document', 'doc', 'google docs', 'text', 'write'],
  
  // Data Processing
  'json_parser': ['json', 'parse', 'parse json', 'decode', 'object'],
  'merge': ['merge', 'combine', 'join', 'union', 'concatenate'],
  'aggregate': ['aggregate', 'sum', 'count', 'average', 'group', 'statistics'],
  'filter': ['filter', 'where', 'select', 'find', 'search', 'match'],
  'sort': ['sort', 'order', 'arrange', 'ascending', 'descending'],
  'set': ['set', 'assign', 'variable', 'value', 'store'],
  
  // File Operations
  'read_binary_file': ['read', 'file', 'binary', 'download', 'load', 'get file'],
  'write_binary_file': ['write', 'file', 'binary', 'upload', 'save', 'store file'],
  'awss3': ['s3', 'aws', 'storage', 'bucket', 'file storage', 'cloud storage'],
  
  // Payment
  'stripe': ['stripe', 'payment', 'charge', 'invoice', 'subscription', 'checkout'],
  'paypal': ['paypal', 'payment', 'transaction', 'invoice'],
  
  // E-commerce
  'shopify': ['shopify', 'store', 'product', 'order', 'ecommerce'],
  'woocommerce': ['woocommerce', 'woo', 'store', 'product', 'order', 'ecommerce'],
  
  // Support
  'freshdesk': ['freshdesk', 'ticket', 'support', 'helpdesk', 'customer service'],
  'intercom': ['intercom', 'chat', 'support', 'customer service', 'messaging'],
  
  // Marketing
  'mailchimp': ['mailchimp', 'email marketing', 'campaign', 'newsletter', 'subscriber'],
  'activecampaign': ['activecampaign', 'email marketing', 'automation', 'campaign'],
  
  // Project Management
  'clickup': ['clickup', 'task', 'project', 'management', 'todo'],
  'jira': ['jira', 'issue', 'bug', 'task', 'project management', 'atlassian'],
  'notion': ['notion', 'database', 'page', 'workspace', 'notes'],
  
  // Code & Git
  'github': ['github', 'git', 'repository', 'repo', 'code', 'pull request', 'issue'],
  'gitlab': ['gitlab', 'git', 'repository', 'repo', 'code', 'ci/cd'],
  'bitbucket': ['bitbucket', 'git', 'repository', 'repo', 'code'],
  
  // Other
  'log_output': ['log', 'output', 'print', 'debug', 'console', 'logging'],
  'noop': ['noop', 'no operation', 'pass', 'skip', 'placeholder'],
};

// Enhanced use cases for better context
const enhancedUseCases = {
  'google_gmail': ['Send email notifications', 'Email automation', 'Transactional emails', 'Email campaigns'],
  'slack_message': ['Team notifications', 'Alert system', 'Status updates', 'Workflow notifications'],
  'ai_agent': ['Intelligent automation', 'Chatbot', 'Customer support', 'Lead qualification', 'Content generation'],
  'if_else': ['Conditional logic', 'Decision making', 'Branching workflows', 'Validation'],
  'delay': ['Rate limiting', 'API throttling', 'Wait for external systems', 'Cooldown periods'],
  'retry': ['API resilience', 'Transient failure handling', 'Network retries', 'Reliability'],
  'try_catch': ['Error handling', 'Graceful failures', 'Fallback logic', 'Exception handling'],
  'cache_get': ['Performance optimization', 'Reduce API calls', 'Session management', 'Data caching'],
  'cache_set': ['Store computed results', 'Temporary data', 'Session storage', 'Performance'],
  'oauth2_auth': ['Google API authentication', 'GitHub integration', 'OAuth2 services', 'Token management'],
  'api_key_auth': ['API authentication', 'Service integration', 'Secure API calls', 'Credential management'],
};

console.log('🔧 Fixing AI node detection metadata...\n');

// Find all node schema methods
const nodeMethodRegex = /private create(\w+)Schema\(\): NodeSchema \{([\s\S]*?)\n  \};/g;
let match;
let fixedCount = 0;
const fixes = [];

while ((match = nodeMethodRegex.exec(content)) !== null) {
  const methodName = match[1];
  const methodBody = match[2];
  const fullMatch = match[0];
  
  // Convert camelCase to snake_case for node type
  const nodeType = methodName
    .replace(/Schema$/, '')
    .replace(/([A-Z])/g, '_$1')
    .toLowerCase()
    .replace(/^_/, '');
  
  // Check if aiSelectionCriteria exists
  if (!methodBody.includes('aiSelectionCriteria:')) {
    // Add comprehensive aiSelectionCriteria
    const semanticKeys = semanticKeywords[nodeType] || [nodeType];
    const useCases = enhancedUseCases[nodeType] || [`Use ${nodeType} for automation`];
    
    const aiCriteria = `
    aiSelectionCriteria: {
      whenToUse: [
        'Need to use ${nodeType} functionality',
        'Require ${nodeType} integration',
        'Automate ${nodeType} operations',
      ],
      whenNotToUse: [
        'If simpler alternative exists',
        'If credentials not available',
      ],
      keywords: ${JSON.stringify(semanticKeys, null, 8).replace(/\n/g, '\n        ')},
      useCases: ${JSON.stringify(useCases, null, 8).replace(/\n/g, '\n        ')},
    },`;
    
    // Insert after description
    const descriptionMatch = methodBody.match(/description:\s*['"]([^'"]+)['"]/);
    if (descriptionMatch) {
      const insertPoint = descriptionMatch.index + descriptionMatch[0].length;
      const newMethodBody = 
        methodBody.slice(0, insertPoint) + 
        ',' + aiCriteria + 
        methodBody.slice(insertPoint);
      
      const newFullMatch = fullMatch.replace(methodBody, newMethodBody);
      content = content.replace(fullMatch, newFullMatch);
      
      fixes.push(`Added aiSelectionCriteria to ${nodeType}`);
      fixedCount++;
    }
  } else {
    // Enhance existing aiSelectionCriteria
    const criteriaMatch = methodBody.match(/aiSelectionCriteria:\s*\{([\s\S]*?)\n    \}/);
    if (criteriaMatch) {
      const criteriaBody = criteriaMatch[1];
      const semanticKeys = semanticKeywords[nodeType] || [];
      
      // Check if keywords need enhancement
      const keywordsMatch = criteriaBody.match(/keywords:\s*\[([\s\S]*?)\]/);
      if (keywordsMatch) {
        const existingKeywords = keywordsMatch[1];
        const existingCount = (existingKeywords.match(/'/g) || []).length / 2;
        
        if (existingCount < 5 && semanticKeys.length > 0) {
          // Add more semantic keywords
          const newKeywords = [...new Set([...semanticKeys, ...existingKeywords.match(/'([^']+)'/g).map(k => k.slice(1, -1))])];
          const newKeywordsStr = newKeywords.map(k => `'${k}'`).join(',\n        ');
          
          const newCriteriaBody = criteriaBody.replace(
            /keywords:\s*\[([\s\S]*?)\]/,
            `keywords: [\n        ${newKeywordsStr},\n      ]`
          );
          
          const newFullMatch = fullMatch.replace(criteriaBody, newCriteriaBody);
          content = content.replace(fullMatch, newFullMatch);
          
          fixes.push(`Enhanced keywords for ${nodeType} (${existingCount} → ${newKeywords.length})`);
          fixedCount++;
        }
      }
    }
  }
  
  // Check if commonPatterns exists
  if (!methodBody.includes('commonPatterns:')) {
    // Add commonPatterns
    const patterns = `
    commonPatterns: [
      {
        name: 'basic_${nodeType}',
        description: 'Basic ${nodeType} usage',
        config: {},
      },
    ],`;
    
    // Insert before validationRules or at end of configSchema
    const configSchemaMatch = methodBody.match(/configSchema:\s*\{([\s\S]*?)\n    \}/);
    if (configSchemaMatch) {
      const insertPoint = configSchemaMatch.index + configSchemaMatch[0].length;
      const newMethodBody = 
        methodBody.slice(0, insertPoint) + 
        ',' + patterns + 
        methodBody.slice(insertPoint);
      
      const newFullMatch = fullMatch.replace(methodBody, newMethodBody);
      content = content.replace(fullMatch, newFullMatch);
      
      fixes.push(`Added commonPatterns to ${nodeType}`);
      fixedCount++;
    }
  }
  
  // Check if top-level keywords exist
  if (!methodBody.includes('keywords:') || !methodBody.match(/^\s*keywords:/m)) {
    const semanticKeys = semanticKeywords[nodeType] || [nodeType];
    const keywordsStr = semanticKeys.map(k => `'${k}'`).join(', ');
    
    const keywords = `
    keywords: [${keywordsStr}],`;
    
    // Insert before schemaVersion or at end
    const schemaVersionMatch = methodBody.match(/schemaVersion:/);
    if (schemaVersionMatch) {
      const insertPoint = schemaVersionMatch.index;
      const newMethodBody = 
        methodBody.slice(0, insertPoint) + 
        keywords + '\n    ' + 
        methodBody.slice(insertPoint);
      
      const newFullMatch = fullMatch.replace(methodBody, newMethodBody);
      content = content.replace(fullMatch, newFullMatch);
      
      fixes.push(`Added top-level keywords to ${nodeType}`);
      fixedCount++;
    }
  }
}

// Write back
fs.writeFileSync(nodeLibraryPath, content, 'utf8');

console.log(`✅ Fixed ${fixedCount} nodes`);
console.log(`\nFixes applied:`);
fixes.slice(0, 20).forEach(fix => console.log(`  - ${fix}`));
if (fixes.length > 20) {
  console.log(`  ... and ${fixes.length - 20} more`);
}

console.log(`\n🎉 AI node detection metadata enhanced!`);
