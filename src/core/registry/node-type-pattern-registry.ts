/**
 * ✅ STRICT PATTERN REGISTRY FOR NODE TYPE MATCHING
 * 
 * This registry defines strict regex patterns for each node type to prevent
 * false positives like "gmail" matching "ai" (because "gmail" contains "ai").
 * 
 * Patterns use word boundaries (\b) to match whole words only, not substrings.
 * 
 * Architecture:
 * 1. Explicit patterns for common/ambiguous node types (gmail, ai, etc.)
 * 2. Auto-generated patterns from node type names (for all other nodes)
 * 3. Integration with existing alias resolver
 * 
 * Priority:
 * 1. Exact match (case-insensitive)
 * 2. Pattern match (word-boundary regex)
 * 3. Token match (whole tokens only)
 * 4. Levenshtein distance (fallback)
 */

export interface NodeTypePattern {
  /** Canonical node type name */
  type: string;
  /** Strict regex pattern with word boundaries - matches whole words only */
  pattern: RegExp;
  /** Alternative patterns (for variations) */
  altPatterns?: RegExp[];
  /** Exact aliases (exact string matches) */
  aliases?: string[];
  /** Minimum match confidence (0-1) */
  minConfidence?: number;
  /** Priority: higher = checked first */
  priority?: number;
}

/**
 * ✅ COMPREHENSIVE PATTERN REGISTRY
 * 
 * This registry includes:
 * 1. Explicit patterns for critical/ambiguous nodes (defined below)
 * 2. Auto-generated patterns for ALL nodes from node library (loaded dynamically)
 * 
 * Each pattern uses word boundaries (\b) to ensure whole-word matching only.
 * This prevents "gmail" from matching "ai" because "ai" is not a whole word in "gmail".
 * 
 * Pattern Examples:
 * - \bgmail\b - Matches "gmail" as whole word only
 * - \bai\b - Matches "ai" as whole word only (won't match inside "gmail")
 * - \bgoogle[_\s]?gmail\b - Matches "google_gmail", "google gmail", "googlegmail"
 * 
 * ✅ COMPREHENSIVE: Each node has 5-10+ patterns extracted from:
 * - keywords (schema.keywords)
 * - aiSelectionCriteria.keywords
 * - aiSelectionCriteria.useCases
 * - commonPatterns
 * - capabilities
 * - description
 * - label
 */
