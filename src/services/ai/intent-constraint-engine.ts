/**
 * Intent Constraint Engine
 * 
 * Generates minimal node set from user intent.
 * 
 * Rules:
 * - Extract required capabilities from normalized prompt
 * - Map capabilities → node types using registry
 * - Only allow nodes required to satisfy intent
 * - Reject or remove extra nodes automatically
 * - No loops unless explicitly requested
 * - No repair nodes unless failure handling required
 * 
 * Example:
 *   input: "Get data from Google Sheets, summarize, send email"
 *   output nodes: [google_sheets, text_summarizer, gmail]
 */

import { StructuredIntent } from './intent-structurer';
import { nodeLibrary } from '../nodes/node-library';
import { capabilityResolver } from './capability-resolver';
import { normalizeNodeType } from '../../core/utils/node-type-normalizer';
import { transformationDetector, detectTransformations } from './transformation-detector';

export interface IntentCapability {
  type: string; // Action type from intent (e.g., 'google_sheets', 'summarize', 'send_email')
  operation: string; // Operation (e.g., 'read', 'write', 'send')
  required: boolean; // Whether this capability is required
}

export interface NodeTypeConstraint {
  nodeType: string;
  reason: string; // Why this node is required
  source: 'action' | 'trigger' | 'condition' | 'capability';
}

/**
 * Intent Constraint Engine
 * Generates minimal node set from structured intent
 */
