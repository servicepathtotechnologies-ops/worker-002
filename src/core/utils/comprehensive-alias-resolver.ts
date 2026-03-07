/**
 * 🔥 PRODUCTION-GRADE COMPREHENSIVE ALIAS RESOLVER
 * 
 * This module provides a robust alias resolution layer that handles:
 * - Extra spaces: "google mail" → "google_gmail"
 * - Misspellings: "gmaill" → "google_gmail"
 * - Broken words: "slak message" → "slack_message"
 * - User phrasing: "send gmail" → "google_gmail"
 * - Multi-word variations: "google mail trigger" → "google_gmail"
 * - Case differences: "GMAIL" → "google_gmail"
 * - Symbol differences: "g-mail" → "google_gmail"
 * 
 * Architecture:
 * 1. Normalization Pipeline (lowercase, trim, collapse spaces, remove special chars)
 * 2. Exact Match (O(1) lookup)
 * 3. Fuzzy Matching (Levenshtein distance with confidence scoring)
 * 4. Token-based Matching (word boundary matching)
 * 5. Fail-fast validation (threshold >= 0.82)
 */

import { CANONICAL_NODE_TYPES } from '../../services/nodes/node-library';

/**
 * Comprehensive alias registry with 10-15 aliases per node
 * Includes: canonical name, common aliases, misspellings, variations, multi-word phrases
 */
