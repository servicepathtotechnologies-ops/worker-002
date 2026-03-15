/**
 * Structured Intent Validator
 * 
 * Validates that StructuredIntent includes all required nodes from selected prompt variation
 * and adds missing nodes if validation fails.
 */

import { StructuredIntent } from './intent-structurer';
import { nodeLibrary } from '../nodes/node-library';
import { unifiedNormalizeNodeTypeString } from '../../core/utils/unified-node-type-normalizer';
import { resolveNodeType } from '../../core/utils/node-type-resolver-util';
import { nodeCapabilityRegistryDSL } from './node-capability-registry-dsl';

/**
 * Check if a node type is present in StructuredIntent
 */
export function isNodeInStructuredIntent(
  nodeType: string,
  intent: StructuredIntent
): boolean {
  const normalized = unifiedNormalizeNodeTypeString(nodeType);
  const canonical = resolveNodeType(normalized, false);
  
  // Check trigger
  if (intent.trigger) {
    const triggerNormalized = unifiedNormalizeNodeTypeString(intent.trigger);
    const triggerCanonical = resolveNodeType(triggerNormalized, false);
    if (triggerCanonical === canonical) {
      return true;
    }
  }
  
  // Check actions (outputs)
  if (intent.actions) {
    for (const action of intent.actions) {
      const actionNormalized = unifiedNormalizeNodeTypeString(action.type);
      const actionCanonical = resolveNodeType(actionNormalized, false);
      if (actionCanonical === canonical) {
        return true;
      }
    }
  }
  
  // Check dataSources
  if (intent.dataSources) {
    for (const dataSource of intent.dataSources) {
      const dsNormalized = unifiedNormalizeNodeTypeString(dataSource.type);
      const dsCanonical = resolveNodeType(dsNormalized, false);
      if (dsCanonical === canonical) {
        return true;
      }
    }
  }
  
  // Check transformations
  if (intent.transformations) {
    for (const transformation of intent.transformations) {
      const tfNormalized = unifiedNormalizeNodeTypeString(transformation.type);
      const tfCanonical = resolveNodeType(tfNormalized, false);
      if (tfCanonical === canonical) {
        return true;
      }
    }
  }
  
  return false;
}

/**
 * Add missing nodes to StructuredIntent
 * 
 * @param intent - StructuredIntent to update
 * @param missingNodeTypes - Array of node types to add
 * @returns Updated StructuredIntent with missing nodes added
 */
export function addMissingNodesToStructuredIntent(
  intent: StructuredIntent,
  missingNodeTypes: string[]
): StructuredIntent {
  const updatedIntent: StructuredIntent = {
    ...intent,
    actions: intent.actions ? [...intent.actions] : [],
    dataSources: intent.dataSources ? [...intent.dataSources] : [],
    transformations: intent.transformations ? [...intent.transformations] : [],
  };
  
  for (const nodeType of missingNodeTypes) {
    const normalized = unifiedNormalizeNodeTypeString(nodeType);
    const canonical = resolveNodeType(normalized, false);
    
    // Skip if already present
    if (isNodeInStructuredIntent(canonical, updatedIntent)) {
      console.log(`[StructuredIntentValidator] ✅ Node ${canonical} already in StructuredIntent, skipping`);
      continue;
    }
    
    // Get node schema to determine category
    const schema = nodeLibrary.getSchema(canonical);
    if (!schema) {
      console.warn(`[StructuredIntentValidator] ⚠️  Node type "${canonical}" not found in library, skipping`);
      continue;
    }
    
    // Determine node category using capability registry
    const capabilities = nodeCapabilityRegistryDSL.getCapabilities(canonical);
    const isDataSource = nodeCapabilityRegistryDSL.isDataSource(canonical);
    const isTransformation = nodeCapabilityRegistryDSL.isTransformation(canonical);
    const isOutput = nodeCapabilityRegistryDSL.isOutput(canonical);
    const isTrigger = schema.category === 'trigger';
    
    // Determine default operation
    let operation = 'read';
    if (isOutput || capabilities.includes('send') || capabilities.includes('write')) {
      operation = 'send';
    } else if (isTransformation || capabilities.includes('transform')) {
      operation = 'transform';
    } else if (isDataSource || capabilities.includes('read')) {
      operation = 'read';
    }
    
    // Add to appropriate category
    if (isTrigger) {
      // Triggers are handled separately - skip
      console.log(`[StructuredIntentValidator] ⚠️  Node ${canonical} is a trigger - triggers are handled separately, skipping`);
    } else if (isDataSource && !isOutput) {
      // Pure data source
      updatedIntent.dataSources = updatedIntent.dataSources || [];
      updatedIntent.dataSources.push({
        type: canonical,
        operation: operation as any,
      });
      console.log(`[StructuredIntentValidator] ✅ Added ${canonical} to dataSources (operation: ${operation})`);
    } else if (isTransformation) {
      // Transformation
      updatedIntent.transformations = updatedIntent.transformations || [];
      updatedIntent.transformations.push({
        type: canonical,
        operation: operation as any,
      });
      console.log(`[StructuredIntentValidator] ✅ Added ${canonical} to transformations (operation: ${operation})`);
    } else if (isOutput) {
      // Output
      updatedIntent.actions = updatedIntent.actions || [];
      updatedIntent.actions.push({
        type: canonical,
        operation: operation as any,
      });
      console.log(`[StructuredIntentValidator] ✅ Added ${canonical} to actions (operation: ${operation})`);
    } else {
      // Default to action (output)
      updatedIntent.actions = updatedIntent.actions || [];
      updatedIntent.actions.push({
        type: canonical,
        operation: operation as any,
      });
      console.log(`[StructuredIntentValidator] ✅ Added ${canonical} to actions (default, operation: ${operation})`);
    }
  }
  
  return updatedIntent;
}