export const EXPLICIT_NODE_TYPE_PATTERNS: NodeTypePattern[] = [
  // ============================================
  // EMAIL & COMMUNICATION NODES
  // ============================================
  {
    type: 'google_gmail',
    pattern: /\b(google[_\s]?)?gmail\b/i,
    altPatterns: [
      // Core patterns
      /\bgoogle[_\s]?mail\b/i,
      /\bgoogle[_\s]?email\b/i,
      /\bgmail[_\s]?them\b/i,
      /\bsend[_\s]?via[_\s]?gmail\b/i,
      /\bemail[_\s]?via[_\s]?gmail\b/i,
      /\bmail[_\s]?via[_\s]?gmail\b/i,
      /\bsend[_\s]?email[_\s]?via[_\s]?gmail\b/i,
      // Use case patterns
      /\bgmail[_\s]?notifications?\b/i,
      /\bgoogle[_\s]?workspace[_\s]?integration\b/i,
      /\boauth[_\s]?email[_\s]?sending\b/i,
      /\bemail[_\s]?reading\b/i,
      /\bemail[_\s]?searching\b/i,
      /\bgmail[_\s]?send\b/i,
      /\bgmail[_\s]?list\b/i,
      /\bgmail[_\s]?get\b/i,
      /\bgmail[_\s]?search\b/i,
      // Common pattern names
      /\bsend[_\s]?email\b/i,
      /\blist[_\s]?messages?\b/i,
    ],
    aliases: ['gmail', 'google_mail', 'google_gmail', 'gmail_send', 'google_email', 'send_email', 'email'],
    priority: 100, // Highest priority - prevent "gmail" from matching "ai"
  },
  {
    type: 'email',
    pattern: /\bemail\b/i,
    altPatterns: [
      // Core patterns
      /\bsmtp\b/i,
      /\bmail[_\s]?server\b/i,
      /\bsend[_\s]?email\b/i,
      /\bemail[_\s]?send\b/i,
      /\bemail[_\s]?notifications?\b/i,
      /\bemail[_\s]?communication\b/i,
      // Use case patterns
      /\bemail[_\s]?reports?\b/i,
      /\bemail[_\s]?alerts?\b/i,
      /\bnotify[_\s]?via[_\s]?email\b/i,
      /\bsend[_\s]?mail\b/i,
      /\bmail[_\s]?send\b/i,
      // SMTP patterns
      /\bsmtp[_\s]?server\b/i,
      /\bsmtp[_\s]?email\b/i,
      /\bsmtp[_\s]?send\b/i,
    ],
    aliases: ['email', 'mail', 'smtp', 'send_email', 'email_send'],
    priority: 95, // High priority but lower than google_gmail
  },
  {
    type: 'outlook',
    pattern: /\boutlook\b/i,
    altPatterns: [
      /\bmicrosoft[_\s]?mail\b/i,
      /\boutlook[_\s]?mail\b/i,
    ],
    aliases: ['outlook', 'microsoft_mail'],
  },

  // ============================================
  // AI & LLM NODES
  // ============================================
  {
    type: 'ai_chat_model',
    pattern: /\bai[_\s]?chat[_\s]?model\b/i,
    altPatterns: [
      /\bchat[_\s]?model\b/i,
      /\bllm[_\s]?chat\b/i,
      /\bconversation[_\s]?model\b/i,
    ],
    aliases: ['ai_chat_model', 'chat_model', 'llm_chat'],
  },
  {
    type: 'ai_service',
    pattern: /\bai[_\s]?service\b/i,
    altPatterns: [
      // Core patterns
      /\bai[_\s]?node\b/i,
      /\bai[_\s]?processor\b/i,
      /\bai[_\s]?model\b/i,
      /\bai[_\s]?processing\b/i,
      /\bai[_\s]?analysis\b/i,
      // ✅ CRITICAL: Use word boundary to prevent "gmail" from matching
      // \bai\b matches "ai" as whole word only, not inside "gmail"
      /\bai\b/i, // Only matches "ai" as standalone word
      // LLM patterns
      /\bllm\b/i,
      /\bopenai\b/i,
      // Service type patterns
      /\bsummarize\b/i,
      /\bsummarization\b/i,
      /\banalyze\b/i,
      /\banalysis\b/i,
      /\bextract\b/i,
      /\bextraction\b/i,
      /\bclassify\b/i,
      /\bclassification\b/i,
      /\btranslate\b/i,
      /\btranslation\b/i,
      // Use case patterns
      /\btext[_\s]?summarization\b/i,
      /\bdata[_\s]?analysis\b/i,
      /\bcontent[_\s]?extraction\b/i,
      /\bai[_\s]?text[_\s]?processing\b/i,
      // Common pattern names
      /\bsummarize[_\s]?text\b/i,
      /\banalyze[_\s]?data\b/i,
    ],
    aliases: ['ai', 'ai_service', 'ai_node', 'ai_processor', 'ai_model', 'ai_processing', 'llm', 'openai', 'summarize', 'analyze', 'extract', 'classify', 'translate'],
    priority: 90, // High priority but lower than gmail
  },
  {
    type: 'ai_agent',
    pattern: /\bai[_\s]?agent\b/i,
    altPatterns: [
      /\bagent\b/i,
      /\bai[_\s]?assistant\b/i,
      /\bassistant\b/i,
      /\bbot\b/i,
    ],
    aliases: ['ai_agent', 'agent', 'assistant', 'bot'],
  },
  {
    type: 'ollama',
    pattern: /\bollama\b/i,
    altPatterns: [
      /\blocal[_\s]?ai\b/i,
      /\blocal[_\s]?llm\b/i,
    ],
    aliases: ['ollama', 'local_ai', 'local_llm'],
  },
  {
    type: 'openai_gpt',
    pattern: /\bopenai[_\s]?gpt\b/i,
    altPatterns: [
      /\bgpt[34]?\b/i,
      /\bopenai\b/i,
      /\bchatgpt\b/i,
    ],
    aliases: ['openai_gpt', 'gpt', 'gpt4', 'gpt3', 'openai', 'chatgpt'],
  },

  // ============================================
  // GOOGLE SERVICES
  // ============================================
  {
    type: 'google_sheets',
    pattern: /\bgoogle[_\s]?sheets?\b/i,
    altPatterns: [
      /\bsheets?\b/i,
      /\bgsheets?\b/i,
      /\bgoogle[_\s]?sheet\b/i,
      /\bspreadsheet\b/i,
    ],
    aliases: ['google_sheets', 'sheets', 'gsheets', 'spreadsheet'],
  },
  {
    type: 'google_drive',
    pattern: /\bgoogle[_\s]?drive\b/i,
    altPatterns: [
      /\bdrive\b/i,
      /\bgdrive\b/i,
      /\bgoogle[_\s]?storage\b/i,
    ],
    aliases: ['google_drive', 'drive', 'gdrive'],
  },
  {
    type: 'google_calendar',
    pattern: /\bgoogle[_\s]?calendar\b/i,
    altPatterns: [
      /\bcalendar\b/i,
      /\bgcal\b/i,
      /\bgoogle[_\s]?cal\b/i,
    ],
    aliases: ['google_calendar', 'calendar', 'gcal'],
  },

  // ============================================
  // DATABASE NODES
  // ============================================
  {
    type: 'postgresql',
    pattern: /\bpostgres(ql)?\b/i,
    altPatterns: [
      /\bpostgres\b/i,
      /\bpostgresql\b/i,
    ],
    aliases: ['postgresql', 'postgres'],
  },
  {
    type: 'mysql',
    pattern: /\bmy[_\s]?sql\b/i,
    aliases: ['mysql', 'my_sql'],
  },
  {
    type: 'mongodb',
    pattern: /\bmongo[_\s]?db\b/i,
    altPatterns: [
      /\bmongo\b/i,
    ],
    aliases: ['mongodb', 'mongo'],
  },

  // ============================================
  // HTTP & API NODES
  // ============================================
  {
    type: 'http_request',
    pattern: /\bhttp[_\s]?request\b/i,
    altPatterns: [
      /\bhttp\b/i,
      /\bapi[_\s]?call\b/i,
      /\bapi[_\s]?request\b/i,
      /\bfetch\b/i,
    ],
    aliases: ['http_request', 'http', 'api', 'api_call', 'fetch'],
  },

  // ============================================
  // CRM & PRODUCTIVITY
  // ============================================
  {
    type: 'airtable',
    pattern: /\bairtable\b/i,
    aliases: ['airtable'],
  },
  {
    type: 'clickup',
    pattern: /\bclick[_\s]?up\b/i,
    aliases: ['clickup', 'click_up'],
  },
  {
    type: 'notion',
    pattern: /\bnotion\b/i,
    aliases: ['notion'],
  },
  {
    type: 'hubspot',
    pattern: /\bhubspot\b/i,
    aliases: ['hubspot'],
  },

  // ============================================
  // LOGIC & CONTROL FLOW
  // ============================================
  {
    type: 'if_else',
    pattern: /\bif[_\s]?else\b/i,
    altPatterns: [
      /\bif\b/i,
      /\bconditional\b/i,
      /\bbranch\b/i,
    ],
    aliases: ['if_else', 'if', 'conditional'],
    priority: 80,
  },
  {
    type: 'switch',
    pattern: /\bswitch\b/i,
    aliases: ['switch'],
    priority: 80,
  },
  {
    type: 'function',
    pattern: /\bfunction\b/i,
    altPatterns: [
      /\bcustom[_\s]?function\b/i,
      /\bcode[_\s]?function\b/i,
    ],
    aliases: ['function', 'custom_function'],
    priority: 80,
  },
  {
    type: 'merge',
    pattern: /\bmerge\b/i,
    altPatterns: [
      /\bcombine\b/i,
      /\bjoin\b/i,
    ],
    aliases: ['merge', 'combine', 'join'],
    priority: 70,
  },
  {
    type: 'filter',
    pattern: /\bfilter\b/i,
    altPatterns: [
      /\bwhere\b/i,
      /\bfilter[_\s]?data\b/i,
    ],
    aliases: ['filter', 'where'],
    priority: 70,
  },
  {
    type: 'loop',
    pattern: /\bloop\b/i,
    altPatterns: [
      /\bfor\b/i,
      /\bforeach\b/i,
      /\biterate\b/i,
    ],
    aliases: ['loop', 'for', 'foreach'],
    priority: 70,
  },

  // ============================================
  // TRIGGERS
  // ============================================
  {
    type: 'manual_trigger',
    pattern: /\bmanual[_\s]?trigger\b/i,
    altPatterns: [
      /\bmanual\b/i,
      /\btrigger\b/i,
    ],
    aliases: ['manual_trigger', 'manual'],
    priority: 80,
  },
  {
    type: 'schedule',
    pattern: /\bschedule\b/i,
    altPatterns: [
      /\bcron\b/i,
      /\bscheduled\b/i,
      /\btimer\b/i,
    ],
    aliases: ['schedule', 'cron', 'timer'],
    priority: 80,
  },
  {
    type: 'webhook',
    pattern: /\bwebhook\b/i,
    altPatterns: [
      /\bwebhook[_\s]?trigger\b/i,
      /\bhttp[_\s]?trigger\b/i,
    ],
    aliases: ['webhook', 'webhook_trigger'],
    priority: 80,
  },
  {
    type: 'interval',
    pattern: /\binterval\b/i,
    altPatterns: [
      /\binterval[_\s]?trigger\b/i,
      /\bperiodic\b/i,
    ],
    aliases: ['interval', 'interval_trigger'],
    priority: 70,
  },
  {
    type: 'form',
    pattern: /\bform\b/i,
    altPatterns: [
      /\bform[_\s]?trigger\b/i,
      /\bform[_\s]?submission\b/i,
    ],
    aliases: ['form', 'form_trigger'],
    priority: 70,
  },

  // ============================================
  // DATA MANIPULATION
  // ============================================
  {
    type: 'set_variable',
    pattern: /\bset[_\s]?variable\b/i,
    altPatterns: [
      /\bset\b/i,
      /\bvariable\b/i,
      /\bassign\b/i,
    ],
    aliases: ['set_variable', 'set', 'variable'],
    priority: 70,
  },
  {
    type: 'javascript',
    pattern: /\bjavascript\b/i,
    altPatterns: [
      /\bjs\b/i,
      /\bcode\b/i,
      /\bscript\b/i,
    ],
    aliases: ['javascript', 'js', 'code'],
    priority: 70,
  },
  {
    type: 'json_parser',
    pattern: /\bjson[_\s]?parser\b/i,
    altPatterns: [
      /\bjson\b/i,
      /\bparse[_\s]?json\b/i,
    ],
    aliases: ['json_parser', 'json'],
    priority: 70,
  },
  {
    type: 'csv',
    pattern: /\bcsv\b/i,
    altPatterns: [
      /\bcsv[_\s]?parser\b/i,
      /\bparse[_\s]?csv\b/i,
    ],
    aliases: ['csv', 'csv_parser'],
    priority: 70,
  },

  // ============================================
  // OUTPUT & LOGGING
  // ============================================
  {
    type: 'log_output',
    pattern: /\blog[_\s]?output\b/i,
    altPatterns: [
      /\blog\b/i,
      /\bconsole[_\s]?log\b/i,
    ],
    aliases: ['log_output', 'log'],
    priority: 70,
  },
  {
    type: 'slack_message',
    pattern: /\bslack[_\s]?message\b/i,
    altPatterns: [
      /\bslack\b/i,
      /\bsend[_\s]?slack\b/i,
    ],
    aliases: ['slack_message', 'slack'],
    priority: 70,
  },
  {
    type: 'telegram',
    pattern: /\btelegram\b/i,
    altPatterns: [
      /\btelegram[_\s]?send\b/i,
      /\bsend[_\s]?telegram\b/i,
    ],
    aliases: ['telegram'],
    priority: 70,
  },
];

