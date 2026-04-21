/**
 * Enhanced Keyword Matcher
 * Handles variations in user input to match correct node types
 * Examples: "sheets", "sheet", "google sheets" → "google_sheets"
 */

import { nodeLibrary } from '../nodes/node-library';
import { NodeSchema } from '../nodes/node-library';

export interface KeywordMatch {
  nodeType: string;
  score: number;
  matchedKeywords: string[];
  confidence: 'high' | 'medium' | 'low';
}

export class EnhancedKeywordMatcher {
  // Comprehensive keyword variations mapping
  private keywordVariations: Map<string, string[]> = new Map([
    // Google Sheets variations
    ['google_sheets', ['sheets', 'sheet', 'google sheets', 'google sheet', 'spreadsheet', 'excel', 'gsheet', 'g sheet', 'googlesheet', 'googlesheets']],
    // Google Docs variations
    ['google_doc', ['docs', 'doc', 'google docs', 'google doc', 'document', 'gdoc', 'g doc', 'googledoc', 'googledocs']],
    // LinkedIn variations
    ['linkedin', ['linkedin', 'linked in', 'linked-in', 'li', 'professional network', 'linkedin post', 'post to linkedin']],
    // Twitter variations
    ['twitter', ['twitter', 'tweet', 'x.com', 'x', 'twitter post', 'post to twitter', 'tweet to']],
    // Instagram variations
    ['instagram', ['instagram', 'insta', 'ig', 'instagram post', 'post to instagram', 'post on instagram']],
    // Slack variations
    ['slack_message', ['slack', 'slack message', 'slack notification', 'send to slack', 'notify slack']],
    // Gmail variations
    ['google_gmail', ['gmail', 'g mail', 'google mail', 'google email', 'email', 'send email', 'mail']],
    // Database variations
    ['database_read', ['database', 'db', 'read from database', 'query database', 'sql', 'select']],
    ['database_write', ['database', 'db', 'write to database', 'save to database', 'insert', 'update']],
    // HTTP variations
    ['http_request', ['http', 'api', 'request', 'fetch', 'call api', 'http request', 'api call', 'endpoint']],
    // Schedule variations
    ['schedule', ['schedule', 'scheduled', 'daily', 'hourly', 'weekly', 'cron', 'at time', 'every day']],
    // Form variations
    ['form', ['form', 'form submission', 'submit form', 'form input', 'user submits']],
    // Webhook variations
    ['webhook', ['webhook', 'web hook', 'http endpoint', 'api endpoint', 'callback']],
  ]);

  /**
   * Find best matching node type for user input
   */
  findBestMatch(userInput: string, context?: string): KeywordMatch | null {
    const inputLower = userInput.toLowerCase().trim();
    const contextLower = context?.toLowerCase() || '';
    const combinedInput = `${inputLower} ${contextLower}`.trim();

    const allSchemas = nodeLibrary.getAllSchemas();
    const matches: KeywordMatch[] = [];

    for (const schema of allSchemas) {
      const match = this.scoreNodeMatch(schema, inputLower, combinedInput);
      if (match.score > 0) {
        matches.push(match);
      }
    }

    if (matches.length === 0) {
      return null;
    }

    // Sort by score (highest first)
    matches.sort((a, b) => b.score - a.score);

    const bestMatch = matches[0];
    
    // Determine confidence level
    if (bestMatch.score >= 50) {
      bestMatch.confidence = 'high';
    } else if (bestMatch.score >= 20) {
      bestMatch.confidence = 'medium';
    } else {
      bestMatch.confidence = 'low';
    }

    return bestMatch;
  }

