/**
 * Intent Completeness Validator
 * 
 * Validates that structured intent contains sufficient information to build a workflow.
 * 
 * Rules:
 * - Workflow cannot be generated unless intent contains:
 *   - at least one concrete action OR data source
 *   - at least one resolvable node type
 * - If prompt is abstract (e.g., "recruitment workflow", "crm workflow", "marketing workflow"):
 *   - do not build workflow
 *   - return clarification questions instead
 */

import { StructuredIntent } from './intent-structurer';
import { resolveNodeType } from '../../core/utils/node-type-resolver-util';
import { nodeLibrary } from '../nodes/node-library';
import { domainIntentHandler } from './domain-intent-handler';

export interface IntentCompletenessResult {
  complete: boolean;
  reason?: string;
}

export class IntentCompletenessValidator {
  // Note: Abstract pattern detection removed - vague prompts are handled by intent_auto_expander

  /**
   * Validate intent completeness
   */
  validateIntentCompleteness(
    intent: StructuredIntent,
    userPrompt?: string
  ): IntentCompletenessResult {
    console.log(`[IntentCompletenessValidator] Validating intent completeness...`);

    // Note: Abstract prompts will be handled by intent_auto_expander in the pipeline
    // We only validate that the intent structure is valid, not whether it's complete

    // Check 2: Intent must have at least one concrete action OR data source
    // Note: If missing, intent_auto_expander will add assumptions
    const hasActions = intent.actions && intent.actions.length > 0;
    const hasDataSources = this.hasDataSources(intent);
    
    if (!hasActions && !hasDataSources) {
      console.warn(`[IntentCompletenessValidator] ⚠️  Intent has no actions or data sources - will be expanded by intent_auto_expander`);
      // Return incomplete but don't block - intent_auto_expander will handle it
      return {
        complete: false,
        reason: 'Intent has no actions or data sources - will be expanded by intent_auto_expander',
      };
    }

    // Check 3: At least one resolvable node type
    // Note: If missing, intent_auto_expander will add assumptions
    const resolvableNodeTypes = this.getResolvableNodeTypes(intent);
    if (resolvableNodeTypes.length === 0) {
      console.warn(`[IntentCompletenessValidator] ⚠️  No resolvable node types found in intent - will be expanded by intent_auto_expander`);
      return {
        complete: false,
        reason: 'No resolvable node types found - will be expanded by intent_auto_expander',
      };
    }

    // Check 4: ALL node types must exist in NodeLibrary (no synthetic nodes allowed)
    // Note: Invalid types will be normalized by nodeTypeNormalizationService
    const invalidNodeTypes = this.validateAllNodeTypesExist(intent);
    if (invalidNodeTypes.length > 0) {
      console.warn(`[IntentCompletenessValidator] ⚠️  Found ${invalidNodeTypes.length} invalid node type(s) not in NodeLibrary - will be normalized`);
      // Don't block - nodeTypeNormalizationService will handle normalization
      return {
        complete: false,
        reason: `Invalid node types detected: ${invalidNodeTypes.join(', ')}. Will be normalized by nodeTypeNormalizationService.`,
      };
    }

    console.log(`[IntentCompletenessValidator] ✅ Intent is complete`);
    console.log(`[IntentCompletenessValidator]   Actions: ${intent.actions?.length || 0}`);
    console.log(`[IntentCompletenessValidator]   Resolvable node types: ${resolvableNodeTypes.length}`);
    console.log(`[IntentCompletenessValidator]   All node types validated in NodeLibrary`);

    return {
      complete: true,
    };
  }

  // Note: detectAbstractPrompt method removed - vague prompts are handled by intent_auto_expander