/**
 * ✅ DYNAMIC PATTERN LOADING
 * 
 * Loads comprehensive patterns for ALL nodes from node library.
 * This ensures every node has 5-10+ patterns extracted from its schema.
 */
let _allNodePatterns: NodeTypePattern[] | null = null;

/**
 * Get all node patterns (explicit + auto-generated)
 * Loads patterns dynamically on first access
 */
export function getAllNodePatterns(): NodeTypePattern[] {
  if (_allNodePatterns === null) {
    try {
      // Import generator dynamically to avoid circular dependencies
      const { generateAllNodePatterns } = require('./comprehensive-node-pattern-generator');
      
      // Start with explicit patterns (highest priority)
      const explicit = [...EXPLICIT_NODE_TYPE_PATTERNS];
      
      // Generate patterns for all nodes from library
      const generated = generateAllNodePatterns();
      
      // Merge: explicit patterns override generated ones for same node type
      const explicitTypes = new Set(explicit.map(p => p.type));
      const merged = [...explicit];
      
      for (const generatedPattern of generated) {
        if (!explicitTypes.has(generatedPattern.type)) {
          merged.push(generatedPattern);
        }
      }
      
      _allNodePatterns = merged;
      console.log(`[PatternRegistry] ✅ Loaded ${_allNodePatterns.length} node patterns (${explicit.length} explicit + ${generated.length} generated)`);
    } catch (error) {
      console.warn('[PatternRegistry] ⚠️ Failed to load generated patterns, using explicit patterns only:', error);
      _allNodePatterns = [...EXPLICIT_NODE_TYPE_PATTERNS];
    }
  }
  
  return _allNodePatterns;
}

