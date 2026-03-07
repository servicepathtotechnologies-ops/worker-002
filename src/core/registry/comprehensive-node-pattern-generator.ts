/**
 * ✅ COMPREHENSIVE NODE PATTERN GENERATOR
 * 
 * Generates 5-10+ strict HTML-style regex patterns per node from:
 * - keywords (schema.keywords)
 * - aiSelectionCriteria.keywords
 * - aiSelectionCriteria.useCases
 * - commonPatterns
 * - capabilities
 * - description
 * - label
 * 
 * Uses word boundaries (\b) to prevent false positives like "gmail" matching "ai"
 */

import { nodeLibrary } from '../../services/nodes/node-library';
import type { NodeSchema } from '../../services/nodes/node-library';
import type { NodeTypePattern } from './node-type-pattern-registry';

/**
 * ✅ Convert keyword/useCase to strict regex pattern
 * 
 * Examples:
 * - "send email" → /\bsend[_\s]?email\b/i
 * - "gmail" → /\bgmail\b/i
 * - "google sheets" → /\bgoogle[_\s]?sheets?\b/i
 */
function keywordToPattern(keyword: string): RegExp {
  // Escape special regex characters
  const escaped = keyword
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    .toLowerCase()
    .trim();
  
  // Replace spaces/underscores with optional pattern
  const pattern = escaped
    .replace(/[\s_]+/g, '[_\s]?')
    .replace(/\s+/g, '[_\s]?');
  
  // Add word boundaries
  return new RegExp(`\\b${pattern}\\b`, 'i');
}

/**
 * ✅ Generate comprehensive patterns from node schema
 * 
 * Extracts patterns from:
 * 1. keywords (5-10+ keywords)
 * 2. aiSelectionCriteria.keywords (5-10+ keywords)
 * 3. aiSelectionCriteria.useCases (5-10+ use cases)
 * 4. commonPatterns (pattern names)
 * 5. capabilities (capability strings)
 * 6. description (key phrases)
 * 7. label (node label)
 */
export function generatePatternsFromSchema(schema: NodeSchema): NodeTypePattern {
  const patterns: RegExp[] = [];
  const aliases: string[] = [];
  const altPatterns: RegExp[] = [];
  
  // 1. Main pattern from node type name
  const mainPattern = generateMainPattern(schema.type);
  patterns.push(mainPattern);
  
  // 2. Add canonical type as alias
  aliases.push(schema.type);
  
  // 3. Extract from keywords (schema.keywords)
  if (schema.keywords && schema.keywords.length > 0) {
    for (const keyword of schema.keywords) {
      const pattern = keywordToPattern(keyword);
      altPatterns.push(pattern);
      // Add single-word keywords as aliases
      if (!keyword.includes(' ') && !keyword.includes('_')) {
        aliases.push(keyword.toLowerCase());
      }
    }
  }
  
  // 4. Extract from aiSelectionCriteria.keywords
  if (schema.aiSelectionCriteria?.keywords && schema.aiSelectionCriteria.keywords.length > 0) {
    for (const keyword of schema.aiSelectionCriteria.keywords) {
      const pattern = keywordToPattern(keyword);
      altPatterns.push(pattern);
      // Add single-word keywords as aliases
      if (!keyword.includes(' ') && !keyword.includes('_')) {
        aliases.push(keyword.toLowerCase());
      }
    }
  }
  
  // 5. Extract from useCases
  if (schema.aiSelectionCriteria?.useCases && schema.aiSelectionCriteria.useCases.length > 0) {
    for (const useCase of schema.aiSelectionCriteria.useCases) {
      // Extract key phrases from use case descriptions
      const phrases = extractKeyPhrases(useCase);
      for (const phrase of phrases) {
        const pattern = keywordToPattern(phrase);
        altPatterns.push(pattern);
      }
    }
  }
  
  // 6. Extract from commonPatterns
  if (schema.commonPatterns && schema.commonPatterns.length > 0) {
    for (const pattern of schema.commonPatterns) {
      if (pattern.name) {
        const regexPattern = keywordToPattern(pattern.name);
        altPatterns.push(regexPattern);
      }
      if (pattern.description) {
        const phrases = extractKeyPhrases(pattern.description);
        for (const phrase of phrases) {
          const regexPattern = keywordToPattern(phrase);
          altPatterns.push(regexPattern);
        }
      }
    }
  }
  
  // 7. Extract from capabilities
  if (schema.capabilities && schema.capabilities.length > 0) {
    for (const capability of schema.capabilities) {
      // Extract key parts from capability strings like "email.send"
      const parts = capability.split('.');
      for (const part of parts) {
        const pattern = keywordToPattern(part);
        altPatterns.push(pattern);
      }
    }
  }
  
  // 8. Extract from description (key phrases)
  if (schema.description) {
    const phrases = extractKeyPhrases(schema.description);
    for (const phrase of phrases) {
      const pattern = keywordToPattern(phrase);
      altPatterns.push(pattern);
    }
  }
  
  // 9. Extract from label
  if (schema.label) {
    const pattern = keywordToPattern(schema.label);
    altPatterns.push(pattern);
  }
  
  // 10. Extract from whenToUse
  if (schema.aiSelectionCriteria?.whenToUse && schema.aiSelectionCriteria.whenToUse.length > 0) {
    for (const whenToUse of schema.aiSelectionCriteria.whenToUse) {
      const phrases = extractKeyPhrases(whenToUse);
      for (const phrase of phrases) {
        const pattern = keywordToPattern(phrase);
        altPatterns.push(pattern);
      }
    }
  }
  
  // Deduplicate patterns
  const uniquePatterns = deduplicatePatterns(altPatterns);
  
  // Determine priority based on node type
  const priority = determinePriority(schema.type, schema.category);
  
  return {
    type: schema.type,
    pattern: mainPattern,
    altPatterns: uniquePatterns.length > 0 ? uniquePatterns : undefined,
    aliases: aliases.length > 0 ? [...new Set(aliases)] : undefined,
    priority,
  };
}

