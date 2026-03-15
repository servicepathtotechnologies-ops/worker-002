/**
 * ✅ WORLD-CLASS: Explicit Intent Extractor
 * 
 * Extracts explicitly mentioned nodes from variation text using service-specific keyword mapping.
 * Prevents false matches (e.g., "slack" should match slack_message, not discord).
 * 
 * This is a universal utility that works for ALL node types.
 */

import { AliasKeyword } from '../../services/ai/summarize-layer';

/**
 * ✅ SERVICE-SPECIFIC KEYWORD MAPPING
 * 
 * Maps service names to their canonical node types.
 * This prevents false matches (e.g., "slack" won't match "discord").
 * 
 * Priority: More specific keywords first, then generic ones.
 */
const SERVICE_KEYWORD_MAP: Record<string, string[]> = {
  // Communication Services
  'slack_message': ['slack', 'slack message', 'slack webhook', 'slack notification', 'slack channel'],
  'discord': ['discord', 'discord bot', 'discord webhook', 'discord message', 'discord channel'],
  'telegram': ['telegram', 'telegram bot', 'telegram message', 'telegram channel'],
  'google_gmail': ['gmail', 'google mail', 'google gmail', 'email', 'send email'],
  'microsoft_teams': ['teams', 'microsoft teams', 'ms teams', 'teams message'],
  'whatsapp': ['whatsapp', 'whats app', 'whatsapp message'],
  
  // Data Sources
  'google_sheets': ['google sheets', 'google sheet', 'sheets', 'spreadsheet', 'gsheet'],
  'postgresql': ['postgres', 'postgresql', 'postgres db', 'postgres database'],
  'mysql': ['mysql', 'mysql db', 'mysql database'],
  'mongodb': ['mongodb', 'mongo', 'mongo db', 'mongo database'],
  
  // AI/Transformation
  'ai_chat_model': ['ai chat', 'chat model', 'ai model', 'gpt', 'openai', 'claude', 'gemini'],
  'ollama': ['ollama', 'local ai', 'local model'],
  'text_summarizer': ['summarize', 'summarizer', 'summary'],
  
  // CRM
  'hubspot': ['hubspot', 'hub spot'],
  'salesforce': ['salesforce', 'sales force'],
  'zoho_crm': ['zoho', 'zoho crm'],
  'pipedrive': ['pipedrive', 'pipe drive'],
};

/**
 * ✅ COMMUNICATION SERVICE CONFLICTS
 * 
 * Defines which communication services conflict with each other.
 * If one is explicit, the others should be blocked.
 */
const COMMUNICATION_CONFLICTS: Record<string, string[]> = {
  'slack_message': ['discord', 'telegram', 'google_gmail', 'microsoft_teams', 'whatsapp'],
  'discord': ['slack_message', 'telegram', 'google_gmail', 'microsoft_teams', 'whatsapp'],
  'telegram': ['slack_message', 'discord', 'google_gmail', 'microsoft_teams', 'whatsapp'],
  'google_gmail': ['slack_message', 'discord', 'telegram', 'microsoft_teams', 'whatsapp'],
  'microsoft_teams': ['slack_message', 'discord', 'telegram', 'google_gmail', 'whatsapp'],
  'whatsapp': ['slack_message', 'discord', 'telegram', 'google_gmail', 'microsoft_teams'],
};

/**
 * ✅ WORLD-CLASS: Extract explicitly mentioned node types from variation text
 * 
 * Uses service-specific keyword mapping for precise matching.
 * Prevents false matches (e.g., "slack" won't match "discord").
 * 
 * @param variationText - The selected variation text
 * @param allKeywordData - All keyword mappings from AliasKeywordCollector
 * @returns Set of node types explicitly mentioned in variation
 */