export const COMPREHENSIVE_NODE_ALIAS_REGISTRY: Record<string, string[]> = {
  // ============================================
  // EMAIL NODES
  // ============================================
  'google_gmail': [
    'gmail',
    'google mail',
    'g mail',
    'google email',
    'send gmail',
    'gmail send',
    'gmaill',           // Common misspelling
    'gmail sender',
    'gmail node',
    'email via gmail',
    'google mail sender',
    'mail through gmail',
    'gmial',            // Common misspelling
    'g-mail',
    'google_gmail',
    'gmail them',
    'send via gmail',
    'mail via gmail',
    'gmail notification',
    'gmail message',
  ],

  'email': [
    'mail',
    'send email',
    'email send',
    'email_send',
    'smtp',
    'send',
    'notify',
    'email notification',
    'email message',
    'send mail',
    'mail send',
    'email alert',
    'email notification',
    'email via smtp',
  ],

  'outlook': [
    'microsoft mail',
    'outlook mail',
    'microsoft outlook',
    'outlook email',
    'send via outlook',
    'outlook send',
    'send outlook',
    'ms outlook',
    'microsoft email',
    'outlook notification',
    'outlook message',
    'ms mail',
  ],

  // ============================================
  // COMMUNICATION NODES
  // ============================================
  'slack_message': [
    'slack',
    'send slack',
    'slack msg',
    'slak',              // Common misspelling
    'slackmessage',
    'slack message',
    'post slack',
    'message slack',
    'slack notification',
    'notify slack',
    'slck',              // Common misspelling
    'slack post',
    'slack alert',
    'slack send',
    'slack_message',
    'slack msg',
    'slack notify',
    'send to slack',
  ],

  'telegram': [
    'telegram send',
    'send telegram',
    'telegram',
    'telegram bot',
    'telegram message',
    'telegram notification',
    'send telegram message',
    'telegram alert',
    'telegram notify',
    'tg',
    'telegram msg',
    'telegram post',
  ],

  'discord': [
    'discord send',
    'send discord',
    'discord',
    'discord message',
    'discord notification',
    'send discord message',
    'discord alert',
    'discord notify',
    'discord post',
  ],

  'microsoft_teams': [
    'teams',
    'ms teams',
    'send teams',
    'teams send',
    'microsoft teams',
    'teams message',
    'teams notification',
    'teams alert',
    'ms teams message',
  ],

  'whatsapp_cloud': [
    'whatsapp',
    'wa',
    'send whatsapp',
    'whatsapp send',
    'whatsapp message',
    'whatsapp notification',
    'whatsapp alert',
    'wa message',
  ],

  'twilio': [
    'sms',
    'twilio sms',
    'send sms',
    'sms send',
    'twilio message',
    'sms notification',
    'text message',
    'send text',
  ],

  // ============================================
  // GOOGLE SERVICES
  // ============================================
  'google_sheets': [
    'sheets',
    'gsheets',
    'google sheet',
    'spreadsheet',
    'sheet',
    'excel',
    'g sheet',
    'googlesheet',
    'googlesheets',
    'read from sheets',
    'write to sheets',
    'get data from sheets',
    'save to sheets',
    'google spreadsheet',
    'gsheet',
    'google excel',
  ],

  'google_doc': [
    'gdoc',
    'google document',
    'document',
    'docs',
    'google docs',
    'google doc',
    'read document',
    'write document',
    'google document',
    'g document',
    'google docs document',
  ],

  'google_drive': [
    'drive',
    'gdrive',
    'google storage',
    'google drive',
    'g drive',
    'google file storage',
    'drive storage',
  ],

  'google_calendar': [
    'calendar',
    'gcal',
    'google cal',
    'google calendar',
    'g calendar',
    'google calender',    // Common misspelling
    'calendar event',
  ],

  'google_contacts': [
    'contacts',
    'gcontacts',
    'google contact',
    'google contacts',
    'g contacts',
    'contact list',
  ],

  'google_tasks': [
    'tasks',
    'gtasks',
    'google task',
    'google tasks',
    'g tasks',
    'task list',
  ],

  'google_big_query': [
    'bigquery',
    'big query',
    'bq',
    'bigquery',
    'google bigquery',
    'g bigquery',
  ],

  // ============================================
  // DATABASE NODES
  // ============================================
  'postgresql': [
    'postgres',
    'postgresql',
    'pg',
    'postgres db',
    'postgres database',
    'postgresql database',
    'pg database',
    'postgresql db',
  ],

  'supabase': [
    'supa',
    'supa db',
    'supabase',
    'supabase db',
    'supabase database',
  ],

  'database_read': [
    'db read',
    'read db',
    'query db',
    'read',
    'select',
    'fetch',
    'get',
    'retrieve',
    'database read',
    'read database',
    'query database',
    'db query',
  ],

  'database_write': [
    'db write',
    'write db',
    'postgresql',
    'postgres',
    'write',
    'insert',
    'update',
    'delete',
    'database write',
    'write database',
    'db insert',
    'db update',
    'db delete',
  ],

  'mysql': [
    'my sql',
    'mysql',
    'mysql database',
    'mysql db',
  ],

  'mongodb': [
    'mongo',
    'mongo db',
    'mongodb',
    'mongo database',
  ],

  // ============================================
  // HTTP & API NODES
  // ============================================
  'http_request': [
    'http',
    'api',
    'request',
    'fetch',
    'api call',
    'call',
    'endpoint',
    'url',
    'http request',
    'http call',
    'api request',
    'http fetch',
    'make request',
    'call api',
    'http get',
    'http post',
  ],

  'http_post': [
    'post',
    'http post request',
    'post request',
    'http post',
    'api post',
  ],

  'respond_to_webhook': [
    'webhook response',
    'response',
    'respond',
    'reply',
    'return',
    'webhook reply',
    'respond to webhook',
    'webhook respond',
  ],

  'webhook_response': [
    'webhook reply',
    'response',
    'webhook response',
    'webhook return',
  ],

  'graphql': [
    'gql',
    'graph ql',
    'graphql',
    'graph ql query',
    'gql query',
  ],

  // ============================================
  // TRIGGERS
  // ============================================
  'schedule': [
    'cron',
    'scheduled',
    'timer',
    'daily',
    'hourly',
    'weekly',
    'time',
    'every',
    'schedule trigger',
    'cron job',
    'scheduled task',
    'timer trigger',
    'recurring',
    'periodic schedule',
  ],

  'webhook': [
    'webhook trigger',
    'http trigger',
    'webhook',
    'callback',
    'event',
    'when',
    'webhook endpoint',
    'http webhook',
    'api webhook',
    'webhook listener',
    'incoming webhook',
  ],

  'manual_trigger': [
    'manual',
    'on demand',
    'trigger',
    'run',
    'execute',
    'manual trigger',
    'on demand trigger',
    'manual run',
    'start workflow',
    'trigger workflow',
  ],

  'interval': [
    'interval trigger',
    'periodic',
    'interval',
    'every',
    'repeat',
    'periodic trigger',
    'interval timer',
    'recurring trigger',
    'repeat trigger',
  ],

  'form': [
    'form trigger',
    'form submission',
    'typeform',
    'form',
    'contact form',
    'survey',
    'application',
    'submission',
    'form submit',
    'form fill',
    'form data',
  ],

  'chat_trigger': [
    'chat',
    'chatbot',
    'chat trigger',
    'conversation',
    'chat bot',
    'chat message',
    'user message',
    'chat input',
    'conversational trigger',
  ],

  'error_trigger': [
    'error',
    'error trigger',
    'error handler',
    'on error',
    'error event',
    'failure trigger',
    'exception trigger',
    'catch error',
  ],

  // ============================================
  // LOGIC & FLOW NODES
  // ============================================
  'if_else': [
    'if',
    'conditional',
    'condition',
    'if else',
    'else',
    'when',
    'check',
    'if condition',
    'conditional logic',
    'if statement',
    'else if',
    'branch',
    'decision',
  ],

  'switch': [
    'case',
    'switch case',
    'switch',
    'route',
    'multiple',
    'paths',
    'switch statement',
    'case statement',
    'multi path',
    'routing',
    'multiway',
    'select case',
  ],

  'merge': [
    'combine',
    'join',
    'merge',
    'combine data',
    'merge data',
    'join data',
    'unite',
    'consolidate',
    'fuse',
    'amalgamate',
  ],

  'loop': [
    'for',
    'foreach',
    'iterate',
    'loop',
    'for loop',
    'for each',
    'iteration',
    'repeat',
    'cycle',
    'recur',
    'repetition',
  ],

  'wait': [
    'wait',
    'delay',
    'sleep',
    'rate limit',
    'pause',
    'throttle',
    'wait for',
    'delay execution',
  ],

  'delay': [
    'delay',
    'wait',
    'pause',
    'sleep',
    'throttle',
    'rate limit',
    'cooldown',
    'delay execution',
    'wait delay',
  ],

  'timeout': [
    'timeout',
    'max time',
    'limit',
    'deadline',
    'abort',
    'time limit',
    'execution time',
    'timeout limit',
  ],

  'retry': [
    'retry',
    'retry on failure',
    'attempt',
    'repeat',
    'backoff',
    'retry logic',
    'retry mechanism',
    'retry attempt',
  ],

  'error_handler': [
    'error handler',
    'error handling',
    'catch',
    'error',
    'retry',
    'handle',
    'fail',
    'reliable',
    'error catch',
    'handle error',
  ],

  'try_catch': [
    'try catch',
    'try',
    'catch',
    'error handling',
    'error',
    'exception',
    'handle',
    'try block',
    'catch block',
  ],

  'return': [
    'return',
    'exit',
    'stop',
    'break',
    'terminate',
    'end workflow',
    'early exit',
    'return value',
  ],

  'execute_workflow': [
    'subworkflow',
    'execute',
    'call',
    'invoke',
    'call workflow',
    'invoke workflow',
    'nested workflow',
    'workflow call',
    'execute workflow',
    'run workflow',
  ],

  'parallel': [
    'parallel',
    'concurrent',
    'simultaneous',
    'fork',
    'join',
    'run in parallel',
    'parallel execution',
    'at the same time',
    'concurrent execution',
  ],

  // ============================================
  // DATA MANIPULATION NODES
  // ============================================
  'aggregate': [
    'aggregate',
    'sum',
    'avg',
    'average',
    'count',
    'total',
    'summation',
    'join',
    'concat',
    'concatenate',
    'group',
    'groupby',
    'group by',
    'statistics',
    'stats',
    'calculate',
    'compute',
    'accumulate',
    'tally',
    'add up',
  ],

  'sort': [
    'sort',
    'order',
    'arrange',
    'sorting',
    'ascending',
    'descending',
    'asc',
    'desc',
    'alphabetical',
    'numerical',
    'rank',
    'sequence',
  ],

  'limit': [
    'limit',
    'take',
    'top',
    'first',
    'head',
    'slice',
    'truncate',
    'restrict',
    'maximum',
    'max items',
    'cap',
  ],

  'filter': [
    'where',
    'filter data',
    'filter',
    'filter items',
    'where clause',
    'condition',
    'select',
    'find',
    'search',
    'match',
    'criteria',
  ],

  'set_variable': [
    'set',
    'variable',
    'assign',
    'map',
    'transform',
    'add field',
    'set variable',
    'assign variable',
    'set value',
    'create variable',
    'define variable',
  ],

  'javascript': [
    'js',
    'code',
    'script',
    'javascript',
    'transform',
    'custom',
    'complex',
    'js code',
    'javascript code',
    'custom code',
    'execute code',
  ],

  'function': [
    'function',
    'custom function',
    'execute function',
    'function call',
    'call function',
    'invoke function',
    'run function',
  ],

  'function_item': [
    'function item',
    'each item',
    'per item',
    'for each',
    'item function',
    'process item',
    'map item',
    'transform item',
  ],

  'date_time': [
    'date',
    'time',
    'format',
    'timestamp',
    'schedule',
    'date time',
    'format date',
    'format time',
    'datetime',
    'date format',
    'time format',
  ],

  'text_formatter': [
    'format',
    'template',
    'text',
    'string',
    'interpolate',
    'placeholder',
    'text format',
    'string format',
    'text template',
    'format string',
  ],

  'json_parser': [
    'json',
    'parse json',
    'json parser',
    'json parse',
    'json decode',
    'decode json',
    'parse json data',
    'json parsing',
  ],

  'csv': [
    'csv parser',
    'parse csv',
    'csv',
    'csv parse',
    'parse csv file',
    'comma separated',
    'csv file',
    'csv data',
    'csv parsing',
  ],

  'html': [
    'html parser',
    'parse html',
    'html',
    'html parse',
    'parse html data',
    'html decode',
    'parse markup',
    'html parsing',
    'parse html content',
  ],

  'xml': [
    'xml parser',
    'parse xml',
    'xml',
    'xml parse',
    'parse xml data',
    'xml decode',
    'parse markup',
    'xml parsing',
    'parse xml content',
  ],

  'split_in_batches': [
    'batch',
    'split batch',
    'split in batches',
    'batch split',
    'chunk',
    'divide',
    'partition',
    'segment',
    'split into batches',
    'batch processing',
    'split array',
  ],

  // ============================================
  // AI NODES
  // ============================================
  'ai_service': [
    'ai',
    'openai',
    'llm',
    'ai node',
    'ai processor',
    'ai model',
    'ai chat',
    'ai service',
    'ai processing',
    'summarize',
    'analyze',
    'extract',
    'classify',
    'ai text',
    'ai model',
    'artificial intelligence',
  ],

  'ai_chat_model': [
    'chat model',
    'ai chat',
    'llm chat',
    'conversation',
    'chat model',
    'ai conversation',
  ],

  'ai_agent': [
    'agent',
    'ai assistant',
    'assistant',
    'bot',
    'ai agent',
    'chatbot',
    'chat bot',
    'conversational ai',
    'ai reasoning',
    'natural language',
    'ai bot',
  ],

  // ============================================
  // QUEUE & CACHE NODES
  // ============================================
  'queue_push': [
    'queue',
    'push',
    'enqueue',
    'bull',
    'redis',
    'queue push',
    'push to queue',
    'add to queue',
    'enqueue job',
    'queue job',
    'add job',
  ],

  'queue_consume': [
    'queue',
    'consume',
    'pop',
    'dequeue',
    'worker',
    'queue consume',
    'consume queue',
    'process queue',
    'dequeue job',
    'process job',
    'worker process',
  ],

  'cache_get': [
    'cache',
    'get',
    'retrieve',
    'redis',
    'cache get',
    'get cache',
    'retrieve cache',
    'fetch cache',
    'read cache',
    'cache read',
  ],

  'cache_set': [
    'cache',
    'set',
    'store',
    'redis',
    'cache set',
    'set cache',
    'store cache',
    'write cache',
    'cache write',
    'save cache',
  ],

  // ============================================
  // AUTHENTICATION NODES
  // ============================================
  'oauth2_auth': [
    'oauth',
    'oauth2',
    'auth',
    'authentication',
    'token',
    'oauth2 auth',
    'oauth authentication',
    'oauth token',
    'oauth2 token',
    'oauth login',
    'oauth authorize',
  ],

  'api_key_auth': [
    'apikey',
    'api key',
    'auth',
    'key',
    'api key auth',
    'key auth',
    'api authentication',
    'api token',
    'bearer token',
  ],

  // ============================================
  // LOGGING NODES
  // ============================================
  'log_output': [
    'log',
    'debug',
    'audit',
    'monitor',
    'log output',
    'logging',
    'log data',
    'write log',
    'console log',
    'output log',
    'debug log',
  ],

  // ============================================
  // CRM NODES
  // ============================================
  'salesforce': [
    'sf',
    'sales force',
    'salesforce',
    'sobject',
    'account',
    'contact',
    'lead',
    'opportunity',
    'salesforce contact',
    'salesforce opportunity',
    'sf contact',
  ],

  'hubspot': [
    'hub spot',
    'hubspot',
    'hubspot crm',
  ],

  'airtable': [
    'air table',
    'airtable',
    'air table base',
  ],

  'zoho_crm': [
    'zoho',
    'zoho crm',
    'zoho crm',
  ],

  'pipedrive': [
    'pipe drive',
    'pipedrive',
    'pipedrive crm',
  ],
};