  /**
   * Score how well a node schema matches user input
   */
  private scoreNodeMatch(
    schema: NodeSchema,
    input: string,
    combinedInput: string
  ): KeywordMatch {
    let score = 0;
    const matchedKeywords: string[] = [];
    const nodeType = schema.type;
    const label = schema.label.toLowerCase();
    const description = schema.description.toLowerCase();
    const keywords = schema.aiSelectionCriteria?.keywords || [];
    const whenToUse = schema.aiSelectionCriteria?.whenToUse || [];

    // Check keyword variations (highest priority)
    const variations = this.keywordVariations.get(nodeType) || [];
    for (const variation of variations) {
      if (input.includes(variation) || combinedInput.includes(variation)) {
        score += 30; // High score for variation match
        matchedKeywords.push(variation);
      }
    }

    // Check exact node type match
    if (input.includes(nodeType.replace('_', ' ')) || input === nodeType) {
      score += 40;
      matchedKeywords.push(nodeType);
    }

    // Check label match
    if (input.includes(label) || label.includes(input)) {
      score += 25;
      matchedKeywords.push(label);
    }

    // Check description match
    const inputWords = input.split(/\s+/).filter(w => w.length > 2);
    inputWords.forEach(word => {
      if (description.includes(word)) {
        score += 5;
        if (!matchedKeywords.includes(word)) {
          matchedKeywords.push(word);
        }
      }
    });

    // Check schema keywords
    keywords.forEach(keyword => {
      const keywordLower = keyword.toLowerCase();
      if (input.includes(keywordLower) || combinedInput.includes(keywordLower)) {
        score += 15;
        if (!matchedKeywords.includes(keyword)) {
          matchedKeywords.push(keyword);
        }
      }
    });

    // Check "when to use" criteria
    whenToUse.forEach(criterion => {
      const criterionLower = criterion.toLowerCase();
      if (input.includes(criterionLower) || combinedInput.includes(criterionLower)) {
        score += 10;
      }
    });

    // Special handling for common patterns
    // "sheets" or "sheet" without "google" should still match google_sheets if context suggests it
    if ((input.includes('sheet') || input.includes('sheets')) && !input.includes('excel')) {
      if (nodeType === 'google_sheets') {
        score += 20; // Boost for sheets → google_sheets
      }
    }

    // "linkedin" variations
    if (input.includes('linked') || input.includes('professional')) {
      if (nodeType === 'linkedin') {
        score += 20;
      }
    }

    // Penalize "when not to use" matches
    const whenNotToUse = schema.aiSelectionCriteria?.whenNotToUse || [];
    whenNotToUse.forEach(criterion => {
      if (input.includes(criterion.toLowerCase())) {
        score -= 15;
      }
    });

    return {
      nodeType,
      score,
      matchedKeywords: [...new Set(matchedKeywords)], // Remove duplicates
      confidence: 'low', // Will be set by caller
    };
  }

  /**
   * Find all possible matches (for debugging or multi-option scenarios)
   */
  findAllMatches(userInput: string, context?: string, minScore: number = 10): KeywordMatch[] {
    const inputLower = userInput.toLowerCase().trim();
    const contextLower = context?.toLowerCase() || '';
    const combinedInput = `${inputLower} ${contextLower}`.trim();

    const allSchemas = nodeLibrary.getAllSchemas();
    const matches: KeywordMatch[] = [];

    for (const schema of allSchemas) {
      const match = this.scoreNodeMatch(schema, inputLower, combinedInput);
      if (match.score >= minScore) {
        if (match.score >= 50) {
          match.confidence = 'high';
        } else if (match.score >= 20) {
          match.confidence = 'medium';
        } else {
          match.confidence = 'low';
        }
        matches.push(match);
      }
    }

    // Sort by score
    matches.sort((a, b) => b.score - a.score);

    return matches;
  }

  /**
   * Normalize user input to help with matching
   * Removes common words and normalizes variations
   */
  normalizeInput(input: string): string {
    let normalized = input.toLowerCase().trim();

    // Common replacements
    const replacements: [string, string][] = [
      ['google sheets', 'sheets'],
      ['google sheet', 'sheets'],
      ['linked in', 'linkedin'],
      ['linked-in', 'linkedin'],
      ['x.com', 'twitter'],
      ['x ', 'twitter '],
      [' gmail', ' email'],
      ['google mail', 'email'],
    ];

    replacements.forEach(([from, to]) => {
      normalized = normalized.replace(new RegExp(from, 'gi'), to);
    });

    return normalized;
  }
}

// Export singleton instance
export const enhancedKeywordMatcher = new EnhancedKeywordMatcher();