export class IntentConstraintEngine {
  /**
   * Get required nodes from structured intent
   * ✅ FIXED: Includes transformation nodes from TransformationDetector
   * 
   * @param intent - Structured intent from user prompt
   * @param originalPrompt - Original user prompt (for transformation detection)
   * @returns Array of required node types (trigger + data sources + transformations + outputs)
   */
  getRequiredNodes(intent: StructuredIntent, originalPrompt?: string): string[] {
    console.log('[IntentConstraintEngine] Extracting required nodes from intent...');
    
    const requiredNodes = new Set<string>();
    const nodeConstraints: NodeTypeConstraint[] = [];
    const originalPromptLower = (originalPrompt || '').toLowerCase();

    // STEP 1: Extract trigger node (always required)
    if (intent.trigger) {
      const triggerNode = this.mapTriggerToNodeType(intent.trigger);
      if (triggerNode) {
        requiredNodes.add(triggerNode);
        nodeConstraints.push({
          nodeType: triggerNode,
          reason: `Trigger: ${intent.trigger}`,
          source: 'trigger',
        });
        console.log(`[IntentConstraintEngine] ✅ Added trigger node: ${triggerNode}`);
      }
    }

    // STEP 2: Extract nodes from actions (outputs / actions)
    if (intent.actions && intent.actions.length > 0) {
      for (const action of intent.actions) {
        const actionNodes = this.mapActionToNodeTypes(action);
        
        for (const nodeType of actionNodes) {
          // Validate node exists in library
          const schema = nodeLibrary.getSchema(nodeType);
          if (!schema) {
            console.warn(`[IntentConstraintEngine] ⚠️  Node type "${nodeType}" not found in library, skipping`);
            continue;
          }

          requiredNodes.add(nodeType);
          nodeConstraints.push({
            nodeType,
            reason: `Action: ${action.type} (${action.operation})`,
            source: 'action',
          });
          console.log(`[IntentConstraintEngine] ✅ Added action node: ${nodeType} (from ${action.type})`);
        }
      }
    }

    // ✅ CRITICAL: Include planner-preserved dataSources (these are NOT in actions)
    if (intent.dataSources && intent.dataSources.length > 0) {
      for (const ds of intent.dataSources) {
        const dsNodes = this.mapActionToNodeTypes({
          type: ds.type,
          operation: ds.operation,
          config: ds.config,
        });

        for (const nodeType of dsNodes) {
          const schema = nodeLibrary.getSchema(nodeType);
          if (!schema) {
            console.warn(`[IntentConstraintEngine] ⚠️  DataSource node type "${nodeType}" not found in library, skipping`);
            continue;
          }

          requiredNodes.add(nodeType);
          nodeConstraints.push({
            nodeType,
            reason: `DataSource: ${ds.type} (${ds.operation})`,
            source: 'action',
          });
          console.log(`[IntentConstraintEngine] ✅ Added dataSource node: ${nodeType} (from ${ds.type})`);
        }
      }
    }

    // ✅ CRITICAL: Include transformations field (planner preserves it separately)
    if (intent.transformations && intent.transformations.length > 0) {
      for (const tf of intent.transformations) {
        const tfTypeLower = (tf.type || '').toLowerCase().trim();
        const tfOpLower = (tf.operation || '').toLowerCase().trim();

        // Only include loop if the *original prompt* explicitly requests iteration
        if (tfTypeLower === 'loop') {
          const promptRequestsLoop =
            originalPromptLower.includes('for each') ||
            originalPromptLower.includes('foreach') ||
            originalPromptLower.includes('each ') ||
            originalPromptLower.includes('iterate') ||
            originalPromptLower.includes('loop') ||
            originalPromptLower.includes('per row') ||
            originalPromptLower.includes('each row');

          if (!promptRequestsLoop) {
            console.log('[IntentConstraintEngine] ⚠️  Ignoring loop transformation (not requested in original prompt)');
            continue;
          }
        }

        // Map transformation capabilities like "summarize" to concrete node types
        const tfNodes = this.mapActionToNodeTypes({
          type: tf.type,
          operation: tf.operation || 'transform',
          config: tf.config,
        });

        for (const nodeType of tfNodes) {
          const schema = nodeLibrary.getSchema(nodeType);
          if (!schema) {
            console.warn(`[IntentConstraintEngine] ⚠️  Transformation node type "${nodeType}" not found in library, skipping`);
            continue;
          }

          requiredNodes.add(nodeType);
          nodeConstraints.push({
            nodeType,
            reason: `Transformation: ${tf.type} (${tf.operation})`,
            source: 'capability',
          });
          console.log(`[IntentConstraintEngine] ✅ Added transformation node: ${nodeType} (from ${tf.type}/${tf.operation})`);
        }
      }
    }

    // ✅ FIXED: STEP 2.5: Extract transformation nodes from TransformationDetector
    if (originalPrompt) {
      const transformationDetection = detectTransformations(originalPrompt);
      if (transformationDetection.detected) {
        console.log(`[IntentConstraintEngine] ✅ Detected transformation verbs: ${transformationDetection.verbs.join(', ')}`);
        
        // Add transformation required node types
        for (const nodeType of transformationDetection.requiredNodeTypes) {
          // Validate node exists in library
          const schema = nodeLibrary.getSchema(nodeType);
          if (!schema) {
            // Try to find a valid alternative
            const normalized = normalizeNodeType({ type: 'custom', data: { type: nodeType } });
            const normalizedSchema = nodeLibrary.getSchema(normalized);
            if (normalizedSchema) {
              requiredNodes.add(normalized);
              nodeConstraints.push({
                nodeType: normalized,
                reason: `Transformation: ${transformationDetection.verbs.join(', ')}`,
                source: 'capability',
              });
              console.log(`[IntentConstraintEngine] ✅ Added transformation node: ${normalized} (from ${transformationDetection.verbs.join(', ')})`);
            } else {
              console.warn(`[IntentConstraintEngine] ⚠️  Transformation node type "${nodeType}" not found in library, skipping`);
            }
          } else {
            requiredNodes.add(nodeType);
            nodeConstraints.push({
              nodeType,
              reason: `Transformation: ${transformationDetection.verbs.join(', ')}`,
              source: 'capability',
            });
            console.log(`[IntentConstraintEngine] ✅ Added transformation node: ${nodeType} (from ${transformationDetection.verbs.join(', ')})`);
          }
        }
      }
    }

    // STEP 3: Extract conditional nodes (if_else, switch) - only if explicitly requested
    if (intent.conditions && intent.conditions.length > 0) {
      for (const condition of intent.conditions) {
        const conditionNode = this.mapConditionToNodeType(condition.type);
        if (conditionNode) {
          requiredNodes.add(conditionNode);
          nodeConstraints.push({
            nodeType: conditionNode,
            reason: `Condition: ${condition.type}`,
            source: 'condition',
          });
          console.log(`[IntentConstraintEngine] ✅ Added condition node: ${conditionNode}`);
        }
      }
    }

    // STEP 4: Filter out unnecessary nodes
    const filteredNodes = this.filterUnnecessaryNodes(Array.from(requiredNodes), intent, originalPromptLower);

    // STEP 5: Validate and normalize node types
    const validatedNodes = this.validateNodeTypes(filteredNodes);

    console.log(`[IntentConstraintEngine] ✅ Generated ${validatedNodes.length} required node(s): ${validatedNodes.join(', ')}`);
    
    return validatedNodes;
  }