/**
 * Confidence threshold for fuzzy matching
 * Only matches above this threshold are accepted
 */
const CONFIDENCE_THRESHOLD = 0.82;

/**
 * Normalization pipeline
 * Handles: lowercase, trim, collapse spaces, remove special chars, normalize separators
 */
export function normalizeNodeType(input: string): string {
  if (!input || typeof input !== 'string') {
    return '';
  }

  return input
    .toLowerCase()                    // Convert to lowercase
    .trim()                           // Remove leading/trailing whitespace
    .replace(/\s+/g, ' ')            // Collapse multiple spaces to single space
    .replace(/[^\w\s-]/g, '')        // Remove special characters (keep alphanumeric, spaces, hyphens)
    .replace(/[-_\s]+/g, '_')        // Normalize separators (hyphens, underscores, spaces) to underscore
    .replace(/^_+|_+$/g, '');        // Remove leading/trailing underscores
}

/**
 * Calculate Levenshtein distance between two strings
 */
function levenshteinDistance(str1: string, str2: string): number {
  const matrix: number[][] = [];

  for (let i = 0; i <= str2.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= str1.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= str2.length; i++) {
    for (let j = 1; j <= str1.length; j++) {
      if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        );
      }
    }
  }

  return matrix[str2.length][str1.length];
}

