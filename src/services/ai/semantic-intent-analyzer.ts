/**
 * Semantic Intent Analyzer
 * 
 * Analyzes user prompts at word level to extract semantic intent.
 * Understands what the user wants to do, not just what they type.
 * 
 * This is the foundation of semantic node resolution - it provides
 * the semantic understanding that AI uses to match user intent to nodes.
 */

import { ollamaOrchestrator } from './ollama-orchestrator';

export interface SemanticIntent {
  // Extracted components
  actions: string[];           // ["post", "publish", "share"]
  targets: string[];           // ["linkedin", "twitter"]
  categories: string[];        // ["social_media", "output"]
  
  // Semantic understanding
  primaryIntent: string;       // "publish_content_to_social_media"
  semanticKeywords: string[];  // All relevant keywords
  
  // Context
  context: {
    domain: string;            // "social_media"
    operation: string;         // "write"
    platform?: string;         // "linkedin"
  };
}

export class SemanticIntentAnalyzer {
  // Uses ollamaOrchestrator singleton

  /**
   * Analyze user prompt and extract semantic intent
   * 
   * @param prompt - User's natural language prompt
   * @returns Semantic intent with actions, targets, categories, and keywords
   */
  async analyze(prompt: string): Promise<SemanticIntent> {
    if (!prompt || typeof prompt !== 'string') {
      return this.getEmptyIntent();
    }

    const systemPrompt = `You are a semantic intent analyzer. Your job is to understand what the user wants to do at a deep, semantic level.

Your task:
1. Parse the user prompt word by word
2. Extract semantic meaning (not just literal words)
3. Identify:
   - Actions: What does the user want to do? (post, publish, send, create, read, etc.)
   - Targets: Where/what is the target? (linkedin, twitter, email, crm, etc.)
   - Categories: What domain? (social_media, communication, data_storage, etc.)
4. Generate semantic keywords that capture the intent

Examples:
- "post on linkedin" → Actions: ["post", "publish"], Target: ["linkedin"], Category: ["social_media"], Keywords: ["post", "publish", "share", "linkedin", "social"]
- "send email via gmail" → Actions: ["send", "email"], Target: ["gmail"], Category: ["communication"], Keywords: ["send", "email", "mail", "gmail", "communication"]

Output Format (JSON only, no markdown):
{
  "actions": ["action1", "action2"],
  "targets": ["target1", "target2"],
  "categories": ["category1", "category2"],
  "primaryIntent": "main_intent_description",
  "semanticKeywords": ["keyword1", "keyword2", "keyword3"],
  "context": {
    "domain": "domain_name",
    "operation": "read|write|transform",
    "platform": "platform_name_if_any"
  }
}`;

    try {
      const content = await ollamaOrchestrator.processRequest(
        'workflow-analysis',
        {
          system: systemPrompt,
          message: prompt
        },
        {
          temperature: 0,
          max_tokens: 2000
        }
      );
      const intent = this.parseAIResponse(content);
      
      return intent;
    } catch (error) {
      console.error('[SemanticIntentAnalyzer] Error analyzing intent:', error);
      // Fallback to basic extraction
      return this.fallbackAnalysis(prompt);
    }
  }

  /**
   * Extract semantic keywords from prompt (quick method without AI)
   * 
   * @param prompt - User's natural language prompt
   * @returns Array of semantic keywords
   */
  extractKeywords(prompt: string): string[] {
    if (!prompt) return [];

    const keywords: string[] = [];
    const lower = prompt.toLowerCase();

    // Common action keywords
    const actionKeywords = ['post', 'publish', 'send', 'create', 'write', 'share', 'upload', 'publish'];
    actionKeywords.forEach(keyword => {
      if (lower.includes(keyword)) {
        keywords.push(keyword);
      }
    });

    // Common platform keywords
    const platformKeywords = ['linkedin', 'twitter', 'instagram', 'facebook', 'gmail', 'email', 'slack'];
    platformKeywords.forEach(keyword => {
      if (lower.includes(keyword)) {
        keywords.push(keyword);
      }
    });

    // Common domain keywords
    const domainKeywords = ['social', 'media', 'communication', 'crm', 'data', 'storage'];
    domainKeywords.forEach(keyword => {
      if (lower.includes(keyword)) {
        keywords.push(keyword);
      }
    });

    return [...new Set(keywords)]; // Remove duplicates
  }

