/**
 * Workflow Pattern Matcher
 * Matches workflow intent to predefined patterns
 */

import type { WorkflowIntent } from './workflow-intent-parser';

export interface PatternMatch {
  success: boolean;
  pattern?: string;
  confidence?: number;
  error?: string;
  suggestions?: string[];
  missingCapabilities?: string[];
}

export interface WorkflowPattern {
  name: string;
  description: string;
  requiredCapabilities: string[];
  optionalCapabilities: string[];
  confidenceThreshold: number;
  matcher: (intent: WorkflowIntent) => number;
}

/**
 * Workflow Pattern Matcher
 * Matches intent to workflow patterns with confidence scoring
 */
export class WorkflowPatternMatcher {
  private patterns: WorkflowPattern[];

  constructor() {
    this.patterns = this.initializePatterns();
  }

  /**
   * Match intent to a pattern
   */
  async matchPattern(intent: WorkflowIntent): Promise<PatternMatch> {
    const scores: Array<{ pattern: string; score: number }> = [];

    for (const pattern of this.patterns) {
      const score = pattern.matcher(intent);
      if (score >= pattern.confidenceThreshold) {
        scores.push({ pattern: pattern.name, score });
      }
    }

    if (scores.length === 0) {
      return {
        success: false,
        error: 'No matching pattern found for the given intent',
        suggestions: [
          'Try specifying a trigger type (schedule, manual, webhook, form)',
          'Specify an action type (send, post, sync, etc.)',
          'Specify a platform (slack, email, linkedin, etc.)'
        ]
      };
    }

    // Sort by score descending
    scores.sort((a, b) => b.score - a.score);

    // If multiple patterns match, check if top score is significantly higher
    if (scores.length > 1 && scores[0].score - scores[1].score < 0.1) {
      return {
        success: false,
        error: 'Multiple patterns match. Please clarify your intent.',
        suggestions: [
          `Pattern 1: ${scores[0].pattern} (confidence: ${(scores[0].score * 100).toFixed(0)}%)`,
          `Pattern 2: ${scores[1].pattern} (confidence: ${(scores[1].score * 100).toFixed(0)}%)`
        ]
      };
    }

    const matchedPattern = this.patterns.find(p => p.name === scores[0].pattern);
    if (!matchedPattern) {
      return {
        success: false,
        error: 'Pattern matching error'
      };
    }

    // Check required capabilities
    const missingCapabilities = this.checkCapabilities(intent, matchedPattern);
    if (missingCapabilities.length > 0) {
      return {
        success: false,
        error: 'Missing required capabilities for this pattern',
        missingCapabilities,
        suggestions: [`Required: ${missingCapabilities.join(', ')}`]
      };
    }

    return {
      success: true,
      pattern: matchedPattern.name,
      confidence: scores[0].score
    };
  }

  /**
   * Check if intent has required capabilities
   */
  private checkCapabilities(intent: WorkflowIntent, pattern: WorkflowPattern): string[] {
    const missing: string[] = [];

    for (const capability of pattern.requiredCapabilities) {
      const [type, value] = capability.split(':');
      
      if (type === 'trigger' && !intent.trigger) {
        missing.push(capability);
      } else if (type === 'action' && !intent.action) {
        missing.push(capability);
      } else if (type === 'platform' && !intent.platform) {
        missing.push(capability);
      }
    }

    return missing;
  }

  /**
   * Initialize workflow patterns
   */
  private initializePatterns(): WorkflowPattern[] {
    return [
      {
        name: 'scheduled_post',
        description: 'Scheduled content posting to a platform',
        requiredCapabilities: ['trigger:schedule', 'action:send'],
        optionalCapabilities: ['platform:slack', 'platform:email', 'platform:linkedin'],
        confidenceThreshold: 0.7,
        matcher: (intent) => {
          let score = 0;
          if (intent.trigger === 'schedule') score += 0.4;
          if (intent.action === 'send' || intent.action === 'post') score += 0.3;
          if (intent.platform) score += 0.3;
          return score;
        }
      },
      {
        name: 'form_to_database',
        description: 'Form submission to database storage',
        requiredCapabilities: ['trigger:form', 'action:write'],
        optionalCapabilities: ['platform:database', 'platform:supabase'],
        confidenceThreshold: 0.7,
        matcher: (intent) => {
          let score = 0;
          if (intent.trigger === 'form') score += 0.5;
          if (intent.action === 'write' || intent.action === 'save') score += 0.3;
          if (intent.platform?.includes('database') || intent.platform?.includes('supabase')) score += 0.2;
          return score;
        }
      },
      {
        name: 'webhook_to_api',
        description: 'Webhook trigger to API call',
        requiredCapabilities: ['trigger:webhook', 'action:read'],
        optionalCapabilities: [],
        confidenceThreshold: 0.7,
        matcher: (intent) => {
          let score = 0;
          if (intent.trigger === 'webhook') score += 0.5;
          if (intent.action === 'read' || intent.action === 'fetch') score += 0.3;
          if (intent.data_format === 'json') score += 0.2;
          return score;
        }
      },
      {
        name: 'single_platform_chatbot',
        description: 'Chatbot on a single platform',
        requiredCapabilities: ['trigger:manual', 'action:send'],
        optionalCapabilities: ['platform:slack', 'platform:discord'],
        confidenceThreshold: 0.7,
        matcher: (intent) => {
          let score = 0;
          if (intent.trigger === 'manual_trigger' || intent.trigger === 'form') score += 0.3;
          if (intent.content_type === 'text' || intent.action === 'send') score += 0.3;
          if (intent.platform === 'slack' || intent.platform === 'discord') score += 0.4;
          return score;
        }
      },
      {
        name: 'data_sync_pipeline',
        description: 'Data synchronization between systems',
        requiredCapabilities: ['trigger:schedule', 'action:sync'],
        optionalCapabilities: ['platform:google_sheets', 'platform:database'],
        confidenceThreshold: 0.7,
        matcher: (intent) => {
          let score = 0;
          if (intent.trigger === 'schedule') score += 0.3;
          if (intent.action === 'sync' || intent.action === 'synchronize') score += 0.4;
          if (intent.platform?.includes('sheets') || intent.platform?.includes('database')) score += 0.3;
          return score;
        }
      },
      {
        name: 'event_notification',
        description: 'Event-triggered notifications',
        requiredCapabilities: ['trigger:webhook', 'action:send'],
        optionalCapabilities: ['platform:slack', 'platform:email'],
        confidenceThreshold: 0.7,
        matcher: (intent) => {
          let score = 0;
          if (intent.trigger === 'webhook' || intent.trigger === 'form') score += 0.4;
          if (intent.action === 'send' || intent.content_type === 'notification') score += 0.3;
          if (intent.platform === 'slack' || intent.platform === 'email') score += 0.3;
          return score;
        }
      }
    ];
  }
}