export function extractExplicitNodeTypesFromVariation(
  variationText: string,
  allKeywordData: AliasKeyword[]
): Set<string> {
  const explicitNodes = new Set<string>();
  const variationLower = variationText.toLowerCase();
  
  console.log(`[ExplicitIntentExtractor] 🔍 Extracting explicit nodes from variation: "${variationText.substring(0, 100)}..."`);
  
  // ✅ STEP 1: Check service-specific keywords first (most precise)
  for (const [nodeType, keywords] of Object.entries(SERVICE_KEYWORD_MAP)) {
    for (const keyword of keywords) {
      try {
        const escapedKeyword = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`\\b${escapedKeyword}\\b`, 'i');
        if (regex.test(variationText)) {
          explicitNodes.add(nodeType);
          console.log(`[ExplicitIntentExtractor] ✅ Matched service-specific keyword "${keyword}" → ${nodeType}`);
          break; // Found match for this service, move to next
        }
      } catch (error) {
        // Fallback to simple includes if regex fails
        if (variationLower.includes(keyword.toLowerCase())) {
          explicitNodes.add(nodeType);
          console.log(`[ExplicitIntentExtractor] ✅ Matched service-specific keyword "${keyword}" → ${nodeType} (fallback)`);
          break;
        }
      }
    }
  }
  
  // ✅ STEP 2: Fallback to general keyword matching for other nodes
  // Only check nodes that weren't already matched by service-specific keywords
  for (const keywordData of allKeywordData) {
    // Skip if already matched by service-specific keywords
    if (explicitNodes.has(keywordData.nodeType)) {
      continue;
    }
    
    const keywordLower = keywordData.keyword.toLowerCase();
    try {
      const escapedKeyword = keywordLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`\\b${escapedKeyword}\\b`, 'i');
      if (regex.test(variationText)) {
        explicitNodes.add(keywordData.nodeType);
        console.log(`[ExplicitIntentExtractor] ✅ Matched general keyword "${keywordData.keyword}" → ${keywordData.nodeType}`);
      }
    } catch (error) {
      // Fallback to simple includes if regex fails
      if (variationLower.includes(keywordLower)) {
        explicitNodes.add(keywordData.nodeType);
        console.log(`[ExplicitIntentExtractor] ✅ Matched general keyword "${keywordData.keyword}" → ${keywordData.nodeType} (fallback)`);
      }
    }
  }
  
  console.log(`[ExplicitIntentExtractor] ✅ Extracted ${explicitNodes.size} explicit node type(s): ${Array.from(explicitNodes).join(', ')}`);
  return explicitNodes;
}

/**
 * ✅ WORLD-CLASS: Derive blocked nodes from explicit nodes
 * 
 * If a communication service is explicit, block conflicting services.
 * Example: If "slack_message" is explicit, block "discord", "telegram", etc.
 * 
 * @param explicitNodeTypes - Set of explicitly mentioned node types
 * @returns Set of node types that should be blocked (conflicting)
 */
export function getBlockedNodeTypes(explicitNodeTypes: Set<string>): Set<string> {
  const blocked = new Set<string>();
  
  // Check communication service conflicts
  for (const explicitNode of explicitNodeTypes) {
    const conflicts = COMMUNICATION_CONFLICTS[explicitNode];
    if (conflicts) {
      conflicts.forEach(conflict => {
        blocked.add(conflict);
        console.log(`[ExplicitIntentExtractor] 🚫 Blocking ${conflict} (conflicts with explicit ${explicitNode})`);
      });
    }
  }
  
  // ✅ FUTURE: Add other conflict types (e.g., data sources, transformations)
  // For now, only communication services have conflicts
  
  if (blocked.size > 0) {
    console.log(`[ExplicitIntentExtractor] 🚫 Blocked ${blocked.size} conflicting node type(s): ${Array.from(blocked).join(', ')}`);
  }
  
  return blocked;
}

/**
 * ✅ UTILITY: Check if a node type is a communication service
 */
export function isCommunicationService(nodeType: string): boolean {
  return Object.keys(COMMUNICATION_CONFLICTS).includes(nodeType);
}
