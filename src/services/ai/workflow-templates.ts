/**
 * Workflow Pipeline Templates
 * 
 * Pre-defined workflow structures that match common intent patterns.
 * Templates provide deterministic pipeline shapes that improve consistency.
 * 
 * Usage:
 * - Planner/IntentStructurer analyzes user intent
 * - Template selector matches intent to template
 * - Template guides DSL generation with known-good structure
 */

import { StructuredIntent } from './intent-structurer';

/**
 * Workflow Template Structure
 * Defines a canonical pipeline pattern
 */
export interface WorkflowTemplate {
  /**
   * Unique template identifier
   */
  id: string;
  
  /**
   * Human-readable template name
   */
  name: string;
  
  /**
   * Template description
   */
  description: string;
  
  /**
   * Pipeline structure (defines node types and order)
   */
  pipeline: {
    /**
     * Trigger type (e.g., 'manual_trigger', 'schedule', 'webhook')
     */
    trigger: string;
    
    /**
     * Data source node types (e.g., ['google_sheets', 'database_read'])
     * Use '*' for any data source
     */
    dataSources: string[];
    
    /**
     * Transformation node types (e.g., ['ai_chat_model'])
     * Use '*' for any transformation
     */
    transformations: string[];
    
    /**
     * Output node types (e.g., ['google_gmail', 'slack_message'])
     * Use '*' for any output
     */
    outputs: string[];
  };
  
  /**
   * Intent patterns that match this template
   * Keywords/operations that indicate this template should be used
   */
  intentPatterns: string[];
  
  /**
   * Required capabilities for this template
   * Used for capability-based matching
   */
  requiredCapabilities: string[];
  
  /**
   * Priority (higher = more specific, matched first)
   */
  priority: number;
}

/**
 * Template Registry
 * All available workflow templates
 */
export const WORKFLOW_TEMPLATES: WorkflowTemplate[] = [
  {
    id: 'AI_SUMMARY_PIPELINE',
    name: 'AI Summary Pipeline',
    description: 'Read data, summarize with AI, send summary',
    pipeline: {
      trigger: '*', // Any trigger
      dataSources: ['*'], // Any data source
      transformations: ['ai_chat_model'],
      outputs: ['*'], // Any output
    },
    intentPatterns: [
      'summarize',
      'summarise',
      'summary',
      'summarize data',
      'summarize and send',
      'ai summary',
    ],
    requiredCapabilities: ['read_data', 'transform', 'output'],
    priority: 10,
  },
  {
    id: 'DATA_SYNC_PIPELINE',
    name: 'Data Sync Pipeline',
    description: 'Read from source, write to destination',
    pipeline: {
      trigger: '*',
      dataSources: ['*'],
      transformations: [], // No transformations
      outputs: ['*'],
    },
    intentPatterns: [
      'sync',
      'copy',
      'transfer',
      'move data',
      'export',
      'import',
    ],
    requiredCapabilities: ['read_data', 'write_data'],
    priority: 8,
  },
  {
    id: 'AI_ANALYSIS_PIPELINE',
    name: 'AI Analysis Pipeline',
    description: 'Read data, analyze with AI, send results',
    pipeline: {
      trigger: '*',
      dataSources: ['*'],
      transformations: ['ai_chat_model'],
      outputs: ['*'],
    },
    intentPatterns: [
      'analyze',
      'analyse',
      'analysis',
      'analyze data',
      'ai analysis',
    ],
    requiredCapabilities: ['read_data', 'transform', 'output'],
    priority: 10,
  },
  {
    id: 'NOTIFICATION_PIPELINE',
    name: 'Notification Pipeline',
    description: 'Trigger event, send notification',
    pipeline: {
      trigger: '*',
      dataSources: [], // No data source needed
      transformations: [], // No transformations
      outputs: ['*'], // Any output (email, slack, etc.)
    },
    intentPatterns: [
      'notify',
      'notification',
      'alert',
      'send notification',
      'notify when',
    ],
    requiredCapabilities: ['output'],
    priority: 7,
  },
  {
    id: 'DATA_TRANSFORM_PIPELINE',
    name: 'Data Transform Pipeline',
    description: 'Read data, transform, write transformed data',
    pipeline: {
      trigger: '*',
      dataSources: ['*'],
      transformations: ['*'], // Any transformation
      outputs: ['*'],
    },
    intentPatterns: [
      'transform',
      'process',
      'convert',
      'format',
      'modify data',
    ],
    requiredCapabilities: ['read_data', 'transform', 'write_data'],
    priority: 9,
  },
];

/**
 * Template Selection Result
 */
export interface TemplateSelectionResult {
  /**
   * Selected template (null if no match)
   */
  template: WorkflowTemplate | null;
  
  /**
   * Match confidence (0.0 to 1.0)
   */
  confidence: number;
  
  /**
   * Match reason
   */
  reason: string;
}

/**
 * Template Selector
 * Matches StructuredIntent to workflow templates
 */