  /**
   * Map trigger type to node type
   */
  private mapTriggerToNodeType(trigger: string): string | null {
    const triggerLower = trigger.toLowerCase();
    
    const triggerMap: Record<string, string> = {
      'manual_trigger': 'manual_trigger',
      'schedule': 'schedule',
      'webhook': 'webhook',
      'form': 'form',
      'chat_trigger': 'chat_trigger',
      'interval': 'interval',
      'error_trigger': 'error_trigger',
    };

    // Direct match
    if (triggerMap[triggerLower]) {
      return triggerMap[triggerLower];
    }

    // Pattern matching
    if (triggerLower.includes('schedule') || triggerLower.includes('cron')) {
      return 'schedule';
    }
    if (triggerLower.includes('webhook')) {
      return 'webhook';
    }
    if (triggerLower.includes('form')) {
      return 'form';
    }
    if (triggerLower.includes('chat')) {
      return 'chat_trigger';
    }
    if (triggerLower.includes('interval')) {
      return 'interval';
    }

    // Default to manual trigger
    return 'manual_trigger';
  }

  /**
   * Map action to node types
   * Handles capability resolution (e.g., 'summarize' → 'text_summarizer')
   */
  private mapActionToNodeTypes(action: StructuredIntent['actions'][0]): string[] {
    const actionType = action.type.toLowerCase();
    const operation = action.operation?.toLowerCase() || '';

    // STEP 1: Check if it's a capability (not a direct node type)
    if (capabilityResolver.isCapability(actionType)) {
      // ✅ IMPORTANT: For workflow graph requirements, map AI capabilities to the canonical LLM node
      // rather than provider-specific nodes like "ollama"/"openai_gpt".
      // In this repo, "ai_chat_model" is the canonical execution node for LLM tasks.
      if (
        actionType.includes('summar') ||
        actionType.includes('summary') ||
        actionType.includes('classif') ||
        actionType.includes('ai_processing') ||
        actionType === 'ai' ||
        actionType === 'llm' ||
        actionType === 'ai_service'
      ) {
        return ['ai_chat_model'];
      }

      const resolution = capabilityResolver.resolveCapability(actionType);
      if (resolution) {
        console.log(`[IntentConstraintEngine] Resolved capability "${actionType}" → "${resolution.nodeType}"`);
        return [resolution.nodeType];
      }
    }

    // STEP 2: Normalize action type to node type
    const normalizedType = normalizeNodeType({ type: 'custom', data: { type: actionType } });
    
    // STEP 3: Check if normalized type exists in library
    const schema = nodeLibrary.getSchema(normalizedType);
    if (schema) {
      return [normalizedType];
    }

    // STEP 4: Pattern-based mapping for common actions
    const nodeTypes = this.mapActionPatternToNodeTypes(actionType, operation);
    if (nodeTypes.length > 0) {
      return nodeTypes;
    }

    // STEP 5: Fallback - try direct lookup
    if (nodeLibrary.getSchema(actionType)) {
      return [actionType];
    }

    console.warn(`[IntentConstraintEngine] ⚠️  Could not map action "${actionType}" to node type`);
    return [];
  }