  /**
   * Check if intent has data sources
   * Data sources can be:
   * - Actions with data source node types (google_sheets, database_read, etc.)
   * - Explicit data_sources field (if it exists in future)
   */
  private hasDataSources(intent: StructuredIntent): boolean {
    if (!intent.actions || intent.actions.length === 0) {
      return false;
    }

    const dataSourceNodeTypes = [
      'google_sheets', 'sheets',
      'database_read', 'database_write', 'database',
      'supabase', 'postgresql', 'mysql', 'mongodb', 'redis',
      'aws_s3', 's3',
      'dropbox', 'onedrive',
      'airtable',
      'notion',
      'http_request', 'http_post', // Can be data sources
      'webhook', // Can be data source
    ];

    return intent.actions.some(action => {
      const nodeType = resolveNodeType(action.type);
      return dataSourceNodeTypes.some(dsType => 
        nodeType.includes(dsType) || dsType === nodeType
      );
    });
  }

  /**
   * Get resolvable node types from intent
   * A node type is resolvable if it exists in the node library
   */
  private getResolvableNodeTypes(intent: StructuredIntent): string[] {
    const resolvableTypes: string[] = [];

    if (!intent.actions || intent.actions.length === 0) {
      return resolvableTypes;
    }

    for (const action of intent.actions) {
      try {
        // Try to resolve node type
        const resolvedType = resolveNodeType(action.type);
        
        // Check if resolved type exists in node library
        const schema = nodeLibrary.getSchema(resolvedType);
        if (schema) {
          resolvableTypes.push(resolvedType);
          console.log(`[IntentCompletenessValidator] ✅ Resolvable node type: ${action.type} → ${resolvedType}`);
        } else {
          console.warn(`[IntentCompletenessValidator] ⚠️  Node type not found in library: ${action.type} (resolved: ${resolvedType})`);
        }
      } catch (error) {
        console.warn(`[IntentCompletenessValidator] ⚠️  Failed to resolve node type: ${action.type}`, error);
      }
    }

    return resolvableTypes;
  }

  /**
   * Validate that ALL node types in intent exist in NodeLibrary
   * Returns array of invalid node types (not found in library)
   * CRITICAL: No synthetic node generation allowed
   */
  private validateAllNodeTypesExist(intent: StructuredIntent): string[] {
    const invalidTypes: string[] = [];

    if (!intent.actions || intent.actions.length === 0) {
      return invalidTypes;
    }

    for (const action of intent.actions) {
      try {
        // Try to resolve node type (handles aliases)
        const resolvedType = resolveNodeType(action.type);
        
        // Check if resolved type exists in node library
        const schema = nodeLibrary.getSchema(resolvedType);
        if (!schema) {
          invalidTypes.push(action.type);
          console.warn(`[IntentCompletenessValidator] ❌ Invalid node type: "${action.type}" (resolved: "${resolvedType}") not found in NodeLibrary`);
        } else {
          console.log(`[IntentCompletenessValidator] ✅ Node type validated: "${action.type}" → "${resolvedType}"`);
        }
      } catch (error) {
        // Resolution failed - node type is invalid
        invalidTypes.push(action.type);
        console.warn(`[IntentCompletenessValidator] ❌ Failed to resolve node type: "${action.type}"`, error);
      }
    }

    // Also validate trigger type
    if (intent.trigger) {
      try {
        const resolvedTrigger = resolveNodeType(intent.trigger);
        const triggerSchema = nodeLibrary.getSchema(resolvedTrigger);
        if (!triggerSchema) {
          invalidTypes.push(intent.trigger);
          console.warn(`[IntentCompletenessValidator] ❌ Invalid trigger type: "${intent.trigger}" (resolved: "${resolvedTrigger}") not found in NodeLibrary`);
        }
      } catch (error) {
        invalidTypes.push(intent.trigger);
        console.warn(`[IntentCompletenessValidator] ❌ Failed to resolve trigger type: "${intent.trigger}"`, error);
      }
    }

    return invalidTypes;
  }
}

// Export singleton instance
export const intentCompletenessValidator = new IntentCompletenessValidator();