  /**
   * Identify category from prompt (quick method without AI)
   * 
   * @param prompt - User's natural language prompt
   * @returns Category string (e.g., "social_media", "communication")
   */
  identifyCategory(prompt: string): string {
    if (!prompt) return 'general';

    const lower = prompt.toLowerCase();

    // Category detection based on keywords
    if (lower.includes('linkedin') || lower.includes('twitter') || lower.includes('instagram') || lower.includes('facebook')) {
      return 'social_media';
    }
    if (lower.includes('email') || lower.includes('gmail') || lower.includes('mail')) {
      return 'communication';
    }
    if (lower.includes('crm') || lower.includes('hubspot') || lower.includes('salesforce')) {
      return 'crm';
    }
    if (lower.includes('sheet') || lower.includes('spreadsheet') || lower.includes('data')) {
      return 'data_storage';
    }
    if (lower.includes('ai') || lower.includes('generate') || lower.includes('chat')) {
      return 'ai_processing';
    }

    return 'general';
  }

  /**
   * Parse AI response into SemanticIntent
   */
  private parseAIResponse(content: string): SemanticIntent {
    try {
      // Extract JSON from response (handle markdown code blocks)
      let jsonStr = content.trim();
      
      // Remove markdown code blocks if present
      if (jsonStr.startsWith('```')) {
        const lines = jsonStr.split('\n');
        jsonStr = lines.slice(1, -1).join('\n').trim();
        if (jsonStr.endsWith('```')) {
          jsonStr = jsonStr.slice(0, -3).trim();
        }
      }

      // Remove language identifier if present
      if (jsonStr.startsWith('json')) {
        jsonStr = jsonStr.slice(4).trim();
      }

      const parsed = JSON.parse(jsonStr);

      return {
        actions: Array.isArray(parsed.actions) ? parsed.actions : [],
        targets: Array.isArray(parsed.targets) ? parsed.targets : [],
        categories: Array.isArray(parsed.categories) ? parsed.categories : [],
        primaryIntent: parsed.primaryIntent || '',
        semanticKeywords: Array.isArray(parsed.semanticKeywords) ? parsed.semanticKeywords : [],
        context: {
          domain: parsed.context?.domain || '',
          operation: parsed.context?.operation || 'write',
          platform: parsed.context?.platform
        }
      };
    } catch (error) {
      console.error('[SemanticIntentAnalyzer] Error parsing AI response:', error);
      return this.getEmptyIntent();
    }
  }

  /**
   * Fallback analysis when AI fails
   */
  private fallbackAnalysis(prompt: string): SemanticIntent {
    const keywords = this.extractKeywords(prompt);
    const category = this.identifyCategory(prompt);

    // Extract actions from keywords
    const actions = keywords.filter(k => 
      ['post', 'publish', 'send', 'create', 'write', 'share'].includes(k)
    );

    // Extract targets from keywords
    const targets = keywords.filter(k =>
      ['linkedin', 'twitter', 'instagram', 'facebook', 'gmail', 'email'].includes(k)
    );

    return {
      actions,
      targets,
      categories: [category],
      primaryIntent: `User wants to ${actions[0] || 'perform action'} ${targets[0] ? `on ${targets[0]}` : ''}`,
      semanticKeywords: keywords,
      context: {
        domain: category,
        operation: actions.length > 0 ? 'write' : 'read',
        platform: targets[0]
      }
    };
  }

  /**
   * Get empty intent structure
   */
  private getEmptyIntent(): SemanticIntent {
    return {
      actions: [],
      targets: [],
      categories: [],
      primaryIntent: '',
      semanticKeywords: [],
      context: {
        domain: 'general',
        operation: 'read'
      }
    };
  }
}

// Export singleton instance
export const semanticIntentAnalyzer = new SemanticIntentAnalyzer();