/**
 * ✅ Generate main pattern from node type name
 * 
 * Examples:
 * - "google_gmail" → /\bgoogle[_\s]?gmail\b/i
 * - "http_request" → /\bhttp[_\s]?request\b/i
 */
function generateMainPattern(nodeType: string): RegExp {
  const tokens = nodeType.toLowerCase().split(/[_\-\.\s]+/g).filter(Boolean);
  const patternParts = tokens.map(token => `\\b${token}\\b`).join('[_\s\\-]?');
  return new RegExp(patternParts, 'i');
}

/**
 * ✅ Extract key phrases from text
 * 
 * Examples:
 * - "Send email via Gmail" → ["send email", "email", "gmail", "send", "via gmail"]
 * - "Team notifications" → ["team notifications", "team", "notifications"]
 */
function extractKeyPhrases(text: string): string[] {
  const phrases: string[] = [];
  const lower = text.toLowerCase().trim();
  
  // Add full phrase
  phrases.push(lower);
  
  // Extract 2-word phrases
  const twoWordMatches = lower.match(/\b\w+\s+\w+\b/g);
  if (twoWordMatches) {
    phrases.push(...twoWordMatches);
  }
  
  // Extract 3-word phrases
  const threeWordMatches = lower.match(/\b\w+\s+\w+\s+\w+\b/g);
  if (threeWordMatches) {
    phrases.push(...threeWordMatches);
  }
  
  // Extract individual words (filter out common stop words)
  const stopWords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'via', 'by', 'from']);
  const words = lower.split(/\s+/).filter(word => word.length > 2 && !stopWords.has(word));
  phrases.push(...words);
  
  return [...new Set(phrases)].filter(p => p.length >= 2);
}

/**
 * ✅ Deduplicate regex patterns
 */
function deduplicatePatterns(patterns: RegExp[]): RegExp[] {
  const seen = new Set<string>();
  const unique: RegExp[] = [];
  
  for (const pattern of patterns) {
    const patternStr = pattern.source;
    if (!seen.has(patternStr)) {
      seen.add(patternStr);
      unique.push(pattern);
    }
  }
  
  return unique;
}

/**
 * ✅ Determine priority based on node type and category
 * 
 * Higher priority = checked first (prevents false matches)
 */
function determinePriority(nodeType: string, category?: string): number {
  // Critical nodes that need highest priority to prevent false matches
  if (nodeType === 'google_gmail') return 100;
  if (nodeType === 'ai_service' || nodeType === 'ai_chat_model' || nodeType === 'ai_agent') return 90;
  
  // Common/ambiguous nodes
  if (nodeType.includes('google_')) return 85;
  if (nodeType.includes('ai_') || nodeType.includes('_ai')) return 85;
  
  // Category-based priority
  if (category === 'trigger') return 80;
  if (category === 'http_api') return 75;
  if (category === 'google') return 80;
  if (category === 'ai') return 85;
  if (category === 'database') return 70;
  if (category === 'output') return 70;
  if (category === 'logic') return 65;
  if (category === 'transformation') return 60;
  
  // Default priority
  return 50;
}

/**
 * ✅ Generate comprehensive patterns for ALL nodes
 * 
 * This function generates patterns for all registered nodes in the library
 */
export function generateAllNodePatterns(): NodeTypePattern[] {
  const allSchemas = nodeLibrary.getAllSchemas();
  const patterns: NodeTypePattern[] = [];
  
  console.log(`[PatternGenerator] Generating patterns for ${allSchemas.length} nodes...`);
  
  for (const schema of allSchemas) {
    try {
      const pattern = generatePatternsFromSchema(schema);
      patterns.push(pattern);
    } catch (error) {
      console.warn(`[PatternGenerator] Failed to generate patterns for ${schema.type}:`, error);
    }
  }
  
  console.log(`[PatternGenerator] ✅ Generated patterns for ${patterns.length} nodes`);
  
  return patterns;
}
