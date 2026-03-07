/**
 * Intent Validator
 * 
 * ✅ PHASE 2: Validates SimpleIntent completeness
 * 
 * This validator:
 * - Checks if SimpleIntent has minimum required entities
 * - Validates entity consistency
 * - Provides repair suggestions
 * - Ensures intent is actionable
 * 
 * Architecture Rule:
 * - Validates SimpleIntent BEFORE passing to planner
 * - Provides actionable feedback for repair
 */

import { SimpleIntent } from './simple-intent';
import { unifiedNodeRegistry } from '../../core/registry/unified-node-registry';
import { unifiedNormalizeNodeTypeString } from '../../core/utils/unified-node-type-normalizer';

export interface IntentValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  suggestions?: string[]; // Suggestions for repair
}

export class IntentValidator {
  private static instance: IntentValidator;
  
  private constructor() {}
  
  static getInstance(): IntentValidator {
    if (!IntentValidator.instance) {
      IntentValidator.instance = new IntentValidator();
    }
    return IntentValidator.instance;
  }
  
  /**
   * Validate SimpleIntent completeness
   * 
   * @param intent - SimpleIntent to validate
   * @returns Validation result with errors, warnings, and suggestions
   */
  validate(intent: SimpleIntent): IntentValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    const suggestions: string[] = [];
    
    // ✅ CHECK 1: Must have at least one verb (action)
    if (!intent.verbs || intent.verbs.length === 0) {
      errors.push('No actions (verbs) found in intent. Intent must specify what to do.');
      suggestions.push('Add action verbs like "send", "read", "create", "update", etc.');
    }
    
    // ✅ CHECK 2: Must have at least one source OR destination
    const hasSource = intent.sources && intent.sources.length > 0;
    const hasDestination = intent.destinations && intent.destinations.length > 0;
    
    if (!hasSource && !hasDestination) {
      errors.push('No data sources or destinations found. Intent must specify where data comes from or goes to.');
      suggestions.push('Add sources (e.g., "Gmail", "Google Sheets") or destinations (e.g., "Slack", "Drive")');
    }
    
    // ✅ CHECK 3: If has verbs but no sources/destinations, warn
    if (intent.verbs.length > 0 && !hasSource && !hasDestination) {
      warnings.push('Actions specified but no sources or destinations found. Workflow may be incomplete.');
    }
    
    // ✅ CHECK 4: Validate trigger (if provided) - using registry (UNIVERSAL)
    if (intent.trigger) {
      // ✅ UNIVERSAL: Get valid trigger types from registry
      const validTriggerTypes = this.getValidTriggerTypes();
      if (!validTriggerTypes.includes(intent.trigger.type)) {
        errors.push(`Invalid trigger type: ${intent.trigger.type}. Must be one of: ${validTriggerTypes.join(', ')}`);
      }
    }
    
    // ✅ CHECK 5: Validate conditions (if provided)
    if (intent.conditions && intent.conditions.length > 0) {
      for (const condition of intent.conditions) {
        if (!condition.description || condition.description.trim().length === 0) {
          warnings.push('Condition found but description is empty');
        }
      }
    }
    
    // ✅ CHECK 6: Check for common inconsistencies
    // If sources and destinations overlap, warn
    if (hasSource && hasDestination) {
      const overlap = intent.sources.filter(s => 
        intent.destinations.some(d => 
          s.toLowerCase().includes(d.toLowerCase()) || 
          d.toLowerCase().includes(s.toLowerCase())
        )
      );
      
      if (overlap.length > 0) {
        warnings.push(`Sources and destinations overlap: ${overlap.join(', ')}. This may indicate ambiguity.`);
      }
    }
    
    // ✅ CHECK 7: Check if intent is actionable
    const isActionable = intent.verbs.length > 0 && (hasSource || hasDestination);
    if (!isActionable) {
      errors.push('Intent is not actionable. Must have at least one verb and one source or destination.');
    }
    
    // ✅ CHECK 8: Validate transformations (if provided) - using registry (UNIVERSAL)
    if (intent.transformations && intent.transformations.length > 0) {
      const validTransformations = this.getValidTransformations();
      for (const transformation of intent.transformations) {
        const transformationLower = transformation.toLowerCase();
        const isValid = validTransformations.some(t => t.toLowerCase() === transformationLower);
        if (!isValid) {
          warnings.push(`Unknown transformation: ${transformation}. May not be supported.`);
        }
      }
    }
    