  /**
   * Map action patterns to node types
   * Handles common patterns like "google_sheets", "gmail", "summarize", etc.
   */
  private mapActionPatternToNodeTypes(actionType: string, operation: string): string[] {
    const actionLower = actionType.toLowerCase();
    const operationLower = operation.toLowerCase();

    // Google Services
    if (actionLower.includes('google_sheets') || actionLower.includes('sheets') || actionLower === 'sheets') {
      return ['google_sheets'];
    }
    if (actionLower.includes('gmail') || actionLower.includes('google_mail') || actionLower === 'email' && operationLower.includes('send')) {
      return ['google_gmail'];
    }
    if (actionLower.includes('google_drive') || actionLower === 'drive') {
      return ['google_drive'];
    }
    if (actionLower.includes('google_calendar') || actionLower === 'calendar') {
      return ['google_calendar'];
    }

    // AI/Processing capabilities
    if (actionLower.includes('summarize') || actionLower.includes('summary')) {
      // ✅ IMPORTANT: treat summarization as a transformation handled by canonical LLM node
      return ['ai_chat_model'];
    }
    if (actionLower.includes('classify') || actionLower.includes('classification')) {
      return ['ai_chat_model'];
    }
    if (actionLower.includes('ai') || actionLower.includes('llm') || actionLower.includes('process')) {
      return ['ai_chat_model'];
    }

    // Communication
    if (actionLower.includes('slack') || actionLower === 'slack') {
      return ['slack_message'];
    }
    if (actionLower.includes('discord') || actionLower === 'discord') {
      return ['discord'];
    }
    if (actionLower.includes('telegram') || actionLower === 'telegram') {
      return ['telegram'];
    }
    if (actionLower.includes('email') && !actionLower.includes('gmail')) {
      return ['email']; // Generic email (SMTP)
    }

    // Data sources
    if (actionLower.includes('airtable') || actionLower === 'airtable') {
      return ['airtable'];
    }
    if (actionLower.includes('notion') || actionLower === 'notion') {
      return ['notion'];
    }
    if (actionLower.includes('database') || actionLower.includes('db')) {
      return ['database'];
    }
    if (actionLower.includes('postgres') || actionLower === 'postgresql') {
      return ['postgresql'];
    }
    if (actionLower.includes('mysql') || actionLower === 'mysql') {
      return ['mysql'];
    }
    if (actionLower.includes('mongodb') || actionLower === 'mongo') {
      return ['mongodb'];
    }

    // HTTP/API
    if (actionLower.includes('http') || actionLower.includes('api') || actionLower.includes('request')) {
      return ['http_request'];
    }

    // Storage
    if (actionLower.includes('s3') || actionLower === 's3') {
      return ['s3'];
    }
    if (actionLower.includes('storage') || actionLower === 'storage') {
      return ['storage'];
    }

    return [];
  }

  /**
   * Map condition type to node type
   */
  private mapConditionToNodeType(conditionType: string): string | null {
    const conditionLower = conditionType.toLowerCase();
    
    if (conditionLower === 'if_else' || conditionLower === 'if-else' || conditionLower === 'if') {
      return 'if_else';
    }
    if (conditionLower === 'switch') {
      return 'switch';
    }

    return null;
  }