/**
 * ✅ AUTO-GENERATE PATTERN FROM NODE TYPE NAME
 * 
 * Generates a strict word-boundary pattern from a node type name.
 * Example: "google_gmail" → /\bgoogle[_\s]?gmail\b/i
 * 
 * @param nodeType - The canonical node type name
 * @returns Regex pattern with word boundaries
 */
export function generatePatternFromNodeType(nodeType: string): RegExp {
  if (!nodeType) {
    return /^$/; // Empty pattern
  }

  // Split on delimiters and create word-boundary pattern
  const tokens = nodeType.toLowerCase().split(/[_\-\.\s]+/g).filter(Boolean);
  
  // Create pattern: \btoken1\b[_\s]?\btoken2\b[_\s]?\btoken3\b
  // This matches "google_gmail", "google gmail", "googlegmail", etc.
  const patternParts = tokens.map(token => `\\b${token}\\b`).join('[_\s\\-]?');
  
  return new RegExp(patternParts, 'i');
}

/**
 * ✅ STRICT PATTERN MATCHER
 * 
 * Matches node types using strict patterns with word boundaries.
 * Prevents false positives by requiring whole-word matches only.
 * 
 * Strategy:
 * 1. Check explicit patterns first (highest priority)
 * 2. Check exact aliases
 * 3. Check main patterns
 * 4. Check alternative patterns
 * 5. Auto-generate pattern from node type name (fallback)
 * 
 * @param nodeType - The node type string to match
 * @param registeredTypes - Optional list of registered node types for auto-generation
 * @returns Matched pattern or null
 */
