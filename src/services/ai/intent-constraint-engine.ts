/**
 * Intent Constraint Engine
 * 
 * Generates minimal node set from user intent using SEMANTIC INTENT UNDERSTANDING.
 * 
 * ✅ ROOT-LEVEL ARCHITECTURE: Intent-First Approach
 * 1. UNDERSTAND INTENT: Analyze semantic meaning and context of transformations
 * 2. SELECT NODES: Choose nodes based on intent understanding (not just pattern matching)
 * 3. VALIDATE INTENT: Confirm selected nodes match the actual intent
 * 
 * Rules:
 * - Extract required capabilities from normalized prompt
 * - UNDERSTAND SEMANTIC INTENT before mapping to nodes
 * - Map capabilities → node types using registry
 * - VALIDATE node selection matches intent
 * - Only allow nodes required to satisfy intent
 * - Reject or remove extra nodes automatically
 * - No loops unless explicitly requested
 * - No repair nodes unless failure handling required
 * 
 * Example:
 *   input: "Get data from Google Sheets, summarize, send email"
 *   Step 1: Understand intent → "AI summarization of spreadsheet data"
 *   Step 2: Select nodes → [google_sheets, ai_chat_model, gmail] (NOT aggregate)
 *   Step 3: Validate → Confirm ai_chat_model matches "summarize" intent ✅
 */