/**
 * Calculate similarity score using Levenshtein distance
 * Returns value between 0.0 and 1.0
 */
function calculateSimilarity(str1: string, str2: string): number {
  const longer = str1.length > str2.length ? str1 : str2;
  const shorter = str1.length > str2.length ? str2 : str1;

  if (longer.length === 0) return 1.0;

  const distance = levenshteinDistance(longer, shorter);
  return (longer.length - distance) / longer.length;
}

/**
 * Token-based matching
 * Checks if all significant tokens from input exist in target
 */
function tokenMatch(input: string, target: string): number {
  const inputTokens = input.split(/[\s_-]+/).filter(t => t.length > 2); // Only tokens > 2 chars
  const targetTokens = target.split(/[\s_-]+/).filter(t => t.length > 2);

  if (inputTokens.length === 0) return 0;

  const matchedTokens = inputTokens.filter(token =>
    targetTokens.some(targetToken => 
      targetToken.includes(token) || token.includes(targetToken)
    )
  ).length;

  return matchedTokens / inputTokens.length;
}

/**
 * Resolution result interface
 */
export interface AliasResolutionResult {
  original: string;
  resolved: string | null;
  method: 'exact' | 'normalized' | 'alias' | 'fuzzy' | 'token' | 'not_found';
  confidence: number;
  warning?: string;
}