export class WorkflowTemplateSelector {
  /**
   * Select best matching template for intent
   * 
   * @param intent - Structured intent from planner
   * @param originalPrompt - Original user prompt (for keyword matching)
   * @returns Template selection result
   */
  selectTemplate(
    intent: StructuredIntent,
    originalPrompt?: string
  ): TemplateSelectionResult {
    const promptLower = (originalPrompt || '').toLowerCase();
    const intentActions = intent.actions || [];
    const intentTransformations = intent.transformations || [];
    const intentDataSources = intent.dataSources || [];
    
    // Collect all operations and types from intent
    const allOperations = [
      ...intentActions.map(a => (a.operation || '').toLowerCase()),
      ...intentTransformations.map(t => (t.operation || '').toLowerCase()),
      ...intentDataSources.map(d => (d.operation || '').toLowerCase()),
    ].filter(Boolean);
    
    const allTypes = [
      ...intentActions.map(a => (a.type || '').toLowerCase()),
      ...intentTransformations.map(t => (t.type || '').toLowerCase()),
      ...intentDataSources.map(d => (d.type || '').toLowerCase()),
    ].filter(Boolean);
    
    // Score each template
    const scoredTemplates: Array<{
      template: WorkflowTemplate;
      score: number;
      reasons: string[];
    }> = [];
    
    for (const template of WORKFLOW_TEMPLATES) {
      let score = 0;
      const reasons: string[] = [];
      
      // 1. Keyword matching in prompt (high weight)
      for (const pattern of template.intentPatterns) {
        if (promptLower.includes(pattern.toLowerCase())) {
          score += 5;
          reasons.push(`Prompt contains keyword: "${pattern}"`);
        }
      }
      
      // 2. Operation matching (medium weight)
      for (const pattern of template.intentPatterns) {
        if (allOperations.some(op => op.includes(pattern.toLowerCase()))) {
          score += 3;
          reasons.push(`Operation matches pattern: "${pattern}"`);
        }
      }
      
      // 3. Capability matching (high weight)
      const intentCapabilities = this.extractCapabilitiesFromIntent(intent);
      const capabilityMatch = template.requiredCapabilities.filter(cap =>
        intentCapabilities.includes(cap)
      ).length;
      if (capabilityMatch > 0) {
        score += capabilityMatch * 2;
        reasons.push(`Capability match: ${capabilityMatch}/${template.requiredCapabilities.length}`);
      }
      
      // 4. Pipeline structure matching (medium weight)
      const structureMatch = this.matchPipelineStructure(template, intent);
      if (structureMatch > 0) {
        score += structureMatch;
        reasons.push(`Pipeline structure match: ${structureMatch}`);
      }
      
      // 5. Priority boost
      score += template.priority * 0.1;
      
      if (score > 0) {
        scoredTemplates.push({ template, score, reasons });
      }
    }
    
    // Sort by score (highest first)
    scoredTemplates.sort((a, b) => b.score - a.score);
    
    // Select best match if score is above threshold
    if (scoredTemplates.length > 0 && scoredTemplates[0].score >= 3) {
      const best = scoredTemplates[0];
      return {
        template: best.template,
        confidence: Math.min(1.0, best.score / 10), // Normalize to 0-1
        reason: best.reasons.join('; '),
      };
    }
    
    // No match found
    return {
      template: null,
      confidence: 0,
      reason: 'No template matched the intent',
    };
  }
  
  /**
   * Extract capabilities from structured intent
   */
  private extractCapabilitiesFromIntent(intent: StructuredIntent): string[] {
    const capabilities: string[] = [];
    const allActions = [
      ...(intent.actions || []),
      ...(intent.dataSources || []),
      ...(intent.transformations || []),
    ];
    
    for (const action of allActions) {
      const operation = (action.operation || '').toLowerCase();
      
      // Map operations to capabilities
      if (['read', 'fetch', 'get', 'query'].includes(operation)) {
        capabilities.push('read_data');
      }
      if (['write', 'send', 'create', 'update', 'notify'].includes(operation)) {
        capabilities.push('write_data');
        if (['send', 'notify'].includes(operation)) {
          capabilities.push('output');
        }
      }
      if (['summarize', 'analyze', 'transform', 'process'].includes(operation)) {
        capabilities.push('transform');
      }
    }
    
    return [...new Set(capabilities)]; // Deduplicate
  }
  
  /**
   * Match template pipeline structure to intent
   */
  private matchPipelineStructure(
    template: WorkflowTemplate,
    intent: StructuredIntent
  ): number {
    let match = 0;
    
    // Check if intent has required components
    const hasDataSources = (intent.dataSources?.length || 0) > 0 || 
                          (intent.actions?.some(a => ['read', 'fetch', 'get'].includes(a.operation?.toLowerCase() || '')) || false);
    const hasTransformations = (intent.transformations?.length || 0) > 0 ||
                              (intent.actions?.some(a => ['summarize', 'analyze', 'transform'].includes(a.operation?.toLowerCase() || '')) || false);
    const hasOutputs = (intent.actions?.some(a => ['send', 'write', 'notify'].includes(a.operation?.toLowerCase() || '')) || false);
    
    // Match template requirements
    if (template.pipeline.dataSources.length > 0 && hasDataSources) {
      match += 1;
    }
    if (template.pipeline.transformations.length > 0 && hasTransformations) {
      match += 1;
    }
    if (template.pipeline.outputs.length > 0 && hasOutputs) {
      match += 1;
    }
    
    return match;
  }
  
  /**
   * Get template by ID
   */
  getTemplateById(templateId: string): WorkflowTemplate | null {
    return WORKFLOW_TEMPLATES.find(t => t.id === templateId) || null;
  }
  
  /**
   * Get all templates
   */
  getAllTemplates(): WorkflowTemplate[] {
    return [...WORKFLOW_TEMPLATES];
  }
}

// Export singleton instance
export const workflowTemplateSelector = new WorkflowTemplateSelector();