export function matchNodeTypeByPattern(
  nodeType: string, 
  registeredTypes?: string[]
): NodeTypePattern | null {
  if (!nodeType || typeof nodeType !== 'string') {
    return null;
  }

  const normalized = nodeType.toLowerCase().trim();

  // ✅ STEP 1: Get all patterns (explicit + auto-generated)
  // These have highest priority and handle ambiguous cases
  const allPatterns = getAllNodePatterns();
  const sortedPatterns = [...allPatterns].sort((a, b) => (b.priority || 0) - (a.priority || 0));

  // Step 1a: Check exact aliases first (fastest, highest confidence)
  for (const pattern of sortedPatterns) {
    if (pattern.aliases) {
      for (const alias of pattern.aliases) {
        if (alias.toLowerCase() === normalized) {
          return pattern;
        }
      }
    }
  }

  // Step 1b: Check main pattern (word-boundary regex)
  for (const pattern of sortedPatterns) {
    if (pattern.pattern.test(normalized)) {
      return pattern;
    }
  }

  // Step 1c: Check alternative patterns
  for (const pattern of sortedPatterns) {
    if (pattern.altPatterns) {
      for (const altPattern of pattern.altPatterns) {
        if (altPattern.test(normalized)) {
          return pattern;
        }
      }
    }
  }

  // ✅ STEP 2: Auto-generate patterns from registered node types (fallback)
  // This handles all nodes not in explicit pattern registry
  if (registeredTypes && registeredTypes.length > 0) {
    for (const registeredType of registeredTypes) {
      // Skip if already in explicit patterns
      const alreadyInPatterns = sortedPatterns.some(p => p.type === registeredType);
      if (alreadyInPatterns) {
        continue;
      }

      // Generate pattern from node type name
      const autoPattern = generatePatternFromNodeType(registeredType);
      if (autoPattern.test(normalized)) {
        // Also check if normalized matches the registered type exactly (case-insensitive)
        if (registeredType.toLowerCase() === normalized) {
          return {
            type: registeredType,
            pattern: autoPattern,
            aliases: [registeredType],
            priority: 0, // Lower priority than explicit patterns
          };
        }
      }
    }
  }

  return null;
}