/**
 * Validate StructuredIntent includes all required nodes from selected variation
 * 
 * @param intent - StructuredIntent to validate
 * @param requiredNodeTypes - Array of node types that must be present
 * @param contextPrompt - Optional context prompt (e.g., original prompt) for disambiguation
 * @returns Validation result with missing nodes
 */
export function validateStructuredIntentIncludesNodes(
  intent: StructuredIntent,
  requiredNodeTypes: string[],
  contextPrompt?: string
): {
  valid: boolean;
  missingNodes: string[];
} {
  const missingNodes: string[] = [];
  const contextLower = (contextPrompt || '').toLowerCase();
  const contextMentionsGmail = contextLower.includes('gmail') || 
                               contextLower.includes('google mail') || 
                               contextLower.includes('google email');
  const contextMentionsGoogleServices = contextLower.includes('google sheets') || 
                                       contextLower.includes('google');
  
  for (const nodeType of requiredNodeTypes) {
    const normalized = unifiedNormalizeNodeTypeString(nodeType);
    const canonical = resolveNodeType(normalized, false);
    
    // ✅ CONTEXT-AWARE VALIDATION: If required node is generic "email" but context mentions Gmail,
    // check if google_gmail is present instead
    if (canonical === 'email' && (contextMentionsGmail || contextMentionsGoogleServices)) {
      console.log(`[StructuredIntentValidator] 🔍 Validating generic 'email' with context-aware mapping:`);
      console.log(`[StructuredIntentValidator]   - Required node: ${canonical}`);
      console.log(`[StructuredIntentValidator]   - Context mentions Gmail: ${contextMentionsGmail ? '✅' : '❌'}`);
      console.log(`[StructuredIntentValidator]   - Context mentions Google services: ${contextMentionsGoogleServices ? '✅' : '❌'}`);
      
      // Check if google_gmail is present (acceptable alternative)
      if (isNodeInStructuredIntent('google_gmail', intent)) {
        console.log(`[StructuredIntentValidator] ✅ Context-aware validation PASSED: 'google_gmail' satisfies 'email' requirement`);
        continue; // Skip - google_gmail satisfies the "email" requirement
      } else {
        console.log(`[StructuredIntentValidator] ⚠️  Context-aware validation: 'google_gmail' NOT found in intent (should be added)`);
      }
    }
    
    if (!isNodeInStructuredIntent(canonical, intent)) {
      // ✅ CONTEXT-AWARE MAPPING: If missing node is "email" and context mentions Gmail, suggest google_gmail
      if (canonical === 'email' && (contextMentionsGmail || contextMentionsGoogleServices)) {
        missingNodes.push('google_gmail'); // Suggest google_gmail instead of generic email
        console.warn(`[StructuredIntentValidator] ❌ Missing node from StructuredIntent: google_gmail (context-aware: "email" → google_gmail based on context)`);
      } else {
        missingNodes.push(canonical);
        console.warn(`[StructuredIntentValidator] ❌ Missing node from StructuredIntent: ${canonical} (from "${nodeType}")`);
      }
    }
  }
  
  return {
    valid: missingNodes.length === 0,
    missingNodes,
  };
}