    return {
      valid: errors.length === 0,
      errors,
      warnings,
      suggestions: suggestions.length > 0 ? suggestions : undefined,
    };
  }
  
  /**
   * Get valid trigger types from registry (UNIVERSAL)
   */
  private getValidTriggerTypes(): Array<'schedule' | 'manual' | 'webhook' | 'event' | 'form' | 'chat'> {
    // ✅ UNIVERSAL: Get trigger types from registry
    const allNodeTypes = unifiedNodeRegistry.getAllTypes();
    const triggerTypes = new Set<string>();
    
    for (const nodeType of allNodeTypes) {
      const nodeDef = unifiedNodeRegistry.get(nodeType);
      if (!nodeDef) continue;
      
      // Check if node is a trigger
      if (nodeDef.category === 'trigger') {
        const typeLower = nodeType.toLowerCase();
        if (typeLower.includes('schedule') || typeLower.includes('interval')) {
          triggerTypes.add('schedule');
        } else if (typeLower.includes('webhook')) {
          triggerTypes.add('webhook');
        } else if (typeLower.includes('form')) {
          triggerTypes.add('form');
        } else if (typeLower.includes('chat')) {
          triggerTypes.add('chat');
        } else if (typeLower.includes('manual')) {
          triggerTypes.add('manual');
        } else {
          triggerTypes.add('event');
        }
      }
    }
    
    // Always include manual as fallback
    triggerTypes.add('manual');
    
    return Array.from(triggerTypes) as Array<'schedule' | 'manual' | 'webhook' | 'event' | 'form' | 'chat'>;
  }
  
  /**
   * Get valid transformations from registry (UNIVERSAL)
   */
  private getValidTransformations(): string[] {
    // ✅ UNIVERSAL: Get transformation capabilities from registry
    const allNodeTypes = unifiedNodeRegistry.getAllTypes();
    const transformations = new Set<string>();
    
    for (const nodeType of allNodeTypes) {
      const nodeDef = unifiedNodeRegistry.get(nodeType);
      if (!nodeDef) continue;
      
      // Check if node is a transformation
      if (nodeDef.category === 'transformation' || nodeDef.category === 'ai' || nodeDef.category === 'logic') {
        const label = nodeDef.label || nodeType;
        const labelLower = label.toLowerCase();
        
        // Extract transformation name from label (remove common suffixes)
        const transformation = labelLower.replace(/\s+(node|action|processor|transformer)$/, '');
        if (transformation.length > 2) {
          transformations.add(transformation);
        }
        
        // Also add keywords as transformations
        if (nodeDef.tags) {
          for (const tag of nodeDef.tags) {
            if (tag.length > 2) {
              transformations.add(tag.toLowerCase());
            }
          }
        }
      }
    }
    
    return Array.from(transformations);
  }
  
  /**
   * Check if intent has minimum required entities
   */
  hasMinimumEntities(intent: SimpleIntent): boolean {
    return (
      intent.verbs.length > 0 &&
      (intent.sources.length > 0 || intent.destinations.length > 0)
    );
  }
  
  /**
   * Get completeness score (0-1)
   */
  getCompletenessScore(intent: SimpleIntent): number {
    let score = 0;
    let maxScore = 0;
    
    // Verbs (required)
    maxScore += 1;
    if (intent.verbs.length > 0) {
      score += Math.min(1, intent.verbs.length / 2); // Cap at 1
    }
    
    // Sources or destinations (required)
    maxScore += 1;
    if (intent.sources.length > 0 || intent.destinations.length > 0) {
      score += 1;
    }
    
    // Trigger (optional but helpful)
    maxScore += 0.5;
    if (intent.trigger) {
      score += 0.5;
    }
    
    // Transformations (optional)
    maxScore += 0.5;
    if (intent.transformations && intent.transformations.length > 0) {
      score += 0.5;
    }
    
    return maxScore > 0 ? score / maxScore : 0;
  }
}

// Export singleton instance
export const intentValidator = IntentValidator.getInstance();