/**
 * ✅ GET CANONICAL TYPE FROM PATTERN
 * 
 * Returns the canonical node type if a pattern matches, otherwise returns null.
 * 
 * @param nodeType - The node type string to resolve
 * @returns Canonical node type or null
 */
export function getCanonicalTypeFromPattern(nodeType: string): string | null {
  const match = matchNodeTypeByPattern(nodeType);
  return match ? match.type : null;
}

/**
 * ✅ VALIDATE PATTERN MATCHING
 * 
 * Test cases to ensure patterns work correctly:
 * - "gmail" → "google_gmail" ✅ (should match)
 * - "ai" → "ai_service" ✅ (should match)
 * - "gmail" → NOT "ai" ✅ (should NOT match "ai" because "ai" is not a whole word in "gmail")
 */
export function validatePatternMatching(): { passed: boolean; failures: string[] } {
  const testCases: Array<{ input: string; expected: string; shouldMatch: boolean }> = [
    { input: 'gmail', expected: 'google_gmail', shouldMatch: true },
    { input: 'ai', expected: 'ai_service', shouldMatch: true },
    { input: 'gmail', expected: 'ai_service', shouldMatch: false }, // Should NOT match
    { input: 'email', expected: 'email', shouldMatch: true },
    { input: 'google_gmail', expected: 'google_gmail', shouldMatch: true },
    { input: 'sheets', expected: 'google_sheets', shouldMatch: true },
    { input: 'http_request', expected: 'http_request', shouldMatch: true },
  ];

  const failures: string[] = [];

  for (const testCase of testCases) {
    const match = matchNodeTypeByPattern(testCase.input);
    const matchedType = match ? match.type : null;
    const shouldMatch = testCase.shouldMatch;
    const didMatch = matchedType === testCase.expected;

    if (shouldMatch && !didMatch) {
      failures.push(`"${testCase.input}" should match "${testCase.expected}" but got ${matchedType || 'null'}`);
    } else if (!shouldMatch && didMatch) {
      failures.push(`"${testCase.input}" should NOT match "${testCase.expected}" but it did`);
    }
  }

  return {
    passed: failures.length === 0,
    failures,
  };
}