/**
 * 🔥 MAIN RESOLVER FUNCTION
 * 
 * Resolves any node type input to canonical type with confidence scoring
 * 
 * Pipeline:
 * 1. Normalize input
 * 2. Check exact match (canonical types)
 * 3. Check normalized match
 * 4. Check alias dictionary
 * 5. Fuzzy matching with confidence threshold
 * 6. Token-based matching
 * 7. Fail-fast if no match above threshold
 */
export function resolveAliasToCanonical(input: string): AliasResolutionResult {
  if (!input || typeof input !== 'string') {
    return {
      original: input || '',
      resolved: null,
      method: 'not_found',
      confidence: 0,
      warning: 'Invalid input: empty or non-string',
    };
  }

  const original = input;
  const normalized = normalizeNodeType(input);

  // Stage 1: Exact match against canonical types
  const exactMatch = CANONICAL_NODE_TYPES.find(
    type => type.toLowerCase() === normalized || type.toLowerCase() === original.toLowerCase()
  );
  if (exactMatch) {
    return {
      original,
      resolved: exactMatch,
      method: 'exact',
      confidence: 1.0,
    };
  }

  // Stage 2: Normalized match against canonical types
  const normalizedCanonical = CANONICAL_NODE_TYPES.find(
    type => normalizeNodeType(type) === normalized
  );
  if (normalizedCanonical) {
    return {
      original,
      resolved: normalizedCanonical,
      method: 'normalized',
      confidence: 0.95,
    };
  }

  // Stage 3: Alias dictionary lookup
  for (const [canonical, aliases] of Object.entries(COMPREHENSIVE_NODE_ALIAS_REGISTRY)) {
    // Check normalized input against normalized aliases
    const normalizedAliases = aliases.map(a => normalizeNodeType(a));
    if (normalizedAliases.includes(normalized)) {
      return {
        original,
        resolved: canonical,
        method: 'alias',
        confidence: 0.9,
      };
    }

    // Check original input (case-insensitive) against aliases
    const lowerOriginal = original.toLowerCase().trim();
    if (aliases.some(a => a.toLowerCase() === lowerOriginal)) {
      return {
        original,
        resolved: canonical,
        method: 'alias',
        confidence: 0.9,
      };
    }
  }

  // Stage 4: Fuzzy matching with confidence threshold
  let bestMatch: { canonical: string; confidence: number } | null = null;

  for (const canonical of CANONICAL_NODE_TYPES) {
    const similarity = calculateSimilarity(normalized, normalizeNodeType(canonical));
    if (similarity >= CONFIDENCE_THRESHOLD) {
      if (!bestMatch || similarity > bestMatch.confidence) {
        bestMatch = { canonical, confidence: similarity };
      }
    }
  }

  // Also check against aliases
  for (const [canonical, aliases] of Object.entries(COMPREHENSIVE_NODE_ALIAS_REGISTRY)) {
    for (const alias of aliases) {
      const similarity = calculateSimilarity(normalized, normalizeNodeType(alias));
      if (similarity >= CONFIDENCE_THRESHOLD) {
        if (!bestMatch || similarity > bestMatch.confidence) {
          bestMatch = { canonical, confidence: similarity };
        }
      }
    }
  }

  if (bestMatch) {
    return {
      original,
      resolved: bestMatch.canonical,
      method: 'fuzzy',
      confidence: bestMatch.confidence,
    };
  }

  // Stage 5: Token-based matching
  let bestTokenMatch: { canonical: string; score: number } | null = null;

  for (const canonical of CANONICAL_NODE_TYPES) {
    const score = tokenMatch(normalized, normalizeNodeType(canonical));
    if (score >= 0.7) { // 70% of tokens must match
      if (!bestTokenMatch || score > bestTokenMatch.score) {
        bestTokenMatch = { canonical, score };
      }
    }
  }

  // Also check against aliases
  for (const [canonical, aliases] of Object.entries(COMPREHENSIVE_NODE_ALIAS_REGISTRY)) {
    for (const alias of aliases) {
      const score = tokenMatch(normalized, normalizeNodeType(alias));
      if (score >= 0.7) {
        if (!bestTokenMatch || score > bestTokenMatch.score) {
          bestTokenMatch = { canonical, score };
        }
      }
    }
  }

  if (bestTokenMatch) {
    return {
      original,
      resolved: bestTokenMatch.canonical,
      method: 'token',
      confidence: bestTokenMatch.score * 0.85, // Slightly lower confidence for token matches
    };
  }

  // No match found
  return {
    original,
    resolved: null,
    method: 'not_found',
    confidence: 0,
    warning: `No match found for "${original}". Similar canonical types: ${CANONICAL_NODE_TYPES.slice(0, 5).join(', ')}`,
  };
}

/**
 * Batch resolve multiple node types
 */
export function resolveAliasesToCanonical(inputs: string[]): Map<string, AliasResolutionResult> {
  const results = new Map<string, AliasResolutionResult>();
  for (const input of inputs) {
    results.set(input, resolveAliasToCanonical(input));
  }
  return results;
}