  /**
   * Filter out unnecessary nodes
   * Rules:
   * - No loops unless explicitly requested
   * - No repair nodes unless failure handling required
   */
  private filterUnnecessaryNodes(nodeTypes: string[], intent: StructuredIntent, originalPromptLower?: string): string[] {
    const filtered: string[] = [];
    const intentText = JSON.stringify(intent).toLowerCase();
    const promptText = (originalPromptLower || '').toLowerCase();

    for (const nodeType of nodeTypes) {
      const nodeLower = nodeType.toLowerCase();

      // Rule 1: Exclude loops unless explicitly requested
      if (nodeLower.includes('loop') || nodeLower === 'for' || nodeLower === 'while') {
        const hasLoopIntent =
          // Prefer explicit user wording from original prompt (planner may over-suggest loops)
          promptText.includes('for each') ||
          promptText.includes('foreach') ||
          promptText.includes('iterate') ||
          promptText.includes('loop') ||
          promptText.includes('each row') ||
          promptText.includes('per row') ||
          // Fall back to intent fields if no prompt available
          (!promptText &&
            (intentText.includes('iterate') ||
              intentText.includes('repeat') ||
              intentText.includes('for each') ||
              intentText.includes('foreach')));
        
        if (!hasLoopIntent) {
          console.log(`[IntentConstraintEngine] ⚠️  Excluded loop node "${nodeType}" (not explicitly requested)`);
          continue;
        }
      }

      // Rule 2: Exclude repair nodes unless failure handling required
      if (nodeLower.includes('repair') || nodeLower.includes('error_handler') || nodeLower.includes('retry')) {
        const hasFailureHandling = intentText.includes('error') ||
                                  intentText.includes('failure') ||
                                  intentText.includes('retry') ||
                                  intentText.includes('handle') ||
                                  intentText.includes('catch');
        
        if (!hasFailureHandling) {
          console.log(`[IntentConstraintEngine] ⚠️  Excluded repair node "${nodeType}" (failure handling not required)`);
          continue;
        }
      }

      // Rule 3: Exclude utility nodes that aren't explicitly needed
      // (e.g., set_variable, format, parse - only if mentioned)
      if (nodeLower === 'set_variable' || nodeLower === 'format' || nodeLower === 'parse') {
        const hasUtilityIntent = intentText.includes('variable') ||
                                intentText.includes('format') ||
                                intentText.includes('parse');
        
        if (!hasUtilityIntent) {
          console.log(`[IntentConstraintEngine] ⚠️  Excluded utility node "${nodeType}" (not explicitly needed)`);
          continue;
        }
      }

      filtered.push(nodeType);
    }

    return filtered;
  }

  /**
   * Validate and normalize node types
   * Ensures all returned node types exist in the library
   */
  private validateNodeTypes(nodeTypes: string[]): string[] {
    const validated: string[] = [];

    for (const nodeType of nodeTypes) {
      // Normalize node type
      const normalized = normalizeNodeType({ type: 'custom', data: { type: nodeType } });
      
      // Check if exists in library
      const schema = nodeLibrary.getSchema(normalized);
      if (schema) {
        validated.push(normalized);
      } else {
        console.warn(`[IntentConstraintEngine] ⚠️  Node type "${nodeType}" (normalized: "${normalized}") not found in library, skipping`);
      }
    }

    return validated;
  }

  /**
   * Get required nodes from structured intent (public API)
   * ✅ FIXED: Includes transformation nodes from TransformationDetector
   * 
   * @param intent - Structured intent
   * @param originalPrompt - Original user prompt (for transformation detection)
   * @returns Array of required node types (trigger + data sources + transformations + outputs)
   */
  static getRequiredNodes(intent: StructuredIntent, originalPrompt?: string): string[] {
    const engine = new IntentConstraintEngine();
    return engine.getRequiredNodes(intent, originalPrompt);
  }
}

// Export singleton instance
export const intentConstraintEngine = new IntentConstraintEngine();

// Export convenience function
export function getRequiredNodes(intent: StructuredIntent, originalPrompt?: string): string[] {
  return IntentConstraintEngine.getRequiredNodes(intent, originalPrompt);
}