import { StructuredIntent } from './intent-structurer';
import { nodeLibrary } from '../nodes/node-library';
import { capabilityResolver } from './capability-resolver';
import { unifiedNormalizeNodeType, unifiedNormalizeNodeTypeString } from '../../core/utils/unified-node-type-normalizer';
import { transformationDetector, detectTransformations } from './transformation-detector';
import { semanticNodeEquivalenceRegistry } from '../../core/registry/semantic-node-equivalence-registry';
import { unifiedNodeRegistry } from '../../core/registry/unified-node-registry';

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
        // ✅ ROOT-LEVEL FIX: Validate and use canonical type from schema
        const schema = nodeLibrary.getSchema(triggerNode);
        if (schema) {
          const canonicalType = schema.type;
          requiredNodes.add(canonicalType);
          nodeConstraints.push({
            nodeType: canonicalType,
            reason: `Trigger: ${intent.trigger}`,
            source: 'trigger',
          });
          console.log(`[IntentConstraintEngine] ✅ Added trigger node: ${canonicalType}`);
        } else {
          console.warn(`[IntentConstraintEngine] ⚠️  Trigger node type "${triggerNode}" not found in library, skipping`);
        }
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

          // ✅ ROOT-LEVEL FIX: Use schema.type (canonical name) instead of input nodeType
          // When getSchema finds via pattern matching, schema.type contains the actual canonical node type
          const canonicalType = schema.type;
          requiredNodes.add(canonicalType);
          nodeConstraints.push({
            nodeType: canonicalType,
            reason: `Action: ${action.type} (${action.operation})`,
            source: 'action',
          });
          console.log(`[IntentConstraintEngine] ✅ Added action node: ${canonicalType} (from ${action.type})`);
        }
      }
    }

    // ✅ CRITICAL: Include planner-preserved dataSources (these are NOT in actions)
    if (intent.dataSources && intent.dataSources.length > 0) {
      for (const ds of intent.dataSources) {
        // ✅ CRITICAL FIX: salesforce_crm → salesforce (CRM node, not HTTP_api)
        // Same fix as in mapActionToNodeTypes to ensure consistency
        let dsType = ds.type;
        if (dsType && (dsType.toLowerCase() === 'salesforce_crm' || dsType.toLowerCase().includes('salesforce_crm'))) {
          console.log(`[IntentConstraintEngine] ✅ Mapping dataSource "${dsType}" → "salesforce" (CRM node)`);
          dsType = 'salesforce';
        }
        
        const dsNodes = this.mapActionToNodeTypes({
          type: dsType,
          operation: ds.operation,
          config: ds.config,
        });

        for (const nodeType of dsNodes) {
          const schema = nodeLibrary.getSchema(nodeType);
          if (!schema) {
            console.warn(`[IntentConstraintEngine] ⚠️  DataSource node type "${nodeType}" not found in library, skipping`);
            continue;
          }

          // ✅ ROOT-LEVEL FIX: Use schema.type (canonical name) instead of input nodeType
          const canonicalType = schema.type;
          requiredNodes.add(canonicalType);
          nodeConstraints.push({
            nodeType: canonicalType,
            reason: `DataSource: ${ds.type} (${ds.operation})`,
            source: 'action',
          });
          console.log(`[IntentConstraintEngine] ✅ Added dataSource node: ${canonicalType} (from ${ds.type})`);
        }
      }
    }

    // ✅ CRITICAL: Include transformations field (planner preserves it separately)
    // ✅ ROOT-LEVEL FIX: Intent-First Approach - Understand semantic intent BEFORE selecting nodes
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

        // ✅ STEP 1: UNDERSTAND SEMANTIC INTENT of the transformation
        const semanticIntent = this.understandTransformationIntent(tf, originalPrompt);
        console.log(`[IntentConstraintEngine] 🧠 Semantic intent for "${tf.type}": ${semanticIntent.intentType} - ${semanticIntent.description}`);

        // ✅ STEP 2: SELECT NODES based on semantic intent (not just pattern matching)
        const tfNodes = this.selectNodesByIntent(semanticIntent, tf, originalPrompt);

        // ✅ STEP 3: VALIDATE that selected nodes match the intent
        for (const nodeType of tfNodes) {
          const schema = nodeLibrary.getSchema(nodeType);
          if (!schema) {
            console.warn(`[IntentConstraintEngine] ⚠️  Transformation node type "${nodeType}" not found in library, skipping`);
            continue;
          }

          const canonicalType = schema.type;
          
          // ✅ FIX: For "unknown" intent nodes, only add if they have config OR are mentioned in prompt
          // This prevents hallucinated nodes from being added to requiredNodes
          if (semanticIntent.intentType === 'unknown') {
            const hasConfig = tf.config && Object.keys(tf.config).length > 0;
            const promptLower = originalPrompt?.toLowerCase() || '';
            const nodeTypeLower = canonicalType.toLowerCase();
            const nodeTypeVariations = [
              nodeTypeLower,
              nodeTypeLower.replace(/_/g, ' '),
              nodeTypeLower.replace(/_/g, '-'),
              tf.type.toLowerCase(), // Original transformation type
            ];
            const isMentionedInPrompt = originalPrompt && 
              nodeTypeVariations.some(variant => promptLower.includes(variant));
            
            if (!hasConfig && !isMentionedInPrompt) {
              console.log(`[IntentConstraintEngine] ⚠️  Skipping ${canonicalType} - Unknown intent with no config and not mentioned in prompt (likely hallucinated by planner)`);
              continue;
            }
          }
          
          // ✅ VALIDATE: Confirm node matches the semantic intent
          const intentMatch = this.validateNodeMatchesIntent(canonicalType, semanticIntent, originalPrompt);
          if (!intentMatch.matches) {
            console.log(`[IntentConstraintEngine] ⚠️  Skipping ${canonicalType} - ${intentMatch.reason}`);
            continue;
          }

          // ✅ ROOT-LEVEL FIX: Use schema.type (canonical name) instead of input nodeType
          requiredNodes.add(canonicalType);
          nodeConstraints.push({
            nodeType: canonicalType,
            reason: `Transformation: ${tf.type} (${tf.operation}) - Intent: ${semanticIntent.intentType}`,
            source: 'capability',
          });
          console.log(`[IntentConstraintEngine] ✅ Added transformation node: ${canonicalType} (intent: ${semanticIntent.intentType}, validated: ${intentMatch.confidence}%)`);
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
            const normalized = unifiedNormalizeNodeTypeString(nodeType);
            const normalizedSchema = nodeLibrary.getSchema(normalized);
            if (normalizedSchema) {
              // ✅ ROOT-LEVEL FIX: Use schema.type (canonical name) instead of normalized
              const canonicalType = normalizedSchema.type;
              requiredNodes.add(canonicalType);
              nodeConstraints.push({
                nodeType: canonicalType,
                reason: `Transformation: ${transformationDetection.verbs.join(', ')}`,
                source: 'capability',
              });
              console.log(`[IntentConstraintEngine] ✅ Added transformation node: ${canonicalType} (from ${transformationDetection.verbs.join(', ')})`);
            } else {
              console.warn(`[IntentConstraintEngine] ⚠️  Transformation node type "${nodeType}" not found in library, skipping`);
            }
          } else {
            // ✅ ROOT-LEVEL FIX: Use schema.type (canonical name) instead of input nodeType
            const canonicalType = schema.type;
            requiredNodes.add(canonicalType);
            nodeConstraints.push({
              nodeType: canonicalType,
              reason: `Transformation: ${transformationDetection.verbs.join(', ')}`,
              source: 'capability',
            });
            console.log(`[IntentConstraintEngine] ✅ Added transformation node: ${canonicalType} (from ${transformationDetection.verbs.join(', ')})`);
          }
        }
      }
    }

    // STEP 3: Extract conditional nodes (if_else, switch) - only if explicitly requested
    // ✅ ROOT-LEVEL: Auto-detect switch vs if_else based on condition count
    if (intent.conditions && intent.conditions.length > 0) {
      for (const condition of intent.conditions) {
        const conditionNode = this.mapConditionToNodeType(condition.type, originalPrompt);
        if (conditionNode) {
          requiredNodes.add(conditionNode);
          nodeConstraints.push({
            nodeType: conditionNode,
            reason: `Condition: ${condition.type} (auto-detected: ${conditionNode})`,
            source: 'condition',
          });
          console.log(`[IntentConstraintEngine] ✅ Added condition node: ${conditionNode} (auto-detected from ${condition.type})`);
        }
      }
    }

    // ✅ ROOT-LEVEL FIX: Remove aggregate node if AI transformation (ai_chat_model) is already present
    // Aggregate is for data aggregation, not AI summarization. If we have ai_chat_model for summarization,
    // we don't need aggregate.
    if (requiredNodes.has('aggregate') && requiredNodes.has('ai_chat_model')) {
      console.log('[IntentConstraintEngine] ⚠️  Removing aggregate node - ai_chat_model already handles summarization');
      requiredNodes.delete('aggregate');
      // Remove from constraints too
      const aggregateIndex = nodeConstraints.findIndex(c => c.nodeType === 'aggregate');
      if (aggregateIndex >= 0) {
        nodeConstraints.splice(aggregateIndex, 1);
      }
    }

    // ✅ FIX 2: Prefer ai_chat_model over ai_agent for simple operations (summarize, analyze, classify)
    // Check if ai_agent is being used for simple operations - if so, replace with ai_chat_model
    if (requiredNodes.has('ai_agent')) {
      const aiAgentConstraint = nodeConstraints.find(c => c.nodeType === 'ai_agent');
      const promptLower = (originalPrompt || '').toLowerCase();
      
      // Check if operation is simple (summarize, analyze, classify) - no tools/memory needed
      const isSimpleOperation = 
        promptLower.includes('summarize') ||
        promptLower.includes('summarise') ||
        promptLower.includes('analyze') ||
        promptLower.includes('analyse') ||
        promptLower.includes('classify') ||
        aiAgentConstraint?.reason?.toLowerCase().includes('summar') ||
        aiAgentConstraint?.reason?.toLowerCase().includes('analyze') ||
        aiAgentConstraint?.reason?.toLowerCase().includes('classify');
      
      // Check if user explicitly mentions tools, memory, or multi-step reasoning (needs ai_agent)
      const needsToolsOrMemory =
        promptLower.includes('tool') ||
        promptLower.includes('memory') ||
        promptLower.includes('multi-step') ||
        promptLower.includes('multi step') ||
        promptLower.includes('reasoning') ||
        promptLower.includes('agent with') ||
        promptLower.includes('ai agent with');
      
      // If simple operation and no tools/memory needed, prefer ai_chat_model
      if (isSimpleOperation && !needsToolsOrMemory) {
        console.log('[IntentConstraintEngine] ✅ Replacing ai_agent with ai_chat_model for simple operation (summarize/analyze/classify)');
        requiredNodes.delete('ai_agent');
        requiredNodes.add('ai_chat_model');
        
        // Update constraints
        const aiAgentIndex = nodeConstraints.findIndex(c => c.nodeType === 'ai_agent');
        if (aiAgentIndex >= 0) {
          nodeConstraints[aiAgentIndex] = {
            nodeType: 'ai_chat_model',
            reason: aiAgentConstraint?.reason?.replace('ai_agent', 'ai_chat_model') || 'Simple AI operation (summarize/analyze/classify)',
            source: aiAgentConstraint?.source || 'capability',
          };
        } else {
          nodeConstraints.push({
            nodeType: 'ai_chat_model',
            reason: 'Simple AI operation (summarize/analyze/classify)',
            source: 'capability',
          });
        }
      }
    }

    // ✅ ROOT-LEVEL FIX: Remove duplicate AI nodes performing the same operation
    // If both ai_agent and ai_chat_model are present, they likely perform the same AI operation (e.g., summarize)
    // Keep ai_chat_model (more direct) and remove ai_agent (unless ai_agent has specific tools/memory requirements)
    if (requiredNodes.has('ai_agent') && requiredNodes.has('ai_chat_model')) {
      // Check if they're both for the same operation (summarization, analysis, etc.)
      const aiAgentConstraint = nodeConstraints.find(c => c.nodeType === 'ai_agent');
      const aiChatModelConstraint = nodeConstraints.find(c => c.nodeType === 'ai_chat_model');
      
      // If both are for AI operations (summarization, analysis), prefer ai_chat_model (simpler, more direct)
      const bothAreAIOperations = 
        (aiAgentConstraint?.reason?.toLowerCase().includes('summar') || 
         aiAgentConstraint?.reason?.toLowerCase().includes('ai') ||
         aiAgentConstraint?.reason?.toLowerCase().includes('transform')) &&
        (aiChatModelConstraint?.reason?.toLowerCase().includes('summar') ||
         aiChatModelConstraint?.reason?.toLowerCase().includes('ai') ||
         aiChatModelConstraint?.reason?.toLowerCase().includes('transform'));
      
      if (bothAreAIOperations) {
        console.log('[IntentConstraintEngine] ⚠️  Removing ai_agent node - ai_chat_model already handles the same AI operation (prefer simpler, more direct node)');
        requiredNodes.delete('ai_agent');
        // Remove from constraints too
        const aiAgentIndex = nodeConstraints.findIndex(c => c.nodeType === 'ai_agent');
        if (aiAgentIndex >= 0) {
          nodeConstraints.splice(aiAgentIndex, 1);
        }
      }
    }

    // STEP 4: Filter out unnecessary nodes
    const filteredNodes = this.filterUnnecessaryNodes(Array.from(requiredNodes), intent, originalPromptLower);

    // STEP 4.5: ✅ Apply semantic equivalence normalization (remove semantic duplicates, keep canonical types)
    const normalizedNodes = this.normalizeSemanticEquivalences(filteredNodes, intent);

    // STEP 5: Validate and normalize node types
    const validatedNodes = this.validateNodeTypes(normalizedNodes);

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

    // ✅ ROOT-LEVEL FIX: "webhook" keyword disambiguation based on intent
    // "webhook" is ambiguous - it can mean:
    // 1. Receiving webhooks (trigger) → webhook node
    // 2. Sending API calls/webhooks (output) → http_request node
    // Intent keywords:
    // - "receive", "listen", "incoming", "trigger" → webhook (trigger)
    // - "send", "call", "manage API", "make API", "execute API" → http_request (output)
    if (actionType === 'webhook' || actionType.includes('webhook')) {
      const operationLower = operation.toLowerCase();
      const actionContext = `${actionType} ${operation}`.toLowerCase();
      
      // Receiving webhooks (trigger intent)
      if (operationLower.includes('receive') || 
          operationLower.includes('listen') || 
          operationLower.includes('incoming') ||
          operationLower.includes('trigger') ||
          actionContext.includes('receive') ||
          actionContext.includes('listen') ||
          actionContext.includes('incoming')) {
        return ['webhook']; // Webhook for receiving incoming requests
      }
      
      // Sending API calls (output intent)
      if (operationLower.includes('send') || 
          operationLower.includes('call') || 
          operationLower.includes('manage') ||
          operationLower.includes('make') ||
          operationLower.includes('execute') ||
          actionContext.includes('api call') ||
          actionContext.includes('manage api') ||
          actionContext.includes('send api') ||
          actionContext.includes('call api')) {
        return ['http_request']; // HTTP request for sending API calls
      }
      
      // Default: If operation is missing or ambiguous, check if it's in actions (output) or triggers
      // If it's in actions array, it's likely an output (sending), not a trigger (receiving)
      // This handles cases like "webhook to manage API calls" where operation might be missing
      return ['http_request']; // Default to http_request for actions (output intent)
    }

    // ✅ CRITICAL FIX: "website" is a category/credential, NOT a node type
    // "website" should be resolved to concrete node types (http_request, webhook, etc.)
    // The website URL should be extracted as a credential/configuration parameter
    if (actionType === 'website') {
      // Universal logic: Resolve "website" category to concrete node types based on operation keywords
      // Keywords like "receive", "webhook", "listen" → webhook; otherwise → http_request
      if (operation.includes('receive') || operation.includes('webhook') || operation.includes('listen')) {
        return ['webhook']; // Webhook for receiving data from website
      } else {
        return ['http_request']; // HTTP request for fetching data from website
      }
    }

    // ✅ CRITICAL: Disambiguate email destinations early (before "type exists in library" short-circuit)
    // Default behavior: sending email should prefer Gmail (google_gmail) unless SMTP is explicitly requested.
    if ((actionType === 'gmail' || actionType.includes('gmail') || actionType.includes('google_mail') || actionType.includes('google mail')) && operation.includes('send')) {
      return ['google_gmail'];
    }
    if ((actionType === 'email' || actionType === 'mail') && operation.includes('send')) {
      // If user explicitly indicated SMTP, keep generic SMTP `email` node.
      if (actionType.includes('smtp')) return ['email'];
      // Otherwise prefer Gmail for enterprise default (OAuth is the primary email integration).
      return ['google_gmail'];
    }

    // ✅ CRITICAL FIX: salesforce_crm → salesforce (CRM node, not HTTP_api)
    // The node library has only one "salesforce" node type (category: 'crm'), not separate HTTP_api and CRM nodes.
    // "salesforce_crm" is an alias/variation that should map to the canonical "salesforce" CRM node.
    // This prevents confusion where "salesforce_crm" might be incorrectly treated as HTTP_api.
    if (actionType === 'salesforce_crm' || actionType === 'salesforce crm' || actionType.includes('salesforce_crm')) {
      console.log(`[IntentConstraintEngine] ✅ Mapping "${actionType}" → "salesforce" (CRM node)`);
      // Use the canonical "salesforce" node type (which is the CRM node in the library)
      const salesforceSchema = nodeLibrary.getSchema('salesforce');
      if (salesforceSchema) {
        return [salesforceSchema.type]; // Returns "salesforce"
      }
      // Fallback to direct return if schema lookup fails
      return ['salesforce'];
    }

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
    const normalizedType = unifiedNormalizeNodeTypeString(actionType);
    
    // STEP 3: Check if normalized type exists in library
    const schema = nodeLibrary.getSchema(normalizedType);
    if (schema) {
      // ✅ CRITICAL FIX: Return schema.type (canonical name) instead of normalizedType
      // When getSchema finds via pattern matching (e.g., "typeform" → "form"), 
      // schema.type contains the actual canonical node type name
      return [schema.type];
    }

    // STEP 4: Pattern-based mapping for common actions
    const nodeTypes = this.mapActionPatternToNodeTypes(actionType, operation);
    if (nodeTypes.length > 0) {
      return nodeTypes;
    }

    // STEP 5: Fallback - try direct lookup
    const directSchema = nodeLibrary.getSchema(actionType);
    if (directSchema) {
      // ✅ CRITICAL FIX: Return schema.type (canonical name) instead of actionType
      return [directSchema.type];
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

    // ✅ PHASE 1: HTTP/API - Check for specific nodes FIRST before generic http_request
    // Priority: Specific nodes (google_sheets, hubspot, etc.) > Generic http_request
    // Only use http_request as LAST RESORT when no specific node matches
    
    // Check if keyword matches a specific node type via schema keywords/aliases
    const keywordMatches = nodeLibrary.findNodesByKeywords([actionType]);
    if (keywordMatches.length > 0) {
      // Found specific node - use it instead of generic http_request
      const specificNode = keywordMatches[0];
      console.log(`[IntentConstraintEngine] ✅ Found specific node "${specificNode.type}" for keyword "${actionType}" (instead of generic http_request)`);
      return [specificNode.type];
    }
    
    // Only use http_request if no specific node found AND keyword suggests API/HTTP
    if (actionLower.includes('http') || actionLower.includes('api') || actionLower.includes('request')) {
      // Check if it's a generic API call (not a specific service)
      const isGenericApi = !actionLower.includes('google') && 
                          !actionLower.includes('hubspot') && 
                          !actionLower.includes('salesforce') &&
                          !actionLower.includes('slack') &&
                          !actionLower.includes('gmail') &&
                          !actionLower.includes('sheets');
      
      if (isGenericApi) {
        return ['http_request']; // Generic API call - use http_request
      }
      // If it mentions a specific service, try to find that node first
      // (fallback to http_request if not found)
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
   * ✅ ROOT-LEVEL: Automatically selects switch vs if_else based on condition count
   */
  private mapConditionToNodeType(conditionType: string, originalPrompt?: string): string | null {
    const conditionLower = conditionType.toLowerCase();
    
    // ✅ ROOT-LEVEL: If explicitly mentioned, preserve user intent
    if (conditionLower === 'switch' || conditionLower.includes('switch')) {
      return 'switch';
    }
    if (conditionLower === 'if_else' || conditionLower === 'if-else' || conditionLower === 'if') {
      return 'if_else';
    }
    
    // ✅ ROOT-LEVEL: Auto-detect based on condition count in prompt
    if (originalPrompt) {
      const promptLower = originalPrompt.toLowerCase();
      
      // Count conditions: "if X route to Y, if Z route to W" pattern
      const ifPattern = /(?:if|when)\s+(?:the\s+)?(?:\w+\s+)?(?:is|equals|==|contains)\s+["']?(\w+)["']?\s+(?:route|send|go|use|log)/gi;
      const ifMatches = originalPrompt.match(ifPattern);
      const ifCount = ifMatches ? ifMatches.length : 0;
      
      // Count cases: "X leads route to Y" pattern
      const casePattern = /(\w+)\s+(?:leads?|statuses?|items?|records?|cases?)\s+(?:are\s+)?(?:routed|send|trigger|route|go to|use|receive|logged)/gi;
      const caseMatches = originalPrompt.match(casePattern);
      const uniqueCases = caseMatches ? new Set(caseMatches.map(m => m.toLowerCase().split(/\s+/)[0])) : new Set();
      const caseCount = uniqueCases.size;
      
      const totalConditions = Math.max(ifCount, caseCount);
      
      // ✅ ROOT-LEVEL LOGIC: 3+ conditions → switch, 2 conditions → if_else
      if (totalConditions >= 3) {
        console.log(`[IntentConstraintEngine] ✅ Auto-detected ${totalConditions} conditions → using SWITCH node`);
        return 'switch';
      } else if (totalConditions === 2) {
        console.log(`[IntentConstraintEngine] ✅ Auto-detected ${totalConditions} conditions → using IF_ELSE node`);
        return 'if_else';
      }
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
    // ✅ FIXED: Use safe JSON stringify to prevent circular reference errors
    const { safeJsonStringify } = require('../../core/utils/safe-json-stringify');
    const intentText = safeJsonStringify(intent).toLowerCase();
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
  /**
   * ✅ SEMANTIC EQUIVALENCE: Normalize node types to canonical types and remove semantic duplicates
   * 
   * This ensures requiredNodes contains only canonical types, not semantic equivalents.
   * Example: ["instagram", "instagram_post"] → ["instagram"] (keep canonical, remove duplicate)
   */
  private normalizeSemanticEquivalences(nodeTypes: string[], intent: StructuredIntent): string[] {
    console.log('[IntentConstraintEngine] 🔍 Normalizing semantic equivalences...');
    
    const normalized = new Set<string>();
    const seenCanonicals = new Set<string>();
    
    for (const nodeType of nodeTypes) {
      // Get operation and category from intent context
      const action = intent.actions?.find(a => {
        const actionNodes = this.mapActionToNodeTypes(a);
        return actionNodes.includes(nodeType);
      });
      const operation = action?.operation?.toLowerCase();
      
      // Get category from node definition
      const schema = nodeLibrary.getSchema(nodeType);
      const category = schema?.category?.toLowerCase();
      
      // Get canonical type
      const canonical = semanticNodeEquivalenceRegistry.getCanonicalType(nodeType, operation, category);
      
      // Check if canonical already exists
      if (seenCanonicals.has(canonical.toLowerCase())) {
        console.log(
          `[IntentConstraintEngine] ⚠️  Skipping semantic duplicate: ${nodeType} ` +
          `(canonical ${canonical} already in requiredNodes)`
        );
        continue; // Skip duplicate
      }
      
      // Add canonical type
      normalized.add(canonical);
      seenCanonicals.add(canonical.toLowerCase());
      
      if (canonical !== nodeType) {
        console.log(
          `[IntentConstraintEngine] ✅ Normalized ${nodeType} → ${canonical} ` +
          `(semantic equivalence)`
        );
      }
    }
    
    const result = Array.from(normalized);
    if (result.length < nodeTypes.length) {
      console.log(
        `[IntentConstraintEngine] ✅ Removed ${nodeTypes.length - result.length} semantic duplicate(s), ` +
        `kept ${result.length} canonical node type(s)`
      );
    }
    
    return result;
  }

  private validateNodeTypes(nodeTypes: string[]): string[] {
    const validated: string[] = [];

    for (const nodeType of nodeTypes) {
      // Normalize node type
      const normalized = unifiedNormalizeNodeTypeString(nodeType);
      
      // Check if exists in library
      const schema = nodeLibrary.getSchema(normalized);
      if (schema) {
        // ✅ ROOT-LEVEL FIX: Use schema.type (canonical name) instead of normalized
        validated.push(schema.type);
      } else {
        console.warn(`[IntentConstraintEngine] ⚠️  Node type "${nodeType}" (normalized: "${normalized}") not found in library, skipping`);
      }
    }

    return validated;
  }

  /**
   * ✅ ROOT-LEVEL FIX: Understand semantic intent of transformation
   * Analyzes the actual meaning and context, not just pattern matching
   * Uses node schema intent descriptions for better understanding
   * 
   * @param transformation - Transformation from structured intent
   * @param originalPrompt - Original user prompt for context
   * @returns Semantic intent understanding
   */
  private understandTransformationIntent(
    transformation: { type: string; operation?: string; config?: Record<string, any> },
    originalPrompt?: string
  ): {
    intentType: 'ai_summarization' | 'ai_analysis' | 'data_aggregation' | 'data_transformation' | 'unknown';
    description: string;
    requiresAI: boolean;
    requiresAggregation: boolean;
  } {
    const tfType = (transformation.type || '').toLowerCase().trim();
    const prompt = (originalPrompt || '').toLowerCase();
    
    // ✅ SEMANTIC ANALYSIS: Understand what the transformation actually means
    
    // AI Summarization Intent
    if (
      tfType.includes('summary') ||
      tfType.includes('summarize') ||
      tfType.includes('summarise') ||
      prompt.includes('ai agent') ||
      prompt.includes('ai_agent') ||
      prompt.includes('generate a summary') ||
      prompt.includes('summarize') ||
      prompt.includes('summarise') ||
      (prompt.includes('process') && prompt.includes('summary'))
    ) {
      return {
        intentType: 'ai_summarization',
        description: 'AI-powered summarization of data using language models',
        requiresAI: true,
        requiresAggregation: false, // AI can summarize without aggregation
      };
    }
    
    // AI Analysis Intent
    if (
      tfType.includes('analyze') ||
      tfType.includes('analyse') ||
      tfType.includes('classify') ||
      prompt.includes('ai') && (prompt.includes('analyze') || prompt.includes('process'))
    ) {
      return {
        intentType: 'ai_analysis',
        description: 'AI-powered analysis or classification of data',
        requiresAI: true,
        requiresAggregation: false,
      };
    }
    
    // Data Aggregation Intent (actual aggregation, not AI)
    if (
      (tfType.includes('aggregate') || tfType.includes('group') || tfType.includes('sum')) &&
      !prompt.includes('ai') &&
      !prompt.includes('summarize') &&
      !prompt.includes('generate')
    ) {
      return {
        intentType: 'data_aggregation',
        description: 'Mathematical aggregation of data (sum, count, group)',
        requiresAI: false,
        requiresAggregation: true,
      };
    }
    
    // Generic Data Transformation
    if (tfType.includes('transform') || tfType.includes('process_data')) {
      // Check context: if prompt mentions AI/summarize, it's AI transformation
      if (prompt.includes('ai') || prompt.includes('summarize') || prompt.includes('generate')) {
        return {
          intentType: 'ai_summarization',
          description: 'AI-powered transformation based on context',
          requiresAI: true,
          requiresAggregation: false,
        };
      }
      
      return {
        intentType: 'data_transformation',
        description: 'Generic data transformation',
        requiresAI: false,
        requiresAggregation: false,
      };
    }
    
    // Default: unknown intent
    return {
      intentType: 'unknown',
      description: 'Unknown transformation intent',
      requiresAI: false,
      requiresAggregation: false,
    };
  }

  /**
   * ✅ ROOT-LEVEL FIX: Select nodes based on semantic intent (not pattern matching)
   * Uses node schema intent descriptions to find the best matching node
   * 
   * @param semanticIntent - Understood semantic intent
   * @param transformation - Original transformation object
   * @param originalPrompt - Original user prompt
   * @returns Array of node types that match the intent
   */
  private selectNodesByIntent(
    semanticIntent: ReturnType<IntentConstraintEngine['understandTransformationIntent']>,
    transformation: { type: string; operation?: string; config?: Record<string, any> },
    originalPrompt?: string
  ): string[] {
    // ✅ INTENT-BASED SELECTION: Choose nodes based on actual intent, not patterns
    
    if (semanticIntent.requiresAI) {
      // AI intent → find best AI node by matching intent categories
      const aiNodes = this.findNodesByIntentCategories(['ai_summarization', 'ai_analysis', 'ai_generation', 'text_processing', 'nlp', 'llm']);
      if (aiNodes.length > 0) {
        console.log(`[IntentConstraintEngine] 🎯 Intent-based selection: AI intent → ${aiNodes[0]} (matched by intent categories)`);
        return [aiNodes[0]];
      }
      // Fallback to ai_chat_model
      console.log(`[IntentConstraintEngine] 🎯 Intent-based selection: AI intent → ai_chat_model (fallback)`);
      return ['ai_chat_model'];
    }
    
    if (semanticIntent.requiresAggregation) {
      // Aggregation intent → find best aggregation node by matching intent categories
      const aggNodes = this.findNodesByIntentCategories(['data_aggregation', 'mathematical_operations', 'statistics', 'data_consolidation']);
      if (aggNodes.length > 0) {
        console.log(`[IntentConstraintEngine] 🎯 Intent-based selection: Aggregation intent → ${aggNodes[0]} (matched by intent categories)`);
        return [aggNodes[0]];
      }
      // Fallback to aggregate
      console.log(`[IntentConstraintEngine] 🎯 Intent-based selection: Aggregation intent → aggregate (fallback)`);
      return ['aggregate'];
    }
    
    // Fallback: Use pattern matching only if intent is unknown
    if (semanticIntent.intentType === 'unknown') {
      console.log(`[IntentConstraintEngine] ⚠️  Unknown intent, falling back to pattern matching`);
      return this.mapActionToNodeTypes({
        type: transformation.type,
        operation: transformation.operation || 'transform',
        config: transformation.config,
      });
    }
    
    // Default: no transformation node needed
    return [];
  }

  /**
   * ✅ ROOT-LEVEL: Find nodes by intent categories from node schemas
   * Uses intent descriptions and categories stored in node schemas
   * 
   * @param intentCategories - Categories to match (e.g., ['ai_summarization', 'text_processing'])
   * @returns Array of node types that match the intent categories
   */
  private findNodesByIntentCategories(intentCategories: string[]): string[] {
    const allSchemas = nodeLibrary.getAllSchemas();
    const matchingNodes: string[] = [];
    
    for (const schema of allSchemas) {
      const nodeCategories = schema.aiSelectionCriteria?.intentCategories || [];
      const nodeDescription = (schema.aiSelectionCriteria?.intentDescription || '').toLowerCase();
      
      // Check if any intent category matches
      const hasMatchingCategory = intentCategories.some(cat => 
        nodeCategories.some(nodeCat => 
          nodeCat.toLowerCase().includes(cat.toLowerCase()) || 
          cat.toLowerCase().includes(nodeCat.toLowerCase())
        )
      );
      
      // Also check intent description for keywords
      const hasMatchingDescription = intentCategories.some(cat => 
        nodeDescription.includes(cat.toLowerCase())
      );
      
      if (hasMatchingCategory || hasMatchingDescription) {
        matchingNodes.push(schema.type);
      }
    }
    
    return matchingNodes;
  }

  /**
   * ✅ ROOT-LEVEL FIX: Validate that selected node matches the semantic intent
   * 
   * @param nodeType - Selected node type
   * @param semanticIntent - Understood semantic intent
   * @param originalPrompt - Original user prompt for context
   * @returns Validation result with confidence score
   */
  private validateNodeMatchesIntent(
    nodeType: string,
    semanticIntent: ReturnType<IntentConstraintEngine['understandTransformationIntent']>,
    originalPrompt?: string
  ): {
    matches: boolean;
    confidence: number; // 0-100
    reason: string;
  } {
    // ✅ VALIDATION: Confirm node matches intent
    
    // ✅ PHASE 1 FIX: Use registry to check node categories instead of hardcoded checks
    const nodeDef = unifiedNodeRegistry.get(nodeType);
    const nodeCategory = nodeDef?.category;
    const nodeTags = nodeDef?.tags || [];
    
    // AI intent should use AI nodes
    if (semanticIntent.requiresAI) {
      // Check if node is AI category or has AI tags
      if (nodeCategory === 'ai' || nodeTags.some(tag => ['ai', 'llm', 'chat', 'agent'].includes(tag.toLowerCase()))) {
        return {
          matches: true,
          confidence: 100,
          reason: 'AI node matches AI summarization intent',
        };
      }
      // Check if node is aggregate (not AI)
      if (nodeType === 'aggregate' || nodeCategory === 'transformation' && nodeTags.includes('aggregate')) {
        return {
          matches: false,
          confidence: 0,
          reason: 'Aggregate node does not match AI summarization intent - aggregate is for data aggregation, not AI processing',
        };
      }
    }
    
    // Aggregation intent should use aggregate node
    if (semanticIntent.requiresAggregation) {
      if (nodeType === 'aggregate' || (nodeCategory === 'transformation' && nodeTags.includes('aggregate'))) {
        return {
          matches: true,
          confidence: 100,
          reason: 'Aggregate node matches data aggregation intent',
        };
      }
      // Check if node is AI (not aggregate)
      if (nodeCategory === 'ai' || nodeTags.some(tag => ['ai', 'llm', 'chat', 'agent'].includes(tag.toLowerCase()))) {
        return {
          matches: false,
          confidence: 20,
          reason: 'AI node does not match data aggregation intent - use aggregate for mathematical operations',
        };
      }
    }
    
    // Default: accept if intent is unknown
    if (semanticIntent.intentType === 'unknown') {
      return {
        matches: true,
        confidence: 50,
        reason: 'Intent unknown, accepting node selection',
      };
    }
    
    // Default: accept
    return {
      matches: true,
      confidence: 80,
      reason: 'Node matches intent',
    };
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
